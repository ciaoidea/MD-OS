#!/usr/bin/env node
'use strict';

const { printJson, sha256Json, shortText } = require('./lib/common');
const {
  buildCognitiveUnityState,
  induceCandidateTransformationLaw,
  verifyRelativeTensorTransformation,
} = require('../kernel/cognition/cross_domain_cognitive_unity');
const {
  buildSparseCorrelationSkeleton,
  findSparseCorrelationPath,
  probeSparseCorrelationDependency,
} = require('../kernel/cognition/sparse_correlation_skeleton');

const IDENTITY = [[1, 0], [0, 1]];
const SWAP = [[0, 1], [1, 0]];

function frame(frameId, domainId) {
  return {
    schema_version: 1,
    frame_id: frameId,
    domain_id: domainId,
    representation_space: 'finite_rank_two_relation_space',
    basis_id: `${frameId}_basis`,
    basis_dimension: 2,
    tensor_axes: ['relation', 'feature'],
    semantic_referents: [`${domainId}_relation`],
    verifier_contract_id: `independent_${domainId}_fixture_oracle`,
  };
}

function evidence(verifierId, evidenceRefs) {
  return {
    status: 'passed',
    verifier_id: verifierId,
    independent_from_law_inducer: true,
    evidence_refs: evidenceRefs,
  };
}

function embeddedEvidenceManifest(evidenceRefs) {
  return [...new Set(evidenceRefs)].map((evidenceRef) => ({
    evidence_ref: evidenceRef,
    storage: 'embedded_fixture',
    sha256: sha256Json({ evidence_ref: evidenceRef, fixture: true }),
  }));
}

function runSparseCorrelationFixture() {
  const nodes = [
    ['address:x', 'location', 'Address X'],
    ['bill:b7', 'document', 'Bill B7'],
    ['meter:m123', 'physical_meter', 'Meter M123'],
    ['notice:n9', 'document', 'Notice N9'],
    ['period:2026_h1', 'time', 'First half of 2026'],
    ['pod:p456', 'administrative_utility', 'POD P456'],
  ].map(([nodeId, domainId, label]) => ({
    node_id: nodeId,
    domain_id: domainId,
    label,
    source_refs: [`fixture/${nodeId}`],
  }));
  const correlation = (correlationId, relationType, sourceNodeId, targetNodeId, contextNodeIds = []) => ({
    correlation_id: correlationId,
    relation_type: relationType,
    participants: [
      { node_id: sourceNodeId, role: 'source' },
      { node_id: targetNodeId, role: 'target' },
      ...contextNodeIds.map((nodeId) => ({ node_id: nodeId, role: 'context' })),
    ],
    epistemic_status: 'observed',
    source_refs: [`fixture/${correlationId}`],
    support_refs: [`fixture/support/${correlationId}`],
    contradiction_refs: [],
  });
  const correlations = [
    correlation('corr_01_meter_in_bill', 'mentioned_by', 'meter:m123', 'bill:b7'),
    correlation('corr_02_bill_at_address', 'located_at', 'bill:b7', 'address:x'),
    {
      ...correlation(
        'corr_03_address_to_notice',
        'anchors_document',
        'address:x',
        'notice:n9',
        ['period:2026_h1'],
      ),
      valid_from: '2026-01-01T00:00:00.000Z',
      valid_to: '2026-06-30T23:59:59.999Z',
    },
    {
      ...correlation('corr_04_notice_mentions_pod', 'mentions', 'notice:n9', 'pod:p456'),
      epistemic_status: 'verified',
      verification: {
        status: 'passed',
        verifier_id: 'fixture_document_verifier',
        independent: true,
        evidence_refs: ['fixture/evidence/notice_n9'],
      },
    },
  ];
  const skeleton = buildSparseCorrelationSkeleton({
    schema_version: 1,
    skeleton_id: 'correlation_skeleton_meter_pod_fixture_v1',
    created_at: '2026-09-03T09:00:00.000Z',
    nodes,
    correlations,
  });
  const queryInput = {
    source_node_id: 'meter:m123',
    target_node_id: 'pod:p456',
    as_of: '2026-03-01T00:00:00.000Z',
    max_hops: 6,
    available_context_node_ids: ['period:2026_h1'],
  };
  return {
    skeleton,
    query: findSparseCorrelationPath(skeleton, queryInput),
    dependency_probe: probeSparseCorrelationDependency(
      skeleton,
      queryInput,
      'corr_02_bill_at_address',
    ),
  };
}

