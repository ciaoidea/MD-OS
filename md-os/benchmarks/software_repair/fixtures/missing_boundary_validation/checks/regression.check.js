'use strict';

const assert = require('node:assert/strict');
const { authenticate } = require('../src/authenticate');

assert.deepEqual(authenticate('admin:letmein'), { allowed: true, user: 'admin' });
assert.deepEqual(authenticate('user:alice'), { allowed: true, user: 'alice' });
assert.equal(authenticate('').allowed, false);
