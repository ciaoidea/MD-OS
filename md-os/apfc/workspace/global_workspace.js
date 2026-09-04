#!/usr/bin/env node
'use strict';

function tokenScore(token) {
  const salience = token.salience && Number(token.salience.score || 0) || 0;
  const confidence = Number(token.confidence || 0);
  return salience * 0.72 + confidence * 0.28;
}

function terms(value) {
  return new Set(String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((term) => term.length >= 3));
}

function taskText(frame) {
  if (frame.current_task) return String(frame.current_task);
  if (frame.goal) return String(frame.goal);
  if (frame.task_spec && frame.task_spec.goal) return String(frame.task_spec.goal);
  return '';
}

function buildGlobalWorkspace(frame, options = {}) {
  const limit = Number.isFinite(options.limit) ? options.limit : 5;
  const currentTask = taskText(frame);
  const currentTerms = terms(currentTask);
  const candidates = [...(frame.experience_tokens || [])];
  const admitted = currentTerms.size
    ? candidates.filter((token) => {
      const tokenTerms = terms([
        token.label,
        token.canonical_id,
        token.content,
      ].join(' '));
      return [...tokenTerms].some((term) => currentTerms.has(term));
    })
    : candidates;
  const tokens = admitted
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
    selection_reason: currentTerms.size
      ? `current_task_relevance_then_top_${limit}_by_salience_confidence`
      : `top_${limit}_tokens_by_salience_confidence`,
  };
}

module.exports = {
  buildGlobalWorkspace,
};
