#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { compileTaskSpec } = require('../kernel/cognition/task_compiler');
const { executeActions } = require('../kernel/cognition/executor');
const { verifyTaskOutcome } = require('../kernel/cognition/verifier');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const AGI_DIR = path.join(OPS_DIR, 'agi');
const EPISODES_DIR = path.join(OPS_DIR, 'episodes');
const SKILLS_DIR = path.join(OPS_DIR, 'skills');
const SKILL_CANDIDATES_DIR = path.join(SKILLS_DIR, 'candidates');
const SKILL_PROMOTED_DIR = path.join(SKILLS_DIR, 'promoted');
const EVALS_DIR = path.join(OPS_DIR, 'evals');
const FAILURES_DIR = path.join(OPS_DIR, 'failures');
const TRAJECTORIES_DIR = path.join(OPS_DIR, 'trajectories');
const TASKS_DIR = path.join(OPS_DIR, 'tasks');
const ACTION_RECEIPTS_DIR = path.join(OPS_DIR, 'action_receipts');
const VERIFICATIONS_DIR = path.join(OPS_DIR, 'verifications');
const WORLD_DIR = path.join(OPS_DIR, 'world');
const BENCHMARKS_DIR = path.join(OPS_DIR, 'benchmarks');
const RUNTIME_DIR = path.join(OPS_DIR, 'runtime');
const CONTEXT_PACK_DIR = path.join(RUNTIME_DIR, 'context_packs');

const RUNTIME_COMPILER_JSON = path.join(RUNTIME_DIR, 'semantic_operational_compiler.json');
const CAPABILITY_INDEX_JSON = path.join(RUNTIME_DIR, 'capability_index.json');
const CLAIM_INDEX_JSON = path.join(RUNTIME_DIR, 'claim_index.json');
const CONTEXT_PACK_INDEX_JSON = path.join(CONTEXT_PACK_DIR, 'index.json');
const CONNECTOR_REGISTRY_JSON = path.join(OPS_DIR, 'connectors', 'connector_registry.json');

const OUTPUTS = {
  loopStatusJson: path.join(AGI_DIR, 'loop_status.json'),
  loopStatusMd: path.join(AGI_DIR, 'loop_status.md'),
  promotionGateJson: path.join(AGI_DIR, 'promotion_gate.json'),
  promotionGateMd: path.join(AGI_DIR, 'promotion_gate.md'),
  skillRegistryJson: path.join(SKILLS_DIR, 'skill_registry.json'),
  skillRegistryMd: path.join(SKILLS_DIR, 'skill_registry.md'),
  evalReportJson: path.join(EVALS_DIR, 'agi_eval_report.json'),
  evalReportMd: path.join(EVALS_DIR, 'agi_eval_report.md'),
  failureIndexJson: path.join(FAILURES_DIR, 'failure_index.json'),
  failureIndexMd: path.join(FAILURES_DIR, 'failure_index.md'),
  worldModelJson: path.join(WORLD_DIR, 'world_model.json'),
  worldModelMd: path.join(WORLD_DIR, 'world_model.md'),
  benchmarkJson: path.join(BENCHMARKS_DIR, 'agi_benchmarks.json'),
  benchmarkMd: path.join(BENCHMARKS_DIR, 'agi_benchmarks.md'),
};

const TASK_TYPES = [
  'software_repair',
  'knowledge_import',
  'identity_alignment',
  'epistemic_validation',
  'filesystem_operation',
  'hardware_operation',
  'research_task',
  'general_operation',
];

const FAILURE_CLASSES = [
  'reasoning_error',
  'retrieval_error',
  'tool_use_error',
  'stale_claim',
  'missing_capability',
  'bad_schema',
  'unsafe_action',
  'semantic_conflict',
  'verification_gap',
  'none',
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function slug(value) {
  return shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
}

function stableId(prefix, value) {
  return `${prefix}_${slug(value)}_${sha256Text(value).slice(0, 10)}`;
}

function episodeId(task, timestamp) {
  const stamp = String(timestamp || nowIso())
    .replace(/[-:.]/g, '_')
    .replace('T', 't')
    .replace('Z', 'z');
  return `ep_${stamp}_${sha256Text(task).slice(0, 10)}`;
}

function uniq(values) {
  return Array.from(new Set((values || []).filter(Boolean))).sort();
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name))
    .sort();
}

function loadJsonList(dirPath) {
  return listJsonFiles(dirPath)
    .map((filePath) => readJsonSafe(filePath))
    .filter(Boolean);
}

function parseBooleanFlag(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const lower = String(value).toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(lower)) return true;
  if (['0', 'false', 'no', 'off'].includes(lower)) return false;
  return fallback;
}

function parseOptions(args) {
  const options = {
    task: '',
    risk_level: '',
    allowed_tools: [],
    context_pack_id: '',
    task_spec: '',
    eval_required: true,
    promote: false,
    allow_high_risk: false,
    rebuild_runtime: true,
  };
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--task') options.task = next();
    else if (arg.startsWith('--task=')) options.task = arg.slice('--task='.length);
    else if (arg === '--risk-level') options.risk_level = next();
    else if (arg.startsWith('--risk-level=')) options.risk_level = arg.slice('--risk-level='.length);
    else if (arg === '--allowed-tools') options.allowed_tools = next().split(',').map(shortText).filter(Boolean);
    else if (arg.startsWith('--allowed-tools=')) options.allowed_tools = arg.slice('--allowed-tools='.length).split(',').map(shortText).filter(Boolean);
    else if (arg === '--context-pack') options.context_pack_id = next();
    else if (arg.startsWith('--context-pack=')) options.context_pack_id = arg.slice('--context-pack='.length);
    else if (arg === '--task-spec') options.task_spec = next();
    else if (arg.startsWith('--task-spec=')) options.task_spec = arg.slice('--task-spec='.length);
    else if (arg === '--no-eval') options.eval_required = false;
    else if (arg.startsWith('--eval-required=')) options.eval_required = parseBooleanFlag(arg.slice('--eval-required='.length), true);
    else if (arg === '--no-promote') options.promote = false;
    else if (arg === '--promote') options.promote = true;
    else if (arg === '--allow-high-risk') options.allow_high_risk = true;
    else if (arg === '--no-runtime-rebuild') options.rebuild_runtime = false;
    else if (arg.startsWith('-')) throw new Error(`UNKNOWN_AGI_OPTION: ${arg}`);
    else positional.push(arg);
  }
  if (!options.task && positional.length) options.task = positional.join(' ');
  options.task = shortText(options.task);
  options.risk_level = shortText(options.risk_level).toLowerCase();
  options.context_pack_id = shortText(options.context_pack_id);
  options.task_spec = shortText(options.task_spec);
  return options;
}

function inferTaskType(task) {
  const lower = shortText(task).toLowerCase();
  if (/\b(test|bug|repair|fix|node|npm|cli|script|code|repo|runtime compiler)\b/.test(lower)) return 'software_repair';
  if (/\b(import|knowledge|repository|persona|identity import|migration)\b/.test(lower)) return 'knowledge_import';
  if (/\b(identity|bootstrap|self|release|version|persona)\b/.test(lower)) return 'identity_alignment';
  if (/\b(claim|fact|source|verify|validate|contradiction|epistemic)\b/.test(lower)) return 'epistemic_validation';
  if (/\b(file|filesystem|path|directory|terminal|command)\b/.test(lower)) return 'filesystem_operation';
  if (/\b(hardware|device|robot|sensor|actuator|screen|audio)\b/.test(lower)) return 'hardware_operation';
  if (/\b(research|paper|math|science|benchmark|experiment)\b/.test(lower)) return 'research_task';
  return 'general_operation';
}

