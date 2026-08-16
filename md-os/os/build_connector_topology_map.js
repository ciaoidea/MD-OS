#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const REGISTRY_JSON = path.join(MDOS_ROOT, 'ops', 'connectors', 'connector_registry.json');
const PACKAGE_JSON = path.join(WORKSPACE_ROOT, 'package.json');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'graphify-out');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'connector_topology.json');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'connector_topology.html');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'connector_topology.md');

const SAFE_REGISTRY_FIELDS = [
  'connector_id',
  'name',
  'kind',
  'status',
  'implemented',
  'execution_mode',
  'permission_profile',
  'risk_level',
  'requires_approval',
  'read_capabilities',
  'write_capabilities',
  'allowed_commands',
];

const DRIVER_BY_CONNECTOR = {
  adeept_arm: 'md-os/os/adeept_arm_connector.js',
  aferiy_power: 'md-os/os/aferiy_power_connector.js',
  api_adapter: 'md-os/os/api_connector.js',
  desktop_adapter: null,
  filesystem_connector: 'md-os/os/filesystem_connector.js',
  filesystem_runtime: 'md-os/os/filesystem_connector.js',
  graphify_connector: 'md-os/os/graphify_connector.js',
  hardware_control: 'md-os/os/hardware_control.js',
  hardware_discovery: 'md-os/os/hardware_bootstrap.js',
  lg_webos_tv: 'md-os/os/lg_webos_tv_connector.js',
  manual_signals: 'md-os/os/register_manual_signal.js',
  robot_mock_connector: 'md-os/os/robot_mock_connector.js',
  software_discovery: 'md-os/os/software_bootstrap.js',
  terminal_executor: 'md-os/os/terminal_connector.js',
  ticketing_connector: 'md-os/os/ticketing_connector.js',
  vector_robot: 'md-os/os/vector_connector.js',
  wolfram_connector: 'md-os/os/wolfram_connector.js',
};

