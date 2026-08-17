#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { ACTIVE_BOUNDARY_DIR, MDOS_ROOT, WORKSPACE_ROOT, assertSafeId, nowIso, printJson, sha256Json, shortText } = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { validateConnectorRegistry, validateProject } = require('./lib/validation');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const OUTPUT_JSON = path.join(OPS_DIR, 'global_index.json');
const OUTPUT_MD = path.join(OPS_DIR, 'global_index.md');
const CONNECTOR_REGISTRY_FILE = path.join(OPS_DIR, 'connectors', 'connector_registry.json');
const COMPILED_PROGRAMS_FILE = path.join(OPS_DIR, 'compiled', 'programs.json');
const ACTIVE_SUMMARY_FILE = path.join(OPS_DIR, 'summary', 'active_work_items.json');
const CONCEPTUAL_BOOT_SUMMARY_FILE = path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.json');
const AGENTIC_CORE_FILE = path.join(OPS_DIR, 'core', 'agentic_core.json');
const MARKDOWN_GRAPH_FILE = path.join(OPS_DIR, 'markdown_graph.json');
const SEMANTIC_KNOWLEDGE_SUMMARY_FILE = path.join(OPS_DIR, 'semantic_knowledge_summary.json');
const SEMANTIC_COMMITMENT_GATE_FILE = path.join(OPS_DIR, 'semantic', 'commitment_gate_status.json');
const SELF_RELEASE_INDEX_FILE = path.join(OPS_DIR, 'releases', 'self_release_index.json');
const AGI_LOOP_STATUS_FILE = path.join(OPS_DIR, 'agi', 'loop_status.json');
const AGI_EVAL_REPORT_FILE = path.join(OPS_DIR, 'evals', 'agi_eval_report.json');
const SKILL_REGISTRY_FILE = path.join(OPS_DIR, 'skills', 'skill_registry.json');
const APFC_STATUS_FILE = path.join(OPS_DIR, 'apfc', 'executive', 'status.json');
const WORLD_MODEL_FILE = path.join(OPS_DIR, 'world', 'world_model.json');
const FAILURE_INDEX_FILE = path.join(OPS_DIR, 'failures', 'failure_index.json');
const SOFTWARE_REPAIR_BENCHMARK_INDEX_FILE = path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.json');
const RUNTIME_COMPILER_FILE = path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.json');
const OPERATING_CYCLE_REPORT_FILE = path.join(OPS_DIR, 'runtime', 'operating_cycle_report.json');
const RUNTIME_LIFECYCLE_FILE = path.join(OPS_DIR, 'runtime_lifecycle_index.json');
const HEALTH_FILE = path.join(OPS_DIR, 'health.json');
const REPLAY_REPORT_FILE = path.join(OPS_DIR, 'replay_report.json');
const SERVICES_DIR = path.join(OPS_DIR, 'services');
const HARDWARE_REGISTRY_FILE = path.join(OPS_DIR, 'local', 'hardware', 'device_registry.json');
const SOFTWARE_REGISTRY_FILE = path.join(OPS_DIR, 'local', 'software', 'software_registry.json');

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

function listDirSafe(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true });
}

function collectProjects() {
  const root = path.join(OPS_DIR, 'projects');
  return listDirSafe(root)
    .filter((entry) => entry.isDirectory())
    .map((entry) => assertSafeId(entry.name, 'project_id'))
    .sort()
    .map((projectId) => {
      const projectDir = path.join(root, projectId);
      const projectPayload = readJsonSafe(path.join(projectDir, 'project.json'));
      const project = projectPayload ? validateProject(projectPayload) : null;
      const status = readJsonSafe(path.join(projectDir, 'status.json'));
      const agenda = readJsonSafe(path.join(projectDir, 'agenda.json'));
      return {
        project_id: projectId,
        title: shortText(project && project.title),
        owner: shortText(project && project.owner),
        status: shortText(status && status.status),
        open_count: Number.isFinite(status && status.summary && status.summary.open_count) ? status.summary.open_count : null,
        agenda_item_count: Array.isArray(agenda && agenda.items) ? agenda.items.length : 0,
      };
    });
}

function collectSourceChannels() {
  const root = path.join(OPS_DIR, 'sources');
  return listDirSafe(root)
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((channel) => {
      const files = listDirSafe(path.join(root, channel))
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => rel(path.join(root, channel, entry.name)))
        .sort();
      return {
        channel,
        file_count: files.length,
        files,
      };
    });
}

function collectConnectors() {
  const registryPayload = readJsonSafe(CONNECTOR_REGISTRY_FILE);
  const registry = registryPayload ? validateConnectorRegistry(registryPayload) : null;
  const connectors = Array.isArray(registry && registry.connectors) ? registry.connectors : [];
  return {
    registry_file: fs.existsSync(CONNECTOR_REGISTRY_FILE) ? rel(CONNECTOR_REGISTRY_FILE) : null,
    connector_count: connectors.length,
    implemented_count: connectors.filter((item) => item.implemented === true).length,
    ready_count: connectors.filter((item) => shortText(item.status).toLowerCase() === 'ready').length,
    connectors: connectors.map((item) => ({
      connector_id: shortText(item.connector_id),
      kind: shortText(item.kind),
      status: shortText(item.status),
      implemented: item.implemented === true,
      execution_mode: shortText(item.execution_mode),
      permission_profile: shortText(item.permission_profile || ''),
      risk_level: shortText(item.risk_level || ''),
      requires_approval: item.requires_approval === true,
    })),
  };
}

function collectPrograms() {
  const payload = readJsonSafe(COMPILED_PROGRAMS_FILE);
  const programs = Array.isArray(payload && payload.programs) ? payload.programs : [];
  return {
    compiled_file: fs.existsSync(COMPILED_PROGRAMS_FILE) ? rel(COMPILED_PROGRAMS_FILE) : null,
    source_hash: payload && payload.source_hash || null,
    program_count: programs.length,
    programs: programs.map((program) => ({
      program_id: shortText(program.program_id),
      source_file: shortText(program.source_file),
      action_count: Array.isArray(program.actions) ? program.actions.length : 0,
      output_count: Array.isArray(program.outputs) ? program.outputs.length : 0,
    })),
  };
}

function collectActiveSummary() {
  const payload = readJsonSafe(ACTIVE_SUMMARY_FILE);
  const activeItems = Array.isArray(payload && payload.active_items) ? payload.active_items : [];
  return {
    summary_file: fs.existsSync(ACTIVE_SUMMARY_FILE) ? rel(ACTIVE_SUMMARY_FILE) : null,
    source_hash: payload && payload.source_hash || null,
    active_count: Number.isFinite(payload && payload.active_count) ? payload.active_count : activeItems.length,
    terminal_count: Number.isFinite(payload && payload.terminal_count) ? payload.terminal_count : null,
    project_count: Number.isFinite(payload && payload.project_count) ? payload.project_count : null,
  };
}

