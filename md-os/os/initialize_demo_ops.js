#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { MDOS_ROOT, WORKSPACE_ROOT, printJson } = require('./lib/common');
const { ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const EXAMPLES_DIR = path.join(MDOS_ROOT, 'examples');
const OPS_DIR = path.join(MDOS_ROOT, 'ops');

const COPY_ITEMS = [
  {
    source: path.join(EXAMPLES_DIR, 'projects', 'demo_general_system', 'project.json'),
    target: path.join(OPS_DIR, 'projects', 'demo_general_system', 'project.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'projects', 'demo_document_approval_flow', 'project.json'),
    target: path.join(OPS_DIR, 'projects', 'demo_document_approval_flow', 'project.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'sources', 'manual', 'demo_general_system.json'),
    target: path.join(OPS_DIR, 'sources', 'manual', 'demo_general_system.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'sources', 'connectors', 'demo_document_approval_flow.json'),
    target: path.join(OPS_DIR, 'sources', 'connectors', 'demo_document_approval_flow.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'terminal_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'terminal_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'api_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'api_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'filesystem_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'filesystem_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'ticketing_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'ticketing_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'robot_mock_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'robot_mock_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'connectors', 'wolfram_connector.json'),
    target: path.join(OPS_DIR, 'connectors', 'wolfram_connector.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'policies', 'permission_model.json'),
    target: path.join(OPS_DIR, 'policies', 'permission_model.json'),
  },
  {
    source: path.join(EXAMPLES_DIR, 'programs', 'urgent_ticket_triage.md'),
    target: path.join(OPS_DIR, 'programs', 'urgent_ticket_triage.md'),
  },
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath);
}

function copyIfMissing(source, target) {
  if (!fs.existsSync(source)) throw new Error(`DEMO_SOURCE_MISSING: ${rel(source)}`);
  ensureDir(path.dirname(target));
  if (fs.existsSync(target)) return false;
  fs.copyFileSync(source, target);
  return true;
}

function main() {
  const created = [];
  const skipped = [];

  for (const item of COPY_ITEMS) {
    if (copyIfMissing(item.source, item.target)) {
      created.push(rel(item.target));
    } else {
      skipped.push(rel(item.target));
    }
  }

  appendJournal({
    event: 'demo_ops_initialized',
    created_files: created,
    skipped_existing_files: skipped,
  });

  printJson({
    ok: true,
    mode: 'initialize_demo_ops',
    created_files: created,
    skipped_existing_files: skipped,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  COPY_ITEMS,
  copyIfMissing,
};
