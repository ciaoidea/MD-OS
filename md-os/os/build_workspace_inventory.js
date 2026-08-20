#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OUTPUT_JSON = path.join(MDOS_ROOT, 'ops', 'workspace_inventory.json');
const OUTPUT_MD = path.join(MDOS_ROOT, 'ops', 'workspace_inventory.md');
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.cache', 'graphify-out', '.venv', 'venv']);
const SKIPPED_PATH_PREFIXES = ['md-os/ops/local/'];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function writeJson(filePath, payload) {
  atomicWriteJson(filePath, payload);
}

function writeText(filePath, text) {
  atomicWriteText(filePath, text);
}

function collectFilesRecursive(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        const relativeDir = `${rel(fullPath).replace(/\\/g, '/').replace(/\/$/, '')}/`;
        if (SKIPPED_PATH_PREFIXES.some((prefix) => relativeDir.startsWith(prefix))) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relative = rel(fullPath);
      const stats = fs.statSync(fullPath);
      const ext = path.extname(entry.name).toLowerCase() || '[no_ext]';
      const topLevel = relative.split(path.sep)[0] || '.';
      const contentHash = crypto.createHash('sha1').update(fs.readFileSync(fullPath)).digest('hex');
      files.push({
        path: relative,
        basename: entry.name,
        size_bytes: stats.size,
        extension: ext,
        top_level: topLevel,
        normalized_key: buildNormalizedKey(entry.name),
        sha1: contentHash,
      });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function summarizeBy(files, key) {
  const map = new Map();
  for (const file of files) {
    const value = file[key];
    const current = map.get(value) || { count: 0, size_bytes: 0 };
    current.count += 1;
    current.size_bytes += file.size_bytes;
    map.set(value, current);
  }
  return Array.from(map.entries())
    .map(([name, data]) => ({
      name,
      count: data.count,
      size_bytes: data.size_bytes,
    }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.name.localeCompare(right.name);
    });
}

function buildNormalizedKey(filename) {
  return String(filename || '')
    .toLowerCase()
    .replace(/\.bak\.[0-9a-z._-]+$/i, '')
    .replace(/(\.example|\.sample|\.template)(?=\.)/g, '')
    .replace(/(_detailed|_detail|_copy|_backup|_old|_legacy|_last|_history)(?=\.)/g, '')
    .replace(/[-\s]+/g, '_');
}

function buildGroupedDuplicates(files, keySelector, { minGroupSize = 2, minFileSize = 1 } = {}) {
  const groups = new Map();
  for (const file of files) {
    if (file.size_bytes < minFileSize) continue;
    const key = keySelector(file);
    const current = groups.get(key) || [];
    current.push(file);
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .filter(([, group]) => group.length >= minGroupSize)
    .map(([key, group]) => ({
      key,
      file_count: group.length,
      total_size_bytes: group.reduce((sum, file) => sum + file.size_bytes, 0),
      paths: group.map((file) => file.path).sort(),
    }))
    .sort((left, right) => {
      if (right.file_count !== left.file_count) return right.file_count - left.file_count;
      return left.key.localeCompare(right.key);
    });
}

function detectNotableBuckets(files) {
  const buckets = [];
  const findByPrefix = (prefix) => files.filter((file) => file.path.startsWith(prefix));

  const obsidianFiles = files.filter((file) => file.path.includes('/.obsidian/') || file.path.startsWith('.obsidian/'));
  if (obsidianFiles.length) {
    buckets.push({
      label: 'obsidian_metadata',
      file_count: obsidianFiles.length,
      paths: obsidianFiles.map((file) => file.path),
    });
  }

  const opsArtifacts = findByPrefix('md-os/ops/artifacts/');
  if (opsArtifacts.length) {
    buckets.push({
      label: 'ops_artifacts',
      file_count: opsArtifacts.length,
      paths: opsArtifacts.map((file) => file.path),
    });
  }

  const serviceLogs = findByPrefix('md-os/ops/services/').filter((file) => (
    file.path.endsWith('.log')
    || file.path.endsWith('.pid')
    || file.path.endsWith('.status.json')
    || file.path.endsWith('.stop.json')
  ));
  if (serviceLogs.length) {
    buckets.push({
      label: 'service_runtime_files',
      file_count: serviceLogs.length,
      paths: serviceLogs.map((file) => file.path),
    });
  }

  const rootSsh = findByPrefix('.ssh/');
  if (rootSsh.length) {
    buckets.push({
      label: 'root_ssh_material',
      file_count: rootSsh.length,
      paths: rootSsh.map((file) => file.path),
    });
  }

  return buckets;
}

function buildInventory() {
  const files = collectFilesRecursive(WORKSPACE_ROOT);
  const totalSize = files.reduce((sum, file) => sum + file.size_bytes, 0);
  const duplicateBasenames = buildGroupedDuplicates(files, (file) => file.basename);
  const exactContentDuplicates = buildGroupedDuplicates(files, (file) => `${file.size_bytes}:${file.sha1}`);
  const logicalMergeCandidates = buildGroupedDuplicates(
    files.filter((file) => ['.md', '.json', '.ndjson', '.js', '.txt', '.sh'].includes(file.extension)),
    (file) => `${file.extension}:${file.normalized_key}`,
  );

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(files.map((file) => ({
      path: file.path,
      size_bytes: file.size_bytes,
      sha1: file.sha1,
    }))),
    scope_root: rel(WORKSPACE_ROOT) || '.',
    file_count: files.length,
    total_size_bytes: totalSize,
    by_top_level: summarizeBy(files, 'top_level'),
    by_extension: summarizeBy(files, 'extension'),
    notable_buckets: detectNotableBuckets(files),
    duplicate_basenames: duplicateBasenames,
    exact_content_duplicates: exactContentDuplicates,
    logical_merge_candidates: logicalMergeCandidates,
    files,
  };
}

function buildMarkdown(inventory) {
  const lines = [
    '# Workspace Inventory',
    '',
    `Updated at: \`${inventory.updated_at}\``,
    '',
    `Root: \`${inventory.scope_root}\``,
    '',
    `Total files: \`${inventory.file_count}\``,
    '',
    `Total size: \`${inventory.total_size_bytes}\` bytes`,
    '',
    '## Top Level',
    '',
  ];

  for (const item of inventory.by_top_level) {
    lines.push(`- \`${item.name}\`: \`${item.count}\` file | \`${item.size_bytes}\` byte`);
  }

  lines.push('', '## Extensions', '');
  for (const item of inventory.by_extension.slice(0, 20)) {
    lines.push(`- \`${item.name}\`: \`${item.count}\` file | \`${item.size_bytes}\` byte`);
  }

  lines.push('', '## Notable Buckets', '');
  if (!inventory.notable_buckets.length) {
    lines.push('- No notable buckets detected.');
  } else {
    for (const bucket of inventory.notable_buckets) {
      lines.push(`- \`${bucket.label}\`: \`${bucket.file_count}\` file`);
    }
  }

  lines.push('', `## Duplicate Basenames (\`${inventory.duplicate_basenames.length}\`)`, '');
  if (!inventory.duplicate_basenames.length) {
    lines.push('- No duplicate basenames detected.');
  } else {
    for (const item of inventory.duplicate_basenames.slice(0, 30)) {
      lines.push(`- \`${item.key}\`: \`${item.file_count}\` file`);
    }
  }

  lines.push('', `## Exact Content Duplicates (\`${inventory.exact_content_duplicates.length}\`)`, '');
  if (!inventory.exact_content_duplicates.length) {
    lines.push('- No exact content duplicates detected.');
  } else {
    for (const item of inventory.exact_content_duplicates.slice(0, 30)) {
      lines.push(`- \`${item.key}\`: \`${item.file_count}\` file`);
    }
  }

  lines.push('', `## Logical Merge Candidates (\`${inventory.logical_merge_candidates.length}\`)`, '');
  if (!inventory.logical_merge_candidates.length) {
    lines.push('- No logical merge candidates detected.');
  } else {
    for (const item of inventory.logical_merge_candidates.slice(0, 40)) {
      lines.push(`- \`${item.key}\`: \`${item.file_count}\` file`);
    }
  }

  lines.push('', '## Full File List', '');
  for (const file of inventory.files) {
    lines.push(`- \`${file.path}\` | \`${file.size_bytes}\` byte`);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const inventory = buildInventory();
  withFileLock('builder__workspace_inventory', {
    context: 'build_workspace_inventory',
    timeoutMs: 120000,
    staleMs: 900000,
  }, () => {
    writeJson(OUTPUT_JSON, inventory);
    writeText(OUTPUT_MD, buildMarkdown(inventory));
  });
  appendJournal({
    event: 'workspace_inventory_rebuilt',
    builder: 'build_workspace_inventory',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    file_count: inventory.file_count,
    total_size_bytes: inventory.total_size_bytes,
    duplicate_basenames: inventory.duplicate_basenames.length,
    exact_content_duplicates: inventory.exact_content_duplicates.length,
    logical_merge_candidates: inventory.logical_merge_candidates.length,
  });
  printJson({
    ok: true,
    mode: 'build_workspace_inventory',
    updated_at: inventory.updated_at,
    file_count: inventory.file_count,
    total_size_bytes: inventory.total_size_bytes,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

main();