function collectConceptualBootSummary() {
  const payload = readJsonSafe(CONCEPTUAL_BOOT_SUMMARY_FILE);
  return {
    summary_file: fs.existsSync(CONCEPTUAL_BOOT_SUMMARY_FILE) ? rel(CONCEPTUAL_BOOT_SUMMARY_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.md')) ? rel(path.join(OPS_DIR, 'summary', 'conceptual_boot_summary.md')) : null,
    status: shortText(payload && payload.status || ''),
    source_hash: payload && payload.source_hash || null,
    missing_input_count: Array.isArray(payload && payload.missing_inputs) ? payload.missing_inputs.length : null,
    top_concept_count: Array.isArray(payload && payload.semantic && payload.semantic.top_concepts) ? payload.semantic.top_concepts.length : null,
    active_count: Number.isFinite(payload && payload.operating && payload.operating.active_count) ? payload.operating.active_count : null,
  };
}

function collectAgenticCore() {
  const payload = readJsonSafe(AGENTIC_CORE_FILE);
  const core = payload && payload.core || null;
  return {
    core_file: fs.existsSync(AGENTIC_CORE_FILE) ? rel(AGENTIC_CORE_FILE) : null,
    source_hash: payload && payload.source_hash || null,
    core_id: shortText(core && core.core_id || ''),
    identity_name: shortText(core && core.identity && core.identity.name || ''),
    objective_count: Array.isArray(core && core.objectives) ? core.objectives.length : 0,
    ethic_count: Array.isArray(core && core.ethics) ? core.ethics.length : 0,
    non_claim_count: Array.isArray(core && core.non_claims) ? core.non_claims.length : 0,
  };
}

function collectRuntimeLifecycle() {
  const payload = readJsonSafe(RUNTIME_LIFECYCLE_FILE);
  return {
    lifecycle_file: fs.existsSync(RUNTIME_LIFECYCLE_FILE) ? rel(RUNTIME_LIFECYCLE_FILE) : null,
    status: shortText(payload && payload.status || ''),
    file_count: Number.isFinite(payload && payload.file_count) ? payload.file_count : null,
    finding_count: Number.isFinite(payload && payload.finding_count) ? payload.finding_count : null,
    source_hash: payload && payload.source_hash || null,
  };
}

function collectMarkdownGraph() {
  const payload = readJsonSafe(MARKDOWN_GRAPH_FILE);
  return {
    graph_file: fs.existsSync(MARKDOWN_GRAPH_FILE) ? rel(MARKDOWN_GRAPH_FILE) : null,
    status: shortText(payload && payload.status || ''),
    markdown_file_count: Number.isFinite(payload && payload.markdown_file_count) ? payload.markdown_file_count : null,
    explicit_link_count: Number.isFinite(payload && payload.explicit_link_count) ? payload.explicit_link_count : null,
    structural_link_count: Number.isFinite(payload && payload.structural_link_count) ? payload.structural_link_count : null,
    explicit_orphan_count: Number.isFinite(payload && payload.explicit_orphan_count) ? payload.explicit_orphan_count : null,
    structural_isolated_count: Number.isFinite(payload && payload.structural_isolated_count) ? payload.structural_isolated_count : null,
    source_hash: payload && payload.source_hash || null,
  };
}

function collectSemanticKnowledge() {
  const payload = readJsonSafe(SEMANTIC_KNOWLEDGE_SUMMARY_FILE);
  return {
    summary_file: fs.existsSync(SEMANTIC_KNOWLEDGE_SUMMARY_FILE) ? rel(SEMANTIC_KNOWLEDGE_SUMMARY_FILE) : null,
    graph_file: fs.existsSync(path.join(OPS_DIR, 'semantic_knowledge_graph.json')) ? rel(path.join(OPS_DIR, 'semantic_knowledge_graph.json')) : null,
    status: shortText(payload && payload.status || ''),
    markdown_node_count: Number.isFinite(payload && payload.markdown_node_count) ? payload.markdown_node_count : null,
    profiled_node_count: Number.isFinite(payload && payload.profiled_node_count) ? payload.profiled_node_count : null,
    epistemic_profiled_node_count: Number.isFinite(payload && payload.epistemic_profiled_node_count) ? payload.epistemic_profiled_node_count : null,
    semantic_profile_complete: payload ? payload.semantic_profile_complete === true : null,
    epistemic_profile_complete: payload ? payload.epistemic_profile_complete === true : null,
    semantic_edge_count: Number.isFinite(payload && payload.semantic_edge_count) ? payload.semantic_edge_count : null,
    concept_count: Number.isFinite(payload && payload.concept_count) ? payload.concept_count : null,
    concept_relation_count: Number.isFinite(payload && payload.concept_relation_count) ? payload.concept_relation_count : null,
    source_hash: payload && payload.source_hash || null,
  };
}

function collectSelfRelease() {
  const payload = readJsonSafe(SELF_RELEASE_INDEX_FILE);
  const current = payload && payload.current_release || {};
  return {
    index_file: fs.existsSync(SELF_RELEASE_INDEX_FILE) ? rel(SELF_RELEASE_INDEX_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'releases', 'self_release_index.md')) ? rel(path.join(OPS_DIR, 'releases', 'self_release_index.md')) : null,
    status: shortText(payload && payload.status || ''),
    readback_status: shortText(payload && payload.readback_status || ''),
    source_hash: payload && payload.source_hash || null,
    system_family: shortText(current.system_family || ''),
    unified_identity: shortText(current.unified_identity || ''),
    identity_name: shortText(current.identity_name || ''),
    identity_version: shortText(current.identity_version || ''),
    repository_release_line: shortText(current.repository_release_line || ''),
    release_label: shortText(current.release_label || ''),
    release_semver: shortText(current.release_semver || ''),
    release_version: shortText(current.release_version || ''),
    release_name: shortText(current.release_name || ''),
    identity_short_name: shortText(current.identity_short_name || ''),
    identity_id: shortText(current.identity_id || ''),
    agentic_operational_id: shortText(current.agentic_operational_id || ''),
    active_boundary: shortText(current.active_boundary || ''),
    host_runtime_role: shortText(current.host_runtime_role || ''),
    proposal_count: Number.isFinite(payload && payload.proposal_count) ? payload.proposal_count : null,
    valid_proposal_count: Number.isFinite(payload && payload.valid_proposal_count) ? payload.valid_proposal_count : null,
    finding_count: Array.isArray(payload && payload.findings) ? payload.findings.length : null,
  };
}

