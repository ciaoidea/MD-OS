#!/usr/bin/env node
'use strict';

const { sha256Json } = require('../../os/lib/common');
const {
  cosineDistance,
  normalize,
} = require('../encoders/concept_encoder');

function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function vectorFor(token) {
  return token && token.concept_embedding && Array.isArray(token.concept_embedding.values)
    ? token.concept_embedding.values
    : null;
}

function predictNextEmbedding(previousToken, currentToken) {
  const current = vectorFor(currentToken);
  if (!current) return null;
  const previous = vectorFor(previousToken);
  if (!previous || previous.length !== current.length) return current;
  const projected = current.map((value, index) => {
    const delta = Number(value || 0) - Number(previous[index] || 0);
    return Number(value || 0) + delta * 0.5;
  });
  return normalize(projected);
}

function transitionRecord(frame, previousToken, currentToken, nextToken) {
  const predicted = predictNextEmbedding(previousToken, currentToken);
  const actual = vectorFor(nextToken);
  const loss = predicted && actual ? cosineDistance(predicted, actual) : null;
  return {
    transition_id: `dyn_${sha256Json({
      frame_id: frame.frame_id,
      current_token_id: currentToken.token_id,
      next_token_id: nextToken && nextToken.token_id,
    }).slice(0, 16)}`,
    from_token_id: currentToken.token_id,
    from_canonical_id: currentToken.canonical_id || null,
    to_token_id: nextToken && nextToken.token_id || null,
    to_canonical_id: nextToken && nextToken.canonical_id || null,
    horizon: nextToken ? 1 : 0,
    predicted_embedding: predicted,
    target_embedding: actual,
    loss,
    loss_name: loss === null ? 'none' : 'cosine_distance',
  };
}

function summarizeLoss(transitions) {
  const scored = transitions.filter((item) => Number.isFinite(item.loss));
  if (!scored.length) {
    return {
      name: 'cosine_distance',
      value: null,
      count: 0,
      status: 'not_computable',
    };
  }
  const value = round(scored.reduce((total, item) => total + item.loss, 0) / scored.length);
  return {
    name: 'mean_cosine_distance',
    value,
    count: scored.length,
    status: value <= 0.35 ? 'low_error_baseline' : 'high_error_baseline',
  };
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function summarizeEmbeddingBackends(tokens) {
  const embeddings = (tokens || []).map((token) => token.concept_embedding).filter(Boolean);
  const encoders = uniq(embeddings.map((embedding) => embedding.encoder));
  const vectorSpaces = uniq(embeddings.map((embedding) => embedding.vector_space));
  const backends = uniq(embeddings.map((embedding) => embedding.backend_id || embedding.encoder));
  return {
    encoder: encoders.length === 1 ? encoders[0] : 'mixed',
    vector_space: vectorSpaces.length === 1 ? vectorSpaces[0] : 'mixed',
    embedding_backends: backends,
  };
}

function buildConceptDynamics(frame) {
  const tokens = frame.experience_tokens || [];
  const transitions = [];
  for (let index = 0; index < tokens.length - 1; index += 1) {
    transitions.push(transitionRecord(frame, tokens[index - 1], tokens[index], tokens[index + 1]));
  }
  const loss = summarizeLoss(transitions);
  const backendSummary = summarizeEmbeddingBackends(tokens);
  return {
    schema_version: 1,
    model_id: `concept_dynamics_${frame.frame_id}`,
    frame_id: frame.frame_id,
    model_type: 'deterministic_temporal_embedding_baseline',
    training_status: 'untrained_baseline',
    learned: false,
    encoder: backendSummary.encoder,
    vector_space: backendSummary.vector_space,
    embedding_backends: backendSummary.embedding_backends,
    transition_count: transitions.length,
    loss,
    transitions,
    readback: {
      status: 'prototype_vector_dynamics',
      limitation: 'Local deterministic embeddings and temporal baseline are active; no learned multimodal encoder or trained concept predictor is claimed.',
    },
  };
}

module.exports = {
  buildConceptDynamics,
  predictNextEmbedding,
};
