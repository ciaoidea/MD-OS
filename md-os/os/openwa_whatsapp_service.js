#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  shortText,
} = require('./lib/common');
const { ensureDir } = require('./lib/fs_runtime');

const LOCAL_DIR = path.join(MDOS_ROOT, 'ops', 'local', 'openwa_whatsapp');
const RUNTIME_DIR = path.join(MDOS_ROOT, 'ops', 'local', 'openwa_runtime', 'OpenWA');
const API_KEY_FILE = path.join(RUNTIME_DIR, 'data', '.api-key');
const SUPERVISOR_PID_FILE = path.join(LOCAL_DIR, 'service.pid');
const WEBHOOK_PID_FILE = path.join(LOCAL_DIR, 'webhook.pid');
const WORKER_PID_FILE = path.join(LOCAL_DIR, 'worker.pid');
const SERVICE_LOG = path.join(LOCAL_DIR, 'service.log');
const WEBHOOK_LOG = path.join(LOCAL_DIR, 'webhook.log');
const WORKER_LOG = path.join(LOCAL_DIR, 'worker.log');
const MANAGED_CHILDREN = [];

function appendLog(message, details = {}) {
  ensureDir(LOCAL_DIR);
  fs.appendFileSync(SERVICE_LOG, `${JSON.stringify({
    at: nowIso(),
    message,
    ...details,
  })}\n`);
}

function apiKey() {
  if (process.env.OPENWA_API_KEY) return process.env.OPENWA_API_KEY;
  if (fs.existsSync(API_KEY_FILE)) return fs.readFileSync(API_KEY_FILE, 'utf8').trim();
  return '';
}

function runtimeEnv(extra = {}) {
  return {
    ...process.env,
    OPENWA_BASE_URL: process.env.OPENWA_BASE_URL || 'http://127.0.0.1:2785/api',
    OPENWA_API_KEY: apiKey(),
    OPENWA_SESSION_ID: process.env.OPENWA_SESSION_ID || '7af9bd94-c2a6-4ae5-bbd6-60704a8ec6cd',
    OPENWA_CONNECTOR_BIND_HOST: process.env.OPENWA_CONNECTOR_BIND_HOST || '172.20.0.1',
    ...extra,
  };
}

function writePid(filePath, pid) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${pid}\n`);
}

function openAppend(filePath) {
  ensureDir(path.dirname(filePath));
  return fs.openSync(filePath, 'a');
}

function startManaged(name, args, pidFile, logFile, env = {}) {
  const stdout = openAppend(logFile);
  const stderr = openAppend(logFile);
  const child = spawn(process.execPath, args, {
    cwd: WORKSPACE_ROOT,
    env: runtimeEnv(env),
    detached: false,
    stdio: ['ignore', stdout, stderr],
  });
  writePid(pidFile, child.pid);
  appendLog(`${name}_started`, { pid: child.pid, args });
  child.on('exit', (code, signal) => {
    appendLog(`${name}_exited`, { pid: child.pid, code, signal });
    if (process.exitCode !== undefined) return;
    setTimeout(() => {
      startManaged(name, args, pidFile, logFile, env);
    }, 5000);
  });
  MANAGED_CHILDREN.push(child);
  return child;
}

function stopManagedChildren() {
  for (const child of MANAGED_CHILDREN) {
    if (child && child.pid && !child.killed) {
      try {
        child.kill('SIGTERM');
      } catch (_) {
        // Child may already have exited.
      }
    }
  }
}

function startService() {
  ensureDir(LOCAL_DIR);
  writePid(SUPERVISOR_PID_FILE, process.pid);
  appendLog('service_started', {
    pid: process.pid,
    worker_enabled: process.env.OPENWA_SERVICE_WORKER === '1',
  });

  startManaged(
    'webhook',
    ['md-os/os/openwa_whatsapp_connector.js', 'webhook', process.env.OPENWA_CONNECTOR_PORT || '2795'],
    WEBHOOK_PID_FILE,
    WEBHOOK_LOG
  );

  if (process.env.OPENWA_SERVICE_WORKER === '1') {
    startManaged(
      'worker',
      ['md-os/os/openwa_whatsapp_connector.js', 'worker', process.env.OPENWA_WORKER_INTERVAL_MS || '3000'],
      WORKER_PID_FILE,
      WORKER_LOG,
      {
        OPENWA_CODEX_EXEC: process.env.OPENWA_CODEX_EXEC || '',
        OPENWA_CODEX_SANDBOX: process.env.OPENWA_CODEX_SANDBOX || 'workspace-write',
        OPENWA_CODEX_RESUME_THREAD_ID: process.env.OPENWA_CODEX_RESUME_THREAD_ID || '',
        OPENWA_CODEX_TIMEOUT_MS: process.env.OPENWA_CODEX_TIMEOUT_MS || '600000',
      }
    );
  } else if (fs.existsSync(WORKER_PID_FILE)) {
    fs.rmSync(WORKER_PID_FILE, { force: true });
  }

  process.on('SIGTERM', () => {
    appendLog('service_stopping', { signal: 'SIGTERM' });
    process.exitCode = 0;
    stopManagedChildren();
    process.exit(0);
  });
  process.on('SIGINT', () => {
    appendLog('service_stopping', { signal: 'SIGINT' });
    process.exitCode = 0;
    stopManagedChildren();
    process.exit(0);
  });
}

function status() {
  const files = {
    service_pid: SUPERVISOR_PID_FILE,
    webhook_pid: WEBHOOK_PID_FILE,
    worker_pid: WORKER_PID_FILE,
    service_log: SERVICE_LOG,
    webhook_log: WEBHOOK_LOG,
    worker_log: WORKER_LOG,
  };
  const readPid = (filePath) => fs.existsSync(filePath) ? shortText(fs.readFileSync(filePath, 'utf8')) : '';
  const pidAlive = (pid) => {
    if (!pid) return false;
    try {
      process.kill(Number(pid), 0);
      return true;
    } catch (_) {
      return false;
    }
  };
  const pids = {
    service: readPid(SUPERVISOR_PID_FILE),
    webhook: readPid(WEBHOOK_PID_FILE),
    worker: readPid(WORKER_PID_FILE),
  };
  printJson({
    ok: true,
    mode: 'openwa_whatsapp_service_status',
    files: Object.fromEntries(Object.entries(files).map(([key, filePath]) => [key, path.relative(WORKSPACE_ROOT, filePath)])),
    pids,
    alive: {
      service: pidAlive(pids.service),
      webhook: pidAlive(pids.webhook),
      worker: pidAlive(pids.worker),
    },
  });
}

function usage() {
  process.stderr.write('Usage: node md-os/os/openwa_whatsapp_service.js start|status\n');
  process.exit(1);
}

const command = process.argv[2] || 'start';
if (command === 'start') startService();
else if (command === 'status') status();
else usage();
