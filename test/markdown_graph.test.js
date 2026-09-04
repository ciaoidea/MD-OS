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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-markdown-graph-'));
}

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runGraph(workspaceRoot) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/build_markdown_graph.js')], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('markdown graph scans md files and creates structural and explicit edges', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n\nSee [Architecture](docs/ARCHITECTURE.md).\n');
  writeFile(path.join(workspace, 'AGENTS.md'), '# Agents\n');
  writeFile(path.join(workspace, 'ME.md'), '# Me\n');
  writeFile(path.join(workspace, 'docs/ONBOARDING.md'), '# Onboarding\n');
  writeFile(path.join(workspace, 'docs/ARCHITECTURE.md'), '# Architecture\n\nBack to [Root](../README.md).\n');
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# KB\n');
  writeFile(path.join(workspace, 'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md'), '# Lifecycle\n');
  writeFile(path.join(workspace, 'md-os/ops/global_index.md'), '# Global Index\n');

  const result = runGraph(workspace);
  assert.equal(result.status, 0, result.stderr);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json'), 'utf8'));
  assert.equal(graph.markdown_file_count, 8);
  assert.ok(graph.resolved_explicit_link_count >= 2);
  assert.ok(graph.structural_link_count > 0);
  assert.equal(graph.structural_isolated_count, 0);
  assert.equal(graph.semantic_operational_network.required_node_count > 0, true);
  assert.ok(graph.semantic_operational_network.missing_node_count > 0);
  assert.ok(graph.explicit_links.some((edge) => edge.source === 'README.md' && edge.target === 'docs/ARCHITECTURE.md'));
  assert.ok(graph.structural_links.some((edge) => edge.source === 'docs/ARCHITECTURE.md' && edge.target === 'docs/ONBOARDING.md'));

  const markdown = fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.md'), 'utf8');
  assert.match(markdown, /\[README\.md\]\(\.\.\/\.\.\/README\.md\)/);
  assert.match(markdown, /\[docs\/ARCHITECTURE\.md\]\(\.\.\/\.\.\/docs\/ARCHITECTURE\.md\)/);
});

test('markdown graph ignores local caches and generated Graphify Markdown', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n');
  writeFile(path.join(workspace, '.cache/demo/README.md'), '# Cached demo\n');
  writeFile(path.join(workspace, 'graphify-out/GRAPH_REPORT.md'), '# Derived Graphify report\n');
  writeFile(path.join(workspace, 'md-os/ops/global_index.md'), '# Global Index\n');

  const result = runGraph(workspace);
  assert.equal(result.status, 0, result.stderr);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json'), 'utf8'));
  assert.ok(!graph.nodes.some((node) => node.path.startsWith('.cache/')));
  assert.ok(!graph.nodes.some((node) => node.path.startsWith('graphify-out/')));
  assert.ok(graph.nodes.some((node) => node.path === 'README.md'));
});

test('markdown graph anchors semantic shell documents through the shell entrypoint', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n');
  writeFile(path.join(workspace, 'md-os/shell/MDOS_SHELL.md'), '# MD-OS Shell\n');
  writeFile(path.join(workspace, 'md-os/shell/programs/code.md'), '# Code\n');
  writeFile(path.join(workspace, 'md-os/shell/programs/os.md'), '# OS\n');

  const result = runGraph(workspace);
  assert.equal(result.status, 0, result.stderr);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json'), 'utf8'));
  assert.equal(graph.structural_isolated_count, 0);
  assert.ok(graph.nodes
    .filter((node) => node.path.startsWith('md-os/shell/'))
    .every((node) => node.zone === 'semantic_shell' && node.structurally_connected));
  assert.ok(graph.structural_links.some((edge) => (
    edge.source === 'md-os/shell/programs/code.md'
    && edge.target === 'md-os/shell/MDOS_SHELL.md'
    && edge.reason === 'semantic_shell_entrypoint'
  )));
});

test('markdown graph anchors portable migration records without assuming a KB layout', () => {
  const workspace = makeWorkspace();
  writeFile(path.join(workspace, 'README.md'), '# Root\n');
  writeFile(path.join(workspace, 'md-os/kb/OPERATIONS.md'), '# Operations\n');
  writeFile(
    path.join(workspace, 'md-os/migrations/example/README.md'),
    '# Portable migration\n',
  );

  const result = runGraph(workspace);
  assert.equal(result.status, 0, result.stderr);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json'), 'utf8'));
  const migration = graph.nodes.find((node) => node.path === 'md-os/migrations/example/README.md');
  assert.equal(migration.structurally_connected, true);
  assert.ok(graph.structural_links.some((edge) => (
    edge.source === 'md-os/migrations/example/README.md'
    && edge.target === 'md-os/kb/OPERATIONS.md'
    && edge.reason === 'operations_entrypoint'
  )));
});

test('semantic operational network treats deterministic readback nodes as generated', () => {
  const workspace = makeWorkspace();
  const sourceCoreNodes = [
    'ME.md',
    'AGENTS.md',
    'README.md',
    'md-os/kb/README.md',
    'md-os/kb/OPERATIONS.md',
    'md-os/kb/AGENTIC_CORE_MODEL.md',
    'md-os/kb/COGNITIVE_BOOTSTRAP.md',
    'md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md',
    'md-os/kb/SEMANTIC_OPERATIONAL_NETWORK_MODEL.md',
    'md-os/kb/SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md',
    'md-os/kb/SEMANTIC_NEURAL_OVERLAY_MODEL.md',
    'md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md',
    'md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md',
    'md-os/kb/KNOWLEDGE_IMPORT_METHOD_MODEL.md',
    'md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md',
    'md-os/kb/SOFTWARE_REPAIR_BENCHMARK_MODEL.md',
    'md-os/kb/MARKDOWN_GRAPH_MODEL.md',
    'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md',
    'md-os/kb/PERMISSION_MODEL.md',
    'md-os/kb/CONNECTOR_CONTRACT.md',
    'md-os/kb/WORK_ITEM_STATE_MACHINE.md',
  ];

  for (const nodePath of sourceCoreNodes) {
    writeFile(path.join(workspace, nodePath), `# ${path.basename(nodePath, '.md')}\n`);
  }

  const result = runGraph(workspace);
  assert.equal(result.status, 0, result.stderr);

  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json'), 'utf8'));
  assert.equal(graph.semantic_operational_network.status, 'ok');
  assert.equal(graph.semantic_operational_network.missing_node_count, 0);
  assert.equal(graph.semantic_operational_network.generated_core_node_count, 9);
  assert.ok(!graph.semantic_operational_network.missing_nodes.includes('md-os/ops/health.md'));
});
