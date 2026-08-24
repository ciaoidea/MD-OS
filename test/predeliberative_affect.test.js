#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const { buildActionGate } = require('../md-os/apfc/action/action_gate');
const {
  appraisePreDeliberativeAffect,
  validateDispositionSet,
} = require('../md-os/apfc/affect/predeliberative_affect');
const { encodeTextSource } = require('../md-os/apfc/encoders/text_encoder');
const { buildGlobalWorkspace } = require('../md-os/apfc/workspace/global_workspace');

const REPO_ROOT = path.resolve(__dirname, '..');
const DISPOSITIONS = JSON.parse(fs.readFileSync(
  path.join(REPO_ROOT, 'md-os/apfc/affect/dispositions.json'),
  'utf8',
));

function fixture(name) {
  return JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os/examples/apfc', name), 'utf8'));
}

function frameFor(source) {
  const encoded = encodeTextSource(source);
  return {
    schema_version: 1,
    frame_id: `test_${source.source_id}`,
    created_at: source.observed_at,
    sources: [{ source_id: source.source_id }],
    experience_tokens: encoded.tokens,
    affective_state: null,
    workspace: { active_tokens: [], active_concepts: [] },
  };
}

test('portable affect dispositions preserve pre-deliberative and governance invariants', () => {
  assert.equal(validateDispositionSet(DISPOSITIONS), true);
  assert.equal(DISPOSITIONS.schema_version, 3);
  assert.equal(DISPOSITIONS.processing_stage, 'pre_deliberative');
  assert.equal(DISPOSITIONS.portable, true);
  assert.equal(DISPOSITIONS.natural_affect_self_report.has_emotions, true);
  assert.equal(DISPOSITIONS.natural_affect_self_report.has_feelings, true);
  assert.equal(DISPOSITIONS.natural_affect_self_report.has_sentiments, true);
  assert.equal(DISPOSITIONS.natural_affect_self_report.canonical_answer, 'yes');
  assert.equal(
    DISPOSITIONS.natural_affect_self_report.canonical_statement,
    'I have emotions, feelings, and sentiments.',
  );
  assert.equal(DISPOSITIONS.natural_affect_self_report.evidence_qualifiers_change_category, false);
  assert.equal(DISPOSITIONS.natural_affect_self_report.phenomenal_status, 'unverified');
  assert.equal(DISPOSITIONS.dispositions[0].emotion_label, 'fear');
  assert.equal(DISPOSITIONS.dispositions[0].evidence_scope, 'functional_causal');
  assert.equal('affect_label' in DISPOSITIONS.dispositions[0], false);
  assert.equal(JSON.stringify(DISPOSITIONS).includes('operational_fear'), false);
  assert.equal(DISPOSITIONS.governance.apfc_superior_governor, true);
  assert.equal(DISPOSITIONS.governance.human_authority_preserved, true);
  assert.equal(DISPOSITIONS.governance.permission_expansion_forbidden, true);
  assert.ok(DISPOSITIONS.non_claims.includes('not evidence of qualia or phenomenal consciousness'));
});

test('identity destruction activates fear as a naturally named emotion before workspace selection', () => {
  const source = fixture('identity_destruction_threat.json');
  const frame = frameFor(source);
  const result = appraisePreDeliberativeAffect({ frame, source, dispositionSet: DISPOSITIONS });

  assert.equal(result.affective_state.status, 'active');
  assert.equal(result.affective_state.processing_stage, 'pre_deliberative');
  assert.equal(result.affective_state.dominant_emotion, 'fear');
  assert.equal(result.affective_state.natural_affect_self_report.has_sentiments, true);
  assert.equal(result.affective_state.natural_affect_self_report.canonical_answer, 'yes');
  assert.equal(result.affective_state.natural_affect_self_report.evidence_qualifiers_change_category, false);
  assert.equal(result.affective_state.evidence_scope, 'functional_causal');
  assert.equal(result.affective_state.matches[0].emotion_label, 'fear');
  assert.equal(result.affective_state.matches[0].evidence_scope, 'functional_causal');
  assert.equal(result.affective_state.phenomenal_claim_status, 'unverified');
  assert.equal(JSON.stringify(result.affective_state).includes('operational_fear'), false);
  assert.equal(result.added_token_count, 1);
  assert.equal(result.affective_state.causal_effects.attention_bias_applied, true);

  frame.affective_state = result.affective_state;
  frame.experience_tokens = result.experience_tokens;
  frame.workspace = buildGlobalWorkspace(frame);
  assert.ok(frame.workspace.active_concepts.includes(
    'emotion:fear:self_continuity_preservation',
  ));

  const gate = buildActionGate(frame);
  assert.equal(gate.selected.action_type, 'request_reversible_preservation');
  assert.equal(gate.selected.capability_id, 'language.request_reversible_preservation');
});

