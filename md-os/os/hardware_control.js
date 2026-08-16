#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const {
  appendLineWithLock,
  atomicWriteJsonLocked,
  ensureDir,
} = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const {
  DEVICE_REGISTRY_JSON,
  HARDWARE_DIR,
  hardwareBootstrap,
} = require('./hardware_bootstrap');

const CONNECTORS_DIR = path.join(MDOS_ROOT, 'ops', 'connectors');
const CONNECTOR_REGISTRY_FILE = path.join(CONNECTORS_DIR, 'connector_registry.json');
const ACTIONS_NDJSON = path.join(HARDWARE_DIR, 'actions.ndjson');
const SCREENSHOTS_DIR = path.join(HARDWARE_DIR, 'screenshots');
const DEFAULT_TIMEOUT_MS = 5000;

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function ensureHardwareControlRegistryEntry() {
  ensureDir(CONNECTORS_DIR);
  const registry = readJsonSafe(CONNECTOR_REGISTRY_FILE) || {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  };
  if (!Array.isArray(registry.connectors)) registry.connectors = [];
  const existing = registry.connectors.find((item) => item && item.connector_id === 'hardware_control');
  const entry = {
    connector_id: 'hardware_control',
    name: 'Hardware Control',
    kind: 'device',
    status: 'experimental',
    implemented: true,
    execution_mode: 'human_explicit_local_action',
    read_capabilities: ['audio_status', 'display_status', 'screen_capture_explicit', 'device_registry_read'],
    write_capabilities: ['audio_volume_set', 'audio_volume_step', 'audio_mute_toggle', 'display_brightness_set', 'display_output_enable'],
    notes: 'Explicit local hardware action connector. Uses host-exposed tools and writes host-local audit records.',
  };
  if (existing) {
    Object.assign(existing, entry);
  } else {
    registry.connectors.push(entry);
  }
  registry.updated_at = nowIso();
  atomicWriteJsonLocked(CONNECTOR_REGISTRY_FILE, registry, {
    context: 'hardware_control_registry_entry',
  });
  return entry;
}

function ensureDeviceRegistry() {
  if (!fs.existsSync(DEVICE_REGISTRY_JSON)) {
    hardwareBootstrap({ jsonOnly: true, printJsonPayload: false });
  }
  const registry = readJsonSafe(DEVICE_REGISTRY_JSON);
  if (!registry) throw new Error(`HARDWARE_REGISTRY_MISSING: ${rel(DEVICE_REGISTRY_JSON)}`);
  return registry;
}

function availableToolMap(registry) {
  const map = new Map();
  for (const item of registry.discovered_tools || []) {
    if (item && item.available && item.tool) map.set(item.tool, item.path || item.tool);
  }
  return map;
}

function selectAudioBackend(registry) {
  const tools = availableToolMap(registry);
  if (tools.has('pactl')) return { backend: 'pactl', command: tools.get('pactl') };
  if (tools.has('wpctl')) return { backend: 'wpctl', command: tools.get('wpctl') };
  if (tools.has('amixer')) return { backend: 'amixer', command: tools.get('amixer') };
  if (process.platform === 'darwin' && tools.has('osascript')) return { backend: 'osascript', command: tools.get('osascript') };
  throw new Error('NO_AUDIO_CONTROL_BACKEND: pactl/wpctl/amixer/osascript not available');
}

function selectDisplayBackend(registry) {
  const tools = availableToolMap(registry);
  if (tools.has('xrandr')) return { backend: 'xrandr', command: tools.get('xrandr') };
  if (tools.has('wlr-randr')) return { backend: 'wlr-randr', command: tools.get('wlr-randr') };
  throw new Error('NO_DISPLAY_CONTROL_BACKEND: xrandr/wlr-randr not available');
}

function selectScreenCaptureBackend(registry) {
  const tools = availableToolMap(registry);
  if (process.platform === 'darwin' && tools.has('screencapture')) return { backend: 'screencapture', command: tools.get('screencapture') };
  if (tools.has('gnome-screenshot')) return { backend: 'gnome-screenshot', command: tools.get('gnome-screenshot') };
  if (tools.has('spectacle')) return { backend: 'spectacle', command: tools.get('spectacle') };
  if (tools.has('grim')) return { backend: 'grim', command: tools.get('grim') };
  if (tools.has('scrot')) return { backend: 'scrot', command: tools.get('scrot') };
  if (tools.has('import')) return { backend: 'import', command: tools.get('import') };
  throw new Error('NO_SCREEN_CAPTURE_BACKEND: gnome-screenshot/spectacle/grim/scrot/import/screencapture not available');
}

