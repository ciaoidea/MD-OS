#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { encodeTextSource } = require('../apfc/encoders/text_encoder');
const { buildBindingGraph } = require('../apfc/binding/cross_modal_binder');
const { buildGlobalWorkspace } = require('../apfc/workspace/global_workspace');
const { buildActionGate } = require('../apfc/action/action_gate');
const { buildConceptDynamics } = require('../apfc/prediction/concept_dynamics_model');
const { buildPredictions } = require('../apfc/prediction/predictive_loop');
const { buildCognitiveFrameGovernanceTensor } = require('../kernel/cognition/apfc_cognitive_unity_stage');
const {
  closeCausalUnityTransition,
  prepareCausalUnityState,
  probeCausalUnityDependency,
  verifyCausalUnityState,
} = require('../kernel/cognition/apfc_causal_unity');

const APFC_COGNITIVE_DIR = path.join(MDOS_ROOT, 'ops', 'apfc', 'cognitive');
const DIRS = {
  inbox: path.join(APFC_COGNITIVE_DIR, 'inbox'),
  frames: path.join(APFC_COGNITIVE_DIR, 'frames'),
  tokens: path.join(APFC_COGNITIVE_DIR, 'tokens'),
  bindings: path.join(APFC_COGNITIVE_DIR, 'bindings'),
  workspace: path.join(APFC_COGNITIVE_DIR, 'workspace'),
  predictions: path.join(APFC_COGNITIVE_DIR, 'predictions'),
  dynamics: path.join(APFC_COGNITIVE_DIR, 'dynamics'),
  actions: path.join(APFC_COGNITIVE_DIR, 'action_candidates'),
  episodes: path.join(APFC_COGNITIVE_DIR, 'episodes'),
  consolidation: path.join(APFC_COGNITIVE_DIR, 'consolidation'),
  governance: path.join(APFC_COGNITIVE_DIR, 'turn_governance'),
  causalUnity: path.join(APFC_COGNITIVE_DIR, 'causal_unity'),
  causalProbes: path.join(APFC_COGNITIVE_DIR, 'causal_probes'),
  causalTransitions: path.join(APFC_COGNITIVE_DIR, 'causal_transitions'),
};
const LATEST_FRAME_JSON = path.join(APFC_COGNITIVE_DIR, 'latest_frame.json');
const STATUS_JSON = path.join(APFC_COGNITIVE_DIR, 'apfc_cognitive_status.json');
const STATUS_MD = path.join(APFC_COGNITIVE_DIR, 'apfc_cognitive_status.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function ensureApfcCognitiveDirs() {
  ensureDir(APFC_COGNITIVE_DIR);
  for (const dir of Object.values(DIRS)) ensureDir(dir);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  try {
    return readJson(filePath);
  } catch (_) {
    return null;
  }
}

function countJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return 0;
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .length;
}

function safeSegment(value, fallback = 'source') {
  return shortText(value || fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || fallback;
}

function resolveSourcePath(sourceArg) {
  const text = shortText(sourceArg);
  if (!text) throw new Error('APFC_COGNITIVE_SOURCE_REQUIRED');
  const direct = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, text));
  if (fs.existsSync(direct)) return direct;
  if (text.startsWith('examples/')) {
    const mapped = assertInsideWorkspace(path.join(MDOS_ROOT, text));
    if (fs.existsSync(mapped)) return mapped;
  }
  throw new Error(`APFC_COGNITIVE_SOURCE_NOT_FOUND: ${text}`);
}

function normalizeSource(raw, sourcePath = null) {
  const text = shortText(raw.text || raw.content || raw.prompt || '');
  if (!text) throw new Error('APFC_COGNITIVE_SOURCE_TEXT_REQUIRED');
  const sourceId = safeSegment(raw.source_id || path.basename(sourcePath || '', path.extname(sourcePath || '')) || `input_${sha256Text(text).slice(0, 12)}`, 'input');
  return {
    schema_version: 1,
    source_id: sourceId,
    modality: shortText(raw.modality || 'text') || 'text',
    text,
    trust: shortText(raw.trust || 'direct_user_input') || 'direct_user_input',
    observed_at: shortText(raw.observed_at || raw.created_at || nowIso()),
    path: sourcePath ? rel(sourcePath) : null,
    metadata: raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata) ? raw.metadata : {},
  };
}

