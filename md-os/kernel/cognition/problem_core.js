'use strict';

const { sha256Json } = require('../../os/lib/common');
const { loadOutcomeReports, validateOutcome } = require('./problem_outcome');

const RELATIONS = { depends_on: 'requires', contradicts: 'contradicted_by', analogous_to: 'semantic_association' };
const STATES = new Set(['open', 'suspended', 'candidate']);

// TaskSpec remains the persistent problem identity. This optional, bounded
// working frame is not a new authority, a transcript, or a success verdict.
function normalizeProblemCore(value) {
  if (value === undefined) return undefined;
  const fail = () => { throw new Error('PROBLEM_CORE_INVALID'); };
  const text = (item, maximum = 2048) => {
    if (typeof item !== 'string' || !item.trim() || item.length > maximum) fail();
    return item;
  };
  const fields = new Set(['state', 'premises', 'candidate_solution', 'next_question', 'relations']);
  if (!value || Array.isArray(value) || typeof value !== 'object'
    || Object.keys(value).some(key => !fields.has(key)) || !STATES.has(value.state)) fail();
  if (!Array.isArray(value.premises) || value.premises.length > 32
    || !Array.isArray(value.relations) || value.relations.length > 32) fail();
  const seen = new Set();
  const premises = value.premises.map(premise => {
    if (!premise || typeof premise !== 'object'
      || Object.keys(premise).some(key => !['statement', 'epistemic_status', 'source_refs'].includes(key))
      || !['hypothetical', 'observed'].includes(premise.epistemic_status)
      || !Array.isArray(premise.source_refs) || premise.source_refs.length > 16) fail();
    if (premise.epistemic_status === 'observed' && !premise.source_refs.length) fail();
    return { statement: text(premise.statement), epistemic_status: premise.epistemic_status,
      source_refs: premise.source_refs.map(ref => text(ref, 1024)) };
  });
  const relations = value.relations.map(relation => {
    if (!relation || typeof relation !== 'object'
      || Object.keys(relation).some(key => !['task_spec_id', 'relation', 'basis', 'expected_contract_hash'].includes(key))
      || !Object.hasOwn(RELATIONS, relation.relation)
      || !/^task_[a-zA-Z0-9_]+$/.test(relation.task_spec_id || '')) fail();
    const key = `${relation.relation}:${relation.task_spec_id}`;
    if (seen.has(key)) fail();
    seen.add(key);
    const hash = relation.expected_contract_hash ?? null;
    if (hash !== null && !/^[a-f0-9]{64}$/.test(hash)) fail();
    return { task_spec_id: relation.task_spec_id, relation: relation.relation,
      basis: text(relation.basis), expected_contract_hash: hash };
  });
  return { state: value.state, premises, candidate_solution: value.candidate_solution == null ? null : text(value.candidate_solution, 4096),
    next_question: value.next_question == null ? null : text(value.next_question), relations };
}

function problemContractHash(task) {
  const core = normalizeProblemCore(task.problem_core);
  // Exclude dependency bindings themselves: cycles must not require a
  // cryptographic fixed point. A changed dependency propagates review instead.
  return sha256Json({ task_spec_id: task.task_spec_id, goal: task.goal,
    constraints: task.constraints || [], acceptance_tests: task.acceptance_tests || [],
    success_definition: task.success_definition || null, required_evidence: task.required_evidence || [],
    unknowns: task.unknowns || [], actions: task.actions || [], observation_targets: task.observation_targets || [],
    verification_dependencies: task.verification_dependencies || [],
    problem_core: core ? { ...core, relations: core.relations.map(({ expected_contract_hash: _hash, ...rest }) => rest) } : null });
}

function buildProblemReadback(tasks, { workspace_root = null } = {}) {
  if (!Array.isArray(tasks) || tasks.length > 10000) throw new Error('PROBLEM_INDEX_BUDGET_EXCEEDED');
  const byId = new Map();
  const reports = workspace_root ? loadOutcomeReports(workspace_root) : new Map();
  for (const task of tasks) {
    if (!/^task_[a-zA-Z0-9_]+$/.test(task.task_spec_id || '') || byId.has(task.task_spec_id)) {
      throw new Error('PROBLEM_ID_INVALID_OR_DUPLICATE');
    }
    const core = normalizeProblemCore(task.problem_core);
    const outcome = reports.has(task.task_spec_id) ? validateOutcome(workspace_root, task, reports.get(task.task_spec_id)) : null;
    byId.set(task.task_spec_id, { task_spec_id: task.task_spec_id, goal: task.goal,
      contract_hash: problemContractHash(task), declared_state: core?.state || 'open',
      resolution: outcome?.resolution || 'unverified', outcome_evidence: outcome,
      unknown_count: (task.unknowns || []).length,
      relations: core?.relations || [], review_reasons: outcome?.review_required ? [outcome.reason] : [] });
  }
  const reverse = new Map();
  for (const problem of byId.values()) for (const relation of problem.relations) {
    const target = byId.get(relation.task_spec_id);
    if (!target) problem.review_reasons.push(`missing_problem:${relation.task_spec_id}`);
    if (relation.relation === 'depends_on') {
      const dependents = reverse.get(relation.task_spec_id) || new Set();
      dependents.add(problem.task_spec_id);
      reverse.set(relation.task_spec_id, dependents);
      if (target && relation.expected_contract_hash && relation.expected_contract_hash !== target.contract_hash) {
        problem.review_reasons.push(`changed_dependency:${target.task_spec_id}`);
      }
      if (problem.resolution === 'resolved' && target && target.resolution !== 'resolved') {
        problem.review_reasons.push(`dependency_not_resolved:${target.task_spec_id}`);
      }
    } else if (relation.relation === 'contradicts') {
      problem.review_reasons.push(`declared_contradiction:${relation.task_spec_id}`);
      if (target) target.review_reasons.push(`declared_contradiction:${problem.task_spec_id}`);
    }
  }
  const queue = [...byId.values()].filter(problem => problem.review_reasons.length).map(problem => problem.task_spec_id);
  const visited = new Set(queue);
  for (let i = 0; i < queue.length; i += 1) for (const id of reverse.get(queue[i]) || []) {
    const problem = byId.get(id);
    problem.review_reasons.push(`dependency_requires_review:${queue[i]}`);
    if (!visited.has(id)) { visited.add(id); queue.push(id); }
  }
  return [...byId.values()].sort((a, b) => a.task_spec_id.localeCompare(b.task_spec_id)).map(problem => ({
    ...problem, resolution: problem.review_reasons.length && problem.resolution === 'resolved' ? 'unverified' : problem.resolution,
    review_reasons: [...new Set(problem.review_reasons)].sort(), review_required: problem.review_reasons.length > 0,
  }));
}

module.exports = { RELATIONS, normalizeProblemCore, problemContractHash, buildProblemReadback };
