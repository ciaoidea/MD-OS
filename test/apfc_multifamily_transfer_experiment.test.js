#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
  PRIMITIVES,
  buildDevelopmentEpisodes,
  inducePrimitiveSkills,
  executeLearnedPath,
  buildTrialPrompt,
  verifyMultifamilyTransferExperiment,
} = require('../md-os/kernel/cognition/apfc_multifamily_transfer_experiment');
const {
  TARGET_FAMILIES,
  generateTargetCases,
  oracleForCase,
} = require('../md-os/kernel/cognition/apfc_multifamily_transfer_oracle');
const { buildSkillGraph, assertApfcGraph } = require('../md-os/apfc/executive/graph_projector');
const { compileContextPack, flatRetrieveSkills } = require('../md-os/apfc/executive/context_compiler');
const { sha256Json } = require('../md-os/os/lib/common');

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXED_TIME = '2026-08-13T00:00:00Z';

function fixture() {
  const episodes = buildDevelopmentEpisodes(FIXED_TIME);
  const induction = inducePrimitiveSkills(episodes, FIXED_TIME);
  const sourceManifest = {
    development_episode_hash: sha256Json(episodes),
    induced_skill_bundle_hash: sha256Json(induction.skills),
  };
  const graph = buildSkillGraph(induction.skills, sourceManifest);
  return { episodes, induction, graph };
}

test('verified source families uniquely induce every typed primitive without a target-family skill', () => {
  const { episodes, induction } = fixture();
  assert.equal(episodes.length, 17);
  assert.equal(PRIMITIVES.length, 17);
  assert.equal(induction.skills.length, 17);
  assert.equal(induction.records.every((record) => record.final_hypothesis_count === 1), true);
  const sourceFamilies = new Set(episodes.map((episode) => episode.source_family_id));
  for (const target of TARGET_FAMILIES) assert.equal(sourceFamilies.has(target.family_id), false);
  assert.equal(induction.skills.some((skill) => skill.transfer_contract.source_family_id.startsWith('target_')), false);
});

test('APFCG is deterministic, hash-valid, and contains only verified typed composition edges', () => {
  const first = fixture();
  const second = fixture();
  assertApfcGraph(first.graph);
  assert.equal(sha256Json(first.graph), sha256Json(second.graph));
  assert.equal(first.graph.nodes.length, 17);
  assert.ok(first.graph.edges.length >= 12);
  for (const edge of first.graph.edges) {
    const left = first.graph.nodes.find((node) => node.id === edge.from);
    const right = first.graph.nodes.find((node) => node.id === edge.to);
    assert.equal(left.properties.output_type, right.properties.input_type);
    assert.equal(edge.epistemic_status, 'verified');
  }
});

test('six wholly held-out families compile to unique three-or-more-step paths', () => {
  const { episodes, graph } = fixture();
  const developmentInputHashes = new Set(episodes.flatMap((episode) => (
    episode.examples.map((example) => sha256Json(example.input))
  )));
  const targetCases = generateTargetCases('apfc_multifamily_holdout_audit_v1');
  assert.equal(targetCases.every((targetCase) => !developmentInputHashes.has(sha256Json(targetCase.input))), true);
  for (const family of TARGET_FAMILIES) {
    const pack = compileContextPack(graph, {
      task_spec_id: `task_${family.family_id}`,
      family_id: family.family_id,
      domain: family.domain,
      goal: family.goal,
      start_type: family.start_type,
      goal_type: family.goal_type,
    });
    assert.equal(pack.composition.unique_shortest_path, true);
    assert.equal(pack.composition.target_specific_skill_present, false);
    assert.ok(pack.composition.path_skill_ids.length >= 3);
    assert.equal(pack.composition.path_types[0], family.start_type);
    assert.equal(pack.composition.path_types.at(-1), family.goal_type);
  }
});

