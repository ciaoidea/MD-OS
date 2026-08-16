#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  shortText,
} = require('./lib/common');
const {
  appendLineWithLock,
  atomicWriteJsonLocked,
  atomicWriteTextLocked,
  ensureDir,
  withFileLock,
} = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const SERVICE_ID = 'continuity_service';
const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const SERVICES_DIR = path.join(OPS_DIR, 'services');
const STATUS_FILE = path.join(SERVICES_DIR, `${SERVICE_ID}.status.json`);
const PID_FILE = path.join(SERVICES_DIR, `${SERVICE_ID}.pid`);
const STOP_FILE = path.join(SERVICES_DIR, `${SERVICE_ID}.stop.json`);
const LOG_FILE = path.join(SERVICES_DIR, `${SERVICE_ID}.log`);
const DEFAULT_INTERVAL_MS = 10000;
const DEFAULT_REBUILD_INTERVAL_MS = 60000;
const STOP_WAIT_MS = 3000;

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function sleepSync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(buffer);
  Atomics.wait(signal, 0, 0, ms);
}

function sleepInterruptibly(ms, shouldStop) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (typeof shouldStop === 'function' && shouldStop()) return;
    sleepSync(Math.min(250, deadline - Date.now()));
  }
}

function parsePositiveInt(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1 || index + 1 >= args.length) return fallback;
  return args[index + 1];
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readPidSafe() {
  try {
    const pid = Number.parseInt(fs.readFileSync(PID_FILE, 'utf8').trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch (_) {
    return null;
  }
}

function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function isContinuityProcess(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  const procCmdline = `/proc/${pid}/cmdline`;
  try {
    const cmdline = fs.readFileSync(procCmdline, 'utf8').replace(/\0/g, ' ');
    return cmdline.includes('continuity_service.js');
  } catch (_) {
    return isPidAlive(pid);
  }
}

function removeFileSafe(filePath) {
  try {
    fs.rmSync(filePath, { force: true });
  } catch (_) {
  }
}

function appendServiceLog(event, details = {}) {
  ensureDir(SERVICES_DIR);
  appendLineWithLock(LOG_FILE, `${JSON.stringify({
    ts: nowIso(),
    service_id: SERVICE_ID,
    event,
    ...details,
  })}\n`, {
    lockName: `${SERVICE_ID}__log_append`,
    context: `service_log:${event}`,
  });
}

function writeStatus(payload) {
  ensureDir(SERVICES_DIR);
  atomicWriteJsonLocked(STATUS_FILE, {
    schema_version: 1,
    service_id: SERVICE_ID,
    updated_at: nowIso(),
    files: {
      status: rel(STATUS_FILE),
      pid: rel(PID_FILE),
      stop: rel(STOP_FILE),
      log: rel(LOG_FILE),
    },
    ...payload,
  }, {
    lockName: `${SERVICE_ID}__status_write`,
    context: 'continuity_service_status',
  });
}

function readStatus() {
  const pid = readPidSafe();
  const status = readJsonSafe(STATUS_FILE) || {
    schema_version: 1,
    service_id: SERVICE_ID,
    status: 'stopped',
    desired_state: 'stopped',
  };
  const pidAlive = Boolean(pid && isPidAlive(pid));
  const pidMatchesService = Boolean(pid && pidAlive && isContinuityProcess(pid));
  return {
    ...status,
    pid,
    pid_alive: pidAlive,
    pid_matches_service: pidMatchesService,
    stop_requested: fs.existsSync(STOP_FILE),
    observed_status: pidMatchesService ? 'running' : shortText(status.status) || 'stopped',
  };
}

function discoverProjectIds() {
  const projectsDir = path.join(OPS_DIR, 'projects');
  if (!fs.existsSync(projectsDir)) return [];
  return fs.readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .filter((projectId) => fs.existsSync(path.join(projectsDir, projectId, 'project.json')))
    .sort();
}

function runNodeScript(scriptName, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_ROOT: MDOS_ROOT,
      MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
      MDOS_CONTINUITY_SERVICE: SERVICE_ID,
    },
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    command: ['node', `md-os/os/${scriptName}`, ...args].join(' '),
    stdout: String(result.stdout || '').trim().split('\n').filter(Boolean).slice(-3),
    stderr: String(result.stderr || '').trim().split('\n').filter(Boolean).slice(-3),
  };
}

function runCycle(reason = 'scheduled') {
  const projectIds = discoverProjectIds();
  const steps = [
    ['compile_programs.js'],
    ...projectIds.map((projectId) => ['build_project_state.js', [projectId]]),
    ['build_global_agenda.js'],
    ['archive_runtime_state.js'],
    ['build_workspace_inventory.js'],
    ['build_markdown_graph.js'],
    ['build_global_index.js'],
    ['build_system_hygiene_status.js'],
    ['build_health_classifier.js'],
  ];
  const startedAt = nowIso();
  const builders = steps.map(([scriptName, args]) => runNodeScript(scriptName, args || []));
  const ok = builders.every((result) => result.ok);
  const cycle = {
    ok,
    reason,
    started_at: startedAt,
    completed_at: nowIso(),
    project_ids: projectIds,
    builders,
  };
  appendServiceLog('cycle_completed', {
    ok,
    reason,
    project_count: projectIds.length,
    failed_commands: builders.filter((result) => !result.ok).map((result) => result.command),
  });
  appendJournal({
    event: 'continuity_service_cycle',
    service_id: SERVICE_ID,
    ok,
    reason,
    project_count: projectIds.length,
  });
  return cycle;
}

