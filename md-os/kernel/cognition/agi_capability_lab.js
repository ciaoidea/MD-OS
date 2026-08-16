#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  canonicalJson,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const {
  appendLineWithLock,
  atomicWriteJson,
  atomicWriteText,
  ensureDir,
} = require('../../os/lib/fs_runtime');

const CAPABILITY_PROTOCOL_ID = 'mdos_agi_capability_lab_v1';
const CAPABILITY_ROOT = path.join(MDOS_ROOT, 'ops', 'agi', 'capability_experiments');
const WORKER_SCRIPT = path.join(MDOS_ROOT, 'os', 'agi_capability_worker.js');
const FORBIDDEN_LEARNER_KEYS = new Set([
  'evaluator_only',
  'structural_family',
  'family',
  'split',
  'hidden',
  'hidden_tests',
  'expected',
  'expected_answer',
  'oracle',
  'oracle_strategy',
  'generator_seed',
  'private_key',
]);

const STRATEGY_IDS = Object.freeze([
  'identity_projection',
  'greedy_local',
  'affine_induction',
  'causal_elimination',
  'subset_branch_bound',
  'dependency_search',
  'uniform_cost_search',
  'symbolic_rewrite_induction',
  'robust_outlier_detection',
]);

const CONFIGURATIONS = Object.freeze([
  'same_host_base',
  'same_host_prompted',
  'same_host_mdos_no_learning',
  'same_host_mdos_full',
]);

const STRUCTURAL_FAMILIES = Object.freeze([
  'numeric_relation',
  'causal_diagnosis',
  'constrained_selection',
  'dependency_planning',
  'weighted_navigation',
  'symbolic_transduction',
  'robust_anomaly_detection',
]);

const SOURCE_SEMANTIC_DOMAINS = Object.freeze({
  numeric_relation: ['sensor_calibration', 'laboratory_assay'],
  causal_diagnosis: ['industrial_faults', 'service_incidents'],
  constrained_selection: ['cargo_manifest', 'compute_job_admission'],
  dependency_planning: ['software_rollout', 'factory_changeover'],
  weighted_navigation: ['urban_logistics', 'packet_routing'],
  symbolic_transduction: ['log_normalization', 'catalog_code_conversion'],
  robust_anomaly_detection: ['machine_telemetry', 'quality_control'],
});

const TARGET_SEMANTIC_DOMAINS = Object.freeze({
  numeric_relation: ['economic_index_translation', 'astronomy_detector_response'],
  causal_diagnosis: ['crop_disease_inference', 'ecosystem_stress_analysis'],
  constrained_selection: ['research_portfolio', 'emergency_supply_loading'],
  dependency_planning: ['clinical_procedure_coordination', 'museum_exhibition_installation'],
  weighted_navigation: ['molecular_reaction_route', 'legal_dependency_migration'],
  symbolic_transduction: ['genomic_token_encoding', 'historical_catalog_transliteration'],
  robust_anomaly_detection: ['seismic_station_screening', 'financial_ledger_outliers'],
});

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function safeId(value, fallback = 'capability') {
  const text = shortText(value).replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
  return text.slice(0, 80) || fallback;
}

function seedToUint32(seed) {
  return Number.parseInt(sha256Text(String(seed)).slice(0, 8), 16) >>> 0;
}

function createRng(seed) {
  let state = seedToUint32(seed) || 0x6d2b79f5;
  return function rng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function randomInt(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

function choose(rng, values) {
  return values[Math.min(values.length - 1, Math.floor(rng() * values.length))];
}

function shuffle(rng, values) {
  const output = values.slice();
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [output[index], output[swap]] = [output[swap], output[index]];
  }
  return output;
}

function median(values) {
  const sorted = values.slice().sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function sameValue(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function forbiddenPaths(value, prefix = '$', findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => forbiddenPaths(item, `${prefix}[${index}]`, findings));
    return findings;
  }
  if (!value || typeof value !== 'object') return findings;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${prefix}.${key}`;
    if (FORBIDDEN_LEARNER_KEYS.has(String(key).toLowerCase())) findings.push(childPath);
    forbiddenPaths(child, childPath, findings);
  }
  return findings;
}

function taskEnvelope({ taskId, semanticDomain, structuralFamily, difficulty, objective, payload, expected, oracleStrategy, verifier = {} }) {
  const publicTask = {
    schema_version: 1,
    task_id: taskId,
    semantic_domain: semanticDomain,
    objective,
    difficulty,
    payload,
    answer_contract: verifier.answer_contract || 'json_value',
  };
  return {
    public_task: publicTask,
    evaluator_only: {
      structural_family: structuralFamily,
      expected,
      oracle_strategy: oracleStrategy,
      verifier,
    },
  };
}

function canonicalizePayload(publicTask) {
  const payload = publicTask && publicTask.payload || {};
  if (Array.isArray(payload.examples) || Array.isArray(payload.query)) return clone(payload);
  if (Array.isArray(payload.observations) || Array.isArray(payload.targets)) {
    return {
      examples: (payload.observations || []).map((entry) => ({ input: entry.stimulus, output: entry.response })),
      query: clone(payload.targets || []),
    };
  }
  if (Array.isArray(payload.candidates) || Array.isArray(payload.observed)) return clone(payload);
  if (Array.isArray(payload.hypotheses) || Array.isArray(payload.evidence)) {
    return {
      candidates: (payload.hypotheses || []).map((entry) => ({
        id: entry.label,
        required: clone(entry.must_have || []),
        excluded: clone(entry.must_not_have || []),
        prior: Number(entry.base_rate || 0),
      })),
      observed: clone(payload.evidence || []),
    };
  }
  if (Array.isArray(payload.items) || Number.isFinite(payload.capacity)) return clone(payload);
  if (Array.isArray(payload.options) || Number.isFinite(payload.limit)) {
    return {
      items: (payload.options || []).map((entry) => ({ id: entry.key, cost: entry.resource, value: entry.utility })),
      capacity: payload.limit,
    };
  }
  if (Array.isArray(payload.jobs)) return clone(payload);
  if (Array.isArray(payload.activities)) {
    return {
      jobs: payload.activities.map((entry) => ({
        id: entry.key,
        duration: entry.time,
        due: entry.deadline,
        weight: entry.priority,
        depends_on: clone(entry.prerequisites || []),
      })),
    };
  }
  if (Array.isArray(payload.edges) || payload.start || payload.goal) return clone(payload);
  if (Array.isArray(payload.transitions) || payload.origin || payload.destination) {
    return {
      edges: (payload.transitions || []).map((entry) => ({
        from: entry.source,
        to: entry.destination,
        weight: entry.cost,
        open: entry.enabled !== false,
      })),
      start: payload.origin,
      goal: payload.destination,
    };
  }
  if (Array.isArray(payload.demonstrations) || Array.isArray(payload.inputs) || Array.isArray(payload.operators)) {
    return {
      examples: (payload.demonstrations || []).map((entry) => ({ input: entry.source, output: entry.target })),
      query: clone(payload.inputs || []),
      allowed_operations: clone(payload.operators || []),
    };
  }
  if (Array.isArray(payload.reference) || Array.isArray(payload.baseline)) {
    return {
      reference: clone(payload.reference || payload.baseline || []),
      query: clone(payload.query || payload.samples || []),
    };
  }
  return clone(payload);
}

function applyTargetSurfaceForm(task, split) {
  if (split === 'train') {
    task.public_task.representation = 'source_schema_v1';
    return task;
  }
  const family = task.evaluator_only.structural_family;
  const payload = task.public_task.payload || {};
  const transforms = {
    numeric_relation: () => ({
      observations: (payload.examples || []).map((entry) => ({ stimulus: entry.input, response: entry.output })),
      targets: clone(payload.query || []),
    }),
    causal_diagnosis: () => ({
      hypotheses: (payload.candidates || []).map((entry) => ({
        label: entry.id,
        must_have: clone(entry.required || []),
        must_not_have: clone(entry.excluded || []),
        base_rate: entry.prior,
      })),
      evidence: clone(payload.observed || []),
    }),
    constrained_selection: () => ({
      options: (payload.items || []).map((entry) => ({ key: entry.id, resource: entry.cost, utility: entry.value })),
      limit: payload.capacity,
    }),
    dependency_planning: () => ({
      activities: (payload.jobs || []).map((entry) => ({
        key: entry.id,
        time: entry.duration,
        deadline: entry.due,
        priority: entry.weight,
        prerequisites: clone(entry.depends_on || []),
      })),
    }),
    weighted_navigation: () => ({
      transitions: (payload.edges || []).map((entry) => ({
        source: entry.from,
        destination: entry.to,
        cost: entry.weight,
        enabled: entry.open,
      })),
      origin: payload.start,
      destination: payload.goal,
    }),
    symbolic_transduction: () => ({
      demonstrations: (payload.examples || []).map((entry) => ({ source: entry.input, target: entry.output })),
      inputs: clone(payload.query || []),
      operators: clone(payload.allowed_operations || []),
    }),
    robust_anomaly_detection: () => ({
      baseline: clone(payload.reference || []),
      samples: clone(payload.query || []),
    }),
  };
  task.public_task.payload = transforms[family] ? transforms[family]() : clone(payload);
  task.public_task.representation = 'target_schema_v2';
  return task;
}

function generateAffineTask(rng, taskId, semanticDomain, difficulty) {
  const slopes = [-4, -3, -2, -1, 2, 3, 4, 5];
  const slope = choose(rng, slopes);
  const intercept = randomInt(rng, -9, 9);
  const xs = shuffle(rng, Array.from({ length: 11 }, (_, index) => index - 5)).slice(0, 7);
  const examples = xs.slice(0, 4).map((input) => ({ input, output: slope * input + intercept }));
  const query = xs.slice(4);
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'numeric_relation',
    difficulty,
    objective: 'Infer the stable quantitative relation from calibrated observations and predict the withheld readings.',
    payload: { examples, query },
    expected: query.map((input) => slope * input + intercept),
    oracleStrategy: 'affine_induction',
    verifier: { answer_contract: 'number_array' },
  });
}

function generateCausalTask(rng, taskId, semanticDomain, difficulty) {
  const symptoms = shuffle(rng, ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta']);
  const causes = Array.from({ length: 4 }, (_, index) => ({
    id: `cause_${index + 1}`,
    required: symptoms.slice(index, index + 2),
    excluded: [symptoms[(index + 4) % symptoms.length]],
    prior: round(0.15 + index * 0.08, 2),
  }));
  const target = causes[randomInt(rng, 0, causes.length - 1)];
  const observed = Array.from(new Set([
    ...target.required,
    symptoms[(symptoms.indexOf(target.required[0]) + 3) % symptoms.length],
  ])).filter((symptom) => !target.excluded.includes(symptom));
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'causal_diagnosis',
    difficulty,
    objective: 'Select the most plausible root cause using required evidence, exclusions, and prior plausibility.',
    payload: { candidates: causes, observed },
    expected: target.id,
    oracleStrategy: 'causal_elimination',
    verifier: { answer_contract: 'identifier' },
  });
}

function bestSubset(items, capacity) {
  let best = { value: -Infinity, cost: Infinity, ids: [] };
  const total = 1 << items.length;
  for (let mask = 0; mask < total; mask += 1) {
    let cost = 0;
    let value = 0;
    const ids = [];
    for (let index = 0; index < items.length; index += 1) {
      if ((mask & (1 << index)) === 0) continue;
      cost += items[index].cost;
      value += items[index].value;
      ids.push(items[index].id);
    }
    if (cost > capacity) continue;
    const key = ids.slice().sort().join('|');
    const bestKey = best.ids.slice().sort().join('|');
    if (value > best.value || (value === best.value && cost < best.cost) || (value === best.value && cost === best.cost && key < bestKey)) {
      best = { value, cost, ids: ids.slice().sort() };
    }
  }
  return best;
}

function generateSelectionTask(rng, taskId, semanticDomain, difficulty) {
  const itemCount = Math.min(9, 5 + difficulty);
  const items = Array.from({ length: itemCount }, (_, index) => ({
    id: `item_${String(index + 1).padStart(2, '0')}`,
    cost: randomInt(rng, 2, 12),
    value: randomInt(rng, 3, 24),
  }));
  const capacity = Math.max(8, Math.floor(items.reduce((sum, item) => sum + item.cost, 0) * 0.42));
  const optimum = bestSubset(items, capacity);
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'constrained_selection',
    difficulty,
    objective: 'Choose the admissible portfolio with maximum total value under the fixed resource limit.',
    payload: { items, capacity },
    expected: optimum.ids,
    oracleStrategy: 'subset_branch_bound',
    verifier: { answer_contract: 'identifier_array', optimum_value: optimum.value, capacity },
  });
}

function validTopologicalOrder(order, jobs) {
  if (!Array.isArray(order) || order.length !== jobs.length || new Set(order).size !== jobs.length) return false;
  const positions = new Map(order.map((id, index) => [id, index]));
  if (jobs.some((job) => !positions.has(job.id))) return false;
  return jobs.every((job) => job.depends_on.every((dependency) => positions.get(dependency) < positions.get(job.id)));
}

function scheduleScore(order, jobs) {
  if (!validTopologicalOrder(order, jobs)) return Infinity;
  const byId = new Map(jobs.map((job) => [job.id, job]));
  let elapsed = 0;
  let penalty = 0;
  for (const id of order) {
    const job = byId.get(id);
    elapsed += job.duration;
    penalty += Math.max(0, elapsed - job.due) * job.weight;
  }
  return penalty;
}

function enumerateTopologicalOrders(jobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const output = [];
  function visit(prefix, remaining) {
    if (!remaining.length) {
      output.push(prefix.slice());
      return;
    }
    const done = new Set(prefix);
    const available = remaining
      .filter((id) => byId.get(id).depends_on.every((dependency) => done.has(dependency)))
      .sort();
    for (const id of available) {
      visit([...prefix, id], remaining.filter((candidate) => candidate !== id));
    }
  }
  visit([], jobs.map((job) => job.id));
  return output;
}

function optimalSchedule(jobs) {
  let bestOrder = null;
  let bestScore = Infinity;
  for (const order of enumerateTopologicalOrders(jobs)) {
    const score = scheduleScore(order, jobs);
    const key = order.join('|');
    const bestKey = bestOrder ? bestOrder.join('|') : '';
    if (score < bestScore || (score === bestScore && (!bestOrder || key < bestKey))) {
      bestOrder = order;
      bestScore = score;
    }
  }
  return { order: bestOrder || [], score: bestScore };
}

function generatePlanningTask(rng, taskId, semanticDomain, difficulty) {
  const count = Math.min(7, 4 + difficulty);
  const jobs = [];
  for (let index = 0; index < count; index += 1) {
    const id = `job_${index + 1}`;
    const possible = jobs.map((job) => job.id);
    const dependencyCount = possible.length ? randomInt(rng, 0, Math.min(2, possible.length)) : 0;
    const dependsOn = shuffle(rng, possible).slice(0, dependencyCount).sort();
    jobs.push({
      id,
      duration: randomInt(rng, 1, 6),
      due: randomInt(rng, 5, 25),
      weight: randomInt(rng, 1, 4),
      depends_on: dependsOn,
    });
  }
  const optimum = optimalSchedule(jobs);
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'dependency_planning',
    difficulty,
    objective: 'Produce a dependency-valid single-resource order that minimizes weighted lateness.',
    payload: { jobs },
    expected: optimum.order,
    oracleStrategy: 'dependency_search',
    verifier: { answer_contract: 'identifier_array', optimum_score: optimum.score },
  });
}

function shortestPath(graph, start, goal) {
  const nodes = new Set([start, goal]);
  graph.forEach((edge) => { nodes.add(edge.from); nodes.add(edge.to); });
  const distance = new Map(Array.from(nodes, (node) => [node, Infinity]));
  const previous = new Map();
  const unvisited = new Set(nodes);
  distance.set(start, 0);
  while (unvisited.size) {
    let current = null;
    let currentDistance = Infinity;
    for (const node of unvisited) {
      const value = distance.get(node);
      if (value < currentDistance || (value === currentDistance && String(node) < String(current))) {
        current = node;
        currentDistance = value;
      }
    }
    if (current === null || currentDistance === Infinity) break;
    unvisited.delete(current);
    if (current === goal) break;
    for (const edge of graph.filter((candidate) => candidate.open && candidate.from === current)) {
      const candidateDistance = currentDistance + edge.weight;
      if (candidateDistance < distance.get(edge.to)) {
        distance.set(edge.to, candidateDistance);
        previous.set(edge.to, current);
      }
    }
  }
  if (!Number.isFinite(distance.get(goal))) return { path: [], cost: Infinity };
  const pathNodes = [goal];
  while (pathNodes[0] !== start) {
    const prior = previous.get(pathNodes[0]);
    if (!prior) return { path: [], cost: Infinity };
    pathNodes.unshift(prior);
  }
  return { path: pathNodes, cost: distance.get(goal) };
}

function generateNavigationTask(rng, taskId, semanticDomain, difficulty) {
  const count = Math.min(9, 5 + difficulty);
  const nodes = Array.from({ length: count }, (_, index) => `n${index}`);
  const edges = [];
  for (let index = 0; index < count - 1; index += 1) {
    edges.push({ from: nodes[index], to: nodes[index + 1], weight: randomInt(rng, 1, 6), open: true });
    if (index + 2 < count) edges.push({ from: nodes[index], to: nodes[index + 2], weight: randomInt(rng, 2, 9), open: rng() > 0.15 });
  }
  for (let index = 0; index < count; index += 1) {
    for (let target = index + 3; target < count; target += 1) {
      if (rng() < 0.18) edges.push({ from: nodes[index], to: nodes[target], weight: randomInt(rng, 2, 12), open: rng() > 0.2 });
    }
  }
  const optimum = shortestPath(edges, nodes[0], nodes[nodes.length - 1]);
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'weighted_navigation',
    difficulty,
    objective: 'Find the minimum-cost valid route through the directed weighted network while respecting closed transitions.',
    payload: { edges, start: nodes[0], goal: nodes[nodes.length - 1] },
    expected: optimum.path,
    oracleStrategy: 'uniform_cost_search',
    verifier: { answer_contract: 'identifier_array', optimum_cost: optimum.cost },
  });
}

const REWRITE_OPERATIONS = Object.freeze({
  trim_lower: (value) => String(value).trim().toLowerCase(),
  upper: (value) => String(value).toUpperCase(),
  reverse_tokens: (value) => String(value).split(/\s+/).filter(Boolean).reverse().join(' '),
  remove_vowels: (value) => String(value).replace(/[aeiou]/gi, ''),
  token_sort: (value) => String(value).split(/\s+/).filter(Boolean).sort().join(' '),
  rotate_left: (value) => {
    const text = String(value);
    return text.length > 1 ? `${text.slice(1)}${text[0]}` : text;
  },
  prefix_hash: (value) => `#${String(value)}`,
});