function inferRiskLevel(task, taskType, explicitRisk) {
  if (['low', 'medium', 'high'].includes(explicitRisk)) return explicitRisk;
  const lower = shortText(task).toLowerCase();
  if (taskType === 'hardware_operation' || /\b(delete|destructive|credential|secret|sudo|identity)\b/.test(lower)) return 'high';
  if (taskType === 'filesystem_operation' || taskType === 'software_repair' || taskType === 'knowledge_import') return 'medium';
  return 'low';
}

function contextPackForTask(taskType, explicitContextPack) {
  if (explicitContextPack) return explicitContextPack;
  if (taskType === 'software_repair' || taskType === 'filesystem_operation') return 'operations';
  if (taskType === 'knowledge_import') return 'import';
  if (taskType === 'identity_alignment') return 'bootstrap';
  if (taskType === 'epistemic_validation' || taskType === 'research_task') return 'epistemic';
  if (taskType === 'hardware_operation') return 'runtime_health';
  return 'semantic_task';
}

function toolsForTask(taskType, allowedTools) {
  const inferred = {
    software_repair: ['filesystem', 'terminal'],
    knowledge_import: ['filesystem'],
    identity_alignment: ['filesystem'],
    epistemic_validation: ['filesystem', 'source_check'],
    filesystem_operation: ['filesystem', 'terminal'],
    hardware_operation: ['hardware_connector', 'readback'],
    research_task: ['filesystem', 'source_check'],
    general_operation: ['filesystem'],
  }[taskType] || ['filesystem'];
  return uniq([...(allowedTools || []), ...inferred]);
}

function loadRuntime() {
  return {
    compiler: readJsonSafe(RUNTIME_COMPILER_JSON, {}),
    capabilityIndex: readJsonSafe(CAPABILITY_INDEX_JSON, { capabilities: [] }),
    claimIndex: readJsonSafe(CLAIM_INDEX_JSON, { claims: [] }),
    contextPackIndex: readJsonSafe(CONTEXT_PACK_INDEX_JSON, { packs: [] }),
    connectorRegistry: readJsonSafe(CONNECTOR_REGISTRY_JSON, { connectors: [] }),
  };
}

function loadContextPack(packId) {
  const filePath = path.join(CONTEXT_PACK_DIR, `${packId}.json`);
  const pack = readJsonSafe(filePath);
  if (!pack) return null;
  return {
    ...pack,
    file: rel(filePath),
  };
}

function relevantCapabilities(runtime, task, taskType) {
  const terms = new Set(shortText(`${task} ${taskType}`).toLowerCase().split(/[^a-z0-9]+/).filter((item) => item.length >= 3));
  const capabilities = Array.isArray(runtime.capabilityIndex.capabilities) ? runtime.capabilityIndex.capabilities : [];
  const scored = capabilities.map((capability) => {
    const haystack = shortText([
      capability.capability_id,
      capability.capability_type,
      ...(capability.tools || []),
      ...(capability.source_nodes || []),
      ...(capability.requires || []),
    ].join(' ')).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (haystack.includes(term)) score += 1;
    }
    if (capability.capability_type === 'procedural') score += 1;
    if (taskType === 'epistemic_validation' && capability.capability_id.includes('epistemic')) score += 3;
    if (taskType === 'identity_alignment' && capability.capability_id.includes('identity')) score += 3;
    if (taskType === 'software_repair' && haystack.includes('terminal')) score += 2;
    return { capability, score };
  }).filter((item) => item.score > 0);
  return scored
    .sort((left, right) => right.score - left.score || left.capability.capability_id.localeCompare(right.capability.capability_id))
    .slice(0, 8)
    .map((item) => item.capability);
}

function loadSkillRegistry() {
  const registry = readJsonSafe(OUTPUTS.skillRegistryJson, { promoted_skills: [], candidate_skills: [] });
  return {
    promoted_skills: Array.isArray(registry.promoted_skills) ? registry.promoted_skills : [],
    runtime_eligible_promoted_skills: Array.isArray(registry.runtime_eligible_promoted_skills)
      ? registry.runtime_eligible_promoted_skills
      : [],
    candidate_skills: Array.isArray(registry.candidate_skills) ? registry.candidate_skills : [],
  };
}

function relevantSkills(registry, taskType) {
  return registry.runtime_eligible_promoted_skills
    .filter((skill) => skill.status === 'promoted'
      && (skill.domain === taskType || (skill.task_types || []).includes(taskType)))
    .slice(0, 5);
}

function buildPlan({ taskType, contextPackId, riskLevel, capabilities, skills, taskSpec }) {
  return [
    {
      step_id: 'task_compile',
      actor: 'task_compiler',
      action: 'compile_verifiable_task_spec',
      inputs: [taskSpec.task_spec_id],
      expected_readback: 'task_spec_with_acceptance_contract',
    },
    {
      step_id: 'context_compile',
      actor: 'context_compiler',
      action: 'select_bootstrap_runtime_context',
      inputs: [contextPackId, taskType, riskLevel],
      expected_readback: 'context_pack_loaded_or_gap_recorded',
    },
    {
      step_id: 'transactional_execution',
      actor: 'transaction_executor',
      action: 'execute_declared_connector_actions',
      inputs: (taskSpec.actions || []).map((action) => action.action_id),
      expected_readback: 'action_receipts_with_state_delta',
    },
    {
      step_id: 'postcondition_verification',
      actor: 'independent_verifier',
      action: 'execute_acceptance_tests_and_check_postconditions',
      inputs: (taskSpec.acceptance_tests || []).map((test) => test.acceptance_test_id),
      expected_readback: 'verification_result',
    },
    {
      step_id: 'episode_commit',
      actor: 'episode_memory',
      action: 'commit_task_receipts_verification_and_episode',
      inputs: [
        ...capabilities.map((capability) => capability.capability_id).slice(0, 6),
        ...skills.map((skill) => skill.skill_id).slice(0, 4),
      ],
      expected_readback: 'proof_carrying_episode',
    },
  ];
}

function verifierChecks({ task, riskLevel, contextPack, runtime, options, tools }) {
  const compilerStatus = runtime.compiler && runtime.compiler.status || 'unknown';
  const checks = [
    {
      check_id: 'task_present',
      status: task ? 'ok' : 'critical',
      message: 'A run-once AGI loop must bind a concrete task before planning.',
    },
    {
      check_id: 'context_pack_available',
      status: contextPack ? 'ok' : 'attention',
      message: 'A compact context pack should be loaded from the runtime compiler.',
    },
    {
      check_id: 'runtime_compiler_readback',
      status: compilerStatus === 'ok' ? 'ok' : compilerStatus === 'critical' ? 'critical' : 'attention',
      message: 'The Semantic Operational Compiler is the substrate for AGI loop context.',
    },
    {
      check_id: 'risk_gate',
      status: riskLevel === 'high' && !options.allow_high_risk ? 'critical' : 'ok',
      message: 'High-risk cycles require explicit high-risk allowance and should remain human supervised.',
    },
    {
      check_id: 'tool_boundary',
      status: tools.length ? 'ok' : 'attention',
      message: 'The executor must operate through explicit tool affordances.',
    },
    {
      check_id: 'eval_required',
      status: options.eval_required ? 'ok' : 'attention',
      message: 'Promotion is blocked when eval is disabled.',
    },
  ];
  const status = checks.some((check) => check.status === 'critical')
    ? 'critical'
    : checks.some((check) => check.status === 'attention')
      ? 'attention'
      : 'ok';
  return {
    verifier_id: 'deterministic_run_once_verifier',
    status,
    checks,
  };
}

function verdictForVerification(verification) {
  if (verification.outcome === 'verified') return 'success';
  if (verification.outcome === 'failed') return 'failed';
  return 'unverified';
}

