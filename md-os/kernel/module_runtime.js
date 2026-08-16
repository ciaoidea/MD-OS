#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('../os/lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('../os/lib/fs_runtime');
const { appendJournal } = require('../os/lib/journal');

const MODULES_DIR = path.join(MDOS_ROOT, 'modules');
const OPS_MODULES_DIR = path.join(MDOS_ROOT, 'ops', 'modules');
const OPS_RUNTIME_DIR = path.join(MDOS_ROOT, 'ops', 'runtime');

const REGISTRY_JSON = path.join(OPS_MODULES_DIR, 'registry.json');
const REGISTRY_MD = path.join(OPS_MODULES_DIR, 'registry.md');
const MODULE_GRAPH_JSON = path.join(OPS_RUNTIME_DIR, 'module_graph.json');
const MODULE_GRAPH_MD = path.join(OPS_RUNTIME_DIR, 'module_graph.md');
const MODULE_CAPABILITY_INDEX_JSON = path.join(OPS_RUNTIME_DIR, 'module_capability_index.json');
const MODULE_CAPABILITY_INDEX_MD = path.join(OPS_RUNTIME_DIR, 'module_capability_index.md');
const CLI_COMMANDS_JSON = path.join(OPS_RUNTIME_DIR, 'cli_commands.json');
const MCP_TOOLS_JSON = path.join(OPS_RUNTIME_DIR, 'mcp_tools.json');

const VALID_KINDS = new Set(['kernel', 'connector', 'cortical_module', 'compiler', 'memory', 'planner', 'policy', 'eval', 'runtime']);
const VALID_STATUSES = new Set(['experimental', 'draft', 'stable', 'deprecated']);
const VALID_RISKS = new Set(['none', 'low', 'medium', 'high', 'critical']);
const ID_RE = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;
const COMMAND_RE = /^[a-z][a-z0-9_-]{0,80}$/;
const TOOL_RE = /^[a-z][a-z0-9_]*$/;

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  try {
    return readJson(filePath);
  } catch (_) {
    return null;
  }
}

function asStringArray(value, fieldName, moduleId) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error(`MODULE_FIELD_NOT_ARRAY: ${moduleId}.${fieldName}`);
  return value.map((item) => {
    const text = shortText(item);
    if (!text) throw new Error(`MODULE_FIELD_EMPTY_VALUE: ${moduleId}.${fieldName}`);
    return text;
  });
}

function assertId(value, fieldName, moduleId) {
  const text = shortText(value);
  if (!ID_RE.test(text)) throw new Error(`MODULE_INVALID_ID: ${moduleId || '[unknown]'}.${fieldName}=${text}`);
  return text;
}

function assertCommandName(value, moduleId) {
  const text = shortText(value);
  if (!COMMAND_RE.test(text)) throw new Error(`MODULE_INVALID_COMMAND_NAME: ${moduleId}.${text}`);
  return text;
}

function assertToolName(value, moduleId, commandName) {
  const text = shortText(value);
  if (!TOOL_RE.test(text)) throw new Error(`MODULE_INVALID_MCP_TOOL_NAME: ${moduleId}.${commandName}.${text}`);
  return text;
}

function normalizeCapability(capability, moduleId) {
  if (!capability || typeof capability !== 'object' || Array.isArray(capability)) {
    throw new Error(`MODULE_INVALID_CAPABILITY: ${moduleId}`);
  }
  const capabilityId = assertId(capability.capability_id, 'capability_id', moduleId);
  const risk = shortText(capability.risk);
  if (!VALID_RISKS.has(risk)) throw new Error(`MODULE_INVALID_CAPABILITY_RISK: ${moduleId}.${capabilityId}`);
  return {
    capability_id: capabilityId,
    module_id: moduleId,
    summary: shortText(capability.summary || ''),
    risk,
    side_effects: asStringArray(capability.side_effects, `capabilities.${capabilityId}.side_effects`, moduleId),
    requires: asStringArray(capability.requires, `capabilities.${capabilityId}.requires`, moduleId),
  };
}

