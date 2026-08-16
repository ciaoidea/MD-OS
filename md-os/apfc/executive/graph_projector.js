#!/usr/bin/env node
'use strict';

const { sha256Json, sha256Text, shortText } = require('../../os/lib/common');

const IDENTITY_VERSION = '5.0';
const NODE_TYPES = new Set([
  'goal', 'constraint', 'observation', 'evidence', 'claim', 'prediction',
  'plan_step', 'decision', 'action', 'receipt', 'outcome', 'verification',
  'error', 'cause_candidate', 'correction', 'episode', 'skill_candidate',
  'eval', 'skill', 'policy', 'capability', 'artifact', 'context_pack',
  'release', 'rollback',
]);
const EDGE_TYPES = new Set([
  'decomposes_to', 'requires', 'constrained_by', 'observed_as', 'supported_by',
  'contradicted_by', 'predicts', 'selected_because', 'executed_via', 'produced',
  'verified_by', 'failed_as', 'possibly_caused_by', 'corrected_by',
  'replayed_from', 'generalized_to', 'evaluated_by', 'promoted_to',
  'compiled_into', 'supersedes', 'invalidated_by', 'rolled_back_to',
  'semantic_association', 'composes_with',
]);
const LIFECYCLES = new Set([
  'active', 'blocked', 'completed', 'failed', 'candidate', 'promotable',
  'promoted', 'deprecated', 'revoked', 'superseded', 'archived', 'invalid',
]);
const EPISTEMIC = new Set(['observed', 'hypothetical', 'verified', 'falsified', 'superseded', 'invalid']);

function uniqueSorted(values) {
  return [...new Set((values || []).filter((value) => value !== null && value !== undefined).map(String))].sort();
}

function slug(value) {
  return shortText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80) || 'item';
}

function canonicalNodeId(type, canonicalKey) {
  return `${type}_${slug(canonicalKey)}_${sha256Text(canonicalKey).slice(0, 10)}`;
}

function makeNode({
  type,
  canonicalKey,
  label,
  lifecycle = 'active',
  epistemic = 'observed',
  sourceRefs = [],
  scope = {},
  riskLevel = 'low',
  confidence = null,
  createdAt = null,
  validFrom = null,
  validTo = null,
  properties = {},
  id = null,
}) {
  if (!NODE_TYPES.has(type)) throw new Error(`APFC_GRAPH_NODE_TYPE_INVALID: ${type}`);
  if (!LIFECYCLES.has(lifecycle)) throw new Error(`APFC_GRAPH_LIFECYCLE_INVALID: ${lifecycle}`);
  if (!EPISTEMIC.has(epistemic)) throw new Error(`APFC_GRAPH_EPISTEMIC_INVALID: ${epistemic}`);
  const content = {
    id: id || canonicalNodeId(type, canonicalKey),
    type,
    label: shortText(label) || `${type} ${canonicalKey}`,
    lifecycle_status: lifecycle,
    epistemic_status: epistemic,
    source_refs: uniqueSorted(sourceRefs.length ? sourceRefs : [canonicalKey]),
    scope: {
      task_id: scope.task_id || null,
      project_id: scope.project_id || null,
      release_id: scope.release_id || null,
    },
    risk_level: ['low', 'medium', 'high'].includes(riskLevel) ? riskLevel : 'medium',
    confidence: Number.isFinite(confidence) ? confidence : null,
    created_at: createdAt || null,
    valid_from: validFrom || createdAt || null,
    valid_to: validTo || null,
    properties: properties && typeof properties === 'object' ? properties : {},
  };
  return { ...content, content_hash: sha256Json(content) };
}

