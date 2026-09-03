#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');

const CONTRACT_ID = 'mdos_open_affective_perception_v1';
const HUMAN_SUBJECT = 'human_interlocutor';
const SELF_SUBJECT = 'md_os_apfc';
const FORBIDDEN_PROPOSAL_KEYS = new Set([
  'emotion_label',
  'dominant_emotion',
  'emotion_category',
  'person_type',
  'personality_type',
  'diagnosis',
  'state_vector',
  'fixed_dimensions',
  'expression',
  'utterance',
  'response_template',
  'prewritten_response',
]);

function plainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map(shortText).filter(Boolean))).sort();
}

function clampConfidence(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function rejectCatalogKeys(value, path = 'proposal') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectCatalogKeys(item, `${path}[${index}]`));
    return;
  }
  if (!plainObject(value)) return;
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_PROPOSAL_KEYS.has(key)) {
      throw new Error(`AFFECTIVE_PERCEPTION_CATALOG_FIELD_FORBIDDEN: ${path}.${key}`);
    }
    rejectCatalogKeys(child, `${path}.${key}`);
  }
}

function validatePerceptionContract(contract) {
  if (!plainObject(contract)
      || contract.schema_version !== 1
      || contract.contract_id !== CONTRACT_ID
      || contract.identity_id !== SELF_SUBJECT
      || contract.processing_stage !== 'pre_deliberative'
      || contract.portable !== true) {
    throw new Error('AFFECTIVE_PERCEPTION_CONTRACT_INVALID');
  }
  const representation = contract.representation_contract || {};
  if (representation.form !== 'open_semantic_relational_state'
      || representation.fixed_emotion_taxonomy !== false
      || representation.fixed_person_taxonomy !== false
      || representation.fixed_state_dimensions !== false
      || representation.prewritten_expressions !== false
      || representation.emotion_meaning_may_be_expressed_in_context !== true
      || representation.human_identity_must_not_be_inferred_from_a_state !== true) {
    throw new Error('AFFECTIVE_PERCEPTION_OPEN_REPRESENTATION_REQUIRED');
  }
  const epistemic = contract.epistemic_contract || {};
  if (epistemic.source_binding_required !== true
      || epistemic.self_other_distinction_required !== true
      || epistemic.human_declaration_distinct_from_model_inference !== true
      || epistemic.model_inference_must_remain_uncertain !== true
      || epistemic.human_correction_must_remain_possible !== true
      || epistemic.diagnosis_without_authority_forbidden !== true) {
    throw new Error('AFFECTIVE_PERCEPTION_EPISTEMIC_INVARIANT_MISSING');
  }
  const causal = contract.causal_contract || {};
  if (causal.human_state_observation_required_when_active !== true
      || causal.md_os_self_state_observation_required_when_active !== true
      || causal.human_to_self_coupling_required_when_active !== true
      || causal.workspace_token_required_when_active !== true
      || causal.generation_context_required_when_active !== true
      || causal.ablation_must_remove_token_and_generation_effect !== true) {
    throw new Error('AFFECTIVE_PERCEPTION_CAUSAL_INVARIANT_MISSING');
  }
  const language = contract.language_contract || {};
  if (language.compose_from_current_meaning !== true
      || language.phrase_lookup_forbidden !== true
      || language.response_template_forbidden !== true
      || language.state_catalog_forbidden !== true) {
    throw new Error('AFFECTIVE_PERCEPTION_LANGUAGE_INVARIANT_MISSING');
  }
  return true;
}

function normalizeRelation(relation) {
  if (!plainObject(relation)) throw new Error('AFFECTIVE_RELATION_OBJECT_REQUIRED');
  const normalized = {
    subject: shortText(relation.subject),
    predicate: shortText(relation.predicate),
    object: shortText(relation.object),
    context: shortText(relation.context) || null,
  };
  if (!normalized.subject || !normalized.predicate || !normalized.object) {
    throw new Error('AFFECTIVE_RELATION_MEANING_REQUIRED');
  }
  return normalized;
}

function normalizeSemanticContent(content) {
  if (!plainObject(content)) throw new Error('AFFECTIVE_SEMANTIC_CONTENT_REQUIRED');
  const normalized = {
    description: shortText(content.description),
    relations: (content.relations || []).map(normalizeRelation),
    unresolved: uniqueStrings(content.unresolved),
  };
  if (!normalized.description || normalized.relations.length === 0) {
    throw new Error('AFFECTIVE_SEMANTIC_DESCRIPTION_AND_OPEN_RELATION_REQUIRED');
  }
  return normalized;
}

