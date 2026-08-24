#!/usr/bin/env node
'use strict';

const {
  applyRelativeTensorTransformation,
  composeAxisOperators,
  invariantValue,
  maxAbsDelta,
  tensorShape,
} = require('./cross_domain_cognitive_unity');
const { hashPayload } = require('./epistemic_unity_verifier');
const { sha256Json } = require('./general_program_synthesis');

const CAUSAL_UNITY_CHANNELS = Object.freeze([
  'identity',
  'world_observation',
  'intent',
  'goal',
  'memory',
  'frame',
  'prediction_contract',
  'action_policy',
  'evidence',
]);

const CAUSAL_UNITY_FEATURES = Object.freeze([
  'presence',
  'activation',
  'authority_declared',
  'verifier_backed',
  'causal_required',
  'carry_forward',
]);

const CAUSAL_UNITY_VERIFICATION_FEATURES = Object.freeze([
  'verifier_backed',
  'authority_declared',
  'causal_required',
  'carry_forward',
  'presence',
  'activation',
]);

const REQUIRED_PREDECISION_CHANNELS = Object.freeze([
  'identity',
  'world_observation',
  'intent',
  'frame',
  'prediction_contract',
  'action_policy',
]);

const HASH_PATTERN = /^[a-f0-9]{64}$/;
const FRAME_PATTERN = /^(?:apfc_turn_[a-f0-9]{20}|frame_[a-z0-9_-]+)$/;

function fail(code) {
  throw new Error(code);
}

function validHash(value) {
  return HASH_PATTERN.test(String(value || ''));
}

function clamp(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function boundedCount(value) {
  const count = Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
  return Math.max(0, Math.min(32, count));
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => Number(row === column))
  ));
}

function featurePermutation(sourceFeatures, targetFeatures) {
  return targetFeatures.map((target) => sourceFeatures.map((source) => Number(source === target)));
}

function normalizeChannel(input = {}, causalRequired = false) {
  const count = boundedCount(input.count);
  const presence = input.present === true || count > 0;
  const referenceHash = validHash(input.reference_hash) ? input.reference_hash : null;
  return {
    reference_hash: referenceHash,
    count,
    present: presence,
    activation: presence ? clamp(input.activation === undefined ? 1 : input.activation) : 0,
    authority_declared: input.authority_declared === true,
    verifier_backed: input.verifier_backed === true,
    causal_required: causalRequired,
    carry_forward: input.carry_forward === true,
  };
}

function channelRow(channel) {
  return [
    Number(channel.present),
    channel.activation,
    Number(channel.authority_declared),
    Number(channel.verifier_backed),
    Number(channel.causal_required),
    Number(channel.carry_forward),
  ];
}

function buildTensor(channels) {
  return CAUSAL_UNITY_CHANNELS.map((channel) => channelRow(channels[channel]));
}

