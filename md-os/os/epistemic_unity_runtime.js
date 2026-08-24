#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { WORKSPACE_ROOT, printJson, shortText } = require('./lib/common');
const {
  sealEpistemicUnityCandidate,
  verifyEpistemicUnityCandidate,
} = require('../kernel/cognition/epistemic_unity_verifier');

function readStdinJson() {
  const input = fs.readFileSync(0, 'utf8').trim();
  if (!input) throw new Error('EPISTEMIC_UNITY_STDIN_REQUIRED');
  return JSON.parse(input);
}

function main() {
  const [command] = process.argv.slice(2);
  try {
    const input = readStdinJson();
    if (command === 'seal') {
      printJson(sealEpistemicUnityCandidate(input));
      return;
    }
    if (command === 'verify') {
      printJson(verifyEpistemicUnityCandidate(input, { workspace_root: WORKSPACE_ROOT }));
      return;
    }
    throw new Error('USAGE: epistemic_unity_runtime <seal|verify>');
  } catch (error) {
    printJson({ ok: false, mode: 'epistemic_unity', error: shortText(error && error.message || error) });
    process.exitCode = 1;
  }
}

if (require.main === module) main();
