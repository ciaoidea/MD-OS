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
} = require('./lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('./lib/fs_runtime');
const { assertApfcGraph, projectCanonicalSources } = require('../apfc/executive/graph_projector');
const { compileOperationalContextPack } = require('../apfc/executive/context_compiler');
const { readEvents, verifyEventChain } = require('../apfc/executive/event_recorder');

function listJson(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(dirPath, entry.name)).sort();
}

function classify(relativePath) {
  if (/^md-os\/ops\/tasks\/[^/]+\.json$/.test(relativePath)) return ['task', 'task_spec.schema.json'];
  if (/^md-os\/ops\/action_receipts\/[^/]+\.json$/.test(relativePath)) return ['receipt', 'action_receipt.schema.json'];
  if (/^md-os\/ops\/verifications\/[^/]+\.json$/.test(relativePath)) return ['verification', 'verifier.schema.json'];
  if (/^md-os\/ops\/episodes\/[^/]+\.json$/.test(relativePath)) return ['episode', 'episode.schema.json'];
  if (/^md-os\/ops\/evals\/[^/]+\.json$/.test(relativePath)) return ['eval', 'eval.schema.json'];
  if (relativePath === 'md-os/ops/skills/skill_registry.json') return ['skill_registry', 'skill.schema.json'];
  if (relativePath === 'md-os/ops/connectors/connector_registry.json') return ['connector_registry', 'connector.schema.json'];
  if (relativePath === 'md-os/ops/releases/self_release_index.json') return ['release_index', 'self_release.schema.json'];
  if (relativePath === 'md-os/ops/runtime/context_packs/index.json') return ['context_index', 'runtime_compiler.schema.json'];
  return [null, null];
}

function enumerateSources(mdosRoot, workspaceRoot) {
  const ops = path.join(mdosRoot, 'ops');
  const files = [
    ...listJson(path.join(ops, 'tasks')),
    ...listJson(path.join(ops, 'action_receipts')),
    ...listJson(path.join(ops, 'verifications')),
    ...listJson(path.join(ops, 'episodes')),
    ...listJson(path.join(ops, 'evals')),
    path.join(ops, 'skills', 'skill_registry.json'),
    path.join(ops, 'connectors', 'connector_registry.json'),
    path.join(ops, 'releases', 'self_release_index.json'),
    path.join(ops, 'runtime', 'context_packs', 'index.json'),
  ].filter((filePath) => fs.existsSync(filePath));
  return [...new Set(files)].sort().map((filePath) => {
    const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    const [kind, schema] = classify(relativePath);
    return { filePath, path: relativePath, kind, schema };
  }).filter((item) => item.kind);
}

function validateSource(kind, data) {
  if (!data || typeof data !== 'object') throw new Error('source is not a JSON object');
  if (kind === 'task' && (!data.task_spec_id || !data.goal)) throw new Error('TaskSpec identity or goal missing');
  if (kind === 'receipt' && (!data.action_receipt_id || !data.action_id || !data.input_hash)) throw new Error('ActionReceipt identity missing');
  if (kind === 'verification' && (!data.verifier_id || !data.status || !data.outcome)) throw new Error('Verifier identity missing');
  if (kind === 'episode' && (!data.episode_id || !data.task_spec || !data.verdict)) throw new Error('Episode identity or verdict missing');
  if (kind === 'eval' && data.eval_id && !data.status) throw new Error('Eval status missing');
  if (kind === 'skill_registry' && (!Array.isArray(data.promoted_skills) || !Array.isArray(data.candidate_skills))) throw new Error('Skill registry arrays missing');
  if (kind === 'connector_registry' && !Array.isArray(data.connectors)) throw new Error('Connector registry missing connectors');
}

function loadSources(sourceFiles) {
  const records = [];
  const manifestEntries = [];
  const findings = [];
  for (const source of sourceFiles) {
    const text = fs.readFileSync(source.filePath, 'utf8');
    try {
      const data = JSON.parse(text);
      validateSource(source.kind, data);
      const canonicalData = { ...data };
      delete canonicalData.updated_at;
      const entry = {
        path: source.path,
        schema: source.schema,
        size: Buffer.byteLength(text, 'utf8'),
        sha256: sha256Json(canonicalData),
      };
      manifestEntries.push(entry);
      records.push({ path: source.path, kind: source.kind, data });
    } catch (error) {
      manifestEntries.push({ path: source.path, schema: source.schema, size: Buffer.byteLength(text, 'utf8'), sha256: sha256Text(text) });
      findings.push({ finding_id: `source_${sha256Text(`${source.path}:${error.message}`).slice(0, 12)}`, status: 'critical', source: source.path, schema: source.schema, message: error.message });
    }
  }
  return { records, manifestEntries, findings };
}

