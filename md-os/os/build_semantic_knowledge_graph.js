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
const { classify } = require('./build_runtime_lifecycle_index');

const OPS_DIR = path.join(MDOS_ROOT, 'ops');
const OUTPUT_JSON = path.join(OPS_DIR, 'semantic_knowledge_graph.json');
const OUTPUT_MD = path.join(OPS_DIR, 'semantic_knowledge_graph.md');
const OUTPUT_SUMMARY_JSON = path.join(OPS_DIR, 'semantic_knowledge_summary.json');
const OUTPUT_SUMMARY_MD = path.join(OPS_DIR, 'semantic_knowledge_summary.md');
const OUTPUT_MD_REL = 'md-os/ops/semantic_knowledge_graph.md';
const OUTPUT_JSON_REL = 'md-os/ops/semantic_knowledge_graph.json';
const OUTPUT_SUMMARY_MD_REL = 'md-os/ops/semantic_knowledge_summary.md';
const OUTPUT_SUMMARY_JSON_REL = 'md-os/ops/semantic_knowledge_summary.json';
const MARKDOWN_GRAPH_JSON = path.join(OPS_DIR, 'markdown_graph.json');
const RUNTIME_LIFECYCLE_JSON = path.join(OPS_DIR, 'runtime_lifecycle_index.json');
const SKIPPED_DIRS = new Set(['.git', 'node_modules', '.cache', 'graphify-out']);
const SKIPPED_PATH_PREFIXES = ['md-os/ops/local/'];
const SKIPPED_DERIVED_MARKDOWN = new Set(['index.md']);
const VIRTUAL_GENERATED_MD_NODES = [
  'md-os/ops/agenda/global_agenda.md',
  'md-os/ops/compiled/programs.md',
  'md-os/ops/core/agentic_core.md',
  'md-os/ops/global_index.md',
  'md-os/ops/health.md',
  'md-os/ops/health_classification.md',
  'md-os/ops/agi/loop_status.md',
  'md-os/ops/agi/promotion_gate.md',
  'md-os/ops/skills/skill_registry.md',
  'md-os/ops/evals/agi_eval_report.md',
  'md-os/ops/failures/failure_index.md',
  'md-os/ops/world/world_model.md',
  'md-os/ops/benchmarks/agi_benchmarks.md',
  'md-os/ops/benchmarks/software_repair/index.md',
  'md-os/ops/markdown_graph.md',
  'md-os/ops/releases/self_release_index.md',
  'md-os/ops/runtime/semantic_operational_compiler.md',
  'md-os/ops/runtime/semantic_index.md',
  'md-os/ops/runtime/claim_index.md',
  'md-os/ops/runtime/capability_index.md',
  'md-os/ops/runtime/link_index.md',
  'md-os/ops/runtime/eval_results.md',
  'md-os/ops/runtime/semantic_drift_report.md',
  'md-os/ops/runtime/context_packs/index.md',
  'md-os/ops/runtime/operating_cycle_report.md',
  'md-os/ops/replay_report.md',
  'md-os/ops/runtime_lifecycle_index.md',
  OUTPUT_MD_REL,
  OUTPUT_SUMMARY_MD_REL,
  'md-os/ops/summary/active_work_items.md',
  'md-os/ops/summary/conceptual_boot_summary.md',
  'md-os/ops/system_hygiene_status.md',
  'md-os/ops/workspace_inventory.md',
];
const DETERMINISTIC_GENERATED_MD_NODE_SET = new Set(VIRTUAL_GENERATED_MD_NODES);

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'by',
  'for',
  'from',
  'in',
  'into',
  'is',
  'it',
  'md',
  'cortex',
  'of',
  'on',
  'or',
  'os',
  'the',
  'to',
  'with',
]);

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function posixDir(relativePath) {
  const dir = path.posix.dirname(relativePath);
  return dir === '.' ? '' : dir;
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

function existsRelative(relativePath) {
  return fs.existsSync(path.join(WORKSPACE_ROOT, relativePath));
}

function collectMarkdownFiles(rootDir) {
  const files = [];
  const stack = [rootDir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        const relativeDir = `${rel(fullPath).replace(/\/$/, '')}/`;
        if (SKIPPED_PATH_PREFIXES.some((prefix) => relativeDir.startsWith(prefix))) continue;
        stack.push(fullPath);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.md') continue;
      const relative = rel(fullPath);
      if (SKIPPED_DERIVED_MARKDOWN.has(relative)) continue;
      if (relative === OUTPUT_MD_REL || relative === OUTPUT_SUMMARY_MD_REL) continue;
      if (DETERMINISTIC_GENERATED_MD_NODE_SET.has(relative)) continue;
      const stats = fs.statSync(fullPath);
      files.push({
        path: relative,
        basename: entry.name,
        directory: posixDir(relative),
        size_bytes: stats.size,
        virtual_generated: false,
        text: readTextSafe(fullPath),
      });
    }
  }
  return files.sort((left, right) => left.path.localeCompare(right.path));
}