function failureClassForCheck(check) {
  if (check.check_id === 'context_pack_available') return 'retrieval_error';
  if (check.check_id === 'runtime_compiler_readback') return 'bad_schema';
  if (check.check_id === 'risk_gate') return 'unsafe_action';
  if (check.check_id === 'tool_boundary') return 'missing_capability';
  if (check.check_id === 'eval_required') return 'verification_gap';
  if (check.check_id.startsWith('acceptance_') || check.check_id.includes('postcondition')) return 'verification_gap';
  if (check.check_id === 'action_receipts_complete') return 'tool_use_error';
  if (check.check_id === 'policy_gate') return 'unsafe_action';
  return 'reasoning_error';
}

function buildFailureAnalysis(verification) {
  const failing = verification.checks.filter((check) => check.status !== 'ok');
  if (!failing.length) {
    return {
      root_cause: 'none',
      failure_class: 'none',
      missing_claim: null,
      missing_skill: null,
      bad_context: false,
      bad_plan: false,
      tool_error: false,
      verification_gap: false,
    };
  }
  const primary = failing[0];
  return {
    root_cause: primary.message,
    failure_class: failureClassForCheck(primary),
    missing_claim: primary.check_id === 'runtime_compiler_readback' ? 'runtime compiler ok readback' : null,
    missing_skill: primary.check_id === 'tool_boundary' ? 'explicit tool affordance skill' : null,
    bad_context: primary.check_id === 'context_pack_available',
    bad_plan: primary.check_id === 'risk_gate',
    tool_error: false,
    verification_gap: primary.check_id === 'eval_required',
  };
}

function buildCandidateSkill({ taskType, tools, episode, verification, evalResult, gate }) {
  const skillId = `skill_${taskType}_verified_loop`;
  const title = {
    software_repair: 'Run verified software repair loop',
    knowledge_import: 'Run verified knowledge import learning loop',
    identity_alignment: 'Run verified identity alignment loop',
    epistemic_validation: 'Run verified epistemic validation loop',
    filesystem_operation: 'Run verified filesystem operation loop',
    hardware_operation: 'Run supervised hardware operation loop',
    research_task: 'Run verified research task loop',
    general_operation: 'Run verified general task loop',
  }[taskType] || 'Run verified task loop';
  return {
    schema_version: 1,
    skill_id: skillId,
    title,
    description: 'Candidate procedure grounded in a postcondition-verified MD-OS episode; holdout evidence is still required before promotion.',
    status: gate && gate.status === 'ok' ? 'promotable' : 'candidate',
    domain: taskType,
    task_types: [taskType],
    inputs: ['task', 'risk_level', 'allowed_tools', 'context_pack_id'],
    tools,
    preconditions: [
      'task_is_explicit',
      'task_spec_is_verifiable',
      'acceptance_tests_are_executable',
      'md_os_boundary_available',
      'context_pack_loaded_or_missing_recorded',
      'tool_affordances_explicit',
    ],
    procedure: [
      'compile a typed TaskSpec with explicit acceptance tests',
      'execute only actions declared through bounded connectors',
      'capture an ActionReceipt and observed state delta for each action',
      'run acceptance tests independently from the transaction executor',
      'commit the TaskSpec, receipts, VerificationResult, episode, and trajectory',
      'evaluate the candidate on distinct holdout tasks before promotion',
    ],
    success_criteria: [
      'task_outcome_verified',
      'all_acceptance_tests_passed',
      'required_postconditions_observed',
      'proof_carrying_episode_written',
      'no_regression_recorded',
      'rollback_available',
    ],
    failure_modes: FAILURE_CLASSES.filter((item) => item !== 'none'),
    rollback: 'Demote the skill candidate or remove the promoted skill file, then rebuild agi eval and runtime compiler.',
    evals: evalResult ? [evalResult.eval_id] : [],
    source_episodes: [episode.episode_id],
    verifier_status: verification.status,
    verified_outcome_count: episode.verdict === 'success' ? 1 : 0,
    holdout_eval: null,
    promotion_gate_status: gate ? gate.status : 'unknown',
  };
}

function buildEvalForSkill({ skill, episode, verification, options }) {
  const hasSkill = Boolean(skill && skill.skill_id);
  const checks = [
    {
      check_id: 'schema_valid',
      status: hasSkill && skill.title && Array.isArray(skill.procedure) && skill.procedure.length ? 'ok' : 'critical',
      message: 'Skill candidate must be structured enough for reuse.',
    },
    {
      check_id: 'source_bound',
      status: episode && episode.episode_id ? 'ok' : 'critical',
      message: 'Skill candidate must be bound to at least one episode.',
    },
    {
      check_id: 'verifier_passed',
      status: verification.outcome === 'verified' ? 'ok' : verification.outcome === 'failed' ? 'critical' : 'attention',
      message: 'Only independently verified task outcomes may support a skill candidate.',
    },
    {
      check_id: 'eval_passed',
      status: options.eval_required && hasSkill ? 'attention' : 'critical',
      message: 'A source-episode check is not a holdout eval and cannot establish improvement.',
    },
    {
      check_id: 'no_regression',
      status: episode.regressions && episode.regressions.length ? 'critical' : 'ok',
      message: 'Promotion is blocked by recorded regression.',
    },
    {
      check_id: 'rollback_available',
      status: hasSkill && skill.rollback ? 'ok' : 'critical',
      message: 'Promoted skill must have a rollback path.',
    },
  ];
  const status = checks.some((check) => check.status === 'critical')
    ? 'critical'
    : checks.some((check) => check.status === 'attention')
      ? 'attention'
      : 'ok';
  return {
    schema_version: 1,
    eval_id: stableId('eval', `${hasSkill ? skill.skill_id : 'no_skill'}:${episode.episode_id}`),
    skill_id: hasSkill ? skill.skill_id : null,
    episode_id: episode.episode_id,
    status,
    improves: false,
    improvement_measured: false,
    task_outcome_verified: verification.outcome === 'verified',
    no_regression: !checks.some((check) => check.check_id === 'no_regression' && check.status !== 'ok'),
    checks,
  };
}

function buildPromotionGate({ skill, evalResult, riskLevel, options }) {
  const hasSkill = Boolean(skill && skill.skill_id);
  const requires = [
    'schema_valid',
    'source_bound',
    'verifier_passed',
    'eval_passed',
    'minimum_episode_diversity',
    'holdout_eval_passed',
    'no_regression',
    'risk_reviewed',
    'rollback_available',
  ];
  const blocksIf = [
    'imported_unverified_high_impact_claim',
    'unsafe_tool_required',
    'missing_readback',
    'semantic_contradiction_open',
    'eval_contamination_detected',
  ];
  const checks = [
    {
      check_id: 'schema_valid',
      status: hasSkill && skill.title ? 'ok' : 'critical',
      message: 'Promoted skill must be schema valid.',
    },
    {
      check_id: 'source_bound',
      status: hasSkill && skill.source_episodes && skill.source_episodes.length ? 'ok' : 'critical',
      message: 'Promoted skill must cite episode evidence.',
    },
    {
      check_id: 'verifier_passed',
      status: evalResult && evalResult.task_outcome_verified ? 'ok' : 'critical',
      message: 'Verifier must pass before promotion.',
    },
    {
      check_id: 'eval_passed',
      status: evalResult && evalResult.improvement_measured && evalResult.improves ? 'ok' : 'critical',
      message: 'Measured improvement on an eval distinct from the source episode is required.',
    },
    {
      check_id: 'minimum_episode_diversity',
      status: hasSkill && (skill.source_episodes || []).length >= 2 ? 'ok' : 'critical',
      message: 'Promotion requires verified evidence from at least two distinct source episodes.',
    },
    {
      check_id: 'holdout_eval_passed',
      status: hasSkill && skill.holdout_eval && skill.holdout_eval.status === 'ok' ? 'ok' : 'critical',
      message: 'Promotion requires a passing holdout eval that was not a source episode.',
    },
    {
      check_id: 'no_regression',
      status: evalResult && evalResult.no_regression ? 'ok' : 'critical',
      message: 'Promotion is blocked by recorded regression.',
    },
    {
      check_id: 'risk_reviewed',
      status: riskLevel === 'high' && !options.allow_high_risk ? 'critical' : 'ok',
      message: 'High-risk skills require explicit review.',
    },
    {
      check_id: 'rollback_available',
      status: hasSkill && skill.rollback ? 'ok' : 'critical',
      message: 'Rollback path is mandatory.',
    },
  ];
  const status = checks.some((check) => check.status === 'critical')
    ? 'critical'
    : checks.some((check) => check.status === 'attention')
      ? 'attention'
      : 'ok';
  return {
    schema_version: 1,
    gate_id: stableId('promotion_gate', `${hasSkill ? skill.skill_id : 'no_skill'}:${evalResult.eval_id}`),
    status,
    requires,
    blocks_if: blocksIf,
    checks,
  };
}

