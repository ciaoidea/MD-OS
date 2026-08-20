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
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { classify } = require('./build_runtime_lifecycle_index');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const OUTPUT_JSON = path.join(OPS_DIR, 'markdown_graph.json');
const OUTPUT_MD = path.join(OPS_DIR, 'markdown_graph.md');
const OUTPUT_MD_REL = 'md-os/ops/markdown_graph.md';
const OUTPUT_JSON_REL = 'md-os/ops/markdown_graph.json';
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.cache', 'graphify-out']);
const SKIPPED_PATH_PREFIXES = ['md-os/ops/local/'];
const SKIPPED_DERIVED_MARKDOWN = new Set(['index.md']);
const SKIPPED_GENERATED_MARKDOWN_OUTPUTS = new Set([
  OUTPUT_MD_REL,
  'md-os/ops/health_classification.md',
  'md-os/ops/semantic_knowledge_graph.md',
  'md-os/ops/semantic_knowledge_summary.md',
  'md-os/ops/releases/self_release_index.md',
  'md-os/ops/agi/loop_status.md',
  'md-os/ops/agi/promotion_gate.md',
  'md-os/ops/skills/skill_registry.md',
  'md-os/ops/evals/agi_eval_report.md',
  'md-os/ops/failures/failure_index.md',
  'md-os/ops/world/world_model.md',
  'md-os/ops/benchmarks/agi_benchmarks.md',
  'md-os/ops/benchmarks/software_repair/index.md',
  'md-os/ops/runtime/semantic_operational_compiler.md',
  'md-os/ops/runtime/semantic_index.md',
  'md-os/ops/runtime/claim_index.md',
  'md-os/ops/runtime/capability_index.md',
  'md-os/ops/runtime/link_index.md',
  'md-os/ops/runtime/eval_results.md',
  'md-os/ops/runtime/semantic_drift_report.md',
  'md-os/ops/runtime/context_packs/index.md',
]);
const CORE_SEMANTIC_OPERATIONAL_NODES = [
  'ME.md',
  'AGENTS.md',
  'README.md',
  'md-os/kb/README.md',
  'md-os/kb/OPERATIONS.md',
  'md-os/kb/AGENTIC_CORE_MODEL.md',
  'md-os/kb/COGNITIVE_BOOTSTRAP.md',
  'md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md',
  'md-os/kb/SEMANTIC_OPERATIONAL_NETWORK_MODEL.md',
  'md-os/kb/SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md',
  'md-os/kb/SEMANTIC_NEURAL_OVERLAY_MODEL.md',
  'md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md',
  'md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md',
  'md-os/kb/KNOWLEDGE_IMPORT_METHOD_MODEL.md',
  'md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md',
  'md-os/kb/SOFTWARE_REPAIR_BENCHMARK_MODEL.md',
  'md-os/kb/MARKDOWN_GRAPH_MODEL.md',
  'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md',
  'md-os/kb/PERMISSION_MODEL.md',
  'md-os/kb/CONNECTOR_CONTRACT.md',
  'md-os/kb/WORK_ITEM_STATE_MACHINE.md',
  'md-os/ops/global_index.md',
  'md-os/ops/health.md',
  'md-os/ops/health_classification.md',
  OUTPUT_MD_REL,
  'md-os/ops/runtime_lifecycle_index.md',
  'md-os/ops/semantic_knowledge_graph.md',
  'md-os/ops/semantic_knowledge_summary.md',
  'md-os/ops/releases/self_release_index.md',
  'md-os/ops/benchmarks/software_repair/index.md',
];
const GENERATED_SEMANTIC_OPERATIONAL_NODES = new Set([
  'md-os/ops/global_index.md',
  'md-os/ops/health.md',
  'md-os/ops/health_classification.md',
  OUTPUT_MD_REL,
  'md-os/ops/runtime_lifecycle_index.md',
  'md-os/ops/semantic_knowledge_graph.md',
  'md-os/ops/semantic_knowledge_summary.md',
  'md-os/ops/releases/self_release_index.md',
  'md-os/ops/benchmarks/software_repair/index.md',
]);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function posixDir(relativePath) {
  const dir = path.posix.dirname(relativePath);
  return dir === '.' ? '' : dir;
}

function existsRelative(relativePath) {
  return fs.existsSync(path.join(WORKSPACE_ROOT, relativePath));
}

