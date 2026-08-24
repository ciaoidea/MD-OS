#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const { printJson, shortText } = require('./lib/common');
const {
  closeOperationalUnityTensor,
  prepareOperationalUnityTensor,
} = require('../kernel/cognition/apfc_operational_unity_tensor');

function readStdinJson() {
  const text = fs.readFileSync(0, 'utf8').trim();
  if (!text) throw new Error('APFC_OPERATIONAL_UNITY_STDIN_REQUIRED');
  return JSON.parse(text);
}

function prepareTurnInput(input) {
  const selectedSourceCount = Number.isInteger(input.selected_source_count)
    ? Math.max(0, input.selected_source_count)
    : 0;
  const goalPresent = input.goal_present === true;
  return {
    schema_version: 1,
    frame_id: input.frame_id,
    input_hash: input.input_hash,
    authority_hash: input.authority_hash,
    channels: {
      operational_self_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
      world_observation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: false },
      goal_refs: { count: Number(goalPresent), present: goalPresent, authority_declared: goalPresent, verifier_backed: false },
      memory_refs: { count: selectedSourceCount, present: selectedSourceCount > 0, authority_declared: false, verifier_backed: false },
      frame_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
      transformation_refs: { count: 1, present: true, authority_declared: true, verifier_backed: true },
      action_refs: { count: 0, present: false, authority_declared: false, verifier_backed: false },
      evidence_refs: { count: 0, present: false, authority_declared: false, verifier_backed: false },
    },
  };
}

function main() {
  const [command] = process.argv.slice(2);
  try {
    const input = readStdinJson();
    if (command === 'prepare') {
      printJson(prepareOperationalUnityTensor(prepareTurnInput(input)));
      return;
    }
    if (command === 'close') {
      printJson(closeOperationalUnityTensor(input));
      return;
    }
    throw new Error('USAGE: apfc_turn_unity_runtime <prepare|close>');
  } catch (error) {
    printJson({
      ok: false,
      mode: 'apfc_turn_governance_tensor',
      error: shortText(error && error.message || error),
    });
    process.exitCode = 1;
  }
}

if (require.main === module) main();
