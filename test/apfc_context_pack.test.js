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

test('operational context does not fill unused capacity with unrelated verified nodes', () => {
  const task = {
    task_spec_id: 'task_selective_context',
    created_at: '2026-09-04T00:00:00Z',
    goal: 'Repair APFC retrieval precision',
    task_type: 'software_repair',
    constraints: [],
    required_evidence: [],
    actions: [],
    risk_budget: { level: 'low' },
  };
  const records = [
    { path: 'md-os/ops/tasks/task_selective_context.json', kind: 'task', data: task },
    {
      path: 'md-os/ops/episodes/ep_unrelated.json',
      kind: 'episode',
      data: {
        episode_id: 'ep_unrelated',
        title: 'Verified accounting export',
        task_type: 'accounting',
        status: 'completed',
        epistemic_status: 'verified',
        observations: ['Ledger export completed'],
        actions: [],
        outcomes: [],
      },
    },
  ];
  const graph = projectCanonicalSources(
    records,
    records.map((record) => ({ path: record.path, hash: 'b'.repeat(64) })),
  );
  const pack = compileOperationalContextPack(
    graph,
    task,
    { maximum_nodes: 128, maximum_bytes: 65536 },
  );
  assert.equal(pack.nodes.some((node) => node.id.includes('ep_unrelated')), false);
  assert.ok(pack.selection_trace.some((row) => (
    row.included === false && row.admission_reason === 'zero_relevance'
  )));
  assert.ok(pack.selection_trace.every((row) => (
    row.rank_tuple.length === 0 || Number.isInteger(row.rank_tuple[1])
  )));
});

test('byte pruning removes the lowest-ranked optional candidate first', () => {
  const task = {
    task_spec_id: 'task_byte_pruning',
    created_at: '2026-09-04T00:00:00Z',
    goal: 'Repair alpha beta retrieval',
    task_type: 'software_repair',
    constraints: [], required_evidence: [], actions: [], risk_budget: { level: 'low' },
  };
  const episode = (id, title, epistemicStatus) => ({
    path: `md-os/ops/episodes/${id}.json`,
    kind: 'episode',
    data: {
      episode_id: id,
      title,
      task_type: 'history',
      status: 'completed',
      epistemic_status: epistemicStatus,
      observations: [title],
      actions: [], outcomes: [],
    },
  });
  const records = [
    { path: 'md-os/ops/tasks/task_byte_pruning.json', kind: 'task', data: task },
    episode('ep_alpha', 'alpha retrieval repair', 'verified'),
    episode('ep_beta', 'beta retrieval repair', 'hypothetical'),
  ];
  const graph = projectCanonicalSources(
    records,
    records.map((record) => ({ path: record.path, hash: 'c'.repeat(64) })),
  );
  const full = compileOperationalContextPack(
    graph, task, { maximum_nodes: 128, maximum_bytes: 65536 },
  );
  const optional = full.selection_trace
    .filter((row) => row.included && row.final_rank !== null)
    .sort((left, right) => left.final_rank - right.final_rank);
  assert.ok(optional.length >= 2);
  const pruned = compileOperationalContextPack(
    graph,
    task,
    { maximum_nodes: 128, maximum_bytes: full.serialized_bytes - 1 },
  );
  assert.ok(pruned.selected_node_ids.includes(optional[0].node_id));
  assert.equal(pruned.selected_node_ids.includes(optional.at(-1).node_id), false);
  assert.ok(pruned.selection_trace.some((row) => (
    row.node_id === optional.at(-1).node_id
      && row.omission_reason === 'byte_budget_lowest_ranked_optional'
  )));
});
