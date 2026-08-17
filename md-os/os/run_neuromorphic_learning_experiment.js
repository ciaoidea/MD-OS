#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const { runNeuromorphicLearningExperiment } = require('../kernel/cognition/neuromorphic_learning');

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex agi accelerate [--experiment-id <append_only_id>]',
    '  node md-os/os/run_neuromorphic_learning_experiment.js [--experiment-id <append_only_id>]',
    '',
  ].join('\n'));
  process.exit(2);
}

function parseOptions(args) {
  const options = { experiment_id: '' };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--experiment-id') options.experiment_id = shortText(next());
    else if (arg.startsWith('--experiment-id=')) options.experiment_id = shortText(arg.slice('--experiment-id='.length));
    else usage();
  }
  return options;
}

function main() {
  try {
    printJson(runNeuromorphicLearningExperiment(parseOptions(process.argv.slice(2))));
  } catch (error) {
    printJson({
      ok: false,
      mode: 'neuromorphic_learning_experiment',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions };
