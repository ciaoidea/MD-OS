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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-health-classifier-'));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function writeText(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, 'utf8');
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

function setupOkRuntimeInputs(workspace) {
  writeJson(path.join(workspace, 'md-os/ops/global_index.json'), {
    schema_version: 1,
    source_hash: 'global',
    ops: { project_count: 1 },
  });
  writeJson(path.join(workspace, 'md-os/ops/runtime_lifecycle_index.json'), {
    schema_version: 1,
    source_hash: 'lifecycle',
    status: 'ok',
    finding_count: 0,
  });
  writeJson(path.join(workspace, 'md-os/ops/markdown_graph.json'), {
    schema_version: 1,
    source_hash: 'markdown',
    status: 'ok',
    explicit_orphan_count: 0,
    structural_isolated_count: 0,
  });
  writeJson(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), {
    schema_version: 1,
    source_hash: 'semantic',
    status: 'ok',
    semantic_profile_complete: true,
    epistemic_profile_complete: true,
    findings: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/semantic/commitment_gate_status.json'), {
    schema_version: 1,
    source_hash: 'semantic-commitment',
    status: 'ok',
    invariant_count: 7,
    finding_count: 0,
    findings: [],
    release_gate: {
      canonical_promotion_blocked: false,
      publication_blocked: false,
      challenge_registration_blocked: false,
    },
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    source_hash: 'self-release',
    status: 'ok',
    readback_status: 'ok',
    current_release: { release_semver: '5.0.0' },
    proposal_count: 0,
  });
  writeJson(path.join(workspace, 'md-os/ops/agi/loop_status.json'), {
    schema_version: 1,
    source_hash: 'agi',
    status: 'ok',
    metrics: { episode_count: 0, success_rate: 0, regression_count: 0 },
  });
  writeJson(path.join(workspace, 'md-os/ops/evals/agi_eval_report.json'), {
    schema_version: 1,
    source_hash: 'agi-eval',
    status: 'ok',
    metrics: { success_rate: 0, regression_count: 0 },
  });
  writeJson(path.join(workspace, 'md-os/ops/apfc/executive/status.json'), {
    schema_version: 1,
    updated_at: '2026-08-13T00:00:00Z',
    status: 'ok',
    active_graph_id: 'apfcg_0123456789abcdef',
    active_graph_hash: 'a'.repeat(64),
    counts: {
      sources: 1,
      nodes: 1,
      edges: 0,
      critical_findings: 0,
    },
    release_gate: { runtime_operable: true },
  });
  writeJson(path.join(workspace, 'md-os/ops/skills/skill_registry.json'), {
    schema_version: 1,
    source_hash: 'skills',
    promoted_skill_count: 0,
    candidate_skill_count: 0,
  });
  writeJson(path.join(workspace, 'md-os/ops/runtime/semantic_operational_compiler.json'), {
    schema_version: 1,
    source_hash: 'compiler',
    status: 'ok',
    counts: { semantic_nodes: 1, claims: 1, capabilities: 1, links: 1, context_packs: 1, epistemic_findings: 0 },
  });
  writeJson(path.join(workspace, 'md-os/ops/runtime/epistemic_health.json'), {
    schema_version: 1,
    source_hash: 'runtime-epistemic',
    status: 'ok',
    findings: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/core/agentic_core.json'), {
    schema_version: 1,
    source_hash: 'core',
    core: { core_id: 'test_core' },
  });
  writeJson(path.join(workspace, 'md-os/ops/replay_report.json'), {
    schema_version: 1,
    replay_hash: 'stable',
    matched_before: true,
  });
  writeText(path.join(workspace, 'md-os/ops/journal.ndjson'), '');
}

test('health classifier separates runtime ok from publication, security, and local blockers', () => {
  const workspace = makeWorkspace();
  setupOkRuntimeInputs(workspace);
  writeJson(path.join(workspace, 'md-os/ops/system_hygiene_status.json'), {
    schema_version: 1,
    source_hash: 'hygiene',
    overall_status: 'critical',
    cleanliness: {
      status: 'ok',
      spurious_kb_file_count: 0,
      zero_byte_file_count: 0,
      exact_content_duplicate_groups: 0,
      logical_merge_candidate_groups: 0,
      spurious_kb_files: [],
      zero_byte_files: [],
    },
    efficiency: {
      status: 'ok',
      secondary_obsidian_file_count: 0,
      top_logical_merge_candidates: [],
    },
    stability: {
      status: 'ok',
      missing_required_files: [],
    },
    publication: {
      status: 'critical',
      local_path_file_count: 0,
      host_local_hardware_file_count: 1,
      host_local_software_file_count: 1,
      ops_artifact_file_count: 0,
      pdf_file_count: 1,
      authorized_elevated_launcher_count: 1,
      unsafe_script_count: 1,
      permissive_config_count: 0,
      local_path_files: [],
      host_local_hardware_files: ['md-os/ops/local/hardware/inventory.md'],
      host_local_software_files: ['md-os/ops/local/software/applications.json'],
      ops_artifact_files: [],
      pdf_files: ['docs/papers/example.pdf'],
      authorized_elevated_launchers: [{ path: 'bootstrap-md-os-codex.sh' }],
      unsafe_scripts: ['session-recovery.sh'],
      permissive_configs: [],
    },
  });

  const result = runScript(workspace, 'build_health_classifier.js');
  assert.equal(result.status, 0, result.stderr);
  const classification = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/health_classification.json'), 'utf8'));

  assert.equal(classification.health.runtime_health.status, 'ok');
  assert.equal(classification.health.compiler_health.status, 'ok');
  assert.equal(classification.health.agi_loop_health.status, 'ok');
  assert.equal(classification.health.semantic_integrity_health.status, 'ok');
  assert.equal(classification.health.publication_health.status, 'critical');
  assert.equal(classification.health.security_health.status, 'critical');
  assert.equal(classification.health.local_hygiene_health.status, 'critical');
  assert.equal(classification.release_gate.runtime_operable, true);
  assert.equal(classification.release_gate.publishable, false);
  assert.equal(classification.release_gate.release_blocked, true);
  assert.equal(classification.release_gate.security_blocked, true);
  assert.ok(classification.findings.some((finding) => finding.finding_id === 'unsafe_scripts' && finding.security_blocking));
  assert.ok(classification.findings.some((finding) => finding.finding_id === 'host_local_hardware_files' && finding.local_only));
  assert.ok(!classification.findings.some((finding) => finding.finding_id === 'authorized_elevated_launchers'));
});