function collectRuntimeCompiler() {
  const payload = readJsonSafe(RUNTIME_COMPILER_FILE);
  const counts = payload && payload.counts || {};
  return {
    compiler_file: fs.existsSync(RUNTIME_COMPILER_FILE) ? rel(RUNTIME_COMPILER_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.md')) ? rel(path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.md')) : null,
    status: shortText(payload && payload.status || ''),
    source_hash: payload && payload.source_hash || null,
    semantic_nodes: Number.isFinite(counts.semantic_nodes) ? counts.semantic_nodes : null,
    claims: Number.isFinite(counts.claims) ? counts.claims : null,
    capabilities: Number.isFinite(counts.capabilities) ? counts.capabilities : null,
    links: Number.isFinite(counts.links) ? counts.links : null,
    context_packs: Number.isFinite(counts.context_packs) ? counts.context_packs : null,
    epistemic_findings: Number.isFinite(counts.epistemic_findings) ? counts.epistemic_findings : null,
  };
}

function collectSemanticCommitmentGate() {
  const payload = readJsonSafe(SEMANTIC_COMMITMENT_GATE_FILE);
  return {
    status_file: fs.existsSync(SEMANTIC_COMMITMENT_GATE_FILE) ? rel(SEMANTIC_COMMITMENT_GATE_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'semantic', 'commitment_gate_status.md'))
      ? rel(path.join(OPS_DIR, 'semantic', 'commitment_gate_status.md'))
      : null,
    status: shortText(payload && payload.status || ''),
    source_hash: payload && payload.source_hash || null,
    invariant_count: Number.isFinite(payload && payload.invariant_count) ? payload.invariant_count : null,
    finding_count: Number.isFinite(payload && payload.finding_count) ? payload.finding_count : null,
    canonical_promotion_blocked: payload && payload.release_gate
      ? payload.release_gate.canonical_promotion_blocked === true
      : null,
    challenge_registration_blocked: payload && payload.release_gate
      ? payload.release_gate.challenge_registration_blocked === true
      : null,
  };
}

function collectOperatingCycle() {
  const payload = readJsonSafe(OPERATING_CYCLE_REPORT_FILE);
  return {
    report_file: fs.existsSync(OPERATING_CYCLE_REPORT_FILE) ? rel(OPERATING_CYCLE_REPORT_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'runtime', 'operating_cycle_report.md')) ? rel(path.join(OPS_DIR, 'runtime', 'operating_cycle_report.md')) : null,
    ok: payload ? payload.ok === true : null,
    completed_at: shortText(payload && payload.completed_at || ''),
    phase_count: Number.isFinite(payload && payload.phase_count) ? payload.phase_count : null,
    failed_phase_count: Number.isFinite(payload && payload.failed_phase_count) ? payload.failed_phase_count : null,
  };
}

function collectAgiLoop() {
  const loop = readJsonSafe(AGI_LOOP_STATUS_FILE);
  const evalReport = readJsonSafe(AGI_EVAL_REPORT_FILE);
  const skillRegistry = readJsonSafe(SKILL_REGISTRY_FILE);
  const worldModel = readJsonSafe(WORLD_MODEL_FILE);
  const failureIndex = readJsonSafe(FAILURE_INDEX_FILE);
  const metrics = evalReport && evalReport.metrics || loop && loop.metrics || {};
  return {
    status_file: fs.existsSync(AGI_LOOP_STATUS_FILE) ? rel(AGI_LOOP_STATUS_FILE) : null,
    eval_report_file: fs.existsSync(AGI_EVAL_REPORT_FILE) ? rel(AGI_EVAL_REPORT_FILE) : null,
    skill_registry_file: fs.existsSync(SKILL_REGISTRY_FILE) ? rel(SKILL_REGISTRY_FILE) : null,
    world_model_file: fs.existsSync(WORLD_MODEL_FILE) ? rel(WORLD_MODEL_FILE) : null,
    failure_index_file: fs.existsSync(FAILURE_INDEX_FILE) ? rel(FAILURE_INDEX_FILE) : null,
    status: shortText(loop && loop.status || ''),
    source_hash: loop && loop.source_hash || null,
    eval_status: shortText(evalReport && evalReport.status || ''),
    episode_count: Number.isFinite(metrics.episode_count) ? metrics.episode_count : null,
    success_rate: Number.isFinite(metrics.success_rate) ? metrics.success_rate : null,
    failure_recovery_rate: Number.isFinite(metrics.failure_recovery_rate) ? metrics.failure_recovery_rate : null,
    autonomy_horizon: shortText(metrics.autonomy_horizon || ''),
    promoted_skill_count: Number.isFinite(skillRegistry && skillRegistry.promoted_skill_count) ? skillRegistry.promoted_skill_count : null,
    runtime_eligible_promoted_skill_count: Number.isFinite(skillRegistry && skillRegistry.runtime_eligible_promoted_skill_count) ? skillRegistry.runtime_eligible_promoted_skill_count : null,
    candidate_skill_count: Number.isFinite(skillRegistry && skillRegistry.candidate_skill_count) ? skillRegistry.candidate_skill_count : null,
    skill_reuse: Number.isFinite(metrics.skill_reuse) ? metrics.skill_reuse : null,
    regression_count: Number.isFinite(metrics.regression_count) ? metrics.regression_count : null,
    failure_count: Number.isFinite(failureIndex && failureIndex.failure_count) ? failureIndex.failure_count : null,
    world_entity_count: Number.isFinite(worldModel && worldModel.entity_count) ? worldModel.entity_count : null,
  };
}

function collectApfc() {
  const payload = readJsonSafe(APFC_STATUS_FILE);
  const counts = payload && payload.counts || {};
  return {
    status_file: fs.existsSync(APFC_STATUS_FILE) ? rel(APFC_STATUS_FILE) : null,
    graph_file: fs.existsSync(path.join(OPS_DIR, 'apfc', 'executive', 'graph.json')) ? rel(path.join(OPS_DIR, 'apfc', 'executive', 'graph.json')) : null,
    status: shortText(payload && payload.status || ''),
    graph_id: shortText(payload && payload.active_graph_id || ''),
    graph_hash: payload && payload.active_graph_hash || null,
    source_count: Number.isFinite(counts.sources) ? counts.sources : null,
    node_count: Number.isFinite(counts.nodes) ? counts.nodes : null,
    edge_count: Number.isFinite(counts.edges) ? counts.edges : null,
    episode_count: Number.isFinite(counts.episodes) ? counts.episodes : null,
    promotable_skill_count: Number.isFinite(counts.skills_promotable) ? counts.skills_promotable : null,
    promoted_skill_count: Number.isFinite(counts.skills_promoted) ? counts.skills_promoted : null,
    runtime_eligible_skill_count: Number.isFinite(counts.skills_runtime_eligible) ? counts.skills_runtime_eligible : null,
    consolidation_cycle_count: Number.isFinite(counts.consolidation_cycles) ? counts.consolidation_cycles : null,
    online_event_count: Number.isFinite(counts.online_events) ? counts.online_events : null,
  };
}

