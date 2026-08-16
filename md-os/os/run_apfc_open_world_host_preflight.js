#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { MDOS_ROOT, nowIso, printJson, sha256Json } = require('./lib/common');
const { atomicWriteJson, ensureDir } = require('./lib/fs_runtime');
const {
  DEFAULT_COMMON_TEST_DEPENDENCIES,
  HOST_BACKEND_ID,
  preflightHostTask,
  runHostCodexCanary,
} = require('../kernel/cognition/apfc_open_world_host_backend');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

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
  const preflightId = options.preflight_id || 'apfc_no_tool_backend_preflight_20260814_v1';
  const taskId = options.task_id || 'pypa__twine-1309';
  const model = options.model || 'gpt-5.4';
  const sourceDir = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments', sourceId);
  const sourceVault = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_open_world_vault', sourceId);
  const outputDir = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments', preflightId);
  const privateDir = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_open_world_vault', preflightId);
  const labRoot = path.join(MDOS_ROOT, 'ops', 'local', 'apfc_host_labs', preflightId);
  ensureDir(outputDir);
  ensureDir(privateDir);
  ensureDir(labRoot);
  const publicCorpus = readJson(path.join(sourceDir, 'public_corpus.json'));
  const hiddenVault = readJson(path.join(sourceVault, 'verifier_vault.json'));
  const publicTask = publicCorpus.holdout_tasks.find((task) => task.task_id === taskId);
  const hiddenTask = hiddenVault.holdout_tasks.find((task) => task.task_id === taskId);
  if (!publicTask || !hiddenTask) throw new Error(`APFC_HOST_PREFLIGHT_TASK_MISSING:${taskId}`);
  const environmentReceipt = preflightHostTask({
    publicTask,
    hiddenTask,
    labRoot,
    evidenceDir: path.join(privateDir, 'task_environment'),
    dependencySpecs: DEFAULT_COMMON_TEST_DEPENDENCIES,
    installTimeoutMs: Number(options.install_timeout_ms || 600_000),
    testTimeoutMs: Number(options.test_timeout_ms || 600_000),
  });
  let canaryReceipt = null;
  if (environmentReceipt.verified) {
    canaryReceipt = await runHostCodexCanary({
      labRoot,
      evidenceDir: path.join(privateDir, 'codex_canary'),
      model,
      timeoutMs: Number(options.model_timeout_ms || 180_000),
    });
  }
  const receipt = {
    schema_version: 1,
    receipt_type: 'apfc_no_tool_backend_preflight',
    preflight_id: preflightId,
    backend_id: HOST_BACKEND_ID,
    created_at: nowIso(),
    task_id: taskId,
    model,
    task_environment_receipt_hash: environmentReceipt.receipt_hash,
    task_environment_verified: environmentReceipt.verified,
    codex_canary_receipt_hash: canaryReceipt ? canaryReceipt.receipt_hash : null,
    codex_canary_verified: canaryReceipt ? canaryReceipt.verified : false,
    laboratory_empty_after_run: fs.readdirSync(labRoot).length === 0,
    verified: environmentReceipt.verified === true
      && canaryReceipt !== null && canaryReceipt.verified === true
      && fs.readdirSync(labRoot).length === 0,
    claim_boundary: 'This receipt verifies only the host-native execution backend. It is not an APFC learning or model-performance observation.',
  };
  receipt.receipt_hash = sha256Json(receipt);
  atomicWriteJson(path.join(outputDir, 'host_backend_preflight.json'), receipt);
  printJson({ ok: receipt.verified, ...receipt });
  if (!receipt.verified) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