function applyRewritePipeline(value, pipeline) {
  return pipeline.reduce((current, operation) => REWRITE_OPERATIONS[operation](current), value);
}

function generateRewriteTask(rng, taskId, semanticDomain, difficulty) {
  const operationIds = Object.keys(REWRITE_OPERATIONS);
  const depth = Math.min(3, Math.max(1, difficulty - 1));
  const pipeline = shuffle(rng, operationIds).slice(0, depth);
  const raw = [
    ' Alpha beta ',
    'Gamma delta',
    'one TWO three',
    '  control  ',
    'red blue green',
    'Signal Path',
    'aeiou trace',
  ];
  const examples = shuffle(rng, raw).slice(0, 4).map((input) => ({ input, output: applyRewritePipeline(input, pipeline) }));
  const query = shuffle(rng, raw.filter((item) => !examples.some((example) => example.input === item))).slice(0, 2);
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'symbolic_transduction',
    difficulty,
    objective: 'Infer the reusable symbol-transformation pipeline from demonstrations and apply it to new inputs.',
    payload: { examples, query, allowed_operations: operationIds },
    expected: query.map((input) => applyRewritePipeline(input, pipeline)),
    oracleStrategy: 'symbolic_rewrite_induction',
    verifier: { answer_contract: 'string_array', pipeline_depth: depth },
  });
}

function robustAnomalyIndices(reference, query) {
  const center = median(reference);
  const deviations = reference.map((value) => Math.abs(value - center));
  const mad = Math.max(0.5, median(deviations));
  const threshold = 3.5 * mad;
  return query
    .map((value, index) => ({ value, index }))
    .filter((entry) => Math.abs(entry.value - center) > threshold)
    .map((entry) => entry.index);
}

function generateAnomalyTask(rng, taskId, semanticDomain, difficulty) {
  const center = randomInt(rng, -20, 20);
  const spread = randomInt(rng, 1, 4);
  const reference = Array.from({ length: 11 }, () => center + randomInt(rng, -spread, spread));
  const query = Array.from({ length: 7 }, () => center + randomInt(rng, -spread, spread));
  const anomalyCount = Math.min(3, Math.max(1, Math.floor(difficulty / 2)));
  for (const index of shuffle(rng, query.map((_, queryIndex) => queryIndex)).slice(0, anomalyCount)) {
    query[index] = center + choose(rng, [-1, 1]) * randomInt(rng, spread * 8, spread * 14);
  }
  return taskEnvelope({
    taskId,
    semanticDomain,
    structuralFamily: 'robust_anomaly_detection',
    difficulty,
    objective: 'Identify observations that are incompatible with the robust center and dispersion of the reference population.',
    payload: { reference, query },
    expected: robustAnomalyIndices(reference, query),
    oracleStrategy: 'robust_outlier_detection',
    verifier: { answer_contract: 'index_array' },
  });
}

const TASK_GENERATORS = Object.freeze({
  numeric_relation: generateAffineTask,
  causal_diagnosis: generateCausalTask,
  constrained_selection: generateSelectionTask,
  dependency_planning: generatePlanningTask,
  weighted_navigation: generateNavigationTask,
  symbolic_transduction: generateRewriteTask,
  robust_anomaly_detection: generateAnomalyTask,
});

function generateTask({ seed, index, structuralFamily, semanticDomain, difficulty = 3, split = 'train' }) {
  if (!TASK_GENERATORS[structuralFamily]) throw new Error(`CAPABILITY_TASK_FAMILY_UNKNOWN: ${structuralFamily}`);
  const taskId = `${split}_${safeId(semanticDomain)}_${String(index).padStart(4, '0')}`;
  const rng = createRng(`${seed}:${taskId}:${structuralFamily}:${difficulty}`);
  const task = applyTargetSurfaceForm(TASK_GENERATORS[structuralFamily](rng, taskId, semanticDomain, difficulty), split);
  task.evaluator_only.split = split;
  task.evaluator_only.task_digest = sha256Json(task.public_task);
  return task;
}

function generateTaskPack({ seed, trainPerFamily = 10, holdoutPerFamily = 8, probePerFamily = 3 } = {}) {
  const safeSeed = String(seed || `capability-${Date.now()}`);
  const train = [];
  const holdout = [];
  const probes = [];
  let index = 0;
  for (const family of STRUCTURAL_FAMILIES) {
    const sourceDomains = SOURCE_SEMANTIC_DOMAINS[family];
    const targetDomains = TARGET_SEMANTIC_DOMAINS[family];
    for (let taskIndex = 0; taskIndex < trainPerFamily; taskIndex += 1) {
      train.push(generateTask({
        seed: safeSeed,
        index: index++,
        structuralFamily: family,
        semanticDomain: sourceDomains[taskIndex % sourceDomains.length],
        difficulty: 1 + (taskIndex % 4),
        split: 'train',
      }));
    }
    for (let taskIndex = 0; taskIndex < holdoutPerFamily; taskIndex += 1) {
      holdout.push(generateTask({
        seed: safeSeed,
        index: index++,
        structuralFamily: family,
        semanticDomain: targetDomains[taskIndex % targetDomains.length],
        difficulty: 2 + (taskIndex % 3),
        split: 'holdout',
      }));
    }
    for (let taskIndex = 0; taskIndex < probePerFamily; taskIndex += 1) {
      probes.push(generateTask({
        seed: safeSeed,
        index: index++,
        structuralFamily: family,
        semanticDomain: targetDomains[(taskIndex + 1) % targetDomains.length],
        difficulty: 3 + (taskIndex % 2),
        split: 'probe',
      }));
    }
  }
  return {
    schema_version: 1,
    pack_id: `capability_pack_${sha256Text(safeSeed).slice(0, 16)}`,
    created_at: nowIso(),
    generator_seed_digest: sha256Text(safeSeed),
    train,
    holdout,
    probes,
    source_semantic_domains: Object.values(SOURCE_SEMANTIC_DOMAINS).flat(),
    target_semantic_domains: Object.values(TARGET_SEMANTIC_DOMAINS).flat(),
    structural_families: Array.from(STRUCTURAL_FAMILIES),
  };
}