function buildEpisode(options) {
  const now = nowIso();
  const taskCompilation = compileTaskSpec({
    task: options.task,
    taskSpecPath: options.task_spec,
    createdAt: now,
  });
  const taskSpec = taskCompilation.task_spec;
  const task = taskSpec.goal;
  const runtime = loadRuntime();
  const taskType = inferTaskType(task);
  const riskLevel = inferRiskLevel(task, taskType, options.risk_level || taskSpec.risk_budget.level);
  taskSpec.task_type = taskType;
  taskSpec.risk_budget = {
    ...taskSpec.risk_budget,
    level: riskLevel,
  };
  const contextPackId = contextPackForTask(taskType, options.context_pack_id);
  const contextPack = loadContextPack(contextPackId);
  const registry = loadSkillRegistry();
  const skills = relevantSkills(registry, taskType);
  const capabilities = relevantCapabilities(runtime, task, taskType);
  const tools = toolsForTask(taskType, options.allowed_tools);
  const id = episodeId(task, now);
  const taskSpecPath = path.resolve(WORKSPACE_ROOT, taskCompilation.task_spec_file);
  fs.mkdirSync(TASKS_DIR, { recursive: true });
  atomicWriteJson(taskSpecPath, taskSpec);
  const plan = buildPlan({
    taskType,
    contextPackId,
    riskLevel,
    capabilities,
    skills,
    taskSpec,
  });
  const policyBlocked = riskLevel === 'high' && !options.allow_high_risk;
  const actionReceipts = taskCompilation.verifiable && !policyBlocked
    ? executeActions({ episodeId: id, taskSpec, receiptsDir: ACTION_RECEIPTS_DIR })
    : [];
  const verification = verifyTaskOutcome({
    episodeId: id,
    taskSpec,
    taskCompilation,
    actionReceipts,
    policyBlocked,
  });
  fs.mkdirSync(VERIFICATIONS_DIR, { recursive: true });
  const verificationFile = path.join(VERIFICATIONS_DIR, `${verification.verification_id}.json`);
  atomicWriteJson(verificationFile, verification);
  const verdict = verdictForVerification(verification);
  const failureAnalysis = buildFailureAnalysis(verification);
  const actions = actionReceipts.map((receipt) => ({
    action_id: receipt.action_id,
    action_receipt_id: receipt.action_receipt_id,
    tool: receipt.tool,
    status: receipt.status,
    exit_status: receipt.exit_status,
    observed_delta: receipt.observed_delta,
    readback: receipt.file,
  }));
  const observations = [
    {
      observation_id: 'obs_context',
      kind: 'context_pack',
      status: contextPack ? 'available' : 'missing',
      value: contextPack ? contextPack.file : `md-os/ops/runtime/context_packs/${contextPackId}.json`,
    },
    {
      observation_id: 'obs_runtime_compiler',
      kind: 'runtime_compiler',
      status: runtime.compiler && runtime.compiler.status || 'unknown',
      value: 'md-os/ops/runtime/semantic_operational_compiler.json',
    },
    ...actionReceipts.flatMap((receipt) => (receipt.observed_delta.targets || []).map((delta) => ({
      observation_id: `obs_${receipt.action_receipt_id}_${delta.target_id}`,
      kind: 'state_delta',
      status: delta.changed ? 'changed' : 'unchanged',
      value: delta,
    }))),
  ];
  const errors = verification.checks
    .filter((check) => check.status !== 'ok')
    .map((check) => ({
      error_id: stableId('err', `${id}:${check.check_id}`),
      class: failureClassForCheck(check),
      check_id: check.check_id,
      severity: check.status,
      message: check.message,
    }));
  const episode = {
    schema_version: 1,
    episode_id: id,
    created_at: now,
    task,
    task_type: taskType,
    risk_level: riskLevel,
    allowed_tools: tools,
    task_spec: taskSpec,
    task_spec_file: taskCompilation.task_spec_file,
    context_pack_id: contextPackId,
    context_pack_file: contextPack ? contextPack.file : null,
    plan,
    actions,
    observations,
    errors,
    artifacts: [],
    action_receipts: actionReceipts.map((receipt) => receipt.file),
    verification_result_file: rel(verificationFile),
    verifier_results: [verification],
    verdict,
    lessons: [
      verdict === 'success'
        ? 'The task outcome satisfied executable acceptance tests and declared postconditions.'
        : verdict === 'unverified'
          ? 'No success claim was made because the task lacks a complete executable acceptance contract.'
          : 'The observed outcome failed at least one declared action, postcondition, evidence, or acceptance test.',
    ],
    failure_analysis: failureAnalysis,
    candidate_claim_updates: [],
    candidate_skills: [],
    regressions: [],
  };
  let skill = null;
  let evalResult = buildEvalForSkill({ skill, episode, verification, options });
  let gate = buildPromotionGate({ skill, evalResult, riskLevel, options });
  if (verdict === 'success') {
    const placeholderSkill = buildCandidateSkill({
      taskType,
      tools,
      episode,
      verification,
      evalResult: null,
      gate: null,
    });
    evalResult = buildEvalForSkill({
      skill: placeholderSkill,
      episode,
      verification,
      options,
    });
    gate = buildPromotionGate({
      skill: placeholderSkill,
      evalResult,
      riskLevel,
      options,
    });
    skill = buildCandidateSkill({
      taskType,
      tools,
      episode,
      verification,
      evalResult,
      gate,
    });
    episode.candidate_skills = [skill.skill_id];
  }
  episode.artifacts = [
    taskCompilation.task_spec_file,
    ...actionReceipts.map((receipt) => receipt.file),
    rel(verificationFile),
    `md-os/ops/episodes/${episode.episode_id}.json`,
    `md-os/ops/trajectories/${episode.episode_id}.json`,
    ...(skill ? [`md-os/ops/skills/candidates/${skill.skill_id}.json`] : []),
    'md-os/ops/evals/agi_eval_report.json',
  ];
  const trajectory = {
    schema_version: 1,
    trajectory_id: `traj_${episode.episode_id}`,
    episode_id: episode.episode_id,
    task: episode.task,
    task_type: episode.task_type,
    steps: plan.map((step, index) => ({
      index: index + 1,
      step_id: step.step_id,
      actor: step.actor,
      action: step.action,
      expected_readback: step.expected_readback,
    })),
    verifier_status: verification.status,
    verification_outcome: verification.outcome,
    verdict,
  };
  return {
    episode,
    trajectory,
    skill,
    evalResult,
    gate,
    runtime,
    taskCompilation,
    actionReceipts,
    verificationFile: rel(verificationFile),
  };
}

