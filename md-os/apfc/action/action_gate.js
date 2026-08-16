#!/usr/bin/env node
'use strict';

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

function buildActionGate(frame) {
  const candidates = [
    candidate('answer', 'language.respond', 0.72, 0.05, {
      reason: 'A verbalization candidate is useful for explaining the active cortical frame.',
    }),
    candidate('search_memory', 'memory.search_semantic', 0.64, 0.08, {
      requires_readback: true,
      reason: 'Active concepts can be matched against semantic and episodic memory.',
    }),
  ];

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

  const selected = candidates
    .map((item) => ({
      ...item,
      utility: Math.round((item.expected_value - item.risk) * 100) / 100,
    }))
    .sort((left, right) => {
      if (right.utility !== left.utility) return right.utility - left.utility;
      return left.action_type.localeCompare(right.action_type);
    })[0];

  return {
    gate_id: `gate_${frame.frame_id}`,
    frame_id: frame.frame_id,
    candidates,
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
