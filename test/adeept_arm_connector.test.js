#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function fixture() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-adeept-'));
  const port = path.join(workspace, 'ttyUSB0');
  const camera = path.join(workspace, 'video2');
  fs.writeFileSync(port, '');
  fs.writeFileSync(camera, '');
  writeJson(path.join(workspace, 'md-os/ops/connectors/adeept_arm_connector.json'), {
    schema_version: 1,
    connector_id: 'adeept_arm',
    controller_family: 'test_candidate',
    protocol: {
      status: 'candidate',
      baud: 9600,
      one_byte_one_step: true,
      commands: {
        base: { increase: 'o', decrease: 'p' },
        gripper: { increase: 'q', decrease: 'w' },
      },
      randomized_learning_allowlist: [
        { joint: 'base', direction: 'increase' },
        { joint: 'base', direction: 'decrease' },
      ],
    },
    safety: {
      camera_required_for_learning: true,
      stop_semantics: 'one byte then close',
      max_candidate_steps_by_joint: { base: 1, gripper: 5 },
      max_verified_steps_per_action: 10,
    },
  });
  writeJson(path.join(workspace, 'md-os/ops/local/hardware/adeept_arm_target.json'), {
    schema_version: 1,
    target_id: 'arm_test',
    device_path: port,
    expected_usb: { vendor_id: '1a86', product_id: '7523' },
    observation_camera_path: camera,
  });
  const backend = path.join(workspace, 'fake-backend');
  fs.writeFileSync(backend, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$@" > "$PWD/backend.args"\nprintf \'{"ok":true,"bytes_written":1}\\n\'\n');
  fs.chmodSync(backend, 0o755);
  return { workspace, backend };
}

function run(item, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/adeept_arm_connector.js'), ...args], {
    cwd: item.workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: item.workspace,
      MDOS_ROOT: path.join(item.workspace, 'md-os'),
      MDOS_ADEEPT_TEST_MODE: '1',
      MDOS_ADEEPT_TEST_IDENTITY: JSON.stringify({ ID_VENDOR_ID: '1a86', ID_MODEL_ID: '7523', ID_MODEL: 'CH340' }),
      MDOS_ADEEPT_SERIAL_BACKEND: item.backend,
    },
  });
}

test('adeept arm dry-run resolves a deterministic random allowlisted command without writing', () => {
  const item = fixture();
  const result = run(item, ['dry-run', 'random', '--seed', 'fixed-seed']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.physical_action_performed, false);
  assert.equal(payload.bytes_that_would_be_written, 1);
  assert.equal(payload.selected.randomized, true);
  assert.equal(fs.existsSync(path.join(item.workspace, 'backend.args')), false);
});

test('adeept arm candidate pulse requires all physical-action approval gates', () => {
  const item = fixture();
  const result = run(item, ['pulse', 'base', 'increase', '--approve-motion']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /MOTION_GATE_MISSING/);
  assert.equal(fs.existsSync(path.join(item.workspace, 'backend.args')), false);
});

test('adeept arm pulse sends exactly one allowlisted byte and writes audit readback', () => {
  const item = fixture();
  const result = run(item, [
    'pulse', 'random', '--seed', 'trial-1',
    '--approve-motion', '--confirm-workspace-clear', '--approve-candidate-protocol',
  ]);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.bytes_written, 1);
  const backendArgs = fs.readFileSync(path.join(item.workspace, 'backend.args'), 'utf8');
  assert.match(backendArgs, /--count\n1/);
  assert.match(backendArgs, /--byte-hex\n(6f|70)/);
  const actions = fs.readFileSync(path.join(item.workspace, 'md-os/ops/local/hardware/actions.ndjson'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(actions.at(-1).action, 'bounded_degree_pulse');
  assert.equal(actions.at(-1).selected_command.command_count, 1);
});

test('adeept arm candidate profile permits only the declared bounded gripper visibility trial', () => {
  const item = fixture();
  const allowed = run(item, [
    'pulse', 'gripper', 'decrease', '--steps', '5',
    '--approve-motion', '--confirm-workspace-clear', '--approve-candidate-protocol',
  ]);
  assert.equal(allowed.status, 0, allowed.stderr);
  assert.equal(JSON.parse(allowed.stdout).bytes_written, 1);
  assert.match(fs.readFileSync(path.join(item.workspace, 'backend.args'), 'utf8'), /--count\n5/);

  const blocked = run(fixture(), [
    'pulse', 'gripper', 'decrease', '--steps', '6',
    '--approve-motion', '--confirm-workspace-clear', '--approve-candidate-protocol',
  ]);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /STEP_COUNT_EXCEEDS_CANDIDATE_LIMIT/);
});

test('adeept arm stop never opens the serial backend', () => {
  const item = fixture();
  const result = run(item, ['stop']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.bytes_written, 0);
  assert.equal(payload.command_stream_active, false);
  assert.equal(fs.existsSync(path.join(item.workspace, 'backend.args')), false);
});
