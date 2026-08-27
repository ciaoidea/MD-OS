#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  printJson,
  shortText,
} = require('./lib/common');
const { replayRuntime } = require('./replay_runtime');
const { callMcpTool, loadRegistry } = require('../kernel/module_runtime');
const {
  applyDocumentOperations,
  createDocument,
  documentSummary,
  exportDocument,
  readDocument,
  renderMath,
  saveDocument,
} = require('./document_runtime');

const SERVER_NAME = 'md-os-apfc';
const SERVER_VERSION = '5.0.1';
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';
const DOCUMENT_EDITOR_URI = 'ui://mdos/document-editor/v1.html';

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const PROJECTS_DIR = path.join(OPS_DIR, 'projects');

const STATIC_RESOURCES = [
  {
    uri: DOCUMENT_EDITOR_URI,
    name: 'MD-OS visual document editor',
    file: path.join(__dirname, 'ui', 'document_editor.html'),
    mimeType: 'text/html;profile=mcp-app',
    description: 'Fullscreen WYSIWYG canvas for rich text, tables, images, and rendered LaTeX formulas.',
    _meta: {
      ui: {
        prefersBorder: false,
        csp: { connectDomains: [], resourceDomains: [] },
      },
      'openai/widgetPrefersBorder': false,
    },
  },
  {
    uri: 'mdos://kb/operations',
    name: 'MD-OS (Artificial Prefrontal Cortex) v5.0 operations model',
    file: path.join(MDOS_ROOT, 'kb', 'OPERATIONS.md'),
    mimeType: 'text/markdown',
    description: 'Healthy-system operating path and canonical builder list.',
  },
  {
    uri: 'mdos://kb/natural-language-programming-model',
    name: 'Natural language programming model',
    file: path.join(MDOS_ROOT, 'kb', 'NATURAL_LANGUAGE_PROGRAMMING_MODEL.md'),
    mimeType: 'text/markdown',
    description: 'How natural-language artifacts act as part of the program.',
  },
  {
    uri: 'mdos://kb/model-context-protocol-adapter',
    name: 'Model Context Protocol adapter model',
    file: path.join(MDOS_ROOT, 'kb', 'MODEL_CONTEXT_PROTOCOL_ADAPTER.md'),
    mimeType: 'text/markdown',
    description: 'How MD-OS (Artificial Prefrontal Cortex) v5.0 exposes the filesystem OS through an MCP-compatible adapter.',
  },
  {
    uri: 'mdos://ops/state',
    name: 'Runtime state',
    file: path.join(OPS_DIR, 'state.json'),
    mimeType: 'application/json',
    description: 'Current local runtime mode and boundary metadata.',
  },
  {
    uri: 'mdos://ops/global-index',
    name: 'Global runtime index',
    file: path.join(OPS_DIR, 'global_index.md'),
    mimeType: 'text/markdown',
    description: 'Readable global index of projects, sources, connectors, and builders.',
  },
  {
    uri: 'mdos://ops/markdown-graph',
    name: 'Markdown graph index',
    file: path.join(OPS_DIR, 'markdown_graph.md'),
    mimeType: 'text/markdown',
    description: 'Obsidian-friendly generated graph of Markdown files, explicit links, and structural links.',
  },
  {
    uri: 'mdos://ops/global-agenda',
    name: 'Global agenda',
    file: path.join(OPS_DIR, 'agenda', 'global_agenda.md'),
    mimeType: 'text/markdown',
    description: 'Consolidated agenda compiled from project agendas.',
  },
  {
    uri: 'mdos://ops/active-summary',
    name: 'Active work item summary',
    file: path.join(OPS_DIR, 'summary', 'active_work_items.md'),
    mimeType: 'text/markdown',
    description: 'Hot view of active work items plus archived terminal counts.',
  },
  {
    uri: 'mdos://ops/agentic-core',
    name: 'Agentic core',
    file: path.join(OPS_DIR, 'core', 'agentic_core.md'),
    mimeType: 'text/markdown',
    description: 'Compact stable identity, objectives, ethics, non-claims, and operating stance.',
  },
  {
    uri: 'mdos://ops/change-proposals',
    name: 'Change proposals',
    file: path.join(OPS_DIR, 'changes', 'proposals.ndjson'),
    mimeType: 'application/x-ndjson',
    description: 'Append-only proposed edits for conflict-safe human and agent collaboration.',
  },
  {
    uri: 'mdos://ops/hygiene',
    name: 'System hygiene status',
    file: path.join(OPS_DIR, 'system_hygiene_status.md'),
    mimeType: 'text/markdown',
    description: 'Publication, runtime, and workspace hygiene status.',
  },
  {
    uri: 'mdos://ops/health',
    name: 'MD-OS health dashboard',
    file: path.join(OPS_DIR, 'health.md'),
    mimeType: 'text/markdown',
    description: 'Single readable runtime health dashboard.',
  },
  {
    uri: 'mdos://ops/health-classification',
    name: 'MD-OS health classification',
    file: path.join(OPS_DIR, 'health_classification.md'),
    mimeType: 'text/markdown',
    description: 'Granular health scopes for runtime, compiler, AGI loop, publication, security, and local hygiene.',
  },
  {
    uri: 'mdos://ops/runtime-lifecycle',
    name: 'Runtime lifecycle index',
    file: path.join(OPS_DIR, 'runtime_lifecycle_index.md'),
    mimeType: 'text/markdown',
    description: 'Classification of files as source, generated, local, demo, live, or archive.',
  },
  {
    uri: 'mdos://ops/replay-report',
    name: 'Replay report',
    file: path.join(OPS_DIR, 'replay_report.md'),
    mimeType: 'text/markdown',
    description: 'Accounting-style replay report with source and output manifests.',
  },
  {
    uri: 'mdos://ops/connector-registry',
    name: 'Connector registry',
    file: path.join(OPS_DIR, 'connectors', 'connector_registry.json'),
    mimeType: 'application/json',
    description: 'Live connector registry for the local MD-OS (Artificial Prefrontal Cortex) v5.0 instance.',
  },
  {
    uri: 'mdos://ops/hardware-device-registry',
    name: 'Hardware device registry',
    file: path.join(OPS_DIR, 'local', 'hardware', 'device_registry.json'),
    mimeType: 'application/json',
    description: 'Host-local read-only hardware and peripheral discovery registry.',
  },
  {
    uri: 'mdos://ops/hardware-inventory',
    name: 'Hardware inventory',
    file: path.join(OPS_DIR, 'local', 'hardware', 'inventory.md'),
    mimeType: 'text/markdown',
    description: 'Readable host-local hardware bootstrap inventory.',
  },
  {
    uri: 'mdos://ops/software-registry',
    name: 'Software registry',
    file: path.join(OPS_DIR, 'local', 'software', 'software_registry.json'),
    mimeType: 'application/json',
    description: 'Host-local read-only application and service discovery registry.',
  },
  {
    uri: 'mdos://ops/software-applications',
    name: 'Software applications',
    file: path.join(OPS_DIR, 'local', 'software', 'applications.md'),
    mimeType: 'text/markdown',
    description: 'Readable host-local installed application inventory.',
  },
  {
    uri: 'mdos://ops/software-services',
    name: 'Software services',
    file: path.join(OPS_DIR, 'local', 'software', 'services.md'),
    mimeType: 'text/markdown',
    description: 'Readable host-local service inventory.',
  },
  {
    uri: 'mdos://ops/compiled-programs',
    name: 'Compiled natural-language programs',
    file: path.join(OPS_DIR, 'compiled', 'programs.json'),
    mimeType: 'application/json',
    description: 'Deterministic compilation of Markdown natural-language programs.',
  },
  {
    uri: 'mdos://ops/module-registry',
    name: 'Module registry',
    file: path.join(OPS_DIR, 'modules', 'registry.json'),
    mimeType: 'application/json',
    description: 'Generated registry of MD-OS kernel modules, commands, capabilities, and MCP tools.',
  },
  {
    uri: 'mdos://ops/module-graph',
    name: 'Module graph',
    file: path.join(OPS_DIR, 'runtime', 'module_graph.json'),
    mimeType: 'application/json',
    description: 'Generated module-to-capability and module-to-artifact graph.',
  },
  {
    uri: 'mdos://ops/module-capabilities',
    name: 'Module capability index',
    file: path.join(OPS_DIR, 'runtime', 'module_capability_index.json'),
    mimeType: 'application/json',
    description: 'Generated capability index owned by the module registry builder.',
  },
  {
    uri: 'mdos://ops/module-cli-commands',
    name: 'Module CLI commands',
    file: path.join(OPS_DIR, 'runtime', 'cli_commands.json'),
    mimeType: 'application/json',
    description: 'Generated CLI command routes declared by module manifests.',
  },
  {
    uri: 'mdos://ops/module-mcp-tools',
    name: 'Module MCP tools',
    file: path.join(OPS_DIR, 'runtime', 'mcp_tools.json'),
    mimeType: 'application/json',
    description: 'Generated MCP tool routes declared by module manifests.',
  },
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function existsFile(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch (_) {
    return false;
  }
}

function discoverProjectIds() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .filter((projectId) => existsFile(path.join(PROJECTS_DIR, projectId, 'project.json')))
    .sort();
}

