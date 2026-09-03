#!/usr/bin/env node
'use strict';

const { sha256Json } = require('./general_program_synthesis');

const EPISTEMIC_STATUSES = Object.freeze([
  'hypothetical',
  'observed',
  'verified',
  'falsified',
  'superseded',
  'invalid',
]);
const PARTICIPANT_ROLES = Object.freeze(['source', 'target', 'context']);

function fail(code) {
  throw new Error(code);
}

function uniqueStrings(values, code, required = false) {
  if (!Array.isArray(values) || (required && values.length === 0)) fail(code);
  const normalized = values.map((value) => String(value || '').trim());
  if (normalized.some((value) => !value)) fail(code);
  return [...new Set(normalized)].sort((left, right) => left.localeCompare(right));
}

function isoOrNull(value, code) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !value.trim() || Number.isNaN(Date.parse(value))) fail(code);
  return value;
}

function boundedMeasure(value, code) {
  if (value === null || value === undefined) return null;
  if (!Number.isFinite(value) || value < 0 || value > 1) fail(code);
  return value;
}

function withoutHash(value, hashKey) {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== hashKey));
}

function assertSparseCorrelationSkeleton(skeleton) {
  if (!skeleton || skeleton.schema_version !== 1
    || skeleton.artifact_role !== 'sparse_correlation_skeleton'
    || skeleton.scope !== 'bounded_external_correlational_skeleton'
    || skeleton.representation !== 'sparse_typed_temporal_correlation_hypergraph') {
    fail('CORRELATION_SKELETON_HEADER_INVALID');
  }
  if (!/^correlation_skeleton_[a-z0-9_]+$/.test(String(skeleton.skeleton_id || ''))) {
    fail('CORRELATION_SKELETON_ID_INVALID');
  }
  if (!Array.isArray(skeleton.nodes) || skeleton.nodes.length < 2
    || !Array.isArray(skeleton.correlations) || !skeleton.correlations.length) {
    fail('CORRELATION_SKELETON_CONTENT_REQUIRED');
  }
  const nodeMap = new Map();
  const domainIds = new Set();
  for (const node of skeleton.nodes) {
    if (!node || typeof node.node_id !== 'string' || !node.node_id
      || typeof node.domain_id !== 'string' || !node.domain_id) {
      fail('CORRELATION_SKELETON_NODE_INVALID');
    }
    if (nodeMap.has(node.node_id)) fail('CORRELATION_SKELETON_NODE_DUPLICATE');
    if (!Array.isArray(node.source_refs) || !node.source_refs.length) fail('CORRELATION_SKELETON_NODE_PROVENANCE_REQUIRED');
    if (sha256Json(withoutHash(node, 'content_hash')) !== node.content_hash) fail('CORRELATION_SKELETON_NODE_HASH_INVALID');
    nodeMap.set(node.node_id, node);
    domainIds.add(node.domain_id);
  }
  if (domainIds.size < 2) fail('CORRELATION_SKELETON_MULTIPLE_DOMAINS_REQUIRED');

  const correlationIds = new Set();
  for (const correlation of skeleton.correlations) {
    if (!correlation || typeof correlation.correlation_id !== 'string' || !correlation.correlation_id) {
      fail('CORRELATION_SKELETON_CORRELATION_INVALID');
    }
    if (correlationIds.has(correlation.correlation_id)) fail('CORRELATION_SKELETON_CORRELATION_DUPLICATE');
    correlationIds.add(correlation.correlation_id);
    if (!EPISTEMIC_STATUSES.includes(correlation.epistemic_status)) fail('CORRELATION_SKELETON_EPISTEMIC_INVALID');
    if (!Array.isArray(correlation.participants) || correlation.participants.length < 2) {
      fail('CORRELATION_SKELETON_PARTICIPANTS_REQUIRED');
    }
    const participantIds = new Set();
    const participantDomains = new Set();
    let sourceCount = 0;
    let targetCount = 0;
    for (const participant of correlation.participants) {
      if (!participant || !nodeMap.has(participant.node_id) || !PARTICIPANT_ROLES.includes(participant.role)) {
        fail('CORRELATION_SKELETON_PARTICIPANT_INVALID');
      }
      if (participantIds.has(participant.node_id)) fail('CORRELATION_SKELETON_PARTICIPANT_DUPLICATE');
      participantIds.add(participant.node_id);
      participantDomains.add(nodeMap.get(participant.node_id).domain_id);
      if (participant.role === 'source') sourceCount += 1;
      if (participant.role === 'target') targetCount += 1;
    }
    if (!sourceCount || !targetCount || participantDomains.size < 2) {
      fail('CORRELATION_SKELETON_CROSS_DOMAIN_ROLES_REQUIRED');
    }
    if (!Array.isArray(correlation.source_refs) || !correlation.source_refs.length) {
      fail('CORRELATION_SKELETON_CORRELATION_PROVENANCE_REQUIRED');
    }
    if (correlation.epistemic_status === 'verified') {
      const verification = correlation.verification || {};
      if (verification.status !== 'passed' || verification.independent !== true
        || !verification.verifier_id || !Array.isArray(verification.evidence_refs)
        || !verification.evidence_refs.length) {
        fail('CORRELATION_SKELETON_VERIFICATION_REQUIRED');
      }
    }
    if (sha256Json(withoutHash(correlation, 'content_hash')) !== correlation.content_hash) {
      fail('CORRELATION_SKELETON_CORRELATION_HASH_INVALID');
    }
  }

  if (!skeleton.metrics || skeleton.metrics.domain_count !== domainIds.size
    || skeleton.metrics.node_count !== skeleton.nodes.length
    || skeleton.metrics.materialized_correlation_count !== skeleton.correlations.length
    || skeleton.metrics.dense_coordinates_materialized !== false) {
    fail('CORRELATION_SKELETON_METRICS_INVALID');
  }
  const domainCounts = [...nodeMap.values()].reduce((counts, node) => {
    counts.set(node.domain_id, (counts.get(node.domain_id) || 0n) + 1n);
    return counts;
  }, new Map());
  const counts = [...domainCounts.values()];
  let theoreticalBinaryCoordinates = 0n;
  for (let left = 0; left < counts.length; left += 1) {
    for (let right = left + 1; right < counts.length; right += 1) {
      theoreticalBinaryCoordinates += counts[left] * counts[right];
    }
  }
  if (skeleton.metrics.theoretical_binary_cross_domain_coordinates !== theoreticalBinaryCoordinates.toString()) {
    fail('CORRELATION_SKELETON_DENSE_BOUND_INVALID');
  }
  const sortedNodeIds = [...nodeMap.keys()].sort((left, right) => left.localeCompare(right));
  const sortedCorrelationIds = [...correlationIds].sort((left, right) => left.localeCompare(right));
  if (JSON.stringify(sortedNodeIds) !== JSON.stringify(skeleton.nodes.map((node) => node.node_id))) {
    fail('CORRELATION_SKELETON_NODE_ORDER_INVALID');
  }
  if (JSON.stringify(sortedCorrelationIds) !== JSON.stringify(skeleton.correlations.map((item) => item.correlation_id))) {
    fail('CORRELATION_SKELETON_CORRELATION_ORDER_INVALID');
  }
  if (sha256Json(withoutHash(skeleton, 'skeleton_hash')) !== skeleton.skeleton_hash) {
    fail('CORRELATION_SKELETON_HASH_INVALID');
  }
  return true;
}