const DOMAIN_DEFINITIONS = [
  {
    id: 'domain:agentic_kernel',
    label: 'Agentic Kernel Connectors',
    focus: 'Filesystem, terminal, API, ticket, and manual signal adapters that connect natural-language programs to bounded execution.',
    connector_ids: ['manual_signals', 'filesystem_runtime', 'filesystem_connector', 'terminal_executor', 'api_adapter', 'ticketing_connector'],
    script_selectors: [
      { prefix: 'connector:terminal:' },
      { prefix: 'connector:api:' },
      { prefix: 'connector:filesystem:' },
      { prefix: 'connector:ticketing:' },
      { exact: 'mcp:server' },
      { exact: 'mcp:server:list-tools' },
    ],
    schemas: ['md-os/schemas/connector.schema.json'],
    tests: ['test/terminal_connector.test.js', 'test/api_connector.test.js', 'test/new_connectors.test.js'],
  },
  {
    id: 'domain:audio_io',
    label: 'Audio I/O',
    focus: 'Speech output, volume control, audio feedback, and robot speech routes.',
    connector_ids: ['hardware_control', 'vector_robot'],
    script_selectors: [
      { prefix: 'audio:' },
      { prefix: 'connector:vector:', includes: ['say'] },
      { prefix: 'connector:vector:', includes: ['speak'] },
    ],
    schemas: ['md-os/schemas/hardware_snapshot.schema.json'],
    tests: ['test/hardware_control.test.js', 'test/vector_connector.test.js'],
  },
  {
    id: 'domain:mathematics_wolfram',
    label: 'Mathematics and Wolfram',
    focus: 'Bounded symbolic and numerical calculations with source hashes, epistemic labels, artifacts, and replayable connector snapshots.',
    connector_ids: ['wolfram_connector'],
    script_selectors: [
      { prefix: 'wolfram:' },
      { prefix: 'math:' },
      { prefix: 'connector:wolfram:' },
    ],
    schemas: ['md-os/schemas/wolfram_calculation.schema.json'],
    examples: ['md-os/examples/connectors/wolfram_connector.json'],
    tests: ['test/wolfram_connector.test.js'],
  },
  {
    id: 'domain:video_vision',
    label: 'Video and Vision',
    focus: 'Screen capture, camera capture, local vision streams, and self-observation feedback loops.',
    connector_ids: ['hardware_control', 'vector_robot', 'adeept_arm'],
    script_selectors: [
      { prefix: 'screen:' },
      { prefix: 'vision:' },
      { prefix: 'connector:vector:', includes: ['camera'] },
      { prefix: 'connector:vector:', includes: ['capture'] },
      { prefix: 'connector:adeept-arm:', includes: ['status'] },
    ],
    drivers: ['md-os/os/live_vision_pipeline.js'],
    schemas: ['md-os/schemas/hardware_snapshot.schema.json'],
    tests: ['test/hardware_control.test.js', 'test/vector_connector.test.js', 'test/adeept_arm_connector.test.js'],
  },
  {
    id: 'domain:robotics',
    label: 'Robotics',
    focus: 'Robot control, arm control, simulation, behavior readback, and hardware action gates.',
    connector_ids: ['robot_mock_connector', 'vector_robot', 'adeept_arm'],
    script_selectors: [
      { prefix: 'connector:robot-mock:' },
      { prefix: 'connector:vector:' },
      { prefix: 'connector:adeept-arm:' },
    ],
    schemas: ['md-os/schemas/hardware_snapshot.schema.json'],
    tests: ['test/vector_connector.test.js', 'test/adeept_arm_connector.test.js'],
  },
  {
    id: 'domain:home_device_power',
    label: 'Home, Device, and Power',
    focus: 'Hardware discovery, TV control, power-station telemetry, host devices, and explicit local actuation.',
    connector_ids: ['hardware_discovery', 'hardware_control', 'lg_webos_tv', 'aferiy_power', 'software_discovery'],
    script_selectors: [
      { prefix: 'hardware:' },
      { prefix: 'device:' },
      { prefix: 'software:' },
      { prefix: 'display:' },
      { prefix: 'connector:lg-webos-tv:' },
      { prefix: 'connector:aferiy-power:' },
    ],
    schemas: ['md-os/schemas/hardware_snapshot.schema.json'],
    tests: [
      'test/hardware_bootstrap.test.js',
      'test/hardware_control.test.js',
      'test/lg_webos_tv_connector.test.js',
      'test/aferiy_power_connector.test.js',
    ],
  },
  {
    id: 'domain:graph_navigation',
    label: 'Graph Navigation',
    focus: 'Graphify structural maps, semantic neural maps, connector topology, and compact repository navigation.',
    connector_ids: ['graphify_connector'],
    script_selectors: [
      { prefix: 'graphify:' },
      { exact: 'build:graph' },
      { exact: 'build:semantic' },
      { exact: 'build:runtime' },
    ],
    drivers: [
      'md-os/os/build_markdown_graph.js',
      'md-os/os/build_semantic_knowledge_graph.js',
      'md-os/os/build_neural_node_map.js',
      'md-os/os/build_connector_topology_map.js',
    ],
    examples: ['md-os/examples/connectors/graphify_connector.json'],
    tests: ['test/graphify_connector.test.js', 'test/neural_node_map.test.js'],
  },
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/') || '.';
}

function workspacePath(relativePath) {
  return path.join(WORKSPACE_ROOT, relativePath);
}

