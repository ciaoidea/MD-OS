#!/usr/bin/env node
'use strict';

const { runControlConsole } = require('../../os/control_console');

async function main() {
  await runControlConsole(process.argv.slice(2));
}

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exit(1);
  });
}