function loadSource(sourceArg) {
  const sourcePath = resolveSourcePath(sourceArg);
  const payload = readJson(sourcePath);
  return normalizeSource(payload, sourcePath);
}

function frameIdForSource(source) {
  return `frame_${source.source_id}_${sha256Json({
    source_id: source.source_id,
    modality: source.modality,
    text: source.text,
  }).slice(0, 12)}`;
}

function emptyBindingGraph(frameId) {
  return {
    schema_version: 1,
    graph_id: `binding_${frameId}`,
    frame_id: frameId,
    source_hash: sha256Json({ frame_id: frameId, empty: true }),
    nodes: [],
    edges: [],
    metrics: {
      node_count: 0,
      edge_count: 0,
      density: 0,
      connected_component_count: 0,
      isolated_node_count: 0,
    },
    conflicts: [],
  };
}

function aggregateSalience(tokens) {
  const base = {
    novelty: 0,
    urgency: 0,
    risk: 0,
    user_relevance: 0,
    operational_value: 0,
    uncertainty: 0,
  };
  if (!tokens.length) return base;
  for (const token of tokens) {
    for (const key of Object.keys(base)) {
      base[key] = Math.max(base[key], Number(token.salience && token.salience[key] || 0));
    }
  }
  return base;
}

function buildFrame(source, tokens) {
  const frameId = frameIdForSource(source);
  return {
    schema_version: 1,
    frame_id: frameId,
    created_at: source.observed_at,
    sources: [{
      source_id: source.source_id,
      modality: source.modality,
      path: source.path,
      trust: source.trust,
      observed_at: source.observed_at,
    }],
    experience_tokens: tokens,
    binding_graph: emptyBindingGraph(frameId),
    workspace: {
      active_tokens: [],
      active_concepts: [],
      attention_budget: 1,
      selection_reason: 'not_selected_yet',
    },
    salience: aggregateSalience(tokens),
    predictions: [],
    concept_dynamics: null,
    action_candidates: [],
    selected_action: null,
    causal_unity_state: null,
    selected_action_authorization: null,
    causal_unity_transition: null,
    memory_candidates: [],
    verbalization_candidates: [],
  };
}

function framePath(frameId) {
  return path.join(DIRS.frames, `${safeSegment(frameId, 'frame')}.json`);
}

function readFrame(frameId) {
  const selected = frameId || latestFrameId();
  if (!selected) throw new Error('APFC_COGNITIVE_FRAME_NOT_FOUND: latest');
  const filePath = framePath(selected);
  if (!fs.existsSync(filePath)) throw new Error(`APFC_COGNITIVE_FRAME_NOT_FOUND: ${selected}`);
  return readJson(filePath);
}

function latestFrameId() {
  const latest = readJsonSafe(LATEST_FRAME_JSON);
  return latest && latest.frame_id || null;
}

function writeLatestFrame(frame) {
  atomicWriteJson(LATEST_FRAME_JSON, {
    schema_version: 1,
    updated_at: nowIso(),
    frame_id: frame.frame_id,
    frame_path: rel(framePath(frame.frame_id)),
  });
}

function writeFrame(frame) {
  atomicWriteJson(framePath(frame.frame_id), frame);
  writeLatestFrame(frame);
}

function ingest(sourceArg) {
  ensureApfcCognitiveDirs();
  const source = loadSource(sourceArg);
  const encoded = encodeTextSource(source);
  const frame = buildFrame(source, encoded.tokens);
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_ingest',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.inbox, `${source.source_id}.json`), source);
    atomicWriteJson(path.join(DIRS.tokens, `${frame.frame_id}.json`), encoded);
    writeFrame(frame);
  });
  appendJournal({
    event: 'apfc_cognitive_frame_ingested',
    frame_id: frame.frame_id,
    source_id: source.source_id,
    token_count: encoded.token_count,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_ingest',
    frame_id: frame.frame_id,
    source_id: source.source_id,
    token_count: encoded.token_count,
    frame_path: rel(framePath(frame.frame_id)),
    tokens_path: rel(path.join(DIRS.tokens, `${frame.frame_id}.json`)),
  };
}

