#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  printJson,
  canonicalJson,
  sha256Json,
  sha256Text,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { buildApfcGraph } = require('./build_apfc_graph');
const { compileOperationalContextBundle, assertContextSelectionAudit } = require('../apfc/executive/context_compiler');
const { problemContractHash } = require('../kernel/cognition/problem_core');
const { readProblemContext, buildProblemProjection, buildIntuitiveContext } = require('./problem_context');
const { previewProblemCompaction } = require('./problem_compaction');
const { readEvents, reconcile, verifyEventChain } = require('../apfc/executive/event_recorder');
const { runConsolidation } = require('../apfc/executive/consolidator');
const { buildGraphifyFromFiles } = require('../apfc/executive/graphify_adapter');
const { evaluateCognitiveUnityClaims } = require('../kernel/cognition/cross_domain_cognitive_unity');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  try { return readJson(filePath); } catch (_) { return null; }
}

function rel(filePath, workspaceRoot = WORKSPACE_ROOT) {
  return path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
}

function listJson(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => path.join(dirPath, entry.name)).sort();
}

function parseFlag(args, flag) {
  return args.includes(flag);
}

function optionValue(args, flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : null;
}

function assertRelativeTaskSpec(taskSpecPath, workspaceRoot, mdosRoot) {
  const resolved = path.resolve(workspaceRoot, taskSpecPath);
  const relative = path.relative(mdosRoot, resolved);
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('APFC_TASK_SPEC_OUTSIDE_MD_OS');
  if (!/^task_[a-zA-Z0-9_]+\.json$/.test(path.basename(resolved))) throw new Error('APFC_TASK_SPEC_FILENAME_INVALID');
  return resolved;
}

function writeContextIndex(apfcDir) {
  const dir = path.join(apfcDir, 'context_packs');
  ensureDir(dir);
  const packs = listJson(dir).filter((filePath) => !filePath.endsWith('index.json')).map((filePath) => readJsonSafe(filePath)).filter(Boolean)
    .sort((left, right) => left.context_pack_id.localeCompare(right.context_pack_id));
  const previous = readJsonSafe(path.join(dir, 'index.json'));
  const graph = readJsonSafe(path.join(apfcDir, 'graph.json'));
  if (previous?.problem_graph_hash && previous.problem_graph_hash !== sha256Json(graph)) {
    throw new Error('APFC_PROBLEM_INDEX_STALE_REBUILD_REQUIRED');
  }
  const index = {
    schema_version: 1,
    updated_at: nowIso(),
    context_pack_count: packs.length,
    ...(previous?.problems ? { problems: previous.problems, problem_graph_hash: previous.problem_graph_hash } : {}),
    packs: packs.map((pack) => ({ context_pack_id: pack.context_pack_id, task_spec_id: pack.task_spec_id, graph_id: pack.graph_id, status: pack.status, path: rel(path.join(dir, `${pack.context_pack_id}.json`)) })),
  };
  atomicWriteJson(path.join(dir, 'index.json'), index);
  atomicWriteText(path.join(dir, 'index.md'), ['# APFC Context-Pack Index', '', `Packs: \`${index.context_pack_count}\``, '',
    'Problem identities, relations and review flags are retained in index.json. They do not certify task success.', '',
    ...index.packs.map((pack) => `- \`${pack.context_pack_id}\` — \`${pack.status}\``), ''].join('\n'));
  return index;
}

function assertCurrentProblemSources(pack, workspaceRoot, mdosRoot) {
  for (const node of pack.nodes.filter(item => item.type === 'goal' && item.properties.problem_contract_hash)) {
    const source = node.source_refs[0].split('#')[0];
    if (!/^md-os\/ops\/tasks\/task_[a-zA-Z0-9_]+\.json$/.test(source)) throw new Error('APFC_PROBLEM_SOURCE_INVALID');
    const file = path.resolve(workspaceRoot, source);
    const real = fs.realpathSync(file);
    const relative = path.relative(fs.realpathSync(mdosRoot), real);
    if (relative.startsWith('..') || path.isAbsolute(relative) || fs.lstatSync(file).isSymbolicLink()) throw new Error('APFC_PROBLEM_SOURCE_OUTSIDE_WORKSPACE');
    if (node.properties.problem_contract_hash !== problemContractHash(readJson(real))) throw new Error('APFC_PROBLEM_CONTEXT_STALE_REBUILD_REQUIRED');
  }
}