test('health classifier keeps a validated elevated launcher visible but non-degrading', () => {
  const workspace = makeWorkspace();
  setupOkRuntimeInputs(workspace);
  writeJson(path.join(workspace, 'md-os/ops/system_hygiene_status.json'), {
    schema_version: 1,
    source_hash: 'hygiene',
    overall_status: 'ok',
    cleanliness: {
      status: 'ok',
      spurious_kb_file_count: 0,
      zero_byte_file_count: 0,
      exact_content_duplicate_groups: 0,
      logical_merge_candidate_groups: 0,
      spurious_kb_files: [],
      zero_byte_files: [],
    },
    efficiency: {
      status: 'ok',
      secondary_obsidian_file_count: 0,
      top_logical_merge_candidates: [],
    },
    stability: { status: 'ok', missing_required_files: [] },
    publication: {
      status: 'ok',
      local_path_file_count: 0,
      host_local_hardware_file_count: 0,
      host_local_software_file_count: 0,
      ops_artifact_file_count: 0,
      pdf_file_count: 0,
      authorized_elevated_launcher_count: 1,
      unsafe_script_count: 0,
      permissive_config_count: 0,
      local_path_files: [],
      host_local_hardware_files: [],
      host_local_software_files: [],
      ops_artifact_files: [],
      pdf_files: [],
      authorized_elevated_launchers: [{ path: 'bootstrap-md-os-codex.sh' }],
      unsafe_scripts: [],
      permissive_configs: [],
    },
  });

  const result = runScript(workspace, 'build_health_classifier.js');
  assert.equal(result.status, 0, result.stderr);
  const classification = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/health_classification.json'), 'utf8'));

  assert.equal(classification.status, 'ok');
  assert.equal(classification.health.security_health.status, 'ok');
  assert.equal(classification.release_gate.runtime_operable, true);
  assert.equal(classification.release_gate.publishable, true);
  assert.equal(classification.finding_summary.finding_count, 0);
});

test('health classifier does not treat inherited global health critical as runtime failure', () => {
  const workspace = makeWorkspace();
  setupOkRuntimeInputs(workspace);
  writeJson(path.join(workspace, 'md-os/ops/system_hygiene_status.json'), {
    schema_version: 1,
    source_hash: 'hygiene',
    overall_status: 'critical',
    cleanliness: {
      status: 'ok',
      spurious_kb_file_count: 0,
      zero_byte_file_count: 0,
      exact_content_duplicate_groups: 0,
      logical_merge_candidate_groups: 0,
      spurious_kb_files: [],
      zero_byte_files: [],
    },
    efficiency: {
      status: 'ok',
      secondary_obsidian_file_count: 0,
      top_logical_merge_candidates: [],
    },
    stability: {
      status: 'ok',
      missing_required_files: [],
    },
    publication: {
      status: 'critical',
      local_path_file_count: 0,
      host_local_hardware_file_count: 0,
      host_local_software_file_count: 0,
      ops_artifact_file_count: 0,
      pdf_file_count: 0,
      authorized_elevated_launcher_count: 0,
      unsafe_script_count: 1,
      permissive_config_count: 0,
      local_path_files: [],
      host_local_hardware_files: [],
      host_local_software_files: [],
      ops_artifact_files: [],
      pdf_files: [],
      authorized_elevated_launchers: [],
      unsafe_scripts: ['session-recovery.sh'],
      permissive_configs: [],
    },
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), {
    schema_version: 1,
    source_hash: 'self-release',
    status: 'attention',
    readback_status: 'critical',
    compact_readback: { health_status: 'critical' },
    current_release: { release_semver: '5.0.0' },
    proposal_count: 0,
    findings: [],
  });

  const result = runScript(workspace, 'build_health_classifier.js');
  assert.equal(result.status, 0, result.stderr);
  const classification = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/health_classification.json'), 'utf8'));

  assert.equal(classification.health.runtime_health.status, 'ok');
  assert.equal(classification.release_gate.runtime_operable, true);
  assert.ok(classification.findings.some((finding) => finding.finding_id === 'self_release_inherited_global_health_critical'));
});
