#!/usr/bin/env node
'use strict';

const { printJson, shortText } = require('./lib/common');
const {
  runAgiEvidenceSuite,
  runCampaignSegment,
} = require('../kernel/cognition/agi_evidence_suite');

function usage() {
  process.stderr.write([
    'Usage:',
    '  mdos agi prove [--experiment-id <append_only_id>] [--cycles <24..256>] [--sessions <2..16>]',
    '  node md-os/os/run_agi_evidence_suite.js [--experiment-id <id>] [--cycles <n>] [--sessions <n>]',
    '',
  ].join('\n'));
  process.exit(2);
}

function parseInteger(value, label) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label}_INVALID: ${value}`);
  return parsed;
}

function parseOptions(args) {
  const options = {
    experiment_id: '',
    cycles: 96,
    sessions: 6,
    campaign_worker: false,
    session_id: '',
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = () => args[++index] || '';
    if (arg === '--experiment-id') options.experiment_id = shortText(next());
    else if (arg.startsWith('--experiment-id=')) options.experiment_id = shortText(arg.slice('--experiment-id='.length));
    else if (arg === '--cycles') options.cycles = parseInteger(next(), 'AGI_EVIDENCE_CYCLES');
    else if (arg.startsWith('--cycles=')) options.cycles = parseInteger(arg.slice('--cycles='.length), 'AGI_EVIDENCE_CYCLES');
    else if (arg === '--sessions') options.sessions = parseInteger(next(), 'AGI_EVIDENCE_SESSIONS');
    else if (arg.startsWith('--sessions=')) options.sessions = parseInteger(arg.slice('--sessions='.length), 'AGI_EVIDENCE_SESSIONS');
    else if (arg === '--campaign-worker') options.campaign_worker = true;
    else if (arg === '--session-id') options.session_id = shortText(next());
    else if (arg.startsWith('--session-id=')) options.session_id = shortText(arg.slice('--session-id='.length));
    else usage();
  }
  return options;
}

function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (options.campaign_worker) {
      if (!options.experiment_id || !options.session_id) usage();
      const session = runCampaignSegment({
        experimentId: options.experiment_id,
        sessionId: options.session_id,
        cycles: options.cycles,
      });
      printJson({ ok: true, mode: 'agi_campaign_worker', session });
      return;
    }
    printJson(runAgiEvidenceSuite(options));
  } catch (error) {
    printJson({
      ok: false,
      mode: 'agi_evidence_suite',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions };
