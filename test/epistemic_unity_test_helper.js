'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { sha256Json } = require('../md-os/kernel/cognition/general_program_synthesis');
const { sealEpistemicUnityCandidate } = require('../md-os/kernel/cognition/epistemic_unity_verifier');

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

function workspaceEvidence(prefix = 'evidence') {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-epistemic-unity-'));
  const refs = [
    'development/source_cases',
    'observations/a', 'observations/b', 'observations/c',
    'transform/a_b', 'transform/b_c', 'transform/c_a',
    'controls/baseline', 'controls/sham', 'controls/severed',
    'audit/contamination', 'replication/independent',
  ];
  const manifest = refs.map((evidenceRef) => {
    const relativeFile = `${prefix}/${evidenceRef.replaceAll('/', '__')}.json`;
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

module.exports = { candidate, workspaceEvidence, verificationInput };
