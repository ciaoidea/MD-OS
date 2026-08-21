#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');
const REFLECTIVE_EVENT_TYPES = new Set(['postcondition_readback', 'verifier_readback', 'prediction_error']);

function routeCognitiveEvent(input) {
  if (!input || input.schema_version !== 1) throw new Error('APFC_COGNITIVE_EVENT_INVALID');
  if (!REFLECTIVE_EVENT_TYPES.has(input.event_type)) throw new Error('APFC_COGNITIVE_EVENT_TYPE_INVALID');
  if (!shortText(input.event_id)) throw new Error('APFC_COGNITIVE_EVENT_ID_REQUIRED');
  if (!input.path_request || typeof input.path_request !== 'object') throw new Error('APFC_COGNITIVE_EVENT_PATH_REQUEST_REQUIRED');
  const mismatch = sha256Json(input.expected) !== sha256Json(input.observed);
  const reasons = [];
  if (!mismatch) reasons.push('readback_matches_expectation');
  if (input.problem_relevant !== true) reasons.push('not_relevant_to_active_problem');
  if (input.verification_required !== true) reasons.push('verification_not_required');
  if (input.autonomy !== 'single_bounded_cycle') reasons.push('unbounded_autonomy_forbidden');
  const accepted = reasons.length === 0;
  return {
    schema_version: 1,
    route_id: `cogevent_${sha256Json({ event_id: input.event_id, expected: input.expected, observed: input.observed }).slice(0, 20)}`,
    accepted,
    route: accepted ? 'apfc_cognitive_reflect' : 'no_reflection',
    trigger: accepted ? 'expected_observed_mismatch' : null,
    question: accepted ? 'Why did the observed result differ from the expected result?' : null,
    rejection_reasons: reasons,
    path_request: accepted ? input.path_request : null,
  };
}

module.exports = { REFLECTIVE_EVENT_TYPES, routeCognitiveEvent };
