#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');
const { verifyEpistemicReadbackReceipt } = require('../../kernel/cognition/epistemic_unity_verifier');

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const unique = (values) => [...new Set((values || []).map(shortText).filter(Boolean))].sort();

function assertRequest(request) {
  if (!request || request.schema_version !== 1) throw new Error('APFC_COGNITIVE_PATH_REQUEST_INVALID');
  for (const key of ['request_id', 'theme_id', 'theme', 'focus']) {
    if (!shortText(request[key])) throw new Error(`APFC_COGNITIVE_PATH_${key.toUpperCase()}_REQUIRED`);
  }
  if (!Array.isArray(request.uncertainties) || !request.uncertainties.length) throw new Error('APFC_COGNITIVE_PATH_UNCERTAINTY_REQUIRED');
  if (!Array.isArray(request.actions) || !request.actions.length) throw new Error('APFC_COGNITIVE_PATH_ACTION_REQUIRED');
  const uncertaintyIds = new Set();
  for (const item of request.uncertainties) {
    if (!shortText(item.uncertainty_id) || uncertaintyIds.has(item.uncertainty_id)) throw new Error('APFC_COGNITIVE_PATH_UNCERTAINTY_ID_INVALID');
    if (!shortText(item.semantic_intent)) throw new Error(`APFC_COGNITIVE_PATH_SEMANTIC_INTENT_REQUIRED: ${item.uncertainty_id}`);
    uncertaintyIds.add(item.uncertainty_id);
  }
  const actionIds = new Set();
  for (const action of request.actions) {
    if (!shortText(action.action_id) || actionIds.has(action.action_id)) throw new Error('APFC_COGNITIVE_PATH_ACTION_ID_INVALID');
    if (!Array.isArray(action.addresses_uncertainty_ids) || !action.addresses_uncertainty_ids.every((id) => uncertaintyIds.has(id))) {
      throw new Error(`APFC_COGNITIVE_PATH_ACTION_TARGET_INVALID: ${action.action_id}`);
    }
    actionIds.add(action.action_id);
  }
  if (!request.readback || !['pass', 'fail', 'unknown'].includes(request.readback.verdict)) throw new Error('APFC_COGNITIVE_PATH_READBACK_REQUIRED');
  return request;
}

function relevantAnchors(memory, request) {
  if (request.ablation && request.ablation.disable_anchor_memory === true) return [];
  const intents = new Set(request.uncertainties.map((item) => shortText(item.semantic_intent)));
  return (memory.anchors || []).filter((anchor) => (
    anchor.status === 'verified'
    && (anchor.theme_id === request.theme_id || intents.has(anchor.semantic_intent))
  ));
}

function uncertaintyScore(item, anchors) {
  const reuse = anchors.some((anchor) => anchor.semantic_intent === item.semantic_intent) ? 0.08 : 0;
  return Number((
    clamp(item.goal_impact) * 0.40
    + clamp(item.information_gain) * 0.30
    + clamp(item.reducibility) * 0.20
    + (item.blocking === true ? 0.10 : 0)
    + reuse
  ).toFixed(6));
}

function selectUncertainty(request, anchors = []) {
  return request.uncertainties.map((item) => ({ ...item, selection_score: uncertaintyScore(item, anchors) }))
    .sort((left, right) => right.selection_score - left.selection_score || left.uncertainty_id.localeCompare(right.uncertainty_id))[0];
}

function normalizedCost(cost = {}) {
  return (
    Math.min(1, Math.max(0, Number(cost.tokens) || 0) / 20000) * 0.35
    + Math.min(1, Math.max(0, Number(cost.time_ms) || 0) / 120000) * 0.30
    + Math.min(1, Math.max(0, Number(cost.action_count) || 0) / 10) * 0.20
    + clamp(cost.risk) * 0.15
  );
}

function actionScore(action, anchors) {
  const prior = anchors.filter((anchor) => anchor.action_id === action.action_id);
  const verifiedBoost = Math.min(0.15, prior.length * 0.05);
  const stalePenalty = prior.some((anchor) => anchor.status === 'stale') ? 0.10 : 0;
  const value = clamp(action.expected_progress) * 0.55 + clamp(action.information_gain) * 0.45 + verifiedBoost;
  return Number((value - normalizedCost(action.cost) - stalePenalty).toFixed(6));
}

function rankActions(request, selectedUncertainty, anchors = []) {
  return request.actions.map((action) => {
    const inhibited = action.authorized !== true
      || action.previously_falsified === true
      || !action.addresses_uncertainty_ids.includes(selectedUncertainty.uncertainty_id);
    return {
      ...action,
      inhibited,
      inhibition_reason: action.authorized !== true
        ? 'not_authorized'
        : action.previously_falsified === true
          ? 'previously_falsified'
          : !action.addresses_uncertainty_ids.includes(selectedUncertainty.uncertainty_id)
            ? 'does_not_address_selected_uncertainty'
            : null,
      utility_score: inhibited ? null : actionScore(action, anchors),
    };
  }).sort((left, right) => {
    if (left.inhibited !== right.inhibited) return left.inhibited ? 1 : -1;
    return (right.utility_score || -Infinity) - (left.utility_score || -Infinity) || left.action_id.localeCompare(right.action_id);
  });
}

function emptyMemory() {
  return { schema_version: 1, memory_id: 'apfc_cognitive_anchor_memory', anchors: [], transitions: [] };
}