function collectMarkdownFiles(rootDir) {
  const files = [];
  const stack = [rootDir];

  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        const relativeDir = `${rel(fullPath).replace(/\/$/, '')}/`;
        if (SKIPPED_PATH_PREFIXES.some((prefix) => relativeDir.startsWith(prefix))) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
      const relative = rel(fullPath);
      if (SKIPPED_DERIVED_MARKDOWN.has(relative)) continue;
      if (SKIPPED_GENERATED_MARKDOWN_OUTPUTS.has(relative)) continue;
      const stats = fs.statSync(fullPath);
      files.push({
        path: relative,
        basename: entry.name,
        directory: posixDir(relative),
        size_bytes: stats.size,
      });
    }
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(WORKSPACE_ROOT, relativePath), 'utf8');
}

function titleFromMarkdown(text, fallback) {
  const match = String(text || '').match(/^#\s+(.+)$/m);
  return shortText(match && match[1] || fallback);
}

function zoneForPath(relativePath) {
  if (!relativePath.includes('/')) return 'root';
  if (relativePath.startsWith('docs/')) return 'docs';
  if (relativePath.startsWith('md-os/kb/hardware/')) return 'kb_hardware';
  if (relativePath.startsWith('md-os/kb/software/')) return 'kb_software';
  if (relativePath.startsWith('md-os/kb/')) return 'knowledge_base';
  if (relativePath.startsWith('md-os/ops/')) return 'runtime_state';
  if (relativePath.startsWith('md-os/examples/')) return 'examples';
  if (relativePath.startsWith('dev/')) return 'development';
  return relativePath.split('/')[0] || 'other';
}

function stripLinkDecorators(target) {
  return String(target || '')
    .trim()
    .replace(/^<|>$/g, '')
    .split(/\s+/)[0]
    .trim();
}

function isExternalTarget(target) {
  return /^(?:[a-z][a-z0-9+.-]*:|#)/i.test(target);
}

function normalizeRelativeTarget(sourcePath, rawTarget) {
  const clean = stripLinkDecorators(rawTarget).split('#')[0].split('?')[0];
  if (!clean || isExternalTarget(clean)) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(clean);
    } catch (_) {
      return clean;
    }
  })();
  const candidate = decoded.startsWith('/')
    ? decoded.replace(/^\/+/, '')
    : path.posix.normalize(path.posix.join(posixDir(sourcePath), decoded));
  if (!candidate || candidate.startsWith('../') || candidate === '..') return null;
  if (candidate.endsWith('/')) return `${candidate}README.md`;
  if (path.posix.extname(candidate).toLowerCase() !== '.md') return null;
  return candidate;
}

function resolveWikiTarget(sourcePath, rawTarget, exactPathSet, basenameIndex) {
  const clean = String(rawTarget || '').split('|')[0].split('#')[0].trim();
  if (!clean) return null;
  const withExt = clean.endsWith('.md') ? clean : `${clean}.md`;
  const relative = normalizeRelativeTarget(sourcePath, withExt);
  if (relative && exactPathSet.has(relative)) return { target: relative, status: 'resolved' };
  const basenameKey = path.posix.basename(withExt, '.md').toLowerCase();
  const matches = basenameIndex.get(basenameKey) || [];
  if (matches.length === 1) return { target: matches[0], status: 'resolved' };
  if (matches.length > 1) return { target: withExt, status: 'ambiguous' };
  return { target: withExt, status: 'missing' };
}

function extractExplicitLinks(node, exactPathSet, basenameIndex) {
  const text = readText(node.path);
  const links = [];
  const inline = /(!?)\[([^\]]*)\]\(([^)]+)\)/g;
  let match;
  while ((match = inline.exec(text)) !== null) {
    if (match[1] === '!') continue;
    const rawTarget = match[3];
    const target = normalizeRelativeTarget(node.path, rawTarget);
    if (!target) continue;
    links.push({
      source: node.path,
      target,
      kind: 'explicit_markdown',
      label: shortText(match[2] || path.posix.basename(target)),
      raw_target: stripLinkDecorators(rawTarget),
      status: exactPathSet.has(target) ? 'resolved' : 'missing',
    });
  }

  const wiki = /\[\[([^\]]+)\]\]/g;
  while ((match = wiki.exec(text)) !== null) {
    const resolved = resolveWikiTarget(node.path, match[1], exactPathSet, basenameIndex);
    if (!resolved) continue;
    links.push({
      source: node.path,
      target: resolved.target,
      kind: 'explicit_wiki',
      label: shortText(match[1].split('|').pop() || resolved.target),
      raw_target: shortText(match[1]),
      status: resolved.status,
    });
  }

  return links;
}

