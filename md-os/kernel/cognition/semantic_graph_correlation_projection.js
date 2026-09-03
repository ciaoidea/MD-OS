#!/usr/bin/env node
'use strict';

const path = require('path');
const { sha256Json } = require('./general_program_synthesis');
const { buildSparseCorrelationSkeleton } = require('./sparse_correlation_skeleton');

const EXPLICIT_EVIDENCE_KINDS = Object.freeze(['explicit_markdown', 'explicit_wiki']);
const DEFAULT_EXCLUDED_PATH_PREFIXES = Object.freeze(['md-os/ops/local/']);

function fail(code) {
  throw new Error(code);
}

function normalizedPrefixes(values) {
  if (!Array.isArray(values)) fail('SEMANTIC_CORRELATION_EXCLUSIONS_INVALID');
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right));
}

function pathExcluded(relativePath, prefixes) {
  return prefixes.some((prefix) => relativePath === prefix.replace(/\/$/, '') || relativePath.startsWith(prefix));
}

function safeRelativePath(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !path.posix.isAbsolute(relativePath)
    && path.posix.normalize(relativePath) === relativePath
    && !relativePath.split('/').includes('..');
}

function assertSemanticGraph(graph) {
  if (!graph || graph.schema_version !== 1 || graph.status !== 'ok'
    || !/^[a-f0-9]{64}$/.test(String(graph.source_hash || ''))
    || !Array.isArray(graph.nodes) || !Array.isArray(graph.semantic_edges)) {
    fail('SEMANTIC_CORRELATION_GRAPH_INVALID');
  }
  const nodePaths = new Set();
  for (const node of graph.nodes) {
    if (!node || !safeRelativePath(node.path)
      || typeof node.semantic_layer !== 'string' || !node.semantic_layer
      || (node.content_hash !== null && node.content_hash !== undefined
        && !/^[a-f0-9]{64}$/.test(String(node.content_hash)))) {
      fail('SEMANTIC_CORRELATION_NODE_INVALID');
    }
    if (nodePaths.has(node.path)) fail('SEMANTIC_CORRELATION_NODE_DUPLICATE');
    nodePaths.add(node.path);
  }
  return nodePaths;
}

