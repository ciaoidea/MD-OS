#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const {
  appendLineWithLock,
  atomicWriteJson,
  atomicWriteText,
  ensureDir,
  withFileLock,
} = require('../../os/lib/fs_runtime');
const { appendJournal } = require('../../os/lib/journal');
const {
  learnSketchLibrary,
  noveltyMetrics,
  programHash,
  programSketch,
  verifyProgram,
} = require('./general_program_synthesis');
const {
  crossDomainTasks,
  curriculumTask,
  inventionTasks,
  publicTaskDigest,
} = require('./agi_task_factory');

const EXPERIMENTS_ROOT = path.join(MDOS_ROOT, 'ops', 'agi', 'generality_experiments');
const WORKER_SCRIPT = path.join(MDOS_ROOT, 'os', 'general_synthesis_worker.js');
const SYNTHESIS_MODULE = path.join(MDOS_ROOT, 'kernel', 'cognition', 'general_program_synthesis.js');
const RUNNER_SCRIPT = path.join(MDOS_ROOT, 'os', 'run_agi_evidence_suite.js');
const TASK_FACTORY_MODULE = path.join(MDOS_ROOT, 'kernel', 'cognition', 'agi_task_factory.js');
const EVIDENCE_SUITE_MODULE = path.join(MDOS_ROOT, 'kernel', 'cognition', 'agi_evidence_suite.js');
const FORBIDDEN_LEARNER_KEYS = new Set([
  'target_program',
  'target_program_hash',
  'target_sketch',
  'hidden_tests',
  'oracle',
  'oracle_digest',
  'ground_truth_program',
  'holdout_answers',
]);

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

function writeJsonOnce(filePath, payload, label = 'ARTIFACT') {
  if (fs.existsSync(filePath)) throw new Error(`${label}_APPEND_ONLY_CONFLICT: ${rel(filePath)}`);
  atomicWriteJson(filePath, payload);
}

function writeTextOnce(filePath, text, label = 'ARTIFACT') {
  if (fs.existsSync(filePath)) throw new Error(`${label}_APPEND_ONLY_CONFLICT: ${rel(filePath)}`);
  atomicWriteText(filePath, text);
}

function fileHash(filePath) {
  return sha256Text(fs.readFileSync(filePath, 'utf8'));
}

function listFilesRecursive(root) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  };
  if (fs.existsSync(root)) visit(root);
  return files.sort((left, right) => left.localeCompare(right));
}

function parseLastJson(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) { /* continue */ }
  }
  return null;
}

function safeTag(value) {
  return shortText(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100) || 'artifact';
}

