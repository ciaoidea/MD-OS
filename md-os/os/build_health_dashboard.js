#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  ACTIVE_BOUNDARY_DIR,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const OUTPUT_JSON = path.join(OPS_DIR, 'health.json');
const OUTPUT_MD = path.join(OPS_DIR, 'health.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function readJournalTail(limit = 20) {
  const journalFile = path.join(OPS_DIR, 'journal.ndjson');
  const text = readTextSafe(journalFile);
  const lines = text.trim().split('\n').filter(Boolean);
  const events = [];
  for (const line of lines.slice(-limit)) {
    try {
      events.push(JSON.parse(line));
    } catch (_) {
      events.push({ malformed: true, raw: line.slice(0, 200) });
    }
  }
  return {
    file: rel(journalFile),
    size_bytes: fs.existsSync(journalFile) ? fs.statSync(journalFile).size : 0,
    event_count_estimate: lines.length,
    last_event: events.at(-1) || null,
    tail: events,
  };
}

function worstStatus(statuses) {
  if (statuses.includes('critical')) return 'critical';
  if (statuses.includes('attention')) return 'attention';
  if (statuses.includes('unknown')) return 'attention';
  return 'ok';
}

function fileMeta(relativePath) {
  const filePath = path.join(WORKSPACE_ROOT, relativePath);
  if (!fs.existsSync(filePath)) return { file: relativePath, exists: false };
  const stats = fs.statSync(filePath);
  return {
    file: relativePath,
    exists: true,
    size_bytes: stats.size,
    mtime: new Date(stats.mtimeMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

function buildHealth() {
  const globalIndex = readJsonSafe(path.join(OPS_DIR, 'global_index.json'));
  const hygiene = readJsonSafe(path.join(OPS_DIR, 'system_hygiene_status.json'));
  const healthClassification = readJsonSafe(path.join(OPS_DIR, 'health_classification.json'));
  const lifecycle = readJsonSafe(path.join(OPS_DIR, 'runtime_lifecycle_index.json'));
  const markdownGraph = readJsonSafe(path.join(OPS_DIR, 'markdown_graph.json'));
  const semanticKnowledge = readJsonSafe(path.join(OPS_DIR, 'semantic_knowledge_summary.json'));
  const selfRelease = readJsonSafe(path.join(OPS_DIR, 'releases', 'self_release_index.json'));
  const agiLoop = readJsonSafe(path.join(OPS_DIR, 'agi', 'loop_status.json'));
  const agiEval = readJsonSafe(path.join(OPS_DIR, 'evals', 'agi_eval_report.json'));
  const skillRegistry = readJsonSafe(path.join(OPS_DIR, 'skills', 'skill_registry.json'));
  const runtimeCompiler = readJsonSafe(path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.json'));
  const runtimeEpistemicHealth = readJsonSafe(path.join(OPS_DIR, 'runtime', 'epistemic_health.json'));
  const agenticCore = readJsonSafe(path.join(OPS_DIR, 'core', 'agentic_core.json'));
  const replay = readJsonSafe(path.join(OPS_DIR, 'replay_report.json'));
  const connectorRegistry = readJsonSafe(path.join(OPS_DIR, 'connectors', 'connector_registry.json'));
  const currentTask = shortText(readTextSafe(path.join(OPS_DIR, 'current_task.md'), '# Current Task\n\nNot initialized.\n'));
  const journal = readJournalTail(20);
  const connectors = Array.isArray(connectorRegistry && connectorRegistry.connectors) ? connectorRegistry.connectors : [];
  const connectorStatuses = connectors.reduce((acc, connector) => {
    const status = shortText(connector.status || 'unknown') || 'unknown';
    acc[status] = (acc[status] || 0) + 1;
    return acc;
  }, {});
  const riskLevels = connectors.reduce((acc, connector) => {
    const risk = shortText(connector.risk_level || 'unclassified') || 'unclassified';
    acc[risk] = (acc[risk] || 0) + 1;
    return acc;
  }, {});

  const requiredFiles = [
    'md-os/ops/global_index.json',
    'md-os/ops/global_index.md',
    'md-os/ops/markdown_graph.json',
    'md-os/ops/markdown_graph.md',
    'md-os/ops/semantic_knowledge_graph.json',
    'md-os/ops/semantic_knowledge_graph.md',
    'md-os/ops/semantic_knowledge_summary.json',
    'md-os/ops/semantic_knowledge_summary.md',
    'md-os/ops/releases/self_release_index.json',
    'md-os/ops/releases/self_release_index.md',
    'md-os/ops/agi/loop_status.json',
    'md-os/ops/agi/loop_status.md',
    'md-os/ops/skills/skill_registry.json',
    'md-os/ops/evals/agi_eval_report.json',
    'md-os/ops/failures/failure_index.json',
    'md-os/ops/world/world_model.json',
    'md-os/ops/benchmarks/agi_benchmarks.json',
    'md-os/ops/benchmarks/software_repair/index.json',
    'md-os/ops/runtime/semantic_operational_compiler.json',
    'md-os/ops/runtime/semantic_operational_compiler.md',
    'md-os/ops/runtime/semantic_index.json',
    'md-os/ops/runtime/claim_index.json',
    'md-os/ops/runtime/capability_index.json',
    'md-os/ops/runtime/context_packs/index.json',
    'md-os/ops/runtime/eval_results.json',
    'md-os/ops/runtime/epistemic_health.json',
    'md-os/ops/workspace_inventory.json',
    'md-os/ops/workspace_inventory.md',
    'md-os/ops/runtime_lifecycle_index.json',
    'md-os/ops/runtime_lifecycle_index.md',
    'md-os/ops/core/agentic_core.json',
    'md-os/ops/core/agentic_core.md',
    'md-os/ops/system_hygiene_status.json',
    'md-os/ops/system_hygiene_status.md',
    'md-os/ops/health_classification.json',
    'md-os/ops/health_classification.md',
    'md-os/ops/journal.ndjson',
    'md-os/ops/continuity.md',
    'md-os/ops/state.json',
    'md-os/ops/last_summary.md',
    'md-os/ops/agenda/global_agenda.json',
    'md-os/ops/agenda/global_agenda.md',
  ];
  const requiredStatus = requiredFiles.map(fileMeta);
  const missingFiles = requiredStatus.filter((item) => !item.exists).map((item) => item.file);

  const builderFiles = [
    fileMeta('md-os/ops/global_index.json'),
    fileMeta('md-os/ops/markdown_graph.json'),
    fileMeta('md-os/ops/semantic_knowledge_summary.json'),
    fileMeta('md-os/ops/releases/self_release_index.json'),
    fileMeta('md-os/ops/agi/loop_status.json'),
    fileMeta('md-os/ops/evals/agi_eval_report.json'),
    fileMeta('md-os/ops/skills/skill_registry.json'),
    fileMeta('md-os/ops/runtime/semantic_operational_compiler.json'),
    fileMeta('md-os/ops/runtime/epistemic_health.json'),
    fileMeta('md-os/ops/workspace_inventory.json'),
    fileMeta('md-os/ops/core/agentic_core.json'),
    fileMeta('md-os/ops/runtime_lifecycle_index.json'),
    fileMeta('md-os/ops/system_hygiene_status.json'),
    fileMeta('md-os/ops/health_classification.json'),
    fileMeta('md-os/ops/replay_report.json'),
  ];

  const status = worstStatus([
    hygiene && hygiene.overall_status || 'unknown',
    lifecycle && lifecycle.status || 'unknown',
    markdownGraph && markdownGraph.status || 'unknown',
    semanticKnowledge && semanticKnowledge.status || 'unknown',
    semanticKnowledge && semanticKnowledge.semantic_profile_complete === false ? 'critical' : 'ok',
    semanticKnowledge && semanticKnowledge.epistemic_profile_complete === false ? 'critical' : 'ok',
    selfRelease && selfRelease.status || 'unknown',
    agiLoop && agiLoop.status || 'unknown',
    agiEval && agiEval.status || 'unknown',
    runtimeCompiler && runtimeCompiler.status || 'unknown',
    runtimeEpistemicHealth && runtimeEpistemicHealth.status || 'unknown',
    healthClassification && healthClassification.status || 'unknown',
    replay && replay.matched_before === false ? 'attention' : 'ok',
    missingFiles.length ? 'attention' : 'ok',
  ]);

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      global_index: globalIndex && globalIndex.source_hash || null,
      hygiene: hygiene && hygiene.source_hash || null,
      health_classification: healthClassification && healthClassification.source_hash || null,
      lifecycle: lifecycle && lifecycle.source_hash || null,
      markdown_graph: markdownGraph && markdownGraph.source_hash || null,
      semantic_knowledge: semanticKnowledge && semanticKnowledge.source_hash || null,
      self_release: selfRelease && selfRelease.source_hash || null,
      agi_loop: agiLoop && agiLoop.source_hash || null,
      agi_eval: agiEval && agiEval.source_hash || null,
      skill_registry: skillRegistry && skillRegistry.updated_at || null,
      runtime_compiler: runtimeCompiler && runtimeCompiler.source_hash || null,
      runtime_epistemic_health: runtimeEpistemicHealth && runtimeEpistemicHealth.source_hash || null,
      agentic_core: agenticCore && agenticCore.source_hash || null,
      replay: replay && replay.replay_hash || null,
      journal_last_event: journal.last_event,
    }),
    status,
    boundary: ACTIVE_BOUNDARY_DIR,
    current_task_excerpt: currentTask.slice(0, 500),
    required_files: requiredStatus,
    missing_required_files: missingFiles,
    builders: builderFiles,
    hygiene: {
      status: hygiene && hygiene.overall_status || 'unknown',
      missing_required_files: hygiene && hygiene.stability && hygiene.stability.missing_required_files || [],
      publication_status: hygiene && hygiene.publication && hygiene.publication.status || 'unknown',
    },
    health_classification: {
      available: Boolean(healthClassification),
      file: 'md-os/ops/health_classification.json',
      status: healthClassification && healthClassification.status || 'unknown',
      runtime_health: healthClassification && healthClassification.health && healthClassification.health.runtime_health || null,
      compiler_health: healthClassification && healthClassification.health && healthClassification.health.compiler_health || null,
      agi_loop_health: healthClassification && healthClassification.health && healthClassification.health.agi_loop_health || null,
      publication_health: healthClassification && healthClassification.health && healthClassification.health.publication_health || null,
      security_health: healthClassification && healthClassification.health && healthClassification.health.security_health || null,
      local_hygiene_health: healthClassification && healthClassification.health && healthClassification.health.local_hygiene_health || null,
      release_gate: healthClassification && healthClassification.release_gate || null,
      finding_summary: healthClassification && healthClassification.finding_summary || null,
    },
    lifecycle: {
      status: lifecycle && lifecycle.status || 'unknown',
      file_count: lifecycle && lifecycle.file_count || 0,
      finding_count: lifecycle && lifecycle.finding_count || 0,
      class_counts: lifecycle && lifecycle.class_counts || {},
    },
    markdown_graph: {
      available: Boolean(markdownGraph),
      graph_file: 'md-os/ops/markdown_graph.json',
      status: markdownGraph && markdownGraph.status || 'unknown',
      markdown_file_count: markdownGraph && markdownGraph.markdown_file_count || 0,
      explicit_link_count: markdownGraph && markdownGraph.explicit_link_count || 0,
      structural_link_count: markdownGraph && markdownGraph.structural_link_count || 0,
      explicit_orphan_count: markdownGraph && markdownGraph.explicit_orphan_count || 0,
      structural_isolated_count: markdownGraph && markdownGraph.structural_isolated_count || 0,
      semantic_operational_network: markdownGraph && markdownGraph.semantic_operational_network || null,
    },
    semantic_knowledge: {
      available: Boolean(semanticKnowledge),
      summary_file: 'md-os/ops/semantic_knowledge_summary.json',
      graph_file: 'md-os/ops/semantic_knowledge_graph.json',
      status: semanticKnowledge && semanticKnowledge.status || 'unknown',
      markdown_node_count: semanticKnowledge && semanticKnowledge.markdown_node_count || 0,
      profiled_node_count: semanticKnowledge && semanticKnowledge.profiled_node_count || 0,
      epistemic_profiled_node_count: semanticKnowledge && semanticKnowledge.epistemic_profiled_node_count || 0,
      semantic_profile_complete: semanticKnowledge ? semanticKnowledge.semantic_profile_complete === true : false,
      epistemic_profile_complete: semanticKnowledge ? semanticKnowledge.epistemic_profile_complete === true : false,
      semantic_edge_count: semanticKnowledge && semanticKnowledge.semantic_edge_count || 0,
      cross_layer_edge_count: semanticKnowledge && semanticKnowledge.cross_layer_edge_count || 0,
      concept_count: semanticKnowledge && semanticKnowledge.concept_count || 0,
      concept_relation_count: semanticKnowledge && semanticKnowledge.concept_relation_count || 0,
      disconnected_node_count: semanticKnowledge && semanticKnowledge.disconnected_node_count || 0,
      finding_count: Array.isArray(semanticKnowledge && semanticKnowledge.findings) ? semanticKnowledge.findings.length : 0,
      top_concepts: Array.isArray(semanticKnowledge && semanticKnowledge.top_concepts) ? semanticKnowledge.top_concepts.slice(0, 10) : [],
      top_concept_relations: Array.isArray(semanticKnowledge && semanticKnowledge.top_concept_relations) ? semanticKnowledge.top_concept_relations.slice(0, 10) : [],
    },
    self_release: {
      available: Boolean(selfRelease),
      index_file: 'md-os/ops/releases/self_release_index.json',
      markdown_file: 'md-os/ops/releases/self_release_index.md',
      status: selfRelease && selfRelease.status || 'unknown',
      readback_status: selfRelease && selfRelease.readback_status || 'unknown',
      unified_identity: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.unified_identity || ''),
      identity_name: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.identity_name || ''),
      identity_version: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.identity_version || ''),
      release_label: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.release_label || ''),
      release_semver: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.release_semver || ''),
      release_version: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.release_version || ''),
      release_name: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.release_name || ''),
      identity_short_name: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.identity_short_name || ''),
      identity_id: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.identity_id || ''),
      agentic_operational_id: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.agentic_operational_id || ''),
      active_boundary: shortText(selfRelease && selfRelease.current_release && selfRelease.current_release.active_boundary || ''),
      proposal_count: selfRelease && selfRelease.proposal_count || 0,
      valid_proposal_count: selfRelease && selfRelease.valid_proposal_count || 0,
      finding_count: Array.isArray(selfRelease && selfRelease.findings) ? selfRelease.findings.length : 0,
    },
    agi_loop: {
      available: Boolean(agiLoop),
      status_file: 'md-os/ops/agi/loop_status.json',
      status: agiLoop && agiLoop.status || 'unknown',
      episode_count: agiLoop && agiLoop.metrics && agiLoop.metrics.episode_count || 0,
      success_rate: agiLoop && agiLoop.metrics && agiLoop.metrics.success_rate || 0,
      autonomy_horizon: shortText(agiLoop && agiLoop.metrics && agiLoop.metrics.autonomy_horizon || ''),
      promoted_skill_count: skillRegistry && skillRegistry.promoted_skill_count || 0,
      candidate_skill_count: skillRegistry && skillRegistry.candidate_skill_count || 0,
      eval_status: agiEval && agiEval.status || 'unknown',
      regression_count: agiEval && agiEval.metrics && agiEval.metrics.regression_count || 0,
      failure_recovery_rate: agiEval && agiEval.metrics && agiEval.metrics.failure_recovery_rate || 0,
    },
    runtime_compiler: {
      available: Boolean(runtimeCompiler),
      compiler_file: 'md-os/ops/runtime/semantic_operational_compiler.json',
      status: runtimeCompiler && runtimeCompiler.status || 'unknown',
      semantic_nodes: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.semantic_nodes || 0,
      claims: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.claims || 0,
      capabilities: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.capabilities || 0,
      links: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.links || 0,
      context_packs: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.context_packs || 0,
      epistemic_findings: runtimeCompiler && runtimeCompiler.counts && runtimeCompiler.counts.epistemic_findings || 0,
      epistemic_health_status: runtimeEpistemicHealth && runtimeEpistemicHealth.status || 'unknown',
    },
    agentic_core: {
      available: Boolean(agenticCore),
      core_file: 'md-os/ops/core/agentic_core.json',
      core_id: shortText(agenticCore && agenticCore.core && agenticCore.core.core_id || ''),
      identity_name: shortText(agenticCore && agenticCore.core && agenticCore.core.identity && agenticCore.core.identity.name || ''),
      objective_count: Array.isArray(agenticCore && agenticCore.core && agenticCore.core.objectives) ? agenticCore.core.objectives.length : 0,
      ethic_count: Array.isArray(agenticCore && agenticCore.core && agenticCore.core.ethics) ? agenticCore.core.ethics.length : 0,
      source_hash: agenticCore && agenticCore.source_hash || null,
    },
    replay: {
      available: Boolean(replay),
      replayed_at: replay && replay.replayed_at || null,
      matched_before: replay ? replay.matched_before : null,
      replay_hash: replay && replay.replay_hash || null,
      source_manifest_hash: replay && replay.accounting && replay.accounting.source_manifest_hash || null,
      output_manifest_hash: replay && replay.accounting && replay.accounting.output_manifest_hash || null,
    },
    connectors: {
      registry_file: 'md-os/ops/connectors/connector_registry.json',
      connector_count: connectors.length,
      implemented_count: connectors.filter((item) => item.implemented === true).length,
      status_counts: Object.fromEntries(Object.entries(connectorStatuses).sort(([left], [right]) => left.localeCompare(right))),
      risk_level_counts: Object.fromEntries(Object.entries(riskLevels).sort(([left], [right]) => left.localeCompare(right))),
      connectors: connectors.map((item) => ({
        connector_id: shortText(item.connector_id),
        kind: shortText(item.kind),
        status: shortText(item.status),
        implemented: item.implemented === true,
        permission_profile: shortText(item.permission_profile || ''),
        risk_level: shortText(item.risk_level || ''),
        requires_approval: item.requires_approval === true,
      })),
    },
    work: {
      project_count: globalIndex && globalIndex.ops && globalIndex.ops.project_count || 0,
      source_channel_count: globalIndex && globalIndex.ops && globalIndex.ops.source_channel_count || 0,
      active_work_item_count: globalIndex && globalIndex.ops && globalIndex.ops.active_work_item_count || 0,
      terminal_work_item_count: globalIndex && globalIndex.ops && globalIndex.ops.terminal_work_item_count || 0,
    },
    journal,
  };
}

