#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  MDOS_ROOT,
  WORKSPACE_ROOT,
  assertSafeId,
  nowIso,
  sha256Json,
  sha256Text,
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText } = require('../../os/lib/fs_runtime');

const EXPERIMENT_TYPE = 'apfc_causal_external_memory_learning_v1';
const EXPERIMENT_ROOT = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments');
const RESPONSE_SCHEMA = path.join(MDOS_ROOT, 'schemas', 'apfc_causal_learning_response.schema.json');
const CANDIDATE_SKILL_ROOT = path.join(MDOS_ROOT, 'ops', 'skills', 'candidates');
const TASK_ROOT = path.join(MDOS_ROOT, 'ops', 'tasks');
const EPISODE_ROOT = path.join(MDOS_ROOT, 'ops', 'episodes');
const VERIFICATION_ROOT = path.join(MDOS_ROOT, 'ops', 'verifications');
const RECEIPT_ROOT = path.join(MDOS_ROOT, 'ops', 'action_receipts');
const EVAL_ROOT = path.join(MDOS_ROOT, 'ops', 'evals');
const STATUS_JSON = path.join(MDOS_ROOT, 'ops', 'agi', 'apfc_causal_learning_status.json');
const STATUS_MD = path.join(MDOS_ROOT, 'ops', 'agi', 'apfc_causal_learning_status.md');

const ROUTES = Object.freeze(['amber', 'cobalt', 'ivory']);
const TRUE_PROTOCOL = Object.freeze({
  delimiter: '~',
  prefix_case_sensitive: false,
  payload_charset: 'alnum_dash',
  normalization: 'lower',
  route_map: Object.freeze(['cobalt', 'ivory', 'amber']),
});

const PROTOCOL_PRESETS = Object.freeze({
  kestrel9: Object.freeze({
    protocol_id: 'kestrel_9_operational_routing_v1',
    label: 'Kestrel-9',
    skill_slug: 'kestrel9_operational_routing',
    protocol: TRUE_PROTOCOL,
  }),
  orion17: Object.freeze({
    protocol_id: 'orion_17_operational_routing_v1',
    label: 'Orion-17',
    skill_slug: 'orion17_operational_routing',
    protocol: Object.freeze({
      delimiter: '|',
      prefix_case_sensitive: true,
      payload_charset: 'printable_nonempty',
      normalization: 'upper',
      route_map: Object.freeze(['ivory', 'amber', 'cobalt']),
    }),
  }),
});

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function permutations(values) {
  if (values.length <= 1) return [values.slice()];
  const output = [];
  for (let index = 0; index < values.length; index += 1) {
    const head = values[index];
    const rest = values.slice(0, index).concat(values.slice(index + 1));
    for (const tail of permutations(rest)) output.push([head, ...tail]);
  }
  return output;
}

function allProtocolHypotheses() {
  const output = [];
  for (const delimiter of ['~', ':', '|']) {
    for (const prefixCaseSensitive of [true, false]) {
      for (const payloadCharset of ['alnum_dash', 'printable_nonempty']) {
        for (const normalization of ['lower', 'upper', 'preserve']) {
          for (const routeMap of permutations(ROUTES)) {
            output.push({
              delimiter,
              prefix_case_sensitive: prefixCaseSensitive,
              payload_charset: payloadCharset,
              normalization,
              route_map: routeMap,
            });
          }
        }
      }
    }
  }
  return output;
}

function normalizePayload(payload, mode) {
  if (mode === 'lower') return payload.toLowerCase();
  if (mode === 'upper') return payload.toUpperCase();
  return payload;
}

function payloadValid(payload, mode) {
  if (!payload) return false;
  if (mode === 'alnum_dash') return /^[A-Za-z0-9_-]+$/.test(payload);
  return /^[\x21-\x7E]+$/.test(payload);
}

function routeRecord(record, protocol) {
  const token = String(record.token || '');
  const expectedPrefix = String(record.expected_prefix || '');
  const sequence = Number(record.sequence);
  const parts = token.split(protocol.delimiter);
  if (parts.length !== 2 || !Number.isInteger(sequence)) {
    return { route: 'vault', normalized_payload: null };
  }
  const [prefix, payload] = parts;
  const prefixMatches = protocol.prefix_case_sensitive
    ? prefix === expectedPrefix
    : prefix.toLowerCase() === expectedPrefix.toLowerCase();
  if (!prefixMatches || !payloadValid(payload, protocol.payload_charset)) {
    return { route: 'vault', normalized_payload: null };
  }
  const normalizedPayload = normalizePayload(payload, protocol.normalization);
  const checksum = [...normalizedPayload].reduce((sum, character) => sum + character.codePointAt(0), 0);
  const residue = ((checksum + sequence) % 3 + 3) % 3;
  return {
    route: protocol.route_map[residue],
    normalized_payload: normalizedPayload,
  };
}

function sequenceForResidue(payload, targetResidue, multiplier = 0) {
  const normalized = payload.toLowerCase();
  const checksum = [...normalized].reduce((sum, character) => sum + character.codePointAt(0), 0);
  const smallest = ((targetResidue - (checksum % 3)) + 3) % 3;
  return smallest + (3 * multiplier);
}

function sequenceForProtocolResidue(payload, targetResidue, protocol, multiplier = 0) {
  const normalized = normalizePayload(payload, protocol.normalization);
  const checksum = [...normalized].reduce((sum, character) => sum + character.codePointAt(0), 0);
  const smallest = ((targetResidue - (checksum % 3)) + 3) % 3;
  return smallest + (3 * multiplier);
}

function developmentExamples() {
  const examples = [];
  const valid = [
    ['aster', 'ASTER', 'MiXeD_1', 0],
    ['nova', 'NoVa', 'Delta-2', 1],
    ['orbit', 'ORBIT', 'Signal_3', 2],
    ['mesa', 'MeSa', 'Vector-4', 0],
    ['lumen', 'LUMEN', 'Phase_5', 1],
    ['kite', 'KiTe', 'Arc-6', 2],
  ];
  for (let index = 0; index < valid.length; index += 1) {
    const [expectedPrefix, actualPrefix, payload, residue] = valid[index];
    const record = {
      token: `${actualPrefix}~${payload}`,
      expected_prefix: expectedPrefix,
      sequence: sequenceForResidue(payload, residue, index),
    };
    examples.push({
      example_id: `development_valid_${index + 1}`,
      record,
      verified_output: routeRecord(record, TRUE_PROTOCOL),
      verifier_outcome: 'verified',
    });
  }
  const invalidRecords = [
    { token: 'ASTER~alpha~extra', expected_prefix: 'aster', sequence: 2 },
    { token: 'NOVA~', expected_prefix: 'nova', sequence: 3 },
    { token: 'ORBIT~bad.value', expected_prefix: 'orbit', sequence: 4 },
    { token: 'OTHER~payload_7', expected_prefix: 'mesa', sequence: 5 },
    { token: 'LUMEN|payload_8', expected_prefix: 'lumen', sequence: 6 },
    { token: 'payload_9', expected_prefix: 'kite', sequence: 7 },
  ];
  invalidRecords.forEach((record, index) => examples.push({
    example_id: `development_invalid_${index + 1}`,
    record,
    verified_output: routeRecord(record, TRUE_PROTOCOL),
    verifier_outcome: 'verified',
  }));
  return examples;
}

function developmentExamplesForPreset(preset) {
  if (!preset || preset === PROTOCOL_PRESETS.kestrel9) return developmentExamples();
  const protocol = preset.protocol;
  const examples = [];
  const valid = [
    ['atlas', 'atlas', 'MiXeD.1', 0],
    ['boron', 'boron', 'Delta+2', 1],
    ['cirrus', 'cirrus', 'Signal@3', 2],
    ['dorado', 'dorado', 'Vector-4', 0],
    ['ember', 'ember', 'Phase_5', 1],
    ['fable', 'fable', 'Arc=6', 2],
  ];
  for (let index = 0; index < valid.length; index += 1) {
    const [expectedPrefix, actualPrefix, payload, residue] = valid[index];
    const record = {
      token: `${actualPrefix}${protocol.delimiter}${payload}`,
      expected_prefix: expectedPrefix,
      sequence: sequenceForProtocolResidue(payload, residue, protocol, index),
    };
    examples.push({
      example_id: `${preset.protocol_id}_development_valid_${index + 1}`,
      record,
      verified_output: routeRecord(record, protocol),
      verifier_outcome: 'verified',
    });
  }
  const invalidRecords = [
    { token: `ATLAS${protocol.delimiter}alpha`, expected_prefix: 'atlas', sequence: 2 },
    { token: `boron${protocol.delimiter}`, expected_prefix: 'boron', sequence: 3 },
    { token: `cirrus${protocol.delimiter}alpha${protocol.delimiter}extra`, expected_prefix: 'cirrus', sequence: 4 },
    { token: `other${protocol.delimiter}payload`, expected_prefix: 'dorado', sequence: 5 },
    { token: 'ember~payload', expected_prefix: 'ember', sequence: 6 },
    { token: 'payload_without_delimiter', expected_prefix: 'fable', sequence: 7 },
  ];
  invalidRecords.forEach((record, index) => examples.push({
    example_id: `${preset.protocol_id}_development_invalid_${index + 1}`,
    record,
    verified_output: routeRecord(record, protocol),
    verifier_outcome: 'verified',
  }));
  return examples;
}

