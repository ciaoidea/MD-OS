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
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const SUMMARY_DIR = path.join(OPS_DIR, 'summary');
const OUTPUT_JSON = path.join(SUMMARY_DIR, 'conceptual_boot_summary.json');
const OUTPUT_MD = path.join(SUMMARY_DIR, 'conceptual_boot_summary.md');

const INPUTS = {
  agentic_core: path.join(OPS_DIR, 'core', 'agentic_core.json'),
  semantic_summary: path.join(OPS_DIR, 'semantic_knowledge_summary.json'),
  active_work: path.join(OPS_DIR, 'summary', 'active_work_items.json'),
  runtime_compiler: path.join(OPS_DIR, 'runtime', 'semantic_operational_compiler.json'),
  global_index: path.join(OPS_DIR, 'global_index.json'),
  health_classification: path.join(OPS_DIR, 'health_classification.json'),
  agi_loop_status: path.join(OPS_DIR, 'agi', 'loop_status.json'),
  continuity: path.join(OPS_DIR, 'continuity.md'),
  state: path.join(OPS_DIR, 'state.json'),
  last_summary: path.join(OPS_DIR, 'last_summary.md'),
};

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

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function compactLines(text, limit = 8) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => shortText(line))
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'))
    .slice(0, limit);
}

function inputSnapshot() {
  const refs = [];
  const missing = [];
  const values = {};
  for (const [key, filePath] of Object.entries(INPUTS)) {
    if (!fs.existsSync(filePath)) {
      missing.push(rel(filePath));
      values[key] = null;
      continue;
    }
    refs.push(rel(filePath));
    values[key] = filePath.endsWith('.json') ? readJsonSafe(filePath) : readTextSafe(filePath);
  }
  return { refs, missing, values };
}

function topConcepts(semanticSummary) {
  const concepts = Array.isArray(semanticSummary && semanticSummary.top_concepts)
    ? semanticSummary.top_concepts
    : [];
  return concepts.slice(0, 16).map((concept) => ({
    term: shortText(concept.term || ''),
    node_count: Number.isFinite(concept.node_count) ? concept.node_count : concept.file_count || 0,
  })).filter((concept) => concept.term);
}

function activeItems(activeWork) {
  const items = Array.isArray(activeWork && activeWork.active_items) ? activeWork.active_items : [];
  return items.slice(0, 20).map((item) => ({
    project_id: shortText(item.project_id || ''),
    id: shortText(item.id || ''),
    state: shortText(item.state || item.status || ''),
    priority: shortText(item.priority || ''),
    title: shortText(item.title || ''),
  }));
}

function compilerPacks(runtimeCompiler) {
  const packs = runtimeCompiler && runtimeCompiler.context_packs;
  if (Array.isArray(packs)) {
    return packs.slice(0, 12).map((pack) => shortText(pack.pack_id || pack.id || pack.name || '')).filter(Boolean);
  }
  if (packs && typeof packs === 'object') {
    return Object.keys(packs).sort().slice(0, 12);
  }
  return [];
}

function healthStatus(health) {
  return {
    status: shortText(health && (health.status || health.overall_status || health.health_status) || ''),
    severity: shortText(health && (health.severity || health.max_severity) || ''),
    finding_count: Number.isFinite(health && health.finding_count) ? health.finding_count : null,
  };
}

const VOLATILE_HASH_KEYS = new Set([
  'generated_at',
  'updated_at',
  'compiled_at',
  'built_at',
  'evaluated_at',
  'checked_at',
  'classified_at',
  'indexed_at',
  'archived_at',
  'replayed_at',
  'last_replayed_at',
  'last_built_at',
  'last_checked_at',
  'last_compiled_at',
  'last_updated_at',
]);

