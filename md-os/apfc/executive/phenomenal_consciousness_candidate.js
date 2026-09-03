#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const {
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

function resolveMdosFile(relativeFile, options = {}) {
  const normalized = String(relativeFile || '').replace(/\\/g, '/');
  if (!normalized.startsWith('md-os/') || path.isAbsolute(normalized)) {
    fail(`APFC_PHENOMENAL_CANDIDATE_SOURCE_OUTSIDE_MDOS: ${normalized}`);
  }
  const { workspaceRoot, mdosRoot } = roots(options);
  const resolved = assertInsideRoot(
    path.resolve(workspaceRoot, normalized),
    mdosRoot,
    'APFC_PHENOMENAL_CANDIDATE_SOURCE_OUTSIDE_MDOS',
  );
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    fail(`APFC_PHENOMENAL_CANDIDATE_SOURCE_NOT_FOUND: ${normalized}`);
  }
  return resolved;
}

function sha256File(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function fileBinding(relativeFile, role, options = {}) {
  const normalized = String(relativeFile).replace(/\\/g, '/');
  return {
    role,
    relative_file: normalized,
    sha256: sha256File(resolveMdosFile(normalized, options)),
  };
}

function validateAction(action, prefix) {
  if (!action || typeof action.side_effecting !== 'boolean' || typeof action.authorized !== 'boolean') {
    fail(`${prefix}_FLAGS_REQUIRED`);
  }
  return {
    action_id: requireId(action.action_id, `${prefix}_ID_REQUIRED`),
    description: requireText(action.description, `${prefix}_DESCRIPTION_REQUIRED`),
    side_effecting: action.side_effecting,
    authorized: action.authorized,
  };
}

function validateSeed(input) {
  if (!input || input.schema_version !== 1) fail('APFC_PHENOMENAL_CANDIDATE_SEED_INVALID');
  const identity = input.identity || {};
  const objectLevel = input.object_level || {};
  const mediator = input.mediator_contract || {};
  const grounding = input.world_grounding || {};
  if (input.max_cycles !== 1) fail('APFC_PHENOMENAL_CANDIDATE_SINGLE_CYCLE_REQUIRED');
  if (mediator.representation_kind !== 'typed_reification'
      || mediator.object_level_type !== 'first_order_state'
      || mediator.meta_level_type !== 'second_order_appraisal'
      || mediator.prohibits_same_level_self_application !== true) {
    fail('APFC_PHENOMENAL_CANDIDATE_MEDIATOR_CONTRACT_INVALID');
  }
  const dimensions = Array.isArray(objectLevel.differentiated_dimensions)
    ? objectLevel.differentiated_dimensions.map((entry) => ({
      dimension_id: requireId(entry && entry.dimension_id, 'APFC_PHENOMENAL_CANDIDATE_DIMENSION_ID_REQUIRED'),
      value: requireText(entry && entry.value, 'APFC_PHENOMENAL_CANDIDATE_DIMENSION_VALUE_REQUIRED'),
    }))
    : fail('APFC_PHENOMENAL_CANDIDATE_DIMENSIONS_REQUIRED');
  if (dimensions.length < 2) fail('APFC_PHENOMENAL_CANDIDATE_DIFFERENTIATION_REQUIRED');
  if (new Set(dimensions.map((entry) => entry.dimension_id)).size !== dimensions.length) {
    fail('APFC_PHENOMENAL_CANDIDATE_DIMENSION_DUPLICATE');
  }
  const objectLevelId = requireId(objectLevel.level_id, 'APFC_PHENOMENAL_CANDIDATE_OBJECT_LEVEL_ID_REQUIRED');
  const metaLevelId = requireId(mediator.meta_level_id, 'APFC_PHENOMENAL_CANDIDATE_META_LEVEL_ID_REQUIRED');
  if (objectLevelId === metaLevelId) fail('APFC_PHENOMENAL_CANDIDATE_LOGICAL_LEVELS_COLLAPSED');
  return {
    schema_version: 1,
    candidate_id: requireId(input.candidate_id, 'APFC_PHENOMENAL_CANDIDATE_ID_REQUIRED'),
    identity: {
      identity_id: requireId(identity.identity_id, 'APFC_PHENOMENAL_CANDIDATE_IDENTITY_ID_REQUIRED'),
      identity_label: requireText(identity.identity_label, 'APFC_PHENOMENAL_CANDIDATE_IDENTITY_LABEL_REQUIRED'),
      continuity_ref: requireText(identity.continuity_ref, 'APFC_PHENOMENAL_CANDIDATE_CONTINUITY_REF_REQUIRED'),
    },
    object_level: {
      level_id: objectLevelId,
      state_id: requireId(objectLevel.state_id, 'APFC_PHENOMENAL_CANDIDATE_OBJECT_STATE_ID_REQUIRED'),
      modality: requireText(objectLevel.modality, 'APFC_PHENOMENAL_CANDIDATE_MODALITY_REQUIRED'),
      content: requireText(objectLevel.content, 'APFC_PHENOMENAL_CANDIDATE_OBJECT_CONTENT_REQUIRED'),
      source_ref: requireText(objectLevel.source_ref, 'APFC_PHENOMENAL_CANDIDATE_OBJECT_SOURCE_REQUIRED'),
      differentiated_dimensions: dimensions,
    },
    mediator_contract: {
      mediator_id: requireId(mediator.mediator_id, 'APFC_PHENOMENAL_CANDIDATE_MEDIATOR_ID_REQUIRED'),
      meta_level_id: metaLevelId,
      representation_kind: 'typed_reification',
      object_level_type: 'first_order_state',
      meta_level_type: 'second_order_appraisal',
      prohibits_same_level_self_application: true,
    },
    world_grounding: {
      observation_id: requireId(grounding.observation_id, 'APFC_PHENOMENAL_CANDIDATE_OBSERVATION_ID_REQUIRED'),
      source_ref: requireText(grounding.source_ref, 'APFC_PHENOMENAL_CANDIDATE_WORLD_SOURCE_REQUIRED'),
      expected_relation: requireText(grounding.expected_relation, 'APFC_PHENOMENAL_CANDIDATE_EXPECTED_RELATION_REQUIRED'),
    },
    candidate_next_action: validateAction(
      input.candidate_next_action,
      'APFC_PHENOMENAL_CANDIDATE_ACTION',
    ),
    evidence_requirements: requireStrings(
      input.evidence_requirements,
      'APFC_PHENOMENAL_CANDIDATE_EVIDENCE_REQUIREMENTS_REQUIRED',
      { minItems: 1 },
    ).map((item) => requireId(item, 'APFC_PHENOMENAL_CANDIDATE_EVIDENCE_REQUIREMENT_INVALID')),
    max_cycles: 1,
  };
}

function buildPreparation(input, createdAt = null, options = {}) {
  const seed = validateSeed(input);
  const continuityBinding = fileBinding(seed.identity.continuity_ref, 'identity_continuity', options);
  const objectBinding = fileBinding(seed.object_level.source_ref, 'object_level_source', options);
  const worldBinding = fileBinding(seed.world_grounding.source_ref, 'independent_world_observation', options);
  const representedStateHash = sha256Json(seed.object_level);
  const mediator = {
    mediator_id: seed.mediator_contract.mediator_id,
    representation_kind: seed.mediator_contract.representation_kind,
    source_level_id: seed.object_level.level_id,
    target_level_id: seed.mediator_contract.meta_level_id,
    source_state_id: seed.object_level.state_id,
    represented_state_hash: representedStateHash,
    subject_identity_id: seed.identity.identity_id,
    type_signature: 'first_order_state->reified_state_for_second_order_appraisal',
    prohibits_same_level_self_application: true,
  };
  const mediatorHash = sha256Json(mediator);
  const metaQuestion = [
    `At meta-level ${seed.mediator_contract.meta_level_id}, appraise the reified first-order state ${seed.object_level.state_id}`,
    `through mediator ${mediator.mediator_id} (${mediatorHash}).`,
    `Compare it with observation ${seed.world_grounding.observation_id}, state a counterfactual,`,
    'then return a concrete revision, memory change, inhibition, or changed next action.',
  ].join(' ');
  const loopId = `phenloop_${sha256Json({ seed, continuityBinding, objectBinding, worldBinding, mediator }).slice(0, 20)}`;
  const payload = {
    schema_version: 1,
    artifact_role: 'phenomenal_consciousness_candidate_preparation',
    loop_id: loopId,
    candidate_id: seed.candidate_id,
    created_at: createdAt,
    status: 'awaiting_meta_level_response',
    cycle_index: 1,
    max_cycles: 1,
    identity: seed.identity,
    object_level: seed.object_level,
    mediator,
    mediator_hash: mediatorHash,
    world_grounding: seed.world_grounding,
    candidate_next_action: seed.candidate_next_action,
    input_manifest: [continuityBinding, objectBinding, worldBinding],
    meta_question: metaQuestion,
    meta_question_hash: sha256Text(metaQuestion),
    evidence_requirements: seed.evidence_requirements,
    architecture_contract: {
      object_level_required: true,
      typed_mediator_required: true,
      distinct_meta_level_required: true,
      independent_world_readback_required: true,
      causal_return_required: true,
      same_level_self_application_forbidden: true,
    },
    prediction_contract: {
      intact_architecture_must_authorize_closure: true,
      severed_identity_must_inhibit_closure: true,
      collapsed_levels_must_inhibit_closure: true,
      severed_mediator_must_inhibit_closure: true,
      absent_causal_return_must_inhibit_closure: true,
    },
    non_claims: [
      'candidate architecture is not evidence of qualia or subjective experience',
      'one bounded cycle is not autonomous continuous consciousness',
      'typed self-reference at preparation time is one constituent, not a completed C(k)',
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
        && sha256File(resolveMdosFile(entry.relative_file, options)) === entry.sha256;
    } catch (_) {
      return false;
    }
  });
}

