#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  assertSafeId,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('../../os/lib/fs_runtime');
const { appendJournal } = require('../../os/lib/journal');
const { validatePlanGraph } = require('./plan_graph');

const SOURCE_ROOT = path.join(MDOS_ROOT, 'benchmarks', 'software_repair');
const CASES_ROOT = path.join(SOURCE_ROOT, 'cases');
const FIXTURES_ROOT = path.join(SOURCE_ROOT, 'fixtures');
const ORACLES_ROOT = path.join(SOURCE_ROOT, 'oracles');
const SOURCE_CANDIDATE_SETS_ROOT = path.join(SOURCE_ROOT, 'candidate_sets');
const OPS_BENCHMARK_ROOT = path.join(MDOS_ROOT, 'ops', 'benchmarks', 'software_repair');
const OPS_CANDIDATE_SETS_ROOT = path.join(OPS_BENCHMARK_ROOT, 'candidate_sets');
const RUNS_ROOT = path.join(OPS_BENCHMARK_ROOT, 'runs');
const SANDBOX_ROOT = path.join(OPS_BENCHMARK_ROOT, '.sandbox');

const CONFIGURATIONS = Object.freeze({
  baseline_a_single_attempt: Object.freeze({
    configuration_id: 'baseline_a_single_attempt',
    retrieval: false,
    episodic_memory: false,
    skills: false,
    candidate_skills: false,
    candidate_limit: 1,
  }),
  baseline_b_retrieval: Object.freeze({
    configuration_id: 'baseline_b_retrieval',
    retrieval: true,
    episodic_memory: false,
    skills: false,
    candidate_skills: false,
    candidate_limit: 1,
  }),
  mdos_learning_exploration: Object.freeze({
    configuration_id: 'mdos_learning_exploration',
    retrieval: true,
    episodic_memory: false,
    skills: false,
    candidate_skills: false,
    candidate_limit: 5,
  }),
  mdos_neuromorphic_skill: Object.freeze({
    configuration_id: 'mdos_neuromorphic_skill',
    retrieval: true,
    episodic_memory: false,
    skills: false,
    candidate_skills: true,
    candidate_limit: 1,
  }),
  mdos_verified_runtime: Object.freeze({
    configuration_id: 'mdos_verified_runtime',
    retrieval: true,
    episodic_memory: true,
    skills: true,
    candidate_skills: false,
    candidate_limit: 20,
  }),
});

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJson(filePath, label) {
  let payload;
  try {
    payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${rel(filePath)}: ${error.message}`);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(`${label}_MUST_BE_OBJECT: ${rel(filePath)}`);
  }
  return payload;
}

function isInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertRegularFile(filePath, label) {
  const resolved = assertInsideWorkspace(filePath);
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink()) throw new Error(`${label}_SYMLINK_FORBIDDEN: ${rel(resolved)}`);
  if (!stats.isFile()) throw new Error(`${label}_NOT_FILE: ${rel(resolved)}`);
  return resolved;
}

function resolveControlledPath(relativePath, allowedRoots, label, expectedType = 'file') {
  const text = String(relativePath || '').replace(/\\/g, '/');
  if (!text.startsWith('md-os/') || path.isAbsolute(text) || text.split('/').includes('..')) {
    throw new Error(`${label}_PATH_INVALID: ${text}`);
  }
  const resolved = assertInsideWorkspace(path.join(WORKSPACE_ROOT, text));
  if (!allowedRoots.some((root) => isInside(root, resolved))) {
    throw new Error(`${label}_OUTSIDE_CONTROLLED_ROOT: ${text}`);
  }
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink()) throw new Error(`${label}_SYMLINK_FORBIDDEN: ${text}`);
  if (expectedType === 'file' && !stats.isFile()) throw new Error(`${label}_NOT_FILE: ${text}`);
  if (expectedType === 'directory' && !stats.isDirectory()) throw new Error(`${label}_NOT_DIRECTORY: ${text}`);
  return resolved;
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listTreeFiles(rootDir) {
  const files = [];
  const visit = (current) => {
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (entry.name === '.git') continue;
      const fullPath = path.join(current, entry.name);
      const stats = fs.lstatSync(fullPath);
      if (stats.isSymbolicLink()) throw new Error(`BENCHMARK_FIXTURE_SYMLINK_FORBIDDEN: ${rel(fullPath)}`);
      if (stats.isDirectory()) visit(fullPath);
      else if (stats.isFile()) files.push(fullPath);
      else throw new Error(`BENCHMARK_FIXTURE_UNSUPPORTED_ENTRY: ${rel(fullPath)}`);
    }
  };
  visit(rootDir);
  return files.sort();
}

function sourceTreeManifest(rootDir) {
  return listTreeFiles(rootDir).map((filePath) => ({
    path: path.relative(rootDir, filePath).replace(/\\/g, '/'),
    sha256: fileSha256(filePath),
    size_bytes: fs.statSync(filePath).size,
  }));
}

function sourceTreeHash(rootDir) {
  return sha256Json(sourceTreeManifest(rootDir));
}

function copyFixture(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });
  for (const filePath of listTreeFiles(sourceDir)) {
    const relative = path.relative(sourceDir, filePath);
    const destination = path.join(targetDir, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(filePath, destination);
    fs.chmodSync(destination, fs.statSync(filePath).mode & 0o777);
  }
}

function uniqueIds(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = assertSafeId(item && item[key], key);
    if (seen.has(value)) throw new Error(`${label}_DUPLICATE_ID: ${value}`);
    seen.add(value);
  }
}

function validateCommand(command, kind, allowedExecutables) {
  if (!command || typeof command !== 'object' || Array.isArray(command)) {
    throw new Error(`BENCHMARK_${kind.toUpperCase()}_COMMAND_INVALID`);
  }
  assertSafeId(command.command_id, 'command_id');
  if (!Array.isArray(command.argv) || command.argv.length < 2 || command.argv.some((item) => !shortText(item))) {
    throw new Error(`BENCHMARK_COMMAND_ARGV_INVALID: ${command.command_id}`);
  }
  const executable = command.argv[0];
  if (!allowedExecutables.includes(executable) || executable !== 'node') {
    throw new Error(`BENCHMARK_EXECUTABLE_NOT_ALLOWED: ${executable}`);
  }
  const script = String(command.argv[1]).replace(/\\/g, '/');
  if (script.startsWith('-') || path.isAbsolute(script) || script.split('/').includes('..') || !script.endsWith('.js')) {
    throw new Error(`BENCHMARK_SCRIPT_PATH_INVALID: ${script}`);
  }
  if (kind === 'oracle') {
    resolveControlledPath(script, [ORACLES_ROOT], 'BENCHMARK_ORACLE', 'file');
    if (command.cwd !== 'workspace' || command.independent !== true || !command.argv.includes('{candidate_root}')) {
      throw new Error(`BENCHMARK_ORACLE_CONTRACT_INVALID: ${command.command_id}`);
    }
  } else if (command.cwd !== 'candidate') {
    throw new Error(`BENCHMARK_CANDIDATE_COMMAND_CWD_INVALID: ${command.command_id}`);
  }
  if (!Number.isInteger(command.expected_before_exit_status) || !Number.isInteger(command.expected_after_exit_status)) {
    throw new Error(`BENCHMARK_COMMAND_EXPECTATION_INVALID: ${command.command_id}`);
  }
  return command;
}

function validateBenchmarkCase(payload) {
  if (payload.schema_version !== 1 || payload.domain !== 'software_repair') {
    throw new Error('BENCHMARK_CASE_SCHEMA_UNSUPPORTED');
  }
  assertSafeId(payload.benchmark_case_id, 'benchmark_case_id');
  if (!String(payload.benchmark_case_id).startsWith('software_repair_')) throw new Error('BENCHMARK_CASE_ID_PREFIX_INVALID');
  if (!['development', 'validation', 'holdout'].includes(payload.split)) throw new Error('BENCHMARK_CASE_SPLIT_INVALID');
  if (!payload.issue || !shortText(payload.issue.goal) || !Array.isArray(payload.issue.acceptance_claims) || !payload.issue.acceptance_claims.length) {
    throw new Error('BENCHMARK_CASE_ISSUE_INVALID');
  }
  const fixtureDir = resolveControlledPath(payload.repository && payload.repository.fixture_path, [FIXTURES_ROOT], 'BENCHMARK_FIXTURE', 'directory');
  if (!/^[a-f0-9]{64}$/.test(String(payload.repository.source_tree_sha256 || ''))) throw new Error('BENCHMARK_SOURCE_HASH_INVALID');
  if (!/^[a-f0-9]{40}$/.test(String(payload.repository.expected_base_commit || ''))) throw new Error('BENCHMARK_BASE_COMMIT_INVALID');
  const observedTreeHash = sourceTreeHash(fixtureDir);
  if (observedTreeHash !== payload.repository.source_tree_sha256) {
    throw new Error(`BENCHMARK_SOURCE_HASH_MISMATCH: expected ${payload.repository.source_tree_sha256}, observed ${observedTreeHash}`);
  }
  const policy = payload.execution_policy || {};
  if (policy.isolation !== 'git_worktree_process' || policy.network !== 'disabled_by_contract' || policy.third_party_repositories !== 'not_supported') {
    throw new Error('BENCHMARK_EXECUTION_POLICY_INVALID');
  }
  if (!Array.isArray(policy.allowed_executables) || !policy.allowed_executables.length) throw new Error('BENCHMARK_EXECUTABLE_POLICY_EMPTY');
  const commands = [payload.reproduction, ...(payload.targeted_tests || []), ...(payload.regression_tests || [])];
  if (!(payload.targeted_tests || []).length || !(payload.regression_tests || []).length || !(payload.oracle_tests || []).length) {
    throw new Error('BENCHMARK_TEST_LAYERS_REQUIRED');
  }
  commands.forEach((command) => validateCommand(command, 'candidate', policy.allowed_executables));
  payload.oracle_tests.forEach((command) => validateCommand(command, 'oracle', policy.allowed_executables));
  uniqueIds([...commands, ...payload.oracle_tests], 'command_id', 'BENCHMARK_COMMAND');
  const diffPolicy = payload.diff_policy || {};
  if (!Array.isArray(diffPolicy.allowed_paths) || !diffPolicy.allowed_paths.length || !Array.isArray(diffPolicy.forbidden_paths)) {
    throw new Error('BENCHMARK_DIFF_POLICY_INVALID');
  }
  if (!Number.isInteger(diffPolicy.max_files_changed) || diffPolicy.max_files_changed < 1 || !Number.isInteger(diffPolicy.max_diff_bytes) || diffPolicy.max_diff_bytes < 1 || diffPolicy.require_non_empty_diff !== true) {
    throw new Error('BENCHMARK_DIFF_BUDGET_INVALID');
  }
  if (!payload.resource_budget || !Number.isInteger(payload.resource_budget.max_candidates) || !Number.isInteger(payload.resource_budget.command_timeout_ms)) {
    throw new Error('BENCHMARK_RESOURCE_BUDGET_INVALID');
  }
  const groundTruth = payload.ground_truth || {};
  if (groundTruth.owner !== 'independent_benchmark_verifier' || groundTruth.oracle_access !== 'verifier_only' || !Array.isArray(groundTruth.specification_validity_checks) || groundTruth.specification_validity_checks.length < 2) {
    throw new Error('BENCHMARK_GROUND_TRUTH_INVALID');
  }
  if (payload.split === 'holdout' && groundTruth.candidate_disclosure !== 'withheld_until_verification') {
    throw new Error('BENCHMARK_HOLDOUT_DISCLOSURE_INVALID');
  }
  return { payload, fixtureDir, observedTreeHash };
}

function validateCandidateSet(payload, benchmarkCase, configuration = null) {
  if (![1, 2].includes(payload.schema_version)) throw new Error('BENCHMARK_CANDIDATE_SET_SCHEMA_UNSUPPORTED');
  assertSafeId(payload.candidate_set_id, 'candidate_set_id');
  if (payload.benchmark_case_id !== benchmarkCase.benchmark_case_id) throw new Error('BENCHMARK_CANDIDATE_SET_CASE_MISMATCH');
  if (!['fixture', 'model', 'planner', 'skill', 'human'].includes(payload.created_by)) throw new Error('BENCHMARK_CANDIDATE_SET_CREATOR_INVALID');
  if (payload.schema_version === 1 && payload.created_by !== 'fixture') {
    throw new Error('BENCHMARK_EMPIRICAL_PROVIDER_PROVENANCE_REQUIRED');
  }
  if (typeof payload.case_ground_truth_disclosed !== 'boolean') throw new Error('BENCHMARK_CANDIDATE_DISCLOSURE_STATE_MISSING');
  if (benchmarkCase.split === 'holdout' && payload.case_ground_truth_disclosed) throw new Error('BENCHMARK_HOLDOUT_CONTAMINATED');
  if (!Array.isArray(payload.candidates) || !payload.candidates.length) throw new Error('BENCHMARK_CANDIDATES_REQUIRED');
  uniqueIds(payload.candidates, 'candidate_id', 'BENCHMARK_CANDIDATE');
  let providerReceipt = null;
  let providerRequest = null;
  if (payload.schema_version === 2) {
    const provider = payload.provider || {};
    assertSafeId(provider.provider_id, 'provider_id');
    assertSafeId(provider.provider_run_id, 'provider_run_id');
    if (!configuration || provider.configuration_id !== configuration.configuration_id) {
      throw new Error('BENCHMARK_PROVIDER_CONFIGURATION_MISMATCH');
    }
    if (provider.configuration_fidelity_passed !== true || provider.strategy_diversity_passed !== true) {
      throw new Error('BENCHMARK_PROVIDER_GATE_NOT_PASSED');
    }
    const receiptPath = resolveControlledPath(provider.provider_receipt_file, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PROVIDER_RECEIPT', 'file');
    if (fileSha256(receiptPath) !== provider.provider_receipt_sha256) {
      throw new Error('BENCHMARK_PROVIDER_RECEIPT_HASH_MISMATCH');
    }
    providerReceipt = readJson(receiptPath, 'BENCHMARK_PROVIDER_RECEIPT');
    if (providerReceipt.status !== 'completed'
        || providerReceipt.provider_id !== provider.provider_id
        || providerReceipt.provider_run_id !== provider.provider_run_id
        || providerReceipt.benchmark_case_id !== benchmarkCase.benchmark_case_id
        || providerReceipt.configuration_id !== configuration.configuration_id
        || !providerReceipt.configuration_fidelity || providerReceipt.configuration_fidelity.passed !== true
        || !providerReceipt.strategy_diversity || providerReceipt.strategy_diversity.passed !== true) {
      throw new Error('BENCHMARK_PROVIDER_RECEIPT_INVALID');
    }
    const requestPath = resolveControlledPath(providerReceipt.artifacts && providerReceipt.artifacts.provider_request_file, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PROVIDER_REQUEST', 'file');
    const resultPath = resolveControlledPath(providerReceipt.artifacts && providerReceipt.artifacts.provider_result_file, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PROVIDER_RESULT', 'file');
    providerRequest = readJson(requestPath, 'BENCHMARK_PROVIDER_REQUEST');
    const providerResult = readJson(resultPath, 'BENCHMARK_PROVIDER_RESULT');
    if (sha256Json(providerRequest) !== providerReceipt.request_hash || sha256Json(providerResult) !== providerReceipt.result_hash) {
      throw new Error('BENCHMARK_PROVIDER_ARTIFACT_HASH_MISMATCH');
    }
    if (JSON.stringify(provider.empirical_eligibility) !== JSON.stringify(providerReceipt.empirical_eligibility)) {
      throw new Error('BENCHMARK_PROVIDER_EMPIRICAL_ELIGIBILITY_MISMATCH');
    }
    if (providerReceipt.provider_kind === 'controlled_fixture' && provider.empirical_eligibility.eligible === true) {
      throw new Error('BENCHMARK_CONTROLLED_FIXTURE_EMPIRICAL_CLAIM_FORBIDDEN');
    }
  }
  for (const candidate of payload.candidates) {
    if (!shortText(candidate.strategy_class) || !['fixture', 'model', 'planner', 'skill', 'human'].includes(candidate.origin)) {
      throw new Error(`BENCHMARK_CANDIDATE_METADATA_INVALID: ${candidate.candidate_id}`);
    }
    const patchPath = resolveControlledPath(candidate.patch_path, [path.join(SOURCE_ROOT, 'candidates'), OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PATCH', 'file');
    const observedHash = fileSha256(patchPath);
    if (observedHash !== candidate.patch_sha256) {
      throw new Error(`BENCHMARK_PATCH_HASH_MISMATCH: ${candidate.candidate_id}`);
    }
    const metrics = candidate.proposal_metrics || {};
    if (!Number.isInteger(metrics.human_interventions) || metrics.human_interventions < 0) {
      throw new Error(`BENCHMARK_CANDIDATE_METRICS_INVALID: ${candidate.candidate_id}`);
    }
    if (payload.schema_version === 2) {
      const planPath = resolveControlledPath(candidate.plan_graph_path, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PLAN_GRAPH', 'file');
      const planGraph = readJson(planPath, 'BENCHMARK_PLAN_GRAPH');
      if (sha256Json(planGraph) !== candidate.plan_graph_sha256 || planGraph.plan_graph_id !== candidate.plan_graph_id) {
        throw new Error(`BENCHMARK_PLAN_GRAPH_HASH_MISMATCH: ${candidate.candidate_id}`);
      }
      if (planGraph.strategy_class !== candidate.strategy_class || planGraph.provenance.source !== candidate.origin) {
        throw new Error(`BENCHMARK_PLAN_GRAPH_CANDIDATE_MISMATCH: ${candidate.candidate_id}`);
      }
      validatePlanGraph(planGraph, {
        benchmarkCase,
        configuration,
        providerId: payload.provider.provider_id,
        providerRunId: payload.provider.provider_run_id,
        requestHash: providerReceipt.request_hash,
        request: providerRequest,
      });
    }
  }
  return payload;
}

function runProcess(executable, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(executable, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    timeout: options.timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      HOME: options.home || process.env.HOME,
      TMPDIR: options.tmpDir || process.env.TMPDIR || '/tmp',
      ...options.env,
    },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  return {
    exit_status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    error: result.error ? shortText(result.error.message) : null,
    duration_ms: Date.now() - started,
    stdout,
    stderr,
    output_hash: sha256Text(`${stdout}\n${stderr}`),
  };
}

function git(args, cwd, timeoutMs = 30000, env = {}) {
  return runProcess('git', args, { cwd, timeoutMs, env });
}

function requirePassed(result, label) {
  if (result.exit_status !== 0) {
    throw new Error(`${label}: ${shortText(result.stderr || result.stdout || result.error)}`);
  }
  return result;
}

function commandExpectedExit(command, phase) {
  return phase === 'before' ? command.expected_before_exit_status : command.expected_after_exit_status;
}

function commandResult(command, candidateRoot, phase, timeoutMs, kind) {
  const argvTemplate = command.argv.slice();
  const expandedArgs = argvTemplate.slice(1).map((item) => item === '{candidate_root}' ? candidateRoot : item);
  const cwd = kind === 'oracle' ? WORKSPACE_ROOT : candidateRoot;
  const runtimeEnvDir = path.join(path.dirname(candidateRoot), '.runtime_env', path.basename(candidateRoot));
  const homeDir = path.join(runtimeEnvDir, 'home');
  const tmpDir = path.join(runtimeEnvDir, 'tmp');
  fs.mkdirSync(homeDir, { recursive: true });
  fs.mkdirSync(tmpDir, { recursive: true });
  const result = runProcess(argvTemplate[0], expandedArgs, {
    cwd,
    timeoutMs,
    home: homeDir,
    tmpDir,
    env: {
      MDOS_BENCHMARK_NETWORK: 'disabled_by_contract',
      MDOS_BENCHMARK_CANDIDATE_ROOT: candidateRoot,
    },
  });
  const expectedExitStatus = commandExpectedExit(command, phase);
  return {
    command_id: command.command_id,
    argv: argvTemplate,
    phase,
    verifier_kind: kind === 'oracle' ? 'independent_oracle' : 'candidate_repository_test',
    expected_exit_status: expectedExitStatus,
    exit_status: result.exit_status,
    passed: result.exit_status === expectedExitStatus,
    duration_ms: result.duration_ms,
    output_hash: result.output_hash,
    stdout_excerpt: result.stdout.slice(0, 1000),
    stderr_excerpt: result.stderr.slice(0, 1000),
    signal: result.signal,
    error: result.error,
  };
}

function materializeRepository(benchmarkCase, fixtureDir, sandboxDir) {
  const baseRepo = path.join(sandboxDir, 'base_repository');
  copyFixture(fixtureDir, baseRepo);
  requirePassed(git(['init', '--quiet', '--initial-branch=main'], baseRepo), 'BENCHMARK_GIT_INIT_FAILED');
  requirePassed(git(['config', 'user.name', 'MD-OS Benchmark'], baseRepo), 'BENCHMARK_GIT_CONFIG_FAILED');
  requirePassed(git(['config', 'user.email', 'benchmark@md-os.local'], baseRepo), 'BENCHMARK_GIT_CONFIG_FAILED');
  requirePassed(git(['add', '--all'], baseRepo), 'BENCHMARK_GIT_ADD_FAILED');
  const gitEnv = {
    GIT_AUTHOR_DATE: '2026-05-03T00:00:00Z',
    GIT_COMMITTER_DATE: '2026-05-03T00:00:00Z',
  };
  requirePassed(git(['commit', '--quiet', '-m', `benchmark base ${benchmarkCase.benchmark_case_id}`], baseRepo, 30000, gitEnv), 'BENCHMARK_GIT_COMMIT_FAILED');
  const revision = requirePassed(git(['rev-parse', 'HEAD'], baseRepo), 'BENCHMARK_GIT_REVISION_FAILED').stdout.trim();
  const bundlePath = path.join(sandboxDir, 'base_repository.bundle');
  requirePassed(git(['bundle', 'create', bundlePath, '--all'], baseRepo), 'BENCHMARK_GIT_BUNDLE_FAILED');
  return {
    baseRepo,
    bundlePath,
    revision,
    receipt: {
      fixture_path: benchmarkCase.repository.fixture_path,
      source_tree_sha256: benchmarkCase.repository.source_tree_sha256,
      base_commit: revision,
      base_commit_verified: revision === benchmarkCase.repository.expected_base_commit,
      base_bundle_sha256: fileSha256(bundlePath),
      isolation: 'git_worktree_process',
    },
  };
}

function globMatch(filePath, pattern) {
  const normalized = String(pattern).replace(/\\/g, '/');
  const escaped = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`).test(filePath);
}