function runCrossDomainCognitiveUnityFixture() {
  const lawInduction = induceCandidateTransformationLaw({
    induction_id: 'induction_cross_domain_relation_swap_v1',
    development_pairs: [
      { source_tensor: [[1, 2], [3, 4]], observed_target_tensor: [[3, 4], [1, 2]] },
      { source_tensor: [[5, 6], [7, 8]], observed_target_tensor: [[7, 8], [5, 6]] },
    ],
    candidates: [
      {
        law_id: 'identity_relation_law',
        declaration: 'T_target[a,b] = T_source[a,b]',
        axis_operators: [IDENTITY, IDENTITY],
        inverse_axis_operators: [IDENTITY, IDENTITY],
      },
      {
        law_id: 'relative_row_swap_law',
        declaration: 'T_target[a,b] = sum_i P[a,i] T_source[i,b]',
        axis_operators: [SWAP, IDENTITY],
        inverse_axis_operators: [SWAP, IDENTITY],
      },
    ],
    development_evidence_refs: ['fixture/development_pair_1', 'fixture/development_pair_2'],
    sealed_before_target_verification: true,
    tolerance: 1e-12,
  });

  const verification = verifyRelativeTensorTransformation({
    schema_version: 1,
    transformation_id: 'transform_cross_domain_relation_swap_v1',
    verification_id: 'verification_cross_domain_relation_swap_v1',
    source_frame: frame('frame_operational_records_v1', 'operational_records'),
    target_frame: frame('frame_graph_relations_v1', 'graph_relations'),
    source_tensor: [[2, 5], [11, 13]],
    observed_target_tensor: [[11, 13], [2, 5]],
    axis_operators: lawInduction.selected_axis_operators,
    inverse_axis_operators: lawInduction.selected_inverse_axis_operators,
    invertible: true,
    transformation_law: lawInduction.selected_declaration,
    law_induction: lawInduction,
    declared_invariants: [
      { invariant_id: 'relation_energy', kind: 'frobenius_norm' },
      { invariant_id: 'relation_component_multiset', kind: 'component_multiset' },
    ],
    target_semantic_verification: evidence('sealed_graph_relation_oracle', ['fixture/holdout_graph_case']),
    return_semantic_verification: evidence('sealed_record_return_oracle', ['fixture/holdout_record_roundtrip']),
    controls: {
      disabled_status: 'failed_as_expected',
      sham_status: 'failed_as_expected',
      equal_budgets: true,
      evidence_refs: ['fixture/disabled_control', 'fixture/identity_sham_control'],
    },
    contamination_audit: {
      status: 'ok',
      target_evidence_exposed_before_candidate: false,
      evidence_refs: ['fixture/sealed_target_manifest'],
    },
    causal_reuse: {
      status: 'verified',
      reuse_count: 2,
      evidence_refs: ['fixture/reuse_case_1', 'fixture/reuse_case_2'],
    },
    evidence_manifest: embeddedEvidenceManifest([
      ...lawInduction.development_evidence_refs,
      'fixture/holdout_graph_case',
      'fixture/holdout_record_roundtrip',
      'fixture/disabled_control',
      'fixture/identity_sham_control',
      'fixture/sealed_target_manifest',
      'fixture/reuse_case_1',
      'fixture/reuse_case_2',
    ]),
    tolerance: 1e-12,
  });

  const cognitiveUnityState = buildCognitiveUnityState({
    state_id: 'unity_cross_domain_relation_fixture_v1',
    created_at: '2026-08-23T12:00:00.000Z',
    operational_self_refs: ['ME.md'],
    world_observation_refs: ['fixture/holdout_graph_case'],
    goal_refs: ['fixture/goal_preserve_relation_across_frames'],
    memory_refs: ['fixture/development_pair_1', 'fixture/development_pair_2'],
    frame_refs: [verification.source_frame_id, verification.target_frame_id],
    transformation_refs: [verification.verification_id],
    action_refs: ['fixture/apply_relative_row_swap'],
    evidence_refs: ['fixture/holdout_graph_case', 'fixture/holdout_record_roundtrip'],
    transformation_reports: [verification],
    open_conflicts: [],
  });
  const sparseCorrelation = runSparseCorrelationFixture();

  return {
    ok: verification.status === 'verified'
      && cognitiveUnityState.status === 'verified'
      && sparseCorrelation.query.status === 'reachable'
      && sparseCorrelation.dependency_probe.status === 'verified',
    mode: 'cross_domain_cognitive_unity_fixture',
    law_induction: lawInduction,
    transformation_verification: verification,
    cognitive_unity_state: cognitiveUnityState,
    sparse_correlation_skeleton: sparseCorrelation.skeleton,
    sparse_correlation_query: sparseCorrelation.query,
    sparse_correlation_dependency_probe: sparseCorrelation.dependency_probe,
    claim_boundary: {
      bounded_explicit_tensor_integration_supported: verification.status === 'verified',
      operational_cognitive_unity_artifact_supported: cognitiveUnityState.status === 'verified',
      sparse_correlational_implementation_supported: sparseCorrelation.dependency_probe.status === 'verified',
      production_promotion_evidence_supported: false,
      automatic_unbounded_law_discovery_supported: false,
      direct_hidden_layer_extension_supported: false,
      quantum_physical_implementation_supported: false,
      world_grounded_meter_pod_identity_supported: false,
      agi_supported: false,
      consciousness_supported: false,
    },
  };
}

function main() {
  try {
    printJson(runCrossDomainCognitiveUnityFixture());
  } catch (error) {
    printJson({
      ok: false,
      mode: 'cross_domain_cognitive_unity_fixture',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { runCrossDomainCognitiveUnityFixture };
