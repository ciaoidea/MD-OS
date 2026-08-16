#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');

function makeWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-health-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function runScript(workspaceRoot, scriptName) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os', scriptName)], {
    cwd: workspaceRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspaceRoot,
      MDOS_ROOT: path.join(workspaceRoot, 'md-os'),
    },
  });
}

test('health dashboard summarizes hygiene, lifecycle, connectors, and journal', () => {
  const workspace = makeWorkspace();
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  writeJson(path.join(workspace, 'md-os/ops/global_index.json'), {
    schema_version: 1,
    source_hash: 'global',
    ops: { project_count: 1, source_channel_count: 1, active_work_item_count: 2, terminal_work_item_count: 0 },
  });
  writeJson(path.join(workspace, 'md-os/ops/system_hygiene_status.json'), {
    schema_version: 1,
    source_hash: 'hygiene',
    overall_status: 'ok',
    stability: { missing_required_files: [] },
    publication: { status: 'ok' },
  });
  writeJson(path.join(workspace, 'md-os/ops/health_classification.json'), {
    schema_version: 1,
    source_hash: 'health-classification',
    status: 'ok',
    health: {
      runtime_health: { status: 'ok', finding_count: 0 },
      compiler_health: { status: 'ok', finding_count: 0 },
      agi_loop_health: { status: 'ok', finding_count: 0 },
      publication_health: { status: 'ok', finding_count: 0 },
      security_health: { status: 'ok', finding_count: 0 },
      local_hygiene_health: { status: 'ok', finding_count: 0 },
    },
    release_gate: {
      runtime_operable: true,
      runtime_blocked: false,
      publishable: true,
      release_blocked: false,
      publication_blocked: false,
      security_blocked: false,
      local_only_blocked: false,
    },
    finding_summary: { finding_count: 0 },
    findings: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/runtime_lifecycle_index.json'), {
    schema_version: 1,
    source_hash: 'lifecycle',
    status: 'ok',
    file_count: 10,
    finding_count: 0,
    class_counts: { source: 5, generated: 5 },
  });
  writeJson(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), {
    schema_version: 1,
    source_hash: 'semantic',
    status: 'ok',
    markdown_node_count: 10,
    profiled_node_count: 10,
    epistemic_profiled_node_count: 10,
    semantic_profile_complete: true,
    epistemic_profile_complete: true,
    semantic_edge_count: 20,
    cross_layer_edge_count: 4,
    concept_count: 30,
    concept_relation_count: 40,
    disconnected_node_count: 0,
    findings: [],
    top_concepts: [{ term: 'connector', node_count: 2 }],
    top_concept_relations: [{ source_term: 'connector', target_term: 'permission', node_count: 2 }],
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    source_hash: 'self-release',
    status: 'ok',
    readback_status: 'ok',
    current_release: {
      release_label: '5.0',
      release_semver: '5.0.0',
      agentic_operational_id: 'mdos_5_0_artificial_prefrontal_cortex_agentic_operating_filesystem__host_exec__md_os_boundary',
      active_boundary: 'md-os/',
    },
    proposal_count: 0,
    valid_proposal_count: 0,
    findings: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/core/agentic_core.json'), {
    schema_version: 1,
    source_hash: 'core',
    core: {
      core_id: 'test_core',
      identity: { name: 'MD-OS APFC' },
      objectives: ['Keep context readable.'],
      ethics: ['Stay bounded.'],
    },
  });
  writeJson(path.join(workspace, 'md-os/ops/connectors/connector_registry.json'), {
    schema_version: 1,
    registry_name: 'generic_connector_registry',
    connectors: [{ connector_id: 'filesystem_connector', kind: 'filesystem', status: 'ready', implemented: true, risk_level: 'low' }],
  });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/journal.ndjson'), '{"timestamp":"2026-04-26T00:00:00Z","event":"test"}\n', 'utf8');

  const result = runScript(workspace, 'build_health_dashboard.js');
  assert.equal(result.status, 0, result.stderr);
  const health = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/health.json'), 'utf8'));
  assert.equal(health.connectors.connector_count, 1);
  assert.equal(health.lifecycle.status, 'ok');
  assert.equal(health.semantic_knowledge.status, 'ok');
  assert.equal(health.semantic_knowledge.epistemic_profile_complete, true);
  assert.equal(health.semantic_knowledge.concept_relation_count, 40);
  assert.equal(health.self_release.status, 'ok');
  assert.equal(health.self_release.release_semver, '5.0.0');
  assert.equal(health.health_classification.runtime_health.status, 'ok');
  assert.equal(health.health_classification.release_gate.publishable, true);
  assert.equal(health.agentic_core.core_id, 'test_core');
  assert.equal(health.journal.last_event.event, 'test');
});