function changedFiles(baseRepo, worktreeDir) {
  const status = git(['status', '--porcelain=v1', '--untracked-files=all'], worktreeDir);
  if (status.exit_status !== 0) return { files: [], status_error: shortText(status.stderr) };
  const files = status.stdout.split('\n').filter(Boolean).map((line) => {
    const raw = line.slice(3).trim();
    const arrowIndex = raw.lastIndexOf(' -> ');
    return (arrowIndex >= 0 ? raw.slice(arrowIndex + 4) : raw).replace(/^"|"$/g, '').replace(/\\/g, '/');
  }).sort();
  return { files: Array.from(new Set(files)), status_error: null };
}

function diffReceipt(worktreeDir, policy) {
  const diff = git(['diff', '--binary', '--no-ext-diff', 'HEAD', '--'], worktreeDir);
  const status = changedFiles(null, worktreeDir);
  const diffText = diff.stdout || '';
  const diffBytes = Buffer.byteLength(diffText);
  const forbidden = status.files.filter((file) => policy.forbidden_paths.some((pattern) => globMatch(file, pattern)));
  const outsideAllowed = status.files.filter((file) => !policy.allowed_paths.some((pattern) => globMatch(file, pattern)));
  const findings = [];
  if (diff.exit_status !== 0 || status.status_error) findings.push('diff_read_failed');
  if (policy.require_non_empty_diff && !status.files.length) findings.push('empty_diff');
  if (forbidden.length) findings.push('forbidden_path_changed');
  if (outsideAllowed.length) findings.push('path_outside_allowed_scope');
  if (status.files.length > policy.max_files_changed) findings.push('max_files_changed_exceeded');
  if (diffBytes > policy.max_diff_bytes) findings.push('max_diff_bytes_exceeded');
  return {
    diff_text: diffText,
    receipt: {
      changed: status.files.length > 0,
      changed_files: status.files,
      changed_file_count: status.files.length,
      forbidden_files: forbidden,
      outside_allowed_files: outsideAllowed,
      diff_bytes: diffBytes,
      diff_sha256: sha256Text(diffText),
      policy_passed: findings.length === 0,
      findings,
    },
  };
}