function titleFromMarkdown(text, fallback) {
  const match = String(text || '').match(/^#\s+(.+)$/m);
  return shortText(match && match[1] || fallback);
}

function extractHeadings(text) {
  return Array.from(String(text || '').matchAll(/^#{1,6}\s+(.+)$/gm))
    .map((match) => shortText(match[1]))
    .filter(Boolean);
}

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[`"'()[\]{}<>:;,.!?/\\|]+/g, ' ')
    .split(/[\s_-]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && !STOP_WORDS.has(item) && !/^\d+$/.test(item));
}

function conceptTermsFor(file, title, headings) {
  const source = [
    file.path.replace(/\.md$/i, ''),
    title,
    headings.slice(0, 8).join(' '),
  ].join(' ');
  const seen = new Set();
  const terms = [];
  for (const token of tokenize(source)) {
    if (seen.has(token)) continue;
    seen.add(token);
    terms.push(token);
    if (terms.length >= 12) break;
  }
  if (terms.length) return terms;
  return [path.posix.basename(file.path, '.md').toLowerCase() || 'markdown_node'];
}

function countMatches(text, regexp) {
  return (String(text || '').match(regexp) || []).length;
}

function semanticLayerFor(relativePath, text, lifecycle) {
  const lowerPath = relativePath.toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  if (lowerPath.startsWith('md-os/ops/imports/knowledge/')) return 'import';
  if (lowerPath.startsWith('md-os/kb/imports/')) return 'imported_knowledge';
  if (
    lifecycle.lifecycle_class === 'source'
    && (
      lowerPath.startsWith('md-os/ops/programs/')
      || lowerPath.startsWith('md-os/ops/projects/')
      || lowerPath.startsWith('md-os/ops/connectors/')
      || lowerPath.startsWith('md-os/ops/policies/')
      || lowerPath.startsWith('md-os/ops/calculations/')
      || lowerPath.startsWith('md-os/ops/sources/')
      || lowerPath.startsWith('md-os/ops/evals/')
      || lowerPath.startsWith('md-os/ops/actions/')
      || lowerPath.startsWith('md-os/ops/processes/')
      || lowerPath.startsWith('md-os/ops/releases/self/proposals/')
    )
  ) return 'operational_application';
  if (lowerPath.startsWith('md-os/ops/roles/')) return 'role_sensemaking';
  if (lifecycle.lifecycle_class === 'generated' || lowerPath.startsWith('md-os/ops/')) return 'runtime_readback';
  if (
    lowerPath === 'me.md'
    || lowerPath === 'agents.md'
    || lowerPath.includes('identity')
    || lowerPath.includes('cognitive_bootstrap')
    || lowerPath.includes('agentic_core')
  ) return 'identity';
  if (
    lowerPath.includes('epistemic')
    || lowerPath.includes('scientific')
    || lowerPath.includes('validation')
    || lowerPath.includes('dimension')
    || lowerPath.includes('publication')
    || lowerPath.includes('knowledge_import')
    || lowerPath.includes('reasoning')
    || lowerText.includes('epistemic')
  ) return 'epistemic';
  if (
    lowerPath.includes('semantic')
    || lowerPath.includes('neural')
    || lowerPath.includes('natural_language')
    || lowerText.includes('semantic')
  ) return 'semantic';
  if (
    lowerPath.includes('operations')
    || lowerPath.includes('permission')
    || lowerPath.includes('connector')
    || lowerPath.includes('runtime')
    || lowerPath.includes('project')
    || lowerPath.includes('work_item')
    || lowerPath.includes('continuity')
    || lowerPath.includes('archive')
    || lowerPath.includes('filesystem')
  ) return 'operational';
  if (
    lowerPath.includes('graph')
    || lowerPath.includes('index')
    || lowerPath.includes('health')
    || lowerPath.includes('hygiene')
    || lowerPath.includes('lifecycle')
    || lowerPath.includes('replay')
    || lowerPath.includes('inventory')
  ) return 'coherence';
  if (lowerPath.startsWith('docs/') || lowerPath === 'readme.md') return 'presentation';
  return 'documentation';
}

function nodeKindFor(relativePath, text, lifecycle) {
  const lowerPath = relativePath.toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  if (relativePath === 'README.md' || relativePath.endsWith('/README.md')) return 'entrypoint';
  if (lifecycle.lifecycle_class === 'generated') return 'generated_readback';
  if (lowerPath.startsWith('md-os/ops/imports/knowledge/')) return 'import_state';
  if (lowerPath.startsWith('md-os/kb/imports/')) return 'canonical_imported_knowledge_node';
  if (lowerPath.startsWith('md-os/ops/programs/')) return 'natural_language_program';
  if (lowerPath.startsWith('md-os/ops/projects/')) return 'project_state';
  if (lowerPath.startsWith('md-os/ops/roles/')) return 'role_operating_material';
  if (lowerPath.startsWith('md-os/ops/calculations/')) return 'calculation_profile';
  if (lowerPath.startsWith('md-os/ops/sources/')) return 'source_observation';
  if (lowerPath.startsWith('md-os/ops/evals/')) return 'eval_scenario';
  if (lowerPath.startsWith('md-os/ops/actions/')) return 'action_record';
  if (lowerPath.startsWith('md-os/ops/processes/')) return 'process_record';
  if (lowerPath.startsWith('md-os/ops/releases/self/proposals/')) return 'self_release_proposal';
  if (lowerPath.includes('connector')) return 'connector_model';
  if (lowerPath.includes('permission') || lowerPath.includes('policy')) return 'policy_model';
  if (lowerPath.includes('validation') || lowerPath.includes('epistemic') || lowerPath.includes('dimension')) return 'validation_gate';
  if (lowerPath.startsWith('md-os/kb/')) return 'knowledge_model';
  if (lowerText.includes('```text') || lowerText.includes('```json')) return 'operating_spec';
  return 'markdown_concept';
}

function cognitiveRoleFor(layer, kind, lifecycle) {
  if (layer === 'identity') return 'self_frame';
  if (layer === 'semantic') return 'meaning_router';
  if (layer === 'epistemic') return 'truth_gate';
  if (layer === 'operational') return 'action_policy';
  if (layer === 'operational_application') return 'action_policy';
  if (layer === 'runtime_readback' || kind === 'generated_readback') return 'sensor_readback';
  if (layer === 'coherence') return 'coherence_monitor';
  if (layer === 'import') return 'custody_buffer';
  if (layer === 'imported_knowledge') return 'reference_memory';
  if (layer === 'role_sensemaking') return 'situated_understanding';
  if (lifecycle.lifecycle_class === 'local' || lifecycle.lifecycle_class === 'live') return 'live_observation';
  return 'reference_memory';
}

function epistemicStatusFor(relativePath, text, lifecycle, layer) {
  const lowerPath = relativePath.toLowerCase();
  const lowerText = String(text || '').toLowerCase();
  if (lifecycle.lifecycle_class === 'generated') return 'generated_readback';
  if (lifecycle.lifecycle_class === 'local' || lifecycle.lifecycle_class === 'live') return 'runtime_observation';
  if (lowerPath.startsWith('md-os/ops/imports/knowledge/')) return 'imported_unpromoted';
  if (lowerPath.startsWith('md-os/kb/imports/')) return 'imported_structured_knowledge';
  if (lowerText.includes('falsified')) return 'falsified_or_demoted_claim';
  if (lowerText.includes('requires_review') || lowerText.includes('open question')) return 'requires_review';
  if (layer === 'epistemic') return 'epistemic_gate';
  if (layer === 'operational_application' && lowerPath.startsWith('md-os/ops/sources/')) return 'runtime_observation';
  if (layer === 'identity' || layer === 'operational' || layer === 'operational_application' || layer === 'semantic') return 'canonical_operating_knowledge';
  if (lowerPath.startsWith('docs/papers/')) return 'publication_source_or_artifact';
  if (lifecycle.lifecycle_class === 'demo') return 'demo_evidence';
  return 'reference_knowledge';
}

function actionabilityFor(layer, kind, lifecycle) {
  if (kind === 'generated_readback' || layer === 'runtime_readback') return 'readback';
  if (layer === 'identity') return 'bootstrap_frame';
  if (layer === 'epistemic') return 'validation_required';
  if (layer === 'operational') return 'operating_policy';
  if (layer === 'operational_application') return 'operating_application_source';
  if (layer === 'semantic') return 'semantic_routing';
  if (layer === 'import') return 'review_before_promotion';
  if (layer === 'imported_knowledge') return 'review_and_assimilate';
  if (lifecycle.lifecycle_class === 'local' || lifecycle.lifecycle_class === 'live') return 'observe_only_by_default';
  return 'reference';
}

function zoneForPath(relativePath) {
  if (!relativePath.includes('/')) return 'root';
  if (relativePath.startsWith('docs/')) return 'docs';
  if (relativePath.startsWith('md-os/kb/')) return 'knowledge_base';
  if (relativePath.startsWith('md-os/ops/')) return 'runtime_state';
  if (relativePath.startsWith('md-os/examples/')) return 'examples';
  if (relativePath.startsWith('dev/')) return 'development';
  return relativePath.split('/')[0] || 'other';
}

function loadLifecycleMap() {
  const payload = readJsonSafe(RUNTIME_LIFECYCLE_JSON);
  const files = Array.isArray(payload && payload.files) ? payload.files : [];
  return new Map(files.map((file) => [file.path, file]));
}

function loadMarkdownGraph() {
  const payload = readJsonSafe(MARKDOWN_GRAPH_JSON);
  if (!payload) return null;
  return {
    status: shortText(payload.status || 'unknown') || 'unknown',
    source_hash: payload.source_hash || null,
    nodes: Array.isArray(payload.nodes) ? payload.nodes : [],
    explicit_links: Array.isArray(payload.explicit_links) ? payload.explicit_links : [],
    structural_links: Array.isArray(payload.structural_links) ? payload.structural_links : [],
  };
}

function buildProfile(file, lifecycleMap, markdownGraph) {
  const lifecycle = lifecycleMap.get(file.path) || classify(file.path, false);
  const graphNode = markdownGraph && markdownGraph.nodes.find((node) => node.path === file.path);
  const deterministicGeneratedReadback = DETERMINISTIC_GENERATED_MD_NODE_SET.has(file.path);
  const title = titleFromMarkdown(file.text, file.basename);
  const headings = extractHeadings(file.text);
  const semanticLayer = semanticLayerFor(file.path, file.text, lifecycle);
  const nodeKind = nodeKindFor(file.path, file.text, lifecycle);
  const cognitiveRole = cognitiveRoleFor(semanticLayer, nodeKind, lifecycle);
  const epistemicStatus = epistemicStatusFor(file.path, file.text, lifecycle, semanticLayer);
  const actionability = actionabilityFor(semanticLayer, nodeKind, lifecycle);
  const conceptTerms = conceptTermsFor(file, title, headings);
  const epistemicProfileComplete = Boolean(epistemicStatus);
  const complete = Boolean(semanticLayer && nodeKind && cognitiveRole && epistemicProfileComplete && actionability && conceptTerms.length);

  return {
    path: file.path,
    title,
    zone: zoneForPath(file.path),
    lifecycle_class: lifecycle.lifecycle_class,
    lifecycle_owner: lifecycle.owner,
    lifecycle_scope: lifecycle.scope,
    virtual_generated: file.virtual_generated === true || deterministicGeneratedReadback,
    semantic_layer: semanticLayer,
    node_kind: nodeKind,
    cognitive_role: cognitiveRole,
    epistemic_status: epistemicStatus,
    epistemic_profile_complete: epistemicProfileComplete,
    actionability,
    concept_terms: conceptTerms,
    heading_count: headings.length,
    headings: headings.slice(0, 10),
    claim_marker_count: countMatches(file.text, /\b(claim|assumption|evidence|proof|prove|validation|validated|falsification|falsified|epistemic|must|requires?)\b/gi),
    question_count: countMatches(file.text, /\?/g),
    structurally_connected: file.virtual_generated === true || deterministicGeneratedReadback
      ? true
      : Boolean(graphNode && graphNode.structurally_connected),
    explicit_outgoing_count: graphNode ? graphNode.explicit_outgoing_count : 0,
    explicit_incoming_count: graphNode ? graphNode.explicit_incoming_count : 0,
    structural_outgoing_count: graphNode ? graphNode.structural_outgoing_count : 0,
    structural_incoming_count: graphNode ? graphNode.structural_incoming_count : 0,
    semantic_profile_complete: complete,
    content_hash: file.virtual_generated === true || deterministicGeneratedReadback ? null : sha256Text(file.text),
  };
}

function addVirtualGeneratedNodes(files) {
  const byPath = new Map(files.map((file) => [file.path, file]));
  for (const nodePath of VIRTUAL_GENERATED_MD_NODES) {
    if (byPath.has(nodePath)) continue;
    const basename = path.posix.basename(nodePath);
    byPath.set(nodePath, {
      path: nodePath,
      basename,
      directory: posixDir(nodePath),
      size_bytes: existsRelative(nodePath) ? fs.statSync(path.join(WORKSPACE_ROOT, nodePath)).size : 0,
      virtual_generated: true,
      text: `# ${path.posix.basename(nodePath, '.md')}\n\nDeterministic generated readback node.\n`,
    });
  }
  return Array.from(byPath.values()).sort((left, right) => left.path.localeCompare(right.path));
}

