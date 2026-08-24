#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  authorizeCausalUnityAction,
  closeCausalUnityTransition,
  prepareCausalUnityState,
  probeCausalUnityDependency,
  verifyCausalAuthorization,
  verifyCausalUnityState,
  verifyCausalUnityTransition,
} = require('../md-os/kernel/cognition/apfc_causal_unity');
const { sha256Json } = require('../md-os/kernel/cognition/general_program_synthesis');
const { buildActionGate } = require('../md-os/apfc/action/action_gate');

const hash = (value) => sha256Json({ value });

function stateInput(overrides = {}) {
  return {
    schema_version: 1,
    frame_id: 'apfc_turn_0123456789abcdef0123',
    input_hash: hash('intent'),
    authority_hash: hash('authority'),
    identity_hash: hash('identity'),
    world_observation_hash: hash('world'),
    world_observation_count: 1,
    world_observation_verifier_backed: false,
    intent_hash: hash('intent'),
    intent_count: 1,
    goal_hash: hash('goal'),
    goal_count: 1,
    memory_hash: hash('memory'),
    memory_count: 2,
    frame_hash: hash('frame'),
    prediction_contract_hash: hash('prediction'),
    prediction_count: 2,
    action_policy_hash: hash('policy'),
    decision_basis_hash: hash('decision-basis'),
    previous_transition_hash: null,
    ...overrides,
  };
}

function authorization(state, overrides = {}) {
  return authorizeCausalUnityAction({
    schema_version: 1,
    state,
    frame_id: state.frame_id,
    action_id: 'action_write_patch',
    action_kind: 'workspace_write',
    action_hash: hash('write patch'),
    consumed_state_hash: state.state_hash,
    policy_authorized: true,
    within_authority: true,
    external_write: false,
    side_effecting: true,
    ...overrides,
  });
}

test('causal Unity state binds differentiated inputs before a decision', () => {
  const state = prepareCausalUnityState(stateInput());
  assert.equal(state.status, 'ready');
  assert.equal(state.artifact_role, 'causal_unity_decision_state');
  assert.equal(state.phase, 'predecision');
  assert.deepEqual(state.source_tensor.length, 9);
  assert.ok(state.source_tensor.every((row) => row.length === 6));
  assert.equal(state.channels.intent.reference_hash, state.input_hash);
  assert.equal(state.decision_contract.state_hash_required_for_authorization, true);
  assert.equal(state.decision_contract.fail_closed_on_missing_or_tampered_state, true);
  assert.ok(Object.values(state.criteria).every(Boolean));
  assert.equal(verifyCausalUnityState(state), true);
});

test('action authorization consumes the intact predecision state and fails closed on severing', () => {
  const state = prepareCausalUnityState(stateInput());
  const receipt = authorization(state);
  assert.equal(receipt.status, 'authorized');
  assert.equal(receipt.consumed_state_hash, state.state_hash);
  assert.equal(verifyCausalAuthorization(receipt, state), true);

  const tampered = structuredClone(state);
  tampered.channels.intent.activation = 0;
  const rejected = authorization(tampered, { consumed_state_hash: state.state_hash });
  assert.equal(rejected.status, 'inhibited');
  assert.equal(rejected.criteria.predecision_state_valid, false);

  const probe = probeCausalUnityDependency({ schema_version: 1, state });
  assert.equal(probe.status, 'verified');
  assert.equal(probe.criteria.intact_state_authorizes, true);
  assert.equal(probe.criteria.severed_state_is_inhibited, true);
  assert.equal(probe.scope, 'controller_causal_dependency_only');
});

