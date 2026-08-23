#!/usr/bin/env node
'use strict';

const { crossDomainTasks } = require('./agi_task_factory');
const {
  executeProgram,
  learnSketchLibrary,
  sameValue,
  sha256Json,
  synthesizeEnumerative,
  verifyProgram,
} = require('./general_program_synthesis');

const EXPERIMENT_ID = 'verified_solver_transport_20260823_v1';
const EXPERIMENT_TYPE = 'verified_solver_transport_v1';
const FIXED_TIME = '2026-08-23T08:30:00Z';
const OPERATOR_AXIS = Object.freeze(['filter', 'map', 'reduce']);
const TARGET_CANDIDATE_BUDGET = 12;
const SOURCE_CANDIDATE_BUDGET = 64;

function hasForbiddenField(value) {
  const forbidden = new Set(['hidden_tests', 'target_program', 'oracle', 'expected']);
  if (Array.isArray(value)) return value.some(hasForbiddenField);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, item]) => forbidden.has(key) || hasForbiddenField(item));
}

function independentTargetOracle(domainId, input) {
  if (domainId === 'operational_record_routing') {
    return input.filter((record) => record.active === true).map((record) => record.id);
  }
  if (domainId === 'graph_route_selection') {
    return input.filter((edge) => edge.open === true).map((edge) => edge.to);
  }
  if (domainId === 'sensor_grid_projection') {
    return input.filter((cell) => cell.valid === true).map((cell) => [cell.row, cell.column]);
  }
  throw new Error(`VERIFIED_SOLVER_TRANSPORT_ORACLE_DOMAIN_UNSUPPORTED: ${domainId}`);
}

function verifyWithIndependentOracle(task, solution) {
  const hidden = task.oracle.hidden_tests;
  const results = hidden.map((testCase, index) => {
    const expected = independentTargetOracle(task.public_task.domain_id, testCase.input);
    if (!solution.solved || !solution.program) return { index, passed: false };
    let actual = null;
    let error = null;
    try {
      actual = executeProgram(solution.program, testCase.input, task.public_task.primitive_catalog);
    } catch (caught) {
      error = String(caught && caught.message || caught);
    }
    return { index, passed: !error && sameValue(actual, expected) };
  });
  return {
    passed: results.length > 0 && results.every((result) => result.passed),
    passed_count: results.filter((result) => result.passed).length,
    test_count: results.length,
  };
}

function tensorFromPrograms(frameAxis, programsByFrame) {
  const maxSteps = Math.max(1, ...Array.from(programsByFrame.values()).map((program) => (
    program && Array.isArray(program.operations) ? program.operations.length : 0
  )));
  return frameAxis.map((frameId) => {
    const program = programsByFrame.get(frameId);
    return Array.from({ length: maxSteps }, (_, stepIndex) => {
      const vector = OPERATOR_AXIS.map(() => 0);
      const operation = program && program.operations && program.operations[stepIndex];
      if (operation) {
        const operatorIndex = OPERATOR_AXIS.indexOf(operation.kind);
        if (operatorIndex < 0) throw new Error(`VERIFIED_SOLVER_TRANSPORT_OPERATOR_UNSUPPORTED: ${operation.kind}`);
        vector[operatorIndex] = 1;
      }
      return vector;
    });
  });
}

function tensorShape(tensor) {
  return [tensor.length, tensor[0] ? tensor[0].length : 0, tensor[0] && tensor[0][0] ? tensor[0][0].length : 0];
}

function nonzeroCount(tensor) {
  return tensor.flat(2).filter((value) => value !== 0).length;
}

function deriveInvariantSketch(tensor) {
  if (!tensor.length || !tensor[0].length) return null;
  const operators = [];
  for (let step = 0; step < tensor[0].length; step += 1) {
    const indices = tensor.map((slice) => {
      const active = slice[step].map((value, index) => value === 1 ? index : -1).filter((index) => index >= 0);
      return active.length === 1 ? active[0] : -1;
    });
    if (indices.some((index) => index < 0 || index !== indices[0])) return null;
    operators.push(OPERATOR_AXIS[indices[0]]);
  }
  return operators.join('>');
}

