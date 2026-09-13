'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonicalJson, sha256Json } = require('../md-os/os/lib/common');
const { projectCanonicalSources } = require('../md-os/apfc/executive/graph_projector');
const { compileOperationalContextPack, compileOperationalContextBundle, assertContextSelectionAudit, assertContextPack } = require('../md-os/apfc/executive/context_compiler');
const { buildApfcGraph } = require('../md-os/os/build_apfc_graph');
const { compileContext, readContextAudit } = require('../md-os/os/apfc_runtime');

const task = id => ({ schema_version: 1, task_spec_id: `task_${id}`, created_at: '2026-09-12T00:00:00Z', goal: 'Resolve cobalt flux',
  constraints: ['Retain independent evidence.'], required_evidence: [], actions: [], unknowns: ['Unmeasured outcome.'],
  acceptance_tests: [], problem_core: { state: 'open', premises: [], candidate_solution: null, next_question: null, relations: [] } });
const asRecords = tasks => tasks.map(data => ({ kind: 'task', path: `md-os/ops/tasks/${data.task_spec_id}.json`, data }));
function graphOf(tasks, extra = 0) {
  const records = asRecords(tasks);
  for (let i = 0; i < extra; i += 1) records.push({ kind: 'episode', path: `md-os/ops/episodes/ep_freight_${i}.json`, data: {
    episode_id: `ep_freight_${i}`, title: `Unrelated freight invoice ${i}`, status: 'completed', epistemic_status: 'observed', observations: [], actions: [], outcomes: [],
  } });
  return projectCanonicalSources(records, records.map(record => ({ path: record.path, sha256: sha256Json(record.data) })));
}
function relate(from, to, relation = 'depends_on') {
  from.problem_core.relations.push({ task_spec_id: to.task_spec_id, relation, basis: 'Declared fixture link, not semantic discovery.', expected_contract_hash: null });
}
const size = value => Buffer.byteLength(canonicalJson(value));

test('audit separation preserves selected content and reconstructs every original selection row', () => {
  const a = task('a'), graph = graphOf([a], 70);
  const inline = compileOperationalContextPack(graph, a, { maximum_bytes: 1000000 });
  const { pack, selection_audit: audit } = compileOperationalContextBundle(graph, a, { maximum_bytes: 1000000 });
  assert.deepEqual(pack.nodes, inline.nodes); assert.deepEqual(pack.edges, inline.edges);
  assert.deepEqual(pack.source_hashes, inline.source_hashes);
  assert.deepEqual(pack.mandatory_node_ids, inline.mandatory_node_ids);
  assert.deepEqual(audit.omissions, inline.omissions); assert.deepEqual(audit.selection_trace, inline.selection_trace);
  assert.equal(pack.selection_audit.sha256, sha256Json(audit));
  assert.equal(pack.serialized_bytes, size(pack));
  assert.ok(pack.serialized_bytes < inline.serialized_bytes);
  assert.ok(pack.serialized_bytes + size(audit) > pack.serialized_bytes);
  assertContextSelectionAudit(pack, JSON.parse(JSON.stringify(audit)));
});

test('unrelated audit detail cannot exhaust the mandatory working-context budget', () => {
  const a = task('a'), graph = graphOf([a], 100);
  const limits = { maximum_bytes: 8192 };
  assert.throws(() => compileOperationalContextPack(graph, a, limits), /MANDATORY_BYTE_BUDGET_EXCEEDED/);
  const { pack, selection_audit: audit } = compileOperationalContextBundle(graph, a, limits);
  assert.ok(pack.serialized_bytes <= limits.maximum_bytes);
  assert.ok(audit.omissions.length >= 100);
  assert.ok(audit.selection_trace.some(row => row.admission_reason === 'zero_relevance'));
  assert.ok(pack.nodes.every(node => !node.id.includes('ep_freight')));
  assert.equal(pack.selection_audit.retrieval_required_for_selection_details, true);
});

test('mandatory dependencies and both contradiction endpoints survive separation; true overflow still fails', () => {
  const a = task('a'), b = task('b'), c = task('c'), counter = task('counter');
  relate(a, b); relate(b, c); relate(counter, b, 'contradicts'); relate(c, a);
  const graph = graphOf([a, b, c, counter], 50), { pack } = compileOperationalContextBundle(graph, a);
  const goals = pack.nodes.filter(node => node.type === 'goal');
  assert.deepEqual(goals.map(node => node.scope.task_id).sort(), ['task_a', 'task_b', 'task_c', 'task_counter']);
  assert.ok(goals.every(node => pack.mandatory_node_ids.includes(node.id)));
  assert.ok(goals.every(node => node.properties.resolution === 'unverified'));
  assert.throws(() => compileOperationalContextBundle(graph, a, { maximum_bytes: 100 }), /MANDATORY_BYTE_BUDGET_EXCEEDED/);
  assert.throws(() => compileOperationalContextBundle(graph, a, { maximum_nodes: 1 }), /MANDATORY_NODE_BUDGET_EXCEEDED/);
});

