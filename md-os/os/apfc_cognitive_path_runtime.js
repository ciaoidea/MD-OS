#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, assertInsideWorkspace, nowIso, printJson } = require('./lib/common');
const { atomicWriteJson, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { buildCycle, emptyMemory, patternId, patternStatus, readPatternSource, sourceHash, verifyPatternInput } = require('../apfc/executive/cognitive_pathfinder');
const { sha256Json, sha256Text } = require('./lib/common');
const { readProblemContext } = require('./problem_context');
const { stagePatternSkill, readPatternSkill } = require('../kernel/cognition/pattern_skill');

const ROOT = path.join(MDOS_ROOT, 'ops', 'apfc', 'cognitive', 'pathfinding');
const CYCLES = path.join(ROOT, 'cycles');
const MEMORY = path.join(ROOT, 'anchor_memory.json');
const LATEST = path.join(ROOT, 'latest_cycle.json');

const rel = (filePath) => path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');

function runOnce(requestArg) {
  const requestPath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, requestArg));
  if (!fs.existsSync(requestPath)) throw new Error(`APFC_COGNITIVE_PATH_REQUEST_NOT_FOUND: ${requestArg}`);
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  return persistRequest(request);
}

function persistRequest(request) {
  for (const target of [ROOT, CYCLES, MEMORY, LATEST, path.join(MDOS_ROOT, 'ops/locks'), path.join(MDOS_ROOT, 'ops/journal.ndjson')]) {
    if (fs.lstatSync(target, { throwIfNoEntry: false })?.isSymbolicLink() || assertInsideWorkspace(target) !== target) {
      throw new Error('COGNITIVE_MEMORY_PATH_INVALID');
    }
  }
  ensureDir(CYCLES);
  let cycle, cyclePath;
  withFileLock('apfc_cognitive_pathfinding', { context: 'apfc_cognitive_path_run_once', timeoutMs: 2000, staleMs: 600000 }, () => {
    if (fs.existsSync(MEMORY) && (!fs.statSync(MEMORY).isFile() || fs.statSync(MEMORY).size > 2097152)) throw new Error('COGNITIVE_MEMORY_SOURCE_INVALID');
    const memory = fs.existsSync(MEMORY) ? JSON.parse(fs.readFileSync(MEMORY, 'utf8')) : emptyMemory();
    if (memory.memory_id !== 'apfc_cognitive_anchor_memory' || !Array.isArray(memory.anchors) || !Array.isArray(memory.transitions)) {
      throw new Error('COGNITIVE_MEMORY_SOURCE_INVALID');
    }
    cycle = buildCycle(request, memory, nowIso(), { workspace_root: WORKSPACE_ROOT });
    const prior = request.working_pattern && memory.anchors.find(anchor => anchor.anchor_id === request.working_pattern.pattern_id);
    if (prior && !request.working_pattern.verification_source && patternStatus(prior, WORKSPACE_ROOT) === 'verified') {
      // An identical unproved restatement does not erase still-current proof.
      cycle.anchor = { ...prior, reuse_count: prior.reuse_count + 1 };
      cycle.next_memory.anchors = cycle.next_memory.anchors.map(anchor => anchor.anchor_id === prior.anchor_id ? cycle.anchor : anchor);
    }
    if (request.working_pattern?.verification_source
      && !memory.anchors.some(anchor => anchor.anchor_id === request.working_pattern.pattern_id)) {
      throw new Error('COGNITIVE_PATTERN_MUST_BE_RECORDED_BEFORE_VERIFICATION');
    }
    if (Buffer.byteLength(JSON.stringify(cycle.next_memory, null, 2)) + 1 > 2097152) throw new Error('COGNITIVE_MEMORY_CAPACITY_REACHED');
    cyclePath = path.join(CYCLES, `${cycle.cycle_id}.json`);
    if (assertInsideWorkspace(cyclePath) !== cyclePath) throw new Error('COGNITIVE_MEMORY_PATH_INVALID');
    atomicWriteJson(cyclePath, { ...cycle, next_memory: undefined });
    atomicWriteJson(MEMORY, cycle.next_memory);
    atomicWriteJson(LATEST, { schema_version: 1, cycle_id: cycle.cycle_id, cycle_path: rel(cyclePath), verdict: cycle.verdict });
  });
  appendJournal({ event: 'apfc_cognitive_path_cycle_completed', cycle_id: cycle.cycle_id, verdict: cycle.verdict, anchor_id: cycle.anchor && cycle.anchor.anchor_id, transition_id: cycle.transition.transition_id });
  return {
    ok: true,
    mode: 'apfc_cognitive_path_run_once',
    cycle_id: cycle.cycle_id,
    verdict: cycle.verdict,
    selected_uncertainty_id: cycle.selected_uncertainty.uncertainty_id,
    selected_action_id: cycle.selected_action && cycle.selected_action.action_id,
    anchor_id: cycle.anchor && cycle.anchor.anchor_id,
    reused_anchor_ids: cycle.reused_anchor_ids,
    outputs: { cycle: rel(cyclePath), memory: rel(MEMORY), latest: rel(LATEST) },
  };
}

