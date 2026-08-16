#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function descriptorId(descriptor) {
  return String(descriptor && descriptor.id || '').trim();
}

function validatePrimitive(descriptor) {
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) {
    throw new Error('SYNTHESIS_PRIMITIVE_OBJECT_REQUIRED');
  }
  const id = descriptorId(descriptor);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]{0,100}$/.test(id)) {
    throw new Error(`SYNTHESIS_PRIMITIVE_ID_INVALID: ${id}`);
  }
  if (!['filter', 'map', 'reduce'].includes(descriptor.kind)) {
    throw new Error(`SYNTHESIS_PRIMITIVE_KIND_INVALID: ${descriptor.kind}`);
  }
  if (!String(descriptor.op || '').trim()) {
    throw new Error(`SYNTHESIS_PRIMITIVE_OPERATION_REQUIRED: ${id}`);
  }
  return descriptor;
}

function primitiveCatalogMap(catalog) {
  if (!Array.isArray(catalog) || !catalog.length) throw new Error('SYNTHESIS_PRIMITIVE_CATALOG_REQUIRED');
  const map = new Map();
  for (const primitive of catalog) {
    validatePrimitive(primitive);
    if (map.has(primitive.id)) throw new Error(`SYNTHESIS_PRIMITIVE_DUPLICATE: ${primitive.id}`);
    map.set(primitive.id, clone(primitive));
  }
  return map;
}

function finiteNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`SYNTHESIS_NUMBER_REQUIRED: ${label}`);
  }
  return value;
}

function objectValue(item, field, label) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`SYNTHESIS_OBJECT_REQUIRED: ${label}`);
  }
  if (!Object.prototype.hasOwnProperty.call(item, field)) {
    throw new Error(`SYNTHESIS_FIELD_MISSING: ${field}`);
  }
  return item[field];
}

function evaluatePredicate(primitive, item) {
  const args = primitive.args || {};
  switch (primitive.op) {
    case 'number_gt':
      return finiteNumber(item, primitive.id) > finiteNumber(args.threshold, `${primitive.id}.threshold`);
    case 'number_gte':
      return finiteNumber(item, primitive.id) >= finiteNumber(args.threshold, `${primitive.id}.threshold`);
    case 'number_lt':
      return finiteNumber(item, primitive.id) < finiteNumber(args.threshold, `${primitive.id}.threshold`);
    case 'number_even':
      return Number.isInteger(finiteNumber(item, primitive.id)) && item % 2 === 0;
    case 'number_nonzero':
      return finiteNumber(item, primitive.id) !== 0;
    case 'text_nonempty':
      return typeof item === 'string' && item.trim().length > 0;
    case 'text_starts_with':
      return typeof item === 'string' && item.startsWith(String(args.prefix || ''));
    case 'text_contains':
      return typeof item === 'string' && item.includes(String(args.needle || ''));
    case 'field_equals':
      return sameValue(objectValue(item, String(args.field || ''), primitive.id), args.value);
    case 'field_gt':
      return finiteNumber(objectValue(item, String(args.field || ''), primitive.id), primitive.id)
        > finiteNumber(args.threshold, `${primitive.id}.threshold`);
    case 'field_lt':
      return finiteNumber(objectValue(item, String(args.field || ''), primitive.id), primitive.id)
        < finiteNumber(args.threshold, `${primitive.id}.threshold`);
    case 'field_truthy':
      return Boolean(objectValue(item, String(args.field || ''), primitive.id));
    case 'field_nonzero':
      return finiteNumber(objectValue(item, String(args.field || ''), primitive.id), primitive.id) !== 0;
    default:
      throw new Error(`SYNTHESIS_FILTER_UNSUPPORTED: ${primitive.op}`);
  }
}

