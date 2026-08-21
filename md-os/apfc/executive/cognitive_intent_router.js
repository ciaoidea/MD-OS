#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');

const REFLECTION_OPERATIONS = Object.freeze([
  'identify_uncertainty', 'formulate_question', 'compare_hypotheses',
  'select_informative_action', 'require_readback', 'persist_verified_correction',
]);

function assertIntentEnvelope(envelope) {
  if (!envelope || envelope.schema_version !== 1) throw new Error('APFC_COGNITIVE_INTENT_INVALID');
  if (!shortText(envelope.source_text)) throw new Error('APFC_COGNITIVE_INTENT_SOURCE_REQUIRED');
  if (!shortText(envelope.source_language)) throw new Error('APFC_COGNITIVE_INTENT_LANGUAGE_REQUIRED');
  if (!envelope.classification || typeof envelope.classification !== 'object') throw new Error('APFC_COGNITIVE_INTENT_CLASSIFICATION_REQUIRED');
  if (!envelope.path_request || typeof envelope.path_request !== 'object') throw new Error('APFC_COGNITIVE_INTENT_PATH_REQUEST_REQUIRED');
  return envelope;
}

function routeCognitiveIntent(envelopeInput) {
  const envelope = assertIntentEnvelope(envelopeInput);
  const classification = envelope.classification;
  const reasons = [];
  if (classification.cognitive_intent !== 'critical_reflection') reasons.push('intent_not_critical_reflection');
  if (classification.problem_relevant !== true) reasons.push('not_relevant_to_active_problem');
  if (classification.verification_required !== true) reasons.push('verification_not_required');
  if (classification.autonomy !== 'single_bounded_cycle') reasons.push('unbounded_autonomy_forbidden');
  if (Number(classification.confidence) < 0.75) reasons.push('classification_confidence_too_low');
  const requested = new Set(classification.operations || []);
  for (const operation of REFLECTION_OPERATIONS) if (!requested.has(operation)) reasons.push(`missing_operation:${operation}`);
  const accepted = reasons.length === 0;
  return {
    schema_version: 1,
    route_id: `cogroute_${sha256Json({ source_text: envelope.source_text, classification }).slice(0, 20)}`,
    accepted,
    route: accepted ? 'apfc_cognitive_reflect' : 'ordinary_response',
    rejection_reasons: reasons,
    semantic_intent: classification.cognitive_intent,
    source_language: shortText(envelope.source_language),
    source_text_hash: sha256Json(shortText(envelope.source_text)),
    operations: accepted ? REFLECTION_OPERATIONS : [],
    path_request: accepted ? envelope.path_request : null,
  };
}

module.exports = { REFLECTION_OPERATIONS, assertIntentEnvelope, routeCognitiveIntent };
