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
const {
  CONFIGURATIONS,
  validateBenchmarkCase,
} = require('./benchmark_runner');
const {
  diversityReceipt,
  validatePlanGraph,
} = require('./plan_graph');

const SOURCE_ROOT = path.join(MDOS_ROOT, 'benchmarks', 'software_repair');
const CASES_ROOT = path.join(SOURCE_ROOT, 'cases');
const CANDIDATES_ROOT = path.join(SOURCE_ROOT, 'candidates');
const PROVIDERS_ROOT = path.join(SOURCE_ROOT, 'providers');
const OPS_ROOT = path.join(MDOS_ROOT, 'ops', 'benchmarks', 'software_repair');
const OUTPUT_ROOT = path.join(OPS_ROOT, 'candidate_sets');
const SANDBOX_ROOT = path.join(OPS_ROOT, '.sandbox');
const EPISODES_ROOT = path.join(MDOS_ROOT, 'ops', 'episodes');
const SKILL_CANDIDATES_ROOT = path.join(MDOS_ROOT, 'ops', 'skills', 'candidates');
const SKILL_PROMOTED_ROOT = path.join(MDOS_ROOT, 'ops', 'skills', 'promoted');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function isInside(parent, target) {
  const relative = path.relative(path.resolve(parent), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function readJson(filePath, label) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('must be an object');
    return payload;
  } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${rel(filePath)}: ${error.message}`);
  }
}

function resolveControlledPath(relativePath, roots, label, expectedType = 'file') {
  const text = String(relativePath || '').replace(/\\/g, '/');
  if (!text.startsWith('md-os/') || path.isAbsolute(text) || text.split('/').includes('..')) {
    throw new Error(`${label}_PATH_INVALID: ${text}`);
  }
  const resolved = assertInsideWorkspace(path.join(WORKSPACE_ROOT, text));
  if (!roots.some((root) => isInside(root, resolved))) throw new Error(`${label}_OUTSIDE_CONTROLLED_ROOT: ${text}`);
  const stats = fs.lstatSync(resolved);
  if (stats.isSymbolicLink()) throw new Error(`${label}_SYMLINK_FORBIDDEN: ${text}`);
  if (expectedType === 'file' && !stats.isFile()) throw new Error(`${label}_NOT_FILE: ${text}`);
  if (expectedType === 'directory' && !stats.isDirectory()) throw new Error(`${label}_NOT_DIRECTORY: ${text}`);
  return resolved;
}

function fileSha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function listRegularFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const result = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(current, entry.name);
      const stats = fs.lstatSync(filePath);
      if (stats.isSymbolicLink()) continue;
      if (stats.isDirectory()) visit(filePath);
      else if (stats.isFile()) result.push(filePath);
    }
  };
  visit(rootDir);
  return result.sort();
}

function repositoryManifest(fixtureDir) {
  return listRegularFiles(fixtureDir).map((filePath) => ({
    path: path.relative(fixtureDir, filePath).replace(/\\/g, '/'),
    sha256: fileSha256(filePath),
    size_bytes: fs.statSync(filePath).size,
  }));
}

function lexicalTerms(benchmarkCase) {
  const text = `${benchmarkCase.issue.goal} ${benchmarkCase.issue.defect_class}`.toLowerCase();
  return Array.from(new Set(text.split(/[^a-z0-9_]+/).filter((term) => term.length >= 4))).sort();
}

function lexicalRetrieval(fixtureDir, manifest, benchmarkCase, limit = 5) {
  const terms = lexicalTerms(benchmarkCase);
  return manifest.map((entry) => {
    const content = fs.readFileSync(path.join(fixtureDir, entry.path), 'utf8').toLowerCase();
    const pathText = entry.path.toLowerCase();
    const score = terms.reduce((sum, term) => {
      const contentMatches = content.split(term).length - 1;
      const pathMatches = pathText.includes(term) ? 2 : 0;
      return sum + contentMatches + pathMatches;
    }, 0);
    return { ...entry, lexical_score: score };
  }).sort((left, right) => right.lexical_score - left.lexical_score || left.path.localeCompare(right.path)).slice(0, limit);
}

function memoryManifest(rootDir) {
  return listRegularFiles(rootDir)
    .filter((filePath) => filePath.endsWith('.json'))
    .map((filePath) => ({
      path: rel(filePath),
      sha256: fileSha256(filePath),
      payload: readJson(filePath, 'CANDIDATE_PROVIDER_CONTEXT_RECORD'),
    }));
}

function repositorySnapshot(fixtureDir, manifest) {
  return {
    encoding: 'utf8',
    files: manifest.map((entry) => {
      if (entry.size_bytes > 256 * 1024) throw new Error(`CANDIDATE_PROVIDER_REPOSITORY_FILE_TOO_LARGE: ${entry.path}`);
      const text = fs.readFileSync(path.join(fixtureDir, entry.path), 'utf8');
      if (text.includes('\u0000')) throw new Error(`CANDIDATE_PROVIDER_BINARY_REPOSITORY_FILE_FORBIDDEN: ${entry.path}`);
      return { ...entry, text };
    }),
  };
}

function candidatePatchText(candidate, context) {
  if (context.provider.kind === 'bounded_skill_program') {
    if (Object.hasOwn(candidate, 'patch_path')) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_PATCH_PATH_FORBIDDEN: ${candidate.candidate_id}`);
    }
    const text = typeof candidate.patch_text === 'string' ? candidate.patch_text : '';
    const maxBytes = Math.max(8192, Number(context.benchmarkCase.diff_policy.max_diff_bytes || 0) * 2);
    if (!text.trim() || text.includes('\u0000')) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_PATCH_TEXT_INVALID: ${candidate.candidate_id}`);
    }
    if (Buffer.byteLength(text) > maxBytes) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_PATCH_TEXT_TOO_LARGE: ${candidate.candidate_id}`);
    }
    if (sha256Text(text) !== candidate.patch_sha256) {
      throw new Error(`CANDIDATE_PROVIDER_RESULT_PATCH_HASH_MISMATCH: ${candidate.candidate_id}`);
    }
    return text;
  }
  const patchPath = resolveControlledPath(candidate.patch_path, [CANDIDATES_ROOT], 'CANDIDATE_PROVIDER_RESULT_PATCH', 'file');
  if (fileSha256(patchPath) !== candidate.patch_sha256) {
    throw new Error(`CANDIDATE_PROVIDER_RESULT_PATCH_HASH_MISMATCH: ${candidate.candidate_id}`);
  }
  return fs.readFileSync(patchPath, 'utf8');
}

