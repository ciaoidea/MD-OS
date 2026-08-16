'use strict';

const assert = require('node:assert/strict');
const { resolveSession } = require('../src/resolve_session');

assert.deepEqual(resolveSession('system~all'), { active: true, subject: 'system' });
assert.deepEqual(resolveSession('member~carol'), { active: true, subject: 'carol' });
assert.deepEqual(resolveSession('MEMBER~unit_4'), { active: true, subject: 'unit_4' });
assert.equal(resolveSession('').active, false);
