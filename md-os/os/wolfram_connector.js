#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  assertSafeId,
  nowIso,
  printJson,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJsonLocked, atomicWriteTextLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const {
  validateConnectorRegistry,
  validateConnectorSnapshot,
  validateWolframCalculation,
  validateWolframProfile,
} = require('./lib/validation');
const { boundedOutput } = require('./terminal_connector');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const CONNECTOR_PROFILE = path.join(OPS_DIR, 'connectors', 'wolfram_connector.json');
const CONNECTOR_REGISTRY = path.join(OPS_DIR, 'connectors', 'connector_registry.json');
const CALCULATION_REGISTRY_DIR = path.join(OPS_DIR, 'calculations', 'wolfram');
const LOCAL_WOLFRAM_DIR = path.join(OPS_DIR, 'local', 'wolfram');
const CONNECTOR_SNAPSHOTS_DIR = path.join(OPS_DIR, 'sources', 'connectors');
const ARTIFACTS_DIR = path.join(OPS_DIR, 'artifacts', 'wolfram');
const DEFAULT_ENGINE_ARGV = ['wolframscript', '-local'];
const DEFAULT_ALLOWED_SCRIPT_ROOTS = [
  'md-os/ops/local/wolfram',
  'md-os/ops/calculations/wolfram/scripts',
];
const DEFAULT_MAX_SOURCE_BYTES = 200000;
const FORBIDDEN_WOLFRAM_IO = /\b(?:Run|RunProcess|StartProcess|SystemOpen|ExternalEvaluate|Install|Import|Get|Needs|URLRead|URLExecute|URLFetch|SocketConnect|DeleteFile|RenameFile|CopyFile|CreateFile|CreateDirectory|DeleteDirectory|OpenWrite|OpenAppend|Put|PutAppend|Export|Write|WriteString|BinaryWrite|SetDirectory)\s*\[/;

const DEFAULT_PROFILE = {
  schema_version: 1,
  connector_id: 'wolfram_connector',
  engine_argv: DEFAULT_ENGINE_ARGV,
  default_timeout_ms: 30000,
  max_output_bytes: 200000,
  max_source_bytes: DEFAULT_MAX_SOURCE_BYTES,
  allowed_script_roots: DEFAULT_ALLOWED_SCRIPT_ROOTS,
  calculation_registry_dir: 'md-os/ops/calculations/wolfram',
  redact_patterns: [],
  calculations: [
    {
      calculation_id: 'wolfram_smoke_symbolic_derivative',
      wolfram_code: 'FullSimplify[D[x^2, x] == 2 x]',
      summary: 'Smoke-test symbolic differentiation through the bounded Wolfram connector.',
      timeout_ms: 10000,
      max_output_bytes: 20000,
      epistemic_status: 'derived',
      expected_gates: ['symbolicDerivativeGate'],
      tags: ['wolfram', 'smoke_test', 'symbolic'],
      entities: ['wolfram_engine'],
    },
  ],
};

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function safeId(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'item';
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex connector wolfram bootstrap',
    '  cortex connector wolfram list',
    '  cortex connector wolfram run <project_id> <calculation_id>',
    '  cortex wolfram <bootstrap|list|run> [project_id] [calculation_id]',
    '  node md-os/os/wolfram_connector.js <bootstrap|list|run> ...',
    '',
  ].join('\n'));
  process.exit(1);
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function ensureProfileFile() {
  if (fs.existsSync(CONNECTOR_PROFILE)) return false;
  ensureDir(path.dirname(CONNECTOR_PROFILE));
  atomicWriteJsonLocked(CONNECTOR_PROFILE, DEFAULT_PROFILE, {
    context: 'wolfram_connector_seed_profile',
  });
  return true;
}

