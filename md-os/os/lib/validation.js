#!/usr/bin/env node
'use strict';

const { assertSafeId, shortText } = require('./common');

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`INVALID_${label}`);
  }
  return value;
}

function assertSchemaVersion(payload, label) {
  if (payload.schema_version !== 1) {
    throw new Error(`UNSUPPORTED_${label}_SCHEMA_VERSION: ${payload.schema_version}`);
  }
}

function assertStringArray(value, label, { required = false } = {}) {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new Error(`${label}_MUST_BE_ARRAY`);
  return value.map((item) => shortText(item)).filter(Boolean);
}

function validateProject(payload) {
  assertObject(payload, 'PROJECT');
  assertSchemaVersion(payload, 'PROJECT');
  assertSafeId(payload.project_id, 'project_id');
  if (!shortText(payload.title)) throw new Error('PROJECT_TITLE_REQUIRED');
  return payload;
}

function validateSignal(signal, index) {
  assertObject(signal, `SIGNAL_${index}`);
  if (signal.source_id !== undefined) assertSafeId(signal.source_id, 'source_id');
  if (signal.depends_on !== undefined) {
    for (const sourceId of assertStringArray(signal.depends_on, 'SIGNAL_DEPENDS_ON')) {
      assertSafeId(sourceId, 'source_id');
    }
  }
  return signal;
}

function validateConnectorSnapshot(payload) {
  assertObject(payload, 'SNAPSHOT');
  assertSchemaVersion(payload, 'SNAPSHOT');

  const hasProjectId = payload.project_id !== undefined;
  const hasProjectIds = payload.project_ids !== undefined;
  if (!hasProjectId && !hasProjectIds) throw new Error('SNAPSHOT_PROJECT_REQUIRED');
  if (hasProjectId) assertSafeId(payload.project_id, 'project_id');
  if (hasProjectIds) {
    for (const projectId of assertStringArray(payload.project_ids, 'SNAPSHOT_PROJECT_IDS', { required: true })) {
      assertSafeId(projectId, 'project_id');
    }
  }

  if (!Array.isArray(payload.signals)) throw new Error('SNAPSHOT_SIGNALS_MUST_BE_ARRAY');
  payload.signals.forEach((signal, index) => validateSignal(signal, index));
  return payload;
}

function validateConnectorRegistry(payload) {
  assertObject(payload, 'CONNECTOR_REGISTRY');
  assertSchemaVersion(payload, 'CONNECTOR_REGISTRY');
  if (!Array.isArray(payload.connectors)) throw new Error('CONNECTOR_REGISTRY_CONNECTORS_MUST_BE_ARRAY');
  for (const connector of payload.connectors) {
    assertObject(connector, 'CONNECTOR_REGISTRY_ENTRY');
    assertSafeId(connector.connector_id, 'connector_id');
  }
  return payload;
}

function validateTerminalProfile(payload) {
  assertObject(payload, 'TERMINAL_PROFILE');
  assertSchemaVersion(payload, 'TERMINAL_PROFILE');
  assertSafeId(payload.connector_id || 'terminal_executor', 'connector_id');
  if (!Array.isArray(payload.commands)) throw new Error('TERMINAL_COMMANDS_MUST_BE_ARRAY');

  const seen = new Set();
  for (const command of payload.commands) {
    assertObject(command, 'TERMINAL_COMMAND');
    const commandId = assertSafeId(command.command_id, 'command_id');
    if (seen.has(commandId)) throw new Error(`DUPLICATE_COMMAND_ID: ${commandId}`);
    seen.add(commandId);
    if (!Array.isArray(command.argv) || command.argv.length === 0) {
      throw new Error(`EMPTY_ARGV: ${commandId}`);
    }
    for (const item of command.argv) {
      if (!shortText(item)) throw new Error(`INVALID_ARGV_ITEM: ${commandId}`);
    }
  }

  return payload;
}

const WOLFRAM_EPISTEMIC_STATUSES = new Set([
  'heuristic',
  'conditional',
  'derived',
  'retrodictive',
  'predictive',
  'open',
  'falsified',
]);

function validateWolframCalculation(calculation, label = 'WOLFRAM_CALCULATION') {
  assertObject(calculation, label);
  const calculationId = assertSafeId(calculation.calculation_id, 'calculation_id');
  const hasInlineCode = Boolean(shortText(calculation.wolfram_code));
  const hasScriptPath = Boolean(shortText(calculation.script_path));
  if (hasInlineCode === hasScriptPath) {
    throw new Error(`WOLFRAM_CALCULATION_REQUIRES_EXACTLY_ONE_SOURCE: ${calculationId}`);
  }
  if (!shortText(calculation.summary)) {
    throw new Error(`WOLFRAM_CALCULATION_SUMMARY_REQUIRED: ${calculationId}`);
  }
  const status = shortText(calculation.epistemic_status || 'open').toLowerCase();
  if (!WOLFRAM_EPISTEMIC_STATUSES.has(status)) {
    throw new Error(`INVALID_WOLFRAM_EPISTEMIC_STATUS: ${calculationId}:${status}`);
  }
  if (calculation.expected_gates !== undefined) {
    assertStringArray(calculation.expected_gates, 'WOLFRAM_EXPECTED_GATES');
  }
  return calculation;
}

function validateWolframProfile(payload) {
  assertObject(payload, 'WOLFRAM_PROFILE');
  assertSchemaVersion(payload, 'WOLFRAM_PROFILE');
  assertSafeId(payload.connector_id || 'wolfram_connector', 'connector_id');
  if (payload.engine_argv !== undefined) {
    const argv = assertStringArray(payload.engine_argv, 'WOLFRAM_ENGINE_ARGV', { required: true });
    if (!argv.length) throw new Error('WOLFRAM_ENGINE_ARGV_REQUIRED');
  }
  if (payload.allowed_script_roots !== undefined) {
    assertStringArray(payload.allowed_script_roots, 'WOLFRAM_ALLOWED_SCRIPT_ROOTS', { required: true });
  }
  if (payload.calculations !== undefined && !Array.isArray(payload.calculations)) {
    throw new Error('WOLFRAM_CALCULATIONS_MUST_BE_ARRAY');
  }
  const seen = new Set();
  for (const calculation of payload.calculations || []) {
    const calculationId = assertSafeId(calculation && calculation.calculation_id, 'calculation_id');
    if (seen.has(calculationId)) throw new Error(`DUPLICATE_CALCULATION_ID: ${calculationId}`);
    seen.add(calculationId);
    validateWolframCalculation(calculation);
  }
  return payload;
}

module.exports = {
  WOLFRAM_EPISTEMIC_STATUSES,
  validateConnectorRegistry,
  validateConnectorSnapshot,
  validateProject,
  validateSignal,
  validateTerminalProfile,
  validateWolframCalculation,
  validateWolframProfile,
};