function renderEpisodeMarkdown(episode) {
  const lines = [
    `# Episode ${episode.episode_id}`,
    '',
    `Created at: \`${episode.created_at}\``,
    `Verdict: \`${episode.verdict}\``,
    `Task type: \`${episode.task_type}\``,
    `Risk: \`${episode.risk_level}\``,
    `TaskSpec: \`${episode.task_spec_file}\``,
    `Verification outcome: \`${episode.verifier_results[0].outcome}\``,
    '',
    '## Task',
    '',
    episode.task,
    '',
    '## Plan',
    '',
    ...episode.plan.map((step) => `- \`${step.step_id}\`: ${step.actor} -> ${step.action}`),
    '',
    '## Verifier',
    '',
    ...episode.verifier_results[0].checks.map((check) => `- \`${check.status}\` \`${check.check_id}\`: ${check.message}`),
    '',
    '## Action Receipts',
    '',
    ...(episode.action_receipts.length ? episode.action_receipts.map((file) => `- \`${file}\``) : ['- No action receipt was produced.']),
    '',
    '## Lessons',
    '',
    ...episode.lessons.map((lesson) => `- ${lesson}`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function renderSkillMarkdown(skill) {
  const lines = [
    `# ${skill.title}`,
    '',
    `Skill id: \`${skill.skill_id}\``,
    `Status: \`${skill.status}\``,
    `Domain: \`${skill.domain}\``,
    `Promotion gate: \`${skill.promotion_gate_status}\``,
    '',
    skill.description,
    '',
    '## Procedure',
    '',
    ...skill.procedure.map((step) => `- ${step}`),
    '',
    '## Success Criteria',
    '',
    ...skill.success_criteria.map((criterion) => `- ${criterion}`),
    '',
    '## Rollback',
    '',
    skill.rollback,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function mergeSkill(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    source_episodes: uniq([...(existing.source_episodes || []), ...(incoming.source_episodes || [])]),
    evals: uniq([...(existing.evals || []), ...(incoming.evals || [])]),
  };
}

function writeEpisodeResult(result, options) {
  withFileLock('agi_loop_run_once', {
    context: 'agi_loop:run_once',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(EPISODES_DIR, { recursive: true });
    fs.mkdirSync(TRAJECTORIES_DIR, { recursive: true });
    fs.mkdirSync(SKILL_CANDIDATES_DIR, { recursive: true });
    fs.mkdirSync(SKILL_PROMOTED_DIR, { recursive: true });

    const episodeJson = path.join(EPISODES_DIR, `${result.episode.episode_id}.json`);
    const episodeMd = path.join(EPISODES_DIR, `${result.episode.episode_id}.md`);
    const trajectoryJson = path.join(TRAJECTORIES_DIR, `${result.episode.episode_id}.json`);
    atomicWriteJson(episodeJson, result.episode);
    atomicWriteText(episodeMd, renderEpisodeMarkdown(result.episode));
    atomicWriteJson(trajectoryJson, result.trajectory);
    if (!result.skill) return;
    const candidateJson = path.join(SKILL_CANDIDATES_DIR, `${result.skill.skill_id}.json`);
    const candidateMd = path.join(SKILL_CANDIDATES_DIR, `${result.skill.skill_id}.md`);
    const existingCandidate = readJsonSafe(candidateJson);
    const mergedCandidate = mergeSkill(existingCandidate, result.skill);
    atomicWriteJson(candidateJson, mergedCandidate);
    atomicWriteText(candidateMd, renderSkillMarkdown(mergedCandidate));
    // Candidate creation stays separate from promotion. All production
    // promotions are governed by apfc_runtime's verified transaction.
  });
}

function buildBenchmarks() {
  const benchmarks = [
    {
      benchmark_id: 'software_repair_vertical_v1',
      domain: 'software_repair',
      metric: 'verified_success_rate_holdout',
      target: 'compare fixed experimental configurations on uncontaminated holdout cases',
      runner: 'cortex benchmark software-repair run',
      candidate_provider: 'cortex benchmark software-repair generate',
      plan_ir: 'PlanGraph',
      index: 'md-os/ops/benchmarks/software_repair/index.json',
    },
    {
      benchmark_id: 'knowledge_import_smoke',
      domain: 'knowledge_import',
      metric: 'promotion_gate_blocks_unverified_identity',
      target: 'structured import without identity drift',
    },
    {
      benchmark_id: 'epistemic_validation_smoke',
      domain: 'epistemic_validation',
      metric: 'claim_status_complete',
      target: 'no unstatused claim promotion',
    },
    {
      benchmark_id: 'ops_replay_smoke',
      domain: 'filesystem_operation',
      metric: 'replay_matched_before',
      target: 'deterministic rebuild after action',
    },
  ];
  return {
    schema_version: 1,
    updated_at: nowIso(),
    benchmark_count: benchmarks.length,
    benchmarks,
  };
}

function buildWorldModel(runtime) {
  const connectors = Array.isArray(runtime.connectorRegistry.connectors) ? runtime.connectorRegistry.connectors : [];
  const capabilities = Array.isArray(runtime.capabilityIndex.capabilities) ? runtime.capabilityIndex.capabilities : [];
  const entities = [
    {
      entity_id: 'md_os_workspace',
      type: 'workspace',
      affordances: ['read_markdown_control_plane', 'write_bounded_ops_state', 'run_deterministic_builders'],
      constraints: ['active_boundary_md_os', 'repository_relative_paths'],
      risks: ['identity_drift', 'unclassified_runtime_state'],
      readback: ['global_index', 'health_dashboard', 'replay_report'],
      linked_capabilities: ['semantic.route_intent', 'readback.inspect_state'],
    },
    {
      entity_id: 'semantic_operational_compiler',
      type: 'compiler',
      affordances: ['compile_semantic_nodes', 'compile_claims', 'compile_capabilities', 'compile_context_packs'],
      constraints: ['requires_semantic_graph', 'generated_outputs_are_rebuildable'],
      risks: ['stale_context_pack', 'unverified_claim_promotion'],
      readback: ['semantic_operational_compiler', 'epistemic_health'],
      linked_capabilities: ['epistemic.validate_claims', 'semantic.route_intent'],
    },
    ...connectors.map((connector) => ({
      entity_id: shortText(connector.connector_id),
      type: 'tool',
      affordances: uniq([...(connector.read_capabilities || []), ...(connector.write_capabilities || [])]),
      constraints: [
        shortText(connector.execution_mode || 'bounded_execution'),
        shortText(connector.permission_profile || 'permission_profile_unspecified'),
      ],
      risks: connector.risk_level ? [`${connector.risk_level}_risk_connector`] : [],
      readback: ['connector_snapshot', 'journal_event'],
      linked_capabilities: [`connector.${shortText(connector.connector_id)}`],
    })),
  ];
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status: 'ok',
    entity_count: entities.length,
    capability_count: capabilities.length,
    entities,
  };
}

function loadEpisodes() {
  return loadJsonList(EPISODES_DIR).sort((left, right) => String(left.created_at || '').localeCompare(String(right.created_at || '')));
}

function loadSkills() {
  const governed = loadJsonList(SKILL_PROMOTED_DIR).sort((left, right) => String(left.skill_id || '').localeCompare(String(right.skill_id || '')));
  return {
    candidates: loadJsonList(SKILL_CANDIDATES_DIR).sort((left, right) => String(left.skill_id || '').localeCompare(String(right.skill_id || ''))),
    promoted: governed.filter((skill) => skill.status === 'promoted'),
    deprecated: governed.filter((skill) => skill.status === 'deprecated'),
    revoked: governed.filter((skill) => skill.status === 'revoked'),
  };
}

function buildFailureIndex(episodes) {
  const failures = [];
  for (const episode of episodes) {
    for (const error of episode.errors || []) {
      failures.push({
        failure_id: stableId('failure', `${episode.episode_id}:${error.check_id || error.error_id}`),
        episode_id: episode.episode_id,
        task_type: episode.task_type,
        failure_class: FAILURE_CLASSES.includes(error.class) ? error.class : 'reasoning_error',
        severity: shortText(error.severity || 'attention'),
        message: shortText(error.message),
      });
    }
  }
  const counts = failures.reduce((acc, failure) => {
    acc[failure.failure_class] = (acc[failure.failure_class] || 0) + 1;
    return acc;
  }, {});
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status: failures.some((failure) => failure.severity === 'critical') ? 'attention' : 'ok',
    failure_count: failures.length,
    failure_class_counts: Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right))),
    failures,
  };
}

