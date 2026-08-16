#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  sha256Text,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const PROJECTS_DIR = path.join(OPS_DIR, 'projects');
const REPLAY_REPORT_JSON = path.join(OPS_DIR, 'replay_report.json');
const REPLAY_REPORT_MD = path.join(OPS_DIR, 'replay_report.md');

const PROJECT_COMPILED_FILES = [
  'work_items.ndjson',
  'status.json',
  'status.md',
  'agenda.json',
  'agenda.md',
  'relations.json',
  'relations.md',
  'priority_queue.json',
  'priority_queue.md',
  'active_memory.json',
  'active_memory.md',
];

const GLOBAL_COMPILED_FILES = [
  path.join(OPS_DIR, 'agenda', 'global_agenda.json'),
  path.join(OPS_DIR, 'agenda', 'global_agenda.md'),
  path.join(OPS_DIR, 'summary', 'active_work_items.json'),
  path.join(OPS_DIR, 'summary', 'active_work_items.md'),
  path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.json'),
  path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.md'),
  path.join(OPS_DIR, 'compiled', 'programs.json'),
  path.join(OPS_DIR, 'compiled', 'programs.md'),
  path.join(OPS_DIR, 'modules', 'registry.json'),
  path.join(OPS_DIR, 'modules', 'registry.md'),
  path.join(OPS_DIR, 'core', 'agentic_core.json'),
  path.join(OPS_DIR, 'core', 'agentic_core.md'),
  path.join(OPS_DIR, 'markdown_graph.json'),
  path.join(OPS_DIR, 'markdown_graph.md'),
  path.join(OPS_DIR, 'semantic_knowledge_graph.json'),
  path.join(OPS_DIR, 'semantic_knowledge_graph.md'),
  path.join(OPS_DIR, 'semantic_knowledge_summary.json'),
  path.join(OPS_DIR, 'semantic_knowledge_summary.md'),
  path.join(OPS_DIR, 'releases', 'self_release_index.json'),
  path.join(OPS_DIR, 'releases', 'self_release_index.md'),
  path.join(OPS_DIR, 'agi', 'loop_status.json'),
  path.join(OPS_DIR, 'agi', 'loop_status.md'),
  path.join(OPS_DIR, 'agi', 'promotion_gate.json'),
  path.join(OPS_DIR, 'agi', 'promotion_gate.md'),
  path.join(OPS_DIR, 'skills', 'skill_registry.json'),
  path.join(OPS_DIR, 'skills', 'skill_registry.md'),
  path.join(OPS_DIR, 'evals', 'agi_eval_report.json'),
  path.join(OPS_DIR, 'evals', 'agi_eval_report.md'),
  path.join(OPS_DIR, 'failures', 'failure_index.json'),
  path.join(OPS_DIR, 'failures', 'failure_index.md'),
  path.join(OPS_DIR, 'world', 'world_model.json'),
  path.join(OPS_DIR, 'world', 'world_model.md'),
  path.join(OPS_DIR, 'benchmarks', 'agi_benchmarks.json'),
  path.join(OPS_DIR, 'benchmarks', 'agi_benchmarks.md'),
  path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.json'),
  path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.md'),
  path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.json'),
  path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.md'),
  path.join(OPS_DIR, 'runtime', 'semantic_index.json'),
  path.join(OPS_DIR, 'runtime', 'semantic_index.md'),
  path.join(OPS_DIR, 'runtime', 'claim_index.json'),
  path.join(OPS_DIR, 'runtime', 'claim_index.md'),
  path.join(OPS_DIR, 'runtime', 'capability_index.json'),
  path.join(OPS_DIR, 'runtime', 'capability_index.md'),
  path.join(OPS_DIR, 'runtime', 'module_capability_index.json'),
  path.join(OPS_DIR, 'runtime', 'module_capability_index.md'),
  path.join(OPS_DIR, 'runtime', 'module_graph.json'),
  path.join(OPS_DIR, 'runtime', 'module_graph.md'),
  path.join(OPS_DIR, 'runtime', 'cli_commands.json'),
  path.join(OPS_DIR, 'runtime', 'mcp_tools.json'),
  path.join(OPS_DIR, 'runtime', 'link_index.json'),
  path.join(OPS_DIR, 'runtime', 'link_index.md'),
  path.join(OPS_DIR, 'runtime', 'eval_results.json'),
  path.join(OPS_DIR, 'runtime', 'eval_results.md'),
  path.join(OPS_DIR, 'runtime', 'epistemic_health.json'),
  path.join(OPS_DIR, 'runtime', 'semantic_drift_report.md'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'index.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'index.md'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'bootstrap.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'operations.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'epistemic.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'semantic_task.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'import.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'runtime_health.json'),
  path.join(OPS_DIR, 'runtime', 'context_packs', 'agi_learning.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'live_graph.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'live_status.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graph.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graph.md'),
  path.join(OPS_DIR, 'apfc', 'executive', 'status.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'status.md'),
  path.join(OPS_DIR, 'apfc', 'executive', 'source_manifest.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'context_packs', 'index.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'context_packs', 'index.md'),
  path.join(OPS_DIR, 'apfc', 'executive', 'views', 'executive_state.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'views', 'episode_timeline.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'views', 'learning_lineage.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'views', 'path_consolidation.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'views', 'epistemic_health.json'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graphify', 'executive_state.html'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graphify', 'episode_timeline.html'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graphify', 'learning_lineage.html'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graphify', 'path_consolidation.html'),
  path.join(OPS_DIR, 'apfc', 'executive', 'graphify', 'epistemic_health.html'),
  path.join(OPS_DIR, 'global_index.json'),
  path.join(OPS_DIR, 'global_index.md'),
  path.join(OPS_DIR, 'workspace_inventory.json'),
  path.join(OPS_DIR, 'workspace_inventory.md'),
  path.join(OPS_DIR, 'runtime_lifecycle_index.json'),
  path.join(OPS_DIR, 'runtime_lifecycle_index.md'),
  path.join(OPS_DIR, 'system_hygiene_status.json'),
  path.join(OPS_DIR, 'system_hygiene_status.md'),
  path.join(OPS_DIR, 'health_classification.json'),
  path.join(OPS_DIR, 'health_classification.md'),
  path.join(OPS_DIR, 'health.json'),
  path.join(OPS_DIR, 'health.md'),
  path.join(OPS_DIR, 'replay_report.json'),
  path.join(OPS_DIR, 'replay_report.md'),
];

const PROJECT_ARCHIVE_FILES = [
  'terminal_work_items.ndjson',
  'terminal_summary.json',
  'terminal_summary.md',
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function discoverProjectIds() {
  if (!fs.existsSync(PROJECTS_DIR)) return [];
  return fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .filter((projectId) => fs.existsSync(path.join(PROJECTS_DIR, projectId, 'project.json')))
    .sort();
}

function removeFileIfExists(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) throw new Error(`REPLAY_REFUSES_NON_FILE: ${rel(filePath)}`);
  fs.unlinkSync(filePath);
  return true;
}

function removeCompiledState(projectIds) {
  const removed = [];
  for (const projectId of projectIds) {
    const projectDir = path.join(PROJECTS_DIR, projectId);
    for (const filename of PROJECT_COMPILED_FILES) {
      const filePath = path.join(projectDir, filename);
      if (removeFileIfExists(filePath)) removed.push(rel(filePath));
    }
    const archiveDir = path.join(OPS_DIR, 'archive', 'projects', projectId);
    for (const filename of PROJECT_ARCHIVE_FILES) {
      const filePath = path.join(archiveDir, filename);
      if (removeFileIfExists(filePath)) removed.push(rel(filePath));
    }
  }
  for (const filePath of GLOBAL_COMPILED_FILES) {
    if (removeFileIfExists(filePath)) removed.push(rel(filePath));
  }
  const apfcContextDir = path.join(OPS_DIR, 'apfc', 'executive', 'context_packs');
  if (fs.existsSync(apfcContextDir)) {
    for (const entry of fs.readdirSync(apfcContextDir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(json|md)$/.test(entry.name)) continue;
      const filePath = path.join(apfcContextDir, entry.name);
      if (removeFileIfExists(filePath)) removed.push(rel(filePath));
    }
  }
  return removed.sort();
}

function runNodeScript(scriptName, args = []) {
  const scriptPath = path.join(__dirname, scriptName);
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  if (result.status !== 0) {
    const error = new Error(`REPLAY_BUILDER_FAILED: ${scriptName}`);
    error.stdout = result.stdout;
    error.stderr = result.stderr;
    error.status = result.status;
    throw error;
  }
  return {
    script: `md-os/os/${scriptName}`,
    args,
    stdout: String(result.stdout || '').trim().split('\n').filter(Boolean).slice(-5),
  };
}

function hashFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return sha256Text(readTextSafe(filePath));
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  }
  return files.sort();
}

