#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-mcp-server-'));
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/state.json'), JSON.stringify({
    schema_version: 1,
    mode: 'healthy',
    boundary: 'md-os',
    architecture: 'text_native_natural_language_agentic_os',
  }, null, 2), 'utf8');
  return workspace;
}

function startServer(workspace) {
  const child = spawn(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mcp_server.js')], {
    cwd: workspace,
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  let stdoutBuffer = '';
  let stderrBuffer = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    while (stdoutBuffer.includes('\n')) {
      const index = stdoutBuffer.indexOf('\n');
      const line = stdoutBuffer.slice(0, index).trim();
      stdoutBuffer = stdoutBuffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (waiter) {
        pending.delete(message.id);
        waiter.resolve(message);
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrBuffer += chunk.toString('utf8');
  });

  function request(method, params = {}) {
    const id = pending.size + 1 + Date.now();
    const payload = { jsonrpc: '2.0', id, method, params };
    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`MCP_RESPONSE_TIMEOUT: ${method}\n${stderrBuffer}`));
      }, 5000);
      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
      });
    });
  }

  function close() {
    child.stdin.end();
    child.kill();
  }

  return { child, close, request };
}

test('MCP server exposes initialize, resources, and tools over stdio JSON-RPC', async () => {
  const workspace = makeWorkspace();
  const server = startServer(workspace);
  try {
    const initialized = await server.request('initialize', {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'mdos-test', version: '0.0.0' },
      capabilities: {},
    });
    assert.equal(initialized.error, undefined);
    assert.equal(initialized.result.serverInfo.name, 'md-os-apfc');
    assert.equal(initialized.result.protocolVersion, '2025-06-18');
    assert.deepEqual(Object.keys(initialized.result.capabilities).sort(), ['resources', 'tools']);

    const resources = await server.request('resources/list');
    assert.equal(resources.error, undefined);
    assert.ok(resources.result.resources.some((item) => item.uri === 'mdos://ops/state'));

    const state = await server.request('resources/read', { uri: 'mdos://ops/state' });
    assert.equal(state.error, undefined);
    assert.equal(state.result.contents[0].mimeType, 'application/json');
    assert.match(state.result.contents[0].text, /text_native_natural_language_agentic_os/);

    const tools = await server.request('tools/list');
    assert.equal(tools.error, undefined);
    const toolNames = tools.result.tools.map((item) => item.name);
    assert.ok(toolNames.includes('mdos_replay'));
    assert.ok(toolNames.includes('mdos_compile_programs'));
    assert.ok(toolNames.includes('mdos_archive_runtime_state'));
    assert.ok(toolNames.includes('mdos_hardware_bootstrap'));
    assert.ok(toolNames.includes('mdos_hardware_clean'));
    assert.ok(toolNames.includes('mdos_hardware_control'));
    assert.ok(toolNames.includes('mdos_software_bootstrap'));
    assert.ok(toolNames.includes('mdos_software_clean'));
    assert.ok(toolNames.includes('mdos_continuity_status'));
    assert.ok(toolNames.includes('mdos_continuity_start'));
    assert.ok(toolNames.includes('mdos_continuity_stop'));
    assert.ok(toolNames.includes('mdos_propose_change'));
    assert.ok(toolNames.includes('mdos_register_signal'));
    assert.ok(toolNames.includes('mdos_api_run'));
    assert.ok(toolNames.includes('mdos_wolfram_bootstrap'));
    assert.ok(toolNames.includes('mdos_wolfram_run'));
  } finally {
    server.close();
  }
});