function skillRecords(request) {
  const context = request.context_receipt || {};
  const groups = [context.candidate_skills, context.skills];
  return groups.flatMap((group) => Array.isArray(group && group.records) ? group.records : [])
    .map((record) => record && record.payload)
    .filter((record) => record && shortText(record.skill_id));
}

function validateContextUsage(result, context) {
  if (context.provider.kind !== 'bounded_skill_program') return { used_skills: [] };
  const usage = result.context_usage;
  if (!usage || typeof usage !== 'object' || Array.isArray(usage)) {
    throw new Error('BOUNDED_SKILL_PROVIDER_CONTEXT_USAGE_REQUIRED');
  }
  const usedSkillIds = Array.isArray(usage.used_skill_ids) ? usage.used_skill_ids.map((item) => shortText(item)).filter(Boolean) : [];
  const usedEpisodeIds = Array.isArray(usage.used_episode_ids) ? usage.used_episode_ids.map((item) => shortText(item)).filter(Boolean) : [];
  const records = skillRecords(context.request);
  const byId = new Map(records.map((skill) => [skill.skill_id, skill]));
  const usedSkills = usedSkillIds.map((skillId) => {
    const skill = byId.get(skillId);
    if (!skill) throw new Error(`BOUNDED_SKILL_PROVIDER_UNAVAILABLE_SKILL_USED: ${skillId}`);
    if ((skill.source_cases || []).includes(context.benchmarkCase.benchmark_case_id)) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_CASE_CONTAMINATION: ${skillId}`);
    }
    const sourceSplits = Array.isArray(skill.source_splits) ? skill.source_splits : [];
    if (context.benchmarkCase.split === 'holdout' && sourceSplits.some((split) => split !== 'development')) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_HOLDOUT_SOURCE_SPLIT_INVALID: ${skillId}`);
    }
    const sourceEpisodes = new Set(Array.isArray(skill.source_episodes) ? skill.source_episodes : []);
    if (usedEpisodeIds.some((episodeId) => !sourceEpisodes.has(episodeId))) {
      throw new Error(`BOUNDED_SKILL_PROVIDER_EPISODE_PROVENANCE_INVALID: ${skillId}`);
    }
    return skill;
  });
  if (result.created_by === 'skill') {
    if (!usedSkills.length) throw new Error('BOUNDED_SKILL_PROVIDER_SKILL_PROVENANCE_REQUIRED');
    if (!(context.configuration.skills || context.configuration.candidate_skills)) {
      throw new Error('BOUNDED_SKILL_PROVIDER_SKILL_CONTEXT_DISABLED');
    }
  } else if (usedSkills.length || usedEpisodeIds.length) {
    throw new Error('BOUNDED_SKILL_PROVIDER_PLANNER_CONTEXT_PROVENANCE_INVALID');
  }
  return { used_skills: usedSkills };
}