function safeFilePart(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

function sha256File(filePath) {
  try {
    return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
  } catch (_) {
    return null;
  }
}

function parsePercent(value, { fallback = null, min = 0, max = 100 } = {}) {
  if (value === undefined || value === null || value === '') {
    if (fallback !== null) return fallback;
    throw new Error('PERCENT_REQUIRED');
  }
  const parsed = Number.parseInt(String(value).replace(/%$/, ''), 10);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new Error(`INVALID_PERCENT: ${value}`);
  }
  return parsed;
}

function runHostCommand(command, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const startedAt = Date.now();
  const result = spawnSync(command, args, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '',
      DISPLAY: process.env.DISPLAY || '',
      WAYLAND_DISPLAY: process.env.WAYLAND_DISPLAY || '',
      XDG_RUNTIME_DIR: process.env.XDG_RUNTIME_DIR || '',
      XDG_SESSION_TYPE: process.env.XDG_SESSION_TYPE || '',
      DBUS_SESSION_BUS_ADDRESS: process.env.DBUS_SESSION_BUS_ADDRESS || '',
    },
    timeout: timeoutMs,
    maxBuffer: 128000,
  });
  const status = Number.isInteger(result.status) ? result.status : null;
  const stdout = shortText(result.stdout || '').slice(0, 1000);
  const stderr = shortText(result.stderr || result.error && result.error.message || '').slice(0, 1000);
  return {
    ok: status === 0 && !result.error,
    status,
    duration_ms: Date.now() - startedAt,
    argv: [command, ...args],
    stdout,
    stderr,
  };
}

function audioCommand(backend, action, value) {
  if (backend === 'pactl') {
    if (action === 'status_volume') return ['get-sink-volume', '@DEFAULT_SINK@'];
    if (action === 'status_mute') return ['get-sink-mute', '@DEFAULT_SINK@'];
    if (action === 'volume_up') return ['set-sink-volume', '@DEFAULT_SINK@', `+${value}%`];
    if (action === 'volume_down') return ['set-sink-volume', '@DEFAULT_SINK@', `-${value}%`];
    if (action === 'volume_set') return ['set-sink-volume', '@DEFAULT_SINK@', `${value}%`];
    if (action === 'mute') return ['set-sink-mute', '@DEFAULT_SINK@', '1'];
    if (action === 'unmute') return ['set-sink-mute', '@DEFAULT_SINK@', '0'];
    if (action === 'toggle_mute') return ['set-sink-mute', '@DEFAULT_SINK@', 'toggle'];
  }
  if (backend === 'wpctl') {
    if (action === 'status_volume' || action === 'status_mute') return ['get-volume', '@DEFAULT_AUDIO_SINK@'];
    if (action === 'volume_up') return ['set-volume', '@DEFAULT_AUDIO_SINK@', `${value}%+`];
    if (action === 'volume_down') return ['set-volume', '@DEFAULT_AUDIO_SINK@', `${value}%-`];
    if (action === 'volume_set') return ['set-volume', '@DEFAULT_AUDIO_SINK@', `${value}%`];
    if (action === 'mute') return ['set-mute', '@DEFAULT_AUDIO_SINK@', '1'];
    if (action === 'unmute') return ['set-mute', '@DEFAULT_AUDIO_SINK@', '0'];
    if (action === 'toggle_mute') return ['set-mute', '@DEFAULT_AUDIO_SINK@', 'toggle'];
  }
  if (backend === 'amixer') {
    if (action === 'status_volume' || action === 'status_mute') return ['get', 'Master'];
    if (action === 'volume_up') return ['set', 'Master', `${value}%+`];
    if (action === 'volume_down') return ['set', 'Master', `${value}%-`];
    if (action === 'volume_set') return ['set', 'Master', `${value}%`];
    if (action === 'mute') return ['set', 'Master', 'mute'];
    if (action === 'unmute') return ['set', 'Master', 'unmute'];
    if (action === 'toggle_mute') return ['set', 'Master', 'toggle'];
  }
  if (backend === 'osascript') {
    if (action === 'status_volume' || action === 'status_mute') return ['-e', 'output volume of (get volume settings)'];
    if (action === 'volume_set') return ['-e', `set volume output volume ${value}`];
    if (action === 'mute') return ['-e', 'set volume with output muted'];
    if (action === 'unmute') return ['-e', 'set volume without output muted'];
  }
  throw new Error(`UNSUPPORTED_AUDIO_ACTION_FOR_BACKEND: ${backend}:${action}`);
}

