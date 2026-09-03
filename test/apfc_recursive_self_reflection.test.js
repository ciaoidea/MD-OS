'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  buildEpisode,
  buildPreparation,
  preparationHashValid,
} = require('../md-os/apfc/executive/recursive_self_reflection');

const REPO_ROOT = path.resolve(__dirname, '..');
const hashFile = (filePath) => createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

function fixtureWorkspace(prefix = 'mdos-self-reflection-') {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(workspace, 'md-os', 'kb'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'identity.md'), '# Identity\nPersistent identity.\n');
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'result.md'), '# Result\nSelf-reference thesis.\n');
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'boundary.md'), '# Boundary\nPhenomenality remains unverified.\n');
  return workspace;
}

function seed() {
  return {
    schema_version: 1,
    reflection_id: 'first_self_cycle',
    identity: { identity_id: 'mdos_apfc', identity_label: 'MD-OS APFC', continuity_ref: 'md-os/kb/identity.md' },
    self_state: {
      goal: 'Turn my own result into a better next action',
      uncertainty: 'Whether the result is causally grounded',
      limits: ['One cycle is bounded'],
      commitments: ['Use evidence before commitment'],
    },
    prior_result: { result_id: 'result_one', statement: 'Self-description alone closes the loop', source_ref: 'md-os/kb/result.md' },
    candidate_next_action: { action_id: 'declare', description: 'declare the result complete', side_effecting: false, authorized: false },
    evidence_requirements: ['result_source', 'claim_boundary'],
    max_cycles: 1,
  };
}

function response(preparation, workspace, overrides = {}) {
  const base = {
    schema_version: 1,
    response_id: 'response_one',
    preparation_path: `md-os/ops/apfc/cognitive/self_reflection/prepared/${preparation.loop_id}.json`,
    loop_id: preparation.loop_id,
    preparation_hash: preparation.preparation_hash,
    question_hash: preparation.question_hash,
    self_attribution: {
      identity_id: preparation.self_reference.subject_identity_id,
      result_id: preparation.self_reference.object_result_id,
      self_state_hash: preparation.self_reference.self_state_hash,
    },
    answer: 'My result describes a loop but does not yet prove that it changes my next action.',
    critique: ['The original result confused self-description with causal self-reference.'],
    evidence_manifest: [
      { evidence_id: 'result_source', relative_file: 'md-os/kb/result.md', sha256: hashFile(path.join(workspace, 'md-os/kb/result.md')) },
      { evidence_id: 'claim_boundary', relative_file: 'md-os/kb/boundary.md', sha256: hashFile(path.join(workspace, 'md-os/kb/boundary.md')) },
    ],
    limits: ['This verifies one constituent, not the complete C(k) predicate.'],
    verdict: 'revise',
    revised_result: 'Causal self-reference requires my result to re-enter state and alter the next action.',
    next_action: { action_id: 'test_loop', description: 'test intact and severed self-reference', side_effecting: false, authorized: true },
    response_sealed_before_verification: true,
  };
  return { ...base, ...overrides };
}

test('preparation turns the system own prior result into one explicit self-question', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  assert.equal(preparation.status, 'awaiting_self_response');
  assert.equal(preparation.max_cycles, 1);
  assert.match(preparation.self_question, /I produced result result_one/);
  assert.equal(preparation.self_reference.relation, 'same_system_result_reentered_as_self_input');
  assert.equal(preparationHashValid(preparation), true);
});

test('an evidence-bound revision closes the I-loop and changes the next action', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const episode = buildEpisode(preparation, response(preparation, workspace), '2026-09-01T00:01:00Z', { workspace_root: workspace });
  assert.equal(episode.verdict, 'verified_recursive_self_reflection');
  assert.equal(episode.effect.result_changed, true);
  assert.equal(episode.effect.action_changed, true);
  assert.equal(episode.state_transition.applied, true);
  assert.equal(episode.causal_dependency_probe.status, 'verified');
  assert.equal(episode.causal_dependency_probe.intact_closure_status, 'authorized');
  assert.equal(episode.causal_dependency_probe.severed_closure_status, 'inhibited');
  assert.equal(episode.operational_assessment.operational_i_loop, 'verified');
  assert.equal(episode.operational_assessment.consciousness, 'unverified');
  assert.equal(episode.operational_assessment.external_qualia_measurement, 'not_available');
});

