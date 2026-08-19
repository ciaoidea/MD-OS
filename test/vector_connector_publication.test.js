'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workspace = path.resolve(__dirname, '..');
const connectorRoot = path.join(workspace, 'md-os', 'connectors', 'vector');

function filesBelow(root) {
  const output = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `connector must not publish symlink: ${absolute}`);
    if (entry.isDirectory()) output.push(...filesBelow(absolute));
    else if (entry.isFile()) output.push(absolute);
  }
  return output;
}

test('Vector connector publication contains source only and no host-private data', () => {
  const files = filesBelow(connectorRoot);
  const forbiddenSuffixes = ['.key', '.crt', '.pem', '.p12', '.pfx', '.ogg', '.wav', '.jpg', '.jpeg'];
  const forbiddenNames = new Set(['profile.json', 'credentials.json', 'token.json', 'vector-cortex', 'vector-cli']);
  const privatePatterns = [
    /\/home\/[a-z0-9_-]+\//i,
    /Vector[- ]P1A[0-9]/i,
    /192\.168\.[0-9]{1,3}\.[0-9]{1,3}/,
    /10\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
    /172\.(?:1[6-9]|2[0-9]|3[01])\.[0-9]{1,3}\.[0-9]{1,3}/,
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/,
    /(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}/,
    /sk-[A-Za-z0-9]{20,}/,
  ];

  assert.ok(files.length > 0, 'connector package must not be empty');
  for (const file of files) {
    const name = path.basename(file);
    const lower = name.toLowerCase();
    assert.equal(forbiddenNames.has(lower), false, `private or compiled file published: ${file}`);
    assert.equal(forbiddenSuffixes.some((suffix) => lower.endsWith(suffix)), false, `sensitive payload published: ${file}`);
    assert.ok(fs.statSync(file).size < 1024 * 1024, `connector source file unexpectedly exceeds 1 MiB: ${file}`);
    const content = fs.readFileSync(file, 'utf8');
    for (const pattern of privatePatterns) {
      assert.equal(pattern.test(content), false, `private pattern ${pattern} found in ${file}`);
    }
  }
});

test('Vector manifest keeps downloads and private runtime outside the repository', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(connectorRoot, 'connector.json'), 'utf8'));
  assert.equal(manifest.connector_id, 'vector_robot');
  assert.equal(manifest.release_stage, 'beta');
  assert.equal(manifest.external_downloads.bundled_in_repository, false);
  assert.equal(manifest.private_data_policy.repository_contains_credentials, false);
  assert.equal(manifest.private_data_policy.repository_contains_sensor_payloads, false);
});