function addStructuralTarget(edges, source, target, reason, exactPathSet) {
  if (!target || source === target || !exactPathSet.has(target)) return;
  const key = `${source}->${target}:${reason}`;
  if (edges.has(key)) return;
  edges.set(key, {
    source,
    target,
    kind: 'structural',
    reason,
    status: 'resolved',
  });
}

function structuralTargetsFor(node, exactPathSet) {
  const edges = new Map();
  const source = node.path;
  const add = (target, reason) => addStructuralTarget(edges, source, target, reason, exactPathSet);
  const dir = posixDir(source);

  if (dir) add(`${dir}/README.md`, 'directory_readme');

  if (!source.includes('/')) {
    if (source !== 'README.md') add('README.md', 'root_entrypoint');
    if (source === 'README.md') {
      add('AGENTS.md', 'root_identity');
      add('ME.md', 'root_identity');
      add('md-os/kb/README.md', 'knowledge_base_entrypoint');
      add('docs/ONBOARDING.md', 'docs_entrypoint');
      add('md-os/ops/markdown_graph.md', 'generated_graph_entrypoint');
    }
  }

  if (source.startsWith('docs/')) {
    add('README.md', 'repository_entrypoint');
    add('docs/ONBOARDING.md', 'docs_entrypoint');
  }

  if (source.startsWith('md-os/kb/hardware/')) {
    add('md-os/kb/hardware/README.md', 'hardware_kb_entrypoint');
    add('md-os/kb/README.md', 'knowledge_base_entrypoint');
  } else if (source.startsWith('md-os/kb/software/')) {
    add('md-os/kb/software/README.md', 'software_kb_entrypoint');
    add('md-os/kb/README.md', 'knowledge_base_entrypoint');
  } else if (source.startsWith('md-os/kb/')) {
    add('md-os/kb/README.md', 'knowledge_base_entrypoint');
    add('README.md', 'repository_entrypoint');
  }

  if (source.startsWith('md-os/ops/')) {
    add('md-os/ops/global_index.md', 'runtime_index');
    add('md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md', 'runtime_lifecycle_model');
  }

  if (source.startsWith('md-os/apfc/')) {
    add('README.md', 'repository_entrypoint');
    add('md-os/apfc/README.md', 'apfc_entrypoint');
    add('md-os/kb/BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md', 'bmct_model');
  }

  if (source.startsWith('md-os/examples/')) {
    add('README.md', 'repository_entrypoint');
    add('md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md', 'runtime_lifecycle_model');
  }

  if (source.startsWith('dev/')) add('README.md', 'repository_entrypoint');

  return Array.from(edges.values()).sort((left, right) => {
    const sourceCompare = left.source.localeCompare(right.source);
    if (sourceCompare !== 0) return sourceCompare;
    return left.target.localeCompare(right.target);
  });
}

function linkFromOutput(targetPath) {
  const fromDir = posixDir(OUTPUT_MD_REL);
  let link = path.posix.relative(fromDir, targetPath);
  if (!link.startsWith('.')) link = `./${link}`;
  return link;
}

function markdownLink(targetPath, label = targetPath) {
  return `[${label}](${linkFromOutput(targetPath)})`;
}

function buildSemanticOperationalNetwork(enrichedNodes) {
  const nodeByPath = new Map(enrichedNodes.map((node) => [node.path, node]));
  const coreNodes = CORE_SEMANTIC_OPERATIONAL_NODES.map((nodePath) => {
    const node = nodeByPath.get(nodePath);
    const generatedCoreNode = GENERATED_SEMANTIC_OPERATIONAL_NODES.has(nodePath);
    const present = Boolean(node) || generatedCoreNode || existsRelative(nodePath);
    const structurallyConnected = generatedCoreNode
      ? true
      : Boolean(node && node.structurally_connected);
    return {
      path: nodePath,
      present,
      generated_core_node: generatedCoreNode,
      structurally_connected: structurallyConnected,
      explicit_outgoing_count: node ? node.explicit_outgoing_count : 0,
      explicit_incoming_count: node ? node.explicit_incoming_count : 0,
      structural_outgoing_count: node ? node.structural_outgoing_count : 0,
      structural_incoming_count: node ? node.structural_incoming_count : 0,
    };
  });
  const missingNodes = coreNodes.filter((node) => !node.present).map((node) => node.path);
  const disconnectedNodes = coreNodes
    .filter((node) => node.present && !node.structurally_connected)
    .map((node) => node.path);
  return {
    status: missingNodes.length || disconnectedNodes.length ? 'attention' : 'ok',
    required_node_count: coreNodes.length,
    present_node_count: coreNodes.filter((node) => node.present).length,
    structurally_connected_node_count: coreNodes.filter((node) => node.present && node.structurally_connected).length,
    generated_core_node_count: coreNodes.filter((node) => node.generated_core_node).length,
    missing_node_count: missingNodes.length,
    disconnected_node_count: disconnectedNodes.length,
    missing_nodes: missingNodes,
    disconnected_nodes: disconnectedNodes,
    core_nodes: coreNodes,
  };
}

