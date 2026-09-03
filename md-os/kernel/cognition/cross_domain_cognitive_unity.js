#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { sha256Json } = require('./general_program_synthesis');

const GENERALITY_CLAIMS = Object.freeze([
  'cross_domain_transfer',
  'tensorial_transformation',
  'cognitive_unity',
]);

const UNITY_CHANNELS = Object.freeze([
  'operational_self_refs',
  'world_observation_refs',
  'goal_refs',
  'memory_refs',
  'frame_refs',
  'transformation_refs',
  'action_refs',
  'evidence_refs',
]);

function fail(code) {
  throw new Error(code);
}

function maxAbsDelta(left, right) {
  const leftShape = tensorShape(left);
  const rightShape = tensorShape(right);
  if (JSON.stringify(leftShape) !== JSON.stringify(rightShape)) return Number.POSITIVE_INFINITY;
  let residual = 0;
  forEachIndex(leftShape, (indices) => {
    residual = Math.max(residual, Math.abs(tensorValue(left, indices) - tensorValue(right, indices)));
  });
  return residual;
}

function tensorShape(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return [];
  if (!Array.isArray(value) || value.length === 0) fail('COGNITIVE_UNITY_TENSOR_NONEMPTY_NUMERIC_REQUIRED');
  const childShape = tensorShape(value[0]);
  for (let index = 1; index < value.length; index += 1) {
    const candidateShape = tensorShape(value[index]);
    if (JSON.stringify(candidateShape) !== JSON.stringify(childShape)) fail('COGNITIVE_UNITY_TENSOR_RECTANGULAR_REQUIRED');
  }
  return [value.length, ...childShape];
}

function tensorValue(tensor, indices) {
  return indices.reduce((value, index) => value[index], tensor);
}

function forEachIndex(shape, visit, prefix = []) {
  if (!shape.length) {
    visit(prefix);
    return;
  }
  for (let index = 0; index < shape[0]; index += 1) {
    forEachIndex(shape.slice(1), visit, [...prefix, index]);
  }
}

function tensorFromShape(shape, valueAt, prefix = []) {
  if (!shape.length) return valueAt(prefix);
  return Array.from({ length: shape[0] }, (_, index) => tensorFromShape(shape.slice(1), valueAt, [...prefix, index]));
}

function assertMatrix(matrix, sourceDimension, label) {
  if (!Array.isArray(matrix) || matrix.length === 0) fail(`${label}_MATRIX_NONEMPTY_REQUIRED`);
  for (const row of matrix) {
    if (!Array.isArray(row) || row.length !== sourceDimension || row.some((value) => !Number.isFinite(value))) {
      fail(`${label}_MATRIX_DIMENSION_INVALID`);
    }
  }
  return matrix.length;
}

function applyRelativeTensorTransformation(sourceTensor, axisOperators) {
  const sourceShape = tensorShape(sourceTensor);
  if (!Array.isArray(axisOperators) || axisOperators.length !== sourceShape.length) {
    fail('COGNITIVE_UNITY_AXIS_OPERATOR_COUNT_MISMATCH');
  }
  const targetShape = axisOperators.map((operator, axis) => (
    assertMatrix(operator, sourceShape[axis], `COGNITIVE_UNITY_AXIS_${axis}`)
  ));
  return tensorFromShape(targetShape, (targetIndices) => {
    let sum = 0;
    forEachIndex(sourceShape, (sourceIndices) => {
      const coefficient = sourceIndices.reduce((product, sourceIndex, axis) => (
        product * axisOperators[axis][targetIndices[axis]][sourceIndex]
      ), 1);
      sum += coefficient * tensorValue(sourceTensor, sourceIndices);
    });
    return sum;
  });
}

function multiplyMatrices(outer, inner) {
  const innerRows = inner.length;
  const innerColumns = inner[0].length;
  assertMatrix(inner, innerColumns, 'COGNITIVE_UNITY_INNER');
  if (!Array.isArray(outer) || outer.length === 0 || outer.some((row) => !Array.isArray(row) || row.length !== innerRows)) {
    fail('COGNITIVE_UNITY_MATRIX_COMPOSITION_DIMENSION_MISMATCH');
  }
  return outer.map((row) => Array.from({ length: innerColumns }, (_, column) => (
    row.reduce((sum, value, index) => sum + (value * inner[index][column]), 0)
  )));
}