function buildMarkdown(health) {
  const lines = [
    '# MD-OS Health',
    '',
    `Updated at: \`${health.updated_at}\``,
    '',
    `Status: \`${health.status}\``,
    '',
    `Boundary: \`${health.boundary}\``,
    '',
    '## Current Task',
    '',
    health.current_task_excerpt || 'No current task recorded.',
    '',
    '## Runtime Files',
    '',
    `- Missing required files: \`${health.missing_required_files.length}\``,
  ];
  for (const file of health.missing_required_files) {
    lines.push(`- missing: \`${file}\``);
  }

  lines.push('', '## Builders', '');
  for (const item of health.builders) {
    lines.push(`- \`${item.file}\`: ${item.exists ? `updated \`${item.mtime}\` | \`${item.size_bytes}\` bytes` : 'missing'}`);
  }

  lines.push('', '## Hygiene', '');
  lines.push(`- status: \`${health.hygiene.status}\``);
  lines.push(`- publication status: \`${health.hygiene.publication_status}\``);
  lines.push(`- hygiene missing required files: \`${health.hygiene.missing_required_files.length}\``);

  lines.push('', '## Health Classification', '');
  lines.push(`- available: \`${health.health_classification.available}\``);
  lines.push(`- status: \`${health.health_classification.status}\``);
  if (health.health_classification.release_gate) {
    const gate = health.health_classification.release_gate;
    lines.push(`- runtime operable: \`${gate.runtime_operable}\``);
    lines.push(`- publishable: \`${gate.publishable}\``);
    lines.push(`- release blocked: \`${gate.release_blocked}\``);
    lines.push(`- publication blocked: \`${gate.publication_blocked}\``);
    lines.push(`- security blocked: \`${gate.security_blocked}\``);
    lines.push(`- local-only blocked: \`${gate.local_only_blocked}\``);
  }
  for (const [label, scope] of [
    ['runtime health', health.health_classification.runtime_health],
    ['compiler health', health.health_classification.compiler_health],
    ['AGI loop health', health.health_classification.agi_loop_health],
    ['publication health', health.health_classification.publication_health],
    ['security health', health.health_classification.security_health],
    ['local hygiene health', health.health_classification.local_hygiene_health],
  ]) {
    if (!scope) continue;
    lines.push(`- ${label}: \`${scope.status}\` | findings \`${scope.finding_count}\``);
  }

  lines.push('', '## Lifecycle', '');
  lines.push(`- status: \`${health.lifecycle.status}\``);
  lines.push(`- files classified: \`${health.lifecycle.file_count}\``);
  lines.push(`- findings: \`${health.lifecycle.finding_count}\``);
  for (const [name, count] of Object.entries(health.lifecycle.class_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }

  lines.push('', '## Markdown Graph', '');
  lines.push(`- available: \`${health.markdown_graph.available}\``);
  lines.push(`- status: \`${health.markdown_graph.status}\``);
  lines.push(`- Markdown files: \`${health.markdown_graph.markdown_file_count}\``);
  lines.push(`- explicit links: \`${health.markdown_graph.explicit_link_count}\``);
  lines.push(`- structural links: \`${health.markdown_graph.structural_link_count}\``);
  lines.push(`- explicit orphan files: \`${health.markdown_graph.explicit_orphan_count}\``);
  lines.push(`- structurally isolated files: \`${health.markdown_graph.structural_isolated_count}\``);
  if (health.markdown_graph.semantic_operational_network) {
    const network = health.markdown_graph.semantic_operational_network;
    lines.push(`- semantic operational network: \`${network.status}\``);
    lines.push(`- semantic core nodes present: \`${network.present_node_count}/${network.required_node_count}\``);
    lines.push(`- semantic core nodes connected: \`${network.structurally_connected_node_count}/${network.required_node_count}\``);
  }

  lines.push('', '## Semantic Knowledge', '');
  lines.push(`- available: \`${health.semantic_knowledge.available}\``);
  lines.push(`- status: \`${health.semantic_knowledge.status}\``);
  lines.push(`- Markdown concept nodes: \`${health.semantic_knowledge.markdown_node_count}\``);
  lines.push(`- profiled nodes: \`${health.semantic_knowledge.profiled_node_count}/${health.semantic_knowledge.markdown_node_count}\``);
  lines.push(`- epistemic profiled nodes: \`${health.semantic_knowledge.epistemic_profiled_node_count}/${health.semantic_knowledge.markdown_node_count}\``);
  lines.push(`- semantic profile complete: \`${health.semantic_knowledge.semantic_profile_complete}\``);
  lines.push(`- epistemic profile complete: \`${health.semantic_knowledge.epistemic_profile_complete}\``);
  lines.push(`- semantic edges: \`${health.semantic_knowledge.semantic_edge_count}\``);
  lines.push(`- cross-layer edges: \`${health.semantic_knowledge.cross_layer_edge_count}\``);
  lines.push(`- concept terms: \`${health.semantic_knowledge.concept_count}\``);
  lines.push(`- concept relations: \`${health.semantic_knowledge.concept_relation_count}\``);
  lines.push(`- disconnected semantic nodes: \`${health.semantic_knowledge.disconnected_node_count}\``);
  lines.push(`- compact findings: \`${health.semantic_knowledge.finding_count}\``);

  lines.push('', '## Self Release', '');
  lines.push(`- available: \`${health.self_release.available}\``);
  lines.push(`- status: \`${health.self_release.status}\``);
  lines.push(`- readback status: \`${health.self_release.readback_status}\``);
  lines.push(`- unified identity: \`${health.self_release.unified_identity || 'n/a'}\``);
  lines.push(`- identity version: \`${health.self_release.identity_version || 'n/a'}\``);
  lines.push(`- release label: \`${health.self_release.release_label || 'n/a'}\``);
  lines.push(`- release semver: \`${health.self_release.release_semver || 'n/a'}\``);
  lines.push(`- release version: \`${health.self_release.release_version || 'n/a'}\``);
  lines.push(`- release name: \`${health.self_release.release_name || 'n/a'}\``);
  lines.push(`- identity short name: \`${health.self_release.identity_short_name || 'n/a'}\``);
  lines.push(`- identity id: \`${health.self_release.identity_id || 'n/a'}\``);
  lines.push(`- active boundary: \`${health.self_release.active_boundary || 'n/a'}\``);
  lines.push(`- proposals: \`${health.self_release.proposal_count}\``);
  lines.push(`- valid proposals: \`${health.self_release.valid_proposal_count}\``);
  lines.push(`- findings: \`${health.self_release.finding_count}\``);

  lines.push('', '## Verified AGI Loop', '');
  lines.push(`- available: \`${health.agi_loop.available}\``);
  lines.push(`- status: \`${health.agi_loop.status}\``);
  lines.push(`- eval status: \`${health.agi_loop.eval_status}\``);
  lines.push(`- episodes: \`${health.agi_loop.episode_count}\``);
  lines.push(`- success rate: \`${health.agi_loop.success_rate}\``);
  lines.push(`- failure recovery rate: \`${health.agi_loop.failure_recovery_rate}\``);
  lines.push(`- autonomy horizon: \`${health.agi_loop.autonomy_horizon || 'n/a'}\``);
  lines.push(`- promoted skills: \`${health.agi_loop.promoted_skill_count}\``);
  lines.push(`- candidate skills: \`${health.agi_loop.candidate_skill_count}\``);
  lines.push(`- regressions: \`${health.agi_loop.regression_count}\``);

  lines.push('', '## Runtime Compiler', '');
  lines.push(`- available: \`${health.runtime_compiler.available}\``);
  lines.push(`- status: \`${health.runtime_compiler.status}\``);
  lines.push(`- semantic nodes: \`${health.runtime_compiler.semantic_nodes}\``);
  lines.push(`- claims: \`${health.runtime_compiler.claims}\``);
  lines.push(`- capabilities: \`${health.runtime_compiler.capabilities}\``);
  lines.push(`- links: \`${health.runtime_compiler.links}\``);
  lines.push(`- context packs: \`${health.runtime_compiler.context_packs}\``);
  lines.push(`- epistemic health: \`${health.runtime_compiler.epistemic_health_status}\``);
  lines.push(`- epistemic findings: \`${health.runtime_compiler.epistemic_findings}\``);

  lines.push('', '## Agentic Core', '');
  lines.push(`- available: \`${health.agentic_core.available}\``);
  lines.push(`- core id: \`${health.agentic_core.core_id || 'n/a'}\``);
  lines.push(`- identity: \`${health.agentic_core.identity_name || 'n/a'}\``);
  lines.push(`- objectives: \`${health.agentic_core.objective_count}\``);
  lines.push(`- ethics: \`${health.agentic_core.ethic_count}\``);
  lines.push(`- source hash: \`${health.agentic_core.source_hash || 'n/a'}\``);

  lines.push('', '## Replay', '');
  lines.push(`- report available: \`${health.replay.available}\``);
  lines.push(`- replayed at: \`${health.replay.replayed_at || 'n/a'}\``);
  lines.push(`- matched before: \`${health.replay.matched_before ?? 'n/a'}\``);
  lines.push(`- replay hash: \`${health.replay.replay_hash || 'n/a'}\``);
  lines.push(`- source manifest hash: \`${health.replay.source_manifest_hash || 'n/a'}\``);
  lines.push(`- output manifest hash: \`${health.replay.output_manifest_hash || 'n/a'}\``);

  lines.push('', '## Connectors', '');
  lines.push(`- connector count: \`${health.connectors.connector_count}\``);
  lines.push(`- implemented: \`${health.connectors.implemented_count}\``);
  for (const connector of health.connectors.connectors) {
    lines.push(`- \`${connector.connector_id}\`: kind \`${connector.kind}\` | status \`${connector.status}\` | risk \`${connector.risk_level || 'n/a'}\` | permission \`${connector.permission_profile || 'n/a'}\` | approval \`${connector.requires_approval}\``);
  }

  lines.push('', '## Work', '');
  lines.push(`- projects: \`${health.work.project_count}\``);
  lines.push(`- source channels: \`${health.work.source_channel_count}\``);
  lines.push(`- active work items: \`${health.work.active_work_item_count}\``);
  lines.push(`- terminal work items: \`${health.work.terminal_work_item_count}\``);

  lines.push('', '## Journal', '');
  lines.push(`- file: \`${health.journal.file}\``);
  lines.push(`- size bytes: \`${health.journal.size_bytes}\``);
  lines.push(`- event count estimate: \`${health.journal.event_count_estimate}\``);
  if (health.journal.last_event) {
    lines.push(`- last event: \`${shortText(health.journal.last_event.event || (health.journal.last_event.malformed ? 'malformed' : 'unknown'))}\``);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const health = buildHealth();
  withFileLock('builder__health_dashboard', {
    context: 'build_health_dashboard',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, health);
    atomicWriteText(OUTPUT_MD, buildMarkdown(health));
  });
  appendJournal({
    event: 'health_dashboard_rebuilt',
    status: health.status,
    connector_count: health.connectors.connector_count,
    lifecycle_status: health.lifecycle.status,
    hygiene_status: health.hygiene.status,
    health_classification_status: health.health_classification.status,
    runtime_health_status: health.health_classification.runtime_health && health.health_classification.runtime_health.status,
    publishable: health.health_classification.release_gate && health.health_classification.release_gate.publishable,
    semantic_knowledge_status: health.semantic_knowledge.status,
    self_release_status: health.self_release.status,
    agi_loop_status: health.agi_loop.status,
    runtime_compiler_status: health.runtime_compiler.status,
  });
  printJson({
    ok: true,
    mode: 'build_health_dashboard',
    updated_at: health.updated_at,
    status: health.status,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildHealth,
};
