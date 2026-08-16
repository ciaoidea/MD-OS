#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { sha256Json } = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir } = require('../../os/lib/fs_runtime');
const { assertApfcGraph } = require('./graph_projector');

const VIEW_TYPES = Object.freeze({
  executive_state: new Set(['goal', 'constraint', 'error', 'decision', 'capability', 'policy', 'verification']),
  episode_timeline: new Set(['prediction', 'action', 'receipt', 'outcome', 'verification', 'correction', 'episode', 'error']),
  learning_lineage: new Set(['episode', 'skill_candidate', 'eval', 'skill', 'rollback', 'verification']),
  path_consolidation: new Set(['episode', 'skill_candidate', 'eval', 'skill', 'error', 'correction']),
  epistemic_health: new Set(['claim', 'prediction', 'cause_candidate', 'verification', 'error', 'evidence', 'skill', 'skill_candidate']),
});

const VIEW_IDS = Object.freeze(Object.keys(VIEW_TYPES));

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nodeForView(node, live) {
  return {
    id: node.id,
    type: node.type,
    label: node.label,
    lifecycle_status: node.lifecycle_status,
    epistemic_status: node.epistemic_status,
    risk_level: node.risk_level,
    source_refs: node.source_refs,
    content_hash: node.content_hash,
    created_at: node.created_at,
    properties: node.properties,
    live_overlay: live,
    last_committed_event_sequence: live ? node.properties.event_sequence || null : null,
  };
}

function edgeForView(edge, live) {
  return {
    id: edge.id,
    from: edge.from,
    type: edge.type,
    to: edge.to,
    epistemic_status: edge.epistemic_status,
    source_refs: edge.source_refs,
    evidence_ids: edge.evidence_ids,
    properties: edge.properties,
    live_overlay: live,
  };
}

function buildViews(graph, liveGraph = null) {
  assertApfcGraph(graph);
  if (liveGraph) assertApfcGraph(liveGraph);
  const graphHash = sha256Json(graph);
  const checkpointIds = new Set(graph.nodes.map((node) => node.id));
  const liveNodes = liveGraph ? liveGraph.nodes.filter((node) => !checkpointIds.has(node.id)) : [];
  const liveNodeIds = new Set(liveNodes.map((node) => node.id));
  const checkpointEdgeIds = new Set(graph.edges.map((edge) => edge.id));
  const liveEdges = liveGraph ? liveGraph.edges.filter((edge) => !checkpointEdgeIds.has(edge.id)) : [];
  const allNodes = [...graph.nodes.map((node) => ({ node, live: false })), ...liveNodes.map((node) => ({ node, live: true }))];
  const allEdges = [...graph.edges.map((edge) => ({ edge, live: false })), ...liveEdges.map((edge) => ({ edge, live: true }))];
  return Object.fromEntries(VIEW_IDS.map((viewId) => {
    const permitted = VIEW_TYPES[viewId];
    const selectedNodes = allNodes.filter(({ node }) => permitted.has(node.type)).map(({ node, live }) => nodeForView(node, live)).sort((left, right) => left.id.localeCompare(right.id));
    const ids = new Set(selectedNodes.map((node) => node.id));
    const selectedEdges = allEdges.filter(({ edge }) => ids.has(edge.from) && ids.has(edge.to)).map(({ edge, live }) => edgeForView(edge, live || liveNodeIds.has(edge.from) || liveNodeIds.has(edge.to))).sort((left, right) => left.id.localeCompare(right.id));
    const payload = {
      schema_version: 1,
      view_id: viewId,
      status: graph.status,
      graph_id: graph.graph_id,
      graph_hash: graphHash,
      live_graph_id: liveGraph && liveGraph.graph_id || null,
      filters: ['project', 'release', 'time_interval', 'verdict', 'verifier', 'skill', 'risk', 'epistemic_status'],
      edge_style_classes: {
        causal_operational: ['predicts', 'selected_because', 'executed_via', 'produced', 'failed_as', 'corrected_by'],
        evidential: ['supported_by', 'contradicted_by', 'verified_by', 'evaluated_by'],
        temporal: ['replayed_from'],
        semantic: ['semantic_association', 'composes_with'],
        policy: ['requires', 'constrained_by'],
        lifecycle: ['promoted_to', 'supersedes', 'invalidated_by', 'rolled_back_to'],
      },
      node_count: selectedNodes.length,
      edge_count: selectedEdges.length,
      nodes: selectedNodes,
      edges: selectedEdges,
      visual_contract: {
        layout_coordinates_are_non_semantic: true,
        live_overlay_distinct: true,
        canonical_writes_forbidden: true,
      },
    };
    return [viewId, payload];
  }));
}

