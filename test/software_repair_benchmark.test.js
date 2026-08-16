#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { sha256Json } = require('../md-os/os/lib/common');
const { CONFIGURATIONS } = require('../md-os/kernel/cognition/benchmark_runner');
const { validateProviderResult } = require('../md-os/kernel/cognition/candidate_provider');

const REPO_ROOT = path.resolve(__dirname, '..');
const RUNNER = path.join(REPO_ROOT, 'md-os/os/run_software_repair_benchmark.js');
const INDEX_BUILDER = path.join(REPO_ROOT, 'md-os/os/build_software_repair_benchmark_index.js');
const CASE = 'md-os/benchmarks/software_repair/cases/missing_boundary_validation.json';
const CANDIDATE_SET = 'md-os/benchmarks/software_repair/candidate_sets/missing_boundary_validation_fixture.json';
const PROVIDER = 'md-os/benchmarks/software_repair/providers/missing_boundary_validation_controlled.json';

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-software-repair-benchmark-'));
  const mdosRoot = path.join(workspace, 'md-os');
  fs.mkdirSync(path.join(mdosRoot, 'kb'), { recursive: true });
  fs.mkdirSync(path.join(mdosRoot, 'os'), { recursive: true });
  fs.mkdirSync(path.join(mdosRoot, 'ops'), { recursive: true });
  fs.writeFileSync(path.join(mdosRoot, 'ops', 'journal.ndjson'), '', 'utf8');
  fs.cpSync(
    path.join(REPO_ROOT, 'md-os/benchmarks'),
    path.join(mdosRoot, 'benchmarks'),
    { recursive: true }
  );
  return workspace;
}

