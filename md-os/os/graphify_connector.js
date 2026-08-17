#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
  shortText,
} = require('./lib/common');
const { appendJournal } = require('./lib/journal');
const { atomicWriteJson, atomicWriteJsonLocked, atomicWriteText, ensureDir } = require('./lib/fs_runtime');

function kernelBrokerMetadata() {
  return {};
}

const PROFILE_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'graphify_connector.json');
const REGISTRY_FILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'connector_registry.json');
const DEFAULT_PROFILE = {
  schema_version: 1,
  connector_id: 'graphify_connector',
  package_name: 'graphifyy',
  cli_command: 'graphify',
  default_target: '.',
  direct_integration: true,
  default_operational_surface: true,
  default_orientation_surface: true,
  token_budget_role: 'primary_context_reduction_surface',
  dynamic_graph_evolution: true,
  graph_evolution_mode: 'bounded_local_update',
  default_refresh_command: 'cortex graphify build .',
  default_orient_command: 'cortex graphify orient <question>',
  output_dir: 'graphify-out',
  graph_json: 'graphify-out/graph.json',
  graph_html: 'graphify-out/graph.html',
  report_md: 'graphify-out/GRAPH_REPORT.md',
  system_map_md: 'graphify-out/MD_OS_SYSTEM_MAP.md',
  neural_map_json: 'graphify-out/neural_node_map.json',
  neural_map_html: 'graphify-out/neural_node_map.html',
  neural_map_md: 'graphify-out/neural_node_map.md',
  connector_topology_json: 'graphify-out/connector_topology.json',
  connector_topology_html: 'graphify-out/connector_topology.html',
  connector_topology_md: 'graphify-out/connector_topology.md',
  orientation_json: 'graphify-out/orientation.json',
  orientation_md: 'graphify-out/orientation.md',
  default_build_mode: 'local_update',
  tree_label: 'MD-OS Operating System Map',
  default_timeout_ms: 1200000,
  safe_build_flags: [
    '--update',
    '--force',
    '--no-viz',
    '--no-cluster',
    '--wiki',
    '--obsidian',
    '--svg',
    '--graphml',
    '--cluster-only',
    '--mode',
    '--resolution',
    '--exclude-hubs',
    '--backend',
    '--token-budget',
    '--max-workers',
    '--api-timeout',
  ],
  safe_local_build_flags: [
    '--force',
    '--no-cluster',
    '--no-viz',
    '--update',
  ],
  forbidden_build_flags: [
    '--watch',
    '--mcp',
    '--neo4j-push',
  ],
};

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/') || '.';
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex graphify status',
    '  cortex graphify bootstrap',
    '  cortex graphify build [target_dir] [--force|--no-cluster|--no-viz]',
    '  cortex graphify benchmark',
    '  cortex graphify query <question>',
    '  cortex graphify path <source_node> <target_node>',
    '  cortex graphify explain <node>',
    '  cortex graphify neural-map',
    '  cortex graphify neural-open',
    '  cortex graphify connector-map',
    '  cortex graphify connector-open',
    '  cortex graphify orient <question>',
    '  cortex graphify open',
    '',
    'Direct form:',
    '  node md-os/os/graphify_connector.js status',
    '',
  ].join('\n'));
  process.exit(1);
}