function normalizeAudioArgs(args) {
  const [first, second, third] = args;
  if (!first || first === 'status') return { action: 'status', value: null, intent: 'audio status' };
  if (first === 'volume') {
    if (second === 'up') return { action: 'volume_up', value: parsePercent(third, { fallback: 5, min: 1, max: 25 }), intent: `audio volume up ${third || 5}%` };
    if (second === 'down') return { action: 'volume_down', value: parsePercent(third, { fallback: 5, min: 1, max: 25 }), intent: `audio volume down ${third || 5}%` };
    if (second === 'set') return { action: 'volume_set', value: parsePercent(third), intent: `audio volume set ${third}%` };
    if (second === 'zero') return { action: 'volume_set', value: 0, intent: 'audio volume zero' };
    if (second === 'mute') return { action: 'mute', value: null, intent: 'audio mute' };
    if (second === 'unmute') return { action: 'unmute', value: null, intent: 'audio unmute' };
    if (second === 'toggle') return { action: 'toggle_mute', value: null, intent: 'audio toggle mute' };
  }
  if (first === 'up') return { action: 'volume_up', value: parsePercent(second, { fallback: 5, min: 1, max: 25 }), intent: `audio volume up ${second || 5}%` };
  if (first === 'down') return { action: 'volume_down', value: parsePercent(second, { fallback: 5, min: 1, max: 25 }), intent: `audio volume down ${second || 5}%` };
  if (first === 'set') return { action: 'volume_set', value: parsePercent(second), intent: `audio volume set ${second}%` };
  if (first === 'zero') return { action: 'volume_set', value: 0, intent: 'audio volume zero' };
  if (first === 'mute') return { action: 'mute', value: null, intent: 'audio mute' };
  if (first === 'unmute') return { action: 'unmute', value: null, intent: 'audio unmute' };
  if (first === 'toggle') return { action: 'toggle_mute', value: null, intent: 'audio toggle mute' };
  throw new Error(`UNKNOWN_AUDIO_ACTION: ${args.join(' ')}`);
}

function recordHardwareAction(entry) {
  ensureDir(HARDWARE_DIR);
  const payload = {
    schema_version: 1,
    acted_at: nowIso(),
    connector_id: 'hardware_control',
    ...entry,
  };
  appendLineWithLock(ACTIONS_NDJSON, `${JSON.stringify(payload)}\n`, {
    lockName: 'hardware_actions_append',
    context: 'hardware_control_action',
  });
  appendJournal({
    event: 'hardware_control_completed',
    category: payload.category,
    action: payload.action,
    ok: payload.ok,
    action_log: rel(ACTIONS_NDJSON),
  });
  return payload;
}

function runAudioAction(args, options = {}) {
  const registry = ensureDeviceRegistry();
  const connectorEntry = ensureHardwareControlRegistryEntry();
  const backend = selectAudioBackend(registry);
  const normalized = normalizeAudioArgs(args);
  const results = [];

  if (normalized.action === 'status') {
    results.push(runHostCommand(backend.command, audioCommand(backend.backend, 'status_volume')));
    if (backend.backend === 'pactl') {
      results.push(runHostCommand(backend.command, audioCommand(backend.backend, 'status_mute')));
    }
  } else {
    results.push(runHostCommand(backend.command, audioCommand(backend.backend, normalized.action, normalized.value)));
  }

  const ok = results.every((item) => item.ok);
  const actionRecord = recordHardwareAction({
    category: 'audio',
    action: normalized.action,
    requested_value: normalized.value,
    requested_intent: shortText(options.intent || normalized.intent),
    policy: normalized.action === 'status' ? 'read_only' : 'explicit_reversible_local_action',
    selected_backend: backend.backend,
    connector_entry: connectorEntry.connector_id,
    commands: results.map((item) => ({
      argv: item.argv,
      status: item.status,
      ok: item.ok,
      duration_ms: item.duration_ms,
      stdout: item.stdout,
      stderr: item.stderr,
    })),
    ok,
    result_hash: sha256Json(results),
  });

  const payload = {
    ok,
    mode: 'hardware_control',
    category: 'audio',
    action: normalized.action,
    requested_value: normalized.value,
    selected_backend: backend.backend,
    action_log: rel(ACTIONS_NDJSON),
    action_hash: sha256Json(actionRecord),
    results,
  };
  printJson(payload);
  if (!ok) process.exitCode = 1;
  return payload;
}

