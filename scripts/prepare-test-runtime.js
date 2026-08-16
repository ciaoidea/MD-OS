#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ops = path.join(root, 'md-os', 'ops');

for (const relativePath of [
  'agi/sal',
  'connectors',
  'local',
  'processes',
  'runtime',
]) {
  fs.mkdirSync(path.join(ops, relativePath), { recursive: true });
}

for (const name of [
  'api_connector.json',
  'filesystem_connector.json',
  'graphify_connector.json',
  'robot_mock_connector.json',
  'terminal_connector.json',
  'ticketing_connector.json',
]) {
  const source = path.join(root, 'md-os', 'examples', 'connectors', name);
  const target = path.join(ops, 'connectors', name);
  if (!fs.existsSync(target)) fs.copyFileSync(source, target);
}
