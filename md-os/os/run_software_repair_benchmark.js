#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const { CONFIGURATIONS, runSoftwareRepairBenchmark } = require('../kernel/cognition/benchmark_runner');
const { generateCandidateSet } = require('../kernel/cognition/candidate_provider');

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex benchmark software-repair generate --case <case.json> --provider <provider.json> [options]',
    '  cortex benchmark software-repair run --case <case.json> (--candidate-set <candidate_set.json> | --provider <provider.json>) [options]',
    '',
    'Options:',
    '  --configuration <baseline_a_single_attempt|baseline_b_retrieval|mdos_learning_exploration|mdos_neuromorphic_skill|mdos_verified_runtime>',
    '  --candidates <candidate_id,candidate_id>',
    '  --provider-run-id <append_only_provider_run_id>',
    '  --run-id <append_only_run_id>',
    '',
    'Inspection:',
    '  cortex benchmark software-repair configurations',
  ].join('\n') + '\n');
  process.exit(2);
}

function parseOptions(args) {
  const options = {
    case_path: '',
    candidate_set_path: '',
    provider_path: '',
    provider_run_id: '',
    configuration_id: 'mdos_verified_runtime',
    candidate_ids: [],
    run_id: '',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--case') options.case_path = next();
    else if (arg.startsWith('--case=')) options.case_path = arg.slice('--case='.length);
    else if (arg === '--candidate-set') options.candidate_set_path = next();
    else if (arg.startsWith('--candidate-set=')) options.candidate_set_path = arg.slice('--candidate-set='.length);
    else if (arg === '--provider') options.provider_path = next();
    else if (arg.startsWith('--provider=')) options.provider_path = arg.slice('--provider='.length);
    else if (arg === '--provider-run-id') options.provider_run_id = next();
    else if (arg.startsWith('--provider-run-id=')) options.provider_run_id = arg.slice('--provider-run-id='.length);
    else if (arg === '--configuration') options.configuration_id = next();
    else if (arg.startsWith('--configuration=')) options.configuration_id = arg.slice('--configuration='.length);
    else if (arg === '--candidates') options.candidate_ids = next().split(',').map(shortText).filter(Boolean);
    else if (arg.startsWith('--candidates=')) options.candidate_ids = arg.slice('--candidates='.length).split(',').map(shortText).filter(Boolean);
    else if (arg === '--run-id') options.run_id = next();
    else if (arg.startsWith('--run-id=')) options.run_id = arg.slice('--run-id='.length);
    else throw new Error(`UNKNOWN_SOFTWARE_REPAIR_BENCHMARK_OPTION: ${arg}`);
  }
  if (!options.case_path || Boolean(options.candidate_set_path) === Boolean(options.provider_path)) usage();
  return options;
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'configurations' || command === 'configuration') {
    printJson({
      ok: true,
      mode: 'software_repair_benchmark_configurations',
      configurations: Object.values(CONFIGURATIONS),
    });
    return;
  }
  if (!['generate', 'run'].includes(command)) usage();
  try {
    const options = parseOptions(args);
    if (command === 'generate') {
      if (!options.provider_path || options.candidate_ids.length || options.run_id) usage();
      printJson(generateCandidateSet(options));
      return;
    }
    let providerResult = null;
    if (options.provider_path) {
      providerResult = generateCandidateSet(options);
      options.candidate_set_path = providerResult.candidate_set_file;
    }
    const result = runSoftwareRepairBenchmark(options);
    printJson(providerResult ? {
      ...result,
      provider_run_id: providerResult.provider_run_id,
      provider_receipt_file: providerResult.provider_receipt_file,
      generated_candidate_set_file: providerResult.candidate_set_file,
      strategy_diversity_passed: providerResult.strategy_diversity_passed,
      configuration_fidelity_passed: providerResult.configuration_fidelity_passed,
    } : result);
  } catch (error) {
    printJson({
      ok: false,
      mode: 'software_repair_benchmark_run',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions };
