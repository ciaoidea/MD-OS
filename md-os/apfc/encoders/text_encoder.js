#!/usr/bin/env node
'use strict';

const { sha256Text, shortText } = require('../../os/lib/common');
const { enrichExperienceTokens } = require('./concept_encoder');

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return Math.round(number * 100) / 100;
}

function slug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

function tokenId(sourceId, tokenType, label) {
  return `xtok_${tokenType}_${slug(label)}_${sha256Text(`${sourceId}:${tokenType}:${label}`).slice(0, 10)}`;
}

function salience({ novelty = 0.5, urgency = 0.2, risk = 0.1, userRelevance = 0.7, operationalValue = 0.6, uncertainty = 0.25 } = {}) {
  const score = (
    novelty * 0.18
    + urgency * 0.14
    + risk * 0.12
    + userRelevance * 0.28
    + operationalValue * 0.22
    + uncertainty * 0.06
  );
  return {
    score: clamp01(score),
    novelty: clamp01(novelty),
    urgency: clamp01(urgency),
    risk: clamp01(risk),
    user_relevance: clamp01(userRelevance),
    operational_value: clamp01(operationalValue),
    uncertainty: clamp01(uncertainty),
  };
}

function makeToken(source, sequenceIndex, tokenType, label, options = {}) {
  return {
    schema_version: 1,
    token_id: tokenId(source.source_id, tokenType, label),
    token_type: tokenType,
    label,
    canonical_id: options.canonical_id || `${tokenType}:${slug(label)}`,
    modalities: [source.modality || 'text'],
    source_refs: [source.source_id],
    time: {
      observed_at: source.observed_at,
      sequence_index: sequenceIndex,
    },
    features: options.features || {},
    relations: options.relations || [],
    affordances: options.affordances || [],
    salience: salience(options.salience),
    confidence: clamp01(options.confidence === undefined ? 0.78 : options.confidence),
  };
}

function containsAny(lower, terms) {
  return terms.some((term) => lower.includes(term));
}

function conceptTokens(source, text, startIndex) {
  const lower = text.toLowerCase();
  const concepts = [
    {
      label: 'Bio-Multimodal Cortical Transformer',
      canonical_id: 'concept:bmct',
      terms: ['bio-multimodal', 'bmct', 'cortical transformer'],
      features: { kind: 'cognitive_runtime_layer', substrate: 'experience_token_graph' },
      salience: { novelty: 0.88, userRelevance: 0.96, operationalValue: 0.94, uncertainty: 0.22 },
      confidence: 0.93,
    },
    {
      label: 'experience token',
      canonical_id: 'concept:experience_token',
      terms: ['experience token', 'token esperienz'],
      features: { kind: 'multimodal_operational_unit' },
      salience: { novelty: 0.82, userRelevance: 0.92, operationalValue: 0.9, uncertainty: 0.2 },
      confidence: 0.91,
    },
    {
      label: 'binding graph',
      canonical_id: 'concept:binding_graph',
      terms: ['binding graph', 'grafo', 'event graph'],
      features: { kind: 'multimodal_relation_graph' },
      salience: { novelty: 0.74, userRelevance: 0.86, operationalValue: 0.87, uncertainty: 0.24 },
      confidence: 0.86,
    },
    {
      label: 'global workspace',
      canonical_id: 'concept:global_workspace',
      terms: ['global workspace', 'workspace attentivo', 'working set'],
      features: { kind: 'attention_limited_working_set' },
      salience: { novelty: 0.68, userRelevance: 0.78, operationalValue: 0.82, uncertainty: 0.24 },
      confidence: 0.82,
    },
    {
      label: 'action gate',
      canonical_id: 'concept:action_gate',
      terms: ['action gate', 'gate azione', 'basal'],
      features: { kind: 'action_selection_gate' },
      salience: { novelty: 0.7, userRelevance: 0.86, operationalValue: 0.88, uncertainty: 0.22 },
      confidence: 0.84,
    },
    {
      label: 'prediction loop',
      canonical_id: 'concept:prediction_loop',
      terms: ['prediction loop', 'predizione', 'error signal', 'errore'],
      features: { kind: 'predictive_error_correction' },
      salience: { novelty: 0.74, userRelevance: 0.8, operationalValue: 0.84, uncertainty: 0.3 },
      confidence: 0.82,
    },
    {
      label: 'MD-OS (Artificial Prefrontal Cortex)',
      canonical_id: 'system:md_os_apfc',
      terms: ['md-os apfc', 'artificial prefrontal cortex', 'md-os'],
      features: { kind: 'operating_filesystem_identity_context' },
      salience: { novelty: 0.42, userRelevance: 0.92, operationalValue: 0.88, uncertainty: 0.12 },
      confidence: 0.9,
    },
  ];

  const tokens = [];
  let index = startIndex;
  for (const concept of concepts) {
    if (!containsAny(lower, concept.terms)) continue;
    tokens.push(makeToken(source, index, 'entity', concept.label, {
      canonical_id: concept.canonical_id,
      features: concept.features,
      relations: [
        { type: 'part_of', target: 'system:md_os_apfc' },
      ],
      affordances: [
        { action: 'describe', risk: 0.03, requires: ['verbalization_context'] },
        { action: 'implement_runtime_slice', risk: 0.34, requires: ['explicit_user_intent', 'schema_contract', 'tests'] },
      ],
      salience: concept.salience,
      confidence: concept.confidence,
    }));
    index += 1;
  }
  return tokens;
}