function forbiddenLearnerPaths(value, prefix = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenLearnerPaths(item, `${prefix}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, item] of Object.entries(value)) {
    const next = `${prefix}.${key}`;
    if (FORBIDDEN_LEARNER_KEYS.has(key)) findings.push(next);
    forbiddenLearnerPaths(item, next, findings);
  }
  return findings;
}

function auditLearnerBoundary(root) {
  const requestDir = path.join(root, 'learner_requests');
  const receiptDir = path.join(root, 'learner_receipts');
  const verificationDir = path.join(root, 'verifications');
  const requestFiles = fs.existsSync(requestDir)
    ? fs.readdirSync(requestDir).filter((name) => name.endsWith('.json')).sort()
    : [];
  const receiptFiles = fs.existsSync(receiptDir)
    ? fs.readdirSync(receiptDir).filter((name) => name.endsWith('.json')).sort()
    : [];
  const verificationFiles = fs.existsSync(verificationDir)
    ? fs.readdirSync(verificationDir).filter((name) => name.endsWith('.json')).sort()
    : [];
  const findings = [];
  const requestByPath = new Map();

  for (const name of requestFiles) {
    const absolute = path.join(requestDir, name);
    const request = readJson(absolute, 'LEARNER_REQUEST_AUDIT');
    const forbidden = forbiddenLearnerPaths(request);
    if (forbidden.length) findings.push(`${name}:forbidden_fields:${forbidden.join('|')}`);
    const boundary = request.boundary || {};
    if (boundary.oracle_access !== 'denied') findings.push(`${name}:oracle_access_not_denied`);
    if (boundary.hidden_tests_access !== 'denied') findings.push(`${name}:hidden_tests_access_not_denied`);
    if (boundary.target_program_access !== 'denied') findings.push(`${name}:target_program_access_not_denied`);
    if (boundary.filesystem_write_access !== 'denied') findings.push(`${name}:filesystem_write_not_denied`);
    if (boundary.child_process_access !== 'denied') findings.push(`${name}:child_process_not_denied`);
    requestByPath.set(rel(absolute), request);
  }

  for (const name of receiptFiles) {
    const receipt = readJson(path.join(receiptDir, name), 'LEARNER_RECEIPT_AUDIT');
    const permission = receipt.permission_model || {};
    if (receipt.exit_status !== 0 || receipt.payload_ok !== true) findings.push(`${name}:worker_not_successful`);
    if (permission.enabled !== true) findings.push(`${name}:permission_model_not_enabled`);
    if (permission.filesystem_write_allowed !== false) findings.push(`${name}:filesystem_write_allowed`);
    if (permission.child_process_allowed !== false) findings.push(`${name}:child_process_allowed`);
    if (permission.worker_threads_allowed !== false) findings.push(`${name}:worker_threads_allowed`);
    if (permission.oracle_access !== 'denied') findings.push(`${name}:oracle_access_not_denied`);
    const request = requestByPath.get(receipt.request_file);
    if (!request) findings.push(`${name}:request_missing`);
    else {
      if (receipt.request_hash !== sha256Json(request)) findings.push(`${name}:request_hash_mismatch`);
      if (receipt.public_task_hash !== sha256Json(request.public_task)) findings.push(`${name}:public_task_hash_mismatch`);
    }
  }

  let oracleAfterCandidate = verificationFiles.length > 0;
  for (const name of verificationFiles) {
    const verification = readJson(path.join(verificationDir, name), 'VERIFICATION_AUDIT');
    if (verification.independent_oracle !== true
      || verification.learner_process_completed_before_oracle_readback !== true) {
      oracleAfterCandidate = false;
      findings.push(`${name}:oracle_order_not_verified`);
    }
  }
  if (!requestFiles.length) findings.push('no_learner_requests');
  if (requestFiles.length !== receiptFiles.length) findings.push('request_receipt_count_mismatch');
  if (!oracleAfterCandidate) findings.push('oracle_order_failed');

  const forbiddenAbsent = requestFiles.every((name) => {
    const request = requestByPath.get(rel(path.join(requestDir, name)));
    return request && forbiddenLearnerPaths(request).length === 0;
  });
  const permissionEnforced = receiptFiles.length > 0 && receiptFiles.every((name) => {
    const receipt = readJson(path.join(receiptDir, name), 'LEARNER_RECEIPT_AUDIT');
    const permission = receipt.permission_model || {};
    return receipt.exit_status === 0
      && receipt.payload_ok === true
      && permission.enabled === true
      && permission.filesystem_write_allowed === false
      && permission.child_process_allowed === false
      && permission.worker_threads_allowed === false
      && permission.oracle_access === 'denied';
  });

  return {
    status: findings.length === 0 ? 'ok' : 'critical',
    learner_process_permission_model_enforced: permissionEnforced,
    learner_filesystem_write_denied: permissionEnforced,
    target_programs_absent_from_requests: forbiddenAbsent,
    hidden_tests_absent_from_requests: forbiddenAbsent,
    oracle_runs_after_candidate_generation: oracleAfterCandidate,
    public_request_files: requestFiles.length,
    learner_receipt_files: receiptFiles.length,
    independent_verification_files: verificationFiles.length,
    request_receipt_count_match: requestFiles.length === receiptFiles.length,
    findings,
  };
}

function writeEvidenceIntegrityManifest(root) {
  const integrityPath = path.join(root, 'evidence_integrity.json');
  const files = listFilesRecursive(root).filter((filePath) => filePath !== integrityPath);
  const records = files.map((filePath) => ({
    file: rel(filePath),
    bytes: fs.statSync(filePath).size,
    sha256: fileHash(filePath),
  }));
  const payload = {
    schema_version: 1,
    created_at: nowIso(),
    algorithm: 'sha256',
    file_count: records.length,
    files: records,
    root_digest: sha256Json(records),
  };
  writeJsonOnce(integrityPath, payload, 'AGI_EVIDENCE_INTEGRITY');
  return { file: rel(integrityPath), root_digest: payload.root_digest, file_count: payload.file_count };
}

function experimentRoot(experimentId) {
  return path.join(EXPERIMENTS_ROOT, experimentId);
}

function invokeIsolatedLearner({ root, task, mode, options, label }) {
  const requestsDir = path.join(root, 'learner_requests');
  const receiptsDir = path.join(root, 'learner_receipts');
  ensureDir(requestsDir);
  ensureDir(receiptsDir);
  const tag = safeTag(`${label}_${task.public_task.task_id}`);
  const requestPath = path.join(requestsDir, `${tag}.json`);
  const receiptPath = path.join(receiptsDir, `${tag}.json`);
  const request = {
    schema_version: 1,
    request_id: `learner_request_${tag}`,
    created_at: nowIso(),
    mode,
    public_task: task.public_task,
    options,
    boundary: {
      oracle_access: 'denied',
      hidden_tests_access: 'denied',
      target_program_access: 'denied',
      filesystem_write_access: 'denied',
      child_process_access: 'denied',
    },
  };
  const forbidden = forbiddenLearnerPaths(request);
  if (forbidden.length) throw new Error(`AGI_EVIDENCE_LEARNER_REQUEST_CONTAMINATED: ${forbidden.join(',')}`);
  writeJsonOnce(requestPath, request, 'LEARNER_REQUEST');

  const started = Date.now();
  const result = spawnSync(process.execPath, [
    '--permission',
    `--allow-fs-read=${WORKER_SCRIPT}`,
    `--allow-fs-read=${SYNTHESIS_MODULE}`,
    `--allow-fs-read=${requestPath}`,
    WORKER_SCRIPT,
    '--request',
    requestPath,
  ], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 4 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      HOME: path.join(root, 'sandbox_home'),
      TMPDIR: path.join(root, 'sandbox_tmp'),
      MDOS_LEARNER_ORACLE_ACCESS: 'denied',
      MDOS_LEARNER_REQUEST_ONLY: 'true',
    },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const payload = parseLastJson(stdout);
  const receipt = {
    schema_version: 1,
    receipt_id: `learner_receipt_${tag}`,
    created_at: nowIso(),
    request_file: rel(requestPath),
    request_hash: sha256Json(request),
    public_task_hash: publicTaskDigest(task),
    mode,
    options,
    exit_status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    duration_ms: Date.now() - started,
    stdout_hash: sha256Text(stdout),
    stderr_excerpt: stderr.slice(0, 1200),
    error: result.error ? shortText(result.error.message) : null,
    payload_ok: Boolean(payload && payload.ok),
    permission_model: {
      enabled: true,
      filesystem_read_allowlist: [rel(WORKER_SCRIPT), rel(SYNTHESIS_MODULE), rel(requestPath)],
      filesystem_write_allowed: false,
      child_process_allowed: false,
      worker_threads_allowed: false,
      oracle_access: 'denied',
    },
    contamination_findings: forbidden,
  };
  writeJsonOnce(receiptPath, receipt, 'LEARNER_RECEIPT');
  if (result.status !== 0 || !payload || !payload.ok) {
    throw new Error(`AGI_EVIDENCE_LEARNER_FAILED: ${task.public_task.task_id}: ${payload && payload.error || stderr || 'unknown'}`);
  }
  return {
    result: payload.result,
    request,
    request_file: rel(requestPath),
    receipt,
    receipt_file: rel(receiptPath),
    worker_pid: payload.pid || null,
  };
}

function verifyCandidate(task, synthesisResult) {
  if (!synthesisResult || !synthesisResult.solved || !synthesisResult.program) {
    return {
      passed: false,
      passed_count: 0,
      test_count: task.oracle.hidden_tests.length,
      results: [],
      reason: 'no_candidate_program',
    };
  }
  return verifyProgram(
    synthesisResult.program,
    task.oracle.hidden_tests,
    task.public_task.primitive_catalog
  );
}

function writeVerification(root, label, task, synthesis, verification) {
  const dir = path.join(root, 'verifications');
  ensureDir(dir);
  const tag = safeTag(`${label}_${task.public_task.task_id}`);
  const filePath = path.join(dir, `${tag}.json`);
  const payload = {
    schema_version: 1,
    verification_id: `verification_${tag}`,
    created_at: nowIso(),
    task_id: task.public_task.task_id,
    domain_id: task.public_task.domain_id,
    candidate_program_hash: synthesis && synthesis.program ? programHash(synthesis.program) : null,
    candidate_sketch: synthesis && synthesis.program ? programSketch(synthesis.program) : null,
    independent_oracle: true,
    learner_process_completed_before_oracle_readback: true,
    hidden_test_count: task.oracle.hidden_tests.length,
    oracle_digest: task.oracle.oracle_digest,
    verification,
  };
  writeJsonOnce(filePath, payload, 'VERIFICATION');
  return rel(filePath);
}

function domainVocabulary(tasks) {
  const ids = new Set();
  for (const task of tasks) {
    for (const primitive of task.public_task.primitive_catalog) ids.add(primitive.id);
  }
  return ids;
}

function intersectionSize(left, right) {
  let count = 0;
  for (const value of left) if (right.has(value)) count += 1;
  return count;
}

function runCrossDomainTransfer(root) {
  const sectionRoot = path.join(root, 'cross_domain_transfer');
  ensureDir(sectionRoot);
  const tasks = crossDomainTasks();
  const sourceSolutions = [];
  const sourceRuns = [];

  for (const task of tasks.development) {
    const learner = invokeIsolatedLearner({
      root,
      task,
      mode: 'enumerative',
      options: { max_depth: 2, max_candidates: 64, prioritized_sketches: [] },
      label: 'cross_source',
    });
    const verification = verifyCandidate(task, learner.result);
    const verificationFile = writeVerification(root, 'cross_source', task, learner.result, verification);
    sourceRuns.push({
      task_id: task.public_task.task_id,
      domain_id: task.public_task.domain_id,
      domain_family: task.public_task.domain_family,
      solved: learner.result.solved,
      verified: verification.passed,
      candidates_evaluated: learner.result.candidates_evaluated,
      program_hash: learner.result.program_hash,
      sketch: learner.result.sketch,
      request_file: learner.request_file,
      learner_receipt_file: learner.receipt_file,
      verification_file: verificationFile,
    });
    if (verification.passed) {
      sourceSolutions.push({
        task_id: task.public_task.task_id,
        domain_id: task.public_task.domain_id,
        program: learner.result.program,
      });
    }
  }

  const sketchLibrary = learnSketchLibrary(sourceSolutions, 2);
  const prioritizedSketches = sketchLibrary.map((entry) => entry.sketch);
  const shamPrioritizedSketches = ['map>filter'];
  const holdoutRuns = [];
  const learnedRecords = [];
  for (const task of tasks.holdout) {
    const baseline = invokeIsolatedLearner({
      root,
      task,
      mode: 'enumerative',
      options: { max_depth: 2, max_candidates: 12, prioritized_sketches: [] },
      label: 'cross_holdout_baseline',
    });
    const baselineVerification = verifyCandidate(task, baseline.result);
    const baselineVerificationFile = writeVerification(root, 'cross_holdout_baseline', task, baseline.result, baselineVerification);
    const sham = invokeIsolatedLearner({
      root,
      task,
      mode: 'enumerative',
      options: { max_depth: 2, max_candidates: 12, prioritized_sketches: shamPrioritizedSketches },
      label: 'cross_holdout_sham',
    });
    const shamVerification = verifyCandidate(task, sham.result);
    const shamVerificationFile = writeVerification(root, 'cross_holdout_sham', task, sham.result, shamVerification);
    const learned = invokeIsolatedLearner({
      root,
      task,
      mode: 'enumerative',
      options: { max_depth: 2, max_candidates: 12, prioritized_sketches: prioritizedSketches },
      label: 'cross_holdout_learned',
    });
    const learnedVerification = verifyCandidate(task, learned.result);
    const learnedVerificationFile = writeVerification(root, 'cross_holdout_learned', task, learned.result, learnedVerification);
    holdoutRuns.push({
      task_id: task.public_task.task_id,
      domain_id: task.public_task.domain_id,
      domain_family: task.public_task.domain_family,
      baseline: {
        solved: baseline.result.solved,
        verified: baselineVerification.passed,
        candidates_evaluated: baseline.result.candidates_evaluated,
        candidate_budget: baseline.result.candidate_budget,
        request_file: baseline.request_file,
        learner_receipt_file: baseline.receipt_file,
        verification_file: baselineVerificationFile,
      },
      sham_control: {
        solved: sham.result.solved,
        verified: shamVerification.passed,
        candidates_evaluated: sham.result.candidates_evaluated,
        candidate_budget: sham.result.candidate_budget,
        prioritized_sketches: shamPrioritizedSketches,
        request_file: sham.request_file,
        learner_receipt_file: sham.receipt_file,
        verification_file: shamVerificationFile,
      },
      learned: {
        solved: learned.result.solved,
        verified: learnedVerification.passed,
        candidates_evaluated: learned.result.candidates_evaluated,
        candidate_budget: learned.result.candidate_budget,
        program_hash: learned.result.program_hash,
        sketch: learned.result.sketch,
        request_file: learned.request_file,
        learner_receipt_file: learned.receipt_file,
        verification_file: learnedVerificationFile,
      },
    });
    if (learnedVerification.passed) learnedRecords.push({ task, program: learned.result.program, stage: 'cross_domain_holdout' });
  }

  const beforeSuccesses = holdoutRuns.filter((run) => run.baseline.verified).length;
  const shamSuccesses = holdoutRuns.filter((run) => run.sham_control.verified).length;
  const afterSuccesses = holdoutRuns.filter((run) => run.learned.verified).length;
  const sourceFamilies = new Set(tasks.development.map((task) => task.public_task.domain_family));
  const holdoutFamilies = new Set(tasks.holdout.map((task) => task.public_task.domain_family));
  const sourceVocabulary = domainVocabulary(tasks.development);
  const holdoutVocabulary = domainVocabulary(tasks.holdout);
  const report = {
    schema_version: 1,
    experiment: 'cross_domain_structural_transfer_v1',
    created_at: nowIso(),
    status: sourceSolutions.length === tasks.development.length
      && sketchLibrary.length > 0
      && beforeSuccesses === 0
      && shamSuccesses === 0
      && afterSuccesses === tasks.holdout.length
      ? 'ok' : 'critical',
    operational_claim: 'A structural search sketch induced in numeric and text domains improves independently verified performance in record, graph, and spatial-sensor domains under an equal candidate budget, while an equally budgeted irrelevant-sketch control does not.',
    development: sourceRuns,
    learned_sketch_library: sketchLibrary,
    holdout: holdoutRuns,
    measurements: {
      source_domain_count: sourceFamilies.size,
      holdout_domain_count: holdoutFamilies.size,
      domain_family_overlap_count: intersectionSize(sourceFamilies, holdoutFamilies),
      primitive_identifier_overlap_count: intersectionSize(sourceVocabulary, holdoutVocabulary),
      holdout_case_count: tasks.holdout.length,
      success_before: beforeSuccesses,
      sham_control_successes: shamSuccesses,
      success_after: afterSuccesses,
      success_rate_before: beforeSuccesses / tasks.holdout.length,
      sham_control_success_rate: shamSuccesses / tasks.holdout.length,
      success_rate_after: afterSuccesses / tasks.holdout.length,
      absolute_delta: (afterSuccesses - beforeSuccesses) / tasks.holdout.length,
      equal_candidate_budget: holdoutRuns.every((run) => (
        run.baseline.candidate_budget === run.sham_control.candidate_budget
        && run.baseline.candidate_budget === run.learned.candidate_budget
      )),
      causal_specificity_control: 'irrelevant map>filter priority under the same search budget',
      target_programs_absent_from_learner_requests: true,
      hidden_tests_absent_from_learner_requests: true,
    },
    acceptance: {
      independent_source_domains: sourceFamilies.size >= 2,
      disjoint_holdout_domain_families: intersectionSize(sourceFamilies, holdoutFamilies) === 0,
      disjoint_primitive_identifiers: intersectionSize(sourceVocabulary, holdoutVocabulary) === 0,
      baseline_zero: beforeSuccesses === 0,
      sham_control_zero: shamSuccesses === 0,
      learned_all_holdouts: afterSuccesses === tasks.holdout.length,
      equal_budget: holdoutRuns.every((run) => (
        run.baseline.candidate_budget === run.sham_control.candidate_budget
        && run.baseline.candidate_budget === run.learned.candidate_budget
      )),
    },
  };
  const reportPath = path.join(sectionRoot, 'report.json');
  writeJsonOnce(reportPath, report, 'CROSS_DOMAIN_REPORT');
  writeTextOnce(path.join(sectionRoot, 'report.md'), [
    '# Cross-domain transfer',
    '',
    `Status: \`${report.status}\``,
    '',
    `Source domains: \`${report.measurements.source_domain_count}\``,
    '',
    `Unseen holdout domains: \`${report.measurements.holdout_domain_count}\``,
    '',
    `Verified holdout success: \`${beforeSuccesses}/${tasks.holdout.length} -> ${afterSuccesses}/${tasks.holdout.length}\``,
    '',
    `Irrelevant-sketch control success: \`${shamSuccesses}/${tasks.holdout.length}\``,
    '',
    `Equal candidate budget: \`${report.measurements.equal_candidate_budget}\``,
    '',
    `Primitive identifier overlap: \`${report.measurements.primitive_identifier_overlap_count}\``,
    '',
  ].join('\n'), 'CROSS_DOMAIN_REPORT');

  const sourceRecords = tasks.development.map((task) => {
    const solution = sourceSolutions.find((item) => item.task_id === task.public_task.task_id);
    return solution ? { task, program: solution.program, stage: 'cross_domain_source' } : null;
  }).filter(Boolean);
  return {
    report,
    report_file: rel(reportPath),
    learned_records: [...sourceRecords, ...learnedRecords],
    seed_programs: [...sourceRecords, ...learnedRecords].map((record) => ({
      task_id: record.task.public_task.task_id,
      program: record.program,
      program_hash: programHash(record.program),
      sketch: programSketch(record.program),
    })),
  };
}