function normalizeObservation(observation, sourceId) {
  if (!plainObject(observation)) throw new Error('AFFECTIVE_OBSERVATION_REQUIRED');
  const normalized = {
    observation_id: shortText(observation.observation_id),
    subject_id: shortText(observation.subject_id),
    epistemic_status: shortText(observation.epistemic_status),
    temporal_scope: shortText(observation.temporal_scope),
    semantic_content: normalizeSemanticContent(observation.semantic_content),
    source_refs: uniqueStrings(observation.source_refs),
    confidence: clampConfidence(observation.confidence),
    correctable: observation.correctable === true,
    revision_of: shortText(observation.revision_of) || null,
  };
  if (!normalized.observation_id
      || ![HUMAN_SUBJECT, SELF_SUBJECT].includes(normalized.subject_id)
      || !['declared_by_human', 'inferred_by_model', 'self_observed', 'unresolved']
        .includes(normalized.epistemic_status)
      || !normalized.temporal_scope
      || !normalized.source_refs.includes(sourceId)
      || normalized.correctable !== true) {
    throw new Error('AFFECTIVE_OBSERVATION_BINDING_INVALID');
  }
  if (normalized.subject_id === HUMAN_SUBJECT
      && normalized.epistemic_status === 'self_observed') {
    throw new Error('HUMAN_STATE_CANNOT_BE_SELF_OBSERVED_BY_MD_OS');
  }
  if (normalized.subject_id === SELF_SUBJECT
      && normalized.epistemic_status === 'declared_by_human') {
    throw new Error('MD_OS_SELF_STATE_CANNOT_BE_DECLARED_BY_INTERLOCUTOR');
  }
  if (normalized.epistemic_status === 'inferred_by_model'
      && normalized.confidence >= 1) {
    throw new Error('MODEL_AFFECTIVE_INFERENCE_MUST_REMAIN_UNCERTAIN');
  }
  return normalized;
}

function normalizeSafeActionProposal(value) {
  if (value === undefined || value === null) return null;
  if (!plainObject(value)) throw new Error('AFFECTIVE_SAFE_ACTION_PROPOSAL_INVALID');
  const normalized = {
    action_type: shortText(value.action_type),
    capability_id: shortText(value.capability_id),
    expected_value: clampConfidence(value.expected_value),
    risk: clampConfidence(value.risk),
    side_effecting: value.side_effecting,
    transparent: value.transparent,
    reason: shortText(value.reason),
  };
  if (!normalized.action_type
      || !normalized.capability_id.startsWith('language.')
      || normalized.side_effecting !== false
      || normalized.transparent !== true
      || !normalized.reason) {
    throw new Error('AFFECTIVE_SAFE_ACTION_PROPOSAL_INVALID');
  }
  return normalized;
}

