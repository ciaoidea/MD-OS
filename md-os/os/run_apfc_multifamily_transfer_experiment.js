#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const {
  runMultifamilyTransferExperiment,
  verifyMultifamilyTransferExperiment,
} = require('../kernel/cognition/apfc_multifamily_transfer_experiment');

function usage() {
  process.stderr.write([
    'Usage:',
    '  node md-os/os/run_apfc_multifamily_transfer_experiment.js --experiment-id <id> [options]',
    '  node md-os/os/run_apfc_multifamily_transfer_experiment.js verify --report <report.json>',
    '',
    'Options:',
    '  --model <codex_model>       default: gpt-5.4',
    '  --trials <count>            minimum/default: 3',
    '  --concurrency <count>       default: 6, maximum: 12',
    '  --timeout-ms <milliseconds> default: 90000 per invocation',
    '  --max-infrastructure-failure-rate <0..0.05> default: 0.05; failures score zero and are never retried',
    '',
    'This is a bounded run-once, three-condition experiment. It never promotes an experimental skill automatically.',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseOptions(args) {
  const options = {
    experiment_id: '', model: 'gpt-5.4', trial_count: 3, concurrency: 6,
    timeout_ms: 90000, max_infrastructure_failure_rate: 0.05,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--experiment-id') options.experiment_id = shortText(next());
    else if (arg.startsWith('--experiment-id=')) options.experiment_id = shortText(arg.slice('--experiment-id='.length));
    else if (arg === '--model') options.model = shortText(next());
    else if (arg.startsWith('--model=')) options.model = shortText(arg.slice('--model='.length));
    else if (arg === '--trials') options.trial_count = Number(next());
    else if (arg.startsWith('--trials=')) options.trial_count = Number(arg.slice('--trials='.length));
    else if (arg === '--concurrency') options.concurrency = Number(next());
    else if (arg.startsWith('--concurrency=')) options.concurrency = Number(arg.slice('--concurrency='.length));
    else if (arg === '--timeout-ms') options.timeout_ms = Number(next());
    else if (arg.startsWith('--timeout-ms=')) options.timeout_ms = Number(arg.slice('--timeout-ms='.length));
    else if (arg === '--max-infrastructure-failure-rate') options.max_infrastructure_failure_rate = Number(next());
    else if (arg.startsWith('--max-infrastructure-failure-rate=')) options.max_infrastructure_failure_rate = Number(arg.slice('--max-infrastructure-failure-rate='.length));
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
      const result = verifyMultifamilyTransferExperiment(parseVerifyOptions(process.argv.slice(3)).report);
      printJson(result);
      if (!result.ok) process.exitCode = 1;
      return;
    }
    printJson(await runMultifamilyTransferExperiment(parseOptions(process.argv.slice(2))));
  } catch (error) {
    printJson({
      ok: false,
      mode: 'apfc_multifamily_transfer_experiment',
      error: shortText(error && error.stack || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions, parseVerifyOptions };