function empiricalEligibility({ provider, request, result, invocation, fidelity, diversity, usedSkills }) {
  if (provider.kind === 'controlled_fixture') {
    return {
      eligible: false,
      reason_codes: ['controlled_fixture_provider', 'case_ground_truth_disclosed'],
    };
  }
  const reasons = [];
  if (provider.case_ground_truth_disclosed) reasons.push('case_ground_truth_disclosed');
  if (request.ground_truth_access !== 'denied') reasons.push('ground_truth_access_not_denied');
  if (!invocation.receipt.permission_model || invocation.receipt.permission_model.enabled !== true) reasons.push('provider_permission_model_missing');
  if (!fidelity.passed) reasons.push('configuration_fidelity_failed');
  if (!diversity.passed) reasons.push('strategy_diversity_failed');
  if (request.configuration.candidate_skills && result.created_by !== 'skill') reasons.push('candidate_skill_not_used');
  if (result.created_by === 'skill' && !usedSkills.length) reasons.push('skill_provenance_missing');
  return {
    eligible: reasons.length === 0,
    reason_codes: reasons,
  };
}

function buildContextReceipt(benchmarkCase, fixtureDir, configuration, experimentContext = null) {
  const manifest = repositoryManifest(fixtureDir);
  const retrieved = configuration.retrieval ? lexicalRetrieval(fixtureDir, manifest, benchmarkCase) : [];
  const episodes = configuration.episodic_memory ? memoryManifest(EPISODES_ROOT) : [];
  const skills = configuration.skills ? memoryManifest(SKILL_PROMOTED_ROOT) : [];
  const candidateSkills = configuration.candidate_skills
    ? memoryManifest(SKILL_CANDIDATES_ROOT).filter((record) => !experimentContext
      || record.payload.experiment_id === experimentContext.experiment_id)
    : [];
  return {
    configuration_id: configuration.configuration_id,
    repository: {
      available: true,
      manifest_hash: sha256Json(manifest),
      file_count: manifest.length,
      files: manifest,
    },
    retrieval: {
      enabled: configuration.retrieval,
      method: configuration.retrieval ? 'deterministic_lexical_v1' : 'disabled',
      used: configuration.retrieval && retrieved.length > 0,
      selected: retrieved,
    },
    episodic_memory: {
      enabled: configuration.episodic_memory,
      consulted: configuration.episodic_memory,
      available_record_count: episodes.length,
      records: episodes,
    },
    skills: {
      enabled: configuration.skills,
      consulted: configuration.skills,
      available_record_count: skills.length,
      records: skills,
    },
    candidate_skills: {
      enabled: Boolean(configuration.candidate_skills),
      consulted: Boolean(configuration.candidate_skills),
      available_record_count: candidateSkills.length,
      records: candidateSkills,
    },
  };
}

function publicCommand(command) {
  return {
    command_id: command.command_id,
    argv: command.argv.slice(),
    cwd: command.cwd,
  };
}