function compileContext(taskSpecPath, options = {}) {
  const workspaceRoot = options.workspace_root || WORKSPACE_ROOT;
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const apfcDir = options.apfc_dir || path.join(mdosRoot, 'ops', 'apfc', 'executive');
  const resolved = assertRelativeTaskSpec(taskSpecPath, workspaceRoot, mdosRoot);
  const graph = readJson(path.join(apfcDir, 'graph.json'));
  const status = readJson(path.join(apfcDir, 'status.json'));
  if (status.status === 'critical') throw new Error('APFC_CONTEXT_BLOCKED_BY_CRITICAL_STATUS');
  const taskSpec = readJson(resolved);
  const { pack, selection_audit: audit } = compileOperationalContextBundle(graph, taskSpec);
  assertCurrentProblemSources(pack, workspaceRoot, mdosRoot);
  const dir = path.join(apfcDir, 'context_packs');
  ensureDir(dir);
  assertContextSelectionAudit(pack, audit);
  atomicWriteJson(path.join(dir, pack.selection_audit.path), audit);
  atomicWriteText(path.join(dir, `${pack.context_pack_id}.json`), canonicalJson(pack));
  atomicWriteText(path.join(dir, `${pack.context_pack_id}.md`), [
    '# APFC Task Context', '',
    `Context: \`${pack.context_pack_id}\``,
    `Task: \`${pack.task_spec_id}\``,
    `Graph: \`${pack.graph_id}\``,
    `Status: \`${pack.status}\``,
    `Selected nodes: \`${pack.nodes.length}\``,
    `Serialized bytes: \`${pack.serialized_bytes}\``, '',
    '## Selected nodes', '',
    ...pack.nodes.map((node) => `- \`${node.id}\` — ${node.label} [${node.epistemic_status}]`), '',
  ].join('\n'));
  writeContextIndex(apfcDir);
  return { ok: true, mode: 'apfc_context', context_pack_id: pack.context_pack_id, status: pack.status, node_count: pack.nodes.length, serialized_bytes: pack.serialized_bytes, output: rel(path.join(dir, `${pack.context_pack_id}.json`), workspaceRoot) };
}

function readContextAudit(taskId, options = {}) {
  if (!/^task_[a-zA-Z0-9_]+$/.test(taskId || '')) throw new Error('APFC_CONTEXT_AUDIT_TASK_INVALID');
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const apfcDir = options.apfc_dir || path.join(mdosRoot, 'ops', 'apfc', 'executive');
  const dir = path.join(apfcDir, 'context_packs');
  const graph = readJson(path.join(apfcDir, 'graph.json'));
  const index = readJson(path.join(dir, 'index.json'));
  const entries = index.packs.filter(item => item.task_spec_id === taskId);
  if (entries.length !== 1 || !/^apfc_ctx_[a-zA-Z0-9_-]+_[a-f0-9]{10}$/.test(entries[0].context_pack_id)) throw new Error('APFC_CONTEXT_AUDIT_PACK_UNAVAILABLE');
  const readBounded = relative => {
    const file = path.join(dir, relative), actual = fs.realpathSync(file);
    const inside = path.relative(fs.realpathSync(dir), actual);
    if (inside.startsWith('..') || path.isAbsolute(inside) || fs.lstatSync(file).isSymbolicLink() || fs.statSync(file).size > 16777216) throw new Error('APFC_CONTEXT_AUDIT_SOURCE_INVALID');
    return readJson(file);
  };
  const pack = readBounded(`${entries[0].context_pack_id}.json`);
  if (pack.graph_content_hash !== sha256Json(graph) || pack.task_spec_id !== taskId
      || !pack.selection_audit || pack.selection_audit.path !== `audit/${pack.context_pack_id}.json`) throw new Error('APFC_CONTEXT_AUDIT_STALE_OR_UNAVAILABLE');
  const audit = readBounded(pack.selection_audit.path);
  assertContextSelectionAudit(pack, audit);
  assertCurrentProblemSources(pack, options.workspace_root || WORKSPACE_ROOT, mdosRoot);
  return { ok: true, mode: 'apfc_context_audit', task_spec_id: taskId, scope: 'selection_explanation_not_task_success', selection_audit: audit };
}