function applyMapper(primitive, item) {
  const args = primitive.args || {};
  switch (primitive.op) {
    case 'number_add':
      return finiteNumber(item, primitive.id) + finiteNumber(args.value, `${primitive.id}.value`);
    case 'number_multiply':
      return finiteNumber(item, primitive.id) * finiteNumber(args.value, `${primitive.id}.value`);
    case 'number_square': {
      const value = finiteNumber(item, primitive.id);
      return value * value;
    }
    case 'number_abs':
      return Math.abs(finiteNumber(item, primitive.id));
    case 'text_trim_lower':
      if (typeof item !== 'string') throw new Error(`SYNTHESIS_TEXT_REQUIRED: ${primitive.id}`);
      return item.trim().toLowerCase();
    case 'text_upper':
      if (typeof item !== 'string') throw new Error(`SYNTHESIS_TEXT_REQUIRED: ${primitive.id}`);
      return item.toUpperCase();
    case 'text_length':
      if (typeof item !== 'string') throw new Error(`SYNTHESIS_TEXT_REQUIRED: ${primitive.id}`);
      return item.length;
    case 'text_prefix':
      if (typeof item !== 'string') throw new Error(`SYNTHESIS_TEXT_REQUIRED: ${primitive.id}`);
      return `${String(args.prefix || '')}${item}`;
    case 'field_get':
      return clone(objectValue(item, String(args.field || ''), primitive.id));
    case 'fields_tuple': {
      const fields = Array.isArray(args.fields) ? args.fields.map(String) : [];
      if (!fields.length) throw new Error(`SYNTHESIS_FIELDS_REQUIRED: ${primitive.id}`);
      return fields.map((field) => clone(objectValue(item, field, primitive.id)));
    }
    case 'fields_join': {
      const fields = Array.isArray(args.fields) ? args.fields.map(String) : [];
      if (!fields.length) throw new Error(`SYNTHESIS_FIELDS_REQUIRED: ${primitive.id}`);
      const separator = String(args.separator === undefined ? ':' : args.separator);
      return fields.map((field) => String(objectValue(item, field, primitive.id))).join(separator);
    }
    default:
      throw new Error(`SYNTHESIS_MAP_UNSUPPORTED: ${primitive.op}`);
  }
}

function applyReducer(primitive, values) {
  const args = primitive.args || {};
  if (!Array.isArray(values)) throw new Error(`SYNTHESIS_ARRAY_REQUIRED: ${primitive.id}`);
  switch (primitive.op) {
    case 'sum':
      return values.reduce((sum, value) => sum + finiteNumber(value, primitive.id), 0);
    case 'count':
      return values.length;
    case 'join':
      return values.map((value) => String(value)).join(String(args.separator === undefined ? ',' : args.separator));
    case 'max':
      if (!values.length) return null;
      return Math.max(...values.map((value) => finiteNumber(value, primitive.id)));
    case 'min':
      if (!values.length) return null;
      return Math.min(...values.map((value) => finiteNumber(value, primitive.id)));
    default:
      throw new Error(`SYNTHESIS_REDUCE_UNSUPPORTED: ${primitive.op}`);
  }
}

function normalizeProgram(program, catalog) {
  const catalogMap = catalog instanceof Map ? catalog : primitiveCatalogMap(catalog);
  const operations = Array.isArray(program && program.operations) ? program.operations : [];
  if (!operations.length) throw new Error('SYNTHESIS_PROGRAM_OPERATIONS_REQUIRED');
  let reduced = false;
  return {
    operations: operations.map((operation, index) => {
      const id = typeof operation === 'string' ? operation : descriptorId(operation);
      const descriptor = catalogMap.get(id);
      if (!descriptor) throw new Error(`SYNTHESIS_PROGRAM_PRIMITIVE_UNKNOWN: ${id}`);
      if (reduced) throw new Error(`SYNTHESIS_OPERATION_AFTER_REDUCE: ${id}`);
      if (descriptor.kind === 'reduce') {
        if (index !== operations.length - 1) throw new Error(`SYNTHESIS_REDUCE_NOT_TERMINAL: ${id}`);
        reduced = true;
      }
      return clone(descriptor);
    }),
  };
}

function executeProgram(program, input, catalog) {
  const normalized = normalizeProgram(program, catalog);
  if (!Array.isArray(input)) throw new Error('SYNTHESIS_INPUT_ARRAY_REQUIRED');
  let value = clone(input);
  for (const primitive of normalized.operations) {
    if (primitive.kind === 'filter') {
      if (!Array.isArray(value)) throw new Error(`SYNTHESIS_FILTER_INPUT_ARRAY_REQUIRED: ${primitive.id}`);
      value = value.filter((item) => evaluatePredicate(primitive, item));
    } else if (primitive.kind === 'map') {
      if (!Array.isArray(value)) throw new Error(`SYNTHESIS_MAP_INPUT_ARRAY_REQUIRED: ${primitive.id}`);
      value = value.map((item) => applyMapper(primitive, item));
    } else if (primitive.kind === 'reduce') {
      value = applyReducer(primitive, value);
    }
  }
  return value;
}

