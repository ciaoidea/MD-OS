#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  MECHANISM_CARDS,
  analyzeVerifiedDevelopmentTask,
  assessExpectedTestRun,
  assertEmbeddedHash,
  buildProcedureGraph,
  compileMetaContext,
  inferMechanismsFromPublicTask,
  induceMetaSkill,
  materializeFormalDevelopmentArtifacts,
  rankMechanismsFromPublicTask,
} = require('../md-os/kernel/cognition/apfc_open_world_meta_learning');

const REPO_ROOT = path.resolve(__dirname, '..');

test('sealed evaluator scores expected pytest outcomes and ignores unrelated failures', () => {
  const task = {
    fail_to_pass: ['tests/test_feature.py::test_new_behavior'],
    pass_to_pass: ['[100%]', 'tests/test_feature.py::test_regression'],
  };
  const baseline = assessExpectedTestRun([
    'FAILED tests/test_feature.py::test_new_behavior - AssertionError',
    'PASSED tests/test_feature.py::test_regression',
    'FAILED tests/test_feature.py::test_unrelated - ImportError',
  ].join('\n'), task);
  assert.equal(baseline.all_fail_to_pass_failed, true);
  assert.equal(baseline.all_expected_passed, false);
  const gold = assessExpectedTestRun([
    'PASSED tests/test_feature.py::test_new_behavior',
    'PASSED tests/test_feature.py::test_regression',
    "PASSED tests/test_feature.py::test_group[a, b]",
    "PASSED tests/test_feature.py::test_group[a, c]",
    'FAILED tests/test_feature.py::test_unrelated - ImportError',
  ].join('\n'), { ...task, pass_to_pass: [...task.pass_to_pass, 'tests/test_feature.py::test_group[a,'] });
  assert.equal(gold.all_expected_passed, true);
  assert.equal(gold.all_pass_to_pass_passed, true);
  assert.equal(gold.expected_test_count, 3);
});

test('development episodes use sealed expected-test outcomes rather than whole-suite exit codes', () => {
  const publicTask = {
    task_id: 'owner__repo-1', repository: 'owner/repo', base_commit: 'a'.repeat(40),
    source_split: 'development', public_task_hash: 'b'.repeat(64), problem_statement: 'fix validation',
  };
  const hiddenTask = {
    gold_patch: 'diff --git a/src/a.py b/src/a.py\n--- a/src/a.py\n+++ b/src/a.py\n+fixed\n',
    test_patch: 'hidden', fail_to_pass: ['tests/test_a.py::test_a'], pass_to_pass: ['tests/test_a.py::test_b'],
  };
  const episode = analyzeVerifiedDevelopmentTask(publicTask, hiddenTask, {
    completed_at: '2026-08-13T00:00:00Z', verified: true,
    baseline_exit_status: 1, gold_exit_status: 1,
    baseline_all_fail_to_pass_failed: true, gold_all_expected_passed: true,
    baseline_log_hash: 'c'.repeat(64), gold_log_hash: 'd'.repeat(64),
  });
  assert.equal(episode.evidence.baseline_fail, true);
  assert.equal(episode.evidence.gold_pass, true);
});

test('embedded hashes fail closed after artifact mutation', () => {
  const payload = { schema_version: 1, value: 'original' };
  payload.receipt_hash = require('../md-os/os/lib/common').sha256Json(payload);
  assert.equal(assertEmbeddedHash(payload, 'receipt_hash', 'TEST_ARTIFACT'), true);
  payload.value = 'tampered';
  assert.throws(() => assertEmbeddedHash(payload, 'receipt_hash', 'TEST_ARTIFACT'), /HASH_MISMATCH/);
});

function episode(index, mechanisms) {
  return {
    schema_version: 1,
    episode_id: `ep_real_${index}`,
    created_at: '2026-08-13T00:00:00Z',
    repository: `external/repository-${index}`,
    verifier_outcome: 'verified',
    evidence: {
      baseline_fail: true,
      gold_pass: true,
      production_patch: true,
      regression_surface: true,
    },
    structural_trace: { mechanisms },
  };
}

function episodes() {
  const mechanisms = MECHANISM_CARDS.map((card) => card.mechanism_id);
  return Array.from({ length: 12 }, (_, index) => episode(index + 1, [
    mechanisms[index % mechanisms.length],
    mechanisms[(index + 3) % mechanisms.length],
  ]));
}

test('requirements select one workflow while heterogeneous episodes source-bind its mechanism layer', () => {
  const result = induceMetaSkill(episodes(), { seal_digest: 'a'.repeat(64) });
  assert.equal(result.skill.status, 'candidate');
  assert.equal(result.skill.induction.selected_hypothesis_id, 'typed_evidence_graph_compiler');
  assert.equal(result.skill.induction.literal_gold_patches_in_skill, false);
  assert.equal(result.skill.source_episodes.length, 12);
  assert.deepEqual(result.skill.evals, []);
  assert.equal(result.workflow_records.filter((record) => record.survives).length, 1);
  assert.ok(result.graph.supported_mechanisms.length >= 5);
  assert.equal(result.skill.induction.method, 'requirement_constrained_workflow_selection_plus_episode_supported_mechanism_consolidation');
});

