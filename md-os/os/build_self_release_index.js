#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
  ACTIVE_BOUNDARY_DIR,
  MDOS_ROOT,
  WORKSPACE_ROOT,
  nowIso,
  printJson,
  sha256Json,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const RELEASES_DIR = path.join(OPS_DIR, 'releases');
const PROPOSALS_DIR = path.join(RELEASES_DIR, 'self', 'proposals');
const OUTPUT_JSON = path.join(RELEASES_DIR, 'self_release_index.json');
const OUTPUT_MD = path.join(RELEASES_DIR, 'self_release_index.md');
const PACKAGE_JSON = path.join(WORKSPACE_ROOT, 'package.json');
const RELEASE_MODEL = path.join(MDOS_ROOT, 'kb', 'AGENTIC_OPERATIONAL_RELEASE_MODEL.md');
const SELF_RELEASE_MODEL = path.join(MDOS_ROOT, 'kb', 'SELF_RELEASE_EVOLUTION_MODEL.md');
const SEMANTIC_SUMMARY = path.join(OPS_DIR, 'semantic_knowledge_summary.json');
const MARKDOWN_GRAPH = path.join(OPS_DIR, 'markdown_graph.json');
const LIFECYCLE_INDEX = path.join(OPS_DIR, 'runtime_lifecycle_index.json');
const HEALTH = path.join(OPS_DIR, 'health.json');
const REPLAY_REPORT = path.join(OPS_DIR, 'replay_report.json');

const REQUIRED_PROPOSAL_FIELDS = [
  'schema_version',
  'release_id',
  'target_identity_name',
  'target_identity_version',
  'target_personality_profile',
  'personality_continuity_rule',
  'identity_epistemic_gates',
  'target_release_label',
  'target_release_semver',
  'target_release_version',
  'target_release_name',
  'release_type',
  'objective',
  'improvement_hypothesis',
  'semantic_epistemic_impact',
  'scope',
  'non_goals',
  'migration_plan',
  'compatibility_policy',
  'acceptance_criteria',
  'required_gates',
  'rollback_plan',
];

