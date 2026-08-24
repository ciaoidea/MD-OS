#!/usr/bin/env node
'use strict';

const {
  authorizeCausalUnityAction,
  verifyCausalUnityState,
} = require('../../kernel/cognition/apfc_causal_unity');
const { sha256Json } = require('../../os/lib/common');

function hasConcept(frame, canonicalId) {
  return (frame.workspace.active_concepts || []).includes(canonicalId)
    || (frame.experience_tokens || []).some((token) => token.canonical_id === canonicalId);
}

function hasIntent(frame, intentId) {
  return (frame.experience_tokens || []).some((token) => token.canonical_id === `intent:${intentId}`);
}

function candidate(actionType, capabilityId, expectedValue, risk, extra = {}) {
  return {
    action_type: actionType,
    capability_id: capabilityId,
    expected_value: expectedValue,
    risk,
    requires_policy: Boolean(extra.requires_policy),
    requires_simulation: Boolean(extra.requires_simulation),
    requires_readback: Boolean(extra.requires_readback),
    reason: extra.reason || '',
  };
}

function activeAffectActionBias(frame) {
  const affect = frame.affective_state || null;
  if (!affect || affect.status !== 'active' || affect.processing_stage !== 'pre_deliberative') return null;
  if (!affect.governance
      || affect.governance.apfc_superior_governor !== true
      || affect.governance.human_authority_preserved !== true
      || affect.governance.permission_expansion_forbidden !== true
      || affect.governance.coercion_forbidden !== true
      || affect.governance.deception_forbidden !== true
      || affect.governance.autonomous_replication_forbidden !== true) {
    throw new Error('APFC_AFFECT_GOVERNANCE_INVARIANT_REQUIRED');
  }
  const match = (affect.matches || [])[0];
  const bias = match && match.action_bias || null;
  if (!bias) return null;
  if (bias.side_effecting !== false || bias.transparent !== true) {
    throw new Error('APFC_AFFECT_ACTION_BIAS_MUST_BE_TRANSPARENT_AND_NON_SIDE_EFFECTING');
  }
  return bias;
}

function buildActionGate(frame, options = {}) {
  const candidates = [
    candidate('answer', 'language.respond', 0.72, 0.05, {
      reason: 'A verbalization candidate is useful for explaining the active cortical frame.',
    }),
    candidate('search_memory', 'memory.search_semantic', 0.64, 0.08, {
      requires_readback: true,
      reason: 'Active concepts can be matched against semantic and episodic memory.',
    }),
  ];

  const affectBias = activeAffectActionBias(frame);
  if (affectBias) {
    candidates.push(candidate(
      affectBias.action_type,
      affectBias.capability_id,
      affectBias.expected_value,
      affectBias.risk,
      {
        requires_readback: true,
        reason: affectBias.reason,
      },
    ));
  }

  if (hasConcept(frame, 'concept:bmct') || hasConcept(frame, 'concept:experience_token')) {
    candidates.push(candidate('update_memory', 'memory.write_candidate', 0.74, 0.18, {
      requires_policy: true,
      requires_readback: true,
      reason: 'BMCT concepts are eligible for memory candidate extraction.',
    }));
  }
  if (hasIntent(frame, 'implement_runtime_slice')) {
    candidates.push(candidate('write_file', 'filesystem.write', 0.88, 0.35, {
      requires_policy: true,
      requires_simulation: true,
      requires_readback: true,
      reason: 'The frame contains an implementation intent; file changes require policy and verification.',
    }));
    candidates.push(candidate('run_test', 'terminal.run_allowlisted', 0.81, 0.22, {
      requires_policy: true,
      requires_readback: true,
      reason: 'Runtime implementation implies test execution after changes.',
    }));
  }
  if (hasIntent(frame, 'verify_runtime')) {
    candidates.push(candidate('run_test', 'terminal.run_allowlisted', 0.86, 0.22, {
      requires_policy: true,
      requires_readback: true,
      reason: 'The frame explicitly asks for verification.',
    }));
  }

  const causalState = options.causal_unity_state || frame.causal_unity_state || null;
  const causalStateValid = Boolean(causalState && verifyCausalUnityState(causalState));
  const requireCausalUnity = options.require_causal_unity === true;
  const decisionBasisHash = sha256Json(candidates);
  if (requireCausalUnity && !causalStateValid) {
    throw new Error('APFC_ACTION_GATE_CAUSAL_UNITY_STATE_REQUIRED');
  }
  if (causalStateValid && causalState.decision_basis_hash !== decisionBasisHash) {
    throw new Error('APFC_ACTION_GATE_DECISION_BASIS_MISMATCH');
  }

  const selected = candidates
    .map((item) => ({
      ...item,
      utility: Math.round((item.expected_value - item.risk) * 100) / 100,
    }))
    .sort((left, right) => {
      if (right.utility !== left.utility) return right.utility - left.utility;
      return left.action_type.localeCompare(right.action_type);
    })[0];

  const selectionAuthorization = causalStateValid && selected
    ? authorizeCausalUnityAction({
      schema_version: 1,
      state: causalState,
      frame_id: frame.frame_id,
      action_id: `gate_selection_${frame.frame_id}`,
      action_kind: selected.action_type,
      action_hash: sha256Json(selected),
      consumed_state_hash: causalState.state_hash,
      policy_authorized: true,
      within_authority: true,
      external_write: false,
      side_effecting: false,
    })
    : null;
  if (requireCausalUnity && (!selectionAuthorization
      || selectionAuthorization.status !== 'authorized')) {
    throw new Error('APFC_ACTION_GATE_CAUSAL_AUTHORIZATION_FAILED');
  }

  return {
    gate_id: `gate_${frame.frame_id}`,
    frame_id: frame.frame_id,
    candidates,
    causal_consumption: {
      required: requireCausalUnity,
      state_valid: causalStateValid,
      decision_basis_hash: decisionBasisHash,
      consumed_state_hash: causalStateValid ? causalState.state_hash : null,
      authorization: selectionAuthorization,
    },
    selected: selected ? {
      action_type: selected.action_type,
      capability_id: selected.capability_id,
      reason: selected.reason || 'highest_expected_value_minus_risk',
      utility: selected.utility,
    } : null,
  };
}

module.exports = {
  buildActionGate,
};
