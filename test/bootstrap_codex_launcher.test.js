#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const LAUNCHER = path.join(REPO_ROOT, 'bootstrap-md-os-codex.sh');

function runLauncher(args = []) {
  const stubDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-codex-launcher-'));
  const stubPath = path.join(stubDir, 'codex');
  fs.writeFileSync(
    stubPath,
    '#!/usr/bin/env node\nprocess.stdout.write(`${JSON.stringify(process.argv.slice(2))}\\n`);\n',
    'utf8'
  );
  fs.chmodSync(stubPath, 0o755);

  try {
    const result = spawnSync('bash', [LAUNCHER, ...args], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        MDOS_SKIP_HARDWARE_BOOTSTRAP: '1',
        MDOS_SKIP_SOFTWARE_BOOTSTRAP: '1',
        MDOS_SKIP_RUNTIME_REFRESH: '1',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    return {
      args: JSON.parse(result.stdout.trim()),
      stderr: result.stderr,
    };
  } finally {
    fs.rmSync(stubDir, { recursive: true, force: true });
  }
}

test('Codex launcher is sandboxed and approval-gated by default', () => {
  const result = runLauncher();

  assert.deepEqual(result.args.slice(0, 4), [
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'on-request',
  ]);
  assert.doesNotMatch(result.args.join(' '), /dangerously-bypass-approvals-and-sandbox/);
  assert.match(result.stderr, /workspace-write sandbox with on-request approvals/);
});

test('Codex launcher enables elevated mode only with explicit --unsafe', () => {
  const result = runLauncher(['--unsafe']);

  assert.equal(result.args[0], '--dangerously-bypass-approvals-and-sandbox');
  assert.equal(result.args.includes('--unsafe'), false);
  assert.equal(result.args.includes('--sandbox'), false);
  assert.equal(result.args.includes('--ask-for-approval'), false);
  assert.match(result.stderr, /WARNING: --unsafe disables Codex approvals and sandboxing/);
});

test('Codex launcher normalizes Codex native bypass aliases into unsafe mode', () => {
  for (const bypassFlag of ['--dangerously-bypass-approvals-and-sandbox', '--yolo']) {
    const result = runLauncher([bypassFlag]);

    assert.equal(result.args[0], '--dangerously-bypass-approvals-and-sandbox');
    assert.equal(result.args.filter((arg) => arg === '--dangerously-bypass-approvals-and-sandbox').length, 1);
    assert.equal(result.args.includes('--yolo'), false);
    assert.match(result.stderr, /WARNING: --unsafe disables Codex approvals and sandboxing/);
  }
});

test('Codex launcher keeps resume on the safe default path', () => {
  const result = runLauncher(['resume']);

  assert.deepEqual(result.args.slice(0, 4), [
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'on-request',
  ]);
  assert.deepEqual(result.args.slice(-2), ['resume', '--last']);
});

test('Codex launcher initializes only an empty fresh runtime', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-fresh-workspace-'));
  const stubDir = path.join(workspace, 'bin');
  const opsDir = path.join(workspace, 'md-os', 'ops');
  const osDir = path.join(workspace, 'md-os', 'os');

  fs.mkdirSync(stubDir, { recursive: true });
  fs.mkdirSync(path.join(opsDir, 'releases'), { recursive: true });
  fs.mkdirSync(osDir, { recursive: true });
  fs.copyFileSync(LAUNCHER, path.join(workspace, 'bootstrap-md-os-codex.sh'));
  fs.writeFileSync(path.join(opsDir, '.gitkeep'), '', 'utf8');
  fs.writeFileSync(
    path.join(osDir, 'initialize_ops_memory.js'),
    [
      "'use strict';",
      "const fs = require('node:fs');",
      "const path = require('node:path');",
      "const ops = path.resolve(__dirname, '..', 'ops');",
      "fs.writeFileSync(path.join(ops, 'state.json'), '{}\\n');",
      "fs.writeFileSync(path.join(ops, 'current_task.md'), '# Current Task\\n');",
      "fs.writeFileSync(path.join(ops, 'journal.ndjson'), '');",
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(stubDir, 'codex'),
    '#!/usr/bin/env node\nprocess.stdout.write(`${JSON.stringify(process.argv.slice(2))}\\n`);\n',
    'utf8'
  );
  fs.chmodSync(path.join(stubDir, 'codex'), 0o755);

  try {
    const result = spawnSync('bash', [path.join(workspace, 'bootstrap-md-os-codex.sh')], {
      cwd: workspace,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${stubDir}:${process.env.PATH}`,
        MDOS_SKIP_HARDWARE_BOOTSTRAP: '1',
        MDOS_SKIP_SOFTWARE_BOOTSTRAP: '1',
        MDOS_SKIP_RUNTIME_REFRESH: '1',
      },
    });

    assert.equal(result.status, 0, result.stderr);
    assert.equal(fs.existsSync(path.join(opsDir, 'state.json')), true);
    assert.equal(fs.existsSync(path.join(opsDir, 'current_task.md')), true);
    assert.equal(fs.existsSync(path.join(opsDir, 'journal.ndjson')), true);
    assert.match(result.stderr, /Fresh local runtime state initialized/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