function refreshServiceViews(reason = 'service_state_changed') {
  const builders = [
    runNodeScript('build_workspace_inventory.js'),
    runNodeScript('build_markdown_graph.js'),
    runNodeScript('build_global_index.js'),
    runNodeScript('build_system_hygiene_status.js'),
    runNodeScript('build_health_classifier.js'),
  ];
  appendServiceLog('service_views_refreshed', {
    reason,
    ok: builders.every((result) => result.ok),
    failed_commands: builders.filter((result) => !result.ok).map((result) => result.command),
  });
  return builders;
}

function writePid() {
  ensureDir(SERVICES_DIR);
  atomicWriteTextLocked(PID_FILE, `${process.pid}\n`, {
    lockName: `${SERVICE_ID}__pid_write`,
    context: 'continuity_service_pid',
  });
}

function markStopped(startedAt, reason, lastCycle) {
  removeFileSafe(PID_FILE);
  removeFileSafe(STOP_FILE);
  writeStatus({
    status: 'stopped',
    desired_state: 'stopped',
    pid: null,
    started_at: startedAt || null,
    stopped_at: nowIso(),
    stop_reason: reason || 'completed',
    interval_ms: null,
    rebuild_interval_ms: null,
    last_cycle: lastCycle || null,
  });
  refreshServiceViews(reason || 'stopped');
}

function runService(options = {}) {
  const once = options.once === true;
  const intervalMs = parsePositiveInt(options.intervalMs, DEFAULT_INTERVAL_MS);
  const rebuildIntervalMs = parsePositiveInt(options.rebuildIntervalMs, DEFAULT_REBUILD_INTERVAL_MS);
  const startedAt = nowIso();
  let stopRequested = false;
  let stopReason = once ? 'run_once_completed' : 'completed';
  let lastCycle = null;
  let nextRebuildAt = 0;

  ensureDir(SERVICES_DIR);
  removeFileSafe(STOP_FILE);

  process.on('SIGTERM', () => {
    stopRequested = true;
    stopReason = 'sigterm';
  });
  process.on('SIGINT', () => {
    stopRequested = true;
    stopReason = 'sigint';
  });

  return withFileLock(`${SERVICE_ID}__singleton`, {
    context: 'continuity_service_run',
    timeoutMs: 1000,
    staleMs: 300000,
  }, () => {
    writePid();
    appendServiceLog('started', { pid: process.pid, interval_ms: intervalMs, rebuild_interval_ms: rebuildIntervalMs });
    appendJournal({
      event: 'continuity_service_started',
      service_id: SERVICE_ID,
      pid: process.pid,
      interval_ms: intervalMs,
      rebuild_interval_ms: rebuildIntervalMs,
    });
    writeStatus({
      status: 'running',
      desired_state: 'running',
      pid: process.pid,
      started_at: startedAt,
      heartbeat_at: nowIso(),
      interval_ms: intervalMs,
      rebuild_interval_ms: rebuildIntervalMs,
      last_cycle: null,
    });

    while (!stopRequested) {
      if (fs.existsSync(STOP_FILE)) {
        stopRequested = true;
        stopReason = 'stop_file';
        break;
      }

      if (Date.now() >= nextRebuildAt) {
        lastCycle = runCycle(once ? 'run_once' : 'scheduled');
        nextRebuildAt = Date.now() + rebuildIntervalMs;
      }

      writeStatus({
        status: 'running',
        desired_state: 'running',
        pid: process.pid,
        started_at: startedAt,
        heartbeat_at: nowIso(),
        interval_ms: intervalMs,
        rebuild_interval_ms: rebuildIntervalMs,
        last_cycle: lastCycle,
      });

      if (once) break;
      sleepInterruptibly(intervalMs, () => stopRequested || fs.existsSync(STOP_FILE));
    }

    appendServiceLog('stopped', { pid: process.pid, reason: stopReason });
    appendJournal({
      event: 'continuity_service_stopped',
      service_id: SERVICE_ID,
      pid: process.pid,
      reason: stopReason,
    });
    markStopped(startedAt, stopReason, lastCycle);

    return {
      ok: Boolean(lastCycle ? lastCycle.ok : true),
      mode: once ? 'continuity_service_run_once' : 'continuity_service_run',
      service_id: SERVICE_ID,
      status: readStatus(),
      last_cycle: lastCycle,
    };
  });
}

