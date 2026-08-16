#!/usr/bin/env node
'use strict';

const { sha256Json } = require('../../os/lib/common');
const { IDENTITY_VERSION, assertApfcGraph, makeEdge, makeNode } = require('./graph_projector');

const PHASES = [
  'task_opened',
  'context_loaded',
  'prediction_recorded',
  'decision_selected',
  'action_requested',
  'action_receipt_recorded',
  'outcome_observed',
  'verification_recorded',
  'correction_recorded',
  'episode_closed',
];

const PHASE_NODE_TYPE = {
  task_opened: 'goal',
  context_loaded: 'context_pack',
  prediction_recorded: 'prediction',
  decision_selected: 'decision',
  action_requested: 'action',
  action_receipt_recorded: 'receipt',
  outcome_observed: 'outcome',
  verification_recorded: 'verification',
  correction_recorded: 'correction',
  episode_closed: 'episode',
};

const PHASE_EDGE_TYPE = {
  context_loaded: 'requires',
  prediction_recorded: 'predicts',
  decision_selected: 'selected_because',
  action_requested: 'executed_via',
  action_receipt_recorded: 'produced',
  outcome_observed: 'observed_as',
  verification_recorded: 'verified_by',
  correction_recorded: 'corrected_by',
  episode_closed: 'supported_by',
};

function phaseIndex(phase) {
  return PHASES.indexOf(phase);
}

function assertPhaseOrder(events) {
  const byTransaction = new Map();
  for (const event of events) {
    const list = byTransaction.get(event.transaction_id) || [];
    list.push(event);
    byTransaction.set(event.transaction_id, list);
  }
  for (const [transactionId, list] of byTransaction) {
    let previous = -1;
    for (const event of list.sort((left, right) => left.sequence - right.sequence)) {
      const index = phaseIndex(event.phase);
      if (index < 0) throw new Error(`APFC_EVENT_PHASE_INVALID: ${event.phase}`);
      if (index <= previous) throw new Error(`APFC_EVENT_PHASE_ORDER_INVALID: ${transactionId}:${event.phase}`);
      if (previous === -1 && index !== 0) throw new Error(`APFC_EVENT_TRANSACTION_MUST_OPEN_FIRST: ${transactionId}`);
      if (event.phase === 'episode_closed' && !list.some((candidate) => candidate.phase === 'verification_recorded' && candidate.sequence < event.sequence)) {
        throw new Error(`APFC_EVENT_EPISODE_CLOSE_REQUIRES_VERIFICATION: ${transactionId}`);
      }
      previous = index;
    }
  }
  return true;
}

function eventLifecycle(event) {
  if (event.outcome_polarity === 'blocked') return 'blocked';
  if (event.outcome_polarity === 'negative') return event.phase === 'verification_recorded' ? 'failed' : 'active';
  if (event.phase === 'episode_closed' || event.phase === 'verification_recorded' || event.phase === 'action_receipt_recorded') return 'completed';
  return 'active';
}

function labelForEvent(event) {
  return event.payload.label
    || event.payload.goal
    || event.payload.summary
    || event.payload.action_id
    || event.payload.receipt_id
    || event.payload.verifier_id
    || event.phase.replace(/_/g, ' ');
}

function materializeEvents(events, baseGraph = null) {
  assertPhaseOrder(events);
  const baseNodes = baseGraph && Array.isArray(baseGraph.nodes) ? baseGraph.nodes : [];
  const baseEdges = baseGraph && Array.isArray(baseGraph.edges) ? baseGraph.edges : [];
  const nodes = new Map(baseNodes.map((node) => [node.id, node]));
  const edges = new Map(baseEdges.map((edge) => [edge.id, edge]));
  const previousNodeByTransaction = new Map();
  for (const event of events.slice().sort((left, right) => left.sequence - right.sequence)) {
    const ref = `md-os/ops/apfc/executive/events.ndjson#sequence=${event.sequence}`;
    const type = PHASE_NODE_TYPE[event.phase];
    const node = makeNode({
      type,
      canonicalKey: `${event.event_hash}:${event.phase}`,
      label: labelForEvent(event),
      lifecycle: eventLifecycle(event),
      epistemic: event.epistemic_status,
      sourceRefs: [ref, ...(event.source_refs || [])],
      scope: { task_id: event.task_spec_id, project_id: event.payload.project_id || null, release_id: IDENTITY_VERSION },
      riskLevel: event.payload.risk_level || 'low',
      confidence: event.payload.confidence,
      createdAt: event.timestamp,
      properties: {
        ...event.payload,
        event_id: event.event_id,
        event_sequence: event.sequence,
        transaction_id: event.transaction_id,
        phase: event.phase,
        outcome_polarity: event.outcome_polarity,
        live_overlay: true,
      },
    });
    nodes.set(node.id, node);
    const previous = previousNodeByTransaction.get(event.transaction_id);
    if (previous) {
      const edge = makeEdge({
        from: previous.id,
        type: PHASE_EDGE_TYPE[event.phase] || 'compiled_into',
        to: node.id,
        epistemic: event.epistemic_status,
        sourceRefs: [ref],
        evidenceIds: [previous.id, node.id],
        createdAt: event.timestamp,
        properties: { transaction_id: event.transaction_id, event_sequence: event.sequence, live_overlay: true },
      });
      edges.set(edge.id, edge);
    }
    previousNodeByTransaction.set(event.transaction_id, node);
  }
  const sourceManifestHash = sha256Json(events.map((event) => ({ sequence: event.sequence, event_hash: event.event_hash })));
  const graphNodes = [...nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const graphEdges = [...edges.values()].sort((left, right) => left.id.localeCompare(right.id));
  const graph = {
    schema_version: 1,
    identity_version: IDENTITY_VERSION,
    graph_id: `apfcg_${sourceManifestHash.slice(0, 16)}`,
    source_manifest_hash: sourceManifestHash,
    status: 'ok',
    nodes: graphNodes,
    edges: graphEdges,
    findings: [],
    metrics: {
      node_count: graphNodes.length,
      edge_count: graphEdges.length,
      skill_count: graphNodes.filter((node) => node.type === 'skill' || node.type === 'skill_candidate').length,
      verified_source_episode_count: graphNodes.filter((node) => node.type === 'episode' && node.epistemic_status === 'verified').length,
    },
  };
  assertApfcGraph(graph);
  return graph;
}

module.exports = {
  PHASES,
  assertPhaseOrder,
  materializeEvents,
  phaseIndex,
};