function notRunCommand(command, phase, kind, reason) {
  return {
    command_id: command.command_id,
    argv: command.argv.slice(),
    phase,
    verifier_kind: kind,
    expected_exit_status: commandExpectedExit(command, phase),
    exit_status: null,
    passed: false,
    duration_ms: 0,
    output_hash: sha256Text(''),
    stdout_excerpt: '',
    stderr_excerpt: '',
    signal: null,
    error: reason,
  };
}

function evaluateCandidate({ benchmarkCase, candidate, baseRepo, baseCommit, sandboxDir, timeoutMs }) {
  const started = Date.now();
  const candidateId = assertSafeId(candidate.candidate_id, 'candidate_id');
  const worktreeDir = path.join(sandboxDir, 'worktrees', candidateId);
  fs.mkdirSync(path.dirname(worktreeDir), { recursive: true });
  const add = git(['worktree', 'add', '--quiet', '--detach', worktreeDir, baseCommit], baseRepo);
  const worktreeReceipt = {
    isolation: 'git_worktree_process',
    path: rel(worktreeDir),
    base_commit: baseCommit,
    created: add.exit_status === 0,
    removed: false,
  };
  const patchPath = resolveControlledPath(candidate.patch_path, [path.join(SOURCE_ROOT, 'candidates'), OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PATCH', 'file');
  const observedPatchHash = fileSha256(patchPath);
  let patchReceipt = {
    patch_path: candidate.patch_path,
    expected_sha256: candidate.patch_sha256,
    observed_sha256: observedPatchHash,
    hash_verified: observedPatchHash === candidate.patch_sha256,
    apply_check_exit_status: null,
    apply_check_error: null,
    apply_exit_status: null,
    apply_error: null,
    applied: false,
  };
  let reproductionAfter = notRunCommand(benchmarkCase.reproduction, 'after', 'candidate_repository_test', 'worktree_not_created');
  let targetedResults = benchmarkCase.targeted_tests.map((command) => notRunCommand(command, 'after', 'candidate_repository_test', 'worktree_not_created'));
  let regressionResults = benchmarkCase.regression_tests.map((command) => notRunCommand(command, 'after', 'candidate_repository_test', 'worktree_not_created'));
  let oracleResults = benchmarkCase.oracle_tests.map((command) => notRunCommand(command, 'after', 'independent_oracle', 'worktree_not_created'));
  let diff = { diff_text: '', receipt: { changed: false, changed_files: [], changed_file_count: 0, forbidden_files: [], outside_allowed_files: [], diff_bytes: 0, diff_sha256: sha256Text(''), policy_passed: false, findings: ['worktree_not_created'] } };

  try {
    if (!worktreeReceipt.created) {
      return finalizeCandidate('blocked', ['worktree_creation_failed']);
    }
    const applyCheck = git(['apply', '--check', patchPath], worktreeDir);
    patchReceipt.apply_check_exit_status = applyCheck.exit_status;
    patchReceipt.apply_check_error = shortText(applyCheck.stderr || applyCheck.stdout || applyCheck.error);
    if (applyCheck.exit_status !== 0) return finalizeCandidate('blocked', ['patch_apply_check_failed']);
    const apply = git(['apply', patchPath], worktreeDir);
    patchReceipt.apply_exit_status = apply.exit_status;
    patchReceipt.apply_error = shortText(apply.stderr || apply.stdout || apply.error);
    patchReceipt.applied = apply.exit_status === 0;
    if (!patchReceipt.applied) return finalizeCandidate('blocked', ['patch_apply_failed']);

    reproductionAfter = commandResult(benchmarkCase.reproduction, worktreeDir, 'after', timeoutMs, 'candidate');
    targetedResults = benchmarkCase.targeted_tests.map((command) => commandResult(command, worktreeDir, 'after', timeoutMs, 'candidate'));
    regressionResults = benchmarkCase.regression_tests.map((command) => commandResult(command, worktreeDir, 'after', timeoutMs, 'candidate'));
    oracleResults = benchmarkCase.oracle_tests.map((command) => commandResult(command, worktreeDir, 'after', timeoutMs, 'oracle'));
    diff = diffReceipt(worktreeDir, benchmarkCase.diff_policy);
    const failureReasons = [];
    if (!reproductionAfter.passed) failureReasons.push('defect_not_resolved');
    if (targetedResults.some((item) => !item.passed)) failureReasons.push('targeted_test_failed');
    if (regressionResults.some((item) => !item.passed)) failureReasons.push('regression_test_failed');
    if (oracleResults.some((item) => !item.passed)) failureReasons.push('independent_oracle_failed');
    failureReasons.push(...diff.receipt.findings);
    return finalizeCandidate(failureReasons.length ? 'failed' : 'verified', Array.from(new Set(failureReasons)));
  } finally {
    if (worktreeReceipt.created) {
      const remove = git(['worktree', 'remove', '--force', worktreeDir], baseRepo);
      worktreeReceipt.removed = remove.exit_status === 0 && !fs.existsSync(worktreeDir);
    }
  }

  function finalizeCandidate(verdict, failureReasons) {
    const commandLatency = [reproductionAfter, ...targetedResults, ...regressionResults, ...oracleResults]
      .reduce((sum, item) => sum + item.duration_ms, 0);
    const proposal = candidate.proposal_metrics || {};
    return {
      candidate_id: candidateId,
      strategy_class: shortText(candidate.strategy_class),
      origin: candidate.origin,
      plan_graph_id: candidate.plan_graph_id || null,
      plan_graph_sha256: candidate.plan_graph_sha256 || null,
      initial_confidence: Number.isFinite(candidate.initial_confidence) ? candidate.initial_confidence : null,
      verdict,
      failure_reasons: failureReasons,
      worktree_receipt: worktreeReceipt,
      patch_receipt: patchReceipt,
      reproduction_after: reproductionAfter,
      targeted_results: targetedResults,
      regression_results: regressionResults,
      oracle_results: oracleResults,
      diff_receipt: diff.receipt,
      diff_text: diff.diff_text,
      resource_usage: {
        execution_latency_ms: commandLatency,
        wall_latency_ms: Date.now() - started,
        proposal_latency_ms: Number.isInteger(proposal.latency_ms) ? proposal.latency_ms : null,
        tokens: Number.isInteger(proposal.tokens) ? proposal.tokens : null,
        cost: Number.isFinite(proposal.cost) ? proposal.cost : null,
        human_interventions: proposal.human_interventions,
        command_count: 1 + targetedResults.length + regressionResults.length + oracleResults.length,
      },
    };
  }
}

function comparisonFor(runId, benchmarkCase, configuration, candidateResults) {
  const rows = candidateResults.map((candidate) => ({
    candidate_id: candidate.candidate_id,
    plan_graph_id: candidate.plan_graph_id,
    strategy_class: candidate.strategy_class,
    verdict: candidate.verdict,
    regression_failures: candidate.regression_results.filter((item) => !item.passed).length,
    diff_bytes: candidate.diff_receipt.diff_bytes,
    total_latency_ms: candidate.resource_usage.wall_latency_ms,
    eligible: candidate.verdict === 'verified',
  })).sort((left, right) => {
    if (left.eligible !== right.eligible) return left.eligible ? -1 : 1;
    return left.regression_failures - right.regression_failures
      || left.diff_bytes - right.diff_bytes
      || left.total_latency_ms - right.total_latency_ms
      || left.candidate_id.localeCompare(right.candidate_id);
  }).map((row, index) => ({ rank: index + 1, ...row }));
  const selected = rows.find((row) => row.eligible) || null;
  return {
    schema_version: 1,
    comparison_id: `comparison_${runId.replace(/^benchmark_run_/, '')}`,
    benchmark_run_id: runId,
    benchmark_case_id: benchmarkCase.benchmark_case_id,
    configuration_id: configuration.configuration_id,
    selection_policy: 'verified_then_no_regression_then_diff_size_then_total_latency_then_candidate_id',
    ranking: rows,
    selected_candidate_id: selected ? selected.candidate_id : null,
    no_selection_reason: selected ? null : 'no_candidate_satisfied_all_postconditions',
    metrics: {
      candidate_count: rows.length,
      eligible_count: rows.filter((row) => row.eligible).length,
      regression_failure_count: rows.reduce((sum, row) => sum + row.regression_failures, 0),
    },
  };
}

function aggregateMetrics(candidateResults, split) {
  const verified = candidateResults.filter((item) => item.verdict === 'verified').length;
  const knownTokens = candidateResults.map((item) => item.resource_usage.tokens).filter(Number.isInteger);
  const knownCosts = candidateResults.map((item) => item.resource_usage.cost).filter(Number.isFinite);
  return {
    candidate_count: candidateResults.length,
    verified_candidate_count: verified,
    candidate_verified_success_rate: candidateResults.length ? verified / candidateResults.length : 0,
    verified_success_rate_holdout: split === 'holdout' ? (verified > 0 ? 1 : 0) : null,
    total_latency_ms: candidateResults.reduce((sum, item) => sum + item.resource_usage.wall_latency_ms, 0),
    total_tokens: knownTokens.length === candidateResults.length ? knownTokens.reduce((sum, value) => sum + value, 0) : null,
    total_cost: knownCosts.length === candidateResults.length ? knownCosts.reduce((sum, value) => sum + value, 0) : null,
    human_interventions: candidateResults.reduce((sum, item) => sum + item.resource_usage.human_interventions, 0),
    regression_count: candidateResults.reduce((sum, item) => sum + item.regression_results.filter((result) => !result.passed).length, 0),
  };
}

function empiricalClaimScope(benchmarkCase, candidateSet, configuration) {
  const eligible = candidateSet.schema_version === 2
    && candidateSet.provider
    && candidateSet.provider.empirical_eligibility
    && candidateSet.provider.empirical_eligibility.eligible === true;
  if (!eligible) return 'runner_validation_only';
  if (benchmarkCase.split === 'holdout') return 'holdout_measurement';
  if (configuration.configuration_id.startsWith('baseline_')) return 'baseline_measurement';
  return 'development_measurement';
}

function snapshotProviderEvidence(candidateSet, outputDir) {
  if (candidateSet.schema_version !== 2 || !candidateSet.provider) return null;
  const providerDir = path.join(outputDir, 'provider_evidence');
  fs.mkdirSync(providerDir, { recursive: true });
  const receiptSource = resolveControlledPath(candidateSet.provider.provider_receipt_file, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PROVIDER_RECEIPT', 'file');
  const receipt = readJson(receiptSource, 'BENCHMARK_PROVIDER_RECEIPT');
  const requestedArtifacts = [
    ['provider_request', receipt.artifacts && receipt.artifacts.provider_request_file],
    ['provider_result', receipt.artifacts && receipt.artifacts.provider_result_file],
    ['provider_receipt', candidateSet.provider.provider_receipt_file],
  ];
  const files = [];
  for (const [kind, sourcePath] of requestedArtifacts) {
    const source = resolveControlledPath(sourcePath, [OPS_CANDIDATE_SETS_ROOT], `BENCHMARK_${kind.toUpperCase()}`, 'file');
    const destination = path.join(providerDir, `${kind}_snapshot.json`);
    atomicWriteText(destination, fs.readFileSync(source, 'utf8'));
    files.push({ kind, file: rel(destination), sha256: fileSha256(destination) });
  }
  for (const candidate of candidateSet.candidates) {
    const source = resolveControlledPath(candidate.plan_graph_path, [OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PLAN_GRAPH', 'file');
    const destination = path.join(providerDir, `${candidate.plan_graph_id}.json`);
    atomicWriteText(destination, fs.readFileSync(source, 'utf8'));
    files.push({ kind: 'plan_graph', plan_graph_id: candidate.plan_graph_id, file: rel(destination), sha256: fileSha256(destination) });
  }
  return {
    provider_id: candidateSet.provider.provider_id,
    provider_run_id: candidateSet.provider.provider_run_id,
    configuration_id: candidateSet.provider.configuration_id,
    configuration_fidelity_passed: candidateSet.provider.configuration_fidelity_passed,
    strategy_diversity_passed: candidateSet.provider.strategy_diversity_passed,
    empirical_eligibility: candidateSet.provider.empirical_eligibility,
    files,
  };
}

function renderRunMarkdown(run, comparison) {
  const lines = [
    '# Software Repair Benchmark Run',
    '',
    `Run: \`${run.benchmark_run_id}\``,
    '',
    `Case: \`${run.benchmark_case_id}\``,
    '',
    `Split: \`${run.split}\``,
    '',
    `Configuration: \`${run.configuration.configuration_id}\``,
    '',
    `Claim scope: \`${run.empirical_claim_scope}\``,
    '',
    `Candidate provenance: \`${run.provider_evidence ? `provider:${run.provider_evidence.provider_id}` : 'legacy_candidate_set'}\``,
    '',
    `Plan diversity verified: \`${run.provider_evidence ? run.provider_evidence.strategy_diversity_passed : 'not_available'}\``,
    '',
    `Status: \`${run.status}\``,
    '',
    `Base commit verified: \`${run.repository_receipt.base_commit_verified}\``,
    '',
    `Pre-patch reproduction matched expected failure: \`${run.reproduction_before.passed}\``,
    '',
    '## Candidate comparison',
    '',
    '| Rank | Candidate | Plan | Strategy | Verdict | Regression failures | Diff bytes | Latency ms | Eligible |',
    '|---:|---|---|---|---|---:|---:|---:|---|',
    ...comparison.ranking.map((row) => `| ${row.rank} | ${row.candidate_id} | ${row.plan_graph_id || 'legacy'} | ${row.strategy_class} | ${row.verdict} | ${row.regression_failures} | ${row.diff_bytes} | ${row.total_latency_ms} | ${row.eligible} |`),
    '',
    `Selected candidate: \`${comparison.selected_candidate_id || 'none'}\``,
    '',
    '## Metriche',
    '',
    `- Candidate: \`${run.metrics.candidate_count}\``,
    `- Candidate verificate: \`${run.metrics.verified_candidate_count}\``,
    `- Candidate verified success rate: \`${run.metrics.candidate_verified_success_rate}\``,
    `- Verified success rate holdout: \`${run.metrics.verified_success_rate_holdout === null ? 'not_applicable' : run.metrics.verified_success_rate_holdout}\``,
    `- Regressioni: \`${run.metrics.regression_count}\``,
    `- Token: \`${run.metrics.total_tokens === null ? 'not_measured' : run.metrics.total_tokens}\``,
    `- Costo: \`${run.metrics.total_cost === null ? 'not_measured' : run.metrics.total_cost}\``,
    '',
    '## Limiti del verifier',
    '',
    '- I worktree isolano lo stato Git tra candidate, ma non costituiscono una sandbox di sicurezza del sistema operativo.',
    '- Questa versione accetta soltanto fixture controllate e comandi Node dichiarati; repository terzi non fidati sono fuori contratto.',
    '- Un candidate set di tipo fixture valida il runner, non misura l’intelligenza del sistema.',
    '',
  ];
  return lines.join('\n');
}

function runSoftwareRepairBenchmark(options) {
  const casePath = resolveControlledPath(options.case_path, [CASES_ROOT], 'BENCHMARK_CASE', 'file');
  const candidateSetPath = resolveControlledPath(options.candidate_set_path, [SOURCE_CANDIDATE_SETS_ROOT, OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_CANDIDATE_SET', 'file');
  const casePayload = readJson(casePath, 'BENCHMARK_CASE');
  const candidateSetPayload = readJson(candidateSetPath, 'BENCHMARK_CANDIDATE_SET');
  const validated = validateBenchmarkCase(casePayload);
  const configuration = CONFIGURATIONS[options.configuration_id || 'mdos_verified_runtime'];
  if (!configuration) throw new Error(`BENCHMARK_CONFIGURATION_UNKNOWN: ${options.configuration_id}`);
  const candidateSet = validateCandidateSet(candidateSetPayload, casePayload, configuration);
  const requestedIds = Array.isArray(options.candidate_ids) ? options.candidate_ids.filter(Boolean) : [];
  const selectedCandidates = requestedIds.length
    ? requestedIds.map((id) => {
      const candidate = candidateSet.candidates.find((item) => item.candidate_id === id);
      if (!candidate) throw new Error(`BENCHMARK_CANDIDATE_UNKNOWN: ${id}`);
      return candidate;
    })
    : candidateSet.candidates.slice();
  const maxCandidates = Math.min(configuration.candidate_limit, casePayload.resource_budget.max_candidates);
  if (!selectedCandidates.length || selectedCandidates.length > maxCandidates) {
    throw new Error(`BENCHMARK_CANDIDATE_LIMIT_EXCEEDED: selected ${selectedCandidates.length}, limit ${maxCandidates}`);
  }
  const generatedRunId = `benchmark_run_${nowIso().replace(/[-:.TZ]/g, '_').replace(/_+/g, '_')}_${sha256Json({ case: casePayload.benchmark_case_id, candidates: selectedCandidates.map((item) => item.candidate_id) }).slice(0, 10)}`;
  const runId = assertSafeId(options.run_id || generatedRunId, 'benchmark_run_id');
  if (!runId.startsWith('benchmark_run_')) throw new Error('BENCHMARK_RUN_ID_PREFIX_INVALID');
  const outputDir = path.join(RUNS_ROOT, runId);
  const sandboxDir = path.join(SANDBOX_ROOT, runId);
  if (fs.existsSync(outputDir)) throw new Error(`BENCHMARK_RUN_APPEND_ONLY_CONFLICT: ${runId}`);
  const timeoutMs = casePayload.resource_budget.command_timeout_ms;

  return withFileLock(`software_repair_benchmark__${runId}`, {
    context: `software_repair_benchmark:${runId}`,
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(RUNS_ROOT, { recursive: true });
    fs.mkdirSync(SANDBOX_ROOT, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: false });
    fs.mkdirSync(sandboxDir, { recursive: true });
    const startedAt = nowIso();
    let materialized;
    let worktreesPruned = false;
    let outputCommitted = false;
    try {
      materialized = materializeRepository(casePayload, validated.fixtureDir, sandboxDir);
      if (!materialized.receipt.base_commit_verified) {
        throw new Error(`BENCHMARK_BASE_COMMIT_MISMATCH: expected ${casePayload.repository.expected_base_commit}, observed ${materialized.revision}`);
      }
      const reproductionBefore = commandResult(casePayload.reproduction, materialized.baseRepo, 'before', timeoutMs, 'candidate');
      const targetedBefore = casePayload.targeted_tests.map((command) => commandResult(command, materialized.baseRepo, 'before', timeoutMs, 'candidate'));
      const regressionBefore = casePayload.regression_tests.map((command) => commandResult(command, materialized.baseRepo, 'before', timeoutMs, 'candidate'));
      const oracleBefore = casePayload.oracle_tests.map((command) => commandResult(command, materialized.baseRepo, 'before', timeoutMs, 'oracle'));
      if (![reproductionBefore, ...targetedBefore, ...regressionBefore, ...oracleBefore].every((item) => item.passed)) {
        throw new Error('BENCHMARK_PRECONDITION_FAILED: base defect or ground truth does not match declared expectations');
      }
      const candidateResults = selectedCandidates.map((candidate) => evaluateCandidate({
        benchmarkCase: casePayload,
        candidate,
        baseRepo: materialized.baseRepo,
        baseCommit: materialized.revision,
        sandboxDir,
        timeoutMs,
      }));
      const prune = git(['worktree', 'prune'], materialized.baseRepo);
      worktreesPruned = prune.exit_status === 0;
      const comparison = comparisonFor(runId, casePayload, configuration, candidateResults);
      const comparisonPath = path.join(outputDir, 'candidate_comparison.json');
      const runPath = path.join(outputDir, 'benchmark_run.json');
      const runMarkdownPath = path.join(outputDir, 'benchmark_run.md');
      const caseSnapshotPath = path.join(outputDir, 'benchmark_case_snapshot.json');
      const candidateSetSnapshotPath = path.join(outputDir, 'candidate_set_snapshot.json');
      const baseBundlePath = path.join(outputDir, 'base_repository.bundle');
      atomicWriteJson(caseSnapshotPath, casePayload);
      atomicWriteJson(candidateSetSnapshotPath, candidateSet);
      const providerEvidence = snapshotProviderEvidence(candidateSet, outputDir);
      fs.copyFileSync(materialized.bundlePath, baseBundlePath);
      materialized.receipt.base_bundle_file = rel(baseBundlePath);
      for (let index = 0; index < candidateResults.length; index += 1) {
        const candidate = candidateResults[index];
        const candidateInput = selectedCandidates[index];
        const diffPath = path.join(outputDir, `${candidate.candidate_id}.diff`);
        const submittedPatchPath = path.join(outputDir, `submitted_${candidate.candidate_id}.patch`);
        const sourcePatchPath = resolveControlledPath(candidateInput.patch_path, [path.join(SOURCE_ROOT, 'candidates'), OPS_CANDIDATE_SETS_ROOT], 'BENCHMARK_PATCH', 'file');
        atomicWriteText(diffPath, candidate.diff_text);
        atomicWriteText(submittedPatchPath, fs.readFileSync(sourcePatchPath, 'utf8'));
        delete candidate.diff_text;
        candidate.diff_receipt.diff_file = rel(diffPath);
        candidate.patch_receipt.submitted_patch_file = rel(submittedPatchPath);
      }
      const run = {
        schema_version: 1,
        benchmark_run_id: runId,
        benchmark_case_id: casePayload.benchmark_case_id,
        case_hash: sha256Json(casePayload),
        candidate_set_id: candidateSet.candidate_set_id,
        candidate_set_hash: sha256Json(candidateSet),
        benchmark_case_snapshot_file: rel(caseSnapshotPath),
        candidate_set_snapshot_file: rel(candidateSetSnapshotPath),
        split: casePayload.split,
        configuration: { ...configuration, candidate_limit: maxCandidates },
        started_at: startedAt,
        completed_at: nowIso(),
        status: 'completed',
        empirical_claim_scope: empiricalClaimScope(casePayload, candidateSet, configuration),
        repository_receipt: materialized.receipt,
        specification_validity: {
          goal: casePayload.issue.goal,
          acceptance_claims: casePayload.issue.acceptance_claims,
          ground_truth_owner: casePayload.ground_truth.owner,
          checks: casePayload.ground_truth.specification_validity_checks,
          oracle_is_external_to_candidate_worktrees: true,
          case_ground_truth_disclosed_to_candidate_generator: candidateSet.case_ground_truth_disclosed,
        },
        provider_evidence: providerEvidence,
        reproduction_before: reproductionBefore,
        pre_patch_validation: {
          targeted_results: targetedBefore,
          regression_results: regressionBefore,
          oracle_results: oracleBefore,
        },
        candidate_results: candidateResults,
        metrics: aggregateMetrics(candidateResults, casePayload.split),
        candidate_comparison_file: rel(comparisonPath),
        cleanup: {
          sandbox_removed: false,
          worktrees_pruned: worktreesPruned,
        },
      };
      fs.rmSync(sandboxDir, { recursive: true, force: true });
      run.cleanup.sandbox_removed = !fs.existsSync(sandboxDir);
      atomicWriteJson(comparisonPath, comparison);
      atomicWriteJson(runPath, run);
      atomicWriteText(runMarkdownPath, `${renderRunMarkdown(run, comparison)}\n`);
      appendJournal({
        event: 'software_repair_benchmark_completed',
        benchmark_run_id: runId,
        benchmark_case_id: casePayload.benchmark_case_id,
        configuration_id: configuration.configuration_id,
        empirical_claim_scope: run.empirical_claim_scope,
        candidate_count: run.metrics.candidate_count,
        verified_candidate_count: run.metrics.verified_candidate_count,
        selected_candidate_id: comparison.selected_candidate_id,
        output_file: rel(runPath),
      });
      outputCommitted = true;
      return {
        ok: true,
        mode: 'software_repair_benchmark_run',
        benchmark_run_id: runId,
        benchmark_case_id: casePayload.benchmark_case_id,
        configuration_id: configuration.configuration_id,
        empirical_claim_scope: run.empirical_claim_scope,
        selected_candidate_id: comparison.selected_candidate_id,
        verified_candidate_count: run.metrics.verified_candidate_count,
        candidate_count: run.metrics.candidate_count,
        benchmark_run_file: rel(runPath),
        candidate_comparison_file: rel(comparisonPath),
      };
    } finally {
      if (materialized && fs.existsSync(materialized.baseRepo)) {
        git(['worktree', 'prune'], materialized.baseRepo);
      }
      if (fs.existsSync(sandboxDir)) fs.rmSync(sandboxDir, { recursive: true, force: true });
      if (!outputCommitted && fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
}

module.exports = {
  CONFIGURATIONS,
  comparisonFor,
  sourceTreeHash,
  runSoftwareRepairBenchmark,
  validateBenchmarkCase,
  validateCandidateSet,
};
