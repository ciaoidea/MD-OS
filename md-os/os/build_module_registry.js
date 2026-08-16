#!/usr/bin/env node
'use strict';

const { printJson } = require('./lib/common');
const { writeModuleRegistry, REGISTRY_JSON, REGISTRY_MD } = require('../kernel/module_runtime');

function relOutput(filePath) {
  return filePath.replace(process.cwd().replace(/\\/g, '/').replace(/\/$/, ''), '').replace(/^\/+/, '');
}

function main() {
  const registry = writeModuleRegistry();
  printJson({
    ok: true,
    mode: 'build_module_registry',
    updated_at: registry.updated_at,
    module_count: registry.module_count,
    capability_count: registry.capability_count,
    cli_command_count: registry.cli_command_count,
    mcp_tool_count: registry.mcp_tool_count,
    output_json: relOutput(REGISTRY_JSON),
    output_md: relOutput(REGISTRY_MD),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
};