function pathExists(relativePath) {
  return Boolean(relativePath) && fs.existsSync(workspacePath(relativePath));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function sanitizePublicText(value) {
  return shortText(value)
    .replace(/pairing[_ -]?key/gi, 'pairing_material')
    .replace(/private[_ -]?key/gi, 'private_material')
    .replace(/password/gi, 'credential_material')
    .replace(/secret/gi, 'private_material')
    .replace(/\btoken\b/gi, 'auth_material');
}

function safeArray(values) {
  return Array.isArray(values)
    ? values.map((value) => sanitizePublicText(value)).filter(Boolean)
    : [];
}

function safeRegistryEntry(entry) {
  const source = entry && typeof entry === 'object' ? entry : {};
  return {
    connector_id: shortText(source.connector_id),
    name: shortText(source.name || source.connector_id),
    kind: shortText(source.kind || 'connector'),
    status: shortText(source.status || 'unknown'),
    implemented: Boolean(source.implemented),
    execution_mode: shortText(source.execution_mode || ''),
    permission_profile: shortText(source.permission_profile || ''),
    risk_level: shortText(source.risk_level || 'unknown'),
    requires_approval: Boolean(source.requires_approval),
    read_capabilities: safeArray(source.read_capabilities),
    write_capabilities: safeArray(source.write_capabilities),
    allowed_commands: safeArray(source.allowed_commands),
  };
}

function scriptMatchesSelector(scriptName, selector) {
  if (selector.exact && scriptName !== selector.exact) return false;
  if (selector.prefix && !scriptName.startsWith(selector.prefix)) return false;
  if (Array.isArray(selector.includes)) {
    return selector.includes.every((part) => scriptName.includes(part));
  }
  return Boolean(selector.exact || selector.prefix);
}

function matchingScripts(scriptNames, selectors) {
  return scriptNames
    .filter((scriptName) => selectors.some((selector) => scriptMatchesSelector(scriptName, selector)))
    .sort();
}

function addNode(nodeMap, node) {
  if (!node.id) return;
  if (!nodeMap.has(node.id)) {
    nodeMap.set(node.id, {
      size: 10,
      ...node,
    });
    return;
  }
  nodeMap.set(node.id, {
    ...nodeMap.get(node.id),
    ...node,
  });
}

function addEdge(edgeMap, edge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return;
  const relation = edge.relation || 'related';
  const key = `${edge.source}::${relation}::${edge.target}`;
  if (edgeMap.has(key)) return;
  edgeMap.set(key, {
    weight: 1,
    kind: relation,
    ...edge,
    relation,
  });
}

function riskSize(riskLevel) {
  if (riskLevel === 'high') return 18;
  if (riskLevel === 'medium') return 15;
  if (riskLevel === 'low') return 12;
  return 11;
}

function capabilityId(connectorId, mode, capability) {
  return `capability:${connectorId}:${mode}:${sanitizePublicText(capability).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')}`;
}

function addPathNode(nodeMap, edgeMap, ownerId, relativePath, type, relation) {
  if (!relativePath || !pathExists(relativePath)) return null;
  const id = `${type}:${relativePath}`;
  addNode(nodeMap, {
    id,
    label: path.posix.basename(relativePath),
    type,
    path: relativePath,
    size: type === 'driver' ? 13 : 9,
  });
  addEdge(edgeMap, {
    source: ownerId,
    target: id,
    relation,
    kind: relation,
    weight: type === 'driver' ? 1.8 : 1,
  });
  return id;
}

function buildConnectorTopology() {
  const registry = readJsonSafe(REGISTRY_JSON, { connectors: [] });
  const packageJson = readJsonSafe(PACKAGE_JSON, { scripts: {} });
  const scriptNames = Object.keys(packageJson.scripts || {}).sort();
  const registryConnectors = Array.isArray(registry.connectors) ? registry.connectors.map(safeRegistryEntry) : [];
  const registryById = new Map(registryConnectors.filter((entry) => entry.connector_id).map((entry) => [entry.connector_id, entry]));
  const nodeMap = new Map();
  const edgeMap = new Map();
  const domainCoverage = {};

  addNode(nodeMap, {
    id: 'system:md-os',
    label: 'MD-OS',
    type: 'system',
    size: 24,
  });
  addNode(nodeMap, {
    id: 'layer:connector_topology',
    label: 'Connector Topology',
    type: 'topology',
    size: 20,
  });
  addNode(nodeMap, {
    id: 'policy:privacy_boundary',
    label: 'Sanitized Boundary',
    type: 'policy',
    size: 16,
    summary: 'Generated from source paths, package script names, and safe connector registry fields only.',
  });
  addEdge(edgeMap, {
    source: 'system:md-os',
    target: 'layer:connector_topology',
    relation: 'has_runtime_map',
    kind: 'system_topology',
    weight: 2,
  });
  addEdge(edgeMap, {
    source: 'layer:connector_topology',
    target: 'policy:privacy_boundary',
    relation: 'enforces',
    kind: 'privacy_policy',
    weight: 2,
  });

  const assignedConnectorIds = new Set();
  for (const domain of DOMAIN_DEFINITIONS) {
    addNode(nodeMap, {
      id: domain.id,
      label: domain.label,
      type: 'domain',
      focus: domain.focus,
      size: 18,
    });
    addEdge(edgeMap, {
      source: 'layer:connector_topology',
      target: domain.id,
      relation: 'has_domain',
      kind: 'topology_domain',
      weight: 2,
    });

    const domainConnectorIds = domain.connector_ids.filter((connectorId) => registryById.has(connectorId) || DRIVER_BY_CONNECTOR[connectorId]);
    domainCoverage[domain.id.replace(/^domain:/, '')] = {
      connector_count: domainConnectorIds.length,
      connectors: domainConnectorIds,
      script_count: matchingScripts(scriptNames, domain.script_selectors || []).length,
    };

    for (const connectorId of domainConnectorIds) {
      const entry = registryById.get(connectorId) || safeRegistryEntry({ connector_id: connectorId, name: connectorId, implemented: pathExists(DRIVER_BY_CONNECTOR[connectorId]) });
      assignedConnectorIds.add(connectorId);
      const connectorNodeId = `connector:${connectorId}`;
      addNode(nodeMap, {
        id: connectorNodeId,
        label: entry.name || connectorId,
        type: 'connector',
        connector_id: connectorId,
        kind: entry.kind,
        status: entry.status,
        implemented: entry.implemented,
        execution_mode: entry.execution_mode,
        permission_profile: entry.permission_profile,
        risk_level: entry.risk_level,
        requires_approval: entry.requires_approval,
        allowed_commands: entry.allowed_commands,
        size: riskSize(entry.risk_level),
      });
      addEdge(edgeMap, {
        source: domain.id,
        target: connectorNodeId,
        relation: 'includes_connector',
        kind: 'domain_connector',
        weight: 1.8,
      });
      addEdge(edgeMap, {
        source: connectorNodeId,
        target: 'policy:privacy_boundary',
        relation: entry.requires_approval ? 'requires_explicit_gate' : 'uses_bounded_policy',
        kind: 'connector_policy',
        weight: entry.requires_approval ? 1.8 : 1.2,
      });

      addPathNode(nodeMap, edgeMap, connectorNodeId, DRIVER_BY_CONNECTOR[connectorId], 'driver', 'implemented_by');

      for (const mode of ['read', 'write']) {
        const capabilities = mode === 'read' ? entry.read_capabilities : entry.write_capabilities;
        if (!capabilities.length) continue;
        const groupId = `capability_group:${connectorId}:${mode}`;
        addNode(nodeMap, {
          id: groupId,
          label: `${mode} capabilities`,
          type: 'capability_group',
          connector_id: connectorId,
          mode,
          count: capabilities.length,
          size: Math.min(16, 9 + Math.sqrt(capabilities.length) * 2),
        });
        addEdge(edgeMap, {
          source: connectorNodeId,
          target: groupId,
          relation: `exposes_${mode}_capabilities`,
          kind: 'connector_capability_group',
          weight: 1.2,
        });
        for (const capability of capabilities.slice(0, 24)) {
          const capId = capabilityId(connectorId, mode, capability);
          addNode(nodeMap, {
            id: capId,
            label: capability,
            type: 'capability',
            connector_id: connectorId,
            mode,
            size: 7,
          });
          addEdge(edgeMap, {
            source: groupId,
            target: capId,
            relation: 'contains_capability',
            kind: 'capability_member',
            weight: 0.8,
          });
        }
      }
    }

    for (const scriptName of matchingScripts(scriptNames, domain.script_selectors || [])) {
      const scriptId = `script:${scriptName}`;
      addNode(nodeMap, {
        id: scriptId,
        label: scriptName,
        type: 'script',
        package_script: scriptName,
        size: 8,
      });
      addEdge(edgeMap, {
        source: domain.id,
        target: scriptId,
        relation: 'has_cli_surface',
        kind: 'domain_script',
        weight: 0.9,
      });
    }

    for (const driverPath of domain.drivers || []) {
      addPathNode(nodeMap, edgeMap, domain.id, driverPath, 'driver', 'uses_builder');
    }
    for (const schemaPath of domain.schemas || []) {
      addPathNode(nodeMap, edgeMap, domain.id, schemaPath, 'schema', 'validated_by');
    }
    for (const examplePath of domain.examples || []) {
      addPathNode(nodeMap, edgeMap, domain.id, examplePath, 'example', 'has_example');
    }
    for (const testPath of domain.tests || []) {
      addPathNode(nodeMap, edgeMap, domain.id, testPath, 'test', 'verified_by');
    }
  }

  const unassignedConnectors = registryConnectors
    .filter((entry) => entry.connector_id && !assignedConnectorIds.has(entry.connector_id))
    .sort((left, right) => left.connector_id.localeCompare(right.connector_id));
  for (const entry of unassignedConnectors) {
    const connectorNodeId = `connector:${entry.connector_id}`;
    addNode(nodeMap, {
      id: connectorNodeId,
      label: entry.name || entry.connector_id,
      type: 'connector',
      connector_id: entry.connector_id,
      kind: entry.kind,
      status: entry.status,
      implemented: entry.implemented,
      execution_mode: entry.execution_mode,
      permission_profile: entry.permission_profile,
      risk_level: entry.risk_level,
      requires_approval: entry.requires_approval,
      allowed_commands: entry.allowed_commands,
      size: riskSize(entry.risk_level),
    });
    addEdge(edgeMap, {
      source: 'layer:connector_topology',
      target: connectorNodeId,
      relation: 'has_unassigned_connector',
      kind: 'topology_connector',
      weight: 1,
    });
    addPathNode(nodeMap, edgeMap, connectorNodeId, DRIVER_BY_CONNECTOR[entry.connector_id], 'driver', 'implemented_by');
  }

  const nodes = Array.from(nodeMap.values()).sort((left, right) => `${left.type}:${left.label}`.localeCompare(`${right.type}:${right.label}`));
  const edges = Array.from(edgeMap.values())
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .sort((left, right) => `${left.kind}:${left.source}:${left.target}`.localeCompare(`${right.kind}:${right.source}:${right.target}`));

  const nodeTypes = {};
  for (const node of nodes) nodeTypes[node.type] = (nodeTypes[node.type] || 0) + 1;

  const coverage = {
    audio_io: Boolean(domainCoverage.audio_io && domainCoverage.audio_io.connector_count),
    video_vision: Boolean(domainCoverage.video_vision && domainCoverage.video_vision.connector_count),
    robotics: Boolean(domainCoverage.robotics && domainCoverage.robotics.connector_count),
    mathematics_wolfram: Boolean(domainCoverage.mathematics_wolfram && domainCoverage.mathematics_wolfram.connector_count),
    graph_navigation: Boolean(domainCoverage.graph_navigation && domainCoverage.graph_navigation.connector_count),
  };

  const map = {
    schema_version: 1,
    updated_at: nowIso(),
    source: 'sanitized connector topology from source files, package script names, and safe connector registry fields',
    sources: {
      connector_registry: fs.existsSync(REGISTRY_JSON) ? rel(REGISTRY_JSON) : null,
      package_scripts: fs.existsSync(PACKAGE_JSON) ? rel(PACKAGE_JSON) : null,
      static_domain_model: 'md-os/os/build_connector_topology_map.js',
    },
    privacy: {
      included_registry_fields: SAFE_REGISTRY_FIELDS,
      excluded_material: [
        'host-local connector profiles',
        'runtime journals and action logs',
        'raw hardware captures',
        'credentials, pairing material, auth material, network addresses, hardware addresses, and serials',
        'absolute host paths',
      ],
    },
    topology: 'connector_topology',
    status: Object.values(coverage).every(Boolean) ? 'ok' : 'attention',
    coverage,
    domain_coverage: domainCoverage,
    node_count: nodes.length,
    edge_count: edges.length,
    node_types: nodeTypes,
    nodes,
    edges,
  };
  map.source_hash = sha256Json({
    nodes: map.nodes,
    edges: map.edges,
    coverage: map.coverage,
  });
  assertSanitized(map);
  return map;
}

function assertSanitized(map) {
  const text = JSON.stringify(map);
  const checks = [
    ['absolute_home_path', /\/home\/[A-Za-z0-9._-]+/],
    ['ipv4_address', /\b(?:\d{1,3}\.){3}\d{1,3}\b/],
    ['mac_address', /\b[0-9a-fA-F]{2}(?::[0-9a-fA-F]{2}){5}\b/],
    ['credential_keyword', /\b(password|secret|token|pairing_key|private_key)\b/i],
  ];
  for (const [label, pattern] of checks) {
    if (pattern.test(text)) throw new Error(`CONNECTOR_TOPOLOGY_PRIVACY_GUARD_FAILED: ${label}`);
  }
}

function domainRows(map) {
  return DOMAIN_DEFINITIONS.map((domain) => {
    const key = domain.id.replace(/^domain:/, '');
    const coverage = map.domain_coverage[key] || { connector_count: 0, script_count: 0, connectors: [] };
    return {
      label: domain.label,
      focus: domain.focus,
      connector_count: coverage.connector_count,
      script_count: coverage.script_count,
      connectors: coverage.connectors,
    };
  });
}

function buildMarkdown(map) {
  const rows = domainRows(map);
  return [
    '# Connector Topology',
    '',
    `Updated at: \`${map.updated_at}\``,
    '',
    `Status: \`${map.status}\``,
    '',
    'This is the sanitized native connector topology for MD-OS. It maps connector domains, drivers, CLI surfaces, schemas, tests, and bounded capability groups without exporting host-local profiles or private runtime state.',
    '',
    '## Summary',
    '',
    `- topology: \`${map.topology}\``,
    `- nodes: \`${map.node_count}\``,
    `- edges: \`${map.edge_count}\``,
    `- audio I/O covered: \`${map.coverage.audio_io}\``,
    `- video/vision covered: \`${map.coverage.video_vision}\``,
    `- robotics covered: \`${map.coverage.robotics}\``,
    `- mathematics/Wolfram covered: \`${map.coverage.mathematics_wolfram}\``,
    `- graph navigation covered: \`${map.coverage.graph_navigation}\``,
    '',
    '## Privacy Boundary',
    '',
    ...map.privacy.excluded_material.map((item) => `- excludes: ${item}`),
    '',
    '## Domains',
    '',
    ...rows.flatMap((row) => [
      `### ${row.label}`,
      '',
      row.focus,
      '',
      `- connectors: \`${row.connector_count}\``,
      `- CLI scripts: \`${row.script_count}\``,
      `- connector IDs: ${row.connectors.length ? row.connectors.map((item) => `\`${item}\``).join(', ') : '`none`'}`,
      '',
    ]),
  ].join('\n');
}

function buildHtml(map) {
  const data = JSON.stringify({
    nodes: map.nodes,
    edges: map.edges,
    updated_at: map.updated_at,
    metrics: {
      node_count: map.node_count,
      edge_count: map.edge_count,
      domains: map.node_types.domain || 0,
      connectors: map.node_types.connector || 0,
      drivers: map.node_types.driver || 0,
      scripts: map.node_types.script || 0,
      capabilities: map.node_types.capability || 0,
    },
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MD-OS Connector Topology</title>
<style>
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; background: #0f1115; color: #f3f0e8; overflow: hidden; }
#app { display: grid; grid-template-columns: minmax(0, 1fr) 340px; height: 100vh; }
svg { width: 100%; height: 100%; display: block; background: linear-gradient(135deg, #10151c 0%, #111215 54%, #171410 100%); }
aside { border-left: 1px solid #343941; background: #171a20; padding: 18px; overflow: auto; }
h1 { font-size: 18px; margin: 0 0 8px; font-weight: 680; }
h2 { font-size: 13px; margin: 22px 0 8px; color: #cbd4dc; text-transform: uppercase; letter-spacing: 0; }
p, li { font-size: 13px; line-height: 1.45; color: #d9d5ca; }
ul { padding-left: 18px; }
.metric { display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid #2a2f38; }
.metric span:last-child { color: #8fd0b5; font-variant-numeric: tabular-nums; }
.edge { stroke: rgba(192, 199, 212, 0.24); stroke-width: 1.1; }
.edge.domain_connector { stroke: rgba(118, 169, 255, 0.36); }
.edge.connector_policy { stroke: rgba(255, 122, 122, 0.30); }
.edge.connector_capability_group, .edge.capability_member { stroke: rgba(143, 208, 181, 0.26); }
.node circle { stroke: rgba(255, 255, 255, 0.72); stroke-width: 1; }
.node text { fill: #f3f0e8; font-size: 11px; pointer-events: none; paint-order: stroke; stroke: rgba(7, 8, 10, 0.92); stroke-width: 3px; stroke-linejoin: round; }
.system circle, .topology circle { fill: #f0c66f; }
.domain circle { fill: #76a9ff; }
.connector circle { fill: #8fd0b5; }
.driver circle { fill: #d990e8; }
.script circle { fill: #f49b6b; }
.schema circle, .test circle, .example circle { fill: #96a2b2; }
.capability_group circle, .capability circle { fill: #728196; }
.policy circle { fill: #ff7a7a; }
.selected circle { stroke: #ffffff; stroke-width: 3; }
.muted { color: #989fa9; }
code { color: #8fd0b5; }
@media (max-width: 900px) { #app { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) 230px; } aside { border-left: 0; border-top: 1px solid #343941; } }
</style>
</head>
<body>
<div id="app">
<svg id="map" role="img" aria-label="MD-OS connector topology"></svg>
<aside>
<h1>Connector Topology</h1>
<p class="muted">Sanitized native MD-OS connector map: domains, drivers, CLI surfaces, capability groups, and policy gates.</p>
<div id="metrics"></div>
<h2>Selection</h2>
<p id="selection">Select a node.</p>
<h2>Legend</h2>
<ul>
<li>Blue: connector domain</li>
<li>Green: connector</li>
<li>Purple: driver or builder</li>
<li>Orange: CLI script</li>
<li>Red: policy boundary</li>
</ul>
</aside>
</div>
<script>
const data = ${data};
const svg = document.getElementById('map');
const metrics = document.getElementById('metrics');
const selection = document.getElementById('selection');
const width = () => svg.clientWidth || window.innerWidth;
const height = () => svg.clientHeight || window.innerHeight;
const ns = 'http://www.w3.org/2000/svg';
metrics.innerHTML = Object.entries(data.metrics).map(([k, v]) => '<div class="metric"><span>' + k.replaceAll('_', ' ') + '</span><span>' + v + '</span></div>').join('');

function create(tag, attrs = {}) {
  const el = document.createElementNS(ns, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

const edgeLayer = create('g');
const nodeLayer = create('g');
svg.append(edgeLayer, nodeLayer);
const typeOrder = { system: 0, topology: 1, policy: 2, domain: 3, connector: 4, driver: 5, script: 6, capability_group: 7, capability: 8, schema: 9, test: 10, example: 11 };
const nodes = data.nodes.map((node, index) => {
  const rank = typeOrder[node.type] ?? 12;
  const angle = (index * 2.3999632297) % (Math.PI * 2);
  const radius = Math.min(width(), height()) * (0.10 + Math.min(rank, 10) * 0.035);
  return { ...node, x: width() / 2 + Math.cos(angle) * radius, y: height() / 2 + Math.sin(angle) * radius, vx: 0, vy: 0 };
});
const byId = new Map(nodes.map((node) => [node.id, node]));
const edges = data.edges.map((edge) => ({ ...edge, sourceNode: byId.get(edge.source), targetNode: byId.get(edge.target) })).filter((edge) => edge.sourceNode && edge.targetNode);
let alpha = 1;
let frameCount = 0;

for (const edge of edges) {
  edge.el = create('line', { class: 'edge ' + edge.kind });
  edgeLayer.append(edge.el);
}
for (const node of nodes) {
  const group = create('g', { class: 'node ' + node.type });
  const circle = create('circle', { r: node.size || 9 });
  const text = create('text', { x: (node.size || 9) + 6, y: 4 });
  text.textContent = node.label.length > 34 ? node.label.slice(0, 31) + '...' : node.label;
  group.append(circle, text);
  group.addEventListener('click', () => {
    document.querySelectorAll('.selected').forEach((item) => item.classList.remove('selected'));
    group.classList.add('selected');
    selection.innerHTML = '<strong>' + node.label + '</strong><br><code>' + (node.path || node.connector_id || node.package_script || node.id) + '</code><br><span class="muted">' + node.type + (node.risk_level ? ' / risk: ' + node.risk_level : '') + '</span>';
  });
  node.el = group;
  nodeLayer.append(group);
}

function tick() {
  alpha *= 0.984;
  frameCount += 1;
  const cx = width() / 2;
  const cy = height() / 2;
  for (const node of nodes) {
    let fx = (cx - node.x) * (node.type === 'system' ? 0.006 : 0.0015);
    let fy = (cy - node.y) * (node.type === 'system' ? 0.006 : 0.0015);
    for (const other of nodes) {
      if (other === node) continue;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dist2 = Math.max(81, dx * dx + dy * dy);
      const force = (node.type === 'capability' || other.type === 'capability' ? 240 : 460) / dist2;
      fx += dx * force;
      fy += dy * force;
    }
    node.fx = fx * alpha;
    node.fy = fy * alpha;
  }
  for (const edge of edges) {
    const dx = edge.targetNode.x - edge.sourceNode.x;
    const dy = edge.targetNode.y - edge.sourceNode.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const target = edge.kind === 'capability_member' ? 54 : edge.kind === 'domain_connector' ? 108 : 86;
    const pull = (dist - target) * 0.00075 * Math.min(4, edge.weight || 1) * alpha;
    const fx = dx * pull;
    const fy = dy * pull;
    edge.sourceNode.fx += fx;
    edge.sourceNode.fy += fy;
    edge.targetNode.fx -= fx;
    edge.targetNode.fy -= fy;
  }
  let maxVelocity = 0;
  for (const node of nodes) {
    node.vx = (node.vx + node.fx) * 0.76;
    node.vy = (node.vy + node.fy) * 0.76;
    maxVelocity = Math.max(maxVelocity, Math.abs(node.vx), Math.abs(node.vy));
    node.x = Math.max(28, Math.min(width() - 130, node.x + node.vx));
    node.y = Math.max(28, Math.min(height() - 28, node.y + node.vy));
  }
  for (const edge of edges) {
    edge.el.setAttribute('x1', edge.sourceNode.x);
    edge.el.setAttribute('y1', edge.sourceNode.y);
    edge.el.setAttribute('x2', edge.targetNode.x);
    edge.el.setAttribute('y2', edge.targetNode.y);
    edge.el.setAttribute('stroke-width', Math.max(0.7, Math.min(3.4, 0.75 + (edge.weight || 1) * 0.25)));
  }
  for (const node of nodes) node.el.setAttribute('transform', 'translate(' + node.x.toFixed(2) + ' ' + node.y.toFixed(2) + ')');
  if (frameCount < 760 && (alpha > 0.002 || maxVelocity > 0.015)) requestAnimationFrame(tick);
}
tick();
</script>
</body>
</html>
`;
}

function writeConnectorTopology(map) {
  ensureDir(OUTPUT_DIR);
  withFileLock('builder__connector_topology_map', {
    context: 'build_connector_topology_map',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, map);
    atomicWriteText(OUTPUT_HTML, buildHtml(map));
    atomicWriteText(OUTPUT_MD, buildMarkdown(map));
  });
}

function main() {
  try {
    const map = buildConnectorTopology();
    writeConnectorTopology(map);
    appendJournal({
      event: 'connector_topology_map_rebuilt',
      output_json: rel(OUTPUT_JSON),
      output_html: rel(OUTPUT_HTML),
      output_md: rel(OUTPUT_MD),
      node_count: map.node_count,
      edge_count: map.edge_count,
      status: map.status,
      coverage: map.coverage,
    });
    printJson({
      ok: true,
      mode: 'build_connector_topology_map',
      updated_at: map.updated_at,
      status: map.status,
      output_json: rel(OUTPUT_JSON),
      output_html: rel(OUTPUT_HTML),
      output_md: rel(OUTPUT_MD),
      node_count: map.node_count,
      edge_count: map.edge_count,
      coverage: map.coverage,
    });
  } catch (error) {
    printJson({
      ok: false,
      mode: 'build_connector_topology_map_error',
      error: error.message,
    });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  SAFE_REGISTRY_FIELDS,
  buildConnectorTopology,
  buildHtml,
  buildMarkdown,
};
