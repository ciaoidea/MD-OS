#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  WORKSPACE_ROOT,
  printJson,
  shortText,
} = require('./lib/common');
const { applyWorkspacePatch } = require('./lib/workspace_patch');

function usage() {
  process.stderr.write([
    'Usage:',
    '  cortex workspace patch <patch_file|-> [--dry-run]',
    '  cortex workspace patch --base64 <base64_patch> [--dry-run]',
    '',
  ].join('\n'));
  process.exit(64);
}

function decodeBase64(value) {
  const encoded = String(value || '');
  if (!encoded || encoded.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    const error = new Error('WORKSPACE_PATCH_BASE64_INVALID');
    error.code = 'WORKSPACE_PATCH_BASE64_INVALID';
    throw error;
  }
  const buffer = Buffer.from(encoded, 'base64');
  if (buffer.toString('base64') !== encoded) {
    const error = new Error('WORKSPACE_PATCH_BASE64_INVALID');
    error.code = 'WORKSPACE_PATCH_BASE64_INVALID';
    throw error;
  }
  return buffer.toString('utf8');
}

function readPatchSource(args) {
  if (!args.length) usage();
  if (args[0] === '--base64') {
    if (!args[1]) usage();
    return {
      patchText: decodeBase64(args[1]),
      consumed: 2,
    };
  }
  if (args[0] === '-') {
    return {
      patchText: fs.readFileSync(0, 'utf8'),
      consumed: 1,
    };
  }
  const patchPath = path.resolve(WORKSPACE_ROOT, args[0]);
  return {
    patchText: fs.readFileSync(patchPath, 'utf8'),
    consumed: 1,
  };
}

function main() {
  const [operation, ...args] = process.argv.slice(2);
  if (operation !== 'apply') usage();
  const input = readPatchSource(args);
  const flags = args.slice(input.consumed);
  if (flags.some((flag) => flag !== '--dry-run')) usage();
  const receipt = applyWorkspacePatch({
    workspaceRoot: WORKSPACE_ROOT,
    patchText: input.patchText,
    dryRun: flags.includes('--dry-run'),
  });
  printJson(receipt);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      ok: false,
      mode: 'workspace_patch',
      error_code: shortText(error.code || 'WORKSPACE_PATCH_FAILED'),
      error: shortText(error.message),
      rollback_failures: Array.isArray(error.rollback_failures) ? error.rollback_failures : [],
    })}\n`);
    process.exit(1);
  }
}

module.exports = { decodeBase64, readPatchSource };