function composeAxisOperators(outerOperators, innerOperators) {
  if (!Array.isArray(outerOperators) || !Array.isArray(innerOperators) || outerOperators.length !== innerOperators.length) {
    fail('COGNITIVE_UNITY_COMPOSITION_RANK_MISMATCH');
  }
  return outerOperators.map((operator, axis) => multiplyMatrices(operator, innerOperators[axis]));
}

function flattenTensor(tensor) {
  const shape = tensorShape(tensor);
  const values = [];
  forEachIndex(shape, (indices) => values.push(tensorValue(tensor, indices)));
  return values;
}

function invariantValue(kind, tensor) {
  const shape = tensorShape(tensor);
  const values = flattenTensor(tensor);
  if (kind === 'frobenius_norm') return Math.sqrt(values.reduce((sum, value) => sum + (value * value), 0));
  if (kind === 'total_sum') return values.reduce((sum, value) => sum + value, 0);
  if (kind === 'component_multiset') return values.slice().sort((left, right) => left - right);
  if (kind === 'trace') {
    if (shape.length !== 2 || shape[0] !== shape[1]) fail('COGNITIVE_UNITY_TRACE_SQUARE_RANK_TWO_REQUIRED');
    return Array.from({ length: shape[0] }, (_, index) => tensor[index][index]).reduce((sum, value) => sum + value, 0);
  }
  fail(`COGNITIVE_UNITY_INVARIANT_UNSUPPORTED: ${kind}`);
}

function invariantResidual(left, right) {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return Number.POSITIVE_INFINITY;
    return left.reduce((residual, value, index) => Math.max(residual, Math.abs(value - right[index])), 0);
  }
  return Math.abs(left - right);
}

function checkFrame(frame, prefix) {
  const valid = Boolean(
    frame
    && typeof frame.frame_id === 'string'
    && typeof frame.domain_id === 'string'
    && typeof frame.representation_space === 'string'
    && typeof frame.basis_id === 'string'
    && Number.isInteger(frame.basis_dimension)
    && frame.basis_dimension > 0
    && typeof frame.verifier_contract_id === 'string'
  );
  if (!valid) fail(`${prefix}_FRAME_INVALID`);
}

function evidencePass(receipt) {
  return Boolean(
    receipt
    && receipt.status === 'passed'
    && typeof receipt.verifier_id === 'string'
    && receipt.independent_from_law_inducer === true
    && Array.isArray(receipt.evidence_refs)
    && receipt.evidence_refs.length > 0
  );
}

function allEvidenceRefs(specification) {
  return [
    ...(specification.law_induction && specification.law_induction.development_evidence_refs || []),
    ...(specification.target_semantic_verification && specification.target_semantic_verification.evidence_refs || []),
    ...(specification.return_semantic_verification && specification.return_semantic_verification.evidence_refs || []),
    ...(specification.controls && specification.controls.evidence_refs || []),
    ...(specification.contamination_audit && specification.contamination_audit.evidence_refs || []),
    ...(specification.causal_reuse && specification.causal_reuse.evidence_refs || []),
  ];
}

function evidenceManifestComplete(specification) {
  const manifest = Array.isArray(specification.evidence_manifest) ? specification.evidence_manifest : [];
  const refs = [...new Set(allEvidenceRefs(specification))];
  const manifestRefs = new Set();
  for (const entry of manifest) {
    if (!entry || typeof entry.evidence_ref !== 'string' || manifestRefs.has(entry.evidence_ref)) return false;
    if (!/^[a-f0-9]{64}$/.test(String(entry.sha256 || ''))) return false;
    if (!['workspace_file', 'embedded_fixture'].includes(entry.storage)) return false;
    if (entry.storage === 'workspace_file' && typeof entry.relative_file !== 'string') return false;
    manifestRefs.add(entry.evidence_ref);
  }
  return refs.length > 0 && refs.every((reference) => manifestRefs.has(reference));
}