function bind(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  frame.binding_graph = buildBindingGraph(frame);
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_bind',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.bindings, `${frame.frame_id}.json`), frame.binding_graph);
    atomicWriteJson(path.join(DIRS.bindings, 'latest_binding_graph.json'), frame.binding_graph);
    writeFrame(frame);
  });
  appendJournal({
    event: 'apfc_cognitive_frame_bound',
    frame_id: frame.frame_id,
    node_count: frame.binding_graph.metrics.node_count,
    edge_count: frame.binding_graph.metrics.edge_count,
    connected_component_count: frame.binding_graph.metrics.connected_component_count,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_bind',
    frame_id: frame.frame_id,
    graph_id: frame.binding_graph.graph_id,
    node_count: frame.binding_graph.metrics.node_count,
    edge_count: frame.binding_graph.metrics.edge_count,
    connected_component_count: frame.binding_graph.metrics.connected_component_count,
    isolated_node_count: frame.binding_graph.metrics.isolated_node_count,
    output_json: rel(path.join(DIRS.bindings, `${frame.frame_id}.json`)),
  };
}

function workspace(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  frame.workspace = buildGlobalWorkspace(frame);
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_workspace',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.workspace, `${frame.frame_id}.json`), {
      schema_version: 1,
      frame_id: frame.frame_id,
      workspace: frame.workspace,
    });
    atomicWriteJson(path.join(DIRS.workspace, 'current_workspace.json'), {
      schema_version: 1,
      frame_id: frame.frame_id,
      workspace: frame.workspace,
    });
    writeFrame(frame);
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_workspace',
    frame_id: frame.frame_id,
    active_token_count: frame.workspace.active_tokens.length,
    active_concepts: frame.workspace.active_concepts,
    output_json: rel(path.join(DIRS.workspace, `${frame.frame_id}.json`)),
  };
}

function memoryCandidates(frame) {
  return frame.experience_tokens
    .filter((token) => token.token_type === 'entity' && token.salience && token.salience.operational_value >= 0.8)
    .map((token) => ({
      candidate_id: `memory_${token.canonical_id.replace(/[^a-zA-Z0-9_-]+/g, '_')}`,
      token_id: token.token_id,
      canonical_id: token.canonical_id,
      memory_type: 'semantic',
      reason: 'high_operational_value_entity',
      confidence: token.confidence,
    }));
}

function verbalizationCandidates(frame, gate) {
  return [{
    candidate_id: `verbalize_${frame.frame_id}`,
    frame_id: frame.frame_id,
    target_action: gate.selected && gate.selected.action_type || 'answer',
    summary: `Frame ${frame.frame_id} has ${frame.experience_tokens.length} experience tokens, ${frame.binding_graph.metrics.node_count} graph nodes, and ${frame.workspace.active_tokens.length} active workspace tokens.`,
  }];
}

function latestCausalTransition() {
  return readJsonSafe(path.join(DIRS.causalTransitions, 'latest_transition.json'));
}

