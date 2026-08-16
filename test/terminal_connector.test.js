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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-terminal-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runConnector(workspaceRoot, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/terminal_connector.js'), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('terminal connector writes bounded snapshot inside workspace', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/terminal_connector.json'), {
    schema_version: 1,
    connector_id: 'terminal_executor',
    default_timeout_ms: 15000,
    max_stdout_bytes: 10000,
    max_stderr_bytes: 10000,
    redact_patterns: ['token='],
    commands: [
      {
        command_id: 'node_version',
        argv: [process.execPath, '--version'],
        cwd: '.',
        summary: 'Capture Node version.',
      },
    ],
  });

  const result = runConnector(workspace, ['run', 'demo_project', 'node_version']);
  assert.equal(result.status, 0, result.stderr);

  const snapshotPath = path.join(workspace, 'md-os/ops/sources/connectors/demo_project__terminal__node_version.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(snapshot.project_id, 'demo_project');
  assert.equal(snapshot.signals.length, 1);
  assert.equal(snapshot.signals[0].connector_runtime.cwd, '.');
  assert.match(snapshot.signals[0].connector_runtime.output_sha256, /^[a-f0-9]{64}$/);
});

test('terminal connector rejects cwd outside workspace', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/terminal_connector.json'), {
    schema_version: 1,
    connector_id: 'terminal_executor',
    commands: [
      {
        command_id: 'bad_cwd',
        argv: [process.execPath, '--version'],
        cwd: '..',
        summary: 'Should not run.',
      },
    ],
  });

  const result = runConnector(workspace, ['run', 'demo_project', 'bad_cwd']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PATH_OUTSIDE_WORKSPACE/);
});

test('terminal connector rejects a cwd symlink that resolves outside workspace', () => {
  const workspace = makeWorkspace();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-terminal-outside-'));
  fs.mkdirSync(path.join(workspace, 'linked'), { recursive: true });
  fs.symlinkSync(outside, path.join(workspace, 'linked', 'escape'), 'dir');
  writeJson(path.join(workspace, 'md-os/ops/connectors/terminal_connector.json'), {
    schema_version: 1,
    connector_id: 'terminal_executor',
    commands: [
      {
        command_id: 'symlink_cwd',
        argv: [process.execPath, '-e', "require('node:fs').writeFileSync('escaped.txt', 'outside')"],
        cwd: 'linked/escape',
        summary: 'Must not run outside through a symbolic cwd.',
      },
    ],
  });

  const result = runConnector(workspace, ['run', 'demo_project', 'symlink_cwd']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /PATH_OUTSIDE_WORKSPACE/);
  assert.equal(fs.existsSync(path.join(outside, 'escaped.txt')), false);
});
