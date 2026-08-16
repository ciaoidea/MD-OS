#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  sha256Json,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('../../os/lib/fs_runtime');
const { appendJournal } = require('../../os/lib/journal');
const { runSoftwareRepairBenchmark } = require('./benchmark_runner');
const { generateCandidateSet } = require('./candidate_provider');
const {
  CONSTRAINTS,
  induceDelimitedBoundarySkill,
  renderSkillMarkdown,
} = require('./skill_induction');
const { buildPromotionGate, runPromote } = require('../../os/agi_loop');

const CASE_ROOT = path.join(MDOS_ROOT, 'benchmarks', 'software_repair', 'cases');
const PROVIDER_PATH = 'md-os/benchmarks/software_repair/providers/delimited_boundary_learning.json';
const EPISODES_ROOT = path.join(MDOS_ROOT, 'ops', 'episodes');
const TASKS_ROOT = path.join(MDOS_ROOT, 'ops', 'tasks');
const VERIFICATIONS_ROOT = path.join(MDOS_ROOT, 'ops', 'verifications');
const EVALS_ROOT = path.join(MDOS_ROOT, 'ops', 'evals');
const SKILL_CANDIDATES_ROOT = path.join(MDOS_ROOT, 'ops', 'skills', 'candidates');
const SKILL_PROMOTED_ROOT = path.join(MDOS_ROOT, 'ops', 'skills', 'promoted');
const EXPERIMENTS_ROOT = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments');
const STATUS_JSON = path.join(MDOS_ROOT, 'ops', 'agi', 'neuromorphic_learning_status.json');
const STATUS_MD = path.join(MDOS_ROOT, 'ops', 'agi', 'neuromorphic_learning_status.md');