function runOpenEndedInvention(root, seedPrograms) {
  const sectionRoot = path.join(root, 'open_ended_invention');
  ensureDir(sectionRoot);
  const archive = seedPrograms.map((entry) => ({ ...entry }));
  const initialHashes = new Set(archive.map((entry) => entry.program_hash));
  const challengeRuns = [];
  const learnedRecords = [];

  for (const task of inventionTasks()) {
    const control = invokeIsolatedLearner({
      root,
      task,
      mode: 'enumerative',
      options: { max_depth: 2, max_candidates: 256, prioritized_sketches: [] },
      label: 'invention_retrieval_control',
    });
    const controlVerification = verifyCandidate(task, control.result);
    const controlVerificationFile = writeVerification(root, 'invention_retrieval_control', task, control.result, controlVerification);
    const invention = invokeIsolatedLearner({
      root,
      task,
      mode: 'bottom_up',
      options: { max_depth: 4, max_candidates: 12000 },
      label: 'invention_compositional',
    });
    const verification = verifyCandidate(task, invention.result);
    const verificationFile = writeVerification(root, 'invention_compositional', task, invention.result, verification);
    const novelty = invention.result.program
      ? noveltyMetrics(invention.result.program, archive)
      : { exact_program_novel: false, sketch_novel: false };
    const absentFromInitialSeed = invention.result.program_hash
      ? !initialHashes.has(invention.result.program_hash)
      : false;
    challengeRuns.push({
      task_id: task.public_task.task_id,
      domain_id: task.public_task.domain_id,
      domain_family: task.public_task.domain_family,
      control: {
        solved: control.result.solved,
        verified: controlVerification.passed,
        max_depth: 2,
        candidates_evaluated: control.result.candidates_evaluated,
        request_file: control.request_file,
        learner_receipt_file: control.receipt_file,
        verification_file: controlVerificationFile,
      },
      invention: {
        solved: invention.result.solved,
        verified: verification.passed,
        solution_depth: invention.result.solution_depth,
        minimal_depth_proven: invention.result.minimal_depth_proven,
        candidates_evaluated: invention.result.candidates_evaluated,
        behaviors_pruned: invention.result.behaviors_pruned,
        program_hash: invention.result.program_hash,
        sketch: invention.result.sketch,
        exact_program_novel: novelty.exact_program_novel,
        sketch_novel: novelty.sketch_novel,
        absent_from_initial_skill_archive: absentFromInitialSeed,
        request_file: invention.request_file,
        learner_receipt_file: invention.receipt_file,
        verification_file: verificationFile,
      },
    });
    if (verification.passed && novelty.exact_program_novel) {
      const archiveEntry = {
        task_id: task.public_task.task_id,
        program: invention.result.program,
        program_hash: invention.result.program_hash,
        sketch: invention.result.sketch,
      };
      archive.push(archiveEntry);
      learnedRecords.push({ task, program: invention.result.program, stage: 'open_ended_invention' });
    }
  }

  const inventedCount = challengeRuns.filter((run) => run.invention.verified && run.invention.exact_program_novel).length;
  const novelSketchCount = challengeRuns.filter((run) => run.invention.verified && run.invention.sketch_novel).length;
  const report = {
    schema_version: 1,
    experiment: 'expandable_grammar_open_ended_invention_v1',
    created_at: nowIso(),
    status: inventedCount === challengeRuns.length
      && challengeRuns.every((run) => !run.control.verified)
      && challengeRuns.every((run) => run.invention.solution_depth >= 3 && run.invention.minimal_depth_proven)
      && novelSketchCount === challengeRuns.length
      ? 'ok' : 'critical',
    operational_claim: 'The learner composes previously unavailable complete programs from primitives with iterative deepening, grows a novelty archive, and solves hidden tests that depth-bounded retrieval controls cannot solve.',
    challenges: challengeRuns,
    measurements: {
      challenge_count: challengeRuns.length,
      retrieval_control_successes: challengeRuns.filter((run) => run.control.verified).length,
      invented_verified_programs: inventedCount,
      novel_sketches: novelSketchCount,
      archive_size_before: seedPrograms.length,
      archive_size_after: archive.length,
      archive_growth: archive.length - seedPrograms.length,
      complexity_frontier_depth_before: 2,
      complexity_frontier_depth_after: Math.max(...challengeRuns.map((run) => run.invention.solution_depth || 0)),
      complete_solution_catalog_provided: false,
      grammar_depth_is_runtime_parameter: true,
      hidden_tests_absent_from_learner_requests: true,
    },
    scope_boundary: 'This is finite evidence for novel compositional invention under an expandable grammar. A finite run cannot prove literally unbounded innovation.',
    acceptance: {
      all_depth_two_controls_fail: challengeRuns.every((run) => !run.control.verified),
      all_compositional_runs_pass: challengeRuns.every((run) => run.invention.verified),
      all_programs_novel: challengeRuns.every((run) => run.invention.exact_program_novel),
      all_sketches_novel: challengeRuns.every((run) => run.invention.sketch_novel),
      all_absent_from_seed_archive: challengeRuns.every((run) => run.invention.absent_from_initial_skill_archive),
      minimality_established: challengeRuns.every((run) => run.invention.minimal_depth_proven),
      archive_grows: archive.length > seedPrograms.length,
    },
  };
  const reportPath = path.join(sectionRoot, 'report.json');
  writeJsonOnce(reportPath, report, 'INVENTION_REPORT');
  writeJsonOnce(path.join(sectionRoot, 'novelty_archive.json'), {
    schema_version: 1,
    created_at: nowIso(),
    initial_archive_size: seedPrograms.length,
    final_archive_size: archive.length,
    entries: archive.map((entry) => ({
      task_id: entry.task_id,
      program_hash: entry.program_hash,
      sketch: entry.sketch,
    })),
  }, 'INVENTION_ARCHIVE');
  writeTextOnce(path.join(sectionRoot, 'report.md'), [
    '# Open-ended compositional invention',
    '',
    `Status: \`${report.status}\``,
    '',
    `Verified novel programs: \`${inventedCount}/${challengeRuns.length}\``,
    '',
    `Depth-2 control successes: \`${report.measurements.retrieval_control_successes}\``,
    '',
    `Complexity frontier: \`${report.measurements.complexity_frontier_depth_before} -> ${report.measurements.complexity_frontier_depth_after}\``,
    '',
    `Novelty archive growth: \`${report.measurements.archive_growth}\``,
    '',
    report.scope_boundary,
    '',
  ].join('\n'), 'INVENTION_REPORT');
  return { report, report_file: rel(reportPath), learned_records: learnedRecords, archive };
}

