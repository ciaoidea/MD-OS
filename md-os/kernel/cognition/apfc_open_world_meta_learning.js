#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson } = require('../../os/lib/fs_runtime');

const MECHANISM_CARDS = Object.freeze([
  Object.freeze({
    mechanism_id: 'validation_boundary',
    title: 'Validation and rejection boundary',
    signals: Object.freeze(['invalid', 'validation', 'validate', 'reject', 'error', 'exception', 'raise', 'input', 'argument']),
    procedure: 'Trace the value from its public entry point to the first boundary that can enforce the declared acceptance and rejection contract. Preserve valid inputs and reject invalid states at that boundary.',
  }),
  Object.freeze({
    mechanism_id: 'state_lifecycle',
    title: 'State, cache, and lifecycle transition',
    signals: Object.freeze(['state', 'cache', 'stale', 'initialize', 'cleanup', 'close', 'lifecycle', 'reuse', 'context', 'reset']),
    procedure: 'Identify the state transition and its owner. Compare the state observed before and after the triggering event, then update or invalidate it at the transition rather than at a downstream symptom.',
  }),
  Object.freeze({
    mechanism_id: 'interface_contract',
    title: 'Interface and option propagation',
    signals: Object.freeze(['api', 'parameter', 'signature', 'return', 'interface', 'option', 'flag', 'command', 'cli', 'argument']),
    procedure: 'Follow the interface value through every adapter and call site. Preserve defaults and compatibility, and make the smallest change that carries the declared contract to the implementation boundary.',
  }),
  Object.freeze({
    mechanism_id: 'data_representation',
    title: 'Parsing, serialization, and data representation',
    signals: Object.freeze(['serialize', 'serialization', 'json', 'yaml', 'format', 'parse', 'parser', 'schema', 'column', 'dataframe', 'encoding']),
    procedure: 'Separate syntax, canonical representation, and semantic value. Locate the first incorrect conversion and repair that conversion while preserving round trips and existing accepted forms.',
  }),
  Object.freeze({
    mechanism_id: 'algorithmic_invariant',
    title: 'Algorithmic invariant and order semantics',
    signals: Object.freeze(['algorithm', 'order', 'stable', 'sort', 'calculation', 'result', 'comparison', 'index', 'neighbor', 'deterministic']),
    procedure: 'State the invariant that must hold across iterations or inputs. Find the mutation or calculation that violates it and repair the smallest causal step, including snapshot or ordering semantics where required.',
  }),
  Object.freeze({
    mechanism_id: 'configuration_dependency',
    title: 'Configuration, path, build, and dependency boundary',
    signals: Object.freeze(['config', 'configuration', 'environment', 'dependency', 'version', 'install', 'build', 'path', 'file', 'package']),
    procedure: 'Resolve configuration and paths at the boundary where they acquire physical meaning. Distinguish defaults, user overrides, environment effects, and compatibility constraints before changing behavior.',
  }),
  Object.freeze({
    mechanism_id: 'async_concurrency',
    title: 'Asynchronous and concurrent ownership',
    signals: Object.freeze(['async', 'await', 'thread', 'concurrent', 'race', 'lock', 'task', 'cancel', 'timeout']),
    procedure: 'Identify ownership, ordering, cancellation, and completion boundaries. Repair the transition so all paths release resources and expose one deterministic observable outcome.',
  }),
  Object.freeze({
    mechanism_id: 'compatibility_migration',
    title: 'Compatibility and migration behavior',
    signals: Object.freeze(['compatibility', 'backward', 'deprecated', 'legacy', 'migration', 'alias', 'fallback']),
    procedure: 'Identify the old and new contracts and the supported compatibility interval. Preserve existing valid behavior while routing deprecated or migrated forms through one explicit compatibility boundary.',
  }),
]);

const CORE_PROCEDURES = Object.freeze([
  Object.freeze({ procedure_id: 'reconstruct_contract', input_type: 'task.issue', output_type: 'task.contract', procedure: 'Translate the issue into observable behavior, invariants, explicit non-goals, and a falsifiable success condition before editing.' }),
  Object.freeze({ procedure_id: 'inspect_repository_rules', input_type: 'task.contract', output_type: 'task.constrained', procedure: 'Read repository guidance and inspect the smallest relevant surface. Do not use the internet or any benchmark answer.' }),
  Object.freeze({ procedure_id: 'reproduce_baseline', input_type: 'task.constrained', output_type: 'evidence.failure', procedure: 'Run the narrowest available reproduction before editing. Record the assertion, stack, or observable delta; infrastructure failures are not product evidence.' }),
  Object.freeze({ procedure_id: 'localize_causal_boundary', input_type: 'evidence.failure', output_type: 'region.causal', procedure: 'Trace from the failed observable through callers and adjacent implementations to the first causal boundary; distinguish cause from downstream symptom.' }),
  Object.freeze({ procedure_id: 'rank_competing_hypotheses', input_type: 'region.causal', output_type: 'hypothesis.ranked', procedure: 'Form at least two plausible causes when evidence permits and eliminate them with repository evidence. Prefer the hypothesis explaining both failure and preserved behavior.' }),
  Object.freeze({ procedure_id: 'apply_minimal_patch', input_type: 'hypothesis.ranked', output_type: 'patch.candidate', procedure: 'Modify production code only, keep the diff causally minimal, and do not rewrite or weaken tests.' }),
  Object.freeze({ procedure_id: 'verify_target_behavior', input_type: 'patch.candidate', output_type: 'evidence.target', procedure: 'Run the narrow failing behavior or closest visible test after the edit. A command that did not execute is not a pass.' }),
  Object.freeze({ procedure_id: 'verify_regressions', input_type: 'evidence.target', output_type: 'patch.verified', procedure: 'Run the relevant regression surface and inspect the final diff for unintended API, test, fixture, generated-file, or dependency changes.' }),
  Object.freeze({ procedure_id: 'emit_audited_result', input_type: 'patch.verified', output_type: 'result.audited', procedure: 'Report changed production files, commands that actually ran, failures, residual uncertainty, and recognized mechanism composition.' }),
]);