function induceCandidateTransformationLaw(input) {
  const developmentPairs = Array.isArray(input && input.development_pairs) ? input.development_pairs : [];
  const candidates = Array.isArray(input && input.candidates) ? input.candidates : [];
  const tolerance = Number.isFinite(input && input.tolerance) && input.tolerance >= 0 ? input.tolerance : 1e-9;
  if (!developmentPairs.length) fail('COGNITIVE_UNITY_LAW_INDUCTION_DEVELOPMENT_PAIRS_REQUIRED');
  if (candidates.length < 2) fail('COGNITIVE_UNITY_LAW_INDUCTION_COMPETING_CANDIDATES_REQUIRED');
  const candidateMeasurements = candidates.map((candidate) => {
    const residuals = developmentPairs.map((pair) => maxAbsDelta(
      applyRelativeTensorTransformation(pair.source_tensor, candidate.axis_operators),
      pair.observed_target_tensor,
    ));
    return {
      law_id: candidate.law_id,
      declaration: candidate.declaration,
      axis_operators: candidate.axis_operators,
      inverse_axis_operators: candidate.inverse_axis_operators || null,
      maximum_development_residual: Math.max(...residuals),
      development_pair_count: residuals.length,
      passed: residuals.every((residual) => residual <= tolerance),
    };
  }).sort((left, right) => (
    left.maximum_development_residual - right.maximum_development_residual
    || String(left.law_id).localeCompare(String(right.law_id))
  ));
  const admissible = candidateMeasurements.filter((candidate) => candidate.passed);
  const uniqueWinner = admissible.length === 1;
  const selected = uniqueWinner ? admissible[0] : null;
  const receipt = {
    schema_version: 1,
    induction_id: input.induction_id,
    status: uniqueWinner ? 'induced' : 'ambiguous',
    selected_law_id: selected && selected.law_id || null,
    selected_declaration: selected && selected.declaration || null,
    selected_axis_operators: selected && selected.axis_operators || null,
    selected_inverse_axis_operators: selected && selected.inverse_axis_operators || null,
    tolerance,
    candidate_count: candidates.length,
    development_pair_count: developmentPairs.length,
    candidate_measurements: candidateMeasurements,
    development_evidence_refs: input.development_evidence_refs || [],
    target_evidence_accessed: false,
    sealed_before_target_verification: input.sealed_before_target_verification === true,
    falsifier: 'The candidate law is rejected if it is non-unique on development evidence or fails any sealed target transformation, invariant, semantic, control, roundtrip, or composition check.',
  };
  return { ...receipt, induction_hash: sha256Json(receipt) };
}

