#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  isAllowedTransition,
  isTerminalState,
  normalizeWorkItemState,
} = require('../md-os/os/lib/work_item_state');

test('normalizes legacy and natural work item state aliases', () => {
  assert.equal(normalizeWorkItemState('closed'), 'done');
  assert.equal(normalizeWorkItemState('resolved'), 'done');
  assert.equal(normalizeWorkItemState('pending_vendor'), 'waiting_external');
  assert.equal(normalizeWorkItemState('watch'), 'waiting_external');
  assert.equal(normalizeWorkItemState('in review'), 'open');
});

test('detects terminal states and formal transitions', () => {
  assert.equal(isTerminalState('done'), true);
  assert.equal(isTerminalState('cancelled'), true);
  assert.equal(isTerminalState('failed'), false);
  assert.equal(isAllowedTransition('open', 'planned'), true);
  assert.equal(isAllowedTransition('planned', 'running'), true);
  assert.equal(isAllowedTransition('running', 'done'), true);
  assert.equal(isAllowedTransition('done', 'open'), true);
  assert.equal(isAllowedTransition('done', 'running'), false);
});