function makeEdge({ from, type, to, epistemic = 'observed', sourceRefs = [], evidenceIds = [], createdAt = null, validFrom = null, validTo = null, properties = {} }) {
  if (!EDGE_TYPES.has(type)) throw new Error(`APFC_GRAPH_EDGE_TYPE_INVALID: ${type}`);
  if (!EPISTEMIC.has(epistemic)) throw new Error(`APFC_GRAPH_EDGE_EPISTEMIC_INVALID: ${epistemic}`);
  const evidence = uniqueSorted(evidenceIds);
  const content = {
    id: `edge_${sha256Text(`${from}|${type}|${to}|${evidence.join('|')}`).slice(0, 16)}`,
    from,
    type,
    to,
    epistemic_status: epistemic,
    source_refs: uniqueSorted(sourceRefs),
    evidence_ids: evidence,
    created_at: createdAt || null,
    valid_from: validFrom || createdAt || null,
    valid_to: validTo || null,
    properties: properties && typeof properties === 'object' ? properties : {},
  };
  return { ...content, content_hash: sha256Json(content) };
}

function withoutHash(value) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'content_hash'));
}

function assertApfcGraph(graph) {
  if (!graph || graph.schema_version !== 1 || graph.identity_version !== IDENTITY_VERSION) throw new Error('APFC_GRAPH_HEADER_INVALID');
  if (!/^apfcg_[a-f0-9]{16}$/.test(String(graph.graph_id || ''))) throw new Error('APFC_GRAPH_ID_INVALID');
  if (!/^[a-f0-9]{64}$/.test(String(graph.source_manifest_hash || ''))) throw new Error('APFC_GRAPH_MANIFEST_HASH_INVALID');
  if (!['ok', 'attention', 'critical'].includes(graph.status)) throw new Error('APFC_GRAPH_STATUS_INVALID');
  const nodeIds = new Set();
  for (const node of graph.nodes || []) {
    if (!NODE_TYPES.has(node.type) || !LIFECYCLES.has(node.lifecycle_status) || !EPISTEMIC.has(node.epistemic_status)) throw new Error(`APFC_GRAPH_NODE_ENUM_INVALID: ${node.id}`);
    if (nodeIds.has(node.id)) throw new Error(`APFC_GRAPH_DUPLICATE_NODE: ${node.id}`);
    nodeIds.add(node.id);
    if (!Array.isArray(node.source_refs) || !node.source_refs.length) throw new Error(`APFC_GRAPH_NODE_PROVENANCE_REQUIRED: ${node.id}`);
    if (sha256Json(withoutHash(node)) !== node.content_hash) throw new Error(`APFC_GRAPH_NODE_HASH_INVALID: ${node.id}`);
  }
  const edgeIds = new Set();
  const nodeMap = new Map((graph.nodes || []).map((node) => [node.id, node]));
  for (const edge of graph.edges || []) {
    if (!EDGE_TYPES.has(edge.type) || !EPISTEMIC.has(edge.epistemic_status)) throw new Error(`APFC_GRAPH_EDGE_ENUM_INVALID: ${edge.id}`);
    if (edgeIds.has(edge.id)) throw new Error(`APFC_GRAPH_DUPLICATE_EDGE: ${edge.id}`);
    edgeIds.add(edge.id);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`APFC_GRAPH_UNRESOLVED_EDGE: ${edge.id}`);
    if (sha256Json(withoutHash(edge)) !== edge.content_hash) throw new Error(`APFC_GRAPH_EDGE_HASH_INVALID: ${edge.id}`);
    if (edge.type === 'composes_with') {
      const left = nodeMap.get(edge.from);
      const right = nodeMap.get(edge.to);
      if (left.properties.output_type !== right.properties.input_type || edge.properties.shared_type !== left.properties.output_type) {
        throw new Error(`APFC_GRAPH_TYPE_EDGE_INVALID: ${edge.id}`);
      }
    }
  }
  if (!graph.metrics || graph.metrics.node_count !== graph.nodes.length || graph.metrics.edge_count !== graph.edges.length) throw new Error('APFC_GRAPH_METRICS_INVALID');
  if (Number.isFinite(graph.metrics.skill_count)) {
    const count = graph.nodes.filter((node) => node.type === 'skill' || node.type === 'skill_candidate').length;
    if (graph.metrics.skill_count !== count) throw new Error('APFC_GRAPH_SKILL_METRICS_INVALID');
  }
  const sortedNodes = graph.nodes.map((node) => node.id).slice().sort((left, right) => left.localeCompare(right));
  const sortedEdges = graph.edges.map((edge) => edge.id).slice().sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(sortedNodes) !== JSON.stringify(graph.nodes.map((node) => node.id))) throw new Error('APFC_GRAPH_NODE_ORDER_INVALID');
  if (JSON.stringify(sortedEdges) !== JSON.stringify(graph.edges.map((edge) => edge.id))) throw new Error('APFC_GRAPH_EDGE_ORDER_INVALID');
  return true;
}