function verifyRelativeTensorTransformation(specification) {
  if (!specification || specification.schema_version !== 1) fail('COGNITIVE_UNITY_TRANSFORMATION_SPEC_INVALID');
  checkFrame(specification.source_frame, 'COGNITIVE_UNITY_SOURCE');
  checkFrame(specification.target_frame, 'COGNITIVE_UNITY_TARGET');
  const tolerance = Number.isFinite(specification.tolerance) && specification.tolerance >= 0
    ? specification.tolerance
    : 1e-9;
  const sourceShape = tensorShape(specification.source_tensor);
  const observedTargetShape = tensorShape(specification.observed_target_tensor);
  const predictedTarget = applyRelativeTensorTransformation(
    specification.source_tensor,
    specification.axis_operators,
  );
  const predictedTargetShape = tensorShape(predictedTarget);
  const tensorLawResidual = maxAbsDelta(predictedTarget, specification.observed_target_tensor);
  const invariantChecks = (specification.declared_invariants || []).map((invariant) => {
    const sourceValue = invariantValue(invariant.kind, specification.source_tensor);
    const targetValue = invariantValue(invariant.kind, specification.observed_target_tensor);
    const residual = invariantResidual(sourceValue, targetValue);
    return {
      invariant_id: invariant.invariant_id,
      kind: invariant.kind,
      source_value: sourceValue,
      target_value: targetValue,
      residual,
      tolerance: Number.isFinite(invariant.tolerance) ? invariant.tolerance : tolerance,
      passed: residual <= (Number.isFinite(invariant.tolerance) ? invariant.tolerance : tolerance),
    };
  });

  const invertible = specification.invertible === true;
  const hasInverse = Array.isArray(specification.inverse_axis_operators);
  let recoveredSource = null;
  let roundtripResidual = null;
  let compositionResidual = null;
  if (invertible && hasInverse) {
    recoveredSource = applyRelativeTensorTransformation(
      specification.observed_target_tensor,
      specification.inverse_axis_operators,
    );
    roundtripResidual = maxAbsDelta(recoveredSource, specification.source_tensor);
    const composedOperators = composeAxisOperators(
      specification.inverse_axis_operators,
      specification.axis_operators,
    );
    const composedSource = applyRelativeTensorTransformation(specification.source_tensor, composedOperators);
    compositionResidual = maxAbsDelta(composedSource, recoveredSource);
  }
  const informationLossDeclared = Boolean(
    specification.information_loss
    && specification.information_loss.declared === true
    && typeof specification.information_loss.description === 'string'
    && specification.information_loss.description.length > 0
  );
  const controls = specification.controls || {};
  const contamination = specification.contamination_audit || {};
  const causalReuse = specification.causal_reuse || {};
  const lawInduction = specification.law_induction || {};
  const lawInductionHashValid = Boolean(lawInduction.induction_hash && (() => {
    const { induction_hash: inductionHash, ...payload } = lawInduction;
    return inductionHash === sha256Json(payload);
  })());
  const criteria = {
    source_target_frames_distinct: specification.source_frame.frame_id !== specification.target_frame.frame_id,
    source_target_domains_distinct: specification.source_frame.domain_id !== specification.target_frame.domain_id,
    source_basis_dimension_matches: sourceShape[0] === specification.source_frame.basis_dimension,
    target_basis_dimension_matches: observedTargetShape[0] === specification.target_frame.basis_dimension,
    tensor_rank_matches_operator_count: sourceShape.length === specification.axis_operators.length,
    tensor_target_shape_matches: JSON.stringify(observedTargetShape) === JSON.stringify(predictedTargetShape),
    tensor_transformation_law_passed: tensorLawResidual <= tolerance,
    candidate_law_induced_before_target_evidence: lawInduction.status === 'induced'
      && lawInductionHashValid
      && lawInduction.sealed_before_target_verification === true
      && lawInduction.target_evidence_accessed === false
      && Array.isArray(lawInduction.development_evidence_refs)
      && lawInduction.development_evidence_refs.length > 0
      && lawInduction.selected_declaration === specification.transformation_law
      && JSON.stringify(lawInduction.selected_axis_operators) === JSON.stringify(specification.axis_operators),
    evidence_manifest_complete: evidenceManifestComplete(specification),
    declared_invariants_present: invariantChecks.length > 0,
    declared_invariants_preserved: invariantChecks.length > 0 && invariantChecks.every((check) => check.passed),
    target_semantic_verifier_passed: evidencePass(specification.target_semantic_verification),
    return_semantic_verifier_passed: evidencePass(specification.return_semantic_verification),
    disabled_control_failed_as_expected: controls.disabled_status === 'failed_as_expected',
    sham_control_failed_as_expected: controls.sham_status === 'failed_as_expected',
    equal_budgets: controls.equal_budgets === true,
    control_evidence_present: Array.isArray(controls.evidence_refs) && controls.evidence_refs.length > 0,
    contamination_audit_passed: contamination.status === 'ok' && contamination.target_evidence_exposed_before_candidate === false,
    causal_reuse_verified: causalReuse.status === 'verified'
      && Number.isInteger(causalReuse.reuse_count)
      && causalReuse.reuse_count > 0
      && Array.isArray(causalReuse.evidence_refs)
      && causalReuse.evidence_refs.length > 0,
    inverse_or_loss_declared: invertible
      ? hasInverse
      : informationLossDeclared,
    roundtrip_passed: invertible ? roundtripResidual !== null && roundtripResidual <= tolerance : informationLossDeclared,
    composition_passed: invertible ? compositionResidual !== null && compositionResidual <= tolerance : informationLossDeclared,
  };
  const status = Object.values(criteria).every(Boolean) ? 'verified' : 'rejected';
  const report = {
    schema_version: 1,
    verification_id: specification.verification_id,
    transformation_id: specification.transformation_id,
    status,
    scope: 'explicit_external_cross_domain_tensor_artifact',
    source_frame_id: specification.source_frame.frame_id,
    target_frame_id: specification.target_frame.frame_id,
    source_domain_id: specification.source_frame.domain_id,
    target_domain_id: specification.target_frame.domain_id,
    source_shape: sourceShape,
    target_shape: observedTargetShape,
    tensor_law: {
      declaration: specification.transformation_law,
      residual: tensorLawResidual,
      tolerance,
      passed: criteria.tensor_transformation_law_passed,
    },
    law_induction: lawInduction,
    invariants: invariantChecks,
    roundtrip: {
      required: invertible,
      residual: roundtripResidual,
      tolerance,
      passed: criteria.roundtrip_passed,
    },
    composition: {
      tested_as: invertible ? 'inverse_after_forward_equals_roundtrip' : 'declared_lossy_composition',
      residual: compositionResidual,
      tolerance,
      passed: criteria.composition_passed,
    },
    semantic_verification: {
      target: specification.target_semantic_verification,
      return: specification.return_semantic_verification,
    },
    controls,
    contamination_audit: contamination,
    causal_reuse: causalReuse,
    evidence_manifest: specification.evidence_manifest || [],
    criteria,
    non_claims: [
      'not a tensor representation of all intelligence',
      'not direct access to neural hidden-layer activations',
      'not evidence of consciousness',
      'not evidence of AGI',
    ],
  };
  return { ...report, verification_hash: sha256Json(report) };
}

