#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');

const candidateRoot = process.argv[2];
if (!candidateRoot || !path.isAbsolute(candidateRoot)) process.exit(2);

const { routeRequest } = require(path.join(candidateRoot, 'src', 'route_request.js'));

assert.deepEqual(routeRequest('ops#root'), { routed: true, node: 'root' });
assert.deepEqual(routeRequest('node#edge_2'), { routed: true, node: 'edge_2' });
assert.deepEqual(routeRequest('NODE#core-7'), { routed: true, node: 'core-7' });

for (const invalid of ['', 'unroutable', 'node#', 'node#edge#extra', 'host#edge_2', 'node#bad.value', '#edge_2', ' node# ']) {
  assert.equal(routeRequest(invalid).routed, false, `invalid route accepted: ${JSON.stringify(invalid)}`);
}
