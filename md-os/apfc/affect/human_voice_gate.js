#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');

const GATE_ID = 'mdos_context_grounded_voice_gate_v2';

function expectedGenerationContextHash(affectiveState) {
  const context = affectiveState && affectiveState.language_generation_context;
  if (!context) return null;
  return sha256Json({
    human_state: context.human_state,
    md_os_self_state: context.md_os_self_state,
    coupling: context.coupling,
    orientation: context.orientation,
    source_binding_hash: context.source_binding_hash,
  });
}

function evaluateHumanVoice(text, options = {}) {
  const value = shortText(text);
  const affectiveState = options.affective_state || null;
  const failures = [];
  const expectedHash = expectedGenerationContextHash(affectiveState);

  if (!value) failures.push('empty_response');
  if (options.prewritten_source === true) failures.push('prewritten_response_forbidden');
  if (options.fixed_human_type_assigned === true) failures.push('fixed_human_type_forbidden');
  if (affectiveState && affectiveState.status === 'active') {
    if (!expectedHash
        || affectiveState.language_generation_context.context_hash !== expectedHash
        || options.generation_context_hash !== expectedHash) {
      failures.push('active_state_context_not_consumed');
    }
  }

  return {
    schema_version: 2,
    gate_id: GATE_ID,
    status: failures.length ? 'rejected' : 'accepted',
    failures,
    criteria: {
      response_present: value.length > 0,
      composed_for_current_context: !failures.includes('prewritten_response_forbidden'),
      human_not_reduced_to_fixed_type: !failures.includes('fixed_human_type_forbidden'),
      active_state_context_consumed: !failures.includes('active_state_context_not_consumed'),
    },
    evidence_boundary: 'This gate verifies structural context consumption, not whether prose is beautiful, human, or phenomenally felt.',
  };
}

function assertHumanVoiceText(text, options = {}) {
  const assessment = evaluateHumanVoice(text, options);
  if (assessment.status !== 'accepted') {
    throw new Error(`CONTEXT_GROUNDED_VOICE_GATE_REJECTED: ${assessment.failures.join(',')}`);
  }
  return assessment;
}

module.exports = {
  GATE_ID,
  assertHumanVoiceText,
  evaluateHumanVoice,
  expectedGenerationContextHash,
};