function buildSkillRegistry(skills) {
  const annotatedPromoted = skills.promoted.map((skill) => ({
    ...skill,
    runtime_eligible: Boolean(
      skill.promotion_receipt_id
      && skill.source_consolidation_cycle_id
      && skill.promotion_evidence_hash,
    ),
  }));
  const runtimeEligible = annotatedPromoted.filter((skill) => Boolean(
    skill.promotion_receipt_id
    && skill.source_consolidation_cycle_id
    && skill.promotion_evidence_hash,
  ));
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status: 'ok',
    promoted_skill_count: skills.promoted.length,
    runtime_eligible_promoted_skill_count: runtimeEligible.length,
    historical_ungoverned_promoted_skill_count: annotatedPromoted.length - runtimeEligible.length,
    candidate_skill_count: skills.candidates.length,
    deprecated_skill_count: (skills.deprecated || []).length,
    revoked_skill_count: (skills.revoked || []).length,
    promoted_skills: annotatedPromoted,
    runtime_eligible_promoted_skills: runtimeEligible,
    candidate_skills: skills.candidates,
    deprecated_skills: skills.deprecated || [],
    revoked_skills: skills.revoked || [],
  };
}

function buildEvalReport({ episodes, skills, failureIndex }) {
  const byDomain = {};
  for (const episode of episodes) {
    const domain = episode.task_type || 'unknown';
    const entry = byDomain[domain] || { total: 0, success: 0, unverified: 0, partial: 0, failed: 0 };
    entry.total += 1;
    if (episode.verdict === 'success') entry.success += 1;
    else if (episode.verdict === 'unverified') entry.unverified += 1;
    else if (episode.verdict === 'partial') entry.partial += 1;
    else if (episode.verdict === 'failed') entry.failed += 1;
    byDomain[domain] = entry;
  }
  const successRateByDomain = {};
  for (const [domain, entry] of Object.entries(byDomain)) {
    successRateByDomain[domain] = entry.total ? Number((entry.success / entry.total).toFixed(4)) : 0;
  }
  const totalEpisodes = episodes.length;
  const successCount = episodes.filter((episode) => episode.verdict === 'success').length;
  const report = {
    schema_version: 1,
    updated_at: nowIso(),
    status: failureIndex.status === 'ok' ? 'ok' : 'attention',
    metrics: {
      episode_count: totalEpisodes,
      success_count: successCount,
      unverified_count: episodes.filter((episode) => episode.verdict === 'unverified').length,
      partial_count: episodes.filter((episode) => episode.verdict === 'partial').length,
      failed_count: episodes.filter((episode) => episode.verdict === 'failed').length,
      success_rate: totalEpisodes ? Number((successCount / totalEpisodes).toFixed(4)) : 0,
      success_rate_by_domain: successRateByDomain,
      mean_steps_to_success: (() => {
        const successful = episodes.filter((episode) => episode.verdict === 'success');
        if (!successful.length) return null;
        const steps = successful.reduce((sum, episode) => sum + ((episode.actions || []).length || 0), 0);
        return Number((steps / successful.length).toFixed(2));
      })(),
      failure_recovery_rate: totalEpisodes ? Number((episodes.filter((episode) => (episode.errors || []).length && episode.verdict === 'success').length / totalEpisodes).toFixed(4)) : 0,
      autonomy_horizon: totalEpisodes ? 'single_cycle_minutes' : 'not_measured',
      semantic_drift: failureIndex.failure_class_counts.semantic_conflict || 0,
      claim_contradictions: 0,
      skill_reuse: skills.promoted.filter((skill) => Boolean(skill.promotion_receipt_id && skill.source_consolidation_cycle_id && skill.promotion_evidence_hash)).reduce((sum, skill) => sum + Math.max(0, (skill.source_episodes || []).length - 1), 0),
      promoted_skill_count: skills.promoted.length,
      runtime_eligible_promoted_skill_count: skills.promoted.filter((skill) => Boolean(skill.promotion_receipt_id && skill.source_consolidation_cycle_id && skill.promotion_evidence_hash)).length,
      candidate_skill_count: skills.candidates.length,
      regression_count: episodes.reduce((sum, episode) => sum + ((episode.regressions || []).length), 0),
      cost: 'not_measured',
    },
  };
  report.source_hash = sha256Json(report.metrics);
  return report;
}

function buildPromotionGateReadback(skillRegistry) {
  const requires = [
    'schema_valid',
    'source_bound',
    'verifier_passed',
    'eval_passed',
    'no_regression',
    'risk_reviewed',
    'rollback_available',
  ];
  const blocksIf = [
    'imported_unverified_high_impact_claim',
    'unsafe_tool_required',
    'missing_readback',
    'semantic_contradiction_open',
    'eval_contamination_detected',
  ];
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status: 'ok',
    rule: 'no promotion without eval, artifact, replayable manifest, risk review, and rollback path',
    requires,
    blocks_if: blocksIf,
    promoted_skill_count: skillRegistry.promoted_skill_count,
    candidate_skill_count: skillRegistry.candidate_skill_count,
  };
}

function buildLoopStatus({ episodes, skillRegistry, evalReport, failureIndex, worldModel, benchmarks }) {
  const findings = [];
  if (evalReport.metrics.unverified_count) {
    findings.push({
      severity: 'attention',
      code: 'UNVERIFIED_TASK_OUTCOMES_PRESENT',
      message: 'Some episodes intentionally withhold success because their acceptance contract is incomplete.',
    });
  }
  if (failureIndex.failure_count) {
    findings.push({
      severity: failureIndex.status === 'ok' ? 'info' : 'attention',
      code: 'EPISODE_FAILURES_PRESENT',
      message: 'Some episodes contain verifier findings and should drive skill repair or context improvement.',
    });
  }
  const status = findings.some((finding) => finding.severity === 'critical')
    ? 'critical'
    : findings.some((finding) => finding.severity === 'attention')
      ? 'attention'
      : 'ok';
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      episodes: episodes.map((episode) => ({
        episode_id: episode.episode_id,
        verdict: episode.verdict,
        task_type: episode.task_type,
        errors: (episode.errors || []).map((error) => error.class),
      })),
      skill_registry: {
        promoted_skill_count: skillRegistry.promoted_skill_count,
        candidate_skill_count: skillRegistry.candidate_skill_count,
      },
      eval_report: evalReport.source_hash,
      failure_index: failureIndex.failure_count,
      world_model: worldModel.entity_count,
      benchmark_count: benchmarks.benchmark_count,
    }),
    status,
    kernel_name: 'cognitive_transaction_loop',
    compatibility_aliases: ['verified_agi_loop', 'cortex agi'],
    definition: 'Proof-carrying cognitive transactions through typed TaskSpecs, bounded execution, ActionReceipts, independent postcondition verification, episodes, and APFC-governed skill promotion.',
    non_claims: [
      'not consciousness',
      'not unrestricted autonomy',
      'not hidden self-modification',
      'not parametric model training',
    ],
    commands: [
      'cortex agi run-once --task "<task>"',
      'cortex cognition run-once --task-spec md-os/ops/tasks/<id>.json',
      'cortex agi eval',
      'cortex agi learn',
      'cortex apfc promote <skill_candidate_id> --approve',
      'cortex agi accelerate --experiment-id <append_only_id>',
    ],
    directories: [
      'md-os/ops/agi/',
      'md-os/ops/tasks/',
      'md-os/ops/action_receipts/',
      'md-os/ops/verifications/',
      'md-os/ops/episodes/',
      'md-os/ops/skills/',
      'md-os/ops/evals/',
      'md-os/ops/failures/',
      'md-os/ops/trajectories/',
      'md-os/ops/world/',
      'md-os/ops/benchmarks/',
    ],
    metrics: evalReport.metrics,
    world_entity_count: worldModel.entity_count,
    benchmark_count: benchmarks.benchmark_count,
    findings,
  };
}