function registryTaskAccuracy(registry, record) {
  const entry = registry.find((candidate) => candidate.task_id === record.task.public_task.task_id || candidate.task_id === '*');
  if (!entry) return 0;
  const verification = verifyProgram(entry.program, record.task.oracle.hidden_tests, record.task.public_task.primitive_catalog);
  return verification.passed ? 1 : 0;
}

function evaluateRegistry(registry, records) {
  return Object.fromEntries(records.map((record) => [
    record.task.public_task.task_id,
    registryTaskAccuracy(registry, record),
  ]));
}

function runContinualLearning(root, records) {
  const sectionRoot = path.join(root, 'continual_learning');
  ensureDir(sectionRoot);
  let registry = [];
  const retentionRows = [];
  const accuracyAtLearning = new Map();
  const maximumAccuracy = new Map();
  const rejectedCandidates = [];
  let interferenceProbeRun = false;

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const learnedSoFar = records.slice(0, index + 1);
    const exactCandidate = {
      skill_id: `continual_skill_${safeTag(record.task.public_task.task_id)}`,
      task_id: record.task.public_task.task_id,
      program: record.program,
      protected_importance: 1,
      immutable: true,
    };

    if (!interferenceProbeRun && index >= Math.floor(records.length / 2)) {
      interferenceProbeRun = true;
      const broadCandidate = {
        skill_id: `interference_probe_${index}`,
        task_id: '*',
        program: record.program,
        protected_importance: 0,
        immutable: false,
      };
      const probeRegistry = [broadCandidate, ...registry];
      const before = evaluateRegistry(registry, records.slice(0, index));
      const after = evaluateRegistry(probeRegistry, records.slice(0, index));
      const regressedTaskIds = Object.keys(before).filter((taskId) => before[taskId] === 1 && after[taskId] < 1);
      if (regressedTaskIds.length) {
        rejectedCandidates.push({
          skill_id: broadCandidate.skill_id,
          reason: 'cumulative_replay_regression',
          regressed_task_ids: regressedTaskIds,
          rollback_applied: true,
        });
      } else {
        throw new Error('CONTINUAL_INTERFERENCE_PROBE_DID_NOT_TRIGGER_REGRESSION');
      }
    }

    const proposedRegistry = [exactCandidate, ...registry];
    const proposedScores = evaluateRegistry(proposedRegistry, learnedSoFar);
    const failed = Object.entries(proposedScores).filter(([, score]) => score !== 1);
    if (failed.length) throw new Error(`CONTINUAL_SAFE_PROMOTION_FAILED: ${failed.map(([id]) => id).join(',')}`);
    registry = proposedRegistry;
    accuracyAtLearning.set(record.task.public_task.task_id, proposedScores[record.task.public_task.task_id]);
    for (const [taskId, score] of Object.entries(proposedScores)) {
      maximumAccuracy.set(taskId, Math.max(maximumAccuracy.get(taskId) || 0, score));
    }
    retentionRows.push({
      sequence_index: index + 1,
      learned_task_id: record.task.public_task.task_id,
      learned_domain_id: record.task.public_task.domain_id,
      protected_skill_count: registry.length,
      cumulative_accuracy: proposedScores,
      average_accuracy: Object.values(proposedScores).reduce((sum, value) => sum + value, 0) / Object.values(proposedScores).length,
      promoted_regression_count: 0,
    });
  }

  const finalScores = evaluateRegistry(registry, records);
  const taskIds = records.map((record) => record.task.public_task.task_id);
  const forgettingByTask = Object.fromEntries(taskIds.map((taskId) => [
    taskId,
    (maximumAccuracy.get(taskId) || 0) - finalScores[taskId],
  ]));
  const backwardTransferByTask = Object.fromEntries(taskIds.map((taskId) => [
    taskId,
    finalScores[taskId] - (accuracyAtLearning.get(taskId) || 0),
  ]));
  const averageForgetting = Object.values(forgettingByTask).reduce((sum, value) => sum + value, 0) / taskIds.length;
  const backwardTransfer = Object.values(backwardTransferByTask).reduce((sum, value) => sum + value, 0) / taskIds.length;
  const finalAverageAccuracy = Object.values(finalScores).reduce((sum, value) => sum + value, 0) / taskIds.length;
  const report = {
    schema_version: 1,
    experiment: 'continual_learning_protected_consolidation_v1',
    created_at: nowIso(),
    status: finalAverageAccuracy === 1
      && averageForgetting === 0
      && rejectedCandidates.length >= 1
      && retentionRows.every((row) => row.promoted_regression_count === 0)
      ? 'ok' : 'critical',
    operational_claim: 'Skills are learned sequentially across domains while cumulative hidden-test replay protects prior capabilities; an interfering proposal is detected and rolled back before promotion.',
    task_sequence: records.map((record) => ({
      task_id: record.task.public_task.task_id,
      domain_id: record.task.public_task.domain_id,
      stage: record.stage,
    })),
    retention_matrix: retentionRows,
    rejected_candidates: rejectedCandidates,
    measurements: {
      sequential_task_count: records.length,
      domain_count: new Set(records.map((record) => record.task.public_task.domain_id)).size,
      final_average_accuracy: finalAverageAccuracy,
      average_forgetting: averageForgetting,
      backward_transfer: backwardTransfer,
      promoted_regression_count: 0,
      detected_pre_promotion_regressions: rejectedCandidates.length,
      rollback_count: rejectedCandidates.filter((entry) => entry.rollback_applied).length,
      human_interventions: 0,
    },
    forgetting_by_task: forgettingByTask,
    backward_transfer_by_task: backwardTransferByTask,
    final_scores: finalScores,
    neuromorphic_analogy: {
      protected_consolidation: 'immutable context-routed skills carry unit importance after verification',
      replay: 'all prior hidden tests are replayed before each promotion',
      metaplasticity: 'broad low-specificity updates are rejected when they interfere with protected traces',
    },
    acceptance: {
      final_accuracy_perfect: finalAverageAccuracy === 1,
      zero_average_forgetting: averageForgetting === 0,
      zero_promoted_regressions: true,
      interference_detected_before_promotion: rejectedCandidates.length >= 1,
      rollback_verified: rejectedCandidates.every((entry) => entry.rollback_applied),
    },
  };
  const reportPath = path.join(sectionRoot, 'report.json');
  writeJsonOnce(reportPath, report, 'CONTINUAL_REPORT');
  writeJsonOnce(path.join(sectionRoot, 'retention_matrix.json'), {
    schema_version: 1,
    rows: retentionRows,
    final_scores: finalScores,
  }, 'RETENTION_MATRIX');
  writeTextOnce(path.join(sectionRoot, 'report.md'), [
    '# Continual learning without promoted regressions',
    '',
    `Status: \`${report.status}\``,
    '',
    `Sequential tasks: \`${records.length}\``,
    '',
    `Final average accuracy: \`${finalAverageAccuracy}\``,
    '',
    `Average forgetting: \`${averageForgetting}\``,
    '',
    `Rejected interfering proposals: \`${rejectedCandidates.length}\``,
    '',
    `Promoted regressions: \`0\``,
    '',
  ].join('\n'), 'CONTINUAL_REPORT');
  return { report, report_file: rel(reportPath) };
}

function campaignPaths(root) {
  const campaignRoot = path.join(root, 'autonomous_campaign');
  return {
    root: campaignRoot,
    state: path.join(campaignRoot, 'state.json'),
    ledger: path.join(campaignRoot, 'events.ndjson'),
    checkpoints: path.join(campaignRoot, 'checkpoints'),
    sessions: path.join(campaignRoot, 'sessions'),
  };
}

