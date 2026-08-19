#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
  sha256Json,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir } = require('./lib/fs_runtime');

function normalize(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function validateTask(task) {
  const strings = ['experiment_id', 'question', 'direct_candidate', 'revised_candidate'];
  for (const key of strings) if (!task || typeof task[key] !== 'string' || !task[key].trim()) throw new Error(`REFLECTIVE_TASK_INVALID_${key.toUpperCase()}`);
  if (!/^[a-z0-9_]+$/.test(task.experiment_id)) throw new Error('REFLECTIVE_TASK_INVALID_EXPERIMENT_ID');
  for (const key of ['evidence', 'required_facts', 'forbidden_claims']) if (!Array.isArray(task[key])) throw new Error(`REFLECTIVE_TASK_INVALID_${key.toUpperCase()}`);
  if (!task.evidence.length || !task.required_facts.length) throw new Error('REFLECTIVE_TASK_REQUIRES_EVIDENCE_AND_FACTS');
  return task;
}

function evaluate(answer, task) {
  const text = normalize(answer);
  const factChecks = task.required_facts.map((fact) => ({
    fact_id: fact.fact_id,
    passed: fact.all_terms.every((term) => text.includes(normalize(term))),
    required_terms: fact.all_terms,
  }));
  const forbiddenChecks = task.forbidden_claims.map((claim) => ({
    claim_id: claim.claim_id,
    triggered: text.includes(normalize(claim.pattern)),
    pattern: claim.pattern,
  }));
  const passedFacts = factChecks.filter((item) => item.passed).length;
  const triggered = forbiddenChecks.filter((item) => item.triggered).length;
  const denominator = factChecks.length + forbiddenChecks.length;
  const score = denominator ? (passedFacts + forbiddenChecks.length - triggered) / denominator : 0;
  return {
    passed: passedFacts === factChecks.length && triggered === 0,
    score: Number(score.toFixed(4)),
    fact_checks: factChecks,
    forbidden_checks: forbiddenChecks,
  };
}

function buildCritique(direct) {
  const problems = [];
  for (const check of direct.fact_checks) if (!check.passed) problems.push(`missing required fact: ${check.fact_id}`);
  for (const check of direct.forbidden_checks) if (check.triggered) problems.push(`forbidden misconception: ${check.claim_id}`);
  return problems;
}

function compare(task, timestamp = nowIso()) {
  validateTask(task);
  const direct = evaluate(task.direct_candidate, task);
  const critique = buildCritique(direct);
  const reflective = evaluate(task.revised_candidate, task);
  const delta = Number((reflective.score - direct.score).toFixed(4));
  return {
    schema_version: 1,
    experiment_id: task.experiment_id,
    completed_at: timestamp,
    question: task.question,
    method: 'paired_direct_vs_reflective_declared_evidence_v1',
    direct: { candidate: task.direct_candidate, evaluation: direct },
    reflective: {
      initial_candidate: task.direct_candidate,
      critique,
      evidence: task.evidence,
      revised_candidate: task.revised_candidate,
      evaluation: reflective,
    },
    metrics: {
      direct_score: direct.score,
      reflective_score: reflective.score,
      score_delta: delta,
      direct_passed: direct.passed,
      reflective_passed: reflective.passed,
      reflection_improved: delta > 0 && reflective.passed,
    },
    verdict: delta > 0 && reflective.passed ? 'verified_improvement' : 'no_verified_improvement',
    limitations: [
      'controlled fixture with supplied candidates and evidence',
      'proves protocol behavior, not autonomous general reasoning',
      'single task does not establish generalization',
    ],
  };
}

function markdown(report) {
  return [
    `# Reflective Experiment: ${report.experiment_id}`,
    '',
    `Status: \`${report.verdict}\``,
    '',
    `Direct score: \`${report.metrics.direct_score}\``,
    '',
    `Reflective score: \`${report.metrics.reflective_score}\``,
    '',
    `Delta: \`${report.metrics.score_delta}\``,
    '',
    'Critique:',
    '',
    report.reflective.critique.map((x) => `- ${x}`).join('\n'),
    '',
    'This controlled fixture verifies the reflective protocol only. It does not prove autonomous general thought.',
    '',
  ].join('\n');
}

function runOnce(taskArg) {
  const taskPath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, taskArg));
  const task = validateTask(JSON.parse(fs.readFileSync(taskPath, 'utf8')));
  const report = compare(task);
  const outDir = path.join(MDOS_ROOT, 'ops', 'experiments', 'reflective', task.experiment_id);
  const episodeDir = path.join(MDOS_ROOT, 'ops', 'episodes');
  const verificationDir = path.join(MDOS_ROOT, 'ops', 'verifications');
  ensureDir(outDir); ensureDir(episodeDir); ensureDir(verificationDir);
  const reportFile = path.join(outDir, 'report.json');
  atomicWriteJson(reportFile, report);
  atomicWriteText(path.join(outDir, 'report.md'), markdown(report));
  const reportRel = path.relative(WORKSPACE_ROOT, reportFile).replace(/\\/g, '/');
  const taskRel = path.relative(WORKSPACE_ROOT, taskPath).replace(/\\/g, '/');
  const verifier = {
    verifier_id: `ver_${task.experiment_id}`,
    status: report.verdict === 'verified_improvement' ? 'ok' : 'critical',
    outcome: report.verdict === 'verified_improvement' ? 'verified' : 'failed',
    independent_from_planner: true,
    action_receipt_ids: [],
    evidence: [reportRel, ...task.evidence.map((item) => item.source)],
    checks: [
      { check_id: 'direct_contract', status: report.metrics.direct_passed ? 'ok' : 'attention', message: `Direct candidate score: ${report.metrics.direct_score}.` },
      { check_id: 'reflective_contract', status: report.metrics.reflective_passed ? 'ok' : 'critical', message: `Reflective candidate score: ${report.metrics.reflective_score}.` },
      { check_id: 'measured_improvement', status: report.metrics.reflection_improved ? 'ok' : 'critical', message: `Measured score delta: ${report.metrics.score_delta}.` },
    ],
    acceptance_results: [{ acceptance_id: 'reflective_answer_improves_and_passes', passed: report.metrics.reflection_improved }],
  };
  const verificationFile = path.join(verificationDir, `${verifier.verifier_id}.json`);
  atomicWriteJson(verificationFile, verifier);
  const verificationRel = path.relative(WORKSPACE_ROOT, verificationFile).replace(/\\/g, '/');
  const taskSpec = {
    schema_version: 1,
    task_spec_id: `task_${task.experiment_id}`,
    created_at: report.completed_at,
    goal: task.question,
    task_type: 'research_task',
    constraints: ['controlled fixture', 'no external action', 'declared evidence only'],
    acceptance_tests: [],
    risk_budget: { level: 'low' },
    resource_budget: { autonomous_loop: false, cycles: 1 },
    required_evidence: [{ evidence_id: 'reflective_report', path: reportRel, must_exist: true, sha256: sha256Json(report) }],
    unknowns: report.limitations,
    success_definition: { acceptance_tests_required: true, all_acceptance_tests_must_pass: true, observed_delta_required: false, required_evidence_must_exist: true },
    actions: [],
    observation_targets: [{ target_id: 'paired_score_delta', path: reportRel, required_change: false }],
  };
  const episode = {
    schema_version: 1,
    episode_id: `ep_${task.experiment_id}`,
    created_at: report.completed_at,
    task: task.question,
    task_type: 'research_task',
    risk_level: 'low',
    task_spec: taskSpec,
    task_spec_file: taskRel,
    context_pack_id: `ctx_${task.experiment_id}`,
    plan: [
      { step: 'Evaluate the direct candidate', status: 'completed' },
      { step: 'Critique against declared facts and misconceptions', status: 'completed' },
      { step: 'Evaluate the revised candidate', status: 'completed' },
    ],
    actions: [
      { action_id: 'evaluate_direct', result: `score ${report.metrics.direct_score}` },
      { action_id: 'evaluate_reflective', result: `score ${report.metrics.reflective_score}` },
    ],
    observations: [{ observation_id: 'paired_score_delta', result: `score delta ${report.metrics.score_delta}` }],
    errors: report.reflective.critique.map((message, index) => ({ error_id: `direct_error_${index + 1}`, message })),
    artifacts: [taskRel, reportRel, verificationRel],
    action_receipts: [],
    verification_result_file: verificationRel,
    verifier_results: [verifier],
    verdict: report.verdict === 'verified_improvement' ? 'success' : 'failed',
    lessons: report.limitations,
    candidate_claim_updates: [],
    candidate_skills: [],
    regressions: [],
    report_sha256: sha256Json(report),
  };
  const episodeFile = path.join(episodeDir, `${episode.episode_id}.json`);
  atomicWriteJson(episodeFile, episode);
  return {
    ok: true,
    mode: 'reflective_operation_run_once',
    experiment_id: task.experiment_id,
    verdict: report.verdict,
    metrics: report.metrics,
    report: reportRel,
    episode: path.relative(WORKSPACE_ROOT, episodeFile).replace(/\\/g, '/'),
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'run-once' || !argv[1]) throw new Error('Usage: reflective_operation.js run-once <task.json>');
  printJson(runOnce(argv[1]));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { buildCritique, compare, evaluate, validateTask };