function permutationMatrix(permutation) {
  const size = permutation.length;
  return Array.from({ length: size }, (_, row) => (
    Array.from({ length: size }, (_, column) => permutation[row] === column ? 1 : 0)
  ));
}

function applyFrameBasisPermutation(tensor, permutation) {
  if (permutation.length !== tensor.length) throw new Error('VERIFIED_SOLVER_TRANSPORT_PERMUTATION_SIZE_MISMATCH');
  const matrix = permutationMatrix(permutation);
  return matrix.map((row) => tensor[0].map((_, step) => OPERATOR_AXIS.map((__, operator) => (
    row.reduce((sum, coefficient, sourceFrame) => sum + (coefficient * tensor[sourceFrame][step][operator]), 0)
  ))));
}

function inversePermutation(permutation) {
  const inverse = Array(permutation.length);
  permutation.forEach((source, destination) => { inverse[source] = destination; });
  return inverse;
}

function summarizeSolution(task, solution, verification) {
  return {
    task_id: task.public_task.task_id,
    frame_id: task.public_task.domain_id,
    solved_on_public_examples: solution.solved,
    sketch: solution.sketch,
    program_hash: solution.program_hash,
    primitive_ids: solution.program ? solution.program.operations.map((operation) => operation.id) : [],
    candidates_evaluated: solution.candidates_evaluated,
    candidate_budget: solution.candidate_budget,
    hidden_verification: verification,
  };
}

function runTargetCondition(task, prioritizedSketches) {
  const solution = synthesizeEnumerative(task.public_task, {
    max_depth: 2,
    max_candidates: TARGET_CANDIDATE_BUDGET,
    prioritized_sketches: prioritizedSketches,
  });
  const verification = verifyWithIndependentOracle(task, solution);
  return { solution, summary: summarizeSolution(task, solution, verification) };
}

