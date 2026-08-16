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
  sha256Text,
  shortText,
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, withFileLock } = require('./lib/fs_runtime');
const { appendJournal } = require('./lib/journal');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const RUNTIME_DIR = path.join(OPS_DIR, 'runtime');
const CONTEXT_PACK_DIR = path.join(RUNTIME_DIR, 'context_packs');
const SEMANTIC_GRAPH_JSON = path.join(OPS_DIR, 'semantic_knowledge_graph.json');
const MARKDOWN_GRAPH_JSON = path.join(OPS_DIR, 'markdown_graph.json');
const CONNECTOR_REGISTRY_JSON = path.join(OPS_DIR, 'connectors', 'connector_registry.json');
const COMPILED_PROGRAMS_JSON = path.join(OPS_DIR, 'compiled', 'programs.json');
const AGENTIC_CORE_JSON = path.join(OPS_DIR, 'core', 'agentic_core.json');
const SELF_RELEASE_JSON = path.join(OPS_DIR, 'releases', 'self_release_index.json');
const HEALTH_JSON = path.join(OPS_DIR, 'health.json');
const REPLAY_REPORT_JSON = path.join(OPS_DIR, 'replay_report.json');
const SKILL_REGISTRY_JSON = path.join(OPS_DIR, 'skills', 'skill_registry.json');
const AGI_LOOP_STATUS_JSON = path.join(OPS_DIR, 'agi', 'loop_status.json');
const AGI_EVAL_REPORT_JSON = path.join(OPS_DIR, 'evals', 'agi_eval_report.json');
const WORLD_MODEL_JSON = path.join(OPS_DIR, 'world', 'world_model.json');

const OUTPUTS = {
  compilerJson: path.join(RUNTIME_DIR, 'semantic_operational_compiler.json'),
  compilerMd: path.join(RUNTIME_DIR, 'semantic_operational_compiler.md'),
  semanticJson: path.join(RUNTIME_DIR, 'semantic_index.json'),
  semanticMd: path.join(RUNTIME_DIR, 'semantic_index.md'),
  claimJson: path.join(RUNTIME_DIR, 'claim_index.json'),
  claimMd: path.join(RUNTIME_DIR, 'claim_index.md'),
  capabilityJson: path.join(RUNTIME_DIR, 'capability_index.json'),
  capabilityMd: path.join(RUNTIME_DIR, 'capability_index.md'),
  linkJson: path.join(RUNTIME_DIR, 'link_index.json'),
  linkMd: path.join(RUNTIME_DIR, 'link_index.md'),
  evalJson: path.join(RUNTIME_DIR, 'eval_results.json'),
  evalMd: path.join(RUNTIME_DIR, 'eval_results.md'),
  epistemicJson: path.join(RUNTIME_DIR, 'epistemic_health.json'),
  driftMd: path.join(RUNTIME_DIR, 'semantic_drift_report.md'),
  contextIndexJson: path.join(CONTEXT_PACK_DIR, 'index.json'),
  contextIndexMd: path.join(CONTEXT_PACK_DIR, 'index.md'),
};

const CONTEXT_PACKS = [
  'bootstrap',
  'operations',
  'epistemic',
  'semantic_task',
  'import',
  'runtime_health',
  'agi_learning',
];

const CLAIM_STATUSES = new Set([
  'raw',
  'hypothesis',
  'working_model',
  'validated',
  'reproducible',
  'deprecated',
  'contradicted',
]);

const CLAIM_MARKER = /\b(claim|invariant|rule|must|should|required|requires|validated|verified|reproducible|deprecated|contradicted|falsified|hypothesis|evidence|risk|permission|gate|rollback|readback|not|cannot|can)\b/i;
const LEGACY_MARKERS = [
  ['V', '4', '.', '2'].join(''),
  ['v', '4', '_', '2'].join(''),
  ['codex', 'ref'].join('_'),
  ['mcp', 'ops'].join('/'),
];

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function readTextSafe(filePath, fallback = '') {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    return fallback;
  }
}

function readWorkspaceText(relativePath) {
  return readTextSafe(path.join(WORKSPACE_ROOT, relativePath));
}

function stableId(prefix, value) {
  const slug = shortText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'item';
  return `${prefix}_${slug}_${sha256Text(value).slice(0, 10)}`;
}

function uniq(values) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function statusFromFindings(findings) {
  if (findings.some((finding) => finding.severity === 'critical')) return 'critical';
  if (findings.some((finding) => finding.severity === 'attention')) return 'attention';
  return 'ok';
}

function riskForNode(node) {
  const pathText = `${node.path} ${node.title} ${node.actionability} ${node.semantic_layer}`.toLowerCase();
  if (pathText.includes('hardware') || pathText.includes('robot') || pathText.includes('permission')) return 'high';
  if (pathText.includes('terminal') || pathText.includes('api') || pathText.includes('connector') || pathText.includes('action')) return 'medium';
  if (node.semantic_layer === 'identity') return 'high';
  if (node.semantic_layer === 'operational' || node.semantic_layer === 'operational_application') return 'medium';
  return 'low';
}

function toolsForNode(node) {
  const lower = `${node.path} ${node.title} ${node.concept_terms.join(' ')}`.toLowerCase();
  const tools = [];
  if (lower.includes('terminal')) tools.push('terminal_connector');
  if (lower.includes('api')) tools.push('api_adapter');
  if (lower.includes('filesystem')) tools.push('filesystem_connector');
  if (lower.includes('ticket')) tools.push('ticketing_connector');
  if (lower.includes('robot')) tools.push('robot_mock_connector');
  if (lower.includes('hardware') || lower.includes('device')) tools.push('hardware_control');
  if (lower.includes('software') || lower.includes('application')) tools.push('software_discovery');
  if (lower.includes('wolfram') || lower.includes('mathematica') || lower.includes('mathematical')) tools.push('wolfram_connector');
  return uniq(tools);
}

function capabilityTypeForNode(node) {
  if (node.semantic_layer === 'identity' || node.actionability === 'bootstrap_frame') return 'identity-bearing';
  if (node.actionability === 'validation_required' || node.cognitive_role === 'truth_gate') return 'diagnostic';
  if (node.actionability === 'operating_policy' || node.node_kind === 'policy_model') return 'regulatory';
  if (node.actionability === 'operating_application_source' || node.node_kind === 'natural_language_program') return 'procedural';
  if (node.actionability === 'readback' || node.cognitive_role === 'sensor_readback') return 'diagnostic';
  if (node.actionability === 'semantic_routing') return 'procedural';
  return 'informational';
}

function capabilityIdForNode(node) {
  if (node.semantic_layer === 'identity' || node.actionability === 'bootstrap_frame') return 'identity.patch_frame';
  if (node.actionability === 'validation_required' || node.cognitive_role === 'truth_gate') return 'epistemic.validate_claims';
  if (node.actionability === 'operating_policy' || node.node_kind === 'policy_model') return 'policy.enforce_gate';
  if (node.actionability === 'operating_application_source' || node.node_kind === 'natural_language_program') return 'operation.apply_source';
  if (node.actionability === 'readback' || node.cognitive_role === 'sensor_readback') return 'readback.inspect_state';
  if (node.actionability === 'semantic_routing') return 'semantic.route_intent';
  if (node.actionability === 'review_before_promotion' || node.actionability === 'review_and_assimilate') return 'import.review_promote';
  return 'knowledge.answer';
}

function requiresForRisk(risk, node) {
  const requirements = ['runtime_readback'];
  if (risk === 'medium' || risk === 'high') requirements.push('permission_gate');
  if (risk === 'high') requirements.push('human_explicit_intent');
  if (node.semantic_layer === 'identity') requirements.push('identity_non_claim_review');
  if (node.actionability === 'validation_required') requirements.push('epistemic_status_check');
  return uniq(requirements);
}

function fileTargetsForNode(node) {
  if (node.semantic_layer === 'identity') return ['AGENTS.md', 'ME.md', 'md-os/kb/COGNITIVE_BOOTSTRAP.md'];
  if (node.semantic_layer === 'operational_application') return ['md-os/ops/programs/', 'md-os/ops/projects/', 'md-os/ops/connectors/'];
  if (node.semantic_layer === 'operational') return ['md-os/kb/', 'md-os/ops/'];
  if (node.semantic_layer === 'epistemic') return ['md-os/ops/runtime/claim_index.json', 'md-os/ops/runtime/epistemic_health.json'];
  return ['md-os/kb/'];
}

function testForNode(node) {
  if (node.semantic_layer === 'identity') return 'identity_boundary_check';
  if (node.actionability === 'validation_required') return 'claim_status_check';
  if (node.actionability === 'operating_policy') return 'permission_gate_check';
  if (node.actionability === 'operating_application_source') return 'runtime_replay_check';
  if (node.actionability === 'readback') return 'readback_presence_check';
  return 'semantic_profile_check';
}

function buildSemanticIndex(semanticGraph) {
  const nodes = (semanticGraph.nodes || []).map((node) => {
    const risk = riskForNode(node);
    return {
      id: stableId('node', node.path),
      path: node.path,
      title: node.title,
      type: node.node_kind,
      semantic_layer: node.semantic_layer,
      cognitive_role: node.cognitive_role,
      epistemic_status: node.epistemic_status,
      concept_terms: node.concept_terms || [],
      actionability: node.actionability,
      lifecycle_class: node.lifecycle_class,
      depends_on: [],
      enables: [capabilityIdForNode(node)],
      tools: toolsForNode(node),
      risks: risk === 'low' ? [] : [`${risk}_risk_operation`],
      tests: [testForNode(node)],
    };
  });
  const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
  for (const edge of semanticGraph.semantic_edges || []) {
    const source = nodeByPath.get(edge.source);
    if (!source) continue;
    if (['references', 'routes_to', 'summarizes', 'anchors_identity', 'readback_from', 'structural_relation'].includes(edge.relation)) {
      source.depends_on.push(edge.target);
    }
  }
  for (const node of nodes) node.depends_on = uniq(node.depends_on);
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      semantic_graph_source_hash: semanticGraph.source_hash,
      nodes,
    }),
    status: semanticGraph.status || 'unknown',
    compiled_from: 'md-os/ops/semantic_knowledge_graph.json',
    node_count: nodes.length,
    semantic_layer_counts: semanticGraph.semantic_layer_counts || {},
    nodes,
  };
}

function claimStatusFor(text, node) {
  const lower = shortText(text).toLowerCase();
  if (/\b(contradicted|contradiction|conflict|falsified)\b/.test(lower)) return 'contradicted';
  if (/\b(deprecated|obsolete|superseded)\b/.test(lower)) return 'deprecated';
  if (/\b(reproducible|replay|matched_before|deterministic|readback)\b/.test(lower)) return 'reproducible';
  if (/\b(validated|verified|accepted|status ok|passed)\b/.test(lower)) return 'validated';
  if (/\b(hypothesis|candidate|proposed|possible|may|could)\b/.test(lower)) return 'hypothesis';
  const epistemic = shortText(node.epistemic_status).toLowerCase();
  if (epistemic.includes('generated') || epistemic.includes('runtime_observation') || epistemic.includes('demo')) return 'reproducible';
  if (epistemic.includes('imported')) return 'raw';
  if (epistemic.includes('falsified')) return 'contradicted';
  if (epistemic.includes('canonical') || epistemic.includes('gate') || epistemic.includes('reference')) return 'working_model';
  return 'raw';
}

