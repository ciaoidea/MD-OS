'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { compactJson, expandCompactJson, previewProblemCompaction } = require('../md-os/os/problem_compaction');
const { problemContractHash } = require('../md-os/kernel/cognition/problem_core');

const repeated = 'Preserve the uninterrupted measurement, provenance, initial state, and independent postcondition evidence. '.repeat(8);
const task = id => ({ schema_version: 1, task_spec_id: `task_${id}`, created_at: '2026-09-12T00:00:00Z', goal: `Resolve ${id}`,
  constraints: ['Do not alter the shared power supply.'], acceptance_tests: [], risk_budget: {}, resource_budget: {},
  required_evidence: [], unknowns: ['The actual outcome is unknown.'], actions: [], observation_targets: [],
  success_definition: { acceptance_tests_required: true, all_acceptance_tests_must_pass: true, observed_delta_required: true, required_evidence_must_exist: true },
  problem_core: { state: 'candidate', premises: [], candidate_solution: null, next_question: 'What independent result is missing?', relations: [] },
});
const relate = (from, to, relation = 'depends_on') => from.problem_core.relations.push({ task_spec_id: to.task_spec_id,
  relation, basis: 'Explicit fixture relation; not evidence of discovered semantics.', expected_contract_hash: problemContractHash(to) });