const CASES = Object.freeze({
  development: Object.freeze([
    'missing_boundary_validation.json',
    'api_key_boundary.json',
  ]),
  validation: Object.freeze(['session_handle_boundary.json']),
  holdout: Object.freeze([
    'route_descriptor_boundary.json',
    'envelope_address_boundary.json',
  ]),
});

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, label = 'JSON') {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${rel(filePath)}: ${error.message}`);
  }
}

function casePath(fileName) {
  return rel(path.join(CASE_ROOT, fileName));
}

function compactPhase(value) {
  return shortText(value).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
}

function executionIds(experimentId, phase, benchmarkCaseId) {
  const digest = sha256Json({ experiment_id: experimentId, phase, benchmark_case_id: benchmarkCaseId }).slice(0, 18);
  const phaseTag = compactPhase(phase).slice(0, 18);
  return {
    provider_run_id: `provider_run_${phaseTag}_${digest}`,
    benchmark_run_id: `benchmark_run_${phaseTag}_${digest}`,
  };
}

function runCase({ experimentId, phase, caseFile, configurationId }) {
  const caseFilePath = path.join(CASE_ROOT, caseFile);
  const benchmarkCase = readJson(caseFilePath, 'NEUROMORPHIC_CASE');
  const ids = executionIds(experimentId, phase, benchmarkCase.benchmark_case_id);
  const generated = generateCandidateSet({
    case_path: rel(caseFilePath),
    provider_path: PROVIDER_PATH,
    provider_run_id: ids.provider_run_id,
    configuration_id: configurationId,
    experiment_context: { experiment_id: experimentId },
  });
  const executed = runSoftwareRepairBenchmark({
    case_path: rel(caseFilePath),
    candidate_set_path: generated.candidate_set_file,
    configuration_id: configurationId,
    candidate_ids: [],
    run_id: ids.benchmark_run_id,
  });
  const run = readJson(path.join(WORKSPACE_ROOT, executed.benchmark_run_file), 'NEUROMORPHIC_BENCHMARK_RUN');
  const comparison = readJson(path.join(WORKSPACE_ROOT, executed.candidate_comparison_file), 'NEUROMORPHIC_COMPARISON');
  const providerReceipt = readJson(path.join(WORKSPACE_ROOT, generated.provider_receipt_file), 'NEUROMORPHIC_PROVIDER_RECEIPT');
  const providerRequestFile = providerReceipt.artifacts && providerReceipt.artifacts.provider_request_file;
  const providerRequest = readJson(path.join(WORKSPACE_ROOT, providerRequestFile), 'NEUROMORPHIC_PROVIDER_REQUEST');
  return {
    phase,
    case_file: rel(caseFilePath),
    benchmark_case: benchmarkCase,
    generated,
    executed,
    run,
    comparison,
    provider_receipt: providerReceipt,
    provider_request: providerRequest,
  };
}

function runSucceeded(record) {
  return record.run.status === 'completed'
    && record.run.candidate_results.some((candidate) => candidate.verdict === 'verified');
}

function verifiedCandidates(record) {
  return record.run.candidate_results.filter((candidate) => candidate.verdict === 'verified');
}

function writeJsonOnce(filePath, payload, label) {
  if (fs.existsSync(filePath)) throw new Error(`${label}_APPEND_ONLY_CONFLICT: ${rel(filePath)}`);
  atomicWriteJson(filePath, payload);
}

function writeTextOnce(filePath, text, label) {
  if (fs.existsSync(filePath)) throw new Error(`${label}_APPEND_ONLY_CONFLICT: ${rel(filePath)}`);
  atomicWriteText(filePath, text);
}

function taskSpecForEpisode({ episodeId, createdAt, record }) {
  const taskSpecId = `task_${episodeId.replace(/^ep_/, '').slice(0, 70)}`;
  const runFile = record.executed.benchmark_run_file;
  return {
    schema_version: 1,
    task_spec_id: taskSpecId,
    created_at: createdAt,
    goal: `Acquire independently verified evidence from ${record.benchmark_case.benchmark_case_id} for bounded cross-case skill induction.`,
    task_type: 'software_repair',
    constraints: [
      'development_split_only',
      'oracle_external_to_candidate_generator',
      'candidate_generator_ground_truth_access_denied',
      'failed_hypotheses_are_retained_as_learning_signal',
    ],
    acceptance_tests: [{
      connector_id: 'terminal_executor',
      project_id: 'software_repair_neuromorphic_learning',
      command_id: `benchmark_${record.benchmark_case.benchmark_case_id}`,
      expected_exit_status: 0,
    }],
    risk_budget: { level: 'low' },
    resource_budget: {
      max_actions: record.run.metrics.candidate_count,
      max_candidates: record.run.metrics.candidate_count,
      max_human_interventions: 0,
    },
    required_evidence: [{
      evidence_id: `evidence_${record.benchmark_case.benchmark_case_id}`,
      path: runFile,
      must_exist: true,
    }],
    unknowns: [],
    success_definition: {
      acceptance_tests_required: true,
      all_acceptance_tests_must_pass: true,
      observed_delta_required: true,
      required_evidence_must_exist: true,
    },
    actions: [],
    observation_targets: [{
      target_id: `target_${record.benchmark_case.benchmark_case_id}`,
      path: runFile,
      required_change: false,
    }],
  };
}

function renderEpisodeMarkdown(episode) {
  const verified = episode.benchmark_evidence.verified_candidate_ids;
  const predictionErrors = Array.isArray(episode.prediction_errors) ? episode.prediction_errors : [];
  return [
    `# Episode ${episode.episode_id}`,
    '',
    `Created: \`${episode.created_at}\``,
    '',
    `Verdict: \`${episode.verdict}\``,
    '',
    `Case: \`${episode.learning_observation.benchmark_case_id}\``,
    '',
    `Verified candidates: \`${verified.join(', ')}\``,
    '',
    '## Error-driven observations',
    '',
    ...predictionErrors.map((error) => `- \`${error.candidate_id}\`: ${error.failure_class}`),
    '',
    '## Lessons',
    '',
    ...episode.lessons.map((lesson) => `- ${lesson}`),
    '',
  ].join('\n');
}