function normalizeMcpTool(tool, moduleId, commandName) {
  if (tool === undefined) return null;
  if (!tool || typeof tool !== 'object' || Array.isArray(tool)) {
    throw new Error(`MODULE_INVALID_MCP_TOOL: ${moduleId}.${commandName}`);
  }
  const inputSchema = tool.input_schema;
  if (!inputSchema || typeof inputSchema !== 'object' || Array.isArray(inputSchema)) {
    throw new Error(`MODULE_INVALID_MCP_INPUT_SCHEMA: ${moduleId}.${commandName}`);
  }
  return {
    name: assertToolName(tool.name, moduleId, commandName),
    description: shortText(tool.description),
    input_schema: inputSchema,
    argument_order: asStringArray(tool.argument_order, `commands.${commandName}.mcp_tool.argument_order`, moduleId),
  };
}

function normalizeCommand(commandName, command, moduleId) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error(`MODULE_INVALID_COMMAND: ${moduleId}.${commandName}`);
  }
  const normalizedName = assertCommandName(commandName, moduleId);
  if (!Array.isArray(command.argv) || !command.argv.length) {
    throw new Error(`MODULE_COMMAND_MISSING_ARGV: ${moduleId}.${normalizedName}`);
  }
  const argv = command.argv.map((item) => shortText(item)).filter(Boolean);
  if (!argv.length) throw new Error(`MODULE_COMMAND_EMPTY_ARGV: ${moduleId}.${normalizedName}`);
  const cli = asStringArray(command.cli, `commands.${normalizedName}.cli`, moduleId);
  return {
    command_name: normalizedName,
    summary: shortText(command.summary || ''),
    argv,
    cli,
    mcp_tool: normalizeMcpTool(command.mcp_tool, moduleId, normalizedName),
  };
}

function validateEntrypoint(entrypoint, moduleId) {
  const text = shortText(entrypoint);
  const expectedPrefix = `md-os/modules/${moduleId}/`;
  if (!text.startsWith(expectedPrefix) || !text.endsWith('.js')) {
    throw new Error(`MODULE_INVALID_ENTRYPOINT: ${moduleId}.${text}`);
  }
  return text;
}

function normalizeManifest(manifest, manifestPath) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error(`MODULE_MANIFEST_NOT_OBJECT: ${rel(manifestPath)}`);
  }
  if (manifest.schema_version !== 1) throw new Error(`MODULE_SCHEMA_VERSION_UNSUPPORTED: ${rel(manifestPath)}`);

  const moduleId = assertId(manifest.module_id, 'module_id', rel(manifestPath));
  const kind = shortText(manifest.kind);
  const status = shortText(manifest.status);
  if (!VALID_KINDS.has(kind)) throw new Error(`MODULE_INVALID_KIND: ${moduleId}.${kind}`);
  if (!VALID_STATUSES.has(status)) throw new Error(`MODULE_INVALID_STATUS: ${moduleId}.${status}`);

  const version = shortText(manifest.version);
  if (!/^[0-9]+\.[0-9]+\.[0-9]+(?:-[a-zA-Z0-9_.-]+)?$/.test(version)) {
    throw new Error(`MODULE_INVALID_VERSION: ${moduleId}.${version}`);
  }

  const commandsSource = manifest.commands;
  if (!commandsSource || typeof commandsSource !== 'object' || Array.isArray(commandsSource)) {
    throw new Error(`MODULE_COMMANDS_NOT_OBJECT: ${moduleId}`);
  }
  const commands = Object.keys(commandsSource)
    .sort()
    .map((commandName) => normalizeCommand(commandName, commandsSource[commandName], moduleId));
  if (!commands.length) throw new Error(`MODULE_COMMANDS_EMPTY: ${moduleId}`);

  const capabilities = asArray(manifest.capabilities, 'capabilities', moduleId)
    .map((capability) => normalizeCapability(capability, moduleId));
  if (!capabilities.length) throw new Error(`MODULE_CAPABILITIES_EMPTY: ${moduleId}`);

  return {
    schema_version: 1,
    module_id: moduleId,
    kind,
    version,
    status,
    entrypoint: validateEntrypoint(manifest.entrypoint, moduleId),
    summary: shortText(manifest.summary || ''),
    manifest_path: rel(manifestPath),
    owns: asStringArray(manifest.owns, 'owns', moduleId),
    reads: asStringArray(manifest.reads, 'reads', moduleId),
    writes: asStringArray(manifest.writes, 'writes', moduleId),
    capabilities,
    commands,
    verifiers: asStringArray(manifest.verifiers, 'verifiers', moduleId),
    evals: asStringArray(manifest.evals, 'evals', moduleId),
  };
}