const AGENTIC_JUMP_REQUIRED_GATES = [
  'npm_run_check',
  'npm_test',
  'build_all',
  'mdos_replay_matched',
  'semantic_knowledge_ok',
  'health_readback',
  'migration_plan',
  'rollback_plan',
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function listProposalFiles() {
  if (!fs.existsSync(PROPOSALS_DIR)) return [];
  return fs.readdirSync(PROPOSALS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(PROPOSALS_DIR, entry.name))
    .sort();
}

function extractOperationalReleaseId(text) {
  const match = String(text || '').match(/mdos_[0-9_]+_[a-z0-9_]+__host_exec__md_os_boundary/);
  return match ? match[0] : '';
}

function extractJsonStringField(text, fieldName) {
  const regexp = new RegExp(`"${fieldName}"\\s*:\\s*"([^"]+)"`);
  const match = String(text || '').match(regexp);
  return match ? match[1] : '';
}

function releaseLabelFromSemver(version) {
  const parts = String(version || '').split('.');
  if (parts.length < 2) return '';
  if (parts.length >= 3) return `${parts[0]}.${parts[1].padStart(2, '0')}.${parts[2].padStart(2, '0')}`;
  return `${parts[0]}.${parts[1].padStart(2, '0')}`;
}

function validateProposal(filePath, payload) {
  const findings = [];
  if (!payload || typeof payload !== 'object') {
    return {
      file: rel(filePath),
      valid: false,
      findings: [{
        severity: 'critical',
        code: 'SELF_RELEASE_PROPOSAL_NOT_JSON_OBJECT',
        message: 'Self-release proposal must be a JSON object.',
      }],
    };
  }

  for (const field of REQUIRED_PROPOSAL_FIELDS) {
    if (payload[field] === undefined || payload[field] === null || payload[field] === '') {
      findings.push({
        severity: 'attention',
        code: 'SELF_RELEASE_PROPOSAL_FIELD_MISSING',
        field,
        message: `Required proposal field is missing: ${field}`,
      });
    }
  }
  if (payload.schema_version !== 1) {
    findings.push({
      severity: 'critical',
      code: 'SELF_RELEASE_PROPOSAL_SCHEMA_UNSUPPORTED',
      field: 'schema_version',
      message: 'Self-release proposal schema_version must be 1.',
    });
  }
  if (!['patch', 'minor', 'major', 'agentic_jump'].includes(shortText(payload.release_type))) {
    findings.push({
      severity: 'attention',
      code: 'SELF_RELEASE_TYPE_UNKNOWN',
      field: 'release_type',
      message: 'release_type should be patch, minor, major, or agentic_jump.',
    });
  }

  const requiredGates = Array.isArray(payload.required_gates) ? payload.required_gates.map(shortText) : [];
  const identityEpistemicGates = Array.isArray(payload.identity_epistemic_gates) ? payload.identity_epistemic_gates.map(shortText) : [];
  if (payload.release_type === 'agentic_jump') {
    for (const gate of AGENTIC_JUMP_REQUIRED_GATES) {
      if (!requiredGates.includes(gate)) {
        findings.push({
          severity: 'attention',
          code: 'AGENTIC_JUMP_GATE_MISSING',
          field: 'required_gates',
          message: `agentic_jump proposal must require gate: ${gate}`,
        });
      }
    }
    for (const gate of ['unified_identity_check', 'personality_profile_check', 'first_person_rule_check', 'non_claim_preservation_check']) {
      if (!identityEpistemicGates.includes(gate)) {
        findings.push({
          severity: 'attention',
          code: 'AGENTIC_JUMP_IDENTITY_EPISTEMIC_GATE_MISSING',
          field: 'identity_epistemic_gates',
          message: `agentic_jump proposal must require identity epistemic gate: ${gate}`,
        });
      }
    }
  }

  const status = shortText(payload.status || 'proposed') || 'proposed';
  return {
    file: rel(filePath),
    valid: !findings.some((finding) => finding.severity === 'critical'),
    proposal_status: status,
    release_id: shortText(payload.release_id || path.basename(filePath, '.json')),
    target_identity_name: shortText(payload.target_identity_name || ''),
    target_identity_version: shortText(payload.target_identity_version || ''),
    target_personality_profile: shortText(payload.target_personality_profile || ''),
    personality_continuity_rule: shortText(payload.personality_continuity_rule || ''),
    identity_epistemic_gate_count: identityEpistemicGates.length,
    target_release_label: shortText(payload.target_release_label || ''),
    target_release_semver: shortText(payload.target_release_semver || ''),
    target_release_version: shortText(payload.target_release_version || ''),
    target_release_name: shortText(payload.target_release_name || ''),
    release_type: shortText(payload.release_type || ''),
    objective: shortText(payload.objective || ''),
    semantic_epistemic_impact: shortText(payload.semantic_epistemic_impact || ''),
    required_gate_count: requiredGates.length,
    acceptance_criterion_count: Array.isArray(payload.acceptance_criteria) ? payload.acceptance_criteria.length : 0,
    migration_step_count: Array.isArray(payload.migration_plan) ? payload.migration_plan.length : 0,
    rollback_step_count: Array.isArray(payload.rollback_plan) ? payload.rollback_plan.length : 0,
    findings,
  };
}

function collectProposals() {
  return listProposalFiles().map((filePath) => {
    const payload = readJsonSafe(filePath);
    return validateProposal(filePath, payload);
  });
}

function compactReadback() {
  const semantic = readJsonSafe(SEMANTIC_SUMMARY);
  const graph = readJsonSafe(MARKDOWN_GRAPH);
  const lifecycle = readJsonSafe(LIFECYCLE_INDEX);
  const health = readJsonSafe(HEALTH);
  const replay = readJsonSafe(REPLAY_REPORT);
  return {
    semantic_knowledge_status: semantic && semantic.status || 'unknown',
    semantic_profile_complete: semantic ? semantic.semantic_profile_complete === true : false,
    epistemic_profile_complete: semantic ? semantic.epistemic_profile_complete === true : false,
    semantic_nodes: semantic && Number.isFinite(semantic.markdown_node_count) ? semantic.markdown_node_count : null,
    markdown_graph_status: graph && graph.status || 'unknown',
    semantic_operational_network_status: graph && graph.semantic_operational_network && graph.semantic_operational_network.status || 'unknown',
    lifecycle_status: lifecycle && lifecycle.status || 'unknown',
    lifecycle_findings: Number.isFinite(lifecycle && lifecycle.finding_count) ? lifecycle.finding_count : null,
    health_status: health && health.status || 'unknown',
    health_missing_required_files: Array.isArray(health && health.missing_required_files) ? health.missing_required_files.length : null,
    replay_matched_before: replay ? replay.matched_before === true : null,
    replay_hash: replay && replay.replay_hash || null,
  };
}

function releaseReadbackStatus(readback) {
  const critical = [
    readback.semantic_knowledge_status === 'critical',
    readback.markdown_graph_status === 'critical',
    readback.lifecycle_status === 'critical',
    readback.health_status === 'critical',
  ].some(Boolean);
  if (critical) return 'critical';
  const attention = [
    readback.semantic_knowledge_status !== 'ok',
    readback.semantic_profile_complete !== true,
    readback.epistemic_profile_complete !== true,
    readback.markdown_graph_status !== 'ok',
    readback.semantic_operational_network_status !== 'ok',
    readback.lifecycle_status !== 'ok',
    readback.replay_matched_before === false,
  ].some(Boolean);
  return attention ? 'attention' : 'ok';
}

function buildSelfReleaseIndex() {
  fs.mkdirSync(PROPOSALS_DIR, { recursive: true });
  const packagePayload = readJsonSafe(PACKAGE_JSON) || {};
  const releaseModelText = readTextSafe(RELEASE_MODEL);
  const selfReleaseModelText = readTextSafe(SELF_RELEASE_MODEL);
  const proposals = collectProposals();
  const readback = compactReadback();
  const currentRelease = {
    system_family: 'MD-OS',
    unified_identity: extractJsonStringField(releaseModelText, 'unified_identity'),
    identity_name: extractJsonStringField(releaseModelText, 'identity_name'),
    identity_version: extractJsonStringField(releaseModelText, 'identity_version'),
    repository_release_line: extractJsonStringField(releaseModelText, 'repository_release_line'),
    release_label: extractJsonStringField(releaseModelText, 'release_label') || releaseLabelFromSemver(packagePayload.version),
    release_semver: shortText(packagePayload.version || ''),
    release_version: extractJsonStringField(releaseModelText, 'release_version'),
    release_id: extractJsonStringField(releaseModelText, 'release_id'),
    release_name: extractJsonStringField(releaseModelText, 'release_name'),
    release_codename: extractJsonStringField(releaseModelText, 'release_codename'),
    identity_short_name: extractJsonStringField(releaseModelText, 'identity_short_name'),
    identity_id: extractJsonStringField(releaseModelText, 'identity_id'),
    identity_profile: extractJsonStringField(releaseModelText, 'identity_profile'),
    package_name: shortText(packagePayload.name || ''),
    agentic_operational_id: extractOperationalReleaseId(releaseModelText),
    active_boundary: `${ACTIVE_BOUNDARY_DIR}/`,
    host_runtime_role: 'execution_layer',
    release_language_policy: 'English canonical release surface',
  };

  const findings = [];
  if (!currentRelease.release_semver) {
    findings.push({
      severity: 'critical',
      code: 'CURRENT_RELEASE_SEMVER_MISSING',
      path: 'package.json',
      message: 'package.json does not expose a release version.',
    });
  }
  if (!currentRelease.agentic_operational_id) {
    findings.push({
      severity: 'attention',
      code: 'AGENTIC_OPERATIONAL_ID_NOT_FOUND',
      path: rel(RELEASE_MODEL),
      message: 'Release model does not expose a recognizable agentic operational id.',
    });
  }
  for (const field of ['unified_identity', 'identity_name', 'identity_version', 'release_version', 'release_name', 'identity_short_name', 'identity_id']) {
    if (!currentRelease[field]) {
      findings.push({
        severity: 'critical',
        code: 'CURRENT_RELEASE_UNIFIED_IDENTITY_FIELD_MISSING',
        field,
        path: rel(RELEASE_MODEL),
        message: `Current release identity is missing required unified identity field: ${field}`,
      });
    }
  }
  if (currentRelease.identity_name && currentRelease.unified_identity && currentRelease.identity_name !== currentRelease.unified_identity) {
    findings.push({
      severity: 'critical',
      code: 'CURRENT_RELEASE_IDENTITY_NAME_SPLIT',
      path: rel(RELEASE_MODEL),
      message: 'identity_name must equal unified_identity; the release must expose one identity.',
    });
  }
  if (currentRelease.identity_version && currentRelease.release_version && currentRelease.identity_version !== currentRelease.release_version) {
    findings.push({
      severity: 'critical',
      code: 'CURRENT_RELEASE_IDENTITY_VERSION_SPLIT',
      path: rel(RELEASE_MODEL),
      message: 'identity_version must equal release_version.',
    });
  }
  if (currentRelease.identity_name && currentRelease.release_name && currentRelease.identity_name !== currentRelease.release_name) {
    findings.push({
      severity: 'critical',
      code: 'CURRENT_RELEASE_NAME_NOT_IDENTITY_NAME',
      path: rel(RELEASE_MODEL),
      message: 'release_name must equal the unified identity name for the current agentic identity.',
    });
  }
  if (!selfReleaseModelText.trim()) {
    findings.push({
      severity: 'critical',
      code: 'SELF_RELEASE_MODEL_MISSING',
      path: rel(SELF_RELEASE_MODEL),
      message: 'Self release evolution model is missing or unreadable.',
    });
  }
  for (const proposal of proposals) {
    for (const finding of proposal.findings) {
      findings.push({
        ...finding,
        path: proposal.file,
        release_id: proposal.release_id,
      });
    }
  }

  const status = findings.some((finding) => finding.severity === 'critical')
    ? 'critical'
    : findings.length || releaseReadbackStatus(readback) !== 'ok'
      ? 'attention'
      : 'ok';

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      package_version: packagePayload.version || null,
      release_model_hash: sha256Json(releaseModelText),
      self_release_model_hash: sha256Json(selfReleaseModelText),
      proposals: proposals.map((proposal) => ({
        file: proposal.file,
        release_id: proposal.release_id,
        target_identity_name: proposal.target_identity_name,
        target_identity_version: proposal.target_identity_version,
        target_personality_profile: proposal.target_personality_profile,
        personality_continuity_rule: proposal.personality_continuity_rule,
        identity_epistemic_gate_count: proposal.identity_epistemic_gate_count,
        target_release_semver: proposal.target_release_semver,
        target_release_version: proposal.target_release_version,
        target_release_name: proposal.target_release_name,
        release_type: proposal.release_type,
        proposal_status: proposal.proposal_status,
        semantic_epistemic_impact: proposal.semantic_epistemic_impact,
        findings: proposal.findings,
      })),
      readback,
    }),
    status,
    current_release: currentRelease,
    readback_status: releaseReadbackStatus(readback),
    compact_readback: readback,
    proposal_count: proposals.length,
    valid_proposal_count: proposals.filter((proposal) => proposal.valid).length,
    proposed_count: proposals.filter((proposal) => proposal.proposal_status === 'proposed').length,
    requires_review_count: proposals.filter((proposal) => proposal.proposal_status === 'requires_review').length,
    accepted_count: proposals.filter((proposal) => proposal.proposal_status === 'accepted').length,
    rejected_count: proposals.filter((proposal) => proposal.proposal_status === 'rejected').length,
    blocked_count: proposals.filter((proposal) => proposal.proposal_status.startsWith('blocked')).length,
    proposal_dir: rel(PROPOSALS_DIR),
    generated_files: [
      rel(OUTPUT_JSON),
      rel(OUTPUT_MD),
    ],
    release_gate_policy: {
      patch: ['npm_run_check', 'npm_test', 'build_all', 'readback'],
      minor: ['migration_note', 'npm_run_check', 'npm_test', 'build_all', 'mdos_replay_matched'],
      major: ['migration_plan', 'compatibility_policy', 'npm_run_check', 'npm_test', 'build_all', 'mdos_replay_matched', 'rollback_plan'],
      agentic_jump: AGENTIC_JUMP_REQUIRED_GATES,
    },
    findings,
    proposals,
  };
}

