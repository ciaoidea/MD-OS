#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const {
  crossDomainTasks,
  curriculumTask,
  inventionTasks,
} = require('../md-os/kernel/cognition/agi_task_factory');
const {
  learnSketchLibrary,
  noveltyMetrics,
  sha256Json,
  synthesizeBottomUp,
  synthesizeEnumerative,
  verifyProgram,
} = require('../md-os/kernel/cognition/general_program_synthesis');
const {
  initialCampaignState,
  selectCurriculumCandidate,
  verifyCampaignLedger,
} = require('../md-os/kernel/cognition/agi_evidence_suite');

const REPO_ROOT = path.resolve(__dirname, '..');
const CLI = path.join(REPO_ROOT, 'md-os/os/mdos.js');

function writeFile(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function lastJson(stdout) {
  const lines = String(stdout || '').trim().split('\n').filter(Boolean);
  return JSON.parse(lines.at(-1));
}

function objectHasKey(value, target) {
  if (Array.isArray(value)) return value.some((item) => objectHasKey(item, target));
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => key === target || objectHasKey(item, target));
}

function makeWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-agi-evidence-'));
  fs.cpSync(path.join(REPO_ROOT, 'md-os/os'), path.join(workspace, 'md-os/os'), { recursive: true });
  fs.cpSync(path.join(REPO_ROOT, 'md-os/kernel/cognition'), path.join(workspace, 'md-os/kernel/cognition'), { recursive: true });
  writeFile(path.join(workspace, 'md-os/kb/README.md'), '# Test knowledge base\n');
  writeFile(path.join(workspace, 'md-os/ops/journal.ndjson'), '');
  return workspace;
}

function runSuite(workspace, experimentId, cycles = 32, sessions = 4) {
  return spawnSync(process.execPath, [
    CLI,
    'agi',
    'prove',
    '--experiment-id', experimentId,
    '--cycles', String(cycles),
    '--sessions', String(sessions),
  ], {
    cwd: workspace,
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
}

test('cross-domain sketch transfer improves disjoint holdouts under the same search budget', () => {
  const tasks = crossDomainTasks();
  const sourceSolutions = tasks.development.map((task) => {
    const result = synthesizeEnumerative(task.public_task, { max_depth: 2, max_candidates: 64 });
    assert.equal(result.solved, true);
    assert.equal(verifyProgram(result.program, task.oracle.hidden_tests, task.public_task.primitive_catalog).passed, true);
    return {
      task_id: task.public_task.task_id,
      domain_id: task.public_task.domain_id,
      program: result.program,
    };
  });
  const sketches = learnSketchLibrary(sourceSolutions, 2);
  assert.deepEqual(sketches.map((entry) => entry.sketch), ['filter>map']);

  for (const task of tasks.holdout) {
    const baseline = synthesizeEnumerative(task.public_task, {
      max_depth: 2,
      max_candidates: 12,
      prioritized_sketches: [],
    });
    const learned = synthesizeEnumerative(task.public_task, {
      max_depth: 2,
      max_candidates: 12,
      prioritized_sketches: ['filter>map'],
    });
    const sham = synthesizeEnumerative(task.public_task, {
      max_depth: 2,
      max_candidates: 12,
      prioritized_sketches: ['map>filter'],
    });
    assert.equal(baseline.solved, false);
    assert.equal(sham.solved, false);
    assert.equal(learned.solved, true);
    assert.equal(learned.candidate_budget, baseline.candidate_budget);
    assert.equal(sham.candidate_budget, baseline.candidate_budget);
    assert.equal(verifyProgram(learned.program, task.oracle.hidden_tests, task.public_task.primitive_catalog).passed, true);
  }
});

test('isolated synthesis worker rejects a contaminated public request', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-contaminated-request-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const task = crossDomainTasks().holdout[0];
  const requestPath = path.join(root, 'request.json');
  fs.writeFileSync(requestPath, `${JSON.stringify({
    schema_version: 1,
    mode: 'enumerative',
    public_task: task.public_task,
    hidden_tests: task.oracle.hidden_tests,
    options: { max_depth: 2, max_candidates: 12 },
  })}\n`, 'utf8');
  const worker = path.join(REPO_ROOT, 'md-os/os/general_synthesis_worker.js');
  const result = spawnSync(process.execPath, [worker, '--request', requestPath], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    timeout: 30000,
  });
  assert.equal(result.status, 1);
  const payload = lastJson(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.error, /GENERAL_SYNTHESIS_FORBIDDEN_FIELDS/);
  assert.match(payload.error, /hidden_tests/);
});

