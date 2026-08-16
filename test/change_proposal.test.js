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
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-change-'));
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/continuity.md'), '# Continuity\n\nOriginal.\n', 'utf8');
  return workspace;
}

function runScript(workspaceRoot, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/register_change_proposal.js'), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
      MDOS_WRITER_ID: 'test_writer',
    },
  });
}

test('registers an append-only change proposal under md-os/ops/changes', () => {
  const workspace = makeWorkspace();
  const result = runScript(workspace, ['md-os/ops/continuity.md', 'Clarify the next resume note']);
  assert.equal(result.status, 0, result.stderr);

  const payload = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'register_change_proposal');
  assert.match(payload.change_id, /^chg_[a-f0-9]{24}$/);

  const proposal = JSON.parse(fs.readFileSync(path.join(workspace, payload.proposal_file), 'utf8'));
  assert.equal(proposal.status, 'proposed');
  assert.equal(proposal.target_path, 'md-os/ops/continuity.md');
  assert.equal(proposal.writer_id, 'test_writer');
  assert.match(proposal.target_sha256, /^[a-f0-9]{64}$/);

  const proposals = fs.readFileSync(path.join(workspace, 'md-os/ops/changes/proposals.ndjson'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].change_id, proposal.change_id);
});

test('rejects change proposals outside the MD-OS boundary', () => {
  const workspace = makeWorkspace();
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Root\n', 'utf8');
  const result = runScript(workspace, ['README.md', 'Change public wording']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /CHANGE_TARGET_OUTSIDE_MDOS_BOUNDARY/);
});
