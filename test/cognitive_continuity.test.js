'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { candidate, workspaceEvidence, verificationInput } = require('./epistemic_unity_test_helper');
const { sealEpistemicUnityCandidate } = require('../md-os/kernel/cognition/epistemic_unity_verifier');
const { buildIntuitiveContext, buildNativeProblemContext, readPatternMemory } = require('../md-os/os/problem_context');
const { expandCompactJson } = require('../md-os/os/problem_compaction');
const { patternId } = require('../md-os/apfc/executive/cognitive_pathfinder');
const runtime = path.resolve(__dirname, '../md-os/os/apfc_cognitive_path_runtime.js');

function setup(t) {
  const data = workspaceEvidence('md-os/ops/evidence');
  t.after(() => fs.rmSync(data.workspace, { recursive: true, force: true }));
  fs.mkdirSync(path.join(data.workspace, 'md-os/ops/tasks'), { recursive: true });
  fs.mkdirSync(path.join(data.workspace, 'md-os/ops/verifications'), { recursive: true });
  fs.writeFileSync(path.join(data.workspace, 'md-os/ops/tasks/task_a.json'), JSON.stringify({
    task_spec_id: 'task_a', goal: 'Check the declared relation', unknowns: ['Outcome remains unknown'],
    required_evidence: [{ path: data.manifest[0].relative_file }],
  }));
  const c = candidate();
  data.input = { task_ids: ['task_a'], principle: c.hypothesis_statement, conditions: c.premises,
    prediction: c.frame_predictions[0].prediction, procedure: ['Read the observation', 'Compare the prediction'] };
  return data;
}

