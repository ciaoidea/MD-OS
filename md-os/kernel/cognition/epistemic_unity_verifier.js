#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { sha256Json } = require('./general_program_synthesis');

function fail(code) {
  throw new Error(code);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function unique(values) {
  return [...new Set(values)];
}

function hashPayload(artifact, field) {
  if (!artifact || !/^[a-f0-9]{64}$/.test(String(artifact[field] || ''))) return false;
  const { [field]: claimedHash, ...payload } = artifact;
  return claimedHash === sha256Json(payload);
}

function sealEpistemicUnityCandidate(input) {
  if (!input || input.schema_version !== 1) fail('EPISTEMIC_UNITY_CANDIDATE_INVALID');
  if (!nonEmpty(input.hypothesis_id) || !nonEmpty(input.hypothesis_statement)) {
    fail('EPISTEMIC_UNITY_HYPOTHESIS_REQUIRED');
  }
  if (!Array.isArray(input.premises) || input.premises.length === 0 || !input.premises.every(nonEmpty)) {
    fail('EPISTEMIC_UNITY_PREMISES_REQUIRED');
  }
  if (!Array.isArray(input.competing_hypotheses) || input.competing_hypotheses.length === 0) {
    fail('EPISTEMIC_UNITY_COMPETING_HYPOTHESIS_REQUIRED');
  }
  if (!nonEmpty(input.simpler_baseline_id)) fail('EPISTEMIC_UNITY_SIMPLER_BASELINE_REQUIRED');
  if (!Array.isArray(input.frame_predictions) || input.frame_predictions.length < 3) {
    fail('EPISTEMIC_UNITY_THREE_FRAME_PREDICTIONS_REQUIRED');
  }
  const predictionIds = input.frame_predictions.map((item) => item && item.prediction_id);
  const frameIds = input.frame_predictions.map((item) => item && item.frame_id);
  const domainIds = input.frame_predictions.map((item) => item && item.domain_id);
  const predictionsValid = input.frame_predictions.every((item) => (
    item
    && nonEmpty(item.prediction_id)
    && nonEmpty(item.frame_id)
    && nonEmpty(item.domain_id)
    && nonEmpty(item.prediction)
    && nonEmpty(item.metric_id)
    && Number.isFinite(item.threshold)
    && ['lte', 'gte', 'eq'].includes(item.comparator)
  ));
  if (!predictionsValid
      || unique(predictionIds).length !== predictionIds.length
      || unique(frameIds).length !== frameIds.length
      || unique(domainIds).length < 3) {
    fail('EPISTEMIC_UNITY_FRAME_PREDICTIONS_INVALID');
  }
  if (!Array.isArray(input.declared_invariants) || input.declared_invariants.length === 0
      || !input.declared_invariants.every((item) => item && nonEmpty(item.invariant_id) && nonEmpty(item.declaration))) {
    fail('EPISTEMIC_UNITY_INVARIANTS_REQUIRED');
  }
  if (!Array.isArray(input.falsifiers) || input.falsifiers.length === 0 || !input.falsifiers.every(nonEmpty)) {
    fail('EPISTEMIC_UNITY_FALSIFIERS_REQUIRED');
  }
  if (input.sealed_before_world_readback !== true || input.target_evidence_accessed === true) {
    fail('EPISTEMIC_UNITY_PRESEAL_REQUIRED');
  }
  const payload = {
    schema_version: 1,
    candidate_id: `epistemic_unity_${sha256Json({ hypothesis_id: input.hypothesis_id, frame_predictions: input.frame_predictions }).slice(0, 20)}`,
    status: 'sealed_candidate',
    scope: 'bounded_world_grounded_epistemic_unity_candidate',
    hypothesis_id: input.hypothesis_id,
    hypothesis_statement: input.hypothesis_statement,
    premises: input.premises,
    competing_hypotheses: input.competing_hypotheses,
    simpler_baseline_id: input.simpler_baseline_id,
    frame_predictions: input.frame_predictions,
    declared_invariants: input.declared_invariants,
    falsifiers: input.falsifiers,
    development_evidence_refs: Array.isArray(input.development_evidence_refs) ? input.development_evidence_refs : [],
    sealed_before_world_readback: true,
    target_evidence_accessed: false,
    epistemic_rule: 'Internal coherence is necessary but never sufficient; promotion requires sealed predictions and independent world readback.',
    non_claims: [
      'not proof that the hypothesis is universally true',
      'not evidence of AGI',
      'not evidence of phenomenal consciousness',
      'not permission for the hypothesis generator to verify itself',
    ],
  };
  return { ...payload, candidate_hash: sha256Json(payload) };
}

function measurementPass(readback, prediction) {
  const value = Number(readback && readback.observed_value);
  if (!Number.isFinite(value)) return false;
  if (prediction.comparator === 'lte') return value <= prediction.threshold;
  if (prediction.comparator === 'gte') return value >= prediction.threshold;
  return value === prediction.threshold;
}

function evidenceRefsFrom(input) {
  return unique([
    ...(input.candidate.development_evidence_refs || []),
    ...(input.prediction_readbacks || []).flatMap((item) => item.evidence_refs || []),
    ...(input.transformation_reports || []).flatMap((item) => (
      (item.evidence_manifest || []).map((entry) => entry.evidence_ref)
    )),
    ...(input.controls && input.controls.evidence_refs || []),
    ...(input.contamination_audit && input.contamination_audit.evidence_refs || []),
    ...(input.replication && input.replication.evidence_refs || []),
  ]);
}

function evidenceManifestValid(manifest, requiredRefs, workspaceRoot) {
  if (!Array.isArray(manifest) || manifest.length === 0 || !workspaceRoot) return false;
  const root = path.resolve(workspaceRoot);
  const seen = new Set();
  for (const entry of manifest) {
    if (!entry || entry.storage !== 'workspace_file' || !nonEmpty(entry.evidence_ref)
        || !nonEmpty(entry.relative_file) || path.isAbsolute(entry.relative_file)
        || !/^[a-f0-9]{64}$/.test(String(entry.sha256 || '')) || seen.has(entry.evidence_ref)) return false;
    const resolved = path.resolve(root, entry.relative_file);
    const relative = path.relative(root, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    try {
      const actual = createHash('sha256').update(fs.readFileSync(resolved)).digest('hex');
      if (actual !== entry.sha256) return false;
    } catch (_) {
      return false;
    }
    seen.add(entry.evidence_ref);
  }
  return requiredRefs.length > 0 && requiredRefs.every((reference) => seen.has(reference));
}

function verifyEpistemicReadbackReceipt(receipt, workspaceRoot) {
  if (!hashPayload(receipt, 'receipt_hash')) return false;
  return Boolean(
    receipt.schema_version === 1
    && receipt.status === 'passed'
    && nonEmpty(receipt.receipt_id)
    && nonEmpty(receipt.verifier_id)
    && receipt.independent_from_candidate_generator === true
    && receipt.candidate_sealed_before_observation === true
    && /^[a-f0-9]{64}$/.test(String(receipt.candidate_hash || ''))
    && /^[a-f0-9]{64}$/.test(String(receipt.observation_hash || ''))
    && Array.isArray(receipt.evidence_refs)
    && receipt.evidence_refs.length > 0
    && evidenceManifestValid(receipt.evidence_manifest, unique(receipt.evidence_refs), workspaceRoot)
  );
}

function graphConnectedAndCyclic(frameIds, reports) {
  const adjacency = new Map(frameIds.map((frameId) => [frameId, new Set()]));
  for (const report of reports) {
    if (!adjacency.has(report.source_frame_id) || !adjacency.has(report.target_frame_id)) continue;
    adjacency.get(report.source_frame_id).add(report.target_frame_id);
    adjacency.get(report.target_frame_id).add(report.source_frame_id);
  }
  const visited = new Set();
  const queue = frameIds.length ? [frameIds[0]] : [];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const neighbour of adjacency.get(current) || []) if (!visited.has(neighbour)) queue.push(neighbour);
  }
  const directedEdges = new Set(reports.map((report) => `${report.source_frame_id}->${report.target_frame_id}`));
  const closesDirectedLoop = frameIds.some((start) => {
    const search = [{ node: start, depth: 0 }];
    const visitedAtDepth = new Set();
    while (search.length) {
      const { node, depth } = search.pop();
      if (depth >= frameIds.length) continue;
      for (const edge of directedEdges) {
        const [source, target] = edge.split('->');
        if (source !== node) continue;
        if (target === start && depth >= 1) return true;
        const key = `${target}:${depth + 1}`;
        if (!visitedAtDepth.has(key)) {
          visitedAtDepth.add(key);
          search.push({ node: target, depth: depth + 1 });
        }
      }
    }
    return false;
  });
  return visited.size === frameIds.length && closesDirectedLoop;
}

