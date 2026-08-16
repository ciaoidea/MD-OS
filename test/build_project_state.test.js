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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-build-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runScript(workspaceRoot, script, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, script), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('rejects unsafe project ids before filesystem access', () => {
  const workspace = makeWorkspace();
  const result = runScript(workspace, 'md-os/os/build_project_state.js', ['../x']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /INVALID_PROJECT_ID/);
});

test('manual signal becomes a work item with source hash metadata', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/projects/demo_project/project.json'), {
    schema_version: 1,
    project_id: 'demo_project',
    title: 'Demo Project',
    owner: 'Operator',
    description: 'Temporary test project',
  });
  writeJson(path.join(workspace, 'md-os/ops/sources/manual/demo_project.json'), {
    schema_version: 1,
    connector_name: 'manual',
    connector_kind: 'manual',
    project_id: 'demo_project',
    captured_at: '2026-04-24T18:00:00Z',
    signals: [
      {
        source_id: 'manual_signal_001',
        captured_at: '2026-04-24T18:00:00Z',
        summary: 'Review the temporary project state.',
        status_hint: 'open',
        priority: 'high',
        entities: ['runtime_state'],
        tags: ['test'],
        suspected_causes: [],
        depends_on: [],
        next_step: 'Inspect generated state.',
        external_parties: [],
      },
    ],
  });

  const result = runScript(workspace, 'md-os/os/build_project_state.js', ['demo_project']);
  assert.equal(result.status, 0, result.stderr);

  const workItems = fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/work_items.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(workItems.length, 1);
  assert.equal(workItems[0].id, 'wi_manual_signal_001');
  assert.deepEqual(workItems[0].source_refs, ['manual_signal_001']);

  const status = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/status.json'), 'utf8'));
  assert.equal(status.summary.open_count, 1);
  assert.match(status.source_hash, /^[a-f0-9]{64}$/);
});

test('project builder normalizes work item states across agenda and memory views', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/projects/demo_project/project.json'), {
    schema_version: 1,
    project_id: 'demo_project',
    title: 'Demo Project',
    owner: 'Operator',
    description: 'State machine test project',
  });
  writeJson(path.join(workspace, 'md-os/ops/sources/manual/demo_project.json'), {
    schema_version: 1,
    connector_name: 'manual',
    connector_kind: 'manual',
    project_id: 'demo_project',
    captured_at: '2026-04-24T18:00:00Z',
    signals: [
      {
        source_id: 'manual_done_001',
        captured_at: '2026-04-24T18:00:00Z',
        summary: 'Completed historical item.',
        status_hint: 'closed',
        priority: 'medium',
        entities: ['historical_entity'],
        tags: [],
        suspected_causes: [],
        depends_on: [],
        external_parties: [],
      },
      {
        source_id: 'manual_wait_001',
        captured_at: '2026-04-24T18:01:00Z',
        summary: 'External party follow-up is pending.',
        status_hint: 'pending_vendor',
        priority: 'high',
        entities: ['active_entity'],
        tags: [],
        suspected_causes: [],
        depends_on: [],
        external_parties: ['Legal'],
      },
    ],
  });

  const result = runScript(workspace, 'md-os/os/build_project_state.js', ['demo_project']);
  assert.equal(result.status, 0, result.stderr);

  const workItems = fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/work_items.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.deepEqual(workItems.map((item) => item.state).sort(), ['done', 'waiting_external']);

  const agenda = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/agenda.json'), 'utf8'));
  assert.equal(agenda.item_count, 1);
  assert.equal(agenda.items[0].id, 'wi_manual_wait_001');

  const priorityQueue = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/priority_queue.json'), 'utf8'));
  assert.deepEqual(priorityQueue.buckets.done, ['wi_manual_done_001']);
  assert.deepEqual(priorityQueue.buckets.watch_waiting_external, ['wi_manual_wait_001']);

  const activeMemory = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/projects/demo_project/active_memory.json'), 'utf8'));
  assert.deepEqual(activeMemory.entities.map((item) => item.entity), ['active_entity']);
});
