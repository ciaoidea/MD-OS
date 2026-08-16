#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const OUTPUT_JSON = path.join(OPS_DIR, 'runtime_lifecycle_index.json');
const OUTPUT_MD = path.join(OPS_DIR, 'runtime_lifecycle_index.md');
const MDOSIGNORE_FILE = path.join(WORKSPACE_ROOT, '.mdosignore');
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.cache']);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function collectFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      const stats = fs.statSync(fullPath);
      files.push({
        path: rel(fullPath),
        size_bytes: stats.size,
        extension: path.extname(entry.name).toLowerCase() || '[no_ext]',
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function readIgnorePatterns() {
  if (!fs.existsSync(MDOSIGNORE_FILE)) return [];
  return fs.readFileSync(MDOSIGNORE_FILE, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function patternMatches(pattern, filePath) {
  const normalized = pattern.replace(/^\.\//, '');
  if (normalized.endsWith('/')) return filePath.startsWith(normalized);
  if (normalized.includes('*')) {
    const regexp = new RegExp(`^${normalized.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*')}$`);
    return regexp.test(filePath);
  }
  return filePath === normalized;
}

function isIgnored(filePath, patterns) {
  return patterns.some((pattern) => patternMatches(pattern, filePath));
}

function matchProjectGenerated(filePath) {
  return /^md-os\/ops\/projects\/[^/]+\/(?:work_items\.ndjson|status\.(?:json|md)|agenda\.(?:json|md)|relations\.(?:json|md)|priority_queue\.(?:json|md)|active_memory\.(?:json|md))$/.test(filePath);
}

function matchArchiveGenerated(filePath) {
  return /^md-os\/ops\/archive\/projects\/[^/]+\/(?:terminal_work_items\.ndjson|terminal_summary\.(?:json|md))$/.test(filePath);
}

function classify(filePath, ignored) {
  const generatedOwners = [
    ['md-os/ops/global_index.json', 'build_global_index'],
    ['md-os/ops/global_index.md', 'build_global_index'],
    ['md-os/ops/markdown_graph.json', 'build_markdown_graph'],
    ['md-os/ops/markdown_graph.md', 'build_markdown_graph'],
    ['md-os/ops/semantic_knowledge_graph.json', 'build_semantic_knowledge_graph'],
    ['md-os/ops/semantic_knowledge_graph.md', 'build_semantic_knowledge_graph'],
    ['md-os/ops/semantic_knowledge_summary.json', 'build_semantic_knowledge_graph'],
    ['md-os/ops/semantic_knowledge_summary.md', 'build_semantic_knowledge_graph'],
    ['md-os/ops/semantic/commitment_gate_status.json', 'build_semantic_commitment_gate'],
    ['md-os/ops/semantic/commitment_gate_status.md', 'build_semantic_commitment_gate'],
    ['md-os/ops/workspace_inventory.json', 'build_workspace_inventory'],
    ['md-os/ops/workspace_inventory.md', 'build_workspace_inventory'],
    ['md-os/ops/system_hygiene_status.json', 'build_system_hygiene_status'],
    ['md-os/ops/system_hygiene_status.md', 'build_system_hygiene_status'],
    ['md-os/ops/runtime_lifecycle_index.json', 'build_runtime_lifecycle_index'],
    ['md-os/ops/runtime_lifecycle_index.md', 'build_runtime_lifecycle_index'],
    ['md-os/ops/releases/self_release_index.json', 'build_self_release_index'],
    ['md-os/ops/releases/self_release_index.md', 'build_self_release_index'],
    ['md-os/ops/agi/loop_status.json', 'agi_loop_eval'],
    ['md-os/ops/agi/loop_status.md', 'agi_loop_eval'],
    ['md-os/ops/agi/promotion_gate.json', 'agi_loop_eval'],
    ['md-os/ops/agi/promotion_gate.md', 'agi_loop_eval'],
    ['md-os/ops/agi/neuromorphic_learning_status.json', 'run_neuromorphic_learning_experiment'],
    ['md-os/ops/agi/neuromorphic_learning_status.md', 'run_neuromorphic_learning_experiment'],
    ['md-os/ops/agi/apfc_causal_learning_status.json', 'run_apfc_causal_learning_experiment'],
    ['md-os/ops/agi/apfc_causal_learning_status.md', 'run_apfc_causal_learning_experiment'],
    ['md-os/ops/agi/sal/score.json', 'agi_sal_evaluator'],
    ['md-os/ops/agi/sal/score.md', 'agi_sal_evaluator'],
    ['md-os/ops/agi/sal/source_manifest.json', 'agi_sal_evaluator'],
    ['md-os/ops/agi/sal/external_evaluation_request.json', 'agi_sal_evaluator'],
    ['md-os/ops/skills/skill_registry.json', 'agi_loop_eval'],
    ['md-os/ops/skills/skill_registry.md', 'agi_loop_eval'],
    ['md-os/ops/evals/agi_eval_report.json', 'agi_loop_eval'],
    ['md-os/ops/evals/agi_eval_report.md', 'agi_loop_eval'],
    ['md-os/ops/failures/failure_index.json', 'agi_loop_eval'],
    ['md-os/ops/failures/failure_index.md', 'agi_loop_eval'],
    ['md-os/ops/world/world_model.json', 'agi_loop_eval'],
    ['md-os/ops/world/world_model.md', 'agi_loop_eval'],
    ['md-os/ops/benchmarks/agi_benchmarks.json', 'agi_loop_eval'],
    ['md-os/ops/benchmarks/agi_benchmarks.md', 'agi_loop_eval'],
    ['md-os/ops/benchmarks/software_repair/index.json', 'build_software_repair_benchmark_index'],
    ['md-os/ops/benchmarks/software_repair/index.md', 'build_software_repair_benchmark_index'],
    ['md-os/ops/runtime/semantic_operational_compiler.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/semantic_operational_compiler.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/semantic_index.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/semantic_index.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/claim_index.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/claim_index.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/capability_index.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/capability_index.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/link_index.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/link_index.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/eval_results.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/eval_results.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/epistemic_health.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/semantic_drift_report.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/index.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/index.md', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/bootstrap.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/operations.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/epistemic.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/semantic_task.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/import.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/runtime_health.json', 'build_runtime_compiler'],
    ['md-os/ops/runtime/context_packs/agi_learning.json', 'build_runtime_compiler'],
    ['md-os/ops/core/agentic_core.json', 'build_agentic_core'],
    ['md-os/ops/core/agentic_core.md', 'build_agentic_core'],
    ['md-os/ops/health.json', 'build_health_dashboard'],
    ['md-os/ops/health.md', 'build_health_dashboard'],
    ['md-os/ops/health_classification.json', 'build_health_classifier'],
    ['md-os/ops/health_classification.md', 'build_health_classifier'],
    ['md-os/ops/replay_report.json', 'replay_runtime'],
    ['md-os/ops/replay_report.md', 'replay_runtime'],
    ['md-os/ops/agenda/global_agenda.json', 'build_global_agenda'],
    ['md-os/ops/agenda/global_agenda.md', 'build_global_agenda'],
    ['md-os/ops/compiled/programs.json', 'compile_programs'],
    ['md-os/ops/compiled/programs.md', 'compile_programs'],
    ['md-os/ops/apfc/cognitive/apfc_cognitive_status.json', 'apfc_cognitive_runtime_status'],
    ['md-os/ops/apfc/cognitive/apfc_cognitive_status.md', 'apfc_cognitive_runtime_status'],
    ['md-os/ops/modules/registry.json', 'build_module_registry'],
    ['md-os/ops/modules/registry.md', 'build_module_registry'],
    ['md-os/ops/summary/active_work_items.json', 'archive_runtime_state'],
    ['md-os/ops/summary/active_work_items.md', 'archive_runtime_state'],
    ['md-os/ops/summary/conceptual_boot_summary.json', 'build_conceptual_boot_summary'],
    ['md-os/ops/summary/conceptual_boot_summary.md', 'build_conceptual_boot_summary'],
    ['md-os/ops/runtime/module_capability_index.json', 'build_module_registry'],
    ['md-os/ops/runtime/module_capability_index.md', 'build_module_registry'],
    ['md-os/ops/runtime/module_graph.json', 'build_module_registry'],
    ['md-os/ops/runtime/module_graph.md', 'build_module_registry'],
    ['md-os/ops/runtime/cli_commands.json', 'build_module_registry'],
    ['md-os/ops/runtime/mcp_tools.json', 'build_module_registry'],
    ['md-os/ops/runtime/operating_cycle_report.json', 'operating_cycle'],
    ['md-os/ops/runtime/operating_cycle_report.md', 'operating_cycle'],
  ];

  for (const [exactPath, owner] of generatedOwners) {
    if (filePath === exactPath) {
      return {
        lifecycle_class: 'generated',
        owner,
        rebuildable: true,
        publishable: false,
        scope: 'runtime',
      };
    }
  }

  if (filePath.startsWith('graphify-out/cache/')) {
    return { lifecycle_class: 'local', owner: 'graphify_connector', rebuildable: false, publishable: false, scope: 'host_local_graphify_cache' };
  }
  if (filePath.startsWith('graphify-out/')) {
    return { lifecycle_class: 'generated', owner: 'graphify_connector', rebuildable: true, publishable: false, scope: 'generated_graphify_readback' };
  }

  if (matchProjectGenerated(filePath)) {
    return { lifecycle_class: 'generated', owner: 'build_project_state', rebuildable: true, publishable: false, scope: 'runtime' };
  }
  if (matchArchiveGenerated(filePath)) {
    return { lifecycle_class: 'archive', owner: 'archive_runtime_state', rebuildable: true, publishable: false, scope: 'runtime' };
  }
  if (/^md-os\/ops\/apfc\/executive\/(?:graph|status)\.(?:json|md)$/.test(filePath)
    || /^md-os\/ops\/apfc\/executive\/(?:live_graph|live_status)\.json$/.test(filePath)
    || /^md-os\/ops\/apfc\/executive\/(?:source_manifest|last_valid_graph)\.json$/.test(filePath)
    || filePath.startsWith('md-os/ops/apfc/executive/history/')
    || filePath.startsWith('md-os/ops/apfc/executive/context_packs/')
    || filePath.startsWith('md-os/ops/apfc/executive/views/')
    || filePath.startsWith('md-os/ops/apfc/executive/graphify/')) {
    return { lifecycle_class: 'generated', owner: 'build_apfc_graph', rebuildable: true, publishable: false, scope: 'generated_apfc_executive_state' };
  }
  if (filePath === 'md-os/ops/apfc/executive/events.ndjson') {
    return { lifecycle_class: 'live', owner: 'apfc_event_recorder', rebuildable: false, publishable: false, scope: 'live_apfc_event_ledger' };
  }
  if (filePath.startsWith('md-os/ops/apfc/executive/consolidation/')
    || filePath.startsWith('md-os/ops/apfc/executive/rejected/')) {
    return { lifecycle_class: 'live', owner: 'apfc_governance', rebuildable: false, publishable: false, scope: 'live_apfc_governance_state' };
  }
  if (/^md-os\/ops\/projects\/[^/]+\/project\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'human_or_host_runtime', rebuildable: false, publishable: false, scope: 'live_project_definition' };
  }
  if (filePath.startsWith('md-os/ops/programs/')) {
    return { lifecycle_class: 'source', owner: 'human_or_host_runtime', rebuildable: false, publishable: false, scope: 'live_program' };
  }
  if (/^md-os\/ops\/calculations\/wolfram\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'wolfram_calculation_registry', rebuildable: false, publishable: false, scope: 'live_calculation_profile' };
  }
  if (/^md-os\/ops\/calculations\/wolfram\/scripts\/[^/]+\.wl$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'wolfram_calculation_source', rebuildable: false, publishable: false, scope: 'live_calculation_script' };
  }
  if (/^md-os\/ops\/imports\/knowledge\/[^/]+\/(?:inventory|classification|relations|promotion_plan|questions|readback)\.(?:json|md)$/.test(filePath)) {
    return { lifecycle_class: 'generated', owner: 'build_knowledge_import', rebuildable: true, publishable: false, scope: 'knowledge_import_readback' };
  }
  if (/^md-os\/ops\/imports\/knowledge\/[^/]+\/extracted\/[^/]+\.(?:json|md|txt)$/.test(filePath)) {
    return { lifecycle_class: 'generated', owner: 'build_knowledge_import', rebuildable: true, publishable: false, scope: 'knowledge_import_extraction' };
  }
  if (/^md-os\/ops\/imports\/knowledge\/[^/]+\/manifest\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'knowledge_import_method', rebuildable: false, publishable: false, scope: 'knowledge_import_manifest' };
  }
  if (/^md-os\/ops\/imports\/knowledge\/[^/]+\/raw\//.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'knowledge_import_method', rebuildable: false, publishable: false, scope: 'knowledge_import_raw_evidence' };
  }
  if (filePath.startsWith('md-os/ops/imports/knowledge/')) {
    return { lifecycle_class: 'live', owner: 'knowledge_import_method', rebuildable: false, publishable: false, scope: 'knowledge_import_state' };
  }
  if (/^md-os\/ops\/releases\/self\/proposals\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'self_release_proposal', rebuildable: false, publishable: false, scope: 'release_proposal_state' };
  }
  if (/^md-os\/ops\/semantic\/commitment_decisions\/semdec_[a-f0-9]{24}\.(?:json|md)$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'semantic_commitment_gate', rebuildable: false, publishable: false, scope: 'live_semantic_commitment_decision' };
  }
  if (/^md-os\/ops\/episodes\/[^/]+\.(?:json|md)$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'agi_episode_memory', rebuildable: false, publishable: false, scope: 'live_learning_episode' };
  }
  if (filePath.startsWith('md-os/ops/toe/campaigns/')) {
    return { lifecycle_class: 'live', owner: 'toe_research_campaign', rebuildable: false, publishable: false, scope: 'live_theoretical_research_evidence' };
  }
  if (filePath.startsWith('md-os/ops/agi/generality_experiments/')) {
    return { lifecycle_class: 'live', owner: 'agi_evidence_suite', rebuildable: false, publishable: false, scope: 'live_agi_generality_evidence' };
  }
  if (filePath.startsWith('md-os/ops/agi/learning_experiments/')) {
    return { lifecycle_class: 'live', owner: 'neuromorphic_learning_experiment', rebuildable: false, publishable: false, scope: 'live_neuromorphic_learning_evidence' };
  }
  if (filePath.startsWith('md-os/ops/agi/capability_experiments/')) {
    return { lifecycle_class: 'live', owner: 'agi_capability_lab', rebuildable: false, publishable: false, scope: 'live_agi_capability_evidence' };
  }
  if (filePath === 'md-os/ops/agi/sal/internal_real_world_evidence.json') {
    return { lifecycle_class: 'live', owner: 'agi_sal_evaluator', rebuildable: false, publishable: false, scope: 'live_agi_sal_internal_evidence' };
  }
  if (filePath.startsWith('md-os/ops/agi/sal/external_reports/')) {
    return { lifecycle_class: 'live', owner: 'external_agi_sal_evaluator', rebuildable: false, publishable: false, scope: 'live_agi_sal_external_evidence' };
  }
  if (/^md-os\/ops\/tasks\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'cognitive_task_compiler', rebuildable: false, publishable: false, scope: 'live_cognitive_task_spec' };
  }
  if (/^md-os\/ops\/action_receipts\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'cognitive_transaction_executor', rebuildable: false, publishable: false, scope: 'live_action_receipt' };
  }
  if (/^md-os\/ops\/verifications\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'cognitive_postcondition_verifier', rebuildable: false, publishable: false, scope: 'live_verification_result' };
  }
  if (/^md-os\/ops\/benchmarks\/software_repair\/runs\/[^/]+\/(?:benchmark_run\.(?:json|md)|candidate_comparison\.json|benchmark_case_snapshot\.json|candidate_set_snapshot\.json|base_repository\.bundle|candidate_[^/]+\.diff|submitted_candidate_[^/]+\.patch)$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'software_repair_benchmark_runner', rebuildable: false, publishable: false, scope: 'live_benchmark_evidence' };
  }
  if (/^md-os\/ops\/benchmarks\/software_repair\/runs\/[^/]+\/provider_evidence\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'software_repair_benchmark_runner', rebuildable: false, publishable: false, scope: 'live_provider_evidence_snapshot' };
  }
  if (filePath.startsWith('md-os/ops/benchmarks/software_repair/candidate_sets/')) {
    return { lifecycle_class: 'live', owner: 'benchmark_candidate_provider', rebuildable: false, publishable: false, scope: 'live_benchmark_candidate' };
  }
  if (filePath.startsWith('md-os/ops/benchmarks/software_repair/.sandbox/')) {
    return { lifecycle_class: 'local', owner: 'software_repair_benchmark_runner', rebuildable: false, publishable: false, scope: 'temporary_benchmark_sandbox' };
  }
  if (/^md-os\/ops\/trajectories\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'agi_trajectory_memory', rebuildable: false, publishable: false, scope: 'live_learning_trajectory' };
  }
  if (/^md-os\/ops\/skills\/candidates\/[^/]+\.(?:json|md)$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'agi_skill_candidate', rebuildable: false, publishable: false, scope: 'live_skill_candidate' };
  }
  if (/^md-os\/ops\/skills\/promoted\/[^/]+\.(?:json|md)$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'agi_skill_promotion', rebuildable: false, publishable: false, scope: 'live_promoted_skill' };
  }
  if (/^md-os\/ops\/skills\/history\/[^/]+\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'live', owner: 'apfc_skill_governance', rebuildable: false, publishable: false, scope: 'immutable_skill_governance_history' };
  }
  if (filePath.startsWith('md-os/ops/sources/')) {
    return { lifecycle_class: 'source', owner: 'connector_or_host_runtime', rebuildable: false, publishable: false, scope: 'live_observation' };
  }
  if (filePath === 'md-os/ops/connectors/connector_registry.json') {
    return { lifecycle_class: 'source', owner: 'connector_registry', rebuildable: false, publishable: false, scope: 'live_connector_registry' };
  }
  if (/^md-os\/ops\/connectors\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'connector_profile', rebuildable: false, publishable: false, scope: 'live_connector_profile' };
  }
  if (/^md-os\/ops\/policies\/[^/]+\.json$/.test(filePath)) {
    return { lifecycle_class: 'source', owner: 'policy_source', rebuildable: false, publishable: false, scope: 'live_policy' };
  }
  if (filePath.startsWith('md-os/ops/evals/')) {
    return { lifecycle_class: 'source', owner: 'eval_source', rebuildable: false, publishable: false, scope: 'live_eval' };
  }
  if (filePath.startsWith('md-os/ops/actions/')) {
    return { lifecycle_class: 'source', owner: 'action_source', rebuildable: false, publishable: false, scope: 'live_action_record' };
  }
  if (filePath === 'md-os/ops/apfc/cognitive/latest_frame.json') {
    return { lifecycle_class: 'live', owner: 'apfc_cognitive_runtime', rebuildable: false, publishable: false, scope: 'live_apfc_cognitive_pointer' };
  }
  if (filePath.startsWith('md-os/ops/apfc/cognitive/')) {
    return { lifecycle_class: 'live', owner: 'apfc_cognitive_runtime', rebuildable: false, publishable: false, scope: 'live_apfc_cognitive_state' };
  }
  if (filePath.startsWith('md-os/ops/processes/')) {
    return { lifecycle_class: 'source', owner: 'process_source', rebuildable: false, publishable: false, scope: 'live_process_record' };
  }
  if (filePath === 'md-os/ops/.gitkeep') {
    return { lifecycle_class: 'source', owner: 'repository', rebuildable: false, publishable: true, scope: 'repository_placeholder' };
  }
  if (filePath === 'md-os/ops/journal.ndjson' || filePath.startsWith('md-os/ops/changes/') || filePath.startsWith('md-os/ops/artifacts/')) {
    return { lifecycle_class: 'live', owner: 'host_runtime_or_connector', rebuildable: false, publishable: false, scope: 'live_agent_state' };
  }
  if (
    filePath === 'md-os/ops/state.json'
    || filePath === 'md-os/ops/current_task.md'
    || filePath === 'md-os/ops/continuity.md'
    || filePath === 'md-os/ops/last_summary.md'
    || filePath.startsWith('md-os/ops/local/')
    || filePath.startsWith('md-os/ops/services/')
    || filePath.startsWith('md-os/ops/locks/')
  ) {
    return { lifecycle_class: 'local', owner: 'host_runtime', rebuildable: false, publishable: false, scope: 'host_local_runtime' };
  }
  if (filePath.startsWith('md-os/examples/')) {
    return { lifecycle_class: 'demo', owner: 'repository', rebuildable: false, publishable: true, scope: 'demo_seed' };
  }
  if (filePath.startsWith('docs/papers/') && (filePath.endsWith('.tex') || filePath.endsWith('.md'))) {
    return { lifecycle_class: 'source', owner: 'publication_source', rebuildable: false, publishable: true, scope: 'official_presentation_material' };
  }
  if (filePath.startsWith('docs/papers/') || filePath.endsWith('.pdf')) {
    return { lifecycle_class: 'generated', owner: 'document_build', rebuildable: true, publishable: 'review', scope: 'publication_artifact' };
  }
  if (
    filePath === 'AGENTS.md'
    || filePath === 'ME.md'
    || filePath === 'README.md'
    || filePath === 'package.json'
    || filePath === 'Makefile'
    || filePath === 'LICENSE'
    || filePath === 'CONTRIBUTING.md'
    || filePath === '.gitignore'
    || filePath === '.mdosignore'
    || filePath === 'MDOS_OPERATING_FLOW.svg'
    || filePath.startsWith('md-os/apfc/')
    || filePath.startsWith('md-os/benchmarks/')
    || filePath.startsWith('md-os/kernel/')
    || filePath.startsWith('md-os/kb/')
    || filePath.startsWith('md-os/modules/')
    || filePath.startsWith('md-os/os/')
    || filePath.startsWith('md-os/schemas/')
    || filePath.startsWith('docs/')
    || filePath.startsWith('test/')
    || filePath.startsWith('scripts/')
    || filePath.startsWith('dev/')
    || filePath.startsWith('requirements-')
    || filePath.startsWith('bootstrap-md-os-')
  ) {
    return { lifecycle_class: 'source', owner: 'repository', rebuildable: false, publishable: ignored ? false : true, scope: 'repository_source' };
  }
  if (filePath.startsWith('md-os/ops/')) {
    return { lifecycle_class: 'live', owner: 'unknown_runtime_writer', rebuildable: false, publishable: false, scope: 'unclassified_ops_runtime' };
  }
  return { lifecycle_class: 'source', owner: 'repository', rebuildable: false, publishable: ignored ? false : true, scope: 'repository_source' };
}