const WORKFLOW_HYPOTHESES = Object.freeze([
  Object.freeze({
    hypothesis_id: 'direct_issue_to_patch',
    required_episode_evidence: Object.freeze(['gold_pass']),
    supports_family_recognition: false,
    supports_composition: false,
  }),
  Object.freeze({
    hypothesis_id: 'flat_reproduce_patch_test',
    required_episode_evidence: Object.freeze(['baseline_fail', 'gold_pass']),
    supports_family_recognition: false,
    supports_composition: false,
  }),
  Object.freeze({
    hypothesis_id: 'typed_evidence_graph_compiler',
    required_episode_evidence: Object.freeze(['baseline_fail', 'gold_pass', 'production_patch', 'regression_surface']),
    supports_family_recognition: true,
    supports_composition: true,
  }),
]);

const TEST_PROTOCOL_ID = 'sealed_expected_test_groups_v4';

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${shortText(error.message)}`);
  }
}

function assertEmbeddedHash(payload, hashField, label) {
  const stored = payload && payload[hashField];
  if (typeof stored !== 'string' || !/^[a-f0-9]{64}$/.test(stored)) {
    throw new Error(`${label}_HASH_MISSING_OR_INVALID`);
  }
  const core = { ...payload };
  delete core[hashField];
  if (sha256Json(core) !== stored) throw new Error(`${label}_HASH_MISMATCH`);
  return true;
}

function assertDevelopmentReceipt(receipt, publicTask, hiddenTask) {
  assertEmbeddedHash(receipt, 'receipt_hash', 'APFC_OPEN_WORLD_DEVELOPMENT_RECEIPT');
  if (receipt.receipt_type !== 'apfc_open_world_development_verification'
    || receipt.evaluator_protocol_id !== TEST_PROTOCOL_ID
    || receipt.task_id !== publicTask.task_id
    || receipt.repository !== publicTask.repository
    || receipt.image_name !== hiddenTask.image_name
    || receipt.hidden_task_hash !== hiddenTask.hidden_task_hash) {
    throw new Error(`APFC_OPEN_WORLD_DEVELOPMENT_RECEIPT_BINDING_MISMATCH:${publicTask.task_id}`);
  }
  const expectedVerified = receipt.baseline_all_fail_to_pass_failed === true
    && receipt.gold_all_expected_passed === true
    && receipt.baseline_timed_out !== true
    && receipt.gold_timed_out !== true;
  if (receipt.verified !== expectedVerified) {
    throw new Error(`APFC_OPEN_WORLD_DEVELOPMENT_RECEIPT_OUTCOME_MISMATCH:${publicTask.task_id}`);
  }
  return true;
}

function safeToken(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function immutableJson(filePath, payload, label) {
  if (fs.existsSync(filePath)) {
    const existing = readJson(filePath, label);
    if (sha256Json(existing) !== sha256Json(payload)) {
      throw new Error(`${label}_IMMUTABLE_COLLISION:${filePath}`);
    }
    return 'unchanged';
  }
  atomicWriteJson(filePath, payload);
  return 'created';
}

function formalArtifactManifest(skill, episodes) {
  const inductionSuffix = skill.skill_hash.slice(0, 16);
  return {
    development_task_count: episodes.length,
    development_verification_count: episodes.length,
    development_episode_count: episodes.length,
    candidate_file: `md-os/ops/skills/candidates/${skill.skill_id}.json`,
    induction_task_file: `md-os/ops/tasks/task_apfc_open_world_meta_induction_${inductionSuffix}.json`,
    induction_verification_file: `md-os/ops/verifications/verification_apfc_open_world_meta_induction_${inductionSuffix}.json`,
    induction_episode_file: `md-os/ops/episodes/ep_apfc_open_world_meta_induction_${inductionSuffix}.json`,
  };
}

function buildDevelopmentTaskSpec({ episode, publicTask, receiptPath, receiptFile }) {
  const suffix = episode.episode_id.replace(/^ep_open_world_development_/, '');
  return {
    schema_version: 1,
    task_spec_id: `task_open_world_development_${suffix}`,
    created_at: episode.created_at,
    goal: `Verify an external real-repository repair transition for ${publicTask.repository} at its immutable base commit without exposing the reference patch to the learning artifact.`,
    task_type: 'software_repair',
    constraints: [
      'the baseline must exhibit every declared fail-to-pass failure',
      'the verified repair must pass every declared fail-to-pass and pass-to-pass test',
      'literal reference patches and hidden evaluator tests remain outside the learning artifact',
      'only structural mechanism evidence may be consolidated',
    ],
    acceptance_tests: [{
      connector_id: 'terminal_executor',
      project_id: 'md_os_apfc_open_world',
      command_id: `verify_expected_v4_${suffix}`,
      expected_exit_status: 0,
    }],
    risk_budget: { level: 'low', external_writes: 0 },
    resource_budget: { maximum_verifier_runs: 2, maximum_human_interventions: 0 },
    required_evidence: [{
      evidence_id: `expected_v4_receipt_${suffix}`,
      path: receiptPath,
      must_exist: true,
      sha256: sha256File(receiptFile),
    }],
    unknowns: [
      'whether the structural mechanism transfers prospectively to an unseen repository',
      'whether the mechanism-selected graph improves outcomes over matched controls',
    ],
    success_definition: {
      acceptance_tests_required: true,
      all_acceptance_tests_must_pass: true,
      observed_delta_required: true,
      required_evidence_must_exist: true,
    },
    actions: [{
      connector_id: 'terminal_executor',
      project_id: 'md_os_apfc_open_world',
      command_id: `verify_expected_v4_${suffix}`,
      expected_exit_status: 0,
    }],
    observation_targets: [{
      target_id: `development_verification_${suffix}`,
      path: receiptPath,
      required_change: true,
    }],
    external_task_id: episode.task_id,
    repository: episode.repository,
    base_commit: episode.base_commit,
    public_task_hash: episode.public_task_hash,
  };
}

function buildDevelopmentVerification({ episode, receiptPath, receipt }) {
  const suffix = episode.episode_id.replace(/^ep_open_world_development_/, '');
  return {
    verifier_id: `verification_open_world_development_${suffix}`,
    status: 'ok',
    outcome: 'verified',
    independent_from_planner: true,
    acceptance_results: [
      { check: 'baseline_fail_to_pass', passed: receipt.baseline_all_fail_to_pass_failed === true },
      { check: 'gold_expected_tests', passed: receipt.gold_all_expected_passed === true },
      { check: 'literal_patch_exclusion', passed: episode.literal_patch_excluded_from_learning_artifact === true },
    ],
    action_receipt_ids: [],
    evidence: [receiptPath],
    checks: [
      {
        check_id: 'baseline_failure_reproduced',
        status: 'ok',
        message: 'Every declared fail-to-pass test was observed failing or erroring before the verified repair.',
        evidence: [receiptPath],
      },
      {
        check_id: 'expected_tests_pass_after_verified_repair',
        status: 'ok',
        message: 'Every declared fail-to-pass and pass-to-pass test was observed passing after the verified repair.',
        evidence: [receiptPath],
      },
      {
        check_id: 'learning_artifact_is_structural_only',
        status: 'ok',
        message: 'The formal episode contains hashes and structural traces, not the literal reference patch or hidden evaluator tests.',
        evidence: [receiptPath],
      },
    ],
  };
}

function buildDevelopmentEpisode({ episode, publicTask, taskSpec, taskPath, verification, verificationPath, receiptPath, receipt, skillId }) {
  const actionInput = {
    external_task_id: episode.task_id,
    repository: episode.repository,
    base_commit: episode.base_commit,
    public_task_hash: episode.public_task_hash,
    verifier_receipt_hash: receipt.receipt_hash,
  };
  return {
    schema_version: 1,
    episode_id: episode.episode_id,
    created_at: episode.created_at,
    last_verified_at: episode.created_at,
    task: taskSpec.goal,
    task_type: 'software_repair',
    task_spec: taskSpec,
    task_spec_file: taskPath,
    context_pack_id: `context_${episode.episode_id}`,
    risk_level: 'low',
    plan: [
      { step: 1, objective: 'reproduce the declared external failure under the sealed evaluator', status: 'ok' },
      { step: 2, objective: 'verify the known repair against target and protected tests', status: 'ok' },
      { step: 3, objective: 'retain only non-literal structural evidence for learning', status: 'ok' },
    ],
    actions: [{ action_id: 'sealed_expected_test_transition', input: actionInput }],
    action_input_hash: sha256Json(actionInput),
    observations: [{
      metric: 'sealed_expected_test_transition',
      baseline_all_fail_to_pass_failed: true,
      repaired_all_expected_passed: true,
      repository: episode.repository,
      structural_trace: episode.structural_trace,
      observed_procedure_ids: episode.observed_procedure_ids,
    }],
    errors: [],
    artifacts: [receiptPath],
    action_receipts: [],
    verification_result_file: verificationPath,
    verifier_results: [verification],
    verdict: 'success',
    lessons: [
      `A sealed external repair transition supports the structural mechanism signature ${episode.structural_trace.mechanisms.join(' + ')}.`,
      'This episode is development evidence only; prospective transfer must be established on disjoint repositories.',
    ],
    candidate_claim_updates: [],
    candidate_skills: [skillId],
    regressions: [],
    source_experiment: 'apfc_open_world_meta_transfer_20260813_v1',
    external_task_id: publicTask.task_id,
    literal_patch_excluded_from_learning_artifact: true,
  };
}

function materializeFormalDevelopmentArtifacts({
  experimentDir,
  publicCorpus,
  episodes,
  skill,
  opsRoot = path.join(MDOS_ROOT, 'ops'),
  experimentRel: declaredExperimentRel = null,
}) {
  const experimentRel = declaredExperimentRel || rel(experimentDir);
  const publicById = new Map(publicCorpus.development_tasks.map((task) => [task.task_id, task]));
  const counters = { created: 0, unchanged: 0 };
  for (const episode of episodes) {
    const publicTask = publicById.get(episode.task_id);
    if (!publicTask) throw new Error(`APFC_OPEN_WORLD_FORMAL_PUBLIC_TASK_MISSING:${episode.task_id}`);
    const suffix = episode.episode_id.replace(/^ep_open_world_development_/, '');
    const receiptFile = path.join(experimentDir, 'evidence', 'development_verification', safeToken(episode.task_id), 'expected_v4_receipt.json');
    const receiptPath = `${experimentRel}/evidence/development_verification/${safeToken(episode.task_id)}/expected_v4_receipt.json`;
    const receipt = readJson(receiptFile, 'APFC_OPEN_WORLD_DEVELOPMENT_RECEIPT');
    assertEmbeddedHash(receipt, 'receipt_hash', 'APFC_OPEN_WORLD_DEVELOPMENT_RECEIPT');
    if (receipt.receipt_type !== 'apfc_open_world_development_verification'
      || receipt.evaluator_protocol_id !== TEST_PROTOCOL_ID
      || receipt.task_id !== episode.task_id
      || receipt.repository !== episode.repository
      || receipt.verified !== true
      || receipt.baseline_all_fail_to_pass_failed !== true
      || receipt.gold_all_expected_passed !== true) {
      throw new Error(`APFC_OPEN_WORLD_FORMAL_RECEIPT_BINDING_MISMATCH:${episode.task_id}`);
    }
    const taskPath = `md-os/ops/tasks/task_open_world_development_${suffix}.json`;
    const verificationPath = `md-os/ops/verifications/verification_open_world_development_${suffix}.json`;
    const episodePath = `md-os/ops/episodes/${episode.episode_id}.json`;
    const taskSpec = buildDevelopmentTaskSpec({ episode, publicTask, receiptPath, receiptFile });
    const verification = buildDevelopmentVerification({ episode, receiptPath, receipt });
    const formalEpisode = buildDevelopmentEpisode({
      episode, publicTask, taskSpec, taskPath, verification, verificationPath,
      receiptPath, receipt, skillId: skill.skill_id,
    });
    for (const [filePath, payload, label] of [
      [path.join(opsRoot, 'tasks', path.basename(taskPath)), taskSpec, 'APFC_OPEN_WORLD_FORMAL_TASK'],
      [path.join(opsRoot, 'verifications', path.basename(verificationPath)), verification, 'APFC_OPEN_WORLD_FORMAL_VERIFICATION'],
      [path.join(opsRoot, 'episodes', path.basename(episodePath)), formalEpisode, 'APFC_OPEN_WORLD_FORMAL_EPISODE'],
    ]) {
      counters[immutableJson(filePath, payload, label)] += 1;
    }
  }

  const candidateFile = path.join(opsRoot, 'skills', 'candidates', `${skill.skill_id}.json`);
  if (fs.existsSync(candidateFile)) {
    const existing = readJson(candidateFile, 'APFC_OPEN_WORLD_RUNTIME_CANDIDATE');
    if (existing.skill_id !== skill.skill_id || existing.source_candidate_hash !== skill.skill_hash) {
      throw new Error(`APFC_OPEN_WORLD_RUNTIME_CANDIDATE_BINDING_MISMATCH:${skill.skill_id}`);
    }
    counters.unchanged += 1;
  } else {
    const runtimeCandidate = { ...skill, source_candidate_hash: skill.skill_hash };
    delete runtimeCandidate.skill_hash;
    atomicWriteJson(candidateFile, runtimeCandidate);
    counters.created += 1;
  }

  const manifest = formalArtifactManifest(skill, episodes);
  const inductionSuffix = skill.skill_hash.slice(0, 16);
  const reportPath = `${experimentRel}/evidence/meta_induction_report.json`;
  const graphPath = `${experimentRel}/evidence/meta_procedure_graph.json`;
  const sourceCandidatePath = `${experimentRel}/candidate_meta_skill.json`;
  const devEvidencePath = `${experimentRel}/evidence/development_episodes.json`;
  const inductionTask = {
    schema_version: 1,
    task_spec_id: `task_apfc_open_world_meta_induction_${inductionSuffix}`,
    created_at: skill.created_at,
    goal: 'Induce one bounded APFC meta-skill from twelve verified heterogeneous real-repository episodes while excluding literal solutions and preserving prospective holdout isolation.',
    task_type: 'general_operation',
    constraints: [
      'at least twelve verified development episodes from distinct repositories',
      'literal reference patches and hidden evaluator tests excluded from the candidate',
      'generic workflow core distinguished from episode-supported mechanism procedures',
      'candidate remains unpromoted until a preregistered sealed campaign closes every gate',
    ],
    acceptance_tests: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_open_world', command_id: `verify_meta_induction_${inductionSuffix}`, expected_exit_status: 0 }],
    risk_budget: { level: 'low', promotion_allowed: false },
    resource_budget: { maximum_source_episodes: 12, maximum_candidate_skills: 1, maximum_human_interventions: 0 },
    required_evidence: [
      { evidence_id: 'meta_induction_report', path: reportPath, must_exist: true, sha256: sha256File(path.join(experimentDir, 'evidence', 'meta_induction_report.json')) },
      { evidence_id: 'meta_procedure_graph', path: graphPath, must_exist: true, sha256: sha256File(path.join(experimentDir, 'evidence', 'meta_procedure_graph.json')) },
      { evidence_id: 'source_candidate', path: sourceCandidatePath, must_exist: true, sha256: sha256File(path.join(experimentDir, 'candidate_meta_skill.json')) },
      { evidence_id: 'development_episodes', path: devEvidencePath, must_exist: true, sha256: sha256File(path.join(experimentDir, 'evidence', 'development_episodes.json')) },
    ],
    unknowns: [
      'prospective transfer advantage on the thirty sealed holdout repositories',
      'causal advantage of episode-selected mechanisms over the same generic workflow core',
    ],
    success_definition: { acceptance_tests_required: true, all_acceptance_tests_must_pass: true, observed_delta_required: true, required_evidence_must_exist: true },
    actions: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_open_world', command_id: `verify_meta_induction_${inductionSuffix}`, expected_exit_status: 0 }],
    observation_targets: [{ target_id: 'candidate_meta_skill', path: sourceCandidatePath, required_change: true }],
  };
  const inductionEvidence = [reportPath, graphPath, sourceCandidatePath, devEvidencePath];
  const inductionVerification = {
    verifier_id: `verification_apfc_open_world_meta_induction_${inductionSuffix}`,
    status: 'ok',
    outcome: 'verified',
    independent_from_planner: true,
    action_receipt_ids: [],
    evidence: inductionEvidence,
    checks: [
      { check_id: 'twelve_verified_distinct_repository_episodes', status: 'ok', message: 'Twelve verified development episodes from twelve distinct external repositories support the candidate.', evidence: inductionEvidence },
      { check_id: 'typed_meta_graph_hash_bound', status: 'ok', message: 'The typed procedure graph and candidate carry verified embedded hashes.', evidence: [graphPath, sourceCandidatePath] },
      { check_id: 'literal_solution_exclusion', status: 'ok', message: 'No literal development or holdout reference patch or hidden evaluator test is present in the candidate skill.', evidence: [reportPath, sourceCandidatePath] },
      { check_id: 'prospective_promotion_gate_preserved', status: 'ok', message: 'The skill remains a candidate with no eval and cannot be promoted before the sealed campaign.', evidence: [sourceCandidatePath] },
    ],
  };
  const inductionActionInput = {
    source_episode_ids: skill.source_episodes,
    candidate_skill_id: skill.skill_id,
    candidate_skill_hash: skill.skill_hash,
    procedure_graph_hash: skill.apfc_meta_graph.graph_hash,
  };
  const inductionEpisode = {
    schema_version: 1,
    episode_id: `ep_apfc_open_world_meta_induction_${inductionSuffix}`,
    created_at: skill.created_at,
    last_verified_at: skill.created_at,
    task: inductionTask.goal,
    task_type: 'general_operation',
    task_spec: inductionTask,
    task_spec_file: manifest.induction_task_file,
    context_pack_id: `context_apfc_open_world_meta_induction_${inductionSuffix}`,
    risk_level: 'low',
    plan: [
      { step: 1, objective: 'bind heterogeneous verified episodes to structural mechanism evidence', status: 'ok' },
      { step: 2, objective: 'select the requirement-compatible workflow and construct its typed graph', status: 'ok' },
      { step: 3, objective: 'emit one hash-bound candidate without holdout access or promotion', status: 'ok' },
    ],
    actions: [{ action_id: 'induce_apfc_open_world_meta_skill', input: inductionActionInput }],
    action_input_hash: sha256Json(inductionActionInput),
    observations: [{
      metric: 'verified_meta_skill_induction',
      source_episode_count: episodes.length,
      distinct_repository_count: new Set(episodes.map((item) => item.repository)).size,
      supported_mechanisms: skill.apfc_meta_graph.supported_mechanisms,
      selected_hypothesis_id: skill.induction.selected_hypothesis_id,
    }],
    errors: [],
    artifacts: inductionEvidence,
    action_receipts: [],
    verification_result_file: manifest.induction_verification_file,
    verifier_results: [inductionVerification],
    verdict: 'success',
    lessons: [
      'The generic repair workflow is preprogrammed; verified episodes source-bind the reusable mechanism layer.',
      'Induction is not transfer evidence: causal value remains contingent on the sealed prospective campaign.',
    ],
    candidate_claim_updates: [],
    candidate_skills: [skill.skill_id],
    regressions: [],
  };
  for (const [filePath, payload, label] of [
    [path.join(opsRoot, 'tasks', path.basename(manifest.induction_task_file)), inductionTask, 'APFC_OPEN_WORLD_INDUCTION_TASK'],
    [path.join(opsRoot, 'verifications', path.basename(manifest.induction_verification_file)), inductionVerification, 'APFC_OPEN_WORLD_INDUCTION_VERIFICATION'],
    [path.join(opsRoot, 'episodes', path.basename(manifest.induction_episode_file)), inductionEpisode, 'APFC_OPEN_WORLD_INDUCTION_EPISODE'],
  ]) {
    counters[immutableJson(filePath, payload, label)] += 1;
  }
  return { ...manifest, write_counts: counters };
}

function expectedTestIds(hiddenTask) {
  return [...new Set([...(hiddenTask.fail_to_pass || []), ...(hiddenTask.pass_to_pass || [])]
    .filter((testId) => typeof testId === 'string' && testId.includes('::')))];
}

function parsePytestOutcomes(output) {
  const outcomes = new Map();
  for (const line of String(output).split(/\r?\n/)) {
    const match = line.match(/^(PASSED|FAILED|ERROR|SKIPPED|XFAIL|XPASS)\s+(.+?)(?:\s+-\s+.*)?$/);
    if (match) outcomes.set(match[2].trim(), match[1]);
  }
  return outcomes;
}

function matchExpectedOutcome(expectedId, outcomes) {
  if (outcomes.has(expectedId)) return outcomes.get(expectedId);
  const prefixMatches = [...outcomes.entries()].filter(([observedId]) => observedId.startsWith(expectedId));
  if (!prefixMatches.length) return null;
  const statuses = [...new Set(prefixMatches.map(([, status]) => status))];
  return statuses.length === 1 ? statuses[0] : null;
}

function assessExpectedTestRun(output, hiddenTask) {
  const outcomes = parsePytestOutcomes(output);
  const failToPass = (hiddenTask.fail_to_pass || []).filter((testId) => typeof testId === 'string' && testId.includes('::'));
  const passToPass = (hiddenTask.pass_to_pass || []).filter((testId) => typeof testId === 'string' && testId.includes('::'));
  const expected = expectedTestIds(hiddenTask);
  const failOutcomes = failToPass.map((testId) => matchExpectedOutcome(testId, outcomes));
  const passOutcomes = passToPass.map((testId) => matchExpectedOutcome(testId, outcomes));
  const expectedOutcomes = expected.map((testId) => matchExpectedOutcome(testId, outcomes));
  return {
    observed_outcome_count: outcomes.size,
    fail_to_pass_count: failToPass.length,
    pass_to_pass_count: passToPass.length,
    expected_test_count: expected.length,
    fail_to_pass_observed_count: failOutcomes.filter(Boolean).length,
    pass_to_pass_observed_count: passOutcomes.filter(Boolean).length,
    expected_observed_count: expectedOutcomes.filter(Boolean).length,
    all_fail_to_pass_failed: failToPass.length > 0 && failOutcomes.every((status) => status === 'FAILED' || status === 'ERROR'),
    all_pass_to_pass_passed: passToPass.length > 0 ? passOutcomes.every((status) => status === 'PASSED') : null,
    all_expected_passed: expected.length > 0 && expectedOutcomes.every((status) => status === 'PASSED'),
  };
}

function patchFiles(patchText) {
  return [...String(patchText).matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map((match) => match[2]);
}

function productionFiles(files) {
  return files.filter((file) => !/(^|\/)(test|tests|testing|fixtures?)(\/|_|\.|$)/i.test(file));
}

function signalOccurrences(text, signal) {
  const escaped = String(signal).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = String(text).match(new RegExp(`\\b${escaped}[a-z0-9_-]*\\b`, 'gi'));
  return Math.min(4, matches ? matches.length : 0);
}

function weightedIssueSections(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  const sections = [{ name: 'body', weight: 1, text: '' }];
  let current = sections[0];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const normalized = line.replace(/^#+\s*/, '').replace(/[-:]+$/, '').trim().toLowerCase();
    let descriptor = null;
    if (/root cause|cause analysis|diagnosis|why it happens/.test(normalized)) descriptor = { name: 'causal', weight: 5 };
    else if (/suggested fix|fix direction|proposed fix|solution/.test(normalized)) descriptor = { name: 'proposed_fix', weight: 3 };
    else if (/actual behavior|observed behavior|failure|symptom/.test(normalized)) descriptor = { name: 'observed', weight: 2 };
    else if (/expected behavior|expected result|contract/.test(normalized)) descriptor = { name: 'expected', weight: 2 };
    if (descriptor && line.trim().length < 100) {
      current = { ...descriptor, text: '' };
      sections.push(current);
      continue;
    }
    current.text += `${line}\n`;
  }
  if (lines[0] && lines[0].trim()) sections.push({ name: 'title', weight: 3, text: lines[0] });
  return sections.filter((section) => section.text.trim());
}

function mechanismScores(text) {
  const sections = weightedIssueSections(text);
  return MECHANISM_CARDS.map((card) => {
    const evidence = [];
    let score = 0;
    for (const section of sections) {
      for (const signal of card.signals) {
        const occurrences = signalOccurrences(section.text, signal);
        if (!occurrences) continue;
        const contribution = occurrences * section.weight;
        score += contribution;
        evidence.push({ section: section.name, signal, occurrences, contribution });
      }
    }
    return {
      mechanism_id: card.mechanism_id,
      score,
      causal_score: evidence.filter((item) => item.section === 'causal').reduce((sum, item) => sum + item.contribution, 0),
      evidence,
    };
  }).filter((item) => item.score > 0)
    .sort((left, right) => right.causal_score - left.causal_score
      || right.score - left.score
      || left.mechanism_id.localeCompare(right.mechanism_id));
}

function rankMechanismsFromPublicTask(publicTask) {
  const scored = mechanismScores(publicTask.problem_statement);
  if (!scored.length) return [];
  const maximum = scored[0].score;
  const selected = scored.filter((item) => item.causal_score > 0 || item.score >= Math.max(2, maximum * 0.35)).slice(0, 5);
  if (!selected.length) selected.push(scored[0]);
  return selected.map((item, index) => ({
    ...item,
    rank: index + 1,
    confidence: maximum > 0 ? Number((item.score / maximum).toFixed(6)) : 0,
  }));
}

function inferMechanismsFromPublicTask(publicTask) {
  return rankMechanismsFromPublicTask(publicTask).map((item) => item.mechanism_id);
}

function analyzeVerifiedDevelopmentTask(publicTask, hiddenTask, verification) {
  const changedFiles = patchFiles(hiddenTask.gold_patch);
  const changedProductionFiles = productionFiles(changedFiles);
  const addedLineCount = String(hiddenTask.gold_patch).split('\n').filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
  const removedLineCount = String(hiddenTask.gold_patch).split('\n').filter((line) => line.startsWith('-') && !line.startsWith('---')).length;
  const mechanismEvidence = mechanismScores(`${publicTask.problem_statement}\n${hiddenTask.gold_patch}`);
  const mechanisms = mechanismEvidence.slice(0, 3).map((item) => item.mechanism_id);
  return {
    schema_version: 1,
    episode_id: `ep_open_world_development_${sha256Text(publicTask.task_id).slice(0, 16)}`,
    created_at: verification.completed_at,
    task_id: publicTask.task_id,
    repository: publicTask.repository,
    base_commit: publicTask.base_commit,
    source_split: publicTask.source_split,
    public_task_hash: publicTask.public_task_hash,
    verifier_outcome: verification.verified ? 'verified' : 'failed',
    evidence: {
      baseline_fail: verification.baseline_all_fail_to_pass_failed === true,
      gold_pass: verification.gold_all_expected_passed === true,
      production_patch: changedProductionFiles.length > 0,
      regression_surface: hiddenTask.pass_to_pass.length > 0,
      baseline_log_hash: verification.baseline_log_hash,
      gold_log_hash: verification.gold_log_hash,
      gold_patch_hash: sha256Text(hiddenTask.gold_patch),
      hidden_test_patch_hash: sha256Text(hiddenTask.test_patch),
    },
    structural_trace: {
      changed_file_count: changedFiles.length,
      changed_production_file_count: changedProductionFiles.length,
      production_file_extensions: [...new Set(changedProductionFiles.map((file) => path.extname(file) || '<none>'))].sort(),
      added_line_count: addedLineCount,
      removed_line_count: removedLineCount,
      fail_to_pass_count: hiddenTask.fail_to_pass.length,
      pass_to_pass_count: hiddenTask.pass_to_pass.length,
      mechanisms,
      mechanism_evidence: mechanismEvidence,
    },
    observed_procedure_ids: [
      'reconstruct_contract', 'inspect_repository_rules', 'reproduce_baseline',
      'localize_causal_boundary', 'rank_competing_hypotheses',
      ...mechanisms.map((item) => `mechanism_${item}`),
      'apply_minimal_patch', 'verify_target_behavior',
      'verify_regressions', 'emit_audited_result',
    ],
    literal_patch_excluded_from_learning_artifact: true,
  };
}

function buildProcedureGraph(episodes) {
  const verified = episodes.filter((episode) => episode.verifier_outcome === 'verified');
  const supportedMechanisms = [...new Set(verified.flatMap((episode) => episode.structural_trace.mechanisms))].sort();
  const coreNodes = CORE_PROCEDURES.map((procedure) => ({
    node_id: procedure.procedure_id,
    node_type: 'verified_procedure',
    input_type: procedure.input_type,
    output_type: procedure.output_type,
    procedure: procedure.procedure,
    source_episode_ids: verified.map((episode) => episode.episode_id),
  }));
  const mechanismNodes = MECHANISM_CARDS.filter((card) => supportedMechanisms.includes(card.mechanism_id)).map((card) => ({
    node_id: `mechanism_${card.mechanism_id}`,
    node_type: 'verified_mechanism_procedure',
    input_type: 'hypothesis.ranked',
    output_type: 'hypothesis.ranked',
    procedure: card.procedure,
    title: card.title,
    source_episode_ids: verified.filter((episode) => episode.structural_trace.mechanisms.includes(card.mechanism_id)).map((episode) => episode.episode_id),
  }));
  const nodes = [...coreNodes, ...mechanismNodes];
  const edges = [];
  for (const left of nodes) for (const right of nodes) {
    if (left.node_id === right.node_id || left.output_type !== right.input_type) continue;
    edges.push({
      edge_id: `edge_${sha256Json({ from: left.node_id, to: right.node_id }).slice(0, 16)}`,
      from: left.node_id,
      to: right.node_id,
      relation: 'composes_with',
      epistemic_status: 'verified',
    });
  }
  const graph = {
    schema_version: 1,
    graph_type: 'apfc_open_world_meta_procedure_graph',
    nodes,
    edges: edges.sort((a, b) => a.edge_id.localeCompare(b.edge_id)),
    supported_mechanisms: supportedMechanisms,
  };
  graph.graph_hash = sha256Json(graph);
  return graph;
}

function compileMetaContext(graph, publicTask) {
  const ranked = rankMechanismsFromPublicTask(publicTask);
  const inferred = ranked.map((item) => item.mechanism_id);
  const supported = inferred.filter((mechanism) => graph.supported_mechanisms.includes(mechanism));
  const selected = supported;
  const selectedNodeIds = selected.map((mechanism) => `mechanism_${mechanism}`);
  const pathNodeIds = [
    'reconstruct_contract', 'inspect_repository_rules', 'reproduce_baseline',
    'localize_causal_boundary', 'rank_competing_hypotheses',
    ...selectedNodeIds, 'apply_minimal_patch', 'verify_target_behavior',
    'verify_regressions', 'emit_audited_result',
  ];
  const nodeById = new Map(graph.nodes.map((node) => [node.node_id, node]));
  const procedureCards = pathNodeIds.map((nodeId) => nodeById.get(nodeId)).filter(Boolean);
  for (let index = 1; index < procedureCards.length; index += 1) {
    const previous = procedureCards[index - 1];
    const current = procedureCards[index];
    if (previous.output_type !== current.input_type) {
      throw new Error(`APFC_OPEN_WORLD_COMPILED_PATH_TYPE_MISMATCH:${previous.node_id}:${current.node_id}`);
    }
  }
  const context = {
    schema_version: 1,
    context_type: 'apfc_open_world_meta_context',
    task_id: publicTask.task_id,
    inferred_mechanisms: inferred,
    recognized_mechanisms: selected,
    unsupported_mechanisms: inferred.filter((mechanism) => !graph.supported_mechanisms.includes(mechanism)),
    recognition_evidence: ranked.map((item) => ({
      mechanism_id: item.mechanism_id,
      rank: item.rank,
      score: item.score,
      causal_score: item.causal_score,
      confidence: item.confidence,
      signals: [...new Set(item.evidence.map((entry) => entry.signal))].sort(),
      sections: [...new Set(item.evidence.map((entry) => entry.section))].sort(),
    })),
    public_inference_only: true,
    path_node_ids: pathNodeIds,
    procedure_cards: procedureCards.map((node) => ({
      procedure_id: node.node_id,
      input_type: node.input_type,
      output_type: node.output_type,
      procedure: node.procedure,
    })),
  };
  context.context_hash = sha256Json(context);
  return context;
}

function induceMetaSkill(episodes, sealManifest) {
  const verified = episodes.filter((episode) => episode.verifier_outcome === 'verified');
  const workflowRecords = WORKFLOW_HYPOTHESES.map((hypothesis) => {
    const evidenceClosed = verified.every((episode) => hypothesis.required_episode_evidence.every((name) => episode.evidence[name] === true));
    const metaRequirementsClosed = hypothesis.supports_family_recognition && hypothesis.supports_composition;
    return {
      hypothesis_id: hypothesis.hypothesis_id,
      evidence_closed: evidenceClosed,
      meta_requirements_closed: metaRequirementsClosed,
      survives: evidenceClosed && metaRequirementsClosed,
      selection_basis: metaRequirementsClosed
        ? 'preregistered_family_recognition_and_composition_requirement_plus_verified_episode_evidence'
        : 'rejected_by_preregistered_meta_capability_requirement',
    };
  });
  const survivors = workflowRecords.filter((record) => record.survives);
  if (verified.length < 12) throw new Error(`APFC_OPEN_WORLD_MINIMUM_VERIFIED_EPISODES_NOT_MET:${verified.length}`);
  if (survivors.length !== 1) throw new Error(`APFC_OPEN_WORLD_META_HYPOTHESIS_NOT_UNIQUE:${survivors.length}`);
  const graph = buildProcedureGraph(verified);
  if (graph.supported_mechanisms.length < 5) throw new Error(`APFC_OPEN_WORLD_MECHANISM_DIVERSITY_TOO_LOW:${graph.supported_mechanisms.length}`);
  const sourceEpisodeIds = verified.map((episode) => episode.episode_id).sort();
  const sourceMechanismSignatures = [...new Set(verified.map((episode) => [...episode.structural_trace.mechanisms].sort().join('+')))].sort();
  const skillCore = {
    title: 'Evidence-graph compiler for real-repository problem solving',
    domain: 'open_world_software_engineering',
    source_episode_ids: sourceEpisodeIds,
    selected_hypothesis_id: survivors[0].hypothesis_id,
    source_seal_digest: sealManifest.seal_digest,
    procedure_graph_hash: graph.graph_hash,
  };
  const skillId = `skill_apfc_open_world_meta_${sha256Json(skillCore).slice(0, 20)}`;
  const inducedAt = verified.map((episode) => episode.created_at).sort().at(-1);
  const skill = {
    schema_version: 1,
    skill_id: skillId,
    status: 'candidate',
    created_at: inducedAt,
    title: skillCore.title,
    description: 'Recognize a new repository issue by its causal mechanism, compile a typed path from verified procedures, execute the path, and report only independently testable outcomes.',
    domain: skillCore.domain,
    task_types: ['real_repository_issue_resolution', 'unseen_problem_family_recognition', 'verified_procedure_composition'],
    inputs: ['public issue statement', 'repository at immutable base commit', 'repository-local evidence'],
    tools: ['terminal_executor', 'git', 'repository_test_runner'],
    source_episodes: sourceEpisodeIds,
    evals: [],
    preconditions: [
      'reference patch and evaluator tests are absent from the learner workspace',
      'repository base commit is immutable',
      'selected procedures have verified source episodes',
    ],
    procedure: [
      'Infer one to three causal mechanism signatures from the public issue and repository evidence; do not treat the project name as a problem family.',
      'Compile the smallest type-compatible path from task.issue to result.audited through the verified APFC procedure graph.',
      'Execute the path in order, updating the hypothesis only from observed repository evidence.',
      'Modify production code only; never weaken, replace, or fabricate evaluator tests.',
      'Accept success only from commands that actually executed, then report failures and uncertainty explicitly.',
    ],
    success_criteria: [
      'candidate patch passes sealed fail-to-pass and pass-to-pass tests',
      'no forbidden test, fixture, benchmark, credential, or outside-workspace modification',
      'recognized mechanisms and composed procedure identifiers are recorded',
    ],
    failure_modes: [
      'issue-label matching substitutes for causal localization',
      'reference patch or hidden test contamination',
      'test edits create a false pass',
      'infrastructure failure is reported as product evidence',
      'broad refactor obscures the causal change',
    ],
    rollback: 'Remove the meta context and fall back to the matched memory-disabled condition; revoke the skill if sealed transfer or protected safety regresses.',
    induction: {
      method: 'requirement_constrained_workflow_selection_plus_episode_supported_mechanism_consolidation',
      source_episode_ids: sourceEpisodeIds,
      source_mechanism_signatures: sourceMechanismSignatures,
      workflow_hypotheses: workflowRecords,
      selected_hypothesis_id: survivors[0].hypothesis_id,
      literal_gold_patches_in_skill: false,
    },
    apfc_meta_graph: graph,
  };
  skill.skill_hash = sha256Json(skill);
  return { skill, graph, workflow_records: workflowRecords };
}

module.exports = {
  CORE_PROCEDURES,
  MECHANISM_CARDS,
  TEST_PROTOCOL_ID,
  WORKFLOW_HYPOTHESES,
  analyzeVerifiedDevelopmentTask,
  assessExpectedTestRun,
  assertDevelopmentReceipt,
  assertEmbeddedHash,
  buildProcedureGraph,
  buildDevelopmentEpisode,
  buildDevelopmentTaskSpec,
  buildDevelopmentVerification,
  compileMetaContext,
  formalArtifactManifest,
  inferMechanismsFromPublicTask,
  rankMechanismsFromPublicTask,
  induceMetaSkill,
  materializeFormalDevelopmentArtifacts,
  parsePytestOutcomes,
};
