#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const {
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
const OUTPUT_JSON = path.join(OPS_DIR, 'health_classification.json');
const OUTPUT_MD = path.join(OPS_DIR, 'health_classification.md');

const INPUT_FILES = {
  globalIndex: 'md-os/ops/global_index.json',
  hygiene: 'md-os/ops/system_hygiene_status.json',
  lifecycle: 'md-os/ops/runtime_lifecycle_index.json',
  markdownGraph: 'md-os/ops/markdown_graph.json',
  semanticKnowledge: 'md-os/ops/semantic_knowledge_summary.json',
  semanticCommitment: 'md-os/ops/semantic/commitment_gate_status.json',
  selfRelease: 'md-os/ops/releases/self_release_index.json',
  agiLoop: 'md-os/ops/agi/loop_status.json',
  agiEval: 'md-os/ops/evals/agi_eval_report.json',
  apfc: 'md-os/ops/apfc/executive/status.json',
  skillRegistry: 'md-os/ops/skills/skill_registry.json',
  runtimeCompiler: 'md-os/ops/runtime/semantic_operational_compiler.json',
  runtimeEpistemicHealth: 'md-os/ops/runtime/epistemic_health.json',
  agenticCore: 'md-os/ops/core/agentic_core.json',
};

const OPTIONAL_INPUT_FILES = {
  replay: 'md-os/ops/replay_report.json',
};

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function abs(relativePath) {
  return path.join(WORKSPACE_ROOT, relativePath);
}

function readJsonSafe(relativePath) {
  try {
    return JSON.parse(fs.readFileSync(abs(relativePath), 'utf8'));
  } catch (_) {
    return null;
  }
}

function inputAvailable(relativePath) {
  return fs.existsSync(abs(relativePath));
}

function normalizeStatus(status) {
  if (status === 'ok' || status === 'attention' || status === 'critical') return status;
  if (status === 'warning') return 'attention';
  return 'attention';
}

function worstStatus(statuses) {
  const normalized = statuses.filter(Boolean).map(normalizeStatus);
  if (normalized.includes('critical')) return 'critical';
  if (normalized.includes('attention')) return 'attention';
  return 'ok';
}

function statusIsFinding(status) {
  return status && status !== 'ok';
}

function countOf(value) {
  return Number.isFinite(value) ? value : 0;
}

function listOf(value) {
  return Array.isArray(value) ? value : [];
}

function makeFinding({
  finding_id,
  severity,
  scope,
  source,
  reason,
  suggested_action,
  evidence = {},
  runtime_blocking = false,
  release_blocking = false,
  publication_blocking = false,
  security_blocking = false,
  local_only = false,
}) {
  return {
    finding_id,
    severity: normalizeStatus(severity),
    scope,
    source,
    runtime_blocking: Boolean(runtime_blocking),
    release_blocking: Boolean(release_blocking),
    publication_blocking: Boolean(publication_blocking),
    security_blocking: Boolean(security_blocking),
    local_only: Boolean(local_only),
    reason: shortText(reason, 300),
    suggested_action: shortText(suggested_action, 300),
    evidence,
  };
}

function addStatusFinding(findings, {
  finding_id,
  status,
  scope,
  source,
  reason,
  suggested_action,
  runtime_blocking = false,
  release_blocking = false,
  publication_blocking = false,
  security_blocking = false,
  local_only = false,
  evidence = {},
}) {
  if (!statusIsFinding(status)) return;
  findings.push(makeFinding({
    finding_id,
    severity: status,
    scope,
    source,
    reason,
    suggested_action,
    runtime_blocking,
    release_blocking,
    publication_blocking,
    security_blocking,
    local_only,
    evidence,
  }));
}

function addCountFinding(findings, {
  finding_id,
  count,
  severity,
  scope,
  source,
  reason,
  suggested_action,
  runtime_blocking = false,
  release_blocking = false,
  publication_blocking = false,
  security_blocking = false,
  local_only = false,
  paths = [],
}) {
  if (!count) return;
  findings.push(makeFinding({
    finding_id,
    severity,
    scope,
    source,
    reason,
    suggested_action,
    runtime_blocking,
    release_blocking,
    publication_blocking,
    security_blocking,
    local_only,
    evidence: {
      count,
      paths: paths.slice(0, 20),
    },
  }));
}

