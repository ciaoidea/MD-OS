#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  assertSafeId,
  nowIso,
  printJson,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJsonLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorSnapshot } = require('./lib/validation');

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'filesystem_connector.json');
const SNAPSHOT_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const ARTIFACT_DIR = path.join(MDOS_ROOT, 'ops', 'artifacts', 'filesystem');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function usage() {
  process.stderr.write('Usage:\n  node md-os/os/filesystem_connector.js list\n  node md-os/os/filesystem_connector.js run <project_id> <scan_id>\n');
  process.exit(1);
}

function safeSlug(value) {
  return shortText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'item';
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(PROFILE_FILE)}`);
  const profile = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  if (profile.schema_version !== 1) throw new Error(`UNSUPPORTED_FILESYSTEM_CONNECTOR_SCHEMA_VERSION: ${profile.schema_version}`);
  assertSafeId(profile.connector_id || 'filesystem_connector', 'connector_id');
  if (!Array.isArray(profile.scans)) throw new Error('FILESYSTEM_SCANS_MUST_BE_ARRAY');
  return profile;
}

function isAllowed(targetPath, allowedRoots) {
  const resolved = assertInsideWorkspace(targetPath);
  if (!Array.isArray(allowedRoots) || !allowedRoots.length) return resolved;
  const allowed = allowedRoots.map((item) => assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(item || '.'))));
  if (!allowed.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))) {
    throw new Error(`FILESYSTEM_PATH_NOT_ALLOWED: ${rel(resolved)}`);
  }
  return resolved;
}

function collectFiles(rootPath, options) {
  const maxFiles = Number.isFinite(options.max_files) ? options.max_files : 200;
  const maxBytes = Number.isFinite(options.max_file_bytes) ? options.max_file_bytes : 250000;
  const exclude = new Set((options.exclude_prefixes || ['.git/', 'node_modules/']).map(shortText));
  const files = [];
  const stack = [rootPath];
  while (stack.length && files.length < maxFiles) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      const relative = rel(fullPath);
      if ([...exclude].some((prefix) => relative.startsWith(prefix))) continue;
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = fs.statSync(fullPath);
      files.push({
        path: relative,
        size_bytes: stats.size,
        extension: path.extname(entry.name).toLowerCase() || '[no_ext]',
        sha256: stats.size <= maxBytes ? sha256Text(fs.readFileSync(fullPath)) : null,
        hash_skipped: stats.size > maxBytes,
      });
      if (files.length >= maxFiles) break;
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function list(profile) {
  printJson({
    ok: true,
    mode: 'filesystem_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'filesystem_connector', 'connector_id'),
    scan_count: profile.scans.length,
    scans: profile.scans.map((scan) => ({
      scan_id: shortText(scan.scan_id),
      path: shortText(scan.path),
      summary: shortText(scan.summary || ''),
      risk_level: shortText(scan.risk_level || 'low'),
    })),
  });
}

function run(profile, projectId, scanId) {
  const scan = profile.scans.find((item) => shortText(item.scan_id) === scanId);
  if (!scan) throw new Error(`UNKNOWN_FILESYSTEM_SCAN_ID: ${scanId}`);
  const targetPath = isAllowed(path.resolve(WORKSPACE_ROOT, shortText(scan.path || '.')), profile.allowed_roots);
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');
  const files = collectFiles(targetPath, scan);
  ensureDir(SNAPSHOT_DIR);
  ensureDir(ARTIFACT_DIR);

  const artifactPath = path.join(ARTIFACT_DIR, `${safeSlug(projectId)}__${safeSlug(scanId)}__${stamp}.json`);
  const artifact = {
    schema_version: 1,
    connector_name: 'filesystem_connector',
    scan_id: scanId,
    project_id: projectId,
    captured_at: ts,
    root: rel(targetPath) || '.',
    file_count: files.length,
    files,
  };
  atomicWriteJsonLocked(artifactPath, artifact, { context: `filesystem_artifact:${scanId}` });

  const snapshotPath = path.join(SNAPSHOT_DIR, `${safeSlug(projectId)}__filesystem__${safeSlug(scanId)}.json`);
  const snapshot = {
    schema_version: 1,
    connector_name: 'filesystem_connector',
    connector_kind: 'filesystem',
    project_id: projectId,
    captured_at: ts,
    signals: [
      {
        source_id: assertSafeId(`filesystem_${safeSlug(scanId)}_${stamp.replace(/[^A-Za-z0-9_-]/g, '_')}`.slice(0, 81), 'source_id'),
        captured_at: ts,
        title: shortText(scan.title || `Filesystem scan ${scanId}`),
        summary: shortText(scan.summary || `Filesystem scan captured ${files.length} file(s) under ${rel(targetPath) || '.'}.`),
        status_hint: 'open',
        priority: shortText(scan.priority || 'low').toLowerCase(),
        owner_hint: shortText(scan.owner_hint || 'Platform Operations'),
        entities: Array.isArray(scan.entities) ? scan.entities.map(shortText).filter(Boolean) : ['filesystem'],
        tags: Array.isArray(scan.tags) ? scan.tags.map(shortText).filter(Boolean) : ['filesystem'],
        suspected_causes: [],
        depends_on: [],
        next_step: shortText(scan.next_step || 'Inspect filesystem snapshot and decide whether follow-up work is needed.'),
        external_parties: [],
        connector_runtime: {
          scan_id: scanId,
          root: rel(targetPath) || '.',
          file_count: files.length,
          artifact_file: rel(artifactPath),
          output_sha256: sha256Text(JSON.stringify(files)),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, { context: `filesystem_snapshot:${projectId}:${scanId}` });
  appendJournal({
    event: 'filesystem_connector_run',
    connector_id: 'filesystem_connector',
    project_id: projectId,
    scan_id: scanId,
    risk_level: shortText(scan.risk_level || 'low'),
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
  printJson({
    ok: true,
    mode: 'filesystem_connector_run',
    project_id: projectId,
    scan_id: scanId,
    file_count: files.length,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
}

function main() {
  const profile = readProfile();
  const command = process.argv[2];
  if (command === 'list') return list(profile);
  if (command === 'run') {
    if (!process.argv[3] || !process.argv[4]) usage();
    return run(profile, assertSafeId(process.argv[3], 'project_id'), assertSafeId(process.argv[4], 'scan_id'));
  }
  usage();
}

if (require.main === module) main();

module.exports = { collectFiles };