function buildProviderRequest({ providerRunId, provider, benchmarkCase, fixtureDir, configuration, experimentContext = null }) {
  const maxCandidates = Math.min(configuration.candidate_limit, benchmarkCase.resource_budget.max_candidates);
  return {
    schema_version: 1,
    provider_run_id: providerRunId,
    provider_id: provider.provider_id,
    benchmark_case_id: benchmarkCase.benchmark_case_id,
    ...(experimentContext ? { experiment_context: experimentContext } : {}),
    configuration: { ...configuration, candidate_limit: maxCandidates },
    issue: {
      goal: benchmarkCase.issue.goal,
      defect_class: benchmarkCase.issue.defect_class,
      acceptance_claims: benchmarkCase.issue.acceptance_claims.slice(),
    },
    repository_context: {
      kind: benchmarkCase.repository.kind,
      fixture_path: benchmarkCase.repository.fixture_path,
      source_tree_sha256: benchmarkCase.repository.source_tree_sha256,
    },
    repository_snapshot: repositorySnapshot(fixtureDir, repositoryManifest(fixtureDir)),
    visible_validation: {
      reproduction: publicCommand(benchmarkCase.reproduction),
      targeted_tests: benchmarkCase.targeted_tests.map(publicCommand),
      regression_tests: benchmarkCase.regression_tests.map(publicCommand),
    },
    diff_policy: { ...benchmarkCase.diff_policy },
    resource_budget: {
      max_candidates: maxCandidates,
      max_tokens: null,
      max_cost: null,
      provider_timeout_ms: provider.implementation.timeout_ms,
    },
    context_receipt: buildContextReceipt(benchmarkCase, fixtureDir, configuration, experimentContext),
    ground_truth_access: 'denied',
    withheld_fields: ['oracle_tests', 'ground_truth', 'expected_after_exit_status'],
  };
}

function validateProvider(provider, benchmarkCase) {
  if (!provider || provider.schema_version !== 1 || !['controlled_fixture', 'bounded_skill_program'].includes(provider.kind)) {
    throw new Error('CANDIDATE_PROVIDER_SCHEMA_UNSUPPORTED');
  }
  const providerId = assertSafeId(provider.provider_id, 'provider_id');
  if (!providerId.startsWith('provider_')) throw new Error('CANDIDATE_PROVIDER_ID_PREFIX_INVALID');
  if (!Array.isArray(provider.supported_cases) || !provider.supported_cases.includes(benchmarkCase.benchmark_case_id)) {
    throw new Error(`CANDIDATE_PROVIDER_CASE_UNSUPPORTED: ${benchmarkCase.benchmark_case_id}`);
  }
  const implementation = provider.implementation || {};
  if (implementation.executable !== 'node' || !Number.isInteger(implementation.timeout_ms)) {
    throw new Error('CANDIDATE_PROVIDER_IMPLEMENTATION_INVALID');
  }
  resolveControlledPath(implementation.script_path, [PROVIDERS_ROOT], 'CANDIDATE_PROVIDER_SCRIPT', 'file');

  if (provider.kind === 'bounded_skill_program') {
    if (provider.case_ground_truth_disclosed !== false) {
      throw new Error('BOUNDED_SKILL_PROVIDER_GROUND_TRUTH_DISCLOSURE_FORBIDDEN');
    }
    if (!shortText(provider.skill_family)) throw new Error('BOUNDED_SKILL_PROVIDER_FAMILY_REQUIRED');
    return provider;
  }

  if (provider.case_ground_truth_disclosed !== true) {
    throw new Error('CONTROLLED_FIXTURE_PROVIDER_DISCLOSURE_REQUIRED');
  }
  if (!Array.isArray(provider.strategy_catalog) || !provider.strategy_catalog.length) {
    throw new Error('CANDIDATE_PROVIDER_STRATEGY_CATALOG_REQUIRED');
  }
  const ids = new Set();
  for (const entry of provider.strategy_catalog) {
    const candidateId = assertSafeId(entry && entry.candidate_id, 'candidate_id');
    if (ids.has(candidateId)) throw new Error(`CANDIDATE_PROVIDER_DUPLICATE_CANDIDATE: ${candidateId}`);
    ids.add(candidateId);
    if (!shortText(entry.strategy_class) || !shortText(entry.mechanism) || !shortText(entry.hypothesis)) {
      throw new Error(`CANDIDATE_PROVIDER_STRATEGY_INVALID: ${candidateId}`);
    }
    const patchPath = resolveControlledPath(entry.patch_path, [CANDIDATES_ROOT], 'CANDIDATE_PROVIDER_PATCH', 'file');
    if (fileSha256(patchPath) !== entry.patch_sha256) {
      throw new Error(`CANDIDATE_PROVIDER_PATCH_HASH_MISMATCH: ${candidateId}`);
    }
  }
  return provider;
}

