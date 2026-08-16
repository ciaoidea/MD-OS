#!/usr/bin/env node
'use strict';

function tokenScore(token) {
  const salience = token.salience && Number(token.salience.score || 0) || 0;
  const confidence = Number(token.confidence || 0);
  return salience * 0.72 + confidence * 0.28;
}

function buildGlobalWorkspace(frame, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 5;
  const tokens = [...(frame.experience_tokens || [])]
    .sort((left, right) => {
      const scoreDelta = tokenScore(right) - tokenScore(left);
      if (Math.abs(scoreDelta) > 0.0001) return scoreDelta;
      return left.token_id.localeCompare(right.token_id);
    })
    .slice(0, limit);
  const activeConcepts = Array.from(new Set(tokens.map((token) => token.canonical_id || token.label))).sort();
  return {
    active_tokens: tokens.map((token) => token.token_id),
    active_concepts: activeConcepts,
    attention_budget: 1,
    selection_reason: `top_${limit}_tokens_by_salience_confidence`,
  };
}

module.exports = {
  buildGlobalWorkspace,
};