function buildScope(scopeId, label, findings, predicate = (finding) => finding.scope === scopeId) {
  const scoped = findings.filter(predicate);
  return {
    status: worstStatus(scoped.map((finding) => finding.severity)),
    label,
    finding_count: scoped.length,
    critical_finding_count: scoped.filter((finding) => finding.severity === 'critical').length,
    attention_finding_count: scoped.filter((finding) => finding.severity === 'attention').length,
    runtime_blocking: scoped.some((finding) => finding.runtime_blocking),
    release_blocking: scoped.some((finding) => finding.release_blocking),
    publication_blocking: scoped.some((finding) => finding.publication_blocking),
    security_blocking: scoped.some((finding) => finding.security_blocking),
    local_only: scoped.some((finding) => finding.local_only),
    finding_ids: scoped.map((finding) => finding.finding_id),
  };
}

function countBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || 'unknown';
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function addMissingInputFindings(findings) {
  for (const [inputId, relativePath] of Object.entries(INPUT_FILES)) {
    if (inputAvailable(relativePath)) continue;
    findings.push(makeFinding({
      finding_id: `missing_input__${inputId}`,
      severity: 'critical',
      scope: inputId.includes('runtime') ? 'compiler' : 'runtime',
      source: relativePath,
      runtime_blocking: true,
      release_blocking: true,
      reason: `Required health classifier input is missing: ${relativePath}`,
      suggested_action: 'Run the canonical builders before classifying health.',
      evidence: { file: relativePath },
    }));
  }
}

