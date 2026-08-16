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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'md-os-self-release-'));
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

test('self-release index validates agentic jump proposals and compact readback', () => {
  const workspace = makeWorkspace();
  writeJson(path.join(workspace, 'package.json'), {
    name: 'md-os-self-release-test',
    version: '5.0.0',
  });
  writeText(path.join(workspace, 'md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md'), [
    '# Agentic Operational Release Model',
    '',
    '```text',
    'mdos_5_0_artificial_prefrontal_cortex_agentic_operating_filesystem__host_exec__md_os_boundary',
    '```',
    '',
    '```json',
    JSON.stringify({
      unified_identity: 'MD-OS APFC',
      identity_name: 'MD-OS APFC',
      identity_version: '5.0',
      repository_release_line: '5.0',
      release_version: '5.0',
      release_id: '5_0',
      release_name: 'MD-OS APFC',
      release_codename: 'MD-OS APFC',
      identity_short_name: 'MD-OS APFC',
      identity_id: 'md_os_apfc',
      identity_profile: 'Bounded executive control plane for verified agentic operations.',
    }, null, 2),
    '```',
    '',
  ].join('\n'));
  writeText(path.join(workspace, 'md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md'), '# Self Release Evolution Model\n');
  writeJson(path.join(workspace, 'md-os/ops/semantic_knowledge_summary.json'), {
    schema_version: 1,
    source_hash: 'semantic',
    status: 'ok',
    markdown_node_count: 12,
    profiled_node_count: 12,
    epistemic_profiled_node_count: 12,
    semantic_profile_complete: true,
    epistemic_profile_complete: true,
  });
  writeJson(path.join(workspace, 'md-os/ops/markdown_graph.json'), {
    schema_version: 1,
    source_hash: 'graph',
    status: 'ok',
    semantic_operational_network: { status: 'ok' },
  });
  writeJson(path.join(workspace, 'md-os/ops/runtime_lifecycle_index.json'), {
    schema_version: 1,
    source_hash: 'lifecycle',
    status: 'ok',
    finding_count: 0,
  });
  writeJson(path.join(workspace, 'md-os/ops/health.json'), {
    schema_version: 1,
    source_hash: 'health',
    status: 'ok',
    missing_required_files: [],
  });
  writeJson(path.join(workspace, 'md-os/ops/replay_report.json'), {
    schema_version: 1,
    replay_hash: 'replay',
    matched_before: true,
  });
  writeJson(path.join(workspace, 'md-os/ops/releases/self/proposals/mdos_5_1_agentic_jump.json'), {
    schema_version: 1,
    release_id: 'mdos_5_1_agentic_jump',
    target_identity_name: 'MD-OS APFC',
    target_identity_version: '5.0',
    target_personality_profile: 'Bounded self-control layer with compact readback.',
    personality_continuity_rule: 'Preserve MD-OS non-claims, boundary, and host/runtime distinction.',
    identity_epistemic_gates: [
      'unified_identity_check',
      'personality_profile_check',
      'first_person_rule_check',
      'non_claim_preservation_check',
    ],
    target_release_label: '5.1',
    target_release_semver: '5.1.0',
    target_release_version: '5.0',
    target_release_name: 'MD-OS APFC',
    release_type: 'agentic_jump',
    status: 'proposed',
    objective: 'Add a bounded self-control layer.',
    improvement_hypothesis: 'A generated release index makes self-evolution reviewable.',
    semantic_epistemic_impact: 'Adds self-release as a semantic-epistemic node with compact readback.',
    scope: ['md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md', 'md-os/os/build_self_release_index.js'],
    non_goals: ['No hidden runtime state.'],
    migration_plan: ['Add model.', 'Add builder.', 'Add tests.'],
    compatibility_policy: 'Existing md-os/ workspaces keep operating; proposals are additive source state.',
    acceptance_criteria: ['Self-release index reports ok.', 'Replay remains deterministic.'],
    required_gates: [
      'npm_run_check',
      'npm_test',
      'build_all',
      'mdos_replay_matched',
      'semantic_knowledge_ok',
      'health_readback',
      'migration_plan',
      'rollback_plan',
    ],
    rollback_plan: ['Demote the proposal to rejected.', 'Remove generated readback by replay.'],
  });

  const result = runScript(workspace, 'build_self_release_index.js');
  assert.equal(result.status, 0, result.stderr);

  const index = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/releases/self_release_index.json'), 'utf8'));
  assert.equal(index.status, 'ok');
  assert.equal(index.readback_status, 'ok');
  assert.equal(index.current_release.release_semver, '5.0.0');
  assert.equal(index.compact_readback.epistemic_profile_complete, true);
  assert.equal(index.proposal_count, 1);
  assert.equal(index.valid_proposal_count, 1);
  assert.equal(index.findings.length, 0);
  assert.equal(index.proposals[0].semantic_epistemic_impact, 'Adds self-release as a semantic-epistemic node with compact readback.');
  assert.ok(fs.existsSync(path.join(workspace, 'md-os/ops/releases/self_release_index.md')));
});