function readProfile() {
  if (!fs.existsSync(PROFILE_FILE)) return DEFAULT_PROFILE;
  const parsed = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf8'));
  if (parsed.schema_version !== 1) throw new Error(`UNSUPPORTED_GRAPHIFY_CONNECTOR_SCHEMA_VERSION: ${parsed.schema_version}`);
  const mergeList = (base, override) => Array.from(new Set([
    ...(Array.isArray(base) ? base : []),
    ...(Array.isArray(override) ? override : []),
  ]));
  return {
    ...DEFAULT_PROFILE,
    ...parsed,
    safe_build_flags: mergeList(DEFAULT_PROFILE.safe_build_flags, parsed.safe_build_flags),
    safe_local_build_flags: mergeList(DEFAULT_PROFILE.safe_local_build_flags, parsed.safe_local_build_flags),
    forbidden_build_flags: mergeList(DEFAULT_PROFILE.forbidden_build_flags, parsed.forbidden_build_flags),
  };
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function registryEntry() {
  return {
    connector_id: 'graphify_connector',
    name: 'Graphify Document Graph Connector',
    kind: 'default_knowledge_graph_runtime',
    status: 'default_operational',
    implemented: true,
    execution_mode: 'bounded_exec',
    permission_profile: 'shell_safe',
    risk_level: 'medium',
    requires_approval: false,
    read_capabilities: ['document_graph_profile_read', 'graphify_graph_json_read', 'graphify_query_readback', 'graphify_benchmark_readback', 'graphify_connector_topology_read', 'graphify_orientation_read', 'graphify_dynamic_graph_read'],
    write_capabilities: ['graphify_graph_html_emit', 'graphify_graph_json_emit', 'graphify_report_emit', 'graphify_system_map_emit', 'graphify_connector_topology_emit', 'graphify_orientation_emit', 'graphify_dynamic_graph_evolution_emit'],
    allowed_commands: ['graphify', 'uvx', 'uv'],
    allowed_paths: [
      '.graphifyignore',
      'graphify-out/**',
      'md-os/ops/connectors/graphify_connector.json',
    ],
    side_effects: 'Runs the external Graphify CLI in local structural mode against a bounded workspace target and writes graph, report, tree HTML, benchmark readback, orientation, and dynamic graph evolution output under graphify-out/.',
    rollback_or_recovery_note: 'Delete graphify-out/ to remove generated visualization output. Source documents are not modified.',
    audit_rule: 'Every build records target, output paths, launcher source, exit code, and journal event.',
    notes: 'Directly integrated default MD-OS graph orientation surface. It reduces token load by routing work through bounded graph context first, and it evolves the graph dynamically through bounded local update builds. The default build path does not require an LLM API key.',
  };
}

function bootstrap(profile) {
  ensureDir(path.dirname(PROFILE_FILE));
  const profileCreated = !fs.existsSync(PROFILE_FILE);
  const existingProfile = readJsonSafe(PROFILE_FILE);
  const profileUpdated = profileCreated || JSON.stringify(existingProfile) !== JSON.stringify(profile);
  if (profileUpdated) {
    atomicWriteJsonLocked(PROFILE_FILE, profile, { context: 'graphify_profile_bootstrap' });
  }

  const registry = readJsonSafe(REGISTRY_FILE) || {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  };
  const connectors = Array.isArray(registry.connectors) ? registry.connectors : [];
  const entry = registryEntry();
  const existingIndex = connectors.findIndex((item) => shortText(item.connector_id).toLowerCase() === 'graphify_connector');
  const registryUpdated = existingIndex < 0 || JSON.stringify(connectors[existingIndex]) !== JSON.stringify(entry);
  const nextConnectors = [...connectors];
  if (existingIndex >= 0) nextConnectors[existingIndex] = entry;
  else nextConnectors.push(entry);

  if (registryUpdated) {
    atomicWriteJsonLocked(REGISTRY_FILE, {
      ...registry,
      schema_version: 1,
      registry_name: registry.registry_name || 'generic_connector_registry',
      updated_at: nowIso(),
      connectors: nextConnectors,
    }, { context: 'graphify_registry_bootstrap' });
  }

  appendJournal({
    event: 'graphify_connector_bootstrap',
    ...kernelBrokerMetadata(),
    profile_file: rel(PROFILE_FILE),
    registry_file: rel(REGISTRY_FILE),
    profile_created: profileCreated,
    profile_updated: profileUpdated,
    registry_updated: registryUpdated,
  });

  return {
    ok: true,
    mode: 'graphify_connector_bootstrap',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    profile_file: rel(PROFILE_FILE),
    registry_file: rel(REGISTRY_FILE),
    profile_created: profileCreated,
    profile_updated: profileUpdated,
    registry_updated: registryUpdated,
    status: status(profile),
  };
}

function commandPath(command) {
  const name = shortText(command);
  if (!/^[A-Za-z0-9_.-]+$/.test(name)) return null;
  const pathEntries = String(process.env.PATH || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const extensions = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM')
      .split(';')
      .filter(Boolean)
    : [''];
  const hasExtension = process.platform === 'win32' && Boolean(path.extname(name));
  const candidates = hasExtension ? [name] : extensions.map((extension) => `${name}${extension}`);

  for (const directory of pathEntries) {
    for (const candidateName of candidates) {
      const candidate = path.resolve(directory, candidateName);
      try {
        const stats = fs.statSync(candidate);
        if (!stats.isFile()) continue;
        if (process.platform !== 'win32') fs.accessSync(candidate, fs.constants.X_OK);
        return candidate;
      } catch (_) {
        // Continue through PATH entries. A missing or non-executable candidate is not available.
      }
    }
  }
  return null;
}

function resolveLauncher(profile) {
  const graphifyPath = commandPath(profile.cli_command || 'graphify');
  if (graphifyPath) {
    return {
      available: true,
      source: 'path',
      command: graphifyPath,
      args_prefix: [],
      note: 'Graphify CLI found on PATH.',
    };
  }

  const uvxPath = commandPath('uvx');
  if (uvxPath) {
    return {
      available: true,
      source: 'uvx',
      command: uvxPath,
      args_prefix: ['--from', profile.package_name || 'graphifyy', profile.cli_command || 'graphify'],
      note: 'Graphify CLI not found on PATH; uvx can run the graphifyy package on demand.',
    };
  }

  const uvPath = commandPath('uv');
  if (uvPath) {
    return {
      available: true,
      source: 'uv_tool_run',
      command: uvPath,
      args_prefix: ['tool', 'run', '--from', profile.package_name || 'graphifyy', profile.cli_command || 'graphify'],
      note: 'Graphify CLI not found on PATH; uv can run the graphifyy package on demand.',
    };
  }

  return {
    available: false,
    source: 'missing',
    command: null,
    args_prefix: [],
    note: 'Install Graphify with `uv tool install graphifyy`, `pipx install graphifyy`, or `pip install graphifyy`.',
  };
}

function resolveWorkspacePath(relativePath) {
  const target = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(relativePath || '.')));
  if (!fs.existsSync(target)) throw new Error(`GRAPHIFY_TARGET_MISSING: ${rel(target)}`);
  return target;
}

function outputPaths(profile) {
  const outputDir = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.output_dir || DEFAULT_PROFILE.output_dir)));
  const graphJson = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.graph_json || DEFAULT_PROFILE.graph_json)));
  const graphHtml = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.graph_html || DEFAULT_PROFILE.graph_html)));
  const reportMd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.report_md || DEFAULT_PROFILE.report_md)));
  const systemMapMd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.system_map_md || DEFAULT_PROFILE.system_map_md)));
  const neuralMapJson = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.neural_map_json || DEFAULT_PROFILE.neural_map_json)));
  const neuralMapHtml = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.neural_map_html || DEFAULT_PROFILE.neural_map_html)));
  const neuralMapMd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.neural_map_md || DEFAULT_PROFILE.neural_map_md)));
  const connectorTopologyJson = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.connector_topology_json || DEFAULT_PROFILE.connector_topology_json)));
  const connectorTopologyHtml = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.connector_topology_html || DEFAULT_PROFILE.connector_topology_html)));
  const connectorTopologyMd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.connector_topology_md || DEFAULT_PROFILE.connector_topology_md)));
  const orientationJson = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.orientation_json || DEFAULT_PROFILE.orientation_json)));
  const orientationMd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(profile.orientation_md || DEFAULT_PROFILE.orientation_md)));
  return {
    outputDir,
    graphJson,
    graphHtml,
    reportMd,
    systemMapMd,
    neuralMapJson,
    neuralMapHtml,
    neuralMapMd,
    connectorTopologyJson,
    connectorTopologyHtml,
    connectorTopologyMd,
    orientationJson,
    orientationMd,
  };
}

function graphifyOutputPathsForTarget(targetPath) {
  const outputDir = assertInsideWorkspace(path.join(targetPath, 'graphify-out'));
  return {
    outputDir,
    graphJson: path.join(outputDir, 'graph.json'),
    graphHtml: path.join(outputDir, 'graph.html'),
    reportMd: path.join(outputDir, 'GRAPH_REPORT.md'),
    manifestJson: path.join(outputDir, 'manifest.json'),
    labelsJson: path.join(outputDir, '.graphify_labels.json'),
    rootFile: path.join(outputDir, '.graphify_root'),
  };
}

function flagName(value) {
  return shortText(value).split('=')[0];
}