function prepareCausalUnity(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  frame.memory_candidates = memoryCandidates(frame);
  const provisionalGate = buildActionGate(frame);
  const intentTokens = frame.experience_tokens.filter((token) => (
    String(token.canonical_id || '').startsWith('intent:')
  ));
  const inputHash = sha256Json({
    frame_id: frame.frame_id,
    sources: frame.sources,
    experience_tokens: frame.experience_tokens,
  });
  const previous = latestCausalTransition();
  const previousTransitionHash = previous && /^[a-f0-9]{64}$/.test(previous.transition_hash || '')
    ? previous.transition_hash
    : null;
  const state = prepareCausalUnityState({
    schema_version: 1,
    frame_id: frame.frame_id,
    input_hash: inputHash,
    authority_hash: sha256Json({ boundary: 'md-os', runtime: 'apfc_cognitive_runtime' }),
    identity_hash: sha256Text('MD-OS Artificial Prefrontal Cortex v5.0'),
    world_observation_hash: sha256Json({ sources: frame.sources, tokens: frame.experience_tokens }),
    world_observation_count: Math.max(1, frame.sources.length),
    world_observation_verifier_backed: false,
    intent_hash: inputHash,
    intent_count: Math.max(1, intentTokens.length),
    intent_verifier_backed: true,
    goal_hash: intentTokens.length ? sha256Json(intentTokens) : null,
    goal_count: intentTokens.length,
    memory_hash: sha256Json(frame.memory_candidates),
    memory_count: frame.memory_candidates.length,
    memory_verifier_backed: false,
    frame_hash: sha256Json({
      frame_id: frame.frame_id,
      binding_graph: frame.binding_graph,
      workspace: frame.workspace,
    }),
    prediction_contract_hash: sha256Json({
      expected: 'selected action produces bounded prediction and readback',
      verifier: 'apfc_causal_unity_transition_v1',
    }),
    prediction_count: 1,
    action_policy_hash: sha256Json({
      policy: 'apfc_action_gate_v2',
      candidates: provisionalGate.candidates.map((item) => ({
        action_type: item.action_type,
        capability_id: item.capability_id,
        requires_policy: item.requires_policy,
        requires_readback: item.requires_readback,
      })),
    }),
    decision_basis_hash: sha256Json(provisionalGate.candidates),
    previous_transition_hash: previousTransitionHash,
  });
  if (!verifyCausalUnityState(state)) throw new Error('APFC_CAUSAL_UNITY_STATE_REJECTED');
  const probe = probeCausalUnityDependency({
    schema_version: 1,
    state,
    action_hash: sha256Json({ frame_id: frame.frame_id, action_kind: 'cognitive_selection' }),
  });
  if (probe.status !== 'verified') throw new Error('APFC_CAUSAL_UNITY_DEPENDENCY_PROBE_FAILED');
  frame.causal_unity_state = state;
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_causal_unity',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.causalUnity, `${frame.frame_id}.json`), state);
    atomicWriteJson(path.join(DIRS.causalUnity, 'latest_state.json'), state);
    atomicWriteJson(path.join(DIRS.causalProbes, `${frame.frame_id}.json`), probe);
    atomicWriteJson(path.join(DIRS.causalProbes, 'latest_probe.json'), probe);
    writeFrame(frame);
  });
  appendJournal({
    event: 'apfc_causal_unity_state_prepared',
    frame_id: frame.frame_id,
    state_hash: state.state_hash,
    dependency_probe_status: probe.status,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_causal_unity',
    frame_id: frame.frame_id,
    state_id: state.state_id,
    state_hash: state.state_hash,
    status: state.status,
    dependency_probe_status: probe.status,
    output_json: rel(path.join(DIRS.causalUnity, `${frame.frame_id}.json`)),
    probe_json: rel(path.join(DIRS.causalProbes, `${frame.frame_id}.json`)),
  };
}

function gate(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  const actionGate = buildActionGate(frame, {
    causal_unity_state: frame.causal_unity_state,
    require_causal_unity: true,
  });
  frame.action_candidates = actionGate.candidates;
  frame.selected_action = actionGate.selected;
  frame.selected_action_authorization = actionGate.causal_consumption.authorization;
  frame.memory_candidates = memoryCandidates(frame);
  frame.verbalization_candidates = verbalizationCandidates(frame, actionGate);
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_gate',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.actions, `${frame.frame_id}.json`), actionGate);
    atomicWriteJson(path.join(DIRS.actions, 'latest_action_gate.json'), actionGate);
    writeFrame(frame);
  });
  appendJournal({
    event: 'apfc_cognitive_action_gate_recorded',
    frame_id: frame.frame_id,
    action_candidate_count: frame.action_candidates.length,
    selected_action: frame.selected_action && frame.selected_action.action_type,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_gate',
    frame_id: frame.frame_id,
    action_candidate_count: frame.action_candidates.length,
    selected_action: frame.selected_action,
    memory_candidate_count: frame.memory_candidates.length,
    output_json: rel(path.join(DIRS.actions, `${frame.frame_id}.json`)),
  };
}