function buildCycle(requestInput, memoryInput = emptyMemory(), createdAt = null, options = {}) {
  const request = assertRequest(requestInput);
  const memory = memoryInput && memoryInput.schema_version === 1 ? memoryInput : emptyMemory();
  const anchors = relevantAnchors(memory, request);
  const uncertainty = selectUncertainty(request, anchors);
  const ranked = rankActions(request, uncertainty, anchors);
  const selectedAction = ranked.find((item) => !item.inhibited) || null;
  const readbackMatches = Boolean(selectedAction && request.readback.action_id === selectedAction.action_id);
  const epistemicReadbackVerified = verifyEpistemicReadbackReceipt(
    request.readback.verification_receipt,
    options.workspace_root,
  );
  const verified = request.readback.verdict === 'pass'
    && readbackMatches
    && (request.readback.evidence_refs || []).length > 0
    && epistemicReadbackVerified;
  const cycleKey = sha256Json({ request, memory_hash: sha256Json(memory) });
  const cycleId = `cogcycle_${cycleKey.slice(0, 20)}`;
  const stateBeforeId = `cogstate_${sha256Json({ theme_id: request.theme_id, focus: request.focus, facts: request.verified_facts || [] }).slice(0, 20)}`;
  const correction = verified ? shortText(request.readback.learned_correction) : '';
  const learnedFact = verified ? shortText(request.readback.learned_fact) : '';
  const stateAfterId = `cogstate_${sha256Json({ before: stateBeforeId, action: selectedAction && selectedAction.action_id, verdict: request.readback.verdict, correction }).slice(0, 20)}`;
  const anchor = verified ? {
    anchor_id: `anchor_${sha256Json({ cycle_id: cycleId, correction, learnedFact }).slice(0, 20)}`,
    status: 'verified',
    theme_id: request.theme_id,
    semantic_intent: uncertainty.semantic_intent,
    uncertainty_id: uncertainty.uncertainty_id,
    action_id: selectedAction.action_id,
    learned_fact: learnedFact,
    correction,
    evidence_refs: unique(request.readback.evidence_refs),
    confidence: clamp(request.readback.confidence),
    created_at: createdAt,
    reuse_count: 0,
  } : null;
  const transition = {
    transition_id: `cogtrans_${sha256Json({ cycle_id: cycleId, from: stateBeforeId, to: stateAfterId }).slice(0, 20)}`,
    from_state_id: stateBeforeId,
    to_state_id: stateAfterId,
    uncertainty_id: uncertainty.uncertainty_id,
    action_id: selectedAction && selectedAction.action_id,
    verdict: verified ? 'verified' : request.readback.verdict === 'fail' ? 'falsified' : 'unverified',
    evidence_refs: unique(request.readback.evidence_refs),
    cost: selectedAction ? selectedAction.cost : {},
    utility_score: selectedAction && selectedAction.utility_score,
    created_at: createdAt,
  };
  const nextMemory = {
    schema_version: 1,
    memory_id: 'apfc_cognitive_anchor_memory',
    anchors: [...(memory.anchors || []).map((item) => anchors.some((used) => used.anchor_id === item.anchor_id) ? { ...item, reuse_count: (item.reuse_count || 0) + 1 } : item), ...(anchor ? [anchor] : [])]
      .sort((left, right) => left.anchor_id.localeCompare(right.anchor_id)),
    transitions: [...(memory.transitions || []), transition].sort((left, right) => left.transition_id.localeCompare(right.transition_id)),
  };
  return {
    schema_version: 1,
    cycle_id: cycleId,
    created_at: createdAt,
    request_id: request.request_id,
    theme_id: request.theme_id,
    theme: request.theme,
    focus: request.focus,
    state_before_id: stateBeforeId,
    state_after_id: stateAfterId,
    selected_uncertainty: uncertainty,
    ranked_actions: ranked,
    selected_action: selectedAction,
    reused_anchor_ids: anchors.map((item) => item.anchor_id).sort(),
    readback: request.readback,
    epistemic_readback_verified: epistemicReadbackVerified,
    transition,
    anchor,
    verdict: verified ? 'verified_learning' : request.readback.verdict === 'fail' ? 'falsified_path' : 'unverified',
    next_memory: nextMemory,
    graph: {
      nodes: [
        { id: stateBeforeId, type: 'observation', semantic_class: 'cognitive_state' },
        { id: uncertainty.uncertainty_id, type: 'cause_candidate', semantic_class: 'uncertainty' },
        { id: `inquiry_${cycleKey.slice(0, 20)}`, type: 'plan_step', semantic_class: 'cognitive_inquiry' },
        ...(anchor ? [{ id: anchor.anchor_id, type: 'correction', semantic_class: 'cognitive_anchor' }] : []),
        { id: stateAfterId, type: 'outcome', semantic_class: 'cognitive_state' },
      ],
      edges: [
        { from: stateBeforeId, type: 'possibly_caused_by', to: uncertainty.uncertainty_id },
        { from: uncertainty.uncertainty_id, type: 'evaluated_by', to: `inquiry_${cycleKey.slice(0, 20)}` },
        ...(anchor ? [{ from: `inquiry_${cycleKey.slice(0, 20)}`, type: 'corrected_by', to: anchor.anchor_id }, { from: anchor.anchor_id, type: 'produced', to: stateAfterId }] : [{ from: `inquiry_${cycleKey.slice(0, 20)}`, type: 'produced', to: stateAfterId }]),
      ],
    },
  };
}

module.exports = { assertRequest, buildCycle, emptyMemory, normalizedCost, rankActions, relevantAnchors, selectUncertainty };
