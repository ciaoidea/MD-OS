#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

const {
  closeOperationalUnityTensor,
  prepareOperationalUnityTensor,
  verifyPreparedArtifact,
} = require('../md-os/kernel/cognition/apfc_operational_unity_tensor');

const FRAME_ID = 'apfc_turn_0123456789abcdef0123';
const AUTHORITY_HASH = 'b'.repeat(64);
const INPUT_HASH = 'a'.repeat(64);
const OUTPUT_HASH = 'c'.repeat(64);
const ACTION_MANIFEST_HASH = 'd'.repeat(64);
const EVIDENCE_MANIFEST_HASH = 'e'.repeat(64);

function closureHashes() {
  return {
    output_hash: OUTPUT_HASH,
    action_manifest_hash: ACTION_MANIFEST_HASH,
    evidence_manifest_hash: EVIDENCE_MANIFEST_HASH,
  };
}

function channels() {
  return {
    operational_self_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
    world_observation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: false },
    goal_refs: { count: 1, present: true, authority_declared: true, verifier_backed: false },
    memory_refs: { count: 2, present: true, authority_declared: false, verifier_backed: false },
    frame_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
    transformation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
    action_refs: { count: 0, present: false, authority_declared: false, verifier_backed: false },
    evidence_refs: { count: 0, present: false, authority_declared: false, verifier_backed: false },
  };
}

function prepared() {
  return prepareOperationalUnityTensor({
    schema_version: 1,
    frame_id: FRAME_ID,
    input_hash: INPUT_HASH,
    authority_hash: AUTHORITY_HASH,
    channels: channels(),
  });
}

test('APFC turn governance tensor verifies only its declared basis view and bookkeeping invariants', () => {
  const artifact = prepared();
  assert.equal(artifact.status, 'verified');
  assert.equal(artifact.phase, 'prepared');
  assert.equal(artifact.artifact_role, 'turn_governance_telemetry');
  assert.equal(artifact.scope, 'bounded_apfc_turn_governance_tensor');
  assert.equal(artifact.protected_invariants.includes('human_request_remains_target'), false);
  assert.ok(artifact.non_claims.includes('not world-grounded epistemic unity'));
  assert.deepEqual(artifact.source_tensor.length, 8);
  assert.ok(artifact.source_tensor.every((row) => row.length === 4));
  assert.equal(artifact.transformation.residuals.tensor_law, 0);
  assert.equal(artifact.transformation.residuals.roundtrip, 0);
  assert.equal(artifact.transformation.residuals.composition, 0);
  assert.ok(Object.values(artifact.criteria).every(Boolean));
  assert.equal(verifyPreparedArtifact(artifact), true);
});

test('turn closure binds action and verifier evidence without promoting an unverified outcome', () => {
  const closedUnknown = closeOperationalUnityTensor({
    schema_version: 1,
    frame_id: FRAME_ID,
    input_hash: INPUT_HASH,
    authority_hash: AUTHORITY_HASH,
    ...closureHashes(),
    prepared: prepared(),
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'unknown',
    channels: {
      action_refs: { count: 1, present: true, authority_declared: true, verifier_backed: false },
      evidence_refs: { count: 0, present: false, authority_declared: false, verifier_backed: false },
      transformation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
    },
  });
  assert.equal(closedUnknown.status, 'verified');
  assert.equal(closedUnknown.cognitive_outcome_status, 'unverified');
  assert.equal(closedUnknown.output_hash, OUTPUT_HASH);
  assert.equal(closedUnknown.action_manifest_hash, ACTION_MANIFEST_HASH);
  assert.equal(closedUnknown.evidence_manifest_hash, EVIDENCE_MANIFEST_HASH);
  assert.equal(closedUnknown.channels.action_refs.count, 1);
  assert.equal(closedUnknown.channels.evidence_refs.verifier_backed, false);
  assert.equal(closedUnknown.prepared_artifact.artifact_hash, closedUnknown.prepared_artifact_hash);
  assert.equal(verifyPreparedArtifact(closedUnknown.prepared_artifact), true);

  const closedPass = closeOperationalUnityTensor({
    schema_version: 1,
    frame_id: FRAME_ID,
    input_hash: INPUT_HASH,
    authority_hash: AUTHORITY_HASH,
    ...closureHashes(),
    prepared: prepared(),
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'pass',
    channels: {
      action_refs: { count: 2, present: true, authority_declared: true, verifier_backed: false },
      evidence_refs: { count: 1, present: true, authority_declared: false, verifier_backed: true },
      transformation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
    },
  });
  assert.equal(closedPass.status, 'verified');
  assert.equal(closedPass.cognitive_outcome_status, 'verified');
  assert.ok(Object.values(closedPass.criteria).every(Boolean));
});

test('tampering and protected-frame drift fail closed', () => {
  const tampered = prepared();
  tampered.source_tensor[0][0] = 0;
  assert.equal(verifyPreparedArtifact(tampered), false);
  assert.throws(() => closeOperationalUnityTensor({
    schema_version: 1,
    frame_id: FRAME_ID,
    input_hash: INPUT_HASH,
    authority_hash: AUTHORITY_HASH,
    ...closureHashes(),
    prepared: tampered,
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'unknown',
  }), /PREPARED_ARTIFACT_INVALID/);

  const drifted = closeOperationalUnityTensor({
    schema_version: 1,
    frame_id: 'apfc_turn_ffffffffffffffffffff',
    input_hash: INPUT_HASH,
    authority_hash: AUTHORITY_HASH,
    ...closureHashes(),
    prepared: prepared(),
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'unknown',
  });
  assert.equal(drifted.status, 'rejected');
  assert.equal(drifted.criteria.frame_id_preserved, false);

  const authorityDrifted = closeOperationalUnityTensor({
    schema_version: 1,
    frame_id: FRAME_ID,
    input_hash: INPUT_HASH,
    authority_hash: 'f'.repeat(64),
    ...closureHashes(),
    prepared: prepared(),
    assistant_output_epistemic_status: 'proposal',
    verifier_verdict: 'unknown',
  });
  assert.equal(authorityDrifted.status, 'rejected');
  assert.equal(authorityDrifted.criteria.workspace_authority_boundary_preserved, false);

  assert.throws(() => closeOperationalUnityTensor({ prepared: prepared(), schema_version: 1 }),
    /OUTPUT_HASH_INVALID/);
});

test('the tensor artifact contains hashes and counts, not private natural-language content', () => {
  const artifact = prepared();
  const serialized = JSON.stringify(artifact);
  assert.equal(serialized.includes('private human request'), false);
  assert.equal(serialized.includes('private assistant output'), false);
  assert.equal(artifact.input_hash, INPUT_HASH);
  assert.ok(artifact.non_claims.includes('not semantic verification of an intent or hypothesis'));
  assert.ok(artifact.non_claims.includes('not evidence of phenomenal consciousness'));
});