function sanitizeBuildArgs(profile, args) {
  const safeFlags = new Set(profile.safe_build_flags || DEFAULT_PROFILE.safe_build_flags);
  const forbiddenFlags = new Set(profile.forbidden_build_flags || DEFAULT_PROFILE.forbidden_build_flags);
  const sanitized = [];

  for (const rawArg of args) {
    const arg = shortText(rawArg);
    if (!arg) continue;
    if (['add', 'hook', 'install', 'uninstall'].includes(arg)) {
      throw new Error(`GRAPHIFY_SUBCOMMAND_NOT_ALLOWED_IN_BUILD: ${arg}`);
    }
    if (!arg.startsWith('-')) {
      sanitized.push(arg);
      continue;
    }
    const name = flagName(arg);
    if (forbiddenFlags.has(name)) throw new Error(`GRAPHIFY_FLAG_REQUIRES_EXPLICIT_SEPARATE_FLOW: ${name}`);
    if (!safeFlags.has(name)) throw new Error(`GRAPHIFY_BUILD_FLAG_NOT_ALLOWLISTED: ${name}`);
    sanitized.push(arg);
  }

  return sanitized;
}

function sanitizeLocalBuildArgs(profile, args) {
  const safeFlags = new Set(profile.safe_local_build_flags || DEFAULT_PROFILE.safe_local_build_flags);
  const forbiddenFlags = new Set(profile.forbidden_build_flags || DEFAULT_PROFILE.forbidden_build_flags);
  const updateArgs = [];
  let treeRequested = true;

  for (const rawArg of args) {
    const arg = shortText(rawArg);
    if (!arg) continue;
    if (!arg.startsWith('-')) throw new Error(`GRAPHIFY_LOCAL_BUILD_UNEXPECTED_POSITIONAL: ${arg}`);
    const name = flagName(arg);
    if (forbiddenFlags.has(name)) throw new Error(`GRAPHIFY_FLAG_REQUIRES_EXPLICIT_SEPARATE_FLOW: ${name}`);
    if (!safeFlags.has(name)) throw new Error(`GRAPHIFY_LOCAL_BUILD_FLAG_NOT_ALLOWLISTED: ${name}`);
    if (name === '--no-viz') {
      treeRequested = false;
      continue;
    }
    if (name === '--update') continue;
    updateArgs.push(arg);
  }

  return { updateArgs, treeRequested };
}

function splitBuildArgs(profile, args) {
  const values = [...args];
  let targetArg = profile.default_target || '.';
  if (values[0] && !String(values[0]).startsWith('-')) {
    targetArg = values.shift();
  }
  return {
    targetPath: resolveWorkspacePath(targetArg),
    graphifyArgs: sanitizeBuildArgs(profile, values),
  };
}

function runGraphify(profile, graphifyArgs, options = {}) {
  const launcher = resolveLauncher(profile);
  if (!launcher.available) {
    const error = new Error('GRAPHIFY_CLI_NOT_AVAILABLE');
    error.launcher = launcher;
    throw error;
  }

  const startedAt = Date.now();
  const result = spawnSync(launcher.command, [...launcher.args_prefix, ...graphifyArgs], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: process.env.HOME || os.homedir(),
      LANG: process.env.LANG || 'C',
    },
    timeout: options.timeout_ms || profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms,
    maxBuffer: options.max_buffer || 2000000,
  });

  return {
    ok: result.status === 0 && !result.error,
    launcher,
    command: [launcher.command, ...launcher.args_prefix, ...graphifyArgs].join(' '),
    status: Number.isInteger(result.status) ? result.status : null,
    duration_ms: Date.now() - startedAt,
    stdout: String(result.stdout || '').trim(),
    stderr: String(result.stderr || result.error && result.error.message || '').trim(),
  };
}

function copyIfExists(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(targetPath));
  fs.copyFileSync(sourcePath, targetPath);
  return true;
}

function mirrorTargetOutputsToCanonical(targetOutputs, canonicalOutputs) {
  if (path.resolve(targetOutputs.outputDir) === path.resolve(canonicalOutputs.outputDir)) {
    return { mirrored: false, copied: [] };
  }
  const copied = [];
  for (const [name, sourcePath] of Object.entries(targetOutputs)) {
    if (name === 'outputDir') continue;
    const targetPath = canonicalOutputs[name];
    if (!targetPath) continue;
    if (copyIfExists(sourcePath, targetPath)) copied.push(name);
  }
  return { mirrored: copied.length > 0, copied };
}

function readGraphMetrics(graphJsonPath) {
  const graph = readJsonSafe(graphJsonPath);
  const nodes = Array.isArray(graph && graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph && graph.edges)
    ? graph.edges
    : Array.isArray(graph && graph.links)
      ? graph.links
      : [];
  const communities = new Set(nodes.map((node) => node.community).filter((value) => value !== undefined && value !== null));
  return {
    node_count: nodes.length,
    edge_count: edges.length,
    community_count: communities.size,
    graph_present: Boolean(graph),
  };
}

