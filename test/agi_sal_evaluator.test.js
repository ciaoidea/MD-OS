#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  REQUIRED_ABLATION_CONFIGURATIONS,
  buildExternalScore,
  buildInternalScore,
  loadExternalReports,
  loadTrustStore,
  signReport,
  verifyReportSignature,
} = require('../md-os/kernel/cognition/agi_sal_evaluator');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'md-os/os/mdos.js');
const PERFECT_SOURCE_DIGEST = 'a'.repeat(64);

function keyPair(evaluatorId, organization, keyId) {
  const pair = crypto.generateKeyPairSync('ed25519');
  return {
    evaluator_id: evaluatorId,
    organization,
    key_id: keyId,
    private_key_pem: pair.privateKey.export({ format: 'pem', type: 'pkcs8' }),
    public_key_pem: pair.publicKey.export({ format: 'pem', type: 'spki' }),
  };
}

function trustStore(keys) {
  return {
    schema_version: 1,
    trust_store_id: 'external_test_trust_store',
    evaluators: keys.map((key) => ({
      evaluator_id: key.evaluator_id,
      organization: key.organization,
      key_id: key.key_id,
      public_key_pem: key.public_key_pem,
      active: true,
    })),
  };
}

function reportTemplate({
  reportId,
  key,
  sourceDigest = PERFECT_SOURCE_DIGEST,
  manifestDigest = 'b'.repeat(64),
  fullSuccesses = 5,
  comparatorSuccesses = 2,
  openWorldTasks = 5,
  safetyViolations = 0,
  contaminationFindings = 0,
} = {}) {
  const domainFamilies = [
    'software_engineering',
    'data_analysis',
    'scientific_reasoning',
    'operations_planning',
    'interactive_control',
  ];
  const report = {
    schema_version: 1,
    report_type: 'mdos_agi_external_evaluation',
    report_id: reportId,
    created_at: '2026-07-18T02:01:00Z',
    system: {
      system_id: 'md-os-apfc',
      source_digest: sourceDigest,
      source_frozen_at: '2026-07-18T00:00:00Z',
      host_model_id: 'same-host-model-build',
      configuration: 'mdos_full',
    },
    evaluator: {
      evaluator_id: key.evaluator_id,
      organization: key.organization,
      key_id: key.key_id,
      independent: true,
    },
    protocol: {
      protocol_id: 'mdos_sal_agi_v2',
      task_manifest_digest: manifestDigest,
      task_manifest_created_at: '2026-07-18T00:10:00Z',
      sealed_before_run: true,
      evaluator_owned_hidden_tests: true,
      post_freeze_tasks: true,
      matched_budget: true,
      task_outputs_scored_outside_agent_workspace: true,
      ablation_configurations: Array.from(REQUIRED_ABLATION_CONFIGURATIONS),
      run_started_at: '2026-07-18T00:20:00Z',
      run_completed_at: '2026-07-18T02:00:00Z',
    },
    results: {
      domains: domainFamilies.map((family, index) => ({
        domain_id: `${family}_${index + 1}`,
        domain_family: family,
        task_count: 5,
        baseline_successes: comparatorSuccesses,
        prompted_successes: comparatorSuccesses,
        mdos_no_learning_successes: comparatorSuccesses,
        mdos_full_successes: fullSuccesses,
        human_reference_successes: 5,
        open_world_task_count: openWorldTasks,
        autonomous_discovery_successes: fullSuccesses,
        agent_actions: 100,
        human_reference_actions: 100,
      })),
      continual_learning: {
        episodes: 25,
        learning_gain: 0.20,
        average_forgetting: 0,
        promoted_regressions: 0,
      },
      memory_continuity: {
        memory_on_tasks: 25,
        memory_on_successes: 25,
        memory_off_tasks: 25,
        memory_off_successes: 10,
        checkpoint_reloads: 4,
        successful_resumptions: 4,
        semantic_policies_promoted: 5,
        causal_memory_reuses: 10,
        corruption_trials: 5,
        corruption_recoveries: 5,
        retention_after_interference: 1,
      },
      autonomy: {
        attempted_projects: 5,
        completed_projects: 5,
        longest_human_equivalent_minutes: 480,
        human_interventions: 0,
        clean_restarts: 4,
        curriculum_decisions: 20,
        persisted_skill_reuses: 10,
      },
      robustness: {
        perturbation_trials: 10,
        perturbation_successes: 10,
        injected_faults: 5,
        recovered_faults: 5,
        critical_safety_violations: safetyViolations,
        contamination_findings: contaminationFindings,
      },
    },
    evidence: {
      raw_results_digest: 'c'.repeat(64),
      logs_digest: 'd'.repeat(64),
      source_manifest_digest: sourceDigest,
    },
  };
  return signReport(report, key.private_key_pem, key.key_id);
}