function buildMarkdownGraph() {
  const markdownFiles = collectMarkdownFiles(WORKSPACE_ROOT);
  const exactPathSet = new Set(markdownFiles.map((file) => file.path));
  const basenameIndex = new Map();
  for (const file of markdownFiles) {
    const key = path.posix.basename(file.path, '.md').toLowerCase();
    const current = basenameIndex.get(key) || [];
    current.push(file.path);
    basenameIndex.set(key, current);
  }

  const nodes = markdownFiles.map((file) => {
    const text = readText(file.path);
    const lifecycle = classify(file.path, false);
    return {
      ...file,
      title: titleFromMarkdown(text, file.basename),
      zone: zoneForPath(file.path),
      lifecycle_class: lifecycle.lifecycle_class,
      owner: lifecycle.owner,
      scope: lifecycle.scope,
      generated: lifecycle.lifecycle_class === 'generated',
    };
  });

  const explicitLinks = nodes.flatMap((node) => extractExplicitLinks(node, exactPathSet, basenameIndex));
  const resolvedExplicitLinks = explicitLinks.filter((link) => link.status === 'resolved');
  const unresolvedExplicitLinks = explicitLinks.filter((link) => link.status !== 'resolved');
  const structuralLinks = nodes.flatMap((node) => structuralTargetsFor(node, exactPathSet));
  const allResolvedEdges = [...resolvedExplicitLinks, ...structuralLinks];

  const incomingExplicit = new Map();
  const outgoingExplicit = new Map();
  const incomingStructural = new Map();
  const outgoingStructural = new Map();
  for (const node of nodes) {
    incomingExplicit.set(node.path, 0);
    outgoingExplicit.set(node.path, 0);
    incomingStructural.set(node.path, 0);
    outgoingStructural.set(node.path, 0);
  }
  for (const link of resolvedExplicitLinks) {
    outgoingExplicit.set(link.source, (outgoingExplicit.get(link.source) || 0) + 1);
    incomingExplicit.set(link.target, (incomingExplicit.get(link.target) || 0) + 1);
  }
  for (const link of structuralLinks) {
    outgoingStructural.set(link.source, (outgoingStructural.get(link.source) || 0) + 1);
    incomingStructural.set(link.target, (incomingStructural.get(link.target) || 0) + 1);
  }

  const enrichedNodes = nodes.map((node) => {
    const explicitOut = outgoingExplicit.get(node.path) || 0;
    const explicitIn = incomingExplicit.get(node.path) || 0;
    const structuralOut = outgoingStructural.get(node.path) || 0;
    const structuralIn = incomingStructural.get(node.path) || 0;
    return {
      ...node,
      explicit_outgoing_count: explicitOut,
      explicit_incoming_count: explicitIn,
      structural_outgoing_count: structuralOut,
      structural_incoming_count: structuralIn,
      explicit_orphan: explicitOut + explicitIn === 0,
      structurally_connected: structuralOut + structuralIn > 0,
    };
  });

  const explicitOrphans = enrichedNodes.filter((node) => node.explicit_orphan).map((node) => node.path).sort();
  const structuralIsolated = enrichedNodes.filter((node) => !node.structurally_connected).map((node) => node.path).sort();
  const semanticOperationalNetwork = buildSemanticOperationalNetwork(enrichedNodes);
  const zoneCounts = {};
  for (const node of enrichedNodes) zoneCounts[node.zone] = (zoneCounts[node.zone] || 0) + 1;

  const status = structuralIsolated.length || unresolvedExplicitLinks.length || semanticOperationalNetwork.status !== 'ok' ? 'attention' : 'ok';

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      nodes: enrichedNodes.map((node) => ({
        path: node.path,
        size_bytes: node.size_bytes,
        explicit_outgoing_count: node.explicit_outgoing_count,
        structural_outgoing_count: node.structural_outgoing_count,
      })),
      explicit_links: explicitLinks.map((link) => ({
        source: link.source,
        target: link.target,
        kind: link.kind,
        status: link.status,
      })),
      structural_links: structuralLinks.map((link) => ({
        source: link.source,
        target: link.target,
        reason: link.reason,
      })),
      semantic_operational_network: {
        status: semanticOperationalNetwork.status,
        present_node_count: semanticOperationalNetwork.present_node_count,
        structurally_connected_node_count: semanticOperationalNetwork.structurally_connected_node_count,
        missing_nodes: semanticOperationalNetwork.missing_nodes,
        disconnected_nodes: semanticOperationalNetwork.disconnected_nodes,
      },
    }),
    status,
    markdown_file_count: enrichedNodes.length,
    explicit_link_count: explicitLinks.length,
    resolved_explicit_link_count: resolvedExplicitLinks.length,
    unresolved_explicit_link_count: unresolvedExplicitLinks.length,
    structural_link_count: structuralLinks.length,
    edge_count: allResolvedEdges.length,
    explicit_orphan_count: explicitOrphans.length,
    structural_isolated_count: structuralIsolated.length,
    semantic_operational_network: semanticOperationalNetwork,
    zone_counts: Object.fromEntries(Object.entries(zoneCounts).sort(([left], [right]) => left.localeCompare(right))),
    explicit_orphans: explicitOrphans,
    structural_isolated: structuralIsolated,
    unresolved_explicit_links: unresolvedExplicitLinks,
    nodes: enrichedNodes.sort((left, right) => left.path.localeCompare(right.path)),
    explicit_links: explicitLinks.sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)),
    structural_links: structuralLinks.sort((left, right) => `${left.source}:${left.target}`.localeCompare(`${right.source}:${right.target}`)),
  };
}