function renderGraphMarkdown(graph) {
  const byType = graph.nodes.reduce((acc, node) => {
    acc[node.type] = (acc[node.type] || 0) + 1;
    return acc;
  }, {});
  return [
    '# APFC Graph Readback',
    '',
    `Graph: \`${graph.graph_id}\``,
    `Status: \`${graph.status}\``,
    `Source manifest: \`${graph.source_manifest_hash}\``,
    `Nodes: \`${graph.metrics.node_count}\``,
    `Edges: \`${graph.metrics.edge_count}\``,
    '',
    '## Node types',
    '',
    ...Object.entries(byType).sort(([left], [right]) => left.localeCompare(right)).map(([type, count]) => `- \`${type}\`: \`${count}\``),
    '',
    '## Findings',
    '',
    ...(graph.findings.length ? graph.findings.map((finding) => `- **${finding.status}** \`${finding.finding_id}\`: ${finding.message}`) : ['- None.']),
    '',
  ].join('\n');
}

function renderStatusMarkdown(status) {
  return [
    '# APFC Runtime Status',
    '',
    `Updated: \`${status.updated_at}\``,
    `Status: \`${status.status}\``,
    `Active graph: \`${status.active_graph_id || 'none'}\``,
    `Runtime operable: \`${status.release_gate.runtime_operable}\``,
    `Promotion blocked: \`${status.release_gate.promotion_blocked}\``,
    '',
    '## Counts',
    '',
    ...Object.entries(status.counts).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `- ${key}: \`${value}\``),
    '',
    '## Checks',
    '',
    ...status.checks.map((check) => `- **${check.status}** \`${check.check_id}\`: ${check.message}`),
    '',
    '## Findings',
    '',
    ...(status.findings.length ? status.findings.map((finding) => `- **${finding.status}** \`${finding.finding_id}\`: ${finding.message}`) : ['- None.']),
    '',
  ].join('\n');
}

function countConsolidation(apfcDir) {
  const values = {};
  for (const filePath of listJson(path.join(apfcDir, 'consolidation')).filter((filePath) => !/index\.json$/.test(filePath))) {
    try {
      const state = JSON.parse(fs.readFileSync(filePath, 'utf8')).state || 'unknown';
      values[state] = (values[state] || 0) + 1;
    } catch (_) {}
  }
  return values;
}

function buildStatus({ graph, manifest, apfcDir, workspaceRoot, findings, eventCheck, lastValidGraph }) {
  const criticalCount = findings.filter((finding) => finding.status === 'critical').length;
  const attentionCount = findings.filter((finding) => finding.status === 'attention').length;
  const status = criticalCount ? 'critical' : attentionCount ? 'attention' : graph.status;
  const lifecycleCounts = graph.nodes.filter((node) => ['skill', 'skill_candidate'].includes(node.type)).reduce((acc, node) => {
    acc[node.lifecycle_status] = (acc[node.lifecycle_status] || 0) + 1;
    return acc;
  }, {});
  const healthPath = path.join(path.dirname(apfcDir), '..', 'health_classification.json');
  let publishable = false;
  try {
    const health = JSON.parse(fs.readFileSync(healthPath, 'utf8'));
    publishable = health.release_gate && health.release_gate.publishable === true;
  } catch (_) {}
  const outputs = ['graph.json', 'graph.md', 'status.json', 'status.md', 'source_manifest.json', 'last_valid_graph.json'].map((name) => path.relative(workspaceRoot, path.join(apfcDir, name)).replace(/\\/g, '/'));
  return {
    schema_version: 1,
    updated_at: nowIso(),
    status,
    identity_version: '5.0',
    active_graph_id: status === 'critical' ? lastValidGraph && lastValidGraph.graph_id || null : graph.graph_id,
    active_graph_hash: status === 'critical' ? lastValidGraph && sha256Json(lastValidGraph) || null : sha256Json(graph),
    last_valid_graph_id: lastValidGraph && lastValidGraph.graph_id || (status !== 'critical' ? graph.graph_id : null),
    source_manifest_hash: manifest.source_manifest_hash,
    counts: {
      sources: manifest.sources.length,
      nodes: graph.nodes.length,
      edges: graph.edges.length,
      episodes: graph.nodes.filter((node) => node.type === 'episode').length,
      skills_candidate: lifecycleCounts.candidate || 0,
      skills_promotable: lifecycleCounts.promotable || 0,
      skills_promoted: lifecycleCounts.promoted || 0,
      skills_runtime_eligible: graph.nodes.filter((node) => node.type === 'skill' && node.lifecycle_status === 'promoted' && node.properties.runtime_eligible === true).length,
      skills_deprecated: lifecycleCounts.deprecated || 0,
      skills_revoked: lifecycleCounts.revoked || 0,
      context_packs: listJson(path.join(apfcDir, 'context_packs')).filter((filePath) => !/index\.json$/.test(filePath)).length,
      consolidation_cycles: Object.values(countConsolidation(apfcDir)).reduce((sum, value) => sum + value, 0),
      critical_findings: criticalCount,
      attention_findings: attentionCount,
      online_events: eventCheck.event_count,
    },
    checks: [
      { check_id: 'source_manifest', status: manifest.sources.length ? 'ok' : 'attention', message: `${manifest.sources.length} canonical sources hashed.` },
      { check_id: 'graph_valid', status: status === 'critical' ? 'critical' : 'ok', message: 'Graph hashes, enumerations, ordering, and endpoints validated.' },
      { check_id: 'event_chain', status: eventCheck.ok ? 'ok' : 'critical', message: `${eventCheck.event_count || 0} online events replayed.` },
      { check_id: 'recovery_snapshot', status: lastValidGraph || status !== 'critical' ? 'ok' : 'critical', message: 'Last valid graph recovery snapshot is available after the first successful build.' },
    ],
    findings,
    release_gate: {
      runtime_operable: status !== 'critical',
      apfc_action_blocked: status === 'critical',
      promotion_blocked: status === 'critical',
      publishable,
    },
    outputs,
  };
}