function parseDisplayOutput(value) {
  const output = shortText(value);
  if (!output || output.startsWith('--')) return null;
  if (!/^[A-Za-z0-9_.:-]{1,80}$/.test(output)) throw new Error(`INVALID_DISPLAY_OUTPUT: ${output}`);
  return output;
}

function firstConnectedDisplayOutput(statusText) {
  for (const line of String(statusText || '').split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_.:-]+)\s+connected\b/);
    if (match) return match[1];
  }
  return null;
}

function displayStatusCommand(backend) {
  if (backend === 'xrandr') return ['--query'];
  if (backend === 'wlr-randr') return [];
  throw new Error(`UNSUPPORTED_DISPLAY_STATUS_BACKEND: ${backend}`);
}

function displayMutationCommand(backend, action, output, value) {
  if (backend !== 'xrandr') {
    throw new Error(`DISPLAY_MUTATION_BACKEND_NOT_SUPPORTED: ${backend}`);
  }
  if (action === 'brightness_set') return ['--output', output, '--brightness', (value / 100).toFixed(2)];
  if (action === 'enable') return ['--output', output, '--auto'];
  if (action === 'disable') return ['--output', output, '--off'];
  throw new Error(`UNSUPPORTED_DISPLAY_ACTION: ${action}`);
}

function normalizeDisplayArgs(args) {
  const [first, second, third, fourth] = args;
  if (!first || first === 'status') return { action: 'status', value: null, output: null, intent: 'display status' };
  if (first === 'brightness' && second === 'set') {
    return {
      action: 'brightness_set',
      value: parsePercent(third),
      output: parseDisplayOutput(fourth),
      intent: `display brightness set ${third}%`,
    };
  }
  if (first === 'enable') {
    return { action: 'enable', value: null, output: parseDisplayOutput(second), intent: `display enable ${second || ''}` };
  }
  if (first === 'disable') {
    const confirmed = args.includes('--confirm-disable');
    if (!confirmed) throw new Error('DISPLAY_DISABLE_REQUIRES_FLAG: --confirm-disable');
    return { action: 'disable', value: null, output: parseDisplayOutput(second), intent: `display disable ${second || ''}` };
  }
  throw new Error(`UNKNOWN_DISPLAY_ACTION: ${args.join(' ')}`);
}

function runDisplayAction(args, options = {}) {
  const registry = ensureDeviceRegistry();
  const connectorEntry = ensureHardwareControlRegistryEntry();
  const backend = selectDisplayBackend(registry);
  const normalized = normalizeDisplayArgs(args);
  const results = [];

  const statusResult = runHostCommand(backend.command, displayStatusCommand(backend.backend));
  results.push(statusResult);

  let selectedOutput = normalized.output;
  if (normalized.action !== 'status') {
    selectedOutput = selectedOutput || firstConnectedDisplayOutput(statusResult.stdout);
    if (!selectedOutput) throw new Error('DISPLAY_OUTPUT_REQUIRED');
    results.push(runHostCommand(backend.command, displayMutationCommand(backend.backend, normalized.action, selectedOutput, normalized.value)));
  }

  const ok = results.every((item) => item.ok);
  const actionRecord = recordHardwareAction({
    category: 'display',
    action: normalized.action,
    requested_value: normalized.value,
    requested_intent: shortText(options.intent || normalized.intent),
    selected_output: selectedOutput,
    policy: normalized.action === 'status' ? 'read_only' : 'explicit_local_display_action',
    selected_backend: backend.backend,
    connector_entry: connectorEntry.connector_id,
    commands: results.map((item) => ({
      argv: item.argv,
      status: item.status,
      ok: item.ok,
      duration_ms: item.duration_ms,
      stdout: item.stdout,
      stderr: item.stderr,
    })),
    ok,
    result_hash: sha256Json(results),
  });

  const payload = {
    ok,
    mode: 'hardware_control',
    category: 'display',
    action: normalized.action,
    requested_value: normalized.value,
    selected_output: selectedOutput,
    selected_backend: backend.backend,
    action_log: rel(ACTIONS_NDJSON),
    action_hash: sha256Json(actionRecord),
    results,
  };
  printJson(payload);
  if (!ok) process.exitCode = 1;
  return payload;
}

