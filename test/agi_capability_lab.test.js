#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  CAPABILITY_ROOT,
  STRUCTURAL_FAMILIES,
  canonicalizePayload,
  emptyMemory,
  forbiddenPaths,
  generateTaskPack,
  recordVerifiedEpisode,
  runCapabilityLab,
  runStrategy,
  scoreSolveResult,
  selectCurriculumTask,
  solvePublicTask,
  verifyCandidate,
  verifyMemoryLedger,
} = require('../md-os/kernel/cognition/agi_capability_lab');

function uniqueId(prefix) {
  return `${prefix}_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

test('target-domain surface schemas are disjoint but canonicalize to solvable structures', () => {
  const pack = generateTaskPack({ seed: 'surface-transfer-test', trainPerFamily: 4, holdoutPerFamily: 2, probePerFamily: 2 });
  assert.deepEqual(new Set(pack.train.map((task) => task.public_task.representation)), new Set(['source_schema_v1']));
  assert.deepEqual(new Set(pack.holdout.map((task) => task.public_task.representation)), new Set(['target_schema_v2']));
  assert.equal(pack.source_semantic_domains.some((domain) => pack.target_semantic_domains.includes(domain)), false);

  const targetByFamily = new Map(pack.holdout.map((task) => [task.evaluator_only.structural_family, task]));
  assert.equal(targetByFamily.size, STRUCTURAL_FAMILIES.length);
  for (const family of STRUCTURAL_FAMILIES) {
    const task = targetByFamily.get(family);
    const canonical = canonicalizePayload(task.public_task);
    assert.equal(typeof canonical, 'object');
    const candidate = runStrategy(task.evaluator_only.oracle_strategy, task.public_task);
    assert.equal(verifyCandidate(task, candidate.answer).success, true, family);
  }
});

test('curriculum choice is invariant to evaluator-only labels and learner requests remain uncontaminated', () => {
  const pack = generateTaskPack({ seed: 'public-curriculum-test', trainPerFamily: 4, holdoutPerFamily: 2, probePerFamily: 2 });
  const memory = emptyMemory('public_curriculum');
  const original = selectCurriculumTask(memory, pack.train);
  const tamperedHidden = structuredClone(pack.train);
  for (const task of tamperedHidden) {
    task.evaluator_only.structural_family = `hidden_mutation_${task.public_task.task_id}`;
    task.evaluator_only.expected = { unavailable: true };
    task.evaluator_only.oracle_strategy = 'hidden_oracle_mutation';
  }
  const mutated = selectCurriculumTask(memory, tamperedHidden);
  assert.equal(mutated.selected.task_id, original.selected.task_id);
  assert.equal(mutated.selected.track, original.selected.track);
  assert.deepEqual(forbiddenPaths(original.selected.task.public_task), []);
});

test('persistent episodic ledger detects tampering', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-capability-memory-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const task = generateTaskPack({ seed: 'ledger-test', trainPerFamily: 4, holdoutPerFamily: 2, probePerFamily: 2 }).train[0];
  const memory = emptyMemory('ledger_test');
  const solve = solvePublicTask({
    configuration: 'same_host_mdos_full',
    publicTask: task.public_task,
    memory,
    attemptBudget: 3,
    exploration: true,
  });
  const scored = scoreSolveResult(task, solve);
  const recorded = recordVerifiedEpisode(root, memory, task, solve, scored.verified_attempts, 'session_001');
  assert.equal(verifyMemoryLedger(root, recorded.memory).status, 'ok');
  const ledger = path.join(root, 'memory', 'events.ndjson');
  fs.appendFileSync(ledger, '{"tampered":true}\n', 'utf8');
  const audit = verifyMemoryLedger(root, recorded.memory);
  assert.equal(audit.status, 'failed');
  assert.ok(audit.findings.length > 0);
});

test('capability campaign demonstrates causal memory, consolidation, public curriculum, and controlled transfer', (t) => {
  const experimentId = uniqueId('test_capability_continuity');
  const experimentRoot = path.join(CAPABILITY_ROOT, experimentId);
  t.after(() => fs.rmSync(experimentRoot, { recursive: true, force: true }));
  const report = runCapabilityLab({
    experiment_id: experimentId,
    seed: 'smoke-seed-v5-d',
    cycles: 70,
    sessions: 7,
    train_per_family: 12,
    holdout_per_family: 8,
    probe_per_family: 3,
  });
  assert.equal(report.status, 'ok');
  assert.equal(report.criteria.far_semantic_transfer.status, 'ok');
  assert.equal(report.criteria.continual_learning.status, 'ok');
  assert.equal(report.criteria.cognitive_memory_continuity.status, 'ok');
  assert.equal(report.criteria.autonomous_curriculum.status, 'ok');
  assert.equal(report.criteria.sealed_hidden_evaluation.status, 'ok');
  assert.ok(report.measurements.full_holdout_success_rate >= 0.9);
  assert.ok(report.measurements.added_value_delta >= 0.1);
  assert.ok(report.measurements.memory_added_value_delta >= 0.1);
  assert.ok(report.measurements.semantic_policies_promoted >= 6);
  assert.ok(report.measurements.causal_memory_reuses > 0);
  assert.equal(report.measurements.average_forgetting, 0);
  assert.equal(report.contamination_audit.findings.length, 0);
  assert.equal(report.claim_state.operational_agi_claim_supported, false);
});
