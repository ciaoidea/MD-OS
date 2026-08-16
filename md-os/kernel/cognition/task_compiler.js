#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideRoot,
  assertSafeId,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function slug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 38) || 'task';
}

function assertInsideMdos(targetPath, label = 'path') {
  return assertInsideRoot(
    targetPath,
    MDOS_ROOT,
    `${String(label).toUpperCase()}_OUTSIDE_MD_OS_BOUNDARY`
  );
}

function normalizeMdosPath(value, label) {
  const text = shortText(value);
  if (!text) throw new Error(`${label.toUpperCase()}_PATH_REQUIRED`);
  const resolved = assertInsideMdos(path.resolve(WORKSPACE_ROOT, text), label);
  return rel(resolved);
}

function stringArray(value, label) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${label.toUpperCase()}_MUST_BE_ARRAY`);
  return value.map(shortText).filter(Boolean);
}

function objectArray(value, label, normalize) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new Error(`${label.toUpperCase()}_MUST_BE_ARRAY`);
  return value.map(normalize);
}

function assertUnique(items, field, label) {
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item[field])) throw new Error(`DUPLICATE_${label.toUpperCase()}: ${item[field]}`);
    seen.add(item[field]);
  }
}

function normalizeCommandReference(value, label, index) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label.toUpperCase()}_${index}_MUST_BE_OBJECT`);
  }
  const connectorId = assertSafeId(value.connector_id || 'terminal_executor', 'connector_id');
  if (connectorId !== 'terminal_executor') {
    throw new Error(`UNSUPPORTED_COGNITIVE_CONNECTOR: ${connectorId}`);
  }
  const commandId = assertSafeId(value.command_id, 'command_id');
  const projectId = assertSafeId(value.project_id || 'cognitive_transaction', 'project_id');
  const expectedExitStatus = value.expected_exit_status === undefined
    ? 0
    : Number(value.expected_exit_status);
  if (!Number.isInteger(expectedExitStatus)) {
    throw new Error(`INVALID_EXPECTED_EXIT_STATUS: ${commandId}`);
  }
  return {
    ...value,
    [`${label.slice(0, -1)}_id`]: assertSafeId(
      value[`${label.slice(0, -1)}_id`] || `${label.slice(0, -1)}_${index + 1}`,
      `${label.slice(0, -1)}_id`
    ),
    connector_id: connectorId,
    project_id: projectId,
    command_id: commandId,
    expected_exit_status: expectedExitStatus,
  };
}

function normalizeEvidence(value, index) {
  const evidence = typeof value === 'string' ? { path: value } : value;
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) {
    throw new Error(`REQUIRED_EVIDENCE_${index}_MUST_BE_OBJECT_OR_PATH`);
  }
  return {
    evidence_id: assertSafeId(evidence.evidence_id || `evidence_${index + 1}`, 'evidence_id'),
    path: normalizeMdosPath(evidence.path, `required_evidence_${index}`),
    must_exist: evidence.must_exist !== false,
    sha256: shortText(evidence.sha256) || null,
  };
}

function normalizeObservationTarget(value, index) {
  const target = typeof value === 'string' ? { path: value } : value;
  if (!target || typeof target !== 'object' || Array.isArray(target)) {
    throw new Error(`OBSERVATION_TARGET_${index}_MUST_BE_OBJECT_OR_PATH`);
  }
  return {
    target_id: assertSafeId(target.target_id || `target_${index + 1}`, 'target_id'),
    path: normalizeMdosPath(target.path, `observation_target_${index}`),
    required_change: target.required_change !== false,
  };
}

function taskSpecId(goal, createdAt) {
  const stamp = String(createdAt)
    .replace(/[-:.]/g, '_')
    .replace('T', 't')
    .replace('Z', 'z');
  return `task_${stamp}_${slug(goal)}_${sha256Text(goal).slice(0, 8)}`;
}

function loadTaskSpec(taskSpecPath) {
  if (!taskSpecPath) return { raw: {}, source_file: null };
  const resolved = assertInsideMdos(path.resolve(WORKSPACE_ROOT, taskSpecPath), 'task_spec');
  if (!rel(resolved).startsWith('md-os/ops/tasks/')) {
    throw new Error(`TASK_SPEC_OUTSIDE_LIVE_TASK_DIRECTORY: ${rel(resolved)}`);
  }
  if (!fs.existsSync(resolved)) throw new Error(`TASK_SPEC_NOT_FOUND: ${rel(resolved)}`);
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`TASK_SPEC_INVALID_JSON: ${rel(resolved)}: ${error.message}`);
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`TASK_SPEC_MUST_BE_OBJECT: ${rel(resolved)}`);
  }
  return { raw, source_file: rel(resolved) };
}