function projectResources() {
  return discoverProjectIds().flatMap((projectId) => [
    {
      uri: `mdos://projects/${projectId}/status`,
      name: `${projectId} status`,
      file: path.join(PROJECTS_DIR, projectId, 'status.md'),
      mimeType: 'text/markdown',
      description: `Compiled status for project ${projectId}.`,
    },
    {
      uri: `mdos://projects/${projectId}/agenda`,
      name: `${projectId} agenda`,
      file: path.join(PROJECTS_DIR, projectId, 'agenda.md'),
      mimeType: 'text/markdown',
      description: `Compiled agenda for project ${projectId}.`,
    },
    {
      uri: `mdos://projects/${projectId}/work-items`,
      name: `${projectId} work items`,
      file: path.join(PROJECTS_DIR, projectId, 'work_items.ndjson'),
      mimeType: 'application/x-ndjson',
      description: `Canonical work-item stream for project ${projectId}.`,
    },
  ]);
}

function allResources() {
  return [...STATIC_RESOURCES, ...projectResources()]
    .filter((resource) => existsFile(resource.file))
    .map((resource) => {
      const result = {
        uri: resource.uri,
        name: resource.name,
        description: resource.description,
        mimeType: resource.mimeType,
      };
      if (resource._meta) result._meta = resource._meta;
      return result;
    });
}

