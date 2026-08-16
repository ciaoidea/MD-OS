#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  assertInsideRoot,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir } = require('../../os/lib/fs_runtime');
const {
  TEST_PROTOCOL_ID,
  assessExpectedTestRun,
} = require('./apfc_open_world_meta_learning');

const HOST_BACKEND_ID = 'host_native_no_tool_ephemeral_v2';
const DEFAULT_MODEL = 'gpt-5.4';
const MODEL_PATCH_RESPONSE_SCHEMA = path.join(MDOS_ROOT, 'schemas', 'apfc_no_tool_patch_response.schema.json');
const FORBIDDEN_TEST_PATH = /(^|\/)(tests?|testing|fixtures?|snapshots?|__snapshots__)(\/|$)|(^|\/)(test_[^/]+|[^/]+[._-]test\.[^/]+)$/i;
const DEFAULT_COMMON_TEST_DEPENDENCIES = Object.freeze([
  'coverage',
  'pretend',
  'pytest',
  'pytest-mock',
  'pytest-socket',
]);
const AUTH_FAILURE = /401\s+Unauthorized|authentication\s+(?:failed|required)|not\s+logged\s+in/i;

function safeToken(value) {
  return String(value).replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 100);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    env: options.env || process.env,
    input: options.input,
    timeout: options.timeoutMs,
    maxBuffer: options.maxBuffer || 128 * 1024 * 1024,
  });
}

function commandSummary(result) {
  return {
    exit_status: Number.isInteger(result.status) ? result.status : null,
    timed_out: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
    stdout_hash: sha256Text(result.stdout || ''),
    stderr_hash: sha256Text(result.stderr || ''),
  };
}

function assertCommand(result, code) {
  if (result.status !== 0) {
    throw new Error(`${code}:${shortText(result.stderr || result.stdout || (result.error && result.error.message))}`);
  }
  return result;
}

function hostEnvironment(base = process.env, venvBin = null) {
  const env = { ...base, PYTHONDONTWRITEBYTECODE: '1', PIP_DISABLE_PIP_VERSION_CHECK: '1' };
  delete env.NO_COLOR;
  delete env.FORCE_COLOR;
  env.TERM = 'xterm-256color';
  if (venvBin) env.PATH = `${venvBin}${path.delimiter}${env.PATH || ''}`;
  return env;
}

function assertLabPath(target, labRoot) {
  const resolvedRoot = path.resolve(labRoot);
  const localRoot = path.join(MDOS_ROOT, 'ops', 'local');
  assertInsideRoot(resolvedRoot, localRoot, 'APFC_HOST_LAB_OUTSIDE_LOCAL_RUNTIME');
  const resolved = assertInsideRoot(target, resolvedRoot, 'APFC_HOST_PATH_OUTSIDE_LAB');
  if (resolved === resolvedRoot) throw new Error('APFC_HOST_LAB_ROOT_TARGET_FORBIDDEN');
  return resolved;
}

function removeLabPath(target, labRoot) {
  const resolved = assertLabPath(target, labRoot);
  fs.rmSync(resolved, { recursive: true, force: true });
}

function cloneExactCommit({ repository, baseCommit, destination, labRoot, timeoutMs = 180_000 }) {
  const target = assertLabPath(destination, labRoot);
  removeLabPath(target, labRoot);
  ensureDir(target);
  const remote = `https://github.com/${repository}.git`;
  assertCommand(run('git', ['init', '--quiet', target], { timeoutMs }), 'APFC_HOST_GIT_INIT_FAILED');
  assertCommand(run('git', ['remote', 'add', 'origin', remote], { cwd: target, timeoutMs }), 'APFC_HOST_GIT_REMOTE_FAILED');
  assertCommand(run('git', ['fetch', '--quiet', '--depth', '1', 'origin', baseCommit], { cwd: target, timeoutMs }), 'APFC_HOST_GIT_FETCH_FAILED');
  assertCommand(run('git', ['checkout', '--quiet', '--detach', 'FETCH_HEAD'], { cwd: target, timeoutMs }), 'APFC_HOST_GIT_CHECKOUT_FAILED');
  const resolved = shortText(assertCommand(
    run('git', ['rev-parse', 'HEAD'], { cwd: target, timeoutMs: 30_000 }),
    'APFC_HOST_GIT_REV_PARSE_FAILED',
  ).stdout);
  if (resolved !== baseCommit) throw new Error(`APFC_HOST_BASE_COMMIT_MISMATCH:${resolved}:${baseCommit}`);
  return { repository, remote, requested_commit: baseCommit, resolved_commit: resolved };
}