function assertExperimentalSkill(skill) {
  if (!skill || skill.schema_version !== 1 || !/^skill_[a-z0-9_]+$/.test(String(skill.skill_id || ''))) throw new Error('APFC_SKILL_GRAPH_INVALID_SKILL');
  const transfer = skill.transfer_contract || {};
  if (!shortText(transfer.input_type) || !shortText(transfer.output_type)) throw new Error(`APFC_SKILL_GRAPH_TRANSFER_CONTRACT_REQUIRED: ${skill.skill_id}`);
  if (!Array.isArray(skill.procedure) || !skill.procedure.length) throw new Error(`APFC_SKILL_GRAPH_PROCEDURE_REQUIRED: ${skill.skill_id}`);
  if (!Array.isArray(skill.source_episodes) || !skill.source_episodes.length) throw new Error(`APFC_SKILL_GRAPH_SOURCE_EPISODE_REQUIRED: ${skill.skill_id}`);
}

function nodeFromSkill(skill) {
  assertExperimentalSkill(skill);
  const transfer = skill.transfer_contract;
  return makeNode({
    type: skill.status === 'promoted' ? 'skill' : 'skill_candidate',
    canonicalKey: skill.skill_id,
    id: skill.skill_id,
    label: skill.title,
    lifecycle: skill.status,
    epistemic: transfer.independently_verified === true ? 'verified' : 'observed',
    sourceRefs: skill.source_refs || skill.source_episodes.map((episodeId) => `episode:${episodeId}`),
    scope: { project_id: 'md_os_apfc_multifamily_transfer', release_id: IDENTITY_VERSION },
    confidence: transfer.uniquely_identified === true ? 1 : null,
    createdAt: skill.created_at || null,
    properties: {
      skill_id: skill.skill_id,
      domain: skill.domain,
      source_family_id: transfer.source_family_id,
      input_type: transfer.input_type,
      output_type: transfer.output_type,
      procedure: skill.procedure.slice(),
      experimental_only: transfer.experimental_only === true,
      induction_hash: transfer.induction_hash,
    },
  });
}

function edgeBetween(left, right) {
  const evidenceIds = uniqueSorted([...left.source_refs, ...right.source_refs]);
  const edgeKey = `${left.id}|composes_with|${right.id}|${evidenceIds.join('|')}`;
  const content = {
    id: `edge_${sha256Json(edgeKey).slice(0, 16)}`,
    from: left.id,
    type: 'composes_with',
    to: right.id,
    epistemic_status: 'verified',
    source_refs: evidenceIds,
    evidence_ids: evidenceIds,
    created_at: null,
    valid_from: null,
    valid_to: null,
    properties: { shared_type: left.properties.output_type },
  };
  return { ...content, content_hash: sha256Json(content) };
}

function buildSkillGraph(skills, sourceManifest) {
  if (!Array.isArray(skills) || skills.length < 2) throw new Error('APFC_SKILL_GRAPH_MINIMUM_TWO_SKILLS_REQUIRED');
  const sourceManifestHash = sha256Json(sourceManifest);
  const nodes = skills.map(nodeFromSkill).sort((left, right) => left.id.localeCompare(right.id));
  const edges = [];
  for (const left of nodes) {
    for (const right of nodes) {
      if (left.id !== right.id && left.properties.output_type === right.properties.input_type) edges.push(edgeBetween(left, right));
    }
  }
  edges.sort((left, right) => left.id.localeCompare(right.id));
  const graph = {
    schema_version: 1,
    identity_version: IDENTITY_VERSION,
    graph_id: `apfcg_${sourceManifestHash.slice(0, 16)}`,
    source_manifest_hash: sourceManifestHash,
    status: 'ok',
    nodes,
    edges,
    findings: [],
    metrics: {
      node_count: nodes.length,
      edge_count: edges.length,
      skill_count: nodes.length,
      verified_source_episode_count: uniqueSorted(skills.flatMap((skill) => skill.source_episodes)).length,
    },
  };
  assertApfcGraph(graph);
  return graph;
}

