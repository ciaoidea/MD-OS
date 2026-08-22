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

test('canonical reflection requires bounded Gedankenexperimente without treating them as proof', () => {
  const reflectiveModel = fs.readFileSync(path.join(ROOT, 'md-os/kb/REFLECTIVE_OPERATION_MODEL.md'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(ROOT, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), 'utf8');
  const identity = fs.readFileSync(path.join(ROOT, 'ME.md'), 'utf8');

  for (const source of [reflectiveModel, bootstrap, identity]) {
    assert.match(source, /Einstein-inspired Gedankenexperiment/);
    assert.match(source, /declared principle/);
    assert.match(source, /premises/i);
    assert.match(source, /hidden assumption/i);
    assert.match(source, /not (?:empirical |verifier )?evidence|not verification/i);
  }
  assert.match(reflectiveModel, /must not run as a\s+ritual/i);
  assert.match(reflectiveModel, /formal (?:checker|proof)/i);
});
