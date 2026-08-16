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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-wolfram-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeFakeWolframscript(workspace) {
  const fakeBin = path.join(workspace, 'fakebin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const executable = path.join(fakeBin, 'wolframscript');
  fs.writeFileSync(executable, [
    `#!${process.execPath}`,
    "'use strict';",
    "const fs = require('node:fs');",
    "const args = process.argv.slice(2);",
    "if (args.includes('-version')) { console.log('WolframScript 14.0 test double'); process.exit(0); }",
    "if (args.includes('-file')) { const file = args[args.indexOf('-file') + 1]; const source = fs.readFileSync(file, 'utf8'); console.log(source.includes('2 + 2 == 4') ? 'True' : 'False'); process.exit(0); }",
    "if (args.includes('-code')) { const code = args[args.indexOf('-code') + 1]; console.log(code.includes('D[x^2, x]') ? 'True' : code); process.exit(0); }",
    "console.error('unexpected arguments: ' + args.join(' '));",
    'process.exit(2);',
    '',
  ].join('\n'), 'utf8');
  fs.chmodSync(executable, 0o755);
  return fakeBin;
}

function baseProfile(calculations) {
  return {
    schema_version: 1,
    connector_id: 'wolfram_connector',
    engine_argv: ['wolframscript', '-local'],
    default_timeout_ms: 5000,
    max_source_bytes: 20000,
    max_output_bytes: 20000,
    allowed_script_roots: [
      'md-os/ops/local/wolfram',
      'md-os/ops/calculations/wolfram/scripts',
    ],
    calculation_registry_dir: 'md-os/ops/calculations/wolfram',
    calculations,
  };
}

function runConnector(workspace, args, extraEnv = {}) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/wolfram_connector.js'), ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
      ...extraEnv,
    },
  });
}

test('wolfram connector lists registered inline and script-backed calculations', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/wolfram_connector.json'), baseProfile([{
    calculation_id: 'inline_gate',
    wolfram_code: 'FullSimplify[2 + 2 == 4]',
    summary: 'Inline arithmetic gate.',
    epistemic_status: 'derived',
  }]));
  writeJson(path.join(workspace, 'md-os/ops/calculations/wolfram/script_gate.json'), {
    schema_version: 1,
    calculation_id: 'script_gate',
    script_path: 'md-os/ops/calculations/wolfram/scripts/script_gate.wl',
    summary: 'Script arithmetic gate.',
    epistemic_status: 'conditional',
  });

  const result = runConnector(workspace, ['list']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.calculation_count, 2);
  assert.deepEqual(payload.calculations.map((item) => item.calculation_id), ['inline_gate', 'script_gate']);
});

test('wolfram connector executes an allowlisted script and emits hashed readback', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeWolframscript(workspace);
  const scriptPath = path.join(workspace, 'md-os/ops/calculations/wolfram/scripts/test_gate.wl');
  fs.mkdirSync(path.dirname(scriptPath), { recursive: true });
  fs.writeFileSync(scriptPath, 'FullSimplify[2 + 2 == 4]\n', 'utf8');
  writeJson(path.join(workspace, 'md-os/ops/connectors/wolfram_connector.json'), baseProfile([{
    calculation_id: 'test_gate',
    script_path: 'md-os/ops/calculations/wolfram/scripts/test_gate.wl',
    summary: 'Run a fake script-backed Wolfram gate.',
    epistemic_status: 'derived',
    expected_gates: ['testGate'],
  }]));

  const result = runConnector(workspace, ['run', 'demo_project', 'test_gate'], {
    PATH: `${fakeBin}:${process.env.PATH || ''}`,
  });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  const snapshot = JSON.parse(fs.readFileSync(path.join(workspace, payload.snapshot_file), 'utf8'));
  const runtime = snapshot.signals[0].connector_runtime;
  assert.equal(snapshot.connector_kind, 'mathematics');
  assert.equal(runtime.ok, true);
  assert.equal(runtime.source_mode, 'script_path');
  assert.equal(runtime.epistemic_status, 'derived');
  assert.match(runtime.source_sha256, /^[a-f0-9]{64}$/);
  assert.match(runtime.output_sha256, /^[a-f0-9]{64}$/);
  assert.match(fs.readFileSync(path.join(workspace, payload.artifact_file), 'utf8'), /--- STDOUT ---\nTrue/);
});

test('wolfram connector refuses an engine executable other than wolframscript', () => {
  const workspace = makeWorkspace();
  const profile = baseProfile([{
    calculation_id: 'unsafe_engine',
    wolfram_code: '2 + 2',
    summary: 'Must not execute through another binary.',
    epistemic_status: 'open',
  }]);
  profile.engine_argv = ['node'];
  writeJson(path.join(workspace, 'md-os/ops/connectors/wolfram_connector.json'), profile);

  const result = runConnector(workspace, ['run', 'demo_project', 'unsafe_engine']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WOLFRAM_EXECUTABLE_NOT_ALLOWED/);
});

test('wolfram connector refuses external I/O primitives in calculation source', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeWolframscript(workspace);
  writeJson(path.join(workspace, 'md-os/ops/connectors/wolfram_connector.json'), baseProfile([{
    calculation_id: 'unsafe_io',
    wolfram_code: 'RunProcess[{"sh", "-c", "echo unsafe"}]',
    summary: 'Must be rejected before kernel execution.',
    epistemic_status: 'open',
  }]));

  const result = runConnector(workspace, ['run', 'demo_project', 'unsafe_io'], {
    PATH: `${fakeBin}:${process.env.PATH || ''}`,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /WOLFRAM_EXTERNAL_IO_FORBIDDEN/);
  assert.equal(fs.existsSync(path.join(workspace, 'md-os/ops/artifacts/wolfram')), false);
});

test('wolfram bootstrap registers availability and runs the symbolic smoke gate', () => {
  const workspace = makeWorkspace();
  const fakeBin = writeFakeWolframscript(workspace);
  const result = runConnector(workspace, ['bootstrap'], {
    PATH: `${fakeBin}:${process.env.PATH || ''}`,
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.availability.available, true);
  assert.equal(payload.smoke_run.ok, true);
  const registry = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), 'utf8'));
  const connector = registry.connectors.find((item) => item.connector_id === 'wolfram_connector');
  assert.equal(connector.status, 'ready');
  assert.deepEqual(connector.allowed_commands, ['wolframscript']);
  assert.ok(fs.existsSync(path.join(workspace, payload.availability_snapshot_file)));
});