function projectSemanticGraphToSparseSkeleton(graph, options = {}) {
  const nodePaths = assertSemanticGraph(graph);
  if (options.evidence_kinds !== undefined && !Array.isArray(options.evidence_kinds)) {
    fail('SEMANTIC_CORRELATION_EVIDENCE_POLICY_INVALID');
  }
  const evidenceKinds = new Set(options.evidence_kinds || EXPLICIT_EVIDENCE_KINDS);
  if (!evidenceKinds.size || [...evidenceKinds].some((value) => !EXPLICIT_EVIDENCE_KINDS.includes(value))) {
    fail('SEMANTIC_CORRELATION_EVIDENCE_POLICY_INVALID');
  }
  const excludedPathPrefixes = normalizedPrefixes(
    [
      ...DEFAULT_EXCLUDED_PATH_PREFIXES,
      ...(Array.isArray(options.excluded_path_prefixes) ? options.excluded_path_prefixes : []),
    ],
  );
  const edgeMap = new Map();
  const sourceNodes = new Map(graph.nodes.map((node) => [node.path, node]));

  for (const edge of graph.semantic_edges) {
    if (!edge || !evidenceKinds.has(edge.evidence)) continue;
    if (edge.cross_layer !== true) continue;
    if (typeof edge.source !== 'string' || typeof edge.target !== 'string'
      || !nodePaths.has(edge.source) || !nodePaths.has(edge.target)) {
      fail('SEMANTIC_CORRELATION_EDGE_ENDPOINT_INVALID');
    }
    if (edge.source === edge.target
      || pathExcluded(edge.source, excludedPathPrefixes)
      || pathExcluded(edge.target, excludedPathPrefixes)) {
      continue;
    }
    if (!/^[a-f0-9]{64}$/.test(String(sourceNodes.get(edge.source).content_hash || ''))
      || !/^[a-f0-9]{64}$/.test(String(sourceNodes.get(edge.target).content_hash || ''))) {
      continue;
    }
    if (!/^[a-z][a-z0-9_]*$/.test(String(edge.relation || ''))) {
      fail('SEMANTIC_CORRELATION_RELATION_INVALID');
    }
    if (typeof edge.source_layer !== 'string' || typeof edge.target_layer !== 'string'
      || edge.source_layer !== sourceNodes.get(edge.source).semantic_layer
      || edge.target_layer !== sourceNodes.get(edge.target).semantic_layer
      || edge.source_layer === edge.target_layer) {
      fail('SEMANTIC_CORRELATION_CROSS_LAYER_INVALID');
    }
    const key = [edge.source, edge.target, edge.relation, edge.evidence].join('\u0000');
    if (!edgeMap.has(key)) edgeMap.set(key, edge);
  }

  const selectedEdges = [...edgeMap.values()].sort((left, right) => {
    const leftKey = [left.source, left.target, left.relation, left.evidence].join('\u0000');
    const rightKey = [right.source, right.target, right.relation, right.evidence].join('\u0000');
    return leftKey.localeCompare(rightKey);
  });
  if (!selectedEdges.length) fail('SEMANTIC_CORRELATION_EXPLICIT_CROSS_LAYER_EDGE_REQUIRED');

  const selectedPaths = new Set(selectedEdges.flatMap((edge) => [edge.source, edge.target]));
  const nodes = [...selectedPaths].sort((left, right) => left.localeCompare(right)).map((nodePath) => {
    const node = sourceNodes.get(nodePath);
    return {
      node_id: `markdown:${node.path}`,
      domain_id: node.semantic_layer,
      label: node.title || node.path,
      source_refs: [node.path],
      properties: {
        source_path: node.path,
        source_content_hash: node.content_hash,
        lifecycle_class: node.lifecycle_class || null,
        node_kind: node.node_kind || null,
        cognitive_role: node.cognitive_role || null,
        epistemic_status: node.epistemic_status || null,
        actionability: node.actionability || null,
      },
    };
  });

  const correlations = selectedEdges.map((edge) => {
    const identity = {
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      evidence: edge.evidence,
    };
    return {
      correlation_id: `corr_${sha256Json(identity).slice(0, 24)}`,
      relation_type: edge.relation,
      directed: true,
      participants: [
        { node_id: `markdown:${edge.source}`, role: 'source' },
        { node_id: `markdown:${edge.target}`, role: 'target' },
      ],
      epistemic_status: 'observed',
      source_refs: [edge.source],
      support_refs: [
        `md-os/ops/semantic_knowledge_graph.json#${sha256Json(identity)}`,
      ],
      contradiction_refs: [],
      verification: {
        status: 'unverified',
        verifier_id: null,
        independent: false,
        evidence_refs: [],
      },
      valid_from: null,
      valid_to: null,
      measures: {
        semantic_similarity: null,
        confidence: null,
        causal_support: null,
        frequency: 1,
      },
      properties: {
        assertion_scope: 'explicit_link_presence_only',
        evidence_kind: edge.evidence,
        cross_layer: true,
        source_layer: edge.source_layer,
        target_layer: edge.target_layer,
        source_role: edge.source_role || null,
        target_role: edge.target_role || null,
        semantic_graph_source_hash: graph.source_hash,
      },
    };
  });

  return buildSparseCorrelationSkeleton({
    schema_version: 1,
    skeleton_id: options.skeleton_id
      || `correlation_skeleton_semantic_graph_${graph.source_hash.slice(0, 16)}`,
    created_at: options.created_at || graph.updated_at,
    nodes,
    correlations,
  });
}

module.exports = {
  DEFAULT_EXCLUDED_PATH_PREFIXES,
  EXPLICIT_EVIDENCE_KINDS,
  projectSemanticGraphToSparseSkeleton,
};