function runVerifiedSolverTransportExperiment() {
  const tasks = crossDomainTasks();
  const sourceRuns = tasks.development.map((task) => {
    const solution = synthesizeEnumerative(task.public_task, {
      max_depth: 2,
      max_candidates: SOURCE_CANDIDATE_BUDGET,
      prioritized_sketches: [],
    });
    const verification = solution.program
      ? verifyProgram(solution.program, task.oracle.hidden_tests, task.public_task.primitive_catalog)
      : { passed: false, passed_count: 0, test_count: task.oracle.hidden_tests.length };
    return { task, solution, verification };
  });
  const admittedSourceSolutions = sourceRuns
    .filter((run) => run.solution.solved && run.verification.passed)
    .map((run) => ({
      task_id: run.task.public_task.task_id,
      domain_id: run.task.public_task.domain_id,
      program: run.solution.program,
    }));
  const sketchLibrary = learnSketchLibrary(admittedSourceSolutions, 2);
  const transportedSketch = sketchLibrary.length === 1 ? sketchLibrary[0].sketch : null;
  const shamSketch = transportedSketch ? transportedSketch.split('>').reverse().join('>') : null;

  const targetRuns = tasks.holdout.map((task) => {
    const baseline = runTargetCondition(task, []);
    const sham = runTargetCondition(task, shamSketch ? [shamSketch] : []);
    const transported = runTargetCondition(task, transportedSketch ? [transportedSketch] : []);
    return { task, baseline, sham, transported };
  });

  const sourceFrames = sourceRuns.map((run) => run.task.public_task.domain_id);
  const targetFrames = targetRuns.map((run) => run.task.public_task.domain_id);
  const allFrames = [...sourceFrames, ...targetFrames];
  const sourcePrograms = new Map(sourceRuns.map((run) => [run.task.public_task.domain_id, run.solution.program]));
  const targetPrograms = new Map(targetRuns.map((run) => [run.task.public_task.domain_id, run.transported.solution.program]));
  const combinedPrograms = new Map([...sourcePrograms, ...targetPrograms]);
  const sourceTensor = tensorFromPrograms(sourceFrames, sourcePrograms);
  const targetTensor = tensorFromPrograms(targetFrames, targetPrograms);
  const combinedTensor = tensorFromPrograms(allFrames, combinedPrograms);
  const permutation = allFrames.map((_, index) => allFrames.length - index - 1);
  const permutedTensor = applyFrameBasisPermutation(combinedTensor, permutation);
  const restoredTensor = applyFrameBasisPermutation(permutedTensor, inversePermutation(permutation));

  const baselineSuccessCount = targetRuns.filter((run) => run.baseline.summary.hidden_verification.passed).length;
  const shamSuccessCount = targetRuns.filter((run) => run.sham.summary.hidden_verification.passed).length;
  const transportSuccessCount = targetRuns.filter((run) => run.transported.summary.hidden_verification.passed).length;
  const hiddenCaseCount = targetRuns.reduce((sum, run) => sum + run.transported.summary.hidden_verification.test_count, 0);
  const hiddenPassCount = targetRuns.reduce((sum, run) => sum + run.transported.summary.hidden_verification.passed_count, 0);
  const sourceDomainSet = new Set(sourceFrames);
  const sourcePrimitiveIds = new Set(sourceRuns.flatMap((run) => run.solution.program.operations.map((operation) => operation.id)));
  const targetPrimitiveIds = new Set(targetRuns.flatMap((run) => run.task.public_task.primitive_catalog.map((primitive) => primitive.id)));
  const primitiveLeakage = Array.from(sourcePrimitiveIds).filter((id) => targetPrimitiveIds.has(id));
  const publicRequests = targetRuns.map((run) => ({
    public_task: run.task.public_task,
    options: { max_depth: 2, max_candidates: TARGET_CANDIDATE_BUDGET, prioritized_sketches: [transportedSketch] },
  }));

  const criteria = {
    two_independent_source_frames_admitted: admittedSourceSolutions.length === 2 && new Set(admittedSourceSolutions.map((item) => item.domain_id)).size === 2,
    one_source_only_invariant_induced: transportedSketch === 'filter>map',
    source_target_frames_disjoint: targetFrames.every((frame) => !sourceDomainSet.has(frame)),
    target_primitives_absent_from_source_solvers: primitiveLeakage.length === 0,
    learner_requests_oracle_free: publicRequests.every((request) => !hasForbiddenField(request)),
    equal_target_candidate_budgets: targetRuns.every((run) => (
      run.baseline.summary.candidate_budget === TARGET_CANDIDATE_BUDGET
      && run.sham.summary.candidate_budget === TARGET_CANDIDATE_BUDGET
      && run.transported.summary.candidate_budget === TARGET_CANDIDATE_BUDGET
    )),
    baseline_control_fails_all_targets: baselineSuccessCount === 0,
    reversed_sham_fails_all_targets: shamSuccessCount === 0,
    verified_transport_solves_all_targets: transportSuccessCount === targetRuns.length && hiddenPassCount === hiddenCaseCount,
    source_and_target_tensor_share_invariant: deriveInvariantSketch(sourceTensor) === 'filter>map' && deriveInvariantSketch(targetTensor) === 'filter>map',
    tensor_frame_permutation_equivariance: sameValue(restoredTensor, combinedTensor),
  };
  const status = Object.values(criteria).every(Boolean) ? 'ok' : 'failed';

  const report = {
    schema_version: 1,
    experiment_id: EXPERIMENT_ID,
    experiment_type: EXPERIMENT_TYPE,
    created_at: FIXED_TIME,
    status,
    objective: 'Test bounded verified transport of a solver structure across disjoint frames under equal search budgets and sealed independent holdouts.',
    preregistered_design: {
      source_frame_count: 2,
      target_frame_count: 3,
      source_candidate_budget: SOURCE_CANDIDATE_BUDGET,
      target_candidate_budget_per_condition: TARGET_CANDIDATE_BUDGET,
      conditions: ['memory_disabled', 'reversed_sham', 'verified_transport'],
      success_rule: 'Transport must solve 3/3 target frames and all six hidden cases; both controls must solve 0/3; budgets, tensor equivariance, and contamination checks must pass.',
    },
    source_manifest: {
      development_public_tasks_hash: sha256Json(tasks.development.map((task) => task.public_task)),
      target_public_tasks_hash: sha256Json(tasks.holdout.map((task) => task.public_task)),
      sealed_oracle_digests_hash: sha256Json(tasks.holdout.map((task) => task.oracle.oracle_digest)),
    },
    frames: {
      source: sourceFrames,
      target: targetFrames,
      semantic_domain_overlap_count: targetFrames.filter((frame) => sourceDomainSet.has(frame)).length,
    },
    source_induction: {
      admitted_solution_count: admittedSourceSolutions.length,
      sketch_library: sketchLibrary,
      transported_sketch: transportedSketch,
      sham_sketch: shamSketch,
      source_runs: sourceRuns.map((run) => summarizeSolution(run.task, run.solution, {
        passed: run.verification.passed,
        passed_count: run.verification.passed_count,
        test_count: run.verification.test_count,
      })),
    },
    transport_tensor: {
      representation: 'finite_discrete_rank_3_solver_structure_tensor',
      axes: ['frame', 'solver_step', 'operator_kind'],
      operator_axis: OPERATOR_AXIS,
      frame_axis: allFrames,
      shape: tensorShape(combinedTensor),
      components: combinedTensor,
      nonzero_component_count: nonzeroCount(combinedTensor),
      transformation_law: "T_prime[i,p,o] = sum_j P[i,j] * T[j,p,o] for frame-basis permutation matrix P",
      tested_frame_permutation: permutation,
      permutation_matrix: permutationMatrix(permutation),
      equivariance_passed: criteria.tensor_frame_permutation_equivariance,
      preserved_invariant: transportedSketch,
      scope_boundary: 'This finite permutation-equivariant tensor encodes solver structure in the controlled fixture; it is not a general tensor representation of AGI.',
    },
    target_measurements: targetRuns.map((run) => ({
      task_id: run.task.public_task.task_id,
      frame_id: run.task.public_task.domain_id,
      memory_disabled: run.baseline.summary,
      reversed_sham: run.sham.summary,
      verified_transport: run.transported.summary,
    })),
    aggregate_measurements: {
      source_frames_admitted: admittedSourceSolutions.length,
      target_frames: targetRuns.length,
      hidden_target_cases: hiddenCaseCount,
      memory_disabled_success: `${baselineSuccessCount}/${targetRuns.length}`,
      reversed_sham_success: `${shamSuccessCount}/${targetRuns.length}`,
      verified_transport_success: `${transportSuccessCount}/${targetRuns.length}`,
      verified_transport_hidden_cases_passed: `${hiddenPassCount}/${hiddenCaseCount}`,
      verified_transport_delta_over_memory_disabled: (transportSuccessCount - baselineSuccessCount) / targetRuns.length,
    },
    contamination_audit: {
      status: criteria.source_target_frames_disjoint && criteria.target_primitives_absent_from_source_solvers && criteria.learner_requests_oracle_free ? 'ok' : 'failed',
      source_target_frames_disjoint: criteria.source_target_frames_disjoint,
      target_primitives_in_source_solvers: primitiveLeakage,
      target_programs_absent_from_learner_requests: criteria.learner_requests_oracle_free,
      hidden_tests_absent_from_learner_requests: criteria.learner_requests_oracle_free,
      independent_oracle_runs_after_candidate_generation: true,
    },
    criteria,
    claim_state: {
      bounded_verified_solver_transport_supported: status === 'ok',
      finite_discrete_transport_tensor_supported: status === 'ok',
      general_tensor_representation_of_agi_supported: false,
      open_world_generalization_supported: false,
      agi_claim_supported: false,
      externally_replicated: false,
      claim_boundary: 'The result is deterministic controlled evidence for transport of one two-step solver invariant across five finite synthetic frames. It does not establish open-world learning, a general AGI tensor, or AGI.',
    },
  };
  return { ...report, report_hash: sha256Json(report) };
}

if (require.main === module) {
  process.stdout.write(`${JSON.stringify(runVerifiedSolverTransportExperiment(), null, 2)}\n`);
}

module.exports = {
  EXPERIMENT_ID,
  OPERATOR_AXIS,
  applyFrameBasisPermutation,
  deriveInvariantSketch,
  independentTargetOracle,
  inversePermutation,
  permutationMatrix,
  runVerifiedSolverTransportExperiment,
  tensorFromPrograms,
};