function buildIndex() {
  const ignorePatterns = readIgnorePatterns();
  const files = collectFiles(WORKSPACE_ROOT).map((file) => {
    const ignored = isIgnored(file.path, ignorePatterns);
    const classification = classify(file.path, ignored);
    return {
      ...file,
      ...classification,
      ignored_by_mdosignore: ignored,
    };
  });

  const classCounts = {};
  const scopeCounts = {};
  const ownerCounts = {};
  for (const file of files) {
    classCounts[file.lifecycle_class] = (classCounts[file.lifecycle_class] || 0) + 1;
    scopeCounts[file.scope] = (scopeCounts[file.scope] || 0) + 1;
    ownerCounts[file.owner] = (ownerCounts[file.owner] || 0) + 1;
  }

  const findings = [];
  for (const file of files) {
    if (file.scope === 'unclassified_ops_runtime') {
      findings.push({
        severity: 'attention',
        code: 'UNCLASSIFIED_OPS_RUNTIME_FILE',
        path: file.path,
        message: 'File under md-os/ops/ matched no explicit lifecycle rule.',
      });
    }
    if (file.lifecycle_class === 'generated' && !file.rebuildable) {
      findings.push({
        severity: 'critical',
        code: 'GENERATED_FILE_NOT_REBUILDABLE',
        path: file.path,
        message: 'Generated state must have an owning builder and rebuild path.',
      });
    }
    if ((file.lifecycle_class === 'local' || file.lifecycle_class === 'live') && file.publishable === true) {
      findings.push({
        severity: 'critical',
        code: 'RUNTIME_FILE_MARKED_PUBLISHABLE',
        path: file.path,
        message: 'Local or live runtime state must not be treated as publishable source.',
      });
    }
  }

  const status = findings.some((item) => item.severity === 'critical')
    ? 'critical'
    : findings.length
      ? 'attention'
      : 'ok';

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(files.map((file) => ({
      path: file.path,
      lifecycle_class: file.lifecycle_class,
      owner: file.owner,
      rebuildable: file.rebuildable,
      publishable: file.publishable,
      scope: file.scope,
      ignored_by_mdosignore: file.ignored_by_mdosignore,
    }))),
    status,
    file_count: files.length,
    class_counts: Object.fromEntries(Object.entries(classCounts).sort(([left], [right]) => left.localeCompare(right))),
    scope_counts: Object.fromEntries(Object.entries(scopeCounts).sort(([left], [right]) => left.localeCompare(right))),
    owner_counts: Object.fromEntries(Object.entries(ownerCounts).sort(([left], [right]) => left.localeCompare(right))),
    finding_count: findings.length,
    findings,
    files,
  };
}