function readProfile({ createIfMissing = false } = {}) {
  if (createIfMissing) ensureProfileFile();
  if (!fs.existsSync(CONNECTOR_PROFILE)) {
    throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(CONNECTOR_PROFILE)}`);
  }
  return validateWolframProfile(JSON.parse(fs.readFileSync(CONNECTOR_PROFILE, 'utf8')));
}

function calculationRegistryDir(profile) {
  const configured = shortText(profile.calculation_registry_dir || 'md-os/ops/calculations/wolfram');
  return assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, configured));
}

function readRegistryCalculations(registryDir) {
  if (!fs.existsSync(registryDir)) return [];
  return fs.readdirSync(registryDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((entry) => {
      const filePath = path.join(registryDir, entry.name);
      const payload = readJsonSafe(filePath);
      if (!payload || payload.schema_version !== 1) {
        throw new Error(`UNSUPPORTED_WOLFRAM_CALCULATION_SCHEMA_VERSION: ${entry.name}`);
      }
      return {
        ...validateWolframCalculation(payload, `WOLFRAM_CALCULATION:${entry.name}`),
        registry_file: rel(filePath),
      };
    });
}

function allCalculations(profile) {
  const calculations = [
    ...(Array.isArray(profile.calculations) ? profile.calculations : []),
    ...readRegistryCalculations(calculationRegistryDir(profile)),
  ];
  const seen = new Map();
  for (const calculation of calculations) {
    const calculationId = assertSafeId(calculation.calculation_id, 'calculation_id');
    if (seen.has(calculationId)) throw new Error(`DUPLICATE_CALCULATION_ID: ${calculationId}`);
    seen.set(calculationId, validateWolframCalculation(calculation));
  }
  return Array.from(seen.values()).sort((left, right) => {
    return shortText(left.calculation_id).localeCompare(shortText(right.calculation_id));
  });
}

function listCalculations(profile) {
  const calculations = allCalculations(profile);
  printJson({
    ok: true,
    mode: 'wolfram_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'wolfram_connector', 'connector_id'),
    profile_file: rel(CONNECTOR_PROFILE),
    calculation_registry_dir: rel(calculationRegistryDir(profile)),
    calculation_count: calculations.length,
    calculations: calculations.map((item) => ({
      calculation_id: shortText(item.calculation_id),
      project_id: shortText(item.project_id || ''),
      source: item.script_path ? 'script_path' : 'wolfram_code',
      script_path: shortText(item.script_path || ''),
      summary: shortText(item.summary || ''),
      epistemic_status: shortText(item.epistemic_status || 'open').toLowerCase(),
      priority: shortText(item.priority || 'low'),
      expected_gates: Array.isArray(item.expected_gates) ? item.expected_gates.map(shortText).filter(Boolean) : [],
      tags: Array.isArray(item.tags) ? item.tags.map(shortText).filter(Boolean) : [],
    })),
  });
}

function engineArgv(profile) {
  const engine = Array.isArray(profile.engine_argv) && profile.engine_argv.length
    ? profile.engine_argv.map((item) => String(item)).filter(Boolean)
    : DEFAULT_ENGINE_ARGV;
  if (path.basename(engine[0] || '') !== 'wolframscript') {
    throw new Error('WOLFRAM_EXECUTABLE_NOT_ALLOWED: expected wolframscript');
  }
  const flags = engine.slice(1);
  if (flags.some((flag) => flag !== '-local')) {
    throw new Error(`WOLFRAM_ENGINE_FLAG_NOT_ALLOWED: ${flags.join(' ')}`);
  }
  return engine;
}

function allowedScriptRoots(profile) {
  const roots = Array.isArray(profile.allowed_script_roots) && profile.allowed_script_roots.length
    ? profile.allowed_script_roots
    : DEFAULT_ALLOWED_SCRIPT_ROOTS;
  return roots.map((root) => shortText(root).replace(/\\/g, '/').replace(/\/+$/, '')).filter(Boolean);
}

function assertAllowedScriptPath(profile, scriptPath) {
  const resolved = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(scriptPath)));
  const relative = rel(resolved);
  const allowed = allowedScriptRoots(profile).some((root) => relative === root || relative.startsWith(`${root}/`));
  if (!allowed) throw new Error(`WOLFRAM_SCRIPT_PATH_NOT_ALLOWED: ${relative}`);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    throw new Error(`WOLFRAM_SCRIPT_MISSING: ${relative}`);
  }
  if (path.extname(resolved).toLowerCase() !== '.wl') {
    throw new Error(`WOLFRAM_SCRIPT_EXTENSION_REQUIRED: ${relative}`);
  }
  return resolved;
}

function assertBoundedCalculationSource(profile, calculation, sourceText) {
  const maxSourceBytes = positiveInt(calculation.max_source_bytes, positiveInt(profile.max_source_bytes, DEFAULT_MAX_SOURCE_BYTES));
  const sourceBytes = Buffer.byteLength(sourceText, 'utf8');
  if (sourceBytes > maxSourceBytes) {
    throw new Error(`WOLFRAM_SOURCE_TOO_LARGE: ${sourceBytes} > ${maxSourceBytes}`);
  }
  if (FORBIDDEN_WOLFRAM_IO.test(sourceText)) {
    throw new Error(`WOLFRAM_EXTERNAL_IO_FORBIDDEN: ${calculation.calculation_id}`);
  }
  return maxSourceBytes;
}

function wolframSource(profile, calculation) {
  if (calculation.script_path) {
    const scriptPath = assertAllowedScriptPath(profile, calculation.script_path);
    const scriptText = fs.readFileSync(scriptPath, 'utf8');
    const maxSourceBytes = assertBoundedCalculationSource(profile, calculation, scriptText);
    return {
      mode: 'script_path',
      argv_suffix: ['-file', scriptPath],
      source_text: scriptText,
      source_sha256: sha256Text(scriptText),
      script_path: rel(scriptPath),
      max_source_bytes: maxSourceBytes,
    };
  }
  const wolframCode = String(calculation.wolfram_code || '');
  const maxSourceBytes = assertBoundedCalculationSource(profile, calculation, wolframCode);
  return {
    mode: 'wolfram_code',
    argv_suffix: ['-code', wolframCode],
    source_text: wolframCode,
    source_sha256: sha256Text(wolframCode),
    script_path: null,
    max_source_bytes: maxSourceBytes,
  };
}

function wolframSourceId(calculationId, stamp) {
  const suffix = stamp.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = `wolfram_${safeId(calculationId)}_`;
  const maxPrefixLength = Math.max(1, 81 - suffix.length);
  return assertSafeId(`${prefix.slice(0, maxPrefixLength)}${suffix}`, 'source_id');
}

function runWolframProcess(argv, timeoutMs, maxBuffer) {
  const startedAt = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
    },
    timeout: timeoutMs,
    maxBuffer,
  });
  return { result, duration_ms: Date.now() - startedAt };
}

function executeCalculation(profile, projectId, calculationId) {
  const calculation = allCalculations(profile).find((item) => shortText(item.calculation_id) === calculationId);
  if (!calculation) throw new Error(`UNKNOWN_CALCULATION_ID: ${calculationId}`);

  const source = wolframSource(profile, calculation);
  const engine = engineArgv(profile);
  const argv = [...engine, ...source.argv_suffix];
  const timeoutMs = positiveInt(calculation.timeout_ms, positiveInt(profile.default_timeout_ms, 30000));
  const maxOutputBytes = positiveInt(calculation.max_output_bytes, positiveInt(profile.max_output_bytes, 200000));
  const maxBuffer = Math.max(maxOutputBytes * 2, 1024);
  const redactPatterns = Array.isArray(calculation.redact_patterns)
    ? calculation.redact_patterns
    : Array.isArray(profile.redact_patterns) ? profile.redact_patterns : [];

  const { result, duration_ms: durationMs } = runWolframProcess(argv, timeoutMs, maxBuffer);
  const stdout = boundedOutput(result.stdout || '', maxOutputBytes, redactPatterns);
  const stderr = boundedOutput(result.stderr || result.error && result.error.message || '', maxOutputBytes, redactPatterns);
  const statusCode = Number.isInteger(result.status) ? result.status : null;
  const ok = statusCode === 0 && !result.error;
  const epistemicStatus = shortText(calculation.epistemic_status || 'open').toLowerCase();
  const expectedGates = Array.isArray(calculation.expected_gates) ? calculation.expected_gates.map(shortText).filter(Boolean) : [];
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');

  ensureDir(ARTIFACTS_DIR);
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);
  const artifactBase = `${safeId(projectId)}__${safeId(calculationId)}__${stamp}`;
  const artifactPath = path.join(ARTIFACTS_DIR, `${artifactBase}.txt`);
  const artifactText = [
    `calculation_id: ${calculationId}`,
    `project_id: ${projectId}`,
    `executed_at: ${ts}`,
    `source_mode: ${source.mode}`,
    `script_path: ${source.script_path || ''}`,
    `source_sha256: ${source.source_sha256}`,
    `epistemic_status: ${epistemicStatus}`,
    `expected_gates: ${JSON.stringify(expectedGates)}`,
    `argv: ${JSON.stringify(source.mode === 'script_path' ? [...engine, '-file', source.script_path] : argv)}`,
    `exit_code: ${statusCode}`,
    `duration_ms: ${durationMs}`,
    `max_source_bytes: ${source.max_source_bytes}`,
    `max_output_bytes: ${maxOutputBytes}`,
    '',
    source.mode === 'script_path' ? '--- WOLFRAM SCRIPT SHA256 ---' : '--- WOLFRAM CODE ---',
    source.mode === 'script_path' ? source.source_sha256 : source.source_text,
    '',
    '--- STDOUT ---',
    stdout,
    '',
    '--- STDERR ---',
    stderr,
  ].join('\n');
  atomicWriteTextLocked(artifactPath, `${artifactText}\n`, { context: `wolfram_artifact:${calculationId}` });

  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, `${safeId(projectId)}__wolfram__${safeId(calculationId)}.json`);
  const snapshot = {
    schema_version: 1,
    connector_name: 'wolfram_connector',
    connector_kind: 'mathematics',
    project_id: projectId,
    captured_at: ts,
    signals: [{
      source_id: wolframSourceId(calculationId, stamp),
      captured_at: ts,
      title: shortText(calculation.title || calculation.summary || calculation.calculation_id),
      summary: shortText(calculation.summary || `Wolfram calculation ${calculationId} executed.`),
      status_hint: ok ? 'open' : 'waiting_external',
      priority: shortText(calculation.priority || 'low').toLowerCase(),
      owner_hint: shortText(calculation.owner_hint || 'MD-OS Runtime'),
      entities: Array.isArray(calculation.entities) ? calculation.entities.map(shortText).filter(Boolean) : ['wolfram_engine'],
      tags: Array.isArray(calculation.tags) ? calculation.tags.map(shortText).filter(Boolean) : ['mathematics', 'wolfram'],
      suspected_causes: ok ? [] : ['wolfram_calculation_failure'],
      depends_on: [],
      next_step: shortText(calculation.next_step || 'Interpret this result in MD-OS and preserve its epistemic status.'),
      external_parties: [],
      connector_runtime: {
        calculation_id: calculationId,
        source_mode: source.mode,
        script_path: source.script_path,
        engine_argv: engine,
        exit_code: statusCode,
        duration_ms: durationMs,
        ok,
        timed_out: Boolean(result.error && result.error.code === 'ETIMEDOUT'),
        artifact_file: rel(artifactPath),
        max_source_bytes: source.max_source_bytes,
        max_output_bytes: maxOutputBytes,
        source_sha256: source.source_sha256,
        output_sha256: sha256Text(`${stdout}\n${stderr}`),
        stdout_excerpt: shortText(stdout).slice(0, 500),
        stderr_excerpt: shortText(stderr).slice(0, 500),
        epistemic_status: epistemicStatus,
        expected_gates: expectedGates,
      },
    }],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, { context: `wolfram_snapshot:${projectId}:${calculationId}` });

  appendJournal({
    event: 'wolfram_connector_run',
    project_id: projectId,
    calculation_id: calculationId,
    source_mode: source.mode,
    script_path: source.script_path,
    epistemic_status: epistemicStatus,
    ok,
    exit_code: statusCode,
    duration_ms: durationMs,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });

  return {
    ok,
    mode: 'wolfram_connector_run',
    project_id: projectId,
    calculation_id: calculationId,
    source_mode: source.mode,
    script_path: source.script_path,
    epistemic_status: epistemicStatus,
    exit_code: statusCode,
    duration_ms: durationMs,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  };
}

function bootstrapCalculationRegistry(profile) {
  const registryDir = calculationRegistryDir(profile);
  ensureDir(registryDir);
  ensureDir(LOCAL_WOLFRAM_DIR);
  const scripts = fs.readdirSync(LOCAL_WOLFRAM_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.wl'))
    .map((entry) => entry.name)
    .sort();
  const created = [];
  const existing = new Set([
    ...readRegistryCalculations(registryDir).map((item) => shortText(item.calculation_id)),
    ...(Array.isArray(profile.calculations) ? profile.calculations.map((item) => shortText(item.calculation_id)) : []),
  ].filter(Boolean));
  for (const scriptName of scripts) {
    const calculationId = assertSafeId(path.basename(scriptName, '.wl'), 'calculation_id');
    if (existing.has(calculationId)) continue;
    const payload = {
      schema_version: 1,
      calculation_id: calculationId,
      project_id: 'demo_general_system',
      script_path: `md-os/ops/local/wolfram/${scriptName}`,
      summary: `Run Wolfram script ${calculationId.replace(/_/g, ' ')}.`,
      timeout_ms: positiveInt(profile.default_timeout_ms, 30000),
      max_output_bytes: positiveInt(profile.max_output_bytes, 200000),
      epistemic_status: 'conditional',
      expected_gates: [],
      tags: ['wolfram', 'script_backed'],
      entities: ['wolfram_engine'],
    };
    validateWolframCalculation(payload);
    const target = path.join(registryDir, `${calculationId}.json`);
    atomicWriteJsonLocked(target, payload, { context: `wolfram_calculation_registry:${calculationId}` });
    created.push(rel(target));
  }
  return {
    registry_dir: rel(registryDir),
    local_script_dir: rel(LOCAL_WOLFRAM_DIR),
    discovered_script_count: scripts.length,
    created_profile_count: created.length,
    created_profiles: created,
  };
}

function checkWolframAvailability(profile) {
  const engine = engineArgv(profile);
  const version = spawnSync(engine[0], [...engine.slice(1), '-version'], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '' },
    timeout: 5000,
    maxBuffer: 20000,
  });
  return {
    engine_argv: engine,
    available: version.status === 0 && !version.error,
    exit_code: Number.isInteger(version.status) ? version.status : null,
    stdout: shortText(version.stdout || '').slice(0, 500),
    stderr: shortText(version.stderr || version.error && version.error.message || '').slice(0, 500),
  };
}

function updateConnectorRegistry(availability) {
  ensureDir(path.dirname(CONNECTOR_REGISTRY));
  const registry = readJsonSafe(CONNECTOR_REGISTRY) || {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [],
  };
  if (!Array.isArray(registry.connectors)) registry.connectors = [];
  const entry = {
    connector_id: 'wolfram_connector',
    name: 'Wolfram Connector',
    kind: 'mathematics',
    status: availability.available ? 'ready' : 'missing_host_prerequisite',
    implemented: true,
    execution_mode: 'bounded_symbolic_script_or_code',
    permission_profile: 'shell_safe',
    risk_level: 'medium',
    requires_approval: false,
    dry_run_support: false,
    read_capabilities: ['wolfram_profile_read', 'wolfram_script_hashing', 'mathematical_output_capture'],
    write_capabilities: ['bounded_wolframscript_execution', 'wolfram_artifact_emit', 'connector_snapshot_emit'],
    allowed_commands: ['wolframscript'],
    allowed_paths: [
      'md-os/ops/connectors/wolfram_connector.json',
      'md-os/ops/calculations/wolfram/**',
      'md-os/ops/local/wolfram/**',
      'md-os/ops/artifacts/wolfram/**',
      'md-os/ops/sources/connectors/*__wolfram__*.json',
    ],
    side_effects: 'Runs one registered Wolfram calculation and writes bounded artifacts, snapshots, profiles, and journal events inside md-os/ops/.',
    rollback_or_recovery_note: 'Remove generated calculation artifacts and snapshots; retain or review source profiles and local scripts separately.',
    audit_rule: 'Every run records source and output hashes, exit status, duration, artifact path, snapshot path, and epistemic status.',
    notes: availability.available
      ? 'Bounded local Wolfram calculation connector backed by wolframscript.'
      : 'Connector configured, but wolframscript is not available on this host PATH.',
  };
  const index = registry.connectors.findIndex((item) => shortText(item.connector_id) === 'wolfram_connector');
  if (index >= 0) registry.connectors[index] = { ...registry.connectors[index], ...entry };
  else registry.connectors.push(entry);
  registry.updated_at = nowIso();
  validateConnectorRegistry(registry);
  atomicWriteJsonLocked(CONNECTOR_REGISTRY, registry, { context: 'wolfram_connector_registry_update' });
  return rel(CONNECTOR_REGISTRY);
}

function writeAvailabilitySnapshot(availability, smokeRun) {
  const ts = nowIso();
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);
  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, 'demo_general_system__wolfram__bootstrap.json');
  const snapshot = {
    schema_version: 1,
    connector_name: 'wolfram_connector',
    connector_kind: 'mathematics',
    project_id: 'demo_general_system',
    captured_at: ts,
    signals: [{
      source_id: wolframSourceId('bootstrap', ts.replace(/[:.]/g, '-')),
      captured_at: ts,
      title: 'Wolfram connector bootstrap availability',
      summary: availability.available
        ? 'wolframscript is available for bounded local MD-OS calculations.'
        : 'wolframscript is unavailable; registered calculation profiles cannot execute on this host.',
      status_hint: availability.available ? 'open' : 'waiting_external',
      priority: 'medium',
      owner_hint: 'MD-OS Runtime',
      entities: ['wolfram_engine'],
      tags: ['wolfram', 'bootstrap', 'connector'],
      suspected_causes: availability.available ? [] : ['missing_host_prerequisite'],
      depends_on: [],
      next_step: availability.available
        ? 'Run a registered calculation through cortex wolfram run.'
        : 'Install or expose wolframscript on PATH, then rerun the bootstrap.',
      external_parties: [],
      connector_runtime: {
        engine_argv: availability.engine_argv,
        available: availability.available,
        version_stdout: availability.stdout,
        version_stderr: availability.stderr,
        smoke_ok: smokeRun ? smokeRun.ok : null,
        smoke_snapshot_file: smokeRun && smokeRun.snapshot_file || null,
        smoke_artifact_file: smokeRun && smokeRun.artifact_file || null,
        epistemic_status: 'derived',
      },
    }],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, { context: 'wolfram_bootstrap_snapshot' });
  return rel(snapshotPath);
}

function bootstrap() {
  ensureDir(ARTIFACTS_DIR);
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);
  ensureDir(CALCULATION_REGISTRY_DIR);
  ensureDir(LOCAL_WOLFRAM_DIR);
  const profileCreated = ensureProfileFile();
  const profile = readProfile();
  const calculationRegistry = bootstrapCalculationRegistry(profile);
  const availability = checkWolframAvailability(profile);
  const connectorRegistryFile = updateConnectorRegistry(availability);
  const smokeRun = availability.available
    ? executeCalculation(profile, 'demo_general_system', 'wolfram_smoke_symbolic_derivative')
    : null;
  const availabilitySnapshotFile = writeAvailabilitySnapshot(availability, smokeRun);
  appendJournal({
    event: 'wolfram_connector_bootstrap',
    available: availability.available,
    smoke_ok: smokeRun ? smokeRun.ok : null,
    profile_created: profileCreated,
    connector_registry_file: connectorRegistryFile,
    availability_snapshot_file: availabilitySnapshotFile,
    discovered_script_count: calculationRegistry.discovered_script_count,
    created_profile_count: calculationRegistry.created_profile_count,
  });
  return {
    ok: availability.available ? Boolean(smokeRun && smokeRun.ok) : true,
    mode: 'wolfram_bootstrap',
    profile_file: rel(CONNECTOR_PROFILE),
    profile_created: profileCreated,
    connector_registry_file: connectorRegistryFile,
    availability,
    calculation_registry: calculationRegistry,
    artifacts_dir: rel(ARTIFACTS_DIR),
    sources_dir: rel(CONNECTOR_SNAPSHOTS_DIR),
    availability_snapshot_file: availabilitySnapshotFile,
    smoke_run: smokeRun,
  };
}

function main() {
  const command = process.argv[2];
  if (!command) usage();
  if (command === 'bootstrap') {
    printJson(bootstrap());
    return;
  }
  const profile = readProfile();
  if (command === 'list') {
    listCalculations(profile);
    return;
  }
  if (command === 'run') {
    if (!process.argv[3] || !process.argv[4]) usage();
    const projectId = assertSafeId(process.argv[3], 'project_id');
    const calculationId = assertSafeId(process.argv[4], 'calculation_id');
    const result = executeCalculation(profile, projectId, calculationId);
    printJson(result);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  usage();
}

if (require.main === module) main();

module.exports = {
  allCalculations,
  assertBoundedCalculationSource,
  bootstrap,
  checkWolframAvailability,
  engineArgv,
  executeCalculation,
  readProfile,
};
