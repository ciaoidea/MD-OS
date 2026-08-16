#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-archive-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeNdjson(filePath, records) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${records.map((record) => JSON.stringify(record)).join('\n')}\n`, 'utf8');
}

function runScript(workspaceRoot) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/archive_runtime_state.js')], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('builds active summary and terminal archive without mutating work items', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/projects/demo_project/project.json'), {
    schema_version: 1,
    project_id: 'demo_project',
    title: 'Demo Project',
  });
  const workItems = [
    { id: 'wi_open', title: 'Open item', state: 'open', priority: 'high' },
    { id: 'wi_done', title: 'Done item', state: 'done', priority: 'low' },
    { id: 'wi_cancelled', title: 'Cancelled item', state: 'cancelled', priority: 'low' },
  ];
  const workItemsFile = path.join(workspace, 'md-os/ops/projects/demo_project/work_items.ndjson');
  writeNdjson(workItemsFile, workItems);
  const before = fs.readFileSync(workItemsFile, 'utf8');

  const result = runScript(workspace);
  assert.equal(result.status, 0, result.stderr);

  const activeSummary = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/summary/active_work_items.json'), 'utf8'));
  assert.equal(activeSummary.active_count, 1);
  assert.equal(activeSummary.terminal_count, 2);
  assert.equal(activeSummary.active_items[0].id, 'wi_open');

  const terminalItems = fs.readFileSync(path.join(workspace, 'md-os/ops/archive/projects/demo_project/terminal_work_items.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(terminalItems.map((item) => item.id), ['wi_done', 'wi_cancelled']);
  assert.equal(fs.readFileSync(workItemsFile, 'utf8'), before);
});