const write = (root, value) => {
  const file = path.join(root, 'md-os/ops/tasks', `${value.task_spec_id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value));
};
function fixture(t, values = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-compaction-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const value of values) write(root, value);
  return root;
}
const propose = (preview, changes) => ({ schema_version: 1, source_hash: preview.source.sha256, network_hash: preview.network.hash, changes });
const command = (root, args, input) => spawnSync(process.execPath, [path.resolve('md-os/os/apfc_runtime.js'), 'compact-problem', ...args], {
  env: { ...process.env, MDOS_WORKSPACE_ROOT: root, MDOS_ROOT: path.join(root, 'md-os') }, input, encoding: 'utf8', timeout: 10000,
});

test('exact sharing preserves repetition count, order, provenance and prototype-like keys', () => {
  const source = JSON.parse('{"__proto__":{"literal":true},"a/b~c":null}');
  source['a/b~c'] = [repeated, repeated];
  source.observations = [{ time: 1, text: repeated }, { time: 2, text: repeated }];
  const before = JSON.stringify(source), compact = compactJson(source);
  assert.equal(compact.format, 'json-shared-v1');
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) < Buffer.byteLength(before));
  assert.deepEqual(expandCompactJson(JSON.parse(JSON.stringify(compact))), source);
  assert.equal(JSON.stringify(source), before);
  assert.equal({}.literal, undefined);
  assert.ok(compact.shared.flatMap(group => group.at).includes('/a~1b~0c/0'));
});

test('small or nonrepeated values are not encoded at a net loss', () => {
  const source = { words: ['yes', 'yes'], unique: repeated, counts: [1, 2, 3], empty: null };
  assert.deepEqual(compactJson(source), { format: 'json', body: source });
});

test('round-trip property holds over 80 deterministic nested JSON fixtures', () => {
  let seed = 91;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
  const node = depth => depth === 0 ? [null, true, false, random() % 11, repeated][random() % 5]
    : random() % 2 ? Array.from({ length: random() % 4 }, () => node(depth - 1))
      : Object.fromEntries(Array.from({ length: random() % 4 }, (_, i) => [`key/${i}~`, node(depth - 1)]));
  for (let i = 0; i < 80; i += 1) { const value = node(4); assert.deepEqual(expandCompactJson(compactJson(value)), value); }
});

test('decoder rejects overlapping references, missing pointers and expansion bombs', () => {
  assert.throws(() => expandCompactJson({ format: 'json-shared-v1', body: { a: null, b: null }, shared: [{ at: ['/a', '/a'], value: repeated }] }), /OVERLAPPING/);
  assert.throws(() => expandCompactJson({ format: 'json-shared-v1', body: { a: null }, shared: [{ at: ['/a', '/missing'], value: repeated }] }), /POINTER_MISSING/);
  assert.throws(() => expandCompactJson({ format: 'json-shared-v1', body: { a: null, b: null }, shared: [{ at: ['/a', '/b'], value: 'x'.repeat(600000) }] }), /EXPANSION_LIMIT/);
  let deep = {}; for (let i = 0; i < 66; i += 1) deep = { next: deep };
  assert.throws(() => compactJson(deep), /STRUCTURE_LIMIT/);
});

test('preview preserves connected cycles, incoming contradictions, analogies and unrelated cores', t => {
  const a = task('a'), b = task('b'), c = task('c'), d = task('d'), other = task('other');
  a.problem_core.premises = [1, 2, 3].map(() => ({ statement: repeated, epistemic_status: 'hypothetical', source_refs: [] }));
  relate(a, b); relate(b, a); relate(c, b, 'contradicts'); relate(d, c, 'analogous_to');
  const root = fixture(t, [a, b, c, d, other]);
  const preview = previewProblemCompaction(root, { task_id: a.task_spec_id });
  assert.equal(preview.status, 'lossless_verified');
  assert.equal(preview.writes, false); assert.equal(preview.resolution, 'unverified'); assert.equal(preview.automatic_reuse, false);
  assert.deepEqual(preview.network.affected_problem_ids, ['task_a', 'task_b', 'task_c', 'task_d']);
  assert.equal(preview.network.unrelated_problem_count, 1);
  assert.equal(preview.network.relations.length, 4);
  assert.ok(preview.network.problems.find(p => p.task_spec_id === 'task_a').review_required);
  assert.deepEqual(expandCompactJson(preview.representation), a);
  assert.equal(preview.metrics.output_bytes, Buffer.byteLength(JSON.stringify(preview)) + 1);
  assert.equal(preview.metrics.total_token_saving, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'md-os/ops/tasks/task_other.json'))), other);
});

test('unknown task fields, explicit procedure state, action order and evidence remain exact', t => {
  const a = task('a');
  a.actions = [{ step: 'read', detail: repeated }, { step: 'validate', detail: repeated }, { step: 'save', detail: repeated }];
  a.procedure_state = { precondition: 'authorized', postcondition: 'independently verified', count: 3 };
  a.parent_obligation = { id: 'external_parent', status: 'open' };
  a.problem_core.premises.push({ statement: 'Unproven claim.', epistemic_status: 'observed', source_refs: ['md-os/ops/sources/missing.txt'] });
  const root = fixture(t, [a]), result = previewProblemCompaction(root, { task_id: a.task_spec_id });
  assert.deepEqual(expandCompactJson(result.representation), a);
  assert.equal(result.network.evidence[0].status, 'unavailable');
  assert.equal(result.verification.outcome, 'not_evaluated');
});

test('semantic summaries stay candidates even when they remove an important distinction', t => {
  const a = task('a'); a.goal = `${repeated} Do not interrupt power even briefly.`;
  const root = fixture(t, [a]), baseline = previewProblemCompaction(root, { task_id: a.task_spec_id });
  const proposal = propose(baseline, [{ pointer: '/goal', summary: 'Complete the work.', reason: 'Proposed compression; significance not established.' }]);
  const preview = previewProblemCompaction(root, { task_id: a.task_spec_id, proposal });
  assert.equal(preview.status, 'semantic_candidate'); assert.equal(preview.verification.round_trip, false);
  assert.equal(preview.verification.semantic_equivalence, 'not_evaluated');
  assert.equal(preview.automatic_reuse, false); assert.equal(preview.resolution, 'unverified');
  assert.equal(preview.changes[0].source_ref, 'md-os/ops/tasks/task_a.json#/goal');
  assert.match(preview.risks.join(' '), /Meaning is not verified/);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, baseline.source.path))), a);
});

test('relations, provenance, success criteria and procedure control cannot be edited by a summary', t => {
  const a = task('a'), b = task('b'); relate(a, b);
  const root = fixture(t, [a, b]), baseline = previewProblemCompaction(root, { task_id: a.task_spec_id });
  for (const pointer of ['/problem_core/relations', '/problem_core/state', '/acceptance_tests', '/success_definition', '/actions', '/task_spec_id']) {
    const preview = previewProblemCompaction(root, { task_id: a.task_spec_id, proposal: propose(baseline, [{ pointer, summary: 'resolved', reason: 'Delete to save space.' }]) });
    assert.equal(preview.status, 'rejected'); assert.equal(preview.representation, null);
  }
});

test('changed source, newly linked core and changed underlying evidence invalidate prior proposals', t => {
  const a = task('a'); a.goal = repeated;
  const ref = 'md-os/ops/sources/readback.txt';
  a.problem_core.premises.push({ statement: 'A recorded value.', epistemic_status: 'observed', source_refs: [ref] });
  const root = fixture(t, [a]); fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true }); fs.writeFileSync(path.join(root, ref), 'first');
  const preview = previewProblemCompaction(root, { task_id: a.task_spec_id });
  const proposal = propose(preview, [{ pointer: '/goal', summary: 'Observe.', reason: 'Candidate only.' }]);
  fs.writeFileSync(path.join(root, ref), 'second');
  let after = previewProblemCompaction(root, { task_id: a.task_spec_id, proposal });
  assert.equal(after.status, 'rejected'); assert.deepEqual(after.risks, ['stale_source_or_problem_network']);
  assert.equal(after.source.sha256, preview.source.sha256);
  fs.writeFileSync(path.join(root, ref), 'first');
  const c = task('c'); relate(c, a, 'contradicts'); write(root, c);
  assert.equal(previewProblemCompaction(root, { task_id: a.task_spec_id, proposal }).status, 'rejected');
  a.goal += ' Additional constraint.'; write(root, a);
  assert.equal(previewProblemCompaction(root, { task_id: a.task_spec_id, proposal }).status, 'rejected');
});

test('budget overflow is explicit and never drops a necessary relation into a successful preview', t => {
  const a = task('a'), b = task('b'); a.goal = repeated; relate(a, b);
  const root = fixture(t, [a, b]), preview = previewProblemCompaction(root, { task_id: a.task_spec_id, maximum_bytes: 2048 });
  assert.equal(preview.status, 'insufficient_evidence'); assert.equal(preview.representation, null);
  assert.equal(preview.network.scope, 'not_loaded_budget_exceeded');
  assert.ok(preview.metrics.output_bytes <= 2048);
  assert.throws(() => previewProblemCompaction(root, { task_id: a.task_spec_id, maximum_bytes: 1024 }), /BUDGET_INVALID/);
});

test('task symlinks fail and evidence symlinks or external paths are never read', t => {
  const a = task('a'), root = fixture(t, [a]), outside = fixture(t);
  fs.writeFileSync(path.join(outside, 'secret.txt'), 'EXTERNAL_CANARY');
  const ref = 'md-os/ops/sources/escape.txt'; fs.mkdirSync(path.dirname(path.join(root, ref)), { recursive: true });
  fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, ref));
  a.problem_core.premises.push({ statement: 'Unsafe source.', epistemic_status: 'observed', source_refs: [ref, '../secret.txt'] }); write(root, a);
  const preview = previewProblemCompaction(root, { task_id: a.task_spec_id });
  assert.ok(preview.network.evidence.every(item => item.status === 'unavailable'));
  assert.ok(!JSON.stringify(preview).includes('EXTERNAL_CANARY'));
  fs.symlinkSync(path.join(root, 'md-os/ops/tasks/task_a.json'), path.join(root, 'md-os/ops/tasks/task_bad.json'));
  assert.throws(() => previewProblemCompaction(root, { task_id: a.task_spec_id }), /SYMLINK_FORBIDDEN/);
});

test('CLI is explicit, bounded and read-only; repeated fresh processes reconstruct the same preview', t => {
  const a = task('a'); a.unknowns = [repeated, repeated, repeated];
  const root = fixture(t, [a]);
  const before = fs.readFileSync(path.join(root, 'md-os/ops/tasks/task_a.json'));
  const args = ['--task', 'task_a', '--preview'];
  const first = command(root, args), second = command(root, args);
  assert.equal(first.status, 0, first.stdout + first.stderr); assert.equal(second.status, 0);
  assert.equal(first.stdout, second.stdout);
  const readback = JSON.parse(first.stdout); assert.deepEqual(expandCompactJson(readback.representation), a);
  assert.equal(command(root, ['--task', 'task_a', '--apply']).status, 1);
  assert.equal(command(root, ['--task', 'task_a']).status, 1);
  assert.equal(command(root, [...args, '--proposal-stdin'], 'x'.repeat(65537)).status, 1);
  assert.equal(command(root, [...args, '--proposal-stdin'], 'null').status, 1);
  const proposal = propose(readback, [{ pointer: '/unknowns/0', summary: 'Missing result.', reason: 'Proposed wording only.' }]);
  const proposed = command(root, [...args, '--proposal-stdin'], JSON.stringify(proposal));
  assert.equal(proposed.status, 0); assert.equal(JSON.parse(proposed.stdout).automatic_reuse, false);
  assert.deepEqual(fs.readFileSync(path.join(root, 'md-os/ops/tasks/task_a.json')), before);
  assert.deepEqual(fs.readdirSync(path.join(root, 'md-os/ops')), ['tasks']);
});

test('schema validates all preview verdicts and rejects false success or malformed proposals', t => {
  const a = task('a'); a.goal = repeated; a.unknowns = [repeated, repeated];
  const root = fixture(t, [a]), baseline = previewProblemCompaction(root, { task_id: a.task_spec_id });
  const proposal = propose(baseline, [{ pointer: '/goal', summary: 'Observe.', reason: 'Unverified candidate.' }]);
  const records = [baseline,
    previewProblemCompaction(root, { task_id: a.task_spec_id, proposal }),
    previewProblemCompaction(root, { task_id: a.task_spec_id, proposal: { ...proposal, source_hash: '0'.repeat(64) } }),
    previewProblemCompaction(root, { task_id: a.task_spec_id, maximum_bytes: 2048 })];
  assert.deepEqual(records.map(record => record.status), ['lossless_verified', 'semantic_candidate', 'rejected', 'insufficient_evidence']);
  const validation = spawnSync('python3', ['-c', [
    'import json,sys,jsonschema',
    's=json.load(open("md-os/schemas/problem_compaction.schema.json"))',
    'jsonschema.Draft202012Validator.check_schema(s)',
    'data=json.load(sys.stdin); v=jsonschema.Draft202012Validator(s)',
    'assert all(v.is_valid(x) for x in data["records"])',
    'assert not v.is_valid(dict(data["records"][0],resolution="resolved"))',
    'p=dict(s); p["$ref"]="#/$defs/proposal"',
    'for k in ["type","required","properties","additionalProperties","allOf"]: p.pop(k,None)',
    'pv=jsonschema.Draft202012Validator(p)',
    'assert pv.is_valid(data["proposal"])',
    'assert not pv.is_valid(dict(data["proposal"],changes=[]))',
  ].join('\n')], { input: JSON.stringify({ records, proposal }), encoding: 'utf8' });
  assert.equal(validation.status, 0, validation.stdout + validation.stderr);
});
