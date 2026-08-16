#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
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

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'adeept_arm_connector.json');
const TARGET_FILE = path.join(MDOS_ROOT, 'ops', 'local', 'hardware', 'adeept_arm_target.json');
const ACTIONS_FILE = path.join(MDOS_ROOT, 'ops', 'local', 'hardware', 'actions.ndjson');
const ARTIFACT_DIR = path.join(MDOS_ROOT, 'ops', 'local', 'hardware', 'adeept_arm', 'actions');
const SERIAL_BACKEND = path.join(__dirname, 'adeept_arm_serial_backend.py');

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/adeept_arm_connector.js status',
    '  node md-os/os/adeept_arm_connector.js dry-run <joint|random> [increase|decrease] [--steps <n>] [--seed <seed>]',
    '  node md-os/os/adeept_arm_connector.js pulse <joint|random> [increase|decrease] --approve-motion --confirm-workspace-clear --approve-candidate-protocol [--steps <n>] [--seed <seed>]',
    '  node md-os/os/adeept_arm_connector.js stop',
    '  node md-os/os/adeept_arm_connector.js operate <s0|s1|s2|s3|s5> <from-angle> <to-angle> --approve-motion --confirm-workspace-clear',
    '  node md-os/os/adeept_arm_connector.js learn-cycle --approve-motion --confirm-workspace-clear',
    '  node md-os/os/adeept_arm_connector.js speak <english text> --confirm-oled-write',
    '',
  ].join('\n'));
  process.exit(1);
}

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, label) {
  if (!fs.existsSync(filePath)) throw new Error(`${label}_MISSING: ${rel(filePath)}`);
  const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (payload.schema_version !== 1) throw new Error(`${label}_SCHEMA_VERSION_UNSUPPORTED`);
  return payload;
}

function parseCli(argv) {
  const positionals = [];
  const flags = new Set();
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positionals.push(value);
      continue;
    }
    if (value === '--seed' || value === '--steps') {
      if (!argv[index + 1] || argv[index + 1].startsWith('--')) throw new Error('SEED_VALUE_REQUIRED');
      values.set(value.slice(2), shortText(argv[index + 1]));
      index += 1;
      continue;
    }
    flags.add(value);
  }
  return { positionals, flags, values };
}

function commandEntries(profile) {
  const entries = [];
  const commands = profile.protocol && profile.protocol.commands || {};
  for (const [joint, directions] of Object.entries(commands)) {
    for (const [direction, command] of Object.entries(directions || {})) {
      if (typeof command !== 'string' || Buffer.byteLength(command) !== 1) continue;
      entries.push({ joint, direction, command });
    }
  }
  return entries;
}

function resolveCommand(profile, requestedJoint, requestedDirection, seedValue) {
  const entries = commandEntries(profile);
  if (!entries.length) throw new Error('ADEEPT_COMMAND_ALLOWLIST_EMPTY');
  if (requestedJoint === 'random') {
    const allowed = Array.isArray(profile.protocol.randomized_learning_allowlist)
      ? profile.protocol.randomized_learning_allowlist
      : [];
    const candidates = entries.filter((entry) => allowed.some((item) => (
      item && item.joint === entry.joint && item.direction === entry.direction
    )));
    if (!candidates.length) throw new Error('RANDOMIZED_LEARNING_ALLOWLIST_EMPTY');
    const seed = seedValue || crypto.randomBytes(12).toString('hex');
    const digest = crypto.createHash('sha256').update(seed).digest();
    return { ...candidates[digest.readUInt32BE(0) % candidates.length], seed, randomized: true };
  }
  const selected = entries.find((entry) => entry.joint === requestedJoint && entry.direction === requestedDirection);
  if (!selected) throw new Error(`COMMAND_NOT_ALLOWLISTED: ${requestedJoint}:${requestedDirection || ''}`);
  return { ...selected, seed: null, randomized: false };
}