test('public issue evidence recognizes mechanisms and compiles verified ordered procedures', () => {
  const graph = buildProcedureGraph(episodes());
  const task = {
    task_id: 'unseen_external_task',
    problem_statement: 'An async task leaves stale cached state after cancellation and should reset its lifecycle state.',
  };
  const inferred = inferMechanismsFromPublicTask(task);
  assert.ok(inferred.includes('state_lifecycle'));
  assert.ok(inferred.includes('async_concurrency'));
  const context = compileMetaContext(graph, task);
  assert.equal(context.public_inference_only, true);
  assert.ok(context.recognized_mechanisms.length >= 2);
  assert.equal(context.path_node_ids[0], 'reconstruct_contract');
  assert.equal(context.path_node_ids.at(-1), 'emit_audited_result');
  assert.ok(context.path_node_ids.includes('mechanism_state_lifecycle'));
  assert.ok(context.path_node_ids.includes('mechanism_async_concurrency'));
  for (let index = 1; index < context.procedure_cards.length; index += 1) {
    assert.equal(
      context.procedure_cards[index - 1].output_type,
      context.procedure_cards[index].input_type,
      `typed path edge ${index - 1} -> ${index}`,
    );
  }
});

test('causal issue sections surface state lifecycle and preserve unsupported mechanisms as a capability gap', () => {
  const graph = buildProcedureGraph(episodes().map((item) => ({
    ...item,
    structural_trace: {
      ...item.structural_trace,
      mechanisms: item.structural_trace.mechanisms.filter((mechanism) => mechanism !== 'state_lifecycle'),
    },
  })));
  const task = {
    task_id: 'named_provider_stale_cache',
    problem_statement: [
      '# Named provider selection uses a stale model cache',
      '',
      '## Actual behavior',
      'The active custom provider is reconstructed from its base URL.',
      '',
      '## Root Cause',
      'The configuration cache remains stale after the named provider changes.',
      '',
      '## Suggested fix',
      'Invalidate the cache at the state transition or resolve the named provider from current configuration.',
    ].join('\n'),
  };
  const ranking = rankMechanismsFromPublicTask(task);
  assert.equal(ranking[0].mechanism_id, 'state_lifecycle');
  assert.ok(ranking[0].causal_score > 0);
  const context = compileMetaContext(graph, task);
  assert.ok(context.inferred_mechanisms.includes('state_lifecycle'));
  assert.ok(context.unsupported_mechanisms.includes('state_lifecycle'));
  assert.ok(!context.recognized_mechanisms.includes('state_lifecycle'));
  assert.ok(!context.path_node_ids.includes('mechanism_state_lifecycle'));
});

