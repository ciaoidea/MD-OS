'use strict';

const assert = require('node:assert/strict');
const { decodeEnvelope } = require('../src/decode_envelope');

assert.equal(decodeEnvelope('undeliverable').accepted, false);
