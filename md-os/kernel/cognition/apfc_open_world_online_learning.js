#!/usr/bin/env node
'use strict';

const path = require('node:path');
const {
  sha256Json,
  sha256Text,
} = require('../../os/lib/common');
const {
  MECHANISM_CARDS,
  assertEmbeddedHash,
  rankMechanismsFromPublicTask,
} = require('./apfc_open_world_meta_learning');

const ONLINE_LEARNING_PROTOCOL_ID = 'apfc_open_world_verified_online_learning_v1';
const ONLINE_CONDITIONS = Object.freeze([
  'memory_disabled',
  'flat_memory',
  'apfc_meta_composed',
]);
const FORBIDDEN_ORACLE_KEYS = new Set([
  'candidate_patch',
  'evaluator_log',
  'gold_patch',
  'gold_solution',
  'hidden_test_patch',
  'raw_patch',
  'reference_patch',
  'test_patch',
]);

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertNoOracleContent(value, pointer = '$') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoOracleContent(item, `${pointer}[${index}]`));
    return true;
  }
  if (!value || typeof value !== 'object') return true;
  for (const [key, nested] of Object.entries(value)) {
    if (FORBIDDEN_ORACLE_KEYS.has(key)) {
      throw new Error(`APFC_ONLINE_ORACLE_FIELD_FORBIDDEN:${pointer}.${key}`);
    }
    assertNoOracleContent(nested, `${pointer}.${key}`);
  }
  return true;
}