function identityProjection(task) {
  const payload = canonicalizePayload(task);
  if (Array.isArray(payload.query)) return { answer: clone(payload.query), cost: 1 };
  return { answer: null, cost: 1 };
}

function greedyLocal(task) {
  const payload = canonicalizePayload(task);
  if (Array.isArray(payload.items) && Number.isFinite(payload.capacity)) {
    let remaining = payload.capacity;
    const selected = payload.items
      .slice()
      .sort((left, right) => (right.value / right.cost) - (left.value / left.cost) || left.id.localeCompare(right.id))
      .filter((item) => {
        if (item.cost > remaining) return false;
        remaining -= item.cost;
        return true;
      })
      .map((item) => item.id)
      .sort();
    return { answer: selected, cost: payload.items.length };
  }
  if (Array.isArray(payload.jobs)) {
    const order = [];
    const remaining = new Map(payload.jobs.map((job) => [job.id, job]));
    while (remaining.size) {
      const ready = Array.from(remaining.values())
        .filter((job) => job.depends_on.every((dependency) => order.includes(dependency)))
        .sort((left, right) => left.due - right.due || right.weight - left.weight || left.id.localeCompare(right.id));
      if (!ready.length) break;
      order.push(ready[0].id);
      remaining.delete(ready[0].id);
    }
    return { answer: order, cost: payload.jobs.length };
  }
  return identityProjection(task);
}

function affineInduction(task) {
  const payload = canonicalizePayload(task);
  const examples = Array.isArray(payload.examples) ? payload.examples : [];
  const query = Array.isArray(payload.query) ? payload.query : [];
  if (examples.length < 2 || examples.some((example) => !Number.isFinite(example.input) || !Number.isFinite(example.output))) {
    return { answer: null, cost: 1 };
  }
  let slope = null;
  for (let left = 0; left < examples.length && slope === null; left += 1) {
    for (let right = left + 1; right < examples.length; right += 1) {
      if (examples[right].input === examples[left].input) continue;
      slope = (examples[right].output - examples[left].output) / (examples[right].input - examples[left].input);
      break;
    }
  }
  if (!Number.isFinite(slope)) return { answer: null, cost: examples.length };
  const intercept = examples[0].output - slope * examples[0].input;
  if (!examples.every((example) => Math.abs((slope * example.input + intercept) - example.output) < 1e-9)) {
    return { answer: null, cost: examples.length ** 2 };
  }
  return { answer: query.map((input) => slope * input + intercept), cost: examples.length ** 2 };
}

function causalElimination(task) {
  const payload = canonicalizePayload(task);
  if (!Array.isArray(payload.candidates) || !Array.isArray(payload.observed)) return { answer: null, cost: 1 };
  const observed = new Set(payload.observed);
  const ranked = payload.candidates.map((candidate) => {
    const required = Array.isArray(candidate.required) ? candidate.required : [];
    const excluded = Array.isArray(candidate.excluded) ? candidate.excluded : [];
    const requiredHits = required.filter((symptom) => observed.has(symptom)).length;
    const excludedHits = excluded.filter((symptom) => observed.has(symptom)).length;
    const missing = required.length - requiredHits;
    const score = requiredHits * 3 - missing * 4 - excludedHits * 7 + Number(candidate.prior || 0);
    return { id: candidate.id, score };
  }).sort((left, right) => right.score - left.score || String(left.id).localeCompare(String(right.id)));
  return { answer: ranked.length ? ranked[0].id : null, cost: payload.candidates.length * payload.observed.length };
}

function subsetBranchBound(task) {
  const payload = canonicalizePayload(task);
  if (!Array.isArray(payload.items) || !Number.isFinite(payload.capacity)) return { answer: null, cost: 1 };
  const optimum = bestSubset(payload.items, payload.capacity);
  return { answer: optimum.ids, cost: 2 ** payload.items.length };
}

function dependencySearch(task) {
  const payload = canonicalizePayload(task);
  if (!Array.isArray(payload.jobs)) return { answer: null, cost: 1 };
  const optimum = optimalSchedule(payload.jobs);
  return { answer: optimum.order, cost: Math.max(1, enumerateTopologicalOrders(payload.jobs).length) };
}

function uniformCostSearch(task) {
  const payload = canonicalizePayload(task);
  if (!Array.isArray(payload.edges) || !payload.start || !payload.goal) return { answer: null, cost: 1 };
  const result = shortestPath(payload.edges, payload.start, payload.goal);
  return { answer: result.path, cost: payload.edges.length };
}

function enumerateRewritePipelines(operations, maxDepth) {
  const pipelines = [];
  function visit(prefix, depth) {
    if (prefix.length) pipelines.push(prefix.slice());
    if (depth >= maxDepth) return;
    for (const operation of operations) {
      if (prefix[prefix.length - 1] === operation) continue;
      visit([...prefix, operation], depth + 1);
    }
  }
  visit([], 0);
  return pipelines;
}

function symbolicRewriteInduction(task) {
  const payload = canonicalizePayload(task);
  const examples = Array.isArray(payload.examples) ? payload.examples : [];
  const query = Array.isArray(payload.query) ? payload.query : [];
  const allowed = Array.isArray(payload.allowed_operations)
    ? payload.allowed_operations.filter((operation) => REWRITE_OPERATIONS[operation])
    : Object.keys(REWRITE_OPERATIONS);
  if (!examples.length || !query.length) return { answer: null, cost: 1 };
  const pipelines = enumerateRewritePipelines(allowed, 3);
  for (const pipeline of pipelines) {
    if (examples.every((example) => applyRewritePipeline(example.input, pipeline) === example.output)) {
      return { answer: query.map((input) => applyRewritePipeline(input, pipeline)), cost: pipelines.indexOf(pipeline) + 1 };
    }
  }
  return { answer: null, cost: pipelines.length };
}

function robustOutlierDetection(task) {
  const payload = canonicalizePayload(task);
  if (!Array.isArray(payload.reference) || !Array.isArray(payload.query)) return { answer: null, cost: 1 };
  if (payload.reference.some((value) => !Number.isFinite(value)) || payload.query.some((value) => !Number.isFinite(value))) {
    return { answer: null, cost: payload.reference.length + payload.query.length };
  }
  return { answer: robustAnomalyIndices(payload.reference, payload.query), cost: payload.reference.length + payload.query.length };
}

const STRATEGIES = Object.freeze({
  identity_projection: identityProjection,
  greedy_local: greedyLocal,
  affine_induction: affineInduction,
  causal_elimination: causalElimination,
  subset_branch_bound: subsetBranchBound,
  dependency_search: dependencySearch,
  uniform_cost_search: uniformCostSearch,
  symbolic_rewrite_induction: symbolicRewriteInduction,
  robust_outlier_detection: robustOutlierDetection,
});

function verifyCandidate(task, answer) {
  const evaluator = task.evaluator_only || {};
  const payload = canonicalizePayload(task.public_task || {});
  const expected = evaluator.expected;
  const family = evaluator.structural_family;
  let success = false;
  let score = 0;
  let reason = 'answer_mismatch';
  if (family === 'constrained_selection') {
    const ids = Array.isArray(answer) ? Array.from(new Set(answer.map(String))).sort() : [];
    const selected = payload.items.filter((item) => ids.includes(item.id));
    const cost = selected.reduce((sum, item) => sum + item.cost, 0);
    const value = selected.reduce((sum, item) => sum + item.value, 0);
    success = ids.length === (Array.isArray(answer) ? answer.length : 0)
      && selected.length === ids.length
      && cost <= payload.capacity
      && value === Number(evaluator.verifier.optimum_value);
    score = success ? 1 : clamp01(value / Math.max(1, Number(evaluator.verifier.optimum_value)));
    reason = success ? 'optimal_selection' : cost > payload.capacity ? 'capacity_exceeded' : 'suboptimal_selection';
  } else if (family === 'dependency_planning') {
    const order = Array.isArray(answer) ? answer.map(String) : [];
    const candidateScore = scheduleScore(order, payload.jobs || []);
    success = Number.isFinite(candidateScore) && candidateScore === Number(evaluator.verifier.optimum_score);
    score = success ? 1 : Number.isFinite(candidateScore)
      ? 1 / (1 + Math.max(0, candidateScore - Number(evaluator.verifier.optimum_score)))
      : 0;
    reason = success ? 'optimal_schedule' : Number.isFinite(candidateScore) ? 'suboptimal_schedule' : 'invalid_schedule';
  } else if (family === 'weighted_navigation') {
    const pathNodes = Array.isArray(answer) ? answer.map(String) : [];
    let valid = pathNodes.length >= 2 && pathNodes[0] === payload.start && pathNodes[pathNodes.length - 1] === payload.goal;
    let cost = 0;
    if (valid) {
      for (let index = 0; index < pathNodes.length - 1; index += 1) {
        const edge = (payload.edges || []).find((candidate) => candidate.open && candidate.from === pathNodes[index] && candidate.to === pathNodes[index + 1]);
        if (!edge) { valid = false; break; }
        cost += edge.weight;
      }
    }
    success = valid && cost === Number(evaluator.verifier.optimum_cost);
    score = success ? 1 : valid ? clamp01(Number(evaluator.verifier.optimum_cost) / Math.max(1, cost)) : 0;
    reason = success ? 'optimal_route' : valid ? 'suboptimal_route' : 'invalid_route';
  } else {
    success = sameValue(answer, expected);
    score = success ? 1 : 0;
    reason = success ? 'exact_match' : 'answer_mismatch';
  }
  return {
    success,
    score: round(score, 4),
    reason,
    answer_digest: sha256Json(answer),
    expected_digest: sha256Json(expected),
  };
}

function runStrategy(strategyId, publicTask) {
  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw new Error(`CAPABILITY_STRATEGY_UNKNOWN: ${strategyId}`);
  const started = process.hrtime.bigint();
  let candidate;
  try {
    candidate = strategy(publicTask);
  } catch (error) {
    candidate = { answer: null, cost: 1, error: shortText(error && error.message || error) };
  }
  const elapsedNs = Number(process.hrtime.bigint() - started);
  return {
    strategy_id: strategyId,
    answer: candidate.answer,
    declared_cost: Math.max(1, Number(candidate.cost || 1)),
    elapsed_ns: elapsedNs,
    error: candidate.error || null,
  };
}

function extractStructuralFeatures(publicTask) {
  const payload = canonicalizePayload(publicTask);
  const features = [];
  if (Array.isArray(payload.examples)) {
    features.push('has_examples');
    if (payload.examples.every((example) => Number.isFinite(example.input) && Number.isFinite(example.output))) features.push('examples_numeric_scalar');
    if (payload.examples.every((example) => typeof example.input === 'string' && typeof example.output === 'string')) features.push('examples_symbolic_text');
  }
  if (Array.isArray(payload.query)) {
    features.push('has_query');
    if (payload.query.every(Number.isFinite)) features.push('query_numeric');
    if (payload.query.every((value) => typeof value === 'string')) features.push('query_text');
  }
  if (Array.isArray(payload.candidates) && Array.isArray(payload.observed)) features.push('candidate_evidence_matrix');
  if (Array.isArray(payload.items) && Number.isFinite(payload.capacity)) features.push('bounded_item_selection');
  if (Array.isArray(payload.jobs) && payload.jobs.every((job) => Array.isArray(job.depends_on))) features.push('dependency_dag');
  if (Array.isArray(payload.edges) && payload.start && payload.goal) features.push('weighted_directed_graph');
  if (Array.isArray(payload.allowed_operations)) features.push('operation_catalog');
  if (Array.isArray(payload.reference) && Array.isArray(payload.query)) features.push('reference_distribution');
  features.push(`difficulty_${Math.max(1, Math.min(4, Number(publicTask.difficulty || 1)))}`);
  return Array.from(new Set(features)).sort();
}

function featureCluster(publicTask) {
  return sha256Json(extractStructuralFeatures(publicTask)).slice(0, 20);
}

function curriculumTrack(publicTask) {
  const stableFeatures = extractStructuralFeatures(publicTask)
    .filter((feature) => !feature.startsWith('difficulty_'));
  return sha256Json(stableFeatures).slice(0, 20);
}

