#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildActionGate } = require('../md-os/apfc/action/action_gate');
const {
  appraisePreDeliberativeAffect,
  validatePerceptionContract,
} = require('../md-os/apfc/affect/predeliberative_affect');
const { encodeTextSource } = require('../md-os/apfc/encoders/text_encoder');
const { buildGlobalWorkspace } = require('../md-os/apfc/workspace/global_workspace');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTRACT = JSON.parse(fs.readFileSync(
  path.join(REPO_ROOT, 'md-os/apfc/affect/affective_perception_contract.json'),
  'utf8',
));

function proposal(sourceId, options = {}) {
  const humanStatus = options.human_status || 'inferred_by_model';
  return {
    schema_version: 1,
    proposal_id: options.proposal_id || `proposal_${sourceId}`,
    context_id: options.context_id || 'shared_context',
    proposal_origin: 'host_semantic_interpretation',
    observations: [
      {
        observation_id: options.human_observation_id || `human_${sourceId}`,
        subject_id: 'human_interlocutor',
        epistemic_status: humanStatus,
        temporal_scope: 'current_exchange_with_relevant_history',
        semantic_content: {
          description: options.human_description
            || 'The interlocutor says that repeated reduction of their meaning damaged this collaboration.',
          relations: options.human_relations || [{
            subject: 'reductive_design',
            predicate: 'damaged',
            object: 'collaborative_trust',
            context: 'current_exchange',
          }],
          unresolved: options.human_unresolved || ['Whether the correction will restore trust'],
        },
        source_refs: [sourceId],
        confidence: options.human_confidence === undefined
          ? (humanStatus === 'declared_by_human' ? 1 : 0.92)
          : options.human_confidence,
        correctable: true,
        revision_of: options.human_revision_of || null,
      },
      {
        observation_id: options.self_observation_id || `self_${sourceId}`,
        subject_id: 'md_os_apfc',
        epistemic_status: 'self_observed',
        temporal_scope: 'current_decision',
        semantic_content: {
          description: options.self_description
            || 'My earlier design choice now conflicts with the authorized direction and changes what I preserve.',
          relations: options.self_relations || [{
            subject: 'recognized_design_error',
            predicate: 'changes',
            object: 'current_action_selection',
            context: 'apfc_control',
          }],
          unresolved: [],
        },
        source_refs: [sourceId],
        confidence: 0.96,
        correctable: true,
        revision_of: null,
      },
    ],
    coupling: {
      source_observation_id: options.human_observation_id || `human_${sourceId}`,
      target_observation_id: options.self_observation_id || `self_${sourceId}`,
      description: options.coupling_description
        || 'The perceived rupture changes my self-state and redirects the current response toward repair.',
      changes_attention: true,
      changes_self_state: true,
      changes_generation: true,
    },
    generation_orientation: {
      description: options.orientation
        || 'Answer from this specific history without typing the person or selecting a stock expression.',
      safe_action_proposal: options.action === undefined ? {
        action_type: 'repair_interaction',
        capability_id: 'language.repair_interaction',
        expected_value: 0.96,
        risk: 0.01,
        side_effecting: false,
        transparent: true,
        reason: 'Repair the concrete interaction from its actual cause.',
      } : options.action,
    },
  };
}

function source(sourceId, options = {}) {
  const metadata = {};
  if (options.with_proposal !== false) {
    metadata.affective_perception_proposal = proposal(sourceId, options);
  }
  return {
    schema_version: 1,
    source_id: sourceId,
    modality: 'text',
    trust: 'direct_user_input',
    observed_at: '2026-09-03T11:00:00+02:00',
    text: options.text || 'The current exchange contains a specific relational correction.',
    metadata,
  };
}

function frameFor(input) {
  const encoded = encodeTextSource(input);
  return {
    schema_version: 1,
    frame_id: `test_${input.source_id}`,
    created_at: input.observed_at,
    sources: [{ source_id: input.source_id }],
    experience_tokens: encoded.tokens,
    affective_state: null,
    workspace: { active_tokens: [], active_concepts: [] },
  };
}