// Native model proposal -> the existing cognitive-cycle/anchor store. This
// does not execute the proposed procedure or declare a task accomplished.
function recordTurnReflection(input) {
  const allowed = ['task_ids', 'principle', 'conditions', 'prediction', 'procedure', 'verification_request_file'];
  const text = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 1024;
  if (!input || typeof input !== 'object' || Object.keys(input).some(key => !allowed.includes(key))
    || !Array.isArray(input.task_ids) || !input.task_ids.length || input.task_ids.length > 3
    || new Set(input.task_ids).size !== input.task_ids.length
    || !text(input.principle) || !text(input.prediction)
    || !Array.isArray(input.conditions) || input.conditions.length > 8 || !input.conditions.every(text)
    || !Array.isArray(input.procedure) || input.procedure.length > 8 || !input.procedure.every(text)) {
    throw new Error('COGNITIVE_REFLECTION_INVALID');
  }
  const tasks = input.task_ids.map(task_id => readProblemContext(WORKSPACE_ROOT, { task_id, maximum_bytes: 32768 }).problems[0]);
  const references = [...new Set(tasks.flatMap(task => [
    ...(task.task_spec.problem_core?.premises || []).flatMap(item => item.source_refs || []),
    ...(task.task_spec.required_evidence || []).map(item => item.path),
  ]))].sort();
  if (references.length > 24) throw new Error('COGNITIVE_PATTERN_SOURCE_BOUND_EXCEEDED');
  const pattern = { principle: input.principle, conditions: input.conditions, prediction: input.prediction,
    procedure: input.procedure, task_bindings: tasks.map(task => ({ task_spec_id: task.task_spec_id,
      source_path: task.source_path, source_hash: task.source_hash })).sort((a, b) => a.task_spec_id.localeCompare(b.task_spec_id)),
    source_bindings: references.map(reference => ({ path: reference, sha256: sourceHash(WORKSPACE_ROOT, reference) })) };
  pattern.pattern_id = patternId(pattern);
  let verification = null, receipt = null;
  if (input.verification_request_file != null) {
    const reference = input.verification_request_file;
    if (typeof reference !== 'string' || !/^md-os\/ops\/verifications\/[a-zA-Z0-9_-]+\.json$/.test(reference)) {
      throw new Error('COGNITIVE_VERIFICATION_PATH_INVALID');
    }
    const file = path.join(WORKSPACE_ROOT, reference);
    if (fs.realpathSync(file) !== file || fs.statSync(file).size > 262144) throw new Error('COGNITIVE_VERIFICATION_SOURCE_INVALID');
    const source = fs.readFileSync(file, 'utf8');
    const verificationInput = JSON.parse(source);
    const candidate = verificationInput.candidate;
    verification = verifyPatternInput(pattern, verificationInput, WORKSPACE_ROOT);
    pattern.verification_source = { path: reference, sha256: sha256Text(source) };
    if (verification.status === 'supported_bounded') {
      const payload = { schema_version: 1, receipt_id: `receipt_${verification.verification_hash.slice(0, 20)}`,
        status: 'passed', verifier_id: 'epistemic_unity_verifier', independent_from_candidate_generator: true,
        candidate_sealed_before_observation: true, candidate_hash: candidate.candidate_hash,
        observation_hash: verification.verification_hash,
        evidence_refs: verificationInput.evidence_manifest.map(item => item.evidence_ref),
        evidence_manifest: verificationInput.evidence_manifest };
      receipt = { ...payload, receipt_hash: sha256Json(payload) };
    }
  }
  const request = { schema_version: 1, request_id: pattern.pattern_id, theme_id: input.task_ids[0],
    theme: tasks[0].task_spec.goal, focus: input.prediction, verified_facts: [],
    working_pattern: pattern,
    uncertainties: [{ uncertainty_id: 'pattern_prediction', semantic_intent: input.principle,
      question: input.prediction, goal_impact: 1, information_gain: 1, reducibility: 1, blocking: false }],
    actions: [{ action_id: 'compare_prediction', addresses_uncertainty_ids: ['pattern_prediction'],
      expected_progress: 1, information_gain: 1, authorized: true, previously_falsified: false,
      cost: { tokens: 0, time_ms: 0, action_count: 0, risk: 0 } }],
    readback: { verdict: receipt ? 'pass' : 'unknown', action_id: 'compare_prediction',
      evidence_refs: receipt ? receipt.evidence_refs : tasks.map(task => task.source_path),
      learned_fact: input.principle, learned_correction: '', confidence: receipt ? 1 : 0,
      verification_receipt: receipt } };
  const result = persistRequest(request);
  const memory = JSON.parse(fs.readFileSync(MEMORY, 'utf8'));
  const anchor = memory.anchors.find(item => item.anchor_id === pattern.pattern_id);
  const skillWorkflow = stagePatternSkill(WORKSPACE_ROOT, anchor);
  return { ...result, pattern_id: pattern.pattern_id, resolution: 'unverified',
    skill_workflow: skillWorkflow,
    epistemic_verification: verification, scope: 'pattern_support_only_not_task_completion' };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] === 'record-turn') return printJson(recordTurnReflection(JSON.parse(fs.readFileSync(0, 'utf8'))));
  if (argv[0] === 'read-turn') return printJson(refreshTurnReflections(JSON.parse(fs.readFileSync(0, 'utf8'))));
  if (argv[0] !== 'run-once' || !argv[1]) throw new Error('USAGE: apfc_cognitive_path_runtime run-once <request.json>');
  printJson(runOnce(argv[1]));
}