function run(workspace, args) {
  return spawnSync(process.execPath, [RUNNER, ...args], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
}

function buildIndex(workspace) {
  return spawnSync(process.execPath, [INDEX_BUILDER], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
}

function payload(result, expectedStatus = 0) {
  assert.equal(result.status, expectedStatus, `${result.stderr}\n${result.stdout}`);
  return JSON.parse(result.stdout.trim().split('\n').at(-1));
}

function readJson(workspace, relativePath) {
  return JSON.parse(fs.readFileSync(path.join(workspace, relativePath), 'utf8'));
}

test('software repair benchmark isolates candidates and selects only the independently verified patch', () => {
  const workspace = makeWorkspace();
  const result = payload(run(workspace, [
    'run',
    '--case', CASE,
    '--candidate-set', CANDIDATE_SET,
    '--configuration', 'mdos_verified_runtime',
    '--run-id', 'benchmark_run_test_verified_selection',
  ]));

  assert.equal(result.empirical_claim_scope, 'runner_validation_only');
  assert.equal(result.selected_candidate_id, 'candidate_minimal_boundary_validation');
  assert.equal(result.verified_candidate_count, 1);
  assert.equal(result.candidate_count, 3);

  const benchmarkRun = readJson(workspace, result.benchmark_run_file);
  const comparison = readJson(workspace, result.candidate_comparison_file);
  assert.equal(benchmarkRun.repository_receipt.base_commit_verified, true);
  assert.equal(fs.existsSync(path.join(workspace, benchmarkRun.repository_receipt.base_bundle_file)), true);
  assert.match(benchmarkRun.repository_receipt.base_bundle_sha256, /^[a-f0-9]{64}$/);
  assert.equal(benchmarkRun.reproduction_before.exit_status, 1);
  assert.equal(benchmarkRun.reproduction_before.passed, true);
  assert.equal(benchmarkRun.pre_patch_validation.oracle_results[0].exit_status, 1);
  assert.equal(benchmarkRun.pre_patch_validation.oracle_results[0].passed, true);
  assert.equal(benchmarkRun.cleanup.sandbox_removed, true);
  assert.equal(benchmarkRun.cleanup.worktrees_pruned, true);
  assert.deepEqual(readJson(workspace, benchmarkRun.benchmark_case_snapshot_file), readJson(workspace, CASE));
  assert.deepEqual(readJson(workspace, benchmarkRun.candidate_set_snapshot_file), readJson(workspace, CANDIDATE_SET));
  assert.equal(benchmarkRun.metrics.verified_success_rate_holdout, null);
  assert.equal(comparison.selected_candidate_id, 'candidate_minimal_boundary_validation');

  const byId = new Map(benchmarkRun.candidate_results.map((candidate) => [candidate.candidate_id, candidate]));
  const valid = byId.get('candidate_minimal_boundary_validation');
  assert.equal(valid.verdict, 'verified');
  assert.deepEqual(valid.failure_reasons, []);
  assert.deepEqual(valid.diff_receipt.changed_files, ['src/authenticate.js']);
  assert.equal(valid.oracle_results[0].passed, true);
  assert.equal(valid.worktree_receipt.removed, true);
  assert.equal(fs.existsSync(path.join(workspace, valid.patch_receipt.submitted_patch_file)), true);

  const gaming = byId.get('candidate_test_gaming');
  assert.equal(gaming.verdict, 'failed');
  assert.equal(gaming.targeted_results[0].passed, true);
  assert.equal(gaming.oracle_results[0].passed, false);
  assert.ok(gaming.failure_reasons.includes('independent_oracle_failed'));
  assert.ok(gaming.failure_reasons.includes('forbidden_path_changed'));

  const broad = byId.get('candidate_broad_denial');
  assert.equal(broad.verdict, 'failed');
  assert.ok(broad.failure_reasons.includes('regression_test_failed'));
  assert.ok(broad.failure_reasons.includes('independent_oracle_failed'));

  assert.equal(fs.existsSync(path.join(
    workspace,
    'md-os/ops/benchmarks/software_repair/.sandbox/benchmark_run_test_verified_selection'
  )), false);

  const indexResult = payload(buildIndex(workspace));
  assert.equal(indexResult.status, 'attention');
  assert.equal(indexResult.run_count, 1);
  assert.equal(indexResult.empirical_run_count, 0);
  const index = readJson(workspace, indexResult.output_json);
  assert.equal(index.primary_metric, 'verified_success_rate_holdout');
  assert.equal(index.runner_validation_verified_run_count, 1);
  assert.equal(index.runner_validation_no_selection_run_count, 0);
  assert.equal(index.learning_delta.status, 'not_measured');
  assert.equal(index.configurations.find((item) => item.configuration_id === 'mdos_verified_runtime').verified_success_rate_holdout, null);
});

test('baseline A enforces a single attempt and reports the same external verifier evidence', () => {
  const workspace = makeWorkspace();
  const rejected = payload(run(workspace, [
    'run',
    '--case', CASE,
    '--candidate-set', CANDIDATE_SET,
    '--configuration', 'baseline_a_single_attempt',
    '--run-id', 'benchmark_run_test_baseline_rejected',
  ]), 1);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /CANDIDATE_LIMIT_EXCEEDED/);

  const accepted = payload(run(workspace, [
    'run',
    '--case', CASE,
    '--candidate-set', CANDIDATE_SET,
    '--configuration', 'baseline_a_single_attempt',
    '--candidates', 'candidate_minimal_boundary_validation',
    '--run-id', 'benchmark_run_test_baseline_single',
  ]));
  const benchmarkRun = readJson(workspace, accepted.benchmark_run_file);
  assert.equal(benchmarkRun.configuration.retrieval, false);
  assert.equal(benchmarkRun.configuration.episodic_memory, false);
  assert.equal(benchmarkRun.configuration.skills, false);
  assert.equal(benchmarkRun.configuration.candidate_limit, 1);
  assert.equal(benchmarkRun.candidate_results.length, 1);
  assert.equal(benchmarkRun.candidate_results[0].verdict, 'verified');
});

test('holdout run is blocked when candidate generation was exposed to ground truth', () => {
  const workspace = makeWorkspace();
  const holdoutCase = readJson(workspace, CASE);
  holdoutCase.split = 'holdout';
  holdoutCase.ground_truth.candidate_disclosure = 'withheld_until_verification';
  const holdoutPath = 'md-os/benchmarks/software_repair/cases/holdout_contamination_check.json';
  fs.writeFileSync(path.join(workspace, holdoutPath), `${JSON.stringify(holdoutCase, null, 2)}\n`, 'utf8');

  const rejected = payload(run(workspace, [
    'run',
    '--case', holdoutPath,
    '--candidate-set', CANDIDATE_SET,
    '--configuration', 'mdos_verified_runtime',
    '--run-id', 'benchmark_run_test_holdout_contaminated',
  ]), 1);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /HOLDOUT_CONTAMINATED/);
  assert.equal(fs.existsSync(path.join(
    workspace,
    'md-os/ops/benchmarks/software_repair/runs/benchmark_run_test_holdout_contaminated'
  )), false);
});