function record(workspace, input) {
  return spawnSync(process.execPath, [runtime, 'record-turn'], { cwd: workspace, encoding: 'utf8',
    input: JSON.stringify(input), timeout: 5000,
    env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') } });
}

function success(result) { assert.equal(result.status, 0, result.stderr); return JSON.parse(result.stdout); }

test('ordinary native context consumes reversible sharing only at a complete encoding win and restores every condition', t => {
  const d = setup(t);
  const repeated = 'Only reuse this procedure with the original target, dependency, observed evidence and acceptance criterion. '.repeat(8);
  success(record(d.workspace, { ...d.input, principle: repeated, prediction: repeated,
    conditions: [repeated, repeated], procedure: [repeated, repeated, repeated] }));
  const id = readPatternMemory(d.workspace).patterns[0].pattern_id;
  const options = { pattern_id: id, maximum_bytes: 32768 };
  const raw = buildIntuitiveContext(d.workspace, options), encoded = buildNativeProblemContext(d.workspace, options);
  assert.equal(encoded.encoding.format, 'json-shared-v1');
  assert.deepEqual(expandCompactJson(encoded.encoding), raw);
  assert.ok(Buffer.byteLength(JSON.stringify(encoded)) < Buffer.byteLength(JSON.stringify(raw)));
  assert.equal(encoded.context_hash, raw.context_hash);
  const schemaCheck = spawnSync('python3', ['-B', '-c', [
    'import json,sys,jsonschema',
    'data=json.load(sys.stdin)',
    'resolver=jsonschema.RefResolver.from_schema(data["schemas"][0],store={s["$id"]:s for s in data["schemas"]})',
    'v=jsonschema.Draft202012Validator(data["schemas"][0],resolver=resolver)',
    'for document in data["documents"]: v.validate(document)',
  ].join('\n')], { input: JSON.stringify({ documents: [raw, encoded], schemas:
    ['native_problem_context', 'intuitive_context'].map(name => JSON.parse(fs.readFileSync(path.resolve(__dirname, `../md-os/schemas/${name}.schema.json`)))) }), encoding: 'utf8' });
  assert.equal(schemaCheck.status, 0, schemaCheck.stderr);
  // Contradiction/state freshness is recomputed before encoding, never cached
  // behind a prior compact representation.
  fs.writeFileSync(path.join(d.workspace, d.manifest[0].relative_file), 'changed evidence');
  const changed = buildNativeProblemContext(d.workspace, options);
  const expanded = changed.encoding ? expandCompactJson(changed.encoding) : changed;
  assert.equal(expanded.memory.patterns[0].status, 'stale');
  assert.notEqual(expanded.context_hash, raw.context_hash);
});

function proof(data, id, change = input => input) {
  const input = verificationInput(data.manifest);
  input.candidate = sealEpistemicUnityCandidate({ ...input.candidate, hypothesis_id: id });
  const reference = 'md-os/ops/verifications/pattern.json';
  fs.writeFileSync(path.join(data.workspace, reference), JSON.stringify(change(input)));
  return reference;
}

test('native proposals survive process restart, retain conditions and procedure order, and never self-promote', t => {
  const d = setup(t);
  const first = success(record(d.workspace, d.input));
  assert.equal(first.verdict, 'unverified');
  assert.equal(first.resolution, 'unverified');
  assert.equal(first.epistemic_verification, null);
  const reader = spawnSync(process.execPath, ['-e',
    'process.stdout.write(JSON.stringify(require(process.argv[1]).buildIntuitiveContext(process.argv[2])))',
    path.resolve(__dirname, '../md-os/os/problem_context.js'), d.workspace], { encoding: 'utf8' });
  const view = success(reader);
  const card = view.memory.patterns[0];
  assert.equal(card.pattern_id, first.pattern_id);
  assert.equal(card.status, 'candidate');
  assert.deepEqual(card.conditions, d.input.conditions);
  assert.deepEqual(card.procedure, d.input.procedure);
  success(record(d.workspace, d.input));
  assert.equal(readPatternMemory(d.workspace).patterns.length, 1);
  assert.ok(Buffer.byteLength(JSON.stringify(view)) + 1 <= 12288);
  for (const bad of [{ ...d.input, verified: true }, { ...d.input, command: 'touch injected' },
    { ...d.input, task_ids: ['../../outside'] }]) assert.notEqual(record(d.workspace, bad).status, 0);
  assert.equal(fs.existsSync(path.join(d.workspace, 'injected')), false);
});

test('source-only and contract changes suspend the affected pattern without erasing the original', t => {
  const d = setup(t);
  const first = success(record(d.workspace, d.input));
  const memoryFile = path.join(d.workspace, first.outputs.memory);
  const before = fs.readFileSync(memoryFile, 'utf8');
  fs.writeFileSync(path.join(d.workspace, d.manifest[0].relative_file), '{"observation":"contradiction"}');
  const view = buildIntuitiveContext(d.workspace);
  assert.equal(view.memory.patterns[0].status, 'stale');
  assert.equal(view.memory.patterns[0].review_required, true);
  assert.deepEqual(view.memory.patterns[0].task_ids, ['task_a']);
  assert.equal(fs.readFileSync(memoryFile, 'utf8'), before);
  const updated = success(record(d.workspace, d.input));
  assert.notEqual(first.pattern_id, updated.pattern_id);
  assert.equal(readPatternMemory(d.workspace).patterns.length, 2);
  const taskFile = path.join(d.workspace, 'md-os/ops/tasks/task_a.json');
  const task = JSON.parse(fs.readFileSync(taskFile)); task.goal = 'A changed acceptance goal';
  fs.writeFileSync(taskFile, JSON.stringify(task));
  assert.ok(readPatternMemory(d.workspace).patterns.every(card => card.status === 'stale'));
});

test('only a recomputed, exact-pattern verification supports reuse, and changed evidence revokes it', t => {
  const d = setup(t);
  const first = success(record(d.workspace, d.input));
  const reference = proof(d, first.pattern_id);
  const verified = success(record(d.workspace, { ...d.input, verification_request_file: reference }));
  assert.equal(verified.verdict, 'verified_learning');
  assert.equal(verified.epistemic_verification.status, 'supported_bounded');
  assert.equal(verified.resolution, 'unverified');
  assert.equal(readPatternMemory(d.workspace).patterns[0].status, 'verified');
  success(record(d.workspace, d.input));
  assert.equal(readPatternMemory(d.workspace).patterns[0].status, 'verified');
  const memory = JSON.parse(fs.readFileSync(path.join(d.workspace, verified.outputs.memory)));
  const schemaCheck = spawnSync('python3', ['-B', '-c',
    'import json,sys,jsonschema,pathlib; p=pathlib.Path("md-os/schemas/apfc_cognitive_anchor_memory.schema.json").resolve(); s=json.load(p.open()); refs=[json.load(f.open()) for f in p.parent.glob("*.schema.json")]; store={r["$id"]:r for r in refs if "$id" in r}; jsonschema.validate(json.load(sys.stdin),s,resolver=jsonschema.RefResolver(p.as_uri(),s,store=store))'],
  { cwd: path.resolve(__dirname, '..'), encoding: 'utf8', input: JSON.stringify(memory) });
  assert.equal(schemaCheck.status, 0, schemaCheck.stderr);
  fs.writeFileSync(path.join(d.workspace, d.manifest[1].relative_file), '{"changed":true}');
  assert.equal(readPatternMemory(d.workspace).patterns[0].status, 'stale');
  const invalid = success(record(d.workspace, { ...d.input, verification_request_file: reference }));
  assert.equal(invalid.verdict, 'unverified');
  assert.notEqual(invalid.epistemic_verification.status, 'supported_bounded');
  assert.equal(readPatternMemory(d.workspace).patterns[0].review_required, true);
});

test('unrelated proofs, symlinked evidence and memory aliases cannot authorize promotion', t => {
  const d = setup(t);
  const journal = path.join(d.workspace, 'md-os/ops/journal.ndjson');
  const missingTarget = path.join(d.workspace, 'must_not_be_created.ndjson');
  fs.symlinkSync(missingTarget, journal);
  assert.match(record(d.workspace, d.input).stderr, /PATH_INVALID/);
  assert.equal(fs.existsSync(missingTarget), false);
  fs.unlinkSync(journal);
  const first = success(record(d.workspace, d.input));
  const reference = proof(d, 'unrelated_hypothesis');
  assert.match(record(d.workspace, { ...d.input, verification_request_file: reference }).stderr, /PATTERN_MISMATCH/);
  proof(d, first.pattern_id);
  const source = path.join(d.workspace, d.manifest[1].relative_file);
  fs.renameSync(source, source + '.original'); fs.symlinkSync(source + '.original', source);
  assert.match(record(d.workspace, { ...d.input, verification_request_file: reference }).stderr, /SOURCE_INVALID/);
  const memoryFile = path.join(d.workspace, first.outputs.memory);
  fs.renameSync(memoryFile, memoryFile + '.original'); fs.symlinkSync(memoryFile + '.original', memoryFile);
  assert.match(record(d.workspace, d.input).stderr, /PATH_INVALID/);
  assert.throws(() => readPatternMemory(d.workspace), /SOURCE_INVALID/);
});

test('native turn closure receives the real bounded report and rechecks it after later evidence changes', t => {
  const d = setup(t);
  const first = success(record(d.workspace, d.input));
  const reference = proof(d, first.pattern_id);
  const verified = success(record(d.workspace, { ...d.input, verification_request_file: reference }));
  const close = () => {
    const result = spawnSync('python3', ['-B', '-c', [
      'import json,sys', 'from pathlib import Path', 'sys.path.insert(0,"test")', 'from test_mdos_shell import ENGINE',
      'data=json.load(sys.stdin); root=Path(data["root"])',
      'frame=ENGINE.build_apfc_turn_frame("Check task_a",ENGINE.ApfcInputContext("",(),()),root,None)',
      'receipt=ENGINE.write_apfc_turn_receipt(frame,status="completed",output="Bounded observation",decisions=[],observed_actions=[],cognitive_learning_results=[data["result"]])',
      'print(receipt.read_text().splitlines()[-1])',
    ].join('\n')], { cwd: path.resolve(__dirname, '..'), encoding: 'utf8',
      input: JSON.stringify({ root: d.workspace, result: verified }), timeout: 5000 });
    return success(result);
  };
  const supported = close();
  assert.equal(supported.causal_unity_transition.epistemic_status, 'verified_bounded');
  assert.equal(supported.cognitive_learning[0].epistemic_verification.verification_hash, verified.epistemic_verification.verification_hash);
  assert.equal(supported.verification_contract.verdict, 'unknown');
  assert.deepEqual(supported.verified_claims, []);
  fs.writeFileSync(path.join(d.workspace, d.manifest[1].relative_file), '{"contradiction":true}');
  const stale = close();
  assert.equal(stale.causal_unity_transition.epistemic_status, 'unverified');
  assert.equal(stale.cognitive_learning[0].current_pattern_status, 'stale');
  assert.equal(stale.cognitive_learning[0].epistemic_verification, null);
});

test('first-call proof cannot bypass prior candidate persistence', t => {
  const d = setup(t);
  const first = success(record(d.workspace, d.input));
  const memoryFile = path.join(d.workspace, first.outputs.memory);
  const memory = JSON.parse(fs.readFileSync(memoryFile)); memory.anchors = [];
  fs.writeFileSync(memoryFile, JSON.stringify(memory));
  const reference = proof(d, first.pattern_id);
  assert.match(record(d.workspace, { ...d.input, verification_request_file: reference }).stderr, /MUST_BE_RECORDED/);
  assert.deepEqual(JSON.parse(fs.readFileSync(memoryFile)).anchors, []);
});

test('large patterns remain discoverable and fully recoverable without exceeding the chosen context budget', t => {
  const d = setup(t);
  success(record(d.workspace, { ...d.input, procedure: Array.from({ length: 8 }, () => 'x'.repeat(1024)) }));
  const card = buildIntuitiveContext(d.workspace).memory.patterns[0];
  assert.equal(card.partial, true);
  const full = buildIntuitiveContext(d.workspace, { pattern_id: card.pattern_id, maximum_bytes: 32768 });
  assert.equal(full.memory.patterns[0].partial, false);
  assert.equal(full.memory.patterns[0].procedure.length, 8);
  assert.ok(Buffer.byteLength(JSON.stringify(full)) + 1 <= 32768);
  const file = path.join(d.workspace, 'md-os/ops/apfc/cognitive/pathfinding/anchor_memory.json');
  const memory = JSON.parse(fs.readFileSync(file));
  const original = memory.anchors[0];
  memory.anchors = Array.from({ length: 12 }, (_, i) => {
    const working_pattern = { ...original.working_pattern, principle: `Distinct pattern ${i}` };
    working_pattern.pattern_id = patternId(working_pattern);
    return { ...original, anchor_id: working_pattern.pattern_id, working_pattern };
  });
  fs.writeFileSync(file, JSON.stringify(memory));
  let after = null; const ids = new Set();
  do {
    const page = readPatternMemory(d.workspace, { after });
    for (const item of page.patterns) { assert.equal(ids.has(item.pattern_id), false); ids.add(item.pattern_id); }
    after = page.next_cursor;
  } while (after);
  assert.equal(ids.size, 12);
});
