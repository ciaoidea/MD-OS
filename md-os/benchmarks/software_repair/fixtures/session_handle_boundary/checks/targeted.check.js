'use strict';

const assert = require('node:assert/strict');
const { resolveSession } = require('../src/resolve_session');

assert.equal(resolveSession('malformed').active, false);