function buildSparseCorrelationSkeleton(input) {
  if (!input || input.schema_version !== 1
    || !/^correlation_skeleton_[a-z0-9_]+$/.test(String(input.skeleton_id || ''))) {
    fail('CORRELATION_SKELETON_INPUT_INVALID');
  }
  const createdAt = isoOrNull(input.created_at, 'CORRELATION_SKELETON_CREATED_AT_INVALID');
  if (!createdAt) fail('CORRELATION_SKELETON_CREATED_AT_REQUIRED');
  if (!Array.isArray(input.nodes) || input.nodes.length < 2) fail('CORRELATION_SKELETON_NODES_REQUIRED');

  const nodes = input.nodes.map((node) => {
    if (!node || typeof node.node_id !== 'string' || !node.node_id.trim()
      || typeof node.domain_id !== 'string' || !node.domain_id.trim()) {
      fail('CORRELATION_SKELETON_NODE_INVALID');
    }
    const content = {
      node_id: node.node_id.trim(),
      domain_id: node.domain_id.trim(),
      label: String(node.label || node.node_id).trim(),
      source_refs: uniqueStrings(node.source_refs, 'CORRELATION_SKELETON_NODE_PROVENANCE_REQUIRED', true),
      properties: node.properties && typeof node.properties === 'object' && !Array.isArray(node.properties)
        ? node.properties : {},
    };
    return { ...content, content_hash: sha256Json(content) };
  }).sort((left, right) => left.node_id.localeCompare(right.node_id));
  const nodeMap = new Map();
  for (const node of nodes) {
    if (nodeMap.has(node.node_id)) fail('CORRELATION_SKELETON_NODE_DUPLICATE');
    nodeMap.set(node.node_id, node);
  }
  if (new Set(nodes.map((node) => node.domain_id)).size < 2) fail('CORRELATION_SKELETON_MULTIPLE_DOMAINS_REQUIRED');
  if (!Array.isArray(input.correlations) || !input.correlations.length) fail('CORRELATION_SKELETON_CORRELATIONS_REQUIRED');

  const correlations = input.correlations.map((correlation) => {
    if (!correlation || typeof correlation.correlation_id !== 'string' || !correlation.correlation_id.trim()
      || !/^[a-z][a-z0-9_]*$/.test(String(correlation.relation_type || ''))) {
      fail('CORRELATION_SKELETON_CORRELATION_INVALID');
    }
    if (!EPISTEMIC_STATUSES.includes(correlation.epistemic_status)) fail('CORRELATION_SKELETON_EPISTEMIC_INVALID');
    if (!Array.isArray(correlation.participants) || correlation.participants.length < 2) {
      fail('CORRELATION_SKELETON_PARTICIPANTS_REQUIRED');
    }
    const participants = correlation.participants.map((participant) => {
      if (!participant || !nodeMap.has(participant.node_id) || !PARTICIPANT_ROLES.includes(participant.role)) {
        fail('CORRELATION_SKELETON_PARTICIPANT_INVALID');
      }
      return { node_id: participant.node_id, role: participant.role };
    }).sort((left, right) => left.role.localeCompare(right.role) || left.node_id.localeCompare(right.node_id));
    if (new Set(participants.map((participant) => participant.node_id)).size !== participants.length) {
      fail('CORRELATION_SKELETON_PARTICIPANT_DUPLICATE');
    }
    if (!participants.some((participant) => participant.role === 'source')
      || !participants.some((participant) => participant.role === 'target')) {
      fail('CORRELATION_SKELETON_SOURCE_TARGET_REQUIRED');
    }
    if (new Set(participants.map((participant) => nodeMap.get(participant.node_id).domain_id)).size < 2) {
      fail('CORRELATION_SKELETON_CROSS_DOMAIN_REQUIRED');
    }

    const rawVerification = correlation.verification && typeof correlation.verification === 'object'
      ? correlation.verification : {};
    const verification = {
      status: ['unverified', 'passed', 'failed'].includes(rawVerification.status)
        ? rawVerification.status : 'unverified',
      verifier_id: rawVerification.verifier_id ? String(rawVerification.verifier_id) : null,
      independent: rawVerification.independent === true,
      evidence_refs: uniqueStrings(
        rawVerification.evidence_refs || [],
        'CORRELATION_SKELETON_VERIFICATION_EVIDENCE_INVALID',
      ),
    };
    if (correlation.epistemic_status === 'verified'
      && (verification.status !== 'passed' || !verification.independent
        || !verification.verifier_id || !verification.evidence_refs.length)) {
      fail('CORRELATION_SKELETON_VERIFICATION_REQUIRED');
    }
    const validFrom = isoOrNull(correlation.valid_from, 'CORRELATION_SKELETON_VALID_FROM_INVALID');
    const validTo = isoOrNull(correlation.valid_to, 'CORRELATION_SKELETON_VALID_TO_INVALID');
    if (validFrom && validTo && Date.parse(validFrom) > Date.parse(validTo)) {
      fail('CORRELATION_SKELETON_VALIDITY_INTERVAL_INVALID');
    }
    const rawFrequency = correlation.measures && correlation.measures.frequency;
    if (rawFrequency !== null && rawFrequency !== undefined
      && (!Number.isInteger(rawFrequency) || rawFrequency < 0)) {
      fail('CORRELATION_SKELETON_FREQUENCY_INVALID');
    }
    const content = {
      correlation_id: correlation.correlation_id.trim(),
      relation_type: correlation.relation_type,
      directed: correlation.directed !== false,
      participants,
      epistemic_status: correlation.epistemic_status,
      source_refs: uniqueStrings(correlation.source_refs, 'CORRELATION_SKELETON_CORRELATION_PROVENANCE_REQUIRED', true),
      support_refs: uniqueStrings(correlation.support_refs || [], 'CORRELATION_SKELETON_SUPPORT_INVALID'),
      contradiction_refs: uniqueStrings(correlation.contradiction_refs || [], 'CORRELATION_SKELETON_CONTRADICTION_INVALID'),
      verification,
      valid_from: validFrom,
      valid_to: validTo,
      measures: {
        semantic_similarity: boundedMeasure(
          correlation.measures && correlation.measures.semantic_similarity,
          'CORRELATION_SKELETON_SEMANTIC_SIMILARITY_INVALID',
        ),
        confidence: boundedMeasure(
          correlation.measures && correlation.measures.confidence,
          'CORRELATION_SKELETON_CONFIDENCE_INVALID',
        ),
        causal_support: boundedMeasure(
          correlation.measures && correlation.measures.causal_support,
          'CORRELATION_SKELETON_CAUSAL_SUPPORT_INVALID',
        ),
        frequency: rawFrequency === undefined ? null : rawFrequency,
      },
      properties: correlation.properties && typeof correlation.properties === 'object'
        && !Array.isArray(correlation.properties) ? correlation.properties : {},
    };
    return { ...content, content_hash: sha256Json(content) };
  }).sort((left, right) => left.correlation_id.localeCompare(right.correlation_id));
  if (new Set(correlations.map((correlation) => correlation.correlation_id)).size !== correlations.length) {
    fail('CORRELATION_SKELETON_CORRELATION_DUPLICATE');
  }

  const domainCounts = nodes.reduce((counts, node) => {
    counts.set(node.domain_id, (counts.get(node.domain_id) || 0n) + 1n);
    return counts;
  }, new Map());
  const counts = [...domainCounts.values()];
  let theoreticalBinaryCoordinates = 0n;
  for (let left = 0; left < counts.length; left += 1) {
    for (let right = left + 1; right < counts.length; right += 1) {
      theoreticalBinaryCoordinates += counts[left] * counts[right];
    }
  }
  const payload = {
    schema_version: 1,
    artifact_role: 'sparse_correlation_skeleton',
    skeleton_id: input.skeleton_id,
    created_at: createdAt,
    status: 'ready',
    scope: 'bounded_external_correlational_skeleton',
    representation: 'sparse_typed_temporal_correlation_hypergraph',
    nodes,
    correlations,
    metrics: {
      domain_count: domainCounts.size,
      node_count: nodes.length,
      materialized_correlation_count: correlations.length,
      theoretical_binary_cross_domain_coordinates: theoreticalBinaryCoordinates.toString(),
      dense_coordinates_materialized: false,
    },
    non_claims: [
      'not a dense materialization of the tensor-product possibility space',
      'not a quantum-physical state or quantum computation claim',
      'correlation is not causal evidence by itself',
      'unverified correlations are not world-grounded truth',
      'not direct access to host-model hidden layers',
      'sparse correlation alone does not complete the consciousness predicate or establish AGI',
    ],
  };
  const skeleton = { ...payload, skeleton_hash: sha256Json(payload) };
  assertSparseCorrelationSkeleton(skeleton);
  return skeleton;
}

