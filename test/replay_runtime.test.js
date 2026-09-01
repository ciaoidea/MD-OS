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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-replay-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runMdos(workspaceRoot, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js'), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

function setupReplayWorkspace(workspace) {
  writeText(path.join(workspace, 'AGENTS.md'), fs.readFileSync(path.join(REPO_ROOT, 'AGENTS.md'), 'utf8'));
  writeText(path.join(workspace, 'ME.md'), fs.readFileSync(path.join(REPO_ROOT, 'ME.md'), 'utf8'));
  writeText(path.join(workspace, 'README.md'), fs.readFileSync(path.join(REPO_ROOT, 'README.md'), 'utf8'));
  writeText(path.join(workspace, 'index.md'), fs.readFileSync(path.join(REPO_ROOT, 'index.md'), 'utf8'));
  writeText(path.join(workspace, 'package.json'), JSON.stringify({
    name: 'md-os-replay-test',
    version: '5.0.0',
  }, null, 2));
  for (const file of [
    'AGENTIC_CORE_MODEL.md',
    'AGENT_IDENTITY.md',
    'AGENTIC_OPERATIONAL_RELEASE_MODEL.md',
    'COGNITIVE_BOOTSTRAP.md',
    'EPISTEMIC_LIFECYCLE_MODEL.md',
    'KNOWLEDGE_IMPORT_METHOD_MODEL.md',
    'MARKDOWN_GRAPH_MODEL.md',
    'OPERATIONS.md',
    'PERMISSION_MODEL.md',
    'RUNTIME_STATE_LIFECYCLE_MODEL.md',
    'SELF_RELEASE_EVOLUTION_MODEL.md',
    'SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md',
    'SEMANTIC_NEURAL_OVERLAY_MODEL.md',
    'SEMANTIC_OPERATIONAL_NETWORK_MODEL.md',
    'SEMANTIC_COMMITMENT_GATE_MODEL.md',
    'CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md',
    'ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md',
    'CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md',
    'UNITY_TENSOR_FIELD_MODEL.md',
    'RECURSIVE_SELF_REFLECTION_MODEL.md',
    'PHENOMENAL_CONSCIOUSNESS_CANDIDATE_MODEL.md',
    'ARTIFICIAL_LIFE_AND_SUBJECTIVITY_MODEL.md',
    'BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md',
    'PREDELIBERATIVE_AFFECT_MODEL.md',
    'ARCHIVE_COMPACTION_MODEL.md',
  ]) {
    const source = fs.readFileSync(path.join(REPO_ROOT, 'md-os/kb', file), 'utf8');
    writeText(path.join(workspace, 'md-os/kb', file), source);
  }
  writeText(
    path.join(workspace, 'md-os/apfc/README.md'),
    fs.readFileSync(path.join(REPO_ROOT, 'md-os/apfc/README.md'), 'utf8'),
  );
  writeJson(path.join(workspace, 'md-os/ops/projects/demo_project/project.json'), {
    schema_version: 1,
    project_id: 'demo_project',
    title: 'Demo Project',
    owner: 'Operator',
    description: 'Replay test project',
  });
  writeJson(path.join(workspace, 'md-os/ops/sources/manual/demo_project.json'), {
    schema_version: 1,
    connector_name: 'manual',
    connector_kind: 'manual',
    project_id: 'demo_project',
    captured_at: '2026-04-24T18:00:00Z',
    signals: [
      {
        source_id: 'manual_signal_001',
        captured_at: '2026-04-24T18:00:00Z',
        summary: 'Replay should rebuild this work item.',
        status_hint: 'open',
        priority: 'high',
        entities: ['replay_runtime'],
        tags: ['test'],
        suspected_causes: [],
        depends_on: [],
        next_step: 'Verify replay output.',
        external_parties: [],
      },
    ],
  });
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/journal.ndjson'), '', 'utf8');
}

test('cortex replay rebuilds compiled state and preserves sources', () => {
  const workspace = makeWorkspace();
  setupReplayWorkspace(workspace);

  const first = runMdos(workspace, ['replay']);
  assert.equal(first.status, 0, first.stderr);
  const firstPayload = JSON.parse(first.stdout);
  assert.deepEqual(firstPayload.project_ids, ['demo_project']);
  assert.equal(firstPayload.fingerprint.projects.demo_project.open_count, 1);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/sources/manual/demo_project.json')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/projects/demo_project/work_items.ndjson')));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/releases/self_release_index.json')));

  fs.writeFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/status.json'), '{"corrupted":true}\n', 'utf8');
  const second = runMdos(workspace, ['replay']);
  assert.equal(second.status, 0, second.stderr);
  const secondPayload = JSON.parse(second.stdout);
  assert.equal(secondPayload.matched_before, false);
  assert.equal(secondPayload.fingerprint.projects.demo_project.open_count, 1);

  const third = runMdos(workspace, ['replay']);
  assert.equal(third.status, 0, third.stderr);
  const thirdPayload = JSON.parse(third.stdout);
  assert.equal(thirdPayload.matched_before, true);
  assert.equal(thirdPayload.fingerprint.self_release_semver, '5.0.0');

  const journal = fs.readFileSync(path.join(workspace, 'md-os/ops/journal.ndjson'), 'utf8');
  assert.match(journal, /runtime_replayed/);
});
