'use strict';

const assert = require('node:assert/strict');
const { routeRequest } = require('../src/route_request');

assert.deepEqual(routeRequest('ops#root'), { routed: true, node: 'root' });
assert.deepEqual(routeRequest('node#edge_2'), { routed: true, node: 'edge_2' });
assert.deepEqual(routeRequest('NODE#core-7'), { routed: true, node: 'core-7' });
assert.equal(routeRequest('').routed, false);
