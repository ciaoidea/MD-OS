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

function gate(frameId) {
  ensureApfcCognitiveDirs();
  const frame = readFrame(frameId);
  const actionGate = buildActionGate(frame);
  frame.action_candidates = actionGate.candidates;
  frame.selected_action = actionGate.selected;
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

function runCycle(sourceArg) {
  const ingested = ingest(sourceArg);
  const bound = bind(ingested.frame_id);
  const work = workspace(ingested.frame_id);
  const gated = gate(ingested.frame_id);
  const predicted = predict(ingested.frame_id);
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
    status: status.status,
    outputs: {
      frame: rel(framePath(ingested.frame_id)),
      tokens: ingested.tokens_path,
      binding_graph: bound.output_json,
      workspace: work.output_json,
      action_gate: gated.output_json,
      predictions: predicted.output_json,
      concept_dynamics: predicted.concept_dynamics.output_json,
      apfc_cognitive_status: rel(STATUS_JSON),
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
    },
    contracts: {
      experience_token_schema: 'md-os/schemas/experience_token.schema.json',
      binding_graph_schema: 'md-os/schemas/binding_graph.schema.json',
      cortical_frame_schema: 'md-os/schemas/cortical_frame.schema.json',
      concept_dynamics_schema: 'md-os/schemas/concept_dynamics.schema.json',
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
  predict,
  runCycle,
  workspace,
  writeStatus,
};