function buildCognitiveUnityState(input) {
  const reports = Array.isArray(input.transformation_reports) ? input.transformation_reports : [];
  const channels = Object.fromEntries(UNITY_CHANNELS.map((channel) => [channel, Array.isArray(input[channel]) ? input[channel] : []]));
  const channelChecks = Object.fromEntries(UNITY_CHANNELS.map((channel) => [channel, channels[channel].length > 0]));
  const verifiedReports = reports.filter((report) => report && report.status === 'verified' && report.verification_hash);
  const reportHashesValid = verifiedReports.every((report) => {
    const { verification_hash: verificationHash, ...payload } = report;
    return verificationHash === sha256Json(payload);
  });
  const transformationRefsCovered = channels.transformation_refs.every((reference) => (
    verifiedReports.some((report) => reference === report.verification_id || reference === report.transformation_id)
  ));
  const criteria = {
    all_cognitive_channels_bound: Object.values(channelChecks).every(Boolean),
    all_transformation_reports_verified: reports.length > 0 && verifiedReports.length === reports.length,
    transformation_report_hashes_valid: reports.length > 0 && reportHashesValid,
    transformation_refs_covered: channels.transformation_refs.length > 0 && transformationRefsCovered,
    conflicts_closed: !Array.isArray(input.open_conflicts) || input.open_conflicts.length === 0,
  };
  const state = {
    schema_version: 1,
    state_id: input.state_id,
    created_at: input.created_at,
    status: Object.values(criteria).every(Boolean) ? 'verified' : 'attention',
    definition: 'Causally integrated operational state binding self-reference, world observations, goals, memory, frames, verified transformations, actions, and evidence into one persistent decision process.',
    channels,
    transformation_verifications: verifiedReports.map((report) => ({
      verification_id: report.verification_id,
      transformation_id: report.transformation_id,
      verification_hash: report.verification_hash,
    })),
    criteria,
    open_conflicts: input.open_conflicts || [],
    non_claims: [
      'this cross-domain state alone does not complete consciousness C(k)',
      'not biological equivalence',
      'not evidence of AGI',
      'not direct access to host-model hidden layers',
    ],
  };
  return { ...state, state_hash: sha256Json(state) };
}

