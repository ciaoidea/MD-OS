#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  assertSafeId,
  nowIso,
  printJson,
  sha256Json,
  sha256Text,
  shortText,
} = require('./lib/common');
const { appendLineWithLock, atomicWriteJsonLocked, ensureDir } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const CHANGES_DIR = path.join(MDOS_ROOT, 'ops', 'changes');
const PROPOSALS_DIR = path.join(CHANGES_DIR, 'proposals');
const PROPOSALS_NDJSON = path.join(CHANGES_DIR, 'proposals.ndjson');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function usage() {
  process.stderr.write('Usage: node md-os/os/register_change_proposal.js <target_path> <summary>\n');
  process.exit(1);
}

function resolveTarget(targetArg) {
  const candidate = path.isAbsolute(targetArg)
    ? targetArg
    : path.join(WORKSPACE_ROOT, targetArg);
  const targetPath = assertInsideWorkspace(candidate);
  const relativeTarget = rel(targetPath);
  if (!relativeTarget || relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(`CHANGE_TARGET_OUTSIDE_WORKSPACE: ${relativeTarget}`);
  }
  const insideCanonicalBoundary = relativeTarget === 'md-os' || relativeTarget.startsWith('md-os/');
  if (!insideCanonicalBoundary) {
    throw new Error(`CHANGE_TARGET_OUTSIDE_MDOS_BOUNDARY: ${relativeTarget}`);
  }
  return {
    targetPath,
    relativeTarget,
  };
}

function fileSha256IfPresent(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) throw new Error(`CHANGE_TARGET_NOT_FILE: ${rel(filePath)}`);
  return sha256Text(fs.readFileSync(filePath, 'utf8'));
}

function createChangeProposal(targetArg, summaryArg, options = {}) {
  const summary = shortText(summaryArg);
  if (!summary) throw new Error('CHANGE_PROPOSAL_SUMMARY_REQUIRED');

  const writerId = assertSafeId(options.writerId || process.env.MDOS_WRITER_ID || 'human', 'writer_id');
  const createdAt = options.createdAt || nowIso();
  const { targetPath, relativeTarget } = resolveTarget(targetArg);
  const targetSha256 = fileSha256IfPresent(targetPath);
  const changeId = assertSafeId(`chg_${sha256Json({
    target_path: relativeTarget,
    target_sha256: targetSha256,
    summary,
    writer_id: writerId,
    created_at: createdAt,
  }).slice(0, 24)}`, 'change_id');

  return {
    schema_version: 1,
    change_id: changeId,
    status: 'proposed',
    target_path: relativeTarget,
    target_sha256: targetSha256,
    summary,
    writer_id: writerId,
    created_at: createdAt,
    conflict_policy: 'do_not_mutate_target_without_review',
  };
}

function writeChangeProposal(proposal) {
  ensureDir(PROPOSALS_DIR);
  ensureDir(CHANGES_DIR);
  const proposalFile = path.join(PROPOSALS_DIR, `${proposal.change_id}.json`);
  if (fs.existsSync(proposalFile)) throw new Error(`CHANGE_PROPOSAL_EXISTS: ${proposal.change_id}`);
  atomicWriteJsonLocked(proposalFile, proposal, {
    lockName: `change_proposal__${proposal.change_id}`,
    context: `register_change_proposal:${proposal.change_id}`,
  });
  appendLineWithLock(PROPOSALS_NDJSON, `${JSON.stringify(proposal)}\n`, {
    lockName: 'change_proposals__append',
    context: 'register_change_proposal:append',
  });
  appendJournal({
    event: 'change_proposal_registered',
    change_id: proposal.change_id,
    target_path: proposal.target_path,
    writer_id: proposal.writer_id,
  });
  return proposalFile;
}

function main() {
  const [targetArg, ...summaryParts] = process.argv.slice(2);
  if (!targetArg || !summaryParts.length) usage();
  const proposal = createChangeProposal(targetArg, summaryParts.join(' '));
  const proposalFile = writeChangeProposal(proposal);
  printJson({
    ok: true,
    mode: 'register_change_proposal',
    change_id: proposal.change_id,
    target_path: proposal.target_path,
    proposal_file: rel(proposalFile),
    proposals_file: rel(PROPOSALS_NDJSON),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  CHANGES_DIR,
  PROPOSALS_DIR,
  PROPOSALS_NDJSON,
  createChangeProposal,
  resolveTarget,
  writeChangeProposal,
};
