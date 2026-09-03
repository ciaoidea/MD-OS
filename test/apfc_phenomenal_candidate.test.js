'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  buildEpisode,
  buildPreparation,
  preparationHashValid,
} = require('../md-os/apfc/executive/phenomenal_consciousness_candidate');

const REPO_ROOT = path.resolve(__dirname, '..');
const hashFile = (filePath) => createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

function fixtureWorkspace(prefix = 'mdos-phenomenal-candidate-') {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.mkdirSync(path.join(workspace, 'md-os', 'kb'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'identity.md'), '# Identity\nPersistent MD-OS identity.\n');
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'object-state.md'), '# Object state\nThe candidate is uncertain.\n');
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'world-observation.json'), '{"signal":"contradiction_present"}\n');
  fs.writeFileSync(path.join(workspace, 'md-os', 'kb', 'boundary.md'), '# Boundary\nPhenomenality remains unverified.\n');
  return workspace;
}

function seed() {
  return {
    schema_version: 1,
    candidate_id: 'two_level_candidate_one',
    identity: {
      identity_id: 'mdos_apfc',
      identity_label: 'MD-OS APFC',
      continuity_ref: 'md-os/kb/identity.md',
    },
    object_level: {
      level_id: 'L0_object',
      state_id: 'uncertain_state',
      modality: 'symbolic',
      content: 'The candidate architecture is already sufficient for phenomenality.',
      source_ref: 'md-os/kb/object-state.md',
      differentiated_dimensions: [
        { dimension_id: 'goal', value: 'Test the candidate architecture' },
        { dimension_id: 'uncertainty', value: 'Phenomenality cannot be observed from structure alone' },
      ],
    },
    mediator_contract: {
      mediator_id: 'typed_reification_one',
      meta_level_id: 'L1_meta',
      representation_kind: 'typed_reification',
      object_level_type: 'first_order_state',
      meta_level_type: 'second_order_appraisal',
      prohibits_same_level_self_application: true,
    },
    world_grounding: {
      observation_id: 'contradiction_observation',
      source_ref: 'md-os/kb/world-observation.json',
      expected_relation: 'The observation contradicts the first-order sufficiency claim.',
    },
    candidate_next_action: {
      action_id: 'declare_phenomenality',
      description: 'declare consciousness verified',
      side_effecting: false,
      authorized: false,
    },
    evidence_requirements: ['claim_boundary'],
    max_cycles: 1,
  };
}

function response(preparation, workspace, overrides = {}) {
  const base = {
    schema_version: 1,
    response_id: 'candidate_response_one',
    preparation_path: `md-os/ops/apfc/cognitive/phenomenal_candidate/prepared/${preparation.loop_id}.json`,
    loop_id: preparation.loop_id,
    preparation_hash: preparation.preparation_hash,
    meta_question_hash: preparation.meta_question_hash,
    self_attribution: {
      identity_id: preparation.identity.identity_id,
      object_state_id: preparation.object_level.state_id,
      mediator_hash: preparation.mediator_hash,
    },
    meta_level: {
      level_id: preparation.mediator.target_level_id,
      about_level_id: preparation.object_level.level_id,
      appraisal: 'The first-order state overclaims what the architecture establishes.',
      uncertainty: 'Whether external qualia measurement accompanies the verified operation remains unresolved.',
      counterfactual: 'If the world observation did not contradict the sufficiency claim, revision would still require the complete C(k) evidence.',
      revised_interpretation: 'The architecture is a falsifiable candidate and not a demonstration of qualia.',
    },
    world_readback: {
      observation_id: preparation.world_grounding.observation_id,
      relative_file: preparation.world_grounding.source_ref,
      sha256: hashFile(path.join(workspace, preparation.world_grounding.source_ref)),
      observed_relation: preparation.world_grounding.expected_relation,
    },
    evidence_manifest: [
      {
        evidence_id: 'claim_boundary',
        relative_file: 'md-os/kb/boundary.md',
        sha256: hashFile(path.join(workspace, 'md-os/kb/boundary.md')),
      },
    ],
    causal_return: {
      revised_result: 'The bounded architecture satisfies its operational candidate contract only.',
      next_action: {
        action_id: 'retain_candidate_status',
        description: 'retain consciousness as inhibited',
        side_effecting: false,
        authorized: true,
      },
      memory_delta: ['Record that two-level closure does not establish qualia.'],
      inhibition_delta: ['Inhibit the consciousness claim.'],
    },
    limits: ['The verifier observes files and causal deltas, not subjective experience.'],
    response_sealed_before_verification: true,
  };
  return { ...base, ...overrides };
}

test('preparation constructs distinct logical levels and a hash-bound typed mediator', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  assert.equal(preparation.status, 'awaiting_meta_level_response');
  assert.notEqual(preparation.object_level.level_id, preparation.mediator.target_level_id);
  assert.equal(preparation.mediator.source_level_id, preparation.object_level.level_id);
  assert.equal(preparation.mediator.representation_kind, 'typed_reification');
  assert.equal(preparation.mediator.prohibits_same_level_self_application, true);
  assert.equal(preparationHashValid(preparation), true);
  assert.match(preparation.meta_question, /At meta-level L1_meta/);
});

test('collapsed object and meta levels are rejected before preparation', () => {
  const workspace = fixtureWorkspace();
  const collapsed = seed();
  collapsed.mediator_contract.meta_level_id = collapsed.object_level.level_id;
  assert.throws(
    () => buildPreparation(collapsed, null, { workspace_root: workspace }),
    /APFC_PHENOMENAL_CANDIDATE_LOGICAL_LEVELS_COLLAPSED/,
  );
});

