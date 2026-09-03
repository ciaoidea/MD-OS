#!/usr/bin/env node
'use strict';

const { sha256Json } = require('../../os/lib/common');
const { makeToken } = require('../encoders/text_encoder');
const { encodeConceptEmbedding } = require('../encoders/concept_encoder');
const {
  HUMAN_SUBJECT,
  SELF_SUBJECT,
  deriveLimbicAppraisal,
  validatePerceptionContract,
} = require('./limbic_appraisal');
const { affectDecisionHash, expectedGovernance } = require('../action/affect_governor');

function temporalState(token, length) {
  const index = Number(token.time && token.time.sequence_index || 0);
  return {
    schema_version: 1,
    observed_at: token.time && token.time.observed_at || null,
    sequence_index: index,
    normalized_position: Math.round((index / Math.max(1, length - 1)) * 1e6) / 1e6,
    recency: 1,
    phase: 'observed',
  };
}

function predictionTarget(nextToken) {
  if (!nextToken || !nextToken.concept_embedding) {
    return {
      schema_version: 1,
      target_type: 'terminal_sequence',
      horizon: 0,
      target_token_id: null,
      target_canonical_id: null,
      target_embedding: null,
      loss: 'none',
    };
  }
  return {
    schema_version: 1,
    target_type: 'next_concept_embedding',
    horizon: 1,
    target_token_id: nextToken.token_id,
    target_canonical_id: nextToken.canonical_id || null,
    target_embedding: nextToken.concept_embedding.values,
    loss: 'cosine_distance',
  };
}

function linkSequence(tokens) {
  const linked = tokens.map((token, index) => ({
    ...token,
    time: {
      ...(token.time || {}),
      sequence_index: index,
    },
  }));
  return linked.map((token, index) => ({
    ...token,
    temporal_state: temporalState(token, linked.length),
    prediction_target: predictionTarget(linked[index + 1]),
  }));
}

function semanticSubjects(proposal) {
  if (!proposal) return { human: null, self: null };
  return {
    human: proposal.observations.find((item) => item.subject_id === HUMAN_SUBJECT) || null,
    self: proposal.observations.find((item) => item.subject_id === SELF_SUBJECT) || null,
  };
}

function buildGenerationContext(perception) {
  if (!perception || perception.status !== 'active' || !perception.proposal) return null;
  const subjects = semanticSubjects(perception.proposal);
  const basis = {
    human_state: subjects.human,
    md_os_self_state: subjects.self,
    coupling: perception.proposal.coupling,
    orientation: perception.proposal.generation_orientation.description,
    source_binding_hash: perception.source_binding_hash,
  };
  return {
    ...basis,
    context_hash: sha256Json(basis),
    compose_for_current_turn: true,
    prewritten_material_present: false,
    fixed_human_type_present: false,
  };
}

function affectToken(frame, source, perception, generationContext) {
  const subjects = semanticSubjects(perception.proposal);
  const action = perception.proposal.generation_orientation.safe_action_proposal;
  const base = makeToken({
    source_id: source.source_id,
    modality: source.modality || 'text',
    observed_at: source.observed_at || frame.created_at,
  }, (frame.experience_tokens || []).length, 'state', 'source-bound affective meaning', {
    canonical_id: `state:affective_perception:${perception.perception_id}`,
    features: {
      operational_classification: 'open_affective_perception',
      processing_stage: 'pre_deliberative',
      perception_id: perception.perception_id,
      proposal_hash: perception.proposal_hash,
      source_binding_hash: perception.source_binding_hash,
      human_state_hash: sha256Json(subjects.human),
      md_os_self_state_hash: sha256Json(subjects.self),
      coupling_hash: sha256Json(perception.proposal.coupling),
      generation_context_hash: generationContext.context_hash,
      fixed_taxonomy_used: false,
      consciousness_contribution_status: 'participating',
    },
    relations: [
      { type: 'perceives_state_of', target: 'subject:human_interlocutor' },
      { type: 'changes_state_of', target: 'system:md_os_apfc' },
      { type: 'conditions', target: 'process:current_language_generation' },
    ],
    affordances: action ? [{
      action: action.action_type,
      risk: action.risk,
      requires: ['apfc_action_gate', 'source_binding', 'human_priority_governance'],
    }] : [],
    salience: {
      novelty: 0.82,
      urgency: 0.72,
      risk: 0.34,
      userRelevance: 1,
      operationalValue: 0.96,
      uncertainty: 0.42,
    },
    confidence: Math.min(subjects.human.confidence, subjects.self.confidence),
  });
  return {
    ...base,
    concept_embedding: encodeConceptEmbedding(base),
  };
}