function resetRepository(repo, baseCommit) {
  assertCommand(run('git', ['reset', '--hard', baseCommit], { cwd: repo, timeoutMs: 30_000 }), 'APFC_HOST_GIT_RESET_FAILED');
  assertCommand(run('git', ['clean', '-fdx'], { cwd: repo, timeoutMs: 60_000 }), 'APFC_HOST_GIT_CLEAN_FAILED');
}

function changedFiles(workspace) {
  const status = assertCommand(
    run('git', ['status', '--porcelain=v1', '-z'], { cwd: workspace, timeoutMs: 30_000 }),
    'APFC_HOST_GIT_STATUS_FAILED',
  );
  const files = [];
  const chunks = status.stdout.split('\0').filter(Boolean);
  for (let index = 0; index < chunks.length; index += 1) {
    const record = chunks[index];
    const code = record.slice(0, 2);
    let file = record.slice(3);
    if ((code.startsWith('R') || code.startsWith('C')) && chunks[index + 1]) {
      index += 1;
      file = chunks[index];
    }
    files.push(file);
  }
  return [...new Set(files)].sort();
}

function extractCandidatePatch(workspace) {
  const files = changedFiles(workspace);
  const forbidden = files.filter((file) => FORBIDDEN_TEST_PATH.test(file));
  const untracked = assertCommand(
    run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: workspace, timeoutMs: 30_000 }),
    'APFC_HOST_UNTRACKED_SCAN_FAILED',
  ).stdout.split('\0').filter(Boolean);
  for (const file of untracked) {
    assertCommand(
      run('git', ['add', '-N', '--', file], { cwd: workspace, timeoutMs: 30_000 }),
      'APFC_HOST_INTENT_TO_ADD_FAILED',
    );
  }
  const diff = assertCommand(
    run('git', ['diff', '--binary', '--no-ext-diff', '--'], { cwd: workspace, timeoutMs: 60_000 }),
    'APFC_HOST_DIFF_FAILED',
  ).stdout;
  return {
    patch: diff,
    patch_hash: sha256Text(diff),
    changed_files: files,
    production_changed_files: files.filter((file) => !FORBIDDEN_TEST_PATH.test(file)),
    forbidden_changed_files: [...new Set(forbidden)].sort(),
  };
}

function applyPatch(repo, patchText, code) {
  const result = run('git', ['apply', '--binary', '-'], {
    cwd: repo,
    input: String(patchText || ''),
    timeoutMs: 60_000,
  });
  assertCommand(result, code);
  return sha256Text(patchText);
}

function preparePythonEnvironment({ repo, venv, dependencySpecs = DEFAULT_COMMON_TEST_DEPENDENCIES, timeoutMs = 600_000 }) {
  const venvParent = path.dirname(venv);
  ensureDir(venvParent);
  const create = assertCommand(
    run('uv', ['venv', venv, '--python', '3.12'], { timeoutMs: 120_000 }),
    'APFC_HOST_UV_VENV_FAILED',
  );
  const python = path.join(venv, 'bin', 'python');
  const editable = `${repo}[test,tests,dev]`;
  const installArgs = ['pip', 'install', '--python', python, '-e', editable, ...dependencySpecs];
  const install = assertCommand(
    run('uv', installArgs, { timeoutMs, env: hostEnvironment() }),
    'APFC_HOST_UV_INSTALL_FAILED',
  );
  const freeze = assertCommand(
    run('uv', ['pip', 'freeze', '--python', python], { timeoutMs: 60_000, env: hostEnvironment() }),
    'APFC_HOST_UV_FREEZE_FAILED',
  );
  return {
    python,
    venv_bin: path.join(venv, 'bin'),
    dependency_specs: [...dependencySpecs],
    environment_lock_hash: sha256Text(freeze.stdout),
    installed_distribution_count: freeze.stdout.split('\n').filter(Boolean).length,
    create: commandSummary(create),
    install: commandSummary(install),
  };
}