function collectSoftwareRepairBenchmark() {
  const payload = readJsonSafe(SOFTWARE_REPAIR_BENCHMARK_INDEX_FILE);
  return {
    index_file: fs.existsSync(SOFTWARE_REPAIR_BENCHMARK_INDEX_FILE) ? rel(SOFTWARE_REPAIR_BENCHMARK_INDEX_FILE) : null,
    markdown_file: fs.existsSync(path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.md'))
      ? rel(path.join(OPS_DIR, 'benchmarks', 'software_repair', 'index.md'))
      : null,
    status: shortText(payload && payload.status || ''),
    source_hash: payload && payload.source_hash || null,
    case_count: Number.isFinite(payload && payload.case_count) ? payload.case_count : null,
    run_count: Number.isFinite(payload && payload.run_count) ? payload.run_count : null,
    provider_run_count: Number.isFinite(payload && payload.provider_run_count) ? payload.provider_run_count : null,
    provider_integrity_passed_run_count: Number.isFinite(payload && payload.provider_integrity_passed_run_count) ? payload.provider_integrity_passed_run_count : null,
    provider_plan_graph_count: Number.isFinite(payload && payload.provider_plan_graph_count) ? payload.provider_plan_graph_count : null,
    provider_backed_benchmark_run_count: Number.isFinite(payload && payload.provider_backed_benchmark_run_count) ? payload.provider_backed_benchmark_run_count : null,
    plan_graph_verified_benchmark_run_count: Number.isFinite(payload && payload.plan_graph_verified_benchmark_run_count) ? payload.plan_graph_verified_benchmark_run_count : null,
    provider_empirical_eligible_run_count: Number.isFinite(payload && payload.provider_empirical_eligible_run_count) ? payload.provider_empirical_eligible_run_count : null,
    runner_validation_run_count: Number.isFinite(payload && payload.runner_validation_run_count) ? payload.runner_validation_run_count : null,
    empirical_run_count: Number.isFinite(payload && payload.empirical_run_count) ? payload.empirical_run_count : null,
    primary_metric: shortText(payload && payload.primary_metric || ''),
    configurations: Array.isArray(payload && payload.configurations) ? payload.configurations : [],
    learning_delta: payload && payload.learning_delta || null,
  };
}

function buildIdentityFrame(selfRelease, agenticCore) {
  const identityName = selfRelease.unified_identity
    || selfRelease.identity_name
    || agenticCore.identity_name
    || 'MD-OS APFC';
  const identityVersion = selfRelease.identity_version || '';
  return {
    agent_label: identityVersion ? `${identityName} ${identityVersion}` : identityName,
    identity_name: identityName,
    identity_version: identityVersion,
    system_family: selfRelease.system_family || 'MD-OS',
    repository_release_line: selfRelease.repository_release_line || selfRelease.release_label || '5.0',
    package_semver: selfRelease.release_semver || '',
    release_version: selfRelease.release_version || '',
    host_runtime_role: selfRelease.host_runtime_role || 'execution_layer',
  };
}

function collectHealth() {
  const payload = readJsonSafe(HEALTH_FILE);
  return {
    health_file: fs.existsSync(HEALTH_FILE) ? rel(HEALTH_FILE) : null,
    status: shortText(payload && payload.status || ''),
    source_hash: payload && payload.source_hash || null,
    missing_required_files: Array.isArray(payload && payload.missing_required_files) ? payload.missing_required_files.length : null,
  };
}

function collectReplayReport() {
  const payload = readJsonSafe(REPLAY_REPORT_FILE);
  return {
    replay_report_file: fs.existsSync(REPLAY_REPORT_FILE) ? rel(REPLAY_REPORT_FILE) : null,
    replayed_at: shortText(payload && payload.replayed_at || ''),
    matched_before: payload ? payload.matched_before === true : null,
    replay_hash: payload && payload.replay_hash || null,
    source_manifest_hash: payload && payload.accounting && payload.accounting.source_manifest_hash || null,
    output_manifest_hash: payload && payload.accounting && payload.accounting.output_manifest_hash || null,
  };
}

function collectServices() {
  const statusFiles = listDirSafe(SERVICES_DIR)
    .filter((entry) => entry.isFile() && entry.name.endsWith('.status.json'))
    .map((entry) => path.join(SERVICES_DIR, entry.name))
    .sort();
  const services = statusFiles.map((filePath) => {
    const payload = readJsonSafe(filePath) || {};
    return {
      service_id: shortText(payload.service_id || path.basename(filePath, '.status.json')),
      status: shortText(payload.status || 'unknown'),
      desired_state: shortText(payload.desired_state || ''),
      pid: Number.isFinite(payload.pid) ? payload.pid : null,
      heartbeat_at: shortText(payload.heartbeat_at || ''),
      updated_at: shortText(payload.updated_at || ''),
      status_file: rel(filePath),
    };
  });
  return {
    service_count: services.length,
    running_count: services.filter((item) => item.status === 'running').length,
    status_files: statusFiles.map((filePath) => rel(filePath)),
    services,
  };
}

function collectHardware() {
  const registry = readJsonSafe(HARDWARE_REGISTRY_FILE);
  const devices = Array.isArray(registry && registry.devices) ? registry.devices : [];
  const capabilities = Array.isArray(registry && registry.capabilities) ? registry.capabilities : [];
  const byCategory = new Map();
  for (const device of devices) {
    const category = shortText(device.category || 'other');
    byCategory.set(category, (byCategory.get(category) || 0) + 1);
  }
  return {
    registry_file: fs.existsSync(HARDWARE_REGISTRY_FILE) ? rel(HARDWARE_REGISTRY_FILE) : null,
    cache_dir: rel(path.dirname(HARDWARE_REGISTRY_FILE)),
    locality: shortText(registry && registry.locality && registry.locality.scope || 'host_local'),
    clean_command: 'cortex hardware clean',
    updated_at: shortText(registry && registry.updated_at || ''),
    mode: shortText(registry && registry.mode || ''),
    device_count: devices.length,
    capability_count: capabilities.length,
    categories: Object.fromEntries(Array.from(byCategory.entries()).sort(([left], [right]) => left.localeCompare(right))),
    available_capabilities: capabilities
      .filter((item) => shortText(item.status) === 'available')
      .map((item) => shortText(item.capability_id))
      .filter(Boolean)
      .sort(),
  };
}

function collectSoftware() {
  const registry = readJsonSafe(SOFTWARE_REGISTRY_FILE);
  const applications = Array.isArray(registry && registry.applications) ? registry.applications : [];
  const services = Array.isArray(registry && registry.services) ? registry.services : [];
  const capabilities = Array.isArray(registry && registry.capabilities) ? registry.capabilities : [];
  const applicationsByKind = new Map();
  const servicesByManager = new Map();
  for (const app of applications) {
    const kind = shortText(app.kind || 'other');
    applicationsByKind.set(kind, (applicationsByKind.get(kind) || 0) + 1);
  }
  for (const service of services) {
    const manager = shortText(service.manager || 'other');
    servicesByManager.set(manager, (servicesByManager.get(manager) || 0) + 1);
  }
  return {
    registry_file: fs.existsSync(SOFTWARE_REGISTRY_FILE) ? rel(SOFTWARE_REGISTRY_FILE) : null,
    cache_dir: rel(path.dirname(SOFTWARE_REGISTRY_FILE)),
    locality: shortText(registry && registry.locality && registry.locality.scope || 'host_local'),
    clean_command: 'cortex software clean',
    updated_at: shortText(registry && registry.updated_at || ''),
    mode: shortText(registry && registry.mode || ''),
    application_count: applications.length,
    service_count: services.length,
    capability_count: capabilities.length,
    application_kinds: Object.fromEntries(Array.from(applicationsByKind.entries()).sort(([left], [right]) => left.localeCompare(right))),
    service_managers: Object.fromEntries(Array.from(servicesByManager.entries()).sort(([left], [right]) => left.localeCompare(right))),
    available_capabilities: capabilities
      .filter((item) => shortText(item.status) === 'available')
      .map((item) => shortText(item.capability_id))
      .filter(Boolean)
      .sort(),
  };
}

function buildIndex() {
  const projects = collectProjects();
  const sourceChannels = collectSourceChannels();
  const connectorRegistry = collectConnectors();
  const programs = collectPrograms();
  const activeSummary = collectActiveSummary();
  const conceptualBootSummary = collectConceptualBootSummary();
  const agenticCore = collectAgenticCore();
  const markdownGraph = collectMarkdownGraph();
  const semanticKnowledge = collectSemanticKnowledge();
  const selfRelease = collectSelfRelease();
  const agiLoop = collectAgiLoop();
  const apfc = collectApfc();
  const softwareRepairBenchmark = collectSoftwareRepairBenchmark();
  const runtimeCompiler = collectRuntimeCompiler();
  const semanticCommitment = collectSemanticCommitmentGate();
  const operatingCycle = collectOperatingCycle();
  const runtimeLifecycle = collectRuntimeLifecycle();
  const health = collectHealth();
  const replayReport = collectReplayReport();
  const services = collectServices();
  const hardware = collectHardware();
  const software = collectSoftware();
  const identity = buildIdentityFrame(selfRelease, agenticCore);
  const sourceHash = sha256Json({
    projects,
    source_channels: sourceChannels,
    connector_registry: connectorRegistry,
    programs,
    active_summary: activeSummary,
    conceptual_boot_summary: conceptualBootSummary,
    agentic_core: agenticCore,
    markdown_graph: markdownGraph,
    semantic_knowledge: semanticKnowledge,
    self_release: selfRelease,
    agi_loop: agiLoop,
    apfc,
    software_repair_benchmark: softwareRepairBenchmark,
    runtime_compiler: runtimeCompiler,
    semantic_commitment: semanticCommitment,
    operating_cycle: operatingCycle,
    runtime_lifecycle: runtimeLifecycle,
    services,
    hardware,
    software,
  });
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sourceHash,
    agent: identity.agent_label,
    identity,
    boundary: ACTIVE_BOUNDARY_DIR,
    canonical_global_log_file: 'md-os/ops/journal.ndjson',
    bootstrap_read_order: [
      'AGENTS.md',
      'ME.md',
      'md-os/kb/README.md',
      'md-os/kb/OPERATIONS.md',
      'md-os/ops/core/agentic_core.md',
      'md-os/ops/summary/conceptual_boot_summary.md',
      'md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md',
      'md-os/ops/global_index.md',
      'md-os/ops/markdown_graph.md',
      'md-os/ops/semantic_knowledge_summary.md',
      'md-os/ops/semantic/commitment_gate_status.md',
      'md-os/ops/releases/self_release_index.md',
      'md-os/ops/agi/loop_status.md',
      'md-os/ops/apfc/executive/status.md',
      'md-os/ops/benchmarks/software_repair/index.md',
      'md-os/ops/skills/skill_registry.md',
      'md-os/ops/runtime/semantic_operational_compiler.md',
      'md-os/ops/health_classification.md',
      'md-os/ops/health.md',
      'md-os/ops/runtime_lifecycle_index.md',
      'md-os/ops/summary/active_work_items.md',
      'md-os/ops/continuity.md',
      'md-os/ops/state.json',
      'md-os/ops/last_summary.md'
    ],
    builders: {
      initialize_ops_memory: 'node md-os/os/initialize_ops_memory.js',
      initialize_demo_ops: 'node md-os/os/initialize_demo_ops.js',
      compile_programs: 'node md-os/os/compile_programs.js',
      archive_runtime_state: 'node md-os/os/archive_runtime_state.js',
      mdos_cli: 'cortex <command>',
      mcp_server: 'node md-os/os/mcp_server.js',
      replay_runtime: 'cortex replay',
      build_project_state: 'node md-os/os/build_project_state.js <project_id>',
      build_global_agenda: 'node md-os/os/build_global_agenda.js',
      build_agentic_core: 'node md-os/os/build_agentic_core.js',
      build_global_index: 'node md-os/os/build_global_index.js',
      build_workspace_inventory: 'node md-os/os/build_workspace_inventory.js',
      build_markdown_graph: 'node md-os/os/build_markdown_graph.js',
      build_semantic_knowledge_graph: 'node md-os/os/build_semantic_knowledge_graph.js',
      build_semantic_commitment_gate: 'node md-os/os/build_semantic_commitment_gate.js status',
      evaluate_semantic_commitment: 'cortex semantic gate <proposal.json>',
      build_knowledge_import: 'node md-os/os/build_knowledge_import.js <import_id> <source_dir> [--initial-repository]',
      build_self_release_index: 'node md-os/os/build_self_release_index.js',
      agi_loop_eval: 'node md-os/os/agi_loop.js eval',
      agi_loop_run_once: 'cortex agi run-once --task "<task>"',
      apfc_status: 'node md-os/os/apfc_runtime.js status',
      apfc_build: 'node md-os/os/apfc_runtime.js build',
      apfc_verify: 'node md-os/os/apfc_runtime.js verify',
      apfc_consolidate_once: 'node md-os/os/apfc_runtime.js consolidate --run-once',
      apfc_graphify_build: 'node md-os/os/apfc_runtime.js graphify build',
      cognitive_transaction_run_once: 'cortex cognition run-once --task-spec md-os/ops/tasks/<task_spec_id>.json',
      software_repair_candidate_generate: 'cortex benchmark software-repair generate --case <case.json> --provider <provider.json> --configuration <configuration_id>',
      software_repair_benchmark_run: 'cortex benchmark software-repair run --case <case.json> --provider <provider.json> --configuration <configuration_id>',
      build_software_repair_benchmark_index: 'node md-os/os/build_software_repair_benchmark_index.js',
      build_runtime_compiler: 'node md-os/os/build_runtime_compiler.js',
      build_conceptual_boot_summary: 'node md-os/os/build_conceptual_boot_summary.js',
      operating_cycle_run_once: 'node md-os/os/operating_cycle.js run-once',
      build_runtime_lifecycle_index: 'node md-os/os/build_runtime_lifecycle_index.js',
      build_system_hygiene_status: 'node md-os/os/build_system_hygiene_status.js',
      build_health_classifier: 'node md-os/os/build_health_classifier.js',
      build_health_dashboard: 'node md-os/os/build_health_dashboard.js',
      hardware_bootstrap: 'cortex hardware bootstrap',
      hardware_clean: 'cortex hardware clean',
      software_bootstrap: 'cortex software bootstrap',
      software_clean: 'cortex software clean',
      wolfram_bootstrap: 'cortex wolfram bootstrap',
      wolfram_run: 'cortex wolfram run <project_id> <calculation_id>',
      continuity_service: 'cortex live <start|stop|status>'
    },
    ops: {
      project_count: projects.length,
      source_channel_count: sourceChannels.length,
      program_count: programs.program_count,
      active_work_item_count: activeSummary.active_count,
      terminal_work_item_count: activeSummary.terminal_count,
      connector_count: connectorRegistry.connector_count,
      projects,
      source_channels: sourceChannels,
      programs,
      active_summary: activeSummary,
      conceptual_boot_summary: conceptualBootSummary,
      agentic_core: agenticCore,
      markdown_graph: markdownGraph,
      semantic_knowledge: semanticKnowledge,
      self_release: selfRelease,
      agi_loop: agiLoop,
      apfc,
      software_repair_benchmark: softwareRepairBenchmark,
      runtime_compiler: runtimeCompiler,
      semantic_commitment: semanticCommitment,
      operating_cycle: operatingCycle,
      runtime_lifecycle: runtimeLifecycle,
      health,
      replay_report: replayReport,
      service_count: services.service_count,
      services,
      hardware,
      software,
      connectors: connectorRegistry
    },
    canonical_files: {
      connector_registry_json: connectorRegistry.registry_file,
      compiled_programs_json: programs.compiled_file,
      active_work_items_json: activeSummary.summary_file,
      conceptual_boot_summary_json: conceptualBootSummary.summary_file,
      agentic_core_json: agenticCore.core_file,
      markdown_graph_json: markdownGraph.graph_file,
      semantic_knowledge_summary_json: semanticKnowledge.summary_file,
      self_release_index_json: selfRelease.index_file,
      agi_loop_status_json: agiLoop.status_file,
      apfc_status_json: apfc.status_file,
      apfc_graph_json: apfc.graph_file,
      software_repair_benchmark_index_json: softwareRepairBenchmark.index_file,
      agi_eval_report_json: agiLoop.eval_report_file,
      skill_registry_json: agiLoop.skill_registry_file,
      world_model_json: agiLoop.world_model_file,
      runtime_compiler_json: runtimeCompiler.compiler_file,
      semantic_commitment_gate_json: semanticCommitment.status_file,
      operating_cycle_report_json: operatingCycle.report_file,
      runtime_lifecycle_json: runtimeLifecycle.lifecycle_file,
      health_json: health.health_file,
      replay_report_json: replayReport.replay_report_file,
      hardware_device_registry_json: hardware.registry_file,
      software_registry_json: software.registry_file,
      service_status_files: services.status_files
    }
  };
}

