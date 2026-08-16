#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  AUTH_FAILURE,
  HOST_BACKEND_ID,
  MODEL_PATCH_RESPONSE_SCHEMA,
  applyNoToolPatch,
  hostCodexArgs,
  hostEnvironment,
  parseNoToolCodexEvents,
  parsePatchResponse,
  runVerifier,
} = require('../md-os/kernel/cognition/apfc_open_world_host_backend');

test('host-native backend uses ephemeral model-only Codex sessions', () => {
  const args = hostCodexArgs({ workspace: '/bounded/repo', model: 'gpt-5.4', prompt: 'canary' });
  assert.equal(HOST_BACKEND_ID, 'host_native_no_tool_ephemeral_v2');
  assert.ok(args.includes('--ephemeral'));
  assert.ok(args.includes('--ignore-user-config'));
  assert.equal(args.includes('workspace-write'), false);
  assert.equal(args.includes('shell_tool'), true);
  assert.equal(args.includes('unified_exec'), true);
  assert.equal(args.includes('--output-schema'), true);
  assert.equal(args.includes(MODEL_PATCH_RESPONSE_SCHEMA), true);
  assert.equal(args.some((item) => item === 'danger-full-access'), false);
});

test('no-tool event parser extracts one structured answer and detects tool use', () => {
  const clean = parseNoToolCodexEvents([
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
    JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: '{"patch":"diff --git a/a b/a\\n"}' } }),
    JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1 } }),
  ].join('\n'));
  assert.equal(clean.thread_id, 'thread-1');
  assert.equal(clean.tool_event_types.length, 0);
  assert.equal(parsePatchResponse(clean.final_text).patch.startsWith('diff --git '), true);
  const dirty = parseNoToolCodexEvents(JSON.stringify({
    type: 'item.completed', item: { type: 'command_execution', command: 'pwd' },
  }));
  assert.deepEqual(dirty.tool_event_types, ['command_execution']);
});

test('runner applies a bounded production patch and rejects test paths', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', 'md-os', 'ops', 'local', 'test-apfc-no-tool-patch-'));
  fs.writeFileSync(path.join(root, 'answer.txt'), 'WRONG\n');
  fs.writeFileSync(path.join(root, 'test_answer.py'), 'sealed\n');
  const init = require('node:child_process').spawnSync('git', ['init', '--quiet'], { cwd: root });
  assert.equal(init.status, 0);
  const patch = 'diff --git a/answer.txt b/answer.txt\n--- a/answer.txt\n+++ b/answer.txt\n@@ -1 +1 @@\n-WRONG\n+AUTH_OK\n';
  assert.deepEqual(applyNoToolPatch({ repo: root, patchText: patch }), ['answer.txt']);
  assert.equal(fs.readFileSync(path.join(root, 'answer.txt'), 'utf8'), 'AUTH_OK\n');
  const forbidden = 'diff --git a/test_answer.py b/test_answer.py\n--- a/test_answer.py\n+++ b/test_answer.py\n@@ -1 +1 @@\n-sealed\n+changed\n';
  assert.throws(() => applyNoToolPatch({ repo: root, patchText: forbidden }), /FORBIDDEN_TEST_PATH/);
  fs.rmSync(root, { recursive: true, force: true });
});

test('host-native environment removes host colour state and prepends only the task venv', () => {
  const env = hostEnvironment({ PATH: '/usr/bin', NO_COLOR: '1', FORCE_COLOR: '1' }, '/task/venv/bin');
  assert.equal(env.NO_COLOR, undefined);
  assert.equal(env.FORCE_COLOR, undefined);
  assert.equal(env.TERM, 'xterm-256color');
  assert.equal(env.PATH, `/task/venv/bin${path.delimiter}/usr/bin`);
});

test('authentication failure detector recognizes an unauthorized model session', () => {
  assert.equal(AUTH_FAILURE.test('unexpected status 401 Unauthorized'), true);
  assert.equal(AUTH_FAILURE.test('normal verified result'), false);
});

test('host verifier preserves the task venv PATH instead of loading the host login profile', () => {
  const root = fs.mkdtempSync(path.join(__dirname, '..', 'md-os', 'ops', 'local', 'test-apfc-host-verifier-'));
  const bin = path.join(root, 'venv', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  const marker = path.join(root, 'marker');
  const command = path.join(bin, 'sealed-check');
  fs.writeFileSync(command, `#!/bin/sh\nprintf task-venv > ${JSON.stringify(marker)}\n`, { mode: 0o755 });
  const result = runVerifier({ repo: root, venvBin: bin, testCommand: 'sealed-check', timeoutMs: 10_000 });
  assert.equal(result.exit_status, 0);
  assert.equal(fs.readFileSync(marker, 'utf8'), 'task-venv');
  fs.rmSync(root, { recursive: true, force: true });
});

test('host-native no-tool schemas are present and backend-specific', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'md-os', 'schemas', 'apfc_no_tool_backend_preflight.schema.json',
  ), 'utf8'));
  assert.equal(schema.properties.backend_id.const, HOST_BACKEND_ID);
  assert.equal(schema.properties.receipt_type.const, 'apfc_no_tool_backend_preflight');
  const canary = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'md-os', 'schemas', 'apfc_no_tool_codex_canary_receipt.schema.json',
  ), 'utf8'));
  assert.equal(canary.properties.backend_id.const, HOST_BACKEND_ID);
  const response = JSON.parse(fs.readFileSync(MODEL_PATCH_RESPONSE_SCHEMA, 'utf8'));
  assert.deepEqual(response.required, ['patch']);
});