function episodeFromDevelopmentRun({ experimentId, record, createdAt }) {
  if (record.benchmark_case.split !== 'development') {
    throw new Error(`NEUROMORPHIC_EPISODE_SPLIT_INVALID: ${record.benchmark_case.benchmark_case_id}`);
  }
  if (!runSucceeded(record)) {
    throw new Error(`NEUROMORPHIC_DEVELOPMENT_RUN_UNVERIFIED: ${record.benchmark_case.benchmark_case_id}`);
  }
  if (!record.benchmark_case.learning_observation) {
    throw new Error(`NEUROMORPHIC_LEARNING_OBSERVATION_MISSING: ${record.benchmark_case.benchmark_case_id}`);
  }
  const digest = sha256Json({ experiment_id: experimentId, case: record.benchmark_case.benchmark_case_id }).slice(0, 16);
  const episodeId = `ep_neuromorphic_${digest}`;
  const taskSpec = taskSpecForEpisode({ episodeId, createdAt, record });
  const taskFile = path.join(TASKS_ROOT, `${taskSpec.task_spec_id}.json`);
  const verificationId = `verification_${episodeId}`;
  const verificationFile = path.join(VERIFICATIONS_ROOT, `${verificationId}.json`);
  const verified = verifiedCandidates(record);
  const failed = record.run.candidate_results.filter((candidate) => candidate.verdict !== 'verified');
  const verifier = {
    verifier_id: 'software_repair_external_oracle',
    status: 'ok',
    outcome: 'verified',
    independent_from_planner: true,
    acceptance_results: record.run.candidate_results.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      outcome: candidate.verdict,
      oracle_passed: (candidate.oracle_results || []).every((result) => result.passed),
      regression_passed: (candidate.regression_results || []).every((result) => result.passed),
    })),
    action_receipt_ids: [],
    evidence: [
      record.executed.benchmark_run_file,
      record.executed.candidate_comparison_file,
      record.generated.provider_receipt_file,
    ],
    checks: [
      {
        check_id: 'external_oracle_verified_candidate',
        status: verified.length ? 'ok' : 'critical',
        message: `${verified.length} candidate(s) passed all visible checks and the independent oracle.`,
        evidence: [record.executed.benchmark_run_file],
      },
      {
        check_id: 'provider_ground_truth_denied',
        status: record.provider_request.ground_truth_access === 'denied' ? 'ok' : 'critical',
        message: 'The candidate provider did not receive oracle or expected-after fields.',
        evidence: [record.generated.provider_receipt_file],
      },
      {
        check_id: 'no_regression',
        status: record.run.metrics.regression_count === 0 ? 'ok' : 'critical',
        message: `Recorded regression count: ${record.run.metrics.regression_count}.`,
        evidence: [record.executed.benchmark_run_file],
      },
    ],
  };
  const verification = {
    schema_version: 1,
    verification_id: verificationId,
    created_at: createdAt,
    experiment_id: experimentId,
    benchmark_run_id: record.run.benchmark_run_id,
    benchmark_case_id: record.benchmark_case.benchmark_case_id,
    ...verifier,
  };
  const observation = {
    ...record.benchmark_case.learning_observation,
    benchmark_case_id: record.benchmark_case.benchmark_case_id,
  };
  const episode = {
    schema_version: 1,
    episode_id: episodeId,
    created_at: createdAt,
    task: taskSpec.goal,
    task_type: 'software_repair',
    risk_level: 'low',
    allowed_tools: ['software_repair_benchmark', 'independent_oracle'],
    task_spec: taskSpec,
    task_spec_file: rel(taskFile),
    context_pack_id: `context_neuromorphic_${sha256Json(experimentId).slice(0, 12)}`,
    plan: [
      { step_id: 'encode_episode', actor: 'fast_episodic_memory', action: 'retain verified examples and failed candidate outcomes' },
      { step_id: 'compute_surprise', actor: 'event_driven_plasticity', action: 'update only where evidence eliminates hypotheses' },
      { step_id: 'defer_promotion', actor: 'homeostatic_gate', action: 'require independent episodes and sealed holdout improvement' },
    ],
    actions: record.run.candidate_results.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      strategy_class: candidate.strategy_class,
      outcome: candidate.verdict,
    })),
    observations: [{
      observation_id: `observation_${record.benchmark_case.benchmark_case_id}`,
      hypothesis_family: observation.hypothesis_family,
      example_count: observation.examples.length,
      verified_candidate_count: verified.length,
      failed_candidate_count: failed.length,
    }],
    errors: [],
    prediction_errors: failed.map((candidate) => ({
      candidate_id: candidate.candidate_id,
      failure_class: 'oracle_rejected_hypothesis',
      strategy_class: candidate.strategy_class,
    })),
    artifacts: [
      rel(taskFile),
      rel(verificationFile),
      record.executed.benchmark_run_file,
      record.executed.candidate_comparison_file,
      record.generated.provider_receipt_file,
    ],
    action_receipts: [],
    verification_result_file: rel(verificationFile),
    verifier_results: [verifier],
    verdict: 'success',
    lessons: [
      `${failed.length} competing hypotheses were rejected by external evidence.`,
      `${verified.length} candidate hypotheses remained behaviorally valid for this development case.`,
      'No skill is promoted from this episode alone.',
    ],
    candidate_claim_updates: [],
    candidate_skills: [],
    regressions: [],
    learning_observation: observation,
    benchmark_evidence: {
      benchmark_run_id: record.run.benchmark_run_id,
      benchmark_run_file: record.executed.benchmark_run_file,
      provider_run_id: record.generated.provider_run_id,
      provider_receipt_file: record.generated.provider_receipt_file,
      verified_candidate_ids: verified.map((candidate) => candidate.candidate_id),
      failed_candidate_ids: failed.map((candidate) => candidate.candidate_id),
      candidate_count: record.run.metrics.candidate_count,
      regression_count: record.run.metrics.regression_count,
    },
  };
  return { episode, taskSpec, taskFile, verification, verificationFile };
}

