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
  const hotReadOrder = core.compaction_policy.read_order.slice(0, 6);
  return [
    '# Agentic Core',
    '',
    `Updated at: \`${payload.updated_at}\``,
    `Core id: \`${core.core_id}\``,
    `Source hash: \`${payload.source_hash}\``,
    '',
    '## Identity',
    '',
    `- Name: \`${core.identity.name}\``,
    `- Definition: ${core.identity.definition}`,
    `- Host runtime role: \`${core.identity.host_runtime_role}\``,
    `- First-person rule: ${core.identity.first_person_rule}`,
    '',
    '## Mission',
    '',
    core.mission,
    '',
    '## Hot Invariants',
    '',
    ...core.invariants.slice(0, 6).map((item) => `- ${item}`),
    '',
    '## Limits',
    '',
    ...core.limits.map((item) => `- ${item}`),
    '',
    '## Action And Memory',
    '',
    `- Memory: ${core.memory_policy.hot_path}`,
    `- Action: ${core.action_policy.preferred_pattern}`,
    `- Permission: ${core.action_policy.permission_rule}`,
    `- Recovery: ${core.recovery_policy.healthy_rule}`,
    '',
    '## Current Objectives',
    '',
    ...core.objectives.slice(0, 5).map((item) => `- ${item}`),
    '',
    '## Essential Guardrails',
    '',
    ...core.ethics.slice(0, 6).map((item) => `- ${item}`),
    ...core.non_claims.slice(0, 4).map((item) => `- ${item}`),
    '',
    '## Conditional Read Order',
    '',
    ...hotReadOrder.map((item) => `- \`${item}\``),
    '',
    'The complete validated core remains available in `agentic_core.json`; load detailed canonical models only when the task requires them.',
    '',
  ].join('\n');
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