function edgeKind(edge) {
  if (edge.kind === 'explicit_markdown' || edge.kind === 'explicit_wiki') return 'references';
  if (edge.reason === 'directory_readme') return 'summarizes';
  if (String(edge.reason || '').includes('entrypoint')) return 'routes_to';
  if (String(edge.reason || '').includes('identity')) return 'anchors_identity';
  if (String(edge.reason || '').includes('runtime')) return 'readback_from';
  return 'structural_relation';
}

function buildSemanticEdges(markdownGraph, nodeByPath) {
  if (!markdownGraph) return [];
  return [...markdownGraph.explicit_links, ...markdownGraph.structural_links]
    .filter((edge) => edge.status === 'resolved' || edge.kind === 'structural')
    .filter((edge) => nodeByPath.has(edge.source) && nodeByPath.has(edge.target))
    .map((edge) => {
      const source = nodeByPath.get(edge.source);
      const target = nodeByPath.get(edge.target);
      return {
        source: edge.source,
        target: edge.target,
        relation: edgeKind(edge),
        source_layer: source.semantic_layer,
        target_layer: target.semantic_layer,
        cross_layer: source.semantic_layer !== target.semantic_layer,
        source_role: source.cognitive_role,
        target_role: target.cognitive_role,
        evidence: edge.kind || edge.reason || 'structural',
      };
    })
    .sort((left, right) => `${left.source}:${left.target}:${left.relation}`.localeCompare(`${right.source}:${right.target}:${right.relation}`));
}

