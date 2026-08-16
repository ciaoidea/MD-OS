#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');
const { fileSnapshot, runTerminalCommand } = require('./executor');

function check(checkId, status, message, evidence = []) {
  return {
    check_id: checkId,
    status,
    message,
    evidence,
  };
}

function verifyTaskOutcome({ episodeId, taskSpec, taskCompilation, actionReceipts, policyBlocked = false }) {
  const checks = [];
  const acceptanceResults = [];
  const evidence = [];

  if ((taskSpec.acceptance_tests || []).length) {
    checks.push(check(
      'acceptance_tests_declared',
      'ok',
      'The TaskSpec declares executable acceptance tests.'
    ));
  } else {
    checks.push(check(
      'acceptance_tests_declared',
      'attention',
      'No success verdict is possible without executable acceptance tests.'
    ));
  }

  if (policyBlocked) {
    checks.push(check(
      'policy_gate',
      'critical',
      'Execution was blocked by the risk policy before any action was attempted.'
    ));
  } else {
    checks.push(check('policy_gate', 'ok', 'The bounded transaction passed its pre-execution risk gate.'));
  }

  const failedReceipts = (actionReceipts || []).filter((receipt) => receipt.status !== 'completed');
  if (!taskCompilation.verifiable && (taskSpec.actions || []).length) {
    checks.push(check(
      'action_receipts_complete',
      'attention',
      'Declared actions were not executed because the TaskSpec is not verifiable.'
    ));
  } else if ((taskSpec.actions || []).length && actionReceipts.length !== taskSpec.actions.length) {
    checks.push(check(
      'action_receipts_complete',
      'critical',
      'The number of ActionReceipts does not match the number of declared actions.',
      actionReceipts.map((receipt) => receipt.file)
    ));
  } else if (failedReceipts.length) {
    checks.push(check(
      'action_receipts_complete',
      'critical',
      'At least one declared action failed to produce a completed ActionReceipt.',
      failedReceipts.map((receipt) => receipt.file)
    ));
  } else {
    checks.push(check(
      'action_receipts_complete',
      'ok',
      taskSpec.actions.length
        ? 'Every declared action produced a completed ActionReceipt.'
        : 'The TaskSpec declares no mutating action; verification is read-only.',
      actionReceipts.map((receipt) => receipt.file)
    ));
  }

  const deltaRequired = Boolean(taskSpec.success_definition.observed_delta_required);
  const requiredTargets = (taskSpec.observation_targets || []).filter((target) => target.required_change !== false);
  const changedTargetIds = new Set();
  for (const receipt of actionReceipts || []) {
    for (const delta of receipt.observed_delta && receipt.observed_delta.targets || []) {
      if (delta.changed) changedTargetIds.add(delta.target_id);
    }
  }
  const missingDeltas = requiredTargets.filter((target) => !changedTargetIds.has(target.target_id));
  if (deltaRequired && (!requiredTargets.length || missingDeltas.length)) {
    checks.push(check(
      'observed_postcondition_delta',
      'critical',
      !requiredTargets.length
        ? 'The success definition requires an observed delta but no required target is declared.'
        : `Required state changes were not observed for: ${missingDeltas.map((item) => item.target_id).join(', ')}.`,
      actionReceipts.map((receipt) => receipt.file)
    ));
  } else {
    checks.push(check(
      'observed_postcondition_delta',
      'ok',
      deltaRequired
        ? 'Every required observation target changed across the transaction.'
        : 'The TaskSpec does not require a mutating state delta.'
    ));
  }

  if (!policyBlocked && taskCompilation.verifiable) {
    for (const acceptanceTest of taskSpec.acceptance_tests || []) {
      let execution;
      try {
        execution = runTerminalCommand(acceptanceTest);
      } catch (error) {
        execution = {
          invocation_status: null,
          exit_status: null,
          payload: null,
          stderr: error.message,
        };
      }
      const passed = execution.invocation_status === 0
        && execution.exit_status === acceptanceTest.expected_exit_status;
      const result = {
        acceptance_test_id: acceptanceTest.acceptance_test_id,
        connector_id: acceptanceTest.connector_id,
        command_id: acceptanceTest.command_id,
        expected_exit_status: acceptanceTest.expected_exit_status,
        observed_exit_status: execution.exit_status,
        status: passed ? 'passed' : 'failed',
        artifacts: execution.payload
          ? [execution.payload.artifact_file, execution.payload.snapshot_file].filter(Boolean)
          : [],
        readback: execution.payload,
        stderr: shortText(execution.stderr || ''),
      };
      acceptanceResults.push(result);
      evidence.push(...result.artifacts);
      checks.push(check(
        `acceptance_${acceptanceTest.acceptance_test_id}`,
        passed ? 'ok' : 'critical',
        passed
          ? `Acceptance test ${acceptanceTest.acceptance_test_id} passed with the expected exit status.`
          : `Acceptance test ${acceptanceTest.acceptance_test_id} did not pass with the expected exit status.`,
        result.artifacts
      ));
    }
  }

  for (const required of taskSpec.required_evidence || []) {
    const snapshot = fileSnapshot({
      target_id: required.evidence_id,
      path: required.path,
      required_change: false,
    });
    const hashMatches = !required.sha256 || required.sha256 === snapshot.content_hash;
    const present = !required.must_exist || snapshot.exists;
    const passed = present && hashMatches && snapshot.kind !== 'symlink';
    evidence.push(required.path);
    checks.push(check(
      `evidence_${required.evidence_id}`,
      passed ? 'ok' : 'critical',
      passed
        ? `Required evidence ${required.evidence_id} exists and satisfies its integrity condition.`
        : `Required evidence ${required.evidence_id} is missing or does not satisfy its integrity condition.`,
      [required.path]
    ));
  }

  for (const finding of taskCompilation.findings || []) {
    if (finding.severity === 'info') continue;
    if (finding.code === 'ACCEPTANCE_TESTS_MISSING' || finding.code === 'OBSERVATION_TARGETS_MISSING') {
      continue;
    }
    checks.push(check(`task_spec_${finding.code.toLowerCase()}`, finding.severity, finding.message));
  }

  const hasCritical = checks.some((item) => item.status === 'critical');
  const hasAttention = checks.some((item) => item.status === 'attention');
  const outcome = hasCritical ? 'failed' : hasAttention ? 'unverified' : 'verified';
  return {
    schema_version: 1,
    verification_id: `verification_${sha256Json({ episodeId, checks, acceptanceResults }).slice(0, 16)}`,
    episode_id: episodeId,
    verifier_id: 'deterministic_postcondition_verifier',
    independent_from_planner: true,
    status: outcome === 'verified' ? 'ok' : outcome === 'failed' ? 'critical' : 'attention',
    outcome,
    checks,
    acceptance_results: acceptanceResults,
    action_receipt_ids: (actionReceipts || []).map((receipt) => receipt.action_receipt_id),
    evidence: Array.from(new Set(evidence.filter(Boolean))).sort(),
  };
}

module.exports = {
  verifyTaskOutcome,
};
