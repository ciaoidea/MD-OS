'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { buildIntuitiveContext } = require('../md-os/os/problem_context');

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-intuition-test-'));
  fs.mkdirSync(path.join(root, 'md-os/ops/tasks'), { recursive: true });
  fs.mkdirSync(path.join(root, 'md-os/ops/sources'), { recursive: true });
  for (const id of ['a', 'b', 'c']) {
    const task = { task_spec_id: `task_${id}`, goal: `Distinct problem ${id}`,
      constraints: ['A necessary constraint'], unknowns: ['Real outcome is unknown'],
      acceptance_tests: [{ test_id: 'external_check' }],
      problem_core: { state: 'candidate', premises: [{ statement: 'A recorded condition',
        epistemic_status: 'observed', source_refs: [`md-os/ops/sources/${id}.json`] }], relations: [] } };
    fs.writeFileSync(path.join(root, `md-os/ops/tasks/task_${id}.json`), JSON.stringify(task));
    fs.writeFileSync(path.join(root, `md-os/ops/sources/${id}.json`), JSON.stringify({ observation: id }));
  }
  return root;
}

test('orientation supplies separate meanings and evidence without predeclared semantic edges', () => {
  const root = fixture();
  try {
    const r = buildIntuitiveContext(root);
    assert.equal(r.status, 'working_context_not_verified');
    assert.equal(r.direction, null);
    assert.equal(r.general.problems.length, 3);
    assert.equal(r.general.source_evidence.filter(x => x.status === 'read').length, 3);
    assert.ok(r.general.problems.every(p => p.declared_relation_count === 0));
    assert.ok(Buffer.byteLength(JSON.stringify(r)) + 1 <= 12288);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('model-chosen focus preserves full contracts and other problem cores without promoting intuition', () => {
  const root = fixture();
  try {
    const direction = { obstacle: 'Potentially incompatible requirements', hypothesis: 'These two problems may share a precondition', discriminator: 'Compare the actual conditions in both source records' };
    const r = buildIntuitiveContext(root, { task_ids: ['task_a', 'task_b'], direction });
    assert.equal(r.direction.status, 'hypothesis');
    assert.equal(r.direction.authority, 'none');
    assert.equal(r.general.problems.length, 3);
    assert.equal(r.focus.length, 2);
    for (const f of r.focus) {
      const card = f.problems[0];
      assert.deepEqual(card.task_spec, JSON.parse(fs.readFileSync(path.join(root, card.source_path))));
      assert.equal(f.source_evidence[0].status, 'read');
    }
    assert.equal(r.general.partial, true);
    assert.ok(Buffer.byteLength(JSON.stringify(r)) + 1 <= 12288);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('source-only changes invalidate readback and no context read writes knowledge', () => {
  const root = fixture();
  try {
    const before = fs.readFileSync(path.join(root, 'md-os/ops/tasks/task_a.json'), 'utf8');
    const a = buildIntuitiveContext(root, { task_ids: ['task_a'] });
    fs.writeFileSync(path.join(root, 'md-os/ops/sources/a.json'), '{"observation":"contradiction"}');
    const b = buildIntuitiveContext(root, { task_ids: ['task_a'] });
    assert.notEqual(a.context_hash, b.context_hash);
    assert.equal(b.focus[0].problems[0].task_spec.problem_core.state, 'candidate');
    assert.equal(fs.readFileSync(path.join(root, 'md-os/ops/tasks/task_a.json'), 'utf8'), before);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('orientation rejects ambiguous scopes, executable inputs, false certainty and oversized directions', () => {
  const root = fixture();
  try {
    for (const options of [null, [], { after: ['task_a'] }, { task_ids: ['task_a'], after: 'task_a' }, { task_ids: ['../../outside'] },
      { task_ids: ['task_a', 'task_a'] }, { maximum_bytes: 33000 }, { command: 'touch anything' },
      { direction: { obstacle: 'x', hypothesis: 'x', discriminator: 'x', verified: true } },
      { direction: { obstacle: 'x', hypothesis: 'x'.repeat(513), discriminator: 'x' } }]) {
      assert.throws(() => buildIntuitiveContext(root, options), /INVALID/);
    }
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('orientation schema accepts general and focus but rejects promoted intuition', () => {
  const root = fixture();
  try {
    const values = [buildIntuitiveContext(root), buildIntuitiveContext(root, { task_ids: ['task_a'],
      direction: { obstacle: 'Unknown compatibility', hypothesis: 'Shared precondition', discriminator: 'Compare evidence' } })];
    const result = spawnSync('python3', ['-B', '-c', [
      'import json,sys,jsonschema',
      's=json.load(open("md-os/schemas/intuitive_context.schema.json"))',
      'jsonschema.Draft202012Validator.check_schema(s)',
      'v=jsonschema.Draft202012Validator(s); values=json.load(sys.stdin)',
      'for value in values: v.validate(value)',
      'values[1]["direction"]["status"]="verified"',
      'assert list(v.iter_errors(values[1]))',
    ].join('\n')], { cwd: path.resolve(__dirname, '..'), input: JSON.stringify(values), encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a task directory alias cannot expose private local data even inside the workspace', () => {
  const root = fixture();
  try {
    const dir = path.join(root, 'md-os/ops/tasks');
    const privateDir = path.join(root, 'md-os/ops/local');
    fs.renameSync(dir, privateDir);
    fs.symlinkSync(privateDir, dir);
    assert.throws(() => buildIntuitiveContext(root), /SOURCE_INVALID/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