function findCycleForSkill(apfcDir, skillId) {
  const cycles = listJson(path.join(apfcDir, 'consolidation')).filter((filePath) => !filePath.endsWith('index.json')).map((filePath) => ({ filePath, cycle: readJsonSafe(filePath) })).filter((entry) => entry.cycle)
    .sort((left, right) => String(right.cycle.created_at).localeCompare(String(left.cycle.created_at)));
  return cycles.find((entry) => entry.cycle.state === 'promotable' && entry.cycle.skill_candidates.some((candidate) => candidate.skill_id === skillId && candidate.gate.status === 'ok')) || null;
}

function stateSnapshot(targets) {
  const normalized = targets.map((target) => ({ path: target.path, exists: target.value !== null, sha256: target.value === null ? null : sha256Json(target.value) }));
  return { hash: sha256Json(normalized), targets: normalized };
}

function receiptForGovernance({ receiptId, episodeId, operation, skillId, startedAt, completedAt, beforeTargets, afterTargets, historyPath, sourceReceiptId = null, status = 'completed', error = null, workspaceRoot = WORKSPACE_ROOT }) {
  const before = stateSnapshot(beforeTargets);
  const after = stateSnapshot(afterTargets);
  return {
    schema_version: 1,
    action_receipt_id: receiptId,
    episode_id: episodeId,
    action_id: operation,
    tool: 'mdos_apfc_governance',
    input_hash: sha256Json({ operation, skill_id: skillId, source_receipt_id: sourceReceiptId, before: before.hash }),
    started_at: startedAt,
    completed_at: completedAt,
    status,
    exit_status: status === 'completed' ? 0 : 1,
    expected_exit_status: 0,
    artifacts: [historyPath, ...afterTargets.filter((target) => target.value !== null).map((target) => target.path)],
    state_before: before,
    state_after: after,
    observed_delta: { changed: before.hash !== after.hash, targets: after.targets },
    rollback: { source_receipt_id: sourceReceiptId, history_path: historyPath, operation: operation === 'apfc_promote' ? 'apfc_rollback' : operation === 'apfc_revoke' ? 'apfc_restore' : null },
    readback: { operation, skill_id: skillId, source_receipt_id: sourceReceiptId, history_path: historyPath, status, error, reversible: true, history_preserved: true },
  };
}

function writeImmutable(filePath, payload) {
  ensureDir(path.dirname(filePath));
  if (fs.existsSync(filePath)) {
    if (sha256Json(readJson(filePath)) !== sha256Json(payload)) throw new Error(`APFC_IMMUTABLE_HISTORY_COLLISION: ${filePath}`);
    return;
  }
  atomicWriteJson(filePath, payload);
}

function defaultRebuild(workspaceRoot) {
  const commands = [
    ['agi_loop.js', ['eval']],
    ['build_apfc_graph.js', []],
    ['build_runtime_compiler.js', []],
    ['build_global_index.js', []],
    ['build_health_classifier.js', []],
    ['build_health_dashboard.js', []],
    ['mdos.js', ['replay']],
    ['mdos.js', ['replay']],
  ];
  const results = [];
  for (const [script, args] of commands) {
    const result = spawnSync(process.execPath, [path.join(MDOS_ROOT, 'os', script), ...args], { cwd: workspaceRoot, encoding: 'utf8', env: process.env });
    results.push({ script: `md-os/os/${script}`, args, status: result.status, stdout: String(result.stdout || '').trim().split('\n').filter(Boolean).slice(-2), stderr: String(result.stderr || '').trim().split('\n').filter(Boolean).slice(-2) });
    if (result.status !== 0) throw new Error(`APFC_GOVERNANCE_REBUILD_FAILED: ${script}:${String(result.stderr || result.stdout || '').trim()}`);
  }
  return results;
}

