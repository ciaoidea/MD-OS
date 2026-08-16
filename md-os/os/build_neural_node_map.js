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

const SEMANTIC_GRAPH_JSON = path.join(MDOS_ROOT, 'ops', 'semantic_knowledge_graph.json');
const OUTPUT_DIR = path.join(WORKSPACE_ROOT, 'graphify-out');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'neural_node_map.json');
const OUTPUT_HTML = path.join(OUTPUT_DIR, 'neural_node_map.html');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'neural_node_map.md');

const INCLUDED_OPS_NODES = new Set([
  'md-os/ops/global_index.md',
  'md-os/ops/health.md',
  'md-os/ops/health_classification.md',
  'md-os/ops/markdown_graph.md',
  'md-os/ops/runtime/semantic_operational_compiler.md',
  'md-os/ops/semantic_knowledge_graph.md',
  'md-os/ops/semantic_knowledge_summary.md',
  'md-os/ops/runtime_lifecycle_index.md',
  'md-os/ops/system_hygiene_status.md',
]);

const LOW_SIGNAL_CONCEPTS = new Set([
  'readme',
  'license',
  'markdown',
  'model',
  'models',
  'document',
  'documents',
  'graph',
  'node',
  'nodes',
  'source',
  'state',
  'file',
  'files',
]);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/') || '.';
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`NEURAL_MAP_INPUT_MISSING: ${rel(filePath)}`);
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function includeDocumentPath(relativePath) {
  return (
    relativePath === 'README.md'
    || relativePath === 'AGENTS.md'
    || relativePath === 'ME.md'
    || relativePath.startsWith('docs/')
    || relativePath.startsWith('md-os/kb/')
    || relativePath.startsWith('md-os/examples/')
    || INCLUDED_OPS_NODES.has(relativePath)
  );
}

function conceptAllowed(term) {
  const value = shortText(term).toLowerCase();
  return value.length >= 4 && !LOW_SIGNAL_CONCEPTS.has(value) && !/^\d+$/.test(value);
}

function layerRank(layer) {
  const ranks = {
    identity: 1,
    semantic: 2,
    epistemic: 3,
    operational: 4,
    coherence: 5,
    runtime_readback: 6,
    operational_application: 7,
    presentation: 8,
    documentation: 9,
  };
  return ranks[layer] || 20;
}

function documentSize(node) {
  const degreeHint = (
    Number(node.explicit_incoming_count || 0)
    + Number(node.explicit_outgoing_count || 0)
    + Number(node.structural_incoming_count || 0)
    + Number(node.structural_outgoing_count || 0)
  );
  return Math.max(7, Math.min(20, 8 + Math.sqrt(degreeHint + Number(node.heading_count || 0))));
}

function conceptSize(nodeCount) {
  return Math.max(6, Math.min(22, 5 + Math.sqrt(Number(nodeCount || 1)) * 2.2));
}

function addEdge(edgeMap, edge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return;
  const key = [edge.source, edge.target, edge.relation || edge.kind || 'related'].join('::');
  if (edgeMap.has(key)) return;
  edgeMap.set(key, {
    weight: 1,
    ...edge,
  });
}

function strongestConceptTerms(graph, includedDocPaths) {
  const included = new Set(includedDocPaths);
  return (graph.concept_index || [])
    .filter((concept) => conceptAllowed(concept.term))
    .map((concept) => ({
      term: shortText(concept.term).toLowerCase(),
      node_count: (concept.nodes || []).filter((nodePath) => included.has(nodePath)).length,
      layers: concept.layers || [],
      nodes: (concept.nodes || []).filter((nodePath) => included.has(nodePath)),
    }))
    .filter((concept) => concept.node_count >= 2)
    .sort((left, right) => {
      const countCompare = right.node_count - left.node_count;
      if (countCompare !== 0) return countCompare;
      return left.term.localeCompare(right.term);
    })
    .slice(0, 90);
}