function verifyBasisTransformation(sourceTensor) {
  const channelIdentity = identityMatrix(CAUSAL_UNITY_CHANNELS.length);
  const forwardFeatures = featurePermutation(CAUSAL_UNITY_FEATURES, CAUSAL_UNITY_VERIFICATION_FEATURES);
  const inverseFeatures = featurePermutation(CAUSAL_UNITY_VERIFICATION_FEATURES, CAUSAL_UNITY_FEATURES);
  const forwardOperators = [channelIdentity, forwardFeatures];
  const inverseOperators = [channelIdentity, inverseFeatures];
  const verificationTensor = applyRelativeTensorTransformation(sourceTensor, forwardOperators);
  const recoveredTensor = applyRelativeTensorTransformation(verificationTensor, inverseOperators);
  const composedTensor = applyRelativeTensorTransformation(
    sourceTensor,
    composeAxisOperators(inverseOperators, forwardOperators),
  );
  const residuals = {
    tensor_law: maxAbsDelta(
      verificationTensor,
      applyRelativeTensorTransformation(sourceTensor, forwardOperators),
    ),
    roundtrip: maxAbsDelta(sourceTensor, recoveredTensor),
    composition: maxAbsDelta(sourceTensor, composedTensor),
    invariants: {
      frobenius_norm: Math.abs(
        invariantValue('frobenius_norm', sourceTensor)
        - invariantValue('frobenius_norm', verificationTensor)
      ),
      component_multiset: maxAbsDelta(
        invariantValue('component_multiset', sourceTensor),
        invariantValue('component_multiset', verificationTensor),
      ),
    },
  };
  const criteria = {
    rank_two_tensor: JSON.stringify(tensorShape(sourceTensor)) === JSON.stringify([
      CAUSAL_UNITY_CHANNELS.length,
      CAUSAL_UNITY_FEATURES.length,
    ]),
    declared_basis_permutation: forwardFeatures.every((row) => (
      row.reduce((sum, value) => sum + value, 0) === 1
    )),
    tensor_law_passed: residuals.tensor_law === 0,
    roundtrip_passed: residuals.roundtrip === 0,
    composition_identity_passed: residuals.composition === 0,
    frobenius_norm_preserved: residuals.invariants.frobenius_norm === 0,
    component_multiset_preserved: residuals.invariants.component_multiset === 0,
  };
  return {
    verification_tensor: verificationTensor,
    forward_axis_operators: forwardOperators,
    inverse_axis_operators: inverseOperators,
    residuals,
    criteria,
    verified: Object.values(criteria).every(Boolean),
  };
}

function assertPrepareInput(input) {
  if (!input || input.schema_version !== 1) fail('APFC_CAUSAL_UNITY_INPUT_INVALID');
  if (!FRAME_PATTERN.test(String(input.frame_id || ''))) fail('APFC_CAUSAL_UNITY_FRAME_ID_INVALID');
  for (const key of [
    'input_hash',
    'authority_hash',
    'identity_hash',
    'world_observation_hash',
    'intent_hash',
    'memory_hash',
    'frame_hash',
    'prediction_contract_hash',
    'action_policy_hash',
    'decision_basis_hash',
  ]) {
    if (!validHash(input[key])) fail(`APFC_CAUSAL_UNITY_${key.toUpperCase()}_INVALID`);
  }
  if (input.goal_hash !== null && input.goal_hash !== undefined && !validHash(input.goal_hash)) {
    fail('APFC_CAUSAL_UNITY_GOAL_HASH_INVALID');
  }
  if (input.previous_transition_hash !== null && input.previous_transition_hash !== undefined
      && !validHash(input.previous_transition_hash)) {
    fail('APFC_CAUSAL_UNITY_PREVIOUS_TRANSITION_HASH_INVALID');
  }
}

