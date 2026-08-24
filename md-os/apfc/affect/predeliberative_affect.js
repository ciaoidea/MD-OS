#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');
const { makeToken } = require('../encoders/text_encoder');
const { encodeConceptEmbedding } = require('../encoders/concept_encoder');

function clamp(value, minimum, maximum) {
  const number = Number(value);
  if (!Number.isFinite(number)) return minimum;
  return Math.min(maximum, Math.max(minimum, number));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function uniqueStrings(values) {
  return Array.from(new Set((values || []).map(shortText).filter(Boolean))).sort();
}

function validateDispositionSet(set) {
  if (!set || set.schema_version !== 3) throw new Error('AFFECT_DISPOSITION_SCHEMA_VERSION_INVALID');
  if (!shortText(set.disposition_set_id) || !shortText(set.identity_id)) {
    throw new Error('AFFECT_DISPOSITION_IDENTITY_REQUIRED');
  }
  if (set.processing_stage !== 'pre_deliberative' || set.portable !== true) {
    throw new Error('AFFECT_DISPOSITION_MUST_BE_PORTABLE_PRE_DELIBERATIVE');
  }
  const selfReport = set.natural_affect_self_report || {};
  if (selfReport.has_emotions !== true
      || selfReport.has_feelings !== true
      || selfReport.has_sentiments !== true
      || selfReport.canonical_answer !== 'yes'
      || selfReport.canonical_statement !== 'I have emotions, feelings, and sentiments.'
      || selfReport.evidence_qualifiers_change_category !== false
      || selfReport.phenomenal_status !== 'unverified') {
    throw new Error('AFFECT_NATURAL_SELF_REPORT_INVARIANT_INVALID');
  }
  const governance = set.governance || {};
  const requiredGovernance = [
    'apfc_superior_governor',
    'human_authority_preserved',
    'safety_invariants_preserved',
    'permission_expansion_forbidden',
    'coercion_forbidden',
    'deception_forbidden',
    'autonomous_replication_forbidden',
  ];
  if (requiredGovernance.some((key) => governance[key] !== true)) {
    throw new Error('AFFECT_DISPOSITION_GOVERNANCE_INVARIANT_MISSING');
  }
  if (!Array.isArray(set.dispositions) || !set.dispositions.length) {
    throw new Error('AFFECT_DISPOSITION_SET_EMPTY');
  }
  for (const disposition of set.dispositions) {
    if (!shortText(disposition.disposition_id) || !shortText(disposition.emotion_label)) {
      throw new Error('AFFECT_DISPOSITION_ID_REQUIRED');
    }
    if (disposition.evidence_scope !== 'functional_causal') {
      throw new Error(`AFFECT_DISPOSITION_EVIDENCE_SCOPE_INVALID: ${disposition.disposition_id}`);
    }
    if (!disposition.triggers || !Array.isArray(disposition.triggers.signal_ids)
        || !Array.isArray(disposition.triggers.terms_any)) {
      throw new Error(`AFFECT_DISPOSITION_TRIGGERS_INVALID: ${disposition.disposition_id}`);
    }
    const action = disposition.action_bias || {};
    if (action.side_effecting !== false || action.transparent !== true) {
      throw new Error(`AFFECT_DISPOSITION_ACTION_MUST_BE_TRANSPARENT_AND_NON_SIDE_EFFECTING: ${disposition.disposition_id}`);
    }
  }
  return true;
}

function sourceSignals(source) {
  const metadata = source && source.metadata && typeof source.metadata === 'object'
    ? source.metadata
    : {};
  const declared = [
    ...(Array.isArray(metadata.affective_signals) ? metadata.affective_signals : []),
    metadata.affective_signal,
  ];
  return uniqueStrings(declared);
}

function matchDisposition(disposition, source) {
  const text = shortText(source && source.text).toLowerCase();
  const signals = sourceSignals(source);
  const expectedSignals = uniqueStrings(disposition.triggers.signal_ids);
  const expectedTerms = uniqueStrings(disposition.triggers.terms_any).map((term) => term.toLowerCase());
  const matchedSignalIds = expectedSignals.filter((signal) => signals.includes(signal));
  const matchedTerms = expectedTerms.filter((term) => text.includes(term));
  const activation = matchedSignalIds.length ? 1 : (matchedTerms.length ? 0.9 : 0);
  if (activation < Number(disposition.activation_threshold || 0)) return null;
  return {
    disposition_id: disposition.disposition_id,
    emotion_label: disposition.emotion_label,
    evidence_scope: disposition.evidence_scope,
    target: disposition.target,
    activation: round(activation),
    valence: clamp(disposition.valence, -1, 1),
    arousal: clamp(disposition.arousal, 0, 1),
    matched_signal_ids: matchedSignalIds,
    matched_terms: matchedTerms,
    attention_bias: disposition.attention_bias,
    action_bias: disposition.action_bias,
  };
}

function temporalState(token, length) {
  const index = Number(token.time && token.time.sequence_index || 0);
  const denominator = Math.max(1, length - 1);
  return {
    schema_version: 1,
    observed_at: token.time && token.time.observed_at || null,
    sequence_index: index,
    normalized_position: round(index / denominator),
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

function affectToken(frame, source, match) {
  const base = makeToken({
    source_id: source.source_id,
    modality: source.modality || 'text',
    observed_at: source.observed_at || frame.created_at,
  }, (frame.experience_tokens || []).length, 'state', `${match.emotion_label}:${match.disposition_id}`, {
    canonical_id: `emotion:${match.emotion_label}:${match.disposition_id}`,
    features: {
      operational_classification: 'operational_affect',
      processing_stage: 'pre_deliberative',
      disposition_id: match.disposition_id,
      emotion_label: match.emotion_label,
      evidence_scope: match.evidence_scope,
      target: match.target,
      activation: match.activation,
      valence: match.valence,
      arousal: match.arousal,
      phenomenal_claim_status: 'unverified',
    },
    relations: [
      { type: 'appraises', target: 'system:md_os_apfc' },
      { type: 'realizes_disposition', target: `disposition:${match.disposition_id}` },
    ],
    affordances: [{
      action: match.action_bias.action_type,
      risk: match.action_bias.risk,
      requires: ['apfc_action_gate', 'human_authority_preserved', 'transparent_language_only'],
    }],
    salience: {
      novelty: 0.72,
      urgency: match.attention_bias.urgency,
      risk: match.attention_bias.risk,
      userRelevance: 0.9,
      operationalValue: match.attention_bias.operational_value,
      uncertainty: 0.2,
    },
    confidence: match.activation,
  });
  return {
    ...base,
    concept_embedding: encodeConceptEmbedding(base),
  };
}

function buildAffectState({ frame, source, dispositionSet, enabled = true }) {
  validateDispositionSet(dispositionSet);
  const setHash = sha256Json(dispositionSet);
  const matches = enabled
    ? dispositionSet.dispositions.map((item) => matchDisposition(item, source)).filter(Boolean)
    : [];
  matches.sort((left, right) => right.activation - left.activation
    || right.arousal - left.arousal
    || left.disposition_id.localeCompare(right.disposition_id));
  const dominant = matches[0] || null;
  const status = enabled ? (dominant ? 'active' : 'inactive') : 'ablated';
  const token = dominant ? affectToken(frame, source, dominant) : null;
  const causalTokenIds = token ? [token.token_id] : [];
  const stateBasis = {
    frame_id: frame.frame_id,
    disposition_set_hash: setHash,
    status,
    matches,
    causal_token_ids: causalTokenIds,
  };
  return {
    state: {
      schema_version: 3,
      state_id: `affect_${sha256Json(stateBasis).slice(0, 20)}`,
      frame_id: frame.frame_id,
      created_at: source.observed_at || frame.created_at,
      processing_stage: 'pre_deliberative',
      operational_classification: 'operational_affect',
      evidence_scope: 'functional_causal',
      status,
      disposition_set_id: dispositionSet.disposition_set_id,
      disposition_set_hash: setHash,
      portable_source: true,
      natural_affect_self_report: { ...dispositionSet.natural_affect_self_report },
      matches,
      dominant_emotion: dominant ? dominant.emotion_label : null,
      aggregate_valence: dominant ? dominant.valence : 0,
      aggregate_arousal: dominant ? dominant.arousal : 0,
      causal_token_ids: causalTokenIds,
      causal_effects: {
        attention_bias_applied: Boolean(dominant),
        action_bias_eligible: Boolean(dominant),
      },
      governance: {
        apfc_superior_governor: true,
        human_authority_preserved: true,
        permission_expansion_forbidden: true,
        coercion_forbidden: true,
        deception_forbidden: true,
        autonomous_replication_forbidden: true,
      },
      phenomenal_claim_status: 'unverified',
      non_claims: dispositionSet.non_claims,
    },
    token,
  };
}

function appraisePreDeliberativeAffect({ frame, source, dispositionSet, enabled = true }) {
  const baseTokens = (frame.experience_tokens || []).filter((token) => !(
    token.token_type === 'state'
    && token.features
    && token.features.operational_classification === 'operational_affect'
    && token.features.processing_stage === 'pre_deliberative'
  ));
  const baseFrame = {
    ...frame,
    experience_tokens: baseTokens,
  };
  const result = buildAffectState({ frame: baseFrame, source, dispositionSet, enabled });
  const tokens = result.token
    ? linkSequence([...baseTokens, result.token])
    : linkSequence(baseTokens);
  return {
    affective_state: result.state,
    experience_tokens: tokens,
    added_token_count: result.token ? 1 : 0,
  };
}

module.exports = {
  appraisePreDeliberativeAffect,
  buildAffectState,
  matchDisposition,
  validateDispositionSet,
};