function manifestForFiles(files, { scrubJson = false } = {}) {
  return [...new Set(files)]
    .filter((filePath) => fs.existsSync(filePath) && fs.statSync(filePath).isFile())
    .sort()
    .map((filePath) => {
      let hash = hashFileIfPresent(filePath);
      if (scrubJson && filePath.endsWith('.json')) {
        const payload = readJsonSafe(filePath);
        if (payload) {
          const scrubbed = JSON.parse(JSON.stringify(payload));
          delete scrubbed.updated_at;
          delete scrubbed.replayed_at;
          hash = sha256Text(JSON.stringify(scrubbed));
        }
      }
      return {
        path: rel(filePath),
        sha256: hash,
      };
    });
}

function sourceManifest(projectIds) {
  const files = [
    path.join(WORKSPACE_ROOT, 'AGENTS.md'),
    path.join(WORKSPACE_ROOT, 'ME.md'),
    path.join(MDOS_ROOT, 'kb', 'AGENTIC_CORE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'AGENTIC_OPERATION_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'ARTIFICIAL_PREFRONTAL_CORTEX_GRAPH_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'AGENTIC_OPERATIONAL_CONTROL_ARCHITECTURE.md'),
    path.join(MDOS_ROOT, 'kb', 'AGENT_IDENTITY.md'),
    path.join(MDOS_ROOT, 'kb', 'AGENTIC_OPERATIONAL_RELEASE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md'),
    path.join(MDOS_ROOT, 'kb', 'COGNITIVE_BOOTSTRAP.md'),
    path.join(MDOS_ROOT, 'kb', 'COGNITIVE_TRANSACTION_LOOP_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'CONCEPTUAL_COLD_BOOT_SUMMARY_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'EPISTEMIC_LIFECYCLE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'KNOWLEDGE_IMPORT_METHOD_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'MARKDOWN_GRAPH_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'MASTER_CLOSURE_DISCIPLINE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'OPERATIONS.md'),
    path.join(MDOS_ROOT, 'kb', 'PERMISSION_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'RELEASE_VERSION_NAMING_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'RUNTIME_STATE_LIFECYCLE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SELF_RELEASE_EVOLUTION_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SOFTWARE_REPAIR_BENCHMARK_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SEMANTIC_NEURAL_OVERLAY_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SEMANTIC_OPERATIONAL_COMPILER_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SEMANTIC_OPERATIONAL_NETWORK_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'SYSTEM_OPERATING_CYCLE_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'VERIFIED_AGI_LOOP_MODEL.md'),
    path.join(MDOS_ROOT, 'kb', 'WARM_START_MODEL.md'),
    ...listFilesRecursive(path.join(MDOS_ROOT, 'schemas')),
    ...listFilesRecursive(path.join(MDOS_ROOT, 'apfc')),
    ...listFilesRecursive(path.join(MDOS_ROOT, 'kernel')),
    ...listFilesRecursive(path.join(MDOS_ROOT, 'benchmarks')),
    ...listFilesRecursive(path.join(MDOS_ROOT, 'modules')),
    path.join(OPS_DIR, 'journal.ndjson'),
    ...listFilesRecursive(path.join(OPS_DIR, 'episodes')),
    ...listFilesRecursive(path.join(OPS_DIR, 'tasks')),
    ...listFilesRecursive(path.join(OPS_DIR, 'action_receipts')),
    ...listFilesRecursive(path.join(OPS_DIR, 'verifications')),
    ...listFilesRecursive(path.join(OPS_DIR, 'benchmarks', 'software_repair', 'candidate_sets')),
    ...listFilesRecursive(path.join(OPS_DIR, 'benchmarks', 'software_repair', 'runs')),
    ...listFilesRecursive(path.join(OPS_DIR, 'trajectories')),
    ...listFilesRecursive(path.join(OPS_DIR, 'skills', 'candidates')),
    ...listFilesRecursive(path.join(OPS_DIR, 'skills', 'promoted')),
    ...listFilesRecursive(path.join(OPS_DIR, 'skills', 'history')),
    path.join(OPS_DIR, 'apfc', 'executive', 'events.ndjson'),
    ...listFilesRecursive(path.join(OPS_DIR, 'apfc', 'executive', 'consolidation')).filter((filePath) => !/index\.(json|md)$/.test(filePath)),
    ...listFilesRecursive(path.join(OPS_DIR, 'connectors')),
    ...listFilesRecursive(path.join(OPS_DIR, 'calculations')),
    ...listFilesRecursive(path.join(OPS_DIR, 'sources')),
    ...listFilesRecursive(path.join(OPS_DIR, 'programs')),
    ...listFilesRecursive(path.join(OPS_DIR, 'processes')),
    ...listFilesRecursive(path.join(OPS_DIR, 'releases', 'self', 'proposals')),
  ];
  for (const projectId of projectIds) {
    files.push(path.join(PROJECTS_DIR, projectId, 'project.json'));
  }
  return manifestForFiles(files);
}

function outputManifest(projectIds) {
  const files = [
    ...GLOBAL_COMPILED_FILES,
    ...listFilesRecursive(path.join(OPS_DIR, 'apfc', 'executive', 'context_packs')),
  ];
  for (const projectId of projectIds) {
    for (const filename of PROJECT_COMPILED_FILES) files.push(path.join(PROJECTS_DIR, projectId, filename));
    for (const filename of PROJECT_ARCHIVE_FILES) files.push(path.join(OPS_DIR, 'archive', 'projects', projectId, filename));
  }
  return manifestForFiles(files, { scrubJson: true });
}

function replayFingerprint(projectIds) {
  const projects = {};
  for (const projectId of projectIds) {
    const projectDir = path.join(PROJECTS_DIR, projectId);
    const status = readJsonSafe(path.join(projectDir, 'status.json'));
    const agenda = readJsonSafe(path.join(projectDir, 'agenda.json'));
    const relations = readJsonSafe(path.join(projectDir, 'relations.json'));
    const priorityQueue = readJsonSafe(path.join(projectDir, 'priority_queue.json'));
    const activeMemory = readJsonSafe(path.join(projectDir, 'active_memory.json'));
    projects[projectId] = {
      work_items_hash: hashFileIfPresent(path.join(projectDir, 'work_items.ndjson')),
      status_source_hash: status && status.source_hash || null,
      agenda_source_hash: agenda && agenda.source_hash || null,
      relations_source_hash: relations && relations.source_hash || null,
      priority_queue_source_hash: priorityQueue && priorityQueue.source_hash || null,
      active_memory_source_hash: activeMemory && activeMemory.source_hash || null,
      open_count: status && status.summary && status.summary.open_count,
      agenda_item_count: agenda && agenda.item_count,
      relation_count: relations && relations.edge_count,
    };
  }

  const globalAgenda = readJsonSafe(path.join(OPS_DIR, 'agenda', 'global_agenda.json'));
  const globalIndex = readJsonSafe(path.join(OPS_DIR, 'global_index.json'));
  const markdownGraph = readJsonSafe(path.join(OPS_DIR, 'markdown_graph.json'));
  const semanticSummary = readJsonSafe(path.join(OPS_DIR, 'semantic_knowledge_summary.json'));
  const selfRelease = readJsonSafe(path.join(OPS_DIR, 'releases', 'self_release_index.json'));
  const agiLoop = readJsonSafe(path.join(OPS_DIR, 'agi', 'loop_status.json'));
  const agiEval = readJsonSafe(path.join(OPS_DIR, 'evals', 'agi_eval_report.json'));
  const softwareRepairBenchmark = readJsonSafe(path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.json'));
  const skillRegistry = readJsonSafe(path.join(OPS_DIR, 'skills', 'skill_registry.json'));
  const runtimeCompiler = readJsonSafe(path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.json'));
  const moduleRegistry = readJsonSafe(path.join(OPS_DIR, 'modules', 'registry.json'));
  const moduleCapabilities = readJsonSafe(path.join(OPS_DIR, 'runtime', 'module_capability_index.json'));
  const healthClassification = readJsonSafe(path.join(OPS_DIR, 'health_classification.json'));
  const compiledPrograms = readJsonSafe(path.join(OPS_DIR, 'compiled', 'programs.json'));
  const activeSummary = readJsonSafe(path.join(OPS_DIR, 'summary', 'active_work_items.json'));
  const conceptualBootSummary = readJsonSafe(path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.json'));
  const agenticCore = readJsonSafe(path.join(OPS_DIR, 'core', 'agentic_core.json'));
  const apfcGraph = readJsonSafe(path.join(OPS_DIR, 'apfc', 'executive', 'graph.json'));
  const apfcStatus = readJsonSafe(path.join(OPS_DIR, 'apfc', 'executive', 'status.json'));
  return {
    compiled_programs_source_hash: compiledPrograms && compiledPrograms.source_hash || null,
    compiled_program_count: compiledPrograms && Number.isFinite(compiledPrograms.program_count) ? compiledPrograms.program_count : null,
    active_summary_source_hash: activeSummary && activeSummary.source_hash || null,
    conceptual_boot_summary_source_hash: conceptualBootSummary && conceptualBootSummary.source_hash || null,
    conceptual_boot_summary_status: conceptualBootSummary && conceptualBootSummary.status || null,
    conceptual_boot_summary_layer_count: conceptualBootSummary && Array.isArray(conceptualBootSummary.layers) ? conceptualBootSummary.layers.length : null,
    conceptual_boot_summary_missing_input_count: conceptualBootSummary && Number.isFinite(conceptualBootSummary.missing_input_count) ? conceptualBootSummary.missing_input_count : null,
    agentic_core_source_hash: agenticCore && agenticCore.source_hash || null,
    agentic_core_id: agenticCore && agenticCore.core && agenticCore.core.core_id || null,
    active_work_item_count: activeSummary && Number.isFinite(activeSummary.active_count) ? activeSummary.active_count : null,
    terminal_work_item_count: activeSummary && Number.isFinite(activeSummary.terminal_count) ? activeSummary.terminal_count : null,
    projects,
    global_agenda_source_hash: globalAgenda && globalAgenda.source_hash || null,
    global_agenda_item_count: globalAgenda && Array.isArray(globalAgenda.items) ? globalAgenda.items.length : null,
    markdown_graph_source_hash: markdownGraph && markdownGraph.source_hash || null,
    markdown_graph_file_count: markdownGraph && Number.isFinite(markdownGraph.markdown_file_count) ? markdownGraph.markdown_file_count : null,
    markdown_graph_structural_isolated_count: markdownGraph && Number.isFinite(markdownGraph.structural_isolated_count) ? markdownGraph.structural_isolated_count : null,
    semantic_knowledge_status: semanticSummary && semanticSummary.status || null,
    semantic_knowledge_node_count: semanticSummary && Number.isFinite(semanticSummary.markdown_node_count) ? semanticSummary.markdown_node_count : null,
    semantic_knowledge_profiled_node_count: semanticSummary && Number.isFinite(semanticSummary.profiled_node_count) ? semanticSummary.profiled_node_count : null,
    semantic_knowledge_epistemic_profiled_node_count: semanticSummary && Number.isFinite(semanticSummary.epistemic_profiled_node_count) ? semanticSummary.epistemic_profiled_node_count : null,
    semantic_knowledge_epistemic_profile_complete: semanticSummary ? semanticSummary.epistemic_profile_complete === true : null,
    semantic_knowledge_concept_count: semanticSummary && Number.isFinite(semanticSummary.concept_count) ? semanticSummary.concept_count : null,
    semantic_knowledge_concept_relation_count: semanticSummary && Number.isFinite(semanticSummary.concept_relation_count) ? semanticSummary.concept_relation_count : null,
    self_release_status: selfRelease && selfRelease.status || null,
    self_release_readback_status: selfRelease && selfRelease.readback_status || null,
    self_release_unified_identity: selfRelease && selfRelease.current_release && selfRelease.current_release.unified_identity || null,
    self_release_identity_version: selfRelease && selfRelease.current_release && selfRelease.current_release.identity_version || null,
    self_release_semver: selfRelease && selfRelease.current_release && selfRelease.current_release.release_semver || null,
    self_release_version: selfRelease && selfRelease.current_release && selfRelease.current_release.release_version || null,
    self_release_name: selfRelease && selfRelease.current_release && selfRelease.current_release.release_name || null,
    self_release_proposal_count: selfRelease && Number.isFinite(selfRelease.proposal_count) ? selfRelease.proposal_count : null,
    agi_loop_status: agiLoop && agiLoop.status || null,
    agi_episode_count: agiLoop && agiLoop.metrics && Number.isFinite(agiLoop.metrics.episode_count) ? agiLoop.metrics.episode_count : null,
    agi_success_rate: agiEval && agiEval.metrics && Number.isFinite(agiEval.metrics.success_rate) ? agiEval.metrics.success_rate : null,
    agi_promoted_skill_count: skillRegistry && Number.isFinite(skillRegistry.promoted_skill_count) ? skillRegistry.promoted_skill_count : null,
    agi_runtime_eligible_promoted_skill_count: skillRegistry && Number.isFinite(skillRegistry.runtime_eligible_promoted_skill_count) ? skillRegistry.runtime_eligible_promoted_skill_count : null,
    agi_candidate_skill_count: skillRegistry && Number.isFinite(skillRegistry.candidate_skill_count) ? skillRegistry.candidate_skill_count : null,
    apfc_status: apfcStatus && apfcStatus.status || null,
    apfc_graph_id: apfcGraph && apfcGraph.graph_id || null,
    apfc_graph_hash: apfcGraph ? sha256Text(JSON.stringify(apfcGraph)) : null,
    apfc_node_count: apfcGraph && apfcGraph.metrics && apfcGraph.metrics.node_count || 0,
    apfc_edge_count: apfcGraph && apfcGraph.metrics && apfcGraph.metrics.edge_count || 0,
    software_repair_benchmark_status: softwareRepairBenchmark && softwareRepairBenchmark.status || null,
    software_repair_benchmark_source_hash: softwareRepairBenchmark && softwareRepairBenchmark.source_hash || null,
    software_repair_benchmark_case_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.case_count) ? softwareRepairBenchmark.case_count : null,
    software_repair_benchmark_run_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.run_count) ? softwareRepairBenchmark.run_count : null,
    software_repair_provider_run_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.provider_run_count) ? softwareRepairBenchmark.provider_run_count : null,
    software_repair_provider_integrity_passed_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.provider_integrity_passed_run_count) ? softwareRepairBenchmark.provider_integrity_passed_run_count : null,
    software_repair_plan_graph_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.provider_plan_graph_count) ? softwareRepairBenchmark.provider_plan_graph_count : null,
    software_repair_provider_backed_run_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.provider_backed_benchmark_run_count) ? softwareRepairBenchmark.provider_backed_benchmark_run_count : null,
    software_repair_benchmark_empirical_run_count: softwareRepairBenchmark && Number.isFinite(softwareRepairBenchmark.empirical_run_count) ? softwareRepairBenchmark.empirical_run_count : null,
    runtime_compiler_status: runtimeCompiler && runtimeCompiler.status || null,
    runtime_compiler_claim_count: runtimeCompiler && runtimeCompiler.counts && Number.isFinite(runtimeCompiler.counts.claims) ? runtimeCompiler.counts.claims : null,
    runtime_compiler_capability_count: runtimeCompiler && runtimeCompiler.counts && Number.isFinite(runtimeCompiler.counts.capabilities) ? runtimeCompiler.counts.capabilities : null,
    runtime_compiler_context_pack_count: runtimeCompiler && runtimeCompiler.counts && Number.isFinite(runtimeCompiler.counts.context_packs) ? runtimeCompiler.counts.context_packs : null,
    module_registry_source_hash: moduleRegistry && moduleRegistry.source_hash || null,
    module_registry_module_count: moduleRegistry && Number.isFinite(moduleRegistry.module_count) ? moduleRegistry.module_count : null,
    module_registry_capability_count: moduleCapabilities && Number.isFinite(moduleCapabilities.capability_count) ? moduleCapabilities.capability_count : null,
    runtime_health_status: healthClassification && healthClassification.health && healthClassification.health.runtime_health && healthClassification.health.runtime_health.status || null,
    compiler_health_status: healthClassification && healthClassification.health && healthClassification.health.compiler_health && healthClassification.health.compiler_health.status || null,
    agi_loop_health_status: healthClassification && healthClassification.health && healthClassification.health.agi_loop_health && healthClassification.health.agi_loop_health.status || null,
    publication_health_status: healthClassification && healthClassification.health && healthClassification.health.publication_health && healthClassification.health.publication_health.status || null,
    security_health_status: healthClassification && healthClassification.health && healthClassification.health.security_health && healthClassification.health.security_health.status || null,
    local_hygiene_health_status: healthClassification && healthClassification.health && healthClassification.health.local_hygiene_health && healthClassification.health.local_hygiene_health.status || null,
    release_publishable: healthClassification && healthClassification.release_gate && healthClassification.release_gate.publishable,
    runtime_operable: healthClassification && healthClassification.release_gate && healthClassification.release_gate.runtime_operable,
    global_index_source_hash: globalIndex && globalIndex.source_hash || null,
    global_index_project_count: globalIndex && globalIndex.ops && globalIndex.ops.project_count,
  };
}