function asArray(value, fieldName, moduleId) {
  if (!Array.isArray(value)) throw new Error(`MODULE_FIELD_NOT_ARRAY: ${moduleId}.${fieldName}`);
  return value;
}

function discoverModuleManifests() {
  if (!fs.existsSync(MODULES_DIR)) return [];
  return fs.readdirSync(MODULES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(MODULES_DIR, entry.name, 'module.json'))
    .filter((manifestPath) => fs.existsSync(manifestPath) && fs.statSync(manifestPath).isFile())
    .map((manifestPath) => normalizeManifest(readJson(manifestPath), manifestPath))
    .sort((left, right) => left.module_id.localeCompare(right.module_id));
}

function buildModuleGraph(modules) {
  const nodes = [];
  const edges = [];
  const nodeIds = new Set();
  function addNode(node) {
    if (nodeIds.has(node.id)) return;
    nodeIds.add(node.id);
    nodes.push(node);
  }
  function addArtifactEdge(moduleId, relation, filePath) {
    const artifactId = `path:${filePath}`;
    addNode({ id: artifactId, kind: 'path', label: filePath });
    edges.push({ from: moduleId, to: artifactId, relation });
  }

  for (const module of modules) {
    addNode({
      id: module.module_id,
      kind: 'module',
      label: module.module_id,
      module_kind: module.kind,
      status: module.status,
      version: module.version,
    });
    for (const capability of module.capabilities) {
      addNode({
        id: capability.capability_id,
        kind: 'capability',
        label: capability.capability_id,
        risk: capability.risk,
      });
      edges.push({ from: module.module_id, to: capability.capability_id, relation: 'provides_capability' });
    }
    for (const filePath of module.owns) addArtifactEdge(module.module_id, 'owns', filePath);
    for (const filePath of module.reads) addArtifactEdge(module.module_id, 'reads', filePath);
    for (const filePath of module.writes) addArtifactEdge(module.module_id, 'writes', filePath);
  }

  return {
    schema_version: 1,
    node_count: nodes.length,
    edge_count: edges.length,
    nodes: nodes.sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.sort((left, right) => `${left.from}:${left.relation}:${left.to}`.localeCompare(`${right.from}:${right.relation}:${right.to}`)),
  };
}

function flattenCliCommands(modules) {
  return modules.flatMap((module) => module.commands
    .filter((command) => command.cli.length)
    .map((command) => ({
      command_path: command.cli,
      command: command.cli.join(' '),
      module_id: module.module_id,
      command_name: command.command_name,
      summary: command.summary,
      risk: highestRisk(module.capabilities),
    })))
    .sort((left, right) => left.command.localeCompare(right.command));
}

