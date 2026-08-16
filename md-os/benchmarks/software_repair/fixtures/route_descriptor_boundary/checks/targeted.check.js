'use strict';

const assert = require('node:assert/strict');
const { routeRequest } = require('../src/route_request');

assert.equal(routeRequest('unroutable').routed, false);