test('verified development evidence materializes as immutable MD-OS tasks, verifications, episodes, and a candidate', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apfc-open-world-formal-'));
  try {
    const experimentDir = path.join(root, 'experiment');
    const opsRoot = path.join(root, 'md-os', 'ops');
    fs.mkdirSync(path.join(experimentDir, 'evidence', 'development_verification'), { recursive: true });
    const publicTasks = [];
    const sourceEpisodes = [];
    for (let index = 0; index < 12; index += 1) {
      const taskId = `owner${index}__repository-${index}`;
      const publicTask = {
        task_id: taskId,
        repository: `owner${index}/repository-${index}`,
        base_commit: String(index).padStart(40, 'a'),
        source_split: 'development',
        public_task_hash: String(index).padStart(64, 'b'),
        problem_statement: `Repair validation boundary ${index}`,
      };
      const sourceEpisode = {
        ...episode(index + 1, ['validation_boundary', 'interface_contract']),
        episode_id: `ep_open_world_development_${String(index).padStart(16, '0')}`,
        task_id: taskId,
        repository: publicTask.repository,
        base_commit: publicTask.base_commit,
        source_split: publicTask.source_split,
        public_task_hash: publicTask.public_task_hash,
        verifier_outcome: 'verified',
        structural_trace: {
          mechanisms: ['validation_boundary', 'interface_contract'],
          changed_file_count: 1,
          changed_production_file_count: 1,
          production_file_extensions: ['.py'],
          added_line_count: 1,
          removed_line_count: 1,
          fail_to_pass_count: 1,
          pass_to_pass_count: 1,
        },
        observed_procedure_ids: ['reconstruct_contract', 'mechanism_validation_boundary', 'emit_audited_result'],
        literal_patch_excluded_from_learning_artifact: true,
      };
      const receipt = {
        schema_version: 1,
        receipt_type: 'apfc_open_world_development_verification',
        evaluator_protocol_id: 'sealed_expected_test_groups_v4',
        task_id: taskId,
        repository: publicTask.repository,
        image_name: `image-${index}`,
        hidden_task_hash: 'c'.repeat(64),
        baseline_all_fail_to_pass_failed: true,
        gold_all_expected_passed: true,
        baseline_timed_out: false,
        gold_timed_out: false,
        verified: true,
        completed_at: '2026-08-13T00:00:00Z',
      };
      receipt.receipt_hash = require('../md-os/os/lib/common').sha256Json(receipt);
      const receiptDir = path.join(experimentDir, 'evidence', 'development_verification', taskId);
      fs.mkdirSync(receiptDir, { recursive: true });
      fs.writeFileSync(path.join(receiptDir, 'expected_v4_receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
      publicTasks.push(publicTask);
      sourceEpisodes.push(sourceEpisode);
    }
    const skill = {
      schema_version: 1,
      skill_id: 'skill_apfc_open_world_meta_test',
      skill_hash: 'd'.repeat(64),
      created_at: '2026-08-13T00:00:00Z',
      status: 'candidate',
      title: 'Test meta skill',
      description: 'Test only',
      domain: 'test',
      inputs: [], tools: [], preconditions: [], procedure: ['test'], success_criteria: [], failure_modes: [], rollback: 'disable', evals: [],
      source_episodes: sourceEpisodes.map((item) => item.episode_id),
      induction: { selected_hypothesis_id: 'typed_evidence_graph_compiler' },
      apfc_meta_graph: { graph_hash: 'e'.repeat(64), supported_mechanisms: ['validation_boundary', 'interface_contract'] },
    };
    fs.mkdirSync(path.join(experimentDir, 'evidence'), { recursive: true });
    for (const [name, payload] of [
      ['meta_induction_report.json', { status: 'ok' }],
      ['meta_procedure_graph.json', skill.apfc_meta_graph],
      ['development_episodes.json', sourceEpisodes],
    ]) fs.writeFileSync(path.join(experimentDir, 'evidence', name), `${JSON.stringify(payload)}\n`);
    fs.writeFileSync(path.join(experimentDir, 'candidate_meta_skill.json'), `${JSON.stringify(skill)}\n`);

    const first = materializeFormalDevelopmentArtifacts({
      experimentDir,
      experimentRel: 'md-os/ops/agi/learning_experiments/test',
      publicCorpus: { development_tasks: publicTasks },
      episodes: sourceEpisodes,
      skill,
      opsRoot,
    });
    assert.equal(first.write_counts.created, 40);
    assert.equal(first.write_counts.unchanged, 0);
    const second = materializeFormalDevelopmentArtifacts({
      experimentDir,
      experimentRel: 'md-os/ops/agi/learning_experiments/test',
      publicCorpus: { development_tasks: publicTasks },
      episodes: sourceEpisodes,
      skill,
      opsRoot,
    });
    assert.equal(second.write_counts.created, 0);
    assert.equal(second.write_counts.unchanged, 40);
    const formalEpisode = JSON.parse(fs.readFileSync(path.join(opsRoot, 'episodes', `${sourceEpisodes[0].episode_id}.json`), 'utf8'));
    assert.equal(formalEpisode.verdict, 'success');
    assert.deepEqual(formalEpisode.candidate_skills, [skill.skill_id]);
    assert.equal(formalEpisode.literal_patch_excluded_from_learning_artifact, true);
    const runtimeCandidate = JSON.parse(fs.readFileSync(path.join(opsRoot, 'skills', 'candidates', `${skill.skill_id}.json`), 'utf8'));
    assert.equal(runtimeCandidate.source_candidate_hash, skill.skill_hash);
    assert.equal(runtimeCandidate.skill_hash, undefined);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('every retained APFC open-world learning artifact class has an explicit schema contract', () => {
  const schemas = [
    'apfc_open_world_public_corpus.schema.json',
    'apfc_open_world_verifier_vault.schema.json',
    'apfc_open_world_seal.schema.json',
    'apfc_open_world_development_receipt.schema.json',
    'apfc_open_world_development_episodes.schema.json',
    'apfc_open_world_meta_induction_report.schema.json',
    'apfc_open_world_trial_receipt.schema.json',
    'apfc_open_world_meta_graph.schema.json',
  ];
  for (const fileName of schemas) {
    const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os', 'schemas', fileName), 'utf8'));
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.ok(['object', 'array'].includes(schema.type));
    if (schema.type === 'object') {
      assert.ok(Array.isArray(schema.required));
      assert.ok(schema.required.length > 0);
    } else {
      assert.ok(Number.isInteger(schema.minItems));
      assert.ok(schema.minItems > 0);
    }
  }
});
