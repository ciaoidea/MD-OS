'use strict';

// Readback never executes commands. These hashes certify freshness of the
// declared local verification boundary, not the truth of arbitrary assertions
// or undeclared external state. Legacy / incomplete reports fail closed.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { sha256Json } = require('../../os/lib/common');

function safeFile(root, reference) {
  if (typeof reference !== 'string' || !/^md-os\/(ops|kb|os|kernel|modules)\//.test(reference)
    || reference.includes('\\') || reference.split('/').some(p => !p || p.startsWith('.') || p === 'local')) {
    throw new Error('OUTCOME_SOURCE_SCOPE_INVALID');
  }
  let current = fs.realpathSync(root);
  for (const part of reference.split('/')) {
    current = path.join(current, part);
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('OUTCOME_SOURCE_ALIAS'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return current;
}

function sourceBinding(root, reference) {
  const file = safeFile(root, reference);
  if (!fs.existsSync(file)) return { path: reference, exists: false, sha256: null };
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('OUTCOME_SOURCE_NOT_BOUNDED_FILE');
  return { path: reference, exists: true, sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
}

function readJson(root, reference) {
  const binding = sourceBinding(root, reference);
  if (!binding.exists) throw new Error('OUTCOME_SOURCE_MISSING');
  return JSON.parse(fs.readFileSync(safeFile(root, reference), 'utf8'));
}

function commandBindings(root, task) {
  const references = [...(task.actions || []), ...(task.acceptance_tests || [])];
  if (!references.length) return [];
  const registryPath = 'md-os/ops/connectors/terminal_connector.json';
  const registry = readJson(root, registryPath);
  const sources = new Set([registryPath, ...(task.verification_dependencies || [])]);
  for (const ref of references) {
    const command = (registry.commands || []).find(item => item.command_id === ref.command_id);
    if (ref.connector_id !== 'terminal_executor' || !command || !Array.isArray(command.argv)) throw new Error('OUTCOME_COMMAND_UNREGISTERED');
    // Bind local program entry points as well as inline programs in the registry.
    // Additional imported data/code must be explicitly declared as dependencies.
    for (const arg of command.argv.slice(1)) {
      if (typeof arg !== 'string' || arg.startsWith('-') || !/^[\w./-]+\.(js|cjs|mjs|py|sh)$/.test(arg)) continue;
      sources.add(path.relative(root, path.resolve(root, command.cwd || 'md-os', arg)).split(path.sep).join('/'));
    }
  }
  return [...sources].sort().map(ref => sourceBinding(root, ref));
}

function sealOutcome(report, task, receipts, root, initialCommands) {
  const bound = { ...report, task_spec_id: task.task_spec_id, task_spec_hash: sha256Json(task),
    checked_at: new Date().toISOString(), verification_scope: 'declared_local_contract', bindings: [], binding_errors: [] };
  try {
    if (sha256Json(readJson(root, `md-os/ops/tasks/${task.task_spec_id}.json`)) !== sha256Json(task)) throw new Error('OUTCOME_TASK_CHANGED_DURING_EXECUTION');
    const commands = commandBindings(root, task);
    if (initialCommands && sha256Json(initialCommands) !== sha256Json(commands)) throw new Error('OUTCOME_VERIFIER_CHANGED_DURING_EXECUTION');
    const refs = new Set([
      ...commands.map(item => item.path),
      ...(task.required_evidence || []).map(item => item.path),
      ...(task.observation_targets || []).map(item => item.path),
      ...(task.problem_core?.premises || []).flatMap(item => item.source_refs || []),
      ...(report.evidence || []), ...receipts.flatMap(item => [item.file, ...(item.artifacts || [])]).filter(Boolean),
    ]);
    if (refs.size > 256) throw new Error('OUTCOME_BINDING_BUDGET_EXCEEDED');
    bound.bindings = [...refs].sort().map(ref => sourceBinding(root, ref));
  } catch (error) {
    bound.binding_errors.push(error.message);
    if (bound.outcome === 'verified') { bound.outcome = 'unverified'; bound.status = 'attention'; }
    bound.checks = [...bound.checks, { check_id: 'current_evidence_binding', status: 'attention', message: error.message, evidence: [] }];
  }
  bound.report_hash = sha256Json(bound);
  return bound;
}

function validateOutcome(root, task, report) {
  const fail = reason => ({ resolution: 'unverified', review_required: true, reason,
    verification_id: report?.verification_id || null });
  if (!report || report.verifier_id !== 'deterministic_postcondition_verifier' || report.independent_from_planner !== true
    || report.task_spec_id !== task.task_spec_id || !report.report_hash) return fail('missing_bound_verifier');
  const { report_hash: hash, ...body } = report;
  if (hash !== sha256Json(body)) return fail('verification_report_changed');
  if (report.task_spec_hash !== sha256Json(task)) return fail('task_contract_changed');
  if (!Array.isArray(report.bindings) || report.binding_errors?.length) return fail('incomplete_evidence_binding');
  try {
    if (!Number.isFinite(Date.parse(report.checked_at))) return fail('verification_time_invalid');
    const requiredPaths = new Set([...commandBindings(root, task).map(item => item.path),
      ...(task.required_evidence || []).map(item => item.path), ...(task.observation_targets || []).map(item => item.path),
      ...(task.problem_core?.premises || []).flatMap(item => item.source_refs || []),
      ...(report.evidence || []), ...(report.action_receipt_ids || []).map(id => `md-os/ops/action_receipts/${id}.json`)]);
    if (report.bindings.length > 256 || new Set(report.bindings.map(item => item.path)).size !== report.bindings.length
      || [...requiredPaths].some(ref => !report.bindings.some(item => item.path === ref))) return fail('evidence_binding_incomplete');
    for (const binding of report.bindings) {
      if (sha256Json(sourceBinding(root, binding.path)) !== sha256Json(binding)) return fail(`evidence_changed:${binding.path}`);
    }
    const declared = task.acceptance_tests || [];
    const results = report.acceptance_results || [];
    if (!declared.length || results.length !== declared.length) return fail('acceptance_incomplete');
    for (const [index, test] of declared.entries()) {
      const result = results[index];
      if (result.acceptance_test_id !== test.acceptance_test_id || result.command_id !== test.command_id
        || result.connector_id !== test.connector_id || result.expected_exit_status !== test.expected_exit_status) return fail('acceptance_contract_mismatch');
    }
    const receipts = report.action_receipt_ids || [];
    if (receipts.length > (task.actions || []).length) return fail('action_receipts_incomplete');
    if (receipts.length < (task.actions || []).length) {
      if (report.outcome !== 'failed' || !receipts.length) return fail('action_receipts_incomplete');
      const stopped = readJson(root, `md-os/ops/action_receipts/${receipts.at(-1)}.json`);
      if (!stopped.execution_control?.stop || stopped.status === 'completed') return fail('action_receipts_incomplete');
    }
    for (const [index, id] of receipts.entries()) {
      if (!/^receipt_[\w]+$/.test(id)) return fail('action_receipt_id_invalid');
      const receipt = readJson(root, `md-os/ops/action_receipts/${id}.json`);
      const action = task.actions[index];
      if (receipt.episode_id !== report.episode_id || receipt.action_id !== action.action_id
        || receipt.input_hash !== sha256Json(action)) return fail('action_receipt_mismatch');
      if (report.outcome === 'verified' && (receipt.status !== 'completed' || receipt.exit_status !== action.expected_exit_status
        || receipt.execution_control?.stop || !require('./state_guard').guardReadbackPassed(action, receipt))) return fail('action_not_completed');
    }
    if (report.outcome === 'failed') return { resolution: 'failed', review_required: true, reason: 'latest_verification_failed',
      verification_id: report.verification_id, report_hash: hash };
    if (report.outcome !== 'verified' || report.status !== 'ok' || !report.checks?.length
      || report.checks.some(check => check.status !== 'ok')
      || results.some(result => result.status !== 'passed' || result.observed_exit_status !== result.expected_exit_status)) return fail('verification_not_passed');
    return { resolution: 'resolved', review_required: false, reason: null, verification_id: report.verification_id,
      report_hash: hash, checked_at: report.checked_at, scope: report.verification_scope };
  } catch (error) { return fail(error.message); }
}

function loadOutcomeReports(root) {
  const dir = safeFile(root, 'md-os/ops/verifications');
  if (!fs.existsSync(dir)) return new Map();
  const names = fs.readdirSync(dir).filter(name => /^verification_[\w]+\.json$/.test(name)).sort();
  if (names.length > 10000) throw new Error('OUTCOME_INDEX_BUDGET_EXCEEDED');
  const latest = new Map();
  let bytes = 0;
  for (const name of names) {
    bytes += fs.lstatSync(safeFile(root, `md-os/ops/verifications/${name}`)).size;
    if (bytes > 16777216) throw new Error('OUTCOME_INDEX_SOURCE_BUDGET_EXCEEDED');
    const report = readJson(root, `md-os/ops/verifications/${name}`);
    if (!report.task_spec_id) continue;
    const previous = latest.get(report.task_spec_id);
    if (!previous || String(report.checked_at).localeCompare(String(previous.checked_at)) >= 0) latest.set(report.task_spec_id, report);
  }
  return latest;
}

module.exports = { safeFile, sourceBinding, commandBindings, sealOutcome, validateOutcome, loadOutcomeReports };
