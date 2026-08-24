#!/usr/bin/env node
'use strict';

const { sha256Json } = require('./general_program_synthesis');
const {
  closeTurnGovernanceTensor,
  prepareTurnGovernanceTensor,
} = require('./apfc_operational_unity_tensor');

function bounded(value) {
  return Math.min(32, Math.max(0, Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0));
}

function channel(count, authorityDeclared = false, verifierBacked = false) {
  const normalized = bounded(count);
  return {
    count: normalized,
    present: normalized > 0,
    authority_declared: authorityDeclared && normalized > 0,
    verifier_backed: verifierBacked && normalized > 0,
  };
}

function buildCognitiveFrameGovernanceTensor(frame) {
  const inputHash = sha256Json({
    frame_id: frame.frame_id,
    sources: frame.sources,
    experience_token_ids: (frame.experience_tokens || []).map((token) => token.token_id),
  });
  const intentCount = (frame.experience_tokens || []).filter((token) => (
    token.token_type === 'intent' || String(token.canonical_id || '').startsWith('intent:')
  )).length;
  const authorityHash = sha256Json({ scope: 'md-os/apfc/cognitive', frame_id: frame.frame_id });
  const transformationCount = frame.concept_dynamics && Number.isInteger(frame.concept_dynamics.transition_count)
    ? frame.concept_dynamics.transition_count
    : 0;
  const actionCount = frame.selected_action ? 1 : 0;
  const prepared = prepareTurnGovernanceTensor({
    schema_version: 1,
    frame_id: frame.frame_id,
    input_hash: inputHash,
    authority_hash: authorityHash,
    channels: {
      operational_self_refs: channel(1, true, true),
      world_observation_refs: channel((frame.experience_tokens || []).length, true, false),
      goal_refs: channel(intentCount, true, false),
      memory_refs: channel((frame.memory_candidates || []).length, false, false),
      frame_refs: channel(1, true, true),
      transformation_refs: channel(transformationCount, true, false),
      action_refs: channel(actionCount, true, false),
      evidence_refs: channel(0, false, false),
    },
  });
  return closeTurnGovernanceTensor({
    schema_version: 1,
    frame_id: frame.frame_id,
    input_hash: inputHash,
    authority_hash: authorityHash,
    output_hash: sha256Json({ selected_action: frame.selected_action, predictions: frame.predictions }),
    action_manifest_hash: sha256Json(frame.selected_action ? [frame.selected_action] : []),
    evidence_manifest_hash: sha256Json([]),
    prepared,
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'unknown',
    channels: {
      transformation_refs: channel(transformationCount, true, false),
      action_refs: channel(actionCount, true, false),
      evidence_refs: channel(0, false, false),
    },
  });
}

module.exports = {
  buildCognitiveFrameGovernanceTensor,
  buildCognitiveFrameUnityTensor: buildCognitiveFrameGovernanceTensor,
};
