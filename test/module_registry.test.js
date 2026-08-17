#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function runNode(args) {
  return spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
}

function parseLastJson(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

test('module registry builder compiles module, capability, CLI, and MCP readback', () => {
  const result = runNode([path.join(REPO_ROOT, 'md-os/os/build_module_registry.js')]);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseLastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'build_module_registry');
  assert.equal(payload.module_count, 3);
  assert.equal(payload.capability_count, 3);

  const registryPath = path.join(REPO_ROOT, 'md-os/ops/modules/registry.json');
  const capabilityPath = path.join(REPO_ROOT, 'md-os/ops/runtime/module_capability_index.json');
  const cliPath = path.join(REPO_ROOT, 'md-os/ops/runtime/cli_commands.json');
  const mcpPath = path.join(REPO_ROOT, 'md-os/ops/runtime/mcp_tools.json');

  assert.ok(fs.existsSync(registryPath));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, 'md-os/ops/modules/registry.md')));
  assert.ok(fs.existsSync(capabilityPath));
  assert.ok(fs.existsSync(cliPath));
  assert.ok(fs.existsSync(mcpPath));

  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.deepEqual(registry.modules.map((item) => item.module_id), [
    'connector.api',
    'connector.terminal',
    'runtime.control-console',
  ]);
  assert.ok(registry.capabilities.some((item) => item.capability_id === 'terminal.run_allowlisted'));
  assert.ok(registry.capabilities.some((item) => item.capability_id === 'api.request_allowlisted'));
  assert.ok(registry.capabilities.some((item) => item.capability_id === 'interaction.control_console'));
  assert.ok(registry.cli_commands.some((item) => item.command === 'connector terminal list'));
  assert.ok(registry.mcp_tools.some((item) => item.name === 'mdos_connector_terminal_list'));
});

test('mdos module and capability commands read from the module registry', () => {
  const moduleResult = runNode([path.join(REPO_ROOT, 'md-os/os/mdos.js'), 'module', 'list']);
  assert.equal(moduleResult.status, 0, moduleResult.stderr);
  const modules = parseLastJson(moduleResult.stdout);
  assert.equal(modules.ok, true);
  assert.ok(modules.modules.some((item) => item.module_id === 'connector.terminal'));
  assert.ok(modules.modules.some((item) => item.module_id === 'runtime.control-console'));

  const capabilityResult = runNode([path.join(REPO_ROOT, 'md-os/os/mdos.js'), 'capability', 'list']);
  assert.equal(capabilityResult.status, 0, capabilityResult.stderr);
  const capabilities = parseLastJson(capabilityResult.stdout);
  assert.equal(capabilities.ok, true);
  assert.ok(capabilities.capabilities.some((item) => item.capability_id === 'api.request_allowlisted'));
});

test('registered connector CLI command routes through module runtime', () => {
  const result = runNode([path.join(REPO_ROOT, 'md-os/os/mdos.js'), 'connector', 'terminal', 'list']);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseLastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'terminal_connector_list');
});

test('MCP server exposes and calls generated module tools', () => {
  const listResult = runNode([path.join(REPO_ROOT, 'md-os/os/mcp_server.js'), '--list-tools']);
  assert.equal(listResult.status, 0, listResult.stderr);
  const listed = parseLastJson(listResult.stdout);
  const toolNames = listed.tools.map((item) => item.name);
  assert.ok(toolNames.includes('mdos_connector_terminal_list'));
  assert.ok(toolNames.includes('mdos_connector_api_run'));

  const { callTool } = require('../md-os/os/mcp_server');
  const result = callTool('mdos_connector_terminal_list', {});
  const payload = JSON.parse(result.content[0].text);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'module_mcp_tool_call');
  assert.equal(payload.output.mode, 'terminal_connector_list');
});