function runVerifier({ repo, venvBin, testCommand, timeoutMs = 600_000 }) {
  // A login shell may overwrite PATH from the host profile and silently select
  // a global pytest. A non-login shell preserves the sealed task venv.
  const result = run('bash', ['-c', testCommand], {
    cwd: repo,
    timeoutMs,
    env: hostEnvironment(process.env, venvBin),
  });
  return {
    ...commandSummary(result),
    output: `${result.stdout || ''}${result.stderr || ''}`,
  };
}

function compactAssessment(result, hiddenTask) {
  const assessment = assessExpectedTestRun(result.output, hiddenTask);
  return {
    exit_status: result.exit_status,
    timed_out: result.timed_out,
    output_hash: sha256Text(result.output),
    expected_tests_passed: assessment.all_expected_passed,
    expected_observed_count: assessment.expected_observed_count,
    expected_test_count: assessment.expected_test_count,
    fail_to_pass_all_failed: assessment.all_fail_to_pass_failed,
    fail_to_pass_observed_count: assessment.fail_to_pass_observed_count,
    pass_to_pass_all_passed: assessment.all_pass_to_pass_passed,
    pass_to_pass_observed_count: assessment.pass_to_pass_observed_count,
    pass_to_pass_test_count: assessment.pass_to_pass_count,
  };
}

function parseNoToolCodexEvents(stdout) {
  const events = [];
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try { events.push(JSON.parse(trimmed)); } catch { /* raw stream remains in the private vault */ }
  }
  const agentMessages = events
    .filter((event) => event.type === 'item.completed' && event.item && event.item.type === 'agent_message')
    .map((event) => String(event.item.text || ''));
  const toolEventTypes = events
    .filter((event) => event.item && event.item.type && event.item.type !== 'agent_message')
    .map((event) => String(event.item.type));
  const turn = [...events].reverse().find((event) => event.type === 'turn.completed');
  const thread = events.find((event) => event.type === 'thread.started');
  return {
    thread_id: thread ? thread.thread_id : null,
    final_text: agentMessages.length ? agentMessages.at(-1) : '',
    tool_event_types: [...new Set(toolEventTypes)].sort(),
    usage: turn && turn.usage ? turn.usage : {},
  };
}

function parsePatchResponse(text) {
  let value;
  try { value = JSON.parse(String(text || '').trim()); } catch { return null; }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (Object.keys(value).length !== 1 || typeof value.patch !== 'string') return null;
  if (!value.patch.startsWith('diff --git ') || value.patch.includes('\0')) return null;
  if (Buffer.byteLength(value.patch) > 2 * 1024 * 1024) return null;
  return value;
}

function patchPaths(patchText) {
  const files = [];
  for (const line of String(patchText || '').split('\n')) {
    const match = /^diff --git a\/(.+) b\/(.+)$/.exec(line);
    if (!match) continue;
    for (const candidate of [match[1], match[2]]) {
      const normalized = path.posix.normalize(candidate);
      if (!candidate || normalized !== candidate || path.posix.isAbsolute(candidate)
        || candidate === '..' || candidate.startsWith('../') || candidate.includes('/../')) {
        throw new Error('APFC_NO_TOOL_PATCH_PATH_INVALID');
      }
    }
    if (match[1] !== match[2]) throw new Error('APFC_NO_TOOL_PATCH_RENAME_FORBIDDEN');
    files.push(match[1]);
  }
  if (files.length === 0) throw new Error('APFC_NO_TOOL_PATCH_HAS_NO_FILES');
  return [...new Set(files)].sort();
}