function countBy(nodes, key) {
  const counts = new Map();
  for (const node of nodes) counts.set(node[key], (counts.get(node[key]) || 0) + 1);
  return Object.fromEntries(Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right)));
}

function buildConceptIndex(nodes) {
  const concepts = new Map();
  for (const node of nodes) {
    for (const term of node.concept_terms) {
      const current = concepts.get(term) || {
        term,
        node_count: 0,
        layers: new Set(),
        nodes: [],
      };
      current.node_count += 1;
      current.layers.add(node.semantic_layer);
      current.nodes.push(node.path);
      concepts.set(term, current);
    }
  }
  return Array.from(concepts.values())
    .map((item) => ({
      term: item.term,
      node_count: item.node_count,
      layers: Array.from(item.layers).sort(),
      nodes: item.nodes.sort().slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.node_count !== left.node_count) return right.node_count - left.node_count;
      return left.term.localeCompare(right.term);
    });
}

function buildConceptRelations(nodes) {
  const relations = new Map();
  for (const node of nodes) {
    const terms = node.concept_terms.slice(0, 8).sort();
    for (let leftIndex = 0; leftIndex < terms.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < terms.length; rightIndex += 1) {
        const left = terms[leftIndex];
        const right = terms[rightIndex];
        const key = `${left}::${right}`;
        const current = relations.get(key) || {
          source_term: left,
          target_term: right,
          node_count: 0,
          layers: new Set(),
          evidence_nodes: [],
        };
        current.node_count += 1;
        current.layers.add(node.semantic_layer);
        current.evidence_nodes.push(node.path);
        relations.set(key, current);
      }
    }
  }
  return Array.from(relations.values())
    .map((item) => ({
      source_term: item.source_term,
      target_term: item.target_term,
      relation: 'co_occurs_in_markdown_node',
      node_count: item.node_count,
      layers: Array.from(item.layers).sort(),
      evidence_nodes: Array.from(new Set(item.evidence_nodes)).sort().slice(0, 20),
    }))
    .sort((left, right) => {
      if (right.node_count !== left.node_count) return right.node_count - left.node_count;
      return `${left.source_term}:${left.target_term}`.localeCompare(`${right.source_term}:${right.target_term}`);
    })
    .slice(0, 1000);
}

