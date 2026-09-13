'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');
const { normalizeStateGuards, evaluateStateGuards, guardReadbackPassed } = require('../md-os/kernel/cognition/state_guard');

const ROOT = path.resolve(__dirname, '..');
const RESULT = 'md-os/ops/artifacts/result.txt';
const digest = value => createHash('sha256').update(value).digest('hex');
const write = (root, ref, value) => {
  fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
  fs.writeFileSync(path.join(root, ref), typeof value === 'string' ? value : JSON.stringify(value));
};

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-guarded-procedure-'));
  const commands = {
    prepare: "const fs=require('fs');fs.mkdirSync('ops/artifacts',{recursive:true});fs.writeFileSync('ops/artifacts/result.txt','ready')",
    consume: "require('fs').writeFileSync('ops/artifacts/consumed.txt','consumed')",
    fail: 'process.exit(7)',
    accept: 'process.exit(0)',
    replace_registry: "const fs=require('fs');const p='ops/connectors/terminal_connector.json';const d=JSON.parse(fs.readFileSync(p));d.commands.find(c=>c.command_id==='consume').argv=['node','-e','process.exit(0)'];fs.writeFileSync(p,JSON.stringify(d))",
  };
  write(root, 'md-os/ops/connectors/terminal_connector.json', { schema_version: 1, connector_id: 'terminal_executor',
    default_timeout_ms: 1000, max_stdout_bytes: 8192, max_stderr_bytes: 8192,
    commands: Object.entries(commands).map(([command_id, script]) => ({ command_id, argv: ['node', '-e', script], cwd: 'md-os', summary: command_id })) });
  return root;
}

function action(command, guards) {
  return { action_id: command, connector_id: 'terminal_executor', project_id: 'guard_fixture', command_id: command,
    expected_exit_status: 0, ...(guards ? { state_guards: guards } : {}) };
}

