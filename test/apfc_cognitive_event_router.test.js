'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { routeCognitiveEvent } = require('../md-os/apfc/executive/cognitive_event_router');

const REPO_ROOT = path.resolve(__dirname, '..');

function pathRequest() {
  return {
    schema_version: 1,
    request_id: 'event_reflection',
    theme_id: 'apfc_fixture',
    theme: 'Correct a postcondition mismatch',
    focus: 'Find the failed assumption',
    verified_facts: ['Expected and observed results differ'],
    uncertainties: [{ uncertainty_id: 'unc_mismatch', semantic_intent: 'explain_mismatch', question: 'Which assumption failed?', goal_impact: 1, information_gain: 1, reducibility: 1, blocking: true }],
    actions: [{ action_id: 'inspect_readback', addresses_uncertainty_ids: ['unc_mismatch'], expected_progress: 1, information_gain: 1, authorized: true, previously_falsified: false, cost: { tokens: 10, time_ms: 10, action_count: 1, risk: 0 } }],
    readback: { verdict: 'pass', action_id: 'inspect_readback', evidence_refs: ['fixture:readback'], learned_fact: 'The postcondition mismatch identifies the failed assumption', learned_correction: 'Require expected-observed comparison', confidence: 0.9 },
  };
}

function event(overrides = {}) {
  return { schema_version: 1, event_id: 'fixture_readback', event_type: 'postcondition_readback', expected: { tests_passing: 12 }, observed: { tests_passing: 11 }, problem_relevant: true, verification_required: true, autonomy: 'single_bounded_cycle', path_request: pathRequest(), ...overrides };
}

test('expected-observed mismatch triggers one bounded critical reflection', () => {
  const decision = routeCognitiveEvent(event());
  assert.equal(decision.accepted, true);
  assert.equal(decision.route, 'apfc_cognitive_reflect');
  assert.equal(decision.trigger, 'expected_observed_mismatch');
});

test('matching readback does not trigger reflection', () => {
  const decision = routeCognitiveEvent(event({ observed: { tests_passing: 12 } }));
  assert.equal(decision.accepted, false);
  assert.ok(decision.rejection_reasons.includes('readback_matches_expectation'));
});

test('continuous event-driven reflection remains inhibited', () => {
  const decision = routeCognitiveEvent(event({ autonomy: 'continuous' }));
  assert.equal(decision.accepted, false);
  assert.ok(decision.rejection_reasons.includes('unbounded_autonomy_forbidden'));
});

test('public event command executes exactly one verified reflection cycle', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-apfc-event-'));
  fs.mkdirSync(path.join(workspace, 'md-os', 'ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'event.json'), `${JSON.stringify(event())}\n`);
  const runtime = path.join(REPO_ROOT, 'md-os/os/apfc_cognitive_intent_runtime.js');
  const result = spawnSync(process.execPath, [runtime, 'route-event-once', 'event.json'], { cwd: workspace, encoding: 'utf8', env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') } });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.accepted, true);
  assert.equal(payload.executed, true);
  assert.equal(payload.execution.verdict, 'verified_learning');
  assert.equal(fs.readdirSync(path.join(workspace, 'md-os/ops/apfc/cognitive/pathfinding/cycles')).length, 1);
});
