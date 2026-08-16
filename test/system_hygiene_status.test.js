#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function writeJson(filePath, payload) {
  writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`);
}

test('system hygiene excludes Graphify cache and recognizes benchmark check roles', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-hygiene-'));
  const graphifyPath = 'graphify-out/cache/stat-index.json';
  const regressionPaths = [
    'md-os/benchmarks/software_repair/fixtures/alpha/checks/regression.check.js',
    'md-os/benchmarks/software_repair/fixtures/beta/checks/regression.check.js',
  ];
  const targetedPaths = [
    'md-os/benchmarks/software_repair/fixtures/alpha/checks/targeted.check.js',
    'md-os/benchmarks/software_repair/fixtures/beta/checks/targeted.check.js',
  ];
  const paths = [graphifyPath, ...regressionPaths, ...targetedPaths];
  const syntheticHostPath = path.join(path.sep, 'home', 'example', 'private');
  for (const relativePath of paths) {
    writeFile(
      path.join(workspace, relativePath),
      relativePath === graphifyPath ? `${JSON.stringify({ root: syntheticHostPath })}\n` : '// fixture-specific oracle\n',
    );
  }
  writeFile(path.join(workspace, '.mdosignore'), 'graphify-out/\n');
  writeJson(path.join(workspace, 'md-os/ops/global_index.json'), { schema_version: 1, ops: {} });
  writeJson(path.join(workspace, 'md-os/ops/workspace_inventory.json'), {
    schema_version: 1,
    source_hash: 'inventory',
    files: paths.map((relativePath) => ({
      path: relativePath,
      extension: path.extname(relativePath),
      size_bytes: fs.statSync(path.join(workspace, relativePath)).size,
    })),
    duplicate_basenames: [],
    exact_content_duplicates: [],
    logical_merge_candidates: [
      { key: '.js:regression.check.js', paths: regressionPaths },
      { key: '.js:targeted.check.js', paths: targetedPaths },
    ],
  });

  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/build_system_hygiene_status.js')], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
  assert.equal(result.status, 0, result.stderr);

  const status = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/system_hygiene_status.json'), 'utf8'));
  assert.equal(status.cleanliness.status, 'ok');
  assert.equal(status.efficiency.status, 'ok');
  assert.equal(status.cleanliness.logical_merge_candidate_groups, 0);
  assert.equal(status.publication.local_path_file_count, 0);
  assert.ok(status.publication.ignored_files.includes(graphifyPath));
});