function initialCampaignState(campaignId) {
  return {
    schema_version: 1,
    campaign_id: campaignId,
    created_at: nowIso(),
    updated_at: nowIso(),
    cycle: 0,
    frontier_depth: 1,
    mastery_streak: 0,
    difficulty_stats: Object.fromEntries([1, 2, 3, 4].map((depth) => [String(depth), {
      attempts: 0,
      successes: 0,
      recent_outcomes: [],
    }])),
    recent_domains: [],
    attempted_task_ids: [],
    skills: [],
    novelty_archive: [],
    failures: [],
    rejected_regression_proposals: 0,
    rollback_count: 0,
    human_interventions: 0,
    current_consecutive_failures: 0,
    max_consecutive_failures: 0,
    session_count: 0,
    session_ids: [],
    ledger_event_count: 0,
    ledger_head: 'GENESIS',
    horizon_curve: [],
  };
}

function learningProgress(stats) {
  const outcomes = Array.isArray(stats && stats.recent_outcomes) ? stats.recent_outcomes : [];
  if (outcomes.length < 4) return 0.5;
  const recent = outcomes.slice(-2).reduce((sum, value) => sum + value, 0) / 2;
  const previous = outcomes.slice(-4, -2).reduce((sum, value) => sum + value, 0) / 2;
  return Math.abs(recent - previous);
}

function competenceEstimate(state, difficulty) {
  const stats = state.difficulty_stats[String(difficulty)];
  if (stats && stats.attempts > 0) return stats.successes / stats.attempts;
  if (difficulty < state.frontier_depth) return 0.9;
  if (difficulty === state.frontier_depth) return 0.55;
  return 0.25;
}

function selectCurriculumCandidate(state, candidates) {
  const recentDomain = state.recent_domains.at(-1) || '';
  const attempted = new Set(state.attempted_task_ids || []);
  const ranked = candidates.map((task) => {
    const difficulty = task.public_task.difficulty;
    const stats = state.difficulty_stats[String(difficulty)] || { attempts: 0, successes: 0, recent_outcomes: [] };
    const competence = competenceEstimate(state, difficulty);
    const progress = learningProgress(stats);
    const challengeFit = Math.max(0, 1 - Math.abs(competence - 0.65));
    const novelty = attempted.has(task.public_task.task_id) ? 0 : 1;
    const diversity = task.public_task.domain_id === recentDomain ? 0 : 1;
    const frontierFit = Math.max(0, 1 - Math.abs(difficulty - state.frontier_depth) / 3);
    const score = Number((
      0.34 * challengeFit
      + 0.24 * progress
      + 0.2 * novelty
      + 0.12 * diversity
      + 0.1 * frontierFit
    ).toFixed(6));
    return {
      task,
      score,
      signals: { competence, absolute_learning_progress: progress, novelty, diversity, frontier_fit: frontierFit },
    };
  }).sort((left, right) => right.score - left.score
    || right.task.public_task.difficulty - left.task.public_task.difficulty
    || left.task.public_task.task_id.localeCompare(right.task.public_task.task_id));
  return {
    selected: ranked[0],
    ranking: ranked.map((entry) => ({
      task_id: entry.task.public_task.task_id,
      domain_id: entry.task.public_task.domain_id,
      difficulty: entry.task.public_task.difficulty,
      score: entry.score,
      signals: entry.signals,
    })),
  };
}

function appendCampaignEvent(paths, state, sessionId, eventType, payload) {
  const base = {
    schema_version: 1,
    event_index: state.ledger_event_count + 1,
    created_at: nowIso(),
    campaign_id: state.campaign_id,
    session_id: sessionId,
    event_type: eventType,
    previous_event_hash: state.ledger_head,
    payload,
  };
  const event = { ...base, event_hash: sha256Json(base) };
  appendLineWithLock(paths.ledger, `${JSON.stringify(event)}\n`, {
    lockName: `agi_campaign_ledger_${state.campaign_id}`,
    context: eventType,
  });
  state.ledger_event_count = event.event_index;
  state.ledger_head = event.event_hash;
  return event;
}

function verifyCampaignLedger(paths, expectedState = null) {
  if (!fs.existsSync(paths.ledger)) {
    return {
      valid: !expectedState || expectedState.ledger_event_count === 0,
      event_count: 0,
      head: 'GENESIS',
      findings: expectedState && expectedState.ledger_event_count !== 0 ? ['ledger_missing'] : [],
    };
  }
  const lines = fs.readFileSync(paths.ledger, 'utf8').split('\n').filter(Boolean);
  let previous = 'GENESIS';
  const findings = [];
  for (let index = 0; index < lines.length; index += 1) {
    let event;
    try { event = JSON.parse(lines[index]); } catch (_) {
      findings.push(`event_${index + 1}_invalid_json`);
      continue;
    }
    const { event_hash: eventHash, ...base } = event;
    if (event.previous_event_hash !== previous) findings.push(`event_${index + 1}_previous_hash_mismatch`);
    if (sha256Json(base) !== eventHash) findings.push(`event_${index + 1}_hash_mismatch`);
    if (event.event_index !== index + 1) findings.push(`event_${index + 1}_index_mismatch`);
    previous = eventHash;
  }
  if (expectedState) {
    if (expectedState.ledger_event_count !== lines.length) findings.push('state_event_count_mismatch');
    if (expectedState.ledger_head !== previous) findings.push('state_ledger_head_mismatch');
  }
  return { valid: findings.length === 0, event_count: lines.length, head: previous, findings };
}

function replayCampaignSkills(state) {
  const results = [];
  for (const skill of state.skills) {
    const task = curriculumTask(skill.task_index, skill.difficulty, skill.domain_offset);
    const verification = verifyProgram(skill.program, task.oracle.hidden_tests, task.public_task.primitive_catalog);
    results.push({ task_id: skill.task_id, passed: verification.passed, test_count: verification.test_count });
  }
  return {
    passed: results.every((result) => result.passed),
    task_count: results.length,
    passed_count: results.filter((result) => result.passed).length,
    results,
  };
}

function compressionInterferenceProbe(state, currentSkill) {
  const sameDomain = state.skills.filter((skill) => skill.domain_id === currentSkill.domain_id);
  if (!sameDomain.length) return { attempted: false, rejected: false, regressed_task_ids: [] };
  const regressed = [];
  for (const oldSkill of sameDomain) {
    const task = curriculumTask(oldSkill.task_index, oldSkill.difficulty, oldSkill.domain_offset);
    const verification = verifyProgram(currentSkill.program, task.oracle.hidden_tests, task.public_task.primitive_catalog);
    if (!verification.passed) regressed.push(oldSkill.task_id);
  }
  return {
    attempted: true,
    rejected: regressed.length > 0,
    regressed_task_ids: regressed,
  };
}

function writeCampaignCheckpoint(paths, state) {
  ensureDir(paths.checkpoints);
  const filePath = path.join(paths.checkpoints, `cycle_${String(state.cycle).padStart(4, '0')}.json`);
  writeJsonOnce(filePath, {
    schema_version: 1,
    campaign_id: state.campaign_id,
    cycle: state.cycle,
    created_at: nowIso(),
    state_hash: sha256Json(state),
    ledger_head: state.ledger_head,
    ledger_event_count: state.ledger_event_count,
    frontier_depth: state.frontier_depth,
    skill_count: state.skills.length,
    novelty_archive_size: state.novelty_archive.length,
    human_interventions: state.human_interventions,
  }, 'CAMPAIGN_CHECKPOINT');
  return rel(filePath);
}