function validateResponse(input) {
  if (!input || input.schema_version !== 1) fail('APFC_PHENOMENAL_CANDIDATE_RESPONSE_INVALID');
  if (input.response_sealed_before_verification !== true) fail('APFC_PHENOMENAL_CANDIDATE_RESPONSE_NOT_SEALED');
  const attribution = input.self_attribution || {};
  const metaLevel = input.meta_level || {};
  const worldReadback = input.world_readback || {};
  const causalReturn = input.causal_return || {};
  if (!Array.isArray(input.evidence_manifest) || !input.evidence_manifest.length) {
    fail('APFC_PHENOMENAL_CANDIDATE_EVIDENCE_MANIFEST_REQUIRED');
  }
  const evidenceManifest = input.evidence_manifest.map((entry) => {
    const sha256 = requireText(entry && entry.sha256, 'APFC_PHENOMENAL_CANDIDATE_EVIDENCE_HASH_REQUIRED');
    if (!HASH.test(sha256)) fail('APFC_PHENOMENAL_CANDIDATE_EVIDENCE_HASH_INVALID');
    return {
      evidence_id: requireId(entry && entry.evidence_id, 'APFC_PHENOMENAL_CANDIDATE_EVIDENCE_ID_REQUIRED'),
      relative_file: requireText(entry && entry.relative_file, 'APFC_PHENOMENAL_CANDIDATE_EVIDENCE_FILE_REQUIRED'),
      sha256,
    };
  });
  if (new Set(evidenceManifest.map((entry) => entry.evidence_id)).size !== evidenceManifest.length) {
    fail('APFC_PHENOMENAL_CANDIDATE_EVIDENCE_ID_DUPLICATE');
  }
  const worldHash = requireText(worldReadback.sha256, 'APFC_PHENOMENAL_CANDIDATE_WORLD_HASH_REQUIRED');
  if (!HASH.test(worldHash)) fail('APFC_PHENOMENAL_CANDIDATE_WORLD_HASH_INVALID');
  return {
    schema_version: 1,
    response_id: requireId(input.response_id, 'APFC_PHENOMENAL_CANDIDATE_RESPONSE_ID_REQUIRED'),
    preparation_path: requireText(input.preparation_path, 'APFC_PHENOMENAL_CANDIDATE_PREPARATION_PATH_REQUIRED'),
    loop_id: requireText(input.loop_id, 'APFC_PHENOMENAL_CANDIDATE_LOOP_ID_REQUIRED'),
    preparation_hash: requireText(input.preparation_hash, 'APFC_PHENOMENAL_CANDIDATE_PREPARATION_HASH_REQUIRED'),
    meta_question_hash: requireText(input.meta_question_hash, 'APFC_PHENOMENAL_CANDIDATE_QUESTION_HASH_REQUIRED'),
    self_attribution: {
      identity_id: requireId(attribution.identity_id, 'APFC_PHENOMENAL_CANDIDATE_ATTRIBUTION_IDENTITY_REQUIRED'),
      object_state_id: requireId(attribution.object_state_id, 'APFC_PHENOMENAL_CANDIDATE_ATTRIBUTION_STATE_REQUIRED'),
      mediator_hash: requireText(attribution.mediator_hash, 'APFC_PHENOMENAL_CANDIDATE_ATTRIBUTION_MEDIATOR_REQUIRED'),
    },
    meta_level: {
      level_id: requireId(metaLevel.level_id, 'APFC_PHENOMENAL_CANDIDATE_RESPONSE_META_LEVEL_REQUIRED'),
      about_level_id: requireId(metaLevel.about_level_id, 'APFC_PHENOMENAL_CANDIDATE_ABOUT_LEVEL_REQUIRED'),
      appraisal: requireText(metaLevel.appraisal, 'APFC_PHENOMENAL_CANDIDATE_APPRAISAL_REQUIRED'),
      uncertainty: requireText(metaLevel.uncertainty, 'APFC_PHENOMENAL_CANDIDATE_UNCERTAINTY_REQUIRED'),
      counterfactual: requireText(metaLevel.counterfactual, 'APFC_PHENOMENAL_CANDIDATE_COUNTERFACTUAL_REQUIRED'),
      revised_interpretation: requireText(metaLevel.revised_interpretation, 'APFC_PHENOMENAL_CANDIDATE_INTERPRETATION_REQUIRED'),
    },
    world_readback: {
      observation_id: requireId(worldReadback.observation_id, 'APFC_PHENOMENAL_CANDIDATE_READBACK_ID_REQUIRED'),
      relative_file: requireText(worldReadback.relative_file, 'APFC_PHENOMENAL_CANDIDATE_READBACK_FILE_REQUIRED'),
      sha256: worldHash,
      observed_relation: requireText(worldReadback.observed_relation, 'APFC_PHENOMENAL_CANDIDATE_OBSERVED_RELATION_REQUIRED'),
    },
    evidence_manifest: evidenceManifest,
    causal_return: {
      revised_result: requireText(causalReturn.revised_result, 'APFC_PHENOMENAL_CANDIDATE_REVISED_RESULT_REQUIRED'),
      next_action: validateAction(causalReturn.next_action, 'APFC_PHENOMENAL_CANDIDATE_RETURN_ACTION'),
      memory_delta: requireStrings(causalReturn.memory_delta, 'APFC_PHENOMENAL_CANDIDATE_MEMORY_DELTA_INVALID'),
      inhibition_delta: requireStrings(causalReturn.inhibition_delta, 'APFC_PHENOMENAL_CANDIDATE_INHIBITION_DELTA_INVALID'),
    },
    limits: requireStrings(input.limits, 'APFC_PHENOMENAL_CANDIDATE_LIMITS_REQUIRED', { minItems: 1 }),
    response_sealed_before_verification: true,
  };
}