function readJsonSafe(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch (_) { return null; }
}

function renderContextPackMarkdown(pack) {
  return [
    '# APFC Task Context', '',
    `Context: \`${pack.context_pack_id}\``,
    `Task: \`${pack.task_spec_id}\``,
    `Graph: \`${pack.graph_id}\``,
    `Status: \`${pack.status}\``,
    `Selected nodes: \`${pack.nodes.length}\``,
    `Serialized bytes: \`${pack.serialized_bytes}\``, '',
    '## Selected nodes', '',
    ...pack.nodes.map((node) => `- \`${node.id}\` — ${node.label} [${node.epistemic_status}]`), '',
  ].join('\n');
}

function rebuildContextPacks(graph, records, apfcDir, workspaceRoot) {
  const contextDir = path.join(apfcDir, 'context_packs');
  ensureDir(contextDir);
  const packs = [];
  const findings = [];
  for (const record of records.filter((item) => item.kind === 'task').sort((left, right) => left.path.localeCompare(right.path))) {
    try {
      const pack = compileOperationalContextPack(graph, record.data);
      packs.push(pack);
    } catch (error) {
      findings.push({
        finding_id: `context_${sha256Text(`${record.path}:${error.message}`).slice(0, 12)}`,
        status: 'attention',
        source: record.path,
        message: error.message,
      });
    }
  }
  const expected = new Set(['index.json', 'index.md']);
  for (const pack of packs) {
    expected.add(`${pack.context_pack_id}.json`);
    expected.add(`${pack.context_pack_id}.md`);
    atomicWriteJson(path.join(contextDir, `${pack.context_pack_id}.json`), pack);
    atomicWriteText(path.join(contextDir, `${pack.context_pack_id}.md`), renderContextPackMarkdown(pack));
  }
  for (const entry of fs.readdirSync(contextDir, { withFileTypes: true })) {
    if (entry.isFile() && /\.(json|md)$/.test(entry.name) && !expected.has(entry.name)) fs.unlinkSync(path.join(contextDir, entry.name));
  }
  const index = {
    schema_version: 1,
    updated_at: nowIso(),
    context_pack_count: packs.length,
    packs: packs.map((pack) => ({
      context_pack_id: pack.context_pack_id,
      task_spec_id: pack.task_spec_id,
      graph_id: pack.graph_id,
      status: pack.status,
      path: path.relative(workspaceRoot, path.join(contextDir, `${pack.context_pack_id}.json`)).replace(/\\/g, '/'),
    })).sort((left, right) => left.context_pack_id.localeCompare(right.context_pack_id)),
  };
  atomicWriteJson(path.join(contextDir, 'index.json'), index);
  atomicWriteText(path.join(contextDir, 'index.md'), ['# APFC Context-Pack Index', '', `Packs: \`${index.context_pack_count}\``, '', ...index.packs.map((pack) => `- \`${pack.context_pack_id}\` — \`${pack.status}\``), ''].join('\n'));
  return { index, findings };
}

