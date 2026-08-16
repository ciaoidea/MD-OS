'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { projectCanonicalSources } = require('../md-os/apfc/executive/graph_projector');
const { compileOperationalContextPack, assertContextPack } = require('../md-os/apfc/executive/context_compiler');

test('operational context preserves mandatory constraints and only enables exact-precondition skills', () => {
  const task = {
    task_spec_id: 'task_context_native', created_at: '2026-08-01T00:00:00Z', goal: 'Repair a bounded task', task_type: 'software_repair',
    constraints: ['bounded task'], required_evidence: [], actions: [], risk_budget: { level: 'low' },
  };
  const skill = {
    skill_id: 'skill_context_native', title: 'Bounded repair', status: 'promoted', domain: 'software_repair', task_types: ['software_repair'],
    preconditions: ['bounded task'], procedure: ['repair'], source_episodes: ['ep_context_native'], evals: [],
  };
  const records = [
    { path: 'md-os/ops/tasks/task_context_native.json', kind: 'task', data: task },
    { path: 'md-os/ops/skills/skill_registry.json', kind: 'skill_registry', data: { candidate_skills: [], promoted_skills: [skill] } },
  ];
  const graph = projectCanonicalSources(records, records.map((record) => ({ path: record.path, hash: 'a'.repeat(64) })));
  const pack = compileOperationalContextPack(graph, task, { maximum_nodes: 128, maximum_bytes: 65536 });
  assertContextPack(pack);
  const mandatory = pack.nodes.filter((node) => pack.mandatory_node_ids.includes(node.id));
  assert.ok(mandatory.some((node) => node.type === 'goal'));
  assert.ok(mandatory.some((node) => node.type === 'constraint'));
  const selectedSkill = pack.nodes.find((node) => node.type === 'skill');
  assert.ok(selectedSkill);
  assert.equal(selectedSkill.properties.apfc_execution_inhibited, false);
  assert.ok(pack.serialized_bytes <= 65536);
});
