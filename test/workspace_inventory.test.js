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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-inventory-'));
}

function runInventory(workspaceRoot) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/build_workspace_inventory.js')], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('workspace inventory reports ops artifacts as a notable bucket', () => {
  const workspace = makeWorkspace();
  const artifactPath = path.join(workspace, 'md-os/ops/artifacts/terminal/output.txt');
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, 'runtime artifact\n', 'utf8');

  const result = runInventory(workspace);
  assert.equal(result.status, 0, result.stderr);

  const inventory = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/workspace_inventory.json'), 'utf8'));
  assert.ok(inventory.notable_buckets.some((bucket) => bucket.label === 'ops_artifacts'));
});

test('workspace inventory ignores nested .cache workspaces', () => {
  const workspace = makeWorkspace();
  const cachedReadme = path.join(workspace, '.cache/demo/README.md');
  fs.mkdirSync(path.dirname(cachedReadme), { recursive: true });
  fs.writeFileSync(cachedReadme, '# Cached demo\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Root\n', 'utf8');

  const result = runInventory(workspace);
  assert.equal(result.status, 0, result.stderr);

  const inventory = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/workspace_inventory.json'), 'utf8'));
  assert.ok(!inventory.files.some((file) => file.path.startsWith('.cache/')));
  assert.ok(inventory.files.some((file) => file.path === 'README.md'));
});
