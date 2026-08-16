#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertInsideWorkspace,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');
const {
  evaluateCanonicalSources,
  extractPolicy,
  makeDecision,
  validatePolicy,
} = require('../apfc/action/semantic_commitment_gate');

const POLICY_FILE = path.join(MDOS_ROOT, 'kb', 'SEMANTIC_COMMITMENT_GATE_MODEL.md');
const OUTPUT_DIR = path.join(MDOS_ROOT, 'ops', 'semantic');
const OUTPUT_JSON = path.join(OUTPUT_DIR, 'commitment_gate_status.json');
const OUTPUT_MD = path.join(OUTPUT_DIR, 'commitment_gate_status.md');
const DECISIONS_DIR = path.join(OUTPUT_DIR, 'commitment_decisions');

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readTextSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return null;
  }
}

function loadPolicy() {
  const source = readTextSafe(POLICY_FILE);
  if (source === null) throw new Error(`SEMANTIC_COMMITMENT_POLICY_FILE_MISSING: ${rel(POLICY_FILE)}`);
  return validatePolicy(extractPolicy(source));
}

function renderStatus(status) {
  const lines = [
    '# Semantic Commitment Gate',
    '',
    `Updated at: \`${status.updated_at}\``,
    '',
    `Status: \`${status.status}\``,
    '',
    `Policy: \`${status.policy_id}\``,
    '',
    `Invariants: \`${status.invariant_count}\``,
    '',
    `Checked sources: \`${status.checked_source_count}\``,
    '',
    `Findings: \`${status.finding_count}\``,
    '',
    '## Release Gate',
    '',
    `- canonical promotion blocked: \`${status.release_gate.canonical_promotion_blocked}\``,
    `- publication blocked: \`${status.release_gate.publication_blocked}\``,
    `- challenge registration blocked: \`${status.release_gate.challenge_registration_blocked}\``,
    '',
    '## Findings',
    '',
  ];
  if (!status.findings.length) lines.push('- No semantic commitment findings.');
  for (const finding of status.findings) {
    lines.push(`- \`${finding.severity}\` \`${finding.code}\` \`${finding.invariant_id}\` at \`${finding.path}\`: ${finding.message}`);
  }
  lines.push('');
  return lines.join('\n');
}

function buildStatus() {
  const policy = loadPolicy();
  const evaluated = evaluateCanonicalSources(policy, {
    workspaceRoot: WORKSPACE_ROOT,
    readText: readTextSafe,
  });
  return {
    ...evaluated,
    updated_at: nowIso(),
    materialized_from: rel(POLICY_FILE),
  };
}

function writeStatus(status) {
  ensureDir(OUTPUT_DIR);
  withFileLock('builder__semantic_commitment_gate', {
    context: 'build_semantic_commitment_gate',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, status);
    atomicWriteText(OUTPUT_MD, renderStatus(status));
  });
  appendJournal({
    event: 'semantic_commitment_gate_rebuilt',
    status: status.status,
    policy_id: status.policy_id,
    invariant_count: status.invariant_count,
    finding_count: status.finding_count,
  });
  return status;
}

function buildAndWriteStatus() {
  return writeStatus(buildStatus());
}

function resolveProposalPath(proposalArg) {
  const value = shortText(proposalArg);
  if (!value) throw new Error('SEMANTIC_COMMITMENT_PROPOSAL_PATH_REQUIRED');
  const filePath = assertInsideWorkspace(path.resolve(WORKSPACE_ROOT, value));
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    throw new Error(`SEMANTIC_COMMITMENT_PROPOSAL_NOT_FOUND: ${rel(filePath)}`);
  }
  return filePath;
}