function run(root, actions) {
  write(root, 'md-os/ops/tasks/task_guarded.json', { schema_version: 1, task_spec_id: 'task_guarded',
    goal: 'Run the registered guarded fixture', constraints: [], unknowns: [], actions,
    acceptance_tests: [{ ...action('accept'), acceptance_test_id: 'independent_acceptance' }],
    observation_targets: [], required_evidence: [], success_definition: { observed_delta_required: false } });
  // A fresh process exercises the real compiler, connector, executor and
  // independent verifier, with no inference and no production workspace writes.
  const script = `
    const fs=require('fs'),path=require('path'),base=process.argv[1];
    const load=name=>require(path.join(base,'md-os/kernel/cognition',name));
    const c=load('task_compiler').compileTaskSpec({taskSpecPath:'md-os/ops/tasks/task_guarded.json',createdAt:'2026-09-13T00:00:00Z'});
    fs.writeFileSync('md-os/ops/tasks/task_guarded.json',JSON.stringify(c.task_spec));
    const initial=load('problem_outcome').commandBindings(process.cwd(),c.task_spec);
    const receipts=load('executor').executeActions({episodeId:'ep_guarded',taskSpec:c.task_spec,receiptsDir:path.resolve('md-os/ops/action_receipts'),initialCommands:initial});
    const verification=load('verifier').verifyTaskOutcome({episodeId:'ep_guarded',taskSpec:c.task_spec,taskCompilation:c,actionReceipts:receipts,initialCommands:initial});
    console.log(JSON.stringify({task:c.task_spec,receipts,verification,current:load('problem_outcome').validateOutcome(process.cwd(),c.task_spec,verification)}));`;
  const result = spawnSync(process.execPath, ['-e', script, ROOT], { cwd: root, encoding: 'utf8',
    env: { ...process.env, MDOS_WORKSPACE_ROOT: root, MDOS_ROOT: path.join(root, 'md-os') } });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('a guarded two-step program runs locally and preserves independently checked intermediate state', () => {
  const root = setup();
  const guard = { path: RESULT, exists: true, sha256: digest('ready') };
  const result = run(root, [action('prepare', { after: [guard] }), action('consume', { before: [guard] })]);
  assert.equal(result.verification.outcome, 'verified');
  assert.equal(result.current.resolution, 'resolved');
  assert.equal(result.receipts.length, 2);
  assert.equal(fs.readFileSync(path.join(root, 'md-os/ops/artifacts/consumed.txt'), 'utf8'), 'consumed');
  assert.ok(result.receipts.every(receipt => receipt.execution_control.attempted && !receipt.execution_control.stop));
  const forged = structuredClone(result.receipts[0]);
  forged.execution_control.postconditions.checks[0].observed.sha256 = digest('wrong');
  assert.equal(guardReadbackPassed(result.task.actions[0], forged), false);
  delete forged.execution_control;
  assert.equal(guardReadbackPassed(result.task.actions[0], forged), false);
});

test('a contradictory postcondition stops a successful-exit command before the next action', () => {
  const root = setup();
  const result = run(root, [action('prepare', { after: [{ path: RESULT, exists: true, sha256: digest('wrong') }] }), action('consume')]);
  assert.equal(result.receipts.length, 1);
  assert.equal(result.receipts[0].exit_status, 0);
  assert.equal(result.receipts[0].execution_control.reason, 'postcondition_failed');
  assert.equal(result.verification.acceptance_results[0].status, 'passed');
  assert.equal(result.verification.outcome, 'failed'); // Final text/test cannot erase the contradiction.
  assert.equal(result.current.resolution, 'failed');
  assert.equal(fs.existsSync(path.join(root, 'md-os/ops/artifacts/consumed.txt')), false);
});

test('an unmet precondition blocks execution; a failed legacy action also stops the chain', () => {
  const blocked = run(setup(), [action('prepare', { before: [{ path: RESULT, exists: true }] }), action('consume')]);
  assert.equal(blocked.receipts.length, 1);
  assert.equal(blocked.receipts[0].status, 'blocked');
  assert.equal(blocked.receipts[0].execution_control.attempted, false);
  assert.equal(blocked.verification.outcome, 'failed');
  assert.equal(blocked.current.resolution, 'failed');
  const failed = run(setup(), [action('fail'), action('prepare')]);
  assert.equal(failed.receipts.length, 1);
  assert.equal(failed.receipts[0].execution_control.reason, 'command_failed');
  assert.equal(failed.current.resolution, 'failed');
});

test('changing the registered program during a sequence inhibits the next action', () => {
  const result = run(setup(), [action('replace_registry'), action('consume')]);
  assert.equal(result.receipts[0].status, 'completed');
  assert.equal(result.receipts[1].status, 'blocked');
  assert.equal(result.receipts[1].execution_control.reason, 'execution_dependency_changed');
  assert.equal(result.verification.outcome, 'failed');
});

test('guard contracts reject ambiguous, unbounded and escaping inputs', () => {
  const root = setup(), good = { path: RESULT, exists: true };
  for (const bad of [null, [], {}, { after: [] }, { unexpected: [] }, { after: [null] },
    { after: [{ ...good, exists: 'true' }] }, { after: [{ ...good, sha256: 'invalid' }] },
    { after: [{ ...good, exists: false, sha256: digest('ready') }] },
    { after: [{ ...good, command: 'check' }] }, { after: [good, good] },
    { after: Array.from({ length: 17 }, () => good) },
    { before: [{ ...good, path: 'md-os/ops/../../outside' }] },
    { before: [{ ...good, path: 'md-os/ops/local/private.txt' }] }]) {
    assert.throws(() => normalizeStateGuards(bad, root));
  }
  const missing = normalizeStateGuards({ before: [{ path: RESULT, exists: false }] }, root);
  assert.equal(evaluateStateGuards(missing.before, root).passed, true);
  write(root, RESULT, 'ready');
  assert.equal(evaluateStateGuards(missing.before, root).passed, false);
  const alias = 'md-os/ops/artifacts/alias.txt';
  fs.symlinkSync(path.join(root, RESULT), path.join(root, alias));
  assert.throws(() => normalizeStateGuards({ after: [{ path: alias, exists: true }] }, root), /ALIAS/);
  assert.equal(evaluateStateGuards([{ path: alias, exists: true }], root).passed, false);
});