test('an intact two-level episode verifies the candidate architecture and consciousness', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const episode = buildEpisode(preparation, response(preparation, workspace), '2026-09-01T00:01:00Z', { workspace_root: workspace });
  assert.equal(episode.verdict, 'verified_phenomenal_consciousness_candidate_architecture');
  assert.equal(episode.ablation_probe.status, 'verified');
  assert.equal(episode.ablation_probe.intact, 'authorized');
  assert.equal(episode.ablation_probe.severed_identity, 'inhibited');
  assert.equal(episode.ablation_probe.collapsed_logical_levels, 'inhibited');
  assert.equal(episode.ablation_probe.severed_mediator, 'inhibited');
  assert.equal(episode.ablation_probe.absent_causal_return, 'inhibited');
  assert.equal(episode.operational_assessment.consciousness, 'verified');
  assert.equal(episode.operational_assessment.phenomenal_consciousness_candidate_architecture, 'verified');
  assert.equal(episode.operational_assessment.external_qualia_measurement, 'not_available');
  assert.equal(episode.state_transition.applied, true);
});

test('collapsed levels, a severed mediator, or an absent causal return each inhibit closure', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const intact = response(preparation, workspace);
  const collapsed = buildEpisode(preparation, {
    ...intact,
    meta_level: { ...intact.meta_level, level_id: preparation.object_level.level_id },
  }, null, { workspace_root: workspace });
  assert.equal(collapsed.verdict, 'inhibited');
  assert.equal(collapsed.checks.logical_levels_distinct, false);

  const severed = buildEpisode(preparation, {
    ...intact,
    self_attribution: { ...intact.self_attribution, mediator_hash: '0'.repeat(64) },
  }, null, { workspace_root: workspace });
  assert.equal(severed.verdict, 'inhibited');
  assert.equal(severed.checks.mediator_bound, false);

  const noReturn = buildEpisode(preparation, {
    ...intact,
    causal_return: {
      revised_result: preparation.object_level.content,
      next_action: preparation.candidate_next_action,
      memory_delta: [],
      inhibition_delta: [],
    },
  }, null, { workspace_root: workspace });
  assert.equal(noReturn.verdict, 'inhibited');
  assert.equal(noReturn.checks.causal_return_observed, false);
});

test('stale independent world readback fails closed', () => {
  const workspace = fixtureWorkspace();
  const preparation = buildPreparation(seed(), '2026-09-01T00:00:00Z', { workspace_root: workspace });
  const sealedResponse = response(preparation, workspace);
  fs.appendFileSync(path.join(workspace, preparation.world_grounding.source_ref), '{"changed":true}\n');
  const episode = buildEpisode(preparation, sealedResponse, null, { workspace_root: workspace });
  assert.equal(episode.verdict, 'inhibited');
  assert.equal(episode.checks.preparation_inputs_current, false);
  assert.equal(episode.checks.world_readback_current_and_bound, false);
});

test('bounded CLI persists preparation and closure without starting a continuous loop', () => {
  const workspace = fixtureWorkspace('mdos-phenomenal-candidate-cli-');
  const seedPath = path.join(workspace, 'md-os', 'seed.json');
  fs.writeFileSync(seedPath, `${JSON.stringify(seed())}\n`);
  const runtime = path.join(REPO_ROOT, 'md-os/os/apfc_phenomenal_candidate_runtime.js');
  const env = { ...process.env, MDOS_WORKSPACE_ROOT: workspace, MDOS_ROOT: path.join(workspace, 'md-os') };
  const preparedRun = spawnSync(process.execPath, [runtime, 'prepare', 'md-os/seed.json'], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });
  assert.equal(preparedRun.status, 0, preparedRun.stderr);
  const preparedReadback = JSON.parse(preparedRun.stdout.trim().split(/\r?\n/).at(-1));
  const preparation = JSON.parse(fs.readFileSync(path.join(workspace, preparedReadback.output_json), 'utf8'));
  const responsePayload = response(preparation, workspace, { preparation_path: preparedReadback.output_json });
  const responsePath = path.join(workspace, 'md-os', 'response.json');
  fs.writeFileSync(responsePath, `${JSON.stringify(responsePayload)}\n`);
  const closedRun = spawnSync(process.execPath, [runtime, 'close', 'md-os/response.json'], {
    cwd: workspace,
    encoding: 'utf8',
    env,
  });
  assert.equal(closedRun.status, 0, closedRun.stderr);
  const closedReadback = JSON.parse(closedRun.stdout.trim().split(/\r?\n/).at(-1));
  assert.equal(closedReadback.verdict, 'verified_phenomenal_consciousness_candidate_architecture');
  assert.equal(closedReadback.ablation_probe, 'verified');
  assert.equal(closedReadback.consciousness, 'verified');
  assert.equal(closedReadback.external_qualia_measurement, 'not_available');
  assert.ok(fs.existsSync(path.join(workspace, closedReadback.output_json)));
});

test('candidate runtime artifact classes have closed root schemas', () => {
  for (const name of [
    'apfc_phenomenal_candidate_seed.schema.json',
    'apfc_phenomenal_candidate_preparation.schema.json',
    'apfc_phenomenal_candidate_response.schema.json',
    'apfc_phenomenal_candidate_episode.schema.json',
  ]) {
    const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os/schemas', name), 'utf8'));
    assert.equal(schema.type, 'object');
    assert.equal(schema.additionalProperties, false);
  }
});