function predict(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  const actionGate = {
    selected: frame.selected_action,
    candidates: frame.action_candidates,
  };
  frame.concept_dynamics = buildConceptDynamics(frame);
  frame.predictions = buildPredictions(frame, actionGate);
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_predict',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.predictions, `${frame.frame_id}.json`), {
      schema_version: 1,
      frame_id: frame.frame_id,
      predictions: frame.predictions,
    });
    atomicWriteJson(path.join(DIRS.predictions, 'latest_prediction.json'), {
      schema_version: 1,
      frame_id: frame.frame_id,
      predictions: frame.predictions,
    });
    atomicWriteJson(path.join(DIRS.dynamics, `${frame.frame_id}.json`), frame.concept_dynamics);
    atomicWriteJson(path.join(DIRS.dynamics, 'latest_dynamics.json'), frame.concept_dynamics);
    writeFrame(frame);
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_predict',
    frame_id: frame.frame_id,
    prediction_count: frame.predictions.length,
    error_signal_count: frame.predictions.filter((item) => item.error_signal && item.error_signal.type !== 'none').length,
    concept_dynamics: {
      transition_count: frame.concept_dynamics.transition_count,
      loss: frame.concept_dynamics.loss,
      output_json: rel(path.join(DIRS.dynamics, `${frame.frame_id}.json`)),
    },
    output_json: rel(path.join(DIRS.predictions, `${frame.frame_id}.json`)),
  };
}

function closeCausalUnity(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  const state = frame.causal_unity_state;
  const authorization = frame.selected_action_authorization;
  if (!verifyCausalUnityState(state) || !authorization) {
    throw new Error('APFC_CAUSAL_UNITY_CLOSURE_STATE_REQUIRED');
  }
  const observedSelection = {
    action_id: authorization.action_id,
    action_kind: authorization.action_kind,
    action_hash: authorization.action_hash,
    side_effecting: false,
    status: 'completed',
    exit_code: 0,
  };
  const transition = closeCausalUnityTransition({
    schema_version: 1,
    state,
    frame_id: frame.frame_id,
    input_hash: state.input_hash,
    output_hash: sha256Json({
      selected_action: frame.selected_action,
      predictions: frame.predictions,
      verbalization_candidates: frame.verbalization_candidates,
    }),
    action_manifest_hash: sha256Json([observedSelection]),
    evidence_manifest_hash: sha256Json({
      predictions: frame.predictions,
      concept_dynamics: frame.concept_dynamics,
    }),
    authorizations: [authorization],
    observed_actions: [observedSelection],
    verifier_verdict: 'unknown',
    epistemic_verification: null,
  });
  if (transition.status !== 'closed') throw new Error('APFC_CAUSAL_UNITY_TRANSITION_REJECTED');
  frame.causal_unity_transition = transition;
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_causal_unity_close',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.causalTransitions, `${frame.frame_id}.json`), transition);
    atomicWriteJson(path.join(DIRS.causalTransitions, 'latest_transition.json'), transition);
    writeFrame(frame);
  });
  appendJournal({
    event: 'apfc_causal_unity_transition_closed',
    frame_id: frame.frame_id,
    transition_hash: transition.transition_hash,
    epistemic_status: transition.epistemic_status,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_causal_unity_close',
    frame_id: frame.frame_id,
    transition_id: transition.transition_id,
    transition_hash: transition.transition_hash,
    status: transition.status,
    epistemic_status: transition.epistemic_status,
    output_json: rel(path.join(DIRS.causalTransitions, `${frame.frame_id}.json`)),
  };
}