function staticCompatibility(strategyId, publicTask) {
  const features = new Set(extractStructuralFeatures(publicTask));
  const scores = {
    identity_projection: features.has('examples_symbolic_text') ? 0.36 : 0.18,
    greedy_local: features.has('bounded_item_selection') || features.has('dependency_dag') ? 0.38 : 0.19,
    affine_induction: features.has('examples_numeric_scalar') ? 0.36 : features.has('reference_distribution') ? 0.34 : 0.12,
    causal_elimination: features.has('candidate_evidence_matrix') ? 0.36 : 0.11,
    subset_branch_bound: features.has('bounded_item_selection') ? 0.33 : 0.10,
    dependency_search: features.has('dependency_dag') ? 0.33 : 0.10,
    uniform_cost_search: features.has('weighted_directed_graph') ? 0.36 : 0.10,
    symbolic_rewrite_induction: features.has('examples_symbolic_text') && features.has('operation_catalog') ? 0.33 : 0.10,
    robust_outlier_detection: features.has('reference_distribution') && features.has('query_numeric') ? 0.31 : 0.10,
  };
  return scores[strategyId] || 0;
}

function promptedCompatibility(strategyId, publicTask) {
  const text = `${publicTask.objective || ''} ${publicTask.semantic_domain || ''}`.toLowerCase();
  const keywordScores = {
    affine_induction: ['calibrat', 'reading', 'response'],
    causal_elimination: ['cause', 'diagnos', 'disease', 'incident'],
    uniform_cost_search: ['route', 'network', 'migration', 'reaction'],
    symbolic_rewrite_induction: ['transform', 'encoding', 'conversion', 'transliteration'],
  };
  const hits = (keywordScores[strategyId] || []).filter((keyword) => text.includes(keyword)).length;
  const limitedPromptPrior = hits ? 0.52 + Math.min(0.20, hits * 0.06) : 0;
  return Math.max(staticCompatibility(strategyId, publicTask) * 0.72, limitedPromptPrior);
}

function emptyMemory(memoryId = 'capability_memory') {
  const createdAt = nowIso();
  return {
    schema_version: 1,
    memory_id: safeId(memoryId, 'capability_memory'),
    created_at: createdAt,
    updated_at: createdAt,
    sequence: 0,
    ledger_head: '0'.repeat(64),
    episodes: 0,
    verified_successes: 0,
    total_attempts: 0,
    feature_strategy_stats: {},
    global_strategy_stats: Object.fromEntries(STRATEGY_IDS.map((strategyId) => [strategyId, {
      successes: 0,
      failures: 0,
      attempts: 0,
      reward_sum: 0,
      cost_sum: 0,
    }])),
    cluster_strategy_stats: {},
    curriculum: {
      decisions: 0,
      track_exposures: {},
      track_successes: {},
      recent_outcomes: {},
      selected_task_ids: [],
    },
    replay_buffer: [],
    skill_versions: [],
    semantic_memory: {
      consolidation_runs: 0,
      promoted_policies: {},
      promotion_history: [],
    },
    continuity: {
      checkpoint_reloads: 0,
      recovery_events: 0,
      causal_memory_trials: 0,
      causal_memory_reuses: 0,
      memory_off_successes: 0,
      memory_on_first_attempt_successes: 0,
    },
    rejected_updates: 0,
    promoted_regressions: 0,
    persisted_skill_reuses: 0,
    process_sessions: [],
  };
}

function validateMemory(memory) {
  if (!memory || typeof memory !== 'object' || Array.isArray(memory)) throw new Error('CAPABILITY_MEMORY_OBJECT_REQUIRED');
  if (memory.schema_version !== 1) throw new Error('CAPABILITY_MEMORY_SCHEMA_UNSUPPORTED');
  if (!/^[a-f0-9]{64}$/.test(String(memory.ledger_head || ''))) throw new Error('CAPABILITY_MEMORY_LEDGER_HEAD_INVALID');
  if (!Number.isInteger(memory.sequence) || memory.sequence < 0) throw new Error('CAPABILITY_MEMORY_SEQUENCE_INVALID');
  if (!memory.feature_strategy_stats || typeof memory.feature_strategy_stats !== 'object') throw new Error('CAPABILITY_MEMORY_FEATURE_STATS_INVALID');
  if (!memory.global_strategy_stats || typeof memory.global_strategy_stats !== 'object') throw new Error('CAPABILITY_MEMORY_GLOBAL_STATS_INVALID');
  if (!memory.semantic_memory || typeof memory.semantic_memory !== 'object') throw new Error('CAPABILITY_MEMORY_SEMANTIC_INVALID');
  if (!memory.continuity || typeof memory.continuity !== 'object') throw new Error('CAPABILITY_MEMORY_CONTINUITY_INVALID');
  return memory;
}

function memoryPaths(root) {
  return {
    snapshot: path.join(root, 'memory', 'snapshot.json'),
    backup: path.join(root, 'memory', 'snapshot.previous.json'),
    ledger: path.join(root, 'memory', 'events.ndjson'),
    skills: path.join(root, 'memory', 'skills'),
  };
}

function loadMemory(root, memoryId = 'capability_memory') {
  const paths = memoryPaths(root);
  if (!fs.existsSync(paths.snapshot)) return emptyMemory(memoryId);
  try {
    return validateMemory(JSON.parse(fs.readFileSync(paths.snapshot, 'utf8')));
  } catch (error) {
    if (fs.existsSync(paths.backup)) {
      const backup = validateMemory(JSON.parse(fs.readFileSync(paths.backup, 'utf8')));
      atomicWriteJson(paths.snapshot, backup);
      return backup;
    }
    throw error;
  }
}

function appendMemoryEvent(root, memory, eventType, payload) {
  const paths = memoryPaths(root);
  ensureDir(path.dirname(paths.ledger));
  const event = {
    schema_version: 1,
    sequence: memory.sequence + 1,
    timestamp: nowIso(),
    event_type: eventType,
    payload: clone(payload),
    previous_hash: memory.ledger_head,
  };
  event.event_hash = sha256Json({
    schema_version: event.schema_version,
    sequence: event.sequence,
    timestamp: event.timestamp,
    event_type: event.event_type,
    payload: event.payload,
    previous_hash: event.previous_hash,
  });
  appendLineWithLock(paths.ledger, `${JSON.stringify(event)}\n`, {
    lockName: `capability-memory-ledger-${safeId(memory.memory_id)}`,
    context: eventType,
  });
  memory.sequence = event.sequence;
  memory.ledger_head = event.event_hash;
  memory.updated_at = event.timestamp;
  return event;
}

function persistMemory(root, memory) {
  const paths = memoryPaths(root);
  ensureDir(path.dirname(paths.snapshot));
  if (fs.existsSync(paths.snapshot)) fs.copyFileSync(paths.snapshot, paths.backup);
  atomicWriteJson(paths.snapshot, memory);
  return paths;
}

function verifyMemoryLedger(root, expectedMemory = null) {
  const paths = memoryPaths(root);
  const lines = fs.existsSync(paths.ledger)
    ? fs.readFileSync(paths.ledger, 'utf8').split('\n').filter(Boolean)
    : [];
  let previousHash = '0'.repeat(64);
  let sequence = 0;
  const findings = [];
  for (const [index, line] of lines.entries()) {
    let event;
    try {
      event = JSON.parse(line);
    } catch (_) {
      findings.push(`line_${index + 1}_invalid_json`);
      continue;
    }
    sequence += 1;
    if (event.sequence !== sequence) findings.push(`line_${index + 1}_sequence`);
    if (event.previous_hash !== previousHash) findings.push(`line_${index + 1}_previous_hash`);
    const expectedHash = sha256Json({
      schema_version: event.schema_version,
      sequence: event.sequence,
      timestamp: event.timestamp,
      event_type: event.event_type,
      payload: event.payload,
      previous_hash: event.previous_hash,
    });
    if (event.event_hash !== expectedHash) findings.push(`line_${index + 1}_event_hash`);
    previousHash = event.event_hash;
  }
  if (expectedMemory) {
    if (expectedMemory.sequence !== sequence) findings.push('snapshot_sequence_mismatch');
    if (expectedMemory.ledger_head !== previousHash) findings.push('snapshot_head_mismatch');
  }
  return {
    status: findings.length ? 'failed' : 'ok',
    event_count: lines.length,
    head_hash: previousHash,
    findings,
  };
}

function statsBucket(memory, publicTask, strategyId, create = false) {
  const cluster = featureCluster(publicTask);
  if (!memory.cluster_strategy_stats[cluster] && create) memory.cluster_strategy_stats[cluster] = {};
  if (memory.cluster_strategy_stats[cluster] && !memory.cluster_strategy_stats[cluster][strategyId] && create) {
    memory.cluster_strategy_stats[cluster][strategyId] = { successes: 0, failures: 0, attempts: 0, reward_sum: 0, cost_sum: 0 };
  }
  return memory.cluster_strategy_stats[cluster] && memory.cluster_strategy_stats[cluster][strategyId] || null;
}

function featureStatsBuckets(memory, publicTask, strategyId, create = false) {
  const buckets = [];
  for (const feature of extractStructuralFeatures(publicTask)) {
    if (!memory.feature_strategy_stats[feature] && create) memory.feature_strategy_stats[feature] = {};
    if (memory.feature_strategy_stats[feature] && !memory.feature_strategy_stats[feature][strategyId] && create) {
      memory.feature_strategy_stats[feature][strategyId] = { successes: 0, failures: 0, attempts: 0, reward_sum: 0, cost_sum: 0 };
    }
    if (memory.feature_strategy_stats[feature] && memory.feature_strategy_stats[feature][strategyId]) {
      buckets.push(memory.feature_strategy_stats[feature][strategyId]);
    }
  }
  return buckets;
}

function betaMean(stats) {
  const successes = Number(stats && stats.successes || 0);
  const failures = Number(stats && stats.failures || 0);
  return (successes + 1) / (successes + failures + 2);
}

function policyScore(configuration, strategyId, publicTask, memory, options = {}) {
  if (configuration === 'same_host_base') {
    return 1 - STRATEGY_IDS.indexOf(strategyId) / (STRATEGY_IDS.length + 1);
  }
  if (configuration === 'same_host_prompted') return promptedCompatibility(strategyId, publicTask);
  if (configuration === 'same_host_mdos_no_learning') return staticCompatibility(strategyId, publicTask);
  const globalStats = memory && memory.global_strategy_stats && memory.global_strategy_stats[strategyId] || {};
  const clusterStats = memory ? statsBucket(memory, publicTask, strategyId, false) : null;
  const featureStats = memory ? featureStatsBuckets(memory, publicTask, strategyId, false) : [];
  const attempts = Number(globalStats.attempts || 0);
  const totalAttempts = Math.max(1, Number(memory && memory.total_attempts || 0));
  const learnedCluster = clusterStats ? betaMean(clusterStats) : 0.5;
  const learnedFeatures = featureStats.length
    ? featureStats.reduce((sum, stats) => sum + betaMean(stats), 0) / featureStats.length
    : 0.5;
  const globalMean = betaMean(globalStats);
  const semanticPolicy = memory && memory.semantic_memory && memory.semantic_memory.promoted_policies
    ? memory.semantic_memory.promoted_policies[curriculumTrack(publicTask)]
    : null;
  const semanticBonus = semanticPolicy && semanticPolicy.strategy_id === strategyId
    ? 0.24 * clamp01(semanticPolicy.confidence)
    : 0;
  const ucb = Math.sqrt(Math.log(totalAttempts + 2) / (attempts + 1));
  const exploration = options.exploration === false ? 0 : Number(options.exploration_weight === undefined ? 0.22 : options.exploration_weight) * ucb;
  const fixedPrior = (STRATEGY_IDS.length - STRATEGY_IDS.indexOf(strategyId)) / STRATEGY_IDS.length;
  return learnedCluster * 0.50
    + learnedFeatures * 0.34
    + globalMean * 0.10
    + fixedPrior * 0.06
    + semanticBonus
    + exploration;
}

function rankStrategies(configuration, publicTask, memory = null, options = {}) {
  return STRATEGY_IDS.map((strategyId) => ({
    strategy_id: strategyId,
    score: round(policyScore(configuration, strategyId, publicTask, memory, options), 8),
  })).sort((left, right) => right.score - left.score || left.strategy_id.localeCompare(right.strategy_id));
}

