#!/usr/bin/env node
'use strict';

const { sha256Json, sha256Text, shortText } = require('../../os/lib/common');

const ENCODER_ID = 'mdos_local_concept_encoder';
const ENCODER_VERSION = '1.0.0';
const VECTOR_SPACE = 'deterministic_hash_semantic_v1';
const FIXTURE_VECTOR_SPACE = 'fixture_concept_semantic_v1';
const EMBEDDING_DIMENSIONS = 24;
const DEFAULT_BACKEND_ID = 'local_hash';

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 1) return 1;
  return number;
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function l2Norm(values) {
  return Math.sqrt(values.reduce((total, value) => total + value * value, 0));
}

function normalize(values) {
  const norm = l2Norm(values);
  if (!norm) return values.map(() => 0);
  return values.map((value) => round(value / norm));
}

function fixedDimensions(values) {
  const vector = Array.isArray(values) ? values.map((value) => Number(value || 0)) : [];
  if (vector.length === EMBEDDING_DIMENSIONS) return vector;
  if (vector.length > EMBEDDING_DIMENSIONS) return vector.slice(0, EMBEDDING_DIMENSIONS);
  return [
    ...vector,
    ...Array.from({ length: EMBEDDING_DIMENSIONS - vector.length }, () => 0),
  ];
}

function stableTerms(token) {
  const features = token.features && typeof token.features === 'object' && !Array.isArray(token.features)
    ? token.features
    : {};
  const featureTerms = Object.entries(features)
    .flatMap(([key, value]) => [key, String(value || '')])
    .map(shortText)
    .filter(Boolean);
  return [
    token.token_type,
    token.canonical_id,
    token.label,
    ...(token.modalities || []),
    ...featureTerms,
  ]
    .map(shortText)
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .split(/[^a-z0-9:_-]+/g)
    .filter((term) => term.length > 1);
}

function hashedTermWeight(term, position) {
  const hash = sha256Text(`${term}:${position}`);
  const bucket = Number.parseInt(hash.slice(0, 8), 16) % EMBEDDING_DIMENSIONS;
  const sign = Number.parseInt(hash.slice(8, 10), 16) % 2 === 0 ? 1 : -1;
  const magnitude = 0.55 + (Number.parseInt(hash.slice(10, 12), 16) / 255) * 0.45;
  return { bucket, value: sign * magnitude };
}

function embeddingId(token, backendId, vectorSpace) {
  return `emb_${sha256Json({
    encoder: ENCODER_ID,
    backend_id: backendId,
    vector_space: vectorSpace,
    token_id: token.token_id,
    canonical_id: token.canonical_id,
    label: token.label,
  }).slice(0, 16)}`;
}

function localHashEmbedding(token, options = {}) {
  const terms = stableTerms(token);
  const values = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const weightedTerms = terms.length ? terms : ['unknown'];
  weightedTerms.forEach((term, index) => {
    const { bucket, value } = hashedTermWeight(term, index);
    values[bucket] += value;
  });
  const normalized = normalize(values);
  return {
    schema_version: 1,
    embedding_id: embeddingId(token, DEFAULT_BACKEND_ID, VECTOR_SPACE),
    encoder: ENCODER_ID,
    encoder_version: ENCODER_VERSION,
    requested_backend: options.requested_backend || DEFAULT_BACKEND_ID,
    backend_id: DEFAULT_BACKEND_ID,
    backend_type: 'deterministic_local',
    backend_status: 'available',
    vector_space: VECTOR_SPACE,
    dimensions: EMBEDDING_DIMENSIONS,
    values: normalized,
    norm: round(l2Norm(normalized)),
    source_fields: [
      'token_type',
      'canonical_id',
      'label',
      'modalities',
      'features',
    ],
    learned: false,
    multimodal_ready: true,
    fallback_used: Boolean(options.fallback_used),
    fallback_reason: options.fallback_reason || null,
  };
}

function fixtureLookup(token, fixtureVectors) {
  if (!fixtureVectors || typeof fixtureVectors !== 'object' || Array.isArray(fixtureVectors)) return null;
  return fixtureVectors[token.token_id]
    || fixtureVectors[token.canonical_id]
    || fixtureVectors[token.label]
    || null;
}