function buildFindings(inputs) {
  const findings = [];
  addMissingInputFindings(findings);

  const {
    hygiene,
    lifecycle,
    markdownGraph,
    semanticKnowledge,
    semanticCommitment,
    selfRelease,
    agiLoop,
    agiEval,
    apfc,
    runtimeCompiler,
    runtimeEpistemicHealth,
    replay,
  } = inputs;

  addStatusFinding(findings, {
    finding_id: 'runtime_lifecycle_status',
    status: lifecycle && lifecycle.status,
    scope: 'runtime',
    source: INPUT_FILES.lifecycle,
    runtime_blocking: lifecycle && lifecycle.status === 'critical',
    release_blocking: lifecycle && lifecycle.status !== 'ok',
    reason: 'Runtime lifecycle index is not fully ok.',
    suggested_action: 'Inspect runtime lifecycle findings and rebuild generated state.',
    evidence: { finding_count: countOf(lifecycle && lifecycle.finding_count) },
  });
  addStatusFinding(findings, {
    finding_id: 'markdown_graph_status',
    status: markdownGraph && markdownGraph.status,
    scope: 'runtime',
    source: INPUT_FILES.markdownGraph,
    release_blocking: markdownGraph && markdownGraph.status !== 'ok',
    reason: 'Markdown graph readback is not fully ok.',
    suggested_action: 'Run the Markdown graph builder and repair missing or isolated core nodes.',
    evidence: {
      explicit_orphan_count: countOf(markdownGraph && markdownGraph.explicit_orphan_count),
      structural_isolated_count: countOf(markdownGraph && markdownGraph.structural_isolated_count),
    },
  });
  addStatusFinding(findings, {
    finding_id: 'semantic_knowledge_status',
    status: semanticKnowledge && semanticKnowledge.status,
    scope: 'runtime',
    source: INPUT_FILES.semanticKnowledge,
    release_blocking: semanticKnowledge && semanticKnowledge.status !== 'ok',
    reason: 'Semantic knowledge readback is not fully ok.',
    suggested_action: 'Rebuild semantic knowledge and repair compact findings.',
    evidence: { finding_count: listOf(semanticKnowledge && semanticKnowledge.findings).length },
  });
  if (semanticKnowledge && semanticKnowledge.semantic_profile_complete === false) {
    findings.push(makeFinding({
      finding_id: 'semantic_profile_incomplete',
      severity: 'critical',
      scope: 'runtime',
      source: INPUT_FILES.semanticKnowledge,
      runtime_blocking: true,
      release_blocking: true,
      reason: 'Not every Markdown node has a semantic profile.',
      suggested_action: 'Run semantic graph rebuild and profile uncovered nodes.',
    }));
  }
  if (semanticKnowledge && semanticKnowledge.epistemic_profile_complete === false) {
    findings.push(makeFinding({
      finding_id: 'epistemic_profile_incomplete',
      severity: 'critical',
      scope: 'runtime',
      source: INPUT_FILES.semanticKnowledge,
      runtime_blocking: true,
      release_blocking: true,
      reason: 'Not every Markdown node has an epistemic profile.',
      suggested_action: 'Run semantic graph rebuild and profile uncovered claims.',
    }));
  }
  addStatusFinding(findings, {
    finding_id: 'semantic_commitment_gate_status',
    status: semanticCommitment && semanticCommitment.status,
    scope: 'semantic_integrity',
    source: INPUT_FILES.semanticCommitment,
    release_blocking: semanticCommitment && semanticCommitment.status !== 'ok',
    publication_blocking: semanticCommitment && semanticCommitment.status !== 'ok',
    reason: 'Semantic commitment gate found missing foundational anchors or a known contradiction.',
    suggested_action: 'Inspect semantic commitment findings and repair canonical meaning before promotion or publication.',
    evidence: {
      invariant_count: countOf(semanticCommitment && semanticCommitment.invariant_count),
      finding_count: countOf(semanticCommitment && semanticCommitment.finding_count),
    },
  });
  const selfReleaseFindings = listOf(selfRelease && selfRelease.findings);
  const selfReleaseCriticalFindingCount = selfReleaseFindings.filter((finding) => finding && finding.severity === 'critical').length;
  const selfReleaseInheritsGlobalHealthCritical = Boolean(
    selfRelease
      && selfRelease.readback_status === 'critical'
      && selfRelease.compact_readback
      && selfRelease.compact_readback.health_status === 'critical'
      && selfReleaseCriticalFindingCount === 0,
  );
  if (selfReleaseInheritsGlobalHealthCritical) {
    findings.push(makeFinding({
      finding_id: 'self_release_inherited_global_health_critical',
      severity: 'attention',
      scope: 'publication',
      source: INPUT_FILES.selfRelease,
      release_blocking: true,
      publication_blocking: true,
      reason: 'Self-release readback inherits the global health critical status; granular health must decide whether runtime is actually blocked.',
      suggested_action: 'Use health classification to distinguish runtime operation from publication or local hygiene blockers.',
      evidence: {
        self_release_status: selfRelease.status || null,
        self_release_readback_status: selfRelease.readback_status || null,
        compact_health_status: selfRelease.compact_readback.health_status || null,
      },
    }));
  } else {
    addStatusFinding(findings, {
      finding_id: 'self_release_status',
      status: selfRelease && selfRelease.status,
      scope: 'runtime',
      source: INPUT_FILES.selfRelease,
      release_blocking: selfRelease && selfRelease.status !== 'ok',
      reason: 'Self-release index is not fully ok.',
      suggested_action: 'Run self-release status and resolve release findings before publishing.',
      evidence: { proposal_count: countOf(selfRelease && selfRelease.proposal_count) },
    });
    addStatusFinding(findings, {
      finding_id: 'self_release_readback_status',
      status: selfRelease && selfRelease.readback_status,
      scope: 'runtime',
      source: INPUT_FILES.selfRelease,
      runtime_blocking: selfRelease && selfRelease.readback_status === 'critical',
      release_blocking: selfRelease && selfRelease.readback_status !== 'ok',
      reason: 'Self-release readback is not fully ok.',
      suggested_action: 'Repair identity/release readback and rebuild.',
    });
  }
  if (replay && replay.matched_before === false) {
    findings.push(makeFinding({
      finding_id: 'replay_not_stable_yet',
      severity: 'attention',
      scope: 'runtime',
      source: OPTIONAL_INPUT_FILES.replay,
      release_blocking: true,
      reason: 'Replay did not match the previous rebuilt fingerprint.',
      suggested_action: 'Run replay again after deterministic outputs settle; inspect if mismatch persists.',
      evidence: { replay_hash: replay.replay_hash || null },
    }));
  }

  addStatusFinding(findings, {
    finding_id: 'runtime_compiler_status',
    status: runtimeCompiler && runtimeCompiler.status,
    scope: 'compiler',
    source: INPUT_FILES.runtimeCompiler,
    runtime_blocking: runtimeCompiler && runtimeCompiler.status === 'critical',
    release_blocking: runtimeCompiler && runtimeCompiler.status !== 'ok',
    reason: 'Semantic Operational Compiler is not fully ok.',
    suggested_action: 'Run runtime compiler and resolve compiler readback findings.',
    evidence: runtimeCompiler && runtimeCompiler.counts || {},
  });
  addStatusFinding(findings, {
    finding_id: 'runtime_epistemic_health_status',
    status: runtimeEpistemicHealth && runtimeEpistemicHealth.status,
    scope: 'compiler',
    source: INPUT_FILES.runtimeEpistemicHealth,
    runtime_blocking: runtimeEpistemicHealth && runtimeEpistemicHealth.status === 'critical',
    release_blocking: runtimeEpistemicHealth && runtimeEpistemicHealth.status !== 'ok',
    reason: 'Runtime epistemic health is not fully ok.',
    suggested_action: 'Inspect epistemic health, claim conflicts, and stale claim findings.',
    evidence: { finding_count: listOf(runtimeEpistemicHealth && runtimeEpistemicHealth.findings).length },
  });

  addStatusFinding(findings, {
    finding_id: 'agi_loop_status',
    status: agiLoop && agiLoop.status,
    scope: 'agi_loop',
    source: INPUT_FILES.agiLoop,
    release_blocking: agiLoop && agiLoop.status !== 'ok',
    reason: 'Verified AGI loop readback is not fully ok.',
    suggested_action: 'Run AGI eval and inspect episode, skill, eval, and failure indexes.',
    evidence: agiLoop && agiLoop.metrics || {},
  });
  addStatusFinding(findings, {
    finding_id: 'agi_eval_status',
    status: agiEval && agiEval.status,
    scope: 'agi_loop',
    source: INPUT_FILES.agiEval,
    release_blocking: agiEval && agiEval.status !== 'ok',
    reason: 'AGI eval report is not fully ok.',
    suggested_action: 'Inspect eval report and regressions before promoting skills.',
    evidence: agiEval && agiEval.metrics || {},
  });
  if (agiEval && agiEval.metrics && countOf(agiEval.metrics.regression_count) > 0) {
    findings.push(makeFinding({
      finding_id: 'agi_eval_regressions',
      severity: 'critical',
      scope: 'agi_loop',
      source: INPUT_FILES.agiEval,
      release_blocking: true,
      reason: 'AGI eval report contains regressions.',
      suggested_action: 'Do not promote skills until regressions are fixed or explicitly accepted.',
      evidence: { regression_count: agiEval.metrics.regression_count },
    }));
  }
  addStatusFinding(findings, {
    finding_id: 'apfc_runtime_status',
    status: apfc && apfc.status,
    scope: 'apfc',
    source: INPUT_FILES.apfc,
    runtime_blocking: apfc && apfc.status === 'critical',
    release_blocking: apfc && apfc.status === 'critical',
    reason: 'Artificial prefrontal cortex runtime is not fully healthy.',
    suggested_action: 'Run APFC reconcile, build, verify, and inspect the causal event chain and active graph.',
    evidence: {
      graph_id: apfc && apfc.active_graph_id || null,
      source_count: countOf(apfc && apfc.counts && apfc.counts.sources),
      node_count: countOf(apfc && apfc.counts && apfc.counts.nodes),
      edge_count: countOf(apfc && apfc.counts && apfc.counts.edges),
      critical_findings: countOf(apfc && apfc.counts && apfc.counts.critical_findings),
    },
  });

  const stability = hygiene && hygiene.stability || {};
  const cleanliness = hygiene && hygiene.cleanliness || {};
  const efficiency = hygiene && hygiene.efficiency || {};
  const publication = hygiene && hygiene.publication || {};

  addStatusFinding(findings, {
    finding_id: 'hygiene_stability_status',
    status: stability.status,
    scope: 'runtime',
    source: INPUT_FILES.hygiene,
    runtime_blocking: stability.status === 'critical',
    release_blocking: stability.status !== 'ok',
    reason: 'System hygiene stability is not fully ok.',
    suggested_action: 'Restore missing runtime files and rebuild health.',
    evidence: { missing_required_files: listOf(stability.missing_required_files) },
  });
  addCountFinding(findings, {
    finding_id: 'spurious_kb_files',
    count: countOf(cleanliness.spurious_kb_file_count),
    severity: 'critical',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    reason: 'Spurious knowledge-base files are present.',
    suggested_action: 'Move or remove spurious KB files through an explicit cleanup task.',
    paths: listOf(cleanliness.spurious_kb_files),
  });
  addCountFinding(findings, {
    finding_id: 'zero_byte_files',
    count: countOf(cleanliness.zero_byte_file_count),
    severity: 'attention',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    reason: 'Zero-byte files are present.',
    suggested_action: 'Remove or initialize empty files if they are not intentional placeholders.',
    paths: listOf(cleanliness.zero_byte_files),
  });
  addCountFinding(findings, {
    finding_id: 'exact_content_duplicates',
    count: countOf(cleanliness.exact_content_duplicate_groups),
    severity: 'attention',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    reason: 'Exact duplicate content groups are present.',
    suggested_action: 'Deduplicate or document intentional duplicates.',
  });
  addCountFinding(findings, {
    finding_id: 'logical_merge_candidates',
    count: countOf(cleanliness.logical_merge_candidate_groups),
    severity: 'attention',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    reason: 'Logical merge candidates are present.',
    suggested_action: 'Review duplicate logical artifacts and merge when appropriate.',
    paths: listOf(efficiency.top_logical_merge_candidates).flatMap((item) => listOf(item.paths)),
  });
  addCountFinding(findings, {
    finding_id: 'secondary_obsidian_files',
    count: countOf(efficiency.secondary_obsidian_file_count),
    severity: 'attention',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    reason: 'Secondary Obsidian metadata files are present.',
    suggested_action: 'Remove secondary vault metadata from publishable runtime state.',
  });

  addCountFinding(findings, {
    finding_id: 'local_path_files',
    count: countOf(publication.local_path_file_count),
    severity: 'critical',
    scope: 'security',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    security_blocking: true,
    reason: 'Files contain absolute host-local paths.',
    suggested_action: 'Redact or move host-local paths into explicit local-only state before publishing.',
    paths: listOf(publication.local_path_files),
  });
  addCountFinding(findings, {
    finding_id: 'host_local_hardware_files',
    count: countOf(publication.host_local_hardware_file_count),
    severity: 'critical',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    local_only: true,
    reason: 'Host-local hardware cache is present.',
    suggested_action: 'Run `mdos hardware clean` before packaging or distributing this workspace.',
    paths: listOf(publication.host_local_hardware_files),
  });
  addCountFinding(findings, {
    finding_id: 'host_local_software_files',
    count: countOf(publication.host_local_software_file_count),
    severity: 'critical',
    scope: 'local_hygiene',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    local_only: true,
    reason: 'Host-local software cache is present.',
    suggested_action: 'Run `mdos software clean` before packaging or distributing this workspace.',
    paths: listOf(publication.host_local_software_files),
  });
  addCountFinding(findings, {
    finding_id: 'ops_artifact_files',
    count: countOf(publication.ops_artifact_file_count),
    severity: 'attention',
    scope: 'publication',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    reason: 'Runtime artifact files are present in ops.',
    suggested_action: 'Archive, ignore, or document runtime artifacts before publishing.',
    paths: listOf(publication.ops_artifact_files),
  });
  addCountFinding(findings, {
    finding_id: 'pdf_publication_artifacts',
    count: countOf(publication.pdf_file_count),
    severity: 'attention',
    scope: 'publication',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    reason: 'PDF files are present in the publishable tree.',
    suggested_action: 'Keep generated PDFs out of the source package or document them as intentional release artifacts.',
    paths: listOf(publication.pdf_files),
  });
  addCountFinding(findings, {
    finding_id: 'unsafe_scripts',
    count: countOf(publication.unsafe_script_count),
    severity: 'critical',
    scope: 'security',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    security_blocking: true,
    reason: 'Undeclared unsafe scripts are present.',
    suggested_action: 'Remove, quarantine, or explicitly gate unsafe scripts before release.',
    paths: listOf(publication.unsafe_scripts),
  });
  addCountFinding(findings, {
    finding_id: 'permissive_configs',
    count: countOf(publication.permissive_config_count),
    severity: 'attention',
    scope: 'security',
    source: INPUT_FILES.hygiene,
    release_blocking: true,
    publication_blocking: true,
    security_blocking: true,
    reason: 'Permissive configuration files are present.',
    suggested_action: 'Review permission profiles before publishing or enabling connectors.',
    paths: listOf(publication.permissive_configs),
  });

  return findings.sort((left, right) => {
    const severityOrder = { critical: 0, attention: 1, ok: 2 };
    return (severityOrder[left.severity] - severityOrder[right.severity])
      || left.scope.localeCompare(right.scope)
      || left.finding_id.localeCompare(right.finding_id);
  });
}

