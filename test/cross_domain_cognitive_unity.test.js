#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { sha256Json } = require('../md-os/kernel/cognition/general_program_synthesis');
const {
  applyRelativeTensorTransformation,
  buildCognitiveUnityState,
  composeAxisOperators,
  evaluateCognitiveUnityClaims,
  induceCandidateTransformationLaw,
  verifyRelativeTensorTransformation,
} = require('../md-os/kernel/cognition/cross_domain_cognitive_unity');
const { runCrossDomainCognitiveUnityFixture } = require('../md-os/os/run_cross_domain_cognitive_unity');
const { buildPromotionGate } = require('../md-os/os/agi_loop');
const { gateCandidate } = require('../md-os/apfc/executive/consolidator');

const IDENTITY = [[1, 0], [0, 1]];
const SWAP = [[0, 1], [1, 0]];
const SOURCE_TENSOR = [[1, 2], [3, 4]];
const TARGET_TENSOR = [[3, 4], [1, 2]];
const EVIDENCE_REFS = [
  'development/row_swap_pair_1',
  'holdout/target_result',
  'holdout/return_result',
  'holdout/controls',
  'holdout/contamination_audit',
  'episodes/reuse_1',
  'episodes/reuse_2',
];

function evidenceText(evidenceRef) {
  return `verified fixture evidence: ${evidenceRef}\n`;
}

function evidenceManifest(storage = 'workspace_file') {
  return EVIDENCE_REFS.map((evidenceRef) => ({
    evidence_ref: evidenceRef,
    storage,
    ...(storage === 'workspace_file' ? { relative_file: `evidence/${evidenceRef.replaceAll('/', '__')}.txt` } : {}),
    sha256: createHash('sha256').update(evidenceText(evidenceRef)).digest('hex'),
  }));
}

function frame(frameId, domainId) {
  return {
    schema_version: 1,
    frame_id: frameId,
    domain_id: domainId,
    representation_space: 'finite_rank_two_test_space',
    basis_id: `${frameId}_basis`,
    basis_dimension: 2,
    tensor_axes: ['relation', 'feature'],
    semantic_referents: [`${domainId}_relation`],
    verifier_contract_id: `verifier_${domainId}`,
  };
}

function lawInduction() {
  return induceCandidateTransformationLaw({
    induction_id: 'induction_row_swap_v1',
    development_pairs: [{
      source_tensor: SOURCE_TENSOR,
      observed_target_tensor: TARGET_TENSOR,
    }],
    candidates: [
      {
        law_id: 'identity_law',
        declaration: 'T_target[a,b] = T_source[a,b]',
        axis_operators: [IDENTITY, IDENTITY],
        inverse_axis_operators: [IDENTITY, IDENTITY],
      },
      {
        law_id: 'row_swap_law',
        declaration: 'T_target[a,b] = sum_i P[a,i] T_source[i,b]',
        axis_operators: [SWAP, IDENTITY],
        inverse_axis_operators: [SWAP, IDENTITY],
      },
    ],
    development_evidence_refs: ['development/row_swap_pair_1'],
    sealed_before_target_verification: true,
  });
}

function evidence(verifierId, reference) {
  return {
    status: 'passed',
    verifier_id: verifierId,
    independent_from_law_inducer: true,
    evidence_refs: [reference],
  };
}

function verifiedSpecification(overrides = {}) {
  const induction = lawInduction();
  return {
    schema_version: 1,
    transformation_id: 'transform_row_swap_v1',
    verification_id: 'verification_row_swap_v1',
    source_frame: frame('frame_source_records', 'records'),
    target_frame: frame('frame_target_graphs', 'graphs'),
    source_tensor: SOURCE_TENSOR,
    observed_target_tensor: TARGET_TENSOR,
    axis_operators: induction.selected_axis_operators,
    inverse_axis_operators: induction.selected_inverse_axis_operators,
    invertible: true,
    transformation_law: induction.selected_declaration,
    law_induction: induction,
    declared_invariants: [
      { invariant_id: 'invariant_energy', kind: 'frobenius_norm' },
      { invariant_id: 'invariant_components', kind: 'component_multiset' },
    ],
    target_semantic_verification: evidence('independent_target_oracle', 'holdout/target_result'),
    return_semantic_verification: evidence('independent_return_oracle', 'holdout/return_result'),
    controls: {
      disabled_status: 'failed_as_expected',
      sham_status: 'failed_as_expected',
      equal_budgets: true,
      evidence_refs: ['holdout/controls'],
    },
    contamination_audit: {
      status: 'ok',
      target_evidence_exposed_before_candidate: false,
      evidence_refs: ['holdout/contamination_audit'],
    },
    causal_reuse: {
      status: 'verified',
      reuse_count: 2,
      evidence_refs: ['episodes/reuse_1', 'episodes/reuse_2'],
    },
    evidence_manifest: evidenceManifest(),
    tolerance: 1e-12,
    ...overrides,
  };
}