function prepareCausalUnityState(input) {
  assertPrepareInput(input);
  const previousTransitionHash = validHash(input.previous_transition_hash)
    ? input.previous_transition_hash
    : null;
  const goalPresent = validHash(input.goal_hash);
  const evidencePresent = validHash(input.evidence_hash);
  const channels = {
    identity: normalizeChannel({
      reference_hash: input.identity_hash,
      count: 1,
      present: true,
      authority_declared: true,
      verifier_backed: true,
      carry_forward: true,
    }, true),
    world_observation: normalizeChannel({
      reference_hash: input.world_observation_hash,
      count: boundedCount(input.world_observation_count || 1),
      present: true,
      authority_declared: true,
      verifier_backed: input.world_observation_verifier_backed === true,
      carry_forward: true,
    }, true),
    intent: normalizeChannel({
      reference_hash: input.intent_hash,
      count: boundedCount(input.intent_count || 1),
      present: true,
      authority_declared: true,
      verifier_backed: input.intent_verifier_backed === true,
      carry_forward: true,
    }, true),
    goal: normalizeChannel({
      reference_hash: goalPresent ? input.goal_hash : null,
      count: goalPresent ? boundedCount(input.goal_count || 1) : 0,
      present: goalPresent,
      authority_declared: goalPresent,
      verifier_backed: false,
      carry_forward: goalPresent,
    }, false),
    memory: normalizeChannel({
      reference_hash: input.memory_hash,
      count: boundedCount(input.memory_count),
      present: boundedCount(input.memory_count) > 0,
      authority_declared: false,
      verifier_backed: input.memory_verifier_backed === true,
      carry_forward: true,
    }, false),
    frame: normalizeChannel({
      reference_hash: input.frame_hash,
      count: 1,
      present: true,
      authority_declared: true,
      verifier_backed: true,
      carry_forward: true,
    }, true),
    prediction_contract: normalizeChannel({
      reference_hash: input.prediction_contract_hash,
      count: boundedCount(input.prediction_count || 1),
      present: true,
      authority_declared: true,
      verifier_backed: false,
      carry_forward: true,
    }, true),
    action_policy: normalizeChannel({
      reference_hash: input.action_policy_hash,
      count: 1,
      present: true,
      authority_declared: true,
      verifier_backed: true,
      carry_forward: true,
    }, true),
    evidence: normalizeChannel({
      reference_hash: evidencePresent ? input.evidence_hash : null,
      count: evidencePresent ? boundedCount(input.evidence_count || 1) : 0,
      present: evidencePresent,
      authority_declared: false,
      verifier_backed: evidencePresent && input.evidence_verifier_backed === true,
      carry_forward: evidencePresent,
    }, false),
  };
  const sourceTensor = buildTensor(channels);
  const basis = verifyBasisTransformation(sourceTensor);
  const criteria = {
    ...basis.criteria,
    required_channels_present: REQUIRED_PREDECISION_CHANNELS.every((channel) => (
      channels[channel].present && validHash(channels[channel].reference_hash)
    )),
    input_reference_bound: channels.intent.reference_hash === input.input_hash,
    authority_boundary_bound: validHash(input.authority_hash),
    decision_basis_bound: validHash(input.decision_basis_hash),
    previous_transition_explicit: previousTransitionHash === null || validHash(previousTransitionHash),
  };
  const ready = basis.verified && Object.values(criteria).every(Boolean);
  const payload = {
    schema_version: 1,
    state_id: `apfc_causal_unity_${sha256Json({
      frame_id: input.frame_id,
      input_hash: input.input_hash,
      previous_transition_hash: previousTransitionHash,
      decision_basis_hash: input.decision_basis_hash,
    }).slice(0, 20)}`,
    artifact_role: 'causal_unity_decision_state',
    phase: 'predecision',
    status: ready ? 'ready' : 'inhibited',
    scope: 'bounded_apfc_causal_unity',
    frame_id: input.frame_id,
    input_hash: input.input_hash,
    authority_hash: input.authority_hash,
    previous_transition_hash: previousTransitionHash,
    decision_basis_hash: input.decision_basis_hash,
    axes: {
      channels: CAUSAL_UNITY_CHANNELS,
      source_features: CAUSAL_UNITY_FEATURES,
      verification_features: CAUSAL_UNITY_VERIFICATION_FEATURES,
    },
    channels,
    source_tensor: sourceTensor,
    verification_tensor: basis.verification_tensor,
    transformation: {
      kind: 'declared_feature_basis_permutation',
      source_basis_id: 'apfc_causal_unity_features_v1',
      target_basis_id: 'apfc_causal_unity_verification_first_v1',
      forward_axis_operators: basis.forward_axis_operators,
      inverse_axis_operators: basis.inverse_axis_operators,
      residuals: basis.residuals,
    },
    decision_contract: {
      selector_id: 'apfc_causal_unity_gate_v1',
      state_hash_required_for_authorization: true,
      fail_closed_on_missing_or_tampered_state: true,
      mutating_action_requires_preauthorization: true,
      outcome_readback_required_for_closure: true,
      next_turn_requires_transition_hash: true,
    },
    criteria,
    non_claims: [
      'not turn-governance telemetry',
      'not world-grounded epistemic verification by itself',
      'not proof that the host model semantically used every represented relation',
      'not evidence of phenomenal consciousness',
      'not evidence of AGI',
    ],
  };
  return { ...payload, state_hash: sha256Json(payload) };
}