test('learned graph compositions agree with an independently coded oracle on all sealed-family cases', () => {
  const { graph, induction } = fixture();
  const packs = Object.fromEntries(TARGET_FAMILIES.map((family) => [family.family_id, compileContextPack(graph, {
    task_spec_id: `task_${family.family_id}`,
    family_id: family.family_id,
    domain: family.domain,
    goal: family.goal,
    start_type: family.start_type,
    goal_type: family.goal_type,
  })]));
  const cases = generateTargetCases('apfc_multifamily_unit_test_v1');
  assert.equal(cases.length, 30);
  for (const targetCase of cases) {
    assert.equal(targetCase.expected, oracleForCase(targetCase));
    assert.equal(executeLearnedPath(packs[targetCase.family.family_id], targetCase.input, induction.selected_operators), oracleForCase(targetCase));
  }
});

test('three evaluation conditions preserve the target-family contamination boundary', () => {
  const { graph } = fixture();
  const targetCase = generateTargetCases('apfc_multifamily_unit_test_v2')[0];
  const family = TARGET_FAMILIES.find((item) => item.family_id === targetCase.family.family_id);
  const task = {
    task_spec_id: `task_${family.family_id}`,
    family_id: family.family_id,
    domain: family.domain,
    goal: family.goal,
    start_type: family.start_type,
    goal_type: family.goal_type,
  };
  const pack = compileContextPack(graph, task);
  const flat = flatRetrieveSkills(graph, task, pack.composition.path_skill_ids.length);
  const disabled = buildTrialPrompt(targetCase, 'memory_disabled', pack, flat);
  const flatPrompt = buildTrialPrompt(targetCase, 'flat_memory', pack, flat);
  const graphPrompt = buildTrialPrompt(targetCase, 'apfcg_composed', pack, flat);
  assert.doesNotMatch(disabled, /procedure:/);
  assert.match(flatPrompt, /not ordered/);
  assert.match(graphPrompt, /Apply these steps exactly/);
  assert.doesNotMatch(disabled, /"expected"\s*:/);
  assert.doesNotMatch(flatPrompt, /verified_output/);
  assert.doesNotMatch(graphPrompt, /verified_output/);
});

test('new APFC runtime and experiment classes have explicit schemas', () => {
  for (const fileName of [
    'apfc_graph.schema.json',
    'apfc_context_pack.schema.json',
    'apfc_multifamily_transfer_response.schema.json',
    'apfc_multifamily_transfer_experiment.schema.json',
  ]) {
    const payload = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'md-os', 'schemas', fileName), 'utf8'));
    assert.equal(payload.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(payload.type, 'object');
  }
});

test('persisted real-model multi-family experiment preserves failed and successful versions append-only', () => {
  const v1ReportFile = path.join(
    REPO_ROOT,
    'md-os/ops/agi/learning_experiments/apfc_codex_multifamily_transfer_20260813_v1/report.json'
  );
  if (fs.existsSync(v1ReportFile)) {
    const v1 = verifyMultifamilyTransferExperiment(v1ReportFile);
    assert.equal(v1.ok, false);
    assert.equal(v1.bounded_multifamily_compositional_transfer_supported, false);
  }
  const v2ReportFile = path.join(
    REPO_ROOT,
    'md-os/ops/agi/learning_experiments/apfc_codex_multifamily_transfer_20260813_v2/report.json'
  );
  if (fs.existsSync(v2ReportFile)) {
    const v2 = verifyMultifamilyTransferExperiment(v2ReportFile);
    assert.equal(v2.ok, false);
    assert.equal(v2.bounded_multifamily_compositional_transfer_supported, false);
  }
  const v3ReportFile = path.join(
    REPO_ROOT,
    'md-os/ops/agi/learning_experiments/apfc_codex_multifamily_transfer_20260813_v3/report.json'
  );
  if (!fs.existsSync(v3ReportFile)) return;
  const v3 = verifyMultifamilyTransferExperiment(v3ReportFile);
  assert.equal(v3.ok, true, JSON.stringify(v3.failed_checks));
  assert.equal(v3.receipt_count, 270);
  assert.equal(v3.paired_observation_count_per_comparison, 90);
  assert.equal(v3.held_out_family_count, 6);
  assert.equal(v3.bounded_multifamily_compositional_transfer_supported, true);
});
