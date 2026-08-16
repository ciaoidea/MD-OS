#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  TRUE_PROTOCOL,
  PROTOCOL_PRESETS,
  allProtocolHypotheses,
  routeRecord,
  developmentExamples,
  developmentExamplesForPreset,
  induceProtocolSkill,
  generateHoldoutCases,
  generateHoldoutCasesForPreset,
  buildTrialPrompt,
  exactMcNemar,
  verifyCausalLearningExperiment,
} = require('../md-os/kernel/cognition/apfc_causal_learning_experiment');

const REPO_ROOT = path.resolve(__dirname, '..');

test('verified development evidence uniquely induces one portable operational skill', () => {
  const examples = developmentExamples();
  const result = induceProtocolSkill(examples, '2026-08-13T00:00:00Z');
  assert.equal(allProtocolHypotheses().length, 216);
  assert.equal(result.hypotheses.length, 216);
  assert.equal(result.survivors.length, 1);
  assert.deepEqual(result.selected, TRUE_PROTOCOL);
  assert.equal(result.skill.induction.uniquely_identified, true);
  assert.equal(result.skill.procedure.length, 7);
  assert.equal(result.skill.status, 'candidate');
});

test('prospective Orion-17 cohort uniquely identifies a different protocol and seals protected holdouts', () => {
  const preset = PROTOCOL_PRESETS.orion17;
  const examples = developmentExamplesForPreset(preset);
  const result = induceProtocolSkill(examples, '2026-08-13T00:00:00Z', preset);
  const holdouts = generateHoldoutCasesForPreset('apfc_orion17_unit_test', 30, preset);
  assert.equal(result.survivors.length, 1);
  assert.deepEqual(result.selected, preset.protocol);
  assert.match(result.skill.skill_id, /^skill_orion17_operational_routing_/);
  assert.equal(holdouts.length, 30);
  assert.equal(holdouts.filter((item) => item.protected).length, 12);
  assert.equal(holdouts.filter((item) => item.expected.route === 'vault').length, 12);
  const developmentHashes = new Set(examples.map((item) => JSON.stringify(item.record)));
  assert.equal(holdouts.some((item) => developmentHashes.has(JSON.stringify(item.record))), false);
  for (const item of holdouts) assert.deepEqual(routeRecord(item.record, preset.protocol), item.expected);
});

test('sealed holdouts are distinct, balanced, and exactly verifiable', () => {
  const holdouts = generateHoldoutCases('apfc_unit_test_v1', 30);
  assert.equal(holdouts.length, 30);
  assert.equal(new Set(holdouts.map((item) => item.case_id)).size, 30);
  assert.equal(holdouts.filter((item) => item.expected.route === 'vault').length, 12);
  for (const item of holdouts) assert.deepEqual(routeRecord(item.record, TRUE_PROTOCOL), item.expected);
  const developmentHashes = new Set(developmentExamples().map((item) => JSON.stringify(item.record)));
  assert.equal(holdouts.some((item) => developmentHashes.has(JSON.stringify(item.record))), false);
});

test('memory-disabled prompt excludes the skill and enabled prompt contains no development examples', () => {
  const holdout = generateHoldoutCases('apfc_unit_test_v2', 30)[0];
  const { skill } = induceProtocolSkill(developmentExamples(), '2026-08-13T00:00:00Z');
  const disabled = buildTrialPrompt(holdout, null);
  const enabled = buildTrialPrompt(holdout, skill);
  assert.match(disabled, /pathway is disabled/);
  assert.doesNotMatch(disabled, /split token on/);
  assert.match(enabled, /split token on/);
  for (const example of developmentExamples()) {
    assert.doesNotMatch(enabled, new RegExp(example.example_id));
    assert.doesNotMatch(enabled, new RegExp(example.record.token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('exact paired McNemar implementation closes strong discordant evidence', () => {
  assert.equal(exactMcNemar(0, 0), 1);
  assert.equal(exactMcNemar(1, 1), 1);
  assert.ok(exactMcNemar(0, 10) < 0.01);
  assert.ok(exactMcNemar(2, 20) < 0.001);
});

test('experiment and response runtime classes have explicit schemas', () => {
  for (const fileName of [
    'apfc_causal_learning_response.schema.json',
    'apfc_causal_learning_experiment.schema.json',
  ]) {
    const payload = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os/schemas', fileName), 'utf8'));
    assert.equal(payload.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(payload.type, 'object');
  }
});

test('persisted real-model experiment has replay-verifiable hashes and paired receipts when present', () => {
  const reportFile = path.join(
    REPO_ROOT,
    'md-os/ops/agi/learning_experiments/apfc_codex_causal_learning_20260813_v1/report.json'
  );
  if (!fs.existsSync(reportFile)) return;
  const result = verifyCausalLearningExperiment(reportFile);
  assert.equal(result.ok, true, JSON.stringify(result.failed_checks));
  assert.equal(result.receipt_count, 180);
  assert.equal(result.paired_observation_count, 90);
  assert.equal(result.bounded_causal_external_memory_learning_supported, true);
});

test('prospective Orion-17 production experiment is independently replay-verifiable when present', () => {
  const reportFile = path.join(
    REPO_ROOT,
    'md-os/ops/agi/learning_experiments/apfc_codex_prospective_orion17_20260813_v2/report.json'
  );
  if (!fs.existsSync(reportFile)) return;
  const result = verifyCausalLearningExperiment(reportFile);
  assert.equal(result.ok, true, JSON.stringify(result.failed_checks));
  assert.equal(result.receipt_count, 180);
  assert.equal(result.paired_observation_count, 90);
  assert.equal(result.recomputed_measurement.memory_enabled_success_count, 90);
  assert.equal(result.recomputed_measurement.memory_disabled_success_count, 11);
  assert.equal(result.bounded_causal_external_memory_learning_supported, true);
  const promoted = JSON.parse(fs.readFileSync(path.join(
    REPO_ROOT,
    'md-os/ops/skills/promoted/skill_orion17_operational_routing_df48dfbae5dbcfe7.json'
  ), 'utf8'));
  assert.equal(promoted.status, 'promoted');
  assert.match(promoted.promotion_receipt_id, /^receipt_apfc_promotion_/);
  assert.match(promoted.source_consolidation_cycle_id, /^apfc_cycle_/);
});
