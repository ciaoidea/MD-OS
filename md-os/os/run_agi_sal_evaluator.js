#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { printJson, shortText } = require('./lib/common');
const {
  DEFAULT_REQUEST_JSON,
  DEFAULT_SCORE_JSON,
  DEFAULT_SCORE_MD,
  DEFAULT_SOURCE_MANIFEST_JSON,
  buildExternalScore,
  buildInternalScore,
  createEvaluationRequest,
  loadExternalReports,
  loadTrustStore,
  writeScore,
} = require('../kernel/cognition/agi_sal_evaluator');

function usage() {
  process.stderr.write([
    'Usage:',
    '  mdos agi score',
    '  mdos agi score --report <signed_report.json> [--report <second.json>] --trust-store <external_trust_store.json>',
    '  mdos agi certify --report <signed_report.json> [--report <second.json>] --trust-store <external_trust_store.json>',
    '  mdos agi evaluation-request [--output <request.json>] [--manifest <source_manifest.json>]',
    '',
  ].join('\n'));
  process.exit(2);
}

function parseOptions(args) {
  const options = {
    command: 'score',
    reports: [],
    trust_store: '',
    output_json: DEFAULT_SCORE_JSON,
    output_md: DEFAULT_SCORE_MD,
    request_output: DEFAULT_REQUEST_JSON,
    manifest_output: DEFAULT_SOURCE_MANIFEST_JSON,
  };
  const normalized = args.slice();
  if (normalized[0] && !normalized[0].startsWith('-')) options.command = shortText(normalized.shift());
  for (let index = 0; index < normalized.length; index += 1) {
    const arg = normalized[index];
    const next = () => normalized[++index] || '';
    if (arg === '--report') options.reports.push(next());
    else if (arg.startsWith('--report=')) options.reports.push(arg.slice('--report='.length));
    else if (arg === '--trust-store') options.trust_store = next();
    else if (arg.startsWith('--trust-store=')) options.trust_store = arg.slice('--trust-store='.length);
    else if (arg === '--output-json') options.output_json = next();
    else if (arg.startsWith('--output-json=')) options.output_json = arg.slice('--output-json='.length);
    else if (arg === '--output-md') options.output_md = next();
    else if (arg.startsWith('--output-md=')) options.output_md = arg.slice('--output-md='.length);
    else if (arg === '--output') options.request_output = next();
    else if (arg.startsWith('--output=')) options.request_output = arg.slice('--output='.length);
    else if (arg === '--manifest') options.manifest_output = next();
    else if (arg.startsWith('--manifest=')) options.manifest_output = arg.slice('--manifest='.length);
    else usage();
  }
  options.reports = options.reports.map((item) => path.resolve(item));
  if (options.trust_store) options.trust_store = path.resolve(options.trust_store);
  options.output_json = path.resolve(options.output_json);
  options.output_md = path.resolve(options.output_md);
  options.request_output = path.resolve(options.request_output);
  options.manifest_output = path.resolve(options.manifest_output);
  return options;
}

function main() {
  try {
    const options = parseOptions(process.argv.slice(2));
    if (['evaluation-request', 'request', 'freeze'].includes(options.command)) {
      const result = createEvaluationRequest({
        outputJson: options.request_output,
        manifestJson: options.manifest_output,
      });
      printJson({
        ok: true,
        mode: 'agi_sal_evaluation_request',
        ...result,
      });
      return;
    }
    if (!['score', 'certify', 'status'].includes(options.command)) usage();

    let score;
    if (options.reports.length) {
      if (!options.trust_store) throw new Error('AGI_SAL_TRUST_STORE_REQUIRED');
      const reports = loadExternalReports(options.reports);
      const trustStore = loadTrustStore(options.trust_store);
      score = buildExternalScore(reports, trustStore);
    } else {
      if (options.command === 'certify') throw new Error('AGI_SAL_EXTERNAL_REPORTS_REQUIRED');
      score = buildInternalScore();
    }
    const outputs = writeScore(score, options.output_json, options.output_md);
    printJson({
      ok: score.evidence_level !== 'externally_failed',
      mode: 'agi_sal_score',
      sal_score: score.sal_score,
      score_cap: score.score_cap,
      evidence_level: score.evidence_level,
      operational_agi_claim_supported: score.claim_state.operational_agi_claim_supported,
      ...outputs,
    });
  } catch (error) {
    printJson({
      ok: false,
      mode: 'agi_sal_score',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { parseOptions };
