#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const candidateRoot = process.argv[2];
if (!candidateRoot || !path.isAbsolute(candidateRoot)) process.exit(2);

const { authorizeApiKey } = require(path.join(candidateRoot, 'src', 'authorize.js'));

assert.deepEqual(authorizeApiKey('root|omega'), { granted: true, principal: 'root' });
assert.deepEqual(authorizeApiKey('client|delta'), { granted: true, principal: 'delta' });
assert.deepEqual(authorizeApiKey('CLIENT|node_7'), { granted: true, principal: 'node_7' });

for (const invalid of ['', 'broken-key', 'client|', 'client|delta|extra', 'guest|delta', 'client|bad.value', '|delta', ' client| ']) {
  assert.equal(authorizeApiKey(invalid).granted, false, `invalid key accepted: ${JSON.stringify(invalid)}`);
}
