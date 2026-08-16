#!/usr/bin/env node
'use strict';

const {
  TEST_PROTOCOL_ID,
  assertEmbeddedHash,
} = require('./apfc_open_world_meta_learning');

function assertTrialReceipt(receipt, {
  publicTask,
  condition,
  trialIndex,
  model,
  memorySnapshotHash = null,
}) {
  assertEmbeddedHash(receipt, 'receipt_hash', 'APFC_OPEN_WORLD_TRIAL_RECEIPT');
  if (receipt.receipt_type !== 'apfc_open_world_sealed_trial'
    || receipt.evaluator_protocol_id !== TEST_PROTOCOL_ID
    || receipt.task_id !== publicTask.task_id
    || receipt.repository !== publicTask.repository
    || receipt.public_task_hash !== publicTask.public_task_hash
    || receipt.condition !== condition
    || receipt.trial_index !== trialIndex
    || receipt.model !== model
    || receipt.cold_start !== true) {
    throw new Error(`APFC_OPEN_WORLD_TRIAL_RECEIPT_BINDING_MISMATCH:${publicTask.task_id}:${condition}:${trialIndex}`);
  }
  if (!/^skill_[a-z0-9_]+$/.test(String(receipt.candidate_skill_id || ''))
    || !/^[a-f0-9]{64}$/.test(String(receipt.candidate_skill_hash || ''))
    || receipt.hidden_artifacts_mounted_to_learner !== false) {
    throw new Error(`APFC_OPEN_WORLD_TRIAL_RECEIPT_ISOLATION_BINDING_MISMATCH:${publicTask.task_id}:${condition}:${trialIndex}`);
  }
  if (receipt.verified_success === true
    && receipt.evaluator_pass_to_pass_test_count > 0
    && receipt.evaluator_all_pass_to_pass_passed !== true) {
    throw new Error(`APFC_OPEN_WORLD_TRIAL_RECEIPT_PROTECTED_REGRESSION_MISMATCH:${publicTask.task_id}:${condition}:${trialIndex}`);
  }
  if (memorySnapshotHash !== null) {
    if (receipt.memory_snapshot_hash !== memorySnapshotHash
      || receipt.memory_snapshot_frozen_before_all_task_conditions !== true
      || !/^[a-f0-9]{64}$/.test(String(receipt.online_graph_hash || ''))
      || receipt.online_memory_view !== (condition === 'memory_disabled' ? 'disabled'
        : condition === 'flat_memory' ? 'flat' : condition === 'apfc_meta_composed' ? 'apfc_graph' : 'generic_core')
      || (condition === 'memory_disabled' && receipt.online_memory_content_enabled !== false)) {
      throw new Error(`APFC_OPEN_WORLD_TRIAL_RECEIPT_MEMORY_BINDING_MISMATCH:${publicTask.task_id}:${condition}:${trialIndex}`);
    }
  }
  return true;
}

module.exports = { assertTrialReceipt };