function resolveStepCount(profile, selected, rawValue) {
  const steps = Number.parseInt(rawValue || '1', 10);
  if (!Number.isInteger(steps) || steps < 1) throw new Error(`INVALID_STEP_COUNT: ${rawValue}`);
  const verifiedMaximum = Number.parseInt(profile.safety.max_verified_steps_per_action || 10, 10);
  const candidateByJoint = profile.safety.max_candidate_steps_by_joint || {};
  const candidateMaximum = Number.parseInt(candidateByJoint[selected.joint] || 1, 10);
  const maximum = profile.protocol.status === 'verified' ? verifiedMaximum : candidateMaximum;
  if (steps > maximum) throw new Error(`STEP_COUNT_EXCEEDS_${profile.protocol.status.toUpperCase()}_LIMIT: ${steps}>${maximum}`);
  return steps;
}

function udevIdentity(devicePath) {
  if (process.env.MDOS_ADEEPT_TEST_MODE === '1' && process.env.MDOS_ADEEPT_TEST_IDENTITY) {
    return JSON.parse(process.env.MDOS_ADEEPT_TEST_IDENTITY);
  }
  const result = spawnSync('udevadm', ['info', '--query=property', `--name=${devicePath}`], {
    encoding: 'utf8',
    timeout: 3000,
    env: { PATH: process.env.PATH || '' },
  });
  if (result.status !== 0) throw new Error(`TARGET_IDENTITY_READ_FAILED: ${shortText(result.stderr)}`);
  return Object.fromEntries(String(result.stdout || '').trim().split('\n').filter(Boolean).map((line) => {
    const separator = line.indexOf('=');
    return separator < 0 ? [line, ''] : [line.slice(0, separator), line.slice(separator + 1)];
  }));
}

function verifyTarget(target) {
  const devicePath = shortText(target.device_path);
  if (!devicePath || !fs.existsSync(devicePath)) throw new Error(`TARGET_DEVICE_MISSING: ${devicePath}`);
  const identity = udevIdentity(devicePath);
  const expected = target.expected_usb || {};
  const observedVendor = shortText(identity.ID_VENDOR_ID).toLowerCase();
  const observedProduct = shortText(identity.ID_MODEL_ID).toLowerCase();
  if (observedVendor !== shortText(expected.vendor_id).toLowerCase()
      || observedProduct !== shortText(expected.product_id).toLowerCase()) {
    throw new Error(`TARGET_USB_IDENTITY_MISMATCH: ${observedVendor}:${observedProduct}`);
  }
  const cameraPath = shortText(target.observation_camera_path);
  return {
    device_path: devicePath,
    real_device_path: fs.realpathSync(devicePath),
    usb_vendor_id: observedVendor,
    usb_product_id: observedProduct,
    usb_model: shortText(identity.ID_MODEL || ''),
    camera_path: cameraPath,
    camera_available: Boolean(cameraPath && fs.existsSync(cameraPath)),
  };
}

function runBackend(target, profile, selected, steps) {
  const args = [
    '--port', target.device_path,
    '--baud', String(profile.protocol.baud),
    '--byte-hex', Buffer.from(selected.command, 'ascii').toString('hex'),
    '--count', String(steps),
    '--interval-ms', '250',
    '--settle-ms', String(profile.protocol.open_settle_ms || 2000),
    '--read-ms', '150',
  ];
  let executable = process.env.MDOS_PYTHON || 'python3';
  let backendArgs = [SERIAL_BACKEND, ...args];
  if (process.env.MDOS_ADEEPT_TEST_MODE === '1' && process.env.MDOS_ADEEPT_SERIAL_BACKEND) {
    executable = process.env.MDOS_ADEEPT_SERIAL_BACKEND;
    backendArgs = args;
  }
  const result = spawnSync(executable, backendArgs, {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 5000,
    env: { PATH: process.env.PATH || '' },
  });
  let payload = null;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch (_) {
    payload = null;
  }
  return {
    ok: result.status === 0 && Boolean(payload && payload.ok),
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: shortText(result.stdout || ''),
    stderr: shortText(result.stderr || result.error && result.error.message || ''),
    backend: payload,
  };
}

