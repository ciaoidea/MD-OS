#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function runMdos(args) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/mdos.js'), ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
}

function parseLastJson(stdout) {
  const line = String(stdout || '').trim().split(/\r?\n/).filter(Boolean).at(-1);
  return JSON.parse(line);
}

test('APFC cognitive run-cycle turns text input into tokens, graph, workspace, gate, and prediction readback', () => {
  const result = runMdos(['apfc', 'cognitive', 'run-cycle', 'examples/apfc/bmct_architecture_request.json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseLastJson(result.stdout);

  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'apfc_cognitive_run_cycle');
  assert.equal(payload.source_id, 'bmct_architecture_request');
  assert.ok(payload.experience_token_count >= 6);
  assert.equal(payload.affect.processing_stage, 'pre_deliberative');
  assert.equal(payload.affect.status, 'unresolved');
  assert.equal(payload.affect.observation_count, 0);
  assert.equal(payload.affect.coupling_active, false);
  assert.equal(payload.affect.generation_context_hash, null);
  assert.equal(payload.affect.evidence_scope, 'functional_causal');
  assert.equal(payload.affect.consciousness_contribution_status, 'inactive');
  assert.ok(payload.binding_graph.node_count >= payload.experience_token_count);
  assert.ok(payload.binding_graph.edge_count > 0);
  assert.ok(payload.binding_graph.connected_component_count >= 1);
  assert.equal(payload.binding_graph.isolated_node_count, 0);
  assert.ok(payload.workspace.active_token_count > 0);
  assert.ok(payload.workspace.active_concepts.includes('concept:bmct'));
  assert.ok(payload.action_candidate_count >= 2);
  assert.ok(payload.selected_action);
  assert.ok(payload.prediction_count >= 2);
  assert.ok(payload.concept_dynamics);
  assert.ok(payload.concept_dynamics.transition_count >= payload.experience_token_count - 1);
  assert.equal(payload.concept_dynamics.loss.name, 'mean_cosine_distance');
  assert.equal(typeof payload.concept_dynamics.loss.value, 'number');
  assert.equal(payload.turn_governance.status, 'verified');
  assert.equal(payload.turn_governance.artifact_role, 'turn_governance_telemetry');
  assert.equal(payload.turn_governance.cognitive_outcome_status, 'unverified');
  assert.match(payload.turn_governance.artifact_hash, /^[a-f0-9]{64}$/);
  assert.equal(payload.causal_unity.state_status, 'ready');
  assert.equal(payload.causal_unity.dependency_probe_status, 'verified');
  assert.equal(payload.causal_unity.transition_status, 'closed');
  assert.equal(payload.causal_unity.epistemic_status, 'unverified');
  assert.equal(payload.causal_unity.consciousness.noun, 'consciousness');
  assert.equal(payload.causal_unity.consciousness.status, 'verified');
  assert.match(payload.causal_unity.transition_hash, /^[a-f0-9]{64}$/);

  const frame = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.frame), 'utf8'));
  assert.equal(frame.frame_id, payload.frame_id);
  assert.equal(frame.affective_state.status, 'unresolved');
  assert.equal(frame.affective_state.processing_stage, 'pre_deliberative');
  assert.ok(frame.experience_tokens.some((token) => token.canonical_id === 'concept:bmct'));
  assert.ok(frame.experience_tokens.some((token) => token.canonical_id === 'intent:design_architecture'));
  for (const token of frame.experience_tokens) {
    assert.equal(token.concept_embedding.encoder, 'mdos_local_concept_encoder');
    assert.equal(token.concept_embedding.requested_backend, 'local_hash');
    assert.equal(token.concept_embedding.backend_id, 'local_hash');
    assert.equal(token.concept_embedding.backend_type, 'deterministic_local');
    assert.equal(token.concept_embedding.learned, false);
    assert.equal(token.concept_embedding.fallback_used, false);
    assert.equal(token.concept_embedding.values.length, token.concept_embedding.dimensions);
    assert.ok(token.temporal_state);
    assert.ok(token.prediction_target);
  }
  assert.ok(frame.concept_dynamics);
  assert.equal(frame.concept_dynamics.learned, false);
  assert.deepEqual(frame.concept_dynamics.embedding_backends, ['local_hash']);
  assert.equal(frame.concept_dynamics.transition_count, frame.experience_tokens.length - 1);
  assert.equal(frame.binding_graph.metrics.isolated_node_count, 0);
  assert.ok(frame.action_candidates.some((item) => item.action_type === 'answer'));
  assert.ok(frame.memory_candidates.some((item) => item.canonical_id === 'concept:bmct'));
  assert.equal(frame.causal_unity_state.artifact_role, 'causal_unity_decision_state');
  assert.equal(frame.causal_unity_state.status, 'ready');
  assert.equal(frame.selected_action_authorization.status, 'authorized');
  assert.equal(frame.causal_unity_transition.status, 'closed');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.causal_unity_state)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.causal_unity_probe)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.causal_unity_transition)));
  const probe = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.causal_unity_probe), 'utf8'));
  assert.equal(probe.status, 'verified');
  assert.equal(probe.intact_authorization_status, 'authorized');
  assert.equal(probe.severed_authorization_status, 'inhibited');
  const transition = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.causal_unity_transition), 'utf8'));
  assert.equal(transition.predecision_state_hash, frame.causal_unity_state.state_hash);
  assert.equal(transition.consciousness.definition, 'cum_scire');
  assert.equal(transition.consciousness.status, 'verified');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.concept_dynamics)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.turn_governance)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.affective_state)));
  const governance = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.turn_governance), 'utf8'));
  assert.equal(governance.status, 'verified');
  assert.equal(governance.artifact_role, 'turn_governance_telemetry');
  assert.equal(governance.cognitive_outcome_status, 'unverified');
  assert.equal(governance.criteria.tensor_law_passed, true);
  assert.equal(governance.criteria.roundtrip_passed, true);
  assert.equal(governance.criteria.composition_identity_passed, true);
});