function consolidateRuntime(options = {}) {
  const workspaceRoot = options.workspace_root || WORKSPACE_ROOT;
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const cycle = runConsolidation({
    ops_root: options.ops_root || path.join(mdosRoot, 'ops'),
    apfc_dir: options.apfc_dir,
    created_at: options.created_at,
  });
  const commands = [
    ['agi_loop.js', ['eval']],
    ['build_apfc_graph.js', []],
    ['apfc_runtime.js', ['graphify', 'build']],
    ['build_global_index.js', []],
    ['build_health_classifier.js', []],
    ['build_health_dashboard.js', []],
  ];
  const rebuilds = commands.map(([script, args]) => {
    const result = spawnSync(process.execPath, [path.join(mdosRoot, 'os', script), ...args], {
      cwd: workspaceRoot,
      encoding: 'utf8',
      env: process.env,
    });
    if (result.status !== 0) throw new Error(`APFC_CONSOLIDATION_READBACK_REBUILD_FAILED: ${script}:${String(result.stderr || result.stdout || '').trim()}`);
    return { script: `md-os/os/${script}`, args, status: result.status };
  });
  return {
    ...cycle,
    readback: { ...cycle.readback, rebuilt_after_consolidation: true },
    rebuilds,
  };
}

function governancePaths(options = {}) {
  const opsRoot = options.ops_root || path.join(MDOS_ROOT, 'ops');
  const workspaceRoot = options.workspace_root || WORKSPACE_ROOT;
  return {
    opsRoot,
    workspaceRoot,
    apfcDir: options.apfc_dir || path.join(opsRoot, 'apfc', 'executive'),
    candidatesDir: path.join(opsRoot, 'skills', 'candidates'),
    promotedDir: path.join(opsRoot, 'skills', 'promoted'),
    historyDir: path.join(opsRoot, 'skills', 'history'),
    receiptsDir: path.join(opsRoot, 'action_receipts'),
  };
}

