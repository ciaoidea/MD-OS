#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { printJson, shortText } = require('./lib/common');
const {
  authorizeCausalUnityAction,
  closeCausalUnityTransition,
  prepareCausalUnityState,
  probeCausalUnityDependency,
  verifyCausalUnityState,
  verifyCausalUnityTransition,
} = require('../kernel/cognition/apfc_causal_unity');

function readStdinJson() {
  const text = fs.readFileSync(0, 'utf8').trim();
  if (!text) throw new Error('APFC_CAUSAL_UNITY_STDIN_REQUIRED');
  return JSON.parse(text);
}

function main() {
  const [command] = process.argv.slice(2);
  try {
    const input = readStdinJson();
    if (command === 'prepare') return printJson(prepareCausalUnityState(input));
    if (command === 'authorize') return printJson(authorizeCausalUnityAction(input));
    if (command === 'close') return printJson(closeCausalUnityTransition(input));
    if (command === 'probe') return printJson(probeCausalUnityDependency(input));
    if (command === 'verify-state') {
      return printJson({ ok: verifyCausalUnityState(input), mode: 'apfc_causal_unity_verify_state' });
    }
    if (command === 'verify-transition') {
      return printJson({ ok: verifyCausalUnityTransition(input), mode: 'apfc_causal_unity_verify_transition' });
    }
    throw new Error('USAGE: apfc_causal_unity_runtime <prepare|authorize|close|probe|verify-state|verify-transition>');
  } catch (error) {
    printJson({
      ok: false,
      mode: 'apfc_causal_unity',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
    return undefined;
  }
}

if (require.main === module) main();
