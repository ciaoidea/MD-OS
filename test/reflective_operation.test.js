'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { compare, evaluate } = require('../md-os/os/reflective_operation');

const ROOT = path.resolve(__dirname, '..');
const TASK = JSON.parse(fs.readFileSync(path.join(ROOT, 'md-os/examples/reflective_seasons_experiment.json'), 'utf8'));

test('direct candidate fails the declared evidence contract', () => {
  const result = evaluate(TASK.direct_candidate, TASK);
  assert.equal(result.passed, false);
  assert.ok(result.forbidden_checks.some((item) => item.triggered));
});

test('reflective revision passes and measurably improves the score', () => {
  const report = compare(TASK, '2026-08-18T00:00:00Z');
  assert.equal(report.metrics.direct_passed, false);
  assert.equal(report.metrics.reflective_passed, true);
  assert.equal(report.metrics.reflection_improved, true);
  assert.ok(report.metrics.score_delta > 0);
  assert.equal(report.verdict, 'verified_improvement');
  assert.ok(report.reflective.critique.length >= 2);
});

test('fixture follows the reflective experiment schema shape', () => {
  for (const key of ['experiment_id', 'question', 'direct_candidate', 'revised_candidate']) {
    assert.equal(typeof TASK[key], 'string');
    assert.ok(TASK[key].length > 0);
  }
  assert.ok(TASK.evidence.length > 0);
  assert.ok(TASK.required_facts.length > 0);
  assert.ok(Array.isArray(TASK.forbidden_claims));
});
