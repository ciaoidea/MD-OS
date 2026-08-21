'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { makeWorkspace, minimalGraph, makeNode } = require('./apfc_test_helpers');
const { writeViews, VIEW_IDS } = require('../md-os/apfc/executive/graphify_adapter');

test('Graphify emits five read-only views preserving identifiers, edge semantics, and live-overlay truth', () => {
  const env = makeWorkspace('mdos-apfc-graphify-');
  const episode = makeNode({ type: 'episode', canonicalKey: 'episode', label: 'Verified episode', lifecycle: 'completed', epistemic: 'verified', sourceRefs: ['md-os/ops/episodes/ep.json'], properties: { episode_id: 'ep_view' } });
  const graph = minimalGraph([episode]);
  const liveNode = makeNode({ type: 'prediction', canonicalKey: 'live prediction', label: 'Live prediction', lifecycle: 'active', epistemic: 'hypothetical', sourceRefs: ['md-os/ops/apfc/executive/events.ndjson#sequence=1'], properties: { event_sequence: 1, live_overlay: true } });
  const live = minimalGraph([liveNode]);
  const result = writeViews(env.apfc, graph, live);
  assert.deepEqual(result.view_ids, VIEW_IDS);
  assert.equal(result.json_dir, 'md-os/ops/apfc/executive/views');
  assert.equal(result.html_dir, 'md-os/ops/apfc/executive/graphify');
  assert.equal(path.isAbsolute(result.json_dir), false);
  assert.equal(path.isAbsolute(result.html_dir), false);
  for (const viewId of VIEW_IDS) {
    const payload = JSON.parse(fs.readFileSync(path.join(env.apfc, 'views', `${viewId}.json`), 'utf8'));
    assert.equal(payload.graph_hash, result.graph_hash);
    assert.equal(payload.visual_contract.canonical_writes_forbidden, true);
    assert.ok(fs.existsSync(path.join(env.apfc, 'graphify', `${viewId}.html`)));
  }
  const timeline = JSON.parse(fs.readFileSync(path.join(env.apfc, 'views', 'episode_timeline.json'), 'utf8'));
  assert.ok(timeline.nodes.some((node) => node.id === episode.id && node.epistemic_status === 'verified'));
  assert.ok(timeline.nodes.some((node) => node.id === liveNode.id && node.live_overlay === true && node.last_committed_event_sequence === 1));
});
