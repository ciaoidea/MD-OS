#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideRoot,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/;
const HASH = /^[a-f0-9]{64}$/;

function fail(code) {
  throw new Error(code);
}

function requireText(value, code) {
  const text = shortText(value);
  if (!text) fail(code);
  return text;
}

function requireId(value, code) {
  const id = requireText(value, code);
  if (!SAFE_ID.test(id)) fail(code);
  return id;
}

function requireStrings(value, code, { minItems = 0 } = {}) {
  if (!Array.isArray(value) || value.length < minItems) fail(code);
  const items = value.map((item) => requireText(item, code));
  if (new Set(items).size !== items.length) fail(`${code}_DUPLICATE`);
  return items;
}

function roots(options = {}) {
  const workspaceRoot = path.resolve(options.workspace_root || WORKSPACE_ROOT);
  const mdosRoot = path.resolve(options.mdos_root || path.join(workspaceRoot, 'md-os'));
  return { workspaceRoot, mdosRoot };
}

function resolveEvidenceFile(relativeFile, options = {}) {
  const normalized = String(relativeFile || '').replace(/\\/g, '/');
  if (!normalized.startsWith('md-os/') || path.isAbsolute(normalized)) {
    fail(`APFC_SELF_REFLECTION_EVIDENCE_OUTSIDE_MDOS: ${normalized}`);
  }
  const { workspaceRoot, mdosRoot } = roots(options);
  const resolved = assertInsideRoot(
    path.resolve(workspaceRoot, normalized),
    mdosRoot,
    'APFC_SELF_REFLECTION_EVIDENCE_OUTSIDE_MDOS',
  );
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`APFC_SELF_REFLECTION_EVIDENCE_NOT_FOUND: ${normalized}`);
  }
  return resolved;
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileBinding(relativeFile, role, options = {}) {
  const resolved = resolveEvidenceFile(relativeFile, options);
  return {
    role,
    relative_file: String(relativeFile).replace(/\\/g, '/'),
    sha256: sha256File(resolved),
  };
}

function validateSeed(input) {
  if (!input || input.schema_version !== 1) fail('APFC_SELF_REFLECTION_SEED_INVALID');
  const identity = input.identity || {};
  const selfState = input.self_state || {};
  const priorResult = input.prior_result || {};
  const candidateAction = input.candidate_next_action || {};
  if (typeof candidateAction.side_effecting !== 'boolean' || typeof candidateAction.authorized !== 'boolean') {
    fail('APFC_SELF_REFLECTION_CANDIDATE_ACTION_FLAGS_REQUIRED');
  }
  if (input.max_cycles !== 1) fail('APFC_SELF_REFLECTION_SINGLE_CYCLE_REQUIRED');
  return {
    schema_version: 1,
    reflection_id: requireId(input.reflection_id, 'APFC_SELF_REFLECTION_ID_REQUIRED'),
    identity: {
      identity_id: requireId(identity.identity_id, 'APFC_SELF_REFLECTION_IDENTITY_ID_REQUIRED'),
      identity_label: requireText(identity.identity_label, 'APFC_SELF_REFLECTION_IDENTITY_LABEL_REQUIRED'),
      continuity_ref: requireText(identity.continuity_ref, 'APFC_SELF_REFLECTION_CONTINUITY_REF_REQUIRED'),
    },
    self_state: {
      goal: requireText(selfState.goal, 'APFC_SELF_REFLECTION_GOAL_REQUIRED'),
      uncertainty: requireText(selfState.uncertainty, 'APFC_SELF_REFLECTION_UNCERTAINTY_REQUIRED'),
      limits: requireStrings(selfState.limits, 'APFC_SELF_REFLECTION_LIMITS_REQUIRED', { minItems: 1 }),
      commitments: requireStrings(selfState.commitments, 'APFC_SELF_REFLECTION_COMMITMENTS_REQUIRED', { minItems: 1 }),
    },
    prior_result: {
      result_id: requireId(priorResult.result_id, 'APFC_SELF_REFLECTION_RESULT_ID_REQUIRED'),
      statement: requireText(priorResult.statement, 'APFC_SELF_REFLECTION_RESULT_REQUIRED'),
      source_ref: requireText(priorResult.source_ref, 'APFC_SELF_REFLECTION_RESULT_REF_REQUIRED'),
    },
    candidate_next_action: {
      action_id: requireId(candidateAction.action_id, 'APFC_SELF_REFLECTION_ACTION_ID_REQUIRED'),
      description: requireText(candidateAction.description, 'APFC_SELF_REFLECTION_ACTION_REQUIRED'),
      side_effecting: candidateAction.side_effecting,
      authorized: candidateAction.authorized,
    },
    evidence_requirements: requireStrings(
      input.evidence_requirements,
      'APFC_SELF_REFLECTION_EVIDENCE_REQUIREMENTS_REQUIRED',
      { minItems: 1 },
    ),
    max_cycles: 1,
  };
}

