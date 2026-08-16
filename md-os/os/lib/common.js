#!/usr/bin/env node
'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BOUNDARY_DIR = 'md-os';
const PACKAGE_BOUNDARY_ROOT = path.resolve(__dirname, '..', '..');
const PACKAGE_WORKSPACE_ROOT = path.resolve(PACKAGE_BOUNDARY_ROOT, '..');

function isWorkspaceRoot(candidateRoot) {
  return (
    fs.existsSync(path.join(candidateRoot, BOUNDARY_DIR, 'os'))
    && fs.existsSync(path.join(candidateRoot, BOUNDARY_DIR, 'kb'))
  );
}

function boundaryRootForWorkspace(workspaceRoot) {
  return path.join(workspaceRoot, BOUNDARY_DIR);
}

function findWorkspaceRoot(startDir) {
  let current = path.resolve(startDir || process.cwd());
  while (true) {
    if (isWorkspaceRoot(current)) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

function resolveWorkspaceRoot() {
  if (process.env.MDOS_WORKSPACE_ROOT) {
    return path.resolve(process.env.MDOS_WORKSPACE_ROOT);
  }
  if (process.env.MDOS_ROOT) {
    return path.resolve(process.env.MDOS_ROOT, '..');
  }
  return findWorkspaceRoot(process.cwd()) || PACKAGE_WORKSPACE_ROOT;
}

const WORKSPACE_ROOT = resolveWorkspaceRoot();
const MDOS_ROOT = path.resolve(process.env.MDOS_ROOT || boundaryRootForWorkspace(WORKSPACE_ROOT));
const ACTIVE_BOUNDARY_DIR = path.basename(MDOS_ROOT);

function realpathExistingAncestor(targetPath) {
  const resolved = path.resolve(targetPath);
  const missingSegments = [];
  let existing = resolved;

  while (!fs.existsSync(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) break;
    missingSegments.unshift(path.basename(existing));
    existing = parent;
  }

  const realpath = fs.realpathSync.native || fs.realpathSync;
  return path.resolve(realpath(existing), ...missingSegments);
}

function shortText(value) {
  return String(value || '')
    .replace(/\u200b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function printJson(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function parseLimit(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

function errorLabel(label) {
  return shortText(label || 'id')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'ID';
}

function assertSafeId(value, label = 'id') {
  const text = shortText(value);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(text)) {
    throw new Error(`INVALID_${errorLabel(label)}: ${text}`);
  }
  return text;
}

function assertInsideRoot(targetPath, rootPath, errorCode = 'PATH_OUTSIDE_ROOT') {
  const resolved = path.resolve(targetPath);
  const resolvedRoot = path.resolve(rootPath);
  const canonicalRoot = realpathExistingAncestor(resolvedRoot);
  const canonical = realpathExistingAncestor(resolved);
  const relative = path.relative(canonicalRoot, canonical);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error(`${errorCode}: ${resolved}`);
  }
  return path.resolve(resolvedRoot, relative);
}

function assertInsideWorkspace(targetPath) {
  return assertInsideRoot(targetPath, WORKSPACE_ROOT, 'PATH_OUTSIDE_WORKSPACE');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map((item) => canonicalize(item));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])])
  );
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex');
}

function sha256Json(value) {
  return sha256Text(canonicalJson(value));
}

function nowIso() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

module.exports = {
  assertInsideRoot,
  assertInsideWorkspace,
  assertSafeId,
  canonicalJson,
  ACTIVE_BOUNDARY_DIR,
  MDOS_ROOT,
  nowIso,
  parseLimit,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
  WORKSPACE_ROOT,
};