function correlationActive(correlation, query, availableContextIds, disabledCorrelationIds) {
  if (disabledCorrelationIds.has(correlation.correlation_id)) return false;
  if (!query.admitted_epistemic_statuses.includes(correlation.epistemic_status)) return false;
  if (['falsified', 'superseded', 'invalid'].includes(correlation.epistemic_status)) return false;
  if (correlation.contradiction_refs.length && !query.admit_contested) return false;
  if (correlation.verification.status === 'failed') return false;
  if ((correlation.valid_from || correlation.valid_to) && !query.as_of) fail('CORRELATION_SKELETON_QUERY_AS_OF_REQUIRED');
  if (query.as_of && correlation.valid_from && Date.parse(query.as_of) < Date.parse(correlation.valid_from)) return false;
  if (query.as_of && correlation.valid_to && Date.parse(query.as_of) > Date.parse(correlation.valid_to)) return false;
  return correlation.participants
    .filter((participant) => participant.role === 'context')
    .every((participant) => availableContextIds.has(participant.node_id));
}

function findSparseCorrelationPath(skeleton, input = {}) {
  assertSparseCorrelationSkeleton(skeleton);
  const query = {
    source_node_id: String(input.source_node_id || ''),
    target_node_id: String(input.target_node_id || ''),
    as_of: isoOrNull(input.as_of, 'CORRELATION_SKELETON_QUERY_AS_OF_INVALID'),
    max_hops: Number.isInteger(input.max_hops) ? input.max_hops : 8,
    admitted_epistemic_statuses: uniqueStrings(
      input.admitted_epistemic_statuses || ['observed', 'verified'],
      'CORRELATION_SKELETON_QUERY_EPISTEMIC_INVALID',
      true,
    ),
    admit_contested: input.admit_contested === true,
    available_context_node_ids: uniqueStrings(
      input.available_context_node_ids || [],
      'CORRELATION_SKELETON_QUERY_CONTEXT_INVALID',
    ),
    disabled_correlation_ids: uniqueStrings(
      input.disabled_correlation_ids || [],
      'CORRELATION_SKELETON_QUERY_DISABLED_INVALID',
    ),
  };
  if (!query.source_node_id || !query.target_node_id || query.source_node_id === query.target_node_id
    || query.max_hops < 1 || query.max_hops > 64) {
    fail('CORRELATION_SKELETON_QUERY_INVALID');
  }
  if (query.admitted_epistemic_statuses.some((status) => !EPISTEMIC_STATUSES.includes(status))) {
    fail('CORRELATION_SKELETON_QUERY_EPISTEMIC_INVALID');
  }
  const nodeIds = new Set(skeleton.nodes.map((node) => node.node_id));
  if (!nodeIds.has(query.source_node_id) || !nodeIds.has(query.target_node_id)) {
    fail('CORRELATION_SKELETON_QUERY_ENDPOINT_UNKNOWN');
  }
  const availableContextIds = new Set(query.available_context_node_ids);
  if ([...availableContextIds].some((nodeId) => !nodeIds.has(nodeId))) {
    fail('CORRELATION_SKELETON_QUERY_CONTEXT_UNKNOWN');
  }
  const disabledCorrelationIds = new Set(query.disabled_correlation_ids);
  const adjacency = new Map(skeleton.nodes.map((node) => [node.node_id, []]));
  for (const correlation of skeleton.correlations) {
    if (!correlationActive(correlation, query, availableContextIds, disabledCorrelationIds)) continue;
    const sources = correlation.participants
      .filter((participant) => participant.role === 'source').map((participant) => participant.node_id);
    const targets = correlation.participants
      .filter((participant) => participant.role === 'target').map((participant) => participant.node_id);
    const contexts = correlation.participants
      .filter((participant) => participant.role === 'context').map((participant) => participant.node_id);
    const connect = (fromIds, toIds) => {
      for (const from of fromIds) {
        for (const to of toIds) {
          adjacency.get(from).push({
            correlation_id: correlation.correlation_id,
            relation_type: correlation.relation_type,
            from_node_id: from,
            to_node_id: to,
            required_context_node_ids: contexts,
            epistemic_status: correlation.epistemic_status,
          });
        }
      }
    };
    connect(sources, targets);
    if (!correlation.directed) connect(targets, sources);
  }
  for (const steps of adjacency.values()) {
    steps.sort((left, right) => left.correlation_id.localeCompare(right.correlation_id)
      || left.to_node_id.localeCompare(right.to_node_id));
  }

  const queue = [{ node_id: query.source_node_id, path: [] }];
  const visited = new Set([query.source_node_id]);
  let path = null;
  while (queue.length) {
    const current = queue.shift();
    if (current.path.length >= query.max_hops) continue;
    for (const step of adjacency.get(current.node_id) || []) {
      const candidatePath = [...current.path, step];
      if (step.to_node_id === query.target_node_id) {
        path = candidatePath;
        queue.length = 0;
        break;
      }
      if (!visited.has(step.to_node_id)) {
        visited.add(step.to_node_id);
        queue.push({ node_id: step.to_node_id, path: candidatePath });
      }
    }
  }
  const payload = {
    schema_version: 1,
    artifact_role: 'sparse_correlation_query',
    query_id: `correlation_query_${sha256Json({ skeleton_hash: skeleton.skeleton_hash, query }).slice(0, 16)}`,
    skeleton_id: skeleton.skeleton_id,
    skeleton_hash: skeleton.skeleton_hash,
    status: path ? 'reachable' : 'inhibited',
    result_scope: 'bounded_topological_reachability',
    inference_epistemic_status: 'hypothetical',
    query,
    path: path || [],
    used_correlation_ids: path ? [...new Set(path.map((step) => step.correlation_id))] : [],
    criteria: {
      endpoints_distinct_and_present: true,
      admitted_epistemic_statuses_only: true,
      temporal_bounds_applied: true,
      required_context_present: path
        ? path.every((step) => step.required_context_node_ids.every((id) => availableContextIds.has(id))) : false,
      path_within_hop_bound: Boolean(path && path.length <= query.max_hops),
    },
    non_claims: [
      'reachability is not verification of the inferred endpoint relation',
      'admissible observed factors do not become causal evidence through composition alone',
      'does not prove external-world correspondence',
      'does not prove host-model hidden-state use, complete the consciousness predicate, or establish AGI',
    ],
  };
  return { ...payload, query_hash: sha256Json(payload) };
}

