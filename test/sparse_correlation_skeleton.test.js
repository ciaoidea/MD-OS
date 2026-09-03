#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  assertSparseCorrelationSkeleton,
  buildSparseCorrelationSkeleton,
  findSparseCorrelationPath,
  probeSparseCorrelationDependency,
} = require('../md-os/kernel/cognition/sparse_correlation_skeleton');

const AS_OF = '2026-03-01T00:00:00.000Z';

function node(nodeId, domainId, label) {
  return {
    node_id: nodeId,
    domain_id: domainId,
    label,
    source_refs: [`fixture/${nodeId}`],
  };
}

function correlation(correlationId, relationType, sourceNodeId, targetNodeId, overrides = {}) {
  return {
    correlation_id: correlationId,
    relation_type: relationType,
    participants: [
      { node_id: sourceNodeId, role: 'source' },
      { node_id: targetNodeId, role: 'target' },
      ...(overrides.context_node_ids || []).map((nodeId) => ({ node_id: nodeId, role: 'context' })),
    ],
    epistemic_status: 'observed',
    source_refs: [`fixture/${correlationId}`],
    support_refs: [`fixture/support/${correlationId}`],
    contradiction_refs: [],
    measures: {
      semantic_similarity: null,
      confidence: null,
      causal_support: null,
      frequency: 1,
    },
    ...overrides,
  };
}

function skeletonInput(extraCorrelations = []) {
  return {
    schema_version: 1,
    skeleton_id: 'correlation_skeleton_meter_pod_fixture_v1',
    created_at: '2026-09-03T09:00:00.000Z',
    nodes: [
      node('address:x', 'location', 'Address X'),
      node('bill:b7', 'document', 'Bill B7'),
      node('meter:m123', 'physical_meter', 'Meter M123'),
      node('notice:n9', 'document', 'Notice N9'),
      node('period:2026_h1', 'time', 'First half of 2026'),
      node('pod:p456', 'administrative_utility', 'POD P456'),
    ],
    correlations: [
      correlation('corr_01_meter_in_bill', 'mentioned_by', 'meter:m123', 'bill:b7'),
      correlation('corr_02_bill_at_address', 'located_at', 'bill:b7', 'address:x'),
      correlation('corr_03_address_to_notice', 'anchors_document', 'address:x', 'notice:n9', {
        context_node_ids: ['period:2026_h1'],
        valid_from: '2026-01-01T00:00:00.000Z',
        valid_to: '2026-06-30T23:59:59.999Z',
      }),
      correlation('corr_04_notice_mentions_pod', 'mentions', 'notice:n9', 'pod:p456', {
        epistemic_status: 'verified',
        verification: {
          status: 'passed',
          verifier_id: 'fixture_document_verifier',
          independent: true,
          evidence_refs: ['fixture/evidence/notice_n9'],
        },
      }),
      ...extraCorrelations,
    ],
  };
}

function query(overrides = {}) {
  return {
    source_node_id: 'meter:m123',
    target_node_id: 'pod:p456',
    as_of: AS_OF,
    max_hops: 6,
    available_context_node_ids: ['period:2026_h1'],
    ...overrides,
  };
}

test('the correlation skeleton materializes only typed sparse support', () => {
  const first = buildSparseCorrelationSkeleton(skeletonInput());
  const second = buildSparseCorrelationSkeleton(skeletonInput());
  assert.deepEqual(second, first);
  assert.equal(assertSparseCorrelationSkeleton(first), true);
  assert.equal(first.artifact_role, 'sparse_correlation_skeleton');
  assert.equal(first.representation, 'sparse_typed_temporal_correlation_hypergraph');
  assert.equal(first.metrics.theoretical_binary_cross_domain_coordinates, '14');
  assert.equal(first.metrics.materialized_correlation_count, 4);
  assert.equal(first.metrics.dense_coordinates_materialized, false);
  assert.ok(first.non_claims.includes('not a quantum-physical state or quantum computation claim'));
});

