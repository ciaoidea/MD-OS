#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const executablePath = fs.realpathSync(__filename);
const workspaceRoot = path.resolve(path.dirname(executablePath), '..', '..');
process.env.MDOS_WORKSPACE_ROOT = workspaceRoot;
process.env.MDOS_ROOT = path.join(workspaceRoot, 'md-os');

const { runControlConsole } = require('./control_console');

runControlConsole(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exit(1);
});