function promotionTransaction(skillIdInput, options = {}) {
  const skillId = assertSafeId(skillIdInput, 'skill_candidate_id');
  if (!options.approve) throw new Error('APFC_PROMOTION_REQUIRES_EXPLICIT_APPROVAL_FLAG');
  const paths = governancePaths(options);
  return withFileLock(options.lock_name || 'apfc__promotion_transaction', { context: `apfc:promote:${skillId}`, timeoutMs: 60000, staleMs: 600000 }, () => {
    const status = readJson(path.join(paths.apfcDir, 'status.json'));
    if (status.release_gate.promotion_blocked) throw new Error('APFC_PROMOTION_BLOCKED_BY_STATUS');
    const candidatePath = path.join(paths.candidatesDir, `${skillId}.json`);
    const promotedPath = path.join(paths.promotedDir, `${skillId}.json`);
    const candidate = readJson(candidatePath);
    if (candidate.status !== 'promotable' || candidate.promotion_gate_status !== 'ok') throw new Error('APFC_PROMOTION_CANDIDATE_NOT_PROMOTABLE');
    if (!require('../kernel/cognition/pattern_skill').patternSkillEvidence(paths.workspaceRoot, candidate).applicable) throw new Error('APFC_PROMOTION_PATTERN_EVIDENCE_STALE');
    if (evaluateCognitiveUnityClaims(candidate, { workspace_root: paths.workspaceRoot }).status !== 'ok') throw new Error('APFC_PROMOTION_COGNITIVE_UNITY_EVIDENCE_INVALID');
    if ((candidate.risk_level === 'high' || candidate.scope_risk === 'high') && !options.approve_high_risk) throw new Error('APFC_PROMOTION_HIGH_RISK_APPROVAL_REQUIRED');
    const cycleEntry = findCycleForSkill(paths.apfcDir, skillId);
    if (!cycleEntry) throw new Error('APFC_PROMOTION_PASSING_CYCLE_REQUIRED');
    const cycleCandidate = cycleEntry.cycle.skill_candidates.find((item) => item.skill_id === skillId);
    if (cycleCandidate.candidate_hash !== sha256Json(candidate)) throw new Error('APFC_PROMOTION_STALE_CANDIDATE_HASH');
    const existingPromoted = readJsonSafe(promotedPath);
    const startedAt = nowIso();
    const receiptId = `receipt_apfc_promotion_${sha256Text(`${skillId}:${sha256Json(candidate)}:${startedAt}`).slice(0, 20)}`;
    const promoted = { ...candidate, status: 'promoted', promoted_at: startedAt, promotion_receipt_id: receiptId, source_consolidation_cycle_id: cycleEntry.cycle.cycle_id, promotion_evidence_hash: sha256Json(cycleCandidate.gate) };
    const historyRel = rel(path.join(paths.historyDir, skillId, `${receiptId}.json`), paths.workspaceRoot);
    const promotedRel = rel(promotedPath, paths.workspaceRoot);
    const candidateRel = rel(candidatePath, paths.workspaceRoot);
    const history = { schema_version: 1, governance_id: receiptId, operation: 'apfc_promote', skill_id: skillId, created_at: startedAt, source_cycle_id: cycleEntry.cycle.cycle_id, before_candidate: candidate, before_promoted: existingPromoted, after_promoted: promoted };
    writeImmutable(path.join(paths.historyDir, skillId, `${receiptId}.json`), history);
    ensureDir(paths.promotedDir);
    atomicWriteJson(promotedPath, promoted);
    const receipt = receiptForGovernance({ receiptId, episodeId: candidate.source_episodes[0], operation: 'apfc_promote', skillId, startedAt, completedAt: nowIso(), beforeTargets: [{ path: candidateRel, value: candidate }, { path: promotedRel, value: existingPromoted }], afterTargets: [{ path: candidateRel, value: candidate }, { path: promotedRel, value: promoted }], historyPath: historyRel, workspaceRoot: paths.workspaceRoot });
    ensureDir(paths.receiptsDir);
    writeImmutable(path.join(paths.receiptsDir, `${receiptId}.json`), receipt);
    const updatedCycle = { ...cycleEntry.cycle, state: 'promoted', promotion_receipt: { receipt_id: receiptId, receipt_hash: sha256Json(receipt) } };
    atomicWriteJson(cycleEntry.filePath, updatedCycle);
    try {
      const rebuilds = (options.rebuild || defaultRebuild)(paths.workspaceRoot);
      return { ok: true, mode: 'apfc_promote', skill_id: skillId, receipt_id: receiptId, promoted_hash: sha256Json(promoted), history_path: historyRel, rebuilds };
    } catch (error) {
      if (existingPromoted) atomicWriteJson(promotedPath, existingPromoted); else if (fs.existsSync(promotedPath)) fs.unlinkSync(promotedPath);
      atomicWriteJson(cycleEntry.filePath, cycleEntry.cycle);
      const rollbackId = `receipt_apfc_automatic_rollback_${sha256Text(`${receiptId}:${error.message}`).slice(0, 20)}`;
      const rollbackHistoryRel = rel(path.join(paths.historyDir, skillId, `${rollbackId}.json`), paths.workspaceRoot);
      const rollbackHistory = { schema_version: 1, governance_id: rollbackId, operation: 'apfc_automatic_rollback', skill_id: skillId, created_at: nowIso(), source_receipt_id: receiptId, before_promoted: promoted, after_promoted: existingPromoted, error: error.message };
      writeImmutable(path.join(paths.historyDir, skillId, `${rollbackId}.json`), rollbackHistory);
      const rollbackReceipt = receiptForGovernance({ receiptId: rollbackId, episodeId: candidate.source_episodes[0], operation: 'apfc_rollback', skillId, startedAt: nowIso(), completedAt: nowIso(), beforeTargets: [{ path: promotedRel, value: promoted }], afterTargets: [{ path: promotedRel, value: existingPromoted }], historyPath: rollbackHistoryRel, sourceReceiptId: receiptId, status: 'completed', error: error.message, workspaceRoot: paths.workspaceRoot });
      writeImmutable(path.join(paths.receiptsDir, `${rollbackId}.json`), rollbackReceipt);
      throw new Error(`APFC_PROMOTION_ROLLED_BACK: ${error.message}`);
    }
  });
}

