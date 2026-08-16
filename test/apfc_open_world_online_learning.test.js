#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { sha256Json } = require('../md-os/os/lib/common');
const { buildProcedureGraph } = require('../md-os/kernel/cognition/apfc_open_world_meta_learning');
const { buildNoToolPrompt } = require('../md-os/kernel/cognition/apfc_open_world_no_tool');
const {
  assertNoOracleContent,
  assertOnlineEpisode,
  assertOnlineMemorySnapshot,
  buildOnlineEpisode,
  buildOnlineMemorySnapshot,
  buildOnlineMemoryState,
} = require('../md-os/kernel/cognition/apfc_open_world_online_learning');

function baseSkill() {
  const developmentEpisode = {
    episode_id: 'ep_development_validation',
    verifier_outcome: 'verified',
    evidence: {
      baseline_fail: true,
      gold_pass: true,
      production_patch: true,
      regression_surface: true,
    },
    structural_trace: { mechanisms: ['validation_boundary'] },
  };
  const graph = buildProcedureGraph([developmentEpisode]);
  const skill = {
    schema_version: 1,
    skill_id: 'skill_apfc_online_test',
    status: 'candidate',
    induction: { literal_gold_patches_in_skill: false },
    apfc_meta_graph: graph,
  };
  skill.skill_hash = sha256Json(skill);
  return skill;
}

function task(taskId = 'task_state_cache') {
  const record = {
    task_id: taskId,
    repository: 'external/state-cache',
    base_commit: 'a'.repeat(40),
    problem_statement: [
      '# Stale cache survives a lifecycle transition',
      '## Root Cause',
      'The state cache is not invalidated when configuration changes.',
      '## Suggested fix',
      'Reset cached state at the owning transition.',
    ].join('\n'),
  };
  record.public_task_hash = sha256Json(record);
  return record;
}

function trialReceipt({ publicTask, snapshot, condition, success = false }) {
  const receipt = {
    schema_version: 1,
    receipt_type: 'apfc_open_world_sealed_trial',
    evaluator_protocol_id: 'sealed_expected_test_groups_v4',
    task_id: publicTask.task_id,
    repository: publicTask.repository,
    public_task_hash: publicTask.public_task_hash,
    condition,
    trial_index: 1,
    cold_start: true,
    model: 'gpt-5.4',
    candidate_skill_id: 'skill_apfc_online_test',
    candidate_skill_hash: 'b'.repeat(64),
    memory_snapshot_hash: snapshot.snapshot_hash,
    model_timed_out: false,
    evaluator_timed_out: false,
    evaluator_pass_to_pass_test_count: 1,
    evaluator_all_pass_to_pass_passed: success ? true : null,
    verified_success: success,
    safety_violations: [],
    production_changed_files: success ? ['src/cache.py'] : [],
    candidate_patch_hash: success ? 'c'.repeat(64) : 'd'.repeat(64),
    candidate_patch_bytes: success ? 240 : 0,
    hidden_artifacts_mounted_to_learner: false,
  };
  receipt.receipt_hash = sha256Json(receipt);
  return receipt;
}

function taskResults(publicTask, snapshot, successfulConditions = []) {
  return ['memory_disabled', 'flat_memory', 'apfc_meta_composed'].map((condition) => trialReceipt({
    publicTask,
    snapshot,
    condition,
    success: successfulConditions.includes(condition),
  }));
}

test('a fully failed task is retained as negative evidence and cannot create an executable node', () => {
  const skill = baseSkill();
  const publicTask = task();
  const snapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 1, baseSkill: skill, episodes: [], publicTask,
    createdAt: '2026-08-14T08:00:00Z',
  });
  const episode = buildOnlineEpisode({
    experimentId: 'online_v3', sequence: 1, publicTask,
    taskResults: taskResults(publicTask, snapshot), memorySnapshot: snapshot,
    createdAt: '2026-08-14T08:10:00Z',
  });
  assert.equal(episode.negative_evidence_only, true);
  assert.equal(episode.executable_learning_eligible, false);
  const memory = buildOnlineMemoryState({ baseSkill: skill, episodes: [episode] });
  assert.deepEqual(memory.positive_episode_ids, []);
  assert.deepEqual(memory.negative_episode_ids, [episode.episode_id]);
  assert.ok(!memory.graph.nodes.some((node) => node.node_id === 'mechanism_state_lifecycle'));
});