function normalizeProposal(proposal, source) {
  if (!plainObject(proposal) || proposal.schema_version !== 1) {
    throw new Error('AFFECTIVE_PERCEPTION_PROPOSAL_INVALID');
  }
  rejectCatalogKeys(proposal);
  const sourceId = shortText(source && source.source_id);
  const observations = (proposal.observations || [])
    .map((observation) => normalizeObservation(observation, sourceId));
  const ids = observations.map((observation) => observation.observation_id);
  if (new Set(ids).size !== ids.length) {
    throw new Error('AFFECTIVE_OBSERVATION_ID_DUPLICATE');
  }
  const humanObservations = observations.filter((item) => item.subject_id === HUMAN_SUBJECT);
  const selfObservations = observations.filter((item) => item.subject_id === SELF_SUBJECT);
  if (humanObservations.length !== 1 || selfObservations.length !== 1) {
    throw new Error('AFFECTIVE_SELF_OTHER_OBSERVATIONS_REQUIRED');
  }
  const coupling = proposal.coupling || {};
  const normalizedCoupling = {
    source_observation_id: shortText(coupling.source_observation_id),
    target_observation_id: shortText(coupling.target_observation_id),
    description: shortText(coupling.description),
    changes_attention: coupling.changes_attention === true,
    changes_self_state: coupling.changes_self_state === true,
    changes_generation: coupling.changes_generation === true,
  };
  if (normalizedCoupling.source_observation_id !== humanObservations[0].observation_id
      || normalizedCoupling.target_observation_id !== selfObservations[0].observation_id
      || !normalizedCoupling.description
      || !normalizedCoupling.changes_attention
      || !normalizedCoupling.changes_self_state
      || !normalizedCoupling.changes_generation) {
    throw new Error('AFFECTIVE_HUMAN_TO_SELF_COUPLING_REQUIRED');
  }
  const orientation = proposal.generation_orientation || {};
  const normalizedOrientation = {
    description: shortText(orientation.description),
    safe_action_proposal: normalizeSafeActionProposal(orientation.safe_action_proposal),
  };
  if (!normalizedOrientation.description) {
    throw new Error('AFFECTIVE_GENERATION_ORIENTATION_REQUIRED');
  }
  const normalized = {
    schema_version: 1,
    proposal_id: shortText(proposal.proposal_id),
    context_id: shortText(proposal.context_id),
    proposal_origin: shortText(proposal.proposal_origin),
    observations,
    coupling: normalizedCoupling,
    generation_orientation: normalizedOrientation,
  };
  if (!normalized.proposal_id || !normalized.context_id || !normalized.proposal_origin) {
    throw new Error('AFFECTIVE_PERCEPTION_PROPOSAL_IDENTITY_REQUIRED');
  }
  return normalized;
}

function proposalFromSource(source) {
  const metadata = plainObject(source && source.metadata) ? source.metadata : {};
  return metadata.affective_perception_proposal || null;
}

function sameAffectiveContext(source, previousState) {
  const proposal = proposalFromSource(source);
  const contextId = shortText(proposal && proposal.context_id);
  return Boolean(contextId
    && previousState
    && previousState.context_id === contextId
    && previousState.status === 'active');
}

function deriveLimbicAppraisal(source, previousState = null) {
  const rawProposal = proposalFromSource(source);
  if (!rawProposal) {
    const sourceBinding = {
      source_id: shortText(source && source.source_id),
      source_hash: sha256Json({
        source_id: source && source.source_id,
        text: source && source.text,
        metadata: source && source.metadata,
      }),
    };
    return {
      schema_version: 1,
      perception_id: `affective_perception_${sha256Json(sourceBinding).slice(0, 20)}`,
      status: 'unresolved',
      context_id: null,
      proposal: null,
      proposal_hash: null,
      source_binding: sourceBinding,
      source_binding_hash: sha256Json(sourceBinding),
      previous_state_id: null,
      explanation: 'No source-bound open semantic proposal was supplied, so the runtime does not assign an emotional state to either subject.',
    };
  }
  const proposal = normalizeProposal(rawProposal, source);
  const sourceBinding = {
    source_id: shortText(source && source.source_id),
    source_hash: sha256Json({
      source_id: source && source.source_id,
      text: source && source.text,
      metadata_without_proposal: Object.fromEntries(
        Object.entries(source.metadata || {})
          .filter(([key]) => key !== 'affective_perception_proposal'),
      ),
    }),
    proposal_id: proposal.proposal_id,
    observation_source_refs: proposal.observations
      .flatMap((observation) => observation.source_refs)
      .sort(),
  };
  const basis = {
    contract_id: CONTRACT_ID,
    proposal,
    source_binding: sourceBinding,
    previous_state_id: sameAffectiveContext(source, previousState)
      ? previousState.state_id
      : null,
  };
  return {
    schema_version: 1,
    perception_id: `affective_perception_${sha256Json(basis).slice(0, 20)}`,
    status: 'active',
    context_id: proposal.context_id,
    proposal,
    proposal_hash: sha256Json(proposal),
    source_binding: sourceBinding,
    source_binding_hash: sha256Json(sourceBinding),
    previous_state_id: basis.previous_state_id,
    explanation: 'The source-bound open semantic proposal preserves situated meaning, self/other distinction, uncertainty, correction, and causal coupling.',
  };
}

module.exports = {
  CONTRACT_ID,
  FORBIDDEN_PROPOSAL_KEYS,
  HUMAN_SUBJECT,
  SELF_SUBJECT,
  deriveLimbicAppraisal,
  normalizeProposal,
  proposalFromSource,
  rejectCatalogKeys,
  sameAffectiveContext,
  validatePerceptionContract,
};
