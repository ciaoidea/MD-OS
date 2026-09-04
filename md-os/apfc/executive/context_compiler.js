#!/usr/bin/env node
'use strict';

const {
  canonicalJson,
  sha256Json,
  shortText,
} = require('../../os/lib/common');
const { assertApfcGraph } = require('./graph_projector');

function tokenize(value) {
  return [...new Set(String(value || '')
    .normalize('NFKC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean))];
}

function jaccard(left, right) {
  const a = new Set(tokenize(left));
  const b = new Set(tokenize(right));
  if (!a.size && !b.size) return 1;
  const intersection = [...a].filter((token) => b.has(token)).length;
  const union = new Set([...a, ...b]).size;
  return union ? intersection / union : 0;
}

function graphHash(graph) {
  return sha256Json(graph);
}

function enumerateShortestPaths(graph, startType, goalType, maximumDepth = 16) {
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map();
  for (const edge of graph.edges) {
    const list = outgoing.get(edge.from) || [];
    list.push(edge.to);
    outgoing.set(edge.from, list);
  }
  for (const list of outgoing.values()) list.sort();
  const starts = graph.nodes
    .filter((node) => node.properties.input_type === startType)
    .map((node) => node.id)
    .sort();
  const queue = starts.map((nodeId) => [nodeId]);
  const solutions = [];
  let shortest = null;
  while (queue.length) {
    const path = queue.shift();
    if (shortest !== null && path.length > shortest) break;
    const tail = nodesById.get(path.at(-1));
    if (tail.properties.output_type === goalType) {
      shortest = path.length;
      solutions.push(path);
      if (solutions.length > 2) break;
      continue;
    }
    if (path.length >= maximumDepth) continue;
    for (const next of outgoing.get(tail.id) || []) {
      if (path.includes(next)) continue;
      queue.push([...path, next]);
    }
  }
  return solutions;
}

function assertContextPack(pack) {
  if (!pack || pack.schema_version !== 1 || !/^apfc_ctx_/.test(String(pack.context_pack_id || ''))) {
    throw new Error('APFC_CONTEXT_PACK_HEADER_INVALID');
  }
  if (!['ok', 'attention'].includes(pack.status)) throw new Error('APFC_CONTEXT_PACK_NOT_EXECUTABLE');
  const nodeIds = pack.nodes.map((node) => node.id);
  if (JSON.stringify(nodeIds.slice().sort()) !== JSON.stringify(pack.selected_node_ids)) {
    throw new Error('APFC_CONTEXT_PACK_SELECTED_IDS_INVALID');
  }
  const selected = new Set(nodeIds);
  for (const edge of pack.edges || []) {
    if (!selected.has(edge.from) || !selected.has(edge.to)) throw new Error(`APFC_CONTEXT_PACK_EDGE_ENDPOINT_MISSING: ${edge.id}`);
  }
  if (pack.composition) {
    if (pack.composition.unique_shortest_path !== true) throw new Error('APFC_CONTEXT_PACK_NOT_EXECUTABLE');
    if (pack.composition.path_node_ids.length < 2) throw new Error('APFC_CONTEXT_PACK_COMPOSITION_TOO_SHORT');
    const ordered = pack.composition.path_node_ids.map((nodeId) => pack.nodes.find((node) => node.id === nodeId));
    if (ordered.some((node) => !node)) throw new Error('APFC_CONTEXT_PACK_PATH_NODE_MISSING');
    for (let index = 1; index < ordered.length; index += 1) {
      if (ordered[index - 1].properties.output_type !== ordered[index].properties.input_type) throw new Error('APFC_CONTEXT_PACK_PATH_TYPE_MISMATCH');
    }
    if (pack.composition.path_types[0] !== pack.composition.start_type
      || pack.composition.path_types.at(-1) !== pack.composition.goal_type) throw new Error('APFC_CONTEXT_PACK_TYPE_BOUNDARY_INVALID');
  }
  return true;
}

const EPISTEMIC_RANK = {
  verified: 6,
  observed: 5,
  hypothetical: 4,
  superseded: 3,
  falsified: 2,
  invalid: 1,
};

function normalizedStatement(value) {
  return String(value || '').normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim();
}

function provenanceRank(node) {
  const sourceCount = Array.isArray(node.source_refs) ? node.source_refs.length : 0;
  const hashBound = /^[a-f0-9]{64}$/.test(String(node.content_hash || '')) ? 1 : 0;
  return hashBound + Math.min(sourceCount, 4);
}

function compileOperationalContextPack(graph, taskSpec, limits = {}) {
  assertApfcGraph(graph);
  const taskSpecId = shortText(taskSpec && taskSpec.task_spec_id);
  if (!taskSpecId || !shortText(taskSpec.goal)) throw new Error('APFC_OPERATIONAL_CONTEXT_TASK_CONTRACT_INVALID');
  const maximumNodes = Number.isFinite(limits.maximum_nodes) ? limits.maximum_nodes : 128;
  const maximumBytes = Number.isFinite(limits.maximum_bytes) ? limits.maximum_bytes : 65536;
  const nodeMap = new Map(graph.nodes.map((node) => [node.id, node]));
  const selected = new Set();
  const mandatory = new Set();
  const trace = [];
  const direct = new Set();
  const optionalRanks = new Map();
  const nodeOverlays = new Map();
  const exactStatements = new Set([
    ...(taskSpec.constraints || []),
    ...(taskSpec.required_evidence || []).map((item) => item.statement || item.evidence_id || item.path),
  ].map(normalizedStatement).filter(Boolean));

  const include = (nodeId, ruleId, isMandatory = false) => {
    if (!nodeMap.has(nodeId)) return;
    selected.add(nodeId);
    direct.add(nodeId);
    if (isMandatory) mandatory.add(nodeId);
    trace.push({
      node_id: nodeId,
      rule_id: ruleId,
      candidate_generated: true,
      relevance_score: null,
      matched_informative_terms: [],
      admission_reason: 'mandatory_task_dependency',
      rank_tuple: [],
      final_rank: null,
      omission_reason: null,
      included: true,
    });
  };

  const taskNodes = graph.nodes.filter((node) => (
    node.properties && node.properties.task_spec_id === taskSpecId
    || node.scope && node.scope.task_id === taskSpecId
  ));
  for (const node of taskNodes) include(node.id, 'task_seed', true);
  const adjacency = new Map();
  for (const edge of graph.edges) {
    const list = adjacency.get(edge.from) || [];
    list.push(edge);
    adjacency.set(edge.from, list);
  }
  const mandatoryRelationTypes = new Set(['requires', 'constrained_by', 'executed_via', 'verified_by', 'invalidated_by', 'rolled_back_to']);
  for (const seed of [...mandatory]) {
    for (const edge of adjacency.get(seed) || []) {
      if (mandatoryRelationTypes.has(edge.type)) include(edge.to, `mandatory_${edge.type}`, true);
    }
  }

  const promotedSkills = graph.nodes.filter((node) => node.type === 'skill'
    && node.lifecycle_status === 'promoted'
    && (node.properties.domain === taskSpec.task_type || (node.properties.task_types || []).includes(taskSpec.task_type)));
  for (const node of promotedSkills) {
    const preconditions = node.properties.preconditions || [];
    const unmatched = preconditions.filter((item) => !exactStatements.has(normalizedStatement(item)));
    nodeOverlays.set(node.id, {
      ...node,
      properties: {
        ...node.properties,
        apfc_execution_inhibited: unmatched.length > 0,
        apfc_unmatched_preconditions: unmatched,
      },
    });
  }

  const query = [taskSpec.goal, ...(taskSpec.constraints || [])].join(' ');
  const queryTerms = new Set(tokenize(query));
  const candidateRows = graph.nodes.filter((node) => !selected.has(node.id)).map((node) => {
    const card = [node.label, node.type, node.properties && node.properties.domain, JSON.stringify(node.properties || {})].join(' ');
    const score = jaccard(query, card);
    const matchedTerms = tokenize(card).filter((term) => queryTerms.has(term)).sort();
    const admitted = score > 0 && matchedTerms.length > 0;
    return {
      node,
      score,
      matchedTerms,
      admitted,
      rank: [
        EPISTEMIC_RANK[node.epistemic_status] || 0,
        provenanceRank(node),
        node.type === 'skill' && node.lifecycle_status === 'promoted' ? 1 : 0,
        score,
        String(node.valid_from || node.created_at || ''),
        node.id,
      ],
    };
  }).sort((left, right) => (
    right.rank[0] - left.rank[0]
    || right.rank[1] - left.rank[1]
    || right.rank[2] - left.rank[2]
    || right.rank[3] - left.rank[3]
    || String(right.rank[4]).localeCompare(String(left.rank[4]))
    || left.node.id.localeCompare(right.node.id)
  ));

  let finalRank = 0;
  for (const row of candidateRows) {
    if (!row.admitted) {
      trace.push({
        node_id: row.node.id,
        rule_id: 'relevance_policy_v2',
        candidate_generated: true,
        relevance_score: row.score,
        matched_informative_terms: row.matchedTerms,
        admission_reason: 'zero_relevance',
        rank_tuple: row.rank,
        final_rank: null,
        omission_reason: 'relevance_gate',
        included: false,
      });
      continue;
    }
    finalRank += 1;
    const withinNodeBudget = selected.size < maximumNodes;
    if (withinNodeBudget) {
      selected.add(row.node.id);
      optionalRanks.set(row.node.id, finalRank);
    }
    trace.push({
      node_id: row.node.id,
      rule_id: 'relevance_policy_v2',
      candidate_generated: true,
      relevance_score: row.score,
      matched_informative_terms: row.matchedTerms,
      admission_reason: 'informative_overlap',
      rank_tuple: row.rank,
      final_rank: finalRank,
      omission_reason: withinNodeBudget ? null : 'node_budget',
      included: withinNodeBudget,
    });
  }
  const makePack = (ids) => {
    const selectedIds = [...ids].sort();
    const selectedSet = new Set(selectedIds);
    const nodes = selectedIds.map((id) => nodeOverlays.get(id) || nodeMap.get(id));
    const edges = graph.edges.filter((edge) => selectedSet.has(edge.from) && selectedSet.has(edge.to)).sort((left, right) => left.id.localeCompare(right.id));
    const base = {
      schema_version: 1,
      context_pack_id: `apfc_ctx_${taskSpecId}_${graphHash(graph).slice(0, 10)}`,
      graph_id: graph.graph_id,
      graph_content_hash: graphHash(graph),
      task_spec_id: taskSpecId,
      task_spec_hash: sha256Json(taskSpec),
      status: graph.status === 'critical' ? 'critical' : graph.status,
      mandatory_node_ids: [...mandatory].sort(),
      selected_node_ids: selectedIds,
      nodes,
      edges,
      omissions: graph.nodes.filter((node) => !selectedSet.has(node.id)).map((node) => {
        const decision = trace.find((entry) => entry.node_id === node.id);
        return {
          node_id: node.id,
          selection_tier: decision && decision.admission_reason === 'zero_relevance' ? 'relevance' : 'budget',
          rank_tuple: decision ? decision.rank_tuple : [],
          exclusion_reason: decision && decision.omission_reason ? decision.omission_reason : 'node_or_byte_budget',
        };
      }),
      selection_trace: trace.slice().sort((left, right) => left.node_id.localeCompare(right.node_id) || left.rule_id.localeCompare(right.rule_id)),
      source_hashes: [...new Set(nodes.map((node) => node.content_hash))].sort(),
      serialized_bytes: 0,
      findings: [],
    };
    base.serialized_bytes = Buffer.byteLength(canonicalJson(base), 'utf8');
    return base;
  };
  let pack = makePack(selected);
  if (mandatory.size > maximumNodes) throw new Error('APFC_CONTEXT_MANDATORY_NODE_BUDGET_EXCEEDED');
  while (pack.serialized_bytes > maximumBytes) {
    const removable = [...selected]
      .filter((id) => !mandatory.has(id))
      .sort((left, right) => (optionalRanks.get(right) || 0) - (optionalRanks.get(left) || 0))[0];
    if (!removable) throw new Error('APFC_CONTEXT_MANDATORY_BYTE_BUDGET_EXCEEDED');
    selected.delete(removable);
    const decision = trace.find((entry) => entry.node_id === removable && entry.included);
    if (decision) {
      decision.included = false;
      decision.omission_reason = 'byte_budget_lowest_ranked_optional';
    }
    pack = makePack(selected);
  }
  assertContextPack(pack);
  return pack;
}

function compileContextPack(graph, taskSpec) {
  assertApfcGraph(graph);
  const taskSpecId = shortText(taskSpec.task_spec_id);
  const familyId = shortText(taskSpec.family_id);
  const startType = shortText(taskSpec.start_type);
  const goalType = shortText(taskSpec.goal_type);
  if (!taskSpecId || !familyId || !startType || !goalType) throw new Error('APFC_CONTEXT_TASK_CONTRACT_INVALID');
  const paths = enumerateShortestPaths(graph, startType, goalType);
  if (paths.length !== 1) throw new Error(`APFC_CONTEXT_UNIQUE_PATH_REQUIRED: ${familyId}:${paths.length}`);
  const pathNodeIds = paths[0];
  const selected = pathNodeIds.map((nodeId) => graph.nodes.find((node) => node.id === nodeId));
  if (selected.some((node) => node.properties.source_family_id === familyId)) {
    throw new Error(`APFC_CONTEXT_TARGET_FAMILY_CONTAMINATION: ${familyId}`);
  }
  const selectedIds = pathNodeIds.slice().sort();
  const selectedIdSet = new Set(selectedIds);
  const edges = graph.edges
    .filter((edge) => selectedIdSet.has(edge.from) && selectedIdSet.has(edge.to)
      && pathNodeIds.indexOf(edge.to) === pathNodeIds.indexOf(edge.from) + 1)
    .sort((left, right) => left.id.localeCompare(right.id));
  const pathTypes = [startType, ...selected.map((node) => node.properties.output_type)];
  const graphContentHash = graphHash(graph);
  const taskSpecHash = sha256Json(taskSpec);
  const base = {
    schema_version: 1,
    context_pack_id: `apfc_ctx_${taskSpecId}_${graphContentHash.slice(0, 10)}`,
    graph_id: graph.graph_id,
    graph_content_hash: graphContentHash,
    task_spec_id: taskSpecId,
    task_spec_hash: taskSpecHash,
    status: 'ok',
    mandatory_node_ids: selectedIds,
    selected_node_ids: selectedIds,
    nodes: selected.slice().sort((left, right) => left.id.localeCompare(right.id)),
    edges,
    omissions: graph.nodes
      .filter((node) => !selectedIdSet.has(node.id))
      .map((node) => ({ node_id: node.id, selection_tier: 'typed_path', rank_tuple: [], exclusion_reason: 'not_on_unique_shortest_typed_path' })),
    selection_trace: graph.nodes.map((node) => ({
      node_id: node.id,
      rule_id: 'unique_shortest_typed_path_v1',
      rank_tuple: [pathNodeIds.indexOf(node.id)],
      included: selectedIdSet.has(node.id),
    })),
    source_hashes: [...new Set(selected.map((node) => node.content_hash))].sort(),
    serialized_bytes: 0,
    findings: [],
    composition: {
      family_id: familyId,
      start_type: startType,
      goal_type: goalType,
      path_node_ids: pathNodeIds,
      path_skill_ids: pathNodeIds.slice(),
      path_types: pathTypes,
      unique_shortest_path: true,
      target_specific_skill_present: false,
    },
  };
  base.serialized_bytes = Buffer.byteLength(canonicalJson(base), 'utf8');
  assertContextPack(base);
  return base;
}

function flatRetrieveSkills(graph, taskSpec, count) {
  assertApfcGraph(graph);
  const query = [
    taskSpec.family_id,
    taskSpec.goal,
    taskSpec.start_type,
    taskSpec.goal_type,
  ].join(' ');
  return graph.nodes
    .map((node) => {
      const card = [
        node.label,
        node.properties.domain,
        node.properties.input_type,
        node.properties.output_type,
        ...node.properties.procedure,
      ].join(' ');
      return { node, score: jaccard(query, card) };
    })
    .sort((left, right) => right.score - left.score || left.node.id.localeCompare(right.node.id))
    .slice(0, count)
    .map((entry) => ({ ...entry.node, retrieval_score: entry.score }));
}

module.exports = {
  assertContextPack,
  compileContextPack,
  compileOperationalContextPack,
  enumerateShortestPaths,
  flatRetrieveSkills,
  graphHash,
  jaccard,
  tokenize,
};