test('a bounded query composes a real path without materializing the product space', () => {
  const result = findSparseCorrelationPath(buildSparseCorrelationSkeleton(skeletonInput()), query());
  assert.equal(result.artifact_role, 'sparse_correlation_query');
  assert.equal(result.status, 'reachable');
  assert.equal(result.result_scope, 'bounded_topological_reachability');
  assert.equal(result.inference_epistemic_status, 'hypothetical');
  assert.equal(result.path.length, 4);
  assert.deepEqual(result.used_correlation_ids, [
    'corr_01_meter_in_bill',
    'corr_02_bill_at_address',
    'corr_03_address_to_notice',
    'corr_04_notice_mentions_pod',
  ]);
  assert.equal(result.criteria.required_context_present, true);
  assert.ok(result.non_claims.includes('reachability is not verification of the inferred endpoint relation'));
  assert.match(result.query_hash, /^[a-f0-9]{64}$/);
});

test('missing hyperedge context, stale time, and contradiction inhibit the path', () => {
  const skeleton = buildSparseCorrelationSkeleton(skeletonInput());
  assert.equal(findSparseCorrelationPath(skeleton, query({ available_context_node_ids: [] })).status, 'inhibited');
  assert.equal(findSparseCorrelationPath(skeleton, query({ as_of: '2027-01-01T00:00:00.000Z' })).status, 'inhibited');

  const contested = buildSparseCorrelationSkeleton({
    schema_version: 1,
    skeleton_id: 'correlation_skeleton_contested_fixture_v1',
    created_at: '2026-09-03T09:00:00.000Z',
    nodes: [
      node('meter:m123', 'physical_meter', 'Meter M123'),
      node('pod:p456', 'administrative_utility', 'POD P456'),
    ],
    correlations: [correlation('corr_contested', 'candidate_meter_of', 'meter:m123', 'pod:p456', {
      contradiction_refs: ['fixture/contradiction/different_address'],
    })],
  });
  const contestedQuery = {
    source_node_id: 'meter:m123',
    target_node_id: 'pod:p456',
  };
  assert.equal(findSparseCorrelationPath(contested, contestedQuery).status, 'inhibited');
  assert.equal(findSparseCorrelationPath(contested, { ...contestedQuery, admit_contested: true }).status, 'reachable');
});

test('a verified correlation requires independent evidence', () => {
  const invalid = skeletonInput();
  invalid.correlations[3].verification.independent = false;
  assert.throws(
    () => buildSparseCorrelationSkeleton(invalid),
    /CORRELATION_SKELETON_VERIFICATION_REQUIRED/,
  );
});

test('severing a necessary correlation inhibits inference while preserving all nodes', () => {
  const skeleton = buildSparseCorrelationSkeleton(skeletonInput());
  const probe = probeSparseCorrelationDependency(skeleton, query(), 'corr_02_bill_at_address');
  assert.equal(probe.artifact_role, 'sparse_correlation_dependency_probe');
  assert.equal(probe.status, 'verified');
  assert.deepEqual(probe.criteria, {
    same_nodes_preserved: true,
    intact_path_reachable: true,
    severed_correlation_used_by_intact_path: true,
    severed_path_inhibited: true,
  });
  assert.match(probe.probe_hash, /^[a-f0-9]{64}$/);
});

test('the dependency probe refuses a causal claim when an alternate path survives', () => {
  const alternative = correlation(
    'corr_05_alternate_meter_to_pod',
    'candidate_meter_of',
    'meter:m123',
    'pod:p456',
  );
  const skeleton = buildSparseCorrelationSkeleton(skeletonInput([alternative]));
  const probe = probeSparseCorrelationDependency(skeleton, query(), 'corr_05_alternate_meter_to_pod');
  assert.equal(probe.status, 'not_verified');
  assert.equal(probe.criteria.severed_path_inhibited, false);
});

test('hash tampering is rejected and the schema covers all three artifact roles', () => {
  const skeleton = buildSparseCorrelationSkeleton(skeletonInput());
  skeleton.nodes[0].label = 'tampered';
  assert.throws(() => assertSparseCorrelationSkeleton(skeleton), /CORRELATION_SKELETON_NODE_HASH_INVALID/);

  const schema = JSON.parse(fs.readFileSync(path.join(
    __dirname,
    '..',
    'md-os',
    'schemas',
    'sparse_correlation_artifact.schema.json',
  ), 'utf8'));
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.oneOf.length, 3);
  assert.equal(schema.$defs.skeleton.properties.artifact_role.const, 'sparse_correlation_skeleton');
  assert.equal(schema.$defs.query.properties.artifact_role.const, 'sparse_correlation_query');
  assert.equal(schema.$defs.probe.properties.artifact_role.const, 'sparse_correlation_dependency_probe');
});