function buildMarkdown(index) {
  const lines = [
    '# Self Release Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    '',
    `Status: \`${index.status}\``,
    '',
    'This is the compact generated readback for MD-OS self-release proposals and current release verification.',
    '',
    '## Current Release',
    '',
    `- system family: \`${index.current_release.system_family}\``,
    `- unified identity: \`${index.current_release.unified_identity || 'unknown'}\``,
    `- identity name: \`${index.current_release.identity_name || 'unknown'}\``,
    `- identity version: \`${index.current_release.identity_version || 'unknown'}\``,
    `- release label: \`${index.current_release.release_label || 'unknown'}\``,
    `- release semver: \`${index.current_release.release_semver || 'unknown'}\``,
    `- release version: \`${index.current_release.release_version || 'unknown'}\``,
    `- release name: \`${index.current_release.release_name || 'unknown'}\``,
    `- identity short name: \`${index.current_release.identity_short_name || 'unknown'}\``,
    `- identity id: \`${index.current_release.identity_id || 'unknown'}\``,
    `- package name: \`${index.current_release.package_name || 'unknown'}\``,
    `- agentic operational id: \`${index.current_release.agentic_operational_id || 'unknown'}\``,
    `- active boundary: \`${index.current_release.active_boundary}\``,
    `- host runtime role: \`${index.current_release.host_runtime_role}\``,
    '',
    '## Compact Readback',
    '',
    `- readback status: \`${index.readback_status}\``,
    `- semantic knowledge: \`${index.compact_readback.semantic_knowledge_status}\``,
    `- semantic profile complete: \`${index.compact_readback.semantic_profile_complete}\``,
    `- epistemic profile complete: \`${index.compact_readback.epistemic_profile_complete}\``,
    `- Markdown graph: \`${index.compact_readback.markdown_graph_status}\``,
    `- semantic operational network: \`${index.compact_readback.semantic_operational_network_status}\``,
    `- lifecycle: \`${index.compact_readback.lifecycle_status}\``,
    `- health: \`${index.compact_readback.health_status}\``,
    `- replay matched before: \`${index.compact_readback.replay_matched_before ?? 'unknown'}\``,
    '',
    '## Proposals',
    '',
    `- proposal directory: \`${index.proposal_dir}\``,
    `- proposal count: \`${index.proposal_count}\``,
    `- valid proposals: \`${index.valid_proposal_count}\``,
    `- proposed: \`${index.proposed_count}\``,
    `- requires review: \`${index.requires_review_count}\``,
    `- accepted: \`${index.accepted_count}\``,
    `- rejected: \`${index.rejected_count}\``,
    `- blocked: \`${index.blocked_count}\``,
    '',
  ];

  if (!index.proposals.length) {
    lines.push('- No self-release proposals registered.');
  } else {
    for (const proposal of index.proposals) {
      lines.push(`- \`${proposal.release_id}\`: \`${proposal.release_type}\` -> \`${proposal.target_identity_name || proposal.target_release_version || proposal.target_release_label || proposal.target_release_semver || 'unknown'}\` | personality \`${proposal.target_personality_profile || 'unspecified'}\` | status \`${proposal.proposal_status}\` | semantic-epistemic impact \`${proposal.semantic_epistemic_impact || 'unspecified'}\` | gates \`${proposal.required_gate_count}\` | identity gates \`${proposal.identity_epistemic_gate_count}\` | findings \`${proposal.findings.length}\``);
    }
  }

  lines.push('', '## Findings', '');
  if (!index.findings.length) {
    lines.push('- No self-release inconsistencies detected.');
  } else {
    for (const finding of index.findings.slice(0, 80)) {
      lines.push(`- \`${finding.severity}\` \`${finding.code}\`: \`${finding.path || 'n/a'}\` - ${finding.message}`);
    }
  }

  lines.push('', '## Gate Policy', '');
  for (const [releaseType, gates] of Object.entries(index.release_gate_policy)) {
    lines.push(`- \`${releaseType}\`: \`${gates.join(', ')}\``);
  }

  return `${lines.join('\n')}\n`;
}

function main() {
  const index = buildSelfReleaseIndex();
  withFileLock('builder__self_release_index', {
    context: 'build_self_release_index',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, index);
    atomicWriteText(OUTPUT_MD, buildMarkdown(index));
  });
  appendJournal({
    event: 'self_release_index_rebuilt',
    builder: 'build_self_release_index',
    status: index.status,
    current_release_semver: index.current_release.release_semver,
    proposal_count: index.proposal_count,
    finding_count: index.findings.length,
  });
  printJson({
    ok: true,
    mode: 'build_self_release_index',
    updated_at: index.updated_at,
    status: index.status,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    current_release_semver: index.current_release.release_semver,
    proposal_count: index.proposal_count,
    finding_count: index.findings.length,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMarkdown,
  buildSelfReleaseIndex,
  validateProposal,
};