function startService(args) {
  ensureDir(SERVICES_DIR);
  const current = readStatus();
  if (current.pid_matches_service) {
    printJson({
      ok: true,
      mode: 'continuity_service_start',
      already_running: true,
      status: current,
    });
    return;
  }

  removeFileSafe(STOP_FILE);
  const intervalMs = parsePositiveInt(optionValue(args, '--interval-ms', DEFAULT_INTERVAL_MS), DEFAULT_INTERVAL_MS);
  const rebuildIntervalMs = parsePositiveInt(optionValue(args, '--rebuild-interval-ms', DEFAULT_REBUILD_INTERVAL_MS), DEFAULT_REBUILD_INTERVAL_MS);
  const out = fs.openSync(LOG_FILE, 'a');
  const child = spawn(process.execPath, [
    __filename,
    'run',
    '--interval-ms',
    String(intervalMs),
    '--rebuild-interval-ms',
    String(rebuildIntervalMs),
  ], {
    cwd: WORKSPACE_ROOT,
    detached: true,
    stdio: ['ignore', out, out],
    env: {
      ...process.env,
      MDOS_ROOT: MDOS_ROOT,
      MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
    },
  });
  child.unref();
  fs.closeSync(out);

  atomicWriteTextLocked(PID_FILE, `${child.pid}\n`, {
    lockName: `${SERVICE_ID}__pid_write`,
    context: 'continuity_service_start_pid',
  });
  writeStatus({
    status: 'starting',
    desired_state: 'running',
    pid: child.pid,
    started_at: nowIso(),
    heartbeat_at: null,
    interval_ms: intervalMs,
    rebuild_interval_ms: rebuildIntervalMs,
    last_cycle: null,
  });
  appendServiceLog('start_requested', { pid: child.pid, interval_ms: intervalMs, rebuild_interval_ms: rebuildIntervalMs });
  appendJournal({
    event: 'continuity_service_start_requested',
    service_id: SERVICE_ID,
    pid: child.pid,
  });

  printJson({
    ok: true,
    mode: 'continuity_service_start',
    service_id: SERVICE_ID,
    pid: child.pid,
    status_file: rel(STATUS_FILE),
    log_file: rel(LOG_FILE),
  });
}

function stopService() {
  ensureDir(SERVICES_DIR);
  const current = readStatus();
  atomicWriteJsonLocked(STOP_FILE, {
    schema_version: 1,
    service_id: SERVICE_ID,
    requested_at: nowIso(),
  }, {
    lockName: `${SERVICE_ID}__stop_write`,
    context: 'continuity_service_stop',
  });

  let signaled = false;
  if (current.pid_matches_service) {
    try {
      process.kill(current.pid, 'SIGTERM');
      signaled = true;
    } catch (_) {
      signaled = false;
    }
  }

  const deadline = Date.now() + STOP_WAIT_MS;
  while (current.pid && Date.now() < deadline) {
    if (!isPidAlive(current.pid)) break;
    sleepSync(100);
  }

  const stopped = !current.pid || !isPidAlive(current.pid);
  if (stopped) {
    markStopped(current.started_at || null, signaled ? 'stop_command' : 'not_running', current.last_cycle || null);
  } else {
    writeStatus({
      ...current,
      status: 'stopping',
      desired_state: 'stopped',
      stop_requested_at: nowIso(),
    });
  }

  appendServiceLog('stop_requested', { pid: current.pid, signaled, stopped });
  appendJournal({
    event: 'continuity_service_stop_requested',
    service_id: SERVICE_ID,
    pid: current.pid,
    signaled,
    stopped,
  });

  printJson({
    ok: true,
    mode: 'continuity_service_stop',
    service_id: SERVICE_ID,
    signaled,
    stopped,
    status: readStatus(),
  });
}

function restartService(args) {
  stopService();
  startService(args);
}

function printStatus() {
  printJson({
    ok: true,
    mode: 'continuity_service_status',
    service_id: SERVICE_ID,
    status: readStatus(),
  });
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  continuity_service.js start [--interval-ms <ms>] [--rebuild-interval-ms <ms>]',
    '  continuity_service.js stop',
    '  continuity_service.js status',
    '  continuity_service.js restart [--interval-ms <ms>] [--rebuild-interval-ms <ms>]',
    '  continuity_service.js run [--interval-ms <ms>] [--rebuild-interval-ms <ms>]',
    '  continuity_service.js run-once',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  if (command === 'start' || command === 'on') return startService(args);
  if (command === 'stop' || command === 'off') return stopService();
  if (command === 'status') return printStatus();
  if (command === 'restart') return restartService(args);
  if (command === 'run') {
    const result = runService({
      intervalMs: optionValue(args, '--interval-ms', DEFAULT_INTERVAL_MS),
      rebuildIntervalMs: optionValue(args, '--rebuild-interval-ms', DEFAULT_REBUILD_INTERVAL_MS),
    });
    printJson(result);
    return;
  }
  if (command === 'run-once' || command === 'once') {
    const result = runService({
      once: true,
      intervalMs: optionValue(args, '--interval-ms', DEFAULT_INTERVAL_MS),
      rebuildIntervalMs: optionValue(args, '--rebuild-interval-ms', DEFAULT_REBUILD_INTERVAL_MS),
    });
    printJson(result);
    return;
  }
  usage();
}

if (require.main === module) {
  main();
}