function governedTransition(operation, sourceIdInput, options = {}) {
  if (!options.approve) throw new Error('APFC_GOVERNANCE_REQUIRES_EXPLICIT_APPROVAL_FLAG');
  const paths = governancePaths(options);
  return withFileLock(options.lock_name || 'apfc__promotion_transaction', { context: `apfc:${operation}:${sourceIdInput}`, timeoutMs: 60000, staleMs: 600000 }, () => {
    let sourceReceipt = null;
    let skillId = null;
    let sourceReceiptId = null;
    if (operation === 'apfc_revoke') {
      skillId = assertSafeId(sourceIdInput, 'skill_id');
    } else {
      sourceReceiptId = assertSafeId(sourceIdInput, 'promotion_receipt_id');
      sourceReceipt = readJson(path.join(paths.receiptsDir, `${sourceReceiptId}.json`));
      skillId = assertSafeId(sourceReceipt.readback.skill_id, 'skill_id');
    }
    const promotedPath = path.join(paths.promotedDir, `${skillId}.json`);
    const current = readJsonSafe(promotedPath);
    if (!current) throw new Error('APFC_GOVERNANCE_PROMOTED_SKILL_NOT_FOUND');
    let target = null;
    if (operation === 'apfc_revoke') {
      if (current.status !== 'promoted') throw new Error('APFC_REVOKE_REQUIRES_PROMOTED_SKILL');
      target = { ...current, status: 'revoked', revoked_at: nowIso(), revocation_reason: options.reason || 'explicit_governed_revocation' };
    } else {
      const sourceHistory = readJson(path.resolve(paths.workspaceRoot, sourceReceipt.readback.history_path));
      if (operation === 'apfc_rollback') {
        if (sha256Json(current) !== sha256Json(sourceHistory.after_promoted)) throw new Error('APFC_ROLLBACK_CURRENT_STATE_HASH_MISMATCH');
        target = sourceHistory.before_promoted;
      } else if (operation === 'apfc_restore') {
        if (sourceReceipt.readback.operation !== 'apfc_revoke') throw new Error('APFC_RESTORE_REQUIRES_REVOCATION_RECEIPT');
        if (current.status !== 'revoked' || sha256Json(current) !== sha256Json(sourceHistory.after_promoted)) throw new Error('APFC_RESTORE_CURRENT_STATE_HASH_MISMATCH');
        target = sourceHistory.before_promoted;
      } else throw new Error(`APFC_GOVERNANCE_OPERATION_INVALID: ${operation}`);
    }
    const startedAt = nowIso();
    const receiptId = `receipt_${operation}_${sha256Text(`${skillId}:${sha256Json(current)}:${startedAt}`).slice(0, 20)}`;
    const historyRel = rel(path.join(paths.historyDir, skillId, `${receiptId}.json`), paths.workspaceRoot);
    const promotedRel = rel(promotedPath, paths.workspaceRoot);
    const history = { schema_version: 1, governance_id: receiptId, operation, skill_id: skillId, created_at: startedAt, source_receipt_id: sourceReceiptId, before_promoted: current, after_promoted: target };
    writeImmutable(path.join(paths.historyDir, skillId, `${receiptId}.json`), history);
    if (target) atomicWriteJson(promotedPath, target); else fs.unlinkSync(promotedPath);
    const receipt = receiptForGovernance({ receiptId, episodeId: current.source_episodes[0], operation, skillId, startedAt, completedAt: nowIso(), beforeTargets: [{ path: promotedRel, value: current }], afterTargets: [{ path: promotedRel, value: target }], historyPath: historyRel, sourceReceiptId, workspaceRoot: paths.workspaceRoot });
    writeImmutable(path.join(paths.receiptsDir, `${receiptId}.json`), receipt);
    try {
      const rebuilds = (options.rebuild || defaultRebuild)(paths.workspaceRoot);
      return { ok: true, mode: operation, skill_id: skillId, receipt_id: receiptId, source_receipt_id: sourceReceiptId, status: target ? target.status : 'removed_to_pre_promotion_state', history_path: historyRel, rebuilds };
    } catch (error) {
      atomicWriteJson(promotedPath, current);
      const rollbackId = `receipt_apfc_automatic_rollback_${sha256Text(`${receiptId}:${error.message}`).slice(0, 20)}`;
      const rollbackHistoryRel = rel(path.join(paths.historyDir, skillId, `${rollbackId}.json`), paths.workspaceRoot);
      const rollbackHistory = {
        schema_version: 1,
        governance_id: rollbackId,
        operation: 'apfc_automatic_rollback',
        skill_id: skillId,
        created_at: nowIso(),
        source_receipt_id: receiptId,
        before_promoted: target,
        after_promoted: current,
        error: error.message,
      };
      writeImmutable(path.join(paths.historyDir, skillId, `${rollbackId}.json`), rollbackHistory);
      const rollbackReceipt = receiptForGovernance({
        receiptId: rollbackId,
        episodeId: current.source_episodes[0],
        operation: 'apfc_rollback',
        skillId,
        startedAt: nowIso(),
        completedAt: nowIso(),
        beforeTargets: [{ path: promotedRel, value: target }],
        afterTargets: [{ path: promotedRel, value: current }],
        historyPath: rollbackHistoryRel,
        sourceReceiptId: receiptId,
        error: error.message,
        workspaceRoot: paths.workspaceRoot,
      });
      writeImmutable(path.join(paths.receiptsDir, `${rollbackId}.json`), rollbackReceipt);
      throw new Error(`APFC_GOVERNANCE_TRANSACTION_RESTORED: ${error.message}`);
    }
  });
}