test('campaign ledger verification detects content tampering', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-ledger-tamper-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const ledger = path.join(root, 'events.ndjson');
  const base = {
    schema_version: 1,
    event_index: 1,
    created_at: '2026-07-18T00:00:00Z',
    campaign_id: 'tamper_test',
    session_id: 'session_01',
    event_type: 'session_started',
    previous_event_hash: 'GENESIS',
    payload: { pid: 1 },
  };
  const event = { ...base, event_hash: sha256Json(base) };
  fs.writeFileSync(ledger, `${JSON.stringify(event)}\n`, 'utf8');
  const expected = { ledger_event_count: 1, ledger_head: event.event_hash };
  assert.equal(verifyCampaignLedger({ ledger }, expected).valid, true);
  const tampered = { ...event, payload: { pid: 999 } };
  fs.writeFileSync(ledger, `${JSON.stringify(tampered)}\n`, 'utf8');
  const audit = verifyCampaignLedger({ ledger }, expected);
  assert.equal(audit.valid, false);
  assert.ok(audit.findings.includes('event_1_hash_mismatch'));
});

test('bottom-up synthesis invents novel minimal programs beyond the seed depth', () => {
  const seedPrograms = crossDomainTasks().development.map((task) => {
    const result = synthesizeEnumerative(task.public_task, { max_depth: 2, max_candidates: 64 });
    return { program: result.program, program_hash: result.program_hash, sketch: result.sketch };
  });
  const archive = seedPrograms.slice();
  for (const task of inventionTasks()) {
    const control = synthesizeEnumerative(task.public_task, { max_depth: 2, max_candidates: 256 });
    assert.equal(control.solved, false);
    const invention = synthesizeBottomUp(task.public_task, { max_depth: 4, max_candidates: 12000 });
    assert.equal(invention.solved, true);
    assert.equal(invention.solution_depth, 4);
    assert.equal(invention.minimal_depth_proven, true);
    assert.equal(verifyProgram(invention.program, task.oracle.hidden_tests, task.public_task.primitive_catalog).passed, true);
    const novelty = noveltyMetrics(invention.program, archive);
    assert.equal(novelty.exact_program_novel, true);
    assert.equal(novelty.sketch_novel, true);
    archive.push({ program: invention.program, program_hash: invention.program_hash, sketch: invention.sketch });
  }
  assert.equal(archive.length, seedPrograms.length + 3);
  assert.equal(new Set(archive.slice(seedPrograms.length).map((entry) => entry.sketch)).size, 3);
});

test('autonomous curriculum policy ranks only public task metadata and learning state', () => {
  const state = initialCampaignState('curriculum_policy_test');
  const candidates = [
    curriculumTask(10, 1, 0),
    curriculumTask(11, 2, 1),
    curriculumTask(12, 1, 2),
  ];
  const publicOnly = candidates.map((task) => ({ public_task: task.public_task }));
  const decision = selectCurriculumCandidate(state, publicOnly);
  assert.ok(decision.selected.task.public_task.task_id);
  assert.equal(decision.ranking.length, 3);
  assert.equal(objectHasKey(publicOnly, 'hidden_tests'), false);
  assert.equal(objectHasKey(publicOnly, 'target_program'), false);
  assert.ok(decision.ranking.every((entry) => Number.isFinite(entry.score)));
});