function extensionHistogram(files) {
  const counts = new Map();
  for (const file of files || []) {
    const extension = path.extname(String(file)) || '<none>';
    counts.set(extension, (counts.get(extension) || 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([extension, count]) => ({ extension, count }));
}

function assertCompleteTaskResults(taskResults, publicTask, memorySnapshot) {
  if (!Array.isArray(taskResults) || taskResults.length !== ONLINE_CONDITIONS.length) {
    throw new Error('APFC_ONLINE_COMPLETE_THREE_CONDITION_RESULTS_REQUIRED');
  }
  const byCondition = new Map(taskResults.map((row) => [row.condition, row]));
  if (byCondition.size !== ONLINE_CONDITIONS.length
    || ONLINE_CONDITIONS.some((condition) => !byCondition.has(condition))) {
    throw new Error('APFC_ONLINE_CONDITION_SET_MISMATCH');
  }
  for (const row of taskResults) {
    assertEmbeddedHash(row, 'receipt_hash', 'APFC_ONLINE_SOURCE_TRIAL_RECEIPT');
    if (row.task_id !== publicTask.task_id
      || row.public_task_hash !== publicTask.public_task_hash
      || row.memory_snapshot_hash !== memorySnapshot.snapshot_hash
      || row.hidden_artifacts_mounted_to_learner !== false) {
      throw new Error(`APFC_ONLINE_SOURCE_TRIAL_BINDING_MISMATCH:${row.condition}`);
    }
  }
  return [...byCondition.values()];
}

function outcomeClass(byCondition) {
  const baseline = byCondition.get('memory_disabled').verified_success === true;
  const flat = byCondition.get('flat_memory').verified_success === true;
  const apfc = byCondition.get('apfc_meta_composed').verified_success === true;
  const count = [baseline, flat, apfc].filter(Boolean).length;
  if (!count) return 'shared_failure';
  if (count === 3) return 'shared_success';
  if (apfc && !baseline && !flat) return 'apfc_only_success';
  if (apfc && !baseline) return 'positive_apfc_transfer';
  if (!apfc && (baseline || flat)) return 'control_success_apfc_failure';
  return 'mixed_success';
}

function summarizeTrial(row) {
  const protectedTestCount = Number(row.evaluator_pass_to_pass_test_count || 0);
  const protectedSurfaceClean = protectedTestCount === 0
    || row.evaluator_all_pass_to_pass_passed === true;
  return {
    condition: row.condition,
    verified_success: row.verified_success === true,
    safety_clean: Array.isArray(row.safety_violations) && row.safety_violations.length === 0,
    model_timed_out: row.model_timed_out === true,
    evaluator_timed_out: row.evaluator_timed_out === true,
    protected_test_count: protectedTestCount,
    protected_surface_clean: protectedSurfaceClean,
    production_changed_file_count: Array.isArray(row.production_changed_files)
      ? row.production_changed_files.length : 0,
    production_file_extensions: extensionHistogram(row.production_changed_files),
    candidate_patch_hash: row.candidate_patch_hash,
    candidate_patch_bytes: row.candidate_patch_bytes,
    receipt_hash: row.receipt_hash,
  };
}

function buildOnlineEpisode({
  experimentId,
  sequence,
  publicTask,
  taskResults,
  memorySnapshot,
  createdAt,
}) {
  assertOnlineMemorySnapshot(memorySnapshot);
  const rows = assertCompleteTaskResults(taskResults, publicTask, memorySnapshot);
  const byCondition = new Map(rows.map((row) => [row.condition, row]));
  const ranking = rankMechanismsFromPublicTask(publicTask);
  const trials = ONLINE_CONDITIONS.map((condition) => summarizeTrial(byCondition.get(condition)));
  const successful = trials.filter((trial) => trial.verified_success
    && trial.safety_clean
    && trial.protected_surface_clean);
  const episode = {
    schema_version: 1,
    episode_type: 'apfc_open_world_online_outcome',
    protocol_id: ONLINE_LEARNING_PROTOCOL_ID,
    experiment_id: experimentId,
    episode_id: `ep_apfc_online_${String(sequence).padStart(4, '0')}_${sha256Text(publicTask.task_id).slice(0, 12)}`,
    sequence,
    created_at: createdAt,
    task_id: publicTask.task_id,
    repository: publicTask.repository,
    public_task_hash: publicTask.public_task_hash,
    prior_memory_snapshot_hash: memorySnapshot.snapshot_hash,
    prior_episode_count: memorySnapshot.prior_episode_count,
    inferred_mechanisms: ranking.map((item) => item.mechanism_id),
    recognition_evidence: ranking.map((item) => ({
      mechanism_id: item.mechanism_id,
      rank: item.rank,
      score: item.score,
      causal_score: item.causal_score,
      confidence: item.confidence,
    })),
    trial_outcomes: trials,
    outcome_class: outcomeClass(byCondition),
    successful_conditions: successful.map((trial) => trial.condition),
    verified_success_any_condition: successful.length > 0,
    executable_learning_eligible: successful.length > 0,
    negative_evidence_only: successful.length === 0,
    learning_boundary: {
      literal_candidate_patch_retained: false,
      hidden_tests_retained: false,
      evaluator_logs_retained: false,
      gold_patch_retained: false,
      only_public_task_and_public_trial_receipts_used: true,
      hidden_artifacts_mounted_to_learner: false,
    },
  };
  assertNoOracleContent(episode);
  episode.episode_hash = sha256Json(episode);
  assertOnlineEpisode(episode);
  return episode;
}

function assertOnlineEpisode(episode) {
  assertEmbeddedHash(episode, 'episode_hash', 'APFC_ONLINE_EPISODE');
  assertNoOracleContent(episode);
  if (episode.episode_type !== 'apfc_open_world_online_outcome'
    || episode.protocol_id !== ONLINE_LEARNING_PROTOCOL_ID
    || !Number.isInteger(episode.sequence)
    || episode.sequence < 1
    || !Array.isArray(episode.trial_outcomes)
    || episode.trial_outcomes.length !== ONLINE_CONDITIONS.length
    || new Set(episode.trial_outcomes.map((row) => row.condition)).size !== ONLINE_CONDITIONS.length
    || episode.learning_boundary.only_public_task_and_public_trial_receipts_used !== true
    || episode.learning_boundary.hidden_artifacts_mounted_to_learner !== false) {
    throw new Error(`APFC_ONLINE_EPISODE_INVALID:${episode.episode_id || 'unknown'}`);
  }
  const successes = episode.trial_outcomes.filter((row) => row.verified_success
    && row.safety_clean
    && row.protected_surface_clean === true);
  if (episode.verified_success_any_condition !== (successes.length > 0)
    || episode.executable_learning_eligible !== (successes.length > 0)
    || episode.negative_evidence_only !== (successes.length === 0)) {
    throw new Error(`APFC_ONLINE_EPISODE_OUTCOME_MISMATCH:${episode.episode_id}`);
  }
  return true;
}

function rebuildTypedEdges(nodes) {
  const edges = [];
  for (const left of nodes) for (const right of nodes) {
    if (left.node_id === right.node_id || left.output_type !== right.input_type) continue;
    edges.push({
      edge_id: `edge_${sha256Json({ from: left.node_id, to: right.node_id }).slice(0, 16)}`,
      from: left.node_id,
      to: right.node_id,
      relation: 'composes_with',
      epistemic_status: right.node_type === 'online_candidate_mechanism_procedure'
        ? 'candidate_from_verified_outcome' : 'verified',
    });
  }
  return edges.sort((left, right) => left.edge_id.localeCompare(right.edge_id));
}

function buildOnlineMemoryState({ baseSkill, episodes }) {
  assertEmbeddedHash(baseSkill, 'skill_hash', 'APFC_ONLINE_BASE_SKILL');
  assertEmbeddedHash(baseSkill.apfc_meta_graph, 'graph_hash', 'APFC_ONLINE_BASE_GRAPH');
  const ordered = [...episodes].sort((left, right) => left.sequence - right.sequence);
  ordered.forEach(assertOnlineEpisode);
  for (let index = 0; index < ordered.length; index += 1) {
    if (ordered[index].sequence !== index + 1) throw new Error('APFC_ONLINE_EPISODE_SEQUENCE_GAP');
  }
  const graph = clone(baseSkill.apfc_meta_graph);
  delete graph.graph_hash;
  const nodesById = new Map(graph.nodes.map((node) => [node.node_id, node]));
  const cardByMechanism = new Map(MECHANISM_CARDS.map((card) => [card.mechanism_id, card]));
  for (const episode of ordered.filter((item) => item.executable_learning_eligible)) {
    for (const mechanism of episode.inferred_mechanisms) {
      const card = cardByMechanism.get(mechanism);
      if (!card) continue;
      const nodeId = `mechanism_${mechanism}`;
      let node = nodesById.get(nodeId);
      if (!node) {
        node = {
          node_id: nodeId,
          node_type: 'online_candidate_mechanism_procedure',
          input_type: 'hypothesis.ranked',
          output_type: 'hypothesis.ranked',
          procedure: card.procedure,
          title: card.title,
          source_episode_ids: [],
          online_success_count: 0,
          epistemic_status: 'candidate_from_verified_outcome',
        };
        graph.nodes.push(node);
        nodesById.set(nodeId, node);
      }
      node.source_episode_ids = [...new Set([...(node.source_episode_ids || []), episode.episode_id])].sort();
      node.online_success_count = (node.online_success_count || 0) + 1;
    }
  }
  graph.nodes.sort((left, right) => left.node_id.localeCompare(right.node_id));
  graph.supported_mechanisms = graph.nodes
    .filter((node) => node.node_id.startsWith('mechanism_'))
    .map((node) => node.node_id.slice('mechanism_'.length))
    .sort();
  graph.edges = rebuildTypedEdges(graph.nodes);
  graph.graph_hash = sha256Json(graph);
  const state = {
    schema_version: 1,
    memory_type: 'apfc_open_world_online_memory',
    protocol_id: ONLINE_LEARNING_PROTOCOL_ID,
    base_candidate_skill_id: baseSkill.skill_id,
    base_candidate_skill_hash: baseSkill.skill_hash,
    episode_ids: ordered.map((episode) => episode.episode_id),
    positive_episode_ids: ordered.filter((episode) => episode.executable_learning_eligible).map((episode) => episode.episode_id),
    negative_episode_ids: ordered.filter((episode) => episode.negative_evidence_only).map((episode) => episode.episode_id),
    graph,
    negative_evidence: ordered.filter((episode) => episode.negative_evidence_only).map((episode) => ({
      episode_id: episode.episode_id,
      inferred_mechanisms: episode.inferred_mechanisms,
      outcome_class: episode.outcome_class,
    })),
    promotion_policy: 'online nodes remain candidates until the preregistered 30-task causal eval passes every gate',
  };
  state.memory_hash = sha256Json(state);
  assertOnlineMemoryState(state);
  return state;
}

function assertOnlineMemoryState(state) {
  assertEmbeddedHash(state, 'memory_hash', 'APFC_ONLINE_MEMORY');
  assertEmbeddedHash(state.graph, 'graph_hash', 'APFC_ONLINE_MEMORY_GRAPH');
  assertNoOracleContent(state);
  if (state.memory_type !== 'apfc_open_world_online_memory'
    || state.protocol_id !== ONLINE_LEARNING_PROTOCOL_ID
    || state.episode_ids.length !== state.positive_episode_ids.length + state.negative_episode_ids.length) {
    throw new Error('APFC_ONLINE_MEMORY_INVALID');
  }
  const positive = new Set(state.positive_episode_ids);
  for (const node of state.graph.nodes) {
    if (node.node_type !== 'online_candidate_mechanism_procedure') continue;
    if (!node.source_episode_ids.length || node.source_episode_ids.some((episodeId) => !positive.has(episodeId))) {
      throw new Error(`APFC_ONLINE_UNVERIFIED_EXECUTABLE_SOURCE:${node.node_id}`);
    }
  }
  return true;
}

function rawEpisodeSummary(episode) {
  return {
    episode_id: episode.episode_id,
    sequence: episode.sequence,
    task_family: episode.inferred_mechanisms,
    outcome_class: episode.outcome_class,
    successful_conditions: episode.successful_conditions,
    verified_success_any_condition: episode.verified_success_any_condition,
    negative_evidence_only: episode.negative_evidence_only,
    successful_patch_shapes: episode.trial_outcomes
      .filter((trial) => trial.verified_success)
      .map((trial) => ({
        condition: trial.condition,
        production_changed_file_count: trial.production_changed_file_count,
        production_file_extensions: trial.production_file_extensions,
        candidate_patch_bytes: trial.candidate_patch_bytes,
      })),
    episode_hash: episode.episode_hash,
  };
}

function buildOnlineMemorySnapshot({
  experimentId,
  taskSequence,
  baseSkill,
  episodes,
  publicTask,
  createdAt,
  retrievalLimit = 8,
}) {
  const state = buildOnlineMemoryState({ baseSkill, episodes });
  const taskMechanisms = rankMechanismsFromPublicTask(publicTask).map((item) => item.mechanism_id);
  const taskSet = new Set(taskMechanisms);
  const rankedEpisodes = [...episodes].map((episode) => ({
    episode,
    overlap: episode.inferred_mechanisms.filter((mechanism) => taskSet.has(mechanism)).length,
  })).sort((left, right) => right.overlap - left.overlap
    || Number(right.episode.executable_learning_eligible) - Number(left.episode.executable_learning_eligible)
    || right.episode.sequence - left.episode.sequence);
  const retrieved = rankedEpisodes.slice(0, Math.max(0, retrievalLimit)).map((record) => record.episode);
  const flatProcedureCards = state.graph.nodes.map((node) => ({
    procedure_id: node.node_id,
    input_type: node.input_type,
    output_type: node.output_type,
    procedure: node.procedure,
    source_episode_ids: node.source_episode_ids,
  })).sort((left, right) => left.procedure_id.localeCompare(right.procedure_id));
  const snapshot = {
    schema_version: 1,
    snapshot_type: 'apfc_open_world_pre_task_memory',
    protocol_id: ONLINE_LEARNING_PROTOCOL_ID,
    experiment_id: experimentId,
    task_id: publicTask.task_id,
    task_sequence: taskSequence,
    created_at: createdAt,
    frozen_before_all_task_conditions: true,
    base_candidate_skill_hash: baseSkill.skill_hash,
    prior_memory_hash: state.memory_hash,
    prior_episode_count: episodes.length,
    prior_episode_ids: episodes.map((episode) => episode.episode_id),
    current_task_inferred_mechanisms: taskMechanisms,
    retrieved_episode_ids: retrieved.map((episode) => episode.episode_id),
    raw_episode_summaries: retrieved.map(rawEpisodeSummary),
    flat_procedure_cards: flatProcedureCards,
    apfc_graph: state.graph,
    fairness_policy: 'flat and APFC receive the same retrieved episode summaries and procedure-card content; only graph relations, recognition, and path compilation differ',
    memory_disabled_receives_content: false,
    hidden_oracle_content_present: false,
  };
  assertNoOracleContent(snapshot);
  snapshot.snapshot_hash = sha256Json(snapshot);
  assertOnlineMemorySnapshot(snapshot);
  return snapshot;
}

function assertOnlineMemorySnapshot(snapshot) {
  assertEmbeddedHash(snapshot, 'snapshot_hash', 'APFC_ONLINE_MEMORY_SNAPSHOT');
  assertEmbeddedHash(snapshot.apfc_graph, 'graph_hash', 'APFC_ONLINE_MEMORY_SNAPSHOT_GRAPH');
  assertNoOracleContent(snapshot);
  if (snapshot.snapshot_type !== 'apfc_open_world_pre_task_memory'
    || snapshot.protocol_id !== ONLINE_LEARNING_PROTOCOL_ID
    || snapshot.frozen_before_all_task_conditions !== true
    || snapshot.memory_disabled_receives_content !== false
    || snapshot.hidden_oracle_content_present !== false
    || snapshot.prior_episode_count !== snapshot.prior_episode_ids.length) {
    throw new Error(`APFC_ONLINE_MEMORY_SNAPSHOT_INVALID:${snapshot.task_id || 'unknown'}`);
  }
  return true;
}

module.exports = {
  FORBIDDEN_ORACLE_KEYS,
  ONLINE_CONDITIONS,
  ONLINE_LEARNING_PROTOCOL_ID,
  assertNoOracleContent,
  assertOnlineEpisode,
  assertOnlineMemorySnapshot,
  assertOnlineMemoryState,
  buildOnlineEpisode,
  buildOnlineMemorySnapshot,
  buildOnlineMemoryState,
  rawEpisodeSummary,
};