function runBlockPyBackend(target, profile, commands) {
  const args = [
    '--port', target.device_path,
    '--baud', String(profile.serial.baud_rate),
    '--commands-json', JSON.stringify(commands),
    '--handshake',
    '--interval-ms', '40',
    '--settle-ms', String(profile.serial.open_boot_wait_ms || 2500),
    '--read-ms', '1000',
  ];
  const result = spawnSync(process.env.MDOS_PYTHON || 'python3', [SERIAL_BACKEND, ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 12000,
    env: { PATH: process.env.PATH || '' },
  });
  let payload = null;
  try {
    payload = JSON.parse(String(result.stdout || '').trim());
  } catch (_) {
    payload = null;
  }
  return {
    ok: result.status === 0 && Boolean(payload && payload.ok && payload.handshake_received),
    status: Number.isInteger(result.status) ? result.status : null,
    stdout: shortText(result.stdout || ''),
    stderr: shortText(result.stderr || result.error && result.error.message || ''),
    backend: payload,
  };
}

function blockServo(profile, selector) {
  const aliases = { base: 's0', shoulder: 's1', elbow: 's2', wrist: 's3', gripper: 's5' };
  const normalized = aliases[String(selector).toLowerCase()] || String(selector).toLowerCase();
  const servo = (profile.servos || []).find((item) => item.id === normalized);
  if (!servo) throw new Error(`UNKNOWN_SERVO: ${selector}`);
  return servo;
}

function boundedAngle(value, servo, label) {
  const angle = Number.parseInt(value, 10);
  if (!Number.isInteger(angle)) throw new Error(`INVALID_${label}_ANGLE: ${value}`);
  if (angle < servo.min || angle > servo.max) throw new Error(`${label}_ANGLE_OUT_OF_RANGE: ${angle}`);
  return angle;
}

function operate(profile, target, parsed) {
  for (const requiredFlag of ['--approve-motion', '--confirm-workspace-clear']) {
    if (!parsed.flags.has(requiredFlag)) throw new Error(`MOTION_GATE_MISSING: ${requiredFlag}`);
  }
  const [selector, rawFrom, rawTo] = parsed.positionals;
  const servo = blockServo(profile, selector);
  const from = boundedAngle(rawFrom, servo, 'FROM');
  const to = boundedAngle(rawTo, servo, 'TO');
  if (Math.abs(to - from) > 25) throw new Error(`MOVE_EXCEEDS_BOUNDED_RANGE: ${Math.abs(to - from)}>25`);
  const verifiedTarget = verifyTarget(target);
  if (!verifiedTarget.camera_available) throw new Error('OBSERVATION_CAMERA_MISSING');
  const commands = [
    { command: { start: ['OLED_Log', 'MD-OS CONTROL', 'LED ON', `${servo.id.toUpperCase()} ${from}>${to}`] }, settle_ms: 80 },
    { command: { start: ['pinmode', 13, 1] }, settle_ms: 40 },
    { command: { start: ['digitalWrite', 13, 1] }, settle_ms: 80 },
    { command: { start: ['servo_attach', servo.index, servo.pin] }, settle_ms: 80 },
    { command: { start: ['servo_write', servo.index, to, from, 20, 2] }, settle_ms: Math.abs(to - from) * 15 + 300 },
    { command: { start: ['OLED_Log', `${servo.id.toUpperCase()} ${to} CMD`, 'LED ON', 'NO ENCODER'] }, settle_ms: 80 },
  ];
  const backendResult = runBlockPyBackend(target, profile, commands);
  const action = recordAction({
    category: 'robotic_arm',
    action: 'verified_block_py_oled_led_servo_move',
    requested_intent: `Move ${servo.id} from commanded angle ${from} to ${to}, turn on LED, and write OLED feedback.`,
    selected_device: verifiedTarget,
    protocol_status: 'verified_from_installed_firmware_backup_and_local_source',
    protocol: 'adeept_block_py_json_line',
    policy: 'explicit_user_authorization_bounded_single_transaction',
    approvals: { motion: true, workspace_clear: true, led: true, oled: true },
    selected_command: { servo_id: servo.id, servo_index: servo.index, pin: servo.pin, from_angle: from, to_angle: to },
    controller_commands: commands.map((entry) => entry.command),
    stop_semantics: 'Serial transaction completes and port closes; no continuous command stream remains.',
    backend_result: backendResult,
    ok: backendResult.ok,
    result_hash: sha256Json(backendResult),
  });
  printJson({
    ok: backendResult.ok,
    mode: 'adeept_arm_block_py_operate',
    servo_id: servo.id,
    from_angle: from,
    to_angle: to,
    led: 'on',
    oled: ['MD-OS CONTROL', 'LED ON', `${servo.id.toUpperCase()} ${to} CMD`],
    handshake_received: Boolean(backendResult.backend && backendResult.backend.handshake_received),
    bytes_written: backendResult.backend && backendResult.backend.bytes_written || 0,
    artifact_file: rel(action.artifactPath),
    feedback_status: 'visual_verification_required',
  });
  if (!backendResult.ok) process.exitCode = 1;
}

