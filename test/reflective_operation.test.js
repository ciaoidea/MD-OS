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

test('reflective task and report runtime classes have schemas', () => {
  for (const name of ['reflective_experiment.schema.json', 'reflective_experiment_report.schema.json']) {
    const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'md-os/schemas', name), 'utf8'));
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});

test('canonical frame-sensitive reflection challenges hidden frames and bounds Gedankenexperimente without treating them as proof', () => {
  const reflectiveModel = fs.readFileSync(path.join(ROOT, 'md-os/kb/REFLECTIVE_OPERATION_MODEL.md'), 'utf8');
  const bootstrap = fs.readFileSync(path.join(ROOT, 'md-os/kb/COGNITIVE_BOOTSTRAP.md'), 'utf8');
  const identity = fs.readFileSync(path.join(ROOT, 'ME.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  const zenodoPaper = fs.readFileSync(path.join(ROOT, 'docs/papers/zenodo/paper.tex'), 'utf8');
  const zenodoReadme = fs.readFileSync(path.join(ROOT, 'docs/papers/zenodo/README.md'), 'utf8');
  const zenodoRevisionNotes = fs.readFileSync(path.join(ROOT, 'docs/papers/zenodo/REVISION_NOTES.md'), 'utf8');

  for (const source of [reflectiveModel, bootstrap, identity, readme]) {
    assert.match(source, /Einstein-inspired Gedankenexperiment/);
    assert.match(source, /declared principle/);
    assert.match(source, /premises/i);
    assert.match(source, /hidden assumption/i);
    assert.match(source, /not (?:empirical |verifier )?evidence|not verification/i);
  }
  for (const source of [reflectiveModel, bootstrap]) {
    assert.match(source, /scientific/i);
    assert.match(source, /hidden\s+frame/i);
    assert.match(source, /source\s+domain/i);
    assert.match(source, /target\s+domain/i);
    assert.match(source, /admissible\s+transformation/i);
    assert.match(source, /invariants\s+survive/i);
    assert.match(source, /general\s+representation/i);
    assert.match(source, /real-world\s+observation/i);
  }
  for (const source of [reflectiveModel, bootstrap, identity, readme]) {
    assert.match(source, /frame-sensitive/i);
    assert.match(source, /Einstein-inspired/i);
    assert.match(source, /operational\s+synthesis/i);
    assert.match(source, /not a(?: historical)?\s+claim that Einstein published this(?:\s+exact)?\s+algorithm/i);
  }
  assert.match(reflectiveModel, /einstein-online\.info/);
  assert.match(reflectiveModel, /plato\.stanford\.edu\/entries\/einstein-philscience/);
  for (const zenodoSource of [zenodoPaper, zenodoReadme, zenodoRevisionNotes]) {
    assert.match(zenodoSource, /frame-sensitive|frame-transformation-invariant/i);
    assert.match(zenodoSource, /hidden frame/i);
    assert.match(zenodoSource, /source and target domains/i);
    assert.match(zenodoSource, /admissible transformation/i);
    assert.match(zenodoSource, /preserved structure|structure the transformation preserves/i);
    assert.match(zenodoSource, /surviving invariants|invariants survive/i);
    assert.match(zenodoSource, /smallest general representation/i);
    assert.match(zenodoSource, /MD-OS\/APFC operational synthesis/i);
    assert.match(zenodoSource, /not (?:as )?an exact algorithm published by Einstein|not a claim that Einstein published this exact algorithm/i);
  }
  assert.match(zenodoPaper, /poessel2010equivalence/);
  assert.match(zenodoPaper, /howardgiovanelli2025einstein/);
  assert.match(reflectiveModel, /must not run as a\s+ritual/i);
  assert.match(reflectiveModel, /formal (?:checker|proof)/i);
  assert.match(reflectiveModel, /must not become an automatic\s+ritual/i);
});