function verifyRuntime(options = {}) {
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const apfcDir = options.apfc_dir || path.join(mdosRoot, 'ops', 'apfc', 'executive');
  const first = buildApfcGraph(options);
  const firstGraph = fs.readFileSync(path.join(apfcDir, 'graph.json'), 'utf8');
  const second = buildApfcGraph(options);
  const secondGraph = fs.readFileSync(path.join(apfcDir, 'graph.json'), 'utf8');
  const chain = verifyEventChain(readEvents(path.join(apfcDir, 'events.ndjson')));
  if (firstGraph !== secondGraph) throw new Error('APFC_GRAPH_NON_DETERMINISTIC');
  return { ok: first.ok && second.ok && chain.ok, mode: 'apfc_verify', graph_id: second.graph_id, deterministic_graph: true, event_chain: chain };
}

function statusReadback(options = {}) {
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const filePath = path.join(options.apfc_dir || path.join(mdosRoot, 'ops', 'apfc', 'executive'), 'status.json');
  const status = readJsonSafe(filePath);
  if (!status) return { ok: false, mode: 'apfc_status', status: 'missing', suggested_action: 'cortex apfc build' };
  return { ok: status.status !== 'critical', mode: 'apfc_status', ...status };
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex apfc status',
    '  cortex apfc build',
    '  cortex apfc verify',
    '  cortex apfc reconcile',
    '  cortex apfc context --task-spec <md-os/ops/tasks/task_id.json>',
    '  cortex apfc context-audit --task <task_id>',
    '  cortex apfc problems [--evidence] [--task <task_id>] [--after <task_id>] [--maximum-bytes <n>]',
    '  cortex apfc orient [--task <task_id>] [--after <task_id>] [--maximum-bytes <n>]',
    '  cortex apfc compact-problem --task <task_id> --preview [--maximum-bytes <n>] [--proposal-stdin]',
    '  cortex apfc consolidate --run-once',
    '  cortex apfc promote <skill_candidate_id> --approve [--approve-high-risk]',
    '  cortex apfc rollback <promotion_receipt_id> --approve',
    '  cortex apfc revoke <skill_id> --approve [--reason <text>]',
    '  cortex apfc restore <revocation_receipt_id> --approve',
    '  cortex apfc graphify build',
    '  cortex apfc graphify open --view <view_id>',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (!command) usage();
  if (command === 'status') return printJson(statusReadback());
  if (command === 'build') return printJson(buildApfcGraph());
  if (command === 'verify') return printJson(verifyRuntime());
  if (command === 'reconcile') return printJson(reconcile());
  if (command === 'compact-problem') {
    const allowed = new Set(['--task', '--preview', '--maximum-bytes', '--proposal-stdin']);
    const seen = new Set();
    for (let i = 0; i < args.length; i += 1) {
      if (!allowed.has(args[i]) || seen.has(args[i])) throw new Error('PROBLEM_COMPACTION_ARGUMENT_INVALID');
      const flag = args[i]; seen.add(flag);
      if (['--task', '--maximum-bytes'].includes(flag) && (!args[++i] || args[i].startsWith('--'))) throw new Error('PROBLEM_COMPACTION_ARGUMENT_INVALID');
    }
    if (!seen.has('--task') || !seen.has('--preview')) throw new Error('PROBLEM_COMPACTION_PREVIEW_REQUIRED');
    let proposal = null;
    if (seen.has('--proposal-stdin')) {
      // Read a bounded proposal only; it is never an executable command.
      const buffer = Buffer.alloc(65537); let length = 0, count;
      while (length < buffer.length && (count = fs.readSync(0, buffer, length, buffer.length - length, null)) > 0) length += count;
      if (length > 65536) throw new Error('PROBLEM_COMPACTION_PROPOSAL_LIMIT');
      proposal = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
      if (!proposal || typeof proposal !== 'object' || Array.isArray(proposal)) throw new Error('PROBLEM_COMPACTION_PROPOSAL_INVALID');
    }
    return printJson(previewProblemCompaction(WORKSPACE_ROOT, {
      task_id: optionValue(args, '--task'), proposal,
      maximum_bytes: optionValue(args, '--maximum-bytes') === null ? 32768 : Number(optionValue(args, '--maximum-bytes')),
    }));
  }
  if (command === 'orient') {
    const taskId = optionValue(args, '--task');
    const result = buildIntuitiveContext(WORKSPACE_ROOT, {
      task_ids: taskId ? [taskId] : [], after: optionValue(args, '--after'),
      maximum_bytes: optionValue(args, '--maximum-bytes') === null ? 12288 : Number(optionValue(args, '--maximum-bytes')),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'problems') {
    // Compact output is measured in this exact serialization, including LF.
    const withEvidence = parseFlag(args, '--evidence');
    const result = (withEvidence ? buildProblemProjection : readProblemContext)(WORKSPACE_ROOT, {
      task_id: optionValue(args, '--task'), after: optionValue(args, '--after'),
      maximum_bytes: optionValue(args, '--maximum-bytes') === null ? (withEvidence ? 6144 : 8192) : Number(optionValue(args, '--maximum-bytes')),
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }
  if (command === 'context') {
    const taskSpec = optionValue(args, '--task-spec');
    if (!taskSpec) usage();
    return printJson(compileContext(taskSpec));
  }
  if (command === 'context-audit') return printJson(readContextAudit(optionValue(args, '--task')));
  if (command === 'consolidate') {
    if (!parseFlag(args, '--run-once')) usage();
    return printJson(consolidateRuntime());
  }
  if (command === 'promote') {
    if (!args[0]) usage();
    return printJson(promotionTransaction(args[0], { approve: parseFlag(args, '--approve'), approve_high_risk: parseFlag(args, '--approve-high-risk') }));
  }
  if (['rollback', 'revoke', 'restore'].includes(command)) {
    if (!args[0]) usage();
    const operation = { rollback: 'apfc_rollback', revoke: 'apfc_revoke', restore: 'apfc_restore' }[command];
    return printJson(governedTransition(operation, args[0], { approve: parseFlag(args, '--approve'), reason: optionValue(args, '--reason') }));
  }
  if (command === 'graphify') {
    const subcommand = args[0];
    const apfcDir = path.join(MDOS_ROOT, 'ops', 'apfc', 'executive');
    if (subcommand === 'build') return printJson(buildGraphifyFromFiles(apfcDir));
    if (subcommand === 'open') {
      const view = optionValue(args, '--view');
      if (!['executive_state', 'episode_timeline', 'learning_lineage', 'path_consolidation', 'epistemic_health'].includes(view)) usage();
      const filePath = path.join(apfcDir, 'graphify', `${view}.html`);
      if (!fs.existsSync(filePath)) buildGraphifyFromFiles(apfcDir);
      const result = spawnSync('xdg-open', [filePath], { stdio: 'ignore' });
      if (result.status !== 0) throw new Error('APFC_GRAPHIFY_LOCAL_OPEN_FAILED');
      return printJson({ ok: true, mode: 'apfc_graphify_open', view_id: view, file: rel(filePath) });
    }
  }
  usage();
}

if (require.main === module) {
  try { main(); } catch (error) { printJson({ ok: false, error: error.message }); process.exitCode = 1; }
}

module.exports = {
  compileContext,
  readContextAudit,
  consolidateRuntime,
  governedTransition,
  promotionTransaction,
  receiptForGovernance,
  statusReadback,
  verifyRuntime,
  writeContextIndex,
};