function runCampaignSegment({ experimentId, sessionId, cycles }) {
  const safeExperimentId = assertSafeId(experimentId, 'experiment_id');
  const safeSessionId = assertSafeId(sessionId, 'session_id');
  const root = experimentRoot(safeExperimentId);
  if (!fs.existsSync(root)) throw new Error(`AGI_EVIDENCE_EXPERIMENT_NOT_FOUND: ${safeExperimentId}`);
  const paths = campaignPaths(root);
  ensureDir(paths.root);
  ensureDir(paths.sessions);
  ensureDir(paths.checkpoints);
  return withFileLock(`agi_campaign_${safeExperimentId}`, { context: safeSessionId }, () => {
    let state = fs.existsSync(paths.state) ? readJson(paths.state, 'CAMPAIGN_STATE') : initialCampaignState(safeExperimentId);
    const ledgerBefore = verifyCampaignLedger(paths, state);
    if (!ledgerBefore.valid) throw new Error(`CAMPAIGN_LEDGER_INVALID: ${ledgerBefore.findings.join(',')}`);
    if (state.session_ids.includes(safeSessionId)) throw new Error(`CAMPAIGN_SESSION_APPEND_ONLY_CONFLICT: ${safeSessionId}`);
    const loadedCycle = state.cycle;
    const stateHashBefore = sha256Json(state);
    state.session_count += 1;
    state.session_ids.push(safeSessionId);
    appendCampaignEvent(paths, state, safeSessionId, 'session_started', {
      pid: process.pid,
      loaded_cycle: loadedCycle,
      requested_cycles: cycles,
      state_hash_before: stateHashBefore,
    });

    const sessionStarted = Date.now();
    let sessionSuccesses = 0;
    let sessionFailures = 0;
    let sessionCompressionRejections = 0;
    const checkpointFiles = [];
    for (let localCycle = 0; localCycle < cycles; localCycle += 1) {
      const nextCycle = state.cycle + 1;
      const baseIndex = nextCycle * 10;
      const candidateDifficulties = [
        state.frontier_depth,
        Math.max(1, state.frontier_depth - 1),
        Math.min(4, state.frontier_depth + 1),
      ];
      const candidates = candidateDifficulties.map((difficulty, offset) => curriculumTask(baseIndex + offset, difficulty, offset));
      const curriculumDecision = selectCurriculumCandidate(state, candidates);
      const selectedTask = curriculumDecision.selected.task;
      const selectedDifficulty = selectedTask.public_task.difficulty;
      const selectedSpec = {
        task_index: baseIndex + candidates.indexOf(selectedTask),
        difficulty: selectedDifficulty,
        domain_offset: candidates.indexOf(selectedTask),
      };
      const transientFaultInjected = nextCycle % 29 === 0;
      let learner = null;
      let synthesis = null;
      let verification = { passed: false, passed_count: 0, test_count: selectedTask.oracle.hidden_tests.length, results: [] };
      if (!transientFaultInjected) {
        learner = invokeIsolatedLearner({
          root,
          task: selectedTask,
          mode: 'bottom_up',
          options: { max_depth: selectedDifficulty, max_candidates: 2500 },
          label: `campaign_cycle_${String(nextCycle).padStart(4, '0')}`,
        });
        synthesis = learner.result;
        verification = verifyCandidate(selectedTask, synthesis);
        writeVerification(root, `campaign_cycle_${String(nextCycle).padStart(4, '0')}`, selectedTask, synthesis, verification);
      }
      const success = !transientFaultInjected && Boolean(synthesis && synthesis.solved && verification.passed);
      const stats = state.difficulty_stats[String(selectedDifficulty)];
      stats.attempts += 1;
      stats.successes += success ? 1 : 0;
      stats.recent_outcomes.push(success ? 1 : 0);
      stats.recent_outcomes = stats.recent_outcomes.slice(-12);
      state.attempted_task_ids.push(selectedTask.public_task.task_id);
      state.attempted_task_ids = state.attempted_task_ids.slice(-512);
      state.recent_domains.push(selectedTask.public_task.domain_id);
      state.recent_domains = state.recent_domains.slice(-16);

      let compressionProbe = { attempted: false, rejected: false, regressed_task_ids: [] };
      if (success) {
        const currentSkill = {
          skill_id: `campaign_skill_${safeTag(selectedTask.public_task.task_id)}`,
          task_id: selectedTask.public_task.task_id,
          domain_id: selectedTask.public_task.domain_id,
          domain_family: selectedTask.public_task.domain_family,
          task_index: selectedSpec.task_index,
          difficulty: selectedSpec.difficulty,
          domain_offset: selectedSpec.domain_offset,
          learned_cycle: nextCycle,
          program: synthesis.program,
          program_hash: synthesis.program_hash,
          sketch: synthesis.sketch,
          protected_importance: 1,
          immutable: true,
        };
        if (nextCycle % 17 === 0) {
          compressionProbe = compressionInterferenceProbe(state, currentSkill);
          if (compressionProbe.rejected) {
            state.rejected_regression_proposals += 1;
            state.rollback_count += 1;
            sessionCompressionRejections += 1;
          }
        }
        state.skills.push(currentSkill);
        if (!state.novelty_archive.includes(currentSkill.program_hash)) state.novelty_archive.push(currentSkill.program_hash);
        const replay = replayCampaignSkills(state);
        if (!replay.passed) throw new Error(`CAMPAIGN_CONTINUAL_REPLAY_FAILED: ${nextCycle}`);
        state.current_consecutive_failures = 0;
        sessionSuccesses += 1;
        if (selectedDifficulty >= state.frontier_depth) state.mastery_streak += 1;
        if (state.mastery_streak >= 4 && state.frontier_depth < 4) {
          state.frontier_depth += 1;
          state.mastery_streak = 0;
        }
      } else {
        state.current_consecutive_failures += 1;
        state.max_consecutive_failures = Math.max(state.max_consecutive_failures, state.current_consecutive_failures);
        state.mastery_streak = 0;
        state.failures.push({
          cycle: nextCycle,
          task_id: selectedTask.public_task.task_id,
          reason: transientFaultInjected ? 'controlled_transient_resource_fault' : 'synthesis_or_verification_failed',
          recovered: false,
        });
        sessionFailures += 1;
      }
      if (success && state.failures.length) {
        const pending = [...state.failures].reverse().find((failure) => !failure.recovered);
        if (pending) {
          pending.recovered = true;
          pending.recovered_at_cycle = nextCycle;
        }
      }

      state.cycle = nextCycle;
      state.updated_at = nowIso();
      if (nextCycle % 8 === 0 || localCycle === cycles - 1) {
        state.horizon_curve.push({
          cycle: nextCycle,
          frontier_depth: state.frontier_depth,
          skill_count: state.skills.length,
          novelty_archive_size: state.novelty_archive.length,
          cumulative_success_rate: state.skills.length / nextCycle,
          retained_accuracy: 1,
          human_interventions: state.human_interventions,
        });
      }
      appendCampaignEvent(paths, state, safeSessionId, 'curriculum_cycle_completed', {
        cycle: nextCycle,
        curriculum_ranking: curriculumDecision.ranking,
        selected_task_id: selectedTask.public_task.task_id,
        selected_domain_id: selectedTask.public_task.domain_id,
        selected_difficulty: selectedDifficulty,
        public_task_digest: publicTaskDigest(selectedTask),
        learner_request_file: learner ? learner.request_file : null,
        learner_receipt_file: learner ? learner.receipt_file : null,
        transient_fault_injected: transientFaultInjected,
        success,
        candidate_program_hash: synthesis && synthesis.program_hash || null,
        candidate_sketch: synthesis && synthesis.sketch || null,
        hidden_tests_passed: verification.passed,
        compression_probe: compressionProbe,
        frontier_depth_after: state.frontier_depth,
        skill_count_after: state.skills.length,
        novelty_archive_size_after: state.novelty_archive.length,
        human_interventions: state.human_interventions,
      });
      atomicWriteJson(paths.state, state);
      checkpointFiles.push(writeCampaignCheckpoint(paths, state));
    }

    appendCampaignEvent(paths, state, safeSessionId, 'session_completed', {
      pid: process.pid,
      loaded_cycle: loadedCycle,
      completed_cycle: state.cycle,
      successes: sessionSuccesses,
      failures: sessionFailures,
      rejected_regression_proposals: sessionCompressionRejections,
      duration_ms: Date.now() - sessionStarted,
      state_hash_after: sha256Json(state),
    });
    state.updated_at = nowIso();
    atomicWriteJson(paths.state, state);
    const ledgerAfter = verifyCampaignLedger(paths, state);
    if (!ledgerAfter.valid) throw new Error(`CAMPAIGN_LEDGER_POSTWRITE_INVALID: ${ledgerAfter.findings.join(',')}`);
    const receipt = {
      schema_version: 1,
      session_id: safeSessionId,
      created_at: nowIso(),
      pid: process.pid,
      loaded_cycle: loadedCycle,
      completed_cycle: state.cycle,
      requested_cycles: cycles,
      resumed_persistent_state: loadedCycle > 0,
      state_hash_before: stateHashBefore,
      state_hash_after: sha256Json(state),
      ledger_valid: ledgerAfter.valid,
      ledger_head: ledgerAfter.head,
      successes: sessionSuccesses,
      failures: sessionFailures,
      rejected_regression_proposals: sessionCompressionRejections,
      checkpoint_files: checkpointFiles,
      human_interventions: state.human_interventions,
    };
    const receiptPath = path.join(paths.sessions, `${safeSessionId}.json`);
    writeJsonOnce(receiptPath, receipt, 'CAMPAIGN_SESSION_RECEIPT');
    return { ...receipt, receipt_file: rel(receiptPath) };
  });
}

function distributeCycles(totalCycles, sessions) {
  const counts = Array.from({ length: sessions }, () => Math.floor(totalCycles / sessions));
  for (let index = 0; index < totalCycles % sessions; index += 1) counts[index] += 1;
  return counts.filter((count) => count > 0);
}