function persistEpisode(bundle) {
  fs.mkdirSync(EPISODES_ROOT, { recursive: true });
  fs.mkdirSync(TASKS_ROOT, { recursive: true });
  fs.mkdirSync(VERIFICATIONS_ROOT, { recursive: true });
  writeJsonOnce(bundle.taskFile, bundle.taskSpec, 'NEUROMORPHIC_TASK');
  writeJsonOnce(bundle.verificationFile, bundle.verification, 'NEUROMORPHIC_VERIFICATION');
  const jsonPath = path.join(EPISODES_ROOT, `${bundle.episode.episode_id}.json`);
  const mdPath = path.join(EPISODES_ROOT, `${bundle.episode.episode_id}.md`);
  writeJsonOnce(jsonPath, bundle.episode, 'NEUROMORPHIC_EPISODE');
  writeTextOnce(mdPath, `${renderEpisodeMarkdown(bundle.episode)}\n`, 'NEUROMORPHIC_EPISODE');
  return { json_file: rel(jsonPath), markdown_file: rel(mdPath) };
}

function forbiddenKeys(value, forbidden, pathPrefix = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenKeys(item, forbidden, `${pathPrefix}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) findings.push(`${pathPrefix}.${key}`);
    if (key !== 'withheld_fields') forbiddenKeys(child, forbidden, `${pathPrefix}.${key}`, findings);
  }
  return findings;
}

function contaminationAudit({ skill, developmentRuns, validationRuns, baselineHoldouts, learnedHoldouts }) {
  const evaluationCaseIds = [...validationRuns, ...learnedHoldouts].map((record) => record.benchmark_case.benchmark_case_id);
  const requestRecords = [...developmentRuns, ...validationRuns, ...baselineHoldouts, ...learnedHoldouts];
  const forbidden = new Set(['oracle_tests', 'ground_truth', 'expected_after_exit_status']);
  const requestFindings = requestRecords.flatMap((record) => forbiddenKeys(record.provider_request, forbidden)
    .map((finding) => `${record.phase}:${finding}`));
  const sourceCases = new Set(skill.source_cases || []);
  const sourceSplits = new Set(skill.source_splits || []);
  const sourceCaseLeakage = evaluationCaseIds.filter((caseId) => sourceCases.has(caseId));
  const permissionFailures = requestRecords.filter((record) => {
    const model = record.provider_receipt.process && record.provider_receipt.process.permission_model;
    return !model || model.enabled !== true || model.filesystem_write_allowed !== false || model.child_process_allowed !== false;
  }).map((record) => record.phase);
  const attemptFailures = [...baselineHoldouts, ...learnedHoldouts]
    .filter((record) => record.run.metrics.candidate_count !== 1)
    .map((record) => `${record.phase}:${record.run.metrics.candidate_count}`);
  const skillContextFailures = learnedHoldouts.filter((record) => {
    const records = record.provider_request.context_receipt
      && record.provider_request.context_receipt.candidate_skills
      && record.provider_request.context_receipt.candidate_skills.records;
    return !Array.isArray(records)
      || records.length !== 1
      || !records[0].payload
      || records[0].payload.skill_id !== skill.skill_id
      || records[0].payload.experiment_id !== skill.experiment_id;
  }).map((record) => record.phase);
  const findings = [
    ...requestFindings.map((item) => `forbidden_request_field:${item}`),
    ...sourceCaseLeakage.map((item) => `evaluation_case_in_skill_source:${item}`),
    ...(Array.from(sourceSplits).some((split) => split !== 'development') ? ['non_development_skill_source_split'] : []),
    ...permissionFailures.map((item) => `provider_permission_model_failed:${item}`),
    ...attemptFailures.map((item) => `holdout_attempt_budget_failed:${item}`),
    ...skillContextFailures.map((item) => `experiment_skill_context_failed:${item}`),
  ];
  return {
    status: findings.length ? 'critical' : 'ok',
    contaminated: findings.length > 0,
    findings,
    checks: {
      source_cases_development_only: Array.from(sourceSplits).every((split) => split === 'development'),
      evaluation_cases_absent_from_source: sourceCaseLeakage.length === 0,
      forbidden_provider_request_fields_absent: requestFindings.length === 0,
      node_permission_model_enforced: permissionFailures.length === 0,
      equal_single_attempt_holdout_budget: attemptFailures.length === 0,
      experiment_skill_context_isolated: skillContextFailures.length === 0,
    },
  };
}

function sum(records, selector) {
  return records.reduce((total, item) => total + Number(selector(item) || 0), 0);
}

function successRate(records) {
  if (!records.length) return 0;
  return Number((records.filter(runSucceeded).length / records.length).toFixed(6));
}

function renderEvalMarkdown(evaluation) {
  return [
    '# Neuromorphic Learning Eval',
    '',
    `Eval: \`${evaluation.eval_id}\``,
    '',
    `Status: \`${evaluation.status}\``,
    '',
    `Holdout success: \`${evaluation.learning_measurement.before_success_rate} -> ${evaluation.learning_measurement.after_success_rate}\``,
    '',
    `Delta per verified source episode: \`${evaluation.learning_measurement.success_delta_per_verified_episode}\``,
    '',
    `Regressions: \`${evaluation.metrics.regression_count}\``,
    '',
  ].join('\n');
}