function parseLastJson(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) { /* continue */ }
  }
  return null;
}

function invokeProvider(provider, providerPath, request, requestPath, sandboxDir) {
  const scriptPath = resolveControlledPath(provider.implementation.script_path, [PROVIDERS_ROOT], 'CANDIDATE_PROVIDER_SCRIPT', 'file');
  const started = Date.now();
  const permissionArgs = [
    '--permission',
    `--allow-fs-read=${scriptPath}`,
    `--allow-fs-read=${providerPath}`,
    `--allow-fs-read=${requestPath}`,
  ];
  const result = spawnSync(process.execPath, [...permissionArgs, scriptPath, '--provider', providerPath, '--request', requestPath], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: provider.implementation.timeout_ms,
    maxBuffer: 2 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      HOME: path.join(sandboxDir, 'home'),
      TMPDIR: path.join(sandboxDir, 'tmp'),
      MDOS_PROVIDER_GROUND_TRUTH_ACCESS: 'denied',
      MDOS_PROVIDER_REQUEST_ONLY: 'true',
    },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  return {
    payload: parseLastJson(stdout),
    receipt: {
      executable: 'node',
      script_path: provider.implementation.script_path,
      script_sha256: fileSha256(scriptPath),
      exit_status: Number.isInteger(result.status) ? result.status : null,
      signal: result.signal || null,
      duration_ms: Date.now() - started,
      stdout_hash: sha256Text(stdout),
      stderr_excerpt: stderr.slice(0, 1000),
      error: result.error ? shortText(result.error.message) : null,
      ground_truth_access: request.ground_truth_access,
      permission_model: {
        enabled: true,
        filesystem_read_allowlist: [rel(scriptPath), rel(providerPath), rel(requestPath)],
        filesystem_write_allowed: false,
        child_process_allowed: false,
        worker_threads_allowed: false,
      },
    },
  };
}

function configurationFidelity(request, candidateCount) {
  const configuration = request.configuration;
  const context = request.context_receipt;
  const findings = [];
  if (context.retrieval.enabled !== configuration.retrieval) findings.push('retrieval_enablement_mismatch');
  if (context.episodic_memory.enabled !== configuration.episodic_memory) findings.push('episodic_memory_enablement_mismatch');
  if (context.skills.enabled !== configuration.skills) findings.push('skills_enablement_mismatch');
  if (context.candidate_skills.enabled !== Boolean(configuration.candidate_skills)) findings.push('candidate_skills_enablement_mismatch');
  if (configuration.retrieval && !context.retrieval.used) findings.push('required_retrieval_not_used');
  if (!configuration.retrieval && context.retrieval.selected.length) findings.push('retrieval_used_when_disabled');
  if (configuration.configuration_id.startsWith('baseline_') && candidateCount !== 1) findings.push('baseline_requires_single_candidate');
  if (candidateCount > configuration.candidate_limit) findings.push('candidate_limit_exceeded');
  return {
    passed: findings.length === 0,
    configuration_id: configuration.configuration_id,
    declared: {
      retrieval: configuration.retrieval,
      episodic_memory: configuration.episodic_memory,
      skills: configuration.skills,
      candidate_skills: Boolean(configuration.candidate_skills),
      candidate_limit: configuration.candidate_limit,
    },
    observed: {
      retrieval_used: context.retrieval.used,
      episodic_memory_consulted: context.episodic_memory.consulted,
      skills_consulted: context.skills.consulted,
      candidate_skills_consulted: context.candidate_skills.consulted,
      candidate_count: candidateCount,
    },
    findings,
  };
}