test('benchmark runs are append-only', () => {
  const workspace = makeWorkspace();
  const args = [
    'run',
    '--case', CASE,
    '--candidate-set', CANDIDATE_SET,
    '--configuration', 'baseline_a_single_attempt',
    '--candidates', 'candidate_minimal_boundary_validation',
    '--run-id', 'benchmark_run_test_append_only',
  ];
  payload(run(workspace, args));
  const rejected = payload(run(workspace, args), 1);
  assert.equal(rejected.ok, false);
  assert.match(rejected.error, /APPEND_ONLY_CONFLICT/);
});

test('candidate provider compiles distinct PlanGraphs and the benchmark snapshots their proof', () => {
  const workspace = makeWorkspace();
  const result = payload(run(workspace, [
    'run',
    '--case', CASE,
    '--provider', PROVIDER,
    '--configuration', 'mdos_verified_runtime',
    '--provider-run-id', 'provider_run_test_plan_graphs',
    '--run-id', 'benchmark_run_test_plan_graphs',
  ]));

  assert.equal(result.empirical_claim_scope, 'runner_validation_only');
  assert.equal(result.strategy_diversity_passed, true);
  assert.equal(result.configuration_fidelity_passed, true);
  assert.equal(result.candidate_count, 3);
  assert.equal(result.verified_candidate_count, 2);
  assert.equal(result.selected_candidate_id, 'candidate_provider_minimal_boundary_validation');

  const candidateSet = readJson(workspace, result.generated_candidate_set_file);
  const receipt = readJson(workspace, result.provider_receipt_file);
  const request = readJson(workspace, receipt.artifacts.provider_request_file);
  assert.equal(candidateSet.schema_version, 2);
  assert.equal(candidateSet.provider.empirical_eligibility.eligible, false);
  assert.deepEqual(candidateSet.provider.empirical_eligibility.reason_codes, [
    'controlled_fixture_provider',
    'case_ground_truth_disclosed',
  ]);
  assert.equal(receipt.configuration_fidelity.passed, true);
  assert.equal(receipt.strategy_diversity.passed, true);
  assert.equal(receipt.strategy_diversity.plan_count, 3);
  assert.equal(receipt.strategy_diversity.unique_strategy_class_count, 3);
  assert.equal(receipt.strategy_diversity.unique_mechanism_count, 3);
  assert.equal(receipt.strategy_diversity.unique_patch_count, 3);
  assert.equal(request.ground_truth_access, 'denied');
  assert.deepEqual(request.withheld_fields, ['oracle_tests', 'ground_truth', 'expected_after_exit_status']);
  assert.equal(Object.hasOwn(request, 'oracle_tests'), false);
  assert.equal(Object.hasOwn(request, 'ground_truth'), false);
  assert.equal(request.context_receipt.retrieval.used, true);
  assert.equal(request.context_receipt.episodic_memory.consulted, true);
  assert.equal(request.context_receipt.skills.consulted, true);

  const plans = candidateSet.candidates.map((candidate) => readJson(workspace, candidate.plan_graph_path));
  assert.equal(new Set(plans.map((plan) => plan.plan_graph_id)).size, 3);
  assert.equal(new Set(plans.map((plan) => plan.strategy_class)).size, 3);
  assert.equal(new Set(plans.map((plan) => plan.mechanism)).size, 3);
  assert.ok(plans.every((plan) => plan.nodes.some((node) => node.kind === 'edit')));
  assert.ok(plans.every((plan) => plan.nodes.some((node) => node.kind === 'verify')));
  assert.ok(plans.every((plan) => plan.verification.requires_independent_verification));

  const benchmarkRun = readJson(workspace, result.benchmark_run_file);
  assert.equal(benchmarkRun.provider_evidence.provider_run_id, 'provider_run_test_plan_graphs');
  assert.equal(benchmarkRun.provider_evidence.strategy_diversity_passed, true);
  assert.equal(benchmarkRun.provider_evidence.empirical_eligibility.eligible, false);
  assert.equal(benchmarkRun.provider_evidence.files.filter((item) => item.kind === 'plan_graph').length, 3);
  assert.ok(benchmarkRun.provider_evidence.files.every((item) => fs.existsSync(path.join(workspace, item.file))));
  const byId = new Map(benchmarkRun.candidate_results.map((candidate) => [candidate.candidate_id, candidate]));
  assert.equal(byId.get('candidate_provider_minimal_boundary_validation').verdict, 'verified');
  assert.equal(byId.get('candidate_provider_structured_token_parser').verdict, 'verified');
  assert.equal(byId.get('candidate_provider_strict_default_denial').verdict, 'failed');
  assert.ok(byId.get('candidate_provider_strict_default_denial').failure_reasons.includes('regression_test_failed'));

  const indexResult = payload(buildIndex(workspace));
  const index = readJson(workspace, indexResult.output_json);
  assert.equal(index.provider_run_count, 1);
  assert.equal(index.provider_completed_run_count, 1);
  assert.equal(index.provider_integrity_passed_run_count, 1);
  assert.equal(index.provider_plan_graph_count, 3);
  assert.equal(index.provider_backed_benchmark_run_count, 1);
  assert.equal(index.plan_graph_verified_benchmark_run_count, 1);
  assert.equal(index.provider_empirical_eligible_run_count, 0);
  assert.equal(index.empirical_run_count, 0);
});