function verifiedReport() {
  return verifyRelativeTensorTransformation(verifiedSpecification());
}

function unityState(report) {
  return buildCognitiveUnityState({
    state_id: 'unity_cross_domain_fixture_v1',
    created_at: '2026-08-23T12:00:00.000Z',
    operational_self_refs: ['ME.md'],
    world_observation_refs: ['observations/fixture_world'],
    goal_refs: ['goals/transport_relation'],
    memory_refs: ['episodes/reuse_1'],
    frame_refs: [report.source_frame_id, report.target_frame_id],
    transformation_refs: [report.verification_id],
    action_refs: ['actions/apply_row_swap'],
    evidence_refs: ['holdout/target_result', 'holdout/return_result'],
    transformation_reports: [report],
    open_conflicts: [],
  });
}

test('Cortex induces one law from competing development hypotheses before target evidence', () => {
  const receipt = lawInduction();
  assert.equal(receipt.status, 'induced');
  assert.equal(receipt.selected_law_id, 'row_swap_law');
  assert.equal(receipt.candidate_count, 2);
  assert.equal(receipt.development_pair_count, 1);
  assert.equal(receipt.target_evidence_accessed, false);
  assert.equal(receipt.sealed_before_target_verification, true);
  const { induction_hash: inductionHash, ...payload } = receipt;
  assert.equal(inductionHash, sha256Json(payload));
  assert.equal(receipt.candidate_measurements.find((item) => item.law_id === 'identity_law').passed, false);
});

test('ambiguous development evidence does not manufacture a law', () => {
  const receipt = induceCandidateTransformationLaw({
    induction_id: 'induction_ambiguous_v1',
    development_pairs: [{ source_tensor: SOURCE_TENSOR, observed_target_tensor: SOURCE_TENSOR }],
    candidates: [
      { law_id: 'identity_a', declaration: 'identity a', axis_operators: [IDENTITY, IDENTITY] },
      { law_id: 'identity_b', declaration: 'identity b', axis_operators: [IDENTITY, IDENTITY] },
    ],
    development_evidence_refs: ['development/ambiguous'],
    sealed_before_target_verification: true,
  });
  assert.equal(receipt.status, 'ambiguous');
  assert.equal(receipt.selected_law_id, null);
});

test('relative tensor law preserves declared relations across distinct domains', () => {
  const report = verifiedReport();
  assert.equal(report.status, 'verified');
  assert.equal(report.tensor_law.residual, 0);
  assert.equal(report.roundtrip.residual, 0);
  assert.equal(report.composition.residual, 0);
  assert.equal(report.criteria.candidate_law_induced_before_target_evidence, true);
  assert.equal(report.criteria.source_target_domains_distinct, true);
  assert.ok(report.invariants.every((invariant) => invariant.passed));
  const { verification_hash: verificationHash, ...payload } = report;
  assert.equal(verificationHash, sha256Json(payload));
});

test('composition agrees with sequential frame transformations', () => {
  const first = [SWAP, IDENTITY];
  const second = [SWAP, SWAP];
  const sequential = applyRelativeTensorTransformation(
    applyRelativeTensorTransformation(SOURCE_TENSOR, first),
    second,
  );
  const composed = applyRelativeTensorTransformation(SOURCE_TENSOR, composeAxisOperators(second, first));
  assert.deepEqual(composed, sequential);
  assert.deepEqual(composed, [[2, 1], [4, 3]]);
});

test('a non-invertible cross-domain law is admitted only with explicit information loss', () => {
  const lossySource = [[1, 2], [3, 0]];
  const lossyTarget = [[1, 2], [1, 2]];
  const projection = [[1, 0], [1, 0]];
  const induction = induceCandidateTransformationLaw({
    induction_id: 'induction_lossy_projection_v1',
    development_pairs: [{ source_tensor: lossySource, observed_target_tensor: lossyTarget }],
    candidates: [
      { law_id: 'identity_law', declaration: 'identity', axis_operators: [IDENTITY, IDENTITY] },
      { law_id: 'lossy_projection_law', declaration: 'row projection', axis_operators: [projection, IDENTITY] },
    ],
    development_evidence_refs: ['development/row_swap_pair_1'],
    sealed_before_target_verification: true,
  });
  const common = {
    transformation_id: 'transform_lossy_projection_v1',
    verification_id: 'verification_lossy_projection_v1',
    source_tensor: lossySource,
    observed_target_tensor: lossyTarget,
    axis_operators: induction.selected_axis_operators,
    inverse_axis_operators: undefined,
    invertible: false,
    transformation_law: induction.selected_declaration,
    law_induction: induction,
    declared_invariants: [{ invariant_id: 'invariant_total_sum', kind: 'total_sum' }],
  };
  const report = verifyRelativeTensorTransformation(verifiedSpecification({
    ...common,
    information_loss: {
      declared: true,
      description: 'The second source row is discarded; only the declared total-sum invariant is tested.',
    },
  }));
  assert.equal(report.status, 'verified');
  assert.equal(report.roundtrip.required, false);
  assert.equal(report.composition.tested_as, 'declared_lossy_composition');

  const undeclared = verifyRelativeTensorTransformation(verifiedSpecification(common));
  assert.equal(undeclared.status, 'rejected');
  assert.equal(undeclared.criteria.inverse_or_loss_declared, false);
});

