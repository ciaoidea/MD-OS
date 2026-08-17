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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-hardware-'));
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

test('hardware bootstrap writes read-only registry and markdown views', () => {
  const workspace = makeWorkspace();

  const result = runScript(workspace, 'hardware_bootstrap.js', ['--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'hardware_bootstrap');
  assert.equal(payload.read_only, true);

  const hardwareDir = path.join(workspace, 'md-os/ops/local/hardware');
  const registryPath = path.join(hardwareDir, 'device_registry.json');
  const inventoryPath = path.join(hardwareDir, 'inventory.md');
  const capabilitiesPath = path.join(hardwareDir, 'capabilities.md');
  const reportPath = path.join(hardwareDir, 'bootstrap_report.md');
  const observationsPath = path.join(hardwareDir, 'observations.ndjson');

  assert.ok(fs.existsSync(registryPath));
  assert.ok(fs.existsSync(inventoryPath));
  assert.ok(fs.existsSync(capabilitiesPath));
  assert.ok(fs.existsSync(reportPath));
  assert.ok(fs.existsSync(observationsPath));

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.mode, 'hardware_bootstrap_read_only');
  assert.equal(registry.locality.scope, 'host_local');
  assert.equal(registry.locality.portable, false);
  assert.equal(registry.locality.clean_command, 'cortex hardware clean');
  assert.equal(registry.policy.read_only, true);
  assert.equal(registry.policy.no_camera_activation, true);
  assert.equal(registry.policy.no_audio_recording, true);
  assert.equal(registry.policy.no_printing, true);
  assert.equal(registry.policy.no_volume_change, true);
  assert.equal(registry.host.platform, process.platform);
  assert.ok(Array.isArray(registry.capabilities));
  assert.ok(registry.capabilities.some((item) => item.capability_id === 'host_substrate_discovery'));

  const connectorRegistry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), 'utf8'));
  assert.ok(connectorRegistry.connectors.some((item) => item.connector_id === 'hardware_discovery'));

  const inventory = fs.readFileSync(inventoryPath, 'utf8');
  assert.match(inventory, /# Hardware Inventory/);
  assert.match(inventory, /Clean command: `cortex hardware clean`/);
});

test('hardware clean removes host-local and legacy hardware inventory folders', () => {
  const workspace = makeWorkspace();

  const bootstrap = runScript(workspace, 'hardware_bootstrap.js', ['--json']);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);

  const localHardwareDir = path.join(workspace, 'md-os/ops/local/hardware');
  const legacyHardwareDir = path.join(workspace, 'md-os/ops/hardware');
  fs.mkdirSync(legacyHardwareDir, { recursive: true });
  fs.writeFileSync(path.join(legacyHardwareDir, 'device_registry.json'), '{}\n', 'utf8');

  assert.ok(fs.existsSync(localHardwareDir));
  assert.ok(fs.existsSync(legacyHardwareDir));

  const clean = runScript(workspace, 'hardware_bootstrap.js', ['clean', '--json']);
  assert.equal(clean.status, 0, clean.stderr);
  const payload = jsonFromStdout(clean);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'hardware_clean');
  assert.equal(payload.canonical_output_dir, 'md-os/ops/local/hardware');
  assert.ok(payload.journal_scrub.removed_event_count >= 1);
  assert.ok(payload.refreshed_views.every((item) => item.ok));
  assert.ok(payload.removed_paths.includes('md-os/ops/local/hardware'));
  assert.ok(payload.removed_paths.includes('md-os/ops/hardware'));
  assert.ok(!fs.existsSync(localHardwareDir));
  assert.ok(!fs.existsSync(legacyHardwareDir));
});

test('hardware bootstrap can print boot screen without JSON payload', () => {
  const workspace = makeWorkspace();

  const result = runScript(workspace, 'hardware_bootstrap.js', ['bootstrap', '--no-json']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MD-OS \(Artificial Prefrontal Cortex\) v5\.0 Hardware Bootstrap/);
  assert.match(result.stdout, /\[DONE\] hardware substrate ready/);
  assert.doesNotMatch(result.stdout.trim().split('\n').at(-1), /^\{/);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/local/hardware/device_registry.json')));
});

test('cortex hardware bootstrap command is wired through the CLI', () => {
  const workspace = makeWorkspace();

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'md-os/os/mdos.js'),
    'hardware',
    'bootstrap',
    '--json',
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
  assert.equal(payload.mode, 'hardware_bootstrap');
  assert.equal(payload.locality.output_dir, 'md-os/ops/local/hardware');
});
