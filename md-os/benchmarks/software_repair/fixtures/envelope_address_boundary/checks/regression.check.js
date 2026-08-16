'use strict';

const assert = require('node:assert/strict');
const { decodeEnvelope } = require('../src/decode_envelope');

assert.deepEqual(decodeEnvelope('master@all'), { accepted: true, recipient: 'all' });
assert.deepEqual(decodeEnvelope('packet@delta_9'), { accepted: true, recipient: 'delta_9' });
assert.deepEqual(decodeEnvelope('PACKET@zone-3'), { accepted: true, recipient: 'zone-3' });
assert.equal(decodeEnvelope('').accepted, false);