test('sham observation and post-hoc law induction fail closed', () => {
  const sham = verifyRelativeTensorTransformation(verifiedSpecification({
    observed_target_tensor: SOURCE_TENSOR,
  }));
  assert.equal(sham.status, 'rejected');
  assert.equal(sham.criteria.tensor_transformation_law_passed, false);

  const induction = lawInduction();
  induction.target_evidence_accessed = true;
  const { induction_hash: _, ...payload } = induction;
  const postHoc = verifyRelativeTensorTransformation(verifiedSpecification({
    law_induction: { ...payload, induction_hash: sha256Json(payload) },
  }));
  assert.equal(postHoc.status, 'rejected');
  assert.equal(postHoc.criteria.candidate_law_induced_before_target_evidence, false);
});

test('all operational channels and verified transformations form a hash-bound unity state', () => {
  const report = verifiedReport();
  const state = unityState(report);
  assert.equal(state.status, 'verified');
  assert.ok(Object.values(state.criteria).every(Boolean));
  const { state_hash: stateHash, ...payload } = state;
  assert.equal(stateHash, sha256Json(payload));

  const incomplete = buildCognitiveUnityState({
    state_id: 'unity_incomplete_v1',
    created_at: '2026-08-23T12:00:00.000Z',
    transformation_reports: [report],
    transformation_refs: [report.verification_id],
  });
  assert.equal(incomplete.status, 'attention');
  assert.equal(incomplete.criteria.all_cognitive_channels_bound, false);
});

test('generality claims cannot pass the promotion boundary without hash-bound evidence', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-unity-gate-'));
  const evidenceDir = path.join(workspace, 'evidence');
  fs.mkdirSync(evidenceDir, { recursive: true });
  const report = verifiedReport();
  const state = unityState(report);
  for (const entry of report.evidence_manifest) {
    const target = path.join(workspace, entry.relative_file);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, evidenceText(entry.evidence_ref));
  }
  fs.writeFileSync(path.join(evidenceDir, 'transform.json'), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(evidenceDir, 'unity.json'), `${JSON.stringify(state, null, 2)}\n`);
  const skill = {
    skill_id: 'skill_cross_domain_fixture',
    generality_claims: ['cross_domain_transfer', 'tensorial_transformation', 'cognitive_unity'],
    relative_transformation_verification_file: 'evidence/transform.json',
    relative_transformation_verification_hash: report.verification_hash,
    cognitive_unity_state_file: 'evidence/unity.json',
    cognitive_unity_state_hash: state.state_hash,
  };
  assert.equal(evaluateCognitiveUnityClaims(skill, { workspace_root: workspace }).status, 'ok');
  fs.writeFileSync(
    path.join(workspace, report.evidence_manifest[0].relative_file),
    'tampered after verification\n',
  );
  const tamperedEvidence = evaluateCognitiveUnityClaims(skill, { workspace_root: workspace });
  assert.equal(tamperedEvidence.status, 'critical');
  assert.equal(tamperedEvidence.criteria.underlying_evidence_files_valid, false);
  fs.writeFileSync(
    path.join(workspace, report.evidence_manifest[0].relative_file),
    evidenceText(report.evidence_manifest[0].evidence_ref),
  );
  assert.equal(evaluateCognitiveUnityClaims({
    ...skill,
    relative_transformation_verification_hash: '0'.repeat(64),
  }, { workspace_root: workspace }).status, 'critical');
  assert.equal(evaluateCognitiveUnityClaims({
    skill_id: 'skill_ordinary',
  }, { workspace_root: workspace }).status, 'ok');
});