function fixtureEmbedding(token, options = {}) {
  const rawVector = fixtureLookup(token, options.fixture_vectors);
  if (!rawVector) {
    if (options.allow_fallback === false) {
      throw new Error(`CONCEPT_ENCODER_FIXTURE_MISSING: ${token.canonical_id || token.token_id}`);
    }
    return localHashEmbedding(token, {
      requested_backend: 'fixture',
      fallback_used: true,
      fallback_reason: 'fixture_vector_missing',
    });
  }
  const normalized = normalize(fixedDimensions(rawVector));
  return {
    schema_version: 1,
    embedding_id: embeddingId(token, 'fixture', FIXTURE_VECTOR_SPACE),
    encoder: ENCODER_ID,
    encoder_version: ENCODER_VERSION,
    requested_backend: 'fixture',
    backend_id: 'fixture',
    backend_type: 'deterministic_fixture',
    backend_status: 'available',
    vector_space: FIXTURE_VECTOR_SPACE,
    dimensions: EMBEDDING_DIMENSIONS,
    values: normalized,
    norm: round(l2Norm(normalized)),
    source_fields: [
      'fixture_vectors',
      'token_id',
      'canonical_id',
      'label',
    ],
    learned: false,
    multimodal_ready: true,
    fallback_used: false,
    fallback_reason: null,
  };
}

const BACKENDS = Object.freeze({
  local_hash: Object.freeze({
    backend_id: DEFAULT_BACKEND_ID,
    backend_type: 'deterministic_local',
    vector_space: VECTOR_SPACE,
    learned: false,
    multimodal_ready: true,
    encode: localHashEmbedding,
  }),
  fixture: Object.freeze({
    backend_id: 'fixture',
    backend_type: 'deterministic_fixture',
    vector_space: FIXTURE_VECTOR_SPACE,
    learned: false,
    multimodal_ready: true,
    encode: fixtureEmbedding,
  }),
});

function normalizeBackendId(value) {
  const backendId = shortText(value || process.env.MDOS_CONCEPT_ENCODER_BACKEND || DEFAULT_BACKEND_ID);
  return backendId || DEFAULT_BACKEND_ID;
}

function resolveEncoderBackend(options = {}) {
  const backendId = normalizeBackendId(options.backend || options.backend_id);
  const backend = BACKENDS[backendId];
  if (!backend) {
    throw new Error(`UNKNOWN_CONCEPT_ENCODER_BACKEND: ${backendId}`);
  }
  return backend;
}

function availableEncoderBackends() {
  return Object.values(BACKENDS).map((backend) => ({
    backend_id: backend.backend_id,
    backend_type: backend.backend_type,
    vector_space: backend.vector_space,
    learned: backend.learned,
    multimodal_ready: backend.multimodal_ready,
  }));
}

function encodeConceptEmbedding(token, options = {}) {
  const backend = resolveEncoderBackend(options);
  return backend.encode(token, {
    ...options,
    requested_backend: backend.backend_id,
  });
}

function temporalStateForToken(token, sequenceLength) {
  const sequenceIndex = Number(token.time && token.time.sequence_index);
  const safeIndex = Number.isInteger(sequenceIndex) && sequenceIndex >= 0 ? sequenceIndex : 0;
  const denominator = Math.max(1, Number(sequenceLength || 1) - 1);
  return {
    schema_version: 1,
    observed_at: token.time && token.time.observed_at || null,
    sequence_index: safeIndex,
    normalized_position: round(denominator === 0 ? 0 : safeIndex / denominator),
    recency: 1,
    phase: 'observed',
  };
}

function predictionTargetForToken(token, nextToken) {
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

function enrichExperienceTokens(tokens, options = {}) {
  const withEmbeddings = (tokens || []).map((token) => ({
    ...token,
    concept_embedding: encodeConceptEmbedding(token, options),
    temporal_state: temporalStateForToken(token, (tokens || []).length),
  }));
  return withEmbeddings.map((token, index) => ({
    ...token,
    prediction_target: predictionTargetForToken(token, withEmbeddings[index + 1]),
  }));
}

function cosineSimilarity(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length || !left.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += Number(left[index] || 0) * Number(right[index] || 0);
    leftNorm += Number(left[index] || 0) ** 2;
    rightNorm += Number(right[index] || 0) ** 2;
  }
  if (!leftNorm || !rightNorm) return 0;
  return clamp01((dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) + 1) / 2) * 2 - 1;
}

function cosineDistance(left, right) {
  return round(1 - cosineSimilarity(left, right));
}

module.exports = {
  EMBEDDING_DIMENSIONS,
  ENCODER_ID,
  ENCODER_VERSION,
  FIXTURE_VECTOR_SPACE,
  VECTOR_SPACE,
  availableEncoderBackends,
  cosineDistance,
  cosineSimilarity,
  encodeConceptEmbedding,
  enrichExperienceTokens,
  normalize,
  resolveEncoderBackend,
};
