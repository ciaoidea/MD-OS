'use strict';

const fs = require('fs');
const path = require('path');
const { sha256Json } = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText } = require('../../os/lib/fs_runtime');
const { safeFile, sourceBinding, loadOutcomeReports, validateOutcome } = require('./problem_outcome');
const { patternStatus } = require('../../apfc/executive/cognitive_pathfinder');
const { buildProblemReadback } = require('./problem_core');

function read(root, ref) {
  const binding = sourceBinding(root, ref);
  return binding.exists ? JSON.parse(fs.readFileSync(safeFile(root, ref), 'utf8')) : null;
}

function programSignature(task) {
  // This is deliberately a local registered-program scope, not inferred
  // cross-domain equivalence. Preserve action order, conditions and exits.
  return sha256Json({ constraints: task.constraints || [],
    actions: (task.actions || []).map(({ action_id: _id, project_id: _project, ...operation }) => operation) });
}

function patternSkillId(anchor) { return `skill_pattern_${anchor.anchor_id.slice('anchor_'.length)}`; }

function taskContracts(root) {
  const dir = safeFile(root, 'md-os/ops/tasks');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter(name => /^task_[\w]+\.json$/.test(name));
  if (names.length > 10000) throw new Error('PATTERN_SKILL_INDEX_BUDGET');
  let bytes = 0;
  const tasks = names.map(name => {
    const ref = `md-os/ops/tasks/${name}`;
    bytes += fs.lstatSync(safeFile(root, ref)).size;
    if (bytes > 16777216) throw new Error('PATTERN_SKILL_SOURCE_BUDGET');
    return read(root, ref);
  });
  return tasks;
}

function currentProblems(root) {
  return new Map(buildProblemReadback(taskContracts(root), { workspace_root: root }).map(problem => [problem.task_spec_id, problem]));
}

// A new task ID or renamed test is not new evidence. This is an executable
// contract scope, not an inferred semantic or cross-domain equivalence.
function reuseContractHash(task) {
  const commands = refs => (refs || []).map(ref => ({ connector_id: ref.connector_id || 'terminal_executor',
    project_id: ref.project_id || 'cognitive_transaction', command_id: ref.command_id,
    expected_exit_status: ref.expected_exit_status ?? 0, state_guards: ref.state_guards || null }));
  return sha256Json({ constraints: task.constraints || [], actions: commands(task.actions),
    acceptance: commands(task.acceptance_tests),
    evidence: (task.required_evidence || []).map(item => ({ path: item.path, must_exist: item.must_exist !== false, sha256: item.sha256 || null })),
    observations: (task.observation_targets || []).map(item => ({ path: item.path, required_change: item.required_change !== false })),
    delta_required: task.success_definition?.observed_delta_required ?? Boolean(task.actions?.length) });
}

function reuseFailures(root, skill) {
  const reports = loadOutcomeReports(root), failures = [];
  const skillHash = sha256Json(skill);
  for (const task of taskContracts(root)) {
    if (task.skill_reuse?.skill_id !== skill.skill_id || task.skill_reuse.skill_hash !== skillHash) continue;
    const report = reports.get(task.task_spec_id);
    if (report?.outcome !== 'failed') continue;
    const outcome = validateOutcome(root, task, report);
    if (outcome.resolution !== 'failed') continue;
    failures.push({ task_spec_id: task.task_spec_id, case_task_id: task.skill_reuse.case_task_id,
      contract_hash: reuseContractHash(task), verification_ref: `md-os/ops/verifications/${report.verification_id}.json`,
      report_hash: outcome.report_hash,
      failed_checks: report.checks.filter(check => check.status === 'critical').map(check => check.check_id).slice(0, 3) });
  }
  return failures;
}

