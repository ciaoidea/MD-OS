#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { parseOptions, runPromote } = require('../md-os/os/agi_loop');
const { buildProblemReadback } = require('../md-os/kernel/cognition/problem_core');
const { validateOutcome } = require('../md-os/kernel/cognition/problem_outcome');
const { readPatternMemory, buildNativeProblemContext } = require('../md-os/os/problem_context');
const { expandCompactJson } = require('../md-os/os/problem_compaction');
const { skillApplicability, resolveSkillProgram } = require('../md-os/kernel/cognition/pattern_skill');
const { gateCandidate, runConsolidation } = require('../md-os/apfc/executive/consolidator');
const { promotionTransaction } = require('../md-os/os/apfc_runtime');
const { passingCandidate, passingEvaluation, minimalGraph } = require('./apfc_test_helpers');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-cognitive-loop-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeJson(filePath, payload) {
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function runScript(workspaceRoot, scriptName, args = []) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

function readPayload(result) {
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

function initializeWorkspace() {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n\nMD-OS accumulates verified competence.\n');
  writeFile(path.join(workspace, 'AGENTS.md'), '# Agents\n\nThe host runtime is execution only.\n');
  writeFile(path.join(workspace, 'ME.md'), '# MD-OS (Artificial Prefrontal Cortex)\n\nMD-OS (Artificial Prefrontal Cortex) is the operating identity.\n');
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# KB\n\nSee [[OPERATIONS]].\n');
  writeFile(path.join(workspace, 'md-os/kb/OPERATIONS.md'), '# Operations\n\nEvery action requires consequence readback.\n');
  writeFile(path.join(workspace, 'md-os/kb/SEMANTIC_OPERATIONAL_COMPILER_MODEL.md'), '# Runtime Compiler\n\nEvery claim must have status.\n');
  writeFile(path.join(workspace, 'md-os/kb/VERIFIED_AGI_LOOP_MODEL.md'), '# Compatibility\n\nNo promotion without holdout eval.\n');
  writeFile(path.join(workspace, 'md-os/kb/COGNITIVE_TRANSACTION_LOOP_MODEL.md'), '# Cognitive Transaction Loop\n\nNo success without acceptance evidence.\n');

  writeJson(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), {
    schema_version: 1,
    connectors: [{
      connector_id: 'terminal_executor',
      kind: 'terminal',
      status: 'ready',
      implemented: true,
      execution_mode: 'bounded_exec',
      permission_profile: 'shell_safe',
      risk_level: 'medium',
      requires_approval: false,
      read_capabilities: ['stdout_capture'],
      write_capabilities: ['bounded_command_execution'],
    }],
  });
  writeJson(path.join(workspace, 'md-os/ops/connectors/terminal_connector.json'), {
    schema_version: 1,
    connector_id: 'terminal_executor',
    default_timeout_ms: 15000,
    max_stdout_bytes: 200000,
    max_stderr_bytes: 200000,
    commands: [
      {
        command_id: 'apply_repair_fixture',
        argv: [
          'node',
          '-e',
          "const fs=require('fs');fs.mkdirSync('ops/artifacts/software_repair',{recursive:true});fs.writeFileSync('ops/artifacts/software_repair/result.txt','fixed\\n')",
        ],
        cwd: 'md-os',
        summary: 'Apply a bounded software-repair fixture.',
      },
      {
        command_id: 'verify_repair_fixture',
        argv: [
          'node',
          '-e',
          "const fs=require('fs');const p='ops/artifacts/software_repair/result.txt';process.exit(fs.existsSync(p)&&fs.readFileSync(p,'utf8')==='fixed\\n'?0:1)",
        ],
        cwd: 'md-os',
        summary: 'Verify the software-repair fixture independently.',
      },
      {
        command_id: 'always_fail_acceptance',
        argv: ['node', '-e', 'process.exit(7)'],
        cwd: 'md-os',
        summary: 'Deterministic failing acceptance test.',
      },
    ],
  });
  writeJson(path.join(workspace, 'md-os/ops/compiled/programs.json'), {
    schema_version: 1,
    programs: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/replay_report.json'), {
    schema_version: 1,
    matched_before: true,
    replay_hash: 'stable',
  });
  writeJson(path.join(workspace, 'md-os/ops/core/agentic_core.json'), {
    schema_version: 1,
    core: { identity: { name: 'MD-OS (Artificial Prefrontal Cortex)' } },
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    current_release: { unified_identity: 'MD-OS (Artificial Prefrontal Cortex)' },
  });
  writeFile(path.join(workspace, 'md-os/ops/journal.ndjson'), '');

  for (const scriptName of [
    'build_markdown_graph.js',
    'build_runtime_lifecycle_index.js',
    'build_semantic_knowledge_graph.js',
    'build_runtime_compiler.js',
  ]) {
    const result = runScript(workspace, scriptName);
    assert.equal(result.status, 0, result.stderr);
  }
  return workspace;
}

function writeRepairTaskSpec(workspace, { failingAcceptance = false } = {}) {
  const relative = failingAcceptance
    ? 'md-os/ops/tasks/task_repair_failure_fixture.json'
    : 'md-os/ops/tasks/task_repair_verified_fixture.json';
  writeJson(path.join(workspace, relative), {
    schema_version: 1,
    task_spec_id: failingAcceptance ? 'task_repair_failure_fixture' : 'task_repair_verified_fixture',
    goal: failingAcceptance
      ? 'Repair a Node CLI but fail its declared acceptance test'
      : 'Repair a failing Node CLI command',
    constraints: ['write only inside md-os'],
    acceptance_tests: [{
      acceptance_test_id: 'targeted_node_cli_test',
      connector_id: 'terminal_executor',
      project_id: 'cognitive_truth_loop',
      command_id: failingAcceptance ? 'always_fail_acceptance' : 'verify_repair_fixture',
      expected_exit_status: 0,
    }],
    risk_budget: { level: 'low' },
    resource_budget: { max_actions: 1 },
    required_evidence: [{
      evidence_id: 'repaired_behavior',
      path: 'md-os/ops/artifacts/software_repair/result.txt',
      must_exist: true,
    }],
    unknowns: [],
    success_definition: { observed_delta_required: true },
    actions: [{
      action_id: 'apply_repair',
      connector_id: 'terminal_executor',
      project_id: 'cognitive_truth_loop',
      command_id: 'apply_repair_fixture',
      expected_exit_status: 0,
      rollback: {
        available: true,
        instructions: 'Remove md-os/ops/artifacts/software_repair/result.txt.',
      },
    }],
    observation_targets: [{
      target_id: 'repair_result',
      path: 'md-os/ops/artifacts/software_repair/result.txt',
      required_change: true,
    }],
  });
  return relative;
}

test('legacy direct promotion is disabled and APFC remains the production promotion boundary', () => {
  assert.equal(parseOptions([]).promote, false);
  assert.equal(parseOptions(['--promote']).promote, true);
  assert.throws(() => runPromote(), /USE_APFC_PROMOTE/);
});

test('current outcome readback resolves only the exact independently verified contract and reopens stale evidence and dependencies', () => {
  const workspace = initializeWorkspace();
  const reference = writeRepairTaskSpec(workspace);
  const payload = readPayload(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', reference]));
  const task = JSON.parse(fs.readFileSync(path.join(workspace, reference)));
  const episode = JSON.parse(fs.readFileSync(path.join(workspace, payload.episode_file)));
  const report = JSON.parse(fs.readFileSync(path.join(workspace, episode.verification_result_file)));
  const options = { workspace_root: workspace };
  assert.equal(buildProblemReadback([task], options)[0].resolution, 'resolved');
  assert.equal(validateOutcome(workspace, { ...task, goal: 'A different original criterion' }, report).reason, 'task_contract_changed');
  assert.equal(validateOutcome(workspace, task, { ...report, outcome: 'failed' }).reason, 'verification_report_changed');
  const dependent = { task_spec_id: 'task_dependent', goal: 'Use the repaired CLI', problem_core: {
    state: 'candidate', premises: [], relations: [{ task_spec_id: task.task_spec_id, relation: 'depends_on', basis: 'Required executable' }] } };
  const artifact = path.join(workspace, task.required_evidence[0].path);
  fs.writeFileSync(artifact, 'broken\n');
  const rows = buildProblemReadback([task, dependent], options);
  assert.equal(rows.find(item => item.task_spec_id === task.task_spec_id).resolution, 'unverified');
  assert.equal(rows.find(item => item.task_spec_id === dependent.task_spec_id).review_required, true);
  fs.writeFileSync(artifact, 'fixed\n');
  assert.equal(buildProblemReadback([task], options)[0].resolution, 'resolved');
  fs.renameSync(artifact, `${artifact}.old`);
  fs.symlinkSync(`${artifact}.old`, artifact);
  assert.equal(buildProblemReadback([task], options)[0].review_required, true);
});

test('native reflection stages actual episodes through existing holdout and promotion gates; stale support suspends cold-start reuse', () => {
  const workspace = initializeWorkspace();
  const firstRef = writeRepairTaskSpec(workspace);
  const first = JSON.parse(fs.readFileSync(path.join(workspace, firstRef)));
  // Guards are part of the learned ordered program, not supplied anew by the
  // host at reuse time. Promotion evidence below remains a synthetic fixture.
  first.actions[0].state_guards = { after: [{ path: first.required_evidence[0].path, exists: true,
    sha256: require('node:crypto').createHash('sha256').update('fixed\n').digest('hex') }] };
  writeJson(path.join(workspace, firstRef), first);
  const second = JSON.parse(JSON.stringify(first));
  second.task_spec_id = 'task_repair_second_fixture'; second.goal = 'Repair a second independent Node CLI';
  second.actions[0].action_id = 'apply_second_repair';
  second.actions[0].command_id = 'apply_second_fixture';
  second.acceptance_tests[0].command_id = 'verify_second_fixture';
  for (const target of [...second.required_evidence, ...second.observation_targets]) target.path = target.path.replace('result.txt', 'second.txt');
  second.actions[0].state_guards.after[0].path = second.required_evidence[0].path;
  const secondRef = `md-os/ops/tasks/${second.task_spec_id}.json`;
  writeJson(path.join(workspace, secondRef), second);
  const registryRef = path.join(workspace, 'md-os/ops/connectors/terminal_connector.json');
  const registry = JSON.parse(fs.readFileSync(registryRef));
  registry.commands.push(...registry.commands.slice(0, 2).map((command, index) => ({ ...command,
    command_id: index ? 'verify_second_fixture' : 'apply_second_fixture', argv: command.argv.map(arg => arg.replaceAll('result.txt', 'second.txt')) })));
  writeJson(registryRef, registry);
  for (const ref of [firstRef, secondRef]) assert.equal(readPayload(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', ref])).verdict, 'success');
  const reflection = { task_ids: [first.task_spec_id, second.task_spec_id], principle: 'A repair requires an independently observed postcondition',
    conditions: ['The registered action and independent test address the same target'],
    prediction: 'The declared target contains the repaired output', procedure: ['Apply the registered repair', 'Check the independent acceptance test'] };
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/apfc_cognitive_path_runtime.js'), 'record-turn'], {
    cwd: workspace, encoding: 'utf8', input: JSON.stringify(reflection),
    env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') } });
  const staged = readPayload(result).skill_workflow;
  assert.equal(staged.status, 'candidate');
  const candidateFile = path.join(workspace, staged.candidate_file);
  let candidate = JSON.parse(fs.readFileSync(candidateFile));
  assert.throws(() => resolveSkillProgram(workspace, { skill_id: candidate.skill_id,
    skill_hash: '0'.repeat(64), case_task_id: first.task_spec_id }, {}), /NOT_PROMOTED/);
  const episodes = candidate.source_episodes.map(id => JSON.parse(fs.readFileSync(path.join(workspace, `md-os/ops/episodes/${id}.json`))));
  const evaluation = passingEvaluation(candidate.skill_id);
  const options = { workspace_root: workspace };
  const noEval = gateCandidate(candidate, episodes, null, options);
  assert.equal(noEval.status, 'blocked');
  assert.equal(noEval.checks.current_pattern_source_outcomes, true);
  assert.equal(noEval.checks.independent_eval_passed, false);
  // Synthetic gate fixture only: these outcomes exercise the existing 30 x 3
  // protocol. They are not a measured learning or model-intelligence result.
  const fixture = passingCandidate(candidate.skill_id, candidate.source_episodes, evaluation.eval_id);
  candidate = { ...candidate, evals: [evaluation.eval_id], sealed_evaluation: fixture.sealed_evaluation };
  writeJson(candidateFile, candidate);
  writeJson(path.join(workspace, `md-os/ops/evals/${evaluation.eval_id}.json`), evaluation);
  const ops = path.join(workspace, 'md-os/ops'), apfc = path.join(ops, 'apfc/executive');
  writeJson(path.join(apfc, 'graph.json'), minimalGraph());
  const cycle = runConsolidation({ ops_root: ops, apfc_dir: apfc });
  assert.equal(cycle.skill_candidates.find(item => item.skill_id === candidate.skill_id).gate.status, 'ok');
  writeJson(path.join(apfc, 'status.json'), { release_gate: { promotion_blocked: false } });
  promotionTransaction(candidate.skill_id, { ...options, ops_root: ops, apfc_dir: apfc, approve: true, rebuild: () => [] });
  assert.equal(readPatternMemory(workspace, { maximum_bytes: 8192 }).patterns[0].skill.status, 'promoted');
  const promoted = JSON.parse(fs.readFileSync(path.join(ops, `skills/promoted/${candidate.skill_id}.json`)));
  const normalizedFirst = JSON.parse(fs.readFileSync(path.join(workspace, firstRef)));
  assert.equal(skillApplicability(workspace, promoted, normalizedFirst).applicable, true);
  assert.equal(skillApplicability(workspace, promoted, { ...normalizedFirst, actions: [] }).applicable, false);
  const memoryCard = readPatternMemory(workspace, { maximum_bytes: 8192 }).patterns[0];
  const nativeResponse = buildNativeProblemContext(workspace, { pattern_id: memoryCard.pattern_id, maximum_bytes: 32768 });
  const nativeContext = nativeResponse.encoding ? expandCompactJson(nativeResponse.encoding) : nativeResponse;
  assert.deepEqual(nativeContext.memory.patterns[0].skill.reuse, memoryCard.skill.reuse);
  const reuse = { skill_id: memoryCard.skill.reuse.skill_id, skill_hash: memoryCard.skill.reuse.skill_hash,
    case_task_id: first.task_spec_id };
  const next = { ...normalizedFirst, task_spec_id: 'task_reuse_fresh_process',
    goal: 'Repeat the known registered repair and independently check the current result',
    actions: [], skill_reuse: reuse,
    success_definition: { ...normalizedFirst.success_definition, observed_delta_required: false },
    observation_targets: normalizedFirst.observation_targets.map(target => ({ ...target, required_change: false })) };
  const program = resolveSkillProgram(workspace, reuse, next);
  assert.deepEqual(program.actions, normalizedFirst.actions);
  assert.throws(() => resolveSkillProgram(workspace, { ...reuse, skill_id: [reuse.skill_id] }, next), /REFERENCE_INVALID/);
  assert.throws(() => resolveSkillProgram(workspace, { ...reuse, unexpected: true }, next), /REFERENCE_INVALID/);
  assert.throws(() => resolveSkillProgram(workspace, { ...reuse, skill_hash: '0'.repeat(64) }, next), /VERSION_CHANGED/);
  assert.throws(() => resolveSkillProgram(workspace, { ...reuse, case_task_id: 'task_missing' }, next), /CASE_NOT_FOUND/);
  assert.throws(() => resolveSkillProgram(workspace, reuse, normalizedFirst), /SOURCE_TASK_OVERWRITE/);
  assert.throws(() => resolveSkillProgram(workspace, reuse, { ...next, acceptance_tests: [] }), /PRECONDITIONS/);
  assert.throws(() => resolveSkillProgram(workspace, reuse, { ...next, unknowns: ['Unestablished condition'] }), /PRECONDITIONS/);
  assert.throws(() => resolveSkillProgram(workspace, reuse, { ...next, constraints: [] }), /PRECONDITIONS/);
  assert.throws(() => resolveSkillProgram(workspace, reuse, { ...next, actions: [{ ...program.actions[0], command_id: 'different_command' }] }), /ACTIONS_CHANGED/);
  const nextRef = `md-os/ops/tasks/${next.task_spec_id}.json`;
  writeJson(path.join(workspace, nextRef), next);
  // This is the public command in a fresh process, with no action list supplied
  // by the host. The source skill provides the actual program, not just an ID
  // in the episode. Governance fixture evidence is still synthetic.
  const reused = readPayload(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', nextRef]));
  assert.equal(reused.verdict, 'success');
  assert.equal(reused.action_receipts.length, program.actions.length);
  const reusedEpisode = JSON.parse(fs.readFileSync(path.join(workspace, reused.episode_file)));
  assert.deepEqual(reusedEpisode.task_spec.actions, program.actions);
  const reusedReceipt = JSON.parse(fs.readFileSync(path.join(workspace, reused.action_receipts[0])));
  assert.equal(reusedReceipt.execution_control.postconditions.passed, true);
  assert.deepEqual(reusedEpisode.task_spec.skill_reuse, reuse);
  assert.ok(reusedEpisode.task_spec.verification_dependencies.includes(program.source));
  assert.deepEqual(reusedEpisode.plan.find(step => step.step_id === 'transactional_execution').skill_reuse, reuse);
  assert.equal(reusedEpisode.plan.find(step => step.step_id === 'episode_commit').inputs.includes(promoted.skill_id), true);
  const evalReadback = () => JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/evals/agi_eval_report.json')));
  assert.equal(evalReadback().metrics.skill_reuse, 1);
  assert.equal(readPatternMemory(workspace, { maximum_bytes: 8192 }).patterns[0].skill.status, 'promoted');
  const independentFailure = { ...next, task_spec_id: 'task_reuse_independent_failure',
    acceptance_tests: [{ ...next.acceptance_tests[0], command_id: 'always_fail_acceptance' }] };
  const failureRef = `md-os/ops/tasks/${independentFailure.task_spec_id}.json`;
  writeJson(path.join(workspace, failureRef), independentFailure);
  const failedReuse = readPayload(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', failureRef]));
  assert.equal(failedReuse.verdict, 'failed');
  assert.equal(failedReuse.action_receipts.length, program.actions.length);
  assert.equal(evalReadback().metrics.skill_reuse, 1);
  const reviewCard = readPatternMemory(workspace, { maximum_bytes: 8192 }).patterns[0].skill;
  assert.equal(reviewCard.status, 'promoted'); // A different failed contract is not a universal refutation.
  assert.equal(reviewCard.reuse_review.required, true);
  assert.equal(reviewCard.reuse_review.failures[0].task_spec_id, independentFailure.task_spec_id);
  const coldRead = spawnSync(process.execPath, ['-e',
    'const m=require(process.argv[1]);process.stdout.write(JSON.stringify(m.buildNativeProblemContext(process.cwd(),{maximum_bytes:32768})))',
    path.join(REPO_ROOT, 'md-os/os/problem_context.js')], { cwd: workspace, encoding: 'utf8' });
  const coldPayload = readPayload(coldRead);
  const coldContext = coldPayload.encoding ? expandCompactJson(coldPayload.encoding) : coldPayload;
  assert.equal(coldContext.memory.patterns[0].skill.reuse_review.failures[0].task_spec_id, independentFailure.task_spec_id);
  assert.throws(() => resolveSkillProgram(workspace, reuse, { ...independentFailure,
    task_spec_id: 'task_same_failure_renamed' }), /COUNTEREXAMPLE_REQUIRES_REVIEW/);
  const repeatedRef = 'md-os/ops/tasks/task_same_failure_renamed.json';
  writeJson(path.join(workspace, repeatedRef), { ...independentFailure, task_spec_id: 'task_same_failure_renamed' });
  const repeat = runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', repeatedRef]);
  assert.notEqual(repeat.status, 0);
  assert.match(`${repeat.stdout}\n${repeat.stderr}`, /COUNTEREXAMPLE_REQUIRES_REVIEW/);
  assert.deepEqual(resolveSkillProgram(workspace, reuse, next).actions, program.actions);
  const limited = { ...next, task_spec_id: 'task_reuse_budget_zero', resource_budget: { max_actions: 0 } };
  const limitedRef = `md-os/ops/tasks/${limited.task_spec_id}.json`;
  writeJson(path.join(workspace, limitedRef), limited);
  const refused = readPayload(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', limitedRef]));
  assert.notEqual(refused.verdict, 'success');
  assert.deepEqual(refused.action_receipts, []);
  assert.equal(evalReadback().metrics.skill_reuse, 1);
  const missing = { ...next, task_spec_id: 'task_reuse_without_acceptance', acceptance_tests: [] };
  const missingRef = `md-os/ops/tasks/${missing.task_spec_id}.json`;
  writeJson(path.join(workspace, missingRef), missing);
  assert.notEqual(runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', missingRef]).status, 0);
  fs.writeFileSync(path.join(workspace, first.required_evidence[0].path), 'regression\n');
  assert.equal(readPatternMemory(workspace, { maximum_bytes: 8192 }).patterns[0].skill.status, 'suspended');
  assert.equal(skillApplicability(workspace, promoted, normalizedFirst).applicable, false);
  assert.throws(() => resolveSkillProgram(workspace, reuse, next), /SUSPENDED/);
  // A stale source is rejected by the public execution path before actions.
  writeJson(path.join(workspace, nextRef), next);
  const staleRun = runScript(workspace, 'mdos.js', ['cognition', 'run-once', '--task-spec', nextRef]);
  assert.notEqual(staleRun.status, 0);
  assert.match(`${staleRun.stdout}\n${staleRun.stderr}`, /SKILL_REUSE_SUSPENDED/);
  assert.equal(fs.readFileSync(path.join(workspace, first.required_evidence[0].path), 'utf8'), 'regression\n');
});

test('plain task remains unverified and cannot create or promote a skill', () => {
  const workspace = initializeWorkspace();
  const payload = readPayload(runScript(workspace, 'mdos.js', [
    'cognition',
    'run-once',
    '--task',
    'Prove the Riemann hypothesis',
  ]));

  assert.equal(payload.mode, 'agi_run_once');
  assert.equal(payload.canonical_mode, 'cognitive_transaction_run_once');
  assert.equal(payload.verdict, 'unverified');
  assert.equal(payload.verification_outcome, 'unverified');
  assert.deepEqual(payload.action_receipts, []);
  assert.deepEqual(payload.skill_candidates, []);
  assert.deepEqual(payload.promoted_skills, []);
  assert.equal(payload.eval_results[0].improves, false);
  assert.equal(payload.eval_results[0].improvement_measured, false);

  const episode = JSON.parse(fs.readFileSync(path.join(workspace, payload.episode_file), 'utf8'));
  assert.equal(episode.verdict, 'unverified');
  assert.equal(episode.verifier_results[0].outcome, 'unverified');
  assert.equal(episode.verifier_results[0].checks.find((item) => item.check_id === 'acceptance_tests_declared').status, 'attention');
  assert.equal(fs.existsSync(path.join(workspace, payload.task_spec_file)), true);

  const registry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/skills/skill_registry.json'), 'utf8'));
  assert.equal(registry.promoted_skill_count, 0);
  assert.equal(registry.candidate_skill_count, 0);
  const evalReport = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/evals/agi_eval_report.json'), 'utf8'));
  assert.equal(evalReport.metrics.success_rate, 0);
  assert.equal(evalReport.metrics.unverified_count, 1);
});

test('declared action succeeds only after observed delta and independent acceptance', () => {
  const workspace = initializeWorkspace();
  const taskSpec = writeRepairTaskSpec(workspace);
  const payload = readPayload(runScript(workspace, 'mdos.js', [
    'cognition',
    'run-once',
    '--task-spec',
    taskSpec,
    '--promote',
  ]));

  assert.equal(payload.verdict, 'success');
  assert.equal(payload.verification_outcome, 'verified');
  assert.equal(payload.action_receipts.length, 1);
  assert.deepEqual(payload.skill_candidates, ['skill_software_repair_verified_loop']);
  assert.deepEqual(payload.promoted_skills, []);
  assert.equal(payload.eval_results[0].improves, false);
  assert.equal(payload.eval_results[0].improvement_measured, false);

  const receipt = JSON.parse(fs.readFileSync(path.join(workspace, payload.action_receipts[0]), 'utf8'));
  assert.equal(receipt.status, 'completed');
  assert.equal(receipt.observed_delta.changed, true);
  assert.equal(receipt.observed_delta.targets[0].changed, true);

  const verification = JSON.parse(fs.readFileSync(path.join(workspace, payload.verification_result), 'utf8'));
  assert.equal(verification.outcome, 'verified');
  assert.equal(verification.independent_from_planner, true);
  assert.equal(verification.acceptance_results[0].status, 'passed');

  const registry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/skills/skill_registry.json'), 'utf8'));
  assert.equal(registry.promoted_skill_count, 0);
  assert.equal(registry.candidate_skill_count, 1);
  assert.equal(registry.candidate_skills[0].promotion_gate_status, 'critical');

  const capabilities = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/capability_index.json'), 'utf8'));
  assert.equal(capabilities.capabilities.some((item) => item.capability_id === 'skill.skill_software_repair_verified_loop'), false);
});

test('failed acceptance produces failed verdict and no skill candidate', () => {
  const workspace = initializeWorkspace();
  const taskSpec = writeRepairTaskSpec(workspace, { failingAcceptance: true });
  const payload = readPayload(runScript(workspace, 'mdos.js', [
    'cognition',
    'run-once',
    '--task-spec',
    taskSpec,
    '--promote',
  ]));

  assert.equal(payload.verdict, 'failed');
  assert.equal(payload.verification_outcome, 'failed');
  assert.deepEqual(payload.skill_candidates, []);
  assert.deepEqual(payload.promoted_skills, []);
  const verification = JSON.parse(fs.readFileSync(path.join(workspace, payload.verification_result), 'utf8'));
  assert.equal(verification.acceptance_results[0].status, 'failed');
});