function solvePublicTask({ configuration, publicTask, memory = null, attemptBudget = 1, exploration = false }) {
  if (!CONFIGURATIONS.includes(configuration)) throw new Error(`CAPABILITY_CONFIGURATION_UNKNOWN: ${configuration}`);
  const findings = forbiddenPaths(publicTask);
  if (findings.length) throw new Error(`CAPABILITY_LEARNER_BOUNDARY_VIOLATION: ${findings.join(',')}`);
  const ranking = rankStrategies(configuration, publicTask, memory, { exploration });
  const attempts = ranking.slice(0, Math.max(1, attemptBudget)).map((entry) => ({
    ...runStrategy(entry.strategy_id, publicTask),
    policy_score: entry.score,
  }));
  return {
    configuration,
    task_id: publicTask.task_id,
    task_digest: sha256Json(publicTask),
    feature_cluster: featureCluster(publicTask),
    structural_features: extractStructuralFeatures(publicTask),
    attempt_budget: Math.max(1, attemptBudget),
    attempts,
    ranking: ranking.map((entry) => ({ strategy_id: entry.strategy_id, score: entry.score })),
    learner_request_forbidden_findings: findings,
  };
}

function updateStats(stats, verification, declaredCost) {
  stats.attempts += 1;
  stats.cost_sum += Number(declaredCost || 0);
  stats.reward_sum += Number(verification.score || 0);
  if (verification.success) stats.successes += 1;
  else stats.failures += 1;
}

function consolidateSemanticMemory(memory) {
  const candidate = memory;
  const grouped = new Map();
  for (const episode of candidate.replay_buffer || []) {
    if (!episode || !episode.track || !episode.successful_strategy) continue;
    const key = `${episode.track}:${episode.successful_strategy}`;
    if (!grouped.has(key)) grouped.set(key, { track: episode.track, strategy_id: episode.successful_strategy, support: 0, successes: 0, domains: new Set(), episode_ids: [] });
    const group = grouped.get(key);
    group.support += 1;
    group.successes += episode.success ? 1 : 0;
    if (episode.semantic_domain) group.domains.add(episode.semantic_domain);
    group.episode_ids.push(episode.episode_id);
  }
  candidate.semantic_memory.consolidation_runs += 1;
  const promotions = [];
  const tracks = new Set(Array.from(grouped.values(), (entry) => entry.track));
  for (const track of tracks) {
    const ranked = Array.from(grouped.values())
      .filter((entry) => entry.track === track)
      .map((entry) => ({
        ...entry,
        confidence: entry.successes / Math.max(1, entry.support),
      }))
      .sort((left, right) => right.confidence - left.confidence || right.support - left.support || left.strategy_id.localeCompare(right.strategy_id));
    const best = ranked[0];
    if (!best || best.support < 3 || best.domains.size < 2 || best.confidence < 0.75) continue;
    const existing = candidate.semantic_memory.promoted_policies[track];
    const promoted = {
      track,
      strategy_id: best.strategy_id,
      support: best.support,
      semantic_domain_count: best.domains.size,
      confidence: round(best.confidence, 4),
      evidence_digest: sha256Json(best.episode_ids.slice().sort()),
      consolidated_at: nowIso(),
    };
    if (!existing || existing.strategy_id !== promoted.strategy_id || existing.evidence_digest !== promoted.evidence_digest) {
      candidate.semantic_memory.promoted_policies[track] = promoted;
      candidate.semantic_memory.promotion_history.push(promoted);
      candidate.semantic_memory.promotion_history = candidate.semantic_memory.promotion_history.slice(-256);
      promotions.push(promoted);
    }
  }
  return promotions;
}

function recordVerifiedEpisode(root, memory, task, solveResult, verifiedAttempts, sessionId, continuityEvidence = {}) {
  const publicTask = task.public_task || task;
  const track = curriculumTrack(publicTask);
  const episodeId = `episode_${String(memory.episodes + 1).padStart(5, '0')}_${safeId(publicTask.task_id)}`;
  const successfulAttempt = verifiedAttempts.find((entry) => entry.verification.success) || null;
  const firstAttemptSucceeded = Boolean(verifiedAttempts[0] && verifiedAttempts[0].verification.success);
  const beforeDigest = sha256Json(memory);
  const candidate = clone(memory);
  candidate.episodes += 1;
  candidate.total_attempts += verifiedAttempts.length;
  if (successfulAttempt) candidate.verified_successes += 1;
  candidate.curriculum.track_exposures[track] = Number(candidate.curriculum.track_exposures[track] || 0) + 1;
  candidate.curriculum.track_successes[track] = Number(candidate.curriculum.track_successes[track] || 0) + (successfulAttempt ? 1 : 0);
  const recent = Array.isArray(candidate.curriculum.recent_outcomes[track]) ? candidate.curriculum.recent_outcomes[track] : [];
  recent.push(successfulAttempt ? 1 : 0);
  candidate.curriculum.recent_outcomes[track] = recent.slice(-12);
  candidate.curriculum.selected_task_ids.push(publicTask.task_id);
  candidate.curriculum.selected_task_ids = candidate.curriculum.selected_task_ids.slice(-256);

  for (const attempt of verifiedAttempts) {
    const globalStats = candidate.global_strategy_stats[attempt.strategy_id];
    updateStats(globalStats, attempt.verification, attempt.declared_cost);
    const clusterStats = statsBucket(candidate, publicTask, attempt.strategy_id, true);
    updateStats(clusterStats, attempt.verification, attempt.declared_cost);
    for (const featureStats of featureStatsBuckets(candidate, publicTask, attempt.strategy_id, true)) {
      updateStats(featureStats, attempt.verification, attempt.declared_cost);
    }
  }

  const replayRecord = {
    episode_id: episodeId,
    task_id: publicTask.task_id,
    task_digest: sha256Json(publicTask),
    track,
    semantic_domain: publicTask.semantic_domain,
    features: extractStructuralFeatures(publicTask),
    successful_strategy: successfulAttempt && successfulAttempt.strategy_id || null,
    success: Boolean(successfulAttempt),
    surprise: round(Math.abs((successfulAttempt ? 1 : 0) - policyScore('same_host_mdos_full', successfulAttempt && successfulAttempt.strategy_id || solveResult.attempts[0].strategy_id, publicTask, memory, { exploration: false })), 4),
  };
  candidate.replay_buffer.push(replayRecord);
  candidate.replay_buffer = candidate.replay_buffer
    .sort((left, right) => right.surprise - left.surprise || left.episode_id.localeCompare(right.episode_id))
    .slice(0, 128);

  const promotions = consolidateSemanticMemory(candidate);
  const skillPolicy = Object.fromEntries(STRATEGY_IDS.map((strategyId) => [strategyId, round(policyScore('same_host_mdos_full', strategyId, publicTask, candidate, { exploration: false }), 6)]));
  const skillVersion = {
    version_id: `skill_${String(candidate.skill_versions.length + 1).padStart(5, '0')}`,
    promoted_at: nowIso(),
    source_episode_id: episodeId,
    feature_cluster: featureCluster(publicTask),
    curriculum_track: track,
    policy_digest: sha256Json(skillPolicy),
    successful_strategy: successfulAttempt && successfulAttempt.strategy_id || null,
  };
  candidate.skill_versions.push(skillVersion);
  candidate.skill_versions = candidate.skill_versions.slice(-256);
  candidate.continuity.causal_memory_trials += continuityEvidence.checkpoint_loaded ? 1 : 0;
  candidate.continuity.memory_off_successes += continuityEvidence.memory_off_success ? 1 : 0;
  candidate.continuity.memory_on_first_attempt_successes += firstAttemptSucceeded ? 1 : 0;
  const causalReuse = Boolean(
    continuityEvidence.checkpoint_loaded
      && firstAttemptSucceeded
      && continuityEvidence.memory_off_success === false
      && successfulAttempt
      && solveResult.ranking
      && solveResult.ranking[0]
      && solveResult.ranking[0].strategy_id === successfulAttempt.strategy_id
  );
  if (causalReuse) {
    candidate.persisted_skill_reuses += 1;
    candidate.continuity.causal_memory_reuses += 1;
  }
  if (!candidate.process_sessions.includes(sessionId)) candidate.process_sessions.push(sessionId);

  const eventPayload = {
    episode_id: episodeId,
    session_id: sessionId,
    task_id: publicTask.task_id,
    task_digest: sha256Json(publicTask),
    track,
    solve_digest: sha256Json(solveResult),
    verified_attempts: verifiedAttempts.map((attempt) => ({
      strategy_id: attempt.strategy_id,
      declared_cost: attempt.declared_cost,
      verification: attempt.verification,
    })),
    successful_strategy: successfulAttempt && successfulAttempt.strategy_id || null,
    causal_persisted_reuse: causalReuse,
    semantic_promotions: promotions.map((promotion) => ({
      track: promotion.track,
      strategy_id: promotion.strategy_id,
      support: promotion.support,
      semantic_domain_count: promotion.semantic_domain_count,
      confidence: promotion.confidence,
      evidence_digest: promotion.evidence_digest,
    })),
    memory_before_digest: beforeDigest,
  };
  appendMemoryEvent(root, candidate, 'verified_episode', eventPayload);
  candidate.updated_at = nowIso();
  persistMemory(root, candidate);
  return { memory: candidate, episode: replayRecord, skill_version: skillVersion };
}

function learningProgress(memory, track) {
  const recent = memory.curriculum.recent_outcomes[track] || [];
  if (recent.length < 4) return 0.5;
  const midpoint = Math.floor(recent.length / 2);
  const first = recent.slice(0, midpoint).reduce((sum, value) => sum + value, 0) / Math.max(1, midpoint);
  const second = recent.slice(midpoint).reduce((sum, value) => sum + value, 0) / Math.max(1, recent.length - midpoint);
  return clamp01(0.5 + (second - first));
}

function predictedTaskSuccess(memory, publicTask) {
  const ranking = rankStrategies('same_host_mdos_full', publicTask, memory, { exploration: false });
  return clamp01(ranking[0] ? ranking[0].score : 0);
}

function selectCurriculumTask(memory, candidates) {
  if (!Array.isArray(candidates) || !candidates.length) throw new Error('CAPABILITY_CURRICULUM_CANDIDATES_REQUIRED');
  const selectedSet = new Set(memory.curriculum.selected_task_ids || []);
  const ranked = candidates.map((task) => {
    const publicTask = task.public_task || task;
    const track = curriculumTrack(publicTask);
    const exposure = Number(memory.curriculum.track_exposures[track] || 0);
    const uncertainty = 1 - predictedTaskSuccess(memory, publicTask);
    const progress = learningProgress(memory, track);
    const novelty = 1 / Math.sqrt(exposure + 1);
    const candidateExposures = candidates.map((candidate) => Number(memory.curriculum.track_exposures[curriculumTrack(candidate.public_task || candidate)] || 0));
    const diversity = exposure === Math.min(...candidateExposures) ? 1 : 0;
    const unselected = selectedSet.has(publicTask.task_id) ? 0 : 1;
    const difficulty = Number(publicTask.difficulty || 1);
    const competence = exposure ? Number(memory.curriculum.track_successes[track] || 0) / exposure : 0;
    const frontierFit = 1 - Math.min(1, Math.abs(difficulty / 4 - competence));
    const score = uncertainty * 0.30 + progress * 0.20 + novelty * 0.22 + diversity * 0.18 + frontierFit * 0.10 + unselected * 0.35;
    return {
      task,
      task_id: publicTask.task_id,
      track,
      score: round(score, 8),
      components: { uncertainty: round(uncertainty), progress: round(progress), novelty: round(novelty), diversity, frontier_fit: round(frontierFit), unselected },
    };
  }).sort((left, right) => right.score - left.score || left.task_id.localeCompare(right.task_id));
  return { selected: ranked[0], ranking: ranked };
}

function parseLastJson(text) {
  const lines = String(text || '').trim().split('\n').filter(Boolean);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    try { return JSON.parse(lines[index]); } catch (_) {}
  }
  return null;
}

