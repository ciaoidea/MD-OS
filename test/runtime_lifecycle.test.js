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
  return fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-lifecycle-'));
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

test('runtime lifecycle index classifies source, generated, local, demo, and live files', () => {
  const workspace = makeWorkspace();
  fs.mkdirSync(path.join(workspace, 'md-os/kb'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/examples/connectors'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Demo\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/kb/README.md'), '# KB\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/examples/connectors/demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/global_index.md'), '# Index\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/semantic/commitment_decisions'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/semantic/commitment_gate_status.md'), '# Semantic Gate\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/semantic/commitment_decisions/semdec_0123456789abcdef01234567.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/releases/self/proposals'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/releases/self/proposals/mdos_5_1_test.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/releases/self_release_index.md'), '# Self Release\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/imports/knowledge/demo_import/extracted'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/imports/knowledge/demo_import/manifest.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/imports/knowledge/demo_import/readback.md'), '# Import Readback\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/imports/knowledge/demo_import/extracted/knowledge_extract.md'), '# Extract\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/apfc'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/apfc/README.md'), '# APFC\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/apfc/cognitive/frames'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/apfc/executive/history'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/cognitive/apfc_cognitive_status.md'), '# APFC Cognitive Status\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/cognitive/frames/frame_demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/executive/history/apfcg_demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/executive/last_valid_graph.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/executive/live_graph.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/apfc/executive/live_status.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/tasks'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/action_receipts'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/verifications'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/tasks/task_demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/action_receipts/receipt_demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/verifications/verification_demo.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/benchmarks/software_repair/cases'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/benchmarks/software_repair/cases/demo.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/index.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/benchmark_run.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/candidate_demo.diff'), 'diff\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/benchmark_case_snapshot.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/provider_evidence'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/provider_evidence/plan_demo.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/candidate_sets/provider_run_demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/benchmarks/software_repair/candidate_sets/provider_run_demo/provider_receipt.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/journal.ndjson'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'graphify-out/cache'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'graphify-out/orientation.md'), '# Orientation\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'graphify-out/cache/stat-index.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/agi/generality_experiments/demo'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/agi/learning_experiments/demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/generality_experiments/demo/report.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/learning_experiments/demo/report.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/neuromorphic_learning_status.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/apfc_causal_learning_status.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/skills/history/skill_demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/skills/history/skill_demo/receipt_demo.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/agi/sal/external_reports'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/sal/score.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/sal/source_manifest.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/sal/external_evaluation_request.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/sal/internal_real_world_evidence.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/agi/sal/external_reports/report.json'), '{}\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/experiments/contextual_feeling/context_demo'), { recursive: true });
  fs.mkdirSync(path.join(workspace, 'md-os/ops/experiments/reflective/reflection_demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/experiments/contextual_feeling/context_demo/report.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/experiments/contextual_feeling/context_demo/report.md'), '# Context report\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/experiments/reflective/reflection_demo/report.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'md-os/ops/experiments/reflective/reflection_demo/report.md'), '# Reflection report\n', 'utf8');
  fs.mkdirSync(path.join(workspace, 'md-os/ops/toe/campaigns/toe_demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/toe/campaigns/toe_demo/closure_register.json'), '{}\n', 'utf8');
  fs.writeFileSync(path.join(workspace, '.mdosignore'), 'md-os/ops/\ngraphify-out/\n', 'utf8');

  const result = runScript(workspace, 'build_runtime_lifecycle_index.js');
  assert.equal(result.status, 0, result.stderr);

  const index = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime_lifecycle_index.json'), 'utf8'));
  const byPath = new Map(index.files.map((file) => [file.path, file]));
  assert.equal(byPath.get('README.md').lifecycle_class, 'source');
  assert.equal(byPath.get('md-os/examples/connectors/demo.json').lifecycle_class, 'demo');
  assert.equal(byPath.get('md-os/ops/global_index.md').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/semantic/commitment_gate_status.md').owner, 'build_semantic_commitment_gate');
  assert.equal(byPath.get('md-os/ops/semantic/commitment_decisions/semdec_0123456789abcdef01234567.json').scope, 'live_semantic_commitment_decision');
  assert.equal(byPath.get('md-os/ops/releases/self_release_index.md').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/releases/self/proposals/mdos_5_1_test.json').lifecycle_class, 'source');
  assert.equal(byPath.get('md-os/ops/releases/self/proposals/mdos_5_1_test.json').owner, 'self_release_proposal');
  assert.equal(byPath.get('md-os/ops/imports/knowledge/demo_import/manifest.json').lifecycle_class, 'source');
  assert.equal(byPath.get('md-os/ops/imports/knowledge/demo_import/readback.md').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/imports/knowledge/demo_import/extracted/knowledge_extract.md').owner, 'build_knowledge_import');
  assert.equal(byPath.get('md-os/apfc/README.md').lifecycle_class, 'source');
  assert.equal(byPath.get('md-os/ops/apfc/cognitive/apfc_cognitive_status.md').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/apfc/cognitive/frames/frame_demo.json').lifecycle_class, 'live');
  assert.equal(byPath.get('md-os/ops/apfc/executive/history/apfcg_demo.json').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/apfc/executive/last_valid_graph.json').owner, 'build_apfc_graph');
  assert.equal(byPath.get('md-os/ops/apfc/executive/live_graph.json').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/apfc/executive/live_status.json').owner, 'build_apfc_graph');
  assert.equal(byPath.get('md-os/ops/tasks/task_demo.json').owner, 'cognitive_task_compiler');
  assert.equal(byPath.get('md-os/ops/action_receipts/receipt_demo.json').owner, 'cognitive_transaction_executor');
  assert.equal(byPath.get('md-os/ops/verifications/verification_demo.json').owner, 'cognitive_postcondition_verifier');
  assert.equal(byPath.get('md-os/benchmarks/software_repair/cases/demo.json').lifecycle_class, 'source');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/index.json').owner, 'build_software_repair_benchmark_index');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/benchmark_run.json').owner, 'software_repair_benchmark_runner');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/candidate_demo.diff').scope, 'live_benchmark_evidence');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/benchmark_case_snapshot.json').owner, 'software_repair_benchmark_runner');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/runs/benchmark_run_demo/provider_evidence/plan_demo.json').scope, 'live_provider_evidence_snapshot');
  assert.equal(byPath.get('md-os/ops/benchmarks/software_repair/candidate_sets/provider_run_demo/provider_receipt.json').owner, 'benchmark_candidate_provider');
  assert.equal(byPath.get('md-os/ops/journal.ndjson').lifecycle_class, 'live');
  assert.equal(byPath.get('graphify-out/orientation.md').lifecycle_class, 'generated');
  assert.equal(byPath.get('graphify-out/orientation.md').scope, 'generated_graphify_readback');
  assert.equal(byPath.get('graphify-out/cache/stat-index.json').lifecycle_class, 'local');
  assert.equal(byPath.get('graphify-out/cache/stat-index.json').scope, 'host_local_graphify_cache');
  assert.equal(byPath.get('md-os/ops/agi/generality_experiments/demo/report.json').scope, 'live_agi_generality_evidence');
  assert.equal(byPath.get('md-os/ops/agi/learning_experiments/demo/report.json').scope, 'live_neuromorphic_learning_evidence');
  assert.equal(byPath.get('md-os/ops/agi/neuromorphic_learning_status.json').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/agi/apfc_causal_learning_status.json').owner, 'run_apfc_causal_learning_experiment');
  assert.equal(byPath.get('md-os/ops/skills/history/skill_demo/receipt_demo.json').scope, 'immutable_skill_governance_history');
  assert.equal(byPath.get('md-os/ops/agi/sal/score.json').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/agi/sal/source_manifest.json').owner, 'agi_sal_evaluator');
  assert.equal(byPath.get('md-os/ops/agi/sal/external_evaluation_request.json').lifecycle_class, 'generated');
  assert.equal(byPath.get('md-os/ops/agi/sal/internal_real_world_evidence.json').scope, 'live_agi_sal_internal_evidence');
  assert.equal(byPath.get('md-os/ops/agi/sal/external_reports/report.json').scope, 'live_agi_sal_external_evidence');
  assert.equal(byPath.get('md-os/ops/experiments/contextual_feeling/context_demo/report.json').owner, 'contextual_feeling_experiment');
  assert.equal(byPath.get('md-os/ops/experiments/contextual_feeling/context_demo/report.md').scope, 'live_contextual_feeling_experiment_evidence');
  assert.equal(byPath.get('md-os/ops/experiments/reflective/reflection_demo/report.json').owner, 'reflective_operation');
  assert.equal(byPath.get('md-os/ops/experiments/reflective/reflection_demo/report.md').scope, 'live_reflective_experiment_evidence');
  assert.equal(byPath.get('md-os/ops/toe/campaigns/toe_demo/closure_register.json').lifecycle_class, 'live');
  assert.equal(byPath.get('md-os/ops/toe/campaigns/toe_demo/closure_register.json').owner, 'toe_research_campaign');
  assert.equal(byPath.get('md-os/ops/toe/campaigns/toe_demo/closure_register.json').scope, 'live_theoretical_research_evidence');
  assert.equal(index.finding_count, 0);
});

test('runtime lifecycle index ignores nested .cache workspaces', () => {
  const workspace = makeWorkspace();
  fs.mkdirSync(path.join(workspace, '.cache/demo'), { recursive: true });
  fs.writeFileSync(path.join(workspace, '.cache/demo/README.md'), '# Cached demo\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'README.md'), '# Root\n', 'utf8');

  const result = runScript(workspace, 'build_runtime_lifecycle_index.js');
  assert.equal(result.status, 0, result.stderr);

  const index = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/runtime_lifecycle_index.json'), 'utf8'));
  assert.ok(!index.files.some((file) => file.path.startsWith('.cache/')));
  assert.ok(index.files.some((file) => file.path === 'README.md'));
});
