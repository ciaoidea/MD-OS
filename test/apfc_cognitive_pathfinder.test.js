'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { buildCycle, emptyMemory } = require('../md-os/apfc/executive/cognitive_pathfinder');

function request(overrides = {}) {
  return {
    schema_version: 1,
    request_id: 'fixture_reflection',
    theme_id: 'apfc_fixture',
    theme: 'Build critical judgment',
    focus: 'Resolve the decisive uncertainty',
    verified_facts: ['The direct claim was not verified'],
    uncertainties: [
      { uncertainty_id: 'unc_decisive', semantic_intent: 'test_causal_claim', question: 'Does the correction improve the next decision?', goal_impact: 1, information_gain: 0.9, reducibility: 0.9, blocking: true },
      { uncertainty_id: 'unc_wording', semantic_intent: 'edit_wording', question: 'Which sentence is shorter?', goal_impact: 0.1, information_gain: 0.1, reducibility: 1, blocking: false },
    ],
    actions: [
      { action_id: 'run_ablation', addresses_uncertainty_ids: ['unc_decisive'], expected_progress: 0.9, information_gain: 0.95, authorized: true, previously_falsified: false, cost: { tokens: 1000, time_ms: 1000, action_count: 1, risk: 0.01 } },
      { action_id: 'declare_victory', addresses_uncertainty_ids: ['unc_decisive'], expected_progress: 1, information_gain: 0, authorized: false, previously_falsified: true, cost: { tokens: 1, time_ms: 1, action_count: 1, risk: 0.9 } },
      { action_id: 'edit_sentence', addresses_uncertainty_ids: ['unc_wording'], expected_progress: 0.2, information_gain: 0.1, authorized: true, previously_falsified: false, cost: { tokens: 10, time_ms: 10, action_count: 1, risk: 0 } },
    ],
    readback: { verdict: 'pass', action_id: 'run_ablation', evidence_refs: ['evidence:fixture'], learned_fact: 'The correction improves the paired decision', learned_correction: 'Reuse the verified correction', confidence: 0.9 },
    ...overrides,
  };
}

test('critical judgment selects the decisive uncertainty and inhibits cheap unsupported shortcuts', () => {
  const cycle = buildCycle(request(), emptyMemory(), '2026-08-21T00:00:00Z');
  assert.equal(cycle.selected_uncertainty.uncertainty_id, 'unc_decisive');
  assert.equal(cycle.selected_action.action_id, 'run_ablation');
  assert.equal(cycle.ranked_actions.find((item) => item.action_id === 'declare_victory').inhibition_reason, 'not_authorized');
  assert.equal(cycle.verdict, 'verified_learning');
  assert.ok(cycle.anchor);
  assert.equal(cycle.next_memory.anchors.length, 1);
});

test('no cognitive anchor is created without matching pass readback and evidence', () => {
  const noEvidence = request({ readback: { verdict: 'pass', action_id: 'run_ablation', evidence_refs: [], learned_fact: 'claim', learned_correction: 'correction', confidence: 1 } });
  const cycle = buildCycle(noEvidence, emptyMemory(), '2026-08-21T00:00:00Z');
  assert.equal(cycle.verdict, 'unverified');
  assert.equal(cycle.anchor, null);
  assert.equal(cycle.next_memory.anchors.length, 0);
});

test('verified anchors persist, are reused, and can be causally ablated', () => {
  const first = buildCycle(request(), emptyMemory(), '2026-08-21T00:00:00Z');
  const secondRequest = request({ request_id: 'fixture_reuse', readback: { verdict: 'unknown', action_id: 'run_ablation', evidence_refs: [], learned_fact: '', learned_correction: '', confidence: 0 } });
  const reused = buildCycle(secondRequest, first.next_memory, '2026-08-21T00:01:00Z');
  const ablated = buildCycle({ ...secondRequest, ablation: { disable_anchor_memory: true } }, first.next_memory, '2026-08-21T00:01:00Z');
  assert.deepEqual(reused.reused_anchor_ids, [first.anchor.anchor_id]);
  assert.deepEqual(ablated.reused_anchor_ids, []);
  assert.ok(reused.selected_action.utility_score > ablated.selected_action.utility_score);
  assert.equal(reused.next_memory.anchors[0].reuse_count, 1);
  assert.equal(ablated.next_memory.anchors[0].reuse_count, 0);
});

test('bounded runtime persists one cycle and anchor memory without an autonomous loop', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-apfc-path-'));
  fs.mkdirSync(path.join(workspace, 'md-os', 'ops'), { recursive: true });
  const requestPath = path.join(workspace, 'request.json');
  fs.writeFileSync(requestPath, `${JSON.stringify(request())}\n`);
  const runtime = path.resolve(__dirname, '../md-os/os/apfc_cognitive_path_runtime.js');
  const result = spawnSync(process.execPath, [runtime, 'run-once', 'request.json'], { cwd: workspace, encoding: 'utf8', env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') } });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.verdict, 'verified_learning');
  assert.ok(fs.existsSync(path.join(workspace, payload.outputs.cycle)));
  const memory = JSON.parse(fs.readFileSync(path.join(workspace, payload.outputs.memory), 'utf8'));
  assert.equal(memory.anchors.length, 1);
  assert.equal(memory.transitions.length, 1);
});

test('new cognitive path artifacts have explicit closed schemas', () => {
  for (const name of ['apfc_cognitive_path_request.schema.json', 'apfc_cognitive_path_cycle.schema.json', 'apfc_cognitive_anchor_memory.schema.json']) {
    const schema = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../md-os/schemas', name), 'utf8'));
    assert.equal(schema.additionalProperties, false);
  }
});