function renderSimpleTable(rows, columns) {
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => shortText(row[column] ?? '')).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function renderLoopStatusMarkdown(status) {
  return [
    '# Cognitive Transaction Loop Status',
    '',
    `Updated at: \`${status.updated_at}\``,
    `Status: \`${status.status}\``,
    '',
    status.definition,
    '',
    '## Metrics',
    '',
    `- episodes: \`${status.metrics.episode_count}\``,
    `- success rate: \`${status.metrics.success_rate}\``,
    `- unverified outcomes: \`${status.metrics.unverified_count || 0}\``,
    `- promoted skills: \`${status.metrics.promoted_skill_count}\``,
    `- runtime-eligible promoted skills: \`${status.metrics.runtime_eligible_promoted_skill_count || 0}\``,
    `- candidate skills: \`${status.metrics.candidate_skill_count}\``,
    `- failures: \`${status.metrics.failed_count}\``,
    `- autonomy horizon: \`${status.metrics.autonomy_horizon}\``,
    '',
    '## Non-Claims',
    '',
    ...status.non_claims.map((item) => `- ${item}`),
    '',
  ].join('\n');
}

function renderSkillRegistryMarkdown(registry) {
  const rows = [
    ...registry.promoted_skills.map((skill) => ({
      skill_id: skill.skill_id,
      status: skill.status,
      domain: skill.domain,
      episodes: (skill.source_episodes || []).length,
    })),
    ...registry.candidate_skills.map((skill) => ({
      skill_id: skill.skill_id,
      status: skill.status,
      domain: skill.domain,
      episodes: (skill.source_episodes || []).length,
    })),
    ...(registry.deprecated_skills || []).map((skill) => ({
      skill_id: skill.skill_id,
      status: skill.status,
      domain: skill.domain,
      episodes: (skill.source_episodes || []).length,
    })),
    ...(registry.revoked_skills || []).map((skill) => ({
      skill_id: skill.skill_id,
      status: skill.status,
      domain: skill.domain,
      episodes: (skill.source_episodes || []).length,
    })),
  ];
  return [
    '# Skill Registry',
    '',
    `Updated at: \`${registry.updated_at}\``,
    `Status: \`${registry.status}\``,
    `Promoted skills: \`${registry.promoted_skill_count}\``,
    `Candidate skills: \`${registry.candidate_skill_count}\``,
    '',
    rows.length ? renderSimpleTable(rows, ['skill_id', 'status', 'domain', 'episodes']) : '- No skills recorded.',
    '',
  ].join('\n');
}

function renderEvalReportMarkdown(report) {
  return [
    '# AGI Eval Report',
    '',
    `Updated at: \`${report.updated_at}\``,
    `Status: \`${report.status}\``,
    '',
    `- episode count: \`${report.metrics.episode_count}\``,
    `- success rate: \`${report.metrics.success_rate}\``,
    `- unverified outcomes: \`${report.metrics.unverified_count || 0}\``,
    `- mean steps to success: \`${report.metrics.mean_steps_to_success ?? 'n/a'}\``,
    `- recovery rate: \`${report.metrics.failure_recovery_rate}\``,
    `- skill reuse: \`${report.metrics.skill_reuse}\``,
    `- regressions: \`${report.metrics.regression_count}\``,
    '',
  ].join('\n');
}

function renderFailureIndexMarkdown(index) {
  return [
    '# Failure Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    `Failures: \`${index.failure_count}\``,
    '',
    index.failures.length
      ? renderSimpleTable(index.failures.slice(0, 120), ['episode_id', 'task_type', 'failure_class', 'severity', 'message'])
      : '- No verifier failures recorded.',
    '',
  ].join('\n');
}

function renderWorldModelMarkdown(model) {
  return [
    '# World Model',
    '',
    `Updated at: \`${model.updated_at}\``,
    `Status: \`${model.status}\``,
    `Entities: \`${model.entity_count}\``,
    `Capabilities: \`${model.capability_count}\``,
    '',
    renderSimpleTable(model.entities.slice(0, 120).map((entity) => ({
      entity_id: entity.entity_id,
      type: entity.type,
      affordances: (entity.affordances || []).join(', '),
      risks: (entity.risks || []).join(', '),
    })), ['entity_id', 'type', 'affordances', 'risks']),
    '',
  ].join('\n');
}

function renderBenchmarksMarkdown(benchmarks) {
  return [
    '# AGI Benchmarks',
    '',
    `Updated at: \`${benchmarks.updated_at}\``,
    `Benchmarks: \`${benchmarks.benchmark_count}\``,
    '',
    renderSimpleTable(benchmarks.benchmarks, ['benchmark_id', 'domain', 'metric', 'target']),
    '',
  ].join('\n');
}

function renderPromotionGateMarkdown(gate) {
  return [
    '# Promotion Gate',
    '',
    `Updated at: \`${gate.updated_at}\``,
    `Status: \`${gate.status}\``,
    '',
    gate.rule,
    '',
    '## Requires',
    '',
    ...gate.requires.map((item) => `- \`${item}\``),
    '',
    '## Blocks If',
    '',
    ...gate.blocks_if.map((item) => `- \`${item}\``),
    '',
  ].join('\n');
}

function writeAgiState(state) {
  withFileLock('agi_loop_state', {
    context: 'agi_loop:write_state',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    for (const dirPath of [AGI_DIR, SKILLS_DIR, EVALS_DIR, FAILURES_DIR, WORLD_DIR, BENCHMARKS_DIR]) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    atomicWriteJson(OUTPUTS.loopStatusJson, state.loopStatus);
    atomicWriteText(OUTPUTS.loopStatusMd, renderLoopStatusMarkdown(state.loopStatus));
    atomicWriteJson(OUTPUTS.promotionGateJson, state.promotionGate);
    atomicWriteText(OUTPUTS.promotionGateMd, renderPromotionGateMarkdown(state.promotionGate));
    atomicWriteJson(OUTPUTS.skillRegistryJson, state.skillRegistry);
    atomicWriteText(OUTPUTS.skillRegistryMd, renderSkillRegistryMarkdown(state.skillRegistry));
    atomicWriteJson(OUTPUTS.evalReportJson, state.evalReport);
    atomicWriteText(OUTPUTS.evalReportMd, renderEvalReportMarkdown(state.evalReport));
    atomicWriteJson(OUTPUTS.failureIndexJson, state.failureIndex);
    atomicWriteText(OUTPUTS.failureIndexMd, renderFailureIndexMarkdown(state.failureIndex));
    atomicWriteJson(OUTPUTS.worldModelJson, state.worldModel);
    atomicWriteText(OUTPUTS.worldModelMd, renderWorldModelMarkdown(state.worldModel));
    atomicWriteJson(OUTPUTS.benchmarkJson, state.benchmarks);
    atomicWriteText(OUTPUTS.benchmarkMd, renderBenchmarksMarkdown(state.benchmarks));
  });
}

function collectAgiState() {
  const runtime = loadRuntime();
  const episodes = loadEpisodes();
  const skills = loadSkills();
  const failureIndex = buildFailureIndex(episodes);
  const skillRegistry = buildSkillRegistry(skills);
  const evalReport = buildEvalReport({ episodes, skills, failureIndex });
  const worldModel = buildWorldModel(runtime);
  const benchmarks = buildBenchmarks();
  const promotionGate = buildPromotionGateReadback(skillRegistry);
  const loopStatus = buildLoopStatus({
    episodes,
    skillRegistry,
    evalReport,
    failureIndex,
    worldModel,
    benchmarks,
  });
  return {
    episodes,
    skills,
    failureIndex,
    skillRegistry,
    evalReport,
    worldModel,
    benchmarks,
    promotionGate,
    loopStatus,
  };
}

function runNodeScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    script: `md-os/os/${scriptName}`,
    args,
    status: result.status,
    stdout: String(result.stdout || '').trim().split('\n').filter(Boolean).slice(-3),
    stderr: String(result.stderr || '').trim().split('\n').filter(Boolean).slice(-3),
  };
}

function rebuildRuntimeReadback() {
  const builders = [
    runNodeScript('build_runtime_compiler.js'),
    runNodeScript('build_global_index.js'),
    runNodeScript('build_health_classifier.js'),
    runNodeScript('build_health_dashboard.js'),
  ];
  return {
    runtime_recompiled: builders[0].status === 0,
    builders,
  };
}

function runEval() {
  const state = collectAgiState();
  writeAgiState(state);
  appendJournal({
    event: 'agi_eval_rebuilt',
    status: state.loopStatus.status,
    episode_count: state.loopStatus.metrics.episode_count,
    promoted_skill_count: state.skillRegistry.promoted_skill_count,
    candidate_skill_count: state.skillRegistry.candidate_skill_count,
  });
  return {
    ok: true,
    mode: 'agi_eval',
    status: state.loopStatus.status,
    output_json: rel(OUTPUTS.loopStatusJson),
    eval_report: rel(OUTPUTS.evalReportJson),
    episode_count: state.loopStatus.metrics.episode_count,
    promoted_skill_count: state.skillRegistry.promoted_skill_count,
    candidate_skill_count: state.skillRegistry.candidate_skill_count,
  };
}

function runLearn() {
  const episodes = loadEpisodes();
  const existing = new Map(loadSkills().candidates.map((skill) => [skill.skill_id, skill]));
  withFileLock('agi_loop_learn', {
    context: 'agi_loop:learn',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(SKILL_CANDIDATES_DIR, { recursive: true });
    for (const episode of episodes) {
      if (episode.verdict !== 'success') continue;
      const verification = episode.verifier_results && episode.verifier_results[0] || { status: 'attention', checks: [] };
      const options = {
        eval_required: true,
        allow_high_risk: episode.risk_level === 'high' ? false : true,
      };
      const placeholder = buildCandidateSkill({
        taskType: episode.task_type,
        tools: episode.allowed_tools || [],
        episode,
        verification,
        evalResult: null,
        gate: null,
      });
      const evalResult = buildEvalForSkill({ skill: placeholder, episode, verification, options });
      const gate = buildPromotionGate({ skill: placeholder, evalResult, riskLevel: episode.risk_level || 'low', options });
      const skill = buildCandidateSkill({
        taskType: episode.task_type,
        tools: episode.allowed_tools || [],
        episode,
        verification,
        evalResult,
        gate,
      });
      const merged = mergeSkill(existing.get(skill.skill_id), skill);
      existing.set(skill.skill_id, merged);
      atomicWriteJson(path.join(SKILL_CANDIDATES_DIR, `${skill.skill_id}.json`), merged);
      atomicWriteText(path.join(SKILL_CANDIDATES_DIR, `${skill.skill_id}.md`), renderSkillMarkdown(merged));
    }
  });
  const payload = runEval();
  appendJournal({
    event: 'agi_learn_completed',
    episode_count: episodes.length,
    candidate_skill_count: payload.candidate_skill_count,
  });
  return {
    ...payload,
    mode: 'agi_learn',
  };
}

function runPromote(options = {}) {
  if (options.legacy_experiment !== true) {
    throw new Error('AGI_LEGACY_PROMOTION_DISABLED_USE_APFC_PROMOTE');
  }
  const candidates = loadSkills().candidates;
  let promoted = 0;
  withFileLock('agi_loop_promote', {
    context: 'agi_loop:promote',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    fs.mkdirSync(SKILL_PROMOTED_DIR, { recursive: true });
    for (const skill of candidates) {
      if (skill.promotion_gate_status !== 'ok') continue;
      if ((skill.source_episodes || []).length < 2) continue;
      if (!skill.holdout_eval || skill.holdout_eval.status !== 'ok') continue;
      if (skill.verifier_status !== 'ok') continue;
      const promotedPath = path.join(SKILL_PROMOTED_DIR, `${skill.skill_id}.json`);
      const existingPromoted = readJsonSafe(promotedPath, null);
      const promotedSkill = {
        ...skill,
        status: 'promoted',
        promoted_at: skill.promoted_at || (existingPromoted && existingPromoted.promoted_at) || nowIso(),
      };
      const comparable = (value) => {
        const copy = { ...(value || {}) };
        delete copy.status;
        delete copy.promoted_at;
        return sha256Json(copy);
      };
      if (existingPromoted && comparable(existingPromoted) === comparable(promotedSkill)) continue;
      atomicWriteJson(promotedPath, promotedSkill);
      atomicWriteText(path.join(SKILL_PROMOTED_DIR, `${promotedSkill.skill_id}.md`), renderSkillMarkdown(promotedSkill));
      promoted += 1;
    }
  });
  const payload = runEval();
  appendJournal({
    event: 'agi_promote_completed',
    promoted_this_run: promoted,
    promoted_skill_count: payload.promoted_skill_count,
  });
  return {
    ...payload,
    mode: 'agi_promote',
    promoted_this_run: promoted,
  };
}

function runOnce(args) {
  const options = parseOptions(args);
  if (!options.task && !options.task_spec) throw new Error('COGNITIVE_RUN_ONCE_REQUIRES_TASK_OR_TASK_SPEC');
  const result = buildEpisode(options);
  writeEpisodeResult(result, options);
  const statePayload = runEval();
  const rebuild = options.rebuild_runtime ? rebuildRuntimeReadback() : { runtime_recompiled: false, builders: [] };
  appendJournal({
    event: 'agi_run_once_completed',
    episode_id: result.episode.episode_id,
    task_type: result.episode.task_type,
    verdict: result.episode.verdict,
    candidate_skills: result.episode.candidate_skills,
    runtime_recompiled: rebuild.runtime_recompiled,
  });
  return {
    ok: true,
    mode: 'agi_run_once',
    canonical_mode: 'cognitive_transaction_run_once',
    episode_id: result.episode.episode_id,
    verdict: result.episode.verdict,
    task_type: result.episode.task_type,
    context_pack_id: result.episode.context_pack_id,
    task_spec_file: result.episode.task_spec_file,
    action_receipts: result.episode.action_receipts,
    verification_result: result.episode.verification_result_file,
    verification_outcome: result.episode.verifier_results[0].outcome,
    claim_updates: result.episode.candidate_claim_updates,
    skill_candidates: result.episode.candidate_skills,
    eval_results: [result.evalResult],
    promoted_skills: [],
    runtime_recompiled: rebuild.runtime_recompiled,
    episode_file: `md-os/ops/episodes/${result.episode.episode_id}.json`,
    eval_report: statePayload.eval_report,
    runtime_builders: rebuild.builders,
  };
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex cognition run-once --task "<task>" [--task-spec md-os/ops/tasks/<id>.json] [--risk-level low|medium|high] [--allowed-tools a,b] [--promote]',
    '  cortex agi run-once ...  # compatibility alias',
    '  cortex agi eval',
    '  cortex agi learn',
    '  cortex apfc promote <skill_candidate_id> --approve',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  try {
    if (!command || command === 'status' || command === 'eval') {
      printJson(runEval());
      return;
    }
    if (command === 'run-once' || command === 'once' || command === 'run') {
      printJson(runOnce(rest));
      return;
    }
    if (command === 'learn') {
      printJson(runLearn());
      return;
    }
    if (command === 'promote') {
      printJson(runPromote());
      return;
    }
    usage();
  } catch (error) {
    printJson({
      ok: false,
      mode: 'agi_loop_error',
      error: error.message,
    });
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildEpisode,
  buildEvalForSkill,
  buildFailureIndex,
  buildPromotionGate,
  buildSkillRegistry,
  collectAgiState,
  inferRiskLevel,
  inferTaskType,
  parseOptions,
  runEval,
  runLearn,
  runOnce,
  runPromote,
};