function refreshTurnReflections(results) {
  if (!Array.isArray(results) || results.length > 2) throw new Error('COGNITIVE_TURN_READBACK_INVALID');
  if (assertInsideWorkspace(MEMORY) !== MEMORY || fs.realpathSync(MEMORY) !== MEMORY
    || fs.statSync(MEMORY).size > 2097152) throw new Error('COGNITIVE_MEMORY_SOURCE_INVALID');
  const memory = JSON.parse(fs.readFileSync(MEMORY, 'utf8'));
  return results.map(result => {
    const anchor = memory.anchors.find(item => item.anchor_id === result.pattern_id);
    const status = anchor ? patternStatus(anchor, WORKSPACE_ROOT) : 'stale';
    let verification = null;
    if (status === 'verified') {
      const input = JSON.parse(readPatternSource(WORKSPACE_ROOT, anchor.working_pattern.verification_source.path, 262144));
      verification = verifyPatternInput(anchor.working_pattern, input, WORKSPACE_ROOT);
    }
    return { ...result, epistemic_verification: verification,
      skill_workflow: anchor ? readPatternSkill(WORKSPACE_ROOT, anchor) || result.skill_workflow : null,
      task_outcomes: anchor ? anchor.working_pattern.task_bindings.map(binding => {
        const card = readProblemContext(WORKSPACE_ROOT, { task_id: binding.task_spec_id, maximum_bytes: 32768 }).problems[0];
        return { task_spec_id: card.task_spec_id, resolution: card.resolution, review_required: card.review_required,
          verification_ref: card.verification_ref || null };
      }) : [],
      current_pattern_status: status, resolution: 'unverified', scope: 'pattern_support_only_not_task_completion' };
  });
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { LATEST, MEMORY, ROOT, runOnce, recordTurnReflection, refreshTurnReflections };