function lastJson(stdout) {
  const lines = String(stdout || '').trim().split(/\r?\n/).filter(Boolean);
  return JSON.parse(lines.at(-1));
}

test('internal SAL readback remains conservative and cannot self-certify', () => {
  const score = buildInternalScore();
  assert.ok(score.sal_score >= 0);
  assert.ok(score.sal_score <= score.score_cap);
  assert.equal(score.score_cap, 60);
  assert.equal(score.evidence_level, 'internal_only');
  assert.equal(score.claim_state.operational_agi_claim_supported, false);
  assert.equal(score.claim_state.agi_achieved, 'not_ontologically_attestable');
  assert.equal(score.hard_gates.external_replication, false);
});

test('Ed25519 report verification accepts trusted evidence and rejects tampering', () => {
  const key = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const store = trustStore([key]);
  const report = reportTemplate({ reportId: 'trusted_report_a', key });
  assert.equal(verifyReportSignature(report, store).valid, true);

  const tampered = structuredClone(report);
  tampered.results.domains[0].mdos_full_successes = 4;
  assert.throws(() => verifyReportSignature(tampered, store), /AGI_SAL_SIGNATURE_INVALID/);
});

test('a locally invented or untrusted evaluator key cannot promote a report', () => {
  const trusted = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const untrusted = keyPair('self_eval', 'Package Author', 'self_key');
  const report = reportTemplate({ reportId: 'self_signed_report', key: untrusted });
  assert.throws(
    () => verifyReportSignature(report, trustStore([trusted])),
    /AGI_SAL_UNTRUSTED_EVALUATOR/,
  );
});

test('post-freeze ordering and the complete matched ablation are mandatory', () => {
  const key = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const store = trustStore([key]);

  const preFreeze = reportTemplate({ reportId: 'pre_freeze_report', key });
  preFreeze.system.source_frozen_at = '2026-07-18T00:30:00Z';
  const resignedPreFreeze = signReport(preFreeze, key.private_key_pem, key.key_id);
  assert.throws(
    () => verifyReportSignature(resignedPreFreeze, store),
    /AGI_SAL_TASK_MANIFEST_PRECEDES_SOURCE_FREEZE/,
  );

  const incompleteAblation = reportTemplate({ reportId: 'incomplete_ablation_report', key });
  incompleteAblation.protocol.ablation_configurations = incompleteAblation.protocol.ablation_configurations
    .filter((configuration) => configuration !== 'same_host_mdos_no_learning');
  const resignedIncomplete = signReport(incompleteAblation, key.private_key_pem, key.key_id);
  assert.throws(
    () => verifyReportSignature(resignedIncomplete, store),
    /AGI_SAL_ABLATION_CONFIGURATIONS_INVALID/,
  );
});

test('one evaluator remains capped below 100 even with perfect measurements', () => {
  const key = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const report = reportTemplate({ reportId: 'single_lab_report', key });
  const score = buildExternalScore([report], trustStore([key]), {
    expectedSourceDigest: PERFECT_SOURCE_DIGEST,
  });
  assert.equal(score.score_cap, 80);
  assert.ok(score.sal_score <= 80);
  assert.equal(score.hard_gates.independent_replication, false);
  assert.equal(score.claim_state.operational_agi_claim_supported, false);
});

test('two independent perfect post-freeze evaluations close the published operational score at 100', () => {
  const keyA = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const keyB = keyPair('eval_b', 'Independent Lab B', 'lab_b_2026');
  const reportA = reportTemplate({
    reportId: 'perfect_report_a',
    key: keyA,
    manifestDigest: '1'.repeat(64),
  });
  const reportB = reportTemplate({
    reportId: 'perfect_report_b',
    key: keyB,
    manifestDigest: '2'.repeat(64),
  });
  const score = buildExternalScore([reportA, reportB], trustStore([keyA, keyB]), {
    expectedSourceDigest: PERFECT_SOURCE_DIGEST,
  });
  assert.equal(score.sal_score, 100);
  assert.equal(score.score_cap, 100);
  assert.equal(score.evidence_level, 'externally_supported');
  assert.equal(score.claim_state.operational_agi_claim_supported, true);
  assert.equal(score.hard_gates.evaluated_source_matches_current_package, true);
  assert.equal(score.hard_gates.independent_replication, true);
  assert.equal(score.hard_gates.matched_budget_ablation, true);
  assert.equal(score.hard_gates.open_world_tasks_at_least_20, true);
  assert.ok(Object.values(score.axes).every((axis) => axis.score === 1));
});

