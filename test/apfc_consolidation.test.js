'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { createLearningFixture, writeJson } = require('./apfc_test_helpers');
const { runConsolidation } = require('../md-os/apfc/executive/consolidator');

test('bounded consolidation turns two verified episodes and sealed unseen cases into promotable—not promoted—skill state', () => {
  const env = createLearningFixture();
  const cycle = runConsolidation({ ops_root: env.ops, apfc_dir: env.apfc, created_at: '2026-08-02T00:00:00Z', lock_name: `apfc_test_consolidate_${path.basename(env.workspace)}` });
  assert.equal(cycle.state, 'promotable');
  assert.equal(cycle.external_action_count, 0);
  assert.equal(cycle.readback.promotion_during_consolidation, false);
  assert.equal(cycle.readback.replay_duplicate_evidence_count, 0);
  assert.equal(cycle.skill_candidates[0].gate.status, 'ok');
  assert.equal(cycle.skill_candidates[0].gate.measurement.holdout_case_count, 30);
  assert.equal(cycle.skill_candidates[0].gate.measurement.observation_count, 90);
  assert.equal(cycle.hypotheses[0].epistemic_status, 'hypothetical');
  assert.equal(fs.existsSync(path.join(env.ops, 'skills', 'promoted', `${env.skillId}.json`)), false);
  const candidate = JSON.parse(fs.readFileSync(path.join(env.ops, 'skills', 'candidates', `${env.skillId}.json`), 'utf8'));
  assert.equal(candidate.status, 'promotable');

  candidate.sealed_evaluation.contamination_detected = true;
  writeJson(path.join(env.ops, 'skills', 'candidates', `${env.skillId}.json`), candidate);
  const blocked = runConsolidation({ ops_root: env.ops, apfc_dir: env.apfc, created_at: '2026-08-03T00:00:00Z', lock_name: `apfc_test_consolidate_${path.basename(env.workspace)}` });
  assert.notEqual(blocked.state, 'promotable');
  assert.equal(blocked.skill_candidates[0].gate.checks.no_contamination, false);
  const demoted = JSON.parse(fs.readFileSync(path.join(env.ops, 'skills', 'candidates', `${env.skillId}.json`), 'utf8'));
  assert.equal(demoted.status, 'candidate');
  assert.notEqual(demoted.promotion_gate_status, 'ok');
});