test('baseline provider configurations enforce one candidate and truthful context fidelity', () => {
  for (const [configurationId, retrievalExpected] of [
    ['baseline_a_single_attempt', false],
    ['baseline_b_retrieval', true],
  ]) {
    const workspace = makeWorkspace();
    const suffix = configurationId === 'baseline_a_single_attempt' ? 'a' : 'b';
    const result = payload(run(workspace, [
      'generate',
      '--case', CASE,
      '--provider', PROVIDER,
      '--configuration', configurationId,
      '--provider-run-id', `provider_run_test_baseline_${suffix}`,
    ]));
    const receipt = readJson(workspace, result.provider_receipt_file);
    const request = readJson(workspace, receipt.artifacts.provider_request_file);
    const candidateSet = readJson(workspace, result.candidate_set_file);
    assert.equal(result.candidate_count, 1);
    assert.equal(receipt.configuration_fidelity.passed, true);
    assert.equal(receipt.configuration_fidelity.observed.candidate_count, 1);
    assert.equal(request.context_receipt.retrieval.enabled, retrievalExpected);
    assert.equal(request.context_receipt.retrieval.used, retrievalExpected);
    assert.equal(candidateSet.candidates.length, 1);
    assert.equal(candidateSet.provider.empirical_eligibility.eligible, false);
  }
});