test('audit tampering, mismatched partitions and missing mandatory nodes are rejected', () => {
  const a = task('a'), { pack, selection_audit: audit } = compileOperationalContextBundle(graphOf([a], 10), a);
  const changed = JSON.parse(JSON.stringify(audit)); changed.omissions.pop();
  assert.throws(() => assertContextSelectionAudit(pack, changed), /AUDIT_INVALID/);
  const missing = JSON.parse(JSON.stringify(pack)); missing.mandatory_node_ids.push('not_present');
  assert.throws(() => assertContextPack(missing), /MANDATORY_NODE_MISSING/);
  const divergent = JSON.parse(JSON.stringify(audit)); divergent.selection_trace[0].included = !divergent.selection_trace[0].included;
  const rebound = { ...pack, selection_audit: { ...pack.selection_audit, sha256: sha256Json(divergent) } };
  assert.throws(() => assertContextSelectionAudit(rebound, divergent), /PARTITION_INVALID/);
  assert.throws(() => assertContextPack({ ...pack, omissions: [{}] }), /AUDIT_REFERENCE_INVALID/);
});

test('builder and runtime persist hash-bound audit outside the pack and preserve fresh-process readback', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-context-audit-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const a = task('a'), mdos = path.join(root, 'md-os'), file = path.join(mdos, 'ops/tasks/task_a.json');
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(a));
  const options = { workspace_root: root, mdos_root: mdos, lock_name: `audit_test_${path.basename(root)}` };
  buildApfcGraph(options);
  const firstIndex = JSON.parse(fs.readFileSync(path.join(mdos, 'ops/apfc/executive/context_packs/index.json')));
  const firstFile = path.join(root, firstIndex.packs[0].path);
  assert.equal(fs.statSync(firstFile).size, JSON.parse(fs.readFileSync(firstFile)).serialized_bytes);
  const result = compileContext('md-os/ops/tasks/task_a.json', options);
  const readback = readContextAudit('task_a', options);
  const pack = JSON.parse(fs.readFileSync(path.join(root, result.output)));
  assert.equal(fs.statSync(path.join(root, result.output)).size, pack.serialized_bytes);
  assertContextSelectionAudit(pack, readback.selection_audit);
  const cli = spawnSync(process.execPath, [path.resolve('md-os/os/apfc_runtime.js'), 'context-audit', '--task', 'task_a'], {
    env: { ...process.env, MDOS_WORKSPACE_ROOT: root, MDOS_ROOT: mdos }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr); assert.deepEqual(JSON.parse(cli.stdout), readback);
  const auditPath = path.join(path.dirname(path.join(root, result.output)), pack.selection_audit.path);
  const audit = JSON.parse(fs.readFileSync(auditPath)); audit.selection_policy = 'tampered'; fs.writeFileSync(auditPath, JSON.stringify(audit));
  assert.throws(() => readContextAudit('task_a', options), /AUDIT_INVALID/);
  buildApfcGraph(options); assert.equal(readContextAudit('task_a', options).ok, true);
  const other = task('other'); fs.writeFileSync(path.join(mdos, 'ops/tasks/task_other.json'), JSON.stringify(other));
  buildApfcGraph(options);
  const auditDir = path.join(mdos, 'ops/apfc/executive/context_packs/audit');
  assert.equal(fs.readdirSync(auditDir).length, 2);
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(a));
  a.constraints.push('A newly observed constraint must be reviewed.'); fs.writeFileSync(file, JSON.stringify(a));
  assert.throws(() => readContextAudit('task_a', options), /CONTEXT_STALE/);
});

test('working pack and audit have separate valid schemas', () => {
  const a = task('a'), bundle = compileOperationalContextBundle(graphOf([a], 10), a);
  const checked = spawnSync('python3', ['-c', [
    'import json,sys,jsonschema',
    'data=json.load(sys.stdin)',
    'for key,name in [("pack","apfc_context_pack"),("selection_audit","apfc_context_selection_audit")]:',
    ' s=json.load(open("md-os/schemas/"+name+".schema.json")); jsonschema.Draft202012Validator.check_schema(s); jsonschema.validate(data[key],s)',
  ].join('\n')], { input: JSON.stringify(bundle), encoding: 'utf8' });
  assert.equal(checked.status, 0, checked.stdout + checked.stderr);
});
