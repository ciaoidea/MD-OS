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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-programs-'));
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function runScript(workspaceRoot, scriptName, args = []) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('compile_programs compiles structured Markdown programs deterministically', () => {
  const workspace = makeWorkspace();
  const programFile = path.join(workspace, 'md-os/ops/programs/urgent_ticket_triage.md');
  writeText(programFile, [
    '# Program: urgent_ticket_triage',
    '',
    '## Trigger',
    '',
    'When a new urgent ticket appears for an active project.',
    '',
    '## Conditions',
    '',
    '- The ticket must reference a known project.',
    '- Never execute destructive commands.',
    '',
    '## Actions',
    '',
    '- Create or update a work item.',
    '- Mark priority as high.',
    '',
    '## Output',
    '',
    '- work item',
    '- agenda update',
    '- journal event',
    '',
  ].join('\n'));

  const result = runScript(workspace, 'compile_programs.js');
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.program_count, 1);

  const compiled = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/compiled/programs.json'), 'utf8'));
  assert.equal(compiled.schema_version, 1);
  assert.equal(compiled.program_count, 1);
  assert.equal(compiled.programs[0].program_id, 'urgent_ticket_triage');
  assert.deepEqual(compiled.programs[0].actions, [
    'Create or update a work item.',
    'Mark priority as high.',
  ]);
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/compiled/programs.md')));

  const second = runScript(workspace, 'compile_programs.js');
  assert.equal(second.status, 0, second.stderr);
  const secondPayload = JSON.parse(second.stdout.trim());
  assert.equal(secondPayload.source_hash, payload.source_hash);
});
