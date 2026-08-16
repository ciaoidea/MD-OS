#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');

function nodeKindForToken(token) {
  return token.token_type === 'entity' ? 'entity' : token.token_type;
}

function upsertNode(nodes, node) {
  const existing = nodes.get(node.id);
  if (!existing) {
    nodes.set(node.id, {
      ...node,
      token_refs: Array.from(new Set(node.token_refs || [])).sort(),
    });
    return;
  }
  existing.token_refs = Array.from(new Set([...(existing.token_refs || []), ...(node.token_refs || [])])).sort();
  existing.confidence = Math.max(Number(existing.confidence || 0), Number(node.confidence || 0));
  existing.salience = Math.max(Number(existing.salience || 0), Number(node.salience || 0));
}

function addEdge(edges, edge) {
  const key = `${edge.from}:${edge.type}:${edge.to}`;
  if (edges.has(key)) return;
  edges.set(key, edge);
}

function graphMetrics(nodes, edges) {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const adjacency = new Map(Array.from(nodeIds).map((id) => [id, new Set()]));
  for (const edge of edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) continue;
    adjacency.get(edge.from).add(edge.to);
    adjacency.get(edge.to).add(edge.from);
  }

  const visited = new Set();
  let componentCount = 0;
  for (const id of nodeIds) {
    if (visited.has(id)) continue;
    componentCount += 1;
    const stack = [id];
    visited.add(id);
    while (stack.length) {
      const current = stack.pop();
      for (const next of adjacency.get(current) || []) {
        if (visited.has(next)) continue;
        visited.add(next);
        stack.push(next);
      }
    }
  }

  const isolatedCount = Array.from(adjacency.values()).filter((neighbors) => neighbors.size === 0).length;
  const possibleDirectedEdges = nodeIds.size > 1 ? nodeIds.size * (nodeIds.size - 1) : 1;
  return {
    node_count: nodeIds.size,
    edge_count: edges.length,
    density: Math.round((edges.length / possibleDirectedEdges) * 1000) / 1000,
    connected_component_count: componentCount,
    isolated_node_count: isolatedCount,
  };
}

function buildBindingGraph(frame) {
  const nodes = new Map();
  const edges = new Map();
  const conflicts = [];
  const frameNodeId = `frame:${frame.frame_id}`;
  upsertNode(nodes, {
    id: frameNodeId,
    kind: 'frame',
    label: frame.frame_id,
    token_refs: [],
    confidence: 1,
    salience: 1,
  });
  for (const source of frame.sources || []) {
    const sourceNodeId = `source:${source.source_id}`;
    upsertNode(nodes, {
      id: sourceNodeId,
      kind: 'source',
      label: source.source_id,
      token_refs: [],
      confidence: 1,
      salience: 1,
    });
    addEdge(edges, {
      from: frameNodeId,
      type: 'has_source',
      to: sourceNodeId,
      confidence: 1,
      evidence: [source.source_id],
    });
  }

  for (const token of frame.experience_tokens || []) {
    const canonicalId = token.canonical_id || `${token.token_type}:${token.label}`;
    upsertNode(nodes, {
      id: canonicalId,
      kind: nodeKindForToken(token),
      label: token.label,
      token_refs: [token.token_id],
      confidence: token.confidence,
      salience: token.salience && token.salience.score || 0,
    });
    upsertNode(nodes, {
      id: token.token_id,
      kind: 'experience_token',
      label: token.label,
      token_refs: [token.token_id],
      confidence: token.confidence,
      salience: token.salience && token.salience.score || 0,
    });
    addEdge(edges, {
      from: token.token_id,
      type: 'binds_to',
      to: canonicalId,
      confidence: token.confidence,
      evidence: token.source_refs || [],
    });
    for (const sourceRef of token.source_refs || []) {
      addEdge(edges, {
        from: `source:${sourceRef}`,
        type: 'observed_token',
        to: token.token_id,
        confidence: token.confidence,
        evidence: [sourceRef],
      });
    }
    for (const relation of token.relations || []) {
      const target = shortText(relation.target);
      if (!target) continue;
      upsertNode(nodes, {
        id: target,
        kind: target.startsWith('concept:') || target.startsWith('system:') ? 'entity' : 'relation',
        label: target,
        token_refs: [],
        confidence: token.confidence,
        salience: token.salience && token.salience.score || 0,
      });
      addEdge(edges, {
        from: canonicalId,
        type: shortText(relation.type || 'relates_to'),
        to: target,
        confidence: token.confidence,
        evidence: [token.token_id],
      });
    }
    for (const affordance of token.affordances || []) {
      const action = shortText(affordance.action);
      if (!action) continue;
      const affordanceId = `affordance:${action}`;
      upsertNode(nodes, {
        id: affordanceId,
        kind: 'affordance',
        label: action,
        token_refs: [token.token_id],
        confidence: token.confidence,
        salience: token.salience && token.salience.score || 0,
      });
      addEdge(edges, {
        from: canonicalId,
        type: 'has_affordance',
        to: affordanceId,
        confidence: token.confidence,
        evidence: [token.token_id],
      });
    }
  }

  const nodeList = Array.from(nodes.values()).sort((left, right) => left.id.localeCompare(right.id));
  const edgeList = Array.from(edges.values()).sort((left, right) => `${left.from}:${left.type}:${left.to}`.localeCompare(`${right.from}:${right.type}:${right.to}`));
  return {
    schema_version: 1,
    graph_id: `binding_${frame.frame_id}`,
    frame_id: frame.frame_id,
    source_hash: sha256Json({
      frame_id: frame.frame_id,
      token_ids: (frame.experience_tokens || []).map((token) => token.token_id).sort(),
    }),
    nodes: nodeList,
    edges: edgeList,
    metrics: graphMetrics(nodeList, edgeList),
    conflicts,
  };
}

module.exports = {
  buildBindingGraph,
};