function patternSkillEvidence(root, skill) {
  if (!skill.pattern_origin) return { applicable: true, scope: 'legacy_gate' };
  try {
    const memory = read(root, 'md-os/ops/apfc/cognitive/pathfinding/anchor_memory.json');
    const anchor = memory?.anchors.find(item => item.anchor_id === skill.pattern_origin.pattern_id);
    if (!anchor || ['stale', 'falsified'].includes(patternStatus(anchor, root))
      || sha256Json(anchor.working_pattern) !== skill.pattern_origin.pattern_hash) throw new Error('PATTERN_SKILL_SOURCE_CHANGED');
    const latest = loadOutcomeReports(root);
    const network = currentProblems(root);
    for (const binding of skill.pattern_origin.source_outcomes) {
      const task = read(root, `md-os/ops/tasks/${binding.task_spec_id}.json`);
      const outcome = task && validateOutcome(root, task, latest.get(binding.task_spec_id));
      if (outcome?.resolution !== 'resolved' || outcome.report_hash !== binding.report_hash
        || network.get(binding.task_spec_id)?.resolution !== 'resolved') throw new Error('PATTERN_SKILL_OUTCOME_CHANGED');
    }
    if (!skill.pattern_origin.source_outcomes.length) throw new Error('PATTERN_SKILL_EVIDENCE_MISSING');
    if (skill.status === 'promoted') {
      if (!/^receipt_apfc_promotion_[a-f0-9]{20}$/.test(skill.promotion_receipt_id || '')
        || !/^apfc_cycle_[a-f0-9]{20}$/.test(skill.source_consolidation_cycle_id || '')) throw new Error('PATTERN_SKILL_GOVERNANCE_MISSING');
      const stored = read(root, `md-os/ops/skills/promoted/${skill.skill_id}.json`);
      const history = read(root, `md-os/ops/skills/history/${skill.skill_id}/${skill.promotion_receipt_id}.json`);
      const receipt = read(root, `md-os/ops/action_receipts/${skill.promotion_receipt_id}.json`);
      const cycle = read(root, `md-os/ops/apfc/executive/consolidation/${skill.source_consolidation_cycle_id}.json`);
      const gate = cycle?.skill_candidates.find(item => item.skill_id === skill.skill_id);
      if (!stored || !history || sha256Json(history.after_promoted) !== sha256Json(stored)
        || sha256Json(stored.pattern_origin) !== sha256Json(skill.pattern_origin)
        || !receipt || cycle?.promotion_receipt?.receipt_hash !== sha256Json(receipt)
        || gate?.gate.status !== 'ok' || skill.promotion_evidence_hash !== sha256Json(gate.gate)) throw new Error('PATTERN_SKILL_GOVERNANCE_CHANGED');
    }
    return { applicable: true, scope: 'registered_program_signature_only' };
  } catch (error) { return { applicable: false, reason: error.message }; }
}

function skillApplicability(root, skill, task = null) {
  const evidence = patternSkillEvidence(root, skill);
  if (!evidence.applicable || !skill.pattern_origin) return evidence;
  if (task && (!skill.pattern_origin.program_signatures.includes(programSignature(task))
    || !(task.acceptance_tests || []).length || (task.unknowns || []).length)) return { applicable: false, reason: 'PATTERN_SKILL_PRECONDITIONS_NOT_ESTABLISHED' };
  return { ...evidence, new_task_verification_required: true };
}

