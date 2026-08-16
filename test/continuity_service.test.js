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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-continuity-'));
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

function jsonFromStdout(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

test('continuity service run-once writes readable status, log, and rebuilt views', () => {
  const workspace = makeWorkspace();
  const initialized = runScript(workspace, 'initialize_ops_memory.js');
  assert.equal(initialized.status, 0, initialized.stderr);

  const result = runScript(workspace, 'continuity_service.js', ['run-once']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'continuity_service_run_once');
  assert.equal(payload.service_id, 'continuity_service');
  assert.equal(payload.status.status, 'stopped');
  assert.equal(payload.last_cycle.ok, true);

  const serviceDir = path.join(workspace, 'md-os/ops/services');
  const statusFile = path.join(serviceDir, 'continuity_service.status.json');
  const logFile = path.join(serviceDir, 'continuity_service.log');

  assert.ok(fs.existsSync(statusFile));
  assert.ok(fs.existsSync(logFile));
  assert.ok(!fs.existsSync(path.join(serviceDir, 'continuity_service.pid')));

  const status = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
  assert.equal(status.status, 'stopped');
  assert.equal(status.desired_state, 'stopped');
  assert.equal(status.last_cycle.ok, true);

  const log = fs.readFileSync(logFile, 'utf8');
  assert.match(log, /cycle_completed/);
  assert.match(log, /stopped/);

  const index = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/global_index.json'), 'utf8'));
  assert.equal(index.ops.services.service_count, 1);
  assert.equal(index.ops.services.services[0].service_id, 'continuity_service');
  assert.equal(index.ops.services.services[0].status, 'stopped');
});

test('mdos continuity status is available as a simple toggle command', () => {
  const workspace = makeWorkspace();
  const initialized = runScript(workspace, 'initialize_ops_memory.js');
  assert.equal(initialized.status, 0, initialized.stderr);

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'md-os/os/mdos.js'),
    'continuity',
    'status',
  ], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'continuity_service_status');
  assert.equal(payload.service_id, 'continuity_service');
});

test('mdos live status is the primary live-mode toggle command', () => {
  const workspace = makeWorkspace();
  const initialized = runScript(workspace, 'initialize_ops_memory.js');
  assert.equal(initialized.status, 0, initialized.stderr);

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'md-os/os/mdos.js'),
    'live',
    'status',
  ], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'continuity_service_status');
  assert.equal(payload.service_id, 'continuity_service');
});