function verifyEpistemicUnityCandidate(input, options = {}) {
  if (!input || input.schema_version !== 1 || !hashPayload(input.candidate, 'candidate_hash')) {
    fail('EPISTEMIC_UNITY_SEALED_CANDIDATE_INVALID');
  }
  const candidate = input.candidate;
  const predictions = candidate.frame_predictions;
  const predictionMap = new Map(predictions.map((prediction) => [prediction.prediction_id, prediction]));
  const readbacks = Array.isArray(input.prediction_readbacks) ? input.prediction_readbacks : [];
  const readbackChecks = predictions.map((prediction) => {
    const readback = readbacks.find((item) => item && item.prediction_id === prediction.prediction_id);
    const passed = Boolean(
      readback
      && nonEmpty(readback.verifier_id)
      && readback.independent_from_hypothesis_generator === true
      && readback.candidate_sealed_before_observation === true
      && Array.isArray(readback.evidence_refs)
      && readback.evidence_refs.length > 0
      && measurementPass(readback, prediction)
    );
    return {
      prediction_id: prediction.prediction_id,
      frame_id: prediction.frame_id,
      domain_id: prediction.domain_id,
      verifier_id: readback && readback.verifier_id || null,
      observed_value: readback && readback.observed_value,
      threshold: prediction.threshold,
      comparator: prediction.comparator,
      passed,
    };
  });
  const reports = Array.isArray(input.transformation_reports) ? input.transformation_reports : [];
  const reportChecks = reports.map((report) => ({
    verification_id: report && report.verification_id,
    source_frame_id: report && report.source_frame_id,
    target_frame_id: report && report.target_frame_id,
    hash_valid: hashPayload(report, 'verification_hash'),
    passed: Boolean(report && report.status === 'verified' && hashPayload(report, 'verification_hash')),
  }));
  const declaredInvariantIds = candidate.declared_invariants.map((item) => item.invariant_id);
  const observedInvariantIds = unique(reports.flatMap((report) => (
    (report && report.invariants || []).filter((item) => item.passed === true).map((item) => item.invariant_id)
  )));
  const frameIds = predictions.map((prediction) => prediction.frame_id);
  const controls = input.controls || {};
  const contamination = input.contamination_audit || {};
  const replication = input.replication || {};
  const requiredEvidenceRefs = evidenceRefsFrom(input);
  const manifestValid = evidenceManifestValid(
    input.evidence_manifest,
    requiredEvidenceRefs,
    options.workspace_root,
  );
  const criteria = {
    sealed_candidate_hash_valid: true,
    candidate_precedes_world_readback: candidate.sealed_before_world_readback === true
      && candidate.target_evidence_accessed === false,
    three_heterogeneous_frames_declared: unique(predictions.map((item) => item.domain_id)).length >= 3,
    every_prediction_has_one_readback: readbacks.length === predictions.length
      && unique(readbacks.map((item) => item.prediction_id)).length === predictions.length
      && readbacks.every((item) => predictionMap.has(item.prediction_id)),
    sealed_independent_predictions_pass: readbackChecks.length >= 3 && readbackChecks.every((item) => item.passed),
    transformation_reports_verified: reports.length >= predictions.length && reportChecks.every((item) => item.passed),
    transformation_graph_connected_and_cyclic: graphConnectedAndCyclic(frameIds, reports),
    declared_invariants_covered_and_preserved: declaredInvariantIds.every((id) => observedInvariantIds.includes(id)),
    simpler_baseline_rejected: controls.simpler_baseline_id === candidate.simpler_baseline_id
      && controls.simpler_baseline_status === 'rejected_on_sealed_evidence',
    sham_control_failed: controls.sham_status === 'failed_as_expected',
    severed_control_has_positive_lower_bound: Number(controls.integration_delta_lower_bound) > 0,
    contamination_audit_passed: contamination.status === 'ok'
      && contamination.target_evidence_exposed_before_candidate === false,
    independent_replication_passed: replication.status === 'passed'
      && replication.independent_from_original_execution === true
      && Array.isArray(replication.evidence_refs)
      && replication.evidence_refs.length > 0,
    all_evidence_files_current_and_hash_bound: manifestValid,
  };
  const hypothesisWorldCriteria = [
    'sealed_candidate_hash_valid',
    'candidate_precedes_world_readback',
    'three_heterogeneous_frames_declared',
    'every_prediction_has_one_readback',
    'sealed_independent_predictions_pass',
    'contamination_audit_passed',
    'all_evidence_files_current_and_hash_bound',
  ];
  const crossFrameCriteria = [
    'transformation_reports_verified',
    'transformation_graph_connected_and_cyclic',
    'declared_invariants_covered_and_preserved',
  ];
  const causalCriteria = [
    'simpler_baseline_rejected',
    'sham_control_failed',
    'severed_control_has_positive_lower_bound',
  ];
  const projectionStatus = (names) => names.every((name) => criteria[name]) ? 'verified_bounded' : 'unverified';
  const statuses = {
    hypothesis_world_correspondence: projectionStatus(hypothesisWorldCriteria),
    cross_frame_unity: projectionStatus(crossFrameCriteria),
    causal_integration: projectionStatus(causalCriteria),
    independent_replication: criteria.independent_replication_passed ? 'verified_bounded' : 'unverified',
  };
  const supported = Object.values(criteria).every(Boolean);
  const payload = {
    schema_version: 1,
    verification_id: `epistemic_verification_${sha256Json({ candidate_hash: candidate.candidate_hash, readbacks }).slice(0, 20)}`,
    status: supported ? 'supported_bounded' : 'rejected_or_unverified',
    scope: 'bounded_world_grounded_epistemic_unity_verification',
    candidate_id: candidate.candidate_id,
    candidate_hash: candidate.candidate_hash,
    statuses,
    prediction_checks: readbackChecks,
    transformation_checks: reportChecks,
    criteria,
    required_evidence_refs: requiredEvidenceRefs,
    falsification_rule: 'Failure demotes the exact failed edge; internal coherence or tensor form never substitutes for world readback.',
    non_claims: [
      'not universal truth of the candidate hypothesis',
      'not automatic open-world generalization',
      'not evidence of AGI',
      'not evidence of phenomenal consciousness',
    ],
  };
  return { ...payload, verification_hash: sha256Json(payload) };
}

module.exports = {
  evidenceManifestValid,
  hashPayload,
  sealEpistemicUnityCandidate,
  verifyEpistemicUnityCandidate,
  verifyEpistemicReadbackReceipt,
};
