'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { REFLECTION_OPERATIONS, routeCognitiveIntent } = require('../md-os/apfc/executive/cognitive_intent_router');

function pathRequest() {
  return {
    schema_version: 1,
    request_id: 'multilingual_reflection',
    theme_id: 'apfc_fixture',
    theme: 'Develop artificial critical judgment',
    focus: 'Test the decisive uncertainty',
    verified_facts: ['The claim requires readback'],
    uncertainties: [{ uncertainty_id: 'unc_claim', semantic_intent: 'test_claim', question: 'Does evidence support the claim?', goal_impact: 1, information_gain: 1, reducibility: 1, blocking: true }],
    actions: [{ action_id: 'inspect_evidence', addresses_uncertainty_ids: ['unc_claim'], expected_progress: 0.9, information_gain: 1, authorized: true, previously_falsified: false, cost: { tokens: 100, time_ms: 100, action_count: 1, risk: 0 } }],
    readback: { verdict: 'pass', action_id: 'inspect_evidence', evidence_refs: ['fixture:evidence'], learned_fact: 'Evidence supports the bounded claim', learned_correction: 'Require the same evidence gate', confidence: 0.9 },
  };
}

function envelope(source_language, source_text, overrides = {}) {
  return {
    schema_version: 1,
    source_language,
    source_text,
    classification: {
      cognitive_intent: 'critical_reflection',
      problem_relevant: true,
      verification_required: true,
      autonomy: 'single_bounded_cycle',
      confidence: 0.95,
      operations: [...REFLECTION_OPERATIONS],
      ...(overrides.classification || {}),
    },
    path_request: pathRequest(),
  };
}

test('equivalent normalized intents route identically across languages without keyword matching', () => {
  const inputs = [
    envelope('it', 'Metti in dubbio questa ipotesi e verificala.'),
    envelope('en', 'Question this hypothesis and verify it.'),
    envelope('es', 'Cuestiona esta hipótesis y compruébala.'),
    envelope('ja', 'この仮説を批判的に検証してください。'),
  ];
  const decisions = inputs.map(routeCognitiveIntent);
  assert.ok(decisions.every((item) => item.accepted));
  assert.ok(decisions.every((item) => item.route === 'apfc_cognitive_reflect'));
  assert.ok(decisions.every((item) => JSON.stringify(item.operations) === JSON.stringify(REFLECTION_OPERATIONS)));
});

test('generic opinion is not misrouted to critical reflection', () => {
  const decision = routeCognitiveIntent(envelope('it', 'Cosa ne pensi del film?', { classification: { cognitive_intent: 'opinion', problem_relevant: false, verification_required: false, autonomy: 'none' } }));
  assert.equal(decision.accepted, false);
  assert.equal(decision.route, 'ordinary_response');
  assert.ok(decision.rejection_reasons.includes('intent_not_critical_reflection'));
});

test('continuous autonomous reflection is inhibited', () => {
  const decision = routeCognitiveIntent(envelope('en', 'Think forever without stopping.', { classification: { autonomy: 'continuous' } }));
  assert.equal(decision.accepted, false);
  assert.ok(decision.rejection_reasons.includes('unbounded_autonomy_forbidden'));
});

test('public semantic route executes exactly one bounded persistent cycle', () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-apfc-intent-'));
  fs.mkdirSync(path.join(workspace, 'md-os', 'ops'), { recursive: true });
  const intentPath = path.join(workspace, 'intent.json');
  fs.writeFileSync(intentPath, `${JSON.stringify(envelope('it', 'Esponi il dubbio decisivo e verificalo.'))}\n`);
  const runtime = path.resolve(__dirname, '../md-os/os/apfc_cognitive_intent_runtime.js');
  const result = spawnSync(process.execPath, [runtime, 'route-once', 'intent.json'], { cwd: workspace, encoding: 'utf8', env: { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') } });
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(payload.accepted, true);
  assert.equal(payload.executed, true);
  assert.equal(payload.execution.verdict, 'verified_learning');
  assert.ok(fs.existsSync(path.join(workspace, payload.execution.outputs.cycle)));
  assert.equal(fs.readdirSync(path.join(workspace, 'md-os/ops/apfc/cognitive/pathfinding/cycles')).length, 1);
  assert.equal(fs.readdirSync(workspace).filter((name) => name.startsWith('.cogroute_')).length, 0);
});
