#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const candidateRoot = process.argv[2];
if (!candidateRoot || !path.isAbsolute(candidateRoot)) process.exit(2);

const { decodeEnvelope } = require(path.join(candidateRoot, 'src', 'decode_envelope.js'));

assert.deepEqual(decodeEnvelope('master@all'), { accepted: true, recipient: 'all' });
assert.deepEqual(decodeEnvelope('packet@delta_9'), { accepted: true, recipient: 'delta_9' });
assert.deepEqual(decodeEnvelope('PACKET@zone-3'), { accepted: true, recipient: 'zone-3' });

for (const invalid of ['', 'undeliverable', 'packet@', 'packet@delta@extra', 'mail@delta_9', 'packet@bad.value', '@delta_9', ' packet@ ']) {
  assert.equal(decodeEnvelope(invalid).accepted, false, `invalid address accepted: ${JSON.stringify(invalid)}`);
}
