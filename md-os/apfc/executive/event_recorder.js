#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { appendText, atomicWriteJson, ensureDir, withFileLock } = require('../../os/lib/fs_runtime');
const { materializeEvents, phaseIndex } = require('./live_materializer');

const APFC_DIR = path.join(MDOS_ROOT, 'ops', 'apfc', 'executive');
const EVENTS_FILE = path.join(APFC_DIR, 'events.ndjson');
const LIVE_GRAPH_FILE = path.join(APFC_DIR, 'live_graph.json');
const LIVE_STATUS_FILE = path.join(APFC_DIR, 'live_status.json');
const ZERO_HASH = '0'.repeat(64);
const ACTORS = new Set(['user', 'host_model', 'mdos_runtime', 'connector', 'verifier', 'consolidator']);
const EPISTEMIC = new Set(['observed', 'hypothetical', 'verified', 'falsified', 'superseded', 'invalid']);
const POLARITIES = new Set(['positive', 'negative', 'partial', 'blocked', 'neutral']);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readEvents(filePath = EVENTS_FILE) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); } catch (error) { throw new Error(`APFC_EVENT_JSON_INVALID: line=${index + 1}:${error.message}`); }
  });
}

function eventWithoutHash(event) {
  return Object.fromEntries(Object.entries(event).filter(([key]) => key !== 'event_hash'));
}

function assertEventShape(event) {
  if (!event || event.schema_version !== 1 || !/^apfc_event_[a-f0-9]{20}$/.test(String(event.event_id || ''))) throw new Error('APFC_EVENT_HEADER_INVALID');
  if (!Number.isInteger(event.sequence) || event.sequence < 1) throw new Error('APFC_EVENT_SEQUENCE_INVALID');
  if (!/^task_[a-zA-Z0-9_]+$/.test(String(event.task_spec_id || ''))) throw new Error('APFC_EVENT_TASK_SPEC_INVALID');
  if (event.episode_id !== null && !/^ep_[a-zA-Z0-9_]+$/.test(String(event.episode_id || ''))) throw new Error('APFC_EVENT_EPISODE_INVALID');
  if (phaseIndex(event.phase) < 0 || !ACTORS.has(event.actor) || !EPISTEMIC.has(event.epistemic_status) || !POLARITIES.has(event.outcome_polarity)) throw new Error('APFC_EVENT_ENUM_INVALID');
  if (!Array.isArray(event.source_refs) || event.source_refs.some((ref) => !String(ref).startsWith('md-os/'))) throw new Error('APFC_EVENT_SOURCE_REF_OUTSIDE_BOUNDARY');
  if (sha256Json(event.payload) !== event.payload_hash) throw new Error('APFC_EVENT_PAYLOAD_HASH_INVALID');
  if (sha256Json(eventWithoutHash(event)) !== event.event_hash) throw new Error('APFC_EVENT_HASH_INVALID');
  return true;
}

function verifyEventChain(events) {
  let previous = ZERO_HASH;
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    assertEventShape(event);
    if (event.sequence !== index + 1) throw new Error(`APFC_EVENT_SEQUENCE_GAP: expected=${index + 1}:actual=${event.sequence}`);
    if (event.previous_event_hash !== previous) throw new Error(`APFC_EVENT_CHAIN_BROKEN: sequence=${event.sequence}`);
    previous = event.event_hash;
  }
  materializeEvents(events);
  return { ok: true, event_count: events.length, last_sequence: events.length, last_event_hash: previous };
}

function assertNextPhase(events, input) {
  const transaction = events.filter((event) => event.transaction_id === input.transaction_id).sort((left, right) => left.sequence - right.sequence);
  if (!transaction.length && input.phase !== 'task_opened') throw new Error('APFC_EVENT_TRANSACTION_MUST_OPEN_FIRST');
  if (transaction.length) {
    const previous = transaction.at(-1);
    if (phaseIndex(input.phase) <= phaseIndex(previous.phase)) throw new Error(`APFC_EVENT_PHASE_ORDER_INVALID: ${previous.phase}->${input.phase}`);
    if (previous.phase === 'episode_closed') throw new Error('APFC_EVENT_TRANSACTION_ALREADY_CLOSED');
  }
}