function episodeState(episode) {
  if (episode.verdict === 'success' && (episode.verifier_results || []).some((item) => item.outcome === 'verified')) return ['completed', 'verified'];
  if (episode.verdict === 'failed') return ['failed', 'observed'];
  return ['blocked', 'observed'];
}

function evalState(evaluation) {
  if (evaluation.status === 'ok') return ['completed', 'verified'];
  if (evaluation.status === 'critical') return ['failed', evaluation.skill_id ? 'falsified' : 'observed'];
  return ['blocked', 'observed'];
}

function receiptState(receipt) {
  if (receipt.status === 'completed') return 'completed';
  if (receipt.status === 'failed') return 'failed';
  return 'blocked';
}

function addNode(state, node, logicalKeys = []) {
  if (state.nodes.has(node.id)) throw new Error(`APFC_GRAPH_DUPLICATE_NODE: ${node.id}`);
  state.nodes.set(node.id, node);
  for (const key of logicalKeys) {
    const values = state.lookup.get(key) || [];
    values.push(node.id);
    state.lookup.set(key, values);
  }
  return node;
}

function addEdge(state, args) {
  const edge = makeEdge(args);
  if (!state.edges.has(edge.id)) state.edges.set(edge.id, edge);
  return edge;
}

function taskScope(data) {
  return { task_id: data.task_spec_id || null, project_id: data.project_id || null, release_id: IDENTITY_VERSION };
}

function riskOf(data) {
  return data.risk_level || data.risk_budget && data.risk_budget.level || 'low';
}

function projectTask(state, record) {
  const data = record.data;
  if (!data || !data.task_spec_id || !data.goal) return;
  const base = `${record.path}#`;
  const scope = taskScope(data);
  const goal = addNode(state, makeNode({
    type: 'goal', canonicalKey: `${base}/goal`, label: data.goal, sourceRefs: [`${base}/goal`], scope,
    riskLevel: riskOf(data), createdAt: data.created_at, properties: { task_spec_id: data.task_spec_id, task_type: data.task_type || null },
  }), [`task:${data.task_spec_id}`, `goal:${data.task_spec_id}`]);
  (data.constraints || []).forEach((value, index) => {
    const ref = `${base}/constraints/${index}`;
    const node = addNode(state, makeNode({ type: 'constraint', canonicalKey: ref, label: value, sourceRefs: [ref], scope, riskLevel: riskOf(data), createdAt: data.created_at, properties: { task_spec_id: data.task_spec_id, index, statement: String(value) } }));
    addEdge(state, { from: goal.id, type: 'constrained_by', to: node.id, sourceRefs: [ref], evidenceIds: [node.id] });
  });
  (data.required_evidence || []).forEach((value, index) => {
    const ref = `${base}/required_evidence/${index}`;
    const node = addNode(state, makeNode({ type: 'evidence', canonicalKey: ref, label: value.evidence_id || value.path, lifecycle: value.must_exist ? 'active' : 'blocked', sourceRefs: [ref, value.path].filter(Boolean), scope, riskLevel: riskOf(data), createdAt: data.created_at, properties: { ...value, task_spec_id: data.task_spec_id } }), [`evidence:${value.evidence_id}`]);
    addEdge(state, { from: goal.id, type: 'requires', to: node.id, sourceRefs: [ref], evidenceIds: [node.id] });
  });
  (data.actions || []).forEach((value, index) => {
    const ref = `${base}/actions/${index}`;
    const actionId = value.action_id || value.command_id || `action_${index}`;
    const node = addNode(state, makeNode({ type: 'action', canonicalKey: ref, label: actionId, sourceRefs: [ref], scope, riskLevel: riskOf(data), createdAt: data.created_at, properties: { ...value, action_id: actionId, task_spec_id: data.task_spec_id } }), [`action:${actionId}`, `task_action:${data.task_spec_id}:${actionId}`]);
    addEdge(state, { from: goal.id, type: 'decomposes_to', to: node.id, sourceRefs: [ref], evidenceIds: [node.id] });
  });
}

