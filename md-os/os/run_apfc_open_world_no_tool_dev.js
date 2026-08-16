#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MDOS_ROOT, nowIso, printJson, sha256Json } = require('./lib/common');
const { atomicWriteJson, ensureDir } = require('./lib/fs_runtime');
const { buildOnlineMemorySnapshot } = require('../kernel/cognition/apfc_open_world_online_learning');
const { runNoToolTaskCycle } = require('../kernel/cognition/apfc_open_world_no_tool');

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }

function parse(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith('--')) continue;
    options[argv[index].slice(2).replace(/-/g, '_')] = argv[index + 1];
    index += 1;
  }
  return options;
}

async function main() {
  const options = parse(process.argv.slice(2));
  const sourceId = options.source_experiment_id || 'apfc_open_world_verified_online_source_20260814_v3';
  const experimentId = options.experiment_id || 'apfc_no_tool_development_e2e_20260814_v1';
  const taskId = options.task_id || 'tox-dev__tox-3810';
  const model = options.model || 'gpt-5.4';
  const sourceDir = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments', sourceId);
  const sourceVault = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_open_world_vault', sourceId);
  const outputDir = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments', experimentId);
  const privateDir = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_open_world_vault', experimentId);
  const labRoot = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_host_labs', experimentId);
  ensureDir(outputDir); ensureDir(privateDir); ensureDir(labRoot);
  const corpus = readJson(path.join(sourceDir, 'public_corpus.json'));
  const vault = readJson(path.join(sourceVault, 'verifier_vault.json'));
  const skill = readJson(path.join(sourceDir, 'candidate_meta_skill.json'));
  const publicTask = corpus.development_tasks.find((task) => task.task_id === taskId);
  const hiddenTask = vault.development_tasks.find((task) => task.task_id === taskId);
  if (!publicTask || !hiddenTask) throw new Error(`APFC_NO_TOOL_DEVELOPMENT_TASK_MISSING:${taskId}`);
  const snapshot = buildOnlineMemorySnapshot({
    experimentId,
    taskSequence: 1,
    baseSkill: skill,
    episodes: [],
    publicTask,
    createdAt: nowIso(),
  });
  atomicWriteJson(path.join(outputDir, 'memory_snapshot.json'), snapshot);
  const result = await runNoToolTaskCycle({
    experimentId,
    publicTask,
    hiddenTask,
    candidateSkill: skill,
    memorySnapshot: snapshot,
    model,
    labRoot,
    publicTaskDir: path.join(outputDir, 'task'),
    privateTaskDir: path.join(privateDir, 'task'),
    installTimeoutMs: Number(options.install_timeout_ms || 900_000),
    modelTimeoutMs: Number(options.model_timeout_ms || 240_000),
    evaluatorTimeoutMs: Number(options.evaluator_timeout_ms || 900_000),
    contextByteLimit: Number(options.context_byte_limit || 120_000),
    contextFileLimit: Number(options.context_file_limit || 14),
  });
  const readback = {
    schema_version: 1,
    readback_type: 'apfc_no_tool_development_e2e',
    experiment_id: experimentId,
    task_id: taskId,
    model,
    completed_at: nowIso(),
    cycle_receipt_hash: result.cycleReceipt.receipt_hash,
    context_hash: result.repositoryContext.context_hash,
    condition_outcomes: Object.fromEntries(result.receipts.map((receipt) => [receipt.condition, {
      verified_success: receipt.verified_success,
      receipt_hash: receipt.receipt_hash,
      changed_files: receipt.changed_files,
    }])),
    preflight_verified: result.preflight.verified,
    laboratory_disposed: result.cycleReceipt.laboratory_disposed,
    e2e_backend_verified: result.cycleReceipt.verified,
    counted_as_holdout_evidence: false,
    claim_boundary: 'This development task verifies runner mechanics only and is not counted toward the sealed 30-task APFC superiority claim.',
  };
  readback.readback_hash = sha256Json(readback);
  atomicWriteJson(path.join(outputDir, 'readback.json'), readback);
  printJson({ ok: readback.e2e_backend_verified, ...readback });
  if (!readback.e2e_backend_verified) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