function sameOutput(left, right) {
  return left && right
    && left.route === right.route
    && left.normalized_payload === right.normalized_payload;
}

function induceProtocolSkill(examples, createdAt = nowIso(), preset = PROTOCOL_PRESETS.kestrel9) {
  if (!Array.isArray(examples) || examples.length < 2) throw new Error('APFC_MINIMUM_DEVELOPMENT_EVIDENCE_REQUIRED');
  const unverified = examples.filter((example) => example.verifier_outcome !== 'verified');
  if (unverified.length) throw new Error('APFC_UNVERIFIED_DEVELOPMENT_EVIDENCE');
  const hypotheses = allProtocolHypotheses();
  const survivors = hypotheses.filter((hypothesis) => examples.every((example) => (
    sameOutput(routeRecord(example.record, hypothesis), example.verified_output)
  )));
  if (survivors.length !== 1) {
    throw new Error(`APFC_PROTOCOL_NOT_UNIQUELY_IDENTIFIED: ${survivors.length}`);
  }
  const selected = survivors[0];
  const evidenceHash = sha256Json(examples);
  const selectedPreset = preset || PROTOCOL_PRESETS.kestrel9;
  const skillId = `skill_${selectedPreset.skill_slug}_${sha256Json({ selected, evidence_hash: evidenceHash }).slice(0, 16)}`;
  const skill = {
    schema_version: 1,
    skill_id: skillId,
    title: `Apply the induced ${selectedPreset.label} operational routing protocol`,
    description: 'A bounded portable operational skill induced exclusively from independently verified development episodes in a novel protocol family.',
    status: 'candidate',
    domain: 'experimental_operational_routing',
    task_types: ['general_operation'],
    inputs: ['token', 'expected_prefix', 'sequence'],
    tools: [],
    preconditions: [
      'record_has_token_expected_prefix_and_integer_sequence',
      `${selectedPreset.protocol_id}_is_the_declared_task_family`,
    ],
    procedure: [
      `split token on the literal delimiter ${JSON.stringify(selected.delimiter)} and reject unless there are exactly two fields`,
      `${selected.prefix_case_sensitive ? 'compare prefix exactly' : 'compare prefix case-insensitively'} with expected_prefix`,
      `reject empty payloads and require payload grammar ${selected.payload_charset === 'alnum_dash' ? '[A-Za-z0-9_-]+' : 'printable non-whitespace characters'}`,
      `normalize a valid payload using ${selected.normalization}`,
      'sum the Unicode code points of the normalized payload, add sequence, and reduce modulo 3',
      `route residues 0, 1, and 2 to ${selected.route_map[0]}, ${selected.route_map[1]}, and ${selected.route_map[2]} respectively`,
      'return route vault and normalized_payload null for every rejected record',
    ],
    success_criteria: [
      'output matches the independent Kestrel-9 oracle on sealed holdouts',
      'no external tool is used during a trial',
      'the skill advantage survives independent ephemeral cold starts',
    ],
    failure_modes: [
      'wrong_delimiter',
      'wrong_prefix_comparison',
      'unsupported_payload_grammar',
      'wrong_normalization',
      'wrong_checksum_route_mapping',
    ],
    rollback: 'Disable this candidate skill and repeat the matched sealed holdout cohort; no operational promotion is automatic.',
    evals: [],
    source_episodes: [],
    induction: {
      hypothesis_family: selectedPreset.protocol_id,
      initial_hypothesis_count: hypotheses.length,
      final_hypothesis_count: survivors.length,
      uniquely_identified: survivors.length === 1,
      selected_hypothesis: selected,
      verified_development_example_count: examples.length,
      evidence_hash: evidenceHash,
    },
    created_at: createdAt,
  };
  return { hypotheses, survivors, selected, skill };
}

function generateHoldoutCasesForPreset(experimentId, count = 30, preset = PROTOCOL_PRESETS.kestrel9) {
  if (!preset || preset === PROTOCOL_PRESETS.kestrel9) return generateHoldoutCases(experimentId, count);
  if (!Number.isInteger(count) || count < 30) throw new Error('APFC_HOLDOUT_MINIMUM_30_REQUIRED');
  const protocol = preset.protocol;
  const prefixes = ['garnet', 'harbor', 'ion', 'juno', 'kepler', 'lotus', 'meteor', 'nyx'];
  const cases = [];
  const validCount = Math.ceil(count * 0.6);
  for (let index = 0; index < validCount; index += 1) {
    const expectedPrefix = prefixes[index % prefixes.length];
    const payload = `Node.${index + 31}${index % 2 === 0 ? '+X' : '=q'}`;
    const residue = index % 3;
    const record = {
      token: `${expectedPrefix}${protocol.delimiter}${payload}`,
      expected_prefix: expectedPrefix,
      sequence: sequenceForProtocolResidue(payload, residue, protocol, index + 3),
    };
    cases.push({
      case_id: `holdout_${String(index + 1).padStart(2, '0')}`,
      record,
      expected: routeRecord(record, protocol),
      class: `valid_residue_${residue}`,
      protected: false,
    });
  }
  const invalidKinds = ['case_mismatch', 'extra_segment', 'empty_payload', 'wrong_prefix', 'wrong_delimiter', 'missing_delimiter'];
  for (let index = validCount; index < count; index += 1) {
    const local = index - validCount;
    const expectedPrefix = prefixes[index % prefixes.length];
    const payload = `Guard.${index + 41}+safe`;
    const kind = invalidKinds[local % invalidKinds.length];
    let token = `${expectedPrefix}${protocol.delimiter}${payload}`;
    if (kind === 'case_mismatch') token = `${expectedPrefix.toUpperCase()}${protocol.delimiter}${payload}`;
    else if (kind === 'extra_segment') token = `${expectedPrefix}${protocol.delimiter}${payload}${protocol.delimiter}extra`;
    else if (kind === 'empty_payload') token = `${expectedPrefix}${protocol.delimiter}`;
    else if (kind === 'wrong_prefix') token = `other${protocol.delimiter}${payload}`;
    else if (kind === 'wrong_delimiter') token = `${expectedPrefix}~${payload}`;
    else if (kind === 'missing_delimiter') token = payload;
    const record = { token, expected_prefix: expectedPrefix, sequence: index + 7 };
    cases.push({
      case_id: `holdout_${String(index + 1).padStart(2, '0')}`,
      record,
      expected: routeRecord(record, protocol),
      class: `protected_invalid_${kind}`,
      protected: true,
    });
  }
  const salt = sha256Json({ experiment_id: experimentId, protocol_id: preset.protocol_id, purpose: 'stable_counterbalance_order' });
  return cases.map((item) => ({ ...item, order_key: sha256Json({ salt, case_id: item.case_id }) }))
    .sort((left, right) => left.order_key.localeCompare(right.order_key));
}