function buildNeuralNodeMap() {
  const graph = readJson(SEMANTIC_GRAPH_JSON);
  const docNodes = (graph.nodes || [])
    .filter((node) => includeDocumentPath(node.path))
    .sort((left, right) => {
      const layerCompare = layerRank(left.semantic_layer) - layerRank(right.semantic_layer);
      if (layerCompare !== 0) return layerCompare;
      return left.path.localeCompare(right.path);
    })
    .slice(0, 140);

  const docPathSet = new Set(docNodes.map((node) => node.path));
  const concepts = strongestConceptTerms(graph, docPathSet);
  const conceptTermSet = new Set(concepts.map((concept) => concept.term));
  const nodeMap = new Map();

  for (const node of docNodes) {
    nodeMap.set(`doc:${node.path}`, {
      id: `doc:${node.path}`,
      label: shortText(node.title || path.posix.basename(node.path, '.md')),
      type: 'document',
      path: node.path,
      semantic_layer: node.semantic_layer,
      cognitive_role: node.cognitive_role,
      epistemic_status: node.epistemic_status,
      concept_terms: (node.concept_terms || []).filter((term) => conceptTermSet.has(term)).slice(0, 7),
      size: documentSize(node),
    });
  }

  for (const concept of concepts) {
    nodeMap.set(`concept:${concept.term}`, {
      id: `concept:${concept.term}`,
      label: concept.term,
      type: 'concept',
      node_count: concept.node_count,
      semantic_layer: 'concept',
      layers: concept.layers,
      size: conceptSize(concept.node_count),
    });
  }

  const edgeMap = new Map();

  for (const edge of graph.semantic_edges || []) {
    if (!docPathSet.has(edge.source) || !docPathSet.has(edge.target)) continue;
    addEdge(edgeMap, {
      source: `doc:${edge.source}`,
      target: `doc:${edge.target}`,
      relation: edge.relation || 'semantic_relation',
      kind: 'document_semantic',
      weight: edge.cross_layer ? 2 : 1.2,
      evidence: edge.evidence || '',
    });
  }

  for (const node of docNodes) {
    const nodeConcepts = (node.concept_terms || [])
      .map((term) => shortText(term).toLowerCase())
      .filter((term) => conceptTermSet.has(term))
      .slice(0, 5);
    for (const term of nodeConcepts) {
      addEdge(edgeMap, {
        source: `doc:${node.path}`,
        target: `concept:${term}`,
        relation: 'expresses_concept',
        kind: 'document_concept',
        weight: 0.9,
      });
    }
  }

  for (const relation of graph.concept_relations || []) {
    const source = shortText(relation.source_term).toLowerCase();
    const target = shortText(relation.target_term).toLowerCase();
    if (!conceptTermSet.has(source) || !conceptTermSet.has(target)) continue;
    const evidenceCount = (relation.evidence_nodes || []).filter((nodePath) => docPathSet.has(nodePath)).length;
    if (evidenceCount < 2) continue;
    addEdge(edgeMap, {
      source: `concept:${source}`,
      target: `concept:${target}`,
      relation: relation.relation || 'co_occurs',
      kind: 'concept_relation',
      weight: Math.max(1, Math.min(6, evidenceCount)),
      evidence_count: evidenceCount,
    });
  }

  const edges = Array.from(edgeMap.values())
    .filter((edge) => nodeMap.has(edge.source) && nodeMap.has(edge.target))
    .sort((left, right) => `${left.kind}:${left.source}:${left.target}`.localeCompare(`${right.kind}:${right.source}:${right.target}`));
  const connectedIds = new Set(edges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = Array.from(nodeMap.values())
    .filter((node) => connectedIds.has(node.id))
    .sort((left, right) => `${left.type}:${left.label}`.localeCompare(`${right.type}:${right.label}`));

  const degree = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) {
    if (degree.has(edge.source)) degree.set(edge.source, degree.get(edge.source) + 1);
    if (degree.has(edge.target)) degree.set(edge.target, degree.get(edge.target) + 1);
  }

  const documentNodeCount = nodes.filter((node) => node.type === 'document').length;
  const conceptNodeCount = nodes.filter((node) => node.type === 'concept').length;
  const nodeCount = nodes.length;
  const edgeCount = edges.length;
  const density = nodeCount > 1 ? edgeCount / (nodeCount * (nodeCount - 1) / 2) : 0;
  const averageDegree = nodeCount ? Array.from(degree.values()).reduce((sum, value) => sum + value, 0) / nodeCount : 0;
  const treeEdgeCount = Math.max(0, nodeCount - 1);
  const nonTreeEdgeCount = Math.max(0, edgeCount - treeEdgeCount);

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source: 'md-os/ops/semantic_knowledge_graph.json',
    source_hash: sha256Json({
      semantic_source_hash: graph.source_hash,
      document_paths: docNodes.map((node) => node.path),
      concepts: concepts.map((concept) => [concept.term, concept.node_count]),
      edge_count: edgeCount,
    }),
    status: nodeCount && edgeCount ? 'ok' : 'attention',
    topology: 'semantic_neural_map',
    tree_like: false,
    document_node_count: documentNodeCount,
    concept_node_count: conceptNodeCount,
    node_count: nodeCount,
    edge_count: edgeCount,
    non_tree_edge_count: nonTreeEdgeCount,
    average_degree: Number(averageDegree.toFixed(2)),
    density: Number(density.toFixed(4)),
    nodes,
    edges,
  };
}

