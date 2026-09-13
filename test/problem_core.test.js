'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { canonicalJson, sha256Json } = require('../md-os/os/lib/common');
const { normalizeProblemCore, problemContractHash, buildProblemReadback } = require('../md-os/kernel/cognition/problem_core');
const { projectCanonicalSources } = require('../md-os/apfc/executive/graph_projector');
const { compileOperationalContextPack } = require('../md-os/apfc/executive/context_compiler');
const { buildApfcGraph } = require('../md-os/os/build_apfc_graph');
const { writeContextIndex, compileContext } = require('../md-os/os/apfc_runtime');
const { readProblemContext, buildProblemProjection } = require('../md-os/os/problem_context');

const task = (id, goal = id) => ({ schema_version: 1, task_spec_id: `task_${id}`, goal,
  created_at: '2026-09-12T00:00:00Z', constraints: [], acceptance_tests: [], required_evidence: [],
  unknowns: ['Independent outcome evidence is missing.'], actions: [], observation_targets: [],
  problem_core: { state: 'open', premises: [], candidate_solution: null, next_question: 'Which evidence discriminates the candidates?', relations: [] } });
const relate = (source, target, relation = 'depends_on') => source.problem_core.relations.push({
  task_spec_id: target.task_spec_id, relation, basis: 'Explicit development-fixture relation, not a discovered world fact.',
  expected_contract_hash: problemContractHash(target),
});
const records = tasks => tasks.map(data => ({ kind: 'task', path: `md-os/ops/tasks/${data.task_spec_id}.json`, data }));
const graphOf = tasks => projectCanonicalSources(records(tasks), records(tasks).map(record => ({ path: record.path, sha256: sha256Json(record.data) })));
const writeTask = (workspace, item) => {
  const file = path.join(workspace, 'md-os/ops/tasks', `${item.task_spec_id}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(item));
};

test('hot projection includes bounded source evidence and changes when evidence alone changes', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-projection-'));
  try {
    const a = task('a'), source = 'md-os/ops/sources/premise.json';
    a.problem_core.premises.push({ statement: 'A working claim.', epistemic_status: 'observed', source_refs: [source] });
    writeTask(workspace, a);
    fs.mkdirSync(path.join(workspace, 'md-os/ops/sources'), { recursive: true });
    fs.writeFileSync(path.join(workspace, source), '{"value":1}');
    const first = buildProblemProjection(workspace);
    assert.equal(first.source_evidence[0].status, 'read');
    assert.equal(first.evidence_omitted, false);
    fs.writeFileSync(path.join(workspace, source), '{"value":2}');
    const second = buildProblemProjection(workspace);
    assert.equal(first.problems[0].source_hash, second.problems[0].source_hash);
    assert.notEqual(first.source_evidence[0].source_hash, second.source_evidence[0].source_hash);
    assert.ok(Buffer.byteLength(JSON.stringify(second)) <= 6144);
    assert.equal(a.problem_core.relations.length, 0);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('projection never follows external or ineligible evidence references and marks omission', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-projection-boundary-'));
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-projection-outside-'));
  try {
    const a = task('a');
    a.problem_core.premises.push({ statement: 'Untrusted references.', epistemic_status: 'observed',
      source_refs: ['md-os/ops/sources/escape.txt', 'md-os/ops/local/credentials.json', '../outside.txt', 'md-os/ops/sources/alias/credentials.json'] });
    writeTask(workspace, a);
    fs.mkdirSync(path.join(workspace, 'md-os/ops/sources'), { recursive: true });
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'EXTERNAL_CANARY');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(workspace, 'md-os/ops/sources/escape.txt'));
    fs.mkdirSync(path.join(workspace, 'md-os/ops/local'));
    fs.writeFileSync(path.join(workspace, 'md-os/ops/local/credentials.json'), 'LOCAL_CANARY');
    fs.symlinkSync(path.join(workspace, 'md-os/ops/local'), path.join(workspace, 'md-os/ops/sources/alias'));
    const projection = buildProblemProjection(workspace);
    assert.equal(projection.evidence_omitted, true);
    assert.ok(projection.source_evidence.every(source => source.status === 'not_loaded'));
    assert.ok(!JSON.stringify(projection).includes('EXTERNAL_CANARY'));
    const full = buildProblemProjection(workspace, { task_id: a.task_spec_id, maximum_bytes: 8192 });
    assert.ok(full.source_evidence.every(source => source.status === 'not_loaded'));
    assert.ok(!JSON.stringify(full).includes('LOCAL_CANARY'));
    assert.throws(() => buildProblemProjection(workspace, { maximum_bytes: 100 }), /BUDGET_INVALID/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  }
});

test('on-demand evidence supports full focus, required evidence and source-only pagination', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-evidence-route-'));
  try {
    const a = task('a'), b = task('b');
    a.constraints = ['Keep a decision-changing constraint exactly.'];
    a.problem_core.relations.push({ task_spec_id: b.task_spec_id, relation: 'depends_on', basis: 'Declared hypothesis.', expected_contract_hash: null });
    a.required_evidence = [{ evidence_id: 'value', path: 'md-os/ops/sources/value.json', must_exist: true }];
    writeTask(workspace, a); writeTask(workspace, b);
    fs.mkdirSync(path.join(workspace, 'md-os/ops/sources'), { recursive: true });
    fs.writeFileSync(path.join(workspace, a.required_evidence[0].path), '{"observed":false}');
    const focused = buildProblemProjection(workspace, { task_id: a.task_spec_id, maximum_bytes: 8192 });
    assert.deepEqual(focused.problems[0].task_spec, a);
    assert.equal(focused.problems.length, 1);
    assert.equal(focused.source_evidence[0].content, '{"observed":false}');
    const page = buildProblemProjection(workspace, { after: a.task_spec_id });
    assert.deepEqual(page.problems.map(p => p.task_spec_id), [b.task_spec_id]);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) + 1 <= 6144);
    assert.throws(() => buildProblemProjection(workspace, { task_id: a.task_spec_id, after: b.task_spec_id }), /SCOPE_INVALID/);
    const cli = spawnSync(process.execPath, [path.resolve('md-os/os/apfc_runtime.js'), 'problems', '--task', a.task_spec_id, '--evidence', '--maximum-bytes', '8192'], {
      env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') }, encoding: 'utf8',
    });
    assert.equal(cli.status, 0, cli.stdout + cli.stderr);
    assert.deepEqual(JSON.parse(cli.stdout), focused);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/tasks/task_a.json'))), a);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('a problem core preserves hypotheses, unknowns and candidates without granting verified status', () => {
  const item = task('a');
  item.problem_core.state = 'candidate';
  item.problem_core.premises.push({ statement: 'Possible shared precondition.', epistemic_status: 'hypothetical', source_refs: [] });
  item.problem_core.candidate_solution = 'An untested procedure.';
  const g = graphOf([item]);
  assert.equal(g.status, 'ok');
  assert.deepEqual(g.nodes[0].properties.problem_core, normalizeProblemCore(item.problem_core));
  assert.deepEqual(g.nodes[0].properties.unknowns, item.unknowns);
  assert.equal(g.nodes[0].properties.resolution, 'unverified');
  assert.throws(() => normalizeProblemCore({ ...item.problem_core, state: 'resolved' }), /PROBLEM_CORE_INVALID/);
  assert.throws(() => normalizeProblemCore({ ...item.problem_core, premises: [{ statement: 'Asserted fact', epistemic_status: 'observed', source_refs: [] }] }), /PROBLEM_CORE_INVALID/);
});

test('changed premises in B reopen dependent A and C but not an analogy-only D', () => {
  const a = task('a'), b = task('b'), c = task('c'), d = task('d');
  relate(a, b); relate(c, a); relate(d, b, 'analogous_to');
  const tasks = [a, b, c, d];
  assert.ok(buildProblemReadback(tasks).every(problem => !problem.review_required));
  b.problem_core.premises.push({ statement: 'A missing condition has been proposed.', epistemic_status: 'hypothetical', source_refs: [] });
  const after = buildProblemReadback(tasks);
  assert.deepEqual(after.filter(problem => problem.review_required).map(problem => problem.task_spec_id), ['task_a', 'task_c']);
  assert.ok(after.every(problem => problem.resolution === 'unverified'));
  assert.deepEqual(buildProblemReadback(JSON.parse(JSON.stringify(tasks))), after);
  const g = graphOf(tasks);
  assert.equal(g.nodes.find(node => node.scope.task_id === 'task_c').properties.review_required, true);
});

test('a new contradiction remains visible from either endpoint and propagates to dependents', () => {
  const a = task('a'), b = task('b'), counterexample = task('counterexample');
  relate(a, b); relate(counterexample, b, 'contradicts');
  assert.ok(buildProblemReadback([a, b, counterexample]).every(problem => problem.review_required));
  const g = graphOf([a, b, counterexample]);
  for (const focus of [b, counterexample]) {
    const pack = compileOperationalContextPack(g, focus);
    assert.equal(pack.serialized_bytes, Buffer.byteLength(canonicalJson(pack), 'utf8'));
    const mandatory = pack.nodes.filter(node => pack.mandatory_node_ids.includes(node.id)).map(node => node.scope.task_id);
    assert.ok(mandatory.includes(b.task_spec_id));
    assert.ok(mandatory.includes(counterexample.task_spec_id));
  }
});

test('context follows multiple separate problem cores transitively without requiring word overlap', () => {
  const a = task('a', 'Amber'), b = task('b', 'Beryl'), c = task('c', 'Cobalt'), d = task('d', 'Dahlia');
  relate(b, c); relate(a, b); relate(d, c, 'analogous_to');
  const tasks = [a, b, c, d], g = graphOf(tasks);
  for (const focus of [a, d, b, a]) {
    const pack = compileOperationalContextPack(g, focus);
    const mandatory = pack.nodes.filter(node => pack.mandatory_node_ids.includes(node.id)).map(node => node.scope.task_id).sort();
    assert.deepEqual(mandatory, focus === a ? ['task_a', 'task_b', 'task_c'] : focus === b ? ['task_b', 'task_c'] : ['task_d']);
  }
  assert.throws(() => compileOperationalContextPack(g, a, { maximum_nodes: 2 }), /MANDATORY_NODE_BUDGET_EXCEEDED/);
  assert.equal(tasks.length, 4);
});

test('cyclic dependencies terminate and missing targets cannot silently disappear', () => {
  const a = task('a'), b = task('b');
  relate(a, b); relate(b, a);
  const pack = compileOperationalContextPack(graphOf([a, b]), a);
  assert.equal(pack.mandatory_node_ids.length, 2);
  const missing = graphOf([a]);
  assert.equal(missing.status, 'critical');
  assert.ok(missing.findings.some(finding => /PROBLEM_RELATION_TARGET_UNRESOLVED/.test(finding.message)));
  assert.equal(buildProblemReadback([a])[0].review_required, true);
  assert.throws(() => buildProblemReadback([a, a]), /DUPLICATE/);
});

test('canonical builder indexes every problem across process restarts and retains the map on context writes', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-core-'));
  try {
    const a = task('a'), b = task('b');
    relate(a, b); writeTask(workspace, a); writeTask(workspace, b);
    const apfc = path.join(workspace, 'md-os/ops/apfc/executive');
    const options = { workspace_root: workspace, mdos_root: path.join(workspace, 'md-os'), apfc_dir: apfc, lock_name: `problem_core_${path.basename(workspace)}` };
    assert.equal(buildApfcGraph(options).ok, true);
    const indexPath = path.join(apfc, 'context_packs/index.json');
    const first = JSON.parse(fs.readFileSync(indexPath));
    assert.equal(first.problems.length, 2);
    assert.deepEqual(writeContextIndex(apfc).problems, first.problems);
    b.goal = 'Revised criterion'; writeTask(workspace, b);
    assert.throws(() => compileContext('md-os/ops/tasks/task_a.json', options), /CONTEXT_STALE_REBUILD_REQUIRED/);
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../md-os/os/build_apfc_graph.js')], {
      cwd: workspace, env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const next = JSON.parse(fs.readFileSync(indexPath));
    assert.equal(next.problems.find(problem => problem.task_spec_id === 'task_a').review_required, true);
    assert.equal(next.problems.length, 2);
    const compiler = path.resolve(__dirname, '../md-os/kernel/cognition/task_compiler.js');
    const compiled = spawnSync(process.execPath, ['-e', `const c = require(${JSON.stringify(compiler)}); process.stdout.write(JSON.stringify(c.compileTaskSpec({taskSpecPath:'md-os/ops/tasks/task_a.json',createdAt:'2026-09-12'}).task_spec.problem_core));`], {
      cwd: workspace, env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(compiled.status, 0, compiled.stderr);
    assert.deepEqual(JSON.parse(compiled.stdout), normalizeProblemCore(a.problem_core));
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('comparison retrieval exposes separate meanings without predeclared links or keyword filtering', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-comparison-'));
  try {
    const a = task('a', 'Delivery eligibility'), b = task('b', 'Power supply inspection'), unrelated = task('z', 'Invoice typography');
    a.problem_core.premises.push({ statement: 'The result relies on uninterrupted cold storage.', epistemic_status: 'hypothetical', source_refs: [] });
    b.problem_core.premises.push({ statement: 'The backup generator did not start during the outage.', epistemic_status: 'observed', source_refs: ['md-os/ops/sources/inspection.json'] });
    [a, b, unrelated].forEach(item => writeTask(workspace, item));
    const overview = readProblemContext(workspace);
    assert.deepEqual(overview.problems.map(problem => problem.task_spec_id), ['task_a', 'task_b', 'task_z']);
    assert.ok(overview.problems.every(problem => problem.declared_relation_count === 0));
    assert.equal(overview.problems[1].premises[0].statement, b.problem_core.premises[0].statement);
    assert.equal(overview.relation_discovery, 'host_reasoning_required');
    assert.equal(overview.partial, true);
    const full = readProblemContext(workspace, { task_id: b.task_spec_id });
    assert.deepEqual(full.problems[0].task_spec, b);
    assert.equal(full.partial, false);
    // This tests the input contract, NOT whether a model discovered a link.
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('comparison pages remain byte-bounded, cover every ID and leave sources unchanged', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-pages-'));
  try {
    const tasks = Array.from({ length: 12 }, (_, i) => task(`p${String(i).padStart(2, '0')}`, 'A separate question '.repeat(35)));
    tasks.forEach(item => writeTask(workspace, item));
    let cursor = null;
    const seen = [];
    do {
      const page = readProblemContext(workspace, { after: cursor, maximum_bytes: 2200 });
      assert.ok(Buffer.byteLength(JSON.stringify(page), 'utf8') + 1 <= 2200);
      assert.ok(page.problems.every(problem => problem.partial_fields.includes('goal')));
      seen.push(...page.problems.map(problem => problem.task_spec_id));
      assert.notEqual(page.next_cursor, cursor);
      cursor = page.next_cursor;
    } while (cursor);
    assert.deepEqual(seen, tasks.map(item => item.task_spec_id));
    for (const item of tasks) assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/tasks', `${item.task_spec_id}.json`))), item);
    const result = spawnSync(process.execPath, [path.resolve(__dirname, '../md-os/os/mdos.js'), 'apfc', 'problems', '--task', tasks[0].task_spec_id], {
      cwd: workspace, env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') }, encoding: 'utf8', timeout: 30000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout).problems[0].task_spec, tasks[0]);
  } finally { fs.rmSync(workspace, { recursive: true, force: true }); }
});

test('comparison retrieval cannot cross workspace boundaries or silently skip malformed cores', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-isolation-'));
  const other = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-problem-other-'));
  try {
    const item = task('outside'); writeTask(other, item);
    fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
    fs.symlinkSync(path.join(other, 'md-os/ops/tasks'), path.join(workspace, 'md-os/ops/tasks'));
    assert.throws(() => readProblemContext(workspace), /PATH_ESCAPE/);
    assert.throws(() => readProblemContext(other, { task_id: '../task_outside' }), /ID_INVALID/);
    item.problem_core.state = 'resolved'; writeTask(other, item);
    assert.throws(() => readProblemContext(other), /PROBLEM_CORE_INVALID/);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});
