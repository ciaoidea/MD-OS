#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const crypto = require('node:crypto');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function main() {
  const args = process.argv.slice(2);
  const providerPath = option(args, '--provider');
  const requestPath = option(args, '--request');
  if (!providerPath || !requestPath) throw new Error('CONTROLLED_PROVIDER_INPUT_REQUIRED');
  const provider = readJson(providerPath);
  const request = readJson(requestPath);
  if (provider.kind !== 'controlled_fixture') throw new Error('CONTROLLED_PROVIDER_KIND_INVALID');
  if (request.provider_id !== provider.provider_id) throw new Error('CONTROLLED_PROVIDER_ID_MISMATCH');
  if (!provider.supported_cases.includes(request.benchmark_case_id)) throw new Error('CONTROLLED_PROVIDER_CASE_UNSUPPORTED');
  const requestHash = sha256Json(request);
  const limit = request.resource_budget.max_candidates;
  const selected = provider.strategy_catalog.slice()
    .sort((left, right) => left.priority - right.priority || left.candidate_id.localeCompare(right.candidate_id))
    .slice(0, limit);
  const visibleTestIds = [
    request.visible_validation.reproduction.command_id,
    ...request.visible_validation.targeted_tests.map((item) => item.command_id),
    ...request.visible_validation.regression_tests.map((item) => item.command_id),
  ];
  const candidates = selected.map((entry) => ({
    candidate_id: entry.candidate_id,
    patch_path: entry.patch_path,
    patch_sha256: entry.patch_sha256,
    plan_graph: {
      schema_version: 1,
      plan_graph_id: `plan_${entry.candidate_id.replace(/^candidate_/, '').slice(0, 40)}_${requestHash.slice(0, 12)}`,
      benchmark_case_id: request.benchmark_case_id,
      configuration_id: request.configuration.configuration_id,
      strategy_class: entry.strategy_class,
      mechanism: entry.mechanism,
      hypothesis: entry.hypothesis,
      applicability: {
        defect_classes: [request.issue.defect_class],
        required_paths: entry.nodes.flatMap((node) => node.target_paths).filter(Boolean),
      },
      preconditions: entry.preconditions,
      nodes: entry.nodes,
      predicted_outcome: entry.predicted_outcome,
      verification: {
        visible_test_ids: visibleTestIds,
        requires_independent_verification: true,
        postconditions: entry.postconditions,
      },
      rollback: {
        available: true,
        procedure: 'Discard the detached candidate worktree and retain the unchanged base commit.',
      },
      risk_level: entry.risk_level,
      provenance: {
        provider_id: provider.provider_id,
        provider_run_id: request.provider_run_id,
        source: 'fixture',
        input_hash: requestHash,
        model_call_id: null,
      },
    },
    initial_confidence: entry.predicted_outcome.success_probability,
    proposal_metrics: {
      tokens: null,
      latency_ms: null,
      cost: null,
      human_interventions: 0,
    },
  }));
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    provider_run_id: request.provider_run_id,
    provider_id: provider.provider_id,
    benchmark_case_id: request.benchmark_case_id,
    configuration_id: request.configuration.configuration_id,
    request_hash: requestHash,
    case_ground_truth_disclosed: provider.case_ground_truth_disclosed,
    created_by: 'fixture',
    candidates,
    provider_metrics: {
      candidate_count: candidates.length,
      tokens: null,
      cost: null,
      model_calls: 0,
    },
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
