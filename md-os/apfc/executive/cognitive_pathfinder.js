#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { sha256Json, sha256Text, shortText } = require('../../os/lib/common');
const { verifyEpistemicReadbackReceipt, verifyEpistemicUnityCandidate } = require('../../kernel/cognition/epistemic_unity_verifier');

const clamp = (value) => Math.max(0, Math.min(1, Number(value) || 0));
const unique = (values) => [...new Set((values || []).map(shortText).filter(Boolean))].sort();

function patternId(pattern) {
  const { pattern_id, verification_source, ...basis } = pattern;
  return `anchor_${sha256Json(basis).slice(0, 20)}`;
}

function assertWorkingPattern(pattern) {
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024;
  if (!pattern || !text(pattern.principle) || !text(pattern.prediction)
    || Object.keys(pattern).some(key => !['pattern_id', 'principle', 'conditions', 'prediction', 'procedure', 'task_bindings', 'source_bindings', 'verification_source'].includes(key))
    || !['conditions', 'procedure'].every(key => Array.isArray(pattern[key]) && pattern[key].length <= 8 && pattern[key].every(text))
    || !Array.isArray(pattern.task_bindings) || !pattern.task_bindings.length || pattern.task_bindings.length > 3
    || !pattern.task_bindings.every(item => item && /^task_[a-zA-Z0-9_]+$/.test(item.task_spec_id)
      && item.source_path === `md-os/ops/tasks/${item.task_spec_id}.json` && /^[a-f0-9]{64}$/.test(item.source_hash))
    || !Array.isArray(pattern.source_bindings) || pattern.source_bindings.length > 24
    || !pattern.source_bindings.every(item => item && typeof item.path === 'string'
      && (item.sha256 === null || /^[a-f0-9]{64}$/.test(item.sha256)))
    || pattern.pattern_id !== patternId(pattern)) throw new Error('COGNITIVE_PATTERN_INVALID');
  return pattern;
}

// Native memory reads must never follow references into credentials or aliases.
function readPatternSource(root, reference, maximum = 1048576) {
  if (typeof reference !== 'string' || !/^md-os\/(kb|ops\/(sources|tasks|verifications|evidence))\/.+\.(json|md|txt)$/.test(reference)
    || reference.split('/').some(part => !part || part.startsWith('.') || part === 'local')) {
    throw new Error('COGNITIVE_SOURCE_PATH_INVALID');
  }
  const file = path.join(root, reference);
  if (fs.realpathSync(file) !== file || !fs.statSync(file).isFile() || fs.statSync(file).size > maximum) {
    throw new Error('COGNITIVE_SOURCE_INVALID');
  }
  return fs.readFileSync(file, 'utf8');
}

function sourceHash(root, reference) {
  try { return sha256Text(readPatternSource(root, reference)); } catch (_) { return null; }
}

function verifyPatternInput(pattern, input, root) {
  assertWorkingPattern(pattern);
  const candidate = input?.candidate;
  if (!candidate || candidate.hypothesis_id !== pattern.pattern_id || candidate.hypothesis_statement !== pattern.principle
    || sha256Json(candidate.premises) !== sha256Json(pattern.conditions)
    || !candidate.frame_predictions?.some(item => item.prediction === pattern.prediction)) {
    throw new Error('COGNITIVE_VERIFICATION_PATTERN_MISMATCH');
  }
  if (!Array.isArray(candidate.frame_predictions) || candidate.frame_predictions.length > 8
    || !Array.isArray(input.prediction_readbacks) || input.prediction_readbacks.length > 8
    || !Array.isArray(input.transformation_reports) || input.transformation_reports.length > 16) {
    throw new Error('COGNITIVE_VERIFICATION_BOUND_EXCEEDED');
  }
  const manifests = [input.evidence_manifest, ...(input.transformation_reports || []).map(item => item.evidence_manifest)];
  if (manifests.some(items => !Array.isArray(items) || items.length > 64)) throw new Error('COGNITIVE_VERIFICATION_EVIDENCE_INVALID');
  for (const item of manifests.flat()) readPatternSource(root, item.relative_file);
  const report = verifyEpistemicUnityCandidate(input, { workspace_root: root });
  if (Buffer.byteLength(JSON.stringify(report)) > 16384) throw new Error('COGNITIVE_VERIFICATION_BOUND_EXCEEDED');
  return report;
}

