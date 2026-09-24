const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
test('response relevance contract integration and rejection cases', () => {
  const result = spawnSync('python3', ['test/test_response_relevance.py'], {
    cwd: path.resolve(__dirname, '..'), encoding: 'utf8', timeout: 60000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
});
