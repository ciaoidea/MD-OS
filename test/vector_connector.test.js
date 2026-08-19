#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-vector-'));
  const profile = path.join(workspace, 'md-os/ops/connectors/vector_connector.json');
  fs.mkdirSync(path.dirname(profile), { recursive: true });
  fs.writeFileSync(profile, JSON.stringify({ schema_version: 1, connector_id: 'vector_robot', bridge_command: 'vector-cortex' }));
  const backend = path.join(workspace, 'fake-vector-cortex');
  fs.writeFileSync(backend, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" > "$PWD/vector.args"\nif [ "$1" = animations ]; then printf \'one\\ntwo\\n\'; else printf \'VECTOR_OK\\n\'; fi\n');
  fs.chmodSync(backend, 0o755);
  return { workspace, backend };
}

function run(item, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/vector_connector.js'), ...args], {
    cwd: item.workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: item.workspace,
      MDOS_ROOT: path.join(item.workspace, 'md-os'),
      MDOS_VECTOR_BRIDGE: item.backend,
    },
  });
}

test('Vector status emits bounded readback without a physical action', () => {
  const item = fixture();
  const result = run(item, ['status']);
  assert.equal(result.status, 0, result.stderr);
  const receipt = JSON.parse(result.stdout);
  assert.equal(receipt.connector_id, 'vector_robot');
  assert.equal(receipt.robot_reachable, true);
  assert.equal(receipt.physical_action_performed, false);
});

test('Vector motion is blocked without both approval gates', () => {
  const item = fixture();
  const missingApproval = run(item, ['move', 'forward', '100']);
  assert.notEqual(missingApproval.status, 0);
  assert.match(missingApproval.stderr, /MOTION_APPROVAL_REQUIRED/);
  const missingClearance = run(item, ['move', 'forward', '100', '--approve-motion']);
  assert.notEqual(missingClearance.status, 0);
  assert.match(missingClearance.stderr, /WORKSPACE_CLEAR_CONFIRMATION_REQUIRED/);
  assert.equal(fs.existsSync(path.join(item.workspace, 'vector.args')), false);
});

test('Vector motion enforces bounds and passes only normalized argv', () => {
  const item = fixture();
  const unsafe = run(item, ['move', 'forward', '201', '--approve-motion', '--confirm-workspace-clear']);
  assert.notEqual(unsafe.status, 0);
  assert.match(unsafe.stderr, /MOTION_AMOUNT_OUTSIDE_SAFE_RANGE/);
  const safe = run(item, ['move', 'right', '30', '--approve-motion', '--confirm-workspace-clear']);
  assert.equal(safe.status, 0, safe.stderr);
  assert.equal(fs.readFileSync(path.join(item.workspace, 'vector.args'), 'utf8'), 'move\nright\n30\n');
  assert.equal(JSON.parse(safe.stdout).physical_action_performed, true);
});

test('Vector camera receipt never exposes the private frame path', () => {
  const item = fixture();
  const result = run(item, ['camera']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.includes('/run/'), false);
  assert.equal(JSON.parse(result.stdout).private_sensor_payload_retained_outside_mdos, true);
});

test('Vector expression requires explicit bounded approval', () => {
  const item = fixture();
  assert.notEqual(run(item, ['emotion', 'happy']).status, 0);
  const result = run(item, ['emotion', 'negative', '--approve-expression']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(item.workspace, 'vector.args'), 'utf8'), 'emotion\nnegative\n');
});
