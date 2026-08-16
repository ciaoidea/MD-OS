#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { sha256Json } = require('../md-os/os/lib/common');
const {
  CONTEXT_PROTOCOL_ID,
  buildPublicRepositoryContext,
  extractSearchTerms,
  renderPublicRepositoryContext,
} = require('../md-os/kernel/cognition/apfc_no_tool_context');

function fixture() {
  const repo = fs.mkdtempSync(path.join(__dirname, '..', 'md-os', 'ops', 'local', 'test-apfc-context-'));
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'README.md'), '# Demo\n');
  fs.writeFileSync(path.join(repo, 'src', 'cache.py'), 'def reset_cache(state):\n    return state\n');
  fs.writeFileSync(path.join(repo, 'src', 'other.py'), 'def unrelated():\n    return 1\n');
  fs.writeFileSync(path.join(repo, 'tests', 'test_cache.py'), 'def test_reset_cache():\n    pass\n');
  spawnSync('git', ['init', '--quiet'], { cwd: repo });
  spawnSync('git', ['add', '.'], { cwd: repo });
  return repo;
}

function publicTask() {
  const task = {
    task_id: 'demo__cache-1', repository: 'demo/cache', base_commit: 'a'.repeat(40),
    problem_statement: '`reset_cache` keeps stale state; fix src/cache.py without changing its public interface.',
  };
  task.public_task_hash = sha256Json(task);
  return task;
}

test('public context is deterministic, bounded, source-relevant, and oracle-free', () => {
  const repo = fixture();
  const task = publicTask();
  const first = buildPublicRepositoryContext({ repo, publicTask: task, byteLimit: 20_000, fileLimit: 4 });
  const second = buildPublicRepositoryContext({ repo, publicTask: task, byteLimit: 20_000, fileLimit: 4 });
  assert.equal(first.protocol_id, CONTEXT_PROTOCOL_ID);
  assert.equal(first.context_hash, second.context_hash);
  assert.equal(first.public_only, true);
  assert.equal(first.hidden_artifacts_present, false);
  assert.ok(first.selected_content_bytes <= first.byte_limit);
  assert.equal(first.files[0].path, 'src/cache.py');
  assert.ok(renderPublicRepositoryContext(first).includes('def reset_cache'));
  const core = { ...first }; delete core.context_hash;
  assert.equal(first.context_hash, sha256Json(core));
  fs.rmSync(repo, { recursive: true, force: true });
});

test('search term extraction prioritizes code identifiers and paths', () => {
  const terms = extractSearchTerms('Failure in `ToolTransform.parameters`; inspect src/tool_transform.py and --strict-mode.');
  assert.ok(terms.includes('ToolTransform.parameters'));
  assert.ok(terms.includes('src/tool_transform.py'));
  assert.ok(terms.includes('--strict-mode'));
});

test('context schema exists and names the exact protocol', () => {
  const schema = JSON.parse(fs.readFileSync(path.join(
    __dirname, '..', 'md-os', 'schemas', 'apfc_public_repository_context.schema.json',
  ), 'utf8'));
  assert.equal(schema.properties.protocol_id.const, CONTEXT_PROTOCOL_ID);
  assert.equal(schema.properties.hidden_artifacts_present.const, false);
});
