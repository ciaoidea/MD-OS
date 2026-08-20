#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

function runBuilder(name, workspace) {
  return spawnSync(process.execPath, [path.join(ROOT, 'md-os/os', name)], {
    cwd: workspace,
    encoding: 'utf8',
    env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') },
  });
}

test('canonical scanners exclude private local runtime trees', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-routing-'));
  fs.mkdirSync(path.join(workspace, 'md-os/ops/local/audio/.venv'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/kb'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/kb/KEEP.md'), '# Keep\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/local/audio/.venv/PRIVATE.md'), '# Private\n', 'utf8');
  for (const builder of ['build_workspace_inventory.js', 'build_markdown_graph.js']) {
    const result = runBuilder(builder, workspace);
    assert.equal(result.status, 0, result.stderr);
  }
  const inventory = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/workspace_inventory.json')));
  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json')));
  assert.ok(inventory.files.some((item) => item.path.replace(/\\/g, '/') === 'md-os/kb/KEEP.md'));
  assert.ok(!inventory.files.some((item) => item.path.includes('ops/local')));
  assert.ok(!graph.nodes.some((item) => item.path.includes('ops/local')));
});

test('site index is deterministically derived from README', () => {
  const { buildSiteIndex } = require('../scripts/build-site-index');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const index = fs.readFileSync(path.join(ROOT, 'index.md'), 'utf8');
  assert.equal(index, buildSiteIndex(readme));
});

test('derived site index does not become a second canonical graph node', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-derived-index-'));
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Canonical\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'index.md'), '# Canonical\n', 'utf8');
  const result = runBuilder('build_markdown_graph.js', workspace);
  assert.equal(result.status, 0, result.stderr);
  const graph = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/markdown_graph.json')));
  assert.ok(graph.nodes.some((item) => item.path === 'README.md'));
  assert.ok(!graph.nodes.some((item) => item.path === 'index.md'));
});