function writeSystemMap(profile, buildPayload) {
  const outputs = outputPaths(profile);
  const metrics = readGraphMetrics(outputs.graphJson);
  const lines = [
    '# MD-OS Operating System Map',
    '',
    'Generated companion summary for the Graphify structural map.',
    '',
    '## Core Thesis',
    '',
    'MD-OS is an agentic software kernel implemented as an operating filesystem.',
    'It does not replace Linux, macOS, Windows, firmware, device controllers, or',
    'cloud services. It operates above them as a natural-language control plane for',
    'agentic work.',
    '',
    '```text',
    'Host operating system',
    '  -> filesystem, shell, processes, devices, network',
    '      -> MD-OS operating filesystem',
    '          -> identity, memory, policies, connectors, actions, verification, logs',
    '              -> coding hosts, local models, APIs, browsers, terminals, robots',
    '```',
    '',
    '## Canonical Control Layers',
    '',
    '```text',
    'Epistemic Layer',
    '  -> Semantic Layer',
    '  -> State Layer',
    '  -> Policy Kernel',
    '  -> Action Validity Layer',
    '  -> Execution Layer',
    '  -> Verification Layer',
    '  -> Ledger Layer',
    '```',
    '',
    '## Graphify Readback',
    '',
    `- target: \`${buildPayload.target}\``,
    `- build mode: \`${buildPayload.build_mode}\``,
    `- graph JSON: \`${rel(outputs.graphJson)}\``,
    `- graph HTML: \`${rel(outputs.graphHtml)}\``,
    `- graph HTML exists: \`${fs.existsSync(outputs.graphHtml)}\``,
    `- report: \`${rel(outputs.reportMd)}\``,
    `- nodes: \`${metrics.node_count}\``,
    `- edges: \`${metrics.edge_count}\``,
    `- communities: \`${metrics.community_count}\``,
    '',
    '## Native Use',
    '',
    'Graphify is the default MD-OS graph orientation surface. It is directly',
    'integrated into the operating layer for token-efficient context selection',
    'and bounded dynamic graph evolution.',
    '',
    'The agent refreshes or queries the graph first, identifies the relevant',
    'nodes and files, and then reads only the bounded context needed for the',
    'task.',
    '',
    '```text',
    'intent',
    '  -> graph query',
    '  -> relevant node/file set',
    '  -> bounded read',
    '  -> connector/builder/action',
    '  -> verification readback',
    '```',
    '',
    'The default MD-OS Graphify build path uses local structural extraction and',
    'does not require a remote LLM API key. Repeated local update builds let the',
    'repository graph evolve as files, connectors, schemas, and knowledge nodes',
    'change.',
    '',
  ];
  atomicWriteText(outputs.systemMapMd, `${lines.join('\n')}\n`);
  return {
    system_map_md: rel(outputs.systemMapMd),
    system_map_md_exists: fs.existsSync(outputs.systemMapMd),
    metrics,
  };
}

function status(profile) {
  const launcher = resolveLauncher(profile);
  const outputs = outputPaths(profile);
  return {
    ok: true,
    mode: 'graphify_connector_status',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    checked_at: nowIso(),
    package_name: profile.package_name || 'graphifyy',
    cli_command: profile.cli_command || 'graphify',
    launcher,
    default_target: profile.default_target || '.',
    direct_integration: Boolean(profile.direct_integration),
    default_operational_surface: Boolean(profile.default_operational_surface),
    default_orientation_surface: Boolean(profile.default_orientation_surface),
    token_budget_role: profile.token_budget_role || 'primary_context_reduction_surface',
    dynamic_graph_evolution: Boolean(profile.dynamic_graph_evolution),
    graph_evolution_mode: profile.graph_evolution_mode || 'bounded_local_update',
    default_refresh_command: profile.default_refresh_command || 'cortex graphify build .',
    default_orient_command: profile.default_orient_command || 'cortex graphify orient <question>',
    output_dir: rel(outputs.outputDir),
    graph_json: rel(outputs.graphJson),
    graph_html: rel(outputs.graphHtml),
    report_md: rel(outputs.reportMd),
    system_map_md: rel(outputs.systemMapMd),
    neural_map_json: rel(outputs.neuralMapJson),
    neural_map_html: rel(outputs.neuralMapHtml),
    neural_map_md: rel(outputs.neuralMapMd),
    connector_topology_json: rel(outputs.connectorTopologyJson),
    connector_topology_html: rel(outputs.connectorTopologyHtml),
    connector_topology_md: rel(outputs.connectorTopologyMd),
    orientation_json: rel(outputs.orientationJson),
    orientation_md: rel(outputs.orientationMd),
    graph_json_exists: fs.existsSync(outputs.graphJson),
    graph_html_exists: fs.existsSync(outputs.graphHtml),
    report_md_exists: fs.existsSync(outputs.reportMd),
    system_map_md_exists: fs.existsSync(outputs.systemMapMd),
    neural_map_json_exists: fs.existsSync(outputs.neuralMapJson),
    neural_map_html_exists: fs.existsSync(outputs.neuralMapHtml),
    neural_map_md_exists: fs.existsSync(outputs.neuralMapMd),
    connector_topology_json_exists: fs.existsSync(outputs.connectorTopologyJson),
    connector_topology_html_exists: fs.existsSync(outputs.connectorTopologyHtml),
    connector_topology_md_exists: fs.existsSync(outputs.connectorTopologyMd),
    orientation_json_exists: fs.existsSync(outputs.orientationJson),
    orientation_md_exists: fs.existsSync(outputs.orientationMd),
  };
}

function build(profile, args) {
  const { targetPath, graphifyArgs } = splitBuildArgs(profile, args);
  const target = rel(targetPath);
  const { updateArgs, treeRequested } = sanitizeLocalBuildArgs(profile, graphifyArgs);
  const outputs = outputPaths(profile);
  const targetOutputs = graphifyOutputPathsForTarget(targetPath);
  const updateResult = runGraphify(profile, ['update', target, ...updateArgs]);
  const mirror = mirrorTargetOutputsToCanonical(targetOutputs, {
    outputDir: outputs.outputDir,
    graphJson: outputs.graphJson,
    graphHtml: outputs.graphHtml,
    reportMd: outputs.reportMd,
    manifestJson: path.join(outputs.outputDir, 'manifest.json'),
    labelsJson: path.join(outputs.outputDir, '.graphify_labels.json'),
    rootFile: path.join(outputs.outputDir, '.graphify_root'),
  });
  let treeResult = null;
  if (treeRequested && fs.existsSync(outputs.graphJson)) {
    treeResult = runGraphify(profile, [
      'tree',
      '--graph',
      rel(outputs.graphJson),
      '--output',
      rel(outputs.graphHtml),
      '--root',
      target,
      '--label',
      shortText(profile.tree_label || DEFAULT_PROFILE.tree_label),
    ], {
      timeout_ms: Math.min(profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms, 300000),
      max_buffer: 1000000,
    });
  }
  const payload = {
    ok: updateResult.ok
      && fs.existsSync(outputs.graphJson)
      && (!treeRequested || (treeResult && treeResult.ok && fs.existsSync(outputs.graphHtml))),
    mode: 'graphify_connector_build',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    build_mode: 'local_update',
    target,
    output_dir: rel(outputs.outputDir),
    graph_json: rel(outputs.graphJson),
    graph_html: rel(outputs.graphHtml),
    report_md: rel(outputs.reportMd),
    system_map_md: rel(outputs.systemMapMd),
    target_output_dir: rel(targetOutputs.outputDir),
    target_output_mirrored: mirror.mirrored,
    mirrored_output_parts: mirror.copied,
    graph_json_exists: fs.existsSync(outputs.graphJson),
    graph_html_exists: fs.existsSync(outputs.graphHtml),
    report_md_exists: fs.existsSync(outputs.reportMd),
    system_map_md_exists: false,
    launcher_source: updateResult.launcher.source,
    exit_code: updateResult.status,
    tree_exit_code: treeResult ? treeResult.status : null,
    duration_ms: updateResult.duration_ms + (treeResult ? treeResult.duration_ms : 0),
    stdout_tail: [
      ...updateResult.stdout.split(/\r?\n/).filter(Boolean).slice(-12),
      ...(treeResult ? treeResult.stdout.split(/\r?\n/).filter(Boolean).slice(-8) : []),
    ].slice(-20),
    stderr_tail: [
      ...updateResult.stderr.split(/\r?\n/).filter(Boolean).slice(-12),
      ...(treeResult ? treeResult.stderr.split(/\r?\n/).filter(Boolean).slice(-8) : []),
    ].slice(-20),
  };
  if (payload.graph_json_exists) {
    Object.assign(payload, writeSystemMap(profile, payload));
  }
  appendJournal({
    event: 'graphify_connector_build',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    target,
    output_dir: payload.output_dir,
    graph_json: payload.graph_json,
    graph_html: payload.graph_html,
    system_map_md: payload.system_map_md,
    build_mode: payload.build_mode,
    exit_code: updateResult.status,
    tree_exit_code: treeResult ? treeResult.status : null,
    ok: payload.ok,
  });
  return payload;
}

