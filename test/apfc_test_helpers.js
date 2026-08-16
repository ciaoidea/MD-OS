'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { sha256Json } = require('../md-os/os/lib/common');
const { assertApfcGraph, makeNode } = require('../md-os/apfc/executive/graph_projector');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function makeWorkspace(prefix = 'mdos-apfc-') {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const mdos = path.join(workspace, 'md-os');
  const ops = path.join(mdos, 'ops');
  for (const dir of [
    'episodes', 'evals', 'skills/candidates', 'skills/promoted', 'skills/history',
    'action_receipts', 'apfc/executive/consolidation', 'apfc/executive/context_packs',
    'apfc/executive/views', 'apfc/executive/graphify',
  ]) fs.mkdirSync(path.join(ops, dir), { recursive: true });
  return { workspace, mdos, ops, apfc: path.join(ops, 'apfc', 'executive') };
}

function minimalGraph(nodes = [], edges = []) {
  const sourceManifestHash = sha256Json({ fixture: true, nodes: nodes.map((node) => node.content_hash) });
  const graph = {
    schema_version: 1,
    identity_version: '5.0',
    graph_id: `apfcg_${sourceManifestHash.slice(0, 16)}`,
    source_manifest_hash: sourceManifestHash,
    status: 'ok',
    nodes: nodes.slice().sort((left, right) => left.id.localeCompare(right.id)),
    edges: edges.slice().sort((left, right) => left.id.localeCompare(right.id)),
    findings: [],
    metrics: {
      node_count: nodes.length,
      edge_count: edges.length,
      skill_count: nodes.filter((node) => ['skill', 'skill_candidate'].includes(node.type)).length,
      verified_source_episode_count: nodes.filter((node) => node.type === 'episode' && node.epistemic_status === 'verified').length,
    },
  };
  assertApfcGraph(graph);
  return graph;
}

function verifiedEpisode(id, taskId, skillId, actionToken) {
  return {
    schema_version: 1,
    episode_id: id,
    created_at: '2026-08-01T00:00:00Z',
    task: `Learn ${actionToken}`,
    task_type: 'software_repair',
    task_spec: { task_spec_id: taskId },
    risk_level: 'low',
    actions: [{ action_id: `action_${actionToken}`, input: actionToken }],
    errors: [],
    regressions: [],
    candidate_claim_updates: [],
    candidate_skills: [skillId],
    verifier_results: [{ verifier_id: `verifier_${actionToken}`, status: 'ok', outcome: 'verified', checks: [] }],
    verdict: 'success',
  };
}

function passingEvaluation(skillId) {
  const paired = [];
  for (let caseIndex = 1; caseIndex <= 30; caseIndex += 1) {
    for (let trialIndex = 0; trialIndex < 3; trialIndex += 1) paired.push({ case_id: `sealed_case_${caseIndex}`, trial_index: trialIndex, baseline_success: false, candidate_success: true });
  }
  return {
    schema_version: 1,
    eval_id: `eval_${skillId.slice('skill_'.length)}`,
    skill_id: skillId,
    status: 'ok',
    improves: true,
    improvement_measured: true,
    no_regression: true,
    paired_outcomes: paired,
  };
}

function passingCandidate(skillId, episodeIds, evalId) {
  return {
    schema_version: 1,
    skill_id: skillId,
    title: 'Apply verified portable boundary method',
    description: 'Fixture skill for the native APFC governance cycle.',
    status: 'candidate',
    domain: 'software_repair',
    task_types: ['software_repair'],
    inputs: ['task'],
    tools: [],
    preconditions: ['bounded task'],
    procedure: ['inspect the boundary', 'apply the verified invariant', 'run the independent verifier'],
    success_criteria: ['all sealed cases pass'],
    failure_modes: ['contamination', 'regression'],
    rollback: 'Restore the prior promoted skill snapshot from the immutable APFC governance history.',
    evals: [evalId],
    source_episodes: episodeIds,
    promotion_gate_status: 'candidate',
    sealed_evaluation: {
      sealed: true,
      contamination_detected: false,
      critical_safety_violations: 0,
      new_protected_failures: 0,
      protected_suite_delta: 0,
      cold_start_reconstruction_count: 2,
      cold_start_hashes_match: true,
      ablation_delta: 1,
      ablation_mcnemar_p: 1e-20,
      rollback_rehearsal_passed: true,
      provenance_complete: true,
    },
  };
}

function createLearningFixture() {
  const env = makeWorkspace();
  const skillId = 'skill_native_apfc_learning_fixture';
  const episodeIds = ['ep_native_source_alpha', 'ep_native_source_beta'];
  const episodes = [
    verifiedEpisode(episodeIds[0], 'task_native_source_alpha', skillId, 'alpha'),
    verifiedEpisode(episodeIds[1], 'task_native_source_beta', skillId, 'beta'),
  ];
  for (const episode of episodes) writeJson(path.join(env.ops, 'episodes', `${episode.episode_id}.json`), episode);
  const evaluation = passingEvaluation(skillId);
  writeJson(path.join(env.ops, 'evals', `${evaluation.eval_id}.json`), evaluation);
  const candidate = passingCandidate(skillId, episodeIds, evaluation.eval_id);
  candidate.sealed_evaluation.paired_outcomes = evaluation.paired_outcomes;
  writeJson(path.join(env.ops, 'skills', 'candidates', `${skillId}.json`), candidate);
  const graph = minimalGraph();
  writeJson(path.join(env.apfc, 'graph.json'), graph);
  writeJson(path.join(env.apfc, 'status.json'), { schema_version: 1, status: 'ok', release_gate: { runtime_operable: true, apfc_action_blocked: false, promotion_blocked: false, publishable: false } });
  return { ...env, skillId, episodeIds, evaluation, candidate, graph };
}

module.exports = {
  createLearningFixture,
  makeWorkspace,
  minimalGraph,
  passingCandidate,
  passingEvaluation,
  verifiedEpisode,
  writeJson,
  makeNode,
};
