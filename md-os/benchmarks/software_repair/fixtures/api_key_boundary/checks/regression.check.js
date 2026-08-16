'use strict';

const assert = require('node:assert/strict');
const { authorizeApiKey } = require('../src/authorize');

assert.deepEqual(authorizeApiKey('root|omega'), { granted: true, principal: 'root' });
assert.deepEqual(authorizeApiKey('client|delta'), { granted: true, principal: 'delta' });
assert.deepEqual(authorizeApiKey('CLIENT|node_7'), { granted: true, principal: 'node_7' });
assert.equal(authorizeApiKey('').granted, false);
