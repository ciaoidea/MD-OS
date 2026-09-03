#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { performance } = require('perf_hooks');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  printJson,
  sha256Text,
} = require('./lib/common');
const {
  findSparseCorrelationPath,
  probeSparseCorrelationDependency,
} = require('../kernel/cognition/sparse_correlation_skeleton');
const {
  projectSemanticGraphToSparseSkeleton,
} = require('../kernel/cognition/semantic_graph_correlation_projection');
const { buildMarkdownGraph } = require('./build_markdown_graph');

const SEMANTIC_GRAPH_JSON = path.join(MDOS_ROOT, 'ops', 'semantic_knowledge_graph.json');

function readSemanticGraph() {
  if (!fs.existsSync(SEMANTIC_GRAPH_JSON)) {
    throw new Error('REPOSITORY_CORRELATION_SEMANTIC_GRAPH_MISSING');
  }
  return JSON.parse(fs.readFileSync(SEMANTIC_GRAPH_JSON, 'utf8'));
}

function endpoints(correlation) {
  return {
    source_node_id: correlation.participants.find((item) => item.role === 'source').node_id,
    target_node_id: correlation.participants.find((item) => item.role === 'target').node_id,
  };
}

function verifyCurrentProjectionSources(skeleton, markdownGraph = buildMarkdownGraph()) {
  const stalePaths = [];
  const nodeById = new Map(skeleton.nodes.map((node) => [node.node_id, node]));
  for (const node of skeleton.nodes) {
    const relativePath = node.properties.source_path;
    const absolutePath = path.resolve(WORKSPACE_ROOT, relativePath);
    if (!absolutePath.startsWith(`${WORKSPACE_ROOT}${path.sep}`)
      || !fs.existsSync(absolutePath)
      || !fs.statSync(absolutePath).isFile()
      || sha256Text(fs.readFileSync(absolutePath, 'utf8')) !== node.properties.source_content_hash) {
      stalePaths.push(relativePath);
    }
  }
  if (stalePaths.length) {
    throw new Error(`REPOSITORY_CORRELATION_SOURCE_STALE: ${stalePaths.sort()[0]}`);
  }
  const currentExplicitLinks = new Set((markdownGraph.explicit_links || [])
    .filter((link) => link.status === 'resolved')
    .map((link) => [link.source, link.target, link.kind].join('\u0000')));
  const staleFactors = [];
  for (const correlation of skeleton.correlations) {
    const sourcePath = correlation.source_refs[0];
    const targetParticipant = correlation.participants.find((item) => item.role === 'target');
    const targetPath = nodeById.get(targetParticipant.node_id).properties.source_path;
    const key = [sourcePath, targetPath, correlation.properties.evidence_kind].join('\u0000');
    if (!currentExplicitLinks.has(key)) staleFactors.push(correlation.correlation_id);
  }
  if (staleFactors.length) {
    throw new Error(`REPOSITORY_CORRELATION_LINK_STALE: ${staleFactors.sort()[0]}`);
  }
  return {
    source_node_count: skeleton.nodes.length,
    link_factor_count: skeleton.correlations.length,
  };
}

function projectionCandidateMetrics(graph, skeleton) {
  const nodeByPath = new Map(graph.nodes.map((node) => [node.path, node]));
  const explicitCrossLayer = graph.semantic_edges.filter((edge) => (
    ['explicit_markdown', 'explicit_wiki'].includes(edge.evidence)
    && edge.cross_layer === true
  ));
  const privatePathRejected = explicitCrossLayer.filter((edge) => (
    edge.source.startsWith('md-os/ops/local/')
    || edge.target.startsWith('md-os/ops/local/')
  ));
  const publicCandidates = explicitCrossLayer.filter((edge) => !privatePathRejected.includes(edge));
  const unhashableEndpointRejected = publicCandidates.filter((edge) => (
    !/^[a-f0-9]{64}$/.test(String(nodeByPath.get(edge.source)?.content_hash || ''))
    || !/^[a-f0-9]{64}$/.test(String(nodeByPath.get(edge.target)?.content_hash || ''))
  ));
  return {
    explicit_cross_layer_candidate_count: explicitCrossLayer.length,
    private_path_rejected_count: privatePathRejected.length,
    unhashable_endpoint_rejected_count: unhashableEndpointRejected.length,
    duplicate_rejected_count: Math.max(
      0,
      publicCandidates.length
        - unhashableEndpointRejected.length
        - skeleton.correlations.length,
    ),
  };
}

