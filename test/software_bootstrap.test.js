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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-software-'));
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

test('software bootstrap writes read-only application and service views', () => {
  const workspace = makeWorkspace();

  const result = runScript(workspace, 'software_bootstrap.js', ['--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'software_bootstrap');
  assert.equal(payload.read_only, true);

  const softwareDir = path.join(workspace, 'md-os/ops/local/software');
  const registryPath = path.join(softwareDir, 'software_registry.json');
  const applicationsJsonPath = path.join(softwareDir, 'applications.json');
  const servicesJsonPath = path.join(softwareDir, 'services.json');
  const applicationsPath = path.join(softwareDir, 'applications.md');
  const servicesPath = path.join(softwareDir, 'services.md');
  const capabilitiesPath = path.join(softwareDir, 'capabilities.md');
  const reportPath = path.join(softwareDir, 'bootstrap_report.md');
  const observationsPath = path.join(softwareDir, 'observations.ndjson');

  assert.ok(fs.existsSync(registryPath));
  assert.ok(fs.existsSync(applicationsJsonPath));
  assert.ok(fs.existsSync(servicesJsonPath));
  assert.ok(fs.existsSync(applicationsPath));
  assert.ok(fs.existsSync(servicesPath));
  assert.ok(fs.existsSync(capabilitiesPath));
  assert.ok(fs.existsSync(reportPath));
  assert.ok(fs.existsSync(observationsPath));

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(registry.schema_version, 1);
  assert.equal(registry.mode, 'software_bootstrap_read_only');
  assert.equal(registry.locality.scope, 'host_local');
  assert.equal(registry.locality.portable, false);
  assert.equal(registry.locality.clean_command, 'cortex software clean');
  assert.equal(registry.policy.read_only, true);
  assert.equal(registry.policy.no_application_launch, true);
  assert.equal(registry.policy.no_service_start, true);
  assert.equal(registry.policy.no_service_stop, true);
  assert.equal(registry.policy.no_service_restart, true);
  assert.equal(registry.policy.no_package_install, true);
  assert.equal(registry.host.platform, process.platform);
  assert.ok(Array.isArray(registry.applications));
  assert.ok(Array.isArray(registry.services));
  assert.ok(Array.isArray(registry.capabilities));
  assert.ok(registry.capabilities.some((item) => item.capability_id === 'software_substrate_discovery'));

  const connectorRegistry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), 'utf8'));
  assert.ok(connectorRegistry.connectors.some((item) => item.connector_id === 'software_discovery'));

  const applications = fs.readFileSync(applicationsPath, 'utf8');
  assert.match(applications, /# Software Applications/);
  assert.match(applications, /Clean command: `cortex software clean`/);

  const services = fs.readFileSync(servicesPath, 'utf8');
  assert.match(services, /# Software Services/);
  assert.match(services, /services were not started/);
});

test('software clean removes host-local and legacy software inventory folders', () => {
  const workspace = makeWorkspace();

  const bootstrap = runScript(workspace, 'software_bootstrap.js', ['--json']);
  assert.equal(bootstrap.status, 0, bootstrap.stderr);

  const localSoftwareDir = path.join(workspace, 'md-os/ops/local/software');
  const legacySoftwareDir = path.join(workspace, 'md-os/ops/software');
  fs.mkdirSync(legacySoftwareDir, { recursive: true });
  fs.writeFileSync(path.join(legacySoftwareDir, 'software_registry.json'), '{}\n', 'utf8');

  assert.ok(fs.existsSync(localSoftwareDir));
  assert.ok(fs.existsSync(legacySoftwareDir));

  const clean = runScript(workspace, 'software_bootstrap.js', ['clean', '--json']);
  assert.equal(clean.status, 0, clean.stderr);
  const payload = jsonFromStdout(clean);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'software_clean');
  assert.equal(payload.canonical_output_dir, 'md-os/ops/local/software');
  assert.ok(payload.journal_scrub.removed_event_count >= 1);
  assert.ok(payload.refreshed_views.every((item) => item.ok));
  assert.ok(payload.removed_paths.includes('md-os/ops/local/software'));
  assert.ok(payload.removed_paths.includes('md-os/ops/software'));
  assert.ok(!fs.existsSync(localSoftwareDir));
  assert.ok(!fs.existsSync(legacySoftwareDir));
});

test('software bootstrap can print boot screen without JSON payload', () => {
  const workspace = makeWorkspace();

  const result = runScript(workspace, 'software_bootstrap.js', ['bootstrap', '--no-json']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /MD-OS \(Artificial Prefrontal Cortex\) v5\.0 Software Bootstrap/);
  assert.match(result.stdout, /\[DONE\] software substrate ready/);
  assert.doesNotMatch(result.stdout.trim().split('\n').at(-1), /^\{/);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/local/software/software_registry.json')));
});

test('cortex software bootstrap command is wired through the CLI', () => {
  const workspace = makeWorkspace();

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'md-os/os/mdos.js'),
    'software',
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
  assert.equal(payload.mode, 'software_bootstrap');
  assert.equal(payload.locality.output_dir, 'md-os/ops/local/software');
});
