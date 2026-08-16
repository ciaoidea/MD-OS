#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  assertSafeId,
  sha256Json,
  shortText,
} = require('../../os/lib/common');

const NODE_KINDS = new Set(['inspect', 'edit', 'verify', 'rollback']);
const RISK_LEVELS = new Set(['low', 'medium', 'high']);

function normalizedPath(value, label) {
  const text = String(value || '').trim().replace(/\\/g, '/');
  if (!text || path.isAbsolute(text) || text.split('/').includes('..')) {
    throw new Error(`PLAN_GRAPH_${label}_PATH_INVALID: ${text}`);
  }
  return text;
}

function globMatch(filePath, pattern) {
  const normalized = String(pattern).replace(/\\/g, '/');
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
}

function requireProbability(value, label, nullable = false) {
  if (nullable && value === null) return;
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error(`PLAN_GRAPH_${label}_INVALID`);
  }
}

function requireTextArray(value, label, minItems = 0) {
  if (!Array.isArray(value) || value.length < minItems || value.some((item) => !shortText(item))) {
    throw new Error(`PLAN_GRAPH_${label}_INVALID`);
  }
}

function assertAcyclic(nodes) {
  const byId = new Map(nodes.map((node) => [node.node_id, node]));
  const visiting = new Set();
  const visited = new Set();
  const visit = (nodeId) => {
    if (visiting.has(nodeId)) throw new Error(`PLAN_GRAPH_CYCLE_DETECTED: ${nodeId}`);
    if (visited.has(nodeId)) return;
    visiting.add(nodeId);
    const node = byId.get(nodeId);
    for (const dependency of node.depends_on) visit(dependency);
    visiting.delete(nodeId);
    visited.add(nodeId);
  };
  for (const node of nodes) visit(node.node_id);
}