function flattenMcpTools(modules) {
  return modules.flatMap((module) => module.commands
    .filter((command) => command.mcp_tool)
    .map((command) => ({
      name: command.mcp_tool.name,
      description: command.mcp_tool.description,
      input_schema: command.mcp_tool.input_schema,
      argument_order: command.mcp_tool.argument_order,
      module_id: module.module_id,
      command_name: command.command_name,
      risk: highestRisk(module.capabilities),
    })))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function highestRisk(capabilities) {
  const order = ['none', 'low', 'medium', 'high', 'critical'];
  let highest = 'none';
  for (const capability of capabilities || []) {
    if (order.indexOf(capability.risk) > order.indexOf(highest)) highest = capability.risk;
  }
  return highest;
}

function validateUniqueRegistryIds(registry) {
  const seenCapabilities = new Map();
  for (const capability of registry.capabilities) {
    const owner = seenCapabilities.get(capability.capability_id);
    if (owner) throw new Error(`MODULE_CAPABILITY_DUPLICATE: ${capability.capability_id} owned by ${owner} and ${capability.module_id}`);
    seenCapabilities.set(capability.capability_id, capability.module_id);
  }
  const seenTools = new Map();
  for (const tool of registry.mcp_tools) {
    const owner = seenTools.get(tool.name);
    if (owner) throw new Error(`MODULE_MCP_TOOL_DUPLICATE: ${tool.name} owned by ${owner} and ${tool.module_id}`);
    seenTools.set(tool.name, tool.module_id);
  }
}

function buildRegistry() {
  const modules = discoverModuleManifests();
  const capabilities = modules.flatMap((module) => module.capabilities)
    .sort((left, right) => left.capability_id.localeCompare(right.capability_id));
  const cliCommands = flattenCliCommands(modules);
  const mcpTools = flattenMcpTools(modules);
  const moduleGraph = buildModuleGraph(modules);
  const sourceHash = sha256Json({
    modules,
    capabilities,
    cli_commands: cliCommands,
    mcp_tools: mcpTools,
    module_graph: moduleGraph,
  });
  const registry = {
    schema_version: 1,
    registry_name: 'mdos_module_registry',
    updated_at: nowIso(),
    source_hash: sourceHash,
    module_count: modules.length,
    capability_count: capabilities.length,
    command_count: modules.reduce((sum, module) => sum + module.commands.length, 0),
    cli_command_count: cliCommands.length,
    mcp_tool_count: mcpTools.length,
    modules,
    capabilities,
    cli_commands: cliCommands,
    mcp_tools: mcpTools,
    module_graph: moduleGraph,
  };
  validateUniqueRegistryIds(registry);
  return registry;
}

function buildRegistryMarkdown(registry) {
  const lines = [
    '# Module Registry',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    `Source hash: \`${registry.source_hash}\``,
    '',
    `Modules: \`${registry.module_count}\``,
    '',
    `Capabilities: \`${registry.capability_count}\``,
    '',
    `CLI commands: \`${registry.cli_command_count}\``,
    '',
    `MCP tools: \`${registry.mcp_tool_count}\``,
    '',
    '## Modules',
    '',
  ];
  for (const module of registry.modules) {
    lines.push(`- \`${module.module_id}\` | kind \`${module.kind}\` | status \`${module.status}\` | version \`${module.version}\``);
    for (const capability of module.capabilities) {
      lines.push(`  - capability \`${capability.capability_id}\` | risk \`${capability.risk}\``);
    }
  }
  lines.push('', '## CLI Commands', '');
  if (!registry.cli_commands.length) lines.push('- None.');
  for (const command of registry.cli_commands) {
    lines.push(`- \`mdos ${command.command}\` -> \`${command.module_id}.${command.command_name}\``);
  }
  lines.push('', '## MCP Tools', '');
  if (!registry.mcp_tools.length) lines.push('- None.');
  for (const tool of registry.mcp_tools) {
    lines.push(`- \`${tool.name}\` -> \`${tool.module_id}.${tool.command_name}\``);
  }
  return `${lines.join('\n')}\n`;
}

function buildModuleGraphMarkdown(graph, registry) {
  const lines = [
    '# Module Graph',
    '',
    `Updated at: \`${registry.updated_at}\``,
    '',
    `Nodes: \`${graph.node_count}\``,
    '',
    `Edges: \`${graph.edge_count}\``,
    '',
    '## Edges',
    '',
  ];
  if (!graph.edges.length) lines.push('- None.');
  for (const edge of graph.edges) lines.push(`- \`${edge.from}\` -${edge.relation}-> \`${edge.to}\``);
  return `${lines.join('\n')}\n`;
}

function buildCapabilityMarkdown(index) {
  const lines = [
    '# Module Capability Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    '',
    `Capabilities: \`${index.capability_count}\``,
    '',
    '## Capabilities',
    '',
  ];
  if (!index.capabilities.length) lines.push('- None.');
  for (const capability of index.capabilities) {
    lines.push(`- \`${capability.capability_id}\` | module \`${capability.module_id}\` | risk \`${capability.risk}\``);
  }
  return `${lines.join('\n')}\n`;
}

function writeModuleRegistry() {
  const registry = buildRegistry();
  const moduleGraph = {
    ...registry.module_graph,
    updated_at: registry.updated_at,
    source_hash: registry.source_hash,
  };
  const capabilityIndex = {
    schema_version: 1,
    updated_at: registry.updated_at,
    source_hash: registry.source_hash,
    capability_count: registry.capability_count,
    capabilities: registry.capabilities,
  };
  const cliCommands = {
    schema_version: 1,
    updated_at: registry.updated_at,
    source_hash: registry.source_hash,
    command_count: registry.cli_command_count,
    commands: registry.cli_commands,
  };
  const mcpTools = {
    schema_version: 1,
    updated_at: registry.updated_at,
    source_hash: registry.source_hash,
    tool_count: registry.mcp_tool_count,
    tools: registry.mcp_tools,
  };

  withFileLock('builder__module_registry', {
    context: 'build_module_registry',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    ensureDir(OPS_MODULES_DIR);
    ensureDir(OPS_RUNTIME_DIR);
    atomicWriteJson(REGISTRY_JSON, registry);
    atomicWriteText(REGISTRY_MD, buildRegistryMarkdown(registry));
    atomicWriteJson(MODULE_GRAPH_JSON, moduleGraph);
    atomicWriteText(MODULE_GRAPH_MD, buildModuleGraphMarkdown(moduleGraph, registry));
    atomicWriteJson(MODULE_CAPABILITY_INDEX_JSON, capabilityIndex);
    atomicWriteText(MODULE_CAPABILITY_INDEX_MD, buildCapabilityMarkdown(capabilityIndex));
    atomicWriteJson(CLI_COMMANDS_JSON, cliCommands);
    atomicWriteJson(MCP_TOOLS_JSON, mcpTools);
  });

  appendJournal({
    event: 'module_registry_rebuilt',
    module_count: registry.module_count,
    capability_count: registry.capability_count,
    cli_command_count: registry.cli_command_count,
    mcp_tool_count: registry.mcp_tool_count,
    source_hash: registry.source_hash,
  });

  return registry;
}

function loadRegistry() {
  const registry = readJsonSafe(REGISTRY_JSON);
  if (registry && Array.isArray(registry.modules)) return registry;
  return buildRegistry();
}

function listModules(registry = loadRegistry()) {
  return {
    ok: true,
    mode: 'module_list',
    source_hash: registry.source_hash,
    module_count: registry.module_count,
    modules: registry.modules.map((module) => ({
      module_id: module.module_id,
      kind: module.kind,
      version: module.version,
      status: module.status,
      capability_count: module.capabilities.length,
      command_count: module.commands.length,
      capabilities: module.capabilities.map((capability) => capability.capability_id),
    })),
  };
}

function listCapabilities(registry = loadRegistry()) {
  return {
    ok: true,
    mode: 'capability_list',
    source_hash: registry.source_hash,
    capability_count: registry.capability_count,
    capabilities: registry.capabilities.map((capability) => ({
      capability_id: capability.capability_id,
      module_id: capability.module_id,
      risk: capability.risk,
      side_effects: capability.side_effects,
      requires: capability.requires,
      summary: capability.summary,
    })),
  };
}

function moduleById(registry, moduleId) {
  const normalized = assertId(moduleId, 'module_id', 'module_runtime');
  const module = registry.modules.find((item) => item.module_id === normalized);
  if (!module) throw new Error(`MODULE_NOT_FOUND: ${normalized}`);
  return module;
}

function commandByName(module, commandName) {
  const normalized = assertCommandName(commandName, module.module_id);
  const command = module.commands.find((item) => item.command_name === normalized);
  if (!command) throw new Error(`MODULE_COMMAND_NOT_FOUND: ${module.module_id}.${normalized}`);
  return command;
}

function resolveCliCommand(argv, registry = loadRegistry()) {
  const parts = (argv || []).map((item) => shortText(item)).filter(Boolean);
  if (!parts.length) return null;
  const matches = registry.cli_commands
    .filter((command) => command.command_path.every((segment, index) => parts[index] === segment))
    .sort((left, right) => right.command_path.length - left.command_path.length);
  const match = matches[0];
  if (!match) return null;
  return {
    module_id: match.module_id,
    command_name: match.command_name,
    command_path: match.command_path,
    args: parts.slice(match.command_path.length),
  };
}

function commandProcess(command, args) {
  const argv = [...command.argv, ...(args || []).map((item) => shortText(item))];
  const executable = argv[0] === 'node' ? process.execPath : argv[0];
  return {
    executable,
    args: argv.slice(1),
  };
}

function invokeModuleCommand(moduleId, commandName, args = [], options = {}) {
  const registry = options.registry || loadRegistry();
  const module = moduleById(registry, moduleId);
  const command = commandByName(module, commandName);
  const proc = commandProcess(command, args);
  const spawnOptions = {
    cwd: WORKSPACE_ROOT,
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
      MDOS_ROOT,
    },
  };
  if (options.stdio === 'pipe') {
    spawnOptions.encoding = 'utf8';
  } else {
    spawnOptions.stdio = 'inherit';
  }
  const result = spawnSync(proc.executable, proc.args, spawnOptions);
  return {
    ok: result.status === 0,
    status: result.status,
    signal: result.signal,
    command: [proc.executable, ...proc.args],
    stdout: options.stdio === 'pipe' ? String(result.stdout || '') : '',
    stderr: options.stdio === 'pipe' ? String(result.stderr || '') : '',
    module_id: module.module_id,
    command_name: command.command_name,
  };
}