function renderHtml(view) {
  const nodeRows = view.nodes.map((node) => `<tr data-live="${node.live_overlay}"><td>${escapeHtml(node.id)}</td><td>${escapeHtml(node.type)}</td><td>${escapeHtml(node.label)}</td><td>${escapeHtml(node.lifecycle_status)}</td><td>${escapeHtml(node.epistemic_status)}</td><td>${node.live_overlay ? 'live' : 'checkpoint'}</td></tr>`).join('');
  const edgeRows = view.edges.map((edge) => `<tr><td>${escapeHtml(edge.from)}</td><td>${escapeHtml(edge.type)}</td><td>${escapeHtml(edge.to)}</td><td>${escapeHtml(edge.epistemic_status)}</td></tr>`).join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MD-OS APFC — ${escapeHtml(view.view_id)}</title>
<style>body{font-family:system-ui,sans-serif;margin:2rem;color:#172033}table{border-collapse:collapse;width:100%;margin:1rem 0}th,td{border:1px solid #ccd3df;padding:.45rem;text-align:left}th{background:#eef2f8}tr[data-live="true"]{outline:2px dashed #d97706;background:#fff7ed}code{background:#eef2f8;padding:.1rem .3rem}.meta{display:flex;gap:1rem;flex-wrap:wrap}</style></head>
<body><h1>APFC ${escapeHtml(view.view_id.replace(/_/g, ' '))}</h1><div class="meta"><span>graph <code>${escapeHtml(view.graph_id)}</code></span><span>hash <code>${escapeHtml(view.graph_hash)}</code></span><span>status <code>${escapeHtml(view.status)}</code></span></div>
<p>This is a read-only projection. Dashed rows are uncheckpointed live-overlay events.</p>
<h2>Nodes</h2><table><thead><tr><th>ID</th><th>Type</th><th>Label</th><th>Lifecycle</th><th>Epistemic</th><th>Layer</th></tr></thead><tbody>${nodeRows}</tbody></table>
<h2>Edges</h2><table><thead><tr><th>From</th><th>Relation</th><th>To</th><th>Epistemic</th></tr></thead><tbody>${edgeRows}</tbody></table>
</body></html>\n`;
}

function writeViews(apfcDir, graph, liveGraph = null) {
  const views = buildViews(graph, liveGraph);
  const viewsDir = path.join(apfcDir, 'views');
  const htmlDir = path.join(apfcDir, 'graphify');
  ensureDir(viewsDir);
  ensureDir(htmlDir);
  for (const viewId of VIEW_IDS) {
    atomicWriteJson(path.join(viewsDir, `${viewId}.json`), views[viewId]);
    atomicWriteText(path.join(htmlDir, `${viewId}.html`), renderHtml(views[viewId]));
  }
  return { ok: true, graph_id: graph.graph_id, graph_hash: sha256Json(graph), view_ids: VIEW_IDS.slice(), json_dir: viewsDir, html_dir: htmlDir };
}

function buildGraphifyFromFiles(apfcDir) {
  const graph = JSON.parse(fs.readFileSync(path.join(apfcDir, 'graph.json'), 'utf8'));
  let live = null;
  try { live = JSON.parse(fs.readFileSync(path.join(apfcDir, 'live_graph.json'), 'utf8')); } catch (_) {}
  return writeViews(apfcDir, graph, live);
}

module.exports = {
  VIEW_IDS,
  VIEW_TYPES,
  buildGraphifyFromFiles,
  buildViews,
  renderHtml,
  writeViews,
};