function validatePlanGraph(planGraph, context) {
  if (!planGraph || typeof planGraph !== 'object' || Array.isArray(planGraph) || planGraph.schema_version !== 1) {
    throw new Error('PLAN_GRAPH_SCHEMA_UNSUPPORTED');
  }
  const graphId = assertSafeId(planGraph.plan_graph_id, 'plan_graph_id');
  if (!graphId.startsWith('plan_')) throw new Error('PLAN_GRAPH_ID_PREFIX_INVALID');
  if (planGraph.benchmark_case_id !== context.benchmarkCase.benchmark_case_id) {
    throw new Error(`PLAN_GRAPH_CASE_MISMATCH: ${graphId}`);
  }
  if (planGraph.configuration_id !== context.configuration.configuration_id) {
    throw new Error(`PLAN_GRAPH_CONFIGURATION_MISMATCH: ${graphId}`);
  }
  if (!shortText(planGraph.strategy_class) || !shortText(planGraph.mechanism) || !shortText(planGraph.hypothesis)) {
    throw new Error(`PLAN_GRAPH_STRATEGY_INVALID: ${graphId}`);
  }
  if (!planGraph.applicability || typeof planGraph.applicability !== 'object') {
    throw new Error(`PLAN_GRAPH_APPLICABILITY_INVALID: ${graphId}`);
  }
  requireTextArray(planGraph.applicability.defect_classes, 'APPLICABILITY_DEFECT_CLASSES', 1);
  requireTextArray(planGraph.applicability.required_paths, 'APPLICABILITY_REQUIRED_PATHS', 1);
  if (!planGraph.applicability.defect_classes.includes(context.benchmarkCase.issue.defect_class)) {
    throw new Error(`PLAN_GRAPH_DEFECT_CLASS_NOT_APPLICABLE: ${graphId}`);
  }
  if (context.request && context.request.context_receipt && context.request.context_receipt.repository) {
    const repositoryPaths = new Set((context.request.context_receipt.repository.files || []).map((item) => item.path));
    for (const requiredPath of planGraph.applicability.required_paths) {
      if (!repositoryPaths.has(requiredPath)) throw new Error(`PLAN_GRAPH_REQUIRED_PATH_NOT_OBSERVED: ${graphId}:${requiredPath}`);
    }
    const visibleEvidence = new Set([
      context.benchmarkCase.reproduction.command_id,
      ...context.benchmarkCase.targeted_tests.map((item) => item.command_id),
      ...context.benchmarkCase.regression_tests.map((item) => item.command_id),
    ]);
    for (const precondition of planGraph.preconditions || []) {
      for (const reference of precondition.evidence_refs || []) {
        if (reference.startsWith('repository:') && !repositoryPaths.has(reference.slice('repository:'.length))) {
          throw new Error(`PLAN_GRAPH_PRECONDITION_EVIDENCE_UNKNOWN: ${precondition.precondition_id}:${reference}`);
        }
        if (reference.startsWith('visible_test:') && !visibleEvidence.has(reference.slice('visible_test:'.length))) {
          throw new Error(`PLAN_GRAPH_PRECONDITION_EVIDENCE_UNKNOWN: ${precondition.precondition_id}:${reference}`);
        }
        if (!reference.startsWith('repository:') && !reference.startsWith('visible_test:')) {
          throw new Error(`PLAN_GRAPH_PRECONDITION_EVIDENCE_KIND_INVALID: ${precondition.precondition_id}:${reference}`);
        }
      }
    }
  }

  if (!Array.isArray(planGraph.preconditions) || !planGraph.preconditions.length) {
    throw new Error(`PLAN_GRAPH_PRECONDITIONS_REQUIRED: ${graphId}`);
  }
  const preconditionIds = new Set();
  for (const precondition of planGraph.preconditions) {
    const id = assertSafeId(precondition && precondition.precondition_id, 'precondition_id');
    if (preconditionIds.has(id)) throw new Error(`PLAN_GRAPH_DUPLICATE_PRECONDITION: ${id}`);
    preconditionIds.add(id);
    if (!shortText(precondition.statement)) throw new Error(`PLAN_GRAPH_PRECONDITION_STATEMENT_REQUIRED: ${id}`);
    requireTextArray(precondition.evidence_refs, 'PRECONDITION_EVIDENCE_REFS');
  }

  if (!Array.isArray(planGraph.nodes) || planGraph.nodes.length < 2) {
    throw new Error(`PLAN_GRAPH_NODES_INSUFFICIENT: ${graphId}`);
  }
  const nodeIds = new Set();
  for (const node of planGraph.nodes) {
    const nodeId = assertSafeId(node && node.node_id, 'node_id');
    if (nodeIds.has(nodeId)) throw new Error(`PLAN_GRAPH_DUPLICATE_NODE: ${nodeId}`);
    nodeIds.add(nodeId);
    if (!NODE_KINDS.has(node.kind) || !shortText(node.operation)) {
      throw new Error(`PLAN_GRAPH_NODE_INVALID: ${nodeId}`);
    }
    if (!Array.isArray(node.depends_on) || !Array.isArray(node.target_paths) || !Array.isArray(node.expected_effects)) {
      throw new Error(`PLAN_GRAPH_NODE_ARRAYS_INVALID: ${nodeId}`);
    }
    if (node.expected_effects.some((item) => !shortText(item)) || typeof node.reversible !== 'boolean') {
      throw new Error(`PLAN_GRAPH_NODE_EFFECT_INVALID: ${nodeId}`);
    }
  }
  for (const node of planGraph.nodes) {
    for (const dependency of node.depends_on) {
      if (!nodeIds.has(dependency) || dependency === node.node_id) {
        throw new Error(`PLAN_GRAPH_DEPENDENCY_INVALID: ${node.node_id}:${dependency}`);
      }
    }
    node.target_paths = node.target_paths.map((target) => normalizedPath(target, 'TARGET'));
  }
  assertAcyclic(planGraph.nodes);
  if (!planGraph.nodes.some((node) => node.kind === 'edit') || !planGraph.nodes.some((node) => node.kind === 'verify')) {
    throw new Error(`PLAN_GRAPH_EDIT_AND_VERIFY_REQUIRED: ${graphId}`);
  }

  const policy = context.benchmarkCase.diff_policy;
  for (const node of planGraph.nodes.filter((item) => item.kind === 'edit')) {
    if (!node.target_paths.length) throw new Error(`PLAN_GRAPH_EDIT_TARGET_REQUIRED: ${node.node_id}`);
    for (const target of node.target_paths) {
      if (policy.forbidden_paths.some((pattern) => globMatch(target, pattern))) {
        throw new Error(`PLAN_GRAPH_FORBIDDEN_EDIT_TARGET: ${node.node_id}:${target}`);
      }
      if (!policy.allowed_paths.some((pattern) => globMatch(target, pattern))) {
        throw new Error(`PLAN_GRAPH_EDIT_TARGET_OUTSIDE_SCOPE: ${node.node_id}:${target}`);
      }
    }
  }

  const predicted = planGraph.predicted_outcome || {};
  requireTextArray(predicted.state_delta, 'PREDICTED_STATE_DELTA', 1);
  requireProbability(predicted.success_probability, 'SUCCESS_PROBABILITY', true);
  requireProbability(predicted.information_gain, 'INFORMATION_GAIN');
  requireProbability(predicted.risk, 'RISK');
  requireProbability(predicted.uncertainty, 'UNCERTAINTY');
  if (!Number.isFinite(predicted.cost_units) || predicted.cost_units < 0) throw new Error('PLAN_GRAPH_COST_INVALID');
  if (predicted.latency_ms !== null && (!Number.isInteger(predicted.latency_ms) || predicted.latency_ms < 0)) {
    throw new Error('PLAN_GRAPH_LATENCY_INVALID');
  }

  const verification = planGraph.verification || {};
  requireTextArray(verification.visible_test_ids, 'VISIBLE_TEST_IDS', 1);
  requireTextArray(verification.postconditions, 'POSTCONDITIONS', 1);
  if (verification.requires_independent_verification !== true) {
    throw new Error(`PLAN_GRAPH_INDEPENDENT_VERIFICATION_REQUIRED: ${graphId}`);
  }
  const visibleIds = new Set([
    context.benchmarkCase.reproduction.command_id,
    ...context.benchmarkCase.targeted_tests.map((item) => item.command_id),
    ...context.benchmarkCase.regression_tests.map((item) => item.command_id),
  ]);
  if (verification.visible_test_ids.some((id) => !visibleIds.has(id))) {
    throw new Error(`PLAN_GRAPH_UNKNOWN_VISIBLE_TEST: ${graphId}`);
  }

  const rollback = planGraph.rollback || {};
  if (typeof rollback.available !== 'boolean' || !shortText(rollback.procedure)) {
    throw new Error(`PLAN_GRAPH_ROLLBACK_INVALID: ${graphId}`);
  }
  if (!RISK_LEVELS.has(planGraph.risk_level)) throw new Error(`PLAN_GRAPH_RISK_LEVEL_INVALID: ${graphId}`);

  const provenance = planGraph.provenance || {};
  if (provenance.provider_id !== context.providerId
      || provenance.provider_run_id !== context.providerRunId
      || provenance.input_hash !== context.requestHash
      || !['fixture', 'model', 'planner', 'skill', 'human'].includes(provenance.source)) {
    throw new Error(`PLAN_GRAPH_PROVENANCE_INVALID: ${graphId}`);
  }
  if (provenance.model_call_id !== null && !shortText(provenance.model_call_id)) {
    throw new Error(`PLAN_GRAPH_MODEL_CALL_ID_INVALID: ${graphId}`);
  }
  return planGraph;
}

