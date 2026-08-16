'use strict';

const assert = require('node:assert/strict');
const { authenticate } = require('../src/authenticate');

assert.equal(authenticate('malformed-token').allowed, false);
