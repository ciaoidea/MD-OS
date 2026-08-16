#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { printJson, shortText } = require('./lib/common');
const {
  solvePublicTask,
} = require('../kernel/cognition/agi_capability_lab');

function usage() {
  process.stderr.write('Usage: node md-os/os/agi_capability_worker.js --request <request.json>\n');
  process.exit(2);
}

function main() {
  try {
    const args = process.argv.slice(2);
    const index = args.indexOf('--request');
    if (index < 0 || !args[index + 1]) usage();
    const requestPath = path.resolve(args[index + 1]);
    const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
    if (request.schema_version !== 1 || !Array.isArray(request.public_tasks)) {
      throw new Error('CAPABILITY_WORKER_REQUEST_INVALID');
    }
    const results = request.public_tasks.map((publicTask) => solvePublicTask({
      configuration: request.configuration,
      publicTask,
      memory: request.memory,
      attemptBudget: request.options && request.options.attempt_budget || 1,
      exploration: Boolean(request.options && request.options.exploration),
    }));
    printJson({
      ok: true,
      mode: 'agi_capability_worker',
      pid: process.pid,
      request_id: request.request_id,
      results,
    });
  } catch (error) {
    printJson({
      ok: false,
      mode: 'agi_capability_worker',
      pid: process.pid,
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();