function benchmark(profile, graphParts = []) {
  const outputs = outputPaths(profile);
  const graphPath = graphParts.length ? resolveWorkspacePath(graphParts.join(' ')) : outputs.graphJson;
  if (!fs.existsSync(graphPath)) throw new Error(`GRAPHIFY_GRAPH_JSON_MISSING: ${rel(graphPath)}`);
  const result = runGraphify(profile, ['benchmark', rel(graphPath)], {
    timeout_ms: Math.min(profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms, 300000),
    max_buffer: 1000000,
  });
  return {
    ok: result.ok,
    mode: 'graphify_connector_benchmark',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    graph_json: rel(graphPath),
    launcher_source: result.launcher.source,
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function query(profile, questionParts) {
  if (!questionParts.length) usage();
  const outputs = outputPaths(profile);
  if (!fs.existsSync(outputs.graphJson)) throw new Error(`GRAPHIFY_GRAPH_JSON_MISSING: ${rel(outputs.graphJson)}`);
  const question = questionParts.join(' ');
  const result = runGraphify(profile, ['query', question, '--graph', rel(outputs.graphJson)], {
    timeout_ms: Math.min(profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms, 300000),
  });
  return {
    ok: result.ok,
    mode: 'graphify_connector_query',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    graph_json: rel(outputs.graphJson),
    question,
    launcher_source: result.launcher.source,
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function pathQuery(profile, source, target) {
  if (!source || !target) usage();
  const outputs = outputPaths(profile);
  if (!fs.existsSync(outputs.graphJson)) throw new Error(`GRAPHIFY_GRAPH_JSON_MISSING: ${rel(outputs.graphJson)}`);
  const result = runGraphify(profile, ['path', source, target, '--graph', rel(outputs.graphJson)], {
    timeout_ms: Math.min(profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms, 300000),
  });
  return {
    ok: result.ok,
    mode: 'graphify_connector_path',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    graph_json: rel(outputs.graphJson),
    source,
    target,
    launcher_source: result.launcher.source,
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function explain(profile, nodeParts) {
  if (!nodeParts.length) usage();
  const outputs = outputPaths(profile);
  if (!fs.existsSync(outputs.graphJson)) throw new Error(`GRAPHIFY_GRAPH_JSON_MISSING: ${rel(outputs.graphJson)}`);
  const node = nodeParts.join(' ');
  const result = runGraphify(profile, ['explain', node, '--graph', rel(outputs.graphJson)], {
    timeout_ms: Math.min(profile.default_timeout_ms || DEFAULT_PROFILE.default_timeout_ms, 300000),
  });
  return {
    ok: result.ok,
    mode: 'graphify_connector_explain',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    graph_json: rel(outputs.graphJson),
    node,
    launcher_source: result.launcher.source,
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

const ORIENTATION_STOP_WORDS = new Set([
  'a', 'ad', 'al', 'alla', 'allo', 'anche', 'che', 'ci', 'con', 'cosa', 'come',
  'da', 'dal', 'dei', 'del', 'della', 'di', 'dove', 'e', 'gli', 'il', 'in',
  'la', 'le', 'lo', 'mi', 'nel', 'nella', 'non', 'o', 'per', 'piu', 'puo',
  'quale', 'quali', 'se', 'su', 'sul', 'tra', 'un', 'una', 'uno',
  'a', 'an', 'and', 'are', 'for', 'from', 'how', 'in', 'is', 'of', 'on', 'or',
  'the', 'to', 'what', 'where', 'which', 'with',
]);

const ORIENTATION_SYNONYMS = {
  adeept: ['arm', 'robotics', 'servo', 'gripper', 'pose'],
  audio: ['speak', 'speech', 'voice', 'kokoro', 'volume'],
  braccio: ['adeept', 'arm', 'robotics', 'servo', 'gripper', 'pose'],
  camera: ['vision', 'video', 'capture', 'frame', 'webcam'],
  connettore: ['connector', 'capability', 'driver'],
  connettori: ['connector', 'capability', 'driver'],
  device: ['hardware', 'connector'],
  grafo: ['graph', 'graphify', 'topology', 'map'],
  graphify: ['graph', 'topology', 'orientation', 'neural'],
  hardware: ['device', 'connector', 'control'],
  mappa: ['graph', 'graphify', 'topology', 'map'],
  robot: ['robotics', 'vector', 'adeept', 'arm'],
  robotico: ['robotics', 'adeept', 'arm'],
  tazza: ['camera', 'vision', 'video'],
  telecamera: ['camera', 'vision', 'video', 'capture'],
  vector: ['robot', 'camera', 'speech', 'motion'],
  video: ['camera', 'vision', 'capture', 'frame'],
  visione: ['vision', 'camera', 'video', 'frame'],
  voce: ['audio', 'voice', 'speak', 'speech', 'kokoro'],
};

function normalizeSearchText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_./:-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function queryTerms(question) {
  const baseTerms = normalizeSearchText(question)
    .split(/\s+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2 && !ORIENTATION_STOP_WORDS.has(term));
  const expanded = new Set(baseTerms);
  for (const term of baseTerms) {
    for (const synonym of ORIENTATION_SYNONYMS[term] || []) expanded.add(synonym);
    if (term.endsWith('s') && term.length > 4) expanded.add(term.slice(0, -1));
  }
  return Array.from(expanded).slice(0, 48);
}

function flattenText(value, output = []) {
  if (value === null || value === undefined) return output;
  if (Array.isArray(value)) {
    for (const item of value) flattenText(item, output);
    return output;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value)) flattenText(item, output);
    return output;
  }
  output.push(String(value));
  return output;
}

function safeGraphPath(value) {
  const text = shortText(value).replace(/\\/g, '/');
  if (!text) return '';
  if (text.includes('/../') || text.startsWith('../')) return '';
  if (text.startsWith('/')) return '';
  if (text.startsWith('.obsidian/')) return '';
  if (text.startsWith('md-os/ops/local/')) return '';
  if (text.startsWith('md-os/ops/archive/')) return '';
  if (text.startsWith('md-os/ops/artifacts/')) return '';
  if (text.startsWith('md-os/ops/sources/connectors/')) return '';
  if (text.startsWith('graphify-out/')) return '';
  if (/\.(png|jpe?g|webp|gif|wav|mp3|mp4|mov)$/i.test(text)) return '';
  return text;
}

function graphNodePath(node = {}) {
  return safeGraphPath(node.path || node.source_file || node.file || '');
}

function nodeSearchText(node = {}) {
  return normalizeSearchText(flattenText({
    id: node.id,
    label: node.label,
    type: node.type,
    path: node.path,
    source_file: node.source_file,
    connector_id: node.connector_id,
    package_script: node.package_script,
    kind: node.kind,
    mode: node.mode,
    semantic_layer: node.semantic_layer,
    cognitive_role: node.cognitive_role,
    relation: node.relation,
    status: node.status,
    capability: node.capability,
  }).join(' '));
}

function scoreNode(node, terms, questionText) {
  const text = nodeSearchText(node);
  if (!text) return null;
  let score = 0;
  const matchedTerms = [];
  const tokenSet = new Set(text.split(/\s+/).filter(Boolean));
  for (const term of terms) {
    if (!term) continue;
    if (tokenSet.has(term)) {
      score += 5;
      matchedTerms.push(term);
    } else if (text.includes(term)) {
      score += 2;
      matchedTerms.push(term);
    }
  }
  const label = normalizeSearchText(node.label || node.id || '');
  const strongLabelMatch = label.length >= 3 && questionText.includes(label);
  if (strongLabelMatch) score += 5;
  if (!matchedTerms.length && !strongLabelMatch) return null;
  if (node.type === 'connector') score += 2;
  if (node.type === 'driver') score += 1.5;
  if (node.type === 'script') score += 1;
  if (node.type === 'domain') score += 1;
  if (node.path || node.source_file) score += 0.5;
  return score > 0 ? { score, matched_terms: Array.from(new Set(matchedTerms)) } : null;
}

function readGraphSource(filePath, sourceId, topology) {
  const graph = readJsonSafe(filePath);
  if (!graph) return null;
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges)
    ? graph.edges
    : Array.isArray(graph.links)
      ? graph.links
      : [];
  return {
    source_id: sourceId,
    topology,
    file: rel(filePath),
    nodes,
    edges,
  };
}

function orientationSources(profile) {
  const outputs = outputPaths(profile);
  if (!fs.existsSync(outputs.connectorTopologyJson)) {
    try {
      connectorTopology(profile);
    } catch (_) {
      // Orientation can still proceed with any existing graph source.
    }
  }
  return [
    readGraphSource(outputs.connectorTopologyJson, 'connector_topology', 'connector_topology'),
    readGraphSource(outputs.neuralMapJson, 'neural_node_map', 'semantic_neural_map'),
    readGraphSource(outputs.graphJson, 'graphify_structural_graph', 'structural_graph'),
  ].filter(Boolean);
}

function compactEdge(edge = {}) {
  return {
    source: shortText(edge.source),
    relation: shortText(edge.relation || edge.kind || 'related'),
    target: shortText(edge.target),
  };
}

function neighborMapFor(source) {
  const map = new Map();
  for (const edge of source.edges || []) {
    const compact = compactEdge(edge);
    if (!compact.source || !compact.target) continue;
    if (!map.has(compact.source)) map.set(compact.source, []);
    if (!map.has(compact.target)) map.set(compact.target, []);
    map.get(compact.source).push({ ...compact, neighbor: compact.target });
    map.get(compact.target).push({ ...compact, neighbor: compact.source });
  }
  return map;
}

function uniqueList(values, limit = 20) {
  return Array.from(new Set(values.filter(Boolean))).slice(0, limit);
}

function nodeTypePriority(type) {
  if (type === 'driver') return 80;
  if (type === 'schema') return 70;
  if (type === 'document') return 55;
  if (type === 'example') return 45;
  if (type === 'code') return 40;
  if (type === 'test') return 25;
  return 35;
}

function rankedPaths(nodes, limit = 20) {
  const byPath = new Map();
  for (const node of nodes) {
    if (!node.path) continue;
    const rank = nodeTypePriority(node.type) + Number(node.score || 0);
    const current = byPath.get(node.path);
    if (!current || rank > current.rank) {
      byPath.set(node.path, { path: node.path, rank });
    }
  }
  return Array.from(byPath.values())
    .sort((left, right) => {
      const rankCompare = right.rank - left.rank;
      if (rankCompare !== 0) return rankCompare;
      return left.path.localeCompare(right.path);
    })
    .map((item) => item.path)
    .slice(0, limit);
}

function buildOrientationMarkdown(payload) {
  const lines = [
    '# Graphify Orientation',
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
    `Question: ${payload.question}`,
    '',
    '## Read First',
    '',
    ...(payload.recommended_reads.length ? payload.recommended_reads.map((item) => `- \`${item}\``) : ['- `none`']),
    '',
    '## Connectors',
    '',
    ...(payload.connectors.length ? payload.connectors.map((item) => `- \`${item.connector_id}\`: ${item.label}`) : ['- `none`']),
    '',
    '## Commands',
    '',
    ...(payload.commands.length ? payload.commands.map((item) => `- \`${item}\``) : ['- `none`']),
    '',
    '## Top Matches',
    '',
  ];
  for (const match of payload.top_matches.slice(0, 12)) {
    lines.push(`- \`${match.source}:${match.id}\` score \`${match.score}\` ${match.label}${match.path ? ` -> \`${match.path}\`` : ''}`);
  }
  lines.push('', '## Next Step', '');
  lines.push(...payload.next_steps.map((step) => `- ${step}`));
  lines.push('');
  return `${lines.join('\n')}\n`;
}

function orient(profile, questionParts) {
  if (!questionParts.length) usage();
  const question = shortText(questionParts.join(' '));
  const normalizedQuestion = normalizeSearchText(question);
  const terms = queryTerms(question);
  if (!terms.length) throw new Error('GRAPHIFY_ORIENTATION_QUERY_TOO_SMALL');
  const sources = orientationSources(profile);
  if (!sources.length) throw new Error('GRAPHIFY_ORIENTATION_SOURCES_MISSING');

  const allMatches = [];
  const sourceNodeMaps = new Map();
  const sourceNeighborMaps = new Map();
  for (const source of sources) {
    const nodeMap = new Map();
    for (const node of source.nodes) {
      if (!node || !node.id) continue;
      const normalizedNode = { ...node, source: source.source_id };
      nodeMap.set(node.id, normalizedNode);
      const scored = scoreNode(normalizedNode, terms, normalizedQuestion);
      if (!scored) continue;
      allMatches.push({
        source: source.source_id,
        topology: source.topology,
        id: shortText(node.id),
        label: shortText(node.label || node.id),
        type: shortText(node.type || node.file_type || 'node'),
        path: graphNodePath(node),
        connector_id: shortText(node.connector_id || ''),
        package_script: shortText(node.package_script || ''),
        risk_level: shortText(node.risk_level || ''),
        score: Number(scored.score.toFixed(2)),
        matched_terms: scored.matched_terms,
      });
    }
    sourceNodeMaps.set(source.source_id, nodeMap);
    sourceNeighborMaps.set(source.source_id, neighborMapFor(source));
  }

  const sortedMatches = allMatches
    .sort((left, right) => {
      const scoreCompare = right.score - left.score;
      if (scoreCompare !== 0) return scoreCompare;
      return `${left.source}:${left.id}`.localeCompare(`${right.source}:${right.id}`);
    })
    .slice(0, 40);

  const selectedIds = new Map();
  for (const match of sortedMatches.slice(0, 12)) {
    if (!selectedIds.has(match.source)) selectedIds.set(match.source, new Set());
    selectedIds.get(match.source).add(match.id);
  }

  const neighborEdges = [];
  const neighborNodes = [];
  for (const [sourceId, ids] of selectedIds.entries()) {
    const nodeMap = sourceNodeMaps.get(sourceId) || new Map();
    const neighbors = sourceNeighborMaps.get(sourceId) || new Map();
    for (const id of ids) {
      for (const edge of (neighbors.get(id) || []).slice(0, 8)) {
        neighborEdges.push({
          source: sourceId,
          ...edge,
        });
        const neighborNode = nodeMap.get(edge.neighbor);
        if (neighborNode) {
          neighborNodes.push({
            source: sourceId,
            id: shortText(neighborNode.id),
            label: shortText(neighborNode.label || neighborNode.id),
            type: shortText(neighborNode.type || neighborNode.file_type || 'node'),
            path: graphNodePath(neighborNode),
            connector_id: shortText(neighborNode.connector_id || ''),
            package_script: shortText(neighborNode.package_script || ''),
          });
        }
      }
    }
  }

  const combined = [...sortedMatches, ...neighborNodes];
  const recommendedReads = rankedPaths(combined, 20);
  const commands = uniqueList(combined.filter((node) => node.type === 'script' || node.package_script).map((node) => node.package_script || node.label), 20);
  const connectorMap = new Map();
  for (const node of combined.filter((item) => item.type === 'connector' || item.connector_id)) {
    const connectorId = node.connector_id || node.id.replace(/^connector:/, '');
    if (!connectorId) continue;
    const candidate = {
      connector_id: connectorId,
      label: node.label,
      source: node.source,
    };
    const current = connectorMap.get(connectorId);
    if (!current || node.type === 'connector') connectorMap.set(connectorId, candidate);
  }
  const connectors = Array.from(connectorMap.values()).slice(0, 12);
  const tests = uniqueList(combined.filter((node) => node.type === 'test').map((node) => node.path), 12);
  const schemas = uniqueList(combined.filter((node) => node.type === 'schema').map((node) => node.path), 12);
  const drivers = uniqueList(combined.filter((node) => node.type === 'driver').map((node) => node.path), 12);
  const nextSteps = [
    recommendedReads.length
      ? `Read the first ${Math.min(5, recommendedReads.length)} recommended path(s) before broad repository search.`
      : 'No source path was identified; fall back to a targeted text search.',
    commands.length
      ? 'Use the listed command surface if the task requires execution.'
      : 'No command surface was identified for this question.',
    tests.length
      ? 'Run the listed tests after changing this area.'
      : 'Select focused tests from the nearest driver or schema if edits are made.',
  ];

  const outputs = outputPaths(profile);
  ensureDir(path.dirname(outputs.orientationJson));
  const payload = {
    ok: true,
    mode: 'graphify_connector_orient',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    updated_at: nowIso(),
    question,
    query_terms: terms,
    sources_used: sources.map((source) => ({
      source_id: source.source_id,
      topology: source.topology,
      file: source.file,
      node_count: source.nodes.length,
      edge_count: source.edges.length,
    })),
    top_matches: sortedMatches,
    neighbor_edges: neighborEdges.slice(0, 60),
    recommended_reads: recommendedReads,
    drivers,
    connectors,
    commands,
    tests,
    schemas,
    next_steps: nextSteps,
    output_json: rel(outputs.orientationJson),
    output_md: rel(outputs.orientationMd),
  };
  atomicWriteJson(outputs.orientationJson, payload);
  atomicWriteText(outputs.orientationMd, buildOrientationMarkdown(payload));
  appendJournal({
    event: 'graphify_connector_orient',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    question,
    output_json: payload.output_json,
    output_md: payload.output_md,
    match_count: payload.top_matches.length,
    recommended_read_count: payload.recommended_reads.length,
  });
  return payload;
}

function openGraph(profile) {
  const outputs = outputPaths(profile);
  return {
    ok: fs.existsSync(outputs.graphHtml),
    mode: 'graphify_connector_open',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    graph_html: rel(outputs.graphHtml),
    exists: fs.existsSync(outputs.graphHtml),
    browser_command_hint: `xdg-open ${rel(outputs.graphHtml)}`,
    note: fs.existsSync(outputs.graphHtml)
      ? 'Open graph_html in a browser to inspect the interactive document network.'
      : 'Run `cortex graphify build <target_dir>` first.',
  };
}

function neuralMap(profile) {
  const outputs = outputPaths(profile);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build_neural_node_map.js')], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 120000,
    maxBuffer: 1000000,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || result.error && result.error.message || '').trim();
  let builderPayload = null;
  const lastLine = stdout.split(/\r?\n/).filter(Boolean).at(-1);
  if (lastLine) {
    try {
      builderPayload = JSON.parse(lastLine);
    } catch (_) {
      builderPayload = null;
    }
  }
  return {
    ok: result.status === 0 && !result.error,
    mode: 'graphify_connector_neural_map',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    output_json: rel(outputs.neuralMapJson),
    output_html: rel(outputs.neuralMapHtml),
    output_md: rel(outputs.neuralMapMd),
    output_json_exists: fs.existsSync(outputs.neuralMapJson),
    output_html_exists: fs.existsSync(outputs.neuralMapHtml),
    output_md_exists: fs.existsSync(outputs.neuralMapMd),
    exit_code: Number.isInteger(result.status) ? result.status : null,
    builder_payload: builderPayload,
    stdout_tail: stdout.split(/\r?\n/).filter(Boolean).slice(-20),
    stderr_tail: stderr.split(/\r?\n/).filter(Boolean).slice(-20),
  };
}

function openNeuralMap(profile) {
  const outputs = outputPaths(profile);
  return {
    ok: fs.existsSync(outputs.neuralMapHtml),
    mode: 'graphify_connector_neural_open',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    neural_map_html: rel(outputs.neuralMapHtml),
    exists: fs.existsSync(outputs.neuralMapHtml),
    browser_command_hint: `xdg-open ${rel(outputs.neuralMapHtml)}`,
    note: fs.existsSync(outputs.neuralMapHtml)
      ? 'Open neural_map_html in a browser to inspect the semantic node network.'
      : 'Run `cortex graphify neural-map` first.',
  };
}

function connectorTopology(profile) {
  const outputs = outputPaths(profile);
  const result = spawnSync(process.execPath, [path.join(__dirname, 'build_connector_topology_map.js')], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
    timeout: 120000,
    maxBuffer: 1000000,
  });
  const stdout = String(result.stdout || '').trim();
  const stderr = String(result.stderr || result.error && result.error.message || '').trim();
  let builderPayload = null;
  const lastLine = stdout.split(/\r?\n/).filter(Boolean).at(-1);
  if (lastLine) {
    try {
      builderPayload = JSON.parse(lastLine);
    } catch (_) {
      builderPayload = null;
    }
  }
  return {
    ok: result.status === 0 && !result.error,
    mode: 'graphify_connector_connector_topology',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    output_json: rel(outputs.connectorTopologyJson),
    output_html: rel(outputs.connectorTopologyHtml),
    output_md: rel(outputs.connectorTopologyMd),
    output_json_exists: fs.existsSync(outputs.connectorTopologyJson),
    output_html_exists: fs.existsSync(outputs.connectorTopologyHtml),
    output_md_exists: fs.existsSync(outputs.connectorTopologyMd),
    exit_code: Number.isInteger(result.status) ? result.status : null,
    builder_payload: builderPayload,
    stdout_tail: stdout.split(/\r?\n/).filter(Boolean).slice(-20),
    stderr_tail: stderr.split(/\r?\n/).filter(Boolean).slice(-20),
  };
}

function openConnectorTopology(profile) {
  const outputs = outputPaths(profile);
  return {
    ok: fs.existsSync(outputs.connectorTopologyHtml),
    mode: 'graphify_connector_connector_open',
    ...kernelBrokerMetadata(),
    connector_id: profile.connector_id || 'graphify_connector',
    connector_topology_html: rel(outputs.connectorTopologyHtml),
    exists: fs.existsSync(outputs.connectorTopologyHtml),
    browser_command_hint: `xdg-open ${rel(outputs.connectorTopologyHtml)}`,
    note: fs.existsSync(outputs.connectorTopologyHtml)
      ? 'Open connector_topology_html in a browser to inspect the sanitized connector topology.'
      : 'Run `cortex graphify connector-map` first.',
  };
}

function main() {
  const profile = readProfile();
  const [command = 'status', ...rest] = process.argv.slice(2);

  try {
    if (command === 'status' || command === 'list') return printJson(status(profile));
    if (command === 'bootstrap') return printJson(bootstrap(profile));
    if (command === 'build' || command === 'run') return printJson(build(profile, rest));
    if (command === 'benchmark') return printJson(benchmark(profile, rest));
    if (command === 'query') return printJson(query(profile, rest));
    if (command === 'path') return printJson(pathQuery(profile, rest[0], rest[1]));
    if (command === 'explain') return printJson(explain(profile, rest));
    if (command === 'neural-map' || command === 'neural' || command === 'map') return printJson(neuralMap(profile));
    if (command === 'neural-open') return printJson(openNeuralMap(profile));
    if (command === 'connector-map' || command === 'connector-topology' || command === 'topology') return printJson(connectorTopology(profile));
    if (command === 'connector-open' || command === 'topology-open') return printJson(openConnectorTopology(profile));
    if (command === 'orient' || command === 'orientation' || command === 'context' || command === 'route') return printJson(orient(profile, rest));
    if (command === 'open') return printJson(openGraph(profile));
  } catch (error) {
    printJson({
      ok: false,
      mode: 'graphify_connector_error',
      ...kernelBrokerMetadata(),
      error: error.message,
      launcher: error.launcher || null,
    });
    process.exit(1);
  }

  usage();
}

if (require.main === module) main();

module.exports = {
  DEFAULT_PROFILE,
  bootstrap,
  connectorTopology,
  neuralMap,
  orient,
  outputPaths,
  benchmark,
  resolveLauncher,
  sanitizeLocalBuildArgs,
  sanitizeBuildArgs,
  splitBuildArgs,
  status,
};