function patternStatus(anchor, root) {
  try {
    const pattern = assertWorkingPattern(anchor.working_pattern);
    if (anchor.anchor_id !== pattern.pattern_id) return 'stale';
    const bindings = [...pattern.task_bindings.map(item => ({ path: item.source_path, sha256: item.source_hash })),
      ...pattern.source_bindings, ...(pattern.verification_source ? [pattern.verification_source] : [])];
    if (!bindings.every(item => sourceHash(root, item.path) === item.sha256)) return 'stale';
    if (anchor.status === 'verified') {
      if (!pattern.verification_source) return 'stale';
      const report = verifyPatternInput(pattern, JSON.parse(readPatternSource(root, pattern.verification_source.path, 262144)), root);
      return verifyEpistemicReadbackReceipt(anchor.verification_receipt, root)
        && report.status === 'supported_bounded' && report.verification_hash === anchor.verification_receipt.observation_hash
        && report.candidate_hash === anchor.verification_receipt.candidate_hash ? 'verified' : 'stale';
    }
    return ['candidate', 'stale', 'falsified'].includes(anchor.status) ? anchor.status : 'stale';
  } catch (_) { return 'stale'; }
}

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
  if (request.working_pattern) assertWorkingPattern(request.working_pattern);
  return request;
}

function relevantAnchors(memory, request, workspaceRoot) {
  if (request.ablation && request.ablation.disable_anchor_memory === true) return [];
  const intents = new Set(request.uncertainties.map((item) => shortText(item.semantic_intent)));
  return (memory.anchors || []).filter((anchor) => (
    anchor.status === 'verified'
    && (!anchor.working_pattern || patternStatus(anchor, workspaceRoot) === 'verified')
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
  const anchors = relevantAnchors(memory, request, options.workspace_root);
  const uncertainty = selectUncertainty(request, anchors);
  const ranked = rankActions(request, uncertainty, anchors);
  const selectedAction = ranked.find((item) => !item.inhibited) || null;
  const readbackMatches = Boolean(selectedAction && request.readback.action_id === selectedAction.action_id);
  const epistemicReadbackVerified = verifyEpistemicReadbackReceipt(
    request.readback.verification_receipt,
    options.workspace_root,
  );
  const pattern = request.working_pattern || null;
  const verified = request.readback.verdict === 'pass'
    && readbackMatches
    && (request.readback.evidence_refs || []).length > 0
    && epistemicReadbackVerified
    && (!pattern || patternStatus({ anchor_id: pattern.pattern_id, status: 'verified', working_pattern: pattern,
      verification_receipt: request.readback.verification_receipt }, options.workspace_root) === 'verified');
  const cycleKey = sha256Json({ request, memory_hash: sha256Json(memory) });
  const cycleId = `cogcycle_${cycleKey.slice(0, 20)}`;
  const stateBeforeId = `cogstate_${sha256Json({ theme_id: request.theme_id, focus: request.focus, facts: request.verified_facts || [] }).slice(0, 20)}`;
  const correction = verified ? shortText(request.readback.learned_correction) : '';
  const learnedFact = verified ? shortText(request.readback.learned_fact) : '';
  const stateAfterId = `cogstate_${sha256Json({ before: stateBeforeId, action: selectedAction && selectedAction.action_id, verdict: request.readback.verdict, correction }).slice(0, 20)}`;
  const anchor = verified || pattern ? {
    anchor_id: pattern ? pattern.pattern_id : `anchor_${sha256Json({ cycle_id: cycleId, correction, learnedFact }).slice(0, 20)}`,
    status: verified ? 'verified' : request.readback.verdict === 'fail' ? 'falsified' : 'candidate',
    theme_id: request.theme_id,
    semantic_intent: uncertainty.semantic_intent,
    uncertainty_id: uncertainty.uncertainty_id,
    action_id: selectedAction && selectedAction.action_id || '',
    learned_fact: verified ? learnedFact : pattern.principle,
    correction,
    evidence_refs: unique(request.readback.evidence_refs),
    confidence: clamp(request.readback.confidence),
    created_at: createdAt,
    reuse_count: 0,
    ...(pattern ? { working_pattern: pattern, verification_receipt: verified ? request.readback.verification_receipt : null } : {}),
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
    anchors: [...(memory.anchors || []).filter(item => !anchor || item.anchor_id !== anchor.anchor_id).map((item) => anchors.some((used) => used.anchor_id === item.anchor_id) ? { ...item, reuse_count: (item.reuse_count || 0) + 1 } : item), ...(anchor ? [anchor] : [])]
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

module.exports = { assertRequest, buildCycle, emptyMemory, normalizedCost, rankActions, relevantAnchors, selectUncertainty,
  assertWorkingPattern, patternId, patternStatus, readPatternSource, sourceHash, verifyPatternInput };