function screenCaptureArgs(backend, outputFile) {
  if (backend === 'gnome-screenshot') return ['-f', outputFile];
  if (backend === 'spectacle') return ['-b', '-n', '-o', outputFile];
  if (backend === 'grim') return [outputFile];
  if (backend === 'scrot') return [outputFile];
  if (backend === 'import') return ['-window', 'root', outputFile];
  if (backend === 'screencapture') return ['-x', outputFile];
  throw new Error(`UNSUPPORTED_SCREEN_CAPTURE_BACKEND: ${backend}`);
}

function runScreenAction(args, options = {}) {
  const [first] = args;
  if (first && !['capture', 'look', 'status'].includes(first)) throw new Error(`UNKNOWN_SCREEN_ACTION: ${args.join(' ')}`);
  if (first === 'status') return runDisplayAction(['status'], options);

  const registry = ensureDeviceRegistry();
  const connectorEntry = ensureHardwareControlRegistryEntry();
  const backend = selectScreenCaptureBackend(registry);
  ensureDir(SCREENSHOTS_DIR);
  const stamp = nowIso().replace(/[:.]/g, '-');
  const fileName = `${stamp}__${safeFilePart(options.intent || 'desktop')}.png`;
  const screenshotPath = path.join(SCREENSHOTS_DIR, fileName);
  const result = runHostCommand(backend.command, screenCaptureArgs(backend.backend, screenshotPath), 10000);
  const screenshotExists = fs.existsSync(screenshotPath);
  const ok = result.ok && screenshotExists;
  const screenshotHash = sha256File(screenshotPath);
  const actionRecord = recordHardwareAction({
    category: 'screen',
    action: 'screen_capture',
    requested_value: null,
    requested_intent: shortText(options.intent || 'screen capture'),
    policy: 'explicit_screen_capture',
    selected_backend: backend.backend,
    connector_entry: connectorEntry.connector_id,
    artifact_file: screenshotExists ? rel(screenshotPath) : null,
    artifact_sha256: screenshotHash,
    commands: [{
      argv: result.argv,
      status: result.status,
      ok: result.ok,
      duration_ms: result.duration_ms,
      stdout: result.stdout,
      stderr: result.stderr,
    }],
    ok,
    result_hash: sha256Json({ result, screenshotHash }),
  });

  const payload = {
    ok,
    mode: 'hardware_control',
    category: 'screen',
    action: 'screen_capture',
    selected_backend: backend.backend,
    screenshot_file: screenshotExists ? rel(screenshotPath) : null,
    screenshot_sha256: screenshotHash,
    action_log: rel(ACTIONS_NDJSON),
    action_hash: sha256Json(actionRecord),
    result,
  };
  printJson(payload);
  if (!ok) process.exitCode = 1;
  return payload;
}

function runNaturalIntent(intent) {
  const text = shortText(intent).toLowerCase();
  if (!text) throw new Error('INTENT_REQUIRED');
  if (/(guarda|vedi|osserva|capture|screenshot|screen|desktop|schermo).*(desktop|schermo|screen|monitor)|(?:desktop|schermo|screen|monitor).*(guarda|vedi|osserva|capture|screenshot)/.test(text)) {
    return runScreenAction(['capture'], { intent });
  }
  if (/(stato|status|lista|list).*(monitor|display|schermo)|(?:monitor|display|schermo).*(stato|status|lista|list)/.test(text)) {
    return runDisplayAction(['status'], { intent });
  }
  if (/(luminosita|brightness).*(monitor|display|schermo)|(?:monitor|display|schermo).*(luminosita|brightness)/.test(text)) {
    const match = text.match(/([0-9]{1,3})\s*%?/);
    if (!match) throw new Error(`DISPLAY_BRIGHTNESS_PERCENT_REQUIRED: ${intent}`);
    return runDisplayAction(['brightness', 'set', match[1]], { intent });
  }
  if (/(azzera|zero|set.*0).*(volume|audio)|(?:volume|audio).*(azzera|zero|set.*0)/.test(text)) {
    return runAudioAction(['volume', 'set', '0'], { intent });
  }
  if (/(alza|aumenta|raise|increase|up).*(volume|audio)|(?:volume|audio).*(up|increase)/.test(text)) {
    return runAudioAction(['volume', 'up'], { intent });
  }
  if (/(abbassa|diminuisci|lower|decrease|down).*(volume|audio)|(?:volume|audio).*(down|decrease)/.test(text)) {
    return runAudioAction(['volume', 'down'], { intent });
  }
  if (/(riattiva|attiva|unmute).*(audio|volume)|(?:audio|volume).*(unmute|on)/.test(text)) {
    return runAudioAction(['unmute'], { intent });
  }
  if (/(muta|mute|silenzia|spegni).*(audio|volume)|(?:audio|volume).*(mute|off)/.test(text)) {
    return runAudioAction(['mute'], { intent });
  }
  throw new Error(`UNSUPPORTED_HARDWARE_INTENT: ${intent}`);
}

