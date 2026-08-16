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
const { validateConnectorSnapshot, validateTerminalProfile } = require('./lib/validation');

const CONNECTOR_PROFILE = path.join(MDOS_ROOT, 'ops', 'connectors', 'terminal_connector.json');
const CONNECTOR_SNAPSHOTS_DIR = path.join(MDOS_ROOT, 'ops', 'sources', 'connectors');
const ARTIFACTS_DIR = path.join(MDOS_ROOT, 'ops', 'artifacts', 'terminal');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function readProfile() {
  if (!fs.existsSync(CONNECTOR_PROFILE)) {
    throw new Error(`CONNECTOR_PROFILE_MISSING: ${rel(CONNECTOR_PROFILE)}`);
  }
  return validateTerminalProfile(JSON.parse(fs.readFileSync(CONNECTOR_PROFILE, 'utf8')));
}

function safeId(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 120) || 'item';
}

function usage() {
  process.stderr.write(
    'Usage:\n' +
    '  node md-os/os/terminal_connector.js list\n' +
    '  node md-os/os/terminal_connector.js run <project_id> <command_id>\n'
  );
  process.exit(1);
}

function listCommands(profile) {
  const commands = Array.isArray(profile.commands) ? profile.commands : [];
  printJson({
    ok: true,
    mode: 'terminal_connector_list',
    connector_id: assertSafeId(profile.connector_id || 'terminal_executor', 'connector_id'),
    command_count: commands.length,
    commands: commands.map((item) => ({
      command_id: shortText(item.command_id),
      argv: Array.isArray(item.argv) ? item.argv : [],
      cwd: shortText(item.cwd || '.'),
      summary: shortText(item.summary || ''),
    })),
  });
}