function semanticSignature(planGraph) {
  return sha256Json({
    strategy_class: shortText(planGraph.strategy_class).toLowerCase(),
    mechanism: shortText(planGraph.mechanism).toLowerCase(),
    edit_targets: planGraph.nodes
      .filter((node) => node.kind === 'edit')
      .flatMap((node) => node.target_paths)
      .sort(),
    topology: planGraph.nodes.map((node) => ({
      kind: node.kind,
      dependencies: node.depends_on.length,
      reversible: node.reversible,
    })),
  });
}

function diversityReceipt(candidates, options = {}) {
  const findings = [];
  const collectDuplicates = (values, code) => {
    const counts = new Map();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    for (const [value, count] of counts.entries()) {
      if (count > 1) findings.push({ code, value, count });
    }
  };
  collectDuplicates(candidates.map((item) => item.plan_graph.plan_graph_id), 'DUPLICATE_PLAN_GRAPH_ID');
  collectDuplicates(candidates.map((item) => shortText(item.plan_graph.strategy_class).toLowerCase()), 'DUPLICATE_STRATEGY_CLASS');
  collectDuplicates(candidates.map((item) => shortText(item.plan_graph.mechanism).toLowerCase()), 'DUPLICATE_STRATEGY_MECHANISM');
  collectDuplicates(candidates.map((item) => semanticSignature(item.plan_graph)), 'DUPLICATE_SEMANTIC_PLAN_SIGNATURE');
  collectDuplicates(candidates.map((item) => item.patch_sha256), 'DUPLICATE_PATCH_HASH');
  const requiredDistinctPlans = Number.isInteger(options.requiredDistinctPlans) ? options.requiredDistinctPlans : 1;
  if (candidates.length < requiredDistinctPlans) {
    findings.push({
      code: 'INSUFFICIENT_DISTINCT_PLANS',
      required: requiredDistinctPlans,
      observed: candidates.length,
    });
  }
  return {
    passed: findings.length === 0,
    required_distinct_plans: requiredDistinctPlans,
    plan_count: candidates.length,
    unique_strategy_class_count: new Set(candidates.map((item) => shortText(item.plan_graph.strategy_class).toLowerCase())).size,
    unique_mechanism_count: new Set(candidates.map((item) => shortText(item.plan_graph.mechanism).toLowerCase())).size,
    unique_patch_count: new Set(candidates.map((item) => item.patch_sha256)).size,
    semantic_signatures: candidates.map((item) => ({
      plan_graph_id: item.plan_graph.plan_graph_id,
      signature: semanticSignature(item.plan_graph),
    })),
    findings,
  };
}

module.exports = {
  diversityReceipt,
  globMatch,
  semanticSignature,
  validatePlanGraph,
};
