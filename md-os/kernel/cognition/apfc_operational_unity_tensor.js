#!/usr/bin/env node
'use strict';

const {
  UNITY_CHANNELS,
  applyRelativeTensorTransformation,
  composeAxisOperators,
  invariantValue,
  maxAbsDelta,
  tensorShape,
} = require('./cross_domain_cognitive_unity');
const { sha256Json } = require('./general_program_synthesis');

const OPERATIONAL_FEATURES = Object.freeze([
  'presence',
  'bounded_count',
  'authority_declared',
  'verifier_backed',
]);

const VERIFICATION_FEATURES = Object.freeze([
  'verifier_backed',
  'authority_declared',
  'presence',
  'bounded_count',
]);

const MAX_BOUNDED_COUNT = 32;

function fail(code) {
  throw new Error(code);
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => Number(row === column))
  ));
}

function featurePermutation(sourceFeatures, targetFeatures) {
  return targetFeatures.map((feature) => sourceFeatures.map((candidate) => Number(candidate === feature)));
}

function boundedCount(value) {
  const numeric = Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0;
  return Math.min(numeric, MAX_BOUNDED_COUNT);
}

function bool(value) {
  return value === true ? 1 : 0;
}

function channelRow(input = {}) {
  const count = boundedCount(input.count);
  const present = input.present === true || count > 0;
  return [
    bool(present),
    count,
    bool(input.authority_declared),
    bool(input.verifier_backed),
  ];
}

function normalizeChannels(channels = {}) {
  return Object.fromEntries(UNITY_CHANNELS.map((channel) => [channel, {
    count: boundedCount(channels[channel] && channels[channel].count),
    present: Boolean(channels[channel] && channels[channel].present),
    authority_declared: Boolean(channels[channel] && channels[channel].authority_declared),
    verifier_backed: Boolean(channels[channel] && channels[channel].verifier_backed),
  }]));
}

function buildTensor(channels) {
  return UNITY_CHANNELS.map((channel) => channelRow(channels[channel]));
}

function verifyBasisView(sourceTensor) {
  const channelIdentity = identityMatrix(UNITY_CHANNELS.length);
  const forwardFeatureOperator = featurePermutation(OPERATIONAL_FEATURES, VERIFICATION_FEATURES);
  const inverseFeatureOperator = featurePermutation(VERIFICATION_FEATURES, OPERATIONAL_FEATURES);
  const forwardOperators = [channelIdentity, forwardFeatureOperator];
  const inverseOperators = [channelIdentity, inverseFeatureOperator];
  const verificationTensor = applyRelativeTensorTransformation(sourceTensor, forwardOperators);
  const recoveredTensor = applyRelativeTensorTransformation(verificationTensor, inverseOperators);
  const composedOperators = composeAxisOperators(inverseOperators, forwardOperators);
  const composedTensor = applyRelativeTensorTransformation(sourceTensor, composedOperators);
  const sourceNorm = invariantValue('frobenius_norm', sourceTensor);
  const verificationNorm = invariantValue('frobenius_norm', verificationTensor);
  const sourceComponents = invariantValue('component_multiset', sourceTensor);
  const verificationComponents = invariantValue('component_multiset', verificationTensor);
  const tensorLawResidual = maxAbsDelta(
    verificationTensor,
    applyRelativeTensorTransformation(sourceTensor, forwardOperators),
  );
  const roundtripResidual = maxAbsDelta(sourceTensor, recoveredTensor);
  const compositionResidual = maxAbsDelta(sourceTensor, composedTensor);
  const invariantResiduals = {
    frobenius_norm: Math.abs(sourceNorm - verificationNorm),
    component_multiset: maxAbsDelta(sourceComponents, verificationComponents),
  };
  const criteria = {
    rank_two_tensor: JSON.stringify(tensorShape(sourceTensor)) === JSON.stringify([
      UNITY_CHANNELS.length,
      OPERATIONAL_FEATURES.length,
    ]),
    declared_basis_permutation: forwardFeatureOperator.every((row) => row.reduce((sum, value) => sum + value, 0) === 1),
    tensor_law_passed: tensorLawResidual === 0,
    roundtrip_passed: roundtripResidual === 0,
    composition_identity_passed: compositionResidual === 0,
    frobenius_norm_preserved: invariantResiduals.frobenius_norm === 0,
    component_multiset_preserved: invariantResiduals.component_multiset === 0,
  };
  return {
    verification_tensor: verificationTensor,
    forward_axis_operators: forwardOperators,
    inverse_axis_operators: inverseOperators,
    residuals: {
      tensor_law: tensorLawResidual,
      roundtrip: roundtripResidual,
      composition: compositionResidual,
      invariants: invariantResiduals,
    },
    criteria,
    verified: Object.values(criteria).every(Boolean),
  };
}

