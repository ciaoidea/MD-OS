#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, nowIso, shortText } = require('./common');

const LOCKS_DIR = path.join(MDOS_ROOT, 'ops', 'locks');
const HOSTNAME = os.hostname();
const DEFAULT_LOCK_TIMEOUT_MS = 30000;
const DEFAULT_LOCK_STALE_MS = 300000;
const DEFAULT_LOCK_RETRY_MS = 100;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function sleepSync(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return;
  const buffer = new SharedArrayBuffer(4);
  const signal = new Int32Array(buffer);
  Atomics.wait(signal, 0, 0, ms);
}

function shortLockName(lockName) {
  return shortText(lockName)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 180) || 'lock';
}

function relForLock(filePath) {
  const relMdos = path.relative(MDOS_ROOT, filePath);
  if (relMdos && !relMdos.startsWith('..') && !path.isAbsolute(relMdos)) return relMdos;
  const relWorkspace = path.relative(WORKSPACE_ROOT, filePath);
  if (relWorkspace && !relWorkspace.startsWith('..') && !path.isAbsolute(relWorkspace)) return relWorkspace;
  return path.basename(filePath);
}

function lockNameForPath(filePath, op = 'write') {
  return `${op}__${relForLock(filePath)}`;
}

function lockDirForName(lockName) {
  return path.join(LOCKS_DIR, shortLockName(lockName));
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

function readLockOwner(lockDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(lockDir, 'owner.json'), 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeLockOwner(lockDir, lockName, context) {
  const payload = {
    lock_name: lockName,
    acquired_at: nowIso(),
    pid: process.pid,
    hostname: HOSTNAME,
    context: shortText(context || ''),
  };
  fs.writeFileSync(path.join(lockDir, 'owner.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function isLockStale(lockDir, staleMs) {
  let stats = null;
  try {
    stats = fs.statSync(lockDir);
  } catch (_) {
    return false;
  }

  const ageMs = Date.now() - Number(stats.mtimeMs || 0);
  const owner = readLockOwner(lockDir);
  if (owner && owner.hostname === HOSTNAME && Number.isFinite(owner.pid) && !isPidAlive(owner.pid)) {
    return true;
  }
  return ageMs > staleMs;
}

function removeLockDir(lockDir) {
  fs.rmSync(lockDir, { recursive: true, force: true });
}

function acquireLock(lockName, options = {}) {
  ensureDir(LOCKS_DIR);
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_LOCK_TIMEOUT_MS;
  const staleMs = Number.isFinite(options.staleMs) ? options.staleMs : DEFAULT_LOCK_STALE_MS;
  const retryDelayMs = Number.isFinite(options.retryDelayMs) ? options.retryDelayMs : DEFAULT_LOCK_RETRY_MS;
  const context = options.context || '';
  const lockDir = lockDirForName(lockName);
  const deadline = Date.now() + timeoutMs;

  while (true) {
    try {
      fs.mkdirSync(lockDir);
      writeLockOwner(lockDir, lockName, context);
      return lockDir;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      if (isLockStale(lockDir, staleMs)) {
        removeLockDir(lockDir);
        continue;
      }
      if (Date.now() >= deadline) {
        const timeoutError = new Error(`OPS_LOCK_TIMEOUT: ${lockName}`);
        timeoutError.code = 'OPS_LOCK_TIMEOUT';
        timeoutError.lock_name = lockName;
        timeoutError.lock_dir = lockDir;
        throw timeoutError;
      }
      sleepSync(retryDelayMs);
    }
  }
}

function releaseLock(lockDir) {
  if (!lockDir) return;
  removeLockDir(lockDir);
}

function withFileLock(lockName, options, fn) {
  if (typeof options === 'function') {
    fn = options;
    options = {};
  }
  const lockDir = acquireLock(lockName, options);
  let result;
  try {
    result = fn({ lockDir, lockName });
  } catch (error) {
    releaseLock(lockDir);
    throw error;
  }
  if (result && typeof result.then === 'function') {
    return result.finally(() => {
      releaseLock(lockDir);
    });
  }
  releaseLock(lockDir);
  return result;
}

function fsyncDirectory(dirPath) {
  let fd = null;
  try {
    fd = fs.openSync(dirPath, 'r');
    fs.fsyncSync(fd);
  } catch (_) {
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
  }
}

function writeBufferToFd(fd, content, position = 0) {
  const buffer = Buffer.from(String(content || ''), 'utf8');
  if (!buffer.length) return;
  fs.writeSync(fd, buffer, 0, buffer.length, position);
}

function atomicWriteText(filePath, text) {
  const dirPath = path.dirname(filePath);
  const baseName = path.basename(filePath);
  ensureDir(dirPath);

  const tmpPath = path.join(
    dirPath,
    `.${baseName}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );

  let fd = null;
  try {
    fd = fs.openSync(tmpPath, 'w', 0o600);
    writeBufferToFd(fd, text, 0);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    fs.renameSync(tmpPath, filePath);
    fsyncDirectory(dirPath);
  } catch (error) {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    try { fs.unlinkSync(tmpPath); } catch (_) {}
    throw error;
  }
}

function atomicWriteJson(filePath, payload) {
  atomicWriteText(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

function atomicWriteNdjson(filePath, records) {
  const lines = Array.isArray(records) ? records.map((record) => JSON.stringify(record)) : [];
  atomicWriteText(filePath, lines.length ? `${lines.join('\n')}\n` : '');
}

function atomicWriteTextLocked(filePath, text, options = {}) {
  const lockName = options.lockName || lockNameForPath(filePath, options.op || 'write');
  return withFileLock(lockName, options, () => atomicWriteText(filePath, text));
}

function atomicWriteJsonLocked(filePath, payload, options = {}) {
  const lockName = options.lockName || lockNameForPath(filePath, options.op || 'write');
  return withFileLock(lockName, options, () => atomicWriteJson(filePath, payload));
}

function appendText(filePath, text) {
  const dirPath = path.dirname(filePath);
  ensureDir(dirPath);
  let fd = null;
  try {
    fd = fs.openSync(filePath, 'a', 0o600);
    const buffer = Buffer.from(String(text || ''), 'utf8');
    if (buffer.length) fs.writeSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch (_) {}
    }
    fsyncDirectory(dirPath);
  }
}

function appendLineWithLock(filePath, line, options = {}) {
  const lockName = options.lockName || lockNameForPath(filePath, options.op || 'append');
  return withFileLock(lockName, options, () => appendText(filePath, line));
}

module.exports = {
  LOCKS_DIR,
  appendLineWithLock,
  appendText,
  atomicWriteJson,
  atomicWriteJsonLocked,
  atomicWriteNdjson,
  atomicWriteText,
  atomicWriteTextLocked,
  ensureDir,
  lockNameForPath,
  withFileLock,
};