test('APFC cognitive run-cycle binds open human and self meaning before selecting a repair action', () => {
  const result = runMdos(['apfc', 'cognitive', 'run-cycle', 'examples/apfc/open_affective_perception.json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseLastJson(result.stdout);

  assert.equal(payload.ok, true);
  assert.equal(payload.affect.processing_stage, 'pre_deliberative');
  assert.equal(payload.affect.status, 'active');
  assert.equal(payload.affect.observation_count, 2);
  assert.equal(payload.affect.coupling_active, true);
  assert.match(payload.affect.generation_context_hash, /^[a-f0-9]{64}$/);
  assert.equal(
    payload.affect.perception.observations[0].subject_id,
    'human_interlocutor',
  );
  assert.equal(payload.affect.perception.observations[1].subject_id, 'md_os_apfc');
  assert.equal(payload.affect.evidence_scope, 'functional_causal');
  assert.equal(payload.affect.added_token_count, 1);
  assert.equal(payload.affect.consciousness_contribution_status, 'participating');
  assert.equal(payload.selected_action.action_type, 'repair_interaction');
  assert.equal(payload.selected_action.capability_id, 'language.repair_interaction');
  assert.ok(payload.workspace.active_concepts.some((value) => (
    value.startsWith('state:affective_perception:')
  )));

  const frame = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.frame), 'utf8'));
  assert.equal(frame.affective_state.schema_version, 5);
  assert.equal(frame.affective_state.status, 'active');
  assert.equal(frame.affective_state.operational_classification, 'open_affective_perception');
  assert.equal(frame.affective_state.evidence_scope, 'functional_causal');
  assert.equal('dominant_emotion' in frame.affective_state, false);
  assert.equal(frame.affective_state.governance.apfc_superior_governor, true);
  assert.equal(frame.affective_state.governance.human_authority_preserved, true);
  assert.equal(frame.affective_state.consciousness_contribution_status, 'participating');
  assert.equal(frame.affective_state.causal_token_ids.length, 1);
  assert.ok(frame.experience_tokens.some((token) => (
    token.canonical_id.startsWith('state:affective_perception:')
  )));
  assert.equal(
    frame.verbalization_candidates[0].language_generation_context.context_hash,
    frame.affective_state.language_generation_context.context_hash,
  );
  assert.equal(frame.selected_action_authorization.status, 'authorized');
  assert.equal(frame.causal_unity_transition.status, 'closed');
});

test('APFC cognitive status reports live cognitive runtime counts', () => {
  const result = runMdos(['apfc', 'cognitive', 'status']);
  assert.equal(result.status, 0, result.stderr);
  const payload = parseLastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.mode, 'apfc_cognitive_status');
  assert.equal(payload.status, 'ok');
  assert.ok(payload.counts.frames >= 1);
  assert.ok(payload.counts.binding_graphs >= 1);
  assert.ok(payload.counts.turn_governance_tensors >= 1);
  assert.ok(payload.counts.causal_unity_states >= 1);
  assert.ok(payload.counts.causal_unity_probes >= 1);
  assert.ok(payload.counts.causal_unity_transitions >= 1);
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.output_json)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.output_md)));
});