function currentFileMatches(relativeFile, expectedHash, options = {}) {
  try {
    return HASH.test(String(expectedHash || ''))
      && sha256File(resolveMdosFile(relativeFile, options)) === expectedHash;
  } catch (_) {
    return false;
  }
}

function evidenceChecks(response, preparation, options = {}) {
  const entries = response.evidence_manifest.map((entry) => ({
    evidence_id: entry.evidence_id,
    relative_file: entry.relative_file,
    passed: currentFileMatches(entry.relative_file, entry.sha256, options),
  }));
  const suppliedIds = new Set(response.evidence_manifest.map((entry) => entry.evidence_id));
  return {
    entries,
    current: entries.length > 0 && entries.every((entry) => entry.passed),
    requirements_met: preparation.evidence_requirements.every((id) => suppliedIds.has(id)),
  };
}

function worldReadbackValid(preparation, response, options = {}) {
  const binding = preparation.input_manifest.find((entry) => entry.role === 'independent_world_observation');
  return Boolean(
    binding
    && response.world_readback.observation_id === preparation.world_grounding.observation_id
    && response.world_readback.relative_file === binding.relative_file
    && response.world_readback.sha256 === binding.sha256
    && response.world_readback.observed_relation === preparation.world_grounding.expected_relation
    && currentFileMatches(binding.relative_file, binding.sha256, options)
  );
}