function stableValueForHash(value) {
  if (Array.isArray(value)) return value.map((item) => stableValueForHash(item));
  if (!value || typeof value !== 'object') return value;
  const stable = {};
  for (const key of Object.keys(value).sort()) {
    if (VOLATILE_HASH_KEYS.has(key)) continue;
    if (key === 'sha256' || key.endsWith('_hash')) continue;
    stable[key] = stableValueForHash(value[key]);
  }
  return stable;
}

function deriveStatus(snapshot, semantic, operating) {
  if (snapshot.missing.includes(rel(INPUTS.agentic_core)) || snapshot.missing.includes(rel(INPUTS.semantic_summary))) {
    return 'critical';
  }
  if (snapshot.missing.length || ['critical', 'failed', 'error'].includes(String(operating.health.status || '').toLowerCase())) {
    return 'attention';
  }
  if (!semantic.top_concepts.length) return 'attention';
  return 'ok';
}

function buildConceptualBootSummary() {
  const generatedAt = nowIso();
  const snapshot = inputSnapshot();
  const {
    agentic_core: agenticCore,
    semantic_summary: semanticSummary,
    active_work: activeWork,
    runtime_compiler: runtimeCompiler,
    health_classification: healthClassification,
    agi_loop_status: agiLoopStatus,
    continuity,
    state,
    last_summary: lastSummary,
  } = snapshot.values;

  const core = agenticCore && agenticCore.core || {};
  const identity = {
    name: shortText(core.identity && core.identity.name || 'MD-OS (Artificial Prefrontal Cortex)'),
    boundary: shortText(core.release_identity && core.release_identity.current_operating_boundary || 'md-os/'),
    host_runtime_role: shortText(core.identity && core.identity.host_runtime_role || 'execution_layer'),
    mission: shortText(core.mission || ''),
    non_claim_count: Array.isArray(core.non_claims) ? core.non_claims.length : 0,
  };

  const semantic = {
    summary_status: shortText(semanticSummary && semanticSummary.status || ''),
    semantic_profile_complete: Boolean(semanticSummary && semanticSummary.semantic_profile_complete),
    epistemic_profile_complete: Boolean(semanticSummary && semanticSummary.epistemic_profile_complete),
    top_concepts: topConcepts(semanticSummary),
    context_packs: compilerPacks(runtimeCompiler),
  };

  const operating = {
    state_mode: shortText(state && state.mode || ''),
    active_count: Number.isFinite(activeWork && activeWork.active_count) ? activeWork.active_count : activeItems(activeWork).length,
    active_items: activeItems(activeWork),
    health: healthStatus(healthClassification),
    agi_loop_status: shortText(agiLoopStatus && (agiLoopStatus.status || agiLoopStatus.overall_status) || ''),
    continuity_lines: compactLines(continuity, 6),
    last_summary_lines: compactLines(lastSummary, 8),
  };

  const closure = {
    discipline: 'master_closure_edges_before_progress',
    progress_rule: 'artifact progress, method progress, and master closure progress must be reported separately',
    no_false_closure_rule: 'closure progress advances only when a named dependency edge closes with verifier readback',
    next_safe_actions: [
      'read this conceptual boot summary after stable identity and compact core',
      'expand semantic graph or active work only when the task requires detail',
      'for complex tasks, define master closure and dependency edges before local gates',
      'run the system operating cycle after source, runtime, or knowledge changes',
    ],
    risks: snapshot.missing.length ? ['missing boot input readback'] : [],
  };

  const bootReadOrder = [
    'AGENTS.md',
    'ME.md',
    'md-os/kb/COGNITIVE_BOOTSTRAP.md',
    'md-os/ops/core/agentic_core.md',
    'md-os/ops/summary/conceptual_boot_summary.md',
    'md-os/ops/semantic_knowledge_summary.md',
    'md-os/ops/summary/active_work_items.md',
    'md-os/ops/global_index.md',
    'md-os/ops/health_classification.md',
  ];

  const sourceHash = sha256Json({
    input_refs: snapshot.refs,
    missing_inputs: snapshot.missing,
    values: stableValueForHash(snapshot.values),
  });

  const payload = {
    schema_version: 1,
    generated_at: generatedAt,
    status: 'ok',
    source_hash: sourceHash,
    input_refs: snapshot.refs,
    missing_inputs: snapshot.missing,
    identity,
    semantic,
    operating,
    closure,
    boot_read_order: bootReadOrder,
  };
  payload.status = deriveStatus(snapshot, semantic, operating);
  return payload;
}

