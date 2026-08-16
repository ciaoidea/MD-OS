#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  sha256Json,
  synthesizeBottomUp,
  synthesizeEnumerative,
} = require('../kernel/cognition/general_program_synthesis');

const FORBIDDEN_KEYS = new Set([
  'target_program',
  'target_program_hash',
  'target_sketch',
  'hidden_tests',
  'oracle',
  'oracle_digest',
  'holdout_answers',
  'ground_truth_program',
]);

function parseArgs(args) {
  let requestPath = '';
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--request') requestPath = args[++index] || '';
    else if (arg.startsWith('--request=')) requestPath = arg.slice('--request='.length);
    else throw new Error(`GENERAL_SYNTHESIS_WORKER_ARGUMENT_INVALID: ${arg}`);
  }
  if (!requestPath) throw new Error('GENERAL_SYNTHESIS_WORKER_REQUEST_REQUIRED');
  return { requestPath: path.resolve(requestPath) };
}

function forbiddenPaths(value, prefix = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenPaths(item, `${prefix}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, item] of Object.entries(value)) {
    const next = `${prefix}.${key}`;
    if (FORBIDDEN_KEYS.has(key)) findings.push(next);
    forbiddenPaths(item, next, findings);
  }
  return findings;
}

function main() {
  try {
    const { requestPath } = parseArgs(process.argv.slice(2));
    const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    const forbidden = forbiddenPaths(request);
    if (forbidden.length) {
      throw new Error(`GENERAL_SYNTHESIS_FORBIDDEN_FIELDS: ${forbidden.join(',')}`);
    }
    if (!request.public_task || typeof request.public_task !== 'object') {
      throw new Error('GENERAL_SYNTHESIS_PUBLIC_TASK_REQUIRED');
    }
    const mode = String(request.mode || 'bottom_up');
    const options = request.options && typeof request.options === 'object' ? request.options : {};
    let result;
    if (mode === 'enumerative') result = synthesizeEnumerative(request.public_task, options);
    else if (mode === 'bottom_up') result = synthesizeBottomUp(request.public_task, options);
    else throw new Error(`GENERAL_SYNTHESIS_MODE_UNSUPPORTED: ${mode}`);
    process.stdout.write(`${JSON.stringify({
      ok: true,
      mode,
      request_hash: sha256Json(request),
      public_task_hash: sha256Json(request.public_task),
      pid: process.pid,
      result,
      oracle_access: 'denied',
    })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({
      ok: false,
      error: String(error && error.message || error),
      oracle_access: 'denied',
    })}\n`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = { forbiddenPaths, parseArgs };