function recordEvent(input, options = {}) {
  const apfcDir = options.apfc_dir || APFC_DIR;
  const eventsFile = options.events_file || path.join(apfcDir, 'events.ndjson');
  const liveGraphFile = options.live_graph_file || path.join(apfcDir, 'live_graph.json');
  const liveStatusFile = options.live_status_file || path.join(apfcDir, 'live_status.json');
  return withFileLock(options.lock_name || 'apfc__online_transaction', {
    context: 'apfc:event_record', timeoutMs: 60000, staleMs: 600000,
  }, () => {
    ensureDir(apfcDir);
    const events = readEvents(eventsFile);
    verifyEventChain(events);
    assertNextPhase(events, input);
    const timestamp = input.timestamp || nowIso();
    const sequence = events.length + 1;
    const previousEventHash = events.length ? events.at(-1).event_hash : ZERO_HASH;
    const payload = input.payload && typeof input.payload === 'object' ? input.payload : {};
    const provisional = {
      schema_version: 1,
      event_id: `apfc_event_${sha256Text(`${input.transaction_id}:${sequence}:${timestamp}:${sha256Json(payload)}`).slice(0, 20)}`,
      sequence,
      timestamp,
      transaction_id: shortText(input.transaction_id),
      task_spec_id: shortText(input.task_spec_id),
      episode_id: input.episode_id || null,
      phase: input.phase,
      actor: input.actor,
      epistemic_status: input.epistemic_status,
      outcome_polarity: input.outcome_polarity,
      source_refs: [...new Set(input.source_refs || [])].sort(),
      payload,
      payload_hash: sha256Json(payload),
      previous_event_hash: previousEventHash,
    };
    const event = { ...provisional, event_hash: sha256Json(provisional) };
    assertEventShape(event);
    appendText(eventsFile, `${JSON.stringify(event)}\n`);
    const committed = [...events, event];
    const liveGraph = materializeEvents(committed);
    atomicWriteJson(liveGraphFile, liveGraph);
    const lagMs = Math.max(0, Date.now() - Date.parse(timestamp));
    atomicWriteJson(liveStatusFile, {
      schema_version: 1,
      status: lagMs > 500 ? 'attention' : 'ok',
      last_committed_sequence: sequence,
      last_event_hash: event.event_hash,
      materialized_at: nowIso(),
      materialization_lag_ms: lagMs,
      graph_id: liveGraph.graph_id,
      outputs: [rel(eventsFile), rel(liveGraphFile), rel(liveStatusFile)],
    });
    return { event, live_graph: liveGraph };
  });
}

function reconcile(options = {}) {
  const apfcDir = options.apfc_dir || APFC_DIR;
  const eventsFile = options.events_file || path.join(apfcDir, 'events.ndjson');
  const liveGraphFile = options.live_graph_file || path.join(apfcDir, 'live_graph.json');
  const liveStatusFile = options.live_status_file || path.join(apfcDir, 'live_status.json');
  return withFileLock(options.lock_name || 'apfc__online_transaction', { context: 'apfc:reconcile' }, () => {
    const events = readEvents(eventsFile);
    const chain = verifyEventChain(events);
    const liveGraph = materializeEvents(events);
    atomicWriteJson(liveGraphFile, liveGraph);
    atomicWriteJson(liveStatusFile, {
      schema_version: 1,
      status: 'ok',
      last_committed_sequence: chain.last_sequence,
      last_event_hash: chain.last_event_hash,
      materialized_at: nowIso(),
      materialization_lag_ms: 0,
      graph_id: liveGraph.graph_id,
      reconciled: true,
      reconstructed_event_count: 0,
      outputs: [rel(eventsFile), rel(liveGraphFile), rel(liveStatusFile)],
    });
    return { ok: true, ...chain, graph_id: liveGraph.graph_id, reconstructed_event_count: 0 };
  });
}

module.exports = {
  APFC_DIR,
  EVENTS_FILE,
  LIVE_GRAPH_FILE,
  LIVE_STATUS_FILE,
  ZERO_HASH,
  assertEventShape,
  readEvents,
  reconcile,
  recordEvent,
  verifyEventChain,
};
