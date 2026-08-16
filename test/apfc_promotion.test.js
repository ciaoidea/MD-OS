'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createLearningFixture } = require('./apfc_test_helpers');
const { runConsolidation } = require('../md-os/apfc/executive/consolidator');
const { governedTransition, promotionTransaction } = require('../md-os/os/apfc_runtime');

test('promotion, revocation, restoration, and rollback are explicit, reversible, and history preserving', () => {
  const env = createLearningFixture();
  runConsolidation({ ops_root: env.ops, apfc_dir: env.apfc, created_at: '2026-08-02T00:00:00Z', lock_name: `apfc_test_promote_${path.basename(env.workspace)}` });
  const common = { ops_root: env.ops, apfc_dir: env.apfc, workspace_root: env.workspace, approve: true, rebuild: () => [{ status: 0 }], lock_name: `apfc_test_govern_${path.basename(env.workspace)}` };
  assert.throws(() => promotionTransaction(env.skillId, { ...common, approve: false }), /EXPLICIT_APPROVAL/);
  const promotion = promotionTransaction(env.skillId, common);
  const promotedPath = path.join(env.ops, 'skills', 'promoted', `${env.skillId}.json`);
  assert.equal(JSON.parse(fs.readFileSync(promotedPath)).status, 'promoted');

  const revocation = governedTransition('apfc_revoke', env.skillId, { ...common, reason: 'fixture safety contradiction' });
  assert.equal(JSON.parse(fs.readFileSync(promotedPath)).status, 'revoked');
  const restoration = governedTransition('apfc_restore', revocation.receipt_id, common);
  assert.equal(JSON.parse(fs.readFileSync(promotedPath)).status, 'promoted');
  assert.equal(restoration.source_receipt_id, revocation.receipt_id);

  const rollback = governedTransition('apfc_rollback', promotion.receipt_id, common);
  assert.equal(fs.existsSync(promotedPath), false);
  assert.equal(rollback.source_receipt_id, promotion.receipt_id);
  const historyDir = path.join(env.ops, 'skills', 'history', env.skillId);
  assert.ok(fs.readdirSync(historyDir).filter((name) => name.endsWith('.json')).length >= 4);
  assert.ok(fs.readdirSync(path.join(env.ops, 'action_receipts')).filter((name) => name.endsWith('.json')).length >= 4);
});

test('a promotion rebuild failure restores the prior skill state and records automatic rollback evidence', () => {
  const env = createLearningFixture();
  runConsolidation({ ops_root: env.ops, apfc_dir: env.apfc, created_at: '2026-08-02T00:00:00Z', lock_name: `apfc_test_promote_fail_${path.basename(env.workspace)}` });
  assert.throws(() => promotionTransaction(env.skillId, {
    ops_root: env.ops, apfc_dir: env.apfc, workspace_root: env.workspace, approve: true,
    rebuild: () => { throw new Error('injected verifier failure'); },
    lock_name: `apfc_test_govern_fail_${path.basename(env.workspace)}`,
  }), /PROMOTION_ROLLED_BACK/);
  assert.equal(fs.existsSync(path.join(env.ops, 'skills', 'promoted', `${env.skillId}.json`)), false);
  const cycleFile = fs.readdirSync(path.join(env.apfc, 'consolidation')).find((name) => name.startsWith('apfc_cycle_') && name.endsWith('.json'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.apfc, 'consolidation', cycleFile), 'utf8')).state, 'promotable');
  const receipts = fs.readdirSync(path.join(env.ops, 'action_receipts'));
  assert.ok(receipts.some((name) => name.includes('automatic_rollback')));
});

test('a post-promotion governance rebuild failure restores the prior state and records automatic rollback evidence', () => {
  const env = createLearningFixture();
  runConsolidation({ ops_root: env.ops, apfc_dir: env.apfc, created_at: '2026-08-02T00:00:00Z', lock_name: `apfc_test_transition_fail_${path.basename(env.workspace)}` });
  const base = {
    ops_root: env.ops,
    apfc_dir: env.apfc,
    workspace_root: env.workspace,
    approve: true,
    lock_name: `apfc_test_transition_govern_${path.basename(env.workspace)}`,
  };
  promotionTransaction(env.skillId, { ...base, rebuild: () => [{ status: 0 }] });
  const promotedPath = path.join(env.ops, 'skills', 'promoted', `${env.skillId}.json`);
  assert.throws(() => governedTransition('apfc_revoke', env.skillId, {
    ...base,
    rebuild: () => { throw new Error('injected post-promotion rebuild failure'); },
  }), /GOVERNANCE_TRANSACTION_RESTORED/);
  assert.equal(JSON.parse(fs.readFileSync(promotedPath, 'utf8')).status, 'promoted');
  const receipts = fs.readdirSync(path.join(env.ops, 'action_receipts'));
  assert.ok(receipts.some((name) => name.includes('automatic_rollback')));
});