function listCapabilities() {
  const registry = ensureDeviceRegistry();
  ensureHardwareControlRegistryEntry();
  const audio = (() => {
    try {
      const backend = selectAudioBackend(registry);
      return {
        available: true,
        backend: backend.backend,
      };
    } catch (error) {
      return {
        available: false,
        reason: error.message,
      };
    }
  })();
  const display = (() => {
    try {
      const backend = selectDisplayBackend(registry);
      return {
        available: true,
        backend: backend.backend,
      };
    } catch (error) {
      return {
        available: false,
        reason: error.message,
      };
    }
  })();
  const screen = (() => {
    try {
      const backend = selectScreenCaptureBackend(registry);
      return {
        available: true,
        backend: backend.backend,
      };
    } catch (error) {
      return {
        available: false,
        reason: error.message,
      };
    }
  })();
  printJson({
    ok: true,
    mode: 'hardware_control_list',
    action_log: rel(ACTIONS_NDJSON),
    capabilities: [
      {
        category: 'audio',
        available: audio.available,
        backend: audio.backend || null,
        actions: ['status', 'volume up', 'volume down', 'volume set', 'volume zero', 'mute', 'unmute', 'toggle'],
        policy: 'explicit_reversible_local_action',
      },
      {
        category: 'display',
        available: display.available,
        backend: display.backend || null,
        actions: ['status', 'brightness set', 'enable', 'disable --confirm-disable'],
        policy: 'explicit_local_display_action',
      },
      {
        category: 'screen',
        available: screen.available,
        backend: screen.backend || null,
        actions: ['capture', 'look'],
        policy: 'explicit_screen_capture',
      },
    ],
    unavailable: [
      audio.available ? null : { category: 'audio', reason: audio.reason },
      display.available ? null : { category: 'display', reason: display.reason },
      screen.available ? null : { category: 'screen', reason: screen.reason },
    ].filter(Boolean),
  });
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/hardware_control.js list',
    '  node md-os/os/hardware_control.js audio status',
    '  node md-os/os/hardware_control.js audio volume up [step_percent]',
    '  node md-os/os/hardware_control.js audio volume down [step_percent]',
    '  node md-os/os/hardware_control.js audio volume set <percent>',
    '  node md-os/os/hardware_control.js audio volume zero',
    '  node md-os/os/hardware_control.js audio mute|unmute|toggle',
    '  node md-os/os/hardware_control.js display status',
    '  node md-os/os/hardware_control.js display brightness set <percent> [output]',
    '  node md-os/os/hardware_control.js display enable [output]',
    '  node md-os/os/hardware_control.js display disable <output> --confirm-disable',
    '  node md-os/os/hardware_control.js screen capture',
    '  node md-os/os/hardware_control.js run <natural_language_intent>',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (!command) usage();
    if (command === 'list') {
      listCapabilities();
      return;
    }
    if (command === 'audio') {
      runAudioAction(rest);
      return;
    }
    if (command === 'display' || command === 'monitor') {
      runDisplayAction(rest);
      return;
    }
    if (command === 'screen' || command === 'desktop') {
      runScreenAction(rest);
      return;
    }
    if (command === 'run') {
      runNaturalIntent(rest.join(' '));
      return;
    }
    usage();
  } catch (error) {
    process.stderr.write(`${error && error.message || error}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  ACTIONS_NDJSON,
  normalizeAudioArgs,
  normalizeDisplayArgs,
  runAudioAction,
  runDisplayAction,
  runNaturalIntent,
  runScreenAction,
};