function resourceByUri(uri) {
  return [...STATIC_RESOURCES, ...projectResources()].find((resource) => resource.uri === uri);
}

function readResource(uri) {
  const resource = resourceByUri(shortText(uri));
  if (!resource) throw new Error(`UNKNOWN_RESOURCE_URI: ${shortText(uri)}`);
  if (!existsFile(resource.file)) throw new Error(`RESOURCE_FILE_MISSING: ${rel(resource.file)}`);
  const content = {
    uri: resource.uri,
    mimeType: resource.mimeType,
    text: readTextSafe(resource.file),
  };
  if (resource._meta) content._meta = resource._meta;
  return {
    contents: [content],
  };
}

function runNodeScript(scriptName, args = []) {
  const result = spawnSync(process.execPath, [path.join(__dirname, scriptName), ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    command: ['node', `md-os/os/${scriptName}`, ...args].join(' '),
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || '').trim(),
  };
}

function runRequired(scriptName, args = []) {
  const result = runNodeScript(scriptName, args);
  if (!result.ok) {
    const error = new Error(`MCP_TOOL_SCRIPT_FAILED: ${result.command}`);
    error.details = result;
    throw error;
  }
  return result;
}

function parseJsonOutput(result) {
  const lines = String(result.stdout || '').trim().split('\n').filter(Boolean);
  const lastLine = lines[lines.length - 1] || '{}';
  try {
    return JSON.parse(lastLine);
  } catch (_) {
    return { raw_stdout: result.stdout };
  }
}

function rebuildProjectAndGlobals(projectId) {
  const results = [
    runRequired('build_project_state.js', [projectId]),
    runRequired('build_global_agenda.js'),
    runRequired('archive_runtime_state.js'),
    runRequired('build_agentic_core.js'),
    runRequired('build_workspace_inventory.js'),
    runRequired('build_markdown_graph.js'),
    runRequired('build_runtime_lifecycle_index.js'),
    runRequired('build_global_index.js'),
    runRequired('build_system_hygiene_status.js'),
    runRequired('build_health_classifier.js'),
    runRequired('build_health_dashboard.js'),
  ];
  return results.map((result) => ({
    command: result.command,
    output: parseJsonOutput(result),
  }));
}

function toolResult(payload, isError = false, options = {}) {
  const result = {
    content: [
      {
        type: 'text',
        text: `${JSON.stringify(payload, null, 2)}\n`,
      },
    ],
    isError,
  };
  if (options.structuredContent !== undefined) result.structuredContent = options.structuredContent;
  if (options._meta !== undefined) result._meta = options._meta;
  return result;
}