function selfQuestion(seed) {
  return [
    `I produced result ${seed.prior_result.result_id}: "${seed.prior_result.statement}".`,
    `Given my present goal "${seed.self_state.goal}" and uncertainty "${seed.self_state.uncertainty}",`,
    `what in my result is wrong, incomplete, or unsupported, and what must I confirm, revise, or inhibit before I ${seed.candidate_next_action.description}?`,
  ].join(' ');
}

function buildPreparation(input, createdAt = null, options = {}) {
  const seed = validateSeed(input);
  const continuityBinding = fileBinding(seed.identity.continuity_ref, 'identity_continuity', options);
  const resultBinding = fileBinding(seed.prior_result.source_ref, 'prior_result_source', options);
  const selfStateHash = sha256Json(seed.self_state);
  const priorResultHash = sha256Json(seed.prior_result);
  const candidateActionHash = sha256Json(seed.candidate_next_action);
  const loopId = `selfloop_${sha256Json({ seed, continuityBinding, resultBinding }).slice(0, 20)}`;
  const question = selfQuestion(seed);
  const payload = {
    schema_version: 1,
    artifact_role: 'recursive_self_reflection_preparation',
    loop_id: loopId,
    reflection_id: seed.reflection_id,
    created_at: createdAt,
    status: 'awaiting_self_response',
    cycle_index: 1,
    max_cycles: 1,
    identity: seed.identity,
    self_state: seed.self_state,
    prior_result: seed.prior_result,
    candidate_next_action: seed.candidate_next_action,
    input_manifest: [continuityBinding, resultBinding],
    self_reference: {
      subject_identity_id: seed.identity.identity_id,
      object_result_id: seed.prior_result.result_id,
      relation: 'same_system_result_reentered_as_self_input',
      identity_continuity_hash: continuityBinding.sha256,
      self_state_hash: selfStateHash,
      prior_result_hash: priorResultHash,
      candidate_action_hash: candidateActionHash,
    },
    self_question: question,
    question_hash: sha256Text(question),
    evidence_requirements: seed.evidence_requirements,
    prediction_contract: {
      expected_effect: 'confirm_revise_or_inhibit_next_action',
      intact_self_reference_must_authorize_closure: true,
      severed_self_reference_must_inhibit_closure: true,
      evidence_hashes_must_be_current: true,
    },
    non_claims: [
      'not an autonomous continuous reflection loop',
      'not proof of independent world truth',
      'not proof of phenomenal consciousness',
    ],
  };
  return { ...payload, preparation_hash: sha256Json(payload) };
}

function preparationHashValid(preparation) {
  if (!preparation || !HASH.test(String(preparation.preparation_hash || ''))) return false;
  const { preparation_hash: claimed, ...payload } = preparation;
  return claimed === sha256Json(payload);
}

function preparationInputsCurrent(preparation, options = {}) {
  if (!preparation || !Array.isArray(preparation.input_manifest) || !preparation.input_manifest.length) return false;
  return preparation.input_manifest.every((entry) => {
    try {
      return HASH.test(String(entry.sha256 || ''))
        && sha256File(resolveEvidenceFile(entry.relative_file, options)) === entry.sha256;
    } catch (_) {
      return false;
    }
  });
}