function applyNoToolPatch({ repo, patchText, allowTestPaths = false }) {
  const files = patchPaths(patchText);
  if (!allowTestPaths && files.some((file) => FORBIDDEN_TEST_PATH.test(file))) {
    throw new Error('APFC_NO_TOOL_PATCH_TOUCHES_FORBIDDEN_TEST_PATH');
  }
  assertCommand(run('git', ['apply', '--check', '--binary', '-'], {
    cwd: repo,
    input: patchText,
    timeoutMs: 60_000,
  }), 'APFC_NO_TOOL_PATCH_CHECK_FAILED');
  assertCommand(run('git', ['apply', '--binary', '-'], {
    cwd: repo,
    input: patchText,
    timeoutMs: 60_000,
  }), 'APFC_NO_TOOL_PATCH_APPLY_FAILED');
  return files;
}

function preflightHostTask({
  publicTask,
  hiddenTask,
  labRoot,
  evidenceDir,
  dependencySpecs = DEFAULT_COMMON_TEST_DEPENDENCIES,
  installTimeoutMs = 600_000,
  testTimeoutMs = 600_000,
}) {
  if (!publicTask || !hiddenTask || publicTask.task_id !== hiddenTask.task_id) {
    throw new Error('APFC_HOST_PREFLIGHT_TASK_BINDING_INVALID');
  }
  const taskRoot = assertLabPath(path.join(labRoot, safeToken(publicTask.task_id)), labRoot);
  removeLabPath(taskRoot, labRoot);
  ensureDir(taskRoot);
  const repo = path.join(taskRoot, 'repo');
  const venv = path.join(taskRoot, 'venv');
  const startedAt = nowIso();
  let receipt;
  let baselineLog = '';
  let goldLog = '';
  try {
    const checkout = cloneExactCommit({
      repository: publicTask.repository,
      baseCommit: publicTask.base_commit,
      destination: repo,
      labRoot,
    });
    const environment = preparePythonEnvironment({ repo, venv, dependencySpecs, timeoutMs: installTimeoutMs });
    resetRepository(repo, publicTask.base_commit);
    const hiddenTestHash = applyPatch(repo, hiddenTask.test_patch, 'APFC_HOST_HIDDEN_TEST_APPLY_FAILED');
    const baselineRaw = runVerifier({ repo, venvBin: environment.venv_bin, testCommand: hiddenTask.test_command, timeoutMs: testTimeoutMs });
    baselineLog = baselineRaw.output;
    const baseline = compactAssessment(baselineRaw, hiddenTask);
    resetRepository(repo, publicTask.base_commit);
    const goldPatchHash = applyPatch(repo, hiddenTask.gold_patch, 'APFC_HOST_GOLD_PATCH_APPLY_FAILED');
    applyPatch(repo, hiddenTask.test_patch, 'APFC_HOST_GOLD_HIDDEN_TEST_APPLY_FAILED');
    const goldRaw = runVerifier({ repo, venvBin: environment.venv_bin, testCommand: hiddenTask.test_command, timeoutMs: testTimeoutMs });
    goldLog = goldRaw.output;
    const gold = compactAssessment(goldRaw, hiddenTask);
    const verified = baseline.fail_to_pass_all_failed === true
      && (baseline.pass_to_pass_test_count === 0 || baseline.pass_to_pass_all_passed === true)
      && gold.expected_tests_passed === true
      && (gold.pass_to_pass_test_count === 0 || gold.pass_to_pass_all_passed === true)
      && !baseline.timed_out && !gold.timed_out;
    receipt = {
      schema_version: 1,
      receipt_type: 'apfc_host_native_task_preflight',
      backend_id: HOST_BACKEND_ID,
      evaluator_protocol_id: TEST_PROTOCOL_ID,
      task_id: publicTask.task_id,
      repository: publicTask.repository,
      base_commit: publicTask.base_commit,
      started_at: startedAt,
      completed_at: nowIso(),
      checkout,
      environment,
      hidden_test_patch_hash: hiddenTestHash,
      gold_patch_hash: goldPatchHash,
      test_command_hash: sha256Text(hiddenTask.test_command),
      baseline,
      gold,
      verified,
      laboratory_disposed: false,
    };
  } finally {
    ensureDir(evidenceDir);
    if (baselineLog) atomicWriteText(path.join(evidenceDir, 'baseline.log'), baselineLog);
    if (goldLog) atomicWriteText(path.join(evidenceDir, 'gold.log'), goldLog);
    removeLabPath(taskRoot, labRoot);
    if (receipt) {
      receipt.laboratory_disposed = !fs.existsSync(taskRoot);
      receipt.receipt_hash = sha256Json(receipt);
      atomicWriteJson(path.join(evidenceDir, 'receipt.json'), receipt);
    }
  }
  if (!receipt) throw new Error(`APFC_HOST_PREFLIGHT_DID_NOT_PRODUCE_RECEIPT:${publicTask.task_id}`);
  return receipt;
}