function compileTaskSpec({ task = '', taskSpecPath = '', createdAt }) {
  const { raw, source_file: sourceFile } = loadTaskSpec(taskSpecPath);
  if (raw.schema_version !== undefined && raw.schema_version !== 1) {
    throw new Error(`UNSUPPORTED_TASK_SPEC_SCHEMA_VERSION: ${raw.schema_version}`);
  }
  const goal = shortText(raw.goal || task);
  if (!goal) throw new Error('TASK_SPEC_GOAL_REQUIRED');
  if (task && raw.goal && shortText(task) !== shortText(raw.goal)) {
    throw new Error('TASK_AND_TASK_SPEC_GOAL_MISMATCH');
  }

  const actions = objectArray(raw.actions, 'actions', (item, index) => normalizeCommandReference(item, 'actions', index));
  const acceptanceTests = objectArray(raw.acceptance_tests, 'acceptance_tests', (item, index) => normalizeCommandReference(item, 'acceptance_tests', index));
  const requiredEvidence = objectArray(raw.required_evidence, 'required_evidence', normalizeEvidence);
  const observationTargets = objectArray(raw.observation_targets, 'observation_targets', normalizeObservationTarget);
  assertUnique(actions, 'action_id', 'action_id');
  assertUnique(acceptanceTests, 'acceptance_test_id', 'acceptance_test_id');
  assertUnique(requiredEvidence, 'evidence_id', 'evidence_id');
  assertUnique(observationTargets, 'target_id', 'target_id');
  if (raw.success_definition !== undefined && (!raw.success_definition || typeof raw.success_definition !== 'object' || Array.isArray(raw.success_definition))) {
    throw new Error('SUCCESS_DEFINITION_MUST_BE_OBJECT');
  }
  if (raw.risk_budget !== undefined && (!raw.risk_budget || typeof raw.risk_budget !== 'object' || Array.isArray(raw.risk_budget))) {
    throw new Error('RISK_BUDGET_MUST_BE_OBJECT');
  }
  if (raw.resource_budget !== undefined && (!raw.resource_budget || typeof raw.resource_budget !== 'object' || Array.isArray(raw.resource_budget))) {
    throw new Error('RESOURCE_BUDGET_MUST_BE_OBJECT');
  }
  const successInput = raw.success_definition || {};
  const riskBudget = raw.risk_budget || {};
  const resourceBudget = raw.resource_budget || {};
  if (riskBudget.level !== undefined && !['low', 'medium', 'high'].includes(shortText(riskBudget.level).toLowerCase())) {
    throw new Error(`INVALID_TASK_SPEC_RISK_LEVEL: ${riskBudget.level}`);
  }
  for (const field of ['max_actions', 'max_acceptance_tests']) {
    if (resourceBudget[field] !== undefined && (!Number.isInteger(resourceBudget[field]) || resourceBudget[field] < 0)) {
      throw new Error(`INVALID_RESOURCE_BUDGET_${field.toUpperCase()}`);
    }
  }
  const observedDeltaRequired = successInput.observed_delta_required === undefined
    ? actions.length > 0
    : Boolean(successInput.observed_delta_required);

  const id = assertSafeId(raw.task_spec_id || taskSpecId(goal, createdAt), 'task_spec_id');
  const outputFile = sourceFile || `md-os/ops/tasks/${id}.json`;
  const taskSpec = {
    schema_version: 1,
    task_spec_id: id,
    created_at: shortText(raw.created_at || createdAt),
    goal,
    constraints: stringArray(raw.constraints, 'constraints'),
    acceptance_tests: acceptanceTests,
    risk_budget: riskBudget,
    resource_budget: resourceBudget,
    required_evidence: requiredEvidence,
    unknowns: stringArray(raw.unknowns, 'unknowns'),
    success_definition: {
      ...successInput,
      acceptance_tests_required: true,
      all_acceptance_tests_must_pass: true,
      observed_delta_required: observedDeltaRequired,
      required_evidence_must_exist: requiredEvidence.length > 0,
    },
    actions,
    observation_targets: observationTargets,
  };

  const findings = [];
  if (!acceptanceTests.length) {
    findings.push({
      code: 'ACCEPTANCE_TESTS_MISSING',
      severity: 'attention',
      message: 'The task has no executable acceptance tests and cannot produce a success verdict.',
    });
  }
  if (observedDeltaRequired && !observationTargets.length) {
    findings.push({
      code: 'OBSERVATION_TARGETS_MISSING',
      severity: 'attention',
      message: 'The success definition requires an observed delta but declares no observation targets.',
    });
  }
  if (!actions.length && !requiredEvidence.length) {
    findings.push({
      code: 'NO_EXECUTION_OR_REQUIRED_EVIDENCE',
      severity: 'info',
      message: 'The task is read-only unless its acceptance tests establish an independently observable result.',
    });
  }

  if (Number.isInteger(resourceBudget.max_actions) && actions.length > resourceBudget.max_actions) {
    findings.push({
      code: 'ACTION_BUDGET_EXCEEDED',
      severity: 'critical',
      message: `The TaskSpec declares ${actions.length} actions but its budget allows ${resourceBudget.max_actions}.`,
    });
  }
  if (Number.isInteger(resourceBudget.max_acceptance_tests) && acceptanceTests.length > resourceBudget.max_acceptance_tests) {
    findings.push({
      code: 'ACCEPTANCE_TEST_BUDGET_EXCEEDED',
      severity: 'critical',
      message: `The TaskSpec declares ${acceptanceTests.length} acceptance tests but its budget allows ${resourceBudget.max_acceptance_tests}.`,
    });
  }

  const blockingFinding = findings.some((finding) => finding.severity === 'critical');

  return {
    task_spec: taskSpec,
    task_spec_file: outputFile,
    source_file: sourceFile,
    should_write: !sourceFile,
    verifiable: !blockingFinding && acceptanceTests.length > 0 && !(observedDeltaRequired && !observationTargets.length),
    findings,
    source_hash: sha256Json(taskSpec),
  };
}

module.exports = {
  assertInsideMdos,
  compileTaskSpec,
  normalizeMdosPath,
};
