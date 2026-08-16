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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-boot-summary-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
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

test('conceptual boot summary compiles identity, semantic, operating, and closure readback', () => {
  const workspace = makeWorkspace();
  const ops = path.join(workspace, 'md-os/ops');

  writeJson(path.join(ops, 'core/agentic_core.json'), {
    core: {
      identity: { name: 'MD-OS (Artificial Prefrontal Cortex)', host_runtime_role: 'execution_layer' },
      release_identity: { current_operating_boundary: 'md-os/' },
      mission: 'Test mission.',
      non_claims: ['not AGI'],
    },
  });
  writeJson(path.join(ops, 'semantic_knowledge_summary.json'), {
    status: 'ok',
    semantic_profile_complete: true,
    epistemic_profile_complete: true,
    top_concepts: [
      { term: 'operation', node_count: 3 },
      { term: 'boot', node_count: 2 },
    ],
  });
  writeJson(path.join(ops, 'summary/active_work_items.json'), {
    active_count: 1,
    active_items: [
      { project_id: 'demo', id: 'W1', state: 'open', priority: 'high', title: 'Close boot summary.' },
    ],
  });
  writeJson(path.join(ops, 'runtime/semantic_operational_compiler.json'), {
    status: 'ok',
    context_packs: [{ pack_id: 'bootstrap' }],
  });
  writeJson(path.join(ops, 'health_classification.json'), { status: 'ok', finding_count: 0 });
  writeJson(path.join(ops, 'agi/loop_status.json'), { status: 'ok' });
  writeJson(path.join(ops, 'state.json'), { mode: 'healthy' });
  writeText(path.join(ops, 'continuity.md'), '# Continuity\n\nStable.\n');
  writeText(path.join(ops, 'last_summary.md'), '# Last Summary\n\nRecent result.\n');

  const result = runScript(workspace, 'build_conceptual_boot_summary.js');
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(fs.readFileSync(path.join(ops, 'summary/conceptual_boot_summary.json'), 'utf8'));
  assert.equal(payload.schema_version, 1);
  assert.equal(payload.status, 'attention');
  assert.equal(payload.identity.name, 'MD-OS (Artificial Prefrontal Cortex)');
  assert.equal(payload.semantic.top_concepts.length, 2);
  assert.equal(payload.operating.active_count, 1);
  assert.match(payload.closure.discipline, /master_closure/);
  assert.ok(payload.missing_inputs.includes('md-os/ops/global_index.json'));
  assert.ok(fs.existsSync(path.join(ops, 'summary/conceptual_boot_summary.md')));
});