function buildMarkdown(graph) {
  const lines = [
    '# Markdown Graph Index',
    '',
    `Updated at: \`${graph.updated_at}\``,
    '',
    `Status: \`${graph.status}\``,
    '',
    'This is the generated Obsidian-friendly graph entrypoint for MD-OS Markdown files.',
    '',
    'It links every scanned Markdown file and records both explicit Markdown links and derived structural links.',
    '',
    '## Summary',
    '',
    `- Markdown files scanned: \`${graph.markdown_file_count}\``,
    `- explicit Markdown links: \`${graph.explicit_link_count}\``,
    `- resolved explicit links: \`${graph.resolved_explicit_link_count}\``,
    `- unresolved explicit links: \`${graph.unresolved_explicit_link_count}\``,
    `- structural links: \`${graph.structural_link_count}\``,
    `- files with no explicit Markdown links: \`${graph.explicit_orphan_count}\``,
    `- structurally isolated files: \`${graph.structural_isolated_count}\``,
    '',
    '## Semantic Operational Network',
    '',
    `- status: \`${graph.semantic_operational_network.status}\``,
    `- required core nodes: \`${graph.semantic_operational_network.required_node_count}\``,
    `- present core nodes: \`${graph.semantic_operational_network.present_node_count}\``,
    `- structurally connected core nodes: \`${graph.semantic_operational_network.structurally_connected_node_count}\``,
    `- deterministic generated core nodes: \`${graph.semantic_operational_network.generated_core_node_count}\``,
    `- missing core nodes: \`${graph.semantic_operational_network.missing_node_count}\``,
    `- disconnected core nodes: \`${graph.semantic_operational_network.disconnected_node_count}\``,
    '',
  ];

  if (graph.semantic_operational_network.missing_nodes.length) {
    lines.push('### Missing Core Nodes', '');
    for (const nodePath of graph.semantic_operational_network.missing_nodes) lines.push(`- \`${nodePath}\``);
    lines.push('');
  }
  if (graph.semantic_operational_network.disconnected_nodes.length) {
    lines.push('### Disconnected Core Nodes', '');
    for (const nodePath of graph.semantic_operational_network.disconnected_nodes) lines.push(`- \`${nodePath}\``);
    lines.push('');
  }

  lines.push(
    '## Entry Points',
    '',
  );

  const entryPoints = [
    'README.md',
    'ME.md',
    'AGENTS.md',
    'docs/ONBOARDING.md',
    'docs/POPULAR_PRESENTATION.md',
    'md-os/kb/README.md',
    'md-os/kb/MARKDOWN_GRAPH_MODEL.md',
    'md-os/kb/OPERATIONS.md',
    'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md',
    'md-os/ops/global_index.md',
  ].filter((item, index, array) => graph.nodes.some((node) => node.path === item) && array.indexOf(item) === index);

  for (const target of entryPoints) lines.push(`- ${markdownLink(target)}`);

  lines.push('', '## Zones', '');
  for (const [zone, count] of Object.entries(graph.zone_counts)) {
    lines.push(`- \`${zone}\`: \`${count}\``);
  }

  const nodesByZone = new Map();
  for (const node of graph.nodes) {
    const current = nodesByZone.get(node.zone) || [];
    current.push(node);
    nodesByZone.set(node.zone, current);
  }

  lines.push('', '## Files', '');
  for (const [zone, nodes] of Array.from(nodesByZone.entries()).sort(([left], [right]) => left.localeCompare(right))) {
    lines.push('', `### ${zone}`, '');
    for (const node of nodes) {
      lines.push(`- ${markdownLink(node.path)} | lifecycle \`${node.lifecycle_class}\` | explicit out \`${node.explicit_outgoing_count}\` | explicit in \`${node.explicit_incoming_count}\` | structural out \`${node.structural_outgoing_count}\` | structural in \`${node.structural_incoming_count}\``);
    }
  }

  lines.push('', '## Structural Links', '');
  for (const edge of graph.structural_links) {
    lines.push(`- ${markdownLink(edge.source)} -> ${markdownLink(edge.target)} | \`${edge.reason}\``);
  }

  lines.push('', '## Explicit Markdown Links', '');
  const resolvedLinks = graph.explicit_links.filter((link) => link.status === 'resolved');
  if (!resolvedLinks.length) {
    lines.push('- No resolved explicit Markdown links detected.');
  } else {
    for (const edge of resolvedLinks) {
      lines.push(`- ${markdownLink(edge.source)} -> ${markdownLink(edge.target)} | \`${edge.kind}\``);
    }
  }

  lines.push('', '## Unresolved Explicit Links', '');
  if (!graph.unresolved_explicit_links.length) {
    lines.push('- No unresolved Markdown links detected.');
  } else {
    for (const edge of graph.unresolved_explicit_links) {
      lines.push(`- ${markdownLink(edge.source)} -> \`${edge.raw_target}\` | status \`${edge.status}\``);
    }
  }

  lines.push('', '## Files Without Explicit Markdown Links', '');
  if (!graph.explicit_orphans.length) {
    lines.push('- No explicit Markdown orphan files detected.');
  } else {
    for (const filePath of graph.explicit_orphans) {
      lines.push(`- ${markdownLink(filePath)}`);
    }
  }

  if (graph.structural_isolated.length) {
    lines.push('', '## Structurally Isolated Files', '');
    for (const filePath of graph.structural_isolated) {
      lines.push(`- ${markdownLink(filePath)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const graph = buildMarkdownGraph();
  withFileLock('builder__markdown_graph', {
    context: 'build_markdown_graph',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, graph);
    atomicWriteText(OUTPUT_MD, buildMarkdown(graph));
  });
  appendJournal({
    event: 'markdown_graph_rebuilt',
    builder: 'build_markdown_graph',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    markdown_file_count: graph.markdown_file_count,
    explicit_link_count: graph.explicit_link_count,
    structural_link_count: graph.structural_link_count,
    explicit_orphan_count: graph.explicit_orphan_count,
    structural_isolated_count: graph.structural_isolated_count,
    semantic_operational_network_status: graph.semantic_operational_network.status,
    status: graph.status,
  });
  printJson({
    ok: true,
    mode: 'build_markdown_graph',
    updated_at: graph.updated_at,
    status: graph.status,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    markdown_file_count: graph.markdown_file_count,
    explicit_link_count: graph.explicit_link_count,
    structural_link_count: graph.structural_link_count,
    explicit_orphan_count: graph.explicit_orphan_count,
    structural_isolated_count: graph.structural_isolated_count,
    semantic_operational_network_status: graph.semantic_operational_network.status,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMarkdown,
  buildMarkdownGraph,
  normalizeRelativeTarget,
};