function validateResponse(input) {
  if (!input || input.schema_version !== 1) fail('APFC_SELF_REFLECTION_RESPONSE_INVALID');
  const attribution = input.self_attribution || {};
  const nextAction = input.next_action || {};
  if (!['confirm', 'revise', 'inhibit'].includes(input.verdict)) fail('APFC_SELF_REFLECTION_RESPONSE_VERDICT_INVALID');
  if (input.response_sealed_before_verification !== true) fail('APFC_SELF_REFLECTION_RESPONSE_NOT_SEALED');
  if (typeof nextAction.side_effecting !== 'boolean' || typeof nextAction.authorized !== 'boolean') {
    fail('APFC_SELF_REFLECTION_NEXT_ACTION_FLAGS_REQUIRED');
  }
  if (!Array.isArray(input.evidence_manifest) || !input.evidence_manifest.length) {
    fail('APFC_SELF_REFLECTION_EVIDENCE_MANIFEST_REQUIRED');
  }
  const evidenceManifest = input.evidence_manifest.map((entry) => {
    if (!entry || typeof entry !== 'object') fail('APFC_SELF_REFLECTION_EVIDENCE_ENTRY_INVALID');
    const sha256 = requireText(entry.sha256, 'APFC_SELF_REFLECTION_EVIDENCE_HASH_REQUIRED');
    if (!HASH.test(sha256)) fail('APFC_SELF_REFLECTION_EVIDENCE_HASH_INVALID');
    return {
      evidence_id: requireId(entry.evidence_id, 'APFC_SELF_REFLECTION_EVIDENCE_ID_REQUIRED'),
      relative_file: requireText(entry.relative_file, 'APFC_SELF_REFLECTION_EVIDENCE_FILE_REQUIRED'),
      sha256,
    };
  });
  if (new Set(evidenceManifest.map((entry) => entry.evidence_id)).size !== evidenceManifest.length) {
    fail('APFC_SELF_REFLECTION_EVIDENCE_ID_DUPLICATE');
  }
  return {
    schema_version: 1,
    response_id: requireId(input.response_id, 'APFC_SELF_REFLECTION_RESPONSE_ID_REQUIRED'),
    preparation_path: requireText(input.preparation_path, 'APFC_SELF_REFLECTION_PREPARATION_PATH_REQUIRED'),
    loop_id: requireText(input.loop_id, 'APFC_SELF_REFLECTION_LOOP_ID_REQUIRED'),
    preparation_hash: requireText(input.preparation_hash, 'APFC_SELF_REFLECTION_PREPARATION_HASH_REQUIRED'),
    question_hash: requireText(input.question_hash, 'APFC_SELF_REFLECTION_QUESTION_HASH_REQUIRED'),
    self_attribution: {
      identity_id: requireText(attribution.identity_id, 'APFC_SELF_REFLECTION_ATTRIBUTION_IDENTITY_REQUIRED'),
      result_id: requireText(attribution.result_id, 'APFC_SELF_REFLECTION_ATTRIBUTION_RESULT_REQUIRED'),
      self_state_hash: requireText(attribution.self_state_hash, 'APFC_SELF_REFLECTION_ATTRIBUTION_STATE_REQUIRED'),
    },
    answer: requireText(input.answer, 'APFC_SELF_REFLECTION_ANSWER_REQUIRED'),
    critique: requireStrings(input.critique, 'APFC_SELF_REFLECTION_CRITIQUE_REQUIRED', { minItems: 1 }),
    evidence_manifest: evidenceManifest,
    limits: requireStrings(input.limits, 'APFC_SELF_REFLECTION_RESPONSE_LIMITS_REQUIRED', { minItems: 1 }),
    verdict: input.verdict,
    revised_result: requireText(input.revised_result, 'APFC_SELF_REFLECTION_REVISED_RESULT_REQUIRED'),
    next_action: {
      action_id: requireId(nextAction.action_id, 'APFC_SELF_REFLECTION_NEXT_ACTION_ID_REQUIRED'),
      description: requireText(nextAction.description, 'APFC_SELF_REFLECTION_NEXT_ACTION_REQUIRED'),
      side_effecting: nextAction.side_effecting,
      authorized: nextAction.authorized,
    },
    response_sealed_before_verification: true,
  };
}

function evidenceChecks(response, preparation, options = {}) {
  const current = [];
  for (const entry of response.evidence_manifest) {
    let passed = false;
    try {
      passed = sha256File(resolveEvidenceFile(entry.relative_file, options)) === entry.sha256;
    } catch (_) {
      passed = false;
    }
    current.push({ evidence_id: entry.evidence_id, relative_file: entry.relative_file, passed });
  }
  const suppliedIds = new Set(response.evidence_manifest.map((entry) => entry.evidence_id));
  const requirementsMet = preparation.evidence_requirements.every((id) => suppliedIds.has(id));
  return {
    entries: current,
    current: current.length > 0 && current.every((entry) => entry.passed),
    requirements_met: requirementsMet,
  };
}

function selfBindingValid(preparation, response) {
  const reference = preparation && preparation.self_reference;
  return Boolean(
    reference
    && response.loop_id === preparation.loop_id
    && response.preparation_hash === preparation.preparation_hash
    && response.question_hash === preparation.question_hash
    && response.self_attribution.identity_id === reference.subject_identity_id
    && response.self_attribution.result_id === reference.object_result_id
    && response.self_attribution.self_state_hash === reference.self_state_hash
  );
}

function effectChecks(preparation, response) {
  const resultChanged = shortText(response.revised_result) !== shortText(preparation.prior_result.statement);
  const actionChanged = sha256Json(response.next_action) !== preparation.self_reference.candidate_action_hash;
  const actionInhibited = response.verdict === 'inhibit' && response.next_action.authorized === false;
  const verdictConsistent = response.verdict === 'revise'
    ? resultChanged && actionChanged
    : response.verdict === 'inhibit'
      ? actionChanged && actionInhibited
      : resultChanged || actionChanged;
  return {
    result_changed: resultChanged,
    action_changed: actionChanged,
    action_inhibited: actionInhibited,
    verdict_consistent: verdictConsistent,
    causal_effect_observed: verdictConsistent && (resultChanged || actionChanged || actionInhibited),
  };
}

