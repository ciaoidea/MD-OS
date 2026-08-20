#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const readmePath = path.join(root, 'README.md');
const indexPath = path.join(root, 'index.md');

function buildSiteIndex(readme) {
  return String(readme).replace(
    /\n### Vector connector \(beta\)\n[\s\S]*?(?=\n### Use the MD-OS Cortex agentic shell\n)/,
    '\n',
  );
}

function main() {
  const readme = fs.readFileSync(readmePath, 'utf8');
  const index = buildSiteIndex(readme);
  if (index === readme) throw new Error('SITE_INDEX_VECTOR_SECTION_NOT_FOUND');
  fs.writeFileSync(indexPath, index, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, source: 'README.md', output: 'index.md' })}\n`);
}

if (require.main === module) main();

module.exports = { buildSiteIndex };