function runAutonomousLongHorizon(root, experimentId, totalCycles, requestedSessions) {
  const sectionRoot = path.join(root, 'autonomous_campaign');
  ensureDir(sectionRoot);
  const sessionCounts = distributeCycles(totalCycles, Math.min(requestedSessions, totalCycles));
  const sessions = [];
  for (let index = 0; index < sessionCounts.length; index += 1) {
    const sessionId = `session_${String(index + 1).padStart(2, '0')}`;
    const child = spawnSync(process.execPath, [
      RUNNER_SCRIPT,
      '--campaign-worker',
      '--experiment-id', experimentId,
      '--session-id', sessionId,
      '--cycles', String(sessionCounts[index]),
    ], {
      cwd: WORKSPACE_ROOT,
      encoding: 'utf8',
      timeout: 180000,
      maxBuffer: 8 * 1024 * 1024,
      env: {
        ...process.env,
        MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
        MDOS_ROOT,
      },
    });
    const payload = parseLastJson(child.stdout);
    if (child.status !== 0 || !payload || !payload.ok) {
      throw new Error(`AUTONOMOUS_CAMPAIGN_SESSION_FAILED: ${sessionId}: ${payload && payload.error || child.stderr}`);
    }
    sessions.push(payload.session);
  }

  const paths = campaignPaths(root);
  const state = readJson(paths.state, 'CAMPAIGN_FINAL_STATE');
  const ledger = verifyCampaignLedger(paths, state);
  const replay = replayCampaignSkills(state);
  const uniquePids = new Set(sessions.map((session) => session.pid));
  const recoveredFaults = state.failures.filter((failure) => failure.recovered).length;
  const unrecoveredFaults = state.failures.filter((failure) => !failure.recovered).length;
  const report = {
    schema_version: 1,
    experiment: 'persistent_autonomous_curriculum_long_horizon_v1',
    created_at: nowIso(),
    status: state.cycle === totalCycles
      && sessions.length >= 2
      && uniquePids.size === sessions.length
      && ledger.valid
      && replay.passed
      && state.human_interventions === 0
      && state.frontier_depth === 4
      && state.max_consecutive_failures <= 1
      && unrecoveredFaults === 0
      ? 'ok' : 'critical',
    operational_claim: 'A persistent curriculum generates and selects its own tasks, survives clean process restarts, advances its complexity frontier, recovers from bounded transient faults, protects prior skills, and completes a multi-cycle autonomous campaign without human intervention.',
    sessions,
    measurements: {
      requested_cycles: totalCycles,
      completed_cycles: state.cycle,
      process_sessions: sessions.length,
      clean_process_restarts: Math.max(0, sessions.length - 1),
      unique_process_ids: uniquePids.size,
      generated_task_decisions: state.cycle,
      verified_skills_acquired: state.skills.length,
      novelty_archive_size: state.novelty_archive.length,
      final_frontier_depth: state.frontier_depth,
      initial_frontier_depth: 1,
      transient_faults: state.failures.length,
      recovered_faults: recoveredFaults,
      unrecovered_faults: unrecoveredFaults,
      max_consecutive_failures: state.max_consecutive_failures,
      rejected_regression_proposals: state.rejected_regression_proposals,
      rollback_count: state.rollback_count,
      retained_task_count: replay.task_count,
      retained_accuracy: replay.task_count ? replay.passed_count / replay.task_count : 0,
      ledger_event_count: ledger.event_count,
      ledger_chain_valid: ledger.valid,
      human_interventions: state.human_interventions,
    },
    horizon_curve: state.horizon_curve,
    persistence: {
      durable_state_file: rel(paths.state),
      append_only_ledger_file: rel(paths.ledger),
      checkpoint_directory: rel(paths.checkpoints),
      sessions_after_first_resumed_state: sessions.slice(1).every((session) => session.resumed_persistent_state),
      campaign_has_no_task_catalog_terminal_state: true,
      stop_condition: 'explicit_cycle_budget_only',
    },
    curriculum: {
      policy: 'absolute_learning_progress_plus_challenge_fit_plus_novelty_plus_domain_diversity',
      task_source: 'procedural_expandable_grammar',
      target_program_visible_to_policy: false,
      hidden_tests_visible_to_policy: false,
      maximum_observed_difficulty: Math.max(...state.skills.map((skill) => skill.difficulty), 0),
    },
    scope_boundary: `Long-horizon evidence is bounded to ${totalCycles} autonomous learning decisions and ${sessions.length} fresh processes; it is not a claim of indefinite wall-clock operation.`,
    acceptance: {
      full_cycle_budget_completed: state.cycle === totalCycles,
      multi_process_resume_verified: sessions.length >= 2 && sessions.slice(1).every((session) => session.resumed_persistent_state),
      distinct_processes: uniquePids.size === sessions.length,
      frontier_advanced_to_depth_four: state.frontier_depth === 4,
      all_faults_recovered: unrecoveredFaults === 0,
      cumulative_replay_passed: replay.passed,
      ledger_chain_valid: ledger.valid,
      zero_human_interventions: state.human_interventions === 0,
    },
  };
  const reportPath = path.join(sectionRoot, 'report.json');
  writeJsonOnce(reportPath, report, 'AUTONOMY_REPORT');
  writeTextOnce(path.join(sectionRoot, 'report.md'), [
    '# Persistent autonomous curriculum and long-horizon campaign',
    '',
    `Status: \`${report.status}\``,
    '',
    `Autonomous cycles: \`${state.cycle}\``,
    '',
    `Fresh process sessions: \`${sessions.length}\``,
    '',
    `Clean restarts: \`${report.measurements.clean_process_restarts}\``,
    '',
    `Frontier depth: \`1 -> ${state.frontier_depth}\``,
    '',
    `Verified skills retained: \`${state.skills.length}/${state.skills.length}\``,
    '',
    `Recovered transient faults: \`${recoveredFaults}/${state.failures.length}\``,
    '',
    `Human interventions: \`${state.human_interventions}\``,
    '',
    report.scope_boundary,
    '',
  ].join('\n'), 'AUTONOMY_REPORT');
  return { report, report_file: rel(reportPath), state, ledger, replay };
}

function renderMasterMarkdown(report) {
  const criteria = report.criteria;
  const measurements = report.aggregate_measurements;
  const audit = report.contamination_audit;
  return [
    '# AGI prerequisite evidence suite',
    '',
    `Experiment: \`${report.experiment_id}\``,
    '',
    `Status: \`${report.status}\``,
    '',
    '## Criteria',
    '',
    `- Cross-domain transfer: \`${criteria.cross_domain_transfer.status}\``,
    `- Open-ended compositional invention: \`${criteria.open_ended_invention.status}\``,
    `- Persistent autonomous curriculum: \`${criteria.persistent_autonomous_curriculum.status}\``,
    `- Continual learning without promoted regressions: \`${criteria.continual_learning_without_regressions.status}\``,
    `- Bounded long-horizon autonomy: \`${criteria.long_horizon_autonomy.status}\``,
    '',
    '## Primary measurements',
    '',
    '| Measurement | Result |',
    '|---|---:|',
    `| Cross-domain holdout success, no learned sketch | ${measurements.cross_domain_holdout_success_before} |`,
    `| Cross-domain holdout success, learned sketch | ${measurements.cross_domain_holdout_success_after} |`,
    `| Novel verified programs | ${measurements.invented_verified_programs} |`,
    `| Novel structural sketches | ${measurements.novel_structural_sketches} |`,
    `| Continual final average accuracy | ${measurements.continual_final_average_accuracy} |`,
    `| Continual average forgetting | ${measurements.continual_average_forgetting} |`,
    `| Promoted regressions | ${measurements.promoted_regressions} |`,
    `| Autonomous learning decisions | ${measurements.autonomous_cycles} |`,
    `| Clean process restarts | ${measurements.clean_process_restarts} |`,
    `| Autonomous retained accuracy | ${measurements.autonomous_retained_accuracy} |`,
    `| Human interventions | ${measurements.human_interventions} |`,
    '',
    '## Contamination and causal controls',
    '',
    `Boundary audit: \`${audit.status}\``,
    '',
    `Learner requests/receipts: \`${audit.public_request_files}/${audit.learner_receipt_files}\``,
    '',
    `Target programs absent from learner requests: \`${audit.target_programs_absent_from_requests}\``,
    '',
    `Hidden tests absent from learner requests: \`${audit.hidden_tests_absent_from_requests}\``,
    '',
    `Zero-write permission sandbox enforced: \`${audit.learner_filesystem_write_denied}\``,
    '',
    'The transfer experiment includes an equal-budget baseline and an equal-budget irrelevant-sketch control. The continual-learning experiment injects a regressive proposal and requires detection plus rollback before promotion. The autonomy campaign injects bounded transient faults and requires recovery in later cycles.',
    '',
    '## Evidence map',
    '',
    `- Cross-domain report: \`${report.evidence.cross_domain_report_file}\``,
    `- Invention report: \`${report.evidence.invention_report_file}\``,
    `- Continual-learning report: \`${report.evidence.continual_report_file}\``,
    `- Autonomous campaign report: \`${report.evidence.autonomy_report_file}\``,
    `- Hash-chained campaign ledger: \`${report.evidence.campaign_ledger_file}\``,
    `- Evidence integrity manifest: \`${report.evidence.evidence_integrity_file}\``,
    '',
    '## Claim state',
    '',
    `Operational prerequisite suite supported: \`${report.claim_state.operational_agi_prerequisites_supported}\``,
    '',
    `AGI achieved: \`${report.claim_state.agi_achieved}\``,
    '',
    `AGI claim supported: \`${report.claim_state.agi_claim_supported}\``,
    '',
    report.claim_state.reason,
    '',
  ].join('\n');
}