function programSketch(program) {
  const operations = Array.isArray(program && program.operations) ? program.operations : [];
  return operations.map((operation) => operation.kind).join('>');
}

function programHash(program) {
  const operations = Array.isArray(program && program.operations) ? program.operations : [];
  return sha256Json({
    operations: operations.map((operation) => ({
      id: operation.id,
      kind: operation.kind,
      op: operation.op,
      args: operation.args || {},
    })),
  });
}

function validatePublicTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) throw new Error('SYNTHESIS_TASK_OBJECT_REQUIRED');
  if (!String(task.task_id || '').trim()) throw new Error('SYNTHESIS_TASK_ID_REQUIRED');
  const catalog = primitiveCatalogMap(task.primitive_catalog);
  const examples = Array.isArray(task.train_examples) ? task.train_examples : [];
  if (examples.length < 2) throw new Error(`SYNTHESIS_TRAIN_EXAMPLES_INSUFFICIENT: ${task.task_id}`);
  for (const example of examples) {
    if (!example || !Array.isArray(example.input) || !Object.prototype.hasOwnProperty.call(example, 'output')) {
      throw new Error(`SYNTHESIS_TRAIN_EXAMPLE_INVALID: ${task.task_id}`);
    }
  }
  if (!['array', 'scalar'].includes(task.output_kind)) throw new Error(`SYNTHESIS_OUTPUT_KIND_INVALID: ${task.task_id}`);
  return { task, catalog, examples };
}

function matchesExamples(program, examples, catalog) {
  for (const example of examples) {
    let output;
    try {
      output = executeProgram(program, example.input, catalog);
    } catch (_) {
      return false;
    }
    if (!sameValue(output, example.output)) return false;
  }
  return true;
}

function cartesianProduct(groups, visitor, index = 0, current = []) {
  if (index >= groups.length) {
    visitor(current.slice());
    return;
  }
  for (const value of groups[index]) {
    current.push(value);
    cartesianProduct(groups, visitor, index + 1, current);
    current.pop();
  }
}

function skeletonsAtDepth(depth, outputKind) {
  const result = [];
  function visit(prefix) {
    if (prefix.length === depth) {
      const endsReduce = prefix.at(-1) === 'reduce';
      if ((outputKind === 'scalar' && endsReduce) || (outputKind === 'array' && !endsReduce)) {
        result.push(prefix.slice());
      }
      return;
    }
    for (const kind of ['map', 'filter', 'reduce']) {
      if (prefix.includes('reduce')) continue;
      if (kind === 'reduce' && prefix.length !== depth - 1) continue;
      if (kind === 'reduce' && outputKind !== 'scalar') continue;
      if (kind !== 'reduce' && outputKind === 'scalar' && prefix.length === depth - 1) continue;
      prefix.push(kind);
      visit(prefix);
      prefix.pop();
    }
  }
  visit([]);
  return result;
}

function allSkeletons(maxDepth, outputKind, prioritizedSketches = []) {
  const skeletons = [];
  for (let depth = 1; depth <= maxDepth; depth += 1) skeletons.push(...skeletonsAtDepth(depth, outputKind));
  const priority = new Map(prioritizedSketches.map((sketch, index) => [String(sketch), index]));
  return skeletons.sort((left, right) => {
    const leftKey = left.join('>');
    const rightKey = right.join('>');
    const leftRank = priority.has(leftKey) ? priority.get(leftKey) : Number.MAX_SAFE_INTEGER;
    const rightRank = priority.has(rightKey) ? priority.get(rightKey) : Number.MAX_SAFE_INTEGER;
    return leftRank - rightRank || left.length - right.length || leftKey.localeCompare(rightKey);
  });
}

