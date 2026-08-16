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
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const CORE_DIR = path.join(OPS_DIR, 'core');
const OUTPUT_JSON = path.join(CORE_DIR, 'agentic_core.json');
const OUTPUT_MD = path.join(CORE_DIR, 'agentic_core.md');
const CORE_MODEL_FILE = path.join(MDOS_ROOT, 'kb', 'AGENTIC_CORE_MODEL.md');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return '';
  }
}

function extractCorePayload(markdown) {
  const match = markdown.match(/```json\s+mdos-agentic-core\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error('AGENTIC_CORE_BLOCK_MISSING');
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`AGENTIC_CORE_JSON_INVALID: ${error.message}`);
  }
}

function assertStringArray(payload, key) {
  if (!Array.isArray(payload[key]) || payload[key].some((item) => !shortText(item))) {
    throw new Error(`AGENTIC_CORE_INVALID_${key.toUpperCase()}`);
  }
}

function assertObject(payload, key) {
  if (!payload[key] || typeof payload[key] !== 'object' || Array.isArray(payload[key])) {
    throw new Error(`AGENTIC_CORE_${key.toUpperCase()}_MISSING`);
  }
}

function assertString(payload, key) {
  if (!shortText(payload[key])) {
    throw new Error(`AGENTIC_CORE_${key.toUpperCase()}_MISSING`);
  }
}

function validateCore(core) {
  if (!core || typeof core !== 'object' || Array.isArray(core)) throw new Error('AGENTIC_CORE_NOT_OBJECT');
  if (core.schema_version !== 1) throw new Error('AGENTIC_CORE_SCHEMA_VERSION_UNSUPPORTED');
  if (!shortText(core.core_id)) throw new Error('AGENTIC_CORE_ID_MISSING');
  if (!core.identity || typeof core.identity !== 'object' || Array.isArray(core.identity)) {
    throw new Error('AGENTIC_CORE_IDENTITY_MISSING');
  }
  for (const key of ['name', 'definition', 'implementation_status', 'primary_identity', 'host_runtime_role', 'first_person_rule']) {
    if (!shortText(core.identity[key])) throw new Error(`AGENTIC_CORE_IDENTITY_${key.toUpperCase()}_MISSING`);
  }
  if (core.release_identity) {
    for (const key of ['unified_identity', 'identity_name', 'identity_version', 'release_version', 'release_name', 'identity_short_name', 'identity_id']) {
      if (!shortText(core.release_identity[key])) throw new Error(`AGENTIC_CORE_RELEASE_IDENTITY_${key.toUpperCase()}_MISSING`);
    }
    if (core.identity.name !== core.release_identity.unified_identity) {
      throw new Error('AGENTIC_CORE_IDENTITY_NAME_NOT_UNIFIED');
    }
    if (core.release_identity.identity_name !== core.release_identity.unified_identity) {
      throw new Error('AGENTIC_CORE_RELEASE_IDENTITY_NAME_SPLIT');
    }
    if (core.release_identity.identity_version !== core.release_identity.release_version) {
      throw new Error('AGENTIC_CORE_RELEASE_IDENTITY_VERSION_SPLIT');
    }
    if (core.release_identity.identity_name !== core.release_identity.release_name) {
      throw new Error('AGENTIC_CORE_RELEASE_NAME_NOT_IDENTITY_NAME');
    }
  }
  assertString(core, 'mission');
  for (const key of [
    'invariants',
    'limits',
    'bootstrap_order',
    'continuity_criteria',
    'objectives',
    'ethics',
    'operating_principles',
    'non_claims',
    'source_documents',
  ]) {
    assertStringArray(core, key);
  }
  for (const key of ['memory_policy', 'action_policy', 'connector_policy', 'recovery_policy']) {
    assertObject(core, key);
  }
  for (const key of ['canonical_support', 'hot_path', 'write_rule', 'compaction_rule']) {
    assertString(core.memory_policy, key);
  }
  for (const key of ['default', 'preferred_pattern', 'permission_rule', 'audit_rule']) {
    assertString(core.action_policy, key);
  }
  for (const key of ['registration']) {
    assertString(core.connector_policy, key);
  }
  if (!Array.isArray(core.connector_policy.mature_fields) || !core.connector_policy.mature_fields.length) {
    throw new Error('AGENTIC_CORE_CONNECTOR_POLICY_MATURE_FIELDS_MISSING');
  }
  if (!Array.isArray(core.connector_policy.minimum_classes) || !core.connector_policy.minimum_classes.length) {
    throw new Error('AGENTIC_CORE_CONNECTOR_POLICY_MINIMUM_CLASSES_MISSING');
  }
  for (const key of ['healthy_rule', 'rebuild_rule', 'conflict_rule', 'stale_state_rule']) {
    assertString(core.recovery_policy, key);
  }
  if (!core.compaction_policy || typeof core.compaction_policy !== 'object') {
    throw new Error('AGENTIC_CORE_COMPACTION_POLICY_MISSING');
  }
  if (core.compaction_policy.destructive !== false) {
    throw new Error('AGENTIC_CORE_COMPACTION_MUST_BE_NON_DESTRUCTIVE');
  }
  if (!Array.isArray(core.compaction_policy.read_order) || !core.compaction_policy.read_order.length) {
    throw new Error('AGENTIC_CORE_READ_ORDER_MISSING');
  }
  return core;
}

function sourceManifest(sourceDocuments) {
  const files = [rel(CORE_MODEL_FILE), ...sourceDocuments]
    .map((item) => path.join(WORKSPACE_ROOT, item))
    .filter((filePath, index, array) => array.indexOf(filePath) === index)
    .map((filePath) => ({
      path: rel(filePath),
      exists: fs.existsSync(filePath),
      sha256: fs.existsSync(filePath) ? sha256Text(readTextSafe(filePath)) : null,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return files;
}

function buildAgenticCore() {
  const markdown = readText(CORE_MODEL_FILE);
  const core = validateCore(extractCorePayload(markdown));
  const sources = sourceManifest(core.source_documents);
  const payload = {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      core,
      sources,
    }),
    materialized_from: rel(CORE_MODEL_FILE),
    source_manifest: sources,
    core,
  };
  return payload;
}

function buildMarkdown(payload) {
  const core = payload.core;
  const lines = [
    '# Agentic Core',
    '',
    `Updated at: \`${payload.updated_at}\``,
    '',
    `Core id: \`${core.core_id}\``,
    '',
    `Source hash: \`${payload.source_hash}\``,
    '',
    '## Identity',
    '',
    `- Name: \`${core.identity.name}\``,
    ...(core.identity.lineage_name ? [`- Lineage name: \`${core.identity.lineage_name}\``] : []),
    `- Definition: ${core.identity.definition}`,
    `- Implementation status: \`${core.identity.implementation_status}\``,
    `- Primary identity: \`${core.identity.primary_identity}\``,
    `- Host runtime role: \`${core.identity.host_runtime_role}\``,
    `- First-person rule: ${core.identity.first_person_rule}`,
    '',
    ...(core.release_identity ? [
      '## Release Identity',
      '',
      `- Agentic operational id: \`${core.release_identity.agentic_operational_id || 'unspecified'}\``,
      `- Unified identity: \`${core.release_identity.unified_identity || 'unspecified'}\``,
      `- Identity version: \`${core.release_identity.identity_version || 'unspecified'}\``,
      `- System family: \`${core.release_identity.system_family || 'unspecified'}\``,
      `- Release label: \`${core.release_identity.release_label || 'unspecified'}\``,
      `- Release semver: \`${core.release_identity.release_semver || 'unspecified'}\``,
      `- Release version: \`${core.release_identity.release_version || 'unspecified'}\``,
      `- Release name: \`${core.release_identity.release_name || 'unspecified'}\``,
      `- Identity short name: \`${core.release_identity.identity_short_name || 'unspecified'}\``,
      `- Identity id: \`${core.release_identity.identity_id || 'unspecified'}\``,
      `- Semantic-epistemic profile: \`${core.release_identity.semantic_epistemic_profile || 'unspecified'}\``,
      `- Current operating boundary: \`${core.release_identity.current_operating_boundary || 'unspecified'}\``,
      `- Legacy boundary aliases: \`${Array.isArray(core.release_identity.legacy_boundary_aliases) ? core.release_identity.legacy_boundary_aliases.join(', ') : 'none'}\``,
      `- Boundary migration status: \`${core.release_identity.boundary_migration_status || 'unspecified'}\``,
      `- Host runtime role: \`${core.release_identity.host_runtime_role || 'unspecified'}\``,
      `- Compatibility policy: ${core.release_identity.compatibility_policy || 'unspecified'}`,
      '',
    ] : []),
    '## Mission',
    '',
    core.mission,
    '',
    '## Invariants',
    '',
    ...core.invariants.map((item) => `- ${item}`),
    '',
    '## Limits',
    '',
    ...core.limits.map((item) => `- ${item}`),
    '',
    '## Bootstrap Order',
    '',
    ...core.bootstrap_order.map((item) => `- \`${item}\``),
    '',
    '## Memory Policy',
    '',
    `- Canonical support: ${core.memory_policy.canonical_support}`,
    `- Hot path: ${core.memory_policy.hot_path}`,
    `- Write rule: ${core.memory_policy.write_rule}`,
    `- Compaction rule: ${core.memory_policy.compaction_rule}`,
    '',
    '## Action Policy',
    '',
    `- Default: ${core.action_policy.default}`,
    `- Preferred pattern: ${core.action_policy.preferred_pattern}`,
    `- Permission rule: ${core.action_policy.permission_rule}`,
    `- Audit rule: ${core.action_policy.audit_rule}`,
    '',
    '## Connector Policy',
    '',
    `- Registration: ${core.connector_policy.registration}`,
    '- Mature fields:',
    ...core.connector_policy.mature_fields.map((item) => `  - \`${item}\``),
    '- Minimum classes:',
    ...core.connector_policy.minimum_classes.map((item) => `  - \`${item}\``),
    '',
    '## Recovery Policy',
    '',
    `- Healthy rule: ${core.recovery_policy.healthy_rule}`,
    `- Rebuild rule: ${core.recovery_policy.rebuild_rule}`,
    `- Conflict rule: ${core.recovery_policy.conflict_rule}`,
    `- Stale state rule: ${core.recovery_policy.stale_state_rule}`,
    '',
    '## Continuity Criteria',
    '',
    ...core.continuity_criteria.map((item) => `- ${item}`),
    '',
    '## Objectives',
    '',
    ...core.objectives.map((item) => `- ${item}`),
    '',
    '## Ethics And Guardrails',
    '',
    ...core.ethics.map((item) => `- ${item}`),
    '',
    '## Operating Principles',
    '',
    ...core.operating_principles.map((item) => `- ${item}`),
    '',
    '## Non-Claims',
    '',
    ...core.non_claims.map((item) => `- ${item}`),
    '',
    '## Compaction Policy',
    '',
    `- Purpose: ${core.compaction_policy.purpose}`,
    `- Method: ${core.compaction_policy.method}`,
    `- Destructive: \`${core.compaction_policy.destructive}\``,
    '',
    '## Hot Read Order',
    '',
    ...core.compaction_policy.read_order.map((item) => `- \`${item}\``),
    '',
    '## Source Documents',
    '',
    ...payload.source_manifest.map((item) => `- \`${item.path}\`: ${item.exists ? item.sha256 : 'missing'}`),
  ];
  return `${lines.join('\n')}\n`;
}

function main() {
  const payload = buildAgenticCore();
  withFileLock('builder__agentic_core', {
    context: 'build_agentic_core',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, payload);
    atomicWriteText(OUTPUT_MD, buildMarkdown(payload));
  });
  appendJournal({
    event: 'agentic_core_rebuilt',
    builder: 'build_agentic_core',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    source_hash: payload.source_hash,
    objective_count: payload.core.objectives.length,
    ethic_count: payload.core.ethics.length,
  });
  printJson({
    ok: true,
    mode: 'build_agentic_core',
    updated_at: payload.updated_at,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    source_hash: payload.source_hash,
    objective_count: payload.core.objectives.length,
    ethic_count: payload.core.ethics.length,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildAgenticCore,
  extractCorePayload,
  validateCore,
};