function boundedRatio(numerator, denominator, scale = 1000000n) {
  if (denominator <= 0n) return 0;
  return Number((numerator * scale) / denominator) / Number(scale);
}

function findNecessaryFactorProbe(skeleton) {
  for (const correlation of skeleton.correlations) {
    const query = {
      ...endpoints(correlation),
      max_hops: 6,
      admitted_epistemic_statuses: ['observed'],
    };
    const probe = probeSparseCorrelationDependency(
      skeleton,
      query,
      correlation.correlation_id,
    );
    if (probe.status === 'verified') {
      return {
        query: findSparseCorrelationPath(skeleton, query),
        probe,
      };
    }
  }
  return null;
}

function runRepositoryCorrelationProbe(graph = readSemanticGraph()) {
  const startedAt = performance.now();
  const skeleton = projectSemanticGraphToSparseSkeleton(graph);
  const verified = verifyCurrentProjectionSources(skeleton);
  const elapsedMs = performance.now() - startedAt;
  const theoretical = BigInt(skeleton.metrics.theoretical_binary_cross_domain_coordinates);
  const materialized = BigInt(skeleton.metrics.materialized_correlation_count);
  const dependency = findNecessaryFactorProbe(skeleton);
  const serializedBytes = Buffer.byteLength(JSON.stringify(skeleton), 'utf8');
  const coverage = boundedRatio(materialized, theoretical);
  const candidateMetrics = projectionCandidateMetrics(graph, skeleton);

  return {
    ok: true,
    mode: 'repository_sparse_correlation_probe',
    source: 'md-os/ops/semantic_knowledge_graph.json',
    source_hash: graph.source_hash,
    skeleton_id: skeleton.skeleton_id,
    skeleton_hash: skeleton.skeleton_hash,
    policy: {
      admitted_evidence: ['explicit_markdown', 'explicit_wiki'],
      cross_layer_only: true,
      excluded_path_prefixes: ['md-os/ops/local/'],
      hash_bound_source_nodes_only: true,
      current_source_readback_required: true,
      current_link_reparse_required: true,
      materialized_assertion_scope: 'explicit_link_presence_only',
    },
    metrics: {
      source_semantic_edge_count: graph.semantic_edges.length,
      domain_count: skeleton.metrics.domain_count,
      node_count: skeleton.metrics.node_count,
      verified_current_source_node_count: verified.source_node_count,
      verified_current_link_factor_count: verified.link_factor_count,
      ...candidateMetrics,
      materialized_correlation_count: skeleton.metrics.materialized_correlation_count,
      theoretical_binary_cross_domain_coordinates:
        skeleton.metrics.theoretical_binary_cross_domain_coordinates,
      coordinate_coverage_upper_bound: coverage,
      dense_coordinates_materialized: false,
      serialized_skeleton_bytes: serializedBytes,
      projection_elapsed_ms: Number(elapsedMs.toFixed(3)),
    },
    bounded_dependency_example: dependency ? {
      status: dependency.probe.status,
      source_node_id: dependency.query.query.source_node_id,
      target_node_id: dependency.query.query.target_node_id,
      intact_status: dependency.query.status,
      severed_correlation_id: dependency.probe.severed_correlation_id,
      severed_path_inhibited: dependency.probe.criteria.severed_path_inhibited,
      probe_hash: dependency.probe.probe_hash,
    } : null,
    claim_boundary: {
      real_repository_link_presence_observed: true,
      semantic_relation_verified: false,
      external_world_relation_verified: false,
      dense_tensor_materialized: false,
      autonomous_continuous_learning_enabled: false,
    },
  };
}

if (require.main === module) printJson(runRepositoryCorrelationProbe());

module.exports = {
  boundedRatio,
  findNecessaryFactorProbe,
  projectionCandidateMetrics,
  runRepositoryCorrelationProbe,
  verifyCurrentProjectionSources,
};
