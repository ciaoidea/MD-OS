'use strict';

const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const {
  projectSemanticGraphToSparseSkeleton,
} = require('../md-os/kernel/cognition/semantic_graph_correlation_projection');
const {
  runRepositoryCorrelationProbe,
} = require('../md-os/os/run_repository_correlation_probe');

const WORKSPACE_ROOT = path.resolve(__dirname, '..');

function node(relativePath, layer) {
  return {
    path: relativePath,
    title: relativePath,
    semantic_layer: layer,
    lifecycle_class: 'source',
    node_kind: 'knowledge_model',
    cognitive_role: 'reference_memory',
    epistemic_status: 'canonical_operating_knowledge',
    actionability: 'reference',
    content_hash: 'a'.repeat(64),
  };
}

function edge(source, target, sourceLayer, targetLayer, evidence = 'explicit_markdown') {
  return {
    source,
    target,
    relation: 'references',
    source_layer: sourceLayer,
    target_layer: targetLayer,
    cross_layer: sourceLayer !== targetLayer,
    source_role: 'reference_memory',
    target_role: 'meaning_router',
    evidence,
  };
}

function graphFixture() {
  return {
    schema_version: 1,
    updated_at: '2026-09-03T10:00:00.000Z',
    source_hash: 'b'.repeat(64),
    status: 'ok',
    nodes: [
      node('md-os/kb/A.md', 'epistemic'),
      node('md-os/kb/B.md', 'semantic'),
      node('md-os/kb/C.md', 'epistemic'),
      node('md-os/ops/local/private.md', 'identity'),
    ],
    semantic_edges: [
      edge('md-os/kb/A.md', 'md-os/kb/B.md', 'epistemic', 'semantic'),
      edge('md-os/kb/A.md', 'md-os/kb/C.md', 'epistemic', 'epistemic'),
      edge('md-os/kb/B.md', 'md-os/kb/C.md', 'semantic', 'epistemic', 'structural'),
      edge('md-os/kb/A.md', 'md-os/ops/local/private.md', 'epistemic', 'identity'),
    ],
  };
}

test('projection keeps only explicit cross-layer public correlations', () => {
  const skeleton = projectSemanticGraphToSparseSkeleton(graphFixture());
  assert.equal(skeleton.metrics.node_count, 2);
  assert.equal(skeleton.metrics.domain_count, 2);
  assert.equal(skeleton.metrics.materialized_correlation_count, 1);
  assert.equal(skeleton.metrics.theoretical_binary_cross_domain_coordinates, '1');
  assert.equal(skeleton.metrics.dense_coordinates_materialized, false);
  assert.equal(skeleton.correlations[0].epistemic_status, 'observed');
  assert.equal(skeleton.correlations[0].verification.status, 'unverified');
  assert.equal(skeleton.correlations[0].properties.assertion_scope, 'explicit_link_presence_only');
  assert.ok(skeleton.nodes.every((item) => !item.node_id.includes('/local/')));
});

test('projection fails closed on malformed graph identity and endpoints', () => {
  const malformedHash = graphFixture();
  malformedHash.source_hash = 'not-a-hash';
  assert.throws(
    () => projectSemanticGraphToSparseSkeleton(malformedHash),
    /SEMANTIC_CORRELATION_GRAPH_INVALID/,
  );

  const missingEndpoint = graphFixture();
  missingEndpoint.semantic_edges[0].target = 'md-os/kb/MISSING.md';
  assert.throws(
    () => projectSemanticGraphToSparseSkeleton(missingEndpoint),
    /SEMANTIC_CORRELATION_EDGE_ENDPOINT_INVALID/,
  );
});

test('current repository graph projects sparsely without private paths', () => {
  const graphPath = path.join(WORKSPACE_ROOT, 'md-os', 'ops', 'semantic_knowledge_graph.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const skeleton = projectSemanticGraphToSparseSkeleton(graph);
  const possible = BigInt(skeleton.metrics.theoretical_binary_cross_domain_coordinates);
  const materialized = BigInt(skeleton.metrics.materialized_correlation_count);

  assert.ok(materialized > 0n);
  assert.ok(materialized < possible);
  assert.ok(skeleton.nodes.length < graph.nodes.length);
  assert.ok(skeleton.nodes.every((item) => !item.source_refs.some((ref) => ref.startsWith('md-os/ops/local/'))));
  assert.ok(skeleton.correlations.every((item) => item.properties.cross_layer === true));
  assert.ok(skeleton.correlations.every((item) => item.properties.assertion_scope === 'explicit_link_presence_only'));
});

test('repository probe reports bounded dependency without widening the claim', () => {
  const graphPath = path.join(WORKSPACE_ROOT, 'md-os', 'ops', 'semantic_knowledge_graph.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const result = runRepositoryCorrelationProbe(graph);

  assert.equal(result.ok, true);
  assert.equal(result.metrics.dense_coordinates_materialized, false);
  assert.ok(result.metrics.coordinate_coverage_upper_bound < 1);
  assert.equal(result.bounded_dependency_example.status, 'verified');
  assert.equal(result.bounded_dependency_example.severed_path_inhibited, true);
  assert.equal(result.claim_boundary.real_repository_link_presence_observed, true);
  assert.equal(result.claim_boundary.semantic_relation_verified, false);
  assert.equal(result.claim_boundary.external_world_relation_verified, false);
  assert.equal(result.claim_boundary.autonomous_continuous_learning_enabled, false);
});

test('repository probe rejects a stale source hash', () => {
  const graphPath = path.join(WORKSPACE_ROOT, 'md-os', 'ops', 'semantic_knowledge_graph.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const tampered = structuredClone(graph);
  const source = tampered.nodes.find((item) => item.path === 'AUTHORS.md');
  source.content_hash = 'c'.repeat(64);

  assert.throws(
    () => runRepositoryCorrelationProbe(tampered),
    /REPOSITORY_CORRELATION_SOURCE_STALE/,
  );
});

test('repository probe rejects a semantic edge absent from current Markdown', () => {
  const graphPath = path.join(WORKSPACE_ROOT, 'md-os', 'ops', 'semantic_knowledge_graph.json');
  const graph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  const tampered = structuredClone(graph);
  const fake = tampered.semantic_edges.find((item) => (
    item.source === 'AUTHORS.md'
    && item.target === 'CONTRIBUTING.md'
    && item.evidence === 'explicit_markdown'
  ));
  fake.target = 'ME.md';
  fake.target_layer = tampered.nodes.find((item) => item.path === 'ME.md').semantic_layer;
  fake.cross_layer = fake.source_layer !== fake.target_layer;

  assert.throws(
    () => runRepositoryCorrelationProbe(tampered),
    /REPOSITORY_CORRELATION_LINK_STALE/,
  );
});