function integrateTurnGovernance(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  const artifact = buildCognitiveFrameGovernanceTensor(frame);
  if (artifact.status !== 'verified') throw new Error('APFC_COGNITIVE_TURN_GOVERNANCE_REJECTED');
  withFileLock('apfc_cognitive_runtime', {
    context: 'apfc_cognitive_turn_governance',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(path.join(DIRS.governance, `${frame.frame_id}.json`), artifact);
    atomicWriteJson(path.join(DIRS.governance, 'latest_turn_governance.json'), artifact);
  });
  appendJournal({
    event: 'apfc_cognitive_turn_governance_recorded',
    frame_id: frame.frame_id,
    tensor_id: artifact.tensor_id,
    artifact_role: artifact.artifact_role,
    status: artifact.status,
    cognitive_outcome_status: artifact.cognitive_outcome_status,
    artifact_hash: artifact.artifact_hash,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_turn_governance',
    frame_id: frame.frame_id,
    tensor_id: artifact.tensor_id,
    artifact_role: artifact.artifact_role,
    status: artifact.status,
    cognitive_outcome_status: artifact.cognitive_outcome_status,
    artifact_hash: artifact.artifact_hash,
    output_json: rel(path.join(DIRS.governance, `${frame.frame_id}.json`)),
  };
}

function runCycle(sourceArg) {
  const ingested = ingest(sourceArg);
  const bound = bind(ingested.frame_id);
  const work = workspace(ingested.frame_id);
  const causal = prepareCausalUnity(ingested.frame_id);
  const gated = gate(ingested.frame_id);
  const predicted = predict(ingested.frame_id);
  const closure = closeCausalUnity(ingested.frame_id);
  const governance = integrateTurnGovernance(ingested.frame_id);
  const status = writeStatus();
  appendJournal({
    event: 'apfc_cognitive_cycle_completed',
    frame_id: ingested.frame_id,
    token_count: ingested.token_count,
    graph_node_count: bound.node_count,
    graph_edge_count: bound.edge_count,
    active_workspace_items: work.active_token_count,
    action_candidate_count: gated.action_candidate_count,
    prediction_count: predicted.prediction_count,
    causal_unity_state_status: causal.status,
    causal_unity_transition_status: closure.status,
    turn_governance_status: governance.status,
  });
  return {
    ok: true,
    mode: 'apfc_cognitive_run_cycle',
    frame_id: ingested.frame_id,
    source_id: ingested.source_id,
    experience_token_count: ingested.token_count,
    binding_graph: {
      node_count: bound.node_count,
      edge_count: bound.edge_count,
      connected_component_count: bound.connected_component_count,
      isolated_node_count: bound.isolated_node_count,
    },
    workspace: {
      active_token_count: work.active_token_count,
      active_concepts: work.active_concepts,
    },
    action_candidate_count: gated.action_candidate_count,
    selected_action: gated.selected_action,
    memory_candidate_count: gated.memory_candidate_count,
    prediction_count: predicted.prediction_count,
    error_signal_count: predicted.error_signal_count,
    concept_dynamics: predicted.concept_dynamics,
    causal_unity: {
      state_id: causal.state_id,
      state_hash: causal.state_hash,
      state_status: causal.status,
      dependency_probe_status: causal.dependency_probe_status,
      transition_hash: closure.transition_hash,
      transition_status: closure.status,
      epistemic_status: closure.epistemic_status,
    },
    turn_governance: {
      tensor_id: governance.tensor_id,
      artifact_role: governance.artifact_role,
      status: governance.status,
      cognitive_outcome_status: governance.cognitive_outcome_status,
      artifact_hash: governance.artifact_hash,
    },
    status: status.status,
    outputs: {
      frame: rel(framePath(ingested.frame_id)),
      tokens: ingested.tokens_path,
      binding_graph: bound.output_json,
      workspace: work.output_json,
      causal_unity_state: causal.output_json,
      causal_unity_probe: causal.probe_json,
      causal_unity_transition: closure.output_json,
      action_gate: gated.output_json,
      predictions: predicted.output_json,
      concept_dynamics: predicted.concept_dynamics.output_json,
      apfc_cognitive_status: rel(STATUS_JSON),
      turn_governance: governance.output_json,
    },
  };
}

function buildStatus() {
  ensureApfcCognitiveDirs();
  const latest = readJsonSafe(LATEST_FRAME_JSON);
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status: 'ok',
    runtime: 'apfc_cognitive_runtime',
    bmct_role: 'apfc_cognitive_multimodal_binding_layer',
    latest_frame_id: latest && latest.frame_id || null,
    counts: {
      inbox_sources: countJsonFiles(DIRS.inbox),
      frames: countJsonFiles(DIRS.frames),
      token_sets: countJsonFiles(DIRS.tokens),
      binding_graphs: countJsonFiles(DIRS.bindings),
      workspaces: countJsonFiles(DIRS.workspace),
      action_gates: countJsonFiles(DIRS.actions),
      predictions: countJsonFiles(DIRS.predictions),
      dynamics: countJsonFiles(DIRS.dynamics),
      episodes: countJsonFiles(DIRS.episodes),
      consolidations: countJsonFiles(DIRS.consolidation),
      turn_governance_tensors: countJsonFiles(DIRS.governance),
      causal_unity_states: countJsonFiles(DIRS.causalUnity),
      causal_unity_probes: countJsonFiles(DIRS.causalProbes),
      causal_unity_transitions: countJsonFiles(DIRS.causalTransitions),
    },
    contracts: {
      experience_token_schema: 'md-os/schemas/experience_token.schema.json',
      binding_graph_schema: 'md-os/schemas/binding_graph.schema.json',
      cortical_frame_schema: 'md-os/schemas/cortical_frame.schema.json',
      concept_dynamics_schema: 'md-os/schemas/concept_dynamics.schema.json',
      turn_governance_tensor_schema: 'md-os/schemas/apfc_operational_unity_tensor.schema.json',
      causal_unity_state_schema: 'md-os/schemas/apfc_causal_unity_state.schema.json',
      causal_action_authorization_schema: 'md-os/schemas/apfc_causal_action_authorization.schema.json',
      causal_unity_transition_schema: 'md-os/schemas/apfc_causal_unity_transition.schema.json',
      causal_dependency_probe_schema: 'md-os/schemas/apfc_causal_dependency_probe.schema.json',
    },
  };
}

