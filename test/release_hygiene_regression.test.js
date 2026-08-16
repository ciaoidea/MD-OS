#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function readRepoText(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-release-hygiene-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function openwaProfile() {
  return {
    schema_version: 1,
    connector_id: 'openwa_whatsapp_gateway',
    project_id: 'whatsapp_gateway',
    openwa: {
      base_url_env: 'OPENWA_BASE_URL',
      api_key_env: 'OPENWA_API_KEY',
      session_id_env: 'OPENWA_SESSION_ID',
      webhook_url_env: 'OPENWA_WEBHOOK_URL',
      webhook_secret_env: 'OPENWA_WEBHOOK_SECRET',
    },
    security: {
      mode: 'allowlist_and_command_prefix',
      allowed_chat_ids: [],
      command_prefix: '@mdos',
      require_command_prefix: true,
      max_text_chars: 20000,
      redact_patterns: ['api_key=', 'token=', 'secret=', 'authorization:', 'password='],
    },
    paths: {
      local_runtime_dir: 'md-os/ops/local/openwa_whatsapp',
      connector_snapshots_dir: 'md-os/ops/sources/connectors',
    },
    routing: {
      schema_version: 1,
      role: 'example_profile',
      default_route_alias: 'workspace',
    },
  };
}

test('.gitignore protects active md-os runtime state', () => {
  const gitignore = readRepoText('.gitignore');

  assert.match(gitignore, /^md-os\/ops\/\*$/m);
  assert.match(gitignore, /^!md-os\/ops\/\.gitkeep$/m);
  assert.match(gitignore, /^mcp\/ops\/\*$/m);
});

test('session recovery delegates to declared bootstrap launcher', () => {
  const recovery = readRepoText('session-recovery.sh');

  assert.match(recovery, /bootstrap-md-os-codex\.sh" resume/);
  assert.doesNotMatch(recovery, /dangerously-bypass-approvals-and-sandbox/);
});

test('OpenWA release files do not contain private host paths', () => {
  const checkedFiles = [
    'md-os/os/openwa_whatsapp_connector.js',
    'md-os/os/openwa_whatsapp_channel.sh',
    'md-os/os/openwa_whatsapp_service.js',
    'md-os/examples/connectors/openwa_whatsapp_connector.json',
  ];
  const privatePathPattern = /\/home\/[^/]+|\/Users\/[^/]+|[A-Za-z]:\\Users\\/;

  for (const relativePath of checkedFiles) {
    assert.doesNotMatch(readRepoText(relativePath), privatePathPattern, relativePath);
  }
});

test('OpenWA connector defaults Codex execution to workspace-write sandbox', () => {
  const workspace = makeWorkspace();
  writeJson(
    path.join(workspace, 'md-os/ops/connectors/openwa_whatsapp_connector.json'),
    openwaProfile()
  );

  const result = spawnSync(process.execPath, [
    path.join(REPO_ROOT, 'md-os/os/openwa_whatsapp_connector.js'),
    'status',
  ], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
      OPENWA_CODEX_SANDBOX: '',
    },
  });

  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.bridge.codex_sandbox, 'workspace-write');
});