function parseLastJsonLine(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  const last = lines[lines.length - 1] || '{}';
  try {
    return JSON.parse(last);
  } catch (_) {
    return { raw_stdout: String(stdout || '') };
  }
}

function callMcpTool(toolName, args = {}, registry = loadRegistry()) {
  const normalized = assertToolName(toolName, 'mcp', 'tool');
  const tool = registry.mcp_tools.find((item) => item.name === normalized);
  if (!tool) throw new Error(`MODULE_MCP_TOOL_NOT_FOUND: ${normalized}`);
  const argv = tool.argument_order.map((key) => {
    const value = args && args[key];
    if (value === undefined || value === null || shortText(value) === '') {
      const required = tool.input_schema && Array.isArray(tool.input_schema.required)
        ? tool.input_schema.required.includes(key)
        : true;
      if (required) throw new Error(`MISSING_TOOL_ARGUMENT: ${key}`);
      return '';
    }
    return shortText(value);
  }).filter((value) => value !== '');
  const result = invokeModuleCommand(tool.module_id, tool.command_name, argv, { registry, stdio: 'pipe' });
  if (!result.ok) {
    const error = new Error(`MODULE_MCP_TOOL_FAILED: ${normalized}`);
    error.details = result;
    throw error;
  }
  return {
    ok: true,
    mode: 'module_mcp_tool_call',
    tool: normalized,
    module_id: tool.module_id,
    command_name: tool.command_name,
    output: parseLastJsonLine(result.stdout),
  };
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'build') {
    const registry = writeModuleRegistry();
    printJson({
      ok: true,
      mode: 'build_module_registry',
      updated_at: registry.updated_at,
      module_count: registry.module_count,
      capability_count: registry.capability_count,
      cli_command_count: registry.cli_command_count,
      mcp_tool_count: registry.mcp_tool_count,
      output_json: rel(REGISTRY_JSON),
      output_md: rel(REGISTRY_MD),
    });
    return;
  }
  if (command === 'list') {
    printJson(listModules());
    return;
  }
  if (command === 'capabilities') {
    printJson(listCapabilities());
    return;
  }
  if (command === 'run') {
    const [moduleId, commandName, ...commandArgs] = args;
    if (!moduleId || !commandName) throw new Error('USAGE: module_runtime run <module_id> <command> [args...]');
    const result = invokeModuleCommand(moduleId, commandName, commandArgs);
    process.exit(result.status || 0);
  }
  throw new Error(`UNKNOWN_MODULE_RUNTIME_COMMAND: ${command}`);
}

if (require.main === module) {
  main();
}

module.exports = {
  CLI_COMMANDS_JSON,
  MCP_TOOLS_JSON,
  MODULE_CAPABILITY_INDEX_JSON,
  MODULE_GRAPH_JSON,
  MODULES_DIR,
  REGISTRY_JSON,
  REGISTRY_MD,
  buildRegistry,
  callMcpTool,
  discoverModuleManifests,
  invokeModuleCommand,
  listCapabilities,
  listModules,
  loadRegistry,
  resolveCliCommand,
  writeModuleRegistry,
};
