#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-runtime-compiler-'));
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

test('runtime compiler emits semantic, claim, capability, context, and eval readback', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n\nThis system must keep readback after action.\n\nSee [Operations](md-os/kb/OPERATIONS.md).\n');
  writeFile(path.join(workspace, 'AGENTS.md'), '# Agents\n\nThe host runtime is an execution layer, not identity.\n');
  writeFile(path.join(workspace, 'ME.md'), '# MD-OS APFC\n\nMD-OS APFC is the operating identity.\n');
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# KB\n\nSee [[OPERATIONS]].\n');
  writeFile(path.join(workspace, 'md-os/kb/OPERATIONS.md'), '# Operations\n\nConnector permission requires bounded readback and rollback.\n');
  writeFile(path.join(workspace, 'md-os/kb/SEMANTIC_OPERATIONAL_COMPILER_MODEL.md'), '# Runtime Compiler\n\nEvery claim must have status.\n');

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
  writeJson(path.join(workspace, 'md-os/ops/compiled/programs.json'), {
    schema_version: 1,
    programs: [{
      program_id: 'readback_test',
      source_file: 'md-os/ops/programs/readback_test.md',
      conditions: ['Never execute destructive commands.'],
      actions: ['Write readback.'],
      outputs: ['journal event'],
    }],
  });
  writeJson(path.join(workspace, 'md-os/ops/replay_report.json'), {
    schema_version: 1,
    matched_before: true,
    replay_hash: 'stable',
  });
  writeJson(path.join(workspace, 'md-os/ops/core/agentic_core.json'), {
    schema_version: 1,
    core: {
      identity: { name: 'MD-OS APFC' },
    },
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    current_release: { unified_identity: 'MD-OS APFC' },
  });

  for (const scriptName of [
    'build_markdown_graph.js',
    'build_runtime_lifecycle_index.js',
    'build_semantic_knowledge_graph.js',
    'build_runtime_compiler.js',
  ]) {
    const result = runScript(workspace, scriptName);
    assert.equal(result.status, 0, result.stderr);
  }

  const compiler = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/semantic_operational_compiler.json'), 'utf8'));
  const semanticIndex = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/semantic_index.json'), 'utf8'));
  const claimIndex = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/claim_index.json'), 'utf8'));
  const capabilityIndex = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/capability_index.json'), 'utf8'));
  const contextPackIndex = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/context_packs/index.json'), 'utf8'));
  const evalResults = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/eval_results.json'), 'utf8'));
  const epistemicHealth = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime/epistemic_health.json'), 'utf8'));

  assert.equal(compiler.status, 'ok');
  assert.ok(semanticIndex.nodes.some((node) => node.path === 'md-os/kb/OPERATIONS.md'));
  assert.equal(claimIndex.unstatused_claim_count, 0);
  assert.ok(claimIndex.claims.every((claim) => claim.status));
  assert.ok(capabilityIndex.capabilities.some((capability) => capability.capability_id === 'connector.terminal_executor'));
  assert.ok(capabilityIndex.capabilities.some((capability) => capability.capability_id === 'policy.enforce_gate'));
  assert.equal(contextPackIndex.context_pack_count, 7);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/runtime/context_packs/operations.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/runtime/context_packs/agi_learning.json')));
  assert.equal(evalResults.status, 'ok');
  assert.equal(epistemicHealth.invariant_checks.every_claim_has_status, true);

  const cli = runScript(workspace, 'mdos.js', ['compile-runtime']);
  assert.equal(cli.status, 0, cli.stderr);
  const payload = JSON.parse(cli.stdout.trim().split('\n').at(-1));
  assert.equal(payload.mode, 'build_runtime_compiler');
});