function intentTokens(source, text, startIndex) {
  const lower = text.toLowerCase();
  const intents = [];
  if (containsAny(lower, ['architettura', 'architecture', 'struttura', 'roadmap', 'design'])) {
    intents.push({
      label: 'design_architecture',
      features: { operation: 'architect', domain: 'md-os', target: 'apfc_cognitive_runtime' },
      salience: { novelty: 0.72, userRelevance: 0.9, operationalValue: 0.86, uncertainty: 0.2 },
      confidence: 0.86,
    });
  }
  if (containsAny(lower, ['implement', 'aggiungere', 'scrivere', 'prima cosa', 'patch', 'runtime', 'schema'])) {
    intents.push({
      label: 'implement_runtime_slice',
      features: { operation: 'implement', domain: 'md-os', target: 'bmct_skeleton' },
      salience: { novelty: 0.7, urgency: 0.42, risk: 0.28, userRelevance: 0.96, operationalValue: 0.93, uncertainty: 0.26 },
      confidence: 0.84,
    });
  }
  if (containsAny(lower, ['test', 'eval', 'verifica', 'roundtrip'])) {
    intents.push({
      label: 'verify_runtime',
      features: { operation: 'verify', expected_output: 'test_readback' },
      salience: { novelty: 0.48, urgency: 0.32, risk: 0.2, userRelevance: 0.8, operationalValue: 0.86, uncertainty: 0.14 },
      confidence: 0.82,
    });
  }

  return intents.map((intent, offset) => makeToken(source, startIndex + offset, 'intent', intent.label, {
    canonical_id: `intent:${intent.label}`,
    features: intent.features,
    relations: [
      { type: 'targets', target: 'concept:bmct' },
    ],
    affordances: [
      { action: 'answer', risk: 0.04, requires: ['verbalization_context'] },
      { action: 'write_file', risk: 0.35, requires: ['explicit_user_intent', 'policy_gate', 'verification'] },
      { action: 'run_test', risk: 0.2, requires: ['bounded_command', 'readback'] },
    ],
    salience: intent.salience,
    confidence: intent.confidence,
  }));
}

function encodeTextSource(source) {
  const text = shortText(source.text || source.content || '');
  if (!text) throw new Error('TEXT_ENCODER_EMPTY_SOURCE');
  const normalizedSource = {
    source_id: shortText(source.source_id || `input_${sha256Text(text).slice(0, 12)}`),
    modality: source.modality || 'text',
    observed_at: source.observed_at,
  };
  const tokens = [
    makeToken(normalizedSource, 0, 'event', 'user_text_observed', {
      canonical_id: `event:user_text_observed:${normalizedSource.source_id}`,
      features: {
        character_count: text.length,
        word_count: text.split(/\s+/).filter(Boolean).length,
      },
      salience: { novelty: 0.42, userRelevance: 0.8, operationalValue: 0.58, uncertainty: 0.18 },
      confidence: 0.96,
    }),
    ...conceptTokens(normalizedSource, text, 1),
  ];
  tokens.push(...intentTokens(normalizedSource, text, tokens.length));
  const conceptEncoderOptions = source.metadata && source.metadata.concept_encoder || {};
  const enrichedTokens = enrichExperienceTokens(tokens, conceptEncoderOptions);
  const conceptEncoder = enrichedTokens[0] && enrichedTokens[0].concept_embedding || null;
  return {
    schema_version: 1,
    encoder: 'text_encoder',
    concept_encoder: 'mdos_local_concept_encoder',
    concept_encoder_backend: conceptEncoder && conceptEncoder.backend_id || 'local_hash',
    concept_encoder_backend_type: conceptEncoder && conceptEncoder.backend_type || 'deterministic_local',
    source_id: normalizedSource.source_id,
    modality: normalizedSource.modality,
    token_count: enrichedTokens.length,
    tokens: enrichedTokens,
  };
}

module.exports = {
  encodeTextSource,
  makeToken,
  salience,
};
