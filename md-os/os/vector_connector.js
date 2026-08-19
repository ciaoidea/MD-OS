#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { MDOS_ROOT, nowIso, printJson, shortText } = require('./lib/common');

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'vector_connector.json');
const MOTIONS = new Set(['forward', 'backward', 'left', 'right', 'head-up', 'head-down', 'lift-up', 'lift-down', 'stop']);
const VALUELESS_MOTIONS = new Set(['head-up', 'head-down', 'lift-up', 'lift-down', 'stop']);
const EMOTIONS = new Set(['happy', 'negative']);

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  node md-os/os/vector_connector.js status|probe|animations|camera\n' +
    '  node md-os/os/vector_connector.js say <text> --approve-speech\n' +
    '  node md-os/os/vector_connector.js emotion <happy|negative> --approve-expression\n' +
    '  node md-os/os/vector_connector.js move <action> [value] --approve-motion [--confirm-workspace-clear]\n'
  );
  process.exit(64);
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) throw new Error('VECTOR_CONNECTOR_PROFILE_MISSING');
  const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  if (profile.schema_version !== 1 || profile.connector_id !== 'vector_robot') {
    throw new Error('INVALID_VECTOR_CONNECTOR_PROFILE');
  }
  return profile;
}

function flag(args, name) {
  return args.includes(name);
}

function fail(code) {
  throw new Error(code);
}

function boundedNumber(raw, maximum, label) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) fail(`${label}_OUTSIDE_SAFE_RANGE`);
  return value;
}

function bridgeCommand(profile) {
  return process.env.MDOS_VECTOR_BRIDGE || shortText(profile.bridge_command || 'vector-cortex');
}

function sanitizedError(result) {
  const message = shortText(result.stderr || result.error && result.error.message || 'bridge execution failed');
  return message
    .replaceAll(process.env.HOME || '__NO_HOME__', '[HOME]')
    .replace(/\/(?:run|home)\/[^\s]+/g, '[PRIVATE_PATH]')
    .slice(0, 300);
}

function invoke(profile, operation, argv, metadata = {}) {
  const command = bridgeCommand(profile);
  const started = Date.now();
  const result = spawnSync(command, argv, {
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      ...(process.env.CORTEX_VECTOR_RUNTIME_DIR ? { CORTEX_VECTOR_RUNTIME_DIR: process.env.CORTEX_VECTOR_RUNTIME_DIR } : {}),
    },
  });
  const ok = result.status === 0 && !result.error;
  const receipt = {
    schema_version: 1,
    connector_id: 'vector_robot',
    operation,
    ok,
    physical_action_performed: Boolean(metadata.physical_action_performed && ok),
    captured_at: nowIso(),
    duration_ms: Date.now() - started,
    ...metadata,
    error: ok ? null : sanitizedError(result),
  };
  if (Object.hasOwn(receipt, 'bridge_available')) receipt.bridge_available = !result.error;
  if (Object.hasOwn(receipt, 'robot_reachable')) receipt.robot_reachable = ok;
  if (!ok) {
    process.stderr.write(`${JSON.stringify(receipt)}\n`);
    process.exitCode = 2;
    return null;
  }
  return { receipt, stdout: String(result.stdout || '') };
}

function main() {
  const profile = readProfile();
  const operation = process.argv[2];
  const args = process.argv.slice(3);
  if (!operation) usage();

  if (operation === 'status' || operation === 'probe') {
    const result = invoke(profile, operation, ['probe'], {
      physical_action_performed: false,
      bridge_available: true,
      robot_reachable: true,
    });
    if (result) printJson(result.receipt);
    return;
  }
  if (operation === 'animations') {
    const result = invoke(profile, operation, ['animations'], { physical_action_performed: false });
    if (result) {
      result.receipt.animation_count = result.stdout.split(/\r?\n/).filter(Boolean).length;
      printJson(result.receipt);
    }
    return;
  }
  if (operation === 'camera') {
    const result = invoke(profile, operation, ['camera'], {
      physical_action_performed: false,
      private_sensor_payload_retained_outside_mdos: true,
    });
    if (result) printJson(result.receipt);
    return;
  }
  if (operation === 'say') {
    if (!flag(args, '--approve-speech')) fail('SPEECH_APPROVAL_REQUIRED');
    const text = args.filter((item) => item !== '--approve-speech').join(' ').trim();
    if (!text || [...text].length > 300) fail('SPEECH_TEXT_MUST_BE_1_TO_300_CHARACTERS');
    const result = invoke(profile, operation, ['say', text], { physical_action_performed: true, action: 'say' });
    if (result) printJson(result.receipt);
    return;
  }
  if (operation === 'emotion') {
    if (!flag(args, '--approve-expression')) fail('EXPRESSION_APPROVAL_REQUIRED');
    const emotion = args.find((item) => !item.startsWith('--'));
    if (!EMOTIONS.has(emotion)) fail('UNSUPPORTED_EXPRESSION');
    const result = invoke(profile, operation, ['emotion', emotion], { physical_action_performed: true, action: emotion });
    if (result) printJson(result.receipt);
    return;
  }
  if (operation === 'move') {
    if (!flag(args, '--approve-motion')) fail('MOTION_APPROVAL_REQUIRED');
    const positional = args.filter((item) => !item.startsWith('--'));
    const action = positional[0];
    if (!MOTIONS.has(action)) fail('UNSUPPORTED_MOTION');
    if (action !== 'stop' && !flag(args, '--confirm-workspace-clear')) fail('WORKSPACE_CLEAR_CONFIRMATION_REQUIRED');
    let value = null;
    const bridgeArgs = ['move', action];
    if (VALUELESS_MOTIONS.has(action)) {
      if (positional.length !== 1) fail('VALUELESS_MOTION_REJECTS_AMOUNT');
    } else {
      if (positional.length !== 2) fail('MOTION_AMOUNT_REQUIRED');
      value = boundedNumber(positional[1], action === 'forward' || action === 'backward' ? 200 : 180, 'MOTION_AMOUNT');
      bridgeArgs.push(String(value));
    }
    const result = invoke(profile, operation, bridgeArgs, { physical_action_performed: true, action, value });
    if (result) printJson(result.receipt);
    return;
  }
  usage();
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
