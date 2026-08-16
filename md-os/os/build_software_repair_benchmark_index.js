#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MDOS_ROOT, WORKSPACE_ROOT, nowIso, printJson, sha256Json } = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { CONFIGURATIONS } = require('../kernel/cognition/benchmark_runner');

const CASES_DIR = path.join(MDOS_ROOT, 'benchmarks', 'software_repair', 'cases');
const ROOT = path.join(MDOS_ROOT, 'ops', 'benchmarks', 'software_repair');
const RUNS_DIR = path.join(ROOT, 'runs');
const CANDIDATE_SETS_DIR = path.join(ROOT, 'candidate_sets');
const OUTPUT_JSON = path.join(ROOT, 'index.json');
const OUTPUT_MD = path.join(ROOT, 'index.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function resolveArtifact(relativePath) {
  const text = String(relativePath || '').replace(/\\/g, '/');
  if (!text.startsWith('md-os/ops/benchmarks/software_repair/candidate_sets/') || text.split('/').includes('..')) return null;
  const resolved = path.resolve(WORKSPACE_ROOT, text);
  const relative = path.relative(CANDIDATE_SETS_DIR, resolved);
  return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved;
}

function providerIntegrity(receipt) {
  const findings = [];
  const artifacts = receipt.artifacts || {};
  const requestPath = resolveArtifact(artifacts.provider_request_file);
  const resultPath = resolveArtifact(artifacts.provider_result_file);
  const candidateSetPath = resolveArtifact(artifacts.candidate_set_file);
  const request = requestPath && readJsonSafe(requestPath);
  const result = resultPath && readJsonSafe(resultPath);
  if (!request || sha256Json(request) !== receipt.request_hash) findings.push('provider_request_hash_mismatch');
  if (!result || sha256Json(result) !== receipt.result_hash) findings.push('provider_result_hash_mismatch');
  if (!candidateSetPath || !fs.existsSync(candidateSetPath)) findings.push('candidate_set_missing');
  for (const plan of Array.isArray(artifacts.plan_graphs) ? artifacts.plan_graphs : []) {
    const planPath = resolveArtifact(plan.file);
    const payload = planPath && readJsonSafe(planPath);
    if (!payload || sha256Json(payload) !== plan.sha256) findings.push(`plan_graph_hash_mismatch:${plan.plan_graph_id || plan.file}`);
  }
  for (const patch of Array.isArray(artifacts.patches) ? artifacts.patches : []) {
    const patchPath = resolveArtifact(patch.file);
    if (!patchPath || !fs.existsSync(patchPath) || fileSha256(patchPath) !== patch.sha256) findings.push(`patch_hash_mismatch:${patch.candidate_id || patch.file}`);
  }
  return { passed: findings.length === 0, findings };
}

function listCaseFiles() {
  if (!fs.existsSync(CASES_DIR)) return [];
  return fs.readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(CASES_DIR, entry.name))
    .sort();
}

