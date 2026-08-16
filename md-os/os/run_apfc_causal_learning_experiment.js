#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const {
  runCausalLearningExperiment,
  verifyCausalLearningExperiment,
} = require('../kernel/cognition/apfc_causal_learning_experiment');

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/run_apfc_causal_learning_experiment.js --experiment-id <id> [options]',
    '  node md-os/os/run_apfc_causal_learning_experiment.js verify --report <report.json>',
    '',
    'Options:',
    '  --model <codex_model>       default: gpt-5.4',
    '  --protocol <preset>         kestrel9 (default) or orion17',
    '  --holdouts <count>          minimum/default: 30',
    '  --trials <count>            minimum/default: 3',
    '  --concurrency <count>       default: 6, maximum: 12',
    '  --timeout-ms <milliseconds> default: 90000 per invocation',
    '',
    'This is a bounded run-once experiment. It never promotes the candidate skill automatically.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseOptions(args) {
  const options = {
    experiment_id: '',
    model: 'gpt-5.4',
    protocol_preset: 'kestrel9',
    holdout_count: 30,
    trial_count: 3,
    concurrency: 6,
    timeout_ms: 90000,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--experiment-id') options.experiment_id = shortText(next());
    else if (arg.startsWith('--experiment-id=')) options.experiment_id = shortText(arg.slice('--experiment-id='.length));
    else if (arg === '--model') options.model = shortText(next());
    else if (arg.startsWith('--model=')) options.model = shortText(arg.slice('--model='.length));
    else if (arg === '--protocol') options.protocol_preset = shortText(next());
    else if (arg.startsWith('--protocol=')) options.protocol_preset = shortText(arg.slice('--protocol='.length));
    else if (arg === '--holdouts') options.holdout_count = Number(next());
    else if (arg.startsWith('--holdouts=')) options.holdout_count = Number(arg.slice('--holdouts='.length));
    else if (arg === '--trials') options.trial_count = Number(next());
    else if (arg.startsWith('--trials=')) options.trial_count = Number(arg.slice('--trials='.length));
    else if (arg === '--concurrency') options.concurrency = Number(next());
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg === '--timeout-ms') options.timeout_ms = Number(next());
    else if (arg.startsWith('--timeout-ms=')) options.timeout_ms = Number(arg.slice('--timeout-ms='.length));
    else usage();
  }
  if (!options.experiment_id) usage();
  return options;
}

function parseVerifyOptions(args) {
  let report = '';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--report') report = next();
    else if (arg.startsWith('--report=')) report = arg.slice('--report='.length);
    else usage();
  }
  if (!report) usage();
  return { report };
}

async function main() {
  try {
    if (process.argv[2] === 'verify') {
      const { report } = parseVerifyOptions(process.argv.slice(3));
      const result = verifyCausalLearningExperiment(report);
      printJson(result);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    printJson(await runCausalLearningExperiment(parseOptions(process.argv.slice(2))));
  } catch (error) {
    printJson({
      ok: false,
      mode: 'apfc_causal_learning_experiment',
      error: shortText(error && error.stack || error, 4000),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions, parseVerifyOptions };