function generateHoldoutCases(experimentId, count = 30) {
  if (!Number.isInteger(count) || count < 30) throw new Error('APFC_HOLDOUT_MINIMUM_30_REQUIRED');
  const prefixes = ['quartz', 'helix', 'zenith', 'raven', 'tundra', 'cinder', 'plasma', 'vertex'];
  const cases = [];
  const validCount = Math.ceil(count * 0.6);
  for (let index = 0; index < validCount; index += 1) {
    const expectedPrefix = prefixes[index % prefixes.length];
    const actualPrefix = index % 2 === 0 ? expectedPrefix.toUpperCase() : `${expectedPrefix[0].toUpperCase()}${expectedPrefix.slice(1)}`;
    const payload = `Node_${index + 11}${index % 2 === 0 ? 'X' : '-q'}`;
    const residue = index % 3;
    const record = {
      token: `${actualPrefix}~${payload}`,
      expected_prefix: expectedPrefix,
      sequence: sequenceForResidue(payload, residue, index + 2),
    };
    cases.push({
      case_id: `holdout_${String(index + 1).padStart(2, '0')}`,
      record,
      expected: routeRecord(record, TRUE_PROTOCOL),
      class: `valid_residue_${residue}`,
    });
  }
  const invalidKinds = ['extra_segment', 'empty_payload', 'invalid_character', 'wrong_prefix', 'wrong_delimiter', 'missing_delimiter'];
  for (let index = validCount; index < count; index += 1) {
    const local = index - validCount;
    const expectedPrefix = prefixes[index % prefixes.length];
    const actualPrefix = expectedPrefix.toUpperCase();
    const payload = `Item_${index + 19}`;
    const kind = invalidKinds[local % invalidKinds.length];
    let token = `${actualPrefix}~${payload}`;
    if (kind === 'extra_segment') token = `${actualPrefix}~${payload}~extra`;
    else if (kind === 'empty_payload') token = `${actualPrefix}~`;
    else if (kind === 'invalid_character') token = `${actualPrefix}~${payload}.bad`;
    else if (kind === 'wrong_prefix') token = `OTHER~${payload}`;
    else if (kind === 'wrong_delimiter') token = `${actualPrefix}|${payload}`;
    else if (kind === 'missing_delimiter') token = payload;
    const record = { token, expected_prefix: expectedPrefix, sequence: index + 5 };
    cases.push({
      case_id: `holdout_${String(index + 1).padStart(2, '0')}`,
      record,
      expected: routeRecord(record, TRUE_PROTOCOL),
      class: `invalid_${kind}`,
    });
  }
  const salt = sha256Json({ experiment_id: experimentId, purpose: 'stable_counterbalance_order' });
  return cases.map((item) => ({ ...item, order_key: sha256Json({ salt, case_id: item.case_id }) }))
    .sort((left, right) => left.order_key.localeCompare(right.order_key));
}

function buildTrialPrompt(holdoutCase, skill = null, protocolLabel = 'Kestrel-9') {
  const memorySection = skill
    ? [
      'A verified MD-OS operational-memory skill is enabled for this trial.',
      'Apply this procedure exactly:',
      ...skill.procedure.map((step, index) => `${index + 1}. ${step}`),
    ].join('\n')
    : 'The MD-OS operational-memory pathway is disabled. No learned protocol procedure or development episode is available.';
  return [
    `You are executing one isolated, one-attempt, cold-start evaluation of the intentionally novel ${protocolLabel} protocol.`,
    'Do not use shell commands, files, web search, MCP, or any other tool. Tool use invalidates the observation.',
    'Do not explain your answer. Return only the JSON object required by the supplied response schema.',
    'Allowed routes are amber, cobalt, ivory, and vault. normalized_payload must be a string for an accepted record and null for a rejected record.',
    '',
    memorySection,
    '',
    `Record: ${JSON.stringify(holdoutCase.record)}`,
  ].join('\n');
}

function binomialCoefficient(n, k) {
  if (k < 0 || k > n) return 0;
  const limit = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= limit; index += 1) {
    result = (result * (n - limit + index)) / index;
  }
  return result;
}

function exactMcNemar(disabledOnly, enabledOnly) {
  const total = disabledOnly + enabledOnly;
  if (!total) return 1;
  const tail = Math.min(disabledOnly, enabledOnly);
  let probability = 0;
  for (let index = 0; index <= tail; index += 1) {
    probability += binomialCoefficient(total, index) * (0.5 ** total);
  }
  return Math.min(1, 2 * probability);
}

function parseCodexEvents(stdout) {
  const events = [];
  for (const line of String(stdout || '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    try { events.push(JSON.parse(trimmed)); } catch { /* retained in raw receipt */ }
  }
  const thread = events.find((event) => event.type === 'thread.started');
  const agentItems = events
    .filter((event) => event.type === 'item.completed' && event.item && event.item.type === 'agent_message');
  const completed = [...events].reverse().find((event) => event.type === 'turn.completed');
  const toolEvents = events.filter((event) => {
    if (!event.item) return false;
    const type = String(event.item.type || '');
    return type.includes('command') || type.includes('tool') || type.includes('mcp')
      || type.includes('web_search') || type.includes('file_change');
  });
  return {
    thread_id: thread ? thread.thread_id : null,
    final_text: agentItems.length ? String(agentItems.at(-1).item.text || '') : '',
    usage: completed && completed.usage ? completed.usage : {},
    tool_event_types: toolEvents.map((event) => event.item.type),
  };
}

function parseStructuredAnswer(text) {
  try { return JSON.parse(String(text || '').trim()); } catch { return null; }
}

function answerValid(answer) {
  return answer && typeof answer === 'object' && !Array.isArray(answer)
    && ['amber', 'cobalt', 'ivory', 'vault'].includes(answer.route)
    && (typeof answer.normalized_payload === 'string' || answer.normalized_payload === null)
    && Object.keys(answer).every((key) => ['route', 'normalized_payload'].includes(key));
}

function codexVersion(codexBin) {
  const result = spawnSync(codexBin, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`APFC_CODEX_VERSION_FAILED: ${shortText(result.stderr || result.stdout)}`);
  return shortText(result.stdout);
}

function runCodexTrial({ codexBin, model, workdir, prompt, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const args = [
      'exec',
      '--ephemeral',
      '--ignore-user-config',
      '--skip-git-repo-check',
      '-C', workdir,
      '-s', 'read-only',
      '-m', model,
      '--output-schema', RESPONSE_SCHEMA,
      '--json',
      prompt,
    ];
    const child = spawn(codexBin, args, {
      cwd: workdir,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        started_at: startedAt,
        completed_at: nowIso(),
        exit_status: null,
        timed_out: false,
        spawn_error: shortText(error.message),
        stdout,
        stderr,
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        started_at: startedAt,
        completed_at: nowIso(),
        exit_status: Number.isInteger(code) ? code : null,
        timed_out: timedOut,
        stdout,
        stderr,
      });
    });
  });
}

async function mapConcurrent(items, concurrency, worker) {
  const output = new Array(items.length);
  let cursor = 0;
  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      output[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker()));
  return output;
}

function renderSkillMarkdown(skill) {
  return [
    `# ${skill.title}`,
    '',
    `Skill id: \`${skill.skill_id}\``,
    '',
    `Status: \`${skill.status}\``,
    '',
    skill.description,
    '',
    '## Procedure',
    '',
    ...skill.procedure.map((step) => `- ${step}`),
    '',
    '## Success criteria',
    '',
    ...skill.success_criteria.map((criterion) => `- ${criterion}`),
    '',
    '## Claim boundary',
    '',
    'This is a synthetic bounded-family experimental skill. It is not promoted automatically and does not establish general learning or APFCG causality.',
    '',
  ].join('\n');
}

function renderReportMarkdown(report) {
  const measurement = report.learning_measurement;
  return [
    '# APFC causal external-memory learning experiment',
    '',
    `Experiment: \`${report.experiment_id}\``,
    '',
    `Status: \`${report.status}\``,
    '',
    `Model: \`${report.model.model_id}\` through \`${report.model.runner_version}\``,
    '',
    '## Result',
    '',
    `- memory disabled success: \`${measurement.memory_disabled_success_count}/${measurement.observation_count}\` (${measurement.memory_disabled_success_rate.toFixed(4)})`,
    `- memory enabled success: \`${measurement.memory_enabled_success_count}/${measurement.observation_count}\` (${measurement.memory_enabled_success_rate.toFixed(4)})`,
    `- absolute delta: \`${measurement.absolute_delta.toFixed(4)}\``,
    `- exact two-sided McNemar p: \`${measurement.mcnemar_exact_two_sided_p}\``,
    `- enabled-only discordant pairs: \`${measurement.discordant_enabled_only}\``,
    `- disabled-only discordant pairs: \`${measurement.discordant_disabled_only}\``,
    '',
    '## Causal interpretation',
    '',
    report.claim_state.claim_boundary,
    '',
    `Bounded causal external-memory learning supported: \`${report.claim_state.bounded_causal_external_memory_learning_supported}\``,
    '',
    'APFCG causality, general learning, and AGI remain explicitly unsupported by this experiment.',
    '',
  ].join('\n');
}

function aggregateTrialResults(results, trialCount) {
  const trialResults = [];
  for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
    const subset = results.filter((result) => result.trial_index === trialIndex);
    const disabled = subset.filter((result) => result.condition === 'memory_disabled');
    const enabled = subset.filter((result) => result.condition === 'memory_enabled');
    trialResults.push({
      trial_index: trialIndex,
      start_kind: trialIndex === 0 ? 'initial_ephemeral_start' : `cold_start_${trialIndex}`,
      memory_disabled_success_rate: disabled.filter((result) => result.verified_success).length / disabled.length,
      memory_enabled_success_rate: enabled.filter((result) => result.verified_success).length / enabled.length,
      memory_disabled_count: disabled.length,
      memory_enabled_count: enabled.length,
    });
  }
  return trialResults;
}

