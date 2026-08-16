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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-semantic-graph-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runScript(workspaceRoot, scriptName) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName)], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('semantic knowledge graph profiles every markdown node and compacts health readback', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n\nSee [Docs](docs/ONBOARDING.md).\n');
  writeFile(path.join(workspace, 'AGENTS.md'), '# Agents\n');
  writeFile(path.join(workspace, 'ME.md'), '# Me\n');
  writeFile(path.join(workspace, 'docs/ONBOARDING.md'), '# Onboarding\n');
  writeFile(path.join(workspace, 'docs/CONNECTOR_PERMISSION.md'), '# Connector Permission\n\nConnector permission requires bounded readback.\n');
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# KB\n');
  writeFile(path.join(workspace, 'md-os/kb/CONNECTOR_PERMISSION_MODEL.md'), '# Connector Permission Model\n\nConnector permission policy supports bounded action.\n');
  writeFile(path.join(workspace, 'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md'), '# Runtime Lifecycle\n');
  writeFile(path.join(workspace, 'graphify-out/orientation.md'), '# Volatile derived orientation\n');

  for (const scriptName of [
    'build_markdown_graph.js',
    'build_runtime_lifecycle_index.js',
    'build_semantic_knowledge_graph.js',
  ]) {
    const result = runScript(workspace, scriptName);
    assert.equal(result.status, 0, result.stderr);
  }

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/semantic_knowledge_graph.json'), 'utf8'));
  const summary = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), 'utf8'));

  assert.equal(graph.status, 'ok');
  assert.equal(summary.status, 'ok');
  assert.equal(graph.unprofiled_node_count, 0);
  assert.equal(graph.missing_epistemic_node_count, 0);
  assert.equal(summary.semantic_profile_complete, true);
  assert.equal(summary.epistemic_profile_complete, true);
  assert.ok(graph.nodes.every((node) => node.semantic_profile_complete));
  assert.ok(graph.nodes.every((node) => node.epistemic_profile_complete));
  assert.ok(!graph.nodes.some((node) => node.path.startsWith('graphify-out/')));
  assert.ok(graph.concept_index.some((concept) => concept.term === 'connector'));
  assert.ok(graph.concept_relations.some((edge) => (
    edge.source_term === 'connector'
    && edge.target_term === 'permission'
    && edge.node_count >= 2
  )));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.md')));
});