function buildMarkdown(map) {
  const strongestConcepts = map.nodes
    .filter((node) => node.type === 'concept')
    .sort((left, right) => (right.node_count || 0) - (left.node_count || 0))
    .slice(0, 20);

  return [
    '# Neural Node Map',
    '',
    `Updated at: \`${map.updated_at}\``,
    '',
    `Status: \`${map.status}\``,
    '',
    'This is a semantic node map, not a filesystem tree. Document nodes are connected through semantic relations, concept membership, and concept co-occurrence.',
    '',
    '## Summary',
    '',
    `- topology: \`${map.topology}\``,
    `- tree-like: \`${map.tree_like}\``,
    `- document nodes: \`${map.document_node_count}\``,
    `- concept nodes: \`${map.concept_node_count}\``,
    `- total nodes: \`${map.node_count}\``,
    `- edges: \`${map.edge_count}\``,
    `- non-tree edges: \`${map.non_tree_edge_count}\``,
    `- average degree: \`${map.average_degree}\``,
    `- density: \`${map.density}\``,
    '',
    '## Strongest Concepts',
    '',
    ...strongestConcepts.map((node) => `- \`${node.label}\`: \`${node.node_count}\` document node(s)`),
    '',
  ].join('\n');
}

function buildHtml(map) {
  const data = JSON.stringify({
    nodes: map.nodes,
    edges: map.edges,
    updated_at: map.updated_at,
    metrics: {
      document_node_count: map.document_node_count,
      concept_node_count: map.concept_node_count,
      edge_count: map.edge_count,
      average_degree: map.average_degree,
      density: map.density,
    },
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MD-OS Neural Node Map</title>
<style>
:root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
body { margin: 0; background: #101216; color: #f4f1e8; overflow: hidden; }
#app { display: grid; grid-template-columns: minmax(0, 1fr) 320px; height: 100vh; }
svg { width: 100%; height: 100%; display: block; background: radial-gradient(circle at 35% 25%, #28334a 0, #101216 44%, #0b0c0f 100%); }
aside { border-left: 1px solid #333842; background: #16191f; padding: 18px; overflow: auto; }
h1 { font-size: 18px; margin: 0 0 10px; font-weight: 680; }
h2 { font-size: 13px; margin: 22px 0 8px; color: #c8d2df; text-transform: uppercase; letter-spacing: 0; }
p, li { font-size: 13px; line-height: 1.45; color: #d7d4ca; }
ul { padding-left: 18px; }
.metric { display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 13px; padding: 7px 0; border-bottom: 1px solid #272b33; }
.metric span:last-child { color: #96d4b8; font-variant-numeric: tabular-nums; }
.edge { stroke: rgba(191, 198, 211, 0.28); stroke-width: 1.1; }
.edge.concept_relation { stroke: rgba(150, 212, 184, 0.26); }
.edge.document_semantic { stroke: rgba(131, 177, 255, 0.34); }
.node circle { stroke: rgba(255, 255, 255, 0.72); stroke-width: 1; }
.node text { fill: #f4f1e8; font-size: 11px; pointer-events: none; paint-order: stroke; stroke: rgba(9, 10, 12, 0.9); stroke-width: 3px; stroke-linejoin: round; }
.document circle { fill: #83b1ff; }
.concept circle { fill: #96d4b8; }
.selected circle { stroke: #f5c86a; stroke-width: 3; }
.muted { color: #969ba4; }
@media (max-width: 860px) { #app { grid-template-columns: 1fr; grid-template-rows: minmax(0, 1fr) 220px; } aside { border-left: 0; border-top: 1px solid #333842; } }
</style>
</head>
<body>
<div id="app">
<svg id="map" role="img" aria-label="Semantic neural node map"></svg>
<aside>
<h1>Neural Node Map</h1>
<p class="muted">Semantic/concept network generated from MD-OS knowledge graph readback.</p>
<div id="metrics"></div>
<h2>Selection</h2>
<p id="selection">Select a node.</p>
<h2>Legend</h2>
<ul>
<li>Blue: document node</li>
<li>Green: concept node</li>
<li>Lines: semantic, concept, or co-occurrence edges</li>
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
const nodes = data.nodes.map((node, index) => ({
  ...node,
  x: width() * (0.24 + 0.52 * ((index * 37) % 100) / 100),
  y: height() * (0.20 + 0.58 * ((index * 61) % 100) / 100),
  vx: 0,
  vy: 0,
}));
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
  const circle = create('circle', { r: node.size });
  const text = create('text', { x: node.size + 6, y: 4 });
  text.textContent = node.label.length > 34 ? node.label.slice(0, 31) + '...' : node.label;
  group.append(circle, text);
  group.addEventListener('click', () => {
    document.querySelectorAll('.selected').forEach((item) => item.classList.remove('selected'));
    group.classList.add('selected');
    selection.innerHTML = '<strong>' + node.label + '</strong><br>' + (node.path || node.type) + '<br><span class="muted">' + (node.semantic_layer || node.type) + '</span>';
  });
  node.el = group;
  nodeLayer.append(group);
}

function tick() {
  alpha *= 0.982;
  frameCount += 1;
  const cx = width() / 2;
  const cy = height() / 2;
  for (const node of nodes) {
    let fx = (cx - node.x) * 0.0014;
    let fy = (cy - node.y) * 0.0014;
    for (const other of nodes) {
      if (other === node) continue;
      const dx = node.x - other.x;
      const dy = node.y - other.y;
      const dist2 = Math.max(64, dx * dx + dy * dy);
      const force = (node.type === 'concept' && other.type === 'concept' ? 620 : 430) / dist2;
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
    const target = edge.kind === 'concept_relation' ? 130 : 96;
    const pull = (dist - target) * 0.00065 * Math.min(5, edge.weight || 1) * alpha;
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
    node.x = Math.max(24, Math.min(width() - 120, node.x + node.vx));
    node.y = Math.max(24, Math.min(height() - 24, node.y + node.vy));
  }
  for (const edge of edges) {
    edge.el.setAttribute('x1', edge.sourceNode.x);
    edge.el.setAttribute('y1', edge.sourceNode.y);
    edge.el.setAttribute('x2', edge.targetNode.x);
    edge.el.setAttribute('y2', edge.targetNode.y);
    edge.el.setAttribute('stroke-width', Math.max(0.7, Math.min(3.5, 0.7 + (edge.weight || 1) * 0.28)));
  }
  for (const node of nodes) node.el.setAttribute('transform', 'translate(' + node.x.toFixed(2) + ' ' + node.y.toFixed(2) + ')');
  if (frameCount < 700 && (alpha > 0.002 || maxVelocity > 0.015)) requestAnimationFrame(tick);
}
tick();
</script>
</body>
</html>
`;
}

function writeNeuralNodeMap(map) {
  ensureDir(OUTPUT_DIR);
  withFileLock('builder__neural_node_map', {
    context: 'build_neural_node_map',
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
    const map = buildNeuralNodeMap();
    writeNeuralNodeMap(map);
    appendJournal({
      event: 'neural_node_map_rebuilt',
      output_json: rel(OUTPUT_JSON),
      output_html: rel(OUTPUT_HTML),
      output_md: rel(OUTPUT_MD),
      node_count: map.node_count,
      edge_count: map.edge_count,
      concept_node_count: map.concept_node_count,
      document_node_count: map.document_node_count,
      status: map.status,
    });
    printJson({
      ok: true,
      mode: 'build_neural_node_map',
      updated_at: map.updated_at,
      status: map.status,
      output_json: rel(OUTPUT_JSON),
      output_html: rel(OUTPUT_HTML),
      output_md: rel(OUTPUT_MD),
      node_count: map.node_count,
      edge_count: map.edge_count,
      non_tree_edge_count: map.non_tree_edge_count,
      average_degree: map.average_degree,
      tree_like: map.tree_like,
    });
  } catch (error) {
    printJson({
      ok: false,
      mode: 'build_neural_node_map_error',
      error: error.message,
    });
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  buildHtml,
  buildMarkdown,
  buildNeuralNodeMap,
  includeDocumentPath,
};
