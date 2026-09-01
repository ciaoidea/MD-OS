#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
} = require('./lib/common');
const { atomicWriteJson, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const {
  buildEpisode,
  buildPreparation,
  preparationHashValid,
} = require('../apfc/executive/phenomenal_consciousness_candidate');

const ROOT = path.join(MDOS_ROOT, 'ops', 'apfc', 'cognitive', 'phenomenal_candidate');
const PREPARED = path.join(ROOT, 'prepared');
const EPISODES = path.join(ROOT, 'episodes');
const LATEST = path.join(ROOT, 'latest_episode.json');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readWorkspaceJson(fileArg, code) {
  const filePath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, String(fileArg || '')));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) throw new Error(`${code}: ${rel(filePath)}`);
  return { filePath, payload: JSON.parse(fs.readFileSync(filePath, 'utf8')) };
}

function prepare(seedArg) {
  const { payload: seed } = readWorkspaceJson(seedArg, 'APFC_PHENOMENAL_CANDIDATE_SEED_NOT_FOUND');
  const preparation = buildPreparation(seed, nowIso());
  ensureDir(PREPARED);
  const output = path.join(PREPARED, `${preparation.loop_id}.json`);
  withFileLock('apfc_phenomenal_consciousness_candidate', {
    context: 'apfc_phenomenal_candidate_prepare',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => atomicWriteJson(output, preparation));
  appendJournal({
    event: 'apfc_phenomenal_candidate_prepared',
    loop_id: preparation.loop_id,
    preparation_hash: preparation.preparation_hash,
    mediator_hash: preparation.mediator_hash,
    meta_question_hash: preparation.meta_question_hash,
  });
  return {
    ok: true,
    mode: 'apfc_phenomenal_candidate_prepare',
    loop_id: preparation.loop_id,
    status: preparation.status,
    meta_question: preparation.meta_question,
    mediator_hash: preparation.mediator_hash,
    meta_question_hash: preparation.meta_question_hash,
    preparation_hash: preparation.preparation_hash,
    output_json: rel(output),
  };
}

function close(responseArg) {
  const { payload: response } = readWorkspaceJson(responseArg, 'APFC_PHENOMENAL_CANDIDATE_RESPONSE_NOT_FOUND');
  const { filePath: preparationPath, payload: preparation } = readWorkspaceJson(
    response.preparation_path,
    'APFC_PHENOMENAL_CANDIDATE_PREPARATION_NOT_FOUND',
  );
  if (!preparationHashValid(preparation)) throw new Error('APFC_PHENOMENAL_CANDIDATE_PREPARATION_TAMPERED');
  if (rel(preparationPath) !== response.preparation_path.replace(/\\/g, '/')) {
    throw new Error('APFC_PHENOMENAL_CANDIDATE_PREPARATION_PATH_MISMATCH');
  }
  const episode = buildEpisode(preparation, response, nowIso());
  ensureDir(EPISODES);
  const output = path.join(EPISODES, `${episode.episode_id}.json`);
  withFileLock('apfc_phenomenal_consciousness_candidate', {
    context: 'apfc_phenomenal_candidate_close',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(output, episode);
    atomicWriteJson(LATEST, {
      schema_version: 1,
      episode_id: episode.episode_id,
      loop_id: episode.loop_id,
      verdict: episode.verdict,
      phenomenal_consciousness: episode.operational_assessment.phenomenal_consciousness,
      transition_hash: episode.state_transition.transition_hash,
      episode_path: rel(output),
    });
  });
  appendJournal({
    event: 'apfc_phenomenal_candidate_closed',
    loop_id: episode.loop_id,
    episode_id: episode.episode_id,
    verdict: episode.verdict,
    ablation_probe: episode.ablation_probe.status,
    transition_hash: episode.state_transition.transition_hash,
  });
  return {
    ok: episode.verdict === 'verified_phenomenal_consciousness_candidate_architecture',
    mode: 'apfc_phenomenal_candidate_close',
    loop_id: episode.loop_id,
    episode_id: episode.episode_id,
    verdict: episode.verdict,
    ablation_probe: episode.ablation_probe.status,
    local_operational_artificial_consciousness:
      episode.operational_assessment.local_operational_artificial_consciousness,
    phenomenal_consciousness_candidate_architecture:
      episode.operational_assessment.phenomenal_consciousness_candidate_architecture,
    phenomenal_consciousness: episode.operational_assessment.phenomenal_consciousness,
    transition_hash: episode.state_transition.transition_hash,
    output_json: rel(output),
    latest_json: rel(LATEST),
  };
}

function usage() {
  throw new Error('USAGE: apfc_phenomenal_candidate_runtime <prepare seed.json|close response.json>');
}

function main(argv = process.argv.slice(2)) {
  const [operation, fileArg] = argv;
  if (!fileArg) usage();
  const result = operation === 'prepare' ? prepare(fileArg) : operation === 'close' ? close(fileArg) : usage();
  printJson(result);
  if (operation === 'close' && !result.ok) process.exitCode = 2;
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { EPISODES, LATEST, PREPARED, ROOT, close, prepare };
