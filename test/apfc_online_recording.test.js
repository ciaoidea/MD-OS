'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { makeWorkspace } = require('./apfc_test_helpers');
const { readEvents, recordEvent, verifyEventChain } = require('../md-os/apfc/executive/event_recorder');

test('online cognitive phases append, hash-chain, and materialize before the next phase', () => {
  const env = makeWorkspace('mdos-apfc-events-');
  const transactionId = 'task_online__ep_online';
  const base = { transaction_id: transactionId, task_spec_id: 'task_online', episode_id: 'ep_online', source_refs: [] };
  const phases = [
    ['task_opened', 'user', 'observed', 'neutral'],
    ['context_loaded', 'mdos_runtime', 'observed', 'neutral'],
    ['prediction_recorded', 'host_model', 'hypothetical', 'neutral'],
    ['decision_selected', 'host_model', 'hypothetical', 'neutral'],
    ['action_requested', 'mdos_runtime', 'hypothetical', 'neutral'],
    ['action_receipt_recorded', 'connector', 'observed', 'positive'],
    ['outcome_observed', 'mdos_runtime', 'observed', 'positive'],
    ['verification_recorded', 'verifier', 'verified', 'positive'],
    ['episode_closed', 'mdos_runtime', 'verified', 'positive'],
  ];
  phases.forEach(([phase, actor, epistemic_status, outcome_polarity], index) => {
    const result = recordEvent({ ...base, phase, actor, epistemic_status, outcome_polarity, timestamp: `2026-08-01T00:00:${String(index).padStart(2, '0')}Z`, payload: { label: phase } }, { apfc_dir: env.apfc, lock_name: `apfc_test_online_${path.basename(env.workspace)}` });
    assert.equal(result.event.sequence, index + 1);
    assert.ok(result.live_graph.nodes.some((node) => node.properties.event_sequence === index + 1));
  });
  const events = readEvents(path.join(env.apfc, 'events.ndjson'));
  assert.equal(verifyEventChain(events).event_count, phases.length);
  assert.throws(() => recordEvent({ ...base, phase: 'decision_selected', actor: 'host_model', epistemic_status: 'hypothetical', outcome_polarity: 'neutral', payload: {} }, { apfc_dir: env.apfc, lock_name: `apfc_test_online_${path.basename(env.workspace)}` }), /PHASE_ORDER|ALREADY_CLOSED/);
});