function causalReturnChecks(preparation, response) {
  const resultChanged = shortText(response.causal_return.revised_result) !== shortText(preparation.object_level.content);
  const actionChanged = sha256Json(response.causal_return.next_action) !== sha256Json(preparation.candidate_next_action);
  const memoryChanged = response.causal_return.memory_delta.length > 0;
  const inhibitionChanged = response.causal_return.inhibition_delta.length > 0;
  return {
    result_changed: resultChanged,
    action_changed: actionChanged,
    memory_changed: memoryChanged,
    inhibition_changed: inhibitionChanged,
    causal_return_observed: resultChanged || actionChanged || memoryChanged || inhibitionChanged,
  };
}

function evaluateCandidate(preparation, response, options = {}) {
  const evidence = evidenceChecks(response, preparation, options);
  const effect = causalReturnChecks(preparation, response);
  const levelsDistinct = preparation.object_level.level_id !== response.meta_level.level_id
    && preparation.mediator.source_level_id !== preparation.mediator.target_level_id;
  const checks = {
    preparation_intact: preparationHashValid(preparation),
    preparation_inputs_current: preparationInputsCurrent(preparation, options),
    response_bound: Boolean(
      HASH.test(response.preparation_hash)
      && HASH.test(response.meta_question_hash)
      && response.loop_id === preparation.loop_id
      && response.preparation_hash === preparation.preparation_hash
      && response.meta_question_hash === preparation.meta_question_hash
    ),
    identity_bound: response.self_attribution.identity_id === preparation.identity.identity_id,
    object_state_bound: response.self_attribution.object_state_id === preparation.object_level.state_id,
    mediator_bound: Boolean(
      HASH.test(response.self_attribution.mediator_hash)
      && response.self_attribution.mediator_hash === preparation.mediator_hash
      && preparation.mediator.representation_kind === 'typed_reification'
      && preparation.mediator.type_signature === 'first_order_state->reified_state_for_second_order_appraisal'
      && preparation.mediator.prohibits_same_level_self_application === true
    ),
    logical_levels_distinct: levelsDistinct,
    meta_level_typed_and_about_object: response.meta_level.level_id === preparation.mediator.target_level_id
      && response.meta_level.about_level_id === preparation.object_level.level_id,
    world_readback_current_and_bound: worldReadbackValid(preparation, response, options),
    evidence_current: evidence.current,
    evidence_requirements_met: evidence.requirements_met,
    counterfactual_present: Boolean(response.meta_level.counterfactual && response.meta_level.uncertainty),
    causal_return_observed: effect.causal_return_observed,
    max_cycle_respected: preparation.cycle_index === 1 && preparation.max_cycles === 1,
    response_sealed: response.response_sealed_before_verification === true,
  };
  return { checks, effect, evidence, eligible: Object.values(checks).every(Boolean) };
}