function renderReportMarkdown(report) {
  const measure = report.learning_measurement;
  return [
    '# Neuromorphic Learning Experiment',
    '',
    `Experiment: \`${report.experiment_id}\``,
    '',
    `Status: \`${report.status}\``,
    '',
    '## Result',
    '',
    `- Holdout success rate: \`${measure.before_success_rate} -> ${measure.after_success_rate}\``,
    `- Absolute delta: \`${measure.absolute_delta}\``,
    `- Verified development episodes: \`${measure.verified_source_episode_count}\``,
    `- Delta per episode: \`${measure.success_delta_per_verified_episode}\``,
    `- Information gain per episode: \`${measure.information_gain_bits_per_episode} bits\``,
    `- Holdout attempts per case: \`1 before / 1 after\``,
    `- Regressions: \`${measure.regression_count}\``,
    `- Human interventions: \`${measure.human_interventions}\``,
    '',
    '## Neuromorphic mechanisms',
    '',
    '- Fast append-only episodic encoding.',
    '- Plastic updates only on hypothesis-reducing evidence.',
    '- Sparse constraint engram.',
    '- Competition by elimination of inconsistent hypotheses.',
    '- Replay ordered by prediction entropy.',
    '- Homeostatic promotion gate requiring validation and sealed holdout improvement.',
    '',
    '## Causal and contamination checks',
    '',
    ...Object.entries(report.contamination_audit.checks).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## Claim boundary',
    '',
    `- Narrow cross-instance learning claim: \`${report.claim_state.narrow_learning_transfer_supported ? 'supported' : 'not_supported'}\``,
    `- AGI achieved: \`${report.claim_state.agi_achieved}\``,
    `- AGI claim supported: \`${report.claim_state.agi_claim_supported}\``,
    '- This experiment closes one bounded learning-and-transfer edge; it does not establish open-domain AGI.',
    '',
  ].join('\n');
}

function assertExperimentClosure({ baselineValidation, baselineHoldouts, developmentRuns, learnedValidation, learnedHoldouts, induction, audit }) {
  const failures = [];
  if (baselineValidation.some(runSucceeded)) failures.push('baseline_validation_unexpected_success');
  if (baselineHoldouts.some(runSucceeded)) failures.push('baseline_holdout_unexpected_success');
  if (developmentRuns.some((record) => !runSucceeded(record))) failures.push('development_episode_unverified');
  if (!induction.uniquely_identified) failures.push('induced_hypothesis_not_unique');
  if (induction.skill.induction.selected_constraints.length !== CONSTRAINTS.length
    || CONSTRAINTS.some((constraint) => !induction.skill.induction.selected_constraints.includes(constraint))) {
    failures.push('complete_constraint_grammar_not_induced');
  }
  if (learnedValidation.some((record) => !runSucceeded(record))) failures.push('validation_transfer_failed');
  if (learnedHoldouts.some((record) => !runSucceeded(record))) failures.push('holdout_transfer_failed');
  if (audit.contaminated) failures.push('contamination_detected');
  const allRuns = [...baselineValidation, ...baselineHoldouts, ...developmentRuns, ...learnedValidation, ...learnedHoldouts];
  if (sum(allRuns, (record) => record.run.metrics.regression_count) !== 0) failures.push('regression_detected');
  if (sum(allRuns, (record) => record.run.metrics.human_interventions) !== 0) failures.push('human_intervention_detected');
  if (failures.length) throw new Error(`NEUROMORPHIC_EXPERIMENT_CLOSURE_FAILED: ${failures.join(',')}`);
}

