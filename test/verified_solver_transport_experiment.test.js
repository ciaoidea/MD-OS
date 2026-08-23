#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { sha256Json } = require('../md-os/kernel/cognition/general_program_synthesis');
const {
  applyFrameBasisPermutation,
  deriveInvariantSketch,
  inversePermutation,
  runVerifiedSolverTransportExperiment,
} = require('../md-os/kernel/cognition/verified_solver_transport_experiment');

const ROOT = path.resolve(__dirname, '..');

test('verified solver transport report is deterministic and hash-bound', () => {
  const first = runVerifiedSolverTransportExperiment();
  const second = runVerifiedSolverTransportExperiment();
  assert.deepEqual(first, second);
  const { report_hash: reportHash, ...payload } = first;
  assert.equal(reportHash, sha256Json(payload));
  assert.equal(first.status, 'ok');
});

test('source-only induction and contamination audit preserve the target boundary', () => {
  const report = runVerifiedSolverTransportExperiment();
  assert.equal(report.frames.source.length, 2);
  assert.equal(report.frames.target.length, 3);
  assert.equal(report.frames.semantic_domain_overlap_count, 0);
  assert.equal(report.source_induction.admitted_solution_count, 2);
  assert.equal(report.source_induction.transported_sketch, 'filter>map');
  assert.equal(report.contamination_audit.status, 'ok');
  assert.deepEqual(report.contamination_audit.target_primitives_in_source_solvers, []);
  assert.equal(report.contamination_audit.target_programs_absent_from_learner_requests, true);
  assert.equal(report.contamination_audit.hidden_tests_absent_from_learner_requests, true);
});

test('matched ablations isolate verified transport on sealed target cases', () => {
  const report = runVerifiedSolverTransportExperiment();
  assert.equal(report.aggregate_measurements.memory_disabled_success, '0/3');
  assert.equal(report.aggregate_measurements.reversed_sham_success, '0/3');
  assert.equal(report.aggregate_measurements.verified_transport_success, '3/3');
  assert.equal(report.aggregate_measurements.verified_transport_hidden_cases_passed, '6/6');
  assert.equal(report.aggregate_measurements.verified_transport_delta_over_memory_disabled, 1);
  for (const measurement of report.target_measurements) {
    assert.equal(measurement.memory_disabled.candidate_budget, 12);
    assert.equal(measurement.reversed_sham.candidate_budget, 12);
    assert.equal(measurement.verified_transport.candidate_budget, 12);
  }
});

test('finite rank-three transport tensor obeys the tested frame-basis permutation law', () => {
  const report = runVerifiedSolverTransportExperiment();
  const tensor = report.transport_tensor.components;
  const permutation = report.transport_tensor.tested_frame_permutation;
  const transformed = applyFrameBasisPermutation(tensor, permutation);
  const restored = applyFrameBasisPermutation(transformed, inversePermutation(permutation));
  assert.deepEqual(restored, tensor);
  assert.deepEqual(report.transport_tensor.shape, [5, 2, 3]);
  assert.equal(report.transport_tensor.equivariance_passed, true);
  assert.equal(deriveInvariantSketch(tensor), 'filter>map');
});

test('schema and claim boundary admit the bounded result but reject AGI promotion', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    ROOT,
    'md-os/schemas/verified_solver_transport_experiment.schema.json',
  ), 'utf8'));
  const report = runVerifiedSolverTransportExperiment();
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.equal(schema.properties.transport_tensor.properties.representation.const, 'finite_discrete_rank_3_solver_structure_tensor');
  assert.equal(report.claim_state.bounded_verified_solver_transport_supported, true);
  assert.equal(report.claim_state.finite_discrete_transport_tensor_supported, true);
  assert.equal(report.claim_state.general_tensor_representation_of_agi_supported, false);
  assert.equal(report.claim_state.open_world_generalization_supported, false);
  assert.equal(report.claim_state.agi_claim_supported, false);
  assert.equal(report.claim_state.externally_replicated, false);
});