function validateProviderResult(result, context) {
  if (!result || typeof result !== 'object' || Array.isArray(result) || result.schema_version !== 1) {
    throw new Error('CANDIDATE_PROVIDER_RESULT_INVALID');
  }
  const exact = [
    ['provider_run_id', context.providerRunId],
    ['provider_id', context.provider.provider_id],
    ['benchmark_case_id', context.benchmarkCase.benchmark_case_id],
    ['configuration_id', context.configuration.configuration_id],
    ['request_hash', context.requestHash],
  ];
  for (const [field, expected] of exact) {
    if (result[field] !== expected) throw new Error(`CANDIDATE_PROVIDER_RESULT_${field.toUpperCase()}_MISMATCH`);
  }
  if (result.case_ground_truth_disclosed !== context.provider.case_ground_truth_disclosed) {
    throw new Error('CANDIDATE_PROVIDER_RESULT_DISCLOSURE_MISMATCH');
  }
  if (!['fixture', 'model', 'planner', 'skill', 'human'].includes(result.created_by)) {
    throw new Error('CANDIDATE_PROVIDER_RESULT_CREATOR_INVALID');
  }
  if (!Array.isArray(result.candidates) || !result.candidates.length) throw new Error('CANDIDATE_PROVIDER_RESULT_EMPTY');
  if (result.candidates.length > context.request.resource_budget.max_candidates) {
    throw new Error('CANDIDATE_PROVIDER_RESULT_CANDIDATE_BUDGET_EXCEEDED');
  }
  const contextUsage = validateContextUsage(result, context);
  const ids = new Set();
  const patchTexts = new Map();
  for (const candidate of result.candidates) {
    const candidateId = assertSafeId(candidate && candidate.candidate_id, 'candidate_id');
    if (ids.has(candidateId)) throw new Error(`CANDIDATE_PROVIDER_RESULT_DUPLICATE_CANDIDATE: ${candidateId}`);
    ids.add(candidateId);
    patchTexts.set(candidateId, candidatePatchText(candidate, context));
    validatePlanGraph(candidate.plan_graph, {
      benchmarkCase: context.benchmarkCase,
      configuration: context.configuration,
      providerId: context.provider.provider_id,
      providerRunId: context.providerRunId,
      requestHash: context.requestHash,
      request: context.request,
    });
    if (candidate.plan_graph.provenance.source !== result.created_by) {
      throw new Error(`CANDIDATE_PROVIDER_RESULT_ORIGIN_MISMATCH: ${candidateId}`);
    }
    const metrics = candidate.proposal_metrics || {};
    if (!Number.isInteger(metrics.human_interventions) || metrics.human_interventions < 0) {
      throw new Error(`CANDIDATE_PROVIDER_RESULT_METRICS_INVALID: ${candidateId}`);
    }
  }
  const requiredDistinctPlans = result.candidates.length > 1
    ? Math.min(2, context.request.resource_budget.max_candidates)
    : 1;
  const diversity = diversityReceipt(result.candidates, { requiredDistinctPlans });
  if (!diversity.passed) {
    throw new Error(`CANDIDATE_PROVIDER_PLAN_DIVERSITY_FAILED: ${diversity.findings.map((item) => item.code).join(',')}`);
  }
  const fidelity = configurationFidelity(context.request, result.candidates.length);
  if (!fidelity.passed) {
    throw new Error(`CANDIDATE_PROVIDER_CONFIGURATION_FIDELITY_FAILED: ${fidelity.findings.join(',')}`);
  }
  return { result, diversity, fidelity, patchTexts, contextUsage };
}

function generatedProviderRunId(benchmarkCase, configuration, provider) {
  const stamp = nowIso().replace(/[-:.TZ]/g, '_').replace(/_+/g, '_');
  return `provider_run_${stamp}_${sha256Json({ case: benchmarkCase.benchmark_case_id, configuration: configuration.configuration_id, provider: provider.provider_id }).slice(0, 10)}`;
}