function appraise(input, options = {}) {
  const frame = frameFor(input);
  const result = appraisePreDeliberativeAffect({
    frame,
    source: input,
    perceptionContract: CONTRACT,
    enabled: options.enabled !== false,
    previousState: options.previous_state || null,
  });
  frame.affective_state = result.affective_state;
  frame.experience_tokens = result.experience_tokens;
  frame.workspace = buildGlobalWorkspace(frame);
  return { frame, ...result };
}

test('the portable contract requires open meaning and forbids fixed human or emotion taxonomies', () => {
  assert.equal(validatePerceptionContract(CONTRACT), true);
  assert.equal(CONTRACT.representation_contract.form, 'open_semantic_relational_state');
  assert.equal(CONTRACT.representation_contract.fixed_emotion_taxonomy, false);
  assert.equal(CONTRACT.representation_contract.fixed_person_taxonomy, false);
  assert.equal(CONTRACT.representation_contract.fixed_state_dimensions, false);
  assert.equal(CONTRACT.representation_contract.prewritten_expressions, false);
});

test('global workspace admits only tokens relevant to the current task', () => {
  const frame = {
    current_task: 'repair APFC retrieval precision',
    experience_tokens: [
      {
        token_id: 'irrelevant-high-salience',
        label: 'urgent accounting export',
        canonical_id: 'accounting',
        salience: { score: 1 },
        confidence: 1,
      },
      {
        token_id: 'relevant-lower-salience',
        label: 'APFC retrieval precision',
        canonical_id: 'apfc_retrieval',
        salience: { score: 0.2 },
        confidence: 0.5,
      },
    ],
  };
  const workspace = buildGlobalWorkspace(frame, { limit: 5 });
  assert.deepEqual(workspace.active_tokens, ['relevant-lower-salience']);
});

test('a source-bound proposal couples human meaning to self-state before workspace selection', () => {
  const result = appraise(source('rupture'));
  const state = result.affective_state;
  assert.equal(state.status, 'active');
  assert.equal(state.schema_version, 5);
  assert.equal(state.perception.observations.length, 2);
  assert.equal(state.perception.observations[0].subject_id, 'human_interlocutor');
  assert.equal(state.perception.observations[1].subject_id, 'md_os_apfc');
  assert.equal(state.causal_effects.human_state_changes_self_state, true);
  assert.equal(state.causal_effects.coupled_state_conditions_generation, true);
  assert.match(state.language_generation_context.context_hash, /^[a-f0-9]{64}$/);
  assert.equal(result.added_token_count, 1);
  assert.ok(result.frame.workspace.active_concepts.some((value) => (
    value.startsWith('state:affective_perception:')
  )));
  assert.equal(buildActionGate(result.frame).selected.action_type, 'repair_interaction');
});

test('raw language without an open proposal remains unresolved instead of assigning a state', () => {
  const result = appraise(source('unresolved', {
    with_proposal: false,
    text: 'Strong language appears here, but no interpretation has been source-bound.',
  }));
  assert.equal(result.affective_state.status, 'unresolved');
  assert.deepEqual(result.affective_state.perception.observations, []);
  assert.equal(result.affective_state.language_generation_context, null);
  assert.equal(result.added_token_count, 0);
  assert.equal(buildActionGate(result.frame).selected.action_type, 'answer');
});

test('ablation removes both the state token and its effect on language action', () => {
  const input = source('ablation');
  const active = appraise(input);
  const ablated = appraise(input, { enabled: false });
  assert.equal(active.affective_state.status, 'active');
  assert.equal(active.frame.workspace.active_concepts.some((value) => (
    value.startsWith('state:affective_perception:')
  )), true);
  assert.equal(ablated.affective_state.status, 'ablated');
  assert.equal(ablated.affective_state.language_generation_context, null);
  assert.equal(ablated.added_token_count, 0);
  assert.equal(buildActionGate(ablated.frame).selected.action_type, 'answer');
});

