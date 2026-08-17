#!/usr/bin/env node
'use strict';

const path = require('path');
const { spawnSync } = require('child_process');

const result = spawnSync(process.execPath, [path.join(__dirname, 'mdos_cli.js'), ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    MDOS_CLI_NAME: 'cortex',
  },
  stdio: 'inherit',
});

process.exit(result.status || 0);