function synthesizeEnumerative(publicTask, options = {}) {
  const { catalog, examples } = validatePublicTask(publicTask);
  const maxDepth = Math.max(1, Number.parseInt(options.max_depth || publicTask.max_depth || 3, 10));
  const maxCandidates = Math.max(1, Number.parseInt(options.max_candidates || 100, 10));
  const prioritizedSketches = Array.isArray(options.prioritized_sketches) ? options.prioritized_sketches : [];
  const byKind = {
    filter: Array.from(catalog.values()).filter((primitive) => primitive.kind === 'filter'),
    map: Array.from(catalog.values()).filter((primitive) => primitive.kind === 'map'),
    reduce: Array.from(catalog.values()).filter((primitive) => primitive.kind === 'reduce'),
  };
  let candidatesEvaluated = 0;
  let solution = null;
  let exhausted = true;
  const skeletonOrder = allSkeletons(maxDepth, publicTask.output_kind, prioritizedSketches);
  for (const skeleton of skeletonOrder) {
    if (skeleton.some((kind) => !byKind[kind].length)) continue;
    let stop = false;
    cartesianProduct(skeleton.map((kind) => byKind[kind]), (operations) => {
      if (stop || solution) return;
      if (candidatesEvaluated >= maxCandidates) {
        exhausted = false;
        stop = true;
        return;
      }
      candidatesEvaluated += 1;
      const program = { operations: operations.map(clone) };
      if (matchesExamples(program, examples, catalog)) {
        solution = program;
        stop = true;
      }
    });
    if (solution || !exhausted) break;
  }
  return {
    solved: Boolean(solution),
    program: solution,
    program_hash: solution ? programHash(solution) : null,
    sketch: solution ? programSketch(solution) : null,
    candidates_evaluated: candidatesEvaluated,
    candidate_budget: maxCandidates,
    search_exhausted: exhausted && !solution,
    prioritized_sketches: prioritizedSketches.slice(),
    search_mode: 'enumerative',
  };
}

function outputSignature(outputs) {
  return sha256Json(outputs);
}

function evaluateOnExamples(program, examples, catalog) {
  const outputs = [];
  try {
    for (const example of examples) outputs.push(executeProgram(program, example.input, catalog));
  } catch (_) {
    return null;
  }
  return outputs;
}

function synthesizeBottomUp(publicTask, options = {}) {
  const { catalog, examples } = validatePublicTask(publicTask);
  const maxDepth = Math.max(1, Number.parseInt(options.max_depth || publicTask.max_depth || 4, 10));
  const maxCandidates = Math.max(1, Number.parseInt(options.max_candidates || 5000, 10));
  const primitives = Array.from(catalog.values()).sort((left, right) => {
    const order = { map: 0, filter: 1, reduce: 2 };
    return order[left.kind] - order[right.kind] || left.id.localeCompare(right.id);
  });
  const targetOutputs = examples.map((example) => clone(example.output));
  const seenBehaviors = new Set();
  let frontier = [];
  let candidatesGenerated = 0;
  let behaviorsPruned = 0;
  const depthTelemetry = [];

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const candidates = [];
    if (depth === 1) {
      for (const primitive of primitives) candidates.push({ operations: [clone(primitive)] });
    } else {
      for (const entry of frontier) {
        if (entry.program.operations.at(-1).kind === 'reduce') continue;
        for (const primitive of primitives) {
          if (primitive.kind === 'reduce' && depth < 2) continue;
          candidates.push({ operations: [...entry.program.operations.map(clone), clone(primitive)] });
        }
      }
    }

    const nextFrontier = [];
    let validAtDepth = 0;
    for (const program of candidates) {
      if (candidatesGenerated >= maxCandidates) {
        return {
          solved: false,
          program: null,
          program_hash: null,
          sketch: null,
          candidates_evaluated: candidatesGenerated,
          candidate_budget: maxCandidates,
          search_exhausted: false,
          search_mode: 'bottom_up_behavior_pruned',
          max_depth: maxDepth,
          minimal_depth_proven: false,
          behaviors_pruned: behaviorsPruned,
          depth_telemetry: depthTelemetry,
        };
      }
      candidatesGenerated += 1;
      const outputs = evaluateOnExamples(program, examples, catalog);
      if (!outputs) continue;
      const finalKind = program.operations.at(-1).kind === 'reduce' ? 'scalar' : 'array';
      const signature = outputSignature(outputs);
      if (seenBehaviors.has(signature)) {
        behaviorsPruned += 1;
        continue;
      }
      seenBehaviors.add(signature);
      validAtDepth += 1;
      if (finalKind === publicTask.output_kind && sameValue(outputs, targetOutputs)) {
        depthTelemetry.push({ depth, generated: candidates.length, retained: validAtDepth });
        return {
          solved: true,
          program,
          program_hash: programHash(program),
          sketch: programSketch(program),
          candidates_evaluated: candidatesGenerated,
          candidate_budget: maxCandidates,
          search_exhausted: false,
          search_mode: 'bottom_up_behavior_pruned',
          max_depth: maxDepth,
          solution_depth: depth,
          minimal_depth_proven: true,
          behaviors_pruned: behaviorsPruned,
          depth_telemetry: depthTelemetry,
        };
      }
      if (program.operations.at(-1).kind !== 'reduce') nextFrontier.push({ program, outputs, signature });
    }
    depthTelemetry.push({ depth, generated: candidates.length, retained: nextFrontier.length });
    frontier = nextFrontier;
    if (!frontier.length && depth < maxDepth) break;
  }

  return {
    solved: false,
    program: null,
    program_hash: null,
    sketch: null,
    candidates_evaluated: candidatesGenerated,
    candidate_budget: maxCandidates,
    search_exhausted: true,
    search_mode: 'bottom_up_behavior_pruned',
    max_depth: maxDepth,
    minimal_depth_proven: false,
    behaviors_pruned: behaviorsPruned,
    depth_telemetry: depthTelemetry,
  };
}

