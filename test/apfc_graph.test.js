'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectCanonicalSources, assertApfcGraph } = require('../md-os/apfc/executive/graph_projector');

test('canonical artifacts project deterministically into a provenance-resolved APFC graph', () => {
  const records = [
    {
      path: 'md-os/ops/tasks/task_projection.json',
      kind: 'task',
      data: {
        task_spec_id: 'task_projection', created_at: '2026-08-01T00:00:00Z', goal: 'Repair a bounded parser', task_type: 'software_repair',
        constraints: ['bounded task'], required_evidence: [{ evidence_id: 'source', path: 'md-os/source.js', must_exist: true }],
        actions: [{ action_id: 'repair_parser', command_id: 'repair_parser' }], risk_budget: { level: 'low' },
      },
    },
    {
      path: 'md-os/ops/episodes/ep_projection.json',
      kind: 'episode',
      data: {
        episode_id: 'ep_projection', created_at: '2026-08-01T01:00:00Z', task: 'Repair a bounded parser', task_type: 'software_repair',
        task_spec: { task_spec_id: 'task_projection' }, actions: [{ action_id: 'repair_parser' }], observations: [{ metric: 'tests', value: 'pass' }],
        errors: [], regressions: [], candidate_skills: [], verifier_results: [{ verifier_id: 'verification_projection', status: 'ok', outcome: 'verified' }], verdict: 'success',
      },
    },
    {
      path: 'md-os/ops/verifications/verification_projection.json',
      kind: 'verification',
      data: { verifier_id: 'verification_projection', status: 'ok', outcome: 'verified', independent_from_planner: true, action_receipt_ids: [], evidence: [] },
    },
  ];
  const manifest = records.map((record) => ({ path: record.path, sha256: 'a'.repeat(64) }));
  const first = projectCanonicalSources(records, manifest);
  const second = projectCanonicalSources(records, manifest);
  assert.deepEqual(second, first);
  assertApfcGraph(first);
  assert.ok(first.nodes.some((node) => node.type === 'goal'));
  assert.ok(first.nodes.some((node) => node.type === 'constraint'));
  assert.ok(first.nodes.some((node) => node.type === 'episode' && node.epistemic_status === 'verified'));
  assert.ok(first.edges.every((edge) => first.nodes.some((node) => node.id === edge.from) && first.nodes.some((node) => node.id === edge.to)));
});