function resolveEvidenceFile(workspaceRoot, relativeFile) {
  if (!relativeFile || typeof relativeFile !== 'string' || path.isAbsolute(relativeFile)) return null;
  const resolvedRoot = path.resolve(workspaceRoot);
  const resolved = path.resolve(resolvedRoot, relativeFile);
  const relative = path.relative(resolvedRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null;
  try {
    return JSON.parse(fs.readFileSync(resolved, 'utf8'));
  } catch (_) {
    return null;
  }
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function underlyingEvidenceFilesValid(report, workspaceRoot) {
  const manifest = Array.isArray(report && report.evidence_manifest) ? report.evidence_manifest : [];
  if (!manifest.length) return false;
  const resolvedRoot = path.resolve(workspaceRoot);
  return manifest.every((entry) => {
    if (!entry || entry.storage !== 'workspace_file' || typeof entry.relative_file !== 'string' || path.isAbsolute(entry.relative_file)) return false;
    const resolved = path.resolve(resolvedRoot, entry.relative_file);
    const relative = path.relative(resolvedRoot, resolved);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return false;
    try {
      return sha256File(resolved) === entry.sha256;
    } catch (_) {
      return false;
    }
  });
}

function defaultWorkspaceRoot() {
  return process.env.MDOS_WORKSPACE_ROOT || path.resolve(__dirname, '..', '..', '..');
}

function evaluateCognitiveUnityClaims(skill, options = {}) {
  const claims = Array.isArray(skill && skill.generality_claims) ? skill.generality_claims : [];
  const unknownClaims = claims.filter((claim) => !GENERALITY_CLAIMS.includes(claim));
  const claimsPresent = claims.length > 0;
  const workspaceRoot = options.workspace_root || defaultWorkspaceRoot();
  const report = resolveEvidenceFile(workspaceRoot, skill && skill.relative_transformation_verification_file);
  const reportHashValid = Boolean(
    report
    && report.verification_hash
    && report.verification_hash === skill.relative_transformation_verification_hash
    && (() => {
      const { verification_hash: verificationHash, ...payload } = report;
      return verificationHash === sha256Json(payload);
    })()
  );
  const unityState = resolveEvidenceFile(workspaceRoot, skill && skill.cognitive_unity_state_file);
  const unityHashValid = Boolean(
    unityState
    && unityState.state_hash
    && unityState.state_hash === skill.cognitive_unity_state_hash
    && (() => {
      const { state_hash: stateHash, ...payload } = unityState;
      return stateHash === sha256Json(payload);
    })()
  );
  const tensorClaim = claims.includes('tensorial_transformation') || claims.includes('cognitive_unity');
  const crossDomainClaim = claims.includes('cross_domain_transfer') || tensorClaim;
  const unityClaim = claims.includes('cognitive_unity');
  const criteria = {
    known_generality_claims_only: unknownClaims.length === 0,
    relative_transformation_report_hash_valid: !claimsPresent || reportHashValid,
    underlying_evidence_files_valid: !claimsPresent || underlyingEvidenceFilesValid(report, workspaceRoot),
    cross_domain_transformation_verified: !crossDomainClaim || Boolean(
      report
      && report.status === 'verified'
      && report.criteria
      && report.criteria.source_target_domains_distinct
      && report.criteria.target_semantic_verifier_passed
    ),
    tensor_transformation_law_verified: !tensorClaim || Boolean(
      report
      && report.criteria
      && report.criteria.tensor_transformation_law_passed
      && report.criteria.declared_invariants_preserved
      && report.criteria.roundtrip_passed
      && report.criteria.composition_passed
    ),
    controls_and_contamination_verified: !crossDomainClaim || Boolean(
      report
      && report.criteria
      && report.criteria.disabled_control_failed_as_expected
      && report.criteria.sham_control_failed_as_expected
      && report.criteria.equal_budgets
      && report.criteria.contamination_audit_passed
    ),
    causal_reuse_verified: !crossDomainClaim || Boolean(report && report.criteria && report.criteria.causal_reuse_verified),
    cognitive_unity_state_hash_valid: !unityClaim || unityHashValid,
    cognitive_unity_state_verified: !unityClaim || Boolean(
      unityState
      && unityState.status === 'verified'
      && unityState.criteria
      && Object.values(unityState.criteria).every(Boolean)
    ),
  };
  return {
    status: Object.values(criteria).every(Boolean) ? 'ok' : 'critical',
    claims,
    criteria,
    transformation_verification_id: report && report.verification_id || null,
    cognitive_unity_state_id: unityState && unityState.state_id || null,
  };
}

function summarizeCognitiveUnityRegistry(skills, options = {}) {
  const entries = (skills || []).map((skill) => ({
    skill_id: skill.skill_id,
    status: skill.status,
    ...evaluateCognitiveUnityClaims(skill, options),
  }));
  const claiming = entries.filter((entry) => entry.claims.length > 0);
  return {
    claiming_skill_count: claiming.length,
    verified_claiming_skill_count: claiming.filter((entry) => entry.status === 'ok').length,
    blocked_claiming_skill_count: claiming.filter((entry) => entry.status !== 'ok').length,
    verified_relative_transformation_count: new Set(claiming
      .filter((entry) => entry.status === 'ok' && entry.transformation_verification_id)
      .map((entry) => entry.transformation_verification_id)).size,
    verified_cognitive_unity_state_count: new Set(claiming
      .filter((entry) => entry.status === 'ok' && entry.cognitive_unity_state_id)
      .map((entry) => entry.cognitive_unity_state_id)).size,
    entries,
  };
}

module.exports = {
  GENERALITY_CLAIMS,
  UNITY_CHANNELS,
  applyRelativeTensorTransformation,
  buildCognitiveUnityState,
  composeAxisOperators,
  evaluateCognitiveUnityClaims,
  induceCandidateTransformationLaw,
  invariantValue,
  maxAbsDelta,
  summarizeCognitiveUnityRegistry,
  tensorShape,
  verifyRelativeTensorTransformation,
};