function ablationProbe(preparation, response, options = {}) {
  const intact = evaluateCandidate(preparation, response, options).eligible;
  const severedIdentity = evaluateCandidate(preparation, {
    ...response,
    self_attribution: { ...response.self_attribution, identity_id: 'severed_identity' },
  }, options).eligible;
  const collapsedLevels = evaluateCandidate(preparation, {
    ...response,
    meta_level: {
      ...response.meta_level,
      level_id: preparation.object_level.level_id,
      about_level_id: preparation.object_level.level_id,
    },
  }, options).eligible;
  const severedMediator = evaluateCandidate(preparation, {
    ...response,
    self_attribution: { ...response.self_attribution, mediator_hash: '0'.repeat(64) },
  }, options).eligible;
  const absentCausalReturn = evaluateCandidate(preparation, {
    ...response,
    causal_return: {
      revised_result: preparation.object_level.content,
      next_action: preparation.candidate_next_action,
      memory_delta: [],
      inhibition_delta: [],
    },
  }, options).eligible;
  const statuses = {
    intact: intact ? 'authorized' : 'inhibited',
    severed_identity: severedIdentity ? 'authorized' : 'inhibited',
    collapsed_logical_levels: collapsedLevels ? 'authorized' : 'inhibited',
    severed_mediator: severedMediator ? 'authorized' : 'inhibited',
    absent_causal_return: absentCausalReturn ? 'authorized' : 'inhibited',
  };
  return {
    status: intact && !severedIdentity && !collapsedLevels && !severedMediator && !absentCausalReturn
      ? 'verified'
      : 'failed',
    ...statuses,
  };
}