function projectEpisode(state, record) {
  const data = record.data;
  if (!data || !data.episode_id) return;
  const [lifecycle, epistemic] = episodeState(data);
  const ref = `${record.path}#`;
  const episode = addNode(state, makeNode({
    type: 'episode', canonicalKey: ref, label: data.task || data.episode_id, lifecycle, epistemic,
    sourceRefs: [record.path, data.verification_result_file].filter(Boolean), scope: { task_id: data.task_spec && data.task_spec.task_spec_id || null, project_id: data.project_id || null, release_id: IDENTITY_VERSION },
    riskLevel: riskOf(data), createdAt: data.created_at, properties: { episode_id: data.episode_id, task_type: data.task_type, verdict: data.verdict, task_spec_id: data.task_spec && data.task_spec.task_spec_id || null, action_input_hash: sha256Json(data.actions || []) },
  }), [`episode:${data.episode_id}`]);
  (data.observations || []).forEach((value, index) => {
    const source = `${record.path}#/observations/${index}`;
    const node = addNode(state, makeNode({ type: 'observation', canonicalKey: source, label: value.message || value.metric || value.observation_id || `Observation ${index + 1}`, sourceRefs: [source], scope: episode.scope, riskLevel: episode.risk_level, createdAt: data.created_at, properties: value }));
    addEdge(state, { from: episode.id, type: 'observed_as', to: node.id, epistemic, sourceRefs: [source], evidenceIds: [node.id] });
  });
  (data.errors || []).forEach((value, index) => {
    const source = `${record.path}#/errors/${index}`;
    const node = addNode(state, makeNode({ type: 'error', canonicalKey: source, label: value.message || value.class || `Error ${index + 1}`, lifecycle: 'failed', sourceRefs: [source], scope: episode.scope, riskLevel: episode.risk_level, createdAt: data.created_at, properties: value }));
    addEdge(state, { from: episode.id, type: 'failed_as', to: node.id, sourceRefs: [source], evidenceIds: [node.id] });
  });
  state.pending.push(() => {
    for (const skillId of data.candidate_skills || []) {
      for (const target of state.lookup.get(`skill_candidate:${skillId}`) || []) addEdge(state, { from: target, type: 'supported_by', to: episode.id, epistemic, sourceRefs: [record.path], evidenceIds: [episode.id] });
    }
    for (const verifier of data.verifier_results || []) {
      for (const target of state.lookup.get(`verification:${verifier.verifier_id}`) || []) addEdge(state, { from: episode.id, type: 'supported_by', to: target, epistemic: verifier.outcome === 'verified' ? 'verified' : 'observed', sourceRefs: [record.path], evidenceIds: [target] });
    }
  });
}

