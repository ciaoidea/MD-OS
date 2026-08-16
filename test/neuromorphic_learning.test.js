#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  allHypotheses,
  induceDelimitedBoundarySkill,
} = require('../md-os/kernel/cognition/skill_induction');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'md-os/os/mdos.js');

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-neuromorphic-learning-'));
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# Test knowledge base\n');
  writeFile(path.join(workspace, 'md-os/os/.keep'), '');
  writeFile(path.join(workspace, 'md-os/ops/journal.ndjson'), '');
  fs.cpSync(
    path.join(REPO_ROOT, 'md-os/benchmarks'),
    path.join(workspace, 'md-os/benchmarks'),
    { recursive: true }
  );
  return workspace;
}

function runExperiment(workspace, experimentId) {
  return spawnSync(process.execPath, [CLI, 'agi', 'accelerate', '--experiment-id', experimentId], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 120000,
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
}

function lastJson(stdout) {
  const lines = String(stdout || '').trim().split('\n').filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function verifiedEpisode({ episodeId, caseId, parameters, examples }) {
  return {
    episode_id: episodeId,
    verdict: 'success',
    verifier_results: [{ outcome: 'verified' }],
    learning_observation: {
      benchmark_case_id: caseId,
      split: 'development',
      hypothesis_family: 'delimited_boundary_validation_v1',
      parameters,
      examples,
    },
  };
}

test('hypothesis induction requires independent evidence and consolidates one sparse winner', () => {
  assert.equal(allHypotheses().length, 16);

  const first = verifiedEpisode({
    episodeId: 'ep_test_auth',
    caseId: 'software_repair_test_auth',
    parameters: { delimiter: ':', prefix: 'user' },
    examples: [
      { input: 'user:alice', valid: true },
      { input: 'user:alice:extra', valid: false },
      { input: 'guest:alice', valid: false },
    ],
  });
  const second = verifiedEpisode({
    episodeId: 'ep_test_api',
    caseId: 'software_repair_test_api',
    parameters: { delimiter: '|', prefix: 'client' },
    examples: [
      { input: 'client|delta', valid: true },
      { input: 'client|', valid: false },
      { input: 'client|bad.value', valid: false },
    ],
  });

  assert.throws(
    () => induceDelimitedBoundarySkill({ episodes: [first], createdAt: '2026-07-18T00:00:00Z' }),
    /MINIMUM_TWO_EPISODES_REQUIRED/
  );

  const result = induceDelimitedBoundarySkill({
    episodes: [first, second],
    createdAt: '2026-07-18T00:00:00Z',
  });
  assert.equal(result.uniquely_identified, true);
  assert.equal(result.skill.induction.initial_hypothesis_count, 16);
  assert.equal(result.skill.induction.final_hypothesis_count, 1);
  assert.deepEqual(result.skill.induction.selected_constraints, [
    'exact_arity',
    'prefix_match',
    'payload_nonempty',
    'payload_charset',
  ]);
  assert.equal(result.skill.induction.total_information_gain_bits, 4);
  assert.equal(result.skill.neuromorphic_learning.sparse_engram.representation, 'winner_take_all_hypothesis_code');
  assert.equal(result.skill.neuromorphic_learning.sparse_engram.active_unit_count, 1);
  assert.equal(result.skill.neuromorphic_learning.sparse_engram.available_unit_count, 16);
  assert.equal(result.skill.neuromorphic_learning.sparse_engram.density, 0.0625);
});

test('neuromorphic learning experiment improves sealed holdouts at equal one-attempt budget', { timeout: 180000 }, (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const experimentId = 'neuromorphic_integration_test_v1';
  const result = runExperiment(workspace, experimentId);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);

  const payload = lastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.holdout_success_before, 0);
  assert.equal(payload.holdout_success_after, 1);
  assert.equal(payload.absolute_delta, 1);
  assert.equal(payload.success_delta_per_verified_episode, 0.5);
  assert.equal(payload.information_gain_bits_per_episode, 2);
  assert.equal(payload.contamination_detected, false);

  const report = readJson(path.join(workspace, payload.report_file));
  assert.equal(report.status, 'ok');
  assert.equal(report.learning_measurement.baseline_holdout_attempts, 2);
  assert.equal(report.learning_measurement.learned_holdout_attempts, 2);
  assert.equal(report.learning_measurement.regression_count, 0);
  assert.equal(report.learning_measurement.human_interventions, 0);
  assert.equal(report.induction.initial_hypothesis_count, 16);
  assert.equal(report.induction.final_hypothesis_count, 1);
  assert.equal(report.induction.uniquely_identified, true);
  assert.equal(report.neuromorphic_learning.sparse_engram.density, 0.0625);
  assert.equal(report.contamination_audit.contaminated, false);
  assert.equal(report.contamination_audit.checks.experiment_skill_context_isolated, true);
  assert.equal(report.master_closure.status, 'ok');
  assert.equal(report.master_closure.edges.every((edge) => edge.status === 'ok'), true);
  assert.equal(report.claim_state.narrow_learning_transfer_supported, true);
  assert.equal(report.claim_state.agi_achieved, false);
  assert.equal(report.claim_state.agi_claim_supported, false);

  for (const episodeFile of report.evidence.development_episode_files) {
    const episode = readJson(path.join(workspace, episodeFile));
    assert.equal(episode.verdict, 'success');
    assert.deepEqual(episode.errors, []);
    assert.ok(episode.prediction_errors.length > 0);
    assert.equal(episode.learning_observation.split, 'development');
    assert.equal(episode.verifier_results[0].outcome, 'verified');
  }

  const promoted = readJson(path.join(workspace, payload.promoted_skill_file));
  assert.equal(promoted.status, 'promoted');
  assert.equal(promoted.holdout_eval.baseline_success_rate, 0);
  assert.equal(promoted.holdout_eval.learned_success_rate, 1);
  assert.equal(promoted.holdout_eval.contamination_detected, false);

  const loopStatus = readJson(path.join(workspace, 'md-os/ops/agi/loop_status.json'));
  assert.equal(loopStatus.status, 'ok');
  assert.equal(loopStatus.metrics.episode_count, 2);
  assert.equal(loopStatus.metrics.promoted_skill_count, 1);
  assert.equal(loopStatus.findings.some((finding) => finding.code === 'EPISODE_FAILURES_PRESENT'), false);

  const secondResult = runExperiment(workspace, 'neuromorphic_integration_test_v2');
  assert.equal(secondResult.status, 0, `${secondResult.stderr}\n${secondResult.stdout}`);
  const secondPayload = lastJson(secondResult.stdout);
  assert.equal(secondPayload.holdout_success_before, 0);
  assert.equal(secondPayload.holdout_success_after, 1);
  assert.notEqual(secondPayload.skill_id, payload.skill_id);
  const secondReport = readJson(path.join(workspace, secondPayload.report_file));
  assert.equal(secondReport.promotion.promoted_this_run, 1);
  assert.equal(secondReport.promotion.promoted_skill_count, 2);
  assert.equal(secondReport.contamination_audit.contaminated, false);

  const duplicate = runExperiment(workspace, experimentId);
  assert.equal(duplicate.status, 1);
  assert.match(lastJson(duplicate.stdout).error, /APPEND_ONLY_CONFLICT/);
});

test('experiment runtime class has a schema and preserves the AGI claim boundary', () => {
  const schema = readJson(path.join(REPO_ROOT, 'md-os/schemas/neuromorphic_learning_experiment.schema.json'));
  assert.equal(schema.properties.status.enum.includes('ok'), true);
  assert.equal(schema.properties.claim_state.properties.agi_achieved.const, false);
  assert.equal(schema.properties.claim_state.properties.agi_claim_supported.const, false);
  assert.equal(schema.properties.learning_measurement.properties.metric.const, 'verified_holdout_case_success_rate');
});