function stableReplayFingerprint(fingerprint) {
  const comparable = JSON.parse(JSON.stringify(fingerprint));
  delete comparable.markdown_graph_source_hash;
  delete comparable.global_index_source_hash;
  return comparable;
}

function comparableFingerprint(fingerprint) {
  return JSON.stringify(stableReplayFingerprint(fingerprint));
}

function replayRuntime() {
  runNodeScript('initialize_ops_memory.js');
  const projectIds = discoverProjectIds();
  const before = replayFingerprint(projectIds);
  const beforeComparable = comparableFingerprint(before);

  const removed = withFileLock('replay_runtime', {
    context: 'replay_runtime:remove_compiled_state',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => removeCompiledState(projectIds));

  const builderResults = [];
  builderResults.push(runNodeScript('compile_programs.js'));
  for (const projectId of projectIds) {
    builderResults.push(runNodeScript('build_project_state.js', [projectId]));
  }
  builderResults.push(runNodeScript('build_global_agenda.js'));
  builderResults.push(runNodeScript('archive_runtime_state.js'));
  builderResults.push(runNodeScript('build_agentic_core.js'));
  builderResults.push(runNodeScript('build_workspace_inventory.js'));
  builderResults.push(runNodeScript('build_markdown_graph.js'));
  builderResults.push(runNodeScript('build_runtime_lifecycle_index.js'));
  builderResults.push(runNodeScript('build_semantic_knowledge_graph.js'));
  builderResults.push(runNodeScript('build_self_release_index.js'));
  builderResults.push(runNodeScript('agi_loop.js', ['eval']));
  builderResults.push(runNodeScript('build_software_repair_benchmark_index.js'));
  builderResults.push(runNodeScript('build_module_registry.js'));
  builderResults.push(runNodeScript('build_runtime_compiler.js'));
  builderResults.push(runNodeScript('apfc_runtime.js', ['reconcile']));
  builderResults.push(runNodeScript('build_apfc_graph.js'));
  builderResults.push(runNodeScript('apfc_runtime.js', ['graphify', 'build']));
  builderResults.push(runNodeScript('build_global_index.js'));
  builderResults.push(runNodeScript('build_system_hygiene_status.js'));
  builderResults.push(runNodeScript('build_health_classifier.js'));
  builderResults.push(runNodeScript('build_conceptual_boot_summary.js'));

  const after = replayFingerprint(projectIds);
  const afterComparable = comparableFingerprint(after);
  const matchedBefore = beforeComparable === afterComparable;
  const replayHash = sha256Text(afterComparable);
  const inputManifest = sourceManifest(projectIds);
  const rebuiltOutputManifest = outputManifest(projectIds);
  const accounting = {
    source_manifest_hash: sha256Text(JSON.stringify(inputManifest)),
    output_manifest_hash: sha256Text(JSON.stringify(rebuiltOutputManifest)),
    source_manifest: inputManifest,
    output_manifest: rebuiltOutputManifest,
    builder_manifest_hash: sha256Text(JSON.stringify(builderResults.map((item) => ({
      script: item.script,
      args: item.args,
    })))),
  };

  appendJournal({
    event: 'runtime_replayed',
    project_ids: projectIds,
    removed_compiled_files: removed,
    matched_before: matchedBefore,
    replay_hash: replayHash,
    source_manifest_hash: accounting.source_manifest_hash,
    output_manifest_hash: accounting.output_manifest_hash,
  });

  const report = {
    ok: true,
    mode: 'replay_runtime',
    replayed_at: nowIso(),
    project_ids: projectIds,
    removed_compiled_file_count: removed.length,
    removed_compiled_files: removed,
    matched_before: matchedBefore,
    replay_hash: replayHash,
    fingerprint: stableReplayFingerprint(after),
    accounting,
    builders: builderResults,
  };
  withFileLock('builder__replay_report', {
    context: 'replay_runtime:write_report',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(REPLAY_REPORT_JSON, report);
    atomicWriteText(REPLAY_REPORT_MD, buildReplayMarkdown(report));
  });
  runNodeScript('build_health_dashboard.js');
  return report;
}

function buildReplayMarkdown(report) {
  const lines = [
    '# Replay Report',
    '',
    `Replayed at: \`${report.replayed_at}\``,
    '',
    `Matched before: \`${report.matched_before}\``,
    '',
    `Replay hash: \`${report.replay_hash}\``,
    '',
    '## Accounting',
    '',
    `- Source manifest hash: \`${report.accounting.source_manifest_hash}\``,
    `- Output manifest hash: \`${report.accounting.output_manifest_hash}\``,
    `- Builder manifest hash: \`${report.accounting.builder_manifest_hash}\``,
    '',
    '## Builders',
    '',
    ...report.builders.map((item) => `- \`${item.script}\` ${item.args && item.args.length ? `\`${item.args.join(' ')}\`` : ''}`),
    '',
    '## Removed Compiled Files',
    '',
  ];
  if (!report.removed_compiled_files.length) {
    lines.push('- No compiled files removed.');
  } else {
    for (const file of report.removed_compiled_files) lines.push(`- \`${file}\``);
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  printJson(replayRuntime());
}

if (require.main === module) {
  main();
}

module.exports = {
  GLOBAL_COMPILED_FILES,
  PROJECT_COMPILED_FILES,
  discoverProjectIds,
  removeCompiledState,
  replayFingerprint,
  replayRuntime,
  stableReplayFingerprint,
};
