#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { parseOptions, runPromote } = require('../md-os/os/agi_loop');

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
