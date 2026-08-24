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

function candidate() {
  return sealEpistemicUnityCandidate({
    schema_version: 1,
    hypothesis_id: 'hypothesis_shared_relation_v1',
    hypothesis_statement: 'One declared relation predicts the three local observations under the admitted frame maps.',
    premises: ['The three measurements have independent provenance.', 'The declared frames expose the same tested relation.'],
    competing_hypotheses: [{ hypothesis_id: 'independent_local_fit', statement: 'Each domain is fit independently.' }],
    simpler_baseline_id: 'independent_local_fit',
    frame_predictions: [
      { prediction_id: 'prediction_a', frame_id: 'frame_a', domain_id: 'domain_a', prediction: 'score at least 0.8', metric_id: 'score', threshold: 0.8, comparator: 'gte' },
      { prediction_id: 'prediction_b', frame_id: 'frame_b', domain_id: 'domain_b', prediction: 'error at most 0.2', metric_id: 'error', threshold: 0.2, comparator: 'lte' },
      { prediction_id: 'prediction_c', frame_id: 'frame_c', domain_id: 'domain_c', prediction: 'class equals 1', metric_id: 'class', threshold: 1, comparator: 'eq' },
    ],
    declared_invariants: [{ invariant_id: 'relation_preserved', declaration: 'The tested relation survives every admitted frame map.' }],
    falsifiers: ['Any sealed prediction misses its threshold.', 'The frame loop is not coherent.', 'The simpler baseline predicts equally well.'],
    development_evidence_refs: ['development/source_cases'],
    sealed_before_world_readback: true,
    target_evidence_accessed: false,
  });
}

function workspaceEvidence() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-epistemic-unity-'));
  const refs = [
    'development/source_cases',
    'observations/a', 'observations/b', 'observations/c',
    'transform/a_b', 'transform/b_c', 'transform/c_a',
    'controls/baseline', 'controls/sham', 'controls/severed',
    'audit/contamination', 'replication/independent',
  ];
  const manifest = refs.map((evidenceRef) => {
    const relativeFile = `evidence/${evidenceRef.replaceAll('/', '__')}.json`;
    const absoluteFile = path.join(workspace, relativeFile);
    const content = `${JSON.stringify({ evidence_ref: evidenceRef, observed: true })}\n`;
    fs.mkdirSync(path.dirname(absoluteFile), { recursive: true });
    fs.writeFileSync(absoluteFile, content);
    return {
      evidence_ref: evidenceRef,
      storage: 'workspace_file',
      relative_file: relativeFile,
      sha256: createHash('sha256').update(content).digest('hex'),
    };
  });
  return { workspace, manifest };
}

function transformation(verificationId, sourceFrame, targetFrame, sourceDomain, targetDomain, evidenceEntry) {
  const payload = {
    schema_version: 1,
    verification_id: verificationId,
    transformation_id: `transform_${sourceFrame}_${targetFrame}`,
    status: 'verified',
    source_frame_id: sourceFrame,
    target_frame_id: targetFrame,
    source_domain_id: sourceDomain,
    target_domain_id: targetDomain,
    invariants: [{ invariant_id: 'relation_preserved', passed: true }],
    evidence_manifest: [evidenceEntry],
  };
  return { ...payload, verification_hash: sha256Json(payload) };
}

function verificationInput(manifest) {
  const evidence = (reference) => manifest.find((entry) => entry.evidence_ref === reference);
  return {
    schema_version: 1,
    candidate: candidate(),
    prediction_readbacks: [
      { prediction_id: 'prediction_a', verifier_id: 'oracle_a', independent_from_hypothesis_generator: true, candidate_sealed_before_observation: true, observed_value: 0.9, evidence_refs: ['observations/a'] },
      { prediction_id: 'prediction_b', verifier_id: 'oracle_b', independent_from_hypothesis_generator: true, candidate_sealed_before_observation: true, observed_value: 0.1, evidence_refs: ['observations/b'] },
      { prediction_id: 'prediction_c', verifier_id: 'oracle_c', independent_from_hypothesis_generator: true, candidate_sealed_before_observation: true, observed_value: 1, evidence_refs: ['observations/c'] },
    ],
    transformation_reports: [
      transformation('verification_a_b', 'frame_a', 'frame_b', 'domain_a', 'domain_b', evidence('transform/a_b')),
      transformation('verification_b_c', 'frame_b', 'frame_c', 'domain_b', 'domain_c', evidence('transform/b_c')),
      transformation('verification_c_a', 'frame_c', 'frame_a', 'domain_c', 'domain_a', evidence('transform/c_a')),
    ],
    controls: {
      simpler_baseline_id: 'independent_local_fit',
      simpler_baseline_status: 'rejected_on_sealed_evidence',
      sham_status: 'failed_as_expected',
      integration_delta_lower_bound: 0.1,
      evidence_refs: ['controls/baseline', 'controls/sham', 'controls/severed'],
    },
    contamination_audit: {
      status: 'ok',
      target_evidence_exposed_before_candidate: false,
      evidence_refs: ['audit/contamination'],
    },
    replication: {
      status: 'passed',
      independent_from_original_execution: true,
      evidence_refs: ['replication/independent'],
    },
    evidence_manifest: manifest,
  };
}

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