test('causal transition closes only when every mutating action was preauthorized', () => {
  const state = prepareCausalUnityState(stateInput());
  const receipt = authorization(state);
  const common = {
    schema_version: 1,
    state,
    frame_id: state.frame_id,
    input_hash: state.input_hash,
    output_hash: hash('output'),
    action_manifest_hash: hash('actions'),
    evidence_manifest_hash: hash('evidence'),
    verifier_verdict: 'pass',
    epistemic_verification: null,
  };
  const observed = [{
    action_id: receipt.action_id,
    action_kind: receipt.action_kind,
    action_hash: receipt.action_hash,
    side_effecting: true,
    status: 'completed',
    exit_code: 0,
    output_hash: hash('action output'),
  }];
  const closed = closeCausalUnityTransition({
    ...common,
    authorizations: [receipt],
    observed_actions: observed,
  });
  assert.equal(closed.status, 'closed');
  assert.equal(closed.epistemic_status, 'unverified');
  assert.equal(closed.criteria.all_mutating_actions_pre_authorized, true);
  assert.equal(verifyCausalUnityTransition(closed), true);

  const bypass = closeCausalUnityTransition({
    ...common,
    authorizations: [],
    observed_actions: observed,
  });
  assert.equal(bypass.status, 'incomplete');
  assert.equal(bypass.criteria.all_mutating_actions_pre_authorized, false);
  assert.equal(verifyCausalUnityTransition(bypass), true);
});

test('carry-forward binds the previous transition without promoting phenomenality', () => {
  const first = prepareCausalUnityState(stateInput());
  const transition = closeCausalUnityTransition({
    schema_version: 1,
    state: first,
    frame_id: first.frame_id,
    input_hash: first.input_hash,
    output_hash: hash('first-output'),
    action_manifest_hash: hash('no-actions'),
    evidence_manifest_hash: hash('no-evidence'),
    verifier_verdict: 'unknown',
    authorizations: [],
    observed_actions: [],
    epistemic_verification: null,
  });
  const second = prepareCausalUnityState(stateInput({
    frame_id: 'apfc_turn_abcdef0123456789abcd',
    input_hash: hash('second-intent'),
    intent_hash: hash('second-intent'),
    frame_hash: hash('second-frame'),
    previous_transition_hash: transition.transition_hash,
  }));
  assert.equal(second.previous_transition_hash, transition.transition_hash);
  assert.notEqual(second.state_hash, first.state_hash);
  assert.ok(second.non_claims.includes('not evidence of phenomenal consciousness'));
});

test('action gate consumes causal Unity and fails closed when the state is severed or mismatched', () => {
  const frame = {
    frame_id: 'frame_gate_test',
    workspace: { active_concepts: [] },
    experience_tokens: [],
  };
  const provisional = buildActionGate(frame);
  const state = prepareCausalUnityState(stateInput({
    frame_id: frame.frame_id,
    decision_basis_hash: provisional.causal_consumption.decision_basis_hash,
  }));
  const gated = buildActionGate(frame, {
    causal_unity_state: state,
    require_causal_unity: true,
  });
  assert.equal(gated.causal_consumption.required, true);
  assert.equal(gated.causal_consumption.state_valid, true);
  assert.equal(gated.causal_consumption.authorization.status, 'authorized');
  assert.equal(gated.causal_consumption.consumed_state_hash, state.state_hash);

  const severed = structuredClone(state);
  severed.source_tensor[0][0] = 0;
  assert.throws(() => buildActionGate(frame, {
    causal_unity_state: severed,
    require_causal_unity: true,
  }), /APFC_ACTION_GATE_CAUSAL_UNITY_STATE_REQUIRED/);

  const mismatched = prepareCausalUnityState(stateInput({
    frame_id: frame.frame_id,
    decision_basis_hash: hash('different-decision-basis'),
  }));
  assert.throws(() => buildActionGate(frame, {
    causal_unity_state: mismatched,
    require_causal_unity: true,
  }), /APFC_ACTION_GATE_DECISION_BASIS_MISMATCH/);
});

test('all causal Unity runtime artifact classes have closed schemas', () => {
  for (const name of [
    'apfc_causal_unity_state.schema.json',
    'apfc_causal_action_authorization.schema.json',
    'apfc_causal_unity_transition.schema.json',
    'apfc_causal_dependency_probe.schema.json',
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../md-os/schemas', name), 'utf8'));
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
    assert.ok(schema.required.length > 0);
  }
});