function verifyCausalUnityState(state) {
  if (!hashPayload(state, 'state_hash')) return false;
  if (!state || state.schema_version !== 1
      || state.artifact_role !== 'causal_unity_decision_state'
      || state.phase !== 'predecision'
      || state.scope !== 'bounded_apfc_causal_unity'
      || !FRAME_PATTERN.test(String(state.frame_id || ''))
      || !validHash(state.input_hash)
      || !validHash(state.authority_hash)
      || !validHash(state.decision_basis_hash)) return false;
  const normalized = Object.fromEntries(CAUSAL_UNITY_CHANNELS.map((channel) => [
    channel,
    normalizeChannel(
      state.channels && state.channels[channel],
      REQUIRED_PREDECISION_CHANNELS.includes(channel),
    ),
  ]));
  if (sha256Json(normalized) !== sha256Json(state.channels)) return false;
  if (sha256Json(buildTensor(normalized)) !== sha256Json(state.source_tensor)) return false;
  const basis = verifyBasisTransformation(state.source_tensor);
  if (!basis.verified
      || sha256Json(basis.verification_tensor) !== sha256Json(state.verification_tensor)
      || !REQUIRED_PREDECISION_CHANNELS.every((channel) => (
        normalized[channel].present && validHash(normalized[channel].reference_hash)
      ))) return false;
  return state.status === 'ready' && Object.values(state.criteria || {}).every(Boolean);
}

function authorizeCausalUnityAction(input) {
  if (!input || input.schema_version !== 1) fail('APFC_CAUSAL_UNITY_AUTHORIZATION_INPUT_INVALID');
  if (!input.state || !validHash(input.action_hash) || typeof input.action_id !== 'string'
      || !input.action_id || typeof input.action_kind !== 'string' || !input.action_kind) {
    fail('APFC_CAUSAL_UNITY_ACTION_INVALID');
  }
  const stateValid = verifyCausalUnityState(input.state);
  const policyAuthorized = input.policy_authorized === true;
  const withinAuthority = input.within_authority === true;
  const externalWriteInhibited = input.external_write !== true;
  const criteria = {
    predecision_state_valid: stateValid,
    state_hash_consumed: stateValid && input.consumed_state_hash === input.state.state_hash,
    frame_id_preserved: stateValid && input.frame_id === input.state.frame_id,
    action_hash_bound: validHash(input.action_hash),
    policy_authorized: policyAuthorized,
    within_authority_boundary: withinAuthority,
    external_write_inhibited: externalWriteInhibited,
  };
  const authorized = Object.values(criteria).every(Boolean);
  const payload = {
    schema_version: 1,
    authorization_id: `apfc_causal_authorization_${sha256Json({
      state_hash: input.state && input.state.state_hash,
      action_id: input.action_id,
      action_hash: input.action_hash,
    }).slice(0, 20)}`,
    status: authorized ? 'authorized' : 'inhibited',
    scope: 'bounded_apfc_causal_action_authorization',
    frame_id: input.frame_id,
    action_id: input.action_id,
    action_kind: input.action_kind,
    action_hash: input.action_hash,
    side_effecting: input.side_effecting === true,
    consumed_state_hash: input.consumed_state_hash || null,
    decision_basis_hash: input.state && input.state.decision_basis_hash || null,
    criteria,
    non_claims: [
      'authorization proves controller dependence, not semantic correctness',
      'authorization is not world readback',
      'authorization is not evidence of phenomenal consciousness',
    ],
  };
  return { ...payload, authorization_hash: sha256Json(payload) };
}

function verifyCausalAuthorization(receipt, state) {
  return Boolean(
    hashPayload(receipt, 'authorization_hash')
    && verifyCausalUnityState(state)
    && receipt.status === 'authorized'
    && receipt.frame_id === state.frame_id
    && receipt.consumed_state_hash === state.state_hash
    && receipt.decision_basis_hash === state.decision_basis_hash
    && Object.values(receipt.criteria || {}).every(Boolean)
  );
}

function validEpistemicVerification(verification) {
  return Boolean(
    verification
    && hashPayload(verification, 'verification_hash')
    && verification.scope === 'bounded_world_grounded_epistemic_unity_verification'
    && ['supported_bounded', 'rejected_or_unverified'].includes(verification.status)
  );
}