function buildClassification() {
  const inputs = Object.fromEntries(
    [...Object.entries(INPUT_FILES), ...Object.entries(OPTIONAL_INPUT_FILES)]
      .map(([key, relativePath]) => [key, readJsonSafe(relativePath)]),
  );
  const findings = buildFindings(inputs);
  const health = {
    runtime_health: buildScope('runtime', 'Runtime rebuildability and core generated readback', findings),
    compiler_health: buildScope('compiler', 'Semantic Operational Compiler and epistemic runtime readback', findings),
    agi_loop_health: buildScope('agi_loop', 'Verified AGI loop, evals, skills, and regressions', findings),
    apfc_health: buildScope('apfc', 'Artificial prefrontal cortex graph, causal event chain, learning gates, and recovery state', findings),
    semantic_integrity_health: buildScope('semantic_integrity', 'Foundational invariants, semantic delta, authority, and commitment gates', findings),
    publication_health: buildScope('publication', 'Publishable package and distributable artifact readiness', findings, (finding) => (
      finding.scope === 'publication' || finding.publication_blocking
    )),
    security_health: buildScope('security', 'Permission, host-path, launcher, and unsafe-script exposure', findings, (finding) => (
      finding.scope === 'security' || finding.security_blocking
    )),
    local_hygiene_health: buildScope('local_hygiene', 'Local-only cache, duplicate, and workspace hygiene state', findings, (finding) => (
      finding.scope === 'local_hygiene' || finding.local_only
    )),
  };
  const scopeStatuses = Object.values(health).map((scope) => scope.status);
  const criticalFindings = findings.filter((finding) => finding.severity === 'critical');
  const attentionFindings = findings.filter((finding) => finding.severity === 'attention');
  const releaseBlocking = findings.filter((finding) => finding.release_blocking);
  const publicationBlocking = findings.filter((finding) => finding.publication_blocking);
  const criticalRuntimeBlocking = findings.filter((finding) => finding.runtime_blocking && finding.severity === 'critical');
  const criticalSecurityBlocking = findings.filter((finding) => finding.security_blocking && finding.severity === 'critical');

  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      inputs: Object.fromEntries(Object.entries(inputs).map(([key, value]) => [key, value && (value.source_hash || value.updated_at || value.status || value.overall_status) || null])),
      findings: findings.map((finding) => ({
        finding_id: finding.finding_id,
        severity: finding.severity,
        scope: finding.scope,
        evidence: finding.evidence,
      })),
    }),
    status: worstStatus(scopeStatuses),
    classifier_name: 'mdos_granular_health_classifier',
    health,
    release_gate: {
      runtime_operable: health.runtime_health.status !== 'critical'
        && health.compiler_health.status !== 'critical'
        && health.apfc_health.status !== 'critical'
        && criticalRuntimeBlocking.length === 0,
      runtime_blocked: criticalRuntimeBlocking.length > 0,
      publishable: releaseBlocking.length === 0 && publicationBlocking.length === 0 && criticalSecurityBlocking.length === 0,
      release_blocked: releaseBlocking.length > 0,
      publication_blocked: publicationBlocking.length > 0,
      security_blocked: criticalSecurityBlocking.length > 0,
      local_only_blocked: findings.some((finding) => finding.local_only && (finding.release_blocking || finding.publication_blocking)),
    },
    finding_summary: {
      finding_count: findings.length,
      critical_finding_count: criticalFindings.length,
      attention_finding_count: attentionFindings.length,
      by_scope: countBy(findings, 'scope'),
      by_severity: countBy(findings, 'severity'),
      runtime_blocking_count: findings.filter((finding) => finding.runtime_blocking).length,
      release_blocking_count: releaseBlocking.length,
      publication_blocking_count: publicationBlocking.length,
      security_blocking_count: findings.filter((finding) => finding.security_blocking).length,
      local_only_count: findings.filter((finding) => finding.local_only).length,
    },
    source_files: [...Object.values(INPUT_FILES), ...Object.values(OPTIONAL_INPUT_FILES)],
    findings,
  };
}

