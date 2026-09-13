'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { isDeepStrictEqual } = require('util');
const { sha256Text, sha256Json } = require('./lib/common');
const { normalizeProblemCore, problemContractHash, buildProblemReadback } = require('../kernel/cognition/problem_core');

const MAX_SOURCE_BYTES = 1048576;
const MAX_NODES = 20000;
const bytes = value => Buffer.byteLength(JSON.stringify(value), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const escape = key => key.replace(/~/g, '~0').replace(/\//g, '~1');
const overlaps = (a, b) => a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`);

function visit(value, callback) {
  let count = 0;
  function walk(item, pointer, depth) {
    if (++count > MAX_NODES || depth > 64) throw new Error('PROBLEM_COMPACTION_STRUCTURE_LIMIT');
    callback(item, pointer);
    if (item && typeof item === 'object') for (const [key, child] of Object.entries(item)) walk(child, `${pointer}/${escape(key)}`, depth + 1);
  }
  walk(value, '', 0);
}

function slot(document, pointer) {
  if (typeof pointer !== 'string' || !pointer.startsWith('/') || /~(?![01])/u.test(pointer)) throw new Error('PROBLEM_COMPACTION_POINTER_INVALID');
  const parts = pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
  let parent = document;
  for (const key of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new Error('PROBLEM_COMPACTION_POINTER_MISSING');
    parent = parent[key];
  }
  const key = parts.at(-1);
  if (!parent || typeof parent !== 'object' || !Object.hasOwn(parent, key)) throw new Error('PROBLEM_COMPACTION_POINTER_MISSING');
  return { get: () => parent[key], set: value => Object.defineProperty(parent, key, { value, enumerable: true, configurable: true, writable: true }) };
}

// Share exact JSON values, not observations. Every occurrence stays at its
// original pointer, including repeated events, array order and provenance.
// This greedy bounded search makes no claim of a globally minimal encoding.
function compactJson(document) {
  if (bytes(document) > MAX_SOURCE_BYTES) throw new Error('PROBLEM_COMPACTION_SOURCE_LIMIT');
  const groups = new Map();
  visit(document, (value, pointer) => {
    if (!pointer) return;
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded) < 128) return;
    if (!groups.has(encoded)) groups.set(encoded, { value, at: [] });
    groups.get(encoded).at.push(pointer);
  });
  const body = clone(document), shared = [], used = [];
  let result = { format: 'json', body };
  for (const group of [...groups.values()].filter(item => item.at.length > 1).sort((a, b) => bytes(b.value) - bytes(a.value))) {
    const at = group.at.filter(pointer => !used.some(previous => overlaps(pointer, previous)));
    if (at.length < 2) continue;
    for (const pointer of at) slot(body, pointer).set(null);
    const candidate = { format: 'json-shared-v1', body, shared: [...shared, { at, value: group.value }] };
    // Compare complete encodings, including reference paths and dictionary.
    const candidateBytes = bytes(candidate);
    for (const pointer of at) slot(body, pointer).set(group.value);
    if (candidateBytes >= bytes(result)) continue;
    for (const pointer of at) slot(body, pointer).set(null);
    shared.push({ at, value: clone(group.value) });
    used.push(...at);
    result = { format: 'json-shared-v1', body, shared };
  }
  if (!isDeepStrictEqual(expandCompactJson(result), document)) throw new Error('PROBLEM_COMPACTION_ROUND_TRIP_FAILED');
  if (bytes(result) >= bytes(document)) return { format: 'json', body: clone(document) };
  return result;
}

function expandCompactJson(representation) {
  if (!representation || !['json', 'json-shared-v1'].includes(representation.format)
      || !Object.hasOwn(representation, 'body') || bytes(representation) > MAX_SOURCE_BYTES * 2) throw new Error('PROBLEM_COMPACTION_ENCODING_INVALID');
  visit(representation, () => {});
  const body = clone(representation.body);
  if (bytes(body) > MAX_SOURCE_BYTES) throw new Error('PROBLEM_COMPACTION_EXPANSION_LIMIT');
  if (representation.format === 'json') {
    if (Object.keys(representation).some(key => !['format', 'body'].includes(key))) throw new Error('PROBLEM_COMPACTION_ENCODING_INVALID');
    return body;
  }
  if (!Array.isArray(representation.shared) || representation.shared.length > MAX_NODES
      || Object.keys(representation).some(key => !['format', 'body', 'shared'].includes(key))) throw new Error('PROBLEM_COMPACTION_ENCODING_INVALID');
  const seen = [];
  let expandedBytes = bytes(body);
  for (const group of representation.shared) {
    if (!group || !Object.hasOwn(group, 'value') || !Array.isArray(group.at) || group.at.length < 2
        || Object.keys(group).some(key => !['at', 'value'].includes(key))) throw new Error('PROBLEM_COMPACTION_ENCODING_INVALID');
    for (const pointer of group.at) {
      if (seen.length >= MAX_NODES || seen.some(previous => overlaps(pointer, previous))) throw new Error('PROBLEM_COMPACTION_OVERLAPPING_REFERENCES');
      const target = slot(body, pointer);
      if (target.get() !== null) throw new Error('PROBLEM_COMPACTION_REFERENCE_NOT_EMPTY');
      expandedBytes += bytes(group.value) - 4;
      if (expandedBytes > MAX_SOURCE_BYTES) throw new Error('PROBLEM_COMPACTION_EXPANSION_LIMIT');
      target.set(clone(group.value));
      seen.push(pointer);
    }
  }
  visit(body, () => {});
  return body;
}

function boundedSource(root, relative, limit = MAX_SOURCE_BYTES) {
  let current = root;
  for (const part of relative.split('/')) {
    if (!part || part === '.' || part === '..') throw new Error('PROBLEM_COMPACTION_PATH_INVALID');
    current = path.join(current, part);
    if (fs.lstatSync(current).isSymbolicLink()) throw new Error('PROBLEM_COMPACTION_SYMLINK_FORBIDDEN');
  }
  const stat = fs.statSync(current);
  if (!stat.isFile() || stat.size > limit) throw new Error('PROBLEM_COMPACTION_SOURCE_LIMIT');
  const data = fs.readFileSync(current);
  if (data.length > limit) throw new Error('PROBLEM_COMPACTION_SOURCE_LIMIT');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  return { text, hash: crypto.createHash('sha256').update(data).digest('hex'), bytes: data.length };
}

function readSnapshot(root, taskId) {
  if (!/^task_[a-zA-Z0-9_]+$/.test(taskId || '')) throw new Error('PROBLEM_COMPACTION_TASK_ID_INVALID');
  root = fs.realpathSync(root);
  const directory = path.join(root, 'md-os/ops/tasks');
  const relative = path.relative(root, fs.realpathSync(directory));
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('PROBLEM_COMPACTION_PATH_ESCAPE');
  const names = fs.readdirSync(directory).filter(name => /^task_[a-zA-Z0-9_]+\.json$/.test(name)).sort();
  if (names.length > 10000) throw new Error('PROBLEM_COMPACTION_INDEX_LIMIT');
  let total = 0;
  const sources = names.map(name => {
    const sourcePath = `md-os/ops/tasks/${name}`;
    const source = boundedSource(root, sourcePath);
    total += source.bytes;
    if (total > 16 * MAX_SOURCE_BYTES) throw new Error('PROBLEM_COMPACTION_INDEX_LIMIT');
    const task = JSON.parse(source.text);
    visit(task, () => {});
    if (!task || `${task.task_spec_id}.json` !== name || typeof task.goal !== 'string' || !task.goal.trim()) throw new Error('PROBLEM_COMPACTION_TASK_INVALID');
    normalizeProblemCore(task.problem_core);
    return { task, path: sourcePath, hash: source.hash };
  });
  const focus = sources.find(item => item.task.task_spec_id === taskId);
  if (!focus) throw new Error('PROBLEM_COMPACTION_TASK_NOT_FOUND');
  const readback = buildProblemReadback(sources.map(source => source.task));
  const edges = readback.flatMap(problem => problem.relations.map(relation => ({ from: problem.task_spec_id, ...relation })));
  const affected = new Set([taskId]);
  // Preserve the complete declared connected boundary, including incoming
  // contradictions, analogies and cycles. This does not discover new links.
  const adjacency = new Map();
  for (const edge of edges) for (const [a, b] of [[edge.from, edge.task_spec_id], [edge.task_spec_id, edge.from]]) {
    if (!adjacency.has(a)) adjacency.set(a, new Set());
    adjacency.get(a).add(b);
  }
  const queue = [taskId];
  for (let i = 0; i < queue.length; i += 1) for (const id of adjacency.get(queue[i]) || []) if (!affected.has(id)) {
    affected.add(id); queue.push(id);
  }
  const refs = [...new Set(sources.filter(source => affected.has(source.task.task_spec_id)).flatMap(({ task }) => [
    ...(task.required_evidence || []).map(item => item.path),
    ...(task.problem_core?.premises || []).flatMap(item => item.source_refs),
  ]))].sort();
  if (refs.length > 256) throw new Error('PROBLEM_COMPACTION_EVIDENCE_LIMIT');
  const evidence = refs.map(reference => {
    const record = { path: reference, status: 'unavailable' };
    if (typeof reference !== 'string' || !/^md-os\/(ops\/sources|kb)\/.+\.(json|md|txt)$/.test(reference)
        || reference.split('/').some(part => part.startsWith('.') || part === 'local')) return record;
    try { return { path: reference, status: 'bound', sha256: boundedSource(root, reference).hash }; } catch (_) { return record; }
  });
  const bindings = sources.map(source => ({ task_spec_id: source.task.task_spec_id, path: source.path, sha256: source.hash }));
  const network = {
    hash: sha256Json({ bindings, evidence }),
    scope: 'declared_relations_only',
    affected_problem_ids: [...affected].sort(),
    unrelated_problem_count: sources.filter(source => !affected.has(source.task.task_spec_id)).length,
    relations: edges.filter(edge => affected.has(edge.from)),
    problems: readback.filter(problem => affected.has(problem.task_spec_id)).map(problem => ({
      task_spec_id: problem.task_spec_id, source_path: `md-os/ops/tasks/${problem.task_spec_id}.json`,
      contract_hash: problem.contract_hash, declared_state: problem.declared_state,
      resolution: problem.resolution, review_required: problem.review_required, review_reasons: problem.review_reasons,
    })),
    evidence,
  };
  return { task: focus.task, source: { path: focus.path, sha256: focus.hash, contract_hash: problemContractHash(focus.task) }, network };
}

// Only proposed wording of explanatory fields may change. IDs, procedures,
// limits, tests, epistemic labels, source bindings and every relation stay exact.
const SUMMARY_POINTER = /^\/(goal|constraints\/\d+|unknowns\/\d+|problem_core\/(candidate_solution|next_question|premises\/\d+\/statement))$/;

function previewProblemCompaction(workspaceRoot, { task_id, maximum_bytes = 32768, proposal = null } = {}) {
  if (!Number.isInteger(maximum_bytes) || maximum_bytes < 2048 || maximum_bytes > 262144) throw new Error('PROBLEM_COMPACTION_BUDGET_INVALID');
  const snapshot = readSnapshot(workspaceRoot, task_id);
  const result = {
    schema_version: 1, mode: 'problem_compaction_preview', task_spec_id: task_id,
    status: 'lossless_verified', writes: false, resolution: 'unverified', automatic_reuse: false,
    source: snapshot.source, network: snapshot.network, representation: null,
    changes: [], risks: [],
    verification: { scope: 'exact_json_reconstruction_only', round_trip: false, semantic_equivalence: 'not_evaluated', outcome: 'not_evaluated' },
    metrics: { original_json_bytes: bytes(snapshot.task), representation_bytes: 0, output_bytes: 0, total_token_saving: null },
  };
  let document = snapshot.task;
  if (proposal !== null) {
    const reject = reason => { result.status = 'rejected'; result.risks.push(reason); };
    if (!proposal || proposal.schema_version !== 1 || !Array.isArray(proposal.changes) || !proposal.changes.length || proposal.changes.length > 64
        || Object.keys(proposal).some(key => !['schema_version', 'source_hash', 'network_hash', 'changes'].includes(key))) reject('invalid_proposal');
    else if (proposal.source_hash !== snapshot.source.sha256 || proposal.network_hash !== snapshot.network.hash) reject('stale_source_or_problem_network');
    else {
      document = clone(snapshot.task);
      const seen = new Set();
      for (const change of proposal.changes) {
        if (!change || !SUMMARY_POINTER.test(change.pointer) || seen.has(change.pointer)
            || Object.keys(change).some(key => !['pointer', 'summary', 'reason'].includes(key))
            || typeof change.summary !== 'string' || !change.summary.trim() || change.summary.length > 4096
            || typeof change.reason !== 'string' || !change.reason.trim() || change.reason.length > 2048) { reject('protected_field_or_invalid_change'); break; }
        try {
          const target = slot(document, change.pointer), original = target.get();
          if (typeof original !== 'string') throw new Error('not_text');
          target.set(change.summary);
          seen.add(change.pointer);
          result.changes.push({ ...change, original_sha256: sha256Text(original), source_ref: `${snapshot.source.path}#${change.pointer}`, evidence_status: 'model_proposal_only' });
        } catch (_) { reject('missing_or_nontext_field'); break; }
      }
      if (result.status !== 'rejected') {
        result.status = 'semantic_candidate';
        result.verification.scope = 'structure_and_source_bindings_only';
        result.risks.push('Meaning is not verified. Read original changed fields and obtain independent outcome evidence before reliance.');
      }
    }
  }
  if (result.status !== 'rejected') {
    result.representation = compactJson(document);
    result.verification.round_trip = isDeepStrictEqual(expandCompactJson(result.representation), snapshot.task);
    result.metrics.representation_bytes = bytes(result.representation);
    if (result.status === 'lossless_verified' && !result.verification.round_trip) throw new Error('PROBLEM_COMPACTION_ROUND_TRIP_FAILED');
    if (result.metrics.representation_bytes >= bytes(snapshot.task)) {
      result.status = 'insufficient_evidence';
      result.risks.push('No smaller representation found including encoding overhead; keep the original.');
    }
  }
  // Re-read after processing so a concurrent change cannot bless a stale preview.
  if (readSnapshot(workspaceRoot, task_id).network.hash !== snapshot.network.hash) {
    result.status = 'rejected'; result.representation = null; result.risks.push('source_changed_during_preview');
  }
  const measure = () => { for (let i = 0; i < 5; i += 1) result.metrics.output_bytes = bytes(result) + 1; };
  measure();
  if (result.metrics.output_bytes > maximum_bytes) {
    result.status = 'insufficient_evidence'; result.representation = null;
    result.changes = []; result.network = { hash: snapshot.network.hash, scope: 'not_loaded_budget_exceeded' };
    result.risks = ['Required representation and relation boundary exceed the budget. Nothing was silently pruned; request more room or retrieve original sources.'];
    measure();
  }
  return result;
}

module.exports = { compactJson, expandCompactJson, previewProblemCompaction };
