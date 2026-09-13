#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { sha256Json } = require('../md-os/kernel/cognition/general_program_synthesis');
const {
  sealEpistemicUnityCandidate,
  verifyEpistemicUnityCandidate,
} = require('../md-os/kernel/cognition/epistemic_unity_verifier');

const { candidate, workspaceEvidence, verificationInput } = require('./epistemic_unity_test_helper');

test('sealed cross-domain hypothesis is supported only after independent world readback and controls', () => {
  const { workspace, manifest } = workspaceEvidence();
  const report = verifyEpistemicUnityCandidate(verificationInput(manifest), { workspace_root: workspace });
  assert.equal(report.status, 'supported_bounded');
  assert.equal(report.statuses.hypothesis_world_correspondence, 'verified_bounded');
  assert.equal(report.statuses.cross_frame_unity, 'verified_bounded');
  assert.equal(report.statuses.causal_integration, 'verified_bounded');
  assert.equal(report.statuses.independent_replication, 'verified_bounded');
  assert.ok(Object.values(report.criteria).every(Boolean));
  const { verification_hash: verificationHash, ...payload } = report;
  assert.equal(verificationHash, sha256Json(payload));
});

test('bounded public runtime exposes the world-grounded verifier without persisting a claim', () => {
  const { workspace, manifest } = workspaceEvidence();
  const runtime = path.resolve(__dirname, '../md-os/os/epistemic_unity_runtime.js');
  const result = spawnSync(process.execPath, [runtime, 'verify'], {
    cwd: workspace,
    input: JSON.stringify(verificationInput(manifest)),
    encoding: 'utf8',
    env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace },
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout.trim());
  assert.equal(report.status, 'supported_bounded');
  assert.equal(report.statuses.hypothesis_world_correspondence, 'verified_bounded');
});

test('internal coherence cannot substitute for a failed sealed prediction', () => {
  const { workspace, manifest } = workspaceEvidence();
  const input = verificationInput(manifest);
  input.prediction_readbacks[1].observed_value = 0.7;
  const report = verifyEpistemicUnityCandidate(input, { workspace_root: workspace });
  assert.equal(report.status, 'rejected_or_unverified');
  assert.equal(report.criteria.sealed_independent_predictions_pass, false);
  assert.equal(report.statuses.hypothesis_world_correspondence, 'unverified');
});

test('missing or stale world evidence rejects a verbally passing hypothesis', () => {
  const { workspace, manifest } = workspaceEvidence();
  const input = verificationInput(manifest);
  const observation = manifest.find((entry) => entry.evidence_ref === 'observations/a');
  fs.writeFileSync(path.join(workspace, observation.relative_file), '{"tampered":true}\n');
  const report = verifyEpistemicUnityCandidate(input, { workspace_root: workspace });
  assert.equal(report.status, 'rejected_or_unverified');
  assert.equal(report.criteria.all_evidence_files_current_and_hash_bound, false);
});

test('the tensor form is not necessary when the simpler baseline survives', () => {
  const { workspace, manifest } = workspaceEvidence();
  const input = verificationInput(manifest);
  input.controls.simpler_baseline_status = 'passed_equally_well';
  const report = verifyEpistemicUnityCandidate(input, { workspace_root: workspace });
  assert.equal(report.status, 'rejected_or_unverified');
  assert.equal(report.statuses.hypothesis_world_correspondence, 'verified_bounded');
  assert.equal(report.statuses.causal_integration, 'unverified');
  assert.equal(report.criteria.simpler_baseline_rejected, false);
});

test('a hypothesis cannot be sealed after target evidence was accessed', () => {
  assert.throws(() => sealEpistemicUnityCandidate({
    schema_version: 1,
    hypothesis_id: 'posthoc',
    hypothesis_statement: 'Post-hoc story',
    premises: ['A premise'],
    competing_hypotheses: [{ hypothesis_id: 'alternative' }],
    simpler_baseline_id: 'alternative',
    frame_predictions: [
      { prediction_id: 'a', frame_id: 'a', domain_id: 'a', prediction: 'a', metric_id: 'm', threshold: 1, comparator: 'eq' },
      { prediction_id: 'b', frame_id: 'b', domain_id: 'b', prediction: 'b', metric_id: 'm', threshold: 1, comparator: 'eq' },
      { prediction_id: 'c', frame_id: 'c', domain_id: 'c', prediction: 'c', metric_id: 'm', threshold: 1, comparator: 'eq' },
    ],
    declared_invariants: [{ invariant_id: 'i', declaration: 'i' }],
    falsifiers: ['failure'],
    sealed_before_world_readback: true,
    target_evidence_accessed: true,
  }), /PRESEAL_REQUIRED/);
});

test('epistemic unity artifacts have closed schemas', () => {
  for (const name of ['epistemic_unity_candidate.schema.json', 'epistemic_unity_verification.schema.json']) {
    const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../md-os/schemas', name), 'utf8'));
    assert.equal(schema.additionalProperties, false);
  }
});