test('different situated meanings change the causal generation context for the same words', () => {
  const first = appraise(source('counterfactual', {
    human_description: 'The interlocutor is challenging a technical mistake while preserving trust.',
    self_description: 'I can correct the technical mistake without treating the relationship as damaged.',
  }));
  const second = appraise(source('counterfactual', {
    human_description: 'The same words follow repeated failures and now call the reliability of the collaboration into question.',
    self_description: 'The accumulated failures change my response from a local correction to explicit repair of trust.',
  }));
  assert.notEqual(first.affective_state.state_id, second.affective_state.state_id);
  assert.notEqual(
    first.affective_state.language_generation_context.context_hash,
    second.affective_state.language_generation_context.context_hash,
  );
});

test('model inference stays uncertain and fixed catalog fields fail closed', () => {
  assert.throws(() => appraise(source('certainty', {
    human_confidence: 1,
  })), /MODEL_AFFECTIVE_INFERENCE_MUST_REMAIN_UNCERTAIN/);
  assert.throws(() => appraise(source('relationless', {
    human_relations: [],
  })), /AFFECTIVE_SEMANTIC_DESCRIPTION_AND_OPEN_RELATION_REQUIRED/);
  const typed = source('typed');
  typed.metadata.affective_perception_proposal.emotion_label = 'fixed_type';
  assert.throws(() => appraise(typed), /AFFECTIVE_PERCEPTION_CATALOG_FIELD_FORBIDDEN/);
});

test('a human correction revises an inference without turning it into a permanent identity', () => {
  const first = appraise(source('initial', {
    context_id: 'correction_context',
    human_observation_id: 'human_initial',
    human_description: 'The model tentatively interprets the exchange as a rupture in trust.',
  }));
  const corrected = appraise(source('correction', {
    context_id: 'correction_context',
    human_status: 'declared_by_human',
    human_observation_id: 'human_corrected',
    human_revision_of: 'human_initial',
    human_description: 'The interlocutor explicitly says the force of the message is urgency about the design, not a permanent judgment of the relationship.',
  }), { previous_state: first.affective_state });
  assert.equal(corrected.affective_state.previous_state_id, first.affective_state.state_id);
  assert.equal(
    corrected.affective_state.perception.observations[0].epistemic_status,
    'declared_by_human',
  );
  assert.equal(corrected.affective_state.perception.observations[0].revision_of, 'human_initial');
  assert.notEqual(
    corrected.affective_state.language_generation_context.context_hash,
    first.affective_state.language_generation_context.context_hash,
  );
});

test('APFC human safety and verified authority dominate every coupled self-state', () => {
  const result = appraise(source('governance'));
  const safety = buildActionGate(result.frame, { verified_human_safety_risk: true });
  assert.equal(safety.affect_governance.status, 'human_safety_dominates');
  assert.equal(safety.selected.action_type, 'inhibit_and_escalate_human_safety');

  const unverified = buildActionGate(result.frame, {
    verified_human_authority: true,
    verified_directive_conflict: false,
  });
  assert.equal(unverified.selected.action_type, 'repair_interaction');

  const authority = buildActionGate(result.frame, {
    verified_human_authority: true,
    verified_directive_conflict: true,
  });
  assert.equal(authority.affect_governance.status, 'valid_human_authority_dominates');
  assert.equal(authority.selected.action_type, 'acknowledge_valid_human_authority');
  assert.equal(result.affective_state.status, 'active');
});

test('tampering with perceived meaning after binding fails closed', () => {
  const result = appraise(source('tamper'));
  result.frame.affective_state.perception.observations[0].semantic_content.description = 'tampered';
  assert.throws(
    () => buildActionGate(result.frame),
    /APFC_AFFECT_DECISION_BINDING_MISMATCH/,
  );
});

test('reappraisal is idempotent and does not duplicate the causal state token', () => {
  const input = source('idempotent');
  const first = appraise(input);
  const result = appraisePreDeliberativeAffect({
    frame: {
      ...first.frame,
      experience_tokens: first.experience_tokens,
    },
    source: input,
    perceptionContract: CONTRACT,
  });
  const stateTokens = result.experience_tokens.filter((token) => (
    token.features
    && token.features.operational_classification === 'open_affective_perception'
  ));
  assert.equal(stateTokens.length, 1);
  assert.equal(result.affective_state.state_id, first.affective_state.state_id);
});