function buildSemanticKnowledgeGraph() {
  const markdownGraph = loadMarkdownGraph();
  const lifecycleMap = loadLifecycleMap();
  const files = addVirtualGeneratedNodes(collectMarkdownFiles(WORKSPACE_ROOT));
  const nodes = files.map((file) => buildProfile(file, lifecycleMap, markdownGraph));
  const nodeByPath = new Map(nodes.map((node) => [node.path, node]));
  const edges = buildSemanticEdges(markdownGraph, nodeByPath);
  const unprofiledNodes = nodes.filter((node) => !node.semantic_profile_complete).map((node) => node.path).sort();
  const missingEpistemicNodes = nodes.filter((node) => !node.epistemic_profile_complete).map((node) => node.path).sort();
  const disconnectedNodes = nodes.filter((node) => !node.structurally_connected).map((node) => node.path).sort();
  const findings = [];

  for (const nodePath of unprofiledNodes) {
    findings.push({
      severity: 'critical',
      code: 'SEMANTIC_PROFILE_INCOMPLETE',
      path: nodePath,
      message: 'Markdown node lacks a complete semantic, cognitive, epistemic, or actionability profile.',
    });
  }
  for (const nodePath of missingEpistemicNodes) {
    findings.push({
      severity: 'critical',
      code: 'SEMANTIC_NODE_MISSING_EPISTEMIC_STATUS',
      path: nodePath,
      message: 'Every semantic Markdown node must also carry an epistemic status.',
    });
  }
  for (const nodePath of disconnectedNodes) {
    findings.push({
      severity: 'attention',
      code: 'SEMANTIC_NODE_DISCONNECTED',
      path: nodePath,
      message: 'Markdown node has a semantic profile but is not structurally connected in the Markdown graph.',
    });
  }
  if (!markdownGraph) {
    findings.push({
      severity: 'attention',
      code: 'MARKDOWN_GRAPH_UNAVAILABLE',
      path: 'md-os/ops/markdown_graph.json',
      message: 'Semantic graph was built without Markdown graph readback.',
    });
  }

  const status = findings.some((item) => item.severity === 'critical')
    ? 'critical'
    : findings.length
      ? 'attention'
      : 'ok';

  const conceptIndex = buildConceptIndex(nodes);
  const conceptRelations = buildConceptRelations(nodes);
  return {
    schema_version: 1,
    updated_at: nowIso(),
    source_hash: sha256Json({
      markdown_graph_source_hash: markdownGraph && markdownGraph.source_hash || null,
      node_profiles: nodes.map((node) => ({
        path: node.path,
        semantic_layer: node.semantic_layer,
        node_kind: node.node_kind,
        cognitive_role: node.cognitive_role,
        epistemic_status: node.epistemic_status,
        actionability: node.actionability,
        concept_terms: node.concept_terms,
        content_hash: node.content_hash,
      })),
      edges: edges.map((edge) => ({
        source: edge.source,
        target: edge.target,
        relation: edge.relation,
      })),
      concept_relations: conceptRelations.map((edge) => ({
        source_term: edge.source_term,
        target_term: edge.target_term,
        node_count: edge.node_count,
      })),
    }),
    status,
    markdown_graph_status: markdownGraph && markdownGraph.status || 'unknown',
    markdown_node_count: nodes.length,
    profiled_node_count: nodes.filter((node) => node.semantic_profile_complete).length,
    epistemic_profiled_node_count: nodes.filter((node) => node.epistemic_profile_complete).length,
    unprofiled_node_count: unprofiledNodes.length,
    missing_epistemic_node_count: missingEpistemicNodes.length,
    structurally_connected_node_count: nodes.filter((node) => node.structurally_connected).length,
    disconnected_node_count: disconnectedNodes.length,
    semantic_edge_count: edges.length,
    cross_layer_edge_count: edges.filter((edge) => edge.cross_layer).length,
    concept_count: conceptIndex.length,
    concept_relation_count: conceptRelations.length,
    virtual_generated_node_count: nodes.filter((node) => node.virtual_generated).length,
    semantic_profile_coverage: {
      complete_node_count: nodes.filter((node) => node.semantic_profile_complete).length,
      epistemic_node_count: nodes.filter((node) => node.epistemic_profile_complete).length,
      required_node_count: nodes.length,
      complete_ratio: nodes.length ? Number((nodes.filter((node) => node.semantic_profile_complete).length / nodes.length).toFixed(4)) : 1,
    },
    semantic_layer_counts: countBy(nodes, 'semantic_layer'),
    node_kind_counts: countBy(nodes, 'node_kind'),
    cognitive_role_counts: countBy(nodes, 'cognitive_role'),
    epistemic_status_counts: countBy(nodes, 'epistemic_status'),
    actionability_counts: countBy(nodes, 'actionability'),
    findings,
    unprofiled_nodes: unprofiledNodes,
    missing_epistemic_nodes: missingEpistemicNodes,
    disconnected_nodes: disconnectedNodes,
    concept_index: conceptIndex,
    concept_relations: conceptRelations,
    nodes: nodes.sort((left, right) => left.path.localeCompare(right.path)),
    semantic_edges: edges,
  };
}

