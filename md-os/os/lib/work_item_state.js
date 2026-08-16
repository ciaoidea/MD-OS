#!/usr/bin/env node
'use strict';

const { shortText } = require('./common');

const WORK_ITEM_STATES = Object.freeze([
  'open',
  'planned',
  'running',
  'waiting_external',
  'blocked',
  'done',
  'failed',
  'cancelled',
]);

const TERMINAL_STATES = Object.freeze(['done', 'cancelled']);

const STATE_ALIASES = Object.freeze({
  closed: 'done',
  complete: 'done',
  completed: 'done',
  resolved: 'done',
  pending: 'waiting_external',
  pending_vendor: 'waiting_external',
  monitor: 'waiting_external',
  monitoring: 'waiting_external',
  watch: 'waiting_external',
  waiting: 'waiting_external',
  canceled: 'cancelled',
  cancelled: 'cancelled',
});

const ALLOWED_TRANSITIONS = Object.freeze({
  open: ['planned', 'running', 'blocked', 'done', 'cancelled'],
  planned: ['open', 'running', 'waiting_external', 'blocked', 'cancelled'],
  running: ['waiting_external', 'blocked', 'done', 'failed', 'cancelled'],
  waiting_external: ['open', 'planned', 'running', 'blocked', 'cancelled'],
  blocked: ['open', 'planned', 'failed', 'cancelled'],
  failed: ['open', 'planned', 'cancelled'],
  done: ['open'],
  cancelled: ['open'],
});

function normalizeWorkItemState(value, fallback = 'open') {
  const normalizedFallback = WORK_ITEM_STATES.includes(fallback) ? fallback : 'open';
  const text = shortText(value || normalizedFallback).toLowerCase().replace(/[\s-]+/g, '_');
  const aliased = STATE_ALIASES[text] || text;
  return WORK_ITEM_STATES.includes(aliased) ? aliased : normalizedFallback;
}

function isTerminalState(value) {
  return TERMINAL_STATES.includes(normalizeWorkItemState(value));
}

function isAllowedTransition(fromState, toState) {
  const from = normalizeWorkItemState(fromState);
  const to = normalizeWorkItemState(toState);
  if (from === to) return true;
  return (ALLOWED_TRANSITIONS[from] || []).includes(to);
}

module.exports = {
  ALLOWED_TRANSITIONS,
  TERMINAL_STATES,
  WORK_ITEM_STATES,
  isAllowedTransition,
  isTerminalState,
  normalizeWorkItemState,
};