function learnCycle(profile, target, parsed) {
  for (const requiredFlag of ['--approve-motion', '--confirm-workspace-clear']) {
    if (!parsed.flags.has(requiredFlag)) throw new Error(`MOTION_GATE_MISSING: ${requiredFlag}`);
  }
  const verifiedTarget = verifyTarget(target);
  if (!verifiedTarget.camera_available) throw new Error('OBSERVATION_CAMERA_MISSING');
  const trials = [
    { id: 's0', from: 160, to: 140 },
    { id: 's1', from: 125, to: 116 },
    { id: 's2', from: 176, to: 165 },
    { id: 's3', from: 180, to: 160 },
    { id: 's5', from: 50, to: 60 },
  ];
  const commands = [
    { command: { start: ['OLED_Log', 'LEARNING LIVE', 'LED ON', '5 JOINT CYCLE'] }, settle_ms: 80 },
    { command: { start: ['pinmode', 13, 1] }, settle_ms: 30 },
    { command: { start: ['digitalWrite', 13, 1] }, settle_ms: 50 },
  ];
  for (const trial of trials) {
    const servo = blockServo(profile, trial.id);
    commands.push(
      { command: { start: ['servo_attach', servo.index, servo.pin] }, settle_ms: 30 },
      { command: { start: ['servo_write', servo.index, trial.to, trial.from, 15, 2] }, settle_ms: 500 },
      { command: { start: ['servo_write', servo.index, trial.from, trial.to, 15, 2] }, settle_ms: 500 },
    );
  }
  commands.push({ command: { start: ['OLED_Log', 'CYCLE COMPLETE', 'LED ON', 'VISION CHECK'] }, settle_ms: 80 });
  const backendResult = runBlockPyBackend(target, profile, commands);
  const action = recordAction({
    category: 'robotic_arm',
    action: 'bounded_live_visual_learning_cycle',
    requested_intent: 'Rapidly test five arm joints bidirectionally during continuous live-camera observation.',
    selected_device: verifiedTarget,
    protocol_status: 'verified_from_installed_firmware_backup_and_local_source',
    protocol: 'adeept_block_py_json_line',
    policy: 'explicit_user_authorization_bounded_multi_joint_single_transaction',
    approvals: { motion: true, workspace_clear: true, continuous_camera: true, led: true, oled: true },
    trials,
    controller_commands: commands.map((entry) => entry.command),
    stop_semantics: 'Finite bidirectional cycle returns every tested joint to its starting command and closes the serial port.',
    backend_result: backendResult,
    ok: backendResult.ok,
    result_hash: sha256Json(backendResult),
  });
  printJson({
    ok: backendResult.ok,
    mode: 'adeept_arm_live_visual_learning_cycle',
    trials,
    handshake_received: Boolean(backendResult.backend && backendResult.backend.handshake_received),
    bytes_written: backendResult.backend && backendResult.backend.bytes_written || 0,
    artifact_file: rel(action.artifactPath),
    feedback_status: 'continuous_motion_scores_required',
  });
  if (!backendResult.ok) process.exitCode = 1;
}

function oledLines(text, width = 20, limit = 5) {
  const words = shortText(text).split(' ').filter(Boolean);
  const lines = [];
  let current = '';
  for (const rawWord of words) {
    let word = rawWord;
    while (word.length > width) {
      if (current) {
        lines.push(current);
        current = '';
      }
      lines.push(word.slice(0, width));
      word = word.slice(width);
      if (lines.length >= limit) return lines;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= width) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length >= limit) return lines;
    }
  }
  if (current && lines.length < limit) lines.push(current);
  return lines;
}