test('schemas preserve explicit artifacts and non-AGI claim boundaries', () => {
  const schemaNames = [
    'cognitive_frame.schema.json',
    'relative_tensor_transformation.schema.json',
    'cross_domain_transformation_verification.schema.json',
    'cognitive_unity_state.schema.json',
  ];
  for (const name of schemaNames) {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'md-os', 'schemas', name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.ok(schema.required.length > 0);
  }
  assert.ok(verifiedReport().non_claims.includes('not evidence of AGI'));
  assert.ok(unityState(verifiedReport()).non_claims.includes('this cross-domain state alone does not complete consciousness C(k)'));
});

test('the bounded Cortex command fixture produces verified artifacts without widening the claim', () => {
  const result = runCrossDomainCognitiveUnityFixture();
  assert.equal(result.ok, true);
  assert.equal(result.law_induction.status, 'induced');
  assert.equal(result.transformation_verification.status, 'verified');
  assert.equal(result.cognitive_unity_state.status, 'verified');
  assert.equal(result.sparse_correlation_skeleton.metrics.dense_coordinates_materialized, false);
  assert.equal(result.sparse_correlation_query.status, 'reachable');
  assert.equal(result.sparse_correlation_dependency_probe.status, 'verified');
  assert.equal(result.claim_boundary.bounded_explicit_tensor_integration_supported, true);
  assert.equal(result.claim_boundary.sparse_correlational_implementation_supported, true);
  assert.equal(result.claim_boundary.production_promotion_evidence_supported, false);
  assert.equal(result.claim_boundary.automatic_unbounded_law_discovery_supported, false);
  assert.equal(result.claim_boundary.direct_hidden_layer_extension_supported, false);
  assert.equal(result.claim_boundary.quantum_physical_implementation_supported, false);
  assert.equal(result.claim_boundary.world_grounded_meter_pod_identity_supported, false);
  assert.equal(result.claim_boundary.agi_supported, false);
  assert.equal(result.claim_boundary.consciousness_supported, false);
});

test('the Cognitive Transaction Loop blocks an unsupported generality claim', () => {
  const baseSkill = {
    skill_id: 'skill_gate_fixture',
    title: 'Gate fixture',
    source_episodes: ['episode_a', 'episode_b'],
    holdout_eval: { status: 'ok' },
    rollback: 'Remove the candidate.',
  };
  const evalResult = {
    eval_id: 'eval_gate_fixture',
    task_outcome_verified: true,
    improvement_measured: true,
    improves: true,
    no_regression: true,
  };
  const ordinary = buildPromotionGate({
    skill: baseSkill,
    evalResult,
    riskLevel: 'low',
    options: { allow_high_risk: false },
  });
  assert.equal(ordinary.status, 'ok');

  const unsupported = buildPromotionGate({
    skill: { ...baseSkill, generality_claims: ['cross_domain_transfer'] },
    evalResult,
    riskLevel: 'low',
    options: { allow_high_risk: false },
  });
  assert.equal(unsupported.status, 'critical');
  assert.equal(unsupported.checks.find((check) => (
    check.check_id === 'relative_transformation_report_hash_valid'
  )).status, 'critical');
});

test('APFC consolidation also blocks the same unsupported claim', () => {
  const candidate = {
    skill_id: 'skill_consolidation_unity_fixture',
    title: 'Consolidation unity fixture',
    procedure: ['Apply the candidate.'],
    rollback: 'Remove the candidate.',
    generality_claims: ['cross_domain_transfer'],
    holdout_eval: {
      sealed: true,
      holdout_case_count: 30,
      trial_count: 3,
      observation_count: 90,
      absolute_delta: 0.2,
      exact_mcnemar_p: 0.01,
      critical_safety_violations: 0,
      new_protected_failures: 0,
      protected_suite_delta: 0,
      contamination_detected: false,
      cold_start_reconstruction_count: 2,
      cold_start_hashes_match: true,
      ablation_delta: 0.2,
      ablation_mcnemar_p: 0.01,
      rollback_rehearsal_passed: true,
      provenance_complete: true,
    },
  };
  const supporting = ['a', 'b'].map((suffix) => ({
    episode_id: `episode_${suffix}`,
    verdict: 'success',
    task_spec: { task_spec_id: `task_${suffix}` },
    action_input_hash: suffix.repeat(64),
    verifier_results: [{ outcome: 'verified', status: 'ok' }],
  }));
  const evaluation = {
    status: 'ok',
    improvement_measured: true,
    improves: true,
    no_regression: true,
  };
  const gate = gateCandidate(candidate, supporting, evaluation, { workspace_root: os.tmpdir() });
  assert.equal(gate.status, 'blocked');
  assert.ok(gate.failed_checks.includes('relative_transformation_report_hash_valid'));
  assert.ok(gate.failed_checks.includes('cross_domain_transformation_verified'));
});
