#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  assertSafeId,
  sha256Json,
} = require('../md-os/os/lib/common');
const { assertInsideMdos } = require('../md-os/kernel/cognition/task_compiler');

const REPO_ROOT = path.resolve(__dirname, '..');

test('accepts safe ids and rejects path-like ids', () => {
  assert.equal(assertSafeId('demo_project-01', 'project_id'), 'demo_project-01');
  assert.throws(() => assertSafeId('../x', 'project_id'), /INVALID_PROJECT_ID/);
  assert.throws(() => assertSafeId('bad/name', 'source_id'), /INVALID_SOURCE_ID/);
  assert.throws(() => assertSafeId('', 'command_id'), /INVALID_COMMAND_ID/);
});

test('assertInsideWorkspace rejects paths outside the workspace root', () => {
  assert.equal(assertInsideWorkspace(path.join(WORKSPACE_ROOT, 'md-os')), path.join(WORKSPACE_ROOT, 'md-os'));
  assert.throws(() => assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, '..')), /PATH_OUTSIDE_WORKSPACE/);
});

test('assertInsideWorkspace rejects a lexical child that resolves through a symlink outside the workspace', (t) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-outside-'));
  const inside = fs.mkdtempSync(path.join(WORKSPACE_ROOT, 'md-os/ops/local/symlink-guard-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  t.after(() => fs.rmSync(inside, { recursive: true, force: true }));
  const link = path.join(inside, 'escape');
  fs.symlinkSync(outside, link, 'dir');

  assert.throws(
    () => assertInsideWorkspace(path.join(link, 'evidence.txt')),
    /PATH_OUTSIDE_WORKSPACE/
  );
});

test('assertInsideWorkspace preserves valid unresolved and in-boundary symbolic paths', (t) => {
  const inside = fs.mkdtempSync(path.join(WORKSPACE_ROOT, 'md-os/ops/local/symlink-valid-'));
  t.after(() => fs.rmSync(inside, { recursive: true, force: true }));
  const target = path.join(inside, 'target');
  const link = path.join(inside, 'link');
  fs.mkdirSync(target);
  fs.symlinkSync(target, link, 'dir');

  assert.equal(
    assertInsideWorkspace(path.join(link, 'future.txt')),
    path.join(target, 'future.txt')
  );
  assert.equal(
    assertInsideWorkspace(path.join(inside, '..cache', 'future.txt')),
    path.join(inside, '..cache', 'future.txt')
  );
});

test('task compiler rejects an md-os path that resolves through a symlink outside the boundary', (t) => {
  const outsideBoundary = fs.mkdtempSync(path.join(os.tmpdir(), 'task-spec-outside-mdos-'));
  const inside = fs.mkdtempSync(path.join(MDOS_ROOT, 'ops/local/task-spec-symlink-'));
  t.after(() => fs.rmSync(outsideBoundary, { recursive: true, force: true }));
  t.after(() => fs.rmSync(inside, { recursive: true, force: true }));
  const link = path.join(inside, 'escape');
  fs.symlinkSync(outsideBoundary, link, 'dir');

  assert.throws(
    () => assertInsideMdos(path.join(link, 'task.json'), 'task_spec'),
    /TASK_SPEC_OUTSIDE_MD_OS_BOUNDARY/
  );
});

test('sha256Json is stable across object key order', () => {
  assert.equal(sha256Json({ b: 2, a: 1 }), sha256Json({ a: 1, b: 2 }));
});

test('common root detection prefers the current MD-OS workspace over package location', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-portable-root-'));
  fs.mkdirSync(path.join(workspace, 'md-os/os'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/kb'), { recursive: true });

  const env = { ...process.env };
  delete env.MDOS_WORKSPACE_ROOT;
  delete env.MDOS_ROOT;

  const result = spawnSync(process.execPath, ['-e', [
    `const common = require(${JSON.stringify(path.join(REPO_ROOT, 'md-os/os/lib/common.js'))});`,
    'console.log(JSON.stringify({ workspace: common.WORKSPACE_ROOT, mdos: common.MDOS_ROOT }));',
  ].join('')], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.workspace, workspace);
  assert.equal(payload.mdos, path.join(workspace, 'md-os'));
});