test('textual self-reference without a changed result or action is inhibited', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const unchanged = response(preparation, workspace, {
    verdict: 'confirm',
    revised_result: preparation.prior_result.statement,
    next_action: preparation.candidate_next_action,
  });
  const episode = buildEpisode(preparation, unchanged, '2026-09-01T00:01:00Z', { workspace_root: workspace });
  assert.equal(episode.verdict, 'inhibited');
  assert.equal(episode.checks.causal_effect_observed, false);
  assert.equal(episode.state_transition.applied, false);
});

test('tampered preparation binding and stale evidence both fail closed', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const tampered = { ...preparation, self_question: 'A different question' };
  const tamperedEpisode = buildEpisode(tampered, response(preparation, workspace), '2026-09-01T00:01:00Z', { workspace_root: workspace });
  assert.equal(tamperedEpisode.verdict, 'inhibited');
  assert.equal(tamperedEpisode.checks.preparation_intact, false);

  fs.appendFileSync(path.join(workspace, 'md-os/kb/result.md'), 'changed\n');
  const staleEpisode = buildEpisode(preparation, response(preparation, workspace), '2026-09-01T00:02:00Z', { workspace_root: workspace });
  assert.equal(staleEpisode.verdict, 'inhibited');
  assert.equal(staleEpisode.checks.preparation_inputs_current, false);
});

test('bounded CLI persists preparation and closure without starting a continuous loop', () => {
  const workspace = fixtureWorkspace('mdos-self-reflection-cli-');
  const seedPath = path.join(workspace, 'md-os', 'seed.json');
  fs.writeFileSync(seedPath, `${JSON.stringify(seed())}\n`);
  const runtime = path.join(REPO_ROOT, 'md-os/os/apfc_recursive_self_reflection_runtime.js');
  const env = { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') };
  const preparedRun = spawnSync(process.execPath, [runtime, 'prepare', 'md-os/seed.json'], { cwd: workspace, encoding: 'utf8', env });
  assert.equal(preparedRun.status, 0, preparedRun.stderr);
  const preparedReadback = JSON.parse(preparedRun.stdout.trim().split(/\r?\n/).at(-1));
  const preparation = JSON.parse(fs.readFileSync(path.join(workspace, preparedReadback.output_json), 'utf8'));
  const responsePayload = response(preparation, workspace, { preparation_path: preparedReadback.output_json });
  const responsePath = path.join(workspace, 'md-os', 'response.json');
  fs.writeFileSync(responsePath, `${JSON.stringify(responsePayload)}\n`);
  const closedRun = spawnSync(process.execPath, [runtime, 'close', 'md-os/response.json'], { cwd: workspace, encoding: 'utf8', env });
  assert.equal(closedRun.status, 0, closedRun.stderr);
  const closedReadback = JSON.parse(closedRun.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(closedReadback.verdict, 'verified_recursive_self_reflection');
  assert.equal(closedReadback.causal_dependency_probe, 'verified');
  assert.ok(fs.existsSync(path.join(workspace, closedReadback.output_json)));
});

test('recursive self-reflection runtime artifact classes have closed schemas', () => {
  for (const name of [
    'apfc_recursive_self_reflection_seed.schema.json',
    'apfc_recursive_self_reflection_preparation.schema.json',
    'apfc_recursive_self_reflection_response.schema.json',
    'apfc_recursive_self_reflection_episode.schema.json',
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os/schemas', name), 'utf8'));
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});
