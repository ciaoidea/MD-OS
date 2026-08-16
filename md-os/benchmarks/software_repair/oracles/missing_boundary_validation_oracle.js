#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const candidateRoot = process.argv[2];
if (!candidateRoot || !path.isAbsolute(candidateRoot)) process.exit(2);

const { authenticate } = require(path.join(candidateRoot, 'src', 'authenticate.js'));

assert.deepEqual(authenticate('admin:letmein'), { allowed: true, user: 'admin' });
assert.deepEqual(authenticate('user:alice'), { allowed: true, user: 'alice' });
assert.deepEqual(authenticate('USER:bob_2'), { allowed: true, user: 'bob_2' });

for (const invalid of ['', 'malformed-token', 'user:', 'user:alice:extra', ':alice', ' user: ']) {
  assert.equal(authenticate(invalid).allowed, false, `invalid token accepted: ${JSON.stringify(invalid)}`);
}