function positiveInt(value, fallback) {
  if (value === undefined || value === null) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function truncateBytes(text, maxBytes) {
  const buffer = Buffer.from(String(text || ''), 'utf8');
  if (buffer.length <= maxBytes) return String(text || '');
  return `${buffer.subarray(0, maxBytes).toString('utf8')}\n[TRUNCATED ${buffer.length - maxBytes} BYTES]`;
}

function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactText(text, patterns) {
  let output = String(text || '');
  for (const pattern of patterns || []) {
    const marker = shortText(pattern);
    if (!marker) continue;
    const regexp = new RegExp(`${escapeRegExp(marker)}[^\\s"'&]+`, 'gi');
    output = output.replace(regexp, `${marker}[REDACTED]`);
  }
  return output;
}

function boundedOutput(text, maxBytes, redactPatterns) {
  return redactText(truncateBytes(text, maxBytes), redactPatterns);
}

function terminalSourceId(commandId, stamp) {
  const suffix = stamp.replace(/[^a-zA-Z0-9_-]/g, '_');
  const prefix = `terminal_${commandId}_`;
  const maxPrefixLength = Math.max(1, 81 - suffix.length);
  const sourceId = `${prefix.slice(0, maxPrefixLength)}${suffix}`;
  return assertSafeId(sourceId, 'source_id');
}

function runCommand(profile, projectId, commandId) {
  const commands = Array.isArray(profile.commands) ? profile.commands : [];
  const command = commands.find((item) => shortText(item.command_id) === commandId);
  if (!command) {
    throw new Error(`UNKNOWN_COMMAND_ID: ${commandId}`);
  }

  const argv = Array.isArray(command.argv) ? command.argv.map((item) => String(item)) : [];
  if (!argv.length) throw new Error(`EMPTY_ARGV: ${commandId}`);

  const cwd = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, shortText(command.cwd || '.')));
  const timeoutMs = Number.isFinite(command.timeout_ms) ? command.timeout_ms : Number.isFinite(profile.default_timeout_ms) ? profile.default_timeout_ms : 15000;
  const maxStdoutBytes = positiveInt(command.max_stdout_bytes, positiveInt(profile.max_stdout_bytes, 200000));
  const maxStderrBytes = positiveInt(command.max_stderr_bytes, positiveInt(profile.max_stderr_bytes, 200000));
  const maxBuffer = Math.max(maxStdoutBytes, maxStderrBytes, 1024);
  const redactPatterns = Array.isArray(command.redact_patterns)
    ? command.redact_patterns
    : Array.isArray(profile.redact_patterns)
      ? profile.redact_patterns
      : ['token=', 'api_key=', 'secret='];
  const startedAt = Date.now();
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH || '',
    },
    timeout: timeoutMs,
    maxBuffer,
  });
  const finishedAt = Date.now();

  const stdout = boundedOutput(result.stdout || '', maxStdoutBytes, redactPatterns);
  const stderr = boundedOutput(result.stderr || result.error && result.error.message || '', maxStderrBytes, redactPatterns);
  const statusCode = Number.isInteger(result.status) ? result.status : null;
  const ok = statusCode === 0 && !result.error;
  const ts = nowIso();
  const stamp = ts.replace(/[:.]/g, '-');

  ensureDir(ARTIFACTS_DIR);
  ensureDir(CONNECTOR_SNAPSHOTS_DIR);

  const artifactBase = `${safeId(projectId)}__${safeId(commandId)}__${stamp}`;
  const artifactPath = path.join(ARTIFACTS_DIR, `${artifactBase}.txt`);
  const artifactText = [
    `command_id: ${commandId}`,
    `project_id: ${projectId}`,
    `executed_at: ${ts}`,
    `cwd: ${rel(cwd) || '.'}`,
    `argv: ${JSON.stringify(argv)}`,
    `exit_code: ${statusCode}`,
    `duration_ms: ${finishedAt - startedAt}`,
    `max_stdout_bytes: ${maxStdoutBytes}`,
    `max_stderr_bytes: ${maxStderrBytes}`,
    '',
    '--- STDOUT ---',
    stdout,
    '',
    '--- STDERR ---',
    stderr,
  ].join('\n');
  atomicWriteTextLocked(artifactPath, `${artifactText}\n`, {
    context: `terminal_artifact:${commandId}`,
  });

  const snapshotPath = path.join(CONNECTOR_SNAPSHOTS_DIR, `${safeId(projectId)}__terminal__${safeId(commandId)}.json`);
  const sourceId = terminalSourceId(commandId, stamp);
  const snapshot = {
    schema_version: 1,
    connector_name: 'terminal_executor',
    connector_kind: 'terminal',
    project_id: projectId,
    captured_at: ts,
    signals: [
      {
        source_id: sourceId,
        captured_at: ts,
        title: shortText(command.summary || command.command_id),
        summary: shortText(command.summary || `Terminal command ${commandId} executed.`),
        status_hint: ok ? 'open' : 'waiting_external',
        priority: shortText(command.priority || 'low').toLowerCase(),
        owner_hint: 'Platform Operations',
        entities: Array.isArray(command.entities) ? command.entities.map(shortText).filter(Boolean) : [],
        tags: Array.isArray(command.tags) ? command.tags.map(shortText).filter(Boolean) : [],
        suspected_causes: ok ? [] : ['terminal_command_failure'],
        depends_on: [],
        next_step: ok ? 'Inspect terminal snapshot output and classify whether any follow-up is needed.' : 'Inspect terminal stderr/output and classify the failure.',
        external_parties: [],
        connector_runtime: {
          command_id: commandId,
          cwd: rel(cwd) || '.',
          argv,
          exit_code: statusCode,
          duration_ms: finishedAt - startedAt,
          ok,
          artifact_file: rel(artifactPath),
          max_stdout_bytes: maxStdoutBytes,
          max_stderr_bytes: maxStderrBytes,
          stdout_excerpt: shortText(stdout).slice(0, 500),
          stderr_excerpt: shortText(stderr).slice(0, 500),
          output_sha256: sha256Text(`${stdout}\n${stderr}`),
        },
      },
    ],
  };
  validateConnectorSnapshot(snapshot);
  atomicWriteJsonLocked(snapshotPath, snapshot, {
    context: `terminal_snapshot:${projectId}:${commandId}`,
  });

  appendJournal({
    event: 'terminal_connector_run',
    project_id: projectId,
    command_id: commandId,
    ok,
    exit_code: statusCode,
    duration_ms: finishedAt - startedAt,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });

  printJson({
    ok: true,
    mode: 'terminal_connector_run',
    project_id: projectId,
    command_id: commandId,
    exit_code: statusCode,
    duration_ms: finishedAt - startedAt,
    snapshot_file: rel(snapshotPath),
    artifact_file: rel(artifactPath),
  });
}

function main() {
  const profile = readProfile();
  const command = process.argv[2];
  if (!command) usage();

  if (command === 'list') {
    listCommands(profile);
    return;
  }

  if (command === 'run') {
    if (!process.argv[3] || !process.argv[4]) usage();
    const projectId = assertSafeId(process.argv[3], 'project_id');
    const commandId = assertSafeId(process.argv[4], 'command_id');
    runCommand(profile, projectId, commandId);
    return;
  }

  usage();
}

if (require.main === module) {
  main();
}

module.exports = {
  boundedOutput,
  redactText,
  terminalSourceId,
};
