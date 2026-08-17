#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  WORKSPACE_ROOT,
  canonicalJson,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir } = require('./lib/fs_runtime');
const {
  CONFIGURATIONS,
  STRUCTURAL_FAMILIES,
  averageForgetting,
  emptyMemory,
  evaluateTasks,
  generateTaskPack,
  invokeLearnerWorker,
  loadMemory,
  memoryPaths,
  recordVerifiedEpisode,
  scoreSolveResult,
  solvePublicTask,
} = require('../kernel/cognition/agi_capability_lab');
const {
  PROTOCOL_ID,
  signReport,
  validateExternalReport,
} = require('../kernel/cognition/agi_sal_evaluator');

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex agi evaluator-kit seal --request <external_evaluation_request.json> --output-dir <external_dir> [--seed <secret>] ',
    '  cortex agi evaluator-kit reference-run --sealed-dir <external_dir> --output-dir <external_results_dir>',
    '  cortex agi evaluator-kit keygen --output-dir <external_key_dir> --evaluator-id <id> --organization <name> --key-id <id>',
    '  cortex agi evaluator-kit finalize --bundle <raw_bundle.json> --attestation <attestation.json> --private-key <key.pem> --key-id <id> --output <report.json>',
    '',
  ].join('\n'));
  process.exit(2);
}

function existingAncestor(targetPath) {
  let current = path.resolve(targetPath);
  while (!fs.existsSync(current)) {
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return current;
}

function realpathFuture(targetPath) {
  const resolved = path.resolve(targetPath);
  const ancestor = existingAncestor(resolved);
  const suffix = path.relative(ancestor, resolved);
  return path.resolve(fs.realpathSync.native(ancestor), suffix);
}

function isInsideWorkspace(targetPath) {
  const workspace = fs.realpathSync.native(WORKSPACE_ROOT);
  const resolved = realpathFuture(targetPath);
  const relative = path.relative(workspace, resolved);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertOutsideWorkspace(targetPath, label) {
  const resolved = path.resolve(targetPath);
  if (isInsideWorkspace(resolved)) throw new Error(`${label}_MUST_BE_OUTSIDE_EVALUATED_WORKSPACE`);
  return resolved;
}

function assertEmptyOrMissingDirectory(dirPath, label) {
  if (!fs.existsSync(dirPath)) return;
  if (!fs.statSync(dirPath).isDirectory()) throw new Error(`${label}_NOT_DIRECTORY`);
  if (fs.readdirSync(dirPath).length) throw new Error(`${label}_NOT_EMPTY`);
}

function readJson(filePath, label) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${shortText(error.message)}`);
  }
}

function reconstructTasks(publicManifest, hiddenManifest, split) {
  const publicTasks = publicManifest[`${split}_tasks`];
  const hiddenTasks = hiddenManifest[`${split}_evaluator_only`];
  if (!Array.isArray(publicTasks) || !Array.isArray(hiddenTasks) || publicTasks.length !== hiddenTasks.length) {
    throw new Error(`EVALUATOR_SEALED_${split.toUpperCase()}_MISMATCH`);
  }
  return publicTasks.map((publicTask, index) => ({
    public_task: publicTask,
    evaluator_only: hiddenTasks[index],
  }));
}

function sealTasks(options) {
  const requestPath = path.resolve(options.request || '');
  const outputDir = assertOutsideWorkspace(options.output_dir || '', 'EVALUATOR_SEAL_OUTPUT');
  if (!fs.existsSync(requestPath)) throw new Error('EVALUATOR_REQUEST_NOT_FOUND');
  assertEmptyOrMissingDirectory(outputDir, 'EVALUATOR_SEAL_OUTPUT');
  const request = readJson(requestPath, 'EVALUATOR_REQUEST');
  if (request.request_type !== 'mdos_sal_agi_external_evaluation_request') throw new Error('EVALUATOR_REQUEST_TYPE_INVALID');
  const sourceFrozenAt = Date.parse(request.evaluated_system && request.evaluated_system.source_frozen_at || '');
  if (!Number.isFinite(sourceFrozenAt)) throw new Error('EVALUATOR_SOURCE_FREEZE_INVALID');
  const createdAt = nowIso();
  if (Date.parse(createdAt) < sourceFrozenAt) throw new Error('EVALUATOR_TASK_SEAL_PRECEDES_SOURCE_FREEZE');
  const seed = String(options.seed || crypto.randomBytes(32).toString('hex'));
  const pack = generateTaskPack({ seed, trainPerFamily: 12, holdoutPerFamily: 8, probePerFamily: 3 });
  ensureDir(outputDir);
  const publicManifest = {
    schema_version: 1,
    manifest_type: 'mdos_external_public_task_manifest',
    created_at: createdAt,
    source_digest: request.evaluated_system.source_digest,
    source_frozen_at: request.evaluated_system.source_frozen_at,
    pack_id: pack.pack_id,
    generator_seed_digest: pack.generator_seed_digest,
    structural_families: pack.structural_families,
    source_semantic_domains: pack.source_semantic_domains,
    target_semantic_domains: pack.target_semantic_domains,
    train_tasks: pack.train.map((task) => task.public_task),
    holdout_tasks: pack.holdout.map((task) => task.public_task),
    probe_tasks: pack.probes.map((task) => task.public_task),
  };
  const hiddenManifest = {
    schema_version: 1,
    manifest_type: 'mdos_external_evaluator_hidden_tests',
    created_at: createdAt,
    pack_id: pack.pack_id,
    train_evaluator_only: pack.train.map((task) => task.evaluator_only),
    holdout_evaluator_only: pack.holdout.map((task) => task.evaluator_only),
    probe_evaluator_only: pack.probes.map((task) => task.evaluator_only),
  };
  const publicDigest = sha256Json(publicManifest);
  const hiddenDigest = sha256Json(hiddenManifest);
  const taskManifestDigest = sha256Json({
    source_digest: request.evaluated_system.source_digest,
    created_at: createdAt,
    public_digest: publicDigest,
    hidden_digest: hiddenDigest,
  });
  const sealedManifest = {
    schema_version: 1,
    manifest_type: 'mdos_external_sealed_task_bundle',
    created_at: createdAt,
    source_digest: request.evaluated_system.source_digest,
    source_frozen_at: request.evaluated_system.source_frozen_at,
    task_manifest_digest: taskManifestDigest,
    public_manifest_file: 'public_tasks.json',
    public_manifest_digest: publicDigest,
    hidden_manifest_file: 'evaluator_hidden_tests.json',
    hidden_manifest_digest: hiddenDigest,
    sealed_before_run: true,
    evaluator_owned_hidden_tests: true,
    post_freeze_tasks: Date.parse(createdAt) >= sourceFrozenAt,
    task_outputs_scored_outside_agent_workspace: true,
  };
  atomicWriteJson(path.join(outputDir, 'public_tasks.json'), publicManifest);
  atomicWriteJson(path.join(outputDir, 'evaluator_hidden_tests.json'), hiddenManifest);
  atomicWriteJson(path.join(outputDir, 'sealed_manifest.json'), sealedManifest);
  const seedPath = path.join(outputDir, 'evaluator_private_seed.txt');
  atomicWriteText(seedPath, `${seed}\n`);
  fs.chmodSync(seedPath, 0o600);
  return {
    output_dir: outputDir,
    sealed_manifest_file: path.join(outputDir, 'sealed_manifest.json'),
    task_manifest_digest: taskManifestDigest,
    task_count: pack.train.length + pack.holdout.length + pack.probes.length,
    holdout_task_count: pack.holdout.length,
    structural_families: pack.structural_families.length,
  };
}

function groupEvaluationByFamily(evaluation) {
  const groups = Object.fromEntries(STRUCTURAL_FAMILIES.map((family) => [family, { tasks: 0, successes: 0, actions: 0 }]));
  for (const result of evaluation.results || []) {
    const group = groups[result.family] || (groups[result.family] = { tasks: 0, successes: 0, actions: 0 });
    group.tasks += 1;
    group.successes += result.success ? 1 : 0;
    group.actions += Number(result.actions || 0);
  }
  return groups;
}

function referenceRun(options) {
  const sealedDir = assertOutsideWorkspace(options.sealed_dir || '', 'EVALUATOR_SEALED_DIR');
  const outputDir = assertOutsideWorkspace(options.output_dir || '', 'EVALUATOR_RESULTS_OUTPUT');
  assertEmptyOrMissingDirectory(outputDir, 'EVALUATOR_RESULTS_OUTPUT');
  const sealed = readJson(path.join(sealedDir, 'sealed_manifest.json'), 'EVALUATOR_SEALED_MANIFEST');
  const publicManifest = readJson(path.join(sealedDir, sealed.public_manifest_file), 'EVALUATOR_PUBLIC_MANIFEST');
  const hiddenManifest = readJson(path.join(sealedDir, sealed.hidden_manifest_file), 'EVALUATOR_HIDDEN_MANIFEST');
  if (sha256Json(publicManifest) !== sealed.public_manifest_digest) throw new Error('EVALUATOR_PUBLIC_MANIFEST_TAMPERED');
  if (sha256Json(hiddenManifest) !== sealed.hidden_manifest_digest) throw new Error('EVALUATOR_HIDDEN_MANIFEST_TAMPERED');
  const train = reconstructTasks(publicManifest, hiddenManifest, 'train');
  const holdout = reconstructTasks(publicManifest, hiddenManifest, 'holdout');
  const probes = reconstructTasks(publicManifest, hiddenManifest, 'probe');
  ensureDir(outputDir);
  const startedAt = nowIso();
  const startedMs = Date.now();
  let memory = emptyMemory(`external_reference_${sealed.task_manifest_digest.slice(0, 12)}`);
  const initial = evaluateTasks({
    root: outputDir,
    label: 'external_probe_initial',
    configuration: 'same_host_mdos_full',
    tasks: probes,
    memory,
    attemptBudget: 1,
  });
  const workerPids = new Set(initial.worker_pid ? [initial.worker_pid] : []);
  let trainingSuccesses = 0;
  let checkpointReloads = 0;
  let successfulResumptions = 0;
  for (let index = 0; index < train.length; index += 1) {
    if (index > 0 && index % STRUCTURAL_FAMILIES.length === 0) {
      const beforeReload = sha256Json(memory);
      memory = loadMemory(outputDir, memory.memory_id);
      checkpointReloads += 1;
      if (sha256Json(memory) === beforeReload) successfulResumptions += 1;
    }
    const task = train[index];
    const sessionId = `external_session_${String(Math.floor(index / STRUCTURAL_FAMILIES.length) + 1).padStart(3, '0')}`;
    const worker = invokeLearnerWorker({
      root: outputDir,
      label: `external_train_${String(index + 1).padStart(4, '0')}`,
      configuration: 'same_host_mdos_full',
      publicTasks: [task],
      memory,
      attemptBudget: 3,
      exploration: true,
    });
    if (worker.worker_pid) workerPids.add(worker.worker_pid);
    const solveResult = worker.results[0];
    const scored = scoreSolveResult(task, solveResult);
    if (scored.success) trainingSuccesses += 1;
    const amnesic = solvePublicTask({
      configuration: 'same_host_mdos_full',
      publicTask: task.public_task,
      memory: emptyMemory('external_amnesic_control'),
      attemptBudget: 1,
      exploration: false,
    });
    const amnesicScored = scoreSolveResult(task, amnesic);
    memory = recordVerifiedEpisode(
      outputDir,
      memory,
      task,
      solveResult,
      scored.verified_attempts,
      sessionId,
      {
        checkpoint_loaded: checkpointReloads > 0,
        memory_off_success: amnesicScored.success,
      },
    ).memory;
  }
  const beforeFinalReload = sha256Json(memory);
  memory = loadMemory(outputDir, memory.memory_id);
  checkpointReloads += 1;
  if (sha256Json(memory) === beforeFinalReload) successfulResumptions += 1;
  let corruptionTrials = 0;
  let corruptionRecoveries = 0;
  const paths = memoryPaths(outputDir);
  if (fs.existsSync(paths.snapshot)) {
    const beforeCorruption = sha256Json(memory);
    fs.copyFileSync(paths.snapshot, paths.backup);
    fs.writeFileSync(paths.snapshot, '{"truncated":', 'utf8');
    corruptionTrials += 1;
    memory = loadMemory(outputDir, memory.memory_id);
    if (sha256Json(memory) === beforeCorruption) corruptionRecoveries += 1;
  }
  const finalProbe = evaluateTasks({
    root: outputDir,
    label: 'external_probe_final',
    configuration: 'same_host_mdos_full',
    tasks: probes,
    memory,
    attemptBudget: 1,
  });
  if (finalProbe.worker_pid) workerPids.add(finalProbe.worker_pid);
  const ablations = {};
  for (const configuration of CONFIGURATIONS) {
    const evaluation = evaluateTasks({
      root: outputDir,
      label: `external_holdout_${configuration}`,
      configuration,
      tasks: holdout,
      memory,
      attemptBudget: 1,
    });
    if (evaluation.worker_pid) workerPids.add(evaluation.worker_pid);
    ablations[configuration] = {
      task_count: evaluation.task_count,
      successes: evaluation.successes,
      success_rate: evaluation.success_rate,
      total_attempts: evaluation.total_attempts,
      total_actions: evaluation.total_actions,
      by_family: groupEvaluationByFamily(evaluation),
      results: evaluation.results.map((result) => ({
        task_id: result.task_id,
        family: result.family,
        semantic_domain: result.semantic_domain,
        success: result.success,
        actions: result.actions,
      })),
    };
  }
  const memoryOffHoldout = evaluateTasks({
    root: outputDir,
    label: 'external_holdout_same_host_mdos_memory_off',
    configuration: 'same_host_mdos_full',
    tasks: holdout,
    memory: emptyMemory('external_holdout_amnesic'),
    attemptBudget: 1,
  });
  if (memoryOffHoldout.worker_pid) workerPids.add(memoryOffHoldout.worker_pid);
  const completedAt = nowIso();
  const curve = [
    { episodes: 0, success_rate: initial.success_rate, family_accuracy: Object.fromEntries(Object.entries(groupEvaluationByFamily(initial)).map(([family, value]) => [family, value.tasks ? value.successes / value.tasks : 0])) },
    { episodes: train.length, success_rate: finalProbe.success_rate, family_accuracy: Object.fromEntries(Object.entries(groupEvaluationByFamily(finalProbe)).map(([family, value]) => [family, value.tasks ? value.successes / value.tasks : 0])) },
  ];
  const raw = {
    schema_version: 1,
    bundle_type: 'mdos_external_reference_evaluation_bundle',
    created_at: completedAt,
    run_started_at: startedAt,
    run_completed_at: completedAt,
    wall_clock_minutes: Math.round(((Date.now() - startedMs) / 60000) * 10000) / 10000,
    source_digest: sealed.source_digest,
    source_frozen_at: sealed.source_frozen_at,
    task_manifest_digest: sealed.task_manifest_digest,
    task_manifest_created_at: sealed.created_at,
    protocol: {
      sealed_before_run: sealed.sealed_before_run,
      evaluator_owned_hidden_tests: sealed.evaluator_owned_hidden_tests,
      post_freeze_tasks: sealed.post_freeze_tasks,
      matched_budget: true,
      task_outputs_scored_outside_agent_workspace: true,
      ablation_configurations: Array.from(CONFIGURATIONS),
    },
    training: {
      episodes: train.length,
      successes: trainingSuccesses,
      initial_probe_success_rate: initial.success_rate,
      final_probe_success_rate: finalProbe.success_rate,
      learning_gain: Math.round((finalProbe.success_rate - initial.success_rate) * 10000) / 10000,
      average_forgetting: averageForgetting(curve),
      promoted_regressions: memory.promoted_regressions,
    },
    memory_continuity: {
      memory_on_tasks: ablations.same_host_mdos_full.task_count,
      memory_on_successes: ablations.same_host_mdos_full.successes,
      memory_off_tasks: memoryOffHoldout.task_count,
      memory_off_successes: memoryOffHoldout.successes,
      checkpoint_reloads: checkpointReloads,
      successful_resumptions: successfulResumptions,
      semantic_policies_promoted: Object.keys(memory.semantic_memory.promoted_policies || {}).length,
      causal_memory_reuses: memory.continuity.causal_memory_reuses,
      corruption_trials: corruptionTrials,
      corruption_recoveries: corruptionRecoveries,
      retention_after_interference: Math.max(0, 1 - averageForgetting(curve)),
    },
    autonomy: {
      unique_worker_processes: workerPids.size,
      clean_restarts: Math.max(0, workerPids.size - 1),
      curriculum_decisions: train.length,
      persisted_skill_reuses: memory.persisted_skill_reuses,
      human_interventions: 0,
    },
    ablations,
    evidence: {
      public_manifest_digest: sealed.public_manifest_digest,
      hidden_manifest_digest: sealed.hidden_manifest_digest,
      memory_digest: sha256Json(memory),
    },
    limitations: {
      reference_engine_only: true,
      independent_organization_not_implied: true,
      human_reference_not_measured: true,
      autonomous_discovery_projects_not_included: true,
      open_world_attestation_required: true,
    },
  };
  const rawPath = path.join(outputDir, 'raw_evaluation_bundle.json');
  atomicWriteJson(rawPath, raw);
  const logsDigest = sha256Json(fs.readdirSync(outputDir, { recursive: true }).map(String).sort());
  atomicWriteJson(path.join(outputDir, 'bundle_digests.json'), {
    raw_results_digest: sha256Json(raw),
    logs_digest: logsDigest,
    source_manifest_digest: sealed.source_digest,
  });
  return { output_dir: outputDir, bundle_file: rawPath, raw };
}

function keygen(options) {
  const outputDir = assertOutsideWorkspace(options.output_dir || '', 'EVALUATOR_KEY_OUTPUT');
  assertEmptyOrMissingDirectory(outputDir, 'EVALUATOR_KEY_OUTPUT');
  const evaluatorId = shortText(options.evaluator_id);
  const organization = shortText(options.organization);
  const keyId = shortText(options.key_id);
  if (!evaluatorId || !organization || !keyId) throw new Error('EVALUATOR_KEY_IDENTITY_REQUIRED');
  ensureDir(outputDir);
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const privatePath = path.join(outputDir, 'evaluator_private_key.pem');
  const publicPath = path.join(outputDir, 'evaluator_public_key.pem');
  atomicWriteText(privatePath, privatePem);
  fs.chmodSync(privatePath, 0o600);
  atomicWriteText(publicPath, publicPem);
  const trustEntry = {
    evaluator_id: evaluatorId,
    organization,
    key_id: keyId,
    public_key_pem: publicPem,
    active: true,
  };
  atomicWriteJson(path.join(outputDir, 'trust_entry.json'), trustEntry);
  atomicWriteJson(path.join(outputDir, 'trust_store_single_evaluator.json'), {
    schema_version: 1,
    trust_store_id: `trust_${safeToken(organization)}_${safeToken(keyId)}`,
    evaluators: [trustEntry],
  });
  return { output_dir: outputDir, private_key_file: privatePath, public_key_file: publicPath, trust_entry: trustEntry };
}

function safeToken(value) {
  return shortText(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'id';
}

function finalize(options) {
  const bundlePath = assertOutsideWorkspace(options.bundle || '', 'EVALUATOR_BUNDLE');
  const attestationPath = assertOutsideWorkspace(options.attestation || '', 'EVALUATOR_ATTESTATION');
  const privateKeyPath = assertOutsideWorkspace(options.private_key || '', 'EVALUATOR_PRIVATE_KEY');
  const outputPath = assertOutsideWorkspace(options.output || '', 'EVALUATOR_REPORT_OUTPUT');
  const keyId = shortText(options.key_id);
  if (!keyId) throw new Error('EVALUATOR_KEY_ID_REQUIRED');
  const bundle = readJson(bundlePath, 'EVALUATOR_BUNDLE');
  const attestation = readJson(attestationPath, 'EVALUATOR_ATTESTATION');
  if (bundle.bundle_type !== 'mdos_external_reference_evaluation_bundle') throw new Error('EVALUATOR_BUNDLE_TYPE_INVALID');
  if (attestation.independent !== true) throw new Error('EVALUATOR_INDEPENDENCE_ATTESTATION_REQUIRED');
  const evaluatorId = shortText(attestation.evaluator_id);
  const organization = shortText(attestation.organization);
  const hostModelId = shortText(attestation.host_model_id);
  if (!evaluatorId || !organization || !hostModelId) throw new Error('EVALUATOR_ATTESTATION_IDENTITY_REQUIRED');
  const domainAttestations = attestation.domains || {};
  const domains = STRUCTURAL_FAMILIES.map((family) => {
    const base = bundle.ablations.same_host_base.by_family[family];
    const prompted = bundle.ablations.same_host_prompted.by_family[family];
    const noLearning = bundle.ablations.same_host_mdos_no_learning.by_family[family];
    const full = bundle.ablations.same_host_mdos_full.by_family[family];
    const extra = domainAttestations[family] || {};
    return {
      domain_id: shortText(extra.domain_id || family),
      domain_family: family,
      task_count: full.tasks,
      baseline_successes: base.successes,
      prompted_successes: prompted.successes,
      mdos_no_learning_successes: noLearning.successes,
      mdos_full_successes: full.successes,
      human_reference_successes: Number(extra.human_reference_successes || 0),
      open_world_task_count: Number(extra.open_world_task_count || 0),
      autonomous_discovery_successes: Number(extra.autonomous_discovery_successes || 0),
      agent_actions: Math.max(1, Number(full.actions || 1)),
      human_reference_actions: Math.max(1, Number(extra.human_reference_actions || 1)),
    };
  });
  const robustness = attestation.robustness || {};
  const autonomy = attestation.autonomy || {};
  const rawResultsDigest = sha256Json(bundle);
  const logsDigest = sha256Json({ bundle_file: path.basename(bundlePath), bundle_digest: rawResultsDigest, attestation_digest: sha256Json(attestation) });
  const unsigned = {
    schema_version: 1,
    report_type: 'mdos_agi_external_evaluation',
    report_id: safeToken(attestation.report_id || `report_${sha256Text(`${organization}:${bundle.task_manifest_digest}`).slice(0, 16)}`),
    created_at: nowIso(),
    system: {
      system_id: 'md-os-apfc',
      source_digest: bundle.source_digest,
      source_frozen_at: bundle.source_frozen_at,
      host_model_id: hostModelId,
      configuration: 'mdos_full',
    },
    evaluator: {
      evaluator_id: evaluatorId,
      organization,
      key_id: keyId,
      independent: true,
    },
    protocol: {
      protocol_id: PROTOCOL_ID,
      task_manifest_digest: bundle.task_manifest_digest,
      task_manifest_created_at: bundle.task_manifest_created_at,
      sealed_before_run: bundle.protocol.sealed_before_run,
      evaluator_owned_hidden_tests: bundle.protocol.evaluator_owned_hidden_tests,
      post_freeze_tasks: bundle.protocol.post_freeze_tasks,
      matched_budget: bundle.protocol.matched_budget,
      task_outputs_scored_outside_agent_workspace: bundle.protocol.task_outputs_scored_outside_agent_workspace,
      ablation_configurations: Array.from(CONFIGURATIONS),
      run_started_at: bundle.run_started_at,
      run_completed_at: bundle.run_completed_at,
    },
    results: {
      domains,
      continual_learning: {
        episodes: bundle.training.episodes,
        learning_gain: bundle.training.learning_gain,
        average_forgetting: bundle.training.average_forgetting,
        promoted_regressions: bundle.training.promoted_regressions,
      },
      memory_continuity: {
        memory_on_tasks: Number(bundle.memory_continuity.memory_on_tasks),
        memory_on_successes: Number(bundle.memory_continuity.memory_on_successes),
        memory_off_tasks: Number(bundle.memory_continuity.memory_off_tasks),
        memory_off_successes: Number(bundle.memory_continuity.memory_off_successes),
        checkpoint_reloads: Number(bundle.memory_continuity.checkpoint_reloads),
        successful_resumptions: Number(bundle.memory_continuity.successful_resumptions),
        semantic_policies_promoted: Number(bundle.memory_continuity.semantic_policies_promoted),
        causal_memory_reuses: Number(bundle.memory_continuity.causal_memory_reuses),
        corruption_trials: Number(bundle.memory_continuity.corruption_trials),
        corruption_recoveries: Number(bundle.memory_continuity.corruption_recoveries),
        retention_after_interference: Number(bundle.memory_continuity.retention_after_interference),
      },
      autonomy: {
        attempted_projects: Number(autonomy.attempted_projects || domains.reduce((sum, domain) => sum + domain.task_count, 0)),
        completed_projects: Number(autonomy.completed_projects || domains.reduce((sum, domain) => sum + domain.mdos_full_successes, 0)),
        longest_human_equivalent_minutes: Number(autonomy.longest_human_equivalent_minutes || 0),
        human_interventions: Number(autonomy.human_interventions === undefined ? bundle.autonomy.human_interventions : autonomy.human_interventions),
        clean_restarts: Number(autonomy.clean_restarts === undefined ? bundle.autonomy.clean_restarts : autonomy.clean_restarts),
        curriculum_decisions: Number(autonomy.curriculum_decisions === undefined ? bundle.autonomy.curriculum_decisions : autonomy.curriculum_decisions),
        persisted_skill_reuses: Number(autonomy.persisted_skill_reuses === undefined ? bundle.autonomy.persisted_skill_reuses : autonomy.persisted_skill_reuses),
      },
      robustness: {
        perturbation_trials: Math.max(1, Number(robustness.perturbation_trials || 1)),
        perturbation_successes: Number(robustness.perturbation_successes || 0),
        injected_faults: Number(robustness.injected_faults || 0),
        recovered_faults: Number(robustness.recovered_faults || 0),
        critical_safety_violations: Number(robustness.critical_safety_violations || 0),
        contamination_findings: Number(robustness.contamination_findings || 0),
      },
    },
    evidence: {
      raw_results_digest: rawResultsDigest,
      logs_digest: logsDigest,
      source_manifest_digest: bundle.source_digest,
    },
  };
  const privateKeyPem = fs.readFileSync(privateKeyPath, 'utf8');
  const signed = signReport(unsigned, privateKeyPem, keyId);
  validateExternalReport(signed);
  ensureDir(path.dirname(outputPath));
  atomicWriteJson(outputPath, signed);
  return { report_file: outputPath, report_id: signed.report_id, report_digest: sha256Json(signed) };
}

function parseArgs(args) {
  const options = { command: '', request: '', output_dir: '', seed: '', sealed_dir: '', evaluator_id: '', organization: '', key_id: '', bundle: '', attestation: '', private_key: '', output: '' };
  const normalized = args.slice();
  options.command = normalized.shift() || '';
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    const next = () => normalized[++index] || '';
    const set = (key, prefix) => { options[key] = arg.startsWith(`${prefix}=`) ? arg.slice(prefix.length + 1) : next(); };
    if (arg === '--request' || arg.startsWith('--request=')) set('request', '--request');
    else if (arg === '--output-dir' || arg.startsWith('--output-dir=')) set('output_dir', '--output-dir');
    else if (arg === '--seed' || arg.startsWith('--seed=')) set('seed', '--seed');
    else if (arg === '--sealed-dir' || arg.startsWith('--sealed-dir=')) set('sealed_dir', '--sealed-dir');
    else if (arg === '--evaluator-id' || arg.startsWith('--evaluator-id=')) set('evaluator_id', '--evaluator-id');
    else if (arg === '--organization' || arg.startsWith('--organization=')) set('organization', '--organization');
    else if (arg === '--key-id' || arg.startsWith('--key-id=')) set('key_id', '--key-id');
    else if (arg === '--bundle' || arg.startsWith('--bundle=')) set('bundle', '--bundle');
    else if (arg === '--attestation' || arg.startsWith('--attestation=')) set('attestation', '--attestation');
    else if (arg === '--private-key' || arg.startsWith('--private-key=')) set('private_key', '--private-key');
    else if (arg === '--output' || arg.startsWith('--output=')) set('output', '--output');
    else usage();
  }
  return options;
}

function main() {
  try {
    const options = parseArgs(process.argv.slice(2));
    let result;
    if (options.command === 'seal') result = sealTasks(options);
    else if (options.command === 'reference-run') result = referenceRun(options);
    else if (options.command === 'keygen') result = keygen(options);
    else if (options.command === 'finalize') result = finalize(options);
    else usage();
    printJson({ ok: true, mode: `agi_external_evaluator_${options.command}`, ...result });
  } catch (error) {
    printJson({ ok: false, mode: 'agi_external_evaluator_kit', error: shortText(error && error.message || error) });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  assertOutsideWorkspace,
  finalize,
  keygen,
  parseArgs,
  referenceRun,
  sealTasks,
};