function buildAffectState({
  frame,
  source,
  perceptionContract,
  enabled = true,
  previousState = null,
}) {
  validatePerceptionContract(perceptionContract);
  if (!expectedGovernance(perceptionContract.governance)) {
    throw new Error('AFFECTIVE_PERCEPTION_GOVERNANCE_INVARIANT_MISSING');
  }
  const contractHash = sha256Json(perceptionContract);
  const observed = deriveLimbicAppraisal(source, previousState);
  const status = enabled ? observed.status : 'ablated';
  const perception = {
    perception_id: observed.perception_id,
    status,
    proposal_id: status === 'active' ? observed.proposal.proposal_id : null,
    proposal_origin: status === 'active' ? observed.proposal.proposal_origin : null,
    proposal_hash: status === 'active' ? observed.proposal_hash : null,
    source_binding: observed.source_binding,
    source_binding_hash: observed.source_binding_hash,
    observations: status === 'active' ? observed.proposal.observations : [],
    coupling: status === 'active' ? observed.proposal.coupling : null,
    generation_orientation: status === 'active'
      ? observed.proposal.generation_orientation
      : null,
    explanation: enabled
      ? observed.explanation
      : 'Ablation removed the open semantic state before workspace selection.',
  };
  Object.defineProperty(perception, 'proposal', {
    value: status === 'active' ? observed.proposal : null,
    enumerable: false,
  });
  const generationContext = buildGenerationContext(
    status === 'active' ? { ...observed, status } : null,
  );
  const token = status === 'active'
    ? affectToken(frame, source, observed, generationContext)
    : null;
  const stateBasis = {
    frame_id: frame.frame_id,
    contract_hash: contractHash,
    status,
    perception,
    language_generation_context: generationContext,
    previous_state_id: observed.previous_state_id,
  };
  const state = {
    schema_version: 5,
    state_id: `affective_state_${sha256Json(stateBasis).slice(0, 20)}`,
    frame_id: frame.frame_id,
    created_at: source.observed_at || frame.created_at,
    context_id: status === 'active' ? observed.context_id : null,
    previous_state_id: status === 'active' ? observed.previous_state_id : null,
    processing_stage: 'pre_deliberative',
    operational_classification: 'open_affective_perception',
    status,
    contract_id: perceptionContract.contract_id,
    contract_hash: contractHash,
    portable_source: true,
    perception,
    language_generation_context: generationContext,
    causal_token_ids: token ? [token.token_id] : [],
    causal_effects: {
      human_state_changes_self_state: status === 'active',
      self_state_changes_attention: status === 'active',
      coupled_state_conditions_generation: status === 'active',
      workspace_token_created: Boolean(token),
    },
    governance: { ...perceptionContract.governance },
    governance_hash: sha256Json(perceptionContract.governance),
    evidence_scope: 'functional_causal',
    consciousness_contribution_status: status === 'active' ? 'participating' : 'inactive',
    non_claims: [...perceptionContract.non_claims],
  };
  state.affective_decision_hash = affectDecisionHash(state);
  return { state, token };
}

function appraisePreDeliberativeAffect({
  frame,
  source,
  perceptionContract,
  enabled = true,
  previousState = null,
}) {
  const baseTokens = (frame.experience_tokens || []).filter((token) => !(
    token.token_type === 'state'
    && token.features
    && token.features.operational_classification === 'open_affective_perception'
  ));
  const result = buildAffectState({
    frame: { ...frame, experience_tokens: baseTokens },
    source,
    perceptionContract,
    enabled,
    previousState,
  });
  return {
    affective_state: result.state,
    experience_tokens: linkSequence(
      result.token ? [...baseTokens, result.token] : baseTokens,
    ),
    added_token_count: result.token ? 1 : 0,
  };
}

module.exports = {
  appraisePreDeliberativeAffect,
  buildAffectState,
  buildGenerationContext,
  semanticSubjects,
  validatePerceptionContract,
};