function projectReceipt(state, record) {
  const data = record.data;
  if (!data || !data.action_receipt_id) return;
  const receipt = addNode(state, makeNode({ type: 'receipt', canonicalKey: `${record.path}#`, label: data.action_receipt_id, lifecycle: receiptState(data), sourceRefs: [record.path], scope: { task_id: data.task_spec_id || null, project_id: data.project_id || null, release_id: IDENTITY_VERSION }, riskLevel: data.risk_level || 'low', createdAt: data.started_at, validFrom: data.started_at, properties: { receipt_id: data.action_receipt_id, episode_id: data.episode_id, action_id: data.action_id, tool: data.tool, status: data.status, input_hash: data.input_hash, operation: data.readback && data.readback.operation || null } }), [`receipt:${data.action_receipt_id}`]);
  const outcome = addNode(state, makeNode({ type: 'outcome', canonicalKey: `${record.path}#/observed_delta`, label: `${data.action_id} outcome`, lifecycle: receiptState(data), epistemic: 'observed', sourceRefs: [`${record.path}#/observed_delta`], scope: receipt.scope, riskLevel: receipt.risk_level, createdAt: data.completed_at, properties: data.observed_delta || {} }));
  addEdge(state, { from: receipt.id, type: 'produced', to: outcome.id, sourceRefs: [record.path], evidenceIds: [receipt.id] });
  state.pending.push(() => {
    const actions = state.lookup.get(`action:${data.action_id}`) || [];
    if (actions.length === 1) addEdge(state, { from: actions[0], type: 'produced', to: receipt.id, sourceRefs: [record.path], evidenceIds: [receipt.id] });
  });
  if (data.readback && ['apfc_rollback', 'apfc_revoke', 'apfc_restore'].includes(data.readback.operation)) {
    const rollback = addNode(state, makeNode({ type: 'rollback', canonicalKey: `${record.path}#/readback`, label: data.readback.operation, lifecycle: data.status === 'completed' ? 'completed' : 'failed', epistemic: data.status === 'completed' ? 'verified' : 'observed', sourceRefs: [record.path], scope: receipt.scope, riskLevel: receipt.risk_level, createdAt: data.completed_at, properties: data.readback }), [`rollback:${data.action_receipt_id}`]);
    addEdge(state, { from: rollback.id, type: 'rolled_back_to', to: receipt.id, epistemic: rollback.epistemic_status, sourceRefs: [record.path], evidenceIds: [receipt.id] });
  }
}

function projectVerification(state, record) {
  const data = record.data;
  if (!data || !data.verifier_id) return;
  const node = addNode(state, makeNode({ type: 'verification', canonicalKey: `${record.path}#`, label: data.verifier_id, lifecycle: data.status === 'ok' ? 'completed' : data.status === 'critical' ? 'failed' : 'blocked', epistemic: data.outcome === 'verified' ? 'verified' : data.outcome === 'failed' ? 'falsified' : 'observed', sourceRefs: [record.path, ...(data.evidence || [])], scope: { task_id: data.task_spec_id || null, project_id: data.project_id || null, release_id: IDENTITY_VERSION }, riskLevel: data.risk_level || 'low', createdAt: data.verified_at || data.created_at, properties: { verifier_id: data.verifier_id, outcome: data.outcome, status: data.status, independent_from_planner: data.independent_from_planner === true } }), [`verification:${data.verifier_id}`]);
  state.pending.push(() => {
    for (const receiptId of data.action_receipt_ids || []) {
      for (const receipt of state.lookup.get(`receipt:${receiptId}`) || []) addEdge(state, { from: receipt, type: 'verified_by', to: node.id, epistemic: node.epistemic_status, sourceRefs: [record.path], evidenceIds: [node.id] });
    }
  });
}

function projectEval(state, record) {
  const data = record.data;
  if (!data || !data.eval_id) return;
  const [lifecycle, epistemic] = evalState(data);
  const node = addNode(state, makeNode({ type: 'eval', canonicalKey: `${record.path}#`, label: data.eval_id, lifecycle, epistemic, sourceRefs: [record.path], scope: { task_id: null, project_id: data.project_id || null, release_id: IDENTITY_VERSION }, riskLevel: data.risk_level || 'low', createdAt: data.created_at || null, properties: { eval_id: data.eval_id, skill_id: data.skill_id || null, status: data.status, improves: data.improves === true, improvement_measured: data.improvement_measured === true, no_regression: data.no_regression !== false, metrics: data.metrics || {} } }), [`eval:${data.eval_id}`]);
  state.pending.push(() => {
    if (!data.skill_id) return;
    for (const skill of [...(state.lookup.get(`skill_candidate:${data.skill_id}`) || []), ...(state.lookup.get(`skill:${data.skill_id}`) || [])]) addEdge(state, { from: skill, type: 'evaluated_by', to: node.id, epistemic, sourceRefs: [record.path], evidenceIds: [node.id] });
  });
}