function buildCompactSummary(graph) {
  const compactConcepts = graph.concept_index.slice(0, 50).map((concept) => ({
    term: concept.term,
    node_count: concept.node_count,
    layers: concept.layers,
  }));
  const compactRelations = graph.concept_relations.slice(0, 50).map((relation) => ({
    source_term: relation.source_term,
    target_term: relation.target_term,
    relation: relation.relation,
    node_count: relation.node_count,
    layers: relation.layers,
  }));
  return {
    schema_version: 1,
    updated_at: graph.updated_at,
    source_hash: sha256Json({
      graph_source_hash: graph.source_hash,
      status: graph.status,
      markdown_node_count: graph.markdown_node_count,
      profiled_node_count: graph.profiled_node_count,
      epistemic_profiled_node_count: graph.epistemic_profiled_node_count,
      semantic_edge_count: graph.semantic_edge_count,
      concept_count: graph.concept_count,
      concept_relation_count: graph.concept_relation_count,
      findings: graph.findings.slice(0, 25),
    }),
    status: graph.status,
    compacted_from: OUTPUT_JSON_REL,
    performance_policy: 'Health and bootstrap read this compact summary before expanding the full semantic knowledge graph.',
    markdown_node_count: graph.markdown_node_count,
    profiled_node_count: graph.profiled_node_count,
    epistemic_profiled_node_count: graph.epistemic_profiled_node_count,
    semantic_profile_complete: graph.unprofiled_node_count === 0,
    epistemic_profile_complete: graph.missing_epistemic_node_count === 0,
    structurally_connected_node_count: graph.structurally_connected_node_count,
    disconnected_node_count: graph.disconnected_node_count,
    semantic_edge_count: graph.semantic_edge_count,
    cross_layer_edge_count: graph.cross_layer_edge_count,
    concept_count: graph.concept_count,
    concept_relation_count: graph.concept_relation_count,
    virtual_generated_node_count: graph.virtual_generated_node_count,
    semantic_layer_counts: graph.semantic_layer_counts,
    cognitive_role_counts: graph.cognitive_role_counts,
    epistemic_status_counts: graph.epistemic_status_counts,
    actionability_counts: graph.actionability_counts,
    top_concepts: compactConcepts,
    top_concept_relations: compactRelations,
    findings: graph.findings.slice(0, 25),
  };
}

