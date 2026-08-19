'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { compare, validateTask } = require('../md-os/os/contextual_feeling_experiment');

const ROOT = path.resolve(__dirname, '..');
const TASK = JSON.parse(fs.readFileSync(path.join(ROOT, 'md-os/examples/contextual_feeling_experiment.json'), 'utf8'));

test('contextual feeling fixture has valid bounded cases', () => {
  assert.equal(validateTask(TASK), TASK);
  assert.equal(new Set(TASK.cases.map((item) => item.perception)).size, 1);
});

test('integrated context gives one signal different situated meanings', () => {
  const report = compare(TASK, '2026-08-19T00:00:00Z');
  assert.equal(report.metrics.same_signal_different_action, true);
  assert.deepEqual(report.cases.map((item) => item.contextual_action), [
    'shield_sensor_and_repeat',
    'continue',
  ]);
});

test('contextual state improves choice over the signal-only control', () => {
  const report = compare(TASK, '2026-08-19T00:00:00Z');
  assert.equal(report.metrics.control_accuracy, 0.5);
  assert.equal(report.metrics.contextual_accuracy, 1);
  assert.equal(report.metrics.accuracy_delta, 0.5);
  assert.equal(report.metrics.context_improved_choice, true);
  assert.equal(report.verdict, 'verified_contextual_effect');
  assert.match(report.supported_claim, /controlled fixture/);
});

test('contextual feeling task and report runtime classes have schemas', () => {
  for (const name of ['contextual_feeling_experiment.schema.json', 'contextual_feeling_report.schema.json']) {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'md-os/schemas', name), 'utf8'));
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});