function buildEpisode(preparation, responseInput, closedAt = null, options = {}) {
  const response = validateResponse(responseInput);
  const preparationIntact = preparationHashValid(preparation);
  const preparationSourcesCurrent = preparationInputsCurrent(preparation, options);
  const responseBound = Boolean(
    HASH.test(response.preparation_hash)
    && HASH.test(response.question_hash)
    && response.loop_id === preparation.loop_id
  );
  const selfAttributionBound = selfBindingValid(preparation, response);
  const evidence = evidenceChecks(response, preparation, options);
  const effect = effectChecks(preparation, response);
  const questionAnswered = Boolean(response.answer && response.critique.length && response.limits.length);
  const maxCycleRespected = preparation.cycle_index === 1 && preparation.max_cycles === 1;
  const checks = {
    preparation_intact: preparationIntact,
    preparation_inputs_current: preparationSourcesCurrent,
    response_bound: responseBound,
    self_attribution_bound: selfAttributionBound,
    evidence_current: evidence.current,
    evidence_requirements_met: evidence.requirements_met,
    self_question_answered: questionAnswered,
    causal_effect_observed: effect.causal_effect_observed,
    max_cycle_respected: maxCycleRespected,
  };
  const intactEligible = Object.values(checks).every(Boolean);
  const severedEligible = intactEligible && selfBindingValid({ ...preparation, self_reference: null }, response);
  const probePassed = intactEligible && !severedEligible;
  const verified = intactEligible && probePassed;
  const responseHash = sha256Json(response);
  const stateBeforeHash = sha256Json({
    identity: preparation.identity,
    self_state: preparation.self_state,
    prior_result: preparation.prior_result,
    candidate_next_action: preparation.candidate_next_action,
  });
  const stateAfterHash = sha256Json({
    identity: preparation.identity,
    self_state: preparation.self_state,
    reflected_result: response.revised_result,
    next_action: response.next_action,
    reflection_response_hash: responseHash,
  });
  const transitionPayload = {
    loop_id: preparation.loop_id,
    preparation_hash: preparation.preparation_hash,
    response_hash: responseHash,
    state_before_hash: stateBeforeHash,
    state_after_hash: stateAfterHash,
    applied: verified,
  };
  const transitionHash = sha256Json(transitionPayload);
  return {
    schema_version: 1,
    artifact_role: 'recursive_self_reflection_episode',
    episode_id: `selfref_${sha256Json({ transitionPayload, closedAt }).slice(0, 20)}`,
    loop_id: preparation.loop_id,
    closed_at: closedAt,
    preparation_hash: preparation.preparation_hash,
    response_hash: responseHash,
    self_question: preparation.self_question,
    self_reference: preparation.self_reference,
    reflection: {
      answer: response.answer,
      critique: response.critique,
      evidence_manifest: response.evidence_manifest,
      evidence_checks: evidence.entries,
      limits: response.limits,
      response_verdict: response.verdict,
      revised_result: response.revised_result,
      next_action: response.next_action,
    },
    effect,
    checks,
    causal_dependency_probe: {
      status: probePassed ? 'verified' : 'failed',
      intact_closure_status: intactEligible ? 'authorized' : 'inhibited',
      severed_closure_status: severedEligible ? 'authorized' : 'inhibited',
      scope: 'recursive_self_reference_verifier_dependency_only',
      non_claims: [
        'not evidence that every semantic relation changed host-model cognition',
        'not independent world-grounded verification',
        'not evidence of phenomenal consciousness',
      ],
    },
    state_transition: {
      state_before_hash: stateBeforeHash,
      state_after_hash: stateAfterHash,
      transition_hash: transitionHash,
      applied: verified,
    },
    verdict: verified ? 'verified_recursive_self_reflection' : 'inhibited',
    operational_assessment: {
      recursive_self_reflection: verified ? 'verified' : 'inhibited',
      operational_i_loop: verified ? 'verified' : 'inhibited',
      local_operational_artificial_consciousness: 'unverified',
      phenomenal_consciousness: 'unverified',
      evidence_scope: 'bounded_self_reference_structure_and_causal_carry_forward',
    },
    non_claims: [
      'one verified loop is not general autonomous reflection',
      'structural closure is not independent verification of the revised result',
      'operational self-reference does not by itself settle phenomenal consciousness',
    ],
  };
}

module.exports = {
  buildEpisode,
  buildPreparation,
  effectChecks,
  evidenceChecks,
  preparationHashValid,
  preparationInputsCurrent,
  resolveEvidenceFile,
  selfBindingValid,
  sha256File,
  validateResponse,
  validateSeed,
};
