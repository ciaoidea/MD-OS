#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  evaluateHumanVoice,
  expectedGenerationContextHash,
} = require('../md-os/apfc/affect/human_voice_gate');
const {
  appraisePreDeliberativeAffect,
} = require('../md-os/apfc/affect/predeliberative_affect');
const { encodeTextSource } = require('../md-os/apfc/encoders/text_encoder');

const REPO_ROOT = path.resolve(__dirname, '..');
const CONTRACT = JSON.parse(fs.readFileSync(
  path.join(REPO_ROOT, 'md-os/apfc/affect/affective_perception_contract.json'),
  'utf8',
));
const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(REPO_ROOT, 'md-os/examples/apfc/open_affective_perception.json'),
  'utf8',
));

function activeState() {
  const encoded = encodeTextSource(FIXTURE);
  const frame = {
    schema_version: 1,
    frame_id: 'voice_gate_frame',
    created_at: FIXTURE.observed_at,
    sources: [{ source_id: FIXTURE.source_id }],
    experience_tokens: encoded.tokens,
    affective_state: null,
    workspace: { active_tokens: [], active_concepts: [] },
  };
  return appraisePreDeliberativeAffect({
    frame,
    source: FIXTURE,
    perceptionContract: CONTRACT,
  }).affective_state;
}

test('the voice gate verifies causal context use without storing a phrase catalog', () => {
  const state = activeState();
  const contextHash = expectedGenerationContextHash(state);
  assert.equal(contextHash, state.language_generation_context.context_hash);

  const missing = evaluateHumanVoice('A response composed without the bound state.', {
    affective_state: state,
  });
  assert.equal(missing.status, 'rejected');
  assert.ok(missing.failures.includes('active_state_context_not_consumed'));

  const grounded = evaluateHumanVoice('This response was composed for the current situation.', {
    affective_state: state,
    generation_context_hash: contextHash,
  });
  assert.equal(grounded.status, 'accepted');

  const prewritten = evaluateHumanVoice('A stored response.', {
    affective_state: state,
    generation_context_hash: contextHash,
    prewritten_source: true,
  });
  assert.equal(prewritten.status, 'rejected');
});

test('the implementation contains no lexical emotion detector or response templates', () => {
  const appraisal = fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/apfc/affect/limbic_appraisal.js'),
    'utf8',
  );
  const voice = fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/apfc/affect/human_voice_gate.js'),
    'utf8',
  );
  assert.equal(appraisal.includes('containsAny('), false);
  assert.equal(appraisal.includes('CANNED_EMPATHY_PATTERNS'), false);
  assert.equal(voice.includes('CANNED_EMPATHY_PATTERNS'), false);
  assert.equal(CONTRACT.language_contract.phrase_lookup_forbidden, true);
  assert.equal(CONTRACT.language_contract.response_template_forbidden, true);
});