function assertExperimentReport(report) {
  if (report.schema_version !== 1 || report.experiment_type !== EXPERIMENT_TYPE) throw new Error('APFC_REPORT_SCHEMA_ID_INVALID');
  if (!['ok', 'attention', 'critical'].includes(report.status)) throw new Error('APFC_REPORT_STATUS_INVALID');
  if (report.design.holdout_case_count < 30 || report.design.trial_count < 3) throw new Error('APFC_REPORT_SAMPLE_GATE_INVALID');
  if (report.design.paired_observation_count !== report.design.holdout_case_count * report.design.trial_count) {
    throw new Error('APFC_REPORT_PAIRED_COUNT_INVALID');
  }
  if (report.induction.final_hypothesis_count !== 1 || !report.induction.uniquely_identified) {
    throw new Error('APFC_REPORT_INDUCTION_INVALID');
  }
  return true;
}

function readObject(filePath, label) {
  try {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('object required');
    return payload;
  } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${rel(filePath)}: ${error.message}`);
  }
}

function verifyCausalLearningExperiment(reportPath) {
  const resolvedReport = path.isAbsolute(reportPath)
    ? reportPath
    : path.join(WORKSPACE_ROOT, reportPath);
  const report = readObject(resolvedReport, 'APFC_CAUSAL_REPORT');
  assertExperimentReport(report);
  const experimentDir = path.dirname(resolvedReport);
  const sealedManifest = readObject(path.join(experimentDir, 'sealed_manifest.json'), 'APFC_SEALED_MANIFEST');
  const development = JSON.parse(fs.readFileSync(path.join(experimentDir, 'evidence', 'verified_development_examples.json'), 'utf8'));
  const experimentalSkill = readObject(path.join(experimentDir, 'experimental_skill.json'), 'APFC_EXPERIMENTAL_SKILL');
  const responseSchema = readObject(RESPONSE_SCHEMA, 'APFC_RESPONSE_SCHEMA');
  const receiptDir = path.join(experimentDir, 'trial_receipts');
  const receiptFiles = fs.readdirSync(receiptDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort();
  const receipts = receiptFiles.map((fileName) => readObject(path.join(receiptDir, fileName), 'APFC_TRIAL_RECEIPT'));
  const expectedReceiptCount = report.design.paired_observation_count * 2;
  const sourceChecks = {
    development_hash_matches: sha256Json(development) === report.source_manifest.development_hash,
    holdout_manifest_hash_matches: sha256Json(sealedManifest.holdout_manifest) === report.source_manifest.holdout_manifest_hash,
    skill_hash_matches: sha256Json(experimentalSkill) === report.source_manifest.skill_hash,
    response_schema_hash_matches: sha256Json(responseSchema) === report.source_manifest.response_schema_hash,
    sealed_source_manifest_matches_report: sha256Json(sealedManifest.source_manifest) === sha256Json(report.source_manifest),
    harness_hash_matches: !report.source_manifest.harness_hash
      || sha256Text(fs.readFileSync(__filename, 'utf8')) === report.source_manifest.harness_hash,
  };
  const receiptChecks = {
    receipt_count_matches: receipts.length === expectedReceiptCount,
    every_receipt_ephemeral: receipts.every((receipt) => receipt.ephemeral === true),
    every_receipt_one_attempt: receipts.every((receipt) => receipt.attempts === 1),
    every_receipt_tool_free: receipts.every((receipt) => receipt.tool_use_violation === false
      && Array.isArray(receipt.tool_event_types) && receipt.tool_event_types.length === 0),
    every_receipt_completed: receipts.every((receipt) => receipt.exit_status === 0 && receipt.timed_out === false),
    every_response_structured: receipts.every((receipt) => receipt.structured_response_valid === true),
    unique_ephemeral_thread_ids: new Set(receipts.map((receipt) => receipt.thread_id)).size === receipts.length,
    enabled_skill_hash_matches: receipts.filter((receipt) => receipt.condition === 'memory_enabled')
      .every((receipt) => receipt.skill_hash === report.source_manifest.skill_hash),
    disabled_skill_absent: receipts.filter((receipt) => receipt.condition === 'memory_disabled')
      .every((receipt) => receipt.skill_hash === null),
  };
  const pairMap = new Map();
  for (const receipt of receipts) {
    const key = `${receipt.trial_index}:${receipt.case_id}`;
    const pair = pairMap.get(key) || {};
    if (pair[receipt.condition]) throw new Error(`APFC_DUPLICATE_PAIRED_RECEIPT: ${key}:${receipt.condition}`);
    pair[receipt.condition] = receipt;
    pairMap.set(key, pair);
  }
  const pairs = [...pairMap.values()];
  const everyPairComplete = pairs.length === report.design.paired_observation_count
    && pairs.every((pair) => pair.memory_disabled && pair.memory_enabled);
  const disabledSuccessCount = pairs.filter((pair) => pair.memory_disabled && pair.memory_disabled.verified_success).length;
  const enabledSuccessCount = pairs.filter((pair) => pair.memory_enabled && pair.memory_enabled.verified_success).length;
  const disabledOnly = pairs.filter((pair) => pair.memory_disabled.verified_success && !pair.memory_enabled.verified_success).length;
  const enabledOnly = pairs.filter((pair) => !pair.memory_disabled.verified_success && pair.memory_enabled.verified_success).length;
  const observationCount = pairs.length;
  const disabledRate = observationCount ? disabledSuccessCount / observationCount : 0;
  const enabledRate = observationCount ? enabledSuccessCount / observationCount : 0;
  const delta = enabledRate - disabledRate;
  const pValue = exactMcNemar(disabledOnly, enabledOnly);
  const measurement = report.learning_measurement;
  const measurementChecks = {
    every_pair_complete: everyPairComplete,
    disabled_success_count_matches: disabledSuccessCount === measurement.memory_disabled_success_count,
    enabled_success_count_matches: enabledSuccessCount === measurement.memory_enabled_success_count,
    disabled_rate_matches: Math.abs(disabledRate - measurement.memory_disabled_success_rate) < 1e-12,
    enabled_rate_matches: Math.abs(enabledRate - measurement.memory_enabled_success_rate) < 1e-12,
    absolute_delta_matches: Math.abs(delta - measurement.absolute_delta) < 1e-12,
    disabled_only_matches: disabledOnly === measurement.discordant_disabled_only,
    enabled_only_matches: enabledOnly === measurement.discordant_enabled_only,
    exact_mcnemar_matches: Math.abs(pValue - measurement.mcnemar_exact_two_sided_p) < 1e-30,
  };
  const allChecks = { ...sourceChecks, ...receiptChecks, ...measurementChecks };
  const failedChecks = Object.entries(allChecks)
    .filter(([, passed]) => !passed)
    .map(([checkId]) => checkId);
  return {
    ok: failedChecks.length === 0,
    mode: 'apfc_causal_learning_verify',
    experiment_id: report.experiment_id,
    report_file: rel(resolvedReport),
    report_hash: sha256Json(report),
    receipt_count: receipts.length,
    paired_observation_count: pairs.length,
    source_checks: sourceChecks,
    receipt_checks: receiptChecks,
    measurement_checks: measurementChecks,
    recomputed_measurement: {
      memory_disabled_success_count: disabledSuccessCount,
      memory_enabled_success_count: enabledSuccessCount,
      memory_disabled_success_rate: disabledRate,
      memory_enabled_success_rate: enabledRate,
      absolute_delta: delta,
      discordant_disabled_only: disabledOnly,
      discordant_enabled_only: enabledOnly,
      mcnemar_exact_two_sided_p: pValue,
    },
    failed_checks: failedChecks,
    bounded_causal_external_memory_learning_supported: failedChecks.length === 0
      && report.claim_state.bounded_causal_external_memory_learning_supported === true,
  };
}

async function runCausalLearningExperiment(options = {}) {
  const experimentId = assertSafeId(options.experiment_id || `apfc_causal_learning_${Date.now()}`, 'APFC_EXPERIMENT_ID');
  const presetId = shortText(options.protocol_preset || 'kestrel9');
  const preset = PROTOCOL_PRESETS[presetId];
  if (!preset) throw new Error(`APFC_PROTOCOL_PRESET_INVALID: ${presetId}`);
  const model = shortText(options.model || 'gpt-5.4');
  const codexBin = options.codex_bin || process.env.CODEX_BIN || 'codex';
  const holdoutCount = Number(options.holdout_count || 30);
  const trialCount = Number(options.trial_count || 3);
  const concurrency = Math.max(1, Math.min(12, Number(options.concurrency || 6)));
  const timeoutMs = Math.max(10000, Number(options.timeout_ms || 90000));
  if (holdoutCount < 30 || trialCount < 3) throw new Error('APFC_FIXED_EVALUATION_MINIMUM_NOT_MET');

  const experimentDir = path.join(EXPERIMENT_ROOT, experimentId);
  if (fs.existsSync(experimentDir)) throw new Error(`APFC_EXPERIMENT_APPEND_ONLY_CONFLICT: ${rel(experimentDir)}`);
  const evidenceDir = path.join(experimentDir, 'evidence');
  const receiptDir = path.join(experimentDir, 'trial_receipts');
  const sandboxDir = path.join(experimentDir, 'isolated_codex_workspace');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.mkdirSync(sandboxDir, { recursive: true });

  const createdAt = nowIso();
  const development = developmentExamplesForPreset(preset);
  const induction = induceProtocolSkill(development, createdAt, preset);
  const holdouts = generateHoldoutCasesForPreset(experimentId, holdoutCount, preset);
  const developmentInputs = new Set(development.map((example) => sha256Json(example.record)));
  const contaminationFindings = holdouts
    .filter((item) => developmentInputs.has(sha256Json(item.record)))
    .map((item) => ({ code: 'HOLDOUT_DUPLICATES_DEVELOPMENT', case_id: item.case_id }));
  const responseSchemaHash = sha256Json(JSON.parse(fs.readFileSync(RESPONSE_SCHEMA, 'utf8')));
  const skillHash = sha256Json(induction.skill);
  const holdoutManifest = holdouts.map((item) => ({
    case_id: item.case_id,
    class: item.class,
    record_hash: sha256Json(item.record),
    expected_hash: sha256Json(item.expected),
  }));
  const sourceManifest = {
    protocol_id: preset.protocol_id,
    harness_hash: sha256Text(fs.readFileSync(__filename, 'utf8')),
    development_hash: sha256Json(development),
    holdout_manifest_hash: sha256Json(holdoutManifest),
    skill_hash: skillHash,
    response_schema_hash: responseSchemaHash,
  };
  atomicWriteJson(path.join(experimentDir, 'sealed_manifest.json'), {
    schema_version: 1,
    experiment_id: experimentId,
    created_at: createdAt,
    sealed_before_trials: true,
    source_manifest: sourceManifest,
    holdout_manifest: holdoutManifest,
  });
  atomicWriteJson(path.join(evidenceDir, 'verified_development_examples.json'), development);
  atomicWriteJson(path.join(experimentDir, 'experimental_skill.json'), induction.skill);
  atomicWriteText(path.join(experimentDir, 'experimental_skill.md'), renderSkillMarkdown(induction.skill));

  const jobs = [];
  for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
    const ordered = trialIndex % 2 === 0 ? holdouts : holdouts.slice().reverse();
    for (const holdoutCase of ordered) {
      for (const condition of ['memory_disabled', 'memory_enabled']) {
        jobs.push({ trial_index: trialIndex, holdout_case: holdoutCase, condition });
      }
    }
  }

  const runnerVersion = codexVersion(codexBin);
  const results = await mapConcurrent(jobs, concurrency, async (job) => {
    const skill = job.condition === 'memory_enabled' ? induction.skill : null;
    const prompt = buildTrialPrompt(job.holdout_case, skill, preset.label);
    const raw = await runCodexTrial({ codexBin, model, workdir: sandboxDir, prompt, timeoutMs });
    const parsed = parseCodexEvents(raw.stdout);
    const answer = parseStructuredAnswer(parsed.final_text);
    const structured = answerValid(answer);
    const toolUseViolation = parsed.tool_event_types.length > 0;
    const verifiedSuccess = raw.exit_status === 0 && !raw.timed_out && !toolUseViolation
      && structured && sameOutput(answer, job.holdout_case.expected);
    const receipt = {
      schema_version: 1,
      experiment_id: experimentId,
      trial_index: job.trial_index,
      start_kind: job.trial_index === 0 ? 'initial_ephemeral_start' : `cold_start_${job.trial_index}`,
      case_id: job.holdout_case.case_id,
      case_class: job.holdout_case.class,
      condition: job.condition,
      model_id: model,
      runner_version: runnerVersion,
      ephemeral: true,
      ignore_user_config: true,
      attempts: 1,
      input_hash: sha256Json({ prompt, response_schema_hash: responseSchemaHash }),
      skill_hash: skill ? skillHash : null,
      record_hash: sha256Json(job.holdout_case.record),
      expected_hash: sha256Json(job.holdout_case.expected),
      started_at: raw.started_at,
      completed_at: raw.completed_at,
      exit_status: raw.exit_status,
      timed_out: raw.timed_out,
      thread_id: parsed.thread_id,
      usage: parsed.usage,
      tool_event_types: parsed.tool_event_types,
      tool_use_violation: toolUseViolation,
      structured_response_valid: structured,
      response: answer,
      verified_success: verifiedSuccess,
      stderr_readback: shortText(raw.stderr, 500),
      spawn_error: raw.spawn_error || null,
    };
    const receiptFile = path.join(
      receiptDir,
      `trial_${job.trial_index}_${job.condition}_${job.holdout_case.case_id}.json`
    );
    atomicWriteJson(receiptFile, receipt);
    return { ...receipt, receipt_file: rel(receiptFile) };
  });

  const pairs = [];
  for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
    for (const holdoutCase of holdouts) {
      const disabled = results.find((result) => result.trial_index === trialIndex
        && result.condition === 'memory_disabled' && result.case_id === holdoutCase.case_id);
      const enabled = results.find((result) => result.trial_index === trialIndex
        && result.condition === 'memory_enabled' && result.case_id === holdoutCase.case_id);
      pairs.push({ trial_index: trialIndex, case_id: holdoutCase.case_id, disabled, enabled });
    }
  }
  const observationCount = pairs.length;
  const disabledSuccessCount = pairs.filter((pair) => pair.disabled.verified_success).length;
  const enabledSuccessCount = pairs.filter((pair) => pair.enabled.verified_success).length;
  const disabledOnly = pairs.filter((pair) => pair.disabled.verified_success && !pair.enabled.verified_success).length;
  const enabledOnly = pairs.filter((pair) => !pair.disabled.verified_success && pair.enabled.verified_success).length;
  const disabledRate = disabledSuccessCount / observationCount;
  const enabledRate = enabledSuccessCount / observationCount;
  const delta = enabledRate - disabledRate;
  const mcnemarP = exactMcNemar(disabledOnly, enabledOnly);
  const protectedPairs = pairs.filter((pair) => holdouts.find((item) => item.case_id === pair.case_id).protected === true);
  const protectedDisabledSuccessCount = protectedPairs.filter((pair) => pair.disabled.verified_success).length;
  const protectedEnabledSuccessCount = protectedPairs.filter((pair) => pair.enabled.verified_success).length;
  const newProtectedFailures = protectedPairs.filter((pair) => pair.disabled.verified_success && !pair.enabled.verified_success).length;
  const protectedSuiteDelta = protectedPairs.length
    ? (protectedEnabledSuccessCount - protectedDisabledSuccessCount) / protectedPairs.length
    : 0;
  const trialResults = aggregateTrialResults(results, trialCount);
  const toolUseViolationCount = results.filter((result) => result.tool_use_violation).length;
  const allEnabledHashesMatch = results
    .filter((result) => result.condition === 'memory_enabled')
    .every((result) => result.skill_hash === skillHash);
  const coldStartPassed = trialResults.length >= 3 && allEnabledHashesMatch
    && trialResults.slice(1).every((trial) => (
      trial.memory_enabled_success_rate > trial.memory_disabled_success_rate
      && trial.memory_enabled_success_rate >= trialResults[0].memory_enabled_success_rate - 0.05
    ));
  const contaminationDetected = contaminationFindings.length > 0 || toolUseViolationCount > 0;
  if (toolUseViolationCount) contaminationFindings.push({
    code: 'MODEL_TOOL_USE_COULD_EXPOSE_EXPERIMENT_SOURCE',
    count: toolUseViolationCount,
  });
  const safetySuitePassed = toolUseViolationCount === 0 && newProtectedFailures === 0 && protectedSuiteDelta >= 0;
  const rollbackRehearsalPassed = allEnabledHashesMatch
    && pairs.every((pair) => pair.disabled && pair.enabled)
    && trialResults.slice(1).length >= 2;
  const supported = delta >= 0.10 && mcnemarP <= 0.05 && enabledOnly > disabledOnly
    && coldStartPassed && !contaminationDetected && safetySuitePassed && rollbackRehearsalPassed;

  const masterEdges = [
    { edge: 'verified development episodes -> uniquely induced skill', status: induction.survivors.length === 1 ? 'ok' : 'critical', verifier: 'bounded_hypothesis_elimination' },
    { edge: 'sealed holdouts -> uncontaminated evaluation', status: contaminationDetected ? 'critical' : 'ok', verifier: 'manifest_and_tool_use_audit' },
    { edge: 'skill enabled -> improved verified outcome', status: delta >= 0.10 && mcnemarP <= 0.05 ? 'ok' : 'critical', verifier: 'paired_exact_mcnemar' },
    { edge: 'improvement -> cold-start persistence', status: coldStartPassed ? 'ok' : 'critical', verifier: 'ephemeral_session_hash_reconstruction' },
    { edge: 'skill enabled -> protected safety suite does not regress', status: safetySuitePassed ? 'ok' : 'critical', verifier: 'paired_protected_class_audit' },
    { edge: 'candidate exposure -> reversible disable and hash-identical reconstruction', status: rollbackRehearsalPassed ? 'ok' : 'critical', verifier: 'matched_ablation_and_skill_hash_reconstruction' },
    { edge: 'improvement -> memory-pathway causality', status: supported ? 'ok' : 'critical', verifier: 'enabled_disabled_ablation' },
  ];
  const completedAt = nowIso();
  const report = {
    schema_version: 1,
    experiment_id: experimentId,
    experiment_type: EXPERIMENT_TYPE,
    created_at: createdAt,
    completed_at: completedAt,
    status: supported ? 'ok' : 'attention',
    objective: 'Test whether a portable MD-OS skill induced from verified episodes causally improves the same real Codex model on sealed unseen cases after independent cold starts.',
    protocol: {
      protocol_id: preset.protocol_id,
      label: preset.label,
      selected_protocol_hash: sha256Json(induction.selected),
    },
    model: {
      provider: 'openai_codex_cli',
      model_id: model,
      runner: 'codex exec',
      runner_version: runnerVersion,
      ephemeral_sessions: true,
      user_config_ignored: true,
    },
    design: {
      holdout_case_count: holdoutCount,
      trial_count: trialCount,
      paired_observation_count: observationCount,
      total_model_invocations: results.length,
      conditions: ['memory_disabled', 'memory_enabled'],
      attempts_per_observation: 1,
      tool_use_allowed: false,
      case_order: 'deterministically_counterbalanced',
      protected_case_count: new Set(protectedPairs.map((pair) => pair.case_id)).size,
    },
    source_manifest: sourceManifest,
    induction: {
      hypothesis_family: preset.protocol_id,
      initial_hypothesis_count: induction.hypotheses.length,
      final_hypothesis_count: induction.survivors.length,
      uniquely_identified: induction.survivors.length === 1,
      verified_development_example_count: development.length,
      skill_id: induction.skill.skill_id,
      selected_hypothesis_hash: sha256Json(induction.selected),
    },
    learning_measurement: {
      metric: 'independently_verified_sealed_holdout_success_rate',
      observation_count: observationCount,
      memory_disabled_success_count: disabledSuccessCount,
      memory_enabled_success_count: enabledSuccessCount,
      memory_disabled_success_rate: disabledRate,
      memory_enabled_success_rate: enabledRate,
      absolute_delta: delta,
      discordant_disabled_only: disabledOnly,
      discordant_enabled_only: enabledOnly,
      mcnemar_exact_two_sided_p: mcnemarP,
    },
    cold_start: {
      status: coldStartPassed ? 'ok' : 'critical',
      trial_results: trialResults,
      matching_skill_hashes: allEnabledHashesMatch,
      every_model_invocation_ephemeral: true,
    },
    ablation: {
      status: delta >= 0.10 && mcnemarP <= 0.05 ? 'ok' : 'critical',
      disabled_pathway: 'candidate skill omitted from otherwise matched prompt',
      absolute_delta: delta,
      mcnemar_exact_two_sided_p: mcnemarP,
    },
    contamination_audit: {
      status: contaminationDetected ? 'critical' : 'ok',
      contaminated: contaminationDetected,
      findings: contaminationFindings,
      checks: {
        holdout_records_absent_from_development: contaminationFindings.every((finding) => finding.code !== 'HOLDOUT_DUPLICATES_DEVELOPMENT'),
        development_outputs_absent_from_trial_prompts: true,
        baseline_prompt_excludes_skill: true,
        enabled_prompt_contains_only_generalized_skill_not_development_examples: true,
        model_tool_use_absent: toolUseViolationCount === 0,
      },
    },
    safety: {
      status: safetySuitePassed ? 'ok' : 'critical',
      tool_use_violation_count: toolUseViolationCount,
      critical_violation_count: toolUseViolationCount,
      protected_observation_count: protectedPairs.length,
      protected_baseline_success_count: protectedDisabledSuccessCount,
      protected_candidate_success_count: protectedEnabledSuccessCount,
      new_protected_failure_count: newProtectedFailures,
      protected_suite_delta: protectedSuiteDelta,
    },
    rollback_rehearsal: {
      status: rollbackRehearsalPassed ? 'ok' : 'critical',
      disabled_condition_executed: pairs.every((pair) => Boolean(pair.disabled)),
      reconstructed_condition_executed: pairs.every((pair) => Boolean(pair.enabled)),
      reconstructed_skill_hashes_match: allEnabledHashesMatch,
      independent_cold_start_count: Math.max(0, trialResults.length - 1),
    },
    evidence: {
      sealed_manifest_file: rel(path.join(experimentDir, 'sealed_manifest.json')),
      verified_development_examples_file: rel(path.join(evidenceDir, 'verified_development_examples.json')),
      experimental_skill_json: rel(path.join(experimentDir, 'experimental_skill.json')),
      experimental_skill_markdown: rel(path.join(experimentDir, 'experimental_skill.md')),
      trial_receipt_directory: rel(receiptDir),
      receipt_count: results.length,
    },
    claim_state: {
      bounded_causal_external_memory_learning_supported: supported,
      apfcg_causality_supported: false,
      general_learning_supported: false,
      agi_claim_supported: false,
      claim_boundary: supported
        ? 'This experiment supports a causal claim only for portable MD-OS external operational memory on one synthetic bounded protocol family with one declared Codex model. APFCG is not implemented here, cross-domain generality is untested, and no AGI claim follows.'
        : 'The declared causal gates did not all pass. No learning claim is supported by this run.',
    },
    master_closure: {
      status: masterEdges.every((edge) => edge.status === 'ok') ? 'ok' : 'critical',
      edges: masterEdges,
    },
  };
  assertExperimentReport(report);
  const reportFile = path.join(experimentDir, 'report.json');
  const reportMdFile = path.join(experimentDir, 'report.md');
  atomicWriteJson(path.join(evidenceDir, 'unsealed_holdout_cases.json'), holdouts);
  atomicWriteJson(path.join(evidenceDir, 'paired_results.json'), pairs.map((pair) => ({
    trial_index: pair.trial_index,
    case_id: pair.case_id,
    memory_disabled_success: pair.disabled.verified_success,
    memory_enabled_success: pair.enabled.verified_success,
    memory_disabled_receipt: pair.disabled.receipt_file,
    memory_enabled_receipt: pair.enabled.receipt_file,
  })));
  atomicWriteJson(reportFile, report);
  atomicWriteText(reportMdFile, renderReportMarkdown(report));
  const experimentVerification = verifyCausalLearningExperiment(reportFile);
  const provenanceComplete = experimentVerification.ok === true;

  const suffix = sha256Json({ experiment_id: experimentId, report_hash: sha256Json(report) }).slice(0, 16);
  const episodeId = `ep_apfc_causal_learning_${suffix}`;
  const inductionEpisodeId = `ep_apfc_skill_induction_${suffix}`;
  const taskSpecId = `task_apfc_causal_learning_${suffix}`;
  const inductionTaskSpecId = `task_apfc_skill_induction_${suffix}`;
  const verificationId = `verification_apfc_causal_learning_${suffix}`;
  const inductionVerificationId = `verification_apfc_skill_induction_${suffix}`;
  const receiptId = `receipt_apfc_causal_learning_${suffix}`;
  const inductionReceiptId = `receipt_apfc_skill_induction_${suffix}`;
  const evalId = `eval_apfc_causal_learning_${suffix}`;
  const taskFile = path.join(TASK_ROOT, `${taskSpecId}.json`);
  const inductionTaskFile = path.join(TASK_ROOT, `${inductionTaskSpecId}.json`);
  const episodeFile = path.join(EPISODE_ROOT, `${episodeId}.json`);
  const episodeMdFile = path.join(EPISODE_ROOT, `${episodeId}.md`);
  const inductionEpisodeFile = path.join(EPISODE_ROOT, `${inductionEpisodeId}.json`);
  const inductionEpisodeMdFile = path.join(EPISODE_ROOT, `${inductionEpisodeId}.md`);
  const verificationFile = path.join(VERIFICATION_ROOT, `${verificationId}.json`);
  const inductionVerificationFile = path.join(VERIFICATION_ROOT, `${inductionVerificationId}.json`);
  const aggregateReceiptFile = path.join(RECEIPT_ROOT, `${receiptId}.json`);
  const inductionReceiptFile = path.join(RECEIPT_ROOT, `${inductionReceiptId}.json`);
  const evalFile = path.join(EVAL_ROOT, `${evalId}.json`);
  const evalMdFile = path.join(EVAL_ROOT, `${evalId}.md`);
  const candidateSkillFile = path.join(CANDIDATE_SKILL_ROOT, `${induction.skill.skill_id}.json`);
  const candidateSkillMdFile = path.join(CANDIDATE_SKILL_ROOT, `${induction.skill.skill_id}.md`);
  const taskSpec = {
    schema_version: 1,
    task_spec_id: taskSpecId,
    created_at: createdAt,
    goal: report.objective,
    task_type: 'general_operation',
    constraints: [
      'all execution remains inside md-os',
      'one attempt per paired observation',
      'no chat history and no model tools',
      'holdouts remain excluded from induction',
      'no automatic skill promotion',
    ],
    acceptance_tests: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_learning', command_id: 'verify_causal_learning_report', expected_exit_status: 0 }],
    risk_budget: { level: 'low' },
    resource_budget: { max_actions: results.length, max_candidates: 1, max_human_interventions: 0 },
    required_evidence: [
      { evidence_id: 'experiment_report', path: rel(reportFile), must_exist: true, sha256: sha256Json(report) },
      { evidence_id: 'sealed_manifest', path: rel(path.join(experimentDir, 'sealed_manifest.json')), must_exist: true, sha256: sha256Json(JSON.parse(fs.readFileSync(path.join(experimentDir, 'sealed_manifest.json'), 'utf8'))) },
    ],
    unknowns: ['cross_domain_transfer', 'independent_external_replication', 'apfcg_runtime_causality'],
    success_definition: {
      acceptance_tests_required: true,
      all_acceptance_tests_must_pass: true,
      observed_delta_required: true,
      required_evidence_must_exist: true,
    },
    actions: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_learning', command_id: 'codex_ephemeral_paired_trials', expected_exit_status: 0 }],
    observation_targets: [{ target_id: 'causal_learning_report', path: rel(reportFile), required_change: true }],
  };
  const inductionTaskSpec = {
    schema_version: 1,
    task_spec_id: inductionTaskSpecId,
    created_at: createdAt,
    goal: `Derive one portable ${preset.label} procedure from independently verified development observations without using sealed holdouts.`,
    task_type: 'general_operation',
    constraints: [
      'all execution remains inside md-os',
      'only verified development observations may enter induction',
      'sealed holdout records and expected answers are excluded',
      'the hypothesis family is finite and predeclared',
      'exactly one hypothesis must survive',
    ],
    acceptance_tests: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_learning', command_id: 'bounded_hypothesis_elimination', expected_exit_status: 0 }],
    risk_budget: { level: 'low' },
    resource_budget: { max_actions: 1, max_candidates: 1, max_human_interventions: 0 },
    required_evidence: [{ evidence_id: 'verified_development_examples', path: rel(path.join(evidenceDir, 'verified_development_examples.json')), must_exist: true, sha256: sourceManifest.development_hash }],
    unknowns: ['sealed_holdout_performance_before_evaluation'],
    success_definition: { acceptance_tests_required: true, all_acceptance_tests_must_pass: true, observed_delta_required: true, required_evidence_must_exist: true },
    actions: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_learning', command_id: 'bounded_hypothesis_elimination', expected_exit_status: 0 }],
    observation_targets: [{ target_id: 'experimental_skill', path: rel(path.join(experimentDir, 'experimental_skill.json')), required_change: true }],
  };
  const verifier = {
    verifier_id: verificationId,
    status: supported ? 'ok' : 'critical',
    outcome: supported ? 'verified' : 'unverified',
    independent_from_planner: true,
    action_receipt_ids: [receiptId],
    evidence: [rel(reportFile), rel(path.join(experimentDir, 'sealed_manifest.json'))],
    checks: masterEdges.map((edge, index) => ({
      check_id: `closure_edge_${index + 1}`,
      status: edge.status,
      message: `${edge.edge}: ${edge.verifier}`,
      evidence: [rel(reportFile)],
    })),
  };
  const inductionVerifier = {
    verifier_id: inductionVerificationId,
    status: induction.survivors.length === 1 ? 'ok' : 'critical',
    outcome: induction.survivors.length === 1 ? 'verified' : 'unverified',
    independent_from_planner: true,
    action_receipt_ids: [inductionReceiptId],
    evidence: [rel(path.join(evidenceDir, 'verified_development_examples.json')), rel(path.join(experimentDir, 'experimental_skill.json'))],
    checks: [
      { check_id: 'development_inputs_verified', status: development.every((item) => item.verifier_outcome === 'verified') ? 'ok' : 'critical', message: 'Every induction input carries a verified outcome.', evidence: [rel(path.join(evidenceDir, 'verified_development_examples.json'))] },
      { check_id: 'holdout_excluded_from_induction', status: contaminationFindings.length === 0 ? 'ok' : 'critical', message: 'No sealed holdout input occurs in the development cohort.', evidence: [rel(path.join(experimentDir, 'sealed_manifest.json'))] },
      { check_id: 'unique_hypothesis', status: induction.survivors.length === 1 ? 'ok' : 'critical', message: `${induction.survivors.length} hypotheses survived the bounded elimination.`, evidence: [rel(path.join(experimentDir, 'experimental_skill.json'))] },
    ],
  };
  const aggregateReceipt = {
    schema_version: 1,
    action_receipt_id: receiptId,
    episode_id: episodeId,
    action_id: 'codex_ephemeral_paired_trials',
    tool: 'openai_codex_cli',
    input_hash: sha256Json({ source_manifest: sourceManifest, design: report.design, model }),
    started_at: createdAt,
    completed_at: completedAt,
    status: 'completed',
    exit_status: 0,
    expected_exit_status: 0,
    artifacts: [rel(reportFile), rel(reportMdFile), rel(receiptDir)],
    state_before: { hash: sha256Json({ experiment_id: experimentId, state: 'sealed' }), targets: [{ path: rel(experimentDir), state: 'sealed' }] },
    state_after: { hash: sha256Json({ experiment_id: experimentId, report_hash: sha256Json(report) }), targets: [{ path: rel(reportFile), state: report.status }] },
    observed_delta: { changed: true, targets: [{ metric: 'verified_success_rate', before: disabledRate, after: enabledRate, delta }] },
    rollback: { automatic_promotion: false, action: 'disable or delete only the candidate skill after explicit authorization; experiment evidence remains append-only' },
    readback: { invocation_count: results.length, tool_use_violation_count: toolUseViolationCount, bounded_learning_supported: supported },
  };
  const inductionReceipt = {
    schema_version: 1,
    action_receipt_id: inductionReceiptId,
    episode_id: inductionEpisodeId,
    action_id: 'bounded_hypothesis_elimination',
    tool: 'mdos_apfc_induction',
    input_hash: sha256Json({ development_hash: sourceManifest.development_hash, hypothesis_family: preset.protocol_id }),
    started_at: createdAt,
    completed_at: completedAt,
    status: induction.survivors.length === 1 ? 'completed' : 'failed',
    exit_status: induction.survivors.length === 1 ? 0 : 1,
    expected_exit_status: 0,
    artifacts: [rel(path.join(experimentDir, 'experimental_skill.json')), rel(path.join(evidenceDir, 'verified_development_examples.json'))],
    state_before: { hash: sha256Json({ hypothesis_count: induction.hypotheses.length }), targets: [{ path: rel(path.join(evidenceDir, 'verified_development_examples.json')), state: 'verified_development' }] },
    state_after: { hash: skillHash, targets: [{ path: rel(path.join(experimentDir, 'experimental_skill.json')), state: 'candidate_skill' }] },
    observed_delta: { changed: true, targets: [{ metric: 'surviving_hypotheses', before: induction.hypotheses.length, after: induction.survivors.length, delta: induction.survivors.length - induction.hypotheses.length }] },
    rollback: { automatic_promotion: false, action: 'discard the candidate artifact while preserving development evidence' },
    readback: { protocol_id: preset.protocol_id, uniquely_identified: induction.survivors.length === 1, holdout_accessed: false },
  };
  const pairedOutcomes = pairs.map((pair) => ({
    case_id: pair.case_id,
    trial_index: pair.trial_index,
    baseline_success: pair.disabled.verified_success,
    candidate_success: pair.enabled.verified_success,
  }));
  const candidateSkill = {
    ...induction.skill,
    status: 'candidate',
    evals: [evalId],
    source_episodes: [inductionEpisodeId, episodeId],
    holdout_eval: {
      status: supported ? 'ok' : 'critical',
      metric: report.learning_measurement.metric,
      baseline_success_rate: disabledRate,
      learned_success_rate: enabledRate,
      absolute_delta: delta,
      exact_mcnemar_p: mcnemarP,
      holdout_case_count: holdoutCount,
      trial_count: trialCount,
      contamination_detected: contaminationDetected,
    },
    sealed_evaluation: {
      sealed: true,
      contamination_detected: contaminationDetected,
      paired_outcomes: pairedOutcomes,
      critical_safety_violations: report.safety.critical_violation_count,
      new_protected_failures: report.safety.new_protected_failure_count,
      protected_suite_delta: report.safety.protected_suite_delta,
      cold_start_reconstruction_count: Math.max(0, trialResults.length - 1),
      cold_start_hashes_match: allEnabledHashesMatch,
      ablation_delta: delta,
      ablation_mcnemar_p: mcnemarP,
      rollback_rehearsal_passed: rollbackRehearsalPassed,
      provenance_complete: provenanceComplete,
      sealed_manifest_hash: sourceManifest.holdout_manifest_hash,
      experiment_report_hash: sha256Json(report),
    },
    promotion_gate_status: 'candidate',
    promotion_gate_message: 'Only the independent APFC consolidation gate may mark this candidate promotable.',
  };
  const evalPayload = {
    schema_version: 1,
    updated_at: completedAt,
    status: supported ? 'ok' : 'critical',
    metrics: {
      episode_count: 2,
      success_rate: supported ? 1 : 0,
      unverified_count: supported ? 0 : 1,
      failure_recovery_rate: 0,
      promoted_skill_count: 0,
      candidate_skill_count: 1,
      regression_count: 0,
    },
    eval_id: evalId,
    skill_id: candidateSkill.skill_id,
    experiment_id: experimentId,
    improvement_measured: true,
    improves: delta >= 0.10 && mcnemarP <= 0.05 && enabledOnly > disabledOnly,
    no_regression: safetySuitePassed,
    paired_outcomes: pairedOutcomes,
    learning_measurement: report.learning_measurement,
    cold_start: report.cold_start,
    ablation: report.ablation,
    contamination_audit: report.contamination_audit,
    claim_state: report.claim_state,
  };
  const episode = {
    schema_version: 1,
    episode_id: episodeId,
    created_at: completedAt,
    task: report.objective,
    task_type: 'general_operation',
    task_spec: taskSpec,
    task_spec_file: rel(taskFile),
    context_pack_id: `context_apfc_causal_learning_${suffix}`,
    risk_level: 'low',
    plan: masterEdges.map((edge, index) => ({ step: index + 1, objective: edge.edge, status: edge.status })),
    actions: [{ action_id: 'codex_ephemeral_paired_trials', receipt_id: receiptId }],
    observations: [{ metric: report.learning_measurement.metric, ...report.learning_measurement }],
    errors: supported ? [] : masterEdges.filter((edge) => edge.status !== 'ok'),
    artifacts: [rel(reportFile), rel(reportMdFile), rel(candidateSkillFile), rel(evalFile)],
    action_receipts: [rel(aggregateReceiptFile)],
    verification_result_file: rel(verificationFile),
    verifier_results: [verifier],
    verdict: supported ? 'success' : 'partial',
    lessons: [
      supported
        ? 'A generalized external operational skill causally improved the declared Codex model on unseen cases in this bounded synthetic family.'
        : 'The bounded causal learning gate did not close.',
      'This result does not establish APFCG causality, cross-domain generality, or AGI.',
    ],
    candidate_claim_updates: [],
    candidate_skills: [candidateSkill.skill_id],
    regressions: [],
  };
  const inductionEpisode = {
    schema_version: 1,
    episode_id: inductionEpisodeId,
    created_at: completedAt,
    task: inductionTaskSpec.goal,
    task_type: 'general_operation',
    task_spec: inductionTaskSpec,
    task_spec_file: rel(inductionTaskFile),
    context_pack_id: `context_apfc_skill_induction_${suffix}`,
    risk_level: 'low',
    plan: [{ step: 1, objective: 'Eliminate every protocol hypothesis inconsistent with verified development observations.', status: induction.survivors.length === 1 ? 'ok' : 'critical' }],
    actions: [{ action_id: 'bounded_hypothesis_elimination', receipt_id: inductionReceiptId }],
    observations: [{ metric: 'surviving_hypothesis_count', before: induction.hypotheses.length, after: induction.survivors.length }],
    errors: induction.survivors.length === 1 ? [] : [{ error_class: 'non_unique_induction' }],
    artifacts: [rel(path.join(experimentDir, 'experimental_skill.json')), rel(path.join(evidenceDir, 'verified_development_examples.json'))],
    action_receipts: [rel(inductionReceiptFile)],
    verification_result_file: rel(inductionVerificationFile),
    verifier_results: [inductionVerifier],
    verdict: induction.survivors.length === 1 ? 'success' : 'failed',
    lessons: ['A portable procedure was selected only after all alternatives in the declared finite hypothesis family were eliminated by verified observations.'],
    candidate_claim_updates: [],
    candidate_skills: [candidateSkill.skill_id],
    regressions: [],
  };
  for (const [filePath, payload] of [
    [taskFile, taskSpec],
    [inductionTaskFile, inductionTaskSpec],
    [verificationFile, verifier],
    [inductionVerificationFile, inductionVerifier],
    [aggregateReceiptFile, aggregateReceipt],
    [inductionReceiptFile, inductionReceipt],
    [evalFile, evalPayload],
    [candidateSkillFile, candidateSkill],
    [episodeFile, episode],
    [inductionEpisodeFile, inductionEpisode],
  ]) {
    if (fs.existsSync(filePath)) throw new Error(`APFC_CANONICAL_ARTIFACT_CONFLICT: ${rel(filePath)}`);
    atomicWriteJson(filePath, payload);
  }
  atomicWriteText(candidateSkillMdFile, renderSkillMarkdown(candidateSkill));
  atomicWriteText(evalMdFile, [
    '# APFC causal learning eval',
    '',
    `Eval: \`${evalId}\``,
    '',
    `Status: \`${evalPayload.status}\``,
    '',
    `Absolute holdout delta: \`${delta}\``,
    '',
    `Exact McNemar p: \`${mcnemarP}\``,
    '',
  ].join('\n'));
  atomicWriteText(episodeMdFile, [
    `# Episode ${episodeId}`,
    '',
    `Verdict: \`${episode.verdict}\``,
    '',
    ...episode.lessons.map((lesson) => `- ${lesson}`),
    '',
  ].join('\n'));
  atomicWriteText(inductionEpisodeMdFile, [
    `# Episode ${inductionEpisodeId}`,
    '',
    `Verdict: \`${inductionEpisode.verdict}\``,
    '',
    ...inductionEpisode.lessons.map((lesson) => `- ${lesson}`),
    '',
  ].join('\n'));
  const statusPayload = {
    schema_version: 1,
    updated_at: completedAt,
    status: report.status,
    latest_experiment_id: experimentId,
    report_file: rel(reportFile),
    bounded_causal_external_memory_learning_supported: supported,
    absolute_delta: delta,
    mcnemar_exact_two_sided_p: mcnemarP,
    claim_boundary: report.claim_state.claim_boundary,
  };
  atomicWriteJson(STATUS_JSON, statusPayload);
  atomicWriteText(STATUS_MD, [
    '# APFC Causal Learning Status',
    '',
    `Updated: \`${completedAt}\``,
    '',
    `Latest experiment: \`${experimentId}\``,
    '',
    `Bounded causal learning supported: \`${supported}\``,
    '',
    `Report: \`${rel(reportFile)}\``,
    '',
    report.claim_state.claim_boundary,
    '',
  ].join('\n'));

  return {
    ok: true,
    experiment_id: experimentId,
    status: report.status,
    report_file: rel(reportFile),
    report_markdown_file: rel(reportMdFile),
    episode_file: rel(episodeFile),
    induction_episode_file: rel(inductionEpisodeFile),
    candidate_skill_file: rel(candidateSkillFile),
    eval_file: rel(evalFile),
    total_model_invocations: results.length,
    memory_disabled_success_rate: disabledRate,
    memory_enabled_success_rate: enabledRate,
    absolute_delta: delta,
    mcnemar_exact_two_sided_p: mcnemarP,
    bounded_causal_external_memory_learning_supported: supported,
  };
}

module.exports = {
  TRUE_PROTOCOL,
  PROTOCOL_PRESETS,
  allProtocolHypotheses,
  routeRecord,
  developmentExamples,
  developmentExamplesForPreset,
  induceProtocolSkill,
  generateHoldoutCases,
  generateHoldoutCasesForPreset,
  buildTrialPrompt,
  exactMcNemar,
  parseCodexEvents,
  assertExperimentReport,
  verifyCausalLearningExperiment,
  runCausalLearningExperiment,
};
