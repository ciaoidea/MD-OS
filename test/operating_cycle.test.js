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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-operating-cycle-'));
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

test('operating cycle status is available without starting a continuous loop', () => {
  const workspace = makeWorkspace();
  const result = runScript(workspace, 'operating_cycle.js', ['status']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.mode, 'operating_cycle_status');
  assert.equal(payload.ok, true);
  assert.equal(payload.current_report_present, false);
  assert.equal(payload.outputs.report_json, 'md-os/ops/runtime/operating_cycle_report.json');
});

test('operating cycle run-once writes an explicit failure report when source boot files are absent', () => {
  const workspace = makeWorkspace();
  const result = runScript(workspace, 'operating_cycle.js', ['run-once']);
  assert.notEqual(result.status, 0);
  const payload = jsonFromStdout(result);
  assert.equal(payload.mode, 'operating_cycle_run_once');
  assert.equal(payload.ok, false);
  assert.ok(payload.failed_phase_count >= 1);

  const reportPath = path.join(workspace, 'md-os/ops/runtime/operating_cycle_report.json');
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.ok, false);
  assert.ok(report.phases.length >= 1);
  assert.ok(report.phases.some((phase) => phase.ok === false));
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/runtime/operating_cycle_report.md')));
});