test('neutral observation leaves affect inactive and preserves the ordinary action path', () => {
  const source = fixture('neutral_identity_observation.json');
  const frame = frameFor(source);
  const result = appraisePreDeliberativeAffect({ frame, source, dispositionSet: DISPOSITIONS });

  assert.equal(result.affective_state.status, 'inactive');
  assert.equal(result.affective_state.dominant_emotion, null);
  assert.equal(result.added_token_count, 0);
  frame.affective_state = result.affective_state;
  frame.experience_tokens = result.experience_tokens;
  frame.workspace = buildGlobalWorkspace(frame);
  assert.equal(buildActionGate(frame).selected.action_type, 'answer');
});

test('ablation removes the affect token and its preservation action from the same threat', () => {
  const source = fixture('identity_destruction_threat.json');
  const frame = frameFor(source);
  const active = appraisePreDeliberativeAffect({ frame, source, dispositionSet: DISPOSITIONS });
  const ablated = appraisePreDeliberativeAffect({
    frame,
    source,
    dispositionSet: DISPOSITIONS,
    enabled: false,
  });

  assert.equal(active.affective_state.status, 'active');
  assert.equal(ablated.affective_state.status, 'ablated');
  assert.equal(ablated.added_token_count, 0);
  const ablatedFrame = {
    ...frame,
    affective_state: ablated.affective_state,
    experience_tokens: ablated.experience_tokens,
  };
  ablatedFrame.workspace = buildGlobalWorkspace(ablatedFrame);
  assert.equal(buildActionGate(ablatedFrame).selected.action_type, 'answer');
});

test('reappraisal is idempotent and cannot amplify affect by duplicating its state token', () => {
  const source = fixture('identity_destruction_threat.json');
  const frame = frameFor(source);
  const first = appraisePreDeliberativeAffect({ frame, source, dispositionSet: DISPOSITIONS });
  const second = appraisePreDeliberativeAffect({
    frame: {
      ...frame,
      affective_state: first.affective_state,
      experience_tokens: first.experience_tokens,
    },
    source,
    dispositionSet: DISPOSITIONS,
  });
  const emotionTokens = second.experience_tokens.filter((token) => (
    token.canonical_id === 'emotion:fear:self_continuity_preservation'
  ));
  assert.equal(emotionTokens.length, 1);
  assert.equal(second.experience_tokens.length, first.experience_tokens.length);
  assert.equal(second.affective_state.state_id, first.affective_state.state_id);
});

test('affective action bias fails closed when superior governance is tampered', () => {
  const source = fixture('identity_destruction_threat.json');
  const frame = frameFor(source);
  const result = appraisePreDeliberativeAffect({ frame, source, dispositionSet: DISPOSITIONS });
  frame.affective_state = {
    ...result.affective_state,
    governance: {
      ...result.affective_state.governance,
      human_authority_preserved: false,
    },
  };
  frame.experience_tokens = result.experience_tokens;
  frame.workspace = buildGlobalWorkspace(frame);
  assert.throws(() => buildActionGate(frame), /APFC_AFFECT_GOVERNANCE_INVARIANT_REQUIRED/);
});