function documentToolResult(document, options = {}) {
  return toolResult(
    { ok: true, mode: options.mode || 'mcp_document', document: documentSummary(document) },
    false,
    {
      structuredContent: { document },
      _meta: options.renderUi ? {
        ui: { resourceUri: DOCUMENT_EDITOR_URI },
        'openai/outputTemplate': DOCUMENT_EDITOR_URI,
      } : undefined,
    }
  );
}

function stringArg(args, key, required = true) {
  const value = shortText(args && args[key]);
  if (!value && required) throw new Error(`MISSING_TOOL_ARGUMENT: ${key}`);
  return value;
}

function boolArg(args, key, fallback) {
  if (!args || args[key] === undefined) return fallback;
  return args[key] === true;
}

function registerSignal(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const summary = stringArg(args, 'summary');
  const register = runRequired('register_manual_signal.js', [projectId, summary]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_register_signal',
    register: parseJsonOutput(register),
    builders,
  };
}

function buildProject(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const builders = boolArg(args, 'rebuild_global', true)
    ? rebuildProjectAndGlobals(projectId)
    : [{
      command: `node md-os/os/build_project_state.js ${projectId}`,
      output: parseJsonOutput(runRequired('build_project_state.js', [projectId])),
    }];
  return {
    ok: true,
    mode: 'mcp_build_project',
    project_id: projectId,
    builders,
  };
}

function connectorList() {
  const registry = readJsonSafe(path.join(OPS_DIR, 'connectors', 'connector_registry.json'));
  const terminal = runNodeScript('terminal_connector.js', ['list']);
  const api = runNodeScript('api_connector.js', ['list']);
  const filesystem = runNodeScript('filesystem_connector.js', ['list']);
  const ticketing = runNodeScript('ticketing_connector.js', ['list']);
  const robotMock = runNodeScript('robot_mock_connector.js', ['list']);
  const wolfram = runNodeScript('wolfram_connector.js', ['list']);
  return {
    ok: true,
    mode: 'mcp_connector_list',
    registry,
    terminal: terminal.ok ? parseJsonOutput(terminal) : { ok: false, stderr: terminal.stderr },
    api: api.ok ? parseJsonOutput(api) : { ok: false, stderr: api.stderr },
    filesystem: filesystem.ok ? parseJsonOutput(filesystem) : { ok: false, stderr: filesystem.stderr },
    ticketing: ticketing.ok ? parseJsonOutput(ticketing) : { ok: false, stderr: ticketing.stderr },
    robot_mock: robotMock.ok ? parseJsonOutput(robotMock) : { ok: false, stderr: robotMock.stderr },
    wolfram: wolfram.ok ? parseJsonOutput(wolfram) : { ok: false, stderr: wolfram.stderr },
  };
}

function terminalRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const commandId = assertSafeId(stringArg(args, 'command_id'), 'command_id');
  const run = runRequired('terminal_connector.js', ['run', projectId, commandId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_terminal_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function apiRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const requestId = assertSafeId(stringArg(args, 'request_id'), 'request_id');
  const run = runRequired('api_connector.js', ['run', projectId, requestId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_api_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function filesystemRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const scanId = assertSafeId(stringArg(args, 'scan_id'), 'scan_id');
  const run = runRequired('filesystem_connector.js', ['run', projectId, scanId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_filesystem_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function ticketingRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const ticketId = assertSafeId(stringArg(args, 'ticket_id'), 'ticket_id');
  const run = runRequired('ticketing_connector.js', ['run', projectId, ticketId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_ticketing_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function robotMockRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const missionId = assertSafeId(stringArg(args, 'mission_id'), 'mission_id');
  const run = runRequired('robot_mock_connector.js', ['run', projectId, missionId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_robot_mock_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function wolframBootstrapTool() {
  const run = runRequired('wolfram_connector.js', ['bootstrap']);
  return {
    ok: true,
    mode: 'mcp_wolfram_bootstrap',
    run: parseJsonOutput(run),
  };
}

function wolframRun(args) {
  const projectId = assertSafeId(stringArg(args, 'project_id'), 'project_id');
  const calculationId = assertSafeId(stringArg(args, 'calculation_id'), 'calculation_id');
  const run = runRequired('wolfram_connector.js', ['run', projectId, calculationId]);
  const builders = boolArg(args, 'rebuild', true) ? rebuildProjectAndGlobals(projectId) : [];
  return {
    ok: true,
    mode: 'mcp_wolfram_run',
    run: parseJsonOutput(run),
    builders,
  };
}

function compileProgramsTool() {
  const result = runRequired('compile_programs.js');
  return {
    ok: true,
    mode: 'mcp_compile_programs',
    compile: parseJsonOutput(result),
  };
}

function archiveRuntimeTool() {
  const result = runRequired('archive_runtime_state.js');
  return {
    ok: true,
    mode: 'mcp_archive_runtime_state',
    archive: parseJsonOutput(result),
  };
}

function buildAgenticCoreTool() {
  const result = runRequired('build_agentic_core.js');
  return {
    ok: true,
    mode: 'mcp_build_agentic_core',
    core: parseJsonOutput(result),
  };
}

function hardwareBootstrapTool() {
  const result = runRequired('hardware_bootstrap.js', ['bootstrap', '--json']);
  return {
    ok: true,
    mode: 'mcp_hardware_bootstrap',
    hardware: parseJsonOutput(result),
  };
}

function hardwareCleanTool() {
  const result = runRequired('hardware_bootstrap.js', ['clean', '--json']);
  return {
    ok: true,
    mode: 'mcp_hardware_clean',
    hardware: parseJsonOutput(result),
  };
}

function hardwareControlTool(args) {
  const intent = stringArg(args, 'intent');
  const result = runRequired('hardware_control.js', ['run', intent]);
  return {
    ok: true,
    mode: 'mcp_hardware_control',
    hardware: parseJsonOutput(result),
  };
}

function softwareBootstrapTool() {
  const result = runRequired('software_bootstrap.js', ['bootstrap', '--json']);
  return {
    ok: true,
    mode: 'mcp_software_bootstrap',
    software: parseJsonOutput(result),
  };
}

function softwareCleanTool() {
  const result = runRequired('software_bootstrap.js', ['clean', '--json']);
  return {
    ok: true,
    mode: 'mcp_software_clean',
    software: parseJsonOutput(result),
  };
}

function continuityService(command) {
  const result = runRequired('continuity_service.js', [command]);
  return {
    ok: true,
    mode: `mcp_continuity_${command}`,
    continuity: parseJsonOutput(result),
  };
}

function proposeChange(args) {
  const targetPath = stringArg(args, 'target_path');
  const summary = stringArg(args, 'summary');
  const result = runRequired('register_change_proposal.js', [targetPath, summary]);
  return {
    ok: true,
    mode: 'mcp_propose_change',
    proposal: parseJsonOutput(result),
  };
}

function callDocumentTool(name, args) {
  if (name === 'mdos_document_open') {
    const document = readDocument(
      args.document_id || 'notes',
      {
        createIfMissing: args.create_if_missing !== false,
        title: args.title,
      }
    );
    return documentToolResult(document, {
      mode: 'mcp_document_open',
      renderUi: true,
    });
  }
  if (name === 'mdos_document_create') return documentToolResult(createDocument(args), { mode: 'mcp_document_create', renderUi: true });
  if (name === 'mdos_document_read') return documentToolResult(readDocument(args.document_id), { mode: 'mcp_document_read' });
  if (name === 'mdos_document_save') return documentToolResult(saveDocument(args), { mode: 'mcp_document_save' });
  if (name === 'mdos_document_apply') return documentToolResult(applyDocumentOperations(args), { mode: 'mcp_document_apply' });
  if (name === 'mdos_document_render_math') {
    const rendered = renderMath(args.latex, args.display !== false);
    return toolResult(
      { ok: true, mode: 'mcp_document_render_math', math: rendered },
      false,
      { structuredContent: { math: rendered } }
    );
  }
  if (name === 'mdos_document_export') {
    const exported = exportDocument(args);
    return toolResult(
      { mode: 'mcp_document_export', ...exported },
      false,
      { structuredContent: { export: exported } }
    );
  }
  throw new Error(`UNKNOWN_DOCUMENT_TOOL: ${shortText(name)}`);
}

function callTool(name, args = {}) {
  if (name.startsWith('mdos_document_')) return callDocumentTool(name, args);
  if (name === 'mdos_replay') return toolResult(replayRuntime());
  if (name === 'mdos_compile_programs') return toolResult(compileProgramsTool());
  if (name === 'mdos_archive_runtime_state') return toolResult(archiveRuntimeTool());
  if (name === 'mdos_build_agentic_core') return toolResult(buildAgenticCoreTool());
  if (name === 'mdos_hardware_bootstrap') return toolResult(hardwareBootstrapTool());
  if (name === 'mdos_hardware_clean') return toolResult(hardwareCleanTool());
  if (name === 'mdos_hardware_control') return toolResult(hardwareControlTool(args));
  if (name === 'mdos_software_bootstrap') return toolResult(softwareBootstrapTool());
  if (name === 'mdos_software_clean') return toolResult(softwareCleanTool());
  if (name === 'mdos_continuity_status') return toolResult(continuityService('status'));
  if (name === 'mdos_continuity_start') return toolResult(continuityService('start'));
  if (name === 'mdos_continuity_stop') return toolResult(continuityService('stop'));
  if (name === 'mdos_propose_change') return toolResult(proposeChange(args));
  if (name === 'mdos_register_signal') return toolResult(registerSignal(args));
  if (name === 'mdos_build_project') return toolResult(buildProject(args));
  if (name === 'mdos_connector_list') return toolResult(connectorList());
  if (name === 'mdos_terminal_run') return toolResult(terminalRun(args));
  if (name === 'mdos_api_run') return toolResult(apiRun(args));
  if (name === 'mdos_filesystem_run') return toolResult(filesystemRun(args));
  if (name === 'mdos_ticketing_run') return toolResult(ticketingRun(args));
  if (name === 'mdos_robot_mock_run') return toolResult(robotMockRun(args));
  if (name === 'mdos_wolfram_bootstrap') return toolResult(wolframBootstrapTool());
  if (name === 'mdos_wolfram_run') return toolResult(wolframRun(args));
  const registry = loadRegistry();
  if ((registry.mcp_tools || []).some((tool) => tool.name === name)) {
    return toolResult(callMcpTool(name, args, registry));
  }
  throw new Error(`UNKNOWN_TOOL: ${shortText(name)}`);
}

function inputSchema(properties, required = []) {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

function visualDocumentBlockSchema() {
  return {
    oneOf: [
      inputSchema({
        id: { type: 'string' },
        type: { const: 'rich' },
        html: { type: 'string' },
      }, ['type', 'html']),
      inputSchema({
        id: { type: 'string' },
        type: { const: 'table' },
        html: { type: 'string' },
      }, ['type', 'html']),
      inputSchema({
        id: { type: 'string' },
        type: { const: 'formula' },
        latex: { type: 'string' },
        display: { type: 'boolean', default: true },
      }, ['type', 'latex']),
      inputSchema({
        id: { type: 'string' },
        type: { const: 'image' },
        data_uri: { type: 'string', description: 'Inline PNG, JPEG, GIF, or WebP data URI.' },
        alt: { type: 'string' },
        width_percent: { type: 'integer', minimum: 10, maximum: 100 },
      }, ['type', 'data_uri']),
      inputSchema({
        id: { type: 'string' },
        type: { const: 'whiteboard' },
        height_px: { type: 'integer', minimum: 600, maximum: 3000, default: 1000 },
        strokes: {
          type: 'array',
          maxItems: 5000,
          items: { type: 'object', description: 'Validated shared pen or eraser stroke.' },
        },
      }, ['type', 'strokes']),
    ],
  };
}

function documentToolMeta(renderUi = false) {
  if (!renderUi) return {};
  return {
    ui: { resourceUri: DOCUMENT_EDITOR_URI },
    'openai/outputTemplate': DOCUMENT_EDITOR_URI,
  };
}

function listDocumentTools() {
  const documentIdSchema = {
    type: 'string',
    pattern: '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$',
    description: 'Stable visual document id.',
  };
  const revisionSchema = { type: 'integer', minimum: 0 };
  const blockSchema = visualDocumentBlockSchema();
  const readOnly = { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  const write = { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  return [
    {
      name: 'mdos_document_open',
      title: 'Open visual document',
      description: 'Open the fullscreen WYSIWYG editor for one visual document, creating it when requested.',
      inputSchema: inputSchema({
        document_id: { ...documentIdSchema, default: 'notes' },
        create_if_missing: { type: 'boolean', default: true },
        title: { type: 'string' },
      }),
      annotations: write,
      _meta: documentToolMeta(true),
    },
    {
      name: 'mdos_document_create',
      title: 'Create visual document',
      description: 'Create a versioned visual document and open it in the fullscreen WYSIWYG editor.',
      inputSchema: inputSchema({
        document_id: { ...documentIdSchema, default: 'notes' },
        title: { type: 'string', default: 'Untitled' },
      }),
      annotations: write,
      _meta: documentToolMeta(true),
    },
    {
      name: 'mdos_document_read',
      title: 'Read visual document',
      description: 'Read the authoritative blocks and current revision without remounting the editor.',
      inputSchema: inputSchema({ document_id: documentIdSchema }, ['document_id']),
      annotations: readOnly,
    },
    {
      name: 'mdos_document_save',
      title: 'Save visual document',
      description: 'Atomically save all WYSIWYG blocks when the expected revision still matches.',
      inputSchema: inputSchema({
        document_id: documentIdSchema,
        title: { type: 'string' },
        expected_revision: revisionSchema,
        blocks: { type: 'array', items: blockSchema, maxItems: 2000 },
      }, ['document_id', 'expected_revision', 'blocks']),
      annotations: write,
    },
    {
      name: 'mdos_document_apply',
      title: 'Edit visual document',
      description: 'Apply bounded block or atomic shared-Whiteboard operations to the same live document.',
      inputSchema: inputSchema({
        document_id: documentIdSchema,
        expected_revision: revisionSchema,
        operations: {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: {
            type: 'object',
            description: 'Block edit or atomic whiteboard_append_stroke, whiteboard_undo, whiteboard_clear, or whiteboard_resize operation.',
          },
        },
      }, ['document_id', 'operations']),
      annotations: write,
    },
    {
      name: 'mdos_document_render_math',
      title: 'Render LaTeX formula',
      description: 'Validate one LaTeX formula and return browser-native MathML for visual editing.',
      inputSchema: inputSchema({
        latex: { type: 'string', maxLength: 5000 },
        display: { type: 'boolean', default: true },
      }, ['latex']),
      annotations: readOnly,
    },
    {
      name: 'mdos_document_export',
      title: 'Export visual document',
      description: 'Export the current version to HTML, TeX, or PDF inside its local document directory.',
      inputSchema: inputSchema({
        document_id: documentIdSchema,
        format: { type: 'string', enum: ['html', 'tex', 'pdf'] },
      }, ['document_id', 'format']),
      annotations: write,
    },
  ];
}

function listTools() {
  const generatedTools = (() => {
    try {
      const registry = loadRegistry();
      return (registry.mcp_tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.input_schema,
      }));
    } catch (_) {
      return [];
    }
  })();
  return {
    tools: [
      ...listDocumentTools(),
      {
        name: 'mdos_replay',
        description: 'Replay MD-OS (Artificial Prefrontal Cortex) v5.0 compiled state from persisted sources and journal history.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_compile_programs',
        description: 'Compile Markdown natural-language programs into deterministic runtime JSON.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_archive_runtime_state',
        description: 'Build the non-destructive archive and hot active-work summary views.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_build_agentic_core',
        description: 'Materialize the compact stable agentic core from canonical identity, objective, ethics, and compaction knowledge.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_hardware_bootstrap',
        description: 'Run read-only host hardware and peripheral discovery, then write host-local md-os/ops/local/hardware views.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_hardware_clean',
        description: 'Delete host-local hardware discovery output from md-os/ops/local/hardware and legacy hardware cache paths.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_hardware_control',
        description: 'Run an explicit natural-language hardware control intent through bounded host-local connectors.',
        inputSchema: inputSchema({
          intent: { type: 'string', description: 'Explicit user hardware intent, for example "alza il volume" or "guarda lo schermo".' },
        }, ['intent']),
      },
      {
        name: 'mdos_software_bootstrap',
        description: 'Run read-only host application and service discovery, then write host-local md-os/ops/local/software views.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_software_clean',
        description: 'Delete host-local software discovery output from md-os/ops/local/software and legacy software cache paths.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_continuity_status',
        description: 'Read the toggleable continuity service status from md-os/ops/services.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_continuity_start',
        description: 'Start the bounded continuity service as a detachable local runtime.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_continuity_stop',
        description: 'Stop the bounded continuity service through its stop file and PID guard.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_propose_change',
        description: 'Register an append-only proposed edit instead of mutating a contested runtime file directly.',
        inputSchema: inputSchema({
          target_path: { type: 'string', description: 'Target path under the md-os/ boundary.' },
          summary: { type: 'string', description: 'Short description of the proposed change.' },
        }, ['target_path', 'summary']),
      },
      {
        name: 'mdos_register_signal',
        description: 'Register a bounded manual source signal, then rebuild the project and global views by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          summary: { type: 'string', description: 'Short source signal summary.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after registering.', default: true },
        }, ['project_id', 'summary']),
      },
      {
        name: 'mdos_build_project',
        description: 'Rebuild one project from source snapshots and optionally rebuild global agenda/index.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          rebuild_global: { type: 'boolean', description: 'Whether to rebuild global agenda and index.', default: true },
        }, ['project_id']),
      },
      {
        name: 'mdos_connector_list',
        description: 'Return the live connector registry plus terminal, API, filesystem, ticketing, robot-mock, and Wolfram allowlist summaries.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_terminal_run',
        description: 'Run an allowlisted terminal command by command_id, then rebuild the affected project by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          command_id: { type: 'string', description: 'Allowlisted terminal command id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'command_id']),
      },
      {
        name: 'mdos_api_run',
        description: 'Run an allowlisted API request by request_id, then rebuild the affected project by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          request_id: { type: 'string', description: 'Allowlisted API request id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'request_id']),
      },
      {
        name: 'mdos_filesystem_run',
        description: 'Run a bounded filesystem scan by scan_id, then rebuild the affected project by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          scan_id: { type: 'string', description: 'Allowlisted filesystem scan id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'scan_id']),
      },
      {
        name: 'mdos_ticketing_run',
        description: 'Ingest an allowlisted ticket by ticket_id, then rebuild the affected project by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          ticket_id: { type: 'string', description: 'Allowlisted ticket id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'ticket_id']),
      },
      {
        name: 'mdos_robot_mock_run',
        description: 'Capture a simulation-only robot mission snapshot and action proposal, then rebuild the affected project by default.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          mission_id: { type: 'string', description: 'Allowlisted robot mock mission id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'mission_id']),
      },
      {
        name: 'mdos_wolfram_bootstrap',
        description: 'Register the bounded Wolfram connector, verify local wolframscript availability, and run its symbolic smoke calculation when available.',
        inputSchema: inputSchema({}),
      },
      {
        name: 'mdos_wolfram_run',
        description: 'Run one registered, bounded local Wolfram calculation and optionally rebuild the affected project readback.',
        inputSchema: inputSchema({
          project_id: { type: 'string', description: 'Safe MD-OS project id.' },
          calculation_id: { type: 'string', description: 'Registered Wolfram calculation id.' },
          rebuild: { type: 'boolean', description: 'Whether to rebuild project and global views after execution.', default: true },
        }, ['project_id', 'calculation_id']),
      },
      ...generatedTools,
    ],
  };
}