function projectSkillRegistry(state, record) {
  const data = record.data || {};
  const collections = [
    ['candidate_skills', 'skill_candidate'], ['promoted_skills', 'skill'],
    ['deprecated_skills', 'skill'], ['revoked_skills', 'skill'],
  ];
  for (const [field, type] of collections) {
    (data[field] || []).forEach((skill, index) => {
      if (!skill || !skill.skill_id) return;
      const ref = `${record.path}#/${field}/${index}`;
      const status = LIFECYCLES.has(skill.status) ? skill.status : 'invalid';
      const node = addNode(state, makeNode({ type, canonicalKey: ref, label: skill.title || skill.skill_id, lifecycle: status, epistemic: skill.status === 'promoted' ? 'verified' : skill.status === 'revoked' ? 'falsified' : 'observed', sourceRefs: [ref, ...(skill.source_refs || [])], scope: { task_id: null, project_id: skill.project_id || null, release_id: IDENTITY_VERSION }, riskLevel: skill.risk_level || 'low', confidence: skill.confidence, createdAt: skill.created_at || skill.promoted_at, validFrom: skill.promoted_at || skill.created_at, validTo: skill.revoked_at || skill.deprecated_at || null, properties: { ...skill, procedure: Array.isArray(skill.procedure) ? skill.procedure : [] } }), [`${type}:${skill.skill_id}`]);
      state.pending.push(() => {
        for (const episodeId of skill.source_episodes || []) for (const episode of state.lookup.get(`episode:${episodeId}`) || []) addEdge(state, { from: node.id, type: 'supported_by', to: episode, epistemic: node.epistemic_status, sourceRefs: [ref], evidenceIds: [episode] });
        for (const evalId of skill.evals || []) for (const evaluation of state.lookup.get(`eval:${evalId}`) || []) addEdge(state, { from: node.id, type: 'evaluated_by', to: evaluation, epistemic: node.epistemic_status, sourceRefs: [ref], evidenceIds: [evaluation] });
        if (type === 'skill') for (const candidate of state.lookup.get(`skill_candidate:${skill.skill_id}`) || []) addEdge(state, { from: candidate, type: 'promoted_to', to: node.id, epistemic: skill.status === 'promoted' ? 'verified' : 'observed', sourceRefs: [ref], evidenceIds: [node.id] });
      });
    });
  }
}

function projectConnectors(state, record) {
  for (const [index, connector] of (record.data && record.data.connectors || []).entries()) {
    if (!connector.connector_id) continue;
    const ref = `${record.path}#/connectors/${index}`;
    const policy = addNode(state, makeNode({ type: 'policy', canonicalKey: `${ref}/policy`, label: `${connector.connector_id} policy`, lifecycle: connector.status === 'ready' ? 'active' : 'blocked', epistemic: 'verified', sourceRefs: [ref], scope: { release_id: IDENTITY_VERSION }, riskLevel: connector.risk_level || 'medium', properties: { connector_id: connector.connector_id, permission_profile: connector.permission_profile, requires_approval: connector.requires_approval === true } }), [`policy:${connector.connector_id}`]);
    for (const [kind, capabilities] of [['read', connector.read_capabilities || []], ['write', connector.write_capabilities || []]]) {
      capabilities.forEach((capability, capIndex) => {
        const capRef = `${ref}/${kind}_capabilities/${capIndex}`;
        const node = addNode(state, makeNode({ type: 'capability', canonicalKey: capRef, label: capability, lifecycle: connector.status === 'ready' ? 'active' : 'blocked', epistemic: 'verified', sourceRefs: [capRef], scope: { release_id: IDENTITY_VERSION }, riskLevel: connector.risk_level || 'medium', properties: { connector_id: connector.connector_id, capability_id: capability, capability_kind: kind } }), [`capability:${connector.connector_id}:${capability}`]);
        addEdge(state, { from: node.id, type: 'constrained_by', to: policy.id, epistemic: 'verified', sourceRefs: [ref], evidenceIds: [policy.id] });
      });
    }
  }
}