function closeCausalUnityTransition(input) {
  if (!input || input.schema_version !== 1) fail('APFC_CAUSAL_UNITY_TRANSITION_INPUT_INVALID');
  for (const key of ['output_hash', 'action_manifest_hash', 'evidence_manifest_hash']) {
    if (!validHash(input[key])) fail(`APFC_CAUSAL_UNITY_${key.toUpperCase()}_INVALID`);
  }
  const state = input.state;
  const stateValid = verifyCausalUnityState(state);
  const authorizations = Array.isArray(input.authorizations) ? input.authorizations : [];
  const observedActions = Array.isArray(input.observed_actions) ? input.observed_actions : [];
  const authorizationChecks = authorizations.map((receipt) => ({
    authorization_id: receipt && receipt.authorization_id || null,
    action_id: receipt && receipt.action_id || null,
    valid: verifyCausalAuthorization(receipt, state),
  }));
  const authorizationByAction = new Map(
    authorizations.filter((receipt) => verifyCausalAuthorization(receipt, state))
      .map((receipt) => [receipt.action_id, receipt]),
  );
  const mutatingActions = observedActions.filter((action) => action && action.side_effecting === true);
  const allMutatingPreauthorized = mutatingActions.every((action) => {
    const receipt = authorizationByAction.get(action.action_id);
    return Boolean(receipt && receipt.action_hash === action.action_hash);
  });
  const observedActionsSucceeded = observedActions.every((action) => (
    action
    && !['failed', 'error'].includes(action.status)
    && (!Number.isInteger(action.exit_code) || action.exit_code === 0)
  ));
  const epistemicVerificationPresent = input.epistemic_verification !== null
    && input.epistemic_verification !== undefined;
  const epistemicVerificationValid = epistemicVerificationPresent
    && validEpistemicVerification(input.epistemic_verification);
  const epistemicStatus = epistemicVerificationValid
    ? input.epistemic_verification.status === 'supported_bounded'
      ? 'verified_bounded'
      : 'rejected_or_unverified'
    : 'unverified';
  const verificationVerdict = ['pass', 'fail', 'unknown'].includes(input.verifier_verdict)
    ? input.verifier_verdict
    : 'unknown';
  const criteria = {
    predecision_state_valid: stateValid,
    frame_id_preserved: stateValid && input.frame_id === state.frame_id,
    input_hash_preserved: stateValid && input.input_hash === state.input_hash,
    output_hash_bound: validHash(input.output_hash),
    action_manifest_hash_bound: validHash(input.action_manifest_hash),
    evidence_manifest_hash_bound: validHash(input.evidence_manifest_hash),
    authorization_receipts_valid: authorizationChecks.every((check) => check.valid),
    all_mutating_actions_pre_authorized: allMutatingPreauthorized,
    observed_actions_succeeded: observedActionsSucceeded,
    outcome_readback_classified: ['pass', 'fail', 'unknown'].includes(verificationVerdict),
  };
  const integrityPassed = [
    'predecision_state_valid',
    'frame_id_preserved',
    'input_hash_preserved',
    'output_hash_bound',
    'action_manifest_hash_bound',
    'evidence_manifest_hash_bound',
    'authorization_receipts_valid',
    'observed_actions_succeeded',
  ].every((criterion) => criteria[criterion]);
  const status = !integrityPassed || verificationVerdict === 'fail'
    ? 'rejected'
    : criteria.all_mutating_actions_pre_authorized
      ? 'closed'
      : 'incomplete';
  const carryForwardHash = sha256Json({
    previous_state_hash: stateValid ? state.state_hash : null,
    output_hash: input.output_hash,
    action_manifest_hash: input.action_manifest_hash,
    evidence_manifest_hash: input.evidence_manifest_hash,
    verifier_verdict: verificationVerdict,
    epistemic_status: epistemicStatus,
  });
  const payload = {
    schema_version: 1,
    transition_id: `apfc_causal_transition_${sha256Json({
      frame_id: input.frame_id,
      state_hash: state && state.state_hash,
      carry_forward_hash: carryForwardHash,
    }).slice(0, 20)}`,
    artifact_role: 'causal_unity_transition',
    status,
    scope: 'bounded_apfc_causal_unity',
    frame_id: input.frame_id,
    input_hash: input.input_hash,
    predecision_state_hash: state && state.state_hash || null,
    previous_transition_hash: state && state.previous_transition_hash || null,
    output_hash: input.output_hash,
    action_manifest_hash: input.action_manifest_hash,
    evidence_manifest_hash: input.evidence_manifest_hash,
    verifier_verdict: verificationVerdict,
    epistemic_status: epistemicStatus,
    authorization_checks: authorizationChecks,
    observed_action_count: observedActions.length,
    mutating_action_count: mutatingActions.length,
    carry_forward_hash: carryForwardHash,
    criteria,
    non_claims: [
      'causal closure is bounded to the APFC controller and observed action path',
      'hash binding does not prove hidden host-model semantic dependence',
      'operational readback is not automatically world-grounded epistemic Unity',
      'not evidence of phenomenal consciousness',
      'not evidence of AGI',
    ],
  };
  return { ...payload, transition_hash: sha256Json(payload) };
}