function generateCandidateSet(options) {
  const casePath = resolveControlledPath(options.case_path, [CASES_ROOT], 'CANDIDATE_PROVIDER_CASE', 'file');
  const providerPath = resolveControlledPath(options.provider_path, [PROVIDERS_ROOT], 'CANDIDATE_PROVIDER', 'file');
  const benchmarkCase = readJson(casePath, 'CANDIDATE_PROVIDER_CASE');
  const validatedCase = validateBenchmarkCase(benchmarkCase);
  const provider = validateProvider(readJson(providerPath, 'CANDIDATE_PROVIDER'), benchmarkCase);
  const configuration = CONFIGURATIONS[options.configuration_id || 'mdos_verified_runtime'];
  if (!configuration) throw new Error(`CANDIDATE_PROVIDER_CONFIGURATION_UNKNOWN: ${options.configuration_id}`);
  if (benchmarkCase.split === 'holdout' && provider.case_ground_truth_disclosed) {
    throw new Error('CANDIDATE_PROVIDER_HOLDOUT_CONTAMINATED');
  }
  const providerRunId = assertSafeId(options.provider_run_id || generatedProviderRunId(benchmarkCase, configuration, provider), 'provider_run_id');
  if (!providerRunId.startsWith('provider_run_')) throw new Error('CANDIDATE_PROVIDER_RUN_ID_PREFIX_INVALID');
  const outputDir = path.join(OUTPUT_ROOT, providerRunId);
  const sandboxDir = path.join(SANDBOX_ROOT, providerRunId);
  if (fs.existsSync(outputDir)) throw new Error(`CANDIDATE_PROVIDER_APPEND_ONLY_CONFLICT: ${providerRunId}`);

  return withFileLock(`candidate_provider__${providerRunId}`, {
    context: `candidate_provider:${providerRunId}`,
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
    fs.mkdirSync(sandboxDir, { recursive: true });
    fs.mkdirSync(path.join(sandboxDir, 'home'), { recursive: true });
    fs.mkdirSync(path.join(sandboxDir, 'tmp'), { recursive: true });
    fs.mkdirSync(outputDir, { recursive: false });
    let committed = false;
    const startedAt = nowIso();
    try {
      const experimentContext = options.experiment_context && typeof options.experiment_context === 'object'
        ? { experiment_id: assertSafeId(options.experiment_context.experiment_id, 'experiment_id') }
        : null;
      const request = buildProviderRequest({
        providerRunId,
        provider,
        benchmarkCase,
        fixtureDir: validatedCase.fixtureDir,
        configuration,
        experimentContext,
      });
      const requestHash = sha256Json(request);
      const requestSandboxPath = path.join(sandboxDir, 'provider_request.json');
      atomicWriteJson(requestSandboxPath, request);
      const invocation = invokeProvider(provider, providerPath, request, requestSandboxPath, sandboxDir);
      if (invocation.receipt.exit_status !== 0 || !invocation.payload) {
        throw new Error(`CANDIDATE_PROVIDER_PROCESS_FAILED: ${invocation.receipt.stderr_excerpt || invocation.receipt.error || invocation.receipt.exit_status}`);
      }
      const validated = validateProviderResult(invocation.payload, {
        benchmarkCase,
        configuration,
        provider,
        providerRunId,
        request,
        requestHash,
      });
      const requestPath = path.join(outputDir, 'provider_request.json');
      const resultPath = path.join(outputDir, 'provider_result.json');
      const receiptPath = path.join(outputDir, 'provider_receipt.json');
      const candidateSetPath = path.join(outputDir, 'candidate_set.json');
      const planDir = path.join(outputDir, 'plan_graphs');
      const patchDir = path.join(outputDir, 'patches');
      fs.mkdirSync(planDir, { recursive: true });
      fs.mkdirSync(patchDir, { recursive: true });
      atomicWriteJson(requestPath, request);
      atomicWriteJson(resultPath, invocation.payload);
      const candidates = [];
      const planArtifacts = [];
      const patchArtifacts = [];
      for (const candidate of validated.result.candidates) {
        const planPath = path.join(planDir, `${candidate.plan_graph.plan_graph_id}.json`);
        const patchPath = path.join(patchDir, `${candidate.candidate_id}.patch`);
        atomicWriteJson(planPath, candidate.plan_graph);
        atomicWriteText(patchPath, validated.patchTexts.get(candidate.candidate_id));
        const planHash = sha256Json(candidate.plan_graph);
        const patchHash = fileSha256(patchPath);
        planArtifacts.push({ plan_graph_id: candidate.plan_graph.plan_graph_id, file: rel(planPath), sha256: planHash });
        patchArtifacts.push({ candidate_id: candidate.candidate_id, file: rel(patchPath), sha256: patchHash });
        candidates.push({
          candidate_id: candidate.candidate_id,
          strategy_class: candidate.plan_graph.strategy_class,
          origin: validated.result.created_by,
          plan_graph_id: candidate.plan_graph.plan_graph_id,
          plan_graph_path: rel(planPath),
          plan_graph_sha256: planHash,
          patch_path: rel(patchPath),
          patch_sha256: patchHash,
          initial_confidence: Number.isFinite(candidate.initial_confidence) ? candidate.initial_confidence : null,
          proposal_metrics: candidate.proposal_metrics,
        });
      }
      const empiricalEligibilityState = empiricalEligibility({
        provider,
        request,
        result: invocation.payload,
        invocation,
        fidelity: validated.fidelity,
        diversity: validated.diversity,
        usedSkills: validated.contextUsage.used_skills,
      });
      const candidateSetId = assertSafeId(`candidate_set_${sha256Json({ providerRunId, requestHash }).slice(0, 20)}`, 'candidate_set_id');
      const receipt = {
        schema_version: 1,
        provider_run_id: providerRunId,
        provider_id: provider.provider_id,
        provider_kind: provider.kind,
        benchmark_case_id: benchmarkCase.benchmark_case_id,
        configuration_id: configuration.configuration_id,
        started_at: startedAt,
        completed_at: nowIso(),
        status: 'completed',
        request_hash: requestHash,
        result_hash: sha256Json(invocation.payload),
        process: invocation.receipt,
        configuration_fidelity: validated.fidelity,
        strategy_diversity: validated.diversity,
        empirical_eligibility: empiricalEligibilityState,
        artifacts: {
          provider_request_file: rel(requestPath),
          provider_result_file: rel(resultPath),
          provider_receipt_file: rel(receiptPath),
          candidate_set_file: rel(candidateSetPath),
          plan_graphs: planArtifacts,
          patches: patchArtifacts,
        },
      };
      atomicWriteJson(receiptPath, receipt);
      const candidateSet = {
        schema_version: 2,
        candidate_set_id: candidateSetId,
        benchmark_case_id: benchmarkCase.benchmark_case_id,
        created_by: validated.result.created_by,
        case_ground_truth_disclosed: validated.result.case_ground_truth_disclosed,
        provider: {
          provider_id: provider.provider_id,
          provider_run_id: providerRunId,
          provider_receipt_file: rel(receiptPath),
          provider_receipt_sha256: fileSha256(receiptPath),
          configuration_id: configuration.configuration_id,
          configuration_fidelity_passed: validated.fidelity.passed,
          strategy_diversity_passed: validated.diversity.passed,
          empirical_eligibility: empiricalEligibilityState,
        },
        candidates,
      };
      atomicWriteJson(candidateSetPath, candidateSet);
      appendJournal({
        event: 'software_repair_candidate_provider_completed',
        provider_run_id: providerRunId,
        provider_id: provider.provider_id,
        benchmark_case_id: benchmarkCase.benchmark_case_id,
        configuration_id: configuration.configuration_id,
        candidate_count: candidates.length,
        strategy_diversity_passed: validated.diversity.passed,
        empirical_eligible: empiricalEligibilityState.eligible,
        output_file: rel(candidateSetPath),
      });
      committed = true;
      return {
        ok: true,
        mode: 'software_repair_candidate_provider',
        provider_run_id: providerRunId,
        provider_id: provider.provider_id,
        benchmark_case_id: benchmarkCase.benchmark_case_id,
        configuration_id: configuration.configuration_id,
        candidate_count: candidates.length,
        strategy_diversity_passed: validated.diversity.passed,
        configuration_fidelity_passed: validated.fidelity.passed,
        empirical_eligible: empiricalEligibilityState.eligible,
        provider_receipt_file: rel(receiptPath),
        candidate_set_file: rel(candidateSetPath),
      };
    } finally {
      if (fs.existsSync(sandboxDir)) fs.rmSync(sandboxDir, { recursive: true, force: true });
      if (!committed && fs.existsSync(outputDir)) fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });
}

module.exports = {
  buildContextReceipt,
  buildProviderRequest,
  configurationFidelity,
  generateCandidateSet,
  validateProvider,
  validateProviderResult,
};
