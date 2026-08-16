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

  const frame = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, payload.outputs.frame), 'utf8'));
  assert.equal(frame.frame_id, payload.frame_id);
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
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.outputs.concept_dynamics)));
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
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.output_json)));
  assert.ok(fs.existsSync(path.join(REPO_ROOT, payload.output_md)));
});