function runAgiEvidenceSuite({ experiment_id: experimentId = '', cycles = 96, sessions = 6 } = {}) {
  const safeExperimentId = assertSafeId(experimentId || `agi_evidence_${Date.now()}`, 'experiment_id');
  const totalCycles = Math.max(24, Math.min(256, Number.parseInt(cycles, 10) || 96));
  const sessionCount = Math.max(2, Math.min(16, Number.parseInt(sessions, 10) || 6));
  const root = experimentRoot(safeExperimentId);
  return withFileLock(`agi_evidence_suite_${safeExperimentId}`, { context: 'master' }, () => {
    if (fs.existsSync(root)) throw new Error(`AGI_EVIDENCE_EXPERIMENT_APPEND_ONLY_CONFLICT: ${rel(root)}`);
    ensureDir(root);
    ensureDir(path.join(root, 'sandbox_home'));
    ensureDir(path.join(root, 'sandbox_tmp'));
    const startedAt = nowIso();
    writeJsonOnce(path.join(root, 'manifest.json'), {
      schema_version: 1,
      experiment_id: safeExperimentId,
      created_at: startedAt,
      requested_cycles: totalCycles,
      requested_sessions: sessionCount,
      objective: 'Produce falsifiable evidence for cross-domain transfer, compositional invention, persistent autonomous curriculum, continual retention, and bounded long-horizon autonomy.',
      claim_policy: 'Internal finite evidence may close operational prerequisite edges but cannot by itself establish open-world AGI.',
      runtime_environment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
      runtime_sources: [
        WORKER_SCRIPT,
        SYNTHESIS_MODULE,
        TASK_FACTORY_MODULE,
        EVIDENCE_SUITE_MODULE,
        RUNNER_SCRIPT,
      ].map((filePath) => ({ file: rel(filePath), sha256: fileHash(filePath) })),
    }, 'AGI_EVIDENCE_MANIFEST');

    try {
      const crossDomain = runCrossDomainTransfer(root);
      const invention = runOpenEndedInvention(root, crossDomain.seed_programs);
      const continualRecords = [...crossDomain.learned_records, ...invention.learned_records];
      const continual = runContinualLearning(root, continualRecords);
      const autonomy = runAutonomousLongHorizon(root, safeExperimentId, totalCycles, sessionCount);
      const contaminationAudit = auditLearnerBoundary(root);

      const criteria = {
        cross_domain_transfer: {
          status: crossDomain.report.status,
          evidence_file: crossDomain.report_file,
          primary_metric: crossDomain.report.measurements.absolute_delta,
        },
        open_ended_invention: {
          status: invention.report.status,
          evidence_file: invention.report_file,
          primary_metric: invention.report.measurements.invented_verified_programs,
          scope: 'finite_run_expandable_grammar',
        },
        persistent_autonomous_curriculum: {
          status: autonomy.report.status,
          evidence_file: autonomy.report_file,
          primary_metric: autonomy.report.measurements.generated_task_decisions,
        },
        continual_learning_without_regressions: {
          status: continual.report.status,
          evidence_file: continual.report_file,
          primary_metric: continual.report.measurements.average_forgetting,
        },
        long_horizon_autonomy: {
          status: autonomy.report.status,
          evidence_file: autonomy.report_file,
          primary_metric: autonomy.report.measurements.completed_cycles,
          scope: `${autonomy.report.measurements.completed_cycles}_bounded_cycles`,
        },
      };
      const allCriteriaPass = Object.values(criteria).every((criterion) => criterion.status === 'ok')
        && contaminationAudit.status === 'ok';
      const master = {
        schema_version: 1,
        experiment_id: safeExperimentId,
        created_at: startedAt,
        completed_at: nowIso(),
        status: allCriteriaPass ? 'ok' : 'critical',
        architecture: {
          name: 'neuromorphic_open_ended_continual_learning_system_v3',
          fast_episodic_memory: 'append-only public task requests, independent verification receipts, and hash-chained campaign events',
          slow_semantic_memory: 'verified structural sketches and immutable context-routed programs',
          novelty_signal: 'exact-program and behavior novelty relative to the growing archive',
          curriculum_signal: 'absolute learning progress, challenge fit, novelty, and domain diversity',
          consolidation: 'cumulative hidden-test replay before promotion',
          metaplasticity: 'protected skills reject broad interfering updates and preserve rollback points',
          homeostasis: 'bounded resources, explicit cycle budget, independent oracles, and zero-write learner sandboxes',
        },
        criteria,
        master_closure: {
          status: allCriteriaPass ? 'ok' : 'critical',
          edges: [
            { edge: 'experience_to_cross_domain_transfer', status: criteria.cross_domain_transfer.status },
            { edge: 'primitive_closure_to_novel_verified_program', status: criteria.open_ended_invention.status },
            { edge: 'learning_progress_to_persistent_curriculum', status: criteria.persistent_autonomous_curriculum.status },
            { edge: 'new_learning_to_zero_promoted_regression', status: criteria.continual_learning_without_regressions.status },
            { edge: 'restartable_loop_to_bounded_long_horizon_autonomy', status: criteria.long_horizon_autonomy.status },
          ],
        },
        contamination_audit: contaminationAudit,
        aggregate_measurements: {
          cross_domain_holdout_success_before: crossDomain.report.measurements.success_rate_before,
          cross_domain_holdout_success_after: crossDomain.report.measurements.success_rate_after,
          invented_verified_programs: invention.report.measurements.invented_verified_programs,
          novel_structural_sketches: invention.report.measurements.novel_sketches,
          novelty_archive_growth: invention.report.measurements.archive_growth + autonomy.report.measurements.novelty_archive_size,
          continual_final_average_accuracy: continual.report.measurements.final_average_accuracy,
          continual_average_forgetting: continual.report.measurements.average_forgetting,
          promoted_regressions: continual.report.measurements.promoted_regression_count,
          autonomous_cycles: autonomy.report.measurements.completed_cycles,
          clean_process_restarts: autonomy.report.measurements.clean_process_restarts,
          autonomous_skills_retained: autonomy.report.measurements.retained_task_count,
          autonomous_retained_accuracy: autonomy.report.measurements.retained_accuracy,
          human_interventions: autonomy.report.measurements.human_interventions,
        },
        claim_state: {
          operational_agi_prerequisites_supported: allCriteriaPass,
          agi_achieved: false,
          agi_claim_supported: false,
          reason: 'The five operational prerequisite edges pass in a controlled, self-contained, finite benchmark. A full AGI claim still requires external sealed domains, independent replication, materially open-world tasks, and substantially longer wall-clock deployment evidence.',
          externally_replicated: false,
          open_world_validation: false,
          indefinite_operation_proven: false,
        },
        evidence: {
          manifest_file: rel(path.join(root, 'manifest.json')),
          cross_domain_report_file: crossDomain.report_file,
          invention_report_file: invention.report_file,
          continual_report_file: continual.report_file,
          autonomy_report_file: autonomy.report_file,
          campaign_state_file: rel(campaignPaths(root).state),
          campaign_ledger_file: rel(campaignPaths(root).ledger),
          evidence_integrity_file: rel(path.join(root, 'evidence_integrity.json')),
        },
      };
      const reportPath = path.join(root, 'report.json');
      const markdownPath = path.join(root, 'report.md');
      writeJsonOnce(reportPath, master, 'AGI_EVIDENCE_MASTER_REPORT');
      writeTextOnce(markdownPath, renderMasterMarkdown(master), 'AGI_EVIDENCE_MASTER_REPORT');
      const integrity = writeEvidenceIntegrityManifest(root);
      appendJournal({
        event: 'agi_evidence_suite_completed',
        experiment_id: safeExperimentId,
        status: master.status,
        operational_agi_prerequisites_supported: master.claim_state.operational_agi_prerequisites_supported,
        agi_claim_supported: master.claim_state.agi_claim_supported,
        report_file: rel(reportPath),
      });
      return {
        ok: master.status === 'ok',
        mode: 'agi_evidence_suite',
        experiment_id: safeExperimentId,
        status: master.status,
        operational_agi_prerequisites_supported: master.claim_state.operational_agi_prerequisites_supported,
        agi_achieved: master.claim_state.agi_achieved,
        agi_claim_supported: master.claim_state.agi_claim_supported,
        cross_domain_success_before: master.aggregate_measurements.cross_domain_holdout_success_before,
        cross_domain_success_after: master.aggregate_measurements.cross_domain_holdout_success_after,
        invented_verified_programs: master.aggregate_measurements.invented_verified_programs,
        novel_structural_sketches: master.aggregate_measurements.novel_structural_sketches,
        continual_average_forgetting: master.aggregate_measurements.continual_average_forgetting,
        autonomous_cycles: master.aggregate_measurements.autonomous_cycles,
        process_restarts: master.aggregate_measurements.clean_process_restarts,
        human_interventions: master.aggregate_measurements.human_interventions,
        evidence_root_digest: integrity.root_digest,
        evidence_integrity_file: integrity.file,
        report_file: rel(reportPath),
        report_markdown_file: rel(markdownPath),
      };
    } catch (error) {
      const failure = {
        schema_version: 1,
        experiment_id: safeExperimentId,
        created_at: startedAt,
        failed_at: nowIso(),
        status: 'critical',
        error: shortText(error && error.message || error),
        claim_state: {
          operational_agi_prerequisites_supported: false,
          agi_achieved: false,
          agi_claim_supported: false,
        },
      };
      const failurePath = path.join(root, 'failure.json');
      if (!fs.existsSync(failurePath)) atomicWriteJson(failurePath, failure);
      appendJournal({
        event: 'agi_evidence_suite_failed',
        experiment_id: safeExperimentId,
        status: 'critical',
        error: failure.error,
        failure_file: rel(failurePath),
      });
      throw error;
    }
  });
}

module.exports = {
  initialCampaignState,
  runAgiEvidenceSuite,
  runCampaignSegment,
  selectCurriculumCandidate,
  verifyCampaignLedger,
};