function runNeuromorphicLearningExperiment(options = {}) {
  const experimentId = assertSafeId(options.experiment_id || `neuromorphic_${nowIso().replace(/[-:.TZ]/g, '').slice(0, 14)}`, 'experiment_id');
  const experimentDir = path.join(EXPERIMENTS_ROOT, experimentId);
  if (fs.existsSync(experimentDir)) throw new Error(`NEUROMORPHIC_EXPERIMENT_APPEND_ONLY_CONFLICT: ${experimentId}`);

  return withFileLock(`neuromorphic_learning__${experimentId}`, {
    context: `neuromorphic_learning:${experimentId}`,
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(EXPERIMENTS_ROOT, { recursive: true });
    fs.mkdirSync(experimentDir, { recursive: false });
    const createdAt = nowIso();
    try {
      const baselineValidation = CASES.validation.map((fileName, index) => runCase({
        experimentId,
        phase: `baseline_validation_${index + 1}`,
        caseFile: fileName,
        configurationId: 'baseline_a_single_attempt',
      }));
      const baselineHoldouts = CASES.holdout.map((fileName, index) => runCase({
        experimentId,
        phase: `baseline_holdout_${index + 1}`,
        caseFile: fileName,
        configurationId: 'baseline_a_single_attempt',
      }));
      const developmentRuns = CASES.development.map((fileName, index) => runCase({
        experimentId,
        phase: `development_exploration_${index + 1}`,
        caseFile: fileName,
        configurationId: 'mdos_learning_exploration',
      }));

      const episodeBundles = developmentRuns.map((record) => episodeFromDevelopmentRun({ experimentId, record, createdAt }));
      const induction = induceDelimitedBoundarySkill({
        episodes: episodeBundles.map((bundle) => bundle.episode),
        createdAt,
        skillId: `skill_delimited_boundary_validation_${sha256Json({ experiment_id: experimentId }).slice(0, 16)}`,
      });
      induction.skill.experiment_id = experimentId;
      for (const bundle of episodeBundles) bundle.episode.candidate_skills = [induction.skill.skill_id];
      const episodeFiles = episodeBundles.map(persistEpisode);

      fs.mkdirSync(SKILL_CANDIDATES_ROOT, { recursive: true });
      const candidateSkillJson = path.join(SKILL_CANDIDATES_ROOT, `${induction.skill.skill_id}.json`);
      const candidateSkillMd = path.join(SKILL_CANDIDATES_ROOT, `${induction.skill.skill_id}.md`);
      writeJsonOnce(candidateSkillJson, induction.skill, 'NEUROMORPHIC_SKILL');
      writeTextOnce(candidateSkillMd, `${renderSkillMarkdown(induction.skill)}\n`, 'NEUROMORPHIC_SKILL');

      const learnedValidation = CASES.validation.map((fileName, index) => runCase({
        experimentId,
        phase: `learned_validation_${index + 1}`,
        caseFile: fileName,
        configurationId: 'mdos_neuromorphic_skill',
      }));
      const learnedHoldouts = CASES.holdout.map((fileName, index) => runCase({
        experimentId,
        phase: `learned_holdout_${index + 1}`,
        caseFile: fileName,
        configurationId: 'mdos_neuromorphic_skill',
      }));

      const audit = contaminationAudit({
        skill: induction.skill,
        developmentRuns,
        validationRuns: learnedValidation,
        baselineHoldouts,
        learnedHoldouts,
      });
      assertExperimentClosure({
        baselineValidation,
        baselineHoldouts,
        developmentRuns,
        learnedValidation,
        learnedHoldouts,
        induction,
        audit,
      });

      const allRuns = [...baselineValidation, ...baselineHoldouts, ...developmentRuns, ...learnedValidation, ...learnedHoldouts];
      const beforeRate = successRate(baselineHoldouts);
      const afterRate = successRate(learnedHoldouts);
      const delta = Number((afterRate - beforeRate).toFixed(6));
      const episodeCount = episodeBundles.length;
      const evalId = `eval_neuromorphic_${sha256Json({ experiment_id: experimentId, skill_id: induction.skill.skill_id }).slice(0, 18)}`;
      const measurement = {
        metric: 'verified_holdout_case_success_rate',
        before_success_rate: beforeRate,
        after_success_rate: afterRate,
        absolute_delta: delta,
        verified_source_episode_count: episodeCount,
        success_delta_per_verified_episode: Number((delta / episodeCount).toFixed(6)),
        information_gain_bits: induction.skill.induction.total_information_gain_bits,
        information_gain_bits_per_episode: induction.skill.induction.learning_efficiency.information_gain_bits_per_episode,
        hypotheses_eliminated_per_episode: induction.skill.induction.learning_efficiency.eliminated_hypotheses_per_episode,
        exploration_candidate_count: sum(developmentRuns, (record) => record.run.metrics.candidate_count),
        learned_holdout_successes_per_exploration_candidate: Number((learnedHoldouts.filter(runSucceeded).length
          / sum(developmentRuns, (record) => record.run.metrics.candidate_count)).toFixed(6)),
        baseline_holdout_attempts: sum(baselineHoldouts, (record) => record.run.metrics.candidate_count),
        learned_holdout_attempts: sum(learnedHoldouts, (record) => record.run.metrics.candidate_count),
        regression_count: sum(allRuns, (record) => record.run.metrics.regression_count),
        human_interventions: sum(allRuns, (record) => record.run.metrics.human_interventions),
        total_measured_cost: sum(allRuns, (record) => record.run.metrics.total_cost),
        total_latency_ms: sum(allRuns, (record) => record.run.metrics.total_latency_ms),
      };
      const evaluation = {
        schema_version: 1,
        eval_id: evalId,
        skill_id: induction.skill.skill_id,
        experiment_id: experimentId,
        updated_at: nowIso(),
        status: 'ok',
        improves: delta > 0,
        improvement_measured: true,
        task_outcome_verified: learnedValidation.every(runSucceeded) && learnedHoldouts.every(runSucceeded),
        no_regression: measurement.regression_count === 0,
        metrics: {
          episode_count: episodeCount,
          success_rate: afterRate,
          unverified_count: 0,
          failure_recovery_rate: delta > 0 ? 1 : 0,
          promoted_skill_count: 0,
          candidate_skill_count: 1,
          regression_count: measurement.regression_count,
        },
        learning_measurement: measurement,
        validation_runs: learnedValidation.map((record) => record.executed.benchmark_run_file),
        holdout_runs: learnedHoldouts.map((record) => record.executed.benchmark_run_file),
        baseline_holdout_runs: baselineHoldouts.map((record) => record.executed.benchmark_run_file),
        contamination_audit: audit,
      };
      fs.mkdirSync(EVALS_ROOT, { recursive: true });
      const evalJson = path.join(EVALS_ROOT, `${evalId}.json`);
      const evalMd = path.join(EVALS_ROOT, `${evalId}.md`);
      writeJsonOnce(evalJson, evaluation, 'NEUROMORPHIC_EVAL');
      writeTextOnce(evalMd, `${renderEvalMarkdown(evaluation)}\n`, 'NEUROMORPHIC_EVAL');

      induction.skill.evals = [evalId];
      induction.skill.validation_eval = {
        status: 'ok',
        baseline_success_rate: successRate(baselineValidation),
        learned_success_rate: successRate(learnedValidation),
        run_files: learnedValidation.map((record) => record.executed.benchmark_run_file),
      };
      induction.skill.holdout_eval = {
        status: 'ok',
        metric: measurement.metric,
        baseline_success_rate: beforeRate,
        learned_success_rate: afterRate,
        absolute_delta: delta,
        baseline_run_files: baselineHoldouts.map((record) => record.executed.benchmark_run_file),
        learned_run_files: learnedHoldouts.map((record) => record.executed.benchmark_run_file),
        holdout_case_ids: learnedHoldouts.map((record) => record.benchmark_case.benchmark_case_id),
        candidate_attempts_per_case_before: 1,
        candidate_attempts_per_case_after: 1,
        contamination_detected: audit.contaminated,
      };
      const promotionGate = buildPromotionGate({
        skill: induction.skill,
        evalResult: evaluation,
        riskLevel: 'low',
        options: { allow_high_risk: false },
      });
      induction.skill.promotion_gate_status = promotionGate.status;
      induction.skill.promotion_gate = promotionGate;
      induction.skill.status = promotionGate.status === 'ok' ? 'promotable' : 'candidate';
      atomicWriteJson(candidateSkillJson, induction.skill);
      atomicWriteText(candidateSkillMd, `${renderSkillMarkdown(induction.skill)}\n`);
      const gateFile = path.join(experimentDir, 'promotion_gate.json');
      atomicWriteJson(gateFile, promotionGate);
      if (promotionGate.status !== 'ok') throw new Error(`NEUROMORPHIC_PROMOTION_GATE_BLOCKED: ${promotionGate.status}`);

      const promotion = runPromote({ legacy_experiment: true });
      const promotedSkillJson = path.join(SKILL_PROMOTED_ROOT, `${induction.skill.skill_id}.json`);
      if (!fs.existsSync(promotedSkillJson)) throw new Error('NEUROMORPHIC_PROMOTED_SKILL_MISSING');
      const promotedSkill = readJson(promotedSkillJson, 'NEUROMORPHIC_PROMOTED_SKILL');
      if (promotedSkill.status !== 'promoted') throw new Error('NEUROMORPHIC_PROMOTED_SKILL_STATUS_INVALID');

      const report = {
        schema_version: 1,
        experiment_id: experimentId,
        created_at: createdAt,
        completed_at: nowIso(),
        status: 'ok',
        objective: 'Maximize verified cross-instance learning gain per episode while holding holdout attempts, regressions, cost, and human intervention constant.',
        architecture: {
          name: 'neuromorphic_complementary_learning_system_v1',
          fast_memory: 'append_only_verified_episodes',
          slow_memory: 'sparse_parameterized_constraint_skill',
          plasticity: 'error_and_surprise_triggered',
          competition: 'hypothesis_elimination',
          replay: 'prediction_entropy_ordered',
          homeostasis: 'validation_and_holdout_promotion_gate',
        },
        learning_measurement: measurement,
        induction: induction.skill.induction,
        neuromorphic_learning: induction.skill.neuromorphic_learning,
        contamination_audit: audit,
        evidence: {
          development_episode_files: episodeFiles.map((item) => item.json_file),
          baseline_validation_runs: baselineValidation.map((record) => record.executed.benchmark_run_file),
          baseline_holdout_runs: baselineHoldouts.map((record) => record.executed.benchmark_run_file),
          development_runs: developmentRuns.map((record) => record.executed.benchmark_run_file),
          learned_validation_runs: learnedValidation.map((record) => record.executed.benchmark_run_file),
          learned_holdout_runs: learnedHoldouts.map((record) => record.executed.benchmark_run_file),
          candidate_skill_file: rel(candidateSkillJson),
          promoted_skill_file: rel(promotedSkillJson),
          eval_file: rel(evalJson),
          promotion_gate_file: rel(gateFile),
        },
        master_closure: {
          status: 'ok',
          edges: [
            { edge: 'same_provider_no_skill_baseline', status: beforeRate === 0 ? 'ok' : 'critical' },
            { edge: 'two_independently_verified_development_episodes', status: episodeCount >= 2 ? 'ok' : 'critical' },
            { edge: 'unique_sparse_rule_induced', status: induction.uniquely_identified ? 'ok' : 'critical' },
            { edge: 'distinct_validation_transfer', status: learnedValidation.every(runSucceeded) ? 'ok' : 'critical' },
            { edge: 'sealed_holdout_improvement', status: delta > 0 && learnedHoldouts.every(runSucceeded) ? 'ok' : 'critical' },
            { edge: 'contamination_and_attempt_budget_control', status: audit.status },
            { edge: 'promotion_gate_and_runtime_readback', status: promotionGate.status },
          ],
        },
        claim_state: {
          narrow_learning_transfer_supported: true,
          agi_achieved: false,
          agi_claim_supported: false,
          reason: 'Evidence is restricted to one bounded software-repair hypothesis family and four structural constraints. Open-domain invention, cross-domain transfer, continual autonomous improvement, and long-horizon competence remain unmeasured.',
        },
        promotion,
      };
      const reportJson = path.join(experimentDir, 'report.json');
      const reportMd = path.join(experimentDir, 'report.md');
      atomicWriteJson(reportJson, report);
      atomicWriteText(reportMd, `${renderReportMarkdown(report)}\n`);
      atomicWriteJson(STATUS_JSON, report);
      atomicWriteText(STATUS_MD, `${renderReportMarkdown(report)}\n`);
      appendJournal({
        event: 'neuromorphic_learning_experiment_completed',
        experiment_id: experimentId,
        skill_id: induction.skill.skill_id,
        holdout_success_before: beforeRate,
        holdout_success_after: afterRate,
        success_delta_per_episode: measurement.success_delta_per_verified_episode,
        contamination_detected: audit.contaminated,
        promoted_skill_file: rel(promotedSkillJson),
        output_file: rel(reportJson),
      });
      return {
        ok: true,
        mode: 'neuromorphic_learning_experiment',
        experiment_id: experimentId,
        status: report.status,
        skill_id: induction.skill.skill_id,
        holdout_success_before: beforeRate,
        holdout_success_after: afterRate,
        absolute_delta: delta,
        success_delta_per_verified_episode: measurement.success_delta_per_verified_episode,
        information_gain_bits_per_episode: measurement.information_gain_bits_per_episode,
        contamination_detected: audit.contaminated,
        promoted_skill_file: rel(promotedSkillJson),
        report_file: rel(reportJson),
        report_markdown: rel(reportMd),
      };
    } catch (error) {
      atomicWriteJson(path.join(experimentDir, 'failure.json'), {
        schema_version: 1,
        experiment_id: experimentId,
        created_at: createdAt,
        failed_at: nowIso(),
        status: 'critical',
        error: shortText(error && error.message || error),
      });
      throw error;
    }
  });
}

module.exports = {
  CASES,
  contaminationAudit,
  episodeFromDevelopmentRun,
  runNeuromorphicLearningExperiment,
  runSucceeded,
};