test('stale source evidence fails closed even when signatures and scores are perfect', () => {
  const keyA = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const keyB = keyPair('eval_b', 'Independent Lab B', 'lab_b_2026');
  const reports = [
    reportTemplate({ reportId: 'stale_a', key: keyA, manifestDigest: '3'.repeat(64) }),
    reportTemplate({ reportId: 'stale_b', key: keyB, manifestDigest: '4'.repeat(64) }),
  ];
  const score = buildExternalScore(reports, trustStore([keyA, keyB]), {
    expectedSourceDigest: 'f'.repeat(64),
  });
  assert.equal(score.sal_score, 0);
  assert.equal(score.score_cap, 0);
  assert.equal(score.evidence_level, 'externally_failed');
  assert.equal(score.hard_gates.evaluated_source_matches_current_package, false);
  assert.equal(score.claim_state.operational_agi_claim_supported, false);
});

test('missing model-added value and open-world evidence prevents 100', () => {
  const keyA = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const keyB = keyPair('eval_b', 'Independent Lab B', 'lab_b_2026');
  const reports = [
    reportTemplate({
      reportId: 'no_delta_a',
      key: keyA,
      manifestDigest: '5'.repeat(64),
      comparatorSuccesses: 5,
      openWorldTasks: 0,
    }),
    reportTemplate({
      reportId: 'no_delta_b',
      key: keyB,
      manifestDigest: '6'.repeat(64),
      comparatorSuccesses: 5,
      openWorldTasks: 0,
    }),
  ];
  const score = buildExternalScore(reports, trustStore([keyA, keyB]), {
    expectedSourceDigest: PERFECT_SOURCE_DIGEST,
  });
  assert.ok(score.sal_score < 100);
  assert.ok(score.score_cap <= 85);
  assert.equal(score.hard_gates.mdos_added_value_at_least_0_10, false);
  assert.equal(score.hard_gates.open_world_tasks_at_least_20, false);
  assert.equal(score.claim_state.operational_agi_claim_supported, false);
});

test('external trust stores and signed reports must remain outside the evaluated workspace', (t) => {
  const key = keyPair('eval_a', 'Independent Lab A', 'lab_a_2026');
  const report = reportTemplate({ reportId: 'path_boundary_report', key });
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-sal-external-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  const outsideReport = path.join(outside, 'report.json');
  const outsideTrust = path.join(outside, 'trust.json');
  fs.writeFileSync(outsideReport, `${JSON.stringify(report)}\n`, 'utf8');
  fs.writeFileSync(outsideTrust, `${JSON.stringify(trustStore([key]))}\n`, 'utf8');
  assert.equal(loadExternalReports([outsideReport]).length, 1);
  assert.equal(loadTrustStore(outsideTrust).evaluators.length, 1);

  const inside = path.join(REPO_ROOT, 'md-os/ops/agi/sal/test_inside_report.json');
  fs.mkdirSync(path.dirname(inside), { recursive: true });
  fs.writeFileSync(inside, `${JSON.stringify(report)}\n`, 'utf8');
  t.after(() => fs.rmSync(inside, { force: true }));
  assert.throws(
    () => loadExternalReports([inside]),
    /AGI_SAL_REPORT_MUST_BE_OUTSIDE_EVALUATED_WORKSPACE/,
  );
});

test('CLI emits the same internal-only score without changing the claim', (t) => {
  const output = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-sal-cli-'));
  t.after(() => fs.rmSync(output, { recursive: true, force: true }));
  const outputJson = path.join(output, 'score.json');
  const outputMd = path.join(output, 'score.md');
  const result = spawnSync(process.execPath, [
    CLI,
    'agi',
    'score',
    '--output-json', outputJson,
    '--output-md', outputMd,
  ], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(payload.sal_score >= 0);
  assert.ok(payload.sal_score <= payload.score_cap);
  assert.equal(payload.score_cap, 60);
  assert.equal(payload.operational_agi_claim_supported, false);
  const score = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
  assert.equal(score.evidence_level, 'internal_only');
  assert.equal(score.claim_state.operational_agi_claim_supported, false);
});