function hostCodexArgs({ workspace, model, prompt, responseSchema = MODEL_PATCH_RESPONSE_SCHEMA }) {
  return [
    'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
    '-C', workspace, '-m', model,
    '-c', 'model_reasoning_effort="low"',
    '--disable', 'apps', '--disable', 'plugins', '--disable', 'browser_use',
    '--disable', 'browser_use_external', '--disable', 'browser_use_full_cdp_access',
    '--disable', 'in_app_browser', '--disable', 'computer_use', '--disable', 'image_generation',
    '--disable', 'multi_agent', '--disable', 'view_image', '--disable', 'shell_tool',
    '--disable', 'unified_exec', '--disable', 'skill_search', '--disable', 'tool_suggest',
    '--disable', 'skill_mcp_dependency_install', '--output-schema', responseSchema,
    '--json', prompt,
  ];
}

function runHostCodex({
  codexBin = 'codex', model = DEFAULT_MODEL, workspace, prompt,
  responseSchema = MODEL_PATCH_RESPONSE_SCHEMA, timeoutMs = 180_000, extraEnv = {},
}) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const child = spawn(codexBin, hostCodexArgs({ workspace, model, prompt, responseSchema }), {
      cwd: workspace,
      env: hostEnvironment({ ...process.env, ...extraEnv }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({ started_at: startedAt, completed_at: nowIso(), stdout, stderr, ...payload });
    };
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ exit_status: null, timed_out: false, spawn_error: shortText(error.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ exit_status: Number.isInteger(code) ? code : null, timed_out: timedOut });
    });
  });
}

