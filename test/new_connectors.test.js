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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-connectors-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runConnector(workspaceRoot, scriptName, args) {
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

test('filesystem connector emits a normalized snapshot', () => {
  const workspace = makeWorkspace();
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'docs/a.md'), '# A\n', 'utf8');
  writeJson(path.join(workspace, 'md-os/ops/connectors/filesystem_connector.json'), {
    schema_version: 1,
    connector_id: 'filesystem_connector',
    allowed_roots: ['docs'],
    scans: [{ scan_id: 'docs_scan', path: 'docs', summary: 'Scan docs.' }],
  });

  const result = runConnector(workspace, 'filesystem_connector.js', ['run', 'demo_project', 'docs_scan']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const snapshot = JSON.parse(fs.readFileSync(path.join(workspace, payload.snapshot_file), 'utf8'));
  assert.equal(snapshot.connector_kind, 'filesystem');
  assert.equal(snapshot.signals[0].connector_runtime.file_count, 1);
});

test('filesystem connector rejects a scan root symlink that resolves outside workspace', () => {
  const workspace = makeWorkspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-filesystem-outside-'));
  fs.writeFileSync(path.join(outside, 'private.txt'), 'outside\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'docs'), { recursive: true });
  fs.symlinkSync(outside, path.join(workspace, 'docs', 'escape'), 'dir');
  writeJson(path.join(workspace, 'md-os/ops/connectors/filesystem_connector.json'), {
    schema_version: 1,
    connector_id: 'filesystem_connector',
    allowed_roots: ['docs'],
    scans: [{ scan_id: 'escaped_scan', path: 'docs/escape', summary: 'Must not scan outside.' }],
  });

  const result = runConnector(workspace, 'filesystem_connector.js', ['run', 'demo_project', 'escaped_scan']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PATH_OUTSIDE_WORKSPACE/);
});

test('ticketing connector emits a work-item snapshot from a ticket', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/ticketing_connector.json'), {
    schema_version: 1,
    connector_id: 'ticketing_connector',
    tickets: [{ ticket_id: 'ticket_1', title: 'Fix lifecycle', summary: 'Lifecycle needs enforcement.', priority: 'high' }],
  });

  const result = runConnector(workspace, 'ticketing_connector.js', ['run', 'demo_project', 'ticket_1']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const snapshot = JSON.parse(fs.readFileSync(path.join(workspace, payload.snapshot_file), 'utf8'));
  assert.equal(snapshot.connector_kind, 'ticketing');
  assert.equal(snapshot.signals[0].priority, 'high');
});

test('robot mock connector emits telemetry and approval-gated action proposal', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/robot_mock_connector.json'), {
    schema_version: 1,
    connector_id: 'robot_mock_connector',
    missions: [{
      mission_id: 'mission_1',
      robot_id: 'robot_1',
      intent: 'Inspect aisle.',
      telemetry: [{ battery_percent: 90 }],
      proposed_actions: [{ action_id: 'stop', requires_approval: true }],
    }],
  });

  const result = runConnector(workspace, 'robot_mock_connector.js', ['run', 'demo_project', 'mission_1']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  const snapshot = JSON.parse(fs.readFileSync(path.join(workspace, payload.snapshot_file), 'utf8'));
  assert.equal(snapshot.connector_kind, 'robotic_system');
  assert.equal(snapshot.signals[0].connector_runtime.requires_approval, true);
});
