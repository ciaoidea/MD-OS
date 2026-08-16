'use strict';

const assert = require('node:assert/strict');
const { authorizeApiKey } = require('../src/authorize');

assert.equal(authorizeApiKey('broken-key').granted, false);