function speakWithOled(profile, target, parsed) {
  if (!parsed.flags.has('--confirm-oled-write')) throw new Error('OLED_GATE_MISSING: --confirm-oled-write');
  const text = shortText(parsed.positionals.join(' '));
  if (!text) throw new Error('SPEAK_TEXT_REQUIRED');
  const lines = oledLines(text);
  const verifiedTarget = verifyTarget(target);
  const controllerCommands = [{ command: { start: ['OLED_Log', ...lines] }, settle_ms: 100 }];
  const oledResult = runBlockPyBackend(target, profile, controllerCommands);
  const ttsScript = path.join(__dirname, 'kokoro_speak.sh');
  const speech = spawnSync(ttsScript, [text], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    env: { ...process.env, MDOS_KOKORO_LANGUAGE: 'en-us', MDOS_KOKORO_VOICE: 'am_michael' },
  });
  const speechOk = speech.status === 0;
  const action = recordAction({
    category: 'robotic_arm_feedback',
    action: 'kokoro_english_male_with_oled_mirror',
    requested_intent: text,
    selected_device: verifiedTarget,
    policy: 'explicit_user_authorization_oled_and_audio_feedback',
    approvals: { oled: true, audio: true },
    oled_lines: lines,
    controller_commands: controllerCommands.map((entry) => entry.command),
    oled_result: oledResult,
    speech_result: { ok: speechOk, status: speech.status, stdout: shortText(speech.stdout), stderr: shortText(speech.stderr) },
    ok: oledResult.ok && speechOk,
    stop_semantics: 'One OLED write and one finite audio playback; no autonomous speech loop remains.',
  });
  printJson({
    ok: oledResult.ok && speechOk,
    mode: 'adeept_arm_kokoro_oled_speak',
    text,
    oled_lines: lines,
    voice: 'am_michael',
    language: 'en-us',
    oled_handshake_received: Boolean(oledResult.backend && oledResult.backend.handshake_received),
    speech_played: speechOk,
    artifact_file: rel(action.artifactPath),
  });
  if (!oledResult.ok || !speechOk) process.exitCode = 1;
}

function recordAction(entry) {
  ensureDir(ARTIFACT_DIR);
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');
  const payload = {
    schema_version: 1,
    acted_at: ts,
    connector_id: 'adeept_arm',
    ...entry,
  };
  const artifactPath = path.join(ARTIFACT_DIR, `${stamp}__${entry.action}.json`);
  atomicWriteJsonLocked(artifactPath, payload, { context: `adeept_arm:${entry.action}` });
  appendLineWithLock(ACTIONS_FILE, `${JSON.stringify({ ...payload, artifact_file: rel(artifactPath) })}\n`, {
    lockName: 'hardware_actions_append',
    context: `adeept_arm:${entry.action}`,
  });
  appendJournal({
    event: 'adeept_arm_action_completed',
    connector_id: 'adeept_arm',
    action: entry.action,
    ok: entry.ok,
    artifact_file: rel(artifactPath),
  });
  return { payload, artifactPath };
}

function status(profile, target) {
  const verifiedTarget = verifyTarget(target);
  printJson({
    ok: true,
    mode: 'adeept_arm_status',
    connector_id: profile.connector_id,
    protocol_status: profile.protocol.status,
    controller_family: profile.controller_family,
    baud: profile.protocol.baud,
    one_byte_one_step: profile.protocol.one_byte_one_step === true,
    target: verifiedTarget,
    safety: profile.safety,
  });
}

function dryRun(profile, target, parsed) {
  const [requestedJoint, requestedDirection] = parsed.positionals;
  if (!requestedJoint) usage();
  const selected = resolveCommand(profile, requestedJoint, requestedDirection, parsed.values.get('seed'));
  const steps = resolveStepCount(profile, selected, parsed.values.get('steps'));
  printJson({
    ok: true,
    mode: 'adeept_arm_dry_run',
    connector_id: profile.connector_id,
    protocol_status: profile.protocol.status,
    target_id: target.target_id,
    selected: {
      joint: selected.joint,
      direction: selected.direction,
      command_hex: Buffer.from(selected.command, 'ascii').toString('hex'),
      randomized: selected.randomized,
      seed: selected.seed,
    },
    steps,
    bytes_that_would_be_written: steps,
    physical_action_performed: false,
  });
}

