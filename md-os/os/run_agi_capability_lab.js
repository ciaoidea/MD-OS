#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const { runCapabilityLab } = require('../kernel/cognition/agi_capability_lab');

function usage() {
  process.stderr.write([
    'Usage:',
    '  mdos agi capability-lab [--experiment-id <id>] [--cycles <n>] [--sessions <n>]',
    '      [--seed <evaluator-seed>] [--wall-minutes <n>] [--cycle-pause-ms <n>]',
    '      [--train-per-family <n>] [--holdout-per-family <n>] [--probe-per-family <n>]',
    '',
  ].join('\n'));
  process.exit(2);
}

function parseOptions(args) {
  const options = {
    experiment_id: '',
    seed: '',
    cycles: 70,
    sessions: 7,
    train_per_family: 12,
    holdout_per_family: 8,
    probe_per_family: 3,
    training_attempt_budget: 3,
    evaluation_attempt_budget: 1,
    wall_minutes: 0,
    cycle_pause_ms: 0,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--experiment-id') options.experiment_id = next();
    else if (arg.startsWith('--experiment-id=')) options.experiment_id = arg.slice('--experiment-id='.length);
    else if (arg === '--seed') options.seed = next();
    else if (arg.startsWith('--seed=')) options.seed = arg.slice('--seed='.length);
    else if (arg === '--cycles') options.cycles = Number(next());
    else if (arg.startsWith('--cycles=')) options.cycles = Number(arg.slice('--cycles='.length));
    else if (arg === '--sessions') options.sessions = Number(next());
    else if (arg.startsWith('--sessions=')) options.sessions = Number(arg.slice('--sessions='.length));
    else if (arg === '--train-per-family') options.train_per_family = Number(next());
    else if (arg.startsWith('--train-per-family=')) options.train_per_family = Number(arg.slice('--train-per-family='.length));
    else if (arg === '--holdout-per-family') options.holdout_per_family = Number(next());
    else if (arg.startsWith('--holdout-per-family=')) options.holdout_per_family = Number(arg.slice('--holdout-per-family='.length));
    else if (arg === '--probe-per-family') options.probe_per_family = Number(next());
    else if (arg.startsWith('--probe-per-family=')) options.probe_per_family = Number(arg.slice('--probe-per-family='.length));
    else if (arg === '--training-attempt-budget') options.training_attempt_budget = Number(next());
    else if (arg.startsWith('--training-attempt-budget=')) options.training_attempt_budget = Number(arg.slice('--training-attempt-budget='.length));
    else if (arg === '--evaluation-attempt-budget') options.evaluation_attempt_budget = Number(next());
    else if (arg.startsWith('--evaluation-attempt-budget=')) options.evaluation_attempt_budget = Number(arg.slice('--evaluation-attempt-budget='.length));
    else if (arg === '--wall-minutes') options.wall_minutes = Number(next());
    else if (arg.startsWith('--wall-minutes=')) options.wall_minutes = Number(arg.slice('--wall-minutes='.length));
    else if (arg === '--cycle-pause-ms') options.cycle_pause_ms = Number(next());
    else if (arg.startsWith('--cycle-pause-ms=')) options.cycle_pause_ms = Number(arg.slice('--cycle-pause-ms='.length));
    else usage();
  }
  for (const key of ['cycles', 'sessions', 'train_per_family', 'holdout_per_family', 'probe_per_family', 'training_attempt_budget', 'evaluation_attempt_budget', 'wall_minutes', 'cycle_pause_ms']) {
    if (!Number.isFinite(options[key]) || options[key] < 0) throw new Error(`CAPABILITY_OPTION_INVALID: ${key}`);
  }
  return options;
}

function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    const report = runCapabilityLab(options);
    printJson({
      ok: report.status === 'ok',
      mode: 'agi_capability_lab',
      experiment_id: report.experiment_id,
      status: report.status,
      internal_capabilities_supported: report.claim_state.internal_capabilities_supported,
      external_proofs_complete: report.claim_state.external_proofs_complete,
      operational_agi_claim_supported: report.claim_state.operational_agi_claim_supported,
      full_holdout_success_rate: report.measurements.full_holdout_success_rate,
      best_control_success_rate: report.measurements.best_control_success_rate,
      added_value_delta: report.measurements.added_value_delta,
      learning_gain: report.measurements.learning_gain,
      average_forgetting: report.measurements.average_forgetting,
      real_wall_clock_minutes: report.measurements.real_wall_clock_minutes,
      report_file: report.evidence.report_file,
    });
  } catch (error) {
    printJson({
      ok: false,
      mode: 'agi_capability_lab',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions };
