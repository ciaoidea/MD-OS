#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-api-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runApiConnector(workspaceRoot, args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/api_connector.js'), ...args], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

function runApiConnectorAsync(workspaceRoot, args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(REPO_ROOT, 'md-os/os/api_connector.js'), ...args], {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        MDOS_WORKSPACE_ROOT: workspaceRoot,
        MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function startServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      path: req.url,
      title: 'Local API signal',
      token: 'should_not_be_secret',
    }));
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        port: server.address().port,
      });
    });
  });
}

test('api connector writes a snapshot from an allowlisted GET request', async (t) => {
  const workspace = makeWorkspace();
  const { server, port } = await startServer();
  t.after(() => server.close());

  writeJson(path.join(workspace, 'md-os/ops/connectors/api_connector.json'), {
    schema_version: 1,
    connector_id: 'api_adapter',
    allowed_hosts: ['127.0.0.1'],
    default_timeout_ms: 15000,
    max_response_bytes: 10000,
    redact_patterns: ['token'],
    requests: [
      {
        request_id: 'local_status',
        method: 'GET',
        url: `http://127.0.0.1:${port}/status`,
        summary: 'Capture local API status.',
        tags: ['api', 'test'],
        entities: ['local_api'],
      },
    ],
  });

  const result = await runApiConnectorAsync(workspace, ['run', 'demo_project', 'local_status']);
  assert.equal(result.status, 0, result.stderr);

  const snapshotPath = path.join(workspace, 'md-os/ops/sources/connectors/demo_project__api__local_status.json');
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  assert.equal(snapshot.project_id, 'demo_project');
  assert.equal(snapshot.signals.length, 1);
  assert.equal(snapshot.signals[0].connector_runtime.status_code, 200);
  assert.equal(snapshot.signals[0].connector_runtime.ok, true);
  assert.match(snapshot.signals[0].connector_runtime.response_sha256, /^[a-f0-9]{64}$/);
});

test('api connector rejects hosts outside the allowlist', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'md-os/ops/connectors/api_connector.json'), {
    schema_version: 1,
    connector_id: 'api_adapter',
    allowed_hosts: ['api.example.test'],
    requests: [
      {
        request_id: 'blocked',
        method: 'GET',
        url: 'https://not-allowed.example.test/status',
        summary: 'Should not run.',
      },
    ],
  });

  const result = runApiConnector(workspace, ['list']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /API_HOST_NOT_ALLOWED/);
});