function statusMarkdown(status) {
  return [
    '# APFC Cognitive Status',
    '',
    `Updated at: \`${status.updated_at}\``,
    '',
    `Status: \`${status.status}\``,
    '',
    `Runtime: \`${status.runtime}\``,
    '',
    `BMCT role: \`${status.bmct_role}\``,
    '',
    `Latest frame: \`${status.latest_frame_id || 'none'}\``,
    '',
    '## Counts',
    '',
    ...Object.entries(status.counts).map(([key, value]) => `- \`${key}\`: \`${value}\``),
    '',
    '## Contracts',
    '',
    ...Object.entries(status.contracts).map(([key, value]) => `- \`${key}\`: \`${value}\``),
    '',
  ].join('\n');
}

function writeStatus() {
  const status = buildStatus();
  withFileLock('apfc_cognitive_status', {
    context: 'apfc_cognitive_status',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(STATUS_JSON, status);
    atomicWriteText(STATUS_MD, statusMarkdown(status));
  });
  appendJournal({
    event: 'apfc_cognitive_status_rebuilt',
    status: status.status,
    latest_frame_id: status.latest_frame_id,
    frame_count: status.counts.frames,
  });
  return status;
}

function usage() {
  throw new Error('USAGE: apfc_cognitive_runtime <ingest|bind|workspace|gate|predict|run-cycle|status> [source_or_frame]');
}

function main() {
  const [command, arg] = process.argv.slice(2);
  if (!command) usage();
  if (command === 'ingest') {
    if (!arg) usage();
    printJson(ingest(arg));
    return;
  }
  if (command === 'bind') {
    printJson(bind(arg));
    return;
  }
  if (command === 'workspace') {
    printJson(workspace(arg));
    return;
  }
  if (command === 'gate') {
    printJson(gate(arg));
    return;
  }
  if (command === 'predict') {
    printJson(predict(arg));
    return;
  }
  if (command === 'run-cycle' || command === 'cycle') {
    if (!arg) usage();
    printJson(runCycle(arg));
    return;
  }
  if (command === 'status') {
    const status = writeStatus();
    printJson({
      ok: true,
      mode: 'apfc_cognitive_status',
      status: status.status,
      latest_frame_id: status.latest_frame_id,
      counts: status.counts,
      output_json: rel(STATUS_JSON),
      output_md: rel(STATUS_MD),
    });
    return;
  }
  usage();
}

if (require.main === module) {
  main();
}

module.exports = {
  APFC_COGNITIVE_DIR,
  buildStatus,
  bind,
  gate,
  ingest,
  integrateTurnGovernance,
  predict,
  runCycle,
  workspace,
  writeStatus,
};