// Explicit program reuse, not inferred cross-domain equivalence. Resolve the
// exact promoted version; never copy its verdict or its acceptance tests.
function resolveSkillProgram(root, request, task) {
  if (!request || typeof request !== 'object' || Array.isArray(request)
    || Object.keys(request).sort().join(',') !== 'case_task_id,skill_hash,skill_id'
    || Object.values(request).some(value => typeof value !== 'string')
    || !/^skill_pattern_[a-f0-9]{20}$/.test(request.skill_id || '')
    || !/^[a-f0-9]{64}$/.test(request.skill_hash || '')
    || !/^task_[a-zA-Z0-9_]+$/.test(request.case_task_id || '')) throw new Error('SKILL_REUSE_REFERENCE_INVALID');
  const skill = read(root, `md-os/ops/skills/promoted/${request.skill_id}.json`);
  if (!skill || skill.status !== 'promoted' || !skill.pattern_origin) throw new Error('SKILL_REUSE_NOT_PROMOTED');
  if (sha256Json(skill) !== request.skill_hash) throw new Error('SKILL_REUSE_VERSION_CHANGED');
  const evidence = patternSkillEvidence(root, skill);
  if (!evidence.applicable) throw new Error(`SKILL_REUSE_SUSPENDED: ${evidence.reason}`);
  if (task.task_spec_id === request.case_task_id) throw new Error('SKILL_REUSE_SOURCE_TASK_OVERWRITE');
  const source = skill.pattern_origin.executable_cases.find(item => item.task_spec_id === request.case_task_id);
  if (!source || !source.actions?.length) throw new Error('SKILL_REUSE_CASE_NOT_FOUND');
  const actions = JSON.parse(JSON.stringify(source.actions));
  const applicability = skillApplicability(root, skill, { ...task, actions });
  if (!applicability.applicable) throw new Error(`SKILL_REUSE_PRECONDITIONS: ${applicability.reason}`);
  // A persisted expanded TaskSpec can be run again, but changed operations
  // cannot retain the attribution/authority of the learned program.
  if (task.actions?.length && sha256Json(task.actions) !== sha256Json(actions)) throw new Error('SKILL_REUSE_ACTIONS_CHANGED');
  if (reuseFailures(root, skill).some(failure => failure.case_task_id === request.case_task_id
    && failure.contract_hash === reuseContractHash({ ...task, actions }))) throw new Error('SKILL_REUSE_COUNTEREXAMPLE_REQUIRES_REVIEW');
  return { actions, skill, source: `md-os/ops/skills/promoted/${skill.skill_id}.json` };
}