function verifyProgram(program, hiddenTests, catalog) {
  const tests = Array.isArray(hiddenTests) ? hiddenTests : [];
  const results = tests.map((test, index) => {
    let actual;
    let error = null;
    try {
      actual = executeProgram(program, test.input, catalog);
    } catch (caught) {
      error = String(caught && caught.message || caught);
    }
    const passed = !error && sameValue(actual, test.output);
    return { index, passed, actual: error ? null : actual, expected: clone(test.output), error };
  });
  return {
    passed: results.length > 0 && results.every((result) => result.passed),
    passed_count: results.filter((result) => result.passed).length,
    test_count: results.length,
    results,
  };
}

function learnSketchLibrary(solutions, minimumDomains = 2) {
  const bySketch = new Map();
  for (const solution of Array.isArray(solutions) ? solutions : []) {
    if (!solution || !solution.program || !solution.domain_id) continue;
    const sketch = programSketch(solution.program);
    if (!bySketch.has(sketch)) bySketch.set(sketch, { sketch, domains: new Set(), task_ids: [] });
    const entry = bySketch.get(sketch);
    entry.domains.add(solution.domain_id);
    entry.task_ids.push(solution.task_id);
  }
  return Array.from(bySketch.values())
    .filter((entry) => entry.domains.size >= minimumDomains)
    .map((entry) => ({
      sketch: entry.sketch,
      source_domains: Array.from(entry.domains).sort(),
      source_task_ids: entry.task_ids.slice().sort(),
      independent_domain_count: entry.domains.size,
    }))
    .sort((left, right) => right.independent_domain_count - left.independent_domain_count
      || left.sketch.localeCompare(right.sketch));
}

function noveltyMetrics(program, archivePrograms = []) {
  const hash = programHash(program);
  const sketch = programSketch(program);
  const archiveHashes = new Set(archivePrograms.map((item) => item.program_hash || (item.program && programHash(item.program))));
  const archiveSketches = new Set(archivePrograms.map((item) => item.sketch || (item.program && programSketch(item.program))));
  const primitiveIds = program.operations.map((operation) => operation.id);
  return {
    program_hash: hash,
    sketch,
    exact_program_novel: !archiveHashes.has(hash),
    sketch_novel: !archiveSketches.has(sketch),
    primitive_count: primitiveIds.length,
    distinct_primitive_count: new Set(primitiveIds).size,
  };
}

module.exports = {
  canonicalJson,
  clone,
  executeProgram,
  learnSketchLibrary,
  matchesExamples,
  noveltyMetrics,
  primitiveCatalogMap,
  programHash,
  programSketch,
  sameValue,
  sha256Json,
  synthesizeBottomUp,
  synthesizeEnumerative,
  validatePublicTask,
  verifyProgram,
};