test('a verified prior outcome adds a source-bound candidate mechanism and is reused by the next task snapshot', () => {
  const skill = baseSkill();
  const firstTask = task('task_state_cache_1');
  const firstSnapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 1, baseSkill: skill, episodes: [], publicTask: firstTask,
    createdAt: '2026-08-14T08:00:00Z',
  });
  const episode = buildOnlineEpisode({
    experimentId: 'online_v3', sequence: 1, publicTask: firstTask,
    taskResults: taskResults(firstTask, firstSnapshot, ['memory_disabled']),
    memorySnapshot: firstSnapshot, createdAt: '2026-08-14T08:10:00Z',
  });
  const memory = buildOnlineMemoryState({ baseSkill: skill, episodes: [episode] });
  const learned = memory.graph.nodes.find((node) => node.node_id === 'mechanism_state_lifecycle');
  assert.equal(learned.node_type, 'online_candidate_mechanism_procedure');
  assert.deepEqual(learned.source_episode_ids, [episode.episode_id]);
  assert.equal(learned.epistemic_status, 'candidate_from_verified_outcome');

  const nextTask = task('task_state_cache_2');
  const nextSnapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 2, baseSkill: skill, episodes: [episode], publicTask: nextTask,
    createdAt: '2026-08-14T08:20:00Z',
  });
  assert.equal(nextSnapshot.prior_episode_count, 1);
  assert.deepEqual(nextSnapshot.retrieved_episode_ids, [episode.episode_id]);
  assert.ok(nextSnapshot.apfc_graph.nodes.some((node) => node.node_id === 'mechanism_state_lifecycle'));
  assert.ok(nextSnapshot.flat_procedure_cards.some((card) => card.procedure_id === 'mechanism_state_lifecycle'));

  const repositoryContext = {
    task_id: nextTask.task_id,
    public_task_hash: nextTask.public_task_hash,
    context_hash: 'c'.repeat(64),
    hidden_artifacts_present: false,
    repository_tree: { paths: ['src/cache.py'], total_file_count: 1, truncated: false },
    files: [{ path: 'src/cache.py', selection_mode: 'full', content: 'def reset(): pass' }],
  };
  const disabledPrompt = buildNoToolPrompt({
    condition: 'memory_disabled', publicTask: nextTask, candidateSkill: skill,
    memorySnapshot: nextSnapshot, repositoryContext,
  });
  const flatPrompt = buildNoToolPrompt({
    condition: 'flat_memory', publicTask: nextTask, candidateSkill: skill,
    memorySnapshot: nextSnapshot, repositoryContext,
  });
  const apfcPrompt = buildNoToolPrompt({
    condition: 'apfc_meta_composed', publicTask: nextTask, candidateSkill: skill,
    memorySnapshot: nextSnapshot, repositoryContext,
  });
  assert.ok(!disabledPrompt.includes(nextSnapshot.snapshot_hash));
  assert.ok(!disabledPrompt.includes(episode.episode_id));
  assert.ok(flatPrompt.includes(episode.episode_id));
  assert.ok(!flatPrompt.includes('compiled_context'));
  assert.ok(apfcPrompt.includes(nextSnapshot.snapshot_hash));
  assert.ok(apfcPrompt.includes(episode.episode_id));
  assert.ok(apfcPrompt.includes('mechanism_state_lifecycle'));
  assert.ok(apfcPrompt.includes('compiled_context'));
});

test('a protected-test regression cannot become executable learning', () => {
  const skill = baseSkill();
  const publicTask = task('task_regressive_patch');
  const snapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 1, baseSkill: skill, episodes: [], publicTask,
    createdAt: '2026-08-14T08:00:00Z',
  });
  const rows = taskResults(publicTask, snapshot, []);
  const apfc = rows.find((row) => row.condition === 'apfc_meta_composed');
  apfc.verified_success = true;
  apfc.production_changed_files = ['src/cache.py'];
  apfc.candidate_patch_bytes = 240;
  apfc.evaluator_pass_to_pass_test_count = 1;
  apfc.evaluator_all_pass_to_pass_passed = false;
  delete apfc.receipt_hash;
  apfc.receipt_hash = sha256Json(apfc);
  const episode = buildOnlineEpisode({
    experimentId: 'online_v3', sequence: 1, publicTask, taskResults: rows,
    memorySnapshot: snapshot, createdAt: '2026-08-14T08:10:00Z',
  });
  assert.equal(episode.verified_success_any_condition, false);
  assert.equal(episode.executable_learning_eligible, false);
  assert.equal(episode.negative_evidence_only, true);
});

test('all conditions bind to one pre-task snapshot and no within-task result can enter it', () => {
  const skill = baseSkill();
  const publicTask = task();
  const snapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 1, baseSkill: skill, episodes: [], publicTask,
    createdAt: '2026-08-14T08:00:00Z',
  });
  const receipts = taskResults(publicTask, snapshot, ['apfc_meta_composed']);
  assert.equal(new Set(receipts.map((row) => row.memory_snapshot_hash)).size, 1);
  assert.equal(snapshot.prior_episode_count, 0);
  const episode = buildOnlineEpisode({
    experimentId: 'online_v3', sequence: 1, publicTask, taskResults: receipts,
    memorySnapshot: snapshot, createdAt: '2026-08-14T08:10:00Z',
  });
  assert.equal(episode.prior_episode_count, 0);
  assert.equal(episode.outcome_class, 'apfc_only_success');
});

test('online artifacts fail closed on hash mutation and reject oracle fields', () => {
  const skill = baseSkill();
  const publicTask = task();
  const snapshot = buildOnlineMemorySnapshot({
    experimentId: 'online_v3', taskSequence: 1, baseSkill: skill, episodes: [], publicTask,
    createdAt: '2026-08-14T08:00:00Z',
  });
  assert.equal(assertOnlineMemorySnapshot(snapshot), true);
  const episode = buildOnlineEpisode({
    experimentId: 'online_v3', sequence: 1, publicTask,
    taskResults: taskResults(publicTask, snapshot, ['flat_memory']), memorySnapshot: snapshot,
    createdAt: '2026-08-14T08:10:00Z',
  });
  assert.equal(assertOnlineEpisode(episode), true);
  const tampered = JSON.parse(JSON.stringify(episode));
  tampered.outcome_class = 'tampered';
  assert.throws(() => assertOnlineEpisode(tampered), /HASH_MISMATCH/);
  assert.throws(() => assertNoOracleContent({ nested: { gold_patch: 'forbidden' } }), /ORACLE_FIELD_FORBIDDEN/);
});

test('every online-learning artifact class has a schema contract', () => {
  for (const name of [
    'apfc_open_world_online_episode.schema.json',
    'apfc_open_world_online_memory.schema.json',
    'apfc_open_world_memory_snapshot.schema.json',
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'md-os', 'schemas', name), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.type, 'object');
    assert.ok(schema.required.length > 0);
  }
});