// Stage through the existing formal episode/eval/consolidation directories.
// No evaluation numbers, promotion receipt or success are invented here.
function stagePatternSkill(root, anchor) {
  const pattern = anchor?.working_pattern;
  if (!pattern || !pattern.procedure.length || ['stale', 'falsified'].includes(patternStatus(anchor, root))) return { status: 'insufficient_evidence', reason: 'current_ordered_pattern_required' };
  const reports = loadOutcomeReports(root);
  const network = currentProblems(root);
  const tasks = pattern.task_bindings.map(binding => read(root, binding.source_path));
  const outcomes = tasks.map(task => task && validateOutcome(root, task, reports.get(task.task_spec_id)));
  if (outcomes.some(outcome => outcome?.resolution !== 'resolved') || tasks.some(task => !(task.actions || []).length
    || network.get(task.task_spec_id)?.resolution !== 'resolved')) return { status: 'insufficient_evidence', reason: 'current_executable_source_episodes_required' };
  const skillId = patternSkillId(anchor);
  const episodes = outcomes.map(outcome => {
    const report = read(root, `md-os/ops/verifications/${outcome.verification_id}.json`);
    if (!/^ep_[\w]+$/.test(report.episode_id)) throw new Error('PATTERN_SKILL_EPISODE_ID_INVALID');
    const episode = read(root, `md-os/ops/episodes/${report.episode_id}.json`);
    if (!episode || episode.verdict !== 'success' || episode.verification_result_file !== `md-os/ops/verifications/${outcome.verification_id}.json`
      || sha256Json(episode.task_spec) !== report.task_spec_hash) throw new Error('PATTERN_SKILL_EPISODE_NOT_BOUND');
    return episode;
  });
  const ref = `md-os/ops/skills/candidates/${skillId}.json`;
  const existing = read(root, ref);
  if (existing) return { status: existing.status, skill_id: skillId, candidate_file: ref, next: 'apfc_consolidate_then_explicit_promotion', evidence: patternSkillEvidence(root, existing) };
  const evalId = `eval_${skillId.slice(6)}`;
  const candidate = { schema_version: 1, skill_id: skillId, title: pattern.principle,
    description: 'Pattern-derived ordered procedure. Source outcomes are verified; transfer requires the existing sealed holdout and APFC promotion gates.',
    status: 'candidate', domain: episodes[0].task_type || 'general_operation',
    task_types: [...new Set(episodes.map(episode => episode.task_type || 'general_operation'))],
    inputs: ['current TaskSpec', 'registered action program', 'independent acceptance evidence'],
    tools: [...new Set(tasks.flatMap(task => task.actions.map(action => action.connector_id)))],
    preconditions: pattern.conditions, procedure: pattern.procedure,
    success_criteria: [pattern.prediction, 'current TaskSpec independently verified'],
    failure_modes: ['changed evidence', 'unmet conditions', 'new contradiction', 'holdout regression'],
    rollback: 'Use APFC revocation/rollback and restore the prior skill history; reverify affected tasks.',
    evals: [evalId], source_episodes: episodes.map(episode => episode.episode_id),
    promotion_gate_status: 'blocked',
    pattern_origin: { pattern_id: anchor.anchor_id, pattern_hash: sha256Json(pattern),
      source_outcomes: tasks.map((task, index) => ({ task_spec_id: task.task_spec_id, report_hash: outcomes[index].report_hash })),
      program_signatures: [...new Set(tasks.map(programSignature))],
      executable_cases: tasks.map(task => ({ task_spec_id: task.task_spec_id, actions: task.actions,
        observation_targets: task.observation_targets, acceptance_tests: task.acceptance_tests })) } };
  atomicWriteJson(safeFile(root, ref), candidate);
  atomicWriteText(safeFile(root, ref.replace(/\.json$/, '.md')), `# ${candidate.title}\n\nStatus: candidate. Not promoted.\n\n${pattern.procedure.map((step, i) => `${i + 1}. ${step}`).join('\n')}\n\nContract: [${skillId}](${skillId}.json)\n`);
  atomicWriteJson(safeFile(root, `md-os/ops/evals/${evalId}.json`), { schema_version: 1, eval_id: evalId, skill_id: skillId,
    status: 'attention', improvement_measured: false, improves: false, no_regression: false,
    source_episodes: candidate.source_episodes, paired_outcomes: [], reason: 'Sealed independent holdout has not been run.' });
  for (const episode of episodes) atomicWriteJson(safeFile(root, `md-os/ops/episodes/${episode.episode_id}.json`), {
    ...episode, candidate_skills: [...new Set([...(episode.candidate_skills || []), skillId])] });
  return { status: 'candidate', skill_id: skillId, candidate_file: ref, eval_file: `md-os/ops/evals/${evalId}.json`,
    next: 'sealed_holdout_then_apfc_consolidate_then_explicit_promotion' };
}

function readPatternSkill(root, anchor, task = null) {
  const id = patternSkillId(anchor);
  const promoted = read(root, `md-os/ops/skills/promoted/${id}.json`);
  if (promoted?.status === 'promoted') {
    const evidence = skillApplicability(root, promoted, task);
    const failures = reuseFailures(root, promoted);
    return { skill_id: id, status: evidence.applicable && promoted.promotion_receipt_id ? 'promoted' : 'suspended',
      ...evidence, source: `md-os/ops/skills/promoted/${id}.json`,
      ...(failures.length ? { reuse_review: { required: true, scope: 'listed_current_failed_contracts_only',
        failures: failures.slice(0, 4), omitted: failures.length > 4,
        next: 'Focus on the failed task and its verifier before another reuse; do not change acceptance merely to clear the failure.' } } : {}),
      ...(evidence.applicable && promoted.pattern_origin?.executable_cases?.length ? { reuse: { skill_id: id, skill_hash: sha256Json(promoted),
        case_task_ids: promoted.pattern_origin.executable_cases.map(item => item.task_spec_id) } } : {}) };
  }
  const candidate = read(root, `md-os/ops/skills/candidates/${id}.json`);
  return candidate ? { skill_id: id, status: candidate.status, source: `md-os/ops/skills/candidates/${id}.json` } : null;
}

module.exports = { stagePatternSkill, patternSkillEvidence, skillApplicability, readPatternSkill, programSignature, resolveSkillProgram, reuseContractHash };