function projectRelease(state, record) {
  const release = record.data && record.data.current_release;
  if (!release || !release.identity_version) return;
  addNode(state, makeNode({ type: 'release', canonicalKey: `${record.path}#/current_release`, label: release.release_name || release.identity_version, lifecycle: 'active', epistemic: 'verified', sourceRefs: [record.path], scope: { release_id: release.identity_version }, properties: release }), [`release:${release.identity_version}`]);
}

function projectContextIndex(state, record) {
  for (const [index, pack] of (record.data && record.data.packs || []).entries()) {
    const packId = pack.context_pack_id || pack.pack_id;
    if (!packId) continue;
    const ref = `${record.path}#/packs/${index}`;
    addNode(state, makeNode({ type: 'context_pack', canonicalKey: ref, label: packId, lifecycle: pack.status === 'critical' ? 'blocked' : 'active', epistemic: 'observed', sourceRefs: [ref, pack.path].filter(Boolean), scope: { task_id: pack.task_spec_id || null, release_id: IDENTITY_VERSION }, properties: pack }), [`context_pack:${packId}`]);
  }
}

function projectCanonicalSources(records, sourceManifest) {
  const state = { nodes: new Map(), edges: new Map(), lookup: new Map(), pending: [], findings: [] };
  const handlers = {
    task: projectTask,
    episode: projectEpisode,
    receipt: projectReceipt,
    verification: projectVerification,
    eval: projectEval,
    skill_registry: projectSkillRegistry,
    connector_registry: projectConnectors,
    release_index: projectRelease,
    context_index: projectContextIndex,
  };
  for (const record of (records || []).slice().sort((left, right) => left.path.localeCompare(right.path))) {
    const handler = handlers[record.kind];
    if (!handler) continue;
    try { handler(state, record); } catch (error) {
      state.findings.push({ finding_id: `projection_${sha256Text(`${record.path}:${error.message}`).slice(0, 12)}`, status: 'critical', source: record.path, message: error.message });
    }
  }
  for (const deferred of state.pending) {
    try { deferred(); } catch (error) {
      state.findings.push({ finding_id: `relation_${sha256Text(error.message).slice(0, 12)}`, status: 'critical', source: 'deferred_relation', message: error.message });
    }
  }
  const nodes = [...state.nodes.values()].sort((left, right) => left.id.localeCompare(right.id));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = [...state.edges.values()].filter((edge) => {
    if (nodeIds.has(edge.from) && nodeIds.has(edge.to)) return true;
    state.findings.push({ finding_id: `unresolved_${edge.id}`, status: 'critical', source: edge.source_refs[0] || 'unknown', message: `Unresolved edge ${edge.from} -> ${edge.to}` });
    return false;
  }).sort((left, right) => left.id.localeCompare(right.id));
  const sourceManifestHash = sha256Json(sourceManifest);
  const critical = state.findings.some((finding) => finding.status === 'critical');
  const attention = state.findings.some((finding) => finding.status === 'attention');
  const graph = {
    schema_version: 1,
    identity_version: IDENTITY_VERSION,
    graph_id: `apfcg_${sourceManifestHash.slice(0, 16)}`,
    source_manifest_hash: sourceManifestHash,
    status: critical ? 'critical' : attention ? 'attention' : 'ok',
    nodes,
    edges,
    findings: state.findings.slice().sort((left, right) => left.finding_id.localeCompare(right.finding_id)),
    metrics: {
      node_count: nodes.length,
      edge_count: edges.length,
      skill_count: nodes.filter((node) => node.type === 'skill' || node.type === 'skill_candidate').length,
      verified_source_episode_count: nodes.filter((node) => node.type === 'episode' && node.epistemic_status === 'verified').length,
    },
  };
  assertApfcGraph(graph);
  return graph;
}

module.exports = {
  EDGE_TYPES,
  EPISTEMIC,
  IDENTITY_VERSION,
  LIFECYCLES,
  NODE_TYPES,
  assertApfcGraph,
  buildSkillGraph,
  canonicalNodeId,
  makeEdge,
  makeNode,
  projectCanonicalSources,
  uniqueSorted,
};