function renderDecision(decision) {
  const lines = [
    '# Semantic Commitment Decision',
    '',
    `Decision id: \`${decision.decision_id}\``,
    '',
    `Proposal id: \`${decision.proposal_id}\``,
    '',
    `Decision: \`${decision.decision}\``,
    '',
    `Canonical effect: \`${decision.canonical_effect}\``,
    '',
    `Declared delta: \`${decision.declared_delta_class}\``,
    '',
    `Effective delta: \`${decision.effective_delta_class}\``,
    '',
    '## Reasons',
    '',
    ...decision.reason_codes.map((item) => `- \`${item}\``),
    '',
    '## Next Actions',
    '',
    ...(decision.next_actions.length ? decision.next_actions.map((item) => `- ${item}`) : ['- None.']),
    '',
  ];
  return lines.join('\n');
}

function evaluateProposalFile(proposalArg) {
  const policy = loadPolicy();
  const canonicalStatus = buildAndWriteStatus();
  const proposalPath = resolveProposalPath(proposalArg);
  const proposal = JSON.parse(fs.readFileSync(proposalPath, 'utf8'));
  const decision = {
    ...makeDecision(proposal, policy, canonicalStatus),
    evaluated_at: nowIso(),
    proposal_path: rel(proposalPath),
    canonical_status_hash: canonicalStatus.source_hash,
  };
  ensureDir(DECISIONS_DIR);
  const outputJson = path.join(DECISIONS_DIR, `${decision.decision_id}.json`);
  const outputMd = path.join(DECISIONS_DIR, `${decision.decision_id}.md`);
  withFileLock(`semantic_commitment_decision__${decision.decision_id}`, {
    context: `semantic_commitment_decision:${decision.proposal_id}`,
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    if (fs.existsSync(outputJson)) {
      const existing = JSON.parse(fs.readFileSync(outputJson, 'utf8'));
      const comparableExisting = { ...existing };
      delete comparableExisting.evaluated_at;
      const comparableDecision = { ...decision };
      delete comparableDecision.evaluated_at;
      if (sha256Json(comparableExisting) !== sha256Json(comparableDecision)) {
        throw new Error(`SEMANTIC_COMMITMENT_DECISION_CONFLICT: ${decision.decision_id}`);
      }
    } else {
      atomicWriteJson(outputJson, decision);
      atomicWriteText(outputMd, renderDecision(decision));
    }
  });
  appendJournal({
    event: 'semantic_commitment_proposal_evaluated',
    proposal_id: decision.proposal_id,
    decision_id: decision.decision_id,
    decision: decision.decision,
    canonical_effect: decision.canonical_effect,
  });
  return {
    ...decision,
    output_json: rel(outputJson),
    output_md: rel(outputMd),
  };
}

function usage() {
  process.stderr.write([
    'Usage:',
    '  build_semantic_commitment_gate.js status',
    '  build_semantic_commitment_gate.js evaluate <proposal.json>',
    '',
  ].join('\n'));
  process.exit(1);
}

function main() {
  const [command = 'status', proposalArg] = process.argv.slice(2);
  if (['status', 'build', 'rebuild'].includes(command)) {
    const status = buildAndWriteStatus();
    printJson({
      ok: status.status === 'ok',
      mode: 'semantic_commitment_gate_status',
      status: status.status,
      invariant_count: status.invariant_count,
      finding_count: status.finding_count,
      output_json: rel(OUTPUT_JSON),
      output_md: rel(OUTPUT_MD),
    });
    process.exit(status.status === 'ok' ? 0 : 2);
  }
  if (['evaluate', 'gate'].includes(command)) {
    if (!proposalArg) usage();
    const decision = evaluateProposalFile(proposalArg);
    printJson({
      ok: decision.decision === 'allow',
      mode: 'semantic_commitment_gate_evaluate',
      proposal_id: decision.proposal_id,
      decision_id: decision.decision_id,
      decision: decision.decision,
      canonical_effect: decision.canonical_effect,
      effective_delta_class: decision.effective_delta_class,
      reason_codes: decision.reason_codes,
      output_json: decision.output_json,
      output_md: decision.output_md,
    });
    process.exit(decision.decision === 'allow' ? 0 : 2);
  }
  usage();
}

if (require.main === module) main();

module.exports = {
  buildAndWriteStatus,
  buildStatus,
  evaluateProposalFile,
  loadPolicy,
  renderDecision,
  renderStatus,
  writeStatus,
};