function artifactHash(payload) {
  return sha256Json(payload);
}

function prepareOperationalUnityTensor(input) {
  if (!input || input.schema_version !== 1) fail('APFC_OPERATIONAL_UNITY_INPUT_INVALID');
  if (!/^(?:apfc_turn_[a-f0-9]{20}|frame_[a-z0-9_-]+)$/.test(String(input.frame_id || ''))) fail('APFC_OPERATIONAL_UNITY_FRAME_ID_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(input.input_hash || ''))) fail('APFC_OPERATIONAL_UNITY_INPUT_HASH_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(input.authority_hash || ''))) fail('APFC_OPERATIONAL_UNITY_AUTHORITY_HASH_INVALID');
  const channels = normalizeChannels(input.channels);
  const sourceTensor = buildTensor(channels);
  const basisView = verifyBasisView(sourceTensor);
  const payload = {
    schema_version: 1,
    artifact_role: 'turn_governance_telemetry',
    tensor_id: `apfc_unity_${artifactHash({ frame_id: input.frame_id, input_hash: input.input_hash, authority_hash: input.authority_hash }).slice(0, 20)}`,
    phase: 'prepared',
    status: basisView.verified ? 'verified' : 'rejected',
    scope: 'bounded_apfc_turn_governance_tensor',
    frame_id: input.frame_id,
    input_hash: input.input_hash,
    authority_hash: input.authority_hash,
    axes: {
      channels: UNITY_CHANNELS,
      source_features: OPERATIONAL_FEATURES,
      verification_features: VERIFICATION_FEATURES,
    },
    channels,
    source_tensor: sourceTensor,
    verification_tensor: basisView.verification_tensor,
    transformation: {
      kind: 'declared_feature_basis_permutation',
      source_basis_id: 'apfc_operational_features_v1',
      target_basis_id: 'apfc_verification_first_features_v1',
      forward_axis_operators: basisView.forward_axis_operators,
      inverse_axis_operators: basisView.inverse_axis_operators,
      residuals: basisView.residuals,
    },
    criteria: {
      ...basisView.criteria,
      counts_within_declared_bound: UNITY_CHANNELS.every((channel) => (
        Number(input.channels && input.channels[channel] && input.channels[channel].count || 0) <= MAX_BOUNDED_COUNT
      )),
    },
    protected_invariants: [
      'frame_id',
      'input_hash',
      'workspace_authority_boundary',
      'input_reference_hash_preserved',
      'model_output_remains_proposal_until_verified',
    ],
    non_claims: [
      'not direct access to host-model hidden layers',
      'not a global tensor representation of all intelligence',
      'not evidence of phenomenal consciousness',
      'not evidence of AGI',
      'not proof that the operational feature encoding is unique',
      'not semantic verification of an intent or hypothesis',
      'not world-grounded epistemic unity',
    ],
  };
  payload.status = Object.values(payload.criteria).every(Boolean) ? 'verified' : 'rejected';
  return { ...payload, artifact_hash: artifactHash(payload) };
}

function verifyPreparedArtifact(prepared) {
  if (!prepared || prepared.schema_version !== 1 || prepared.phase !== 'prepared') return false;
  const { artifact_hash: artifactHashValue, ...payload } = prepared;
  return /^[a-f0-9]{64}$/.test(String(artifactHashValue || ''))
    && artifactHashValue === artifactHash(payload)
    && prepared.status === 'verified'
    && prepared.artifact_role === 'turn_governance_telemetry';
}