function renderMarkdown(payload) {
  const lines = [
    '# Conceptual Cold Boot Summary',
    '',
    `Generated at: \`${payload.generated_at}\``,
    '',
    `Status: \`${payload.status}\``,
    '',
    '## Identity',
    '',
    `- name: \`${payload.identity.name}\``,
    `- boundary: \`${payload.identity.boundary}\``,
    `- host runtime role: \`${payload.identity.host_runtime_role}\``,
    `- mission: ${payload.identity.mission || 'not available'}`,
    '',
    '## Semantic Orientation',
    '',
    `- semantic profile complete: \`${payload.semantic.semantic_profile_complete}\``,
    `- epistemic profile complete: \`${payload.semantic.epistemic_profile_complete}\``,
    `- context packs: \`${payload.semantic.context_packs.length}\``,
    '',
    'Top concepts:',
    '',
  ];

  if (!payload.semantic.top_concepts.length) lines.push('- No concept readback available.');
  else {
    for (const concept of payload.semantic.top_concepts.slice(0, 12)) {
      lines.push(`- \`${concept.term}\` (${concept.node_count})`);
    }
  }

  lines.push(
    '',
    '## Operating Orientation',
    '',
    `- state mode: \`${payload.operating.state_mode || 'unknown'}\``,
    `- active work items: \`${payload.operating.active_count}\``,
    `- health status: \`${payload.operating.health.status || 'unknown'}\``,
    `- AGI loop status: \`${payload.operating.agi_loop_status || 'unknown'}\``,
    '',
    'Active work:',
    ''
  );

  if (!payload.operating.active_items.length) lines.push('- No active work item readback available.');
  else {
    for (const item of payload.operating.active_items.slice(0, 10)) {
      lines.push(`- \`${item.project_id}\` \`${item.state}\` \`${item.priority}\` ${item.title}`);
    }
  }

  lines.push(
    '',
    '## Closure Discipline',
    '',
    `- discipline: \`${payload.closure.discipline}\``,
    `- progress rule: ${payload.closure.progress_rule}`,
    `- no false closure: ${payload.closure.no_false_closure_rule}`,
    '',
    'Next safe actions:',
    ''
  );
  for (const action of payload.closure.next_safe_actions) lines.push(`- ${action}`);

  lines.push('', '## Missing Inputs', '');
  if (!payload.missing_inputs.length) lines.push('- None.');
  else {
    for (const input of payload.missing_inputs) lines.push(`- \`${input}\``);
  }

  lines.push('', '## Boot Read Order', '');
  for (const item of payload.boot_read_order) lines.push(`- \`${item}\``);
  lines.push('');
  return lines.join('\n');
}

function writeConceptualBootSummary(payload) {
  ensureDir(SUMMARY_DIR);
  withFileLock('builder__conceptual_boot_summary', {
    context: 'build_conceptual_boot_summary',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, payload);
    atomicWriteText(OUTPUT_MD, renderMarkdown(payload));
  });
}

function main() {
  const payload = buildConceptualBootSummary();
  writeConceptualBootSummary(payload);
  appendJournal({
    event: 'conceptual_boot_summary_built',
    status: payload.status,
    missing_input_count: payload.missing_inputs.length,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
  printJson({
    ok: payload.status !== 'critical',
    mode: 'conceptual_boot_summary_built',
    status: payload.status,
    missing_input_count: payload.missing_inputs.length,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildConceptualBootSummary,
  renderMarkdown,
  writeConceptualBootSummary,
};
