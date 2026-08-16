#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const candidateRoot = process.argv[2];
if (!candidateRoot || !path.isAbsolute(candidateRoot)) process.exit(2);

const { resolveSession } = require(path.join(candidateRoot, 'src', 'resolve_session.js'));

assert.deepEqual(resolveSession('system~all'), { active: true, subject: 'system' });
assert.deepEqual(resolveSession('member~carol'), { active: true, subject: 'carol' });
assert.deepEqual(resolveSession('MEMBER~unit_4'), { active: true, subject: 'unit_4' });

for (const invalid of ['', 'malformed', 'member~', 'member~carol~extra', 'guest~carol', 'member~bad.value', '~carol', ' member~ ']) {
  assert.equal(resolveSession(invalid).active, false, `invalid handle accepted: ${JSON.stringify(invalid)}`);
}
