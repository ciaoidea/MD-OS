#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '../../os/terminal_connector.js');
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});

process.exit(result.status || 0);
