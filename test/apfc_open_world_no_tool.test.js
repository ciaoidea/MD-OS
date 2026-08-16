#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { sha256Json } = require('../md-os/os/lib/common');
const { buildProcedureGraph } = require('../md-os/kernel/cognition/apfc_open_world_meta_learning');
const { buildOnlineMemorySnapshot } = require('../md-os/kernel/cognition/apfc_open_world_online_learning');
const {
  NO_TOOL_PROTOCOL_ID,
  buildNoToolPrompt,
} = require('../md-os/kernel/cognition/apfc_open_world_no_tool');

function fixture() {
  const episode = {
    episode_id: 'ep_verified', verifier_outcome: 'verified',
    evidence: { baseline_fail: true, gold_pass: true, production_patch: true, regression_surface: true },
    structural_trace: { mechanisms: ['state_lifecycle'] },
  };
  const graph = buildProcedureGraph([episode]);
  const skill = {
    schema_version: 1,
    skill_id: 'skill_apfc_no_tool_test',
    induction: { literal_gold_patches_in_skill: false },
    apfc_meta_graph: graph,
  };
  skill.skill_hash = sha256Json(skill);
  const publicTask = {
    task_id: 'demo__cache-1', repository: 'demo/cache', base_commit: 'a'.repeat(40),
    problem_statement: 'A stale cache survives reset and must be invalidated at the lifecycle boundary.',
  };
  publicTask.public_task_hash = sha256Json(publicTask);
  const snapshot = buildOnlineMemorySnapshot({
    experimentId: 'no_tool_test', taskSequence: 1, baseSkill: skill, episodes: [], publicTask,
    createdAt: '2026-08-14T10:00:00Z',
  });
  const repositoryContext = {
    task_id: publicTask.task_id,
    public_task_hash: publicTask.public_task_hash,
    context_hash: 'c'.repeat(64),
    hidden_artifacts_present: false,
    repository_tree: { paths: ['src/cache.py'], total_file_count: 1, truncated: false },
    files: [{ path: 'src/cache.py', selection_mode: 'full', content: 'def reset(): pass' }],
  };
  return { skill, publicTask, snapshot, repositoryContext };
}

test('all no-tool conditions bind to identical public repository evidence', () => {
  const { skill, publicTask, snapshot, repositoryContext } = fixture();
  const prompts = ['memory_disabled', 'flat_memory', 'apfc_meta_composed'].map((condition) => buildNoToolPrompt({
    condition, publicTask, candidateSkill: skill, memorySnapshot: snapshot, repositoryContext,
  }));
  for (const prompt of prompts) {
    assert.ok(prompt.includes(repositoryContext.context_hash));
    assert.ok(prompt.includes('def reset(): pass'));
    assert.ok(prompt.includes(NO_TOOL_PROTOCOL_ID));
    assert.ok(prompt.includes('no shell, filesystem, network'));
  }
  assert.ok(prompts[0].includes('CONTROL CONDITION'));
  assert.ok(!prompts[0].includes('compiled_context'));
  assert.ok(prompts[1].includes('ABLATION CONDITION'));
  assert.ok(!prompts[1].includes('compiled_context'));
  assert.ok(prompts[2].includes('APFC CONDITION'));
  assert.ok(prompts[2].includes('compiled_context'));
  assert.ok(prompts[2].includes('mechanism_state_lifecycle'));
});

test('prompt construction rejects context or task binding mismatch', () => {
  const { skill, publicTask, snapshot, repositoryContext } = fixture();
  assert.throws(() => buildNoToolPrompt({
    condition: 'memory_disabled', publicTask, candidateSkill: skill, memorySnapshot: snapshot,
    repositoryContext: { ...repositoryContext, task_id: 'other' },
  }), /PROMPT_BINDING_MISMATCH/);
});