function pulse(profile, target, parsed) {
  const [requestedJoint, requestedDirection] = parsed.positionals;
  if (!requestedJoint) usage();
  for (const requiredFlag of ['--approve-motion', '--confirm-workspace-clear']) {
    if (!parsed.flags.has(requiredFlag)) throw new Error(`MOTION_GATE_MISSING: ${requiredFlag}`);
  }
  if (profile.protocol.status !== 'verified' && !parsed.flags.has('--approve-candidate-protocol')) {
    throw new Error('CANDIDATE_PROTOCOL_REQUIRES_EXPLICIT_APPROVAL');
  }
  const selected = resolveCommand(profile, requestedJoint, requestedDirection, parsed.values.get('seed'));
  const steps = resolveStepCount(profile, selected, parsed.values.get('steps'));
  const verifiedTarget = verifyTarget(target);
  if (profile.safety.camera_required_for_learning && !verifiedTarget.camera_available) {
    throw new Error('OBSERVATION_CAMERA_MISSING');
  }
  const backendResult = runBackend(target, profile, selected, steps);
  const action = recordAction({
    category: 'robotic_arm',
    action: 'bounded_degree_pulse',
    requested_intent: `Learn robotic-arm movement through ${steps} bounded one-degree impulse${steps === 1 ? '' : 's'} with EyeToy feedback.`,
    selected_device: verifiedTarget,
    protocol_status: profile.protocol.status,
    policy: 'explicit_user_authorization_bounded_single_transaction',
    approvals: {
      motion: true,
      workspace_clear: true,
      candidate_protocol: parsed.flags.has('--approve-candidate-protocol'),
    },
    selected_command: {
      joint: selected.joint,
      direction: selected.direction,
      command_hex: Buffer.from(selected.command, 'ascii').toString('hex'),
      command_count: steps,
      randomized: selected.randomized,
      seed: selected.seed,
    },
    stop_semantics: profile.safety.stop_semantics,
    backend_result: backendResult,
    ok: backendResult.ok,
    result_hash: sha256Json(backendResult),
  });
  printJson({
    ok: backendResult.ok,
    mode: 'adeept_arm_bounded_degree_pulse',
    connector_id: profile.connector_id,
    joint: selected.joint,
    direction: selected.direction,
    randomized: selected.randomized,
    seed: selected.seed,
    steps,
    bytes_written: backendResult.backend && backendResult.backend.bytes_written || 0,
    artifact_file: rel(action.artifactPath),
    action_log: rel(ACTIONS_FILE),
    feedback_status: 'visual_verification_required',
  });
  if (!backendResult.ok) process.exitCode = 1;
}

function stop(profile, target) {
  const action = recordAction({
    category: 'robotic_arm',
    action: 'stop',
    requested_intent: 'Stop or suppress Adeept arm command transmission.',
    selected_device: { target_id: target.target_id },
    policy: 'safe_stop_available_without_approval',
    stop_semantics: profile.safety.stop_semantics,
    bytes_written: 0,
    ok: true,
  });
  printJson({
    ok: true,
    mode: 'adeept_arm_stop',
    bytes_written: 0,
    command_stream_active: false,
    artifact_file: rel(action.artifactPath),
  });
}

function main() {
  const profile = readJson(PROFILE_FILE, 'ADEEPT_PROFILE');
  const target = readJson(TARGET_FILE, 'ADEEPT_TARGET');
  const command = process.argv[2];
  const parsed = parseCli(process.argv.slice(3));
  if (command === 'status') return status(profile, target);
  if (command === 'dry-run') return dryRun(profile, target, parsed);
  if (command === 'pulse') return pulse(profile, target, parsed);
  if (command === 'operate') return operate(profile, target, parsed);
  if (command === 'learn-cycle') return learnCycle(profile, target, parsed);
  if (command === 'speak') return speakWithOled(profile, target, parsed);
  if (command === 'stop') return stop(profile, target);
  usage();
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  commandEntries,
  resolveCommand,
  resolveStepCount,
  verifyTarget,
};
