#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SCRIPT = path.join(ROOT, 'md-os', 'os', 'seal_apfc_open_world_corpus.py');
const EXPERIMENT = path.join(ROOT, 'md-os', 'ops', 'agi', 'learning_experiments', 'apfc_open_world_meta_transfer_20260813_v1');
const VAULT = path.join(ROOT, 'md-os', 'ops', 'local', 'apfc_open_world_vault', 'apfc_open_world_meta_transfer_20260813_v1');

test('open-world corpus sealer is syntax-valid and pins an immutable dataset revision', () => {
  const result = spawnSync('python3', [
    '-c',
    'import pathlib,sys; source=pathlib.Path(sys.argv[1]).read_text(); compile(source, sys.argv[1], "exec")',
    SCRIPT,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const source = fs.readFileSync(SCRIPT, 'utf8');
  assert.match(source, /DATASET_REVISION = "[a-f0-9]{40}"/);
  assert.match(source, /gold_patch_content_used_for_ranking": False/);
  assert.match(source, /development_holdout_repository_overlap_allowed": False/);
  assert.match(source, /excluded_prior_task_ids_absent/);
  assert.match(source, /excluded_prior_repositories_absent/);
  assert.match(source, /source_development_reused_exactly/);
  assert.match(source, /candidate_hash_valid_when_present/);
  const verificationSchema = JSON.parse(fs.readFileSync(path.join(
    ROOT, 'md-os', 'schemas', 'apfc_open_world_corpus_verification.schema.json',
  ), 'utf8'));
  assert.equal(verificationSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
});

test('persisted open-world corpus has 12 development and 30 disjoint holdout repositories when present', () => {
  const publicFile = path.join(EXPERIMENT, 'public_corpus.json');
  const hiddenFile = path.join(VAULT, 'verifier_vault.json');
  if (!fs.existsSync(publicFile) || !fs.existsSync(hiddenFile)) return;
  const publicCorpus = JSON.parse(fs.readFileSync(publicFile, 'utf8'));
  const hidden = JSON.parse(fs.readFileSync(hiddenFile, 'utf8'));
  assert.equal(publicCorpus.development_tasks.length, 12);
  assert.equal(publicCorpus.holdout_tasks.length, 30);
  assert.equal(new Set(publicCorpus.development_tasks.map((task) => task.repository)).size, 12);
  assert.equal(new Set(publicCorpus.holdout_tasks.map((task) => task.repository)).size, 30);
  const developmentRepositories = new Set(publicCorpus.development_tasks.map((task) => task.repository));
  assert.equal(publicCorpus.holdout_tasks.some((task) => developmentRepositories.has(task.repository)), false);
  const forbidden = new Set(['gold_patch', 'test_patch', 'FAIL_TO_PASS', 'PASS_TO_PASS', 'test_command']);
  for (const task of [...publicCorpus.development_tasks, ...publicCorpus.holdout_tasks]) {
    assert.equal(Object.keys(task).some((key) => forbidden.has(key)), false);
  }
  assert.deepEqual(
    publicCorpus.holdout_tasks.map((task) => task.task_id),
    hidden.holdout_tasks.map((task) => task.task_id),
  );
});
