'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('memory reliability, concurrency, rollover, source freshness and lexical paging', () => {
  const result = spawnSync('python3', ['test/test_memory_reliability.py'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 120000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
