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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-control-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function makeBin(workspace, name, body) {
  const binDir = path.join(workspace, 'bin');
  fs.mkdirSync(binDir, { recursive: true });
  const filePath = path.join(binDir, name);
  fs.writeFileSync(filePath, body, 'utf8');
  fs.chmodSync(filePath, 0o755);
  return binDir;
}

function runControl(workspace, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/hardware_control.js'), ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
      PATH: `${path.join(workspace, 'bin')}:${process.env.PATH || ''}`,
    },
  });
}

function jsonFromStdout(result) {
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

function seedRegistry(workspace, tools) {
  writeJson(path.join(workspace, 'md-os/ops/local/hardware/device_registry.json'), {
    schema_version: 1,
    updated_at: '2026-04-25T00:00:00Z',
    mode: 'hardware_bootstrap_read_only',
    locality: {
      scope: 'host_local',
      portable: false,
      output_dir: 'md-os/ops/local/hardware',
      clean_command: 'cortex hardware clean',
    },
    discovered_tools: tools.map((tool) => ({
      tool,
      category: tool === 'pactl' ? 'audio' : 'display',
      available: true,
      path: path.join(workspace, 'bin', tool),
    })),
    capabilities: [],
    devices: [],
  });
}

test('hardware control runs explicit audio volume action and logs it locally', () => {
  const workspace = makeWorkspace();
  makeBin(workspace, 'pactl', '#!/usr/bin/env bash\necho "$@" >> "$PWD/pactl.log"\n');
  seedRegistry(workspace, ['pactl']);

  const result = runControl(workspace, ['audio', 'volume', 'set', '12']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.ok, true);
  assert.equal(payload.category, 'audio');
  assert.equal(payload.action, 'volume_set');
  assert.equal(payload.requested_value, 12);
  assert.match(fs.readFileSync(path.join(workspace, 'pactl.log'), 'utf8'), /set-sink-volume @DEFAULT_SINK@ 12%/);

  const actions = fs.readFileSync(path.join(workspace, 'md-os/ops/local/hardware/actions.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(actions.at(-1).category, 'audio');
  assert.equal(actions.at(-1).policy, 'explicit_reversible_local_action');
});

test('hardware control captures desktop artifact through explicit screen command', () => {
  const workspace = makeWorkspace();
  makeBin(workspace, 'gnome-screenshot', '#!/usr/bin/env bash\nwhile [[ "$1" != "" ]]; do if [[ "$1" == "-f" ]]; then shift; printf "png" > "$1"; exit 0; fi; shift; done\nexit 2\n');
  seedRegistry(workspace, ['gnome-screenshot']);

  const result = runControl(workspace, ['screen', 'capture']);
  assert.equal(result.status, 0, result.stderr);
  const payload = jsonFromStdout(result);

  assert.equal(payload.ok, true);
  assert.equal(payload.category, 'screen');
  assert.equal(payload.action, 'screen_capture');
  assert.match(payload.screenshot_file, /^md-os\/ops\/local\/hardware\/screenshots\/.+\.png$/);
  assert.ok(fs.existsSync(path.join(workspace, payload.screenshot_file)));
});

test('hardware control requires explicit flag before disabling display output', () => {
  const workspace = makeWorkspace();
  makeBin(workspace, 'xrandr', '#!/usr/bin/env bash\nif [[ "$1" == "--query" ]]; then echo "HDMI-1 connected primary"; exit 0; fi\necho "$@" >> "$PWD/xrandr.log"\n');
  seedRegistry(workspace, ['xrandr']);

  const blocked = runControl(workspace, ['display', 'disable', 'HDMI-1']);
  assert.notEqual(blocked.status, 0);
  assert.match(blocked.stderr, /DISPLAY_DISABLE_REQUIRES_FLAG/);

  const allowed = runControl(workspace, ['display', 'disable', 'HDMI-1', '--confirm-disable']);
  assert.equal(allowed.status, 0, allowed.stderr);
  const payload = jsonFromStdout(allowed);
  assert.equal(payload.ok, true);
  assert.equal(payload.category, 'display');
  assert.equal(payload.action, 'disable');
  assert.match(fs.readFileSync(path.join(workspace, 'xrandr.log'), 'utf8'), /--output HDMI-1 --off/);
});