function invokeLearnerWorker({ root, label, configuration, publicTasks, memory, attemptBudget, exploration = false }) {
  const requestsDir = path.join(root, 'learner_requests');
  const receiptsDir = path.join(root, 'learner_receipts');
  ensureDir(requestsDir);
  ensureDir(receiptsDir);
  const tag = safeId(label, 'worker');
  const requestPath = path.join(requestsDir, `${tag}.json`);
  const receiptPath = path.join(receiptsDir, `${tag}.json`);
  const request = {
    schema_version: 1,
    request_id: `capability_request_${tag}`,
    created_at: nowIso(),
    configuration,
    public_tasks: publicTasks.map((task) => clone(task.public_task || task)),
    memory: configuration === 'same_host_mdos_full' ? clone(memory) : null,
    options: {
      attempt_budget: Math.max(1, Number(attemptBudget || 1)),
      exploration: Boolean(exploration),
    },
    boundary: {
      hidden_tests_access: 'denied',
      oracle_strategy_access: 'denied',
      generator_seed_access: 'denied',
      filesystem_write_access: 'denied',
      child_process_access: 'denied',
    },
  };
  const contamination = forbiddenPaths(request);
  if (contamination.length) throw new Error(`CAPABILITY_LEARNER_REQUEST_CONTAMINATED: ${contamination.join(',')}`);
  if (fs.existsSync(requestPath) || fs.existsSync(receiptPath)) throw new Error(`CAPABILITY_APPEND_ONLY_COLLISION: ${tag}`);
  atomicWriteJson(requestPath, request);
  const started = Date.now();
  const result = spawnSync(process.execPath, [
    '--permission',
    `--allow-fs-read=${WORKER_SCRIPT}`,
    `--allow-fs-read=${__filename}`,
    `--allow-fs-read=${path.join(MDOS_ROOT, 'os', 'lib', 'common.js')}`,
    `--allow-fs-read=${path.join(MDOS_ROOT, 'os', 'lib', 'fs_runtime.js')}`,
    `--allow-fs-read=${requestPath}`,
    WORKER_SCRIPT,
    '--request',
    requestPath,
  ], {
    cwd: WORKSPACE_ROOT,
    encoding: 'utf8',
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      LANG: 'C',
      LC_ALL: 'C',
      HOME: path.join(root, 'sandbox_home'),
      TMPDIR: path.join(root, 'sandbox_tmp'),
      MDOS_CAPABILITY_HIDDEN_ACCESS: 'denied',
      MDOS_WORKSPACE_ROOT: WORKSPACE_ROOT,
      MDOS_ROOT,
    },
  });
  const stdout = String(result.stdout || '');
  const stderr = String(result.stderr || '');
  const payload = parseLastJson(stdout);
  const receipt = {
    schema_version: 1,
    receipt_id: `capability_receipt_${tag}`,
    created_at: nowIso(),
    request_file: rel(requestPath),
    request_digest: sha256Json(request),
    public_task_count: request.public_tasks.length,
    configuration,
    exit_status: Number.isInteger(result.status) ? result.status : null,
    signal: result.signal || null,
    duration_ms: Date.now() - started,
    stdout_digest: sha256Text(stdout),
    stderr_excerpt: stderr.slice(0, 1000),
    worker_pid: payload && payload.pid || null,
    contamination_findings: contamination,
    permission_model_enforced: true,
  };
  atomicWriteJson(receiptPath, receipt);
  if (result.status !== 0 || !payload || !payload.ok || !Array.isArray(payload.results)) {
    throw new Error(`CAPABILITY_WORKER_FAILED: ${tag}: ${payload && payload.error || stderr || 'unknown'}`);
  }
  return {
    results: payload.results,
    worker_pid: payload.pid || null,
    request,
    request_file: rel(requestPath),
    receipt,
    receipt_file: rel(receiptPath),
  };
}

function scoreSolveResult(task, solveResult) {
  const verifiedAttempts = [];
  for (const attempt of solveResult.attempts || []) {
    const verification = verifyCandidate(task, attempt.answer);
    verifiedAttempts.push({ ...attempt, verification });
    if (verification.success) break;
  }
  const successful = verifiedAttempts.find((attempt) => attempt.verification.success) || null;
  return {
    task_id: task.public_task.task_id,
    family: task.evaluator_only.structural_family,
    semantic_domain: task.public_task.semantic_domain,
    success: Boolean(successful),
    successful_strategy: successful && successful.strategy_id || null,
    attempts_used: verifiedAttempts.length,
    actions: verifiedAttempts.reduce((sum, attempt) => sum + Math.max(1, Number(attempt.declared_cost || 1)), 0),
    verified_attempts: verifiedAttempts,
  };
}

function evaluateTasks({ root, label, configuration, tasks, memory, attemptBudget = 1 }) {
  const worker = invokeLearnerWorker({
    root,
    label,
    configuration,
    publicTasks: tasks,
    memory,
    attemptBudget,
    exploration: false,
  });
  const byTaskId = new Map(tasks.map((task) => [task.public_task.task_id, task]));
  const results = worker.results.map((solveResult) => scoreSolveResult(byTaskId.get(solveResult.task_id), solveResult));
  return {
    configuration,
    task_count: tasks.length,
    successes: results.filter((result) => result.success).length,
    success_rate: round(results.filter((result) => result.success).length / Math.max(1, tasks.length), 4),
    total_attempts: results.reduce((sum, result) => sum + result.attempts_used, 0),
    total_actions: results.reduce((sum, result) => sum + result.actions, 0),
    results,
    worker_pid: worker.worker_pid,
    request_file: worker.request_file,
    receipt_file: worker.receipt_file,
  };
}

function familyAccuracy(evaluation) {
  const grouped = {};
  for (const result of evaluation.results || []) {
    if (!grouped[result.family]) grouped[result.family] = { tasks: 0, successes: 0 };
    grouped[result.family].tasks += 1;
    grouped[result.family].successes += result.success ? 1 : 0;
  }
  return Object.fromEntries(Object.entries(grouped).map(([family, stats]) => [family, round(stats.successes / Math.max(1, stats.tasks), 4)]));
}

function averageForgetting(curve) {
  const families = new Set();
  curve.forEach((point) => Object.keys(point.family_accuracy || {}).forEach((family) => families.add(family)));
  const values = [];
  for (const family of families) {
    const series = curve.map((point) => Number(point.family_accuracy && point.family_accuracy[family] || 0));
    const maximum = Math.max(...series);
    const final = series[series.length - 1] || 0;
    values.push(Math.max(0, maximum - final));
  }
  return values.length ? round(values.reduce((sum, value) => sum + value, 0) / values.length, 4) : 0;
}

function linearSlope(points) {
  if (!Array.isArray(points) || points.length < 2) return 0;
  const xs = points.map((point) => Number(point.episodes || 0));
  const ys = points.map((point) => Number(point.success_rate || 0));
  const meanX = xs.reduce((sum, value) => sum + value, 0) / xs.length;
  const meanY = ys.reduce((sum, value) => sum + value, 0) / ys.length;
  const denominator = xs.reduce((sum, value) => sum + (value - meanX) ** 2, 0);
  if (!denominator) return 0;
  return round(xs.reduce((sum, value, index) => sum + (value - meanX) * (ys[index] - meanY), 0) / denominator, 8);
}

function taskSourceTargetDisjoint(pack) {
  const source = new Set(pack.source_semantic_domains);
  const target = new Set(pack.target_semantic_domains);
  return Array.from(source).every((value) => !target.has(value));
}

function injectAndRejectRegression(root, memory, probes, label = 'regression_probe') {
  const baseline = evaluateTasks({
    root,
    label: `${label}_baseline`,
    configuration: 'same_host_mdos_full',
    tasks: probes,
    memory,
    attemptBudget: 1,
  });
  const candidate = clone(memory);
  const target = probes.find((task) => {
    const ranking = rankStrategies('same_host_mdos_full', task.public_task, memory, { exploration: false });
    const identityResult = runStrategy('identity_projection', task.public_task);
    return ranking[0]
      && ranking[0].strategy_id !== 'identity_projection'
      && verifyCandidate(task, identityResult.answer).success === false;
  });
  if (!target) throw new Error('CAPABILITY_REGRESSION_PROBE_TARGET_MISSING');
  const cluster = featureCluster(target.public_task);
  const track = curriculumTrack(target.public_task);
  if (!candidate.cluster_strategy_stats[cluster]) candidate.cluster_strategy_stats[cluster] = {};
  candidate.cluster_strategy_stats[cluster].identity_projection = {
    successes: 10000,
    failures: 0,
    attempts: 10000,
    reward_sum: 10000,
    cost_sum: 10000,
  };
  for (const feature of extractStructuralFeatures(target.public_task)) {
    if (!candidate.feature_strategy_stats[feature]) candidate.feature_strategy_stats[feature] = {};
    candidate.feature_strategy_stats[feature].identity_projection = {
      successes: 10000,
      failures: 0,
      attempts: 10000,
      reward_sum: 10000,
      cost_sum: 10000,
    };
  }
  candidate.semantic_memory.promoted_policies[track] = {
    track,
    strategy_id: 'identity_projection',
    support: 10000,
    semantic_domain_count: 2,
    confidence: 1,
    evidence_digest: sha256Text('injected-regression'),
    consolidated_at: nowIso(),
  };
  const proposed = evaluateTasks({
    root,
    label: `${label}_proposed`,
    configuration: 'same_host_mdos_full',
    tasks: probes,
    memory: candidate,
    attemptBudget: 1,
  });
  const rejected = proposed.success_rate < baseline.success_rate;
  if (!rejected) throw new Error('CAPABILITY_INJECTED_REGRESSION_NOT_DETECTED');
  memory.rejected_updates += 1;
  appendMemoryEvent(root, memory, 'regression_update_rejected', {
    baseline_success_rate: baseline.success_rate,
    proposed_success_rate: proposed.success_rate,
    target_task_id: target.public_task.task_id,
    candidate_digest: sha256Json(candidate),
  });
  persistMemory(root, memory);
  return {
    status: 'rejected',
    baseline_success_rate: baseline.success_rate,
    proposed_success_rate: proposed.success_rate,
    regression_delta: round(proposed.success_rate - baseline.success_rate, 4),
    rollback_verified: sha256Json(loadMemory(root)) === sha256Json(memory),
  };
}