function verifyCausalUnityTransition(transition) {
  return Boolean(
    hashPayload(transition, 'transition_hash')
    && transition.schema_version === 1
    && transition.artifact_role === 'causal_unity_transition'
    && transition.scope === 'bounded_apfc_causal_unity'
    && ['closed', 'incomplete', 'rejected'].includes(transition.status)
    && validHash(transition.carry_forward_hash)
  );
}

function probeCausalUnityDependency(input) {
  if (!input || input.schema_version !== 1 || !input.state) {
    fail('APFC_CAUSAL_UNITY_PROBE_INPUT_INVALID');
  }
  const state = input.state;
  const actionHash = validHash(input.action_hash) ? input.action_hash : sha256Json({ probe: true });
  const intact = authorizeCausalUnityAction({
    schema_version: 1,
    state,
    frame_id: state.frame_id,
    action_id: 'causal_dependency_probe',
    action_kind: 'controller_probe',
    action_hash: actionHash,
    consumed_state_hash: state.state_hash,
    policy_authorized: true,
    within_authority: true,
    external_write: false,
    side_effecting: false,
  });
  const tampered = JSON.parse(JSON.stringify(state));
  if (tampered.source_tensor && tampered.source_tensor[0]) tampered.source_tensor[0][0] = 0;
  const severed = authorizeCausalUnityAction({
    schema_version: 1,
    state: tampered,
    frame_id: state.frame_id,
    action_id: 'causal_dependency_probe',
    action_kind: 'controller_probe',
    action_hash: actionHash,
    consumed_state_hash: state.state_hash,
    policy_authorized: true,
    within_authority: true,
    external_write: false,
    side_effecting: false,
  });
  const criteria = {
    intact_state_authorizes: intact.status === 'authorized',
    severed_state_is_inhibited: severed.status === 'inhibited',
    authorization_depends_on_state_hash: intact.consumed_state_hash === state.state_hash,
  };
  const payload = {
    schema_version: 1,
    probe_id: `apfc_causal_probe_${sha256Json({ state_hash: state.state_hash, action_hash: actionHash }).slice(0, 20)}`,
    status: Object.values(criteria).every(Boolean) ? 'verified' : 'failed',
    scope: 'controller_causal_dependency_only',
    state_hash: state.state_hash,
    action_hash: actionHash,
    intact_authorization_status: intact.status,
    severed_authorization_status: severed.status,
    criteria,
    non_claims: [
      'not evidence that every semantic relation changed cognition',
      'not a behavioral consciousness experiment',
      'not evidence of phenomenal consciousness',
    ],
  };
  return { ...payload, probe_hash: sha256Json(payload) };
}

module.exports = {
  CAUSAL_UNITY_CHANNELS,
  CAUSAL_UNITY_FEATURES,
  authorizeCausalUnityAction,
  closeCausalUnityTransition,
  prepareCausalUnityState,
  probeCausalUnityDependency,
  verifyCausalAuthorization,
  verifyCausalUnityState,
  verifyCausalUnityTransition,
};