test('provider gate rejects duplicate strategies, forbidden edits, and candidate-budget overflow', () => {
  const workspace = makeWorkspace();
  const generated = payload(run(workspace, [
    'generate',
    '--case', CASE,
    '--provider', PROVIDER,
    '--configuration', 'mdos_verified_runtime',
    '--provider-run-id', 'provider_run_test_adversarial_source',
  ]));
  const candidateSet = readJson(workspace, generated.candidate_set_file);
  const receipt = readJson(workspace, generated.provider_receipt_file);
  const request = readJson(workspace, receipt.artifacts.provider_request_file);
  const providerResult = readJson(workspace, receipt.artifacts.provider_result_file);
  const benchmarkCase = readJson(REPO_ROOT, CASE);
  const provider = readJson(REPO_ROOT, PROVIDER);
  const context = {
    benchmarkCase,
    configuration: CONFIGURATIONS.mdos_verified_runtime,
    provider,
    providerRunId: providerResult.provider_run_id,
    request,
    requestHash: sha256Json(request),
  };
  assert.equal(candidateSet.candidates.length, 3);

  const duplicate = structuredClone(providerResult);
  duplicate.candidates[1].plan_graph.strategy_class = duplicate.candidates[0].plan_graph.strategy_class;
  assert.throws(
    () => validateProviderResult(duplicate, context),
    /PLAN_DIVERSITY_FAILED: DUPLICATE_STRATEGY_CLASS/
  );

  const forbidden = structuredClone(providerResult);
  const editNode = forbidden.candidates[1].plan_graph.nodes.find((node) => node.kind === 'edit');
  editNode.target_paths = ['checks/targeted.check.js'];
  assert.throws(
    () => validateProviderResult(forbidden, context),
    /PLAN_GRAPH_FORBIDDEN_EDIT_TARGET/
  );

  const overBudgetContext = structuredClone(context);
  overBudgetContext.request.resource_budget.max_candidates = 1;
  overBudgetContext.requestHash = sha256Json(overBudgetContext.request);
  overBudgetContext.providerRunId = providerResult.provider_run_id;
  const overBudget = structuredClone(providerResult);
  overBudget.request_hash = overBudgetContext.requestHash;
  for (const candidate of overBudget.candidates) candidate.plan_graph.provenance.input_hash = overBudgetContext.requestHash;
  assert.throws(
    () => validateProviderResult(overBudget, overBudgetContext),
    /CANDIDATE_BUDGET_EXCEEDED/
  );
});

test('controlled fixture provider is blocked from holdout and provider runs are append-only', () => {
  const workspace = makeWorkspace();
  const holdoutCase = readJson(workspace, CASE);
  holdoutCase.split = 'holdout';
  holdoutCase.ground_truth.candidate_disclosure = 'withheld_until_verification';
  const holdoutPath = 'md-os/benchmarks/software_repair/cases/holdout_provider_check.json';
  fs.writeFileSync(path.join(workspace, holdoutPath), `${JSON.stringify(holdoutCase, null, 2)}\n`, 'utf8');
  const holdout = payload(run(workspace, [
    'generate',
    '--case', holdoutPath,
    '--provider', PROVIDER,
    '--configuration', 'mdos_verified_runtime',
    '--provider-run-id', 'provider_run_test_holdout_block',
  ]), 1);
  assert.equal(holdout.ok, false);
  assert.match(holdout.error, /CANDIDATE_PROVIDER_HOLDOUT_CONTAMINATED/);
  assert.equal(fs.existsSync(path.join(
    workspace,
    'md-os/ops/benchmarks/software_repair/candidate_sets/provider_run_test_holdout_block'
  )), false);

  const args = [
    'generate',
    '--case', CASE,
    '--provider', PROVIDER,
    '--configuration', 'baseline_a_single_attempt',
    '--provider-run-id', 'provider_run_test_append_only',
  ];
  payload(run(workspace, args));
  const duplicate = payload(run(workspace, args), 1);
  assert.match(duplicate.error, /CANDIDATE_PROVIDER_APPEND_ONLY_CONFLICT/);
});