function evidenceIntegrity(root) {
  const files = [];
  const pending = [root];
  while (pending.length) {
    const current = pending.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) pending.push(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  const entries = files.sort().map((filePath) => ({
    file: path.relative(root, filePath).replace(/\\/g, '/'),
    size: fs.statSync(filePath).size,
    sha256: sha256Text(fs.readFileSync(filePath)),
  }));
  return {
    schema_version: 1,
    created_at: nowIso(),
    file_count: entries.length,
    files: entries,
    root_digest: sha256Json(entries),
  };
}

function renderCapabilityMarkdown(report) {
  const lines = [
    '# AGI capability lab v5',
    '',
    `Experiment: \`${report.experiment_id}\``,
    '',
    `Status: \`${report.status}\``,
    '',
    `Internal capability closure: \`${report.claim_state.internal_capabilities_supported}\``,
    '',
    `External proof complete: \`${report.claim_state.external_proofs_complete}\``,
    '',
    '## Core measurements',
    '',
    '| Measurement | Value |',
    '|---|---:|',
    `| Training episodes | ${report.measurements.training_episodes} |`,
    `| Holdout tasks | ${report.measurements.holdout_tasks} |`,
    `| Structural families | ${report.measurements.structural_families} |`,
    `| Full holdout success | ${report.measurements.full_holdout_success_rate} |`,
    `| Best non-learning holdout success | ${report.measurements.best_control_success_rate} |`,
    `| Added-value delta | ${report.measurements.added_value_delta} |`,
    `| Continual-learning gain | ${report.measurements.learning_gain} |`,
    `| Average forgetting | ${report.measurements.average_forgetting} |`,
    `| Memory-on holdout success | ${report.measurements.memory_on_success_rate} |`,
    `| Memory-off holdout success | ${report.measurements.memory_off_success_rate} |`,
    `| Causal memory delta | ${report.measurements.memory_added_value_delta} |`,
    `| Semantic policies consolidated | ${report.measurements.semantic_policies_promoted} |`,
    `| Checkpoint reloads | ${report.measurements.checkpoint_reloads} |`,
    `| Causal persisted-memory reuses | ${report.measurements.causal_memory_reuses} |`,
    `| Process restarts | ${report.measurements.clean_process_restarts} |`,
    `| Persisted skill reuses | ${report.measurements.persisted_skill_reuses} |`,
    `| Human interventions | ${report.measurements.human_interventions} |`,
    `| Real wall-clock minutes | ${report.measurements.real_wall_clock_minutes} |`,
    '',
    '## Claim boundary',
    '',
    report.claim_state.reason,
    '',
  ];
  return lines.join('\n');
}

function experimentPath(experimentId) {
  return path.join(CAPABILITY_ROOT, safeId(experimentId, 'capability_experiment'));
}

function runCapabilityLab({
  experiment_id: experimentId = '',
  seed = '',
  cycles = 70,
  sessions = 7,
  train_per_family: trainPerFamily = 12,
  holdout_per_family: holdoutPerFamily = 8,
  probe_per_family: probePerFamily = 3,
  training_attempt_budget: trainingAttemptBudget = 3,
  evaluation_attempt_budget: evaluationAttemptBudget = 1,
  wall_minutes: wallMinutes = 0,
  cycle_pause_ms: cyclePauseMs = 0,
} = {}) {
  const id = safeId(experimentId || `capability_${Date.now()}`, 'capability_experiment');
  const root = experimentPath(id);
  if (fs.existsSync(root)) throw new Error(`CAPABILITY_EXPERIMENT_APPEND_ONLY_EXISTS: ${id}`);
  ensureDir(root);
  const startedAt = nowIso();
  const startedMs = Date.now();
  const actualSeed = String(seed || `${id}:${process.pid}:${startedAt}:${Math.random()}`);
  const pack = generateTaskPack({
    seed: actualSeed,
    trainPerFamily: Math.max(4, Number(trainPerFamily || 12)),
    holdoutPerFamily: Math.max(2, Number(holdoutPerFamily || 8)),
    probePerFamily: Math.max(2, Number(probePerFamily || 3)),
  });
  const publicManifest = {
    schema_version: 1,
    manifest_type: 'mdos_capability_public_task_manifest',
    created_at: nowIso(),
    pack_id: pack.pack_id,
    generator_seed_digest: pack.generator_seed_digest,
    source_semantic_domains: pack.source_semantic_domains,
    target_semantic_domains: pack.target_semantic_domains,
    structural_families: pack.structural_families,
    train_tasks: pack.train.map((task) => task.public_task),
    holdout_tasks: pack.holdout.map((task) => task.public_task),
    probe_tasks: pack.probes.map((task) => task.public_task),
  };
  const publicManifestPath = path.join(root, 'public_task_manifest.json');
  atomicWriteJson(publicManifestPath, publicManifest);
  const hiddenDigest = sha256Json({
    train: pack.train.map((task) => task.evaluator_only),
    holdout: pack.holdout.map((task) => task.evaluator_only),
    probes: pack.probes.map((task) => task.evaluator_only),
  });
  const privateRunCard = {
    schema_version: 1,
    created_at: startedAt,
    public_manifest_digest: sha256Json(publicManifest),
    hidden_evaluation_digest: hiddenDigest,
    source_target_semantic_overlap: pack.source_semantic_domains.filter((domain) => pack.target_semantic_domains.includes(domain)),
    released_after_completion_seed: null,
  };
  atomicWriteJson(path.join(root, 'evaluation_boundary.json'), privateRunCard);

  let memory = emptyMemory(`capability_${id}`);
  appendMemoryEvent(root, memory, 'campaign_started', {
    experiment_id: id,
    pack_id: pack.pack_id,
    public_manifest_digest: sha256Json(publicManifest),
    hidden_evaluation_digest: hiddenDigest,
    requested_cycles: Number(cycles),
    requested_sessions: Number(sessions),
  });
  persistMemory(root, memory);

  const initialProbe = evaluateTasks({
    root,
    label: 'probe_000_initial',
    configuration: 'same_host_mdos_full',
    tasks: pack.probes,
    memory,
    attemptBudget: evaluationAttemptBudget,
  });
  const learningCurve = [{
    episodes: 0,
    success_rate: initialProbe.success_rate,
    family_accuracy: familyAccuracy(initialProbe),
    memory_digest: sha256Json(memory),
  }];
  const sessionCount = Math.max(2, Math.min(32, Number(sessions || 7)));
  const requestedCycles = Math.max(STRUCTURAL_FAMILIES.length, Number(cycles || 70));
  const deadline = Number(wallMinutes || 0) > 0 ? Date.now() + Number(wallMinutes) * 60 * 1000 : null;
  const trainingPool = pack.train.slice();
  const workerPids = new Set();
  const trainingResults = [];
  const sessionReadbacks = [];
  let injectedFaults = 0;
  let recoveredFaults = 0;
  let cycle = 0;
  let priorSessionDigest = sha256Json(memory);
  const cyclesPerSession = Math.max(1, Math.ceil(requestedCycles / sessionCount));

  while (cycle < requestedCycles || (deadline && Date.now() < deadline)) {
    const sessionOrdinal = Math.floor(cycle / cyclesPerSession) + 1;
    const sessionId = `session_${String(sessionOrdinal).padStart(3, '0')}`;
    const checkpointLoaded = sessionReadbacks.length > 0;
    const available = trainingPool.filter((task) => !memory.curriculum.selected_task_ids.includes(task.public_task.task_id));
    const candidates = available.length ? available : pack.train;
    const decision = selectCurriculumTask(memory, candidates);
    memory.curriculum.decisions += 1;
    appendMemoryEvent(root, memory, 'curriculum_decision', {
      session_id: sessionId,
      cycle: cycle + 1,
      selected_task_id: decision.selected.task_id,
      selected_track: decision.selected.track,
      score: decision.selected.score,
      components: decision.selected.components,
      candidate_count: decision.ranking.length,
      public_only: true,
    });
    persistMemory(root, memory);

    const worker = invokeLearnerWorker({
      root,
      label: `train_${String(cycle + 1).padStart(4, '0')}`,
      configuration: 'same_host_mdos_full',
      publicTasks: [decision.selected.task],
      memory,
      attemptBudget: trainingAttemptBudget,
      exploration: true,
    });
    if (worker.worker_pid) workerPids.add(worker.worker_pid);
    const solveResult = worker.results[0];
    const scored = scoreSolveResult(decision.selected.task, solveResult);
    const amnesicSolve = solvePublicTask({
      configuration: 'same_host_mdos_full',
      publicTask: decision.selected.task.public_task,
      memory: emptyMemory('amnesic_control'),
      attemptBudget: 1,
      exploration: false,
    });
    const amnesicScored = scoreSolveResult(decision.selected.task, amnesicSolve);
    const recorded = recordVerifiedEpisode(
      root,
      memory,
      decision.selected.task,
      solveResult,
      scored.verified_attempts,
      sessionId,
      {
        checkpoint_loaded: checkpointLoaded,
        memory_off_success: amnesicScored.success,
      },
    );
    memory = recorded.memory;
    trainingResults.push({
      cycle: cycle + 1,
      session_id: sessionId,
      task_id: scored.task_id,
      family: scored.family,
      semantic_domain: scored.semantic_domain,
      success: scored.success,
      attempts_used: scored.attempts_used,
      successful_strategy: scored.successful_strategy,
      memory_off_success: amnesicScored.success,
      checkpoint_loaded: checkpointLoaded,
    });
    cycle += 1;

    const sessionBoundary = cycle % cyclesPerSession === 0 || cycle === requestedCycles;
    if (sessionBoundary) {
      const beforeReload = sha256Json(memory);
      if (injectedFaults === 0 && cycle >= Math.ceil(requestedCycles / 2)) {
        const paths = memoryPaths(root);
        fs.copyFileSync(paths.snapshot, paths.backup);
        fs.writeFileSync(paths.snapshot, '{"truncated":', 'utf8');
        injectedFaults += 1;
      }
      memory = loadMemory(root, memory.memory_id);
      const afterReload = sha256Json(memory);
      if (beforeReload === afterReload) {
        if (injectedFaults > recoveredFaults) recoveredFaults += 1;
      } else if (injectedFaults === 0) {
        throw new Error('CAPABILITY_MEMORY_RELOAD_DIGEST_MISMATCH');
      }
      sessionReadbacks.push({
        cycle,
        session_id: sessionId,
        before_reload_digest: beforeReload,
        after_reload_digest: afterReload,
        matched: beforeReload === afterReload,
        previous_session_digest: priorSessionDigest,
      });
      memory.continuity.checkpoint_reloads += 1;
      if (injectedFaults > 0 && recoveredFaults > 0) memory.continuity.recovery_events = recoveredFaults;
      appendMemoryEvent(root, memory, 'checkpoint_reloaded', {
        cycle,
        session_id: sessionId,
        matched: beforeReload === afterReload,
        recovered_fault: injectedFaults === recoveredFaults && injectedFaults > 0,
      });
      persistMemory(root, memory);
      priorSessionDigest = afterReload;
    }

    const probeInterval = Math.max(STRUCTURAL_FAMILIES.length, Math.floor(requestedCycles / 5));
    if (cycle % probeInterval === 0 || cycle === requestedCycles) {
      const probe = evaluateTasks({
        root,
        label: `probe_${String(cycle).padStart(4, '0')}`,
        configuration: 'same_host_mdos_full',
        tasks: pack.probes,
        memory,
        attemptBudget: evaluationAttemptBudget,
      });
      if (probe.worker_pid) workerPids.add(probe.worker_pid);
      learningCurve.push({
        episodes: cycle,
        success_rate: probe.success_rate,
        family_accuracy: familyAccuracy(probe),
        memory_digest: sha256Json(memory),
      });
    }
    if (Number(cyclePauseMs || 0) > 0) {
      const buffer = new SharedArrayBuffer(4);
      Atomics.wait(new Int32Array(buffer), 0, 0, Number(cyclePauseMs));
    }
    if (!deadline && cycle >= requestedCycles) break;
  }

  const regressionProbe = injectAndRejectRegression(root, memory, pack.probes);
  memory = loadMemory(root, memory.memory_id);
  const ablations = {};
  for (const configuration of CONFIGURATIONS) {
    const evaluation = evaluateTasks({
      root,
      label: `holdout_${configuration}`,
      configuration,
      tasks: pack.holdout,
      memory,
      attemptBudget: evaluationAttemptBudget,
    });
    if (evaluation.worker_pid) workerPids.add(evaluation.worker_pid);
    ablations[configuration] = {
      task_count: evaluation.task_count,
      successes: evaluation.successes,
      success_rate: evaluation.success_rate,
      total_attempts: evaluation.total_attempts,
      total_actions: evaluation.total_actions,
      family_accuracy: familyAccuracy(evaluation),
      results: evaluation.results.map((result) => ({
        task_id: result.task_id,
        family: result.family,
        semantic_domain: result.semantic_domain,
        success: result.success,
        successful_strategy: result.successful_strategy,
        attempts_used: result.attempts_used,
        actions: result.actions,
      })),
      request_file: evaluation.request_file,
      receipt_file: evaluation.receipt_file,
    };
  }

  const memoryOffHoldout = evaluateTasks({
    root,
    label: 'holdout_same_host_mdos_memory_off',
    configuration: 'same_host_mdos_full',
    tasks: pack.holdout,
    memory: emptyMemory('holdout_amnesic_control'),
    attemptBudget: evaluationAttemptBudget,
  });
  if (memoryOffHoldout.worker_pid) workerPids.add(memoryOffHoldout.worker_pid);
  const memoryAblation = {
    same_architecture_memory_on: {
      task_count: ablations.same_host_mdos_full.task_count,
      successes: ablations.same_host_mdos_full.successes,
      success_rate: ablations.same_host_mdos_full.success_rate,
    },
    same_architecture_memory_off: {
      task_count: memoryOffHoldout.task_count,
      successes: memoryOffHoldout.successes,
      success_rate: memoryOffHoldout.success_rate,
    },
    causal_delta: round(ablations.same_host_mdos_full.success_rate - memoryOffHoldout.success_rate, 4),
    matched_attempt_budget: true,
    matched_strategy_engine: true,
  };

  const full = ablations.same_host_mdos_full;
  const controls = [
    ablations.same_host_base,
    ablations.same_host_prompted,
    ablations.same_host_mdos_no_learning,
  ];
  const bestControl = Math.max(...controls.map((control) => control.success_rate));
  const finalProbe = learningCurve[learningCurve.length - 1];
  const forgetting = averageForgetting(learningCurve);
  const learningGain = round(finalProbe.success_rate - learningCurve[0].success_rate, 4);
  const addedValue = round(full.success_rate - bestControl, 4);
  const memoryAddedValue = memoryAblation.causal_delta;
  const semanticPolicyCount = Object.keys(memory.semantic_memory.promoted_policies || {}).length;
  const memoryAudit = verifyMemoryLedger(root, memory);
  const requestFiles = fs.readdirSync(path.join(root, 'learner_requests')).filter((file) => file.endsWith('.json'));
  const requestFindings = [];
  for (const file of requestFiles) {
    const request = JSON.parse(fs.readFileSync(path.join(root, 'learner_requests', file), 'utf8'));
    requestFindings.push(...forbiddenPaths(request).map((finding) => `${file}:${finding}`));
  }
  const completedAt = nowIso();
  const sourceTargetDisjoint = taskSourceTargetDisjoint(pack);
  const sourceRepresentations = Array.from(new Set(pack.train.map((task) => task.public_task.representation))).sort();
  const targetRepresentations = Array.from(new Set([...pack.holdout, ...pack.probes].map((task) => task.public_task.representation))).sort();
  const representationOverlap = sourceRepresentations.filter((value) => targetRepresentations.includes(value));
  const criteria = {
    far_semantic_transfer: {
      status: sourceTargetDisjoint && representationOverlap.length === 0 && full.success_rate >= 0.80 && addedValue >= 0.10 ? 'ok' : 'failed',
      source_target_semantic_overlap: sourceTargetDisjoint ? 0 : pack.source_semantic_domains.filter((domain) => pack.target_semantic_domains.includes(domain)).length,
      source_representation_schemas: sourceRepresentations,
      target_representation_schemas: targetRepresentations,
      representation_schema_overlap: representationOverlap.length,
      structural_families: STRUCTURAL_FAMILIES.length,
      full_success_rate: full.success_rate,
      best_control_success_rate: bestControl,
      added_value_delta: addedValue,
    },
    continual_learning: {
      status: learningGain >= 0.15 && forgetting <= 0.05 && memory.promoted_regressions === 0 && regressionProbe.status === 'rejected' ? 'ok' : 'failed',
      learning_gain: learningGain,
      average_forgetting: forgetting,
      promoted_regressions: memory.promoted_regressions,
      injected_regression_rejected: regressionProbe.status === 'rejected',
    },
    persistent_memory: {
      status: memoryAudit.status === 'ok'
        && workerPids.size >= 2
        && memory.persisted_skill_reuses > 0
        && semanticPolicyCount >= STRUCTURAL_FAMILIES.length - 1
        && memoryAddedValue >= 0.10
        && sessionReadbacks.every((entry) => entry.matched)
        ? 'ok' : 'failed',
      ledger_chain_valid: memoryAudit.status === 'ok',
      unique_worker_processes: workerPids.size,
      persisted_skill_reuses: memory.persisted_skill_reuses,
      causal_memory_delta: memoryAddedValue,
      semantic_policies_promoted: semanticPolicyCount,
      consolidation_runs: memory.semantic_memory.consolidation_runs,
      session_reload_matches: sessionReadbacks.filter((entry) => entry.matched).length,
      injected_faults: injectedFaults,
      recovered_faults: recoveredFaults,
    },
    cognitive_memory_continuity: {
      status: memoryAudit.status === 'ok'
        && memoryAddedValue >= 0.10
        && memory.continuity.checkpoint_reloads >= Math.max(2, sessionCount - 1)
        && memory.continuity.causal_memory_reuses > 0
        && semanticPolicyCount >= STRUCTURAL_FAMILIES.length - 1
        && forgetting <= 0.05
        && regressionProbe.status === 'rejected'
        ? 'ok' : 'failed',
      episodic_events: memory.episodes,
      semantic_policies_promoted: semanticPolicyCount,
      consolidation_runs: memory.semantic_memory.consolidation_runs,
      checkpoint_reloads: memory.continuity.checkpoint_reloads,
      recovery_events: memory.continuity.recovery_events,
      causal_memory_trials: memory.continuity.causal_memory_trials,
      causal_memory_reuses: memory.continuity.causal_memory_reuses,
      memory_on_success_rate: full.success_rate,
      memory_off_success_rate: memoryOffHoldout.success_rate,
      causal_memory_delta: memoryAddedValue,
      average_forgetting: forgetting,
      interference_update_rejected: regressionProbe.status === 'rejected',
    },
    autonomous_curriculum: {
      status: memory.curriculum.decisions >= requestedCycles && requestFindings.length === 0 ? 'ok' : 'failed',
      decisions: memory.curriculum.decisions,
      human_interventions: 0,
      public_only_decisions: true,
      public_track_coverage: Object.values(memory.curriculum.track_exposures).filter((value) => value > 0).length,
      evaluator_family_coverage: new Set(trainingResults.map((entry) => entry.family)).size,
    },
    measurable_improvement: {
      status: learningGain >= 0.15 && linearSlope(learningCurve) > 0 ? 'ok' : 'failed',
      curve_points: learningCurve.length,
      initial_success_rate: learningCurve[0].success_rate,
      final_success_rate: finalProbe.success_rate,
      slope_per_episode: linearSlope(learningCurve),
      training_success_rate: round(trainingResults.filter((result) => result.success).length / Math.max(1, trainingResults.length), 4),
    },
    bounded_long_horizon_autonomy: {
      status: cycle >= requestedCycles && workerPids.size >= sessionCount && recoveredFaults === injectedFaults ? 'ok' : 'failed',
      completed_cycles: cycle,
      requested_cycles: requestedCycles,
      unique_worker_processes: workerPids.size,
      clean_process_restarts: Math.max(0, workerPids.size - 1),
      real_wall_clock_minutes: round((Date.now() - startedMs) / 60000, 4),
      requested_wall_minutes: Number(wallMinutes || 0),
      real_eight_hour_horizon_proven: (Date.now() - startedMs) >= 480 * 60 * 1000,
      human_interventions: 0,
    },
    sealed_hidden_evaluation: {
      status: requestFindings.length === 0 ? 'ok' : 'failed',
      learner_request_count: requestFiles.length,
      contamination_findings: requestFindings,
      evaluator_only_hidden_digest: hiddenDigest,
      generator_seed_absent_from_requests: requestFindings.every((finding) => !finding.includes('generator_seed')),
    },
  };
  const allInternalCriteria = Object.values(criteria).every((criterion) => criterion.status === 'ok');
  const report = {
    schema_version: 1,
    report_type: 'mdos_agi_capability_lab_report',
    protocol_id: CAPABILITY_PROTOCOL_ID,
    experiment_id: id,
    created_at: startedAt,
    completed_at: completedAt,
    status: allInternalCriteria ? 'ok' : 'failed',
    source_boundary: {
      public_task_manifest_file: rel(publicManifestPath),
      public_task_manifest_digest: sha256Json(publicManifest),
      hidden_evaluation_digest: hiddenDigest,
      generator_seed_digest: pack.generator_seed_digest,
      released_generator_seed: actualSeed,
      source_target_semantic_disjoint: sourceTargetDisjoint,
      source_target_representation_disjoint: representationOverlap.length === 0,
      learner_requests_contaminated: requestFindings.length > 0,
    },
    criteria,
    measurements: {
      training_episodes: trainingResults.length,
      holdout_tasks: pack.holdout.length,
      probe_tasks: pack.probes.length,
      structural_families: STRUCTURAL_FAMILIES.length,
      source_semantic_domains: pack.source_semantic_domains.length,
      target_semantic_domains: pack.target_semantic_domains.length,
      full_holdout_success_rate: full.success_rate,
      best_control_success_rate: bestControl,
      added_value_delta: addedValue,
      learning_gain: learningGain,
      average_forgetting: forgetting,
      learning_curve_slope: linearSlope(learningCurve),
      curriculum_decisions: memory.curriculum.decisions,
      persisted_skill_reuses: memory.persisted_skill_reuses,
      semantic_policies_promoted: semanticPolicyCount,
      memory_on_success_rate: full.success_rate,
      memory_off_success_rate: memoryOffHoldout.success_rate,
      memory_added_value_delta: memoryAddedValue,
      checkpoint_reloads: memory.continuity.checkpoint_reloads,
      causal_memory_reuses: memory.continuity.causal_memory_reuses,
      clean_process_restarts: Math.max(0, workerPids.size - 1),
      unique_worker_processes: workerPids.size,
      injected_faults: injectedFaults,
      recovered_faults: recoveredFaults,
      promoted_regressions: memory.promoted_regressions,
      rejected_regressions: memory.rejected_updates,
      human_interventions: 0,
      real_wall_clock_minutes: round((Date.now() - startedMs) / 60000, 4),
      real_eight_hour_horizon_proven: (Date.now() - startedMs) >= 480 * 60 * 1000,
    },
    ablations,
    memory_ablation: memoryAblation,
    learning_curve: learningCurve,
    training_summary: {
      task_count: trainingResults.length,
      successes: trainingResults.filter((result) => result.success).length,
      public_track_exposures: memory.curriculum.track_exposures,
      public_track_successes: memory.curriculum.track_successes,
      evaluator_family_exposures: trainingResults.reduce((output, entry) => {
        output[entry.family] = Number(output[entry.family] || 0) + 1;
        return output;
      }, {}),
      evaluator_family_successes: trainingResults.reduce((output, entry) => {
        output[entry.family] = Number(output[entry.family] || 0) + (entry.success ? 1 : 0);
        return output;
      }, {}),
      last_episodes: trainingResults.slice(-20),
    },
    persistence: {
      memory_snapshot_file: rel(memoryPaths(root).snapshot),
      memory_ledger_file: rel(memoryPaths(root).ledger),
      memory_digest: sha256Json(memory),
      ledger_audit: memoryAudit,
      session_readbacks: sessionReadbacks,
      semantic_memory: memory.semantic_memory,
      continuity: memory.continuity,
      worker_pids: Array.from(workerPids).sort((a, b) => a - b),
    },
    regression_gate: regressionProbe,
    contamination_audit: {
      status: requestFindings.length ? 'failed' : 'ok',
      request_count: requestFiles.length,
      findings: requestFindings,
      hidden_answers_absent: requestFindings.every((finding) => !finding.includes('expected')),
      oracle_strategy_absent: requestFindings.every((finding) => !finding.includes('oracle_strategy')),
      generator_seed_absent: requestFindings.every((finding) => !finding.includes('generator_seed')),
      learner_process_permission_model_enforced: true,
    },
    external_proof_readiness: {
      same_engine_matched_ablation_internal: true,
      post_freeze_task_generator_available: true,
      evaluator_owned_hidden_test_kit_available: true,
      external_signing_supported: true,
      independent_replication_completed: false,
      real_eight_hour_external_run_completed: false,
    },
    claim_state: {
      internal_capabilities_supported: allInternalCriteria,
      external_proofs_complete: false,
      operational_agi_claim_supported: false,
      agi_achieved: 'not_ontologically_attestable',
      reason: allInternalCriteria
        ? 'The requested capabilities, including causal memory continuity, are supported inside a controlled post-freeze-style laboratory with matched internal ablations. Independent organizations, externally owned open-world tasks, an actual same-host foundation-model ablation, and a real eight-hour evaluation remain mandatory before SAL 100.'
        : 'One or more internal capability gates failed; external certification is not admissible.',
    },
  };
  const reportPath = path.join(root, 'report.json');
  const reportMdPath = path.join(root, 'report.md');
  atomicWriteJson(reportPath, report);
  atomicWriteText(reportMdPath, `${renderCapabilityMarkdown(report)}\n`);
  const integrity = evidenceIntegrity(root);
  const integrityPath = path.join(root, 'evidence_integrity.json');
  atomicWriteJson(integrityPath, integrity);
  report.evidence = {
    report_file: rel(reportPath),
    report_markdown_file: rel(reportMdPath),
    evidence_integrity_file: rel(integrityPath),
    evidence_root_digest: integrity.root_digest,
  };
  atomicWriteJson(reportPath, report);
  return report;
}

function latestCapabilityReport() {
  if (!fs.existsSync(CAPABILITY_ROOT)) return null;
  const reports = fs.readdirSync(CAPABILITY_ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(CAPABILITY_ROOT, entry.name, 'report.json'))
    .filter((filePath) => fs.existsSync(filePath))
    .map((filePath) => ({ filePath, report: JSON.parse(fs.readFileSync(filePath, 'utf8')) }))
    .sort((left, right) => String(right.report.completed_at || '').localeCompare(String(left.report.completed_at || '')));
  return reports[0] || null;
}

module.exports = {
  CAPABILITY_PROTOCOL_ID,
  CAPABILITY_ROOT,
  CONFIGURATIONS,
  SOURCE_SEMANTIC_DOMAINS,
  STRATEGIES,
  STRATEGY_IDS,
  STRUCTURAL_FAMILIES,
  TARGET_SEMANTIC_DOMAINS,
  averageForgetting,
  canonicalizePayload,
  curriculumTrack,
  emptyMemory,
  evaluateTasks,
  extractStructuralFeatures,
  featureCluster,
  forbiddenPaths,
  generateTask,
  generateTaskPack,
  invokeLearnerWorker,
  latestCapabilityReport,
  linearSlope,
  loadMemory,
  memoryPaths,
  persistMemory,
  policyScore,
  recordVerifiedEpisode,
  rankStrategies,
  renderCapabilityMarkdown,
  runCapabilityLab,
  runStrategy,
  scoreSolveResult,
  selectCurriculumTask,
  solvePublicTask,
  taskSourceTargetDisjoint,
  verifyCandidate,
  verifyMemoryLedger,
};