function buildMarkdown(index) {
  const lines = [
    '# Runtime Lifecycle Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    '',
    `Status: \`${index.status}\``,
    '',
    `Files classified: \`${index.file_count}\``,
    '',
    '## Lifecycle Classes',
    '',
  ];
  for (const [name, count] of Object.entries(index.class_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }
  lines.push('', '## Owners', '');
  for (const [name, count] of Object.entries(index.owner_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }
  lines.push('', '## Findings', '');
  if (!index.findings.length) {
    lines.push('- No lifecycle inconsistencies detected.');
  } else {
    for (const finding of index.findings.slice(0, 50)) {
      lines.push(`- \`${finding.severity}\` \`${finding.code}\`: \`${finding.path}\` - ${finding.message}`);
    }
  }
  lines.push('', '## File Index', '');
  for (const file of index.files) {
    lines.push(`- \`${file.path}\`: \`${file.lifecycle_class}\` | owner \`${file.owner}\` | scope \`${file.scope}\` | rebuildable \`${file.rebuildable}\` | publishable \`${file.publishable}\``);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const index = buildIndex();
  withFileLock('builder__runtime_lifecycle_index', {
    context: 'build_runtime_lifecycle_index',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, index);
    atomicWriteText(OUTPUT_MD, buildMarkdown(index));
  });
  appendJournal({
    event: 'runtime_lifecycle_index_rebuilt',
    status: index.status,
    file_count: index.file_count,
    finding_count: index.finding_count,
  });
  printJson({
    ok: true,
    mode: 'build_runtime_lifecycle_index',
    updated_at: index.updated_at,
    status: index.status,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    file_count: index.file_count,
    finding_count: index.finding_count,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildIndex,
  classify,
};