test('AGI evidence suite closes all five operational edges with sealed learner processes', { timeout: 300000 }, (t) => {
  const workspace = makeWorkspace();
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  const experimentId = 'agi_evidence_integration_v1';
  const result = runSuite(workspace, experimentId, 32, 4);
  assert.equal(result.status, 0, `${result.stderr}\n${result.stdout}`);
  const payload = lastJson(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.operational_agi_prerequisites_supported, true);
  assert.equal(payload.agi_achieved, false);
  assert.equal(payload.agi_claim_supported, false);
  assert.equal(payload.cross_domain_success_before, 0);
  assert.equal(payload.cross_domain_success_after, 1);
  assert.equal(payload.invented_verified_programs, 3);
  assert.equal(payload.novel_structural_sketches, 3);
  assert.equal(payload.continual_average_forgetting, 0);
  assert.equal(payload.autonomous_cycles, 32);
  assert.equal(payload.process_restarts, 3);
  assert.equal(payload.human_interventions, 0);

  const report = readJson(path.join(workspace, payload.report_file));
  assert.equal(report.status, 'ok');
  assert.equal(Object.values(report.criteria).every((criterion) => criterion.status === 'ok'), true);
  assert.equal(report.master_closure.edges.every((edge) => edge.status === 'ok'), true);
  assert.equal(report.contamination_audit.learner_process_permission_model_enforced, true);
  assert.equal(report.contamination_audit.target_programs_absent_from_requests, true);
  assert.equal(report.contamination_audit.hidden_tests_absent_from_requests, true);
  assert.equal(report.contamination_audit.status, 'ok');
  assert.equal(report.contamination_audit.request_receipt_count_match, true);
  assert.equal(report.aggregate_measurements.continual_final_average_accuracy, 1);
  assert.equal(report.aggregate_measurements.novel_structural_sketches, 3);
  assert.equal(report.aggregate_measurements.promoted_regressions, 0);
  assert.equal(report.claim_state.operational_agi_prerequisites_supported, true);
  assert.equal(report.claim_state.agi_achieved, false);
  assert.equal(report.claim_state.agi_claim_supported, false);

  const integrity = readJson(path.join(workspace, report.evidence.evidence_integrity_file));
  assert.ok(integrity.file_count > 20);
  assert.match(integrity.root_digest, /^[a-f0-9]{64}$/);

  const transfer = readJson(path.join(
    workspace,
    'md-os/ops/agi/generality_experiments',
    experimentId,
    'cross_domain_transfer/report.json'
  ));
  assert.equal(transfer.measurements.sham_control_successes, 0);
  assert.equal(transfer.measurements.equal_candidate_budget, true);
  assert.equal(transfer.acceptance.sham_control_zero, true);

  const autonomy = readJson(path.join(
    workspace,
    'md-os/ops/agi/generality_experiments',
    experimentId,
    'autonomous_campaign/report.json'
  ));
  assert.equal(autonomy.status, 'ok');
  assert.equal(autonomy.measurements.completed_cycles, 32);
  assert.equal(autonomy.measurements.process_sessions, 4);
  assert.equal(autonomy.measurements.unique_process_ids, 4);
  assert.equal(autonomy.measurements.transient_faults, 1);
  assert.equal(autonomy.measurements.recovered_faults, 1);
  assert.equal(autonomy.measurements.unrecovered_faults, 0);
  assert.equal(autonomy.measurements.final_frontier_depth, 4);
  assert.equal(autonomy.measurements.retained_accuracy, 1);
  assert.equal(autonomy.measurements.ledger_chain_valid, true);
  assert.equal(autonomy.persistence.sessions_after_first_resumed_state, true);
  assert.equal(autonomy.measurements.human_interventions, 0);

  const continual = readJson(path.join(
    workspace,
    'md-os/ops/agi/generality_experiments',
    experimentId,
    'continual_learning/report.json'
  ));
  assert.equal(continual.measurements.average_forgetting, 0);
  assert.equal(continual.measurements.promoted_regression_count, 0);
  assert.ok(continual.measurements.detected_pre_promotion_regressions >= 1);
  assert.ok(continual.measurements.rollback_count >= 1);

  const duplicate = runSuite(workspace, experimentId, 24, 2);
  assert.equal(duplicate.status, 1);
  assert.match(lastJson(duplicate.stdout).error, /APPEND_ONLY_CONFLICT/);
});

test('AGI evidence schemas preserve the claim boundary', () => {
  const reportSchema = readJson(path.join(REPO_ROOT, 'md-os/schemas/agi_evidence_suite.schema.json'));
  const campaignSchema = readJson(path.join(REPO_ROOT, 'md-os/schemas/agi_autonomous_campaign.schema.json'));
  assert.equal(reportSchema.properties.claim_state.properties.agi_achieved.const, false);
  assert.equal(reportSchema.properties.claim_state.properties.agi_claim_supported.const, false);
  assert.equal(reportSchema.properties.criteria.required.length, 5);
  assert.equal(campaignSchema.properties.human_interventions.const, 0);
  assert.equal(campaignSchema.properties.frontier_depth.maximum, 4);
});
