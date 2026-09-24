const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('bounded date retrieval and lossless pagination on synthetic history', () => {
  const result = spawnSync('python3', ['test/test_memory_pagination.py'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