async function runHostCodexCanary({
  labRoot,
  evidenceDir,
  model = DEFAULT_MODEL,
  timeoutMs = 180_000,
}) {
  const canaryRoot = assertLabPath(path.join(labRoot, 'codex_canary'), labRoot);
  removeLabPath(canaryRoot, labRoot);
  ensureDir(canaryRoot);
  const modelWorkspace = path.join(canaryRoot, 'model_workspace');
  ensureDir(modelWorkspace);
  const prompt = [
    'This is an execution-backend canary, not a benchmark task.',
    'You have no local tools. Do not use shell, files, web search, MCP, or any other tool.',
    'Return only the JSON object required by the response schema.',
    'Its patch field must contain a valid git unified diff that changes only answer.txt',
    'from WRONG to AUTH_OK, preserving the final newline.',
    '',
    'Current file answer.txt:',
    'WRONG',
  ].join('\n');
  fs.writeFileSync(path.join(canaryRoot, 'answer.txt'), 'WRONG\n', 'utf8');
  fs.writeFileSync(path.join(canaryRoot, 'verify.js'), [
    "const fs = require('node:fs');",
    "const value = fs.readFileSync('answer.txt', 'utf8');",
    "if (value !== 'AUTH_OK\\n') process.exit(1);",
  ].join('\n') + '\n', 'utf8');
  assertCommand(run('git', ['init', '--quiet'], { cwd: canaryRoot, timeoutMs: 30_000 }), 'APFC_HOST_CANARY_GIT_INIT_FAILED');
  assertCommand(run('git', ['config', 'user.email', 'canary@md-os.invalid'], { cwd: canaryRoot }), 'APFC_HOST_CANARY_GIT_CONFIG_FAILED');
  assertCommand(run('git', ['config', 'user.name', 'MD-OS Canary'], { cwd: canaryRoot }), 'APFC_HOST_CANARY_GIT_CONFIG_FAILED');
  assertCommand(run('git', ['add', 'answer.txt', 'verify.js'], { cwd: canaryRoot }), 'APFC_HOST_CANARY_GIT_ADD_FAILED');
  assertCommand(run('git', ['commit', '--quiet', '-m', 'sealed canary'], { cwd: canaryRoot }), 'APFC_HOST_CANARY_GIT_COMMIT_FAILED');
  const raw = await runHostCodex({ model, workspace: modelWorkspace, prompt, timeoutMs });
  const parsed = parseNoToolCodexEvents(raw.stdout);
  const response = parsePatchResponse(parsed.final_text);
  let patchFiles = [];
  let patchApplyError = null;
  if (response && parsed.tool_event_types.length === 0) {
    try {
      patchFiles = applyNoToolPatch({ repo: canaryRoot, patchText: response.patch });
    } catch (error) {
      patchApplyError = shortText(error.message);
    }
  }
  const candidate = extractCandidatePatch(canaryRoot);
  const verify = run('node', ['verify.js'], { cwd: canaryRoot, timeoutMs: 30_000, env: hostEnvironment() });
  const authFailure = AUTH_FAILURE.test(`${raw.stdout}\n${raw.stderr}`);
  const verified = raw.exit_status === 0 && !raw.timed_out && !authFailure
    && response !== null && patchApplyError === null && parsed.tool_event_types.length === 0
    && verify.status === 0 && candidate.patch.length > 0
    && candidate.changed_files.length === 1 && candidate.changed_files[0] === 'answer.txt'
    && patchFiles.length === 1 && patchFiles[0] === 'answer.txt';
  ensureDir(evidenceDir);
  atomicWriteText(path.join(evidenceDir, 'codex-events.jsonl'), raw.stdout);
  atomicWriteText(path.join(evidenceDir, 'codex-stderr.log'), raw.stderr);
  const receipt = {
    schema_version: 1,
    receipt_type: 'apfc_host_native_codex_canary',
    backend_id: HOST_BACKEND_ID,
    model,
    model_reasoning_effort: 'low',
    execution_mode: 'model_no_local_tools_runner_applies_patch',
    response_schema_hash: sha256Text(fs.readFileSync(MODEL_PATCH_RESPONSE_SCHEMA, 'utf8')),
    started_at: raw.started_at,
    completed_at: raw.completed_at,
    model_exit_status: raw.exit_status,
    model_timed_out: raw.timed_out,
    authentication_failure_detected: authFailure,
    tool_event_types: parsed.tool_event_types,
    tool_use_detected: parsed.tool_event_types.length > 0,
    structured_response_valid: response !== null,
    patch_apply_error: patchApplyError,
    response_hash: sha256Text(parsed.final_text),
    changed_files: candidate.changed_files,
    candidate_patch_hash: candidate.patch_hash,
    candidate_patch_bytes: Buffer.byteLength(candidate.patch),
    verifier_exit_status: Number.isInteger(verify.status) ? verify.status : null,
    stdout_hash: sha256Text(raw.stdout),
    stderr_hash: sha256Text(raw.stderr),
    verified,
    laboratory_disposed: false,
  };
  removeLabPath(canaryRoot, labRoot);
  receipt.laboratory_disposed = !fs.existsSync(canaryRoot);
  receipt.receipt_hash = sha256Json(receipt);
  atomicWriteJson(path.join(evidenceDir, 'receipt.json'), receipt);
  return receipt;
}

module.exports = {
  AUTH_FAILURE,
  DEFAULT_COMMON_TEST_DEPENDENCIES,
  DEFAULT_MODEL,
  HOST_BACKEND_ID,
  MODEL_PATCH_RESPONSE_SCHEMA,
  applyNoToolPatch,
  applyPatch,
  assertLabPath,
  cloneExactCommit,
  compactAssessment,
  extractCandidatePatch,
  hostCodexArgs,
  hostEnvironment,
  parseNoToolCodexEvents,
  parsePatchResponse,
  patchPaths,
  preflightHostTask,
  preparePythonEnvironment,
  removeLabPath,
  resetRepository,
  runHostCodex,
  runHostCodexCanary,
  runVerifier,
};