function buildApfcGraph(options = {}) {
  const mdosRoot = options.mdos_root || MDOS_ROOT;
  const workspaceRoot = options.workspace_root || WORKSPACE_ROOT;
  const apfcDir = options.apfc_dir || path.join(mdosRoot, 'ops', 'apfc', 'executive');
  return withFileLock(options.lock_name || 'builder__apfc_graph', { context: 'build_apfc_graph', timeoutMs: 60000, staleMs: 600000 }, () => {
    for (const relative of ['history', 'rejected', 'context_packs', 'consolidation', 'views', 'graphify']) ensureDir(path.join(apfcDir, relative));
    const loaded = loadSources(enumerateSources(mdosRoot, workspaceRoot));
    const manifest = {
      schema_version: 1,
      source_manifest_hash: sha256Json(loaded.manifestEntries),
      sources: loaded.manifestEntries,
    };
    let graph = projectCanonicalSources(loaded.records, manifest.sources);
    const findings = [...loaded.findings, ...graph.findings];
    let eventCheck = { ok: true, event_count: 0, last_sequence: 0, last_event_hash: '0'.repeat(64) };
    try { eventCheck = verifyEventChain(readEvents(path.join(apfcDir, 'events.ndjson'))); } catch (error) {
      eventCheck = { ok: false, event_count: 0, error: error.message };
      findings.push({ finding_id: `event_chain_${sha256Text(error.message).slice(0, 12)}`, status: 'critical', source: path.relative(workspaceRoot, path.join(apfcDir, 'events.ndjson')).replace(/\\/g, '/'), message: error.message });
    }
    const critical = findings.some((finding) => finding.status === 'critical');
    const attention = findings.some((finding) => finding.status === 'attention');
    graph = { ...graph, status: critical ? 'critical' : attention ? 'attention' : 'ok', findings: findings.slice().sort((left, right) => left.finding_id.localeCompare(right.finding_id)) };
    assertApfcGraph(graph);
    atomicWriteJson(path.join(apfcDir, 'source_manifest.json'), manifest);
    const lastValidPath = path.join(apfcDir, 'last_valid_graph.json');
    const lastValidBefore = readJsonSafe(lastValidPath);
    if (!critical) {
      const historyPath = path.join(apfcDir, 'history', `${graph.graph_id}.json`);
      if (fs.existsSync(historyPath) && sha256Text(fs.readFileSync(historyPath, 'utf8')) !== sha256Text(`${JSON.stringify(graph, null, 2)}\n`)) throw new Error(`APFC_HISTORY_CONTENT_ADDRESS_COLLISION: ${graph.graph_id}`);
      if (!fs.existsSync(historyPath)) atomicWriteJson(historyPath, graph);
      atomicWriteJson(path.join(apfcDir, 'graph.json'), graph);
      atomicWriteText(path.join(apfcDir, 'graph.md'), renderGraphMarkdown(graph));
      atomicWriteJson(lastValidPath, graph);
      const contextReadback = rebuildContextPacks(graph, loaded.records, apfcDir, workspaceRoot);
      findings.push(...contextReadback.findings);
    } else {
      atomicWriteJson(path.join(apfcDir, 'rejected', `${graph.graph_id}.json`), graph);
    }
    const lastValid = !critical ? graph : lastValidBefore;
    const status = buildStatus({ graph, manifest, apfcDir, workspaceRoot, findings, eventCheck, lastValidGraph: lastValid });
    atomicWriteJson(path.join(apfcDir, 'status.json'), status);
    atomicWriteText(path.join(apfcDir, 'status.md'), renderStatusMarkdown(status));
    return { ok: !critical, mode: 'apfc_build', graph_id: status.active_graph_id, graph_hash: status.active_graph_hash, status: status.status, node_count: graph.nodes.length, edge_count: graph.edges.length, source_count: manifest.sources.length, finding_count: findings.length, output: path.relative(workspaceRoot, path.join(apfcDir, 'status.json')).replace(/\\/g, '/') };
  });
}

if (require.main === module) {
  try { printJson(buildApfcGraph()); } catch (error) { printJson({ ok: false, error: error.message }); process.exitCode = 1; }
}

module.exports = {
  buildApfcGraph,
  enumerateSources,
  loadSources,
  renderGraphMarkdown,
  renderStatusMarkdown,
};
