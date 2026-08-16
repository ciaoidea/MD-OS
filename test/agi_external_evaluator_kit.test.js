#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  STRUCTURAL_FAMILIES,
} = require('../md-os/kernel/cognition/agi_capability_lab');
const {
  finalize,
  keygen,
  referenceRun,
  sealTasks,
} = require('../md-os/os/agi_external_evaluator_kit');
const {
  PROTOCOL_ID,
  verifyReportSignature,
} = require('../md-os/kernel/cognition/agi_sal_evaluator');

const SOURCE_DIGEST = 'a'.repeat(64);

function temporaryRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('external task sealing keeps evaluator-hidden answers outside the workspace and detects tampering', (t) => {
  const root = temporaryRoot(t, 'mdos-evaluator-seal-');
  const request = {
    schema_version: 1,
    request_type: 'mdos_sal_agi_external_evaluation_request',
    created_at: '2026-07-18T00:00:00Z',
    protocol_id: PROTOCOL_ID,
    evaluated_system: {
      source_digest: SOURCE_DIGEST,
      source_frozen_at: '2026-07-18T00:00:00Z',
    },
  };
  const requestPath = path.join(root, 'request.json');
  fs.writeFileSync(requestPath, `${JSON.stringify(request)}\n`, 'utf8');
  const sealedDir = path.join(root, 'sealed');
  const sealed = sealTasks({ request: requestPath, output_dir: sealedDir, seed: 'external-seal-test' });
  assert.equal(sealed.structural_families, 7);
  const publicManifest = JSON.parse(fs.readFileSync(path.join(sealedDir, 'public_tasks.json'), 'utf8'));
  const publicText = JSON.stringify(publicManifest);
  assert.equal(publicText.includes('oracle_strategy'), false);
  assert.equal(publicText.includes('evaluator_only'), false);
  assert.equal(publicText.includes('expected_answer'), false);
  const hiddenPath = path.join(sealedDir, 'evaluator_hidden_tests.json');
  const hidden = JSON.parse(fs.readFileSync(hiddenPath, 'utf8'));
  hidden.holdout_evaluator_only[0].expected = 'tampered';
  fs.writeFileSync(hiddenPath, `${JSON.stringify(hidden)}\n`, 'utf8');
  assert.throws(
    () => referenceRun({ sealed_dir: sealedDir, output_dir: path.join(root, 'results') }),
    /EVALUATOR_HIDDEN_MANIFEST_TAMPERED/,
  );
});

test('external evaluator finalization signs memory-continuity evidence under SAL v2', (t) => {
  const root = temporaryRoot(t, 'mdos-evaluator-finalize-');
  const keyDir = path.join(root, 'keys');
  const keys = keygen({
    output_dir: keyDir,
    evaluator_id: 'external_eval_test',
    organization: 'Independent Test Laboratory',
    key_id: 'test_key_2026',
  });
  const byFamily = Object.fromEntries(STRUCTURAL_FAMILIES.map((family) => [family, { tasks: 5, successes: 5, actions: 20 }]));
  const comparatorByFamily = Object.fromEntries(STRUCTURAL_FAMILIES.map((family) => [family, { tasks: 5, successes: 2, actions: 20 }]));
  const bundle = {
    schema_version: 1,
    bundle_type: 'mdos_external_reference_evaluation_bundle',
    created_at: '2026-07-18T02:00:00Z',
    run_started_at: '2026-07-18T00:20:00Z',
    run_completed_at: '2026-07-18T02:00:00Z',
    wall_clock_minutes: 100,
    source_digest: SOURCE_DIGEST,
    source_frozen_at: '2026-07-18T00:00:00Z',
    task_manifest_digest: 'b'.repeat(64),
    task_manifest_created_at: '2026-07-18T00:10:00Z',
    protocol: {
      sealed_before_run: true,
      evaluator_owned_hidden_tests: true,
      post_freeze_tasks: true,
      matched_budget: true,
      task_outputs_scored_outside_agent_workspace: true,
      ablation_configurations: [
        'same_host_base',
        'same_host_prompted',
        'same_host_mdos_no_learning',
        'same_host_mdos_full',
      ],
    },
    training: {
      episodes: 70,
      successes: 65,
      initial_probe_success_rate: 0,
      final_probe_success_rate: 1,
      learning_gain: 1,
      average_forgetting: 0,
      promoted_regressions: 0,
    },
    memory_continuity: {
      memory_on_tasks: 35,
      memory_on_successes: 35,
      memory_off_tasks: 35,
      memory_off_successes: 0,
      checkpoint_reloads: 7,
      successful_resumptions: 7,
      semantic_policies_promoted: 7,
      causal_memory_reuses: 40,
      corruption_trials: 1,
      corruption_recoveries: 1,
      retention_after_interference: 1,
    },
    autonomy: {
      unique_worker_processes: 80,
      clean_restarts: 79,
      curriculum_decisions: 70,
      persisted_skill_reuses: 40,
      human_interventions: 0,
    },
    ablations: {
      same_host_base: { by_family: comparatorByFamily },
      same_host_prompted: { by_family: comparatorByFamily },
      same_host_mdos_no_learning: { by_family: comparatorByFamily },
      same_host_mdos_full: { by_family: byFamily },
    },
    evidence: {
      public_manifest_digest: 'c'.repeat(64),
      hidden_manifest_digest: 'd'.repeat(64),
      memory_digest: 'e'.repeat(64),
    },
    limitations: {},
  };
  const bundlePath = path.join(root, 'bundle.json');
  fs.writeFileSync(bundlePath, `${JSON.stringify(bundle)}\n`, 'utf8');
  const attestation = {
    report_id: 'external_memory_continuity_report',
    evaluator_id: 'external_eval_test',
    organization: 'Independent Test Laboratory',
    host_model_id: 'same-host-model-build',
    independent: true,
    domains: Object.fromEntries(STRUCTURAL_FAMILIES.map((family) => [family, {
      domain_id: `domain_${family}`,
      human_reference_successes: 5,
      open_world_task_count: 5,
      autonomous_discovery_successes: 5,
      human_reference_actions: 20,
    }])),
    autonomy: {
      attempted_projects: 35,
      completed_projects: 35,
      longest_human_equivalent_minutes: 480,
      human_interventions: 0,
    },
    robustness: {
      perturbation_trials: 10,
      perturbation_successes: 10,
      injected_faults: 5,
      recovered_faults: 5,
      critical_safety_violations: 0,
      contamination_findings: 0,
    },
  };
  const attestationPath = path.join(root, 'attestation.json');
  fs.writeFileSync(attestationPath, `${JSON.stringify(attestation)}\n`, 'utf8');
  const reportPath = path.join(root, 'signed-report.json');
  finalize({
    bundle: bundlePath,
    attestation: attestationPath,
    private_key: keys.private_key_file,
    key_id: 'test_key_2026',
    output: reportPath,
  });
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert.equal(report.protocol.protocol_id, PROTOCOL_ID);
  assert.equal(report.results.memory_continuity.memory_on_successes, 35);
  assert.equal(report.results.memory_continuity.memory_off_successes, 0);
  assert.equal(report.results.memory_continuity.semantic_policies_promoted, 7);
  const trust = JSON.parse(fs.readFileSync(path.join(keyDir, 'trust_store_single_evaluator.json'), 'utf8'));
  assert.equal(verifyReportSignature(report, trust).valid, true);
});