function markdownLink(targetPath, label = targetPath) {
  const fromDir = posixDir(OUTPUT_MD_REL);
  let link = path.posix.relative(fromDir, targetPath);
  if (!link.startsWith('.')) link = `./${link}`;
  return `[${label}](${link})`;
}

function buildMarkdown(graph) {
  const lines = [
    '# Semantic Knowledge Graph',
    '',
    `Updated at: \`${graph.updated_at}\``,
    '',
    `Status: \`${graph.status}\``,
    '',
    'This generated readback profiles every observed Markdown node as a semantic, cognitive, epistemic, and operational concept node.',
    '',
    '## Coverage',
    '',
    `- Markdown concept nodes: \`${graph.markdown_node_count}\``,
    `- profiled nodes: \`${graph.profiled_node_count}/${graph.markdown_node_count}\``,
    `- epistemic profiled nodes: \`${graph.epistemic_profiled_node_count}/${graph.markdown_node_count}\``,
    `- structurally connected nodes: \`${graph.structurally_connected_node_count}/${graph.markdown_node_count}\``,
    `- virtual deterministic generated nodes: \`${graph.virtual_generated_node_count}\``,
    `- semantic edges: \`${graph.semantic_edge_count}\``,
    `- cross-layer edges: \`${graph.cross_layer_edge_count}\``,
    `- concept terms: \`${graph.concept_count}\``,
    `- concept relations: \`${graph.concept_relation_count}\``,
    '',
    '## Semantic Layers',
    '',
  ];

  for (const [name, count] of Object.entries(graph.semantic_layer_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }

  lines.push('', '## Cognitive Roles', '');
  for (const [name, count] of Object.entries(graph.cognitive_role_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }

  lines.push('', '## Epistemic Statuses', '');
  for (const [name, count] of Object.entries(graph.epistemic_status_counts)) {
    lines.push(`- \`${name}\`: \`${count}\``);
  }

  lines.push('', '## Findings', '');
  if (!graph.findings.length) {
    lines.push('- No semantic profile gaps detected.');
  } else {
    for (const finding of graph.findings.slice(0, 80)) {
      lines.push(`- \`${finding.severity}\` \`${finding.code}\`: \`${finding.path}\` - ${finding.message}`);
    }
  }

  lines.push('', '## Concept Index', '');
  for (const concept of graph.concept_index.slice(0, 120)) {
    lines.push(`- \`${concept.term}\`: \`${concept.node_count}\` node(s) | layers \`${concept.layers.join(', ')}\``);
  }

  lines.push('', '## Concept Relations', '');
  for (const relation of graph.concept_relations.slice(0, 120)) {
    lines.push(`- \`${relation.source_term}\` -> \`${relation.target_term}\` | \`${relation.relation}\` | nodes \`${relation.node_count}\` | layers \`${relation.layers.join(', ')}\``);
  }

  lines.push('', '## Node Profiles', '');
  for (const node of graph.nodes) {
    lines.push(`- ${markdownLink(node.path)} | layer \`${node.semantic_layer}\` | kind \`${node.node_kind}\` | role \`${node.cognitive_role}\` | epistemic \`${node.epistemic_status}\` | action \`${node.actionability}\` | terms \`${node.concept_terms.join(', ')}\``);
  }

  lines.push('', '## Semantic Edges', '');
  if (!graph.semantic_edges.length) {
    lines.push('- No semantic edges detected.');
  } else {
    for (const edge of graph.semantic_edges.slice(0, 400)) {
      lines.push(`- ${markdownLink(edge.source)} -> ${markdownLink(edge.target)} | \`${edge.relation}\` | \`${edge.source_layer}\` -> \`${edge.target_layer}\``);
    }
  }

  return `${lines.join('\n')}\n`;
}

function buildSummaryMarkdown(summary) {
  const lines = [
    '# Semantic Knowledge Summary',
    '',
    `Updated at: \`${summary.updated_at}\``,
    '',
    `Status: \`${summary.status}\``,
    '',
    `Compacted from: \`${summary.compacted_from}\``,
    '',
    summary.performance_policy,
    '',
    '## Coverage',
    '',
    `- Markdown concept nodes: \`${summary.markdown_node_count}\``,
    `- profiled nodes: \`${summary.profiled_node_count}/${summary.markdown_node_count}\``,
    `- epistemic profiled nodes: \`${summary.epistemic_profiled_node_count}/${summary.markdown_node_count}\``,
    `- semantic profile complete: \`${summary.semantic_profile_complete}\``,
    `- epistemic profile complete: \`${summary.epistemic_profile_complete}\``,
    `- structurally connected nodes: \`${summary.structurally_connected_node_count}/${summary.markdown_node_count}\``,
    `- semantic edges: \`${summary.semantic_edge_count}\``,
    `- cross-layer edges: \`${summary.cross_layer_edge_count}\``,
    `- concept terms: \`${summary.concept_count}\``,
    `- concept relations: \`${summary.concept_relation_count}\``,
    '',
    '## Top Concepts',
    '',
  ];
  for (const concept of summary.top_concepts.slice(0, 25)) {
    lines.push(`- \`${concept.term}\`: \`${concept.node_count}\` node(s)`);
  }
  lines.push('', '## Top Concept Relations', '');
  for (const relation of summary.top_concept_relations.slice(0, 25)) {
    lines.push(`- \`${relation.source_term}\` -> \`${relation.target_term}\`: \`${relation.node_count}\` node(s)`);
  }
  lines.push('', '## Findings', '');
  if (!summary.findings.length) {
    lines.push('- No semantic profile gaps detected.');
  } else {
    for (const finding of summary.findings) {
      lines.push(`- \`${finding.severity}\` \`${finding.code}\`: \`${finding.path}\``);
    }
  }
  return `${lines.join('\n')}\n`;
}

function main() {
  const graph = buildSemanticKnowledgeGraph();
  const summary = buildCompactSummary(graph);
  withFileLock('builder__semantic_knowledge_graph', {
    context: 'build_semantic_knowledge_graph',
    timeoutMs: 120000,
    staleMs: 900000,
  }, () => {
    atomicWriteJson(OUTPUT_JSON, graph);
    atomicWriteText(OUTPUT_MD, buildMarkdown(graph));
    atomicWriteJson(OUTPUT_SUMMARY_JSON, summary);
    atomicWriteText(OUTPUT_SUMMARY_MD, buildSummaryMarkdown(summary));
  });
  appendJournal({
    event: 'semantic_knowledge_graph_rebuilt',
    builder: 'build_semantic_knowledge_graph',
    output_json: rel(OUTPUT_JSON),
    output_md: rel(OUTPUT_MD),
    output_summary_json: rel(OUTPUT_SUMMARY_JSON),
    output_summary_md: rel(OUTPUT_SUMMARY_MD),
    status: graph.status,
    markdown_node_count: graph.markdown_node_count,
    profiled_node_count: graph.profiled_node_count,
    epistemic_profiled_node_count: graph.epistemic_profiled_node_count,
    semantic_edge_count: graph.semantic_edge_count,
    concept_relation_count: graph.concept_relation_count,
    finding_count: graph.findings.length,
  });
  printJson({
    ok: true,
    mode: 'build_semantic_knowledge_graph',
    updated_at: graph.updated_at,
    status: graph.status,
    output_json: OUTPUT_JSON_REL,
    output_md: OUTPUT_MD_REL,
    output_summary_json: OUTPUT_SUMMARY_JSON_REL,
    output_summary_md: OUTPUT_SUMMARY_MD_REL,
    markdown_node_count: graph.markdown_node_count,
    profiled_node_count: graph.profiled_node_count,
    semantic_edge_count: graph.semantic_edge_count,
    concept_relation_count: graph.concept_relation_count,
    finding_count: graph.findings.length,
  });
}

if (require.main === module) {
  main();
}

module.exports = {
  buildMarkdown,
  buildCompactSummary,
  buildSummaryMarkdown,
  buildSemanticKnowledgeGraph,
  conceptTermsFor,
  semanticLayerFor,
};