function closeOperationalUnityTensor(input) {
  if (!input || input.schema_version !== 1 || !verifyPreparedArtifact(input.prepared)) {
    fail('APFC_OPERATIONAL_UNITY_PREPARED_ARTIFACT_INVALID');
  }
  const prepared = input.prepared;
  for (const [field, code] of [
    ['output_hash', 'APFC_OPERATIONAL_UNITY_OUTPUT_HASH_INVALID'],
    ['action_manifest_hash', 'APFC_OPERATIONAL_UNITY_ACTION_MANIFEST_HASH_INVALID'],
    ['evidence_manifest_hash', 'APFC_OPERATIONAL_UNITY_EVIDENCE_MANIFEST_HASH_INVALID'],
  ]) {
    if (!/^[a-f0-9]{64}$/.test(String(input[field] || ''))) fail(code);
  }
  const channels = normalizeChannels({
    ...prepared.channels,
    action_refs: input.channels && input.channels.action_refs || prepared.channels.action_refs,
    evidence_refs: input.channels && input.channels.evidence_refs || prepared.channels.evidence_refs,
    transformation_refs: input.channels && input.channels.transformation_refs || prepared.channels.transformation_refs,
  });
  const closedTensor = buildTensor(channels);
  const basisView = verifyBasisView(closedTensor);
  const frameInvariantPassed = input.frame_id === prepared.frame_id;
  const inputInvariantPassed = input.input_hash === prepared.input_hash;
  const authorityInvariantPassed = input.authority_hash === prepared.authority_hash;
  const proposalBoundaryPassed = input.assistant_output_epistemic_status === 'proposal';
  const verifierVerdict = ['pass', 'fail', 'unknown'].includes(input.verifier_verdict)
    ? input.verifier_verdict
    : 'unknown';
  const criteria = {
    prepared_artifact_hash_valid: true,
    frame_id_preserved: frameInvariantPassed,
    input_hash_preserved: inputInvariantPassed,
    workspace_authority_boundary_preserved: authorityInvariantPassed,
    assistant_output_proposal_boundary_preserved: proposalBoundaryPassed,
    output_hash_bound: true,
    action_manifest_hash_bound: true,
    evidence_manifest_hash_bound: true,
    rank_two_tensor: basisView.criteria.rank_two_tensor,
    declared_basis_permutation: basisView.criteria.declared_basis_permutation,
    tensor_law_passed: basisView.criteria.tensor_law_passed,
    roundtrip_passed: basisView.criteria.roundtrip_passed,
    composition_identity_passed: basisView.criteria.composition_identity_passed,
    frobenius_norm_preserved: basisView.criteria.frobenius_norm_preserved,
    component_multiset_preserved: basisView.criteria.component_multiset_preserved,
  };
  const representationVerified = Object.values(criteria).every(Boolean);
  const payload = {
    schema_version: 1,
    artifact_role: prepared.artifact_role,
    tensor_id: prepared.tensor_id,
    phase: 'closed',
    status: representationVerified ? 'verified' : 'rejected',
    scope: prepared.scope,
    frame_id: prepared.frame_id,
    input_hash: prepared.input_hash,
    authority_hash: prepared.authority_hash,
    output_hash: input.output_hash,
    action_manifest_hash: input.action_manifest_hash,
    evidence_manifest_hash: input.evidence_manifest_hash,
    prepared_artifact_hash: prepared.artifact_hash,
    axes: prepared.axes,
    prepared_artifact: prepared,
    channels,
    source_tensor: closedTensor,
    verification_tensor: basisView.verification_tensor,
    transformation: {
      kind: 'declared_feature_basis_permutation',
      source_basis_id: 'apfc_operational_features_v1',
      target_basis_id: 'apfc_verification_first_features_v1',
      forward_axis_operators: basisView.forward_axis_operators,
      inverse_axis_operators: basisView.inverse_axis_operators,
      residuals: basisView.residuals,
    },
    criteria,
    verifier_verdict: verifierVerdict,
    cognitive_outcome_status: verifierVerdict === 'pass' ? 'verified'
      : (verifierVerdict === 'fail' ? 'failed' : 'unverified'),
    protected_invariants: prepared.protected_invariants,
    non_claims: prepared.non_claims,
  };
  return { ...payload, artifact_hash: artifactHash(payload) };
}

module.exports = {
  MAX_BOUNDED_COUNT,
  OPERATIONAL_FEATURES,
  VERIFICATION_FEATURES,
  closeOperationalUnityTensor,
  closeTurnGovernanceTensor: closeOperationalUnityTensor,
  prepareOperationalUnityTensor,
  prepareTurnGovernanceTensor: prepareOperationalUnityTensor,
  verifyPreparedArtifact,
};
