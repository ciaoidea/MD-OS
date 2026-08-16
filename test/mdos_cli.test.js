#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

test('mdos init <target_dir> scaffolds a fresh MD-OS workspace', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-init-'));
  const target = path.join(parent, 'my-agent-os');

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js'), 'init', 'my-agent-os'], {
    cwd: parent,
    encoding: 'utf8',
    env: process.env,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'scaffold_workspace');
  assert.equal(payload.target_dir, target);

  assert.ok(fs.existsSync(path.join(target, 'README.md')));
  assert.ok(fs.existsSync(path.join(target, '.gitignore')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/os/mdos.js')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/apfc/README.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/kb/README.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/examples/projects/demo_general_system/project.json')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/ops/global_index.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/ops/summary/active_work_items.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/ops/releases/self_release_index.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/ops/system_hygiene_status.md')));
  assert.ok(fs.existsSync(path.join(target, 'md-os/ops/health_classification.md')));
  assert.ok(!fs.existsSync(path.join(target, 'md-os/ops/artifacts/terminal/demo_general_system__node_version__2026-04-24T17-48-03Z.txt')));

  const globalIndex = fs.readFileSync(path.join(target, 'md-os/ops/global_index.md'), 'utf8');
  assert.match(globalIndex, /Agent: `MD-OS \(Artificial Prefrontal Cortex\) 5\.0`/);
  assert.match(globalIndex, /Package semver: `5\.0\.1`/);
});

test('mdos wrapper exposes the primary command name', () => {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js')], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /mdos live start/);
});

test('mdos paths reports the active workspace selected from cwd', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-cli-paths-'));
  fs.mkdirSync(path.join(workspace, 'md-os/os'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/kb'), { recursive: true });

  const env = { ...process.env };
  delete env.MDOS_WORKSPACE_ROOT;
  delete env.MDOS_ROOT;

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js'), 'paths'], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'runtime_paths');
  assert.equal(payload.workspace_root, workspace);
  assert.equal(payload.mdos_root, path.join(workspace, 'md-os'));
});