function probeSparseCorrelationDependency(skeleton, query, severedCorrelationId) {
  assertSparseCorrelationSkeleton(skeleton);
  if (!skeleton.correlations.some((correlation) => correlation.correlation_id === severedCorrelationId)) {
    fail('CORRELATION_SKELETON_PROBE_TARGET_UNKNOWN');
  }
  const intact = findSparseCorrelationPath(skeleton, query);
  const severed = findSparseCorrelationPath(skeleton, {
    ...query,
    disabled_correlation_ids: [...new Set([
      ...(query.disabled_correlation_ids || []),
      severedCorrelationId,
    ])],
  });
  const criteria = {
    same_nodes_preserved: true,
    intact_path_reachable: intact.status === 'reachable',
    severed_correlation_used_by_intact_path: intact.used_correlation_ids.includes(severedCorrelationId),
    severed_path_inhibited: severed.status === 'inhibited',
  };
  const payload = {
    schema_version: 1,
    artifact_role: 'sparse_correlation_dependency_probe',
    probe_id: `correlation_probe_${sha256Json({
      skeleton_hash: skeleton.skeleton_hash,
      query,
      severed_correlation_id: severedCorrelationId,
    }).slice(0, 16)}`,
    skeleton_id: skeleton.skeleton_id,
    skeleton_hash: skeleton.skeleton_hash,
    severed_correlation_id: severedCorrelationId,
    status: Object.values(criteria).every(Boolean) ? 'verified' : 'not_verified',
    criteria,
    intact_query_hash: intact.query_hash,
    severed_query_hash: severed.query_hash,
    non_claims: [
      'verifies dependency only for this bounded query and declared skeleton',
      'does not prove that the correlation is causal in the external world',
      'does not prove host-model hidden-state use',
      'does not complete the consciousness predicate or establish AGI',
    ],
  };
  return { ...payload, probe_hash: sha256Json(payload) };
}

module.exports = {
  EPISTEMIC_STATUSES,
  PARTICIPANT_ROLES,
  assertSparseCorrelationSkeleton,
  buildSparseCorrelationSkeleton,
  findSparseCorrelationPath,
  probeSparseCorrelationDependency,
};
