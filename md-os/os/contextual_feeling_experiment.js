#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir } = require('./lib/fs_runtime');

function normalize(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function contextText(context) {
  return normalize([
    context.goal,
    ...context.relevant_memory,
    ...context.uncertainty,
    ...context.possible_consequences,
  ].join(' '));
}

function validateTask(task) {
  if (!task || task.schema_version !== 1) throw new Error('CONTEXTUAL_FEELING_INVALID_SCHEMA_VERSION');
  if (typeof task.experiment_id !== 'string' || !/^[a-z0-9_]+$/.test(task.experiment_id)) throw new Error('CONTEXTUAL_FEELING_INVALID_EXPERIMENT_ID');
  if (typeof task.question !== 'string' || !task.question.trim()) throw new Error('CONTEXTUAL_FEELING_INVALID_QUESTION');
  if (typeof task.control_action !== 'string' || !task.control_action.trim()) throw new Error('CONTEXTUAL_FEELING_INVALID_CONTROL_ACTION');
  if (!Array.isArray(task.cases) || task.cases.length < 2) throw new Error('CONTEXTUAL_FEELING_REQUIRES_CASES');
  if (!Array.isArray(task.limitations) || !task.limitations.length) throw new Error('CONTEXTUAL_FEELING_REQUIRES_LIMITATIONS');
  const ids = new Set();
  for (const item of task.cases) {
    if (!item || typeof item.case_id !== 'string' || !/^[a-z0-9_]+$/.test(item.case_id) || ids.has(item.case_id)) throw new Error('CONTEXTUAL_FEELING_INVALID_CASE_ID');
    ids.add(item.case_id);
    if (typeof item.perception !== 'string' || !item.perception.trim()) throw new Error('CONTEXTUAL_FEELING_INVALID_PERCEPTION');
    if (!item.context || typeof item.context.goal !== 'string') throw new Error('CONTEXTUAL_FEELING_INVALID_CONTEXT');
    for (const field of ['relevant_memory', 'uncertainty', 'possible_consequences']) if (!Array.isArray(item.context[field])) throw new Error(`CONTEXTUAL_FEELING_INVALID_${field.toUpperCase()}`);
    if (!Array.isArray(item.context_rules) || !item.context_rules.length) throw new Error('CONTEXTUAL_FEELING_REQUIRES_RULES');
    if (typeof item.expected_action !== 'string' || !item.expected_action.trim()) throw new Error('CONTEXTUAL_FEELING_INVALID_EXPECTED_ACTION');
  }
  return task;
}

function chooseFromContext(item, fallbackAction) {
  const text = contextText(item.context);
  const matched = item.context_rules.find((rule) => (
    Array.isArray(rule.all_terms)
    && rule.all_terms.length
    && rule.all_terms.every((term) => text.includes(normalize(term)))
  ));
  return matched ? matched.action : fallbackAction;
}

function compare(task, timestamp = nowIso()) {
  validateTask(task);
  const cases = task.cases.map((item) => {
    const controlAction = task.control_action;
    const contextualAction = chooseFromContext(item, task.control_action);
    return {
      case_id: item.case_id,
      perception: item.perception,
      integrated_context: item.context,
      control_action: controlAction,
      contextual_action: contextualAction,
      expected_action: item.expected_action,
      control_correct: controlAction === item.expected_action,
      contextual_correct: contextualAction === item.expected_action,
    };
  });
  const controlCorrect = cases.filter((item) => item.control_correct).length;
  const contextualCorrect = cases.filter((item) => item.contextual_correct).length;
  const controlAccuracy = Number((controlCorrect / cases.length).toFixed(4));
  const contextualAccuracy = Number((contextualCorrect / cases.length).toFixed(4));
  const delta = Number((contextualAccuracy - controlAccuracy).toFixed(4));
  const perceptions = new Map();
  for (const item of cases) {
    const key = normalize(item.perception);
    if (!perceptions.has(key)) perceptions.set(key, new Set());
    perceptions.get(key).add(item.contextual_action);
  }
  const sameSignalDifferentAction = [...perceptions.values()].some((actions) => actions.size > 1);
  const improved = contextualCorrect === cases.length && delta > 0 && sameSignalDifferentAction;
  return {
    schema_version: 1,
    experiment_id: task.experiment_id,
    completed_at: timestamp,
    method: 'paired_signal_only_vs_integrated_context_v1',
    cases,
    metrics: {
      case_count: cases.length,
      control_correct: controlCorrect,
      contextual_correct: contextualCorrect,
      control_accuracy: controlAccuracy,
      contextual_accuracy: contextualAccuracy,
      accuracy_delta: delta,
      same_signal_different_action: sameSignalDifferentAction,
      context_improved_choice: improved,
    },
    verdict: improved ? 'verified_contextual_effect' : 'no_verified_contextual_effect',
    supported_claim: improved
      ? 'In this controlled fixture, integrated context gave the same perception different useful meanings and improved action selection.'
      : 'This fixture did not verify that integrated context improved action selection.',
    limitations: task.limitations,
  };
}

function markdown(report) {
  return [
    `# Contextual Feeling Experiment: ${report.experiment_id}`,
    '',
    `Verdict: \`${report.verdict}\``,
    '',
    `Signal-only accuracy: \`${report.metrics.control_accuracy}\``,
    '',
    `Contextual accuracy: \`${report.metrics.contextual_accuracy}\``,
    '',
    `Accuracy delta: \`${report.metrics.accuracy_delta}\``,
    '',
    `Same signal, different contextual action: \`${report.metrics.same_signal_different_action}\``,
    '',
    report.supported_claim,
    '',
    'This is evidence of a bounded operational contextual effect, not evidence of phenomenal experience.',
    '',
  ].join('\n');
}

function runOnce(taskArg) {
  const taskPath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, taskArg));
  const task = validateTask(JSON.parse(fs.readFileSync(taskPath, 'utf8')));
  const report = compare(task);
  const outputDir = path.join(MDOS_ROOT, 'ops', 'experiments', 'contextual_feeling', task.experiment_id);
  ensureDir(outputDir);
  const reportFile = path.join(outputDir, 'report.json');
  atomicWriteJson(reportFile, report);
  atomicWriteText(path.join(outputDir, 'report.md'), markdown(report));
  return {
    ok: report.verdict === 'verified_contextual_effect',
    mode: 'contextual_feeling_experiment_run_once',
    experiment_id: task.experiment_id,
    verdict: report.verdict,
    metrics: report.metrics,
    report: path.relative(WORKSPACE_ROOT, reportFile).replace(/\\/g, '/'),
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'run-once' || !argv[1]) throw new Error('Usage: contextual_feeling_experiment.js run-once <task.json>');
  printJson(runOnce(argv[1]));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { chooseFromContext, compare, contextText, validateTask };