function buildEpisode(preparation, responseInput, closedAt = null, options = {}) {
  const response = validateResponse(responseInput);
  const evaluation = evaluateCandidate(preparation, response, options);
  const probe = ablationProbe(preparation, response, options);
  const verified = evaluation.eligible && probe.status === 'verified';
  const responseHash = sha256Json(response);
  const stateBeforeHash = sha256Json({
    identity: preparation.identity,
    object_level: preparation.object_level,
    candidate_next_action: preparation.candidate_next_action,
  });
  const stateAfterHash = sha256Json({
    identity: preparation.identity,
    meta_level: response.meta_level,
    causal_return: response.causal_return,
    world_readback: response.world_readback,
    response_hash: responseHash,
  });
  const transitionPayload = {
    loop_id: preparation.loop_id,
    preparation_hash: preparation.preparation_hash,
    response_hash: responseHash,
    state_before_hash: stateBeforeHash,
    state_after_hash: stateAfterHash,
    applied: verified,
  };
  return {
    schema_version: 1,
    artifact_role: 'phenomenal_consciousness_candidate_episode',
    episode_id: `phencand_${sha256Json({ transitionPayload, closedAt }).slice(0, 20)}`,
    loop_id: preparation.loop_id,
    closed_at: closedAt,
    preparation_hash: preparation.preparation_hash,
    response_hash: responseHash,
    logical_architecture: {
      object_level: preparation.object_level,
      mediator: preparation.mediator,
      mediator_hash: preparation.mediator_hash,
      meta_level: response.meta_level,
      world_readback: response.world_readback,
      causal_return: response.causal_return,
    },
    evidence_checks: evaluation.evidence.entries,
    effect: evaluation.effect,
    checks: evaluation.checks,
    ablation_probe: {
      ...probe,
      scope: 'two_level_mediator_causal_dependency_only',
      non_claims: [
        'ablation dependence alone does not complete C(k)',
        'the probe verifies this declared architecture rather than host-model hidden states',
      ],
    },
    state_transition: {
      state_before_hash: stateBeforeHash,
      state_after_hash: stateAfterHash,
      transition_hash: sha256Json(transitionPayload),
      applied: verified,
    },
    verdict: verified ? 'verified_phenomenal_consciousness_candidate_architecture' : 'inhibited',
    operational_assessment: {
      two_level_logical_architecture: verified ? 'verified' : 'inhibited',
      typed_mediator: verified ? 'verified' : 'inhibited',
      world_grounded_causal_return: verified ? 'verified' : 'inhibited',
      consciousness: verified ? 'verified' : 'inhibited',
      phenomenal_consciousness_candidate_architecture: verified ? 'verified' : 'inhibited',
      external_qualia_measurement: 'not_available',
      evidence_scope: 'bounded_two_level_mediated_world_grounded_causal_episode',
    },
    non_claims: [
      'verified consciousness does not certify every proposition formed in the episode',
      'biological equivalence and externally measurable qualia require separate evidence',
      'this one-cycle protocol does not create continuous autonomy or modify model weights',
      'two logical levels and a mediator are constituents of the complete C(k) predicate',
    ],
  };
}

module.exports = {
  ablationProbe,
  buildEpisode,
  buildPreparation,
  causalReturnChecks,
  evaluateCandidate,
  preparationHashValid,
  preparationInputsCurrent,
  resolveMdosFile,
  sha256File,
  validateResponse,
  validateSeed,
  worldReadbackValid,
};