function buildMarkdown(classification) {
  const lines = [
    '# MD-OS Health Classification',
    '',
    `Updated at: \`${classification.updated_at}\``,
    '',
    `Status: \`${classification.status}\``,
    '',
    '## Release Gate',
    '',
    `- runtime operable: \`${classification.release_gate.runtime_operable}\``,
    `- runtime blocked: \`${classification.release_gate.runtime_blocked}\``,
    `- publishable: \`${classification.release_gate.publishable}\``,
    `- release blocked: \`${classification.release_gate.release_blocked}\``,
    `- publication blocked: \`${classification.release_gate.publication_blocked}\``,
    `- security blocked: \`${classification.release_gate.security_blocked}\``,
    `- local-only blocked: \`${classification.release_gate.local_only_blocked}\``,
    '',
    '## Scope Health',
    '',
  ];
  for (const [key, scope] of Object.entries(classification.health)) {
    lines.push(`- \`${key}\`: \`${scope.status}\` | findings \`${scope.finding_count}\` | critical \`${scope.critical_finding_count}\``);
  }
  lines.push('', '## Findings', '');
  if (!classification.findings.length) {
    lines.push('- No classified findings.');
  } else {
    for (const finding of classification.findings) {
      const flags = [
        finding.runtime_blocking ? 'runtime_blocking' : null,
        finding.release_blocking ? 'release_blocking' : null,
        finding.publication_blocking ? 'publication_blocking' : null,
        finding.security_blocking ? 'security_blocking' : null,
        finding.local_only ? 'local_only' : null,
      ].filter(Boolean).join(', ') || 'non_blocking';
      lines.push(`- \`${finding.severity}\` \`${finding.scope}\` \`${finding.finding_id}\`: ${finding.reason} | flags: \`${flags}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const classification = buildClassification();
  withFileLock('builder__health_classifier', {
    context: 'build_health_classifier',
    timeoutMs: 60000,
    staleMs: 600000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, classification);
    atomicWriteText(OUTPUT_MD, buildMarkdown(classification));
  });
  appendJournal({
    event: 'health_classification_rebuilt',
    status: classification.status,
    runtime_health: classification.health.runtime_health.status,
    compiler_health: classification.health.compiler_health.status,
    agi_loop_health: classification.health.agi_loop_health.status,
    apfc_health: classification.health.apfc_health.status,
    semantic_integrity_health: classification.health.semantic_integrity_health.status,
    publication_health: classification.health.publication_health.status,
    security_health: classification.health.security_health.status,
    local_hygiene_health: classification.health.local_hygiene_health.status,
    publishable: classification.release_gate.publishable,
    runtime_operable: classification.release_gate.runtime_operable,
  });
  printJson({
    ok: true,
    mode: 'build_health_classifier',
    updated_at: classification.updated_at,
    status: classification.status,
    runtime_health: classification.health.runtime_health.status,
    compiler_health: classification.health.compiler_health.status,
    agi_loop_health: classification.health.agi_loop_health.status,
    apfc_health: classification.health.apfc_health.status,
    semantic_integrity_health: classification.health.semantic_integrity_health.status,
    publication_health: classification.health.publication_health.status,
    security_health: classification.health.security_health.status,
    local_hygiene_health: classification.health.local_hygiene_health.status,
    publishable: classification.release_gate.publishable,
    runtime_operable: classification.release_gate.runtime_operable,
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  INPUT_FILES,
  buildClassification,
};
