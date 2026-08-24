#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, assertInsideWorkspace, nowIso, printJson } = require('./lib/common');
const { atomicWriteJson, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const { buildCycle, emptyMemory } = require('../apfc/executive/cognitive_pathfinder');

const ROOT = path.join(MDOS_ROOT, 'ops', 'apfc', 'cognitive', 'pathfinding');
const CYCLES = path.join(ROOT, 'cycles');
const MEMORY = path.join(ROOT, 'anchor_memory.json');
const LATEST = path.join(ROOT, 'latest_cycle.json');

const rel = (filePath) => path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
const readJsonSafe = (filePath, fallback = null) => { try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { return fallback; } };

function runOnce(requestArg) {
  const requestPath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, requestArg));
  if (!fs.existsSync(requestPath)) throw new Error(`APFC_COGNITIVE_PATH_REQUEST_NOT_FOUND: ${requestArg}`);
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  ensureDir(CYCLES);
  const memory = readJsonSafe(MEMORY, emptyMemory());
  const cycle = buildCycle(request, memory, nowIso(), { workspace_root: WORKSPACE_ROOT });
  const cyclePath = path.join(CYCLES, `${cycle.cycle_id}.json`);
  withFileLock('apfc_cognitive_pathfinding', { context: 'apfc_cognitive_path_run_once', timeoutMs: 60000, staleMs: 600000 }, () => {
    atomicWriteJson(cyclePath, { ...cycle, next_memory: undefined });
    atomicWriteJson(MEMORY, cycle.next_memory);
    atomicWriteJson(LATEST, { schema_version: 1, cycle_id: cycle.cycle_id, cycle_path: rel(cyclePath), verdict: cycle.verdict });
  });
  appendJournal({ event: 'apfc_cognitive_path_cycle_completed', cycle_id: cycle.cycle_id, verdict: cycle.verdict, anchor_id: cycle.anchor && cycle.anchor.anchor_id, transition_id: cycle.transition.transition_id });
  return {
    ok: true,
    mode: 'apfc_cognitive_path_run_once',
    cycle_id: cycle.cycle_id,
    verdict: cycle.verdict,
    selected_uncertainty_id: cycle.selected_uncertainty.uncertainty_id,
    selected_action_id: cycle.selected_action && cycle.selected_action.action_id,
    anchor_id: cycle.anchor && cycle.anchor.anchor_id,
    reused_anchor_ids: cycle.reused_anchor_ids,
    outputs: { cycle: rel(cyclePath), memory: rel(MEMORY), latest: rel(LATEST) },
  };
}

function main(argv = process.argv.slice(2)) {
  if (argv[0] !== 'run-once' || !argv[1]) throw new Error('USAGE: apfc_cognitive_path_runtime run-once <request.json>');
  printJson(runOnce(argv[1]));
}

if (require.main === module) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}

module.exports = { LATEST, MEMORY, ROOT, runOnce };