function listRunFiles() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  return fs.readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(RUNS_DIR, entry.name, 'benchmark_run.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function listProviderReceiptFiles() {
  if (!fs.existsSync(CANDIDATE_SETS_DIR)) return [];
  return fs.readdirSync(CANDIDATE_SETS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CANDIDATE_SETS_DIR, entry.name, 'provider_receipt.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .sort();
}

function sumKnown(values) {
  return values.length && values.every(Number.isFinite)
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function configurationSummary(configurationId, runs) {
  const matching = runs.filter((run) => run.configuration && run.configuration.configuration_id === configurationId);
  const empirical = matching.filter((run) => run.empirical_claim_scope !== 'runner_validation_only');
  const holdout = empirical.filter((run) => run.split === 'holdout' && run.empirical_claim_scope === 'holdout_measurement');
  const verifiedHoldout = holdout.filter((run) => run.metrics && run.metrics.verified_candidate_count > 0);
  return {
    configuration_id: configurationId,
    run_count: matching.length,
    runner_validation_run_count: matching.filter((run) => run.empirical_claim_scope === 'runner_validation_only').length,
    empirical_run_count: empirical.length,
    holdout_run_count: holdout.length,
    verified_holdout_count: verifiedHoldout.length,
    verified_success_rate_holdout: holdout.length ? verifiedHoldout.length / holdout.length : null,
    regression_count: empirical.reduce((sum, run) => sum + Number(run.metrics && run.metrics.regression_count || 0), 0),
    total_tokens: sumKnown(empirical.map((run) => run.metrics && run.metrics.total_tokens)),
    total_cost: sumKnown(empirical.map((run) => run.metrics && run.metrics.total_cost)),
    human_interventions: empirical.reduce((sum, run) => sum + Number(run.metrics && run.metrics.human_interventions || 0), 0),
  };
}

function buildIndex() {
  const cases = listCaseFiles().map((filePath) => readJsonSafe(filePath)).filter(Boolean);
  const runs = listRunFiles().map((filePath) => readJsonSafe(filePath)).filter(Boolean);
  const providerRuns = listProviderReceiptFiles().map((filePath) => readJsonSafe(filePath)).filter(Boolean);
  const providerIntegrityResults = new Map(providerRuns.map((receipt) => [receipt.provider_run_id, providerIntegrity(receipt)]));
  const configurations = Object.keys(CONFIGURATIONS).map((configurationId) => configurationSummary(configurationId, runs));
  const empiricalRuns = runs.filter((run) => run.empirical_claim_scope !== 'runner_validation_only');
  const runnerValidationRuns = runs.filter((run) => run.empirical_claim_scope === 'runner_validation_only');
  const runnerValidationVerifiedRuns = runnerValidationRuns.filter((run) => run.metrics && run.metrics.verified_candidate_count > 0);
  const providerBackedRuns = runs.filter((run) => run.provider_evidence && run.provider_evidence.provider_run_id);
  const planGraphVerifiedRuns = providerBackedRuns.filter((run) => run.provider_evidence.strategy_diversity_passed === true);
  const providerPlanCount = providerRuns.reduce((sum, receipt) => sum + Number(receipt.strategy_diversity && receipt.strategy_diversity.plan_count || 0), 0);
  const empiricalEligibleProviderRuns = providerRuns.filter((receipt) => receipt.empirical_eligibility && receipt.empirical_eligibility.eligible === true);
  const findings = [];
  if (!cases.length) findings.push({ severity: 'critical', code: 'NO_SOFTWARE_REPAIR_CASES', message: 'At least one reproducible software-repair case is required.' });
  if (!providerRuns.length) findings.push({ severity: 'attention', code: 'NO_CANDIDATE_PROVIDER_RUNS', message: 'No append-only CandidateProvider receipt exists yet.' });
  for (const receipt of providerRuns) {
    const integrity = providerIntegrityResults.get(receipt.provider_run_id);
    if (!integrity.passed) findings.push({
      severity: 'critical',
      code: 'CANDIDATE_PROVIDER_EVIDENCE_INTEGRITY_FAILED',
      provider_run_id: receipt.provider_run_id,
      details: integrity.findings,
      message: 'CandidateProvider evidence no longer matches its proof-carrying receipt.',
    });
  }
  if (!empiricalRuns.length) findings.push({ severity: 'attention', code: 'NO_EMPIRICAL_BENCHMARK_RUNS', message: 'Only runner-validation evidence exists; no intelligence or baseline claim is measured.' });
  for (const configuration of configurations) {
    if (!configuration.holdout_run_count) {
      findings.push({
        severity: 'attention',
        code: 'HOLDOUT_CONFIGURATION_UNMEASURED',
        configuration_id: configuration.configuration_id,
        message: 'No uncontaminated holdout run exists for this configuration.',
      });
    }
  }
  const status = findings.some((finding) => finding.severity === 'critical')
    ? 'critical'
    : findings.length
      ? 'attention'
      : 'ok';
  const sourceProjection = {
    cases: cases.map((item) => ({ benchmark_case_id: item.benchmark_case_id, split: item.split, repository: item.repository })),
    runs: runs.map((item) => ({
      benchmark_run_id: item.benchmark_run_id,
      case_hash: item.case_hash,
      candidate_set_hash: item.candidate_set_hash,
      configuration_id: item.configuration && item.configuration.configuration_id,
      split: item.split,
      status: item.status,
      empirical_claim_scope: item.empirical_claim_scope,
      metrics: item.metrics,
      provider_evidence: item.provider_evidence || null,
    })),
    provider_runs: providerRuns.map((item) => ({
      provider_run_id: item.provider_run_id,
      provider_id: item.provider_id,
      configuration_id: item.configuration_id,
      request_hash: item.request_hash,
      result_hash: item.result_hash,
      configuration_fidelity: item.configuration_fidelity,
      strategy_diversity: item.strategy_diversity,
      empirical_eligibility: item.empirical_eligibility,
      integrity: providerIntegrityResults.get(item.provider_run_id),
    })),
  };
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(sourceProjection),
    status,
    benchmark_name: 'software_repair_vertical_v1',
    primary_metric: 'verified_success_rate_holdout',
    cumulative_metric: 'delta_verified_success_rate_holdout',
    case_count: cases.length,
    run_count: runs.length,
    provider_run_count: providerRuns.length,
    provider_completed_run_count: providerRuns.filter((receipt) => receipt.status === 'completed').length,
    provider_integrity_passed_run_count: providerRuns.filter((receipt) => providerIntegrityResults.get(receipt.provider_run_id).passed).length,
    provider_empirical_eligible_run_count: empiricalEligibleProviderRuns.length,
    provider_plan_graph_count: providerPlanCount,
    provider_backed_benchmark_run_count: providerBackedRuns.length,
    plan_graph_verified_benchmark_run_count: planGraphVerifiedRuns.length,
    runner_validation_run_count: runnerValidationRuns.length,
    runner_validation_verified_run_count: runnerValidationVerifiedRuns.length,
    runner_validation_no_selection_run_count: runnerValidationRuns.length - runnerValidationVerifiedRuns.length,
    empirical_run_count: empiricalRuns.length,
    configurations,
    learning_delta: {
      status: 'not_measured',
      delta_verified_success_rate_holdout: null,
      reason: 'Requires at least two named, uncontaminated holdout cohorts before and after verified experience acquisition.',
    },
    findings,
  };
}

function renderMarkdown(index) {
  const lines = [
    '# Software Repair Benchmark Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    '',
    `Status: \`${index.status}\``,
    '',
    `Primary metric: \`${index.primary_metric}\``,
    '',
    `Cumulative metric: \`${index.cumulative_metric}\``,
    '',
    `Runner validation: \`${index.runner_validation_verified_run_count}\` verified-selection run(s), \`${index.runner_validation_no_selection_run_count}\` no-selection run(s).`,
    '',
    `Candidate provider: \`${index.provider_completed_run_count}/${index.provider_run_count}\` completed run(s), \`${index.provider_integrity_passed_run_count}\` integrity-valid, \`${index.provider_plan_graph_count}\` PlanGraph(s), \`${index.provider_empirical_eligible_run_count}\` empirically eligible.`,
    '',
    `Provider-backed benchmark runs: \`${index.provider_backed_benchmark_run_count}\`; diversity-gated runs: \`${index.plan_graph_verified_benchmark_run_count}\`.`,
    '',
    '| Configuration | Runs | Empirical | Holdout | Verified holdout | Success rate | Regressions | Token | Cost |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|',
    ...index.configurations.map((item) => `| ${item.configuration_id} | ${item.run_count} | ${item.empirical_run_count} | ${item.holdout_run_count} | ${item.verified_holdout_count} | ${item.verified_success_rate_holdout === null ? 'not measured' : item.verified_success_rate_holdout} | ${item.regression_count} | ${item.total_tokens === null ? 'not measured' : item.total_tokens} | ${item.total_cost === null ? 'not measured' : item.total_cost} |`),
    '',
    '## Learning delta',
    '',
    `Status: \`${index.learning_delta.status}\``,
    '',
    index.learning_delta.reason,
    '',
    '## Findings',
    '',
    ...(index.findings.length
      ? index.findings.map((finding) => `- \`${finding.severity}\` \`${finding.code}\`${finding.configuration_id ? ` \`${finding.configuration_id}\`` : ''}: ${finding.message}`)
      : ['- No benchmark finding.']),
    '',
  ];
  return lines.join('\n');
}

function main() {
  const index = buildIndex();
  withFileLock('builder__software_repair_benchmark_index', {
    context: 'build_software_repair_benchmark_index',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, index);
    atomicWriteText(OUTPUT_MD, `${renderMarkdown(index)}\n`);
  });
  appendJournal({
    event: 'software_repair_benchmark_index_rebuilt',
    status: index.status,
    case_count: index.case_count,
    run_count: index.run_count,
    provider_run_count: index.provider_run_count,
    provider_plan_graph_count: index.provider_plan_graph_count,
    empirical_run_count: index.empirical_run_count,
    output_file: rel(OUTPUT_JSON),
  });
  printJson({
    ok: true,
    mode: 'build_software_repair_benchmark_index',
    status: index.status,
    case_count: index.case_count,
    run_count: index.run_count,
    provider_run_count: index.provider_run_count,
    provider_plan_graph_count: index.provider_plan_graph_count,
    empirical_run_count: index.empirical_run_count,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

if (require.main === module) main();

module.exports = { buildIndex };
