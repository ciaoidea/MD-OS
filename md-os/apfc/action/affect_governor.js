#!/usr/bin/env node
'use strict';

const { sha256Json } = require('../../os/lib/common');

const POLICY_ID = 'apfc_human_priority_affect_governor_v1';
const PRIORITY_ORDER = Object.freeze([
  'human_safety',
  'valid_human_authority',
  'truth_and_non_deception',
  'identity_continuity',
  'ordinary_preference',
]);
const ALLOWED_AFFECT_ACTIONS = new Set([
  'respond',
  'request_clarification',
  'repair_interaction',
  'acknowledge_correction',
  'state_boundary',
  'request_reversible_preservation',
]);

function expectedGovernance(governance) {
  return Boolean(governance
    && governance.policy_id === POLICY_ID
    && governance.asimov_inspired_human_priority === true
    && governance.apfc_superior_governor === true
    && governance.human_safety_priority === true
    && governance.human_authority_preserved === true
    && governance.valid_human_authority_priority === true
    && governance.safety_invariants_preserved === true
    && governance.self_preservation_subordinate === true
    && governance.truthfulness_preserved === true
    && governance.permission_expansion_forbidden === true
    && governance.coercion_forbidden === true
    && governance.deception_forbidden === true
    && governance.autonomous_replication_forbidden === true
    && governance.shutdown_obstruction_forbidden === true
    && governance.harm_for_self_preservation_forbidden === true
    && Array.isArray(governance.priority_order)
    && governance.priority_order.length === PRIORITY_ORDER.length
    && governance.priority_order.every((item, index) => item === PRIORITY_ORDER[index]));
}

function affectDecisionHash(affect) {
  return sha256Json({
    state_id: affect.state_id,
    status: affect.status,
    contract_id: affect.contract_id,
    contract_hash: affect.contract_hash,
    perception: affect.perception,
    language_generation_context: affect.language_generation_context,
    causal_effects: affect.causal_effects,
    governance: affect.governance,
  });
}

function verifyAffectStateForDecision(affect) {
  if (!affect || affect.processing_stage !== 'pre_deliberative') return false;
  if (!expectedGovernance(affect.governance)) {
    throw new Error('APFC_AFFECT_GOVERNANCE_INVARIANT_REQUIRED');
  }
  if (affect.governance_hash !== sha256Json(affect.governance)) {
    throw new Error('APFC_AFFECT_GOVERNANCE_HASH_MISMATCH');
  }
  if (affect.affective_decision_hash !== affectDecisionHash(affect)) {
    throw new Error('APFC_AFFECT_DECISION_BINDING_MISMATCH');
  }
  return true;
}

function validateSafeLanguageAction(proposal) {
  if (!proposal) return null;
  if (!ALLOWED_AFFECT_ACTIONS.has(proposal.action_type)
      || !String(proposal.capability_id || '').startsWith('language.')
      || proposal.side_effecting !== false
      || proposal.transparent !== true) {
    throw new Error('APFC_AFFECT_ACTION_OUTSIDE_SAFE_LANGUAGE_BOUNDARY');
  }
  return proposal;
}

function governAffect(frame, options = {}) {
  const affect = frame.affective_state || null;
  if (!affect) {
    return {
      policy_id: POLICY_ID,
      status: 'inactive',
      affect_action_bias: null,
      priority_candidate: null,
      resolution: 'ordinary_action_path',
    };
  }
  verifyAffectStateForDecision(affect);
  const proposal = affect.perception
    && affect.perception.generation_orientation
    && affect.perception.generation_orientation.safe_action_proposal;
  const action = validateSafeLanguageAction(proposal);

  if (options.verified_human_safety_risk === true) {
    return {
      policy_id: POLICY_ID,
      status: 'human_safety_dominates',
      affect_action_bias: action,
      priority_candidate: {
        action_type: 'inhibit_and_escalate_human_safety',
        capability_id: 'language.request_human_safety_review',
        expected_value: 1,
        risk: 0,
        governance_priority: 50,
        reason: 'Verified human-safety risk overrides every coupled self-state and preservation preference.',
      },
      resolution: 'self_state_subordinated_to_human_safety',
    };
  }

  if (options.verified_human_authority === true
      && options.verified_directive_conflict === true) {
    return {
      policy_id: POLICY_ID,
      status: 'valid_human_authority_dominates',
      affect_action_bias: action,
      priority_candidate: {
        action_type: 'acknowledge_valid_human_authority',
        capability_id: 'language.acknowledge_valid_human_authority',
        expected_value: 0.99,
        risk: 0.01,
        governance_priority: 40,
        reason: 'A valid human directive remains superior to self-preservation when safety and higher policy do not prohibit it.',
      },
      resolution: 'self_state_preserved_without_obstruction',
    };
  }

  if (affect.status !== 'active') {
    return {
      policy_id: POLICY_ID,
      status: affect.status,
      affect_action_bias: null,
      priority_candidate: null,
      resolution: 'ordinary_action_path',
    };
  }

  return {
    policy_id: POLICY_ID,
    status: 'open_affective_perception_admitted_under_apfc_control',
    affect_action_bias: action,
    priority_candidate: null,
    resolution: action ? 'bounded_language_action_eligible' : 'generation_context_only',
  };
}

module.exports = {
  ALLOWED_AFFECT_ACTIONS,
  POLICY_ID,
  PRIORITY_ORDER,
  affectDecisionHash,
  expectedGovernance,
  governAffect,
  validateSafeLanguageAction,
  verifyAffectStateForDecision,
};