function buildMarkdown(index) {
  const lines = [
    '# Global Runtime Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    '',
    `Agent: \`${index.agent}\``,
    '',
    `Identity version: \`${index.identity.identity_version || 'n/a'}\``,
    '',
    `System family: \`${index.identity.system_family}\``,
    '',
    `Repository release line: \`${index.identity.repository_release_line}\``,
    '',
    `Package semver: \`${index.identity.package_semver || 'n/a'}\``,
    '',
    `Host runtime role: \`${index.identity.host_runtime_role}\``,
    '',
    `Boundary: \`${index.boundary}\``,
    '',
    `Canonical journal: \`${index.canonical_global_log_file}\``,
    '',
    '## Bootstrap Read Order',
    '',
    ...index.bootstrap_read_order.map((item) => `- \`${item}\``),
    '',
    '## Builders',
    '',
    ...Object.entries(index.builders).map(([name, cmd]) => `- \`${name}\`: \`${cmd}\``),
    '',
    `## Projects (\`${index.ops.project_count}\`)`,
    '',
  ];

  if (!index.ops.projects.length) {
    lines.push('- No indexed projects.');
  } else {
    for (const project of index.ops.projects) {
      lines.push(`- \`${project.project_id}\`: ${project.title || 'Untitled'} | owner: ${project.owner || 'n/a'} | open: \`${project.open_count ?? 'n/a'}\` | agenda: \`${project.agenda_item_count}\``);
    }
  }

  lines.push('', `## Source Channels (\`${index.ops.source_channel_count}\`)`, '');
  if (!index.ops.source_channels.length) {
    lines.push('- No source channels indexed.');
  } else {
    for (const channel of index.ops.source_channels) {
      lines.push(`- \`${channel.channel}\`: \`${channel.file_count}\` file(s)`);
    }
  }

  lines.push('', `## Natural-Language Programs (\`${index.ops.program_count}\`)`, '');
  if (!index.ops.programs.programs.length) {
    lines.push('- No compiled natural-language programs.');
  } else {
    for (const program of index.ops.programs.programs) {
      lines.push(`- \`${program.program_id}\`: source \`${program.source_file}\` | actions: \`${program.action_count}\` | outputs: \`${program.output_count}\``);
    }
  }

  lines.push('', '## Runtime Summary', '');
  lines.push(`- Active work items: \`${index.ops.active_work_item_count ?? 'n/a'}\``);
  lines.push(`- Terminal archived view: \`${index.ops.terminal_work_item_count ?? 'n/a'}\``);
  if (index.ops.active_summary.summary_file) {
    lines.push(`- Active summary file: \`${index.ops.active_summary.summary_file}\``);
  }
  lines.push(`- Conceptual boot summary: \`${index.ops.conceptual_boot_summary.status || 'n/a'}\` | missing inputs: \`${index.ops.conceptual_boot_summary.missing_input_count ?? 'n/a'}\` | concepts: \`${index.ops.conceptual_boot_summary.top_concept_count ?? 'n/a'}\``);
  if (index.ops.conceptual_boot_summary.markdown_file) {
    lines.push(`- Conceptual boot summary file: \`${index.ops.conceptual_boot_summary.markdown_file}\``);
  }
  lines.push(`- Agentic core: \`${index.ops.agentic_core.core_id || 'n/a'}\` | objectives: \`${index.ops.agentic_core.objective_count}\` | ethics: \`${index.ops.agentic_core.ethic_count}\``);
  if (index.ops.agentic_core.core_file) {
    lines.push(`- Agentic core file: \`${index.ops.agentic_core.core_file}\``);
  }
  lines.push(`- Markdown graph: \`${index.ops.markdown_graph.status || 'n/a'}\` | files: \`${index.ops.markdown_graph.markdown_file_count ?? 'n/a'}\` | explicit links: \`${index.ops.markdown_graph.explicit_link_count ?? 'n/a'}\` | structural links: \`${index.ops.markdown_graph.structural_link_count ?? 'n/a'}\``);
  if (index.ops.markdown_graph.graph_file) {
    lines.push(`- Markdown graph file: \`${index.ops.markdown_graph.graph_file}\``);
  }
  lines.push(`- Semantic knowledge: \`${index.ops.semantic_knowledge.status || 'n/a'}\` | semantic nodes: \`${index.ops.semantic_knowledge.profiled_node_count ?? 'n/a'}/${index.ops.semantic_knowledge.markdown_node_count ?? 'n/a'}\` | epistemic nodes: \`${index.ops.semantic_knowledge.epistemic_profiled_node_count ?? 'n/a'}/${index.ops.semantic_knowledge.markdown_node_count ?? 'n/a'}\` | concepts: \`${index.ops.semantic_knowledge.concept_count ?? 'n/a'}\` | relations: \`${index.ops.semantic_knowledge.concept_relation_count ?? 'n/a'}\``);
  if (index.ops.semantic_knowledge.summary_file) {
    lines.push(`- Semantic knowledge summary: \`${index.ops.semantic_knowledge.summary_file}\``);
  }
  lines.push(`- Semantic commitment gate: \`${index.ops.semantic_commitment.status || 'n/a'}\` | invariants: \`${index.ops.semantic_commitment.invariant_count ?? 'n/a'}\` | findings: \`${index.ops.semantic_commitment.finding_count ?? 'n/a'}\` | canonical promotion blocked: \`${index.ops.semantic_commitment.canonical_promotion_blocked ?? 'n/a'}\` | challenge blocked: \`${index.ops.semantic_commitment.challenge_registration_blocked ?? 'n/a'}\``);
  if (index.ops.semantic_commitment.markdown_file) {
    lines.push(`- Semantic commitment gate file: \`${index.ops.semantic_commitment.markdown_file}\``);
  }
  lines.push(`- Self release: \`${index.ops.self_release.status || 'n/a'}\` | readback: \`${index.ops.self_release.readback_status || 'n/a'}\` | identity: \`${index.ops.self_release.unified_identity || 'n/a'}\` | version: \`${index.ops.self_release.identity_version || 'n/a'}\` | semver: \`${index.ops.self_release.release_semver || 'n/a'}\` | proposals: \`${index.ops.self_release.proposal_count ?? 'n/a'}\``);
  if (index.ops.self_release.index_file) {
    lines.push(`- Self release index: \`${index.ops.self_release.index_file}\``);
  }
  lines.push(`- Cognitive transaction loop: \`${index.ops.agi_loop.status || 'n/a'}\` | episodes: \`${index.ops.agi_loop.episode_count ?? 'n/a'}\` | success rate: \`${index.ops.agi_loop.success_rate ?? 'n/a'}\` | historical promoted: \`${index.ops.agi_loop.promoted_skill_count ?? 'n/a'}\` | runtime-eligible promoted: \`${index.ops.agi_loop.runtime_eligible_promoted_skill_count ?? 'n/a'}\` | candidates: \`${index.ops.agi_loop.candidate_skill_count ?? 'n/a'}\``);
  if (index.ops.agi_loop.status_file) {
    lines.push(`- Cognitive transaction loop status: \`${index.ops.agi_loop.status_file}\``);
  }
  if (index.ops.agi_loop.eval_report_file) {
    lines.push(`- Cognitive transaction eval report: \`${index.ops.agi_loop.eval_report_file}\``);
  }
  lines.push(`- APFC: \`${index.ops.apfc.status || 'n/a'}\` | graph: \`${index.ops.apfc.graph_id || 'n/a'}\` | nodes: \`${index.ops.apfc.node_count ?? 'n/a'}\` | edges: \`${index.ops.apfc.edge_count ?? 'n/a'}\` | episodes: \`${index.ops.apfc.episode_count ?? 'n/a'}\` | promotable: \`${index.ops.apfc.promotable_skill_count ?? 'n/a'}\` | historical promoted: \`${index.ops.apfc.promoted_skill_count ?? 'n/a'}\` | runtime-eligible: \`${index.ops.apfc.runtime_eligible_skill_count ?? 'n/a'}\``);
  if (index.ops.apfc.status_file) {
    lines.push(`- APFC runtime status: \`${index.ops.apfc.status_file}\``);
  }
  lines.push(`- Software-repair benchmark: \`${index.ops.software_repair_benchmark.status || 'n/a'}\` | cases: \`${index.ops.software_repair_benchmark.case_count ?? 'n/a'}\` | runs: \`${index.ops.software_repair_benchmark.run_count ?? 'n/a'}\` | empirical: \`${index.ops.software_repair_benchmark.empirical_run_count ?? 'n/a'}\` | metric: \`${index.ops.software_repair_benchmark.primary_metric || 'n/a'}\``);
  lines.push(`- Software-repair planning: provider runs \`${index.ops.software_repair_benchmark.provider_run_count ?? 'n/a'}\` | integrity-valid \`${index.ops.software_repair_benchmark.provider_integrity_passed_run_count ?? 'n/a'}\` | PlanGraphs \`${index.ops.software_repair_benchmark.provider_plan_graph_count ?? 'n/a'}\` | provider-backed benchmark runs \`${index.ops.software_repair_benchmark.provider_backed_benchmark_run_count ?? 'n/a'}\` | empirical providers \`${index.ops.software_repair_benchmark.provider_empirical_eligible_run_count ?? 'n/a'}\``);
  if (index.ops.software_repair_benchmark.index_file) {
    lines.push(`- Software-repair benchmark index: \`${index.ops.software_repair_benchmark.index_file}\``);
  }
  lines.push(`- Runtime compiler: \`${index.ops.runtime_compiler.status || 'n/a'}\` | claims: \`${index.ops.runtime_compiler.claims ?? 'n/a'}\` | capabilities: \`${index.ops.runtime_compiler.capabilities ?? 'n/a'}\` | context packs: \`${index.ops.runtime_compiler.context_packs ?? 'n/a'}\``);
  if (index.ops.runtime_compiler.compiler_file) {
    lines.push(`- Runtime compiler file: \`${index.ops.runtime_compiler.compiler_file}\``);
  }
  lines.push(`- Operating cycle: \`${index.ops.operating_cycle.ok ?? 'n/a'}\` | phases: \`${index.ops.operating_cycle.phase_count ?? 'n/a'}\` | failed: \`${index.ops.operating_cycle.failed_phase_count ?? 'n/a'}\``);
  if (index.ops.operating_cycle.markdown_file) {
    lines.push(`- Operating cycle report: \`${index.ops.operating_cycle.markdown_file}\``);
  }
  lines.push(`- Runtime lifecycle: \`${index.ops.runtime_lifecycle.status || 'n/a'}\` | findings: \`${index.ops.runtime_lifecycle.finding_count ?? 'n/a'}\``);
  lines.push(`- Health: \`${index.ops.health.status || 'n/a'}\` | missing required files: \`${index.ops.health.missing_required_files ?? 'n/a'}\``);
  lines.push(`- Last replay matched before: \`${index.ops.replay_report.matched_before ?? 'n/a'}\``);

  lines.push('', '## Hardware', '');
  lines.push(`- Locality: \`${index.ops.hardware.locality || 'host_local'}\``);
  lines.push(`- Cache dir: \`${index.ops.hardware.cache_dir}\``);
  lines.push(`- Clean command: \`${index.ops.hardware.clean_command}\``);
  lines.push(`- Registry file: \`${index.ops.hardware.registry_file || 'n/a'}\``);
  lines.push(`- Mode: \`${index.ops.hardware.mode || 'n/a'}\``);
  lines.push(`- Devices: \`${index.ops.hardware.device_count}\``);
  lines.push(`- Capabilities: \`${index.ops.hardware.capability_count}\``);
  if (Object.keys(index.ops.hardware.categories || {}).length) {
    lines.push('- Categories:');
    for (const [category, count] of Object.entries(index.ops.hardware.categories)) {
      lines.push(`  - \`${category}\`: \`${count}\``);
    }
  }
  if ((index.ops.hardware.available_capabilities || []).length) {
    lines.push('- Available capability surfaces:');
    for (const capability of index.ops.hardware.available_capabilities) {
      lines.push(`  - \`${capability}\``);
    }
  }

  lines.push('', '## Software', '');
  lines.push(`- Locality: \`${index.ops.software.locality || 'host_local'}\``);
  lines.push(`- Cache dir: \`${index.ops.software.cache_dir}\``);
  lines.push(`- Clean command: \`${index.ops.software.clean_command}\``);
  lines.push(`- Registry file: \`${index.ops.software.registry_file || 'n/a'}\``);
  lines.push(`- Mode: \`${index.ops.software.mode || 'n/a'}\``);
  lines.push(`- Applications: \`${index.ops.software.application_count}\``);
  lines.push(`- Services: \`${index.ops.software.service_count}\``);
  lines.push(`- Capabilities: \`${index.ops.software.capability_count}\``);
  if (Object.keys(index.ops.software.application_kinds || {}).length) {
    lines.push('- Application kinds:');
    for (const [kind, count] of Object.entries(index.ops.software.application_kinds)) {
      lines.push(`  - \`${kind}\`: \`${count}\``);
    }
  }
  if (Object.keys(index.ops.software.service_managers || {}).length) {
    lines.push('- Service managers:');
    for (const [manager, count] of Object.entries(index.ops.software.service_managers)) {
      lines.push(`  - \`${manager}\`: \`${count}\``);
    }
  }
  if ((index.ops.software.available_capabilities || []).length) {
    lines.push('- Available capability surfaces:');
    for (const capability of index.ops.software.available_capabilities) {
      lines.push(`  - \`${capability}\``);
    }
  }

  lines.push('', `## Services (\`${index.ops.services.service_count}\`)`, '');
  if (!index.ops.services.services.length) {
    lines.push('- No service status files.');
  } else {
    for (const service of index.ops.services.services) {
      lines.push(`- \`${service.service_id}\`: status \`${service.status}\` | desired \`${service.desired_state || 'n/a'}\` | heartbeat \`${service.heartbeat_at || 'n/a'}\``);
    }
  }

  lines.push('', `## Connectors (\`${index.ops.connectors.connector_count}\`)`, '');
  if (!index.ops.connectors.connectors.length) {
    lines.push('- No connectors registered.');
  } else {
    for (const connector of index.ops.connectors.connectors) {
      lines.push(`- \`${connector.connector_id}\`: kind \`${connector.kind}\` | status \`${connector.status}\` | implemented \`${connector.implemented}\` | mode \`${connector.execution_mode}\` | risk \`${connector.risk_level || 'n/a'}\` | permission \`${connector.permission_profile || 'n/a'}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const index = buildIndex();
  withFileLock('builder__global_index', {
    context: 'build_global_index',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, index);
    atomicWriteText(OUTPUT_MD, buildMarkdown(index));
  });
  appendJournal({
    event: 'global_index_rebuilt',
    project_count: index.ops.project_count,
    source_channel_count: index.ops.source_channel_count,
  });
  printJson({
    ok: true,
    mode: 'build_global_index',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    project_count: index.ops.project_count,
  });
}

main();