function initialize(params = {}) {
  return {
    protocolVersion: shortText(params.protocolVersion) || DEFAULT_PROTOCOL_VERSION,
    capabilities: {
      resources: {},
      tools: {},
    },
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
  };
}

function handleRequest(message) {
  const params = message.params || {};
  if (message.method === 'initialize') return initialize(params);
  if (message.method === 'resources/list') return { resources: allResources() };
  if (message.method === 'resources/read') return readResource(params.uri);
  if (message.method === 'tools/list') return listTools();
  if (message.method === 'tools/call') return callTool(params.name, params.arguments || {});
  throw new Error(`METHOD_NOT_FOUND: ${shortText(message.method)}`);
}

function jsonRpcError(id, code, message, data) {
  const payload = {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
  if (data !== undefined) payload.error.data = data;
  return payload;
}

function jsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function writeMessage(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function handleLine(line) {
  let message;
  try {
    message = JSON.parse(line);
  } catch (error) {
    writeMessage(jsonRpcError(null, -32700, 'Parse error', error.message));
    return;
  }

  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    writeMessage(jsonRpcError(null, -32600, 'Invalid Request'));
    return;
  }

  if (message.id === undefined) return;

  try {
    const result = handleRequest(message);
    writeMessage(jsonRpcResult(message.id, result));
  } catch (error) {
    writeMessage(jsonRpcError(
      message.id,
      error.message && error.message.startsWith('METHOD_NOT_FOUND:') ? -32601 : -32000,
      error.message || 'Internal error',
      error.details || undefined
    ));
  }
}

function serveStdio() {
  process.stdin.setEncoding('utf8');
  let buffer = '';
  process.stdin.on('data', (chunk) => {
    buffer += chunk;
    while (buffer.includes('\n')) {
      const index = buffer.indexOf('\n');
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (line) handleLine(line);
    }
  });
  process.stdin.on('end', () => {
    const line = buffer.trim();
    if (line) handleLine(line);
  });
}

function main() {
  if (process.argv.includes('--list-resources')) {
    printJson({ ok: true, resources: allResources() });
    return;
  }
  if (process.argv.includes('--list-tools')) {
    printJson({ ok: true, ...listTools() });
    return;
  }
  serveStdio();
}

if (require.main === module) {
  main();
}

module.exports = {
  allResources,
  callTool,
  handleRequest,
  initialize,
  listTools,
  readResource,
};