function normalizeClaimText(text) {
  return shortText(text)
    .toLowerCase()
    .replace(/[`"'()[\]{}<>:;,.!?/\\|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);
}

function extractCandidateClaims(text) {
  const cleaned = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((line) => shortText(line.replace(/^[-*]\s+/, '').replace(/^#{1,6}\s+/, '')))
    .filter((line) => line.length >= 24 && line.length <= 260)
    .filter((line) => CLAIM_MARKER.test(line));
  return uniq(cleaned).slice(0, 4);
}

function buildClaimIndex(semanticGraph) {
  const claims = [];
  const primaryClaimByNode = new Map();
  for (const node of semanticGraph.nodes || []) {
    const nodeText = readWorkspaceText(node.path);
    const profileText = `${node.title} is classified as ${node.semantic_layer}/${node.node_kind} with epistemic status ${node.epistemic_status}.`;
    const profileClaim = {
      claim_id: stableId('claim', `${node.path}:profile`),
      claim_type: 'node_profile',
      source_node: node.path,
      claim_text: profileText,
      normalized_claim: normalizeClaimText(profileText),
      status: 'reproducible',
      source_epistemic_status: node.epistemic_status,
      evidence: [{ path: node.path, kind: 'semantic_profile' }],
      depends_on_claims: [],
    };
    claims.push(profileClaim);
    primaryClaimByNode.set(node.path, profileClaim.claim_id);

    let index = 0;
    for (const candidate of extractCandidateClaims(nodeText)) {
      index += 1;
      const status = claimStatusFor(candidate, node);
      claims.push({
        claim_id: stableId('claim', `${node.path}:${index}:${candidate}`),
        claim_type: 'extracted_claim',
        source_node: node.path,
        claim_text: candidate,
        normalized_claim: normalizeClaimText(candidate),
        status,
        source_epistemic_status: node.epistemic_status,
        evidence: [{ path: node.path, kind: 'text_marker' }],
        depends_on_claims: [],
      });
    }
  }
  for (const edge of semanticGraph.semantic_edges || []) {
    const sourceClaim = primaryClaimByNode.get(edge.source);
    const targetClaim = primaryClaimByNode.get(edge.target);
    if (!sourceClaim || !targetClaim || sourceClaim === targetClaim) continue;
    const claim = claims.find((item) => item.claim_id === sourceClaim);
    if (claim) claim.depends_on_claims.push(targetClaim);
  }
  for (const claim of claims) claim.depends_on_claims = uniq(claim.depends_on_claims);
  const findings = claims
    .filter((claim) => !CLAIM_STATUSES.has(claim.status))
    .map((claim) => ({
      severity: 'critical',
      code: 'CLAIM_STATUS_INVALID',
      claim_id: claim.claim_id,
      path: claim.source_node,
      message: 'Every compiled claim must have a bounded epistemic lifecycle status.',
    }));
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(claims.map((claim) => ({
      claim_id: claim.claim_id,
      normalized_claim: claim.normalized_claim,
      status: claim.status,
      source_node: claim.source_node,
      depends_on_claims: claim.depends_on_claims,
    }))),
    status: statusFromFindings(findings),
    compiled_from: 'md-os/ops/semantic_knowledge_graph.json',
    allowed_statuses: Array.from(CLAIM_STATUSES).sort(),
    claim_count: claims.length,
    unstatused_claim_count: findings.length,
    findings,
    claims: claims.sort((left, right) => left.claim_id.localeCompare(right.claim_id)),
  };
}

function upsertCapability(map, capability) {
  const existing = map.get(capability.capability_id);
  if (!existing) {
    map.set(capability.capability_id, {
      ...capability,
      source_nodes: uniq(capability.source_nodes || []),
      tools: uniq(capability.tools || []),
      file_targets: uniq(capability.file_targets || []),
      requires: uniq(capability.requires || []),
      risks: uniq(capability.risks || []),
      tests: uniq(capability.tests || []),
    });
    return;
  }
  existing.source_nodes = uniq([...existing.source_nodes, ...(capability.source_nodes || [])]);
  existing.tools = uniq([...existing.tools, ...(capability.tools || [])]);
  existing.file_targets = uniq([...existing.file_targets, ...(capability.file_targets || [])]);
  existing.requires = uniq([...existing.requires, ...(capability.requires || [])]);
  existing.risks = uniq([...existing.risks, ...(capability.risks || [])]);
  existing.tests = uniq([...existing.tests, ...(capability.tests || [])]);
}

function buildCapabilityIndex(semanticGraph, connectorRegistry, compiledPrograms, skillRegistry = { promoted_skills: [] }) {
  const capabilities = new Map();
  for (const node of semanticGraph.nodes || []) {
    const risk = riskForNode(node);
    upsertCapability(capabilities, {
      capability_id: capabilityIdForNode(node),
      capability_type: capabilityTypeForNode(node),
      source_nodes: [node.path],
      tools: toolsForNode(node),
      file_targets: fileTargetsForNode(node),
      requires: requiresForRisk(risk, node),
      risks: risk === 'low' ? [] : [`${risk}_risk_operation`],
      readback: 'artifact_or_runtime_state_required',
      rollback: node.semantic_layer === 'identity' ? 'self_release_rollback_or_manual_revert' : 'rebuild_or_demote_generated_state',
      tests: [testForNode(node)],
    });
  }
  for (const connector of connectorRegistry.connectors || []) {
    const risk = shortText(connector.risk_level || 'unclassified') || 'unclassified';
    const requires = ['connector_registry_entry', 'runtime_readback'];
    if (risk === 'medium' || risk === 'high') requires.push('permission_gate');
    if (connector.requires_approval === true) requires.push('human_approval');
    upsertCapability(capabilities, {
      capability_id: `connector.${shortText(connector.connector_id)}`,
      capability_type: 'instrumental',
      source_nodes: ['md-os/ops/connectors/connector_registry.json'],
      tools: [shortText(connector.connector_id), shortText(connector.kind)].filter(Boolean),
      file_targets: ['md-os/ops/sources/connectors/', 'md-os/ops/artifacts/'],
      requires,
      risks: risk && risk !== 'low' ? [`${risk}_risk_connector`] : [],
      readback: 'connector_snapshot_or_action_record',
      rollback: shortText(connector.rollback_or_recovery_note || 'remove generated connector artifacts or demote source profile'),
      tests: [`connector_${shortText(connector.connector_id)}_smoke_test`],
      connector: {
        status: shortText(connector.status || ''),
        execution_mode: shortText(connector.execution_mode || ''),
        permission_profile: shortText(connector.permission_profile || ''),
        read_capabilities: Array.isArray(connector.read_capabilities) ? connector.read_capabilities.map(shortText).filter(Boolean) : [],
        write_capabilities: Array.isArray(connector.write_capabilities) ? connector.write_capabilities.map(shortText).filter(Boolean) : [],
      },
    });
  }
  for (const program of compiledPrograms.programs || []) {
    upsertCapability(capabilities, {
      capability_id: `program.${shortText(program.program_id)}`,
      capability_type: 'procedural',
      source_nodes: [program.source_file],
      tools: [],
      file_targets: ['md-os/ops/projects/', 'md-os/ops/agenda/', 'md-os/ops/journal.ndjson'],
      requires: Array.isArray(program.conditions) ? program.conditions.map(shortText).filter(Boolean) : ['program_conditions'],
      risks: [],
      readback: 'work_item_agenda_or_journal_readback',
      rollback: 'demote or edit natural-language program source',
      tests: ['compile_programs_check', 'runtime_replay_check'],
    });
  }
  const runtimeSkills = Array.isArray(skillRegistry.runtime_eligible_promoted_skills)
    ? skillRegistry.runtime_eligible_promoted_skills
    : [];
  for (const skill of runtimeSkills) {
    upsertCapability(capabilities, {
      capability_id: `skill.${shortText(skill.skill_id)}`,
      capability_type: 'procedural',
      source_nodes: ['md-os/ops/skills/skill_registry.json', ...(skill.source_episodes || []).map((episodeId) => `md-os/ops/episodes/${episodeId}.json`)],
      tools: Array.isArray(skill.tools) ? skill.tools.map(shortText).filter(Boolean) : [],
      file_targets: ['md-os/ops/episodes/', 'md-os/ops/trajectories/', 'md-os/ops/evals/', 'md-os/ops/runtime/'],
      requires: uniq([
        'formal_episode',
        'verifier_passed',
        'eval_passed',
        'promotion_gate',
        'runtime_rebuild',
        ...(skill.preconditions || []).map(shortText).filter(Boolean),
      ]),
      risks: [],
      readback: 'episode_eval_skill_registry_and_runtime_compiler_readback',
      rollback: shortText(skill.rollback || 'demote promoted skill and rebuild agi eval plus runtime compiler'),
      tests: Array.isArray(skill.evals) && skill.evals.length ? skill.evals.map(shortText) : ['agi_eval_report_check'],
      skill: {
        status: shortText(skill.status || ''),
        domain: shortText(skill.domain || ''),
        source_episodes: Array.isArray(skill.source_episodes) ? skill.source_episodes.map(shortText).filter(Boolean) : [],
      },
    });
  }
  const findings = [];
  for (const capability of capabilities.values()) {
    const needsGate = capability.risks.some((risk) => risk.includes('medium') || risk.includes('high'));
    if (needsGate && !capability.requires.some((item) => item.includes('permission') || item.includes('approval') || item.includes('human'))) {
      findings.push({
        severity: 'critical',
        code: 'CAPABILITY_GATE_MISSING',
        capability_id: capability.capability_id,
        message: 'Medium or high risk capability must expose a permission or approval gate.',
      });
    }
    if (!capability.readback) {
      findings.push({
        severity: 'critical',
        code: 'CAPABILITY_READBACK_MISSING',
        capability_id: capability.capability_id,
        message: 'Every operational capability must define readback.',
      });
    }
  }
  const capabilityList = Array.from(capabilities.values())
    .sort((left, right) => left.capability_id.localeCompare(right.capability_id));
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(capabilityList),
    status: statusFromFindings(findings),
    capability_count: capabilityList.length,
    findings,
    capabilities: capabilityList,
  };
}

function buildLinkIndex(semanticGraph, claimIndex, capabilityIndex) {
  const links = [];
  for (const edge of semanticGraph.semantic_edges || []) {
    links.push({
      link_id: stableId('link', `${edge.source}->${edge.target}:${edge.relation}`),
      link_type: ['references', 'routes_to', 'summarizes', 'structural_relation'].includes(edge.relation) ? 'explicit_or_structural' : 'semantic_operational',
      source: edge.source,
      target: edge.target,
      relation: edge.relation,
      evidence: edge.evidence,
    });
  }
  for (const relation of (semanticGraph.concept_relations || []).slice(0, 250)) {
    links.push({
      link_id: stableId('link', `${relation.source_term}->${relation.target_term}:concept`),
      link_type: 'semantic',
      source: relation.source_term,
      target: relation.target_term,
      relation: relation.relation,
      evidence_nodes: relation.evidence_nodes || [],
    });
  }
  for (const claim of claimIndex.claims) {
    for (const dependency of claim.depends_on_claims) {
      links.push({
        link_id: stableId('link', `${claim.claim_id}->${dependency}:claim_dependency`),
        link_type: 'epistemic',
        source: claim.claim_id,
        target: dependency,
        relation: 'claim_depends_on_claim',
        evidence: claim.source_node,
      });
    }
  }
  for (const capability of capabilityIndex.capabilities) {
    for (const node of capability.source_nodes) {
      links.push({
        link_id: stableId('link', `${node}->${capability.capability_id}:enables`),
        link_type: 'capability',
        source: node,
        target: capability.capability_id,
        relation: 'node_enables_capability',
        evidence: 'capability_compiler',
      });
    }
  }
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(links),
    status: 'ok',
    link_count: links.length,
    link_type_counts: links.reduce((acc, link) => {
      acc[link.link_type] = (acc[link.link_type] || 0) + 1;
      return acc;
    }, {}),
    links: links.sort((left, right) => left.link_id.localeCompare(right.link_id)),
  };
}

function compactNodeLine(node) {
  return `${node.path} | ${node.semantic_layer}/${node.type} | ${node.epistemic_status} | enables ${node.enables.join(', ')}`;
}

function buildContextPack(packId, purpose, nodes, claims, capabilities, predicate) {
  const selectedNodes = nodes.filter(predicate).slice(0, 24);
  const nodePaths = new Set(selectedNodes.map((node) => node.path));
  const selectedClaims = claims.filter((claim) => nodePaths.has(claim.source_node)).slice(0, 40);
  const capabilityIds = new Set(selectedNodes.flatMap((node) => node.enables));
  const selectedCapabilities = capabilities.filter((capability) => capabilityIds.has(capability.capability_id)).slice(0, 20);
  return {
    schema_version: 1,
    pack_id: packId,
    updated_at: nowIso(),
    purpose,
    retrieval_policy: 'Compiled from semantic layer, cognitive role, claim status, and capability affordance. Do not load the full repository when this compact pack is sufficient.',
    node_count: selectedNodes.length,
    claim_count: selectedClaims.length,
    capability_count: selectedCapabilities.length,
    nodes: selectedNodes.map((node) => ({
      id: node.id,
      path: node.path,
      title: node.title,
      semantic_layer: node.semantic_layer,
      epistemic_status: node.epistemic_status,
      enables: node.enables,
    })),
    claims: selectedClaims.map((claim) => ({
      claim_id: claim.claim_id,
      status: claim.status,
      source_node: claim.source_node,
      claim_text: claim.claim_text,
    })),
    capabilities: selectedCapabilities.map((capability) => ({
      capability_id: capability.capability_id,
      capability_type: capability.capability_type,
      requires: capability.requires,
      risks: capability.risks,
      readback: capability.readback,
    })),
    compact_text: [
      `Context pack: ${packId}`,
      `Purpose: ${purpose}`,
      ...selectedNodes.slice(0, 12).map(compactNodeLine),
    ].join('\n'),
  };
}

function buildContextPacks(semanticIndex, claimIndex, capabilityIndex) {
  const nodes = semanticIndex.nodes;
  const claims = claimIndex.claims;
  const capabilities = capabilityIndex.capabilities;
  const packMap = {
    bootstrap: buildContextPack('bootstrap', 'Identity frame, bootstrap rules, and non-claims.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'identity' || ['AGENTS.md', 'ME.md', 'README.md', 'md-os/kb/COGNITIVE_BOOTSTRAP.md', 'md-os/kb/OPERATIONS.md'].includes(node.path)
    )),
    operations: buildContextPack('operations', 'Operational policies, application sources, connectors, and procedures.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'operational' || node.semantic_layer === 'operational_application'
    )),
    epistemic: buildContextPack('epistemic', 'Claim lifecycle, validation, risk, scientific, and contradiction gates.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'epistemic' || node.epistemic_status.includes('gate')
    )),
    semantic_task: buildContextPack('semantic_task', 'Semantic routing and task-completion context for dynamic external cognition.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'semantic' || node.semantic_layer === 'coherence'
    )),
    import: buildContextPack('import', 'Knowledge import, identity import, promotion, and assimilation gates.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'import' || node.semantic_layer === 'imported_knowledge' || node.path.includes('KNOWLEDGE_IMPORT')
    )),
    runtime_health: buildContextPack('runtime_health', 'Generated readback, replay, health, lifecycle, and diagnostic state.', nodes, claims, capabilities, (node) => (
      node.semantic_layer === 'runtime_readback' || node.cognitive_role === 'sensor_readback'
    )),
    agi_learning: buildContextPack('agi_learning', 'Verified action-learning loop, episodes, skills, evals, promotion gates, and world model.', nodes, claims, capabilities, (node) => (
      node.path.includes('COGNITIVE_TRANSACTION_LOOP') || node.path.includes('SOFTWARE_REPAIR_BENCHMARK') || node.path.includes('VERIFIED_AGI_LOOP') || node.path.includes('AGI_OPERATING_SUBSTRATE') || node.path.includes('/benchmarks/software_repair/') || node.path.includes('/ops/agi/') || node.path.includes('/ops/tasks/') || node.path.includes('/ops/action_receipts/') || node.path.includes('/ops/verifications/') || node.path.includes('/ops/benchmarks/software_repair/') || node.path.includes('/ops/skills/') || node.path.includes('/ops/evals/')
    )),
  };
  const packs = CONTEXT_PACKS.map((packId) => packMap[packId]);
  const index = {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(packs.map((pack) => ({
      pack_id: pack.pack_id,
      nodes: pack.nodes.map((node) => node.path),
      claims: pack.claims.map((claim) => claim.claim_id),
      capabilities: pack.capabilities.map((capability) => capability.capability_id),
    }))),
    status: 'ok',
    context_pack_count: packs.length,
    packs: packs.map((pack) => ({
      pack_id: pack.pack_id,
      file: `md-os/ops/runtime/context_packs/${pack.pack_id}.json`,
      purpose: pack.purpose,
      node_count: pack.node_count,
      claim_count: pack.claim_count,
      capability_count: pack.capability_count,
    })),
  };
  return { index, packs };
}

function buildEpistemicHealth(semanticGraph, markdownGraph, claimIndex, capabilityIndex, selfRelease, agenticCore) {
  const findings = [];
  const claimsByNormalized = new Map();
  for (const claim of claimIndex.claims) {
    const list = claimsByNormalized.get(claim.normalized_claim) || [];
    list.push(claim);
    claimsByNormalized.set(claim.normalized_claim, list);
  }
  for (const [normalized, claims] of claimsByNormalized.entries()) {
    if (claims.length > 1) {
      findings.push({
        severity: 'info',
        code: 'CLAIM_DUPLICATE',
        normalized_claim: normalized,
        claim_ids: claims.map((claim) => claim.claim_id).sort(),
        message: 'Duplicate or near-identical compiled claims should be reviewed for merge or relation.',
      });
    }
    const statuses = new Set(claims.map((claim) => claim.status));
    if (statuses.has('contradicted') && (statuses.has('validated') || statuses.has('reproducible'))) {
      findings.push({
        severity: 'critical',
        code: 'CLAIM_CONFLICT',
        normalized_claim: normalized,
        claim_ids: claims.map((claim) => claim.claim_id).sort(),
        message: 'Contradicted and validated/reproducible statuses collide on the same normalized claim.',
      });
    }
  }
  for (const link of markdownGraph.explicit_links || []) {
    if (link.status && link.status !== 'resolved') {
      findings.push({
        severity: 'attention',
        code: 'BROKEN_MARKDOWN_LINK',
        path: link.source,
        target: link.target,
        message: 'Explicit Markdown link does not resolve to a known node.',
      });
    }
  }
  for (const nodePath of semanticGraph.disconnected_nodes || []) {
    findings.push({
      severity: 'attention',
      code: 'SEMANTIC_ORPHAN',
      path: nodePath,
      message: 'Semantic node is profiled but disconnected from the Markdown graph.',
    });
  }
  for (const capability of capabilityIndex.capabilities) {
    const highRisk = capability.risks.some((risk) => risk.includes('high'));
    if (highRisk && !capability.requires.some((item) => item.includes('human') || item.includes('approval'))) {
      findings.push({
        severity: 'critical',
        code: 'UNSAFE_OPERATION_GATE_MISSING',
        capability_id: capability.capability_id,
        message: 'High-risk operation must require human approval or explicit human intent.',
      });
    }
  }
  const currentRelease = selfRelease.current_release || {};
  const coreIdentity = agenticCore.core && agenticCore.core.identity || {};
  if (currentRelease.unified_identity && coreIdentity.name && currentRelease.unified_identity !== coreIdentity.name) {
    findings.push({
      severity: 'critical',
      code: 'IDENTITY_DRIFT',
      message: 'Self-release identity and agentic core identity diverge.',
    });
  }
  for (const node of semanticGraph.nodes || []) {
    const text = readWorkspaceText(node.path);
    for (const marker of LEGACY_MARKERS) {
      if (text.includes(marker)) {
        findings.push({
          severity: 'attention',
          code: 'STALE_INSTRUCTION_MARKER',
          path: node.path,
          marker_hash: sha256Text(marker).slice(0, 12),
          message: 'A stale instruction marker appears in source text and should be migrated or justified.',
        });
      }
    }
  }
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(findings),
    status: statusFromFindings(findings),
    invariant_checks: {
      every_claim_has_status: claimIndex.unstatused_claim_count === 0,
      capability_readback_required: capabilityIndex.findings.every((finding) => finding.code !== 'CAPABILITY_READBACK_MISSING'),
      identity_core_aligned: !findings.some((finding) => finding.code === 'IDENTITY_DRIFT'),
      broken_link_count: findings.filter((finding) => finding.code === 'BROKEN_MARKDOWN_LINK').length,
      semantic_orphan_count: findings.filter((finding) => finding.code === 'SEMANTIC_ORPHAN').length,
    },
    finding_count: findings.length,
    findings: findings.slice(0, 500),
  };
}

function buildEvalResults(inputs, indexes, contextPacks, epistemicHealth) {
  const checks = [
    {
      check_id: 'semantic_graph_ok',
      status: inputs.semanticGraph && inputs.semanticGraph.status === 'ok' ? 'ok' : 'critical',
      message: 'Semantic graph must be present and ok before runtime compilation.',
    },
    {
      check_id: 'claim_status_complete',
      status: indexes.claimIndex.unstatused_claim_count === 0 ? 'ok' : 'critical',
      message: 'Every compiled claim has a bounded epistemic lifecycle status.',
    },
    {
      check_id: 'capability_gates_complete',
      status: indexes.capabilityIndex.status === 'ok' ? 'ok' : indexes.capabilityIndex.status,
      message: 'Every medium/high risk capability exposes required gates and readback.',
    },
    {
      check_id: 'context_packs_compiled',
      status: contextPacks.index.context_pack_count === CONTEXT_PACKS.length ? 'ok' : 'critical',
      message: 'Runtime context packs are available for compact injection.',
    },
    {
      check_id: 'epistemic_health',
      status: epistemicHealth.status,
      message: 'Contradiction, stale marker, broken link, unsafe operation, identity drift, and orphan checks completed.',
    },
    {
      check_id: 'replay_readback',
      status: !inputs.replay || inputs.replay.matched_before === undefined || inputs.replay.matched_before === true ? 'ok' : 'attention',
      message: 'Replay should match before after compiler integration; missing replay is allowed while replay itself is rebuilding.',
    },
  ];
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json(checks),
    status: statusFromFindings(checks
      .filter((check) => check.status !== 'ok')
      .map((check) => ({
        severity: check.status === 'critical' ? 'critical' : 'attention',
        code: check.check_id.toUpperCase(),
        message: check.message,
      }))),
    compiler_pipeline: [
      'source',
      'semantic_index',
      'claim_graph',
      'capability_graph',
      'link_graph',
      'context_packs',
      'verified_agi_loop',
      'skill_registry',
      'epistemic_health',
      'eval_results',
      'promotion_gate',
      'replayable_state',
    ],
    checks,
  };
}

function markdownTable(rows, columns) {
  const header = `| ${columns.join(' | ')} |`;
  const divider = `| ${columns.map(() => '---').join(' | ')} |`;
  const body = rows.map((row) => `| ${columns.map((column) => shortText(row[column] ?? '')).join(' | ')} |`);
  return [header, divider, ...body].join('\n');
}

function renderSemanticIndexMarkdown(index) {
  return [
    '# Runtime Semantic Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    `Node count: \`${index.node_count}\``,
    '',
    markdownTable(index.nodes.slice(0, 150).map((node) => ({
      path: node.path,
      layer: node.semantic_layer,
      type: node.type,
      epistemic: node.epistemic_status,
      enables: node.enables.join(', '),
    })), ['path', 'layer', 'type', 'epistemic', 'enables']),
    '',
  ].join('\n');
}

function renderClaimIndexMarkdown(index) {
  return [
    '# Runtime Claim Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    `Claims: \`${index.claim_count}\``,
    `Unstatused claims: \`${index.unstatused_claim_count}\``,
    '',
    markdownTable(index.claims.slice(0, 160).map((claim) => ({
      id: claim.claim_id,
      status: claim.status,
      source: claim.source_node,
      claim: claim.claim_text,
    })), ['id', 'status', 'source', 'claim']),
    '',
  ].join('\n');
}

function renderCapabilityIndexMarkdown(index) {
  return [
    '# Runtime Capability Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    `Capabilities: \`${index.capability_count}\``,
    '',
    markdownTable(index.capabilities.map((capability) => ({
      capability: capability.capability_id,
      type: capability.capability_type,
      risks: capability.risks.join(', '),
      requires: capability.requires.join(', '),
      readback: capability.readback,
    })), ['capability', 'type', 'risks', 'requires', 'readback']),
    '',
  ].join('\n');
}

function renderLinkIndexMarkdown(index) {
  return [
    '# Runtime Link Index',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    `Links: \`${index.link_count}\``,
    '',
    markdownTable(index.links.slice(0, 200).map((link) => ({
      type: link.link_type,
      source: link.source,
      relation: link.relation,
      target: link.target,
    })), ['type', 'source', 'relation', 'target']),
    '',
  ].join('\n');
}

function renderEvalMarkdown(evalResults) {
  return [
    '# Runtime Eval Results',
    '',
    `Updated at: \`${evalResults.updated_at}\``,
    `Status: \`${evalResults.status}\``,
    '',
    markdownTable(evalResults.checks, ['check_id', 'status', 'message']),
    '',
  ].join('\n');
}

function renderContextIndexMarkdown(index) {
  return [
    '# Runtime Context Packs',
    '',
    `Updated at: \`${index.updated_at}\``,
    `Status: \`${index.status}\``,
    '',
    markdownTable(index.packs, ['pack_id', 'file', 'purpose', 'node_count', 'claim_count', 'capability_count']),
    '',
  ].join('\n');
}

function renderCompilerMarkdown(summary) {
  return [
    '# Semantic Operational Compiler',
    '',
    `Updated at: \`${summary.updated_at}\``,
    `Status: \`${summary.status}\``,
    '',
    'The runtime compiler turns Markdown knowledge, semantic graph state, claim lifecycle, capability affordances, policy gates, and compact context packs into replayable operational cognition.',
    '',
    '## Outputs',
    '',
    ...summary.outputs.map((output) => `- \`${output}\``),
    '',
    '## Counts',
    '',
    `- semantic nodes: \`${summary.counts.semantic_nodes}\``,
    `- claims: \`${summary.counts.claims}\``,
    `- capabilities: \`${summary.counts.capabilities}\``,
    `- links: \`${summary.counts.links}\``,
    `- context packs: \`${summary.counts.context_packs}\``,
    `- epistemic findings: \`${summary.counts.epistemic_findings}\``,
    '',
  ].join('\n');
}

function renderDriftMarkdown(epistemicHealth) {
  const lines = [
    '# Semantic Drift Report',
    '',
    `Updated at: \`${epistemicHealth.updated_at}\``,
    `Status: \`${epistemicHealth.status}\``,
    '',
    '## Invariant Checks',
    '',
  ];
  for (const [key, value] of Object.entries(epistemicHealth.invariant_checks)) {
    lines.push(`- \`${key}\`: \`${value}\``);
  }
  lines.push('', '## Findings', '');
  if (!epistemicHealth.findings.length) {
    lines.push('- No semantic drift findings detected.');
  } else {
    for (const finding of epistemicHealth.findings.slice(0, 120)) {
      lines.push(`- \`${finding.severity}\` \`${finding.code}\`: ${finding.path ? `\`${finding.path}\` - ` : ''}${finding.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function buildRuntimeCompiler() {
  const inputs = {
    semanticGraph: readJsonSafe(SEMANTIC_GRAPH_JSON),
    markdownGraph: readJsonSafe(MARKDOWN_GRAPH_JSON) || {},
    connectorRegistry: readJsonSafe(CONNECTOR_REGISTRY_JSON) || { connectors: [] },
    compiledPrograms: readJsonSafe(COMPILED_PROGRAMS_JSON) || { programs: [] },
    agenticCore: readJsonSafe(AGENTIC_CORE_JSON) || {},
    selfRelease: readJsonSafe(SELF_RELEASE_JSON) || {},
    health: readJsonSafe(HEALTH_JSON) || {},
    replay: readJsonSafe(REPLAY_REPORT_JSON) || {},
    skillRegistry: readJsonSafe(SKILL_REGISTRY_JSON) || { promoted_skills: [], candidate_skills: [] },
    agiLoop: readJsonSafe(AGI_LOOP_STATUS_JSON) || {},
    agiEval: readJsonSafe(AGI_EVAL_REPORT_JSON) || {},
    worldModel: readJsonSafe(WORLD_MODEL_JSON) || {},
  };
  if (!inputs.semanticGraph) {
    const now = nowIso();
    const finding = {
      severity: 'critical',
      code: 'SEMANTIC_GRAPH_MISSING',
      message: 'Run build_semantic_knowledge_graph before build_runtime_compiler.',
    };
    const empty = {
      schema_version: 1,
      updated_at: now,
      status: 'critical',
      findings: [finding],
      nodes: [],
    };
    return {
      summary: {
        schema_version: 1,
        updated_at: now,
        status: 'critical',
        source_hash: sha256Json(finding),
        outputs: Object.values(OUTPUTS).map(rel),
        counts: { semantic_nodes: 0, claims: 0, capabilities: 0, links: 0, context_packs: 0, epistemic_findings: 1 },
        findings: [finding],
      },
      semanticIndex: { ...empty, node_count: 0, semantic_layer_counts: {} },
      claimIndex: { ...empty, claim_count: 0, unstatused_claim_count: 0, claims: [] },
      capabilityIndex: { ...empty, capability_count: 0, capabilities: [] },
      linkIndex: { ...empty, link_count: 0, link_type_counts: {}, links: [] },
      contextPacks: { index: { ...empty, context_pack_count: 0, packs: [] }, packs: [] },
      evalResults: { ...empty, checks: [] },
      epistemicHealth: { ...empty, invariant_checks: {}, finding_count: 1, findings: [finding] },
    };
  }
  const semanticIndex = buildSemanticIndex(inputs.semanticGraph);
  const claimIndex = buildClaimIndex(inputs.semanticGraph);
  const capabilityIndex = buildCapabilityIndex(inputs.semanticGraph, inputs.connectorRegistry, inputs.compiledPrograms, inputs.skillRegistry);
  const linkIndex = buildLinkIndex(inputs.semanticGraph, claimIndex, capabilityIndex);
  const contextPacks = buildContextPacks(semanticIndex, claimIndex, capabilityIndex);
  const epistemicHealth = buildEpistemicHealth(
    inputs.semanticGraph,
    inputs.markdownGraph,
    claimIndex,
    capabilityIndex,
    inputs.selfRelease,
    inputs.agenticCore
  );
  const evalResults = buildEvalResults(inputs, { claimIndex, capabilityIndex }, contextPacks, epistemicHealth);
  const status = statusFromFindings([
    semanticIndex.status === 'critical' ? { severity: 'critical' } : null,
    claimIndex.status !== 'ok' ? { severity: claimIndex.status } : null,
    capabilityIndex.status !== 'ok' ? { severity: capabilityIndex.status } : null,
    evalResults.status !== 'ok' ? { severity: evalResults.status } : null,
  ].filter(Boolean));
  const summary = {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      semantic_index: semanticIndex.source_hash,
      claim_index: claimIndex.source_hash,
      capability_index: capabilityIndex.source_hash,
      link_index: linkIndex.source_hash,
      context_packs: contextPacks.index.source_hash,
      eval_results: evalResults.source_hash,
      epistemic_health: epistemicHealth.source_hash,
    }),
    status,
    compiler_name: 'semantic_operational_compiler',
    compiled_from: [
      'md-os/ops/semantic_knowledge_graph.json',
      'md-os/ops/markdown_graph.json',
      'md-os/ops/connectors/connector_registry.json',
      'md-os/ops/compiled/programs.json',
      'md-os/ops/skills/skill_registry.json',
      'md-os/ops/agi/loop_status.json',
      'md-os/ops/evals/agi_eval_report.json',
      'md-os/ops/world/world_model.json',
    ],
    outputs: Object.values(OUTPUTS).map(rel),
    counts: {
      semantic_nodes: semanticIndex.node_count,
      claims: claimIndex.claim_count,
      capabilities: capabilityIndex.capability_count,
      links: linkIndex.link_count,
      context_packs: contextPacks.index.context_pack_count,
      epistemic_findings: epistemicHealth.finding_count,
    },
    findings: [
      ...claimIndex.findings,
      ...capabilityIndex.findings,
      ...epistemicHealth.findings.slice(0, 50),
    ],
  };
  return {
    summary,
    semanticIndex,
    claimIndex,
    capabilityIndex,
    linkIndex,
    contextPacks,
    evalResults,
    epistemicHealth,
  };
}

function writeRuntimeCompiler(compiled) {
  withFileLock('builder__runtime_compiler', {
    context: 'build_runtime_compiler',
    timeoutMs: 120000,
    staleMs: 900000,
  }, () => {
    fs.mkdirSync(CONTEXT_PACK_DIR, { recursive: true });
    atomicWriteJson(OUTPUTS.compilerJson, compiled.summary);
    atomicWriteText(OUTPUTS.compilerMd, renderCompilerMarkdown(compiled.summary));
    atomicWriteJson(OUTPUTS.semanticJson, compiled.semanticIndex);
    atomicWriteText(OUTPUTS.semanticMd, renderSemanticIndexMarkdown(compiled.semanticIndex));
    atomicWriteJson(OUTPUTS.claimJson, compiled.claimIndex);
    atomicWriteText(OUTPUTS.claimMd, renderClaimIndexMarkdown(compiled.claimIndex));
    atomicWriteJson(OUTPUTS.capabilityJson, compiled.capabilityIndex);
    atomicWriteText(OUTPUTS.capabilityMd, renderCapabilityIndexMarkdown(compiled.capabilityIndex));
    atomicWriteJson(OUTPUTS.linkJson, compiled.linkIndex);
    atomicWriteText(OUTPUTS.linkMd, renderLinkIndexMarkdown(compiled.linkIndex));
    atomicWriteJson(OUTPUTS.evalJson, compiled.evalResults);
    atomicWriteText(OUTPUTS.evalMd, renderEvalMarkdown(compiled.evalResults));
    atomicWriteJson(OUTPUTS.epistemicJson, compiled.epistemicHealth);
    atomicWriteText(OUTPUTS.driftMd, renderDriftMarkdown(compiled.epistemicHealth));
    atomicWriteJson(OUTPUTS.contextIndexJson, compiled.contextPacks.index);
    atomicWriteText(OUTPUTS.contextIndexMd, renderContextIndexMarkdown(compiled.contextPacks.index));
    for (const pack of compiled.contextPacks.packs) {
      atomicWriteJson(path.join(CONTEXT_PACK_DIR, `${pack.pack_id}.json`), pack);
    }
  });
}

function main() {
  const compiled = buildRuntimeCompiler();
  writeRuntimeCompiler(compiled);
  appendJournal({
    event: 'runtime_compiler_rebuilt',
    builder: 'build_runtime_compiler',
    status: compiled.summary.status,
    semantic_nodes: compiled.summary.counts.semantic_nodes,
    claims: compiled.summary.counts.claims,
    capabilities: compiled.summary.counts.capabilities,
    links: compiled.summary.counts.links,
    context_packs: compiled.summary.counts.context_packs,
    epistemic_findings: compiled.summary.counts.epistemic_findings,
  });
  printJson({
    ok: true,
    mode: 'build_runtime_compiler',
    updated_at: compiled.summary.updated_at,
    status: compiled.summary.status,
    output_json: rel(OUTPUTS.compilerJson),
    semantic_index: rel(OUTPUTS.semanticJson),
    claim_index: rel(OUTPUTS.claimJson),
    capability_index: rel(OUTPUTS.capabilityJson),
    link_index: rel(OUTPUTS.linkJson),
    context_packs: rel(CONTEXT_PACK_DIR),
    eval_results: rel(OUTPUTS.evalJson),
    epistemic_health: rel(OUTPUTS.epistemicJson),
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCapabilityIndex,
  buildClaimIndex,
  buildContextPacks,
  buildEpistemicHealth,
  buildLinkIndex,
  buildRuntimeCompiler,
  buildSemanticIndex,
  claimStatusFor,
};
