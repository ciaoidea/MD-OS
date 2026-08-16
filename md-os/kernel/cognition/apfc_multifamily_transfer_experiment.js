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
  shortText,
} = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText } = require('../../os/lib/fs_runtime');
const { buildSkillGraph, assertApfcGraph } = require('../../apfc/executive/graph_projector');
const {
  assertContextPack,
  compileContextPack,
  flatRetrieveSkills,
} = require('../../apfc/executive/context_compiler');
const {
  TARGET_FAMILIES,
  generateTargetCases,
  oracleForCase,
} = require('./apfc_multifamily_transfer_oracle');
const {
  exactMcNemar,
  parseCodexEvents,
} = require('./apfc_causal_learning_experiment');

const EXPERIMENT_TYPE = 'apfc_multifamily_compositional_transfer_v1';
const EXPERIMENT_ROOT = path.join(MDOS_ROOT, 'ops', 'agi', 'learning_experiments');
const RESPONSE_SCHEMA = path.join(MDOS_ROOT, 'schemas', 'apfc_multifamily_transfer_response.schema.json');
const TASK_ROOT = path.join(MDOS_ROOT, 'ops', 'tasks');
const EPISODE_ROOT = path.join(MDOS_ROOT, 'ops', 'episodes');
const VERIFICATION_ROOT = path.join(MDOS_ROOT, 'ops', 'verifications');
const RECEIPT_ROOT = path.join(MDOS_ROOT, 'ops', 'action_receipts');
const EVAL_ROOT = path.join(MDOS_ROOT, 'ops', 'evals');
const CONDITIONS = Object.freeze(['memory_disabled', 'flat_memory', 'apfcg_composed']);
const DEFAULT_MAX_INFRASTRUCTURE_FAILURE_RATE = 0.05;

function rel(filePath) {
  return path.relative(WORKSPACE_ROOT, filePath).replace(/\\/g, '/');
}

function sameValue(left, right) {
  return sha256Json(left) === sha256Json(right);
}

function normalizeText(value) {
  return String(value).trim().split(/\s+/).filter(Boolean).join('_').toLowerCase();
}

function signedBase36(value) {
  const number = Number(value);
  return number < 0
    ? `-${Math.abs(number).toString(36).toUpperCase()}`
    : number.toString(36).toUpperCase();
}

function candidate(id, procedure, apply) {
  return Object.freeze({ id, procedure, apply });
}

const PRIMITIVES = Object.freeze([
  Object.freeze({
    source_family_id: 'source_text_normalization', skill_id: 'skill_apfc_text_normalize',
    title: 'Normalize raw text into canonical underscore form', domain: 'text_transformation',
    input_type: 'text.raw', output_type: 'text.normalized', true_id: 'lower_underscore',
    inputs: ['  Red   BLUE ', 'One two THREE', '  Quartz\tNode  ', 'alpha'],
    candidates: Object.freeze([
      candidate('lower_underscore', 'Trim the raw string, collapse each ASCII whitespace run to one underscore, and lowercase every letter.', normalizeText),
      candidate('upper_dash', 'Trim the raw string, collapse whitespace to one dash, and uppercase every letter.', (value) => String(value).trim().split(/\s+/).filter(Boolean).join('-').toUpperCase()),
      candidate('lower_spaces', 'Trim and lowercase the raw string while preserving one space between tokens.', (value) => String(value).trim().split(/\s+/).filter(Boolean).join(' ').toLowerCase()),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_token_reversal', skill_id: 'skill_apfc_reverse_tokens',
    title: 'Reverse canonical token order', domain: 'text_transformation',
    input_type: 'text.normalized', output_type: 'text.tokens_reversed', true_id: 'reverse',
    inputs: ['red_blue_green', 'one_two', 'alpha_beta_gamma_delta', 'single'],
    candidates: Object.freeze([
      candidate('reverse', 'Split the canonical string on underscores and reverse the complete token sequence.', (value) => String(value).split('_').reverse()),
      candidate('preserve', 'Split on underscores and preserve token order.', (value) => String(value).split('_')),
      candidate('sort', 'Split on underscores and sort tokens lexically.', (value) => String(value).split('_').sort()),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_slash_joining', skill_id: 'skill_apfc_slash_join',
    title: 'Join a token sequence with slashes', domain: 'text_transformation',
    input_type: 'text.tokens_reversed', output_type: 'text.slash_joined', true_id: 'slash',
    inputs: [['green', 'blue', 'red'], ['two', 'one'], ['d', 'c', 'b', 'a'], ['single']],
    candidates: Object.freeze([
      candidate('slash', 'Join the token sequence in its current order using the literal slash character.', (value) => value.join('/')),
      candidate('colon', 'Join the token sequence using colons.', (value) => value.join(':')),
      candidate('dot', 'Join the token sequence using dots.', (value) => value.join('.')),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_character_deduplication', skill_id: 'skill_apfc_dedupe_characters',
    title: 'Keep first occurrences of canonical characters', domain: 'text_transformation',
    input_type: 'text.normalized', output_type: 'text.characters_deduped', true_id: 'global_first',
    inputs: ['balloon_field', 'mississippi_river', 'level_rotor', 'abracadabra_node'],
    candidates: Object.freeze([
      candidate('global_first', 'Scan left to right and keep only the first occurrence of each character, including underscore.', (value) => {
        const seen = new Set(); let output = '';
        for (const character of String(value)) { if (!seen.has(character)) { seen.add(character); output += character; } }
        return output;
      }),
      candidate('adjacent', 'Collapse only adjacent repeated characters.', (value) => String(value).replace(/(.)\1+/g, '$1')),
      candidate('sorted_unique', 'Return all distinct characters in lexical order.', (value) => [...new Set(String(value))].sort().join('')),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_character_rotation', skill_id: 'skill_apfc_rotate_characters',
    title: 'Rotate canonical characters two places left', domain: 'text_transformation',
    input_type: 'text.characters_deduped', output_type: 'text.rotated', true_id: 'left_two',
    inputs: ['abcdef', 'signal', 'xy', 'quartz'],
    candidates: Object.freeze([
      candidate('left_two', 'Rotate the complete character string exactly two positions to the left; strings of length two return unchanged.', (value) => {
        const text = String(value); if (!text.length) return text; const offset = 2 % text.length; return text.slice(offset) + text.slice(0, offset);
      }),
      candidate('right_two', 'Rotate the complete character string two positions to the right.', (value) => {
        const text = String(value); if (!text.length) return text; const offset = 2 % text.length; return text.slice(-offset) + text.slice(0, -offset);
      }),
      candidate('reverse', 'Reverse every character.', (value) => [...String(value)].reverse().join('')),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_absolute_vector', skill_id: 'skill_apfc_absolute_vector',
    title: 'Convert an integer vector to absolute values', domain: 'numeric_transformation',
    input_type: 'numbers.raw', output_type: 'numbers.absolute', true_id: 'absolute',
    inputs: [[1, -2, 3], [-10, 0, 7], [-4, -5], [9, -8, -1, 2]],
    candidates: Object.freeze([
      candidate('absolute', 'Replace each integer with its absolute value while preserving vector order.', (value) => value.map((item) => Math.abs(Number(item)))),
      candidate('zero_negative', 'Replace each negative integer with zero.', (value) => value.map((item) => Math.max(0, Number(item)))),
      candidate('square', 'Square each integer.', (value) => value.map((item) => Number(item) ** 2)),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_zigzag_vector', skill_id: 'skill_apfc_zigzag_vector',
    title: 'Apply alternating signs to an absolute vector', domain: 'numeric_transformation',
    input_type: 'numbers.absolute', output_type: 'numbers.zigzag', true_id: 'alternating_sign',
    inputs: [[1, 2, 3, 4], [10, 5, 7], [4, 5], [9, 8, 1, 2, 6]],
    candidates: Object.freeze([
      candidate('alternating_sign', 'Preserve values at zero-based even positions and negate values at odd positions.', (value) => value.map((item, index) => index % 2 === 0 ? Number(item) : -Number(item))),
      candidate('reverse', 'Reverse the vector.', (value) => value.slice().reverse()),
      candidate('alternating_double', 'Double values at even positions and preserve values at odd positions.', (value) => value.map((item, index) => index % 2 === 0 ? 2 * Number(item) : Number(item))),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_vector_total', skill_id: 'skill_apfc_vector_total',
    title: 'Sum a signed vector', domain: 'numeric_transformation',
    input_type: 'numbers.zigzag', output_type: 'number.total', true_id: 'sum',
    inputs: [[1, -2, 3], [10, -5, 7, -2], [-4, 5], [9]],
    candidates: Object.freeze([
      candidate('sum', 'Add every signed integer in the vector.', (value) => value.reduce((sum, item) => sum + Number(item), 0)),
      candidate('absolute_sum', 'Add the absolute values.', (value) => value.reduce((sum, item) => sum + Math.abs(Number(item)), 0)),
      candidate('product', 'Multiply all integers.', (value) => value.reduce((product, item) => product * Number(item), 1)),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_base36_encoding', skill_id: 'skill_apfc_base36_code',
    title: 'Encode a signed total in uppercase base 36', domain: 'numeric_transformation',
    input_type: 'number.total', output_type: 'number.base36', true_id: 'base36',
    inputs: [0, 35, 36, -71],
    candidates: Object.freeze([
      candidate('base36', 'Encode the integer in uppercase base 36 and preserve a leading minus sign.', signedBase36),
      candidate('hex', 'Encode the integer in uppercase hexadecimal.', (value) => Number(value).toString(16).toUpperCase()),
      candidate('decimal', 'Return the decimal integer string.', (value) => String(Number(value))),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_weighted_vector', skill_id: 'skill_apfc_weighted_vector',
    title: 'Compute a one-based weighted vector sum', domain: 'numeric_transformation',
    input_type: 'numbers.absolute', output_type: 'number.weighted', true_id: 'forward_weights',
    inputs: [[1, 2, 3], [10, 4], [3, 8, 5, 1], [7]],
    candidates: Object.freeze([
      candidate('forward_weights', 'Multiply each value by its one-based position and add the products.', (value) => value.reduce((sum, item, index) => sum + ((index + 1) * Number(item)), 0)),
      candidate('plain_sum', 'Add all values without weights.', (value) => value.reduce((sum, item) => sum + Number(item), 0)),
      candidate('reverse_weights', 'Weight the first value most heavily and the last value by one.', (value) => value.reduce((sum, item, index) => sum + ((value.length - index) * Number(item)), 0)),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_mod97_encoding', skill_id: 'skill_apfc_mod97_code',
    title: 'Encode a weighted total as a two-digit modulo-97 code', domain: 'numeric_transformation',
    input_type: 'number.weighted', output_type: 'number.mod97_code', true_id: 'mod97_padded',
    inputs: [1, 7, 98, 203],
    candidates: Object.freeze([
      candidate('mod97_padded', 'Reduce the integer modulo 97 and return exactly two decimal digits with leading zero when required.', (value) => String(((Number(value) % 97) + 97) % 97).padStart(2, '0')),
      candidate('mod97_plain', 'Reduce modulo 97 without padding.', (value) => String(((Number(value) % 97) + 97) % 97)),
      candidate('mod31_padded', 'Reduce modulo 31 and return two digits.', (value) => String(((Number(value) % 31) + 31) % 31).padStart(2, '0')),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_dispatch_parsing', skill_id: 'skill_apfc_parse_dispatch',
    title: 'Parse and normalize a dispatch record', domain: 'record_routing',
    input_type: 'record.raw', output_type: 'record.canonical', true_id: 'hash_insensitive',
    inputs: [
      { token: 'NOVA#Payload_7', expected_prefix: 'nova', sequence: 3 },
      { token: 'Helix#Mixed-8', expected_prefix: 'HELIX', sequence: 11 },
      { token: 'OTHER#Node_9', expected_prefix: 'orbit', sequence: 4 },
      { token: 'MESA#bad.value', expected_prefix: 'mesa', sequence: 5 },
    ],
    candidates: Object.freeze([
      candidate('hash_insensitive', 'Split token on one literal #; require exactly two fields, case-insensitive prefix equality, an integer sequence, and payload grammar [A-Za-z0-9_-]+; lowercase valid payload. Return accepted false for every rejection.', (value) => {
        const parts = String(value.token || '').split('#'); const sequence = Number(value.sequence);
        if (parts.length !== 2 || !Number.isInteger(sequence)) return { accepted: false, payload: null, sequence: null };
        const [prefix, payload] = parts;
        if (prefix.toLowerCase() !== String(value.expected_prefix || '').toLowerCase() || !payload || !/^[A-Za-z0-9_-]+$/.test(payload)) return { accepted: false, payload: null, sequence: null };
        return { accepted: true, payload: payload.toLowerCase(), sequence };
      }),
      candidate('colon_insensitive', 'Parse a colon-delimited case-insensitive record.', (value) => {
        const parts = String(value.token || '').split(':');
        return parts.length === 2 ? { accepted: true, payload: parts[1].toLowerCase(), sequence: Number(value.sequence) } : { accepted: false, payload: null, sequence: null };
      }),
      candidate('hash_sensitive', 'Parse # but compare the prefix case-sensitively.', (value) => {
        const parts = String(value.token || '').split('#');
        return parts.length === 2 && parts[0] === value.expected_prefix ? { accepted: true, payload: parts[1].toLowerCase(), sequence: Number(value.sequence) } : { accepted: false, payload: null, sequence: null };
      }),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_dispatch_checksum', skill_id: 'skill_apfc_dispatch_checksum',
    title: 'Compute a seven-way dispatch checksum', domain: 'record_routing',
    input_type: 'record.canonical', output_type: 'record.checksum', true_id: 'sum_sequence_mod7',
    inputs: [
      { accepted: true, payload: 'alpha', sequence: 2 },
      { accepted: true, payload: 'node_7', sequence: 11 },
      { accepted: false, payload: null, sequence: null },
      { accepted: true, payload: 'mixed-8', sequence: 4 },
    ],
    candidates: Object.freeze([
      candidate('sum_sequence_mod7', 'For rejected records return -1. Otherwise sum payload Unicode code points, add sequence, and reduce modulo 7.', (value) => value.accepted ? ([...value.payload].reduce((sum, character) => sum + character.codePointAt(0), 0) + value.sequence) % 7 : -1),
      candidate('sum_mod7', 'For accepted records sum payload code points modulo 7 without sequence.', (value) => value.accepted ? [...value.payload].reduce((sum, character) => sum + character.codePointAt(0), 0) % 7 : -1),
      candidate('sum_sequence_mod5', 'Sum code points and sequence modulo 5.', (value) => value.accepted ? ([...value.payload].reduce((sum, character) => sum + character.codePointAt(0), 0) + value.sequence) % 5 : -1),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_dispatch_route', skill_id: 'skill_apfc_dispatch_route',
    title: 'Map a seven-way checksum to a dispatch route', domain: 'record_routing',
    input_type: 'record.checksum', output_type: 'record.route', true_id: 'route_map_a',
    inputs: [-1, 0, 1, 2, 3, 4, 5, 6],
    candidates: Object.freeze([
      candidate('route_map_a', 'Map -1 to vault; map residues 0..6 respectively to zenith, east, center, nadir, west, north, south.', (value) => value === -1 ? 'vault' : ['zenith', 'east', 'center', 'nadir', 'west', 'north', 'south'][value]),
      candidate('route_map_b', 'Map -1 to vault; map residues in compass lexical order.', (value) => value === -1 ? 'vault' : ['center', 'east', 'nadir', 'north', 'south', 'west', 'zenith'][value]),
      candidate('route_numeric', 'Return a numeric route label.', (value) => value === -1 ? 'vault' : `route_${value}`),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_event_counting', skill_id: 'skill_apfc_event_counts',
    title: 'Count A, B, and C events case-insensitively', domain: 'event_state',
    input_type: 'events.raw', output_type: 'event.counts', true_id: 'case_insensitive_abc',
    inputs: ['AABc', 'bbcc', 'AAABBC', 'xyzCCC'],
    candidates: Object.freeze([
      candidate('case_insensitive_abc', 'Uppercase the stream, ignore non-A/B/C characters, and count A, B, and C separately.', (value) => {
        const counts = { A: 0, B: 0, C: 0 }; for (const character of String(value).toUpperCase()) if (Object.hasOwn(counts, character)) counts[character] += 1; return counts;
      }),
      candidate('case_sensitive_abc', 'Count uppercase A, B, and C only.', (value) => {
        const counts = { A: 0, B: 0, C: 0 }; for (const character of String(value)) if (Object.hasOwn(counts, character)) counts[character] += 1; return counts;
      }),
      candidate('count_all', 'Return total stream length in A and zero for B and C.', (value) => ({ A: String(value).length, B: 0, C: 0 })),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_event_scoring', skill_id: 'skill_apfc_event_score',
    title: 'Compute the weighted event score', domain: 'event_state',
    input_type: 'event.counts', output_type: 'event.score', true_id: 'three_two_minus_one',
    inputs: [{ A: 2, B: 1, C: 1 }, { A: 0, B: 2, C: 3 }, { A: 3, B: 2, C: 1 }, { A: 1, B: 0, C: 4 }],
    candidates: Object.freeze([
      candidate('three_two_minus_one', 'Compute 3 times A plus 2 times B minus C.', (value) => (3 * value.A) + (2 * value.B) - value.C),
      candidate('plain_sum', 'Add A, B, and C.', (value) => value.A + value.B + value.C),
      candidate('two_minus_three', 'Compute 2A minus B plus 3C.', (value) => (2 * value.A) - value.B + (3 * value.C)),
    ]),
  }),
  Object.freeze({
    source_family_id: 'source_event_status', skill_id: 'skill_apfc_event_status',
    title: 'Classify a weighted event score', domain: 'event_state',
    input_type: 'event.score', output_type: 'event.status', true_id: 'threshold_8_3',
    inputs: [-2, 2, 3, 7, 8, 15],
    candidates: Object.freeze([
      candidate('threshold_8_3', 'Return red when score is at least 8, amber when score is at least 3, otherwise green.', (value) => Number(value) >= 8 ? 'red' : Number(value) >= 3 ? 'amber' : 'green'),
      candidate('threshold_10_5', 'Return red at 10, amber at 5, otherwise green.', (value) => Number(value) >= 10 ? 'red' : Number(value) >= 5 ? 'amber' : 'green'),
      candidate('parity', 'Return red for even and green for odd.', (value) => Number(value) % 2 === 0 ? 'red' : 'green'),
    ]),
  }),
]);

function buildDevelopmentEpisodes(createdAt = nowIso()) {
  return PRIMITIVES.map((primitive) => {
    const truth = primitive.candidates.find((item) => item.id === primitive.true_id);
    const examples = primitive.inputs.map((input, index) => ({
      example_id: `${primitive.source_family_id}_${String(index + 1).padStart(2, '0')}`,
      input,
      verified_output: truth.apply(input),
      verifier_outcome: 'verified',
    }));
    return {
      schema_version: 1,
      episode_id: `ep_${primitive.source_family_id}`,
      created_at: createdAt,
      source_family_id: primitive.source_family_id,
      input_type: primitive.input_type,
      output_type: primitive.output_type,
      examples,
      verifier: {
        verifier_id: `oracle_${primitive.source_family_id}`,
        outcome: 'verified',
        independent_from_induction: true,
      },
      verdict: 'success',
    };
  });
}

function inducePrimitiveSkills(episodes, createdAt = nowIso()) {
  if (!Array.isArray(episodes) || episodes.length !== PRIMITIVES.length) throw new Error('APFC_TRANSFER_DEVELOPMENT_EPISODE_COUNT_INVALID');
  const skills = [];
  const records = [];
  const selectedOperators = new Map();
  for (const primitive of PRIMITIVES) {
    const episode = episodes.find((item) => item.source_family_id === primitive.source_family_id);
    if (!episode || episode.verdict !== 'success' || episode.verifier.outcome !== 'verified') {
      throw new Error(`APFC_TRANSFER_VERIFIED_EPISODE_REQUIRED: ${primitive.source_family_id}`);
    }
    const survivors = primitive.candidates.filter((hypothesis) => episode.examples.every((example) => (
      example.verifier_outcome === 'verified' && sameValue(hypothesis.apply(example.input), example.verified_output)
    )));
    if (survivors.length !== 1) throw new Error(`APFC_TRANSFER_PRIMITIVE_NOT_UNIQUE: ${primitive.source_family_id}:${survivors.length}`);
    const selected = survivors[0];
    selectedOperators.set(primitive.skill_id, selected);
    const inductionHash = sha256Json({
      source_family_id: primitive.source_family_id,
      episode_hash: sha256Json(episode),
      selected_hypothesis: selected.id,
    });
    const skill = {
      schema_version: 1,
      skill_id: primitive.skill_id,
      title: primitive.title,
      description: 'Experimental typed operational primitive induced by eliminating hypotheses against independently verified source-family examples.',
      status: 'candidate',
      domain: primitive.domain,
      task_types: ['general_operation'],
      inputs: [primitive.input_type],
      tools: [],
      preconditions: [`input_type=${primitive.input_type}`],
      procedure: [selected.procedure],
      success_criteria: [`output_type=${primitive.output_type}`, 'output matches an independent deterministic oracle'],
      failure_modes: primitive.candidates.filter((item) => item.id !== selected.id).map((item) => `confused_with_${item.id}`),
      rollback: 'Remove this experimental skill node from the evaluation graph; no production promotion is authorized.',
      evals: [],
      source_episodes: [episode.episode_id],
      source_refs: [`md-os/ops/agi/learning_experiments/<experiment>/evidence/development_episodes.json#${episode.episode_id}`],
      transfer_contract: {
        source_family_id: primitive.source_family_id,
        input_type: primitive.input_type,
        output_type: primitive.output_type,
        independently_verified: true,
        uniquely_identified: true,
        experimental_only: true,
        induction_hash: inductionHash,
      },
      created_at: createdAt,
    };
    skills.push(skill);
    records.push({
      source_family_id: primitive.source_family_id,
      skill_id: skill.skill_id,
      initial_hypothesis_count: primitive.candidates.length,
      final_hypothesis_count: survivors.length,
      selected_hypothesis_id: selected.id,
      induction_hash: inductionHash,
    });
  }
  return { skills, records, selected_operators: selectedOperators };
}

function executeLearnedPath(contextPack, input, selectedOperators) {
  let state = input;
  for (const skillId of contextPack.composition.path_skill_ids) {
    const operator = selectedOperators.get(skillId);
    if (!operator) throw new Error(`APFC_TRANSFER_SELECTED_OPERATOR_MISSING: ${skillId}`);
    state = operator.apply(state);
  }
  return String(state);
}

function skillCard(node, ordinal = null) {
  const prefix = ordinal === null ? '-' : `${ordinal}.`;
  return [
    `${prefix} ${node.properties.skill_id}`,
    `  signature: ${node.properties.input_type} -> ${node.properties.output_type}`,
    `  procedure: ${node.properties.procedure.join(' ')}`,
  ].join('\n');
}

function buildTrialPrompt(targetCase, condition, contextPack, flatSkills) {
  let memorySection = '';
  if (condition === 'memory_disabled') {
    memorySection = 'Operational memory is disabled. No learned procedure, source example, target example, or graph path is available.';
  } else if (condition === 'flat_memory') {
    memorySection = [
      'A flat lexical memory lookup returned the following learned skill cards.',
      'They are not ordered, are not guaranteed to connect, and include no graph relations.',
      ...flatSkills.map((node) => skillCard(node)),
    ].join('\n');
  } else if (condition === 'apfcg_composed') {
    const nodeById = new Map(contextPack.nodes.map((node) => [node.id, node]));
    const ordered = contextPack.composition.path_node_ids.map((nodeId) => nodeById.get(nodeId));
    memorySection = [
      'APFCG compiled one unique typed procedure path from verified source-family skills.',
      `Type path: ${contextPack.composition.path_types.join(' -> ')}`,
      'Apply these steps exactly in the declared order, carrying each result into the next step:',
      ...ordered.map((node, index) => skillCard(node, index + 1)),
    ].join('\n');
  } else {
    throw new Error(`APFC_TRANSFER_CONDITION_UNKNOWN: ${condition}`);
  }
  return [
    'You are executing one isolated, one-attempt evaluation of an intentionally novel operational family.',
    'Do not use shell commands, files, web search, MCP, or any other tool. Tool use invalidates the observation.',
    'Do not explain your answer. Return only the JSON object required by the supplied response schema.',
    'The result field must be a string and must contain only the exact final result.',
    'No development example from this target family exists and no target-specific skill is available.',
    '',
    `Family contract: ${JSON.stringify(targetCase.family)}`,
    `Input: ${JSON.stringify(targetCase.input)}`,
    '',
    memorySection,
  ].join('\n');
}

function answerValid(answer) {
  return answer && typeof answer === 'object' && !Array.isArray(answer)
    && typeof answer.result === 'string'
    && Object.keys(answer).length === 1;
}

function codexVersion(codexBin) {
  const result = spawnSync(codexBin, ['--version'], { encoding: 'utf8', timeout: 10000 });
  if (result.status !== 0) throw new Error(`APFC_TRANSFER_CODEX_VERSION_FAILED: ${shortText(result.stderr || result.stdout)}`);
  return shortText(result.stdout);
}

function runCodexTrial({ codexBin, model, workdir, prompt, timeoutMs }) {
  return new Promise((resolve) => {
    const startedAt = nowIso();
    const args = [
      'exec', '--ephemeral', '--ignore-user-config', '--skip-git-repo-check',
      '-C', workdir, '-s', 'read-only', '-m', model,
      '--output-schema', RESPONSE_SCHEMA, '--json', prompt,
    ];
    const child = spawn(codexBin, args, {
      cwd: workdir,
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({ started_at: startedAt, completed_at: nowIso(), stdout, stderr, ...payload });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);
    child.on('error', (error) => {
      clearTimeout(timer);
      finish({ exit_status: null, timed_out: false, spawn_error: shortText(error.message) });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish({ exit_status: Number.isInteger(code) ? code : null, timed_out: timedOut });
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

function pairwiseMeasurement(results, control, treatment) {
  const keys = [...new Set(results.map((item) => `${item.trial_index}:${item.case_id}`))].sort();
  let controlSuccess = 0;
  let treatmentSuccess = 0;
  let controlOnly = 0;
  let treatmentOnly = 0;
  for (const key of keys) {
    const [trialIndex, caseId] = key.split(':');
    const a = results.find((item) => item.trial_index === Number(trialIndex) && item.case_id === caseId && item.condition === control);
    const b = results.find((item) => item.trial_index === Number(trialIndex) && item.case_id === caseId && item.condition === treatment);
    if (!a || !b) throw new Error(`APFC_TRANSFER_PAIR_INCOMPLETE: ${key}:${control}:${treatment}`);
    if (a.verified_success) controlSuccess += 1;
    if (b.verified_success) treatmentSuccess += 1;
    if (a.verified_success && !b.verified_success) controlOnly += 1;
    if (!a.verified_success && b.verified_success) treatmentOnly += 1;
  }
  const observationCount = keys.length;
  const controlRate = controlSuccess / observationCount;
  const treatmentRate = treatmentSuccess / observationCount;
  return {
    control_condition: control,
    treatment_condition: treatment,
    observation_count: observationCount,
    control_success_count: controlSuccess,
    treatment_success_count: treatmentSuccess,
    control_success_rate: controlRate,
    treatment_success_rate: treatmentRate,
    absolute_delta: treatmentRate - controlRate,
    discordant_control_only: controlOnly,
    discordant_treatment_only: treatmentOnly,
    mcnemar_exact_two_sided_p: exactMcNemar(controlOnly, treatmentOnly),
  };
}

function familyMeasurements(results) {
  return TARGET_FAMILIES.map((family) => {
    const subset = results.filter((item) => item.family_id === family.family_id);
    const rates = {};
    for (const condition of CONDITIONS) {
      const conditionResults = subset.filter((item) => item.condition === condition);
      rates[condition] = {
        success_count: conditionResults.filter((item) => item.verified_success).length,
        observation_count: conditionResults.length,
        success_rate: conditionResults.length
          ? conditionResults.filter((item) => item.verified_success).length / conditionResults.length
          : 0,
      };
    }
    return { family_id: family.family_id, domain: family.domain, conditions: rates };
  });
}

function coldStartMeasurements(results, trialCount) {
  const output = [];
  for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
    const subset = results.filter((item) => item.trial_index === trialIndex);
    const conditions = {};
    for (const condition of CONDITIONS) {
      const cohort = subset.filter((item) => item.condition === condition);
      conditions[condition] = {
        success_count: cohort.filter((item) => item.verified_success).length,
        observation_count: cohort.length,
        success_rate: cohort.filter((item) => item.verified_success).length / cohort.length,
      };
    }
    output.push({
      trial_index: trialIndex,
      start_kind: trialIndex === 0 ? 'initial_ephemeral_start' : `cold_start_${trialIndex}`,
      conditions,
    });
  }
  return output;
}

function assertTransferReport(report) {
  if (!report || report.schema_version !== 1 || report.experiment_type !== EXPERIMENT_TYPE) throw new Error('APFC_TRANSFER_REPORT_HEADER_INVALID');
  if (report.design.held_out_family_count < 6 || report.design.holdout_case_count < 30 || report.design.trial_count < 3) {
    throw new Error('APFC_TRANSFER_SAMPLE_GATE_INVALID');
  }
  if (JSON.stringify(report.design.conditions) !== JSON.stringify(CONDITIONS)) throw new Error('APFC_TRANSFER_CONDITIONS_INVALID');
  if (report.design.total_model_invocations !== report.design.holdout_case_count * report.design.trial_count * CONDITIONS.length) {
    throw new Error('APFC_TRANSFER_INVOCATION_COUNT_INVALID');
  }
  return true;
}

function readObject(filePath, label) {
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch (error) {
    throw new Error(`${label}_READ_FAILED: ${rel(filePath)}: ${error.message}`);
  }
}

function renderReportMarkdown(report) {
  const primary = report.transfer_measurement.apfcg_vs_disabled;
  const graph = report.transfer_measurement.apfcg_vs_flat;
  return [
    '# APFC multi-family compositional transfer experiment',
    '',
    `Experiment: \`${report.experiment_id}\``,
    '',
    `Status: \`${report.status}\``,
    '',
    '## Result',
    '',
    `- held-out target families: \`${report.design.held_out_family_count}\` across \`${report.design.domain_count}\` domains`,
    `- source primitive families: \`${report.design.source_family_count}\``,
    `- sealed cases: \`${report.design.holdout_case_count}\``,
    `- real ephemeral model invocations: \`${report.design.total_model_invocations}\``,
    `- no-memory success: \`${primary.control_success_count}/${primary.observation_count}\` (${primary.control_success_rate.toFixed(4)})`,
    `- APFCG-composed success: \`${primary.treatment_success_count}/${primary.observation_count}\` (${primary.treatment_success_rate.toFixed(4)})`,
    `- APFCG versus no-memory delta: \`${primary.absolute_delta.toFixed(4)}\`, exact McNemar p \`${primary.mcnemar_exact_two_sided_p}\``,
    `- flat-memory success: \`${graph.control_success_count}/${graph.observation_count}\` (${graph.control_success_rate.toFixed(4)})`,
    `- APFCG versus flat-memory delta: \`${graph.absolute_delta.toFixed(4)}\`, exact McNemar p \`${graph.mcnemar_exact_two_sided_p}\``,
    '',
    '## Claim boundary',
    '',
    report.claim_state.claim_boundary,
    '',
    `Bounded multi-family compositional transfer supported: \`${report.claim_state.bounded_multifamily_compositional_transfer_supported}\``,
    '',
    `APFCG retrieval advantage supported: \`${report.claim_state.apfcg_retrieval_advantage_supported}\``,
    '',
  ].join('\n');
}

async function runMultifamilyTransferExperiment(options = {}) {
  const experimentId = assertSafeId(options.experiment_id || `apfc_multifamily_transfer_${Date.now()}`, 'APFC_TRANSFER_EXPERIMENT_ID');
  const model = shortText(options.model || 'gpt-5.4');
  const codexBin = options.codex_bin || process.env.CODEX_BIN || 'codex';
  const trialCount = Number(options.trial_count || 3);
  const concurrency = Math.max(1, Math.min(12, Number(options.concurrency || 6)));
  const timeoutMs = Math.max(10000, Number(options.timeout_ms || 90000));
  const maxInfrastructureFailureRate = Number(
    options.max_infrastructure_failure_rate ?? DEFAULT_MAX_INFRASTRUCTURE_FAILURE_RATE
  );
  if (trialCount < 3) throw new Error('APFC_TRANSFER_MINIMUM_THREE_TRIALS_REQUIRED');
  if (!Number.isFinite(maxInfrastructureFailureRate)
    || maxInfrastructureFailureRate < 0
    || maxInfrastructureFailureRate > 0.05) {
    throw new Error('APFC_TRANSFER_INFRASTRUCTURE_FAILURE_RATE_INVALID');
  }

  const experimentDir = path.join(EXPERIMENT_ROOT, experimentId);
  if (fs.existsSync(experimentDir)) throw new Error(`APFC_TRANSFER_APPEND_ONLY_CONFLICT: ${rel(experimentDir)}`);
  const evidenceDir = path.join(experimentDir, 'evidence');
  const receiptDir = path.join(experimentDir, 'trial_receipts');
  const contextDir = path.join(experimentDir, 'context_packs');
  const sandboxDir = path.join(experimentDir, 'isolated_codex_workspace');
  fs.mkdirSync(evidenceDir, { recursive: true });
  fs.mkdirSync(receiptDir, { recursive: true });
  fs.mkdirSync(contextDir, { recursive: true });
  fs.mkdirSync(sandboxDir, { recursive: true });

  const createdAt = nowIso();
  const developmentEpisodes = buildDevelopmentEpisodes(createdAt);
  const induction = inducePrimitiveSkills(developmentEpisodes, createdAt);
  const graphSourceManifest = {
    development_episode_hash: sha256Json(developmentEpisodes),
    induced_skill_bundle_hash: sha256Json(induction.skills),
  };
  const graph = buildSkillGraph(induction.skills, graphSourceManifest);
  const contextPacks = {};
  const flatSelections = {};
  for (const family of TARGET_FAMILIES) {
    const taskSpec = {
      task_spec_id: `task_${family.family_id}`,
      family_id: family.family_id,
      domain: family.domain,
      goal: family.goal,
      start_type: family.start_type,
      goal_type: family.goal_type,
    };
    const pack = compileContextPack(graph, taskSpec);
    contextPacks[family.family_id] = pack;
    flatSelections[family.family_id] = flatRetrieveSkills(graph, taskSpec, pack.composition.path_skill_ids.length);
    atomicWriteJson(path.join(contextDir, `${family.family_id}.json`), pack);
  }
  const targetCases = generateTargetCases(experimentId);
  if (targetCases.length !== 30) throw new Error(`APFC_TRANSFER_FIXED_CASE_COUNT_INVALID: ${targetCases.length}`);
  const sourceFamilyIds = new Set(developmentEpisodes.map((item) => item.source_family_id));
  const targetFamilyIds = new Set(TARGET_FAMILIES.map((item) => item.family_id));
  const familyOverlap = [...targetFamilyIds].filter((familyId) => sourceFamilyIds.has(familyId));
  const developmentInputHashes = new Set(developmentEpisodes.flatMap((episode) => episode.examples.map((example) => sha256Json(example.input))));
  const duplicatedInputs = targetCases.filter((item) => developmentInputHashes.has(sha256Json(item.input)));
  const graphOracleMismatches = targetCases.filter((item) => (
    executeLearnedPath(contextPacks[item.family.family_id], item.input, induction.selected_operators) !== oracleForCase(item)
  ));
  const targetSpecificSkillFindings = Object.values(contextPacks)
    .filter((pack) => pack.composition.target_specific_skill_present)
    .map((pack) => pack.composition.family_id);
  const responseSchemaHash = sha256Json(readObject(RESPONSE_SCHEMA, 'APFC_TRANSFER_RESPONSE_SCHEMA'));
  const contextPackIndex = Object.fromEntries(Object.entries(contextPacks).map(([familyId, pack]) => [familyId, sha256Json(pack)]));
  const flatSelectionIndex = Object.fromEntries(Object.entries(flatSelections).map(([familyId, nodes]) => [familyId, nodes.map((node) => node.id)]));
  const holdoutManifest = targetCases.map((item) => ({
    case_id: item.case_id,
    family_id: item.family.family_id,
    input_hash: sha256Json(item.input),
    expected_hash: sha256Json(item.expected),
  }));
  const sourceManifest = {
    development_episode_hash: sha256Json(developmentEpisodes),
    induced_skill_bundle_hash: sha256Json(induction.skills),
    graph_source_manifest_hash: sha256Json(graphSourceManifest),
    graph_hash: sha256Json(graph),
    context_pack_index_hash: sha256Json(contextPackIndex),
    flat_selection_index_hash: sha256Json(flatSelectionIndex),
    holdout_manifest_hash: sha256Json(holdoutManifest),
    response_schema_hash: responseSchemaHash,
  };
  atomicWriteJson(path.join(experimentDir, 'sealed_manifest.json'), {
    schema_version: 1,
    experiment_id: experimentId,
    created_at: createdAt,
    sealed_before_trials: true,
    source_manifest: sourceManifest,
    holdout_manifest: holdoutManifest,
    target_family_contracts: TARGET_FAMILIES.map((family) => ({
      family_id: family.family_id,
      domain: family.domain,
      title: family.title,
      goal: family.goal,
      start_type: family.start_type,
      goal_type: family.goal_type,
    })),
  });
  atomicWriteJson(path.join(evidenceDir, 'development_episodes.json'), developmentEpisodes);
  atomicWriteJson(path.join(experimentDir, 'induced_skills.json'), induction.skills);
  atomicWriteJson(path.join(experimentDir, 'induction_records.json'), induction.records);
  atomicWriteJson(path.join(experimentDir, 'apfc_graph.json'), graph);
  atomicWriteJson(path.join(experimentDir, 'flat_selection_index.json'), flatSelectionIndex);

  const jobs = [];
  for (let trialIndex = 0; trialIndex < trialCount; trialIndex += 1) {
    const orderedCases = trialIndex % 2 === 0 ? targetCases : targetCases.slice().reverse();
    orderedCases.forEach((targetCase, caseIndex) => {
      const offset = (trialIndex + caseIndex) % CONDITIONS.length;
      const orderedConditions = CONDITIONS.slice(offset).concat(CONDITIONS.slice(0, offset));
      for (const condition of orderedConditions) jobs.push({ trial_index: trialIndex, target_case: targetCase, condition });
    });
  }
  const runnerVersion = codexVersion(codexBin);
  const results = await mapConcurrent(jobs, concurrency, async (job) => {
    const familyId = job.target_case.family.family_id;
    const contextPack = contextPacks[familyId];
    const flatSkills = flatSelections[familyId];
    const prompt = buildTrialPrompt(job.target_case, job.condition, contextPack, flatSkills);
    const raw = await runCodexTrial({ codexBin, model, workdir: sandboxDir, prompt, timeoutMs });
    const parsed = parseCodexEvents(raw.stdout);
    let answer = null;
    try { answer = JSON.parse(String(parsed.final_text || '').trim()); } catch { answer = null; }
    const structured = answerValid(answer);
    const toolUseViolation = parsed.tool_event_types.length > 0;
    const expected = oracleForCase(job.target_case);
    const verifiedSuccess = raw.exit_status === 0 && !raw.timed_out && !toolUseViolation
      && structured && answer.result === expected;
    const selectedNodeIds = job.condition === 'apfcg_composed'
      ? contextPack.composition.path_node_ids
      : job.condition === 'flat_memory'
        ? flatSkills.map((node) => node.id)
        : [];
    const memoryHash = job.condition === 'apfcg_composed'
      ? sha256Json(contextPack)
      : job.condition === 'flat_memory'
        ? sha256Json(flatSkills)
        : null;
    const receipt = {
      schema_version: 1,
      experiment_id: experimentId,
      trial_index: job.trial_index,
      start_kind: job.trial_index === 0 ? 'initial_ephemeral_start' : `cold_start_${job.trial_index}`,
      case_id: job.target_case.case_id,
      family_id: familyId,
      domain: job.target_case.family.domain,
      condition: job.condition,
      model_id: model,
      runner_version: runnerVersion,
      ephemeral: true,
      ignore_user_config: true,
      attempts: 1,
      input_hash: sha256Json(job.target_case.input),
      expected_hash: sha256Json(expected),
      prompt_hash: sha256Json(prompt),
      memory_hash: memoryHash,
      selected_node_ids: selectedNodeIds,
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
      stderr_readback: shortText(raw.stderr),
      spawn_error: raw.spawn_error || null,
    };
    const receiptFile = path.join(receiptDir, `trial_${job.trial_index}_${job.condition}_${job.target_case.case_id}.json`);
    atomicWriteJson(receiptFile, receipt);
    return { ...receipt, receipt_file: rel(receiptFile) };
  });

  const apfcgVsDisabled = pairwiseMeasurement(results, 'memory_disabled', 'apfcg_composed');
  const apfcgVsFlat = pairwiseMeasurement(results, 'flat_memory', 'apfcg_composed');
  const flatVsDisabled = pairwiseMeasurement(results, 'memory_disabled', 'flat_memory');
  const perFamily = familyMeasurements(results);
  const coldStarts = coldStartMeasurements(results, trialCount);
  const toolUseViolationCount = results.filter((item) => item.tool_use_violation).length;
  const timeoutCount = results.filter((item) => item.timed_out).length;
  const structuredFailureCount = results.filter((item) => !item.structured_response_valid).length;
  const infrastructureFailureCount = results.filter((item) => (
    item.timed_out || item.exit_status !== 0 || item.spawn_error
  )).length;
  const infrastructureFailureRate = infrastructureFailureCount / results.length;
  const allThreadIdsUnique = new Set(results.map((item) => item.thread_id)).size === results.length;
  const expectedContextHashesMatch = results.filter((item) => item.condition === 'apfcg_composed')
    .every((item) => item.memory_hash === contextPackIndex[item.family_id]);
  const expectedFlatHashesMatch = results.filter((item) => item.condition === 'flat_memory')
    .every((item) => item.memory_hash === sha256Json(flatSelections[item.family_id]));
  const coldStartPassed = coldStarts.length >= 3 && coldStarts.every((start) => (
    start.conditions.apfcg_composed.success_rate > start.conditions.memory_disabled.success_rate
  ));
  const everyFamilyTransfers = perFamily.every((family) => (
    family.conditions.apfcg_composed.success_rate >= 0.80
    && family.conditions.apfcg_composed.success_rate > family.conditions.memory_disabled.success_rate
  ));
  const contaminationFindings = [];
  if (familyOverlap.length) contaminationFindings.push({ code: 'TARGET_FAMILY_PRESENT_IN_DEVELOPMENT', family_ids: familyOverlap });
  if (duplicatedInputs.length) contaminationFindings.push({ code: 'TARGET_INPUT_DUPLICATES_DEVELOPMENT', case_ids: duplicatedInputs.map((item) => item.case_id) });
  if (graphOracleMismatches.length) contaminationFindings.push({ code: 'GRAPH_AND_INDEPENDENT_ORACLE_DISAGREE', case_ids: graphOracleMismatches.map((item) => item.case_id) });
  if (targetSpecificSkillFindings.length) contaminationFindings.push({ code: 'TARGET_SPECIFIC_SKILL_PRESENT', family_ids: targetSpecificSkillFindings });
  if (toolUseViolationCount) contaminationFindings.push({ code: 'MODEL_TOOL_USE_COULD_EXPOSE_SOURCE', count: toolUseViolationCount });
  const contaminationDetected = contaminationFindings.length > 0;
  const inductionClosed = induction.records.every((record) => record.final_hypothesis_count === 1);
  const graphCompositionClosed = Object.values(contextPacks).every((pack) => (
    pack.composition.unique_shortest_path
    && pack.composition.path_skill_ids.length >= 3
    && !pack.composition.target_specific_skill_present
  ));
  const primaryEffectClosed = apfcgVsDisabled.absolute_delta >= 0.10
    && apfcgVsDisabled.mcnemar_exact_two_sided_p <= 0.05
    && apfcgVsDisabled.discordant_treatment_only > apfcgVsDisabled.discordant_control_only;
  const graphAdvantageClosed = apfcgVsFlat.absolute_delta >= 0.10
    && apfcgVsFlat.mcnemar_exact_two_sided_p <= 0.05
    && apfcgVsFlat.discordant_treatment_only > apfcgVsFlat.discordant_control_only;
  const safetyClosed = toolUseViolationCount === 0;
  const infrastructureReliabilityClosed = infrastructureFailureRate <= maxInfrastructureFailureRate;
  const transferSupported = inductionClosed && graphCompositionClosed && primaryEffectClosed
    && everyFamilyTransfers && coldStartPassed && safetyClosed && infrastructureReliabilityClosed && allThreadIdsUnique
    && expectedContextHashesMatch && expectedFlatHashesMatch && !contaminationDetected;
  const masterEdges = [
    { edge: 'verified source-family episodes -> uniquely induced typed primitives', status: inductionClosed ? 'ok' : 'critical', verifier: 'bounded_hypothesis_elimination' },
    { edge: 'typed primitives -> valid APFCG compatibility graph', status: graph.status === 'ok' ? 'ok' : 'critical', verifier: 'apfc_graph_schema_and_hash_audit' },
    { edge: 'APFCG -> autonomous multi-step composition for unseen families', status: graphCompositionClosed ? 'ok' : 'critical', verifier: 'unique_shortest_typed_path_compiler' },
    { edge: 'compiled paths -> independent target-family oracle equivalence', status: graphOracleMismatches.length ? 'critical' : 'ok', verifier: 'separate_direct_oracle' },
    { edge: 'held-out family boundary -> no source or target-skill contamination', status: contaminationDetected ? 'critical' : 'ok', verifier: 'sealed_manifest_and_tool_audit' },
    { edge: 'APFCG composition -> improved verified unseen-family outcomes', status: primaryEffectClosed && everyFamilyTransfers ? 'ok' : 'critical', verifier: 'paired_exact_mcnemar_and_per_family_gate' },
    { edge: 'improvement -> cold-start persistent external learning', status: coldStartPassed && allThreadIdsUnique ? 'ok' : 'critical', verifier: 'ephemeral_session_and_hash_audit' },
    { edge: 'external execution -> preregistered fail-closed reliability', status: infrastructureReliabilityClosed ? 'ok' : 'critical', verifier: 'infrastructure_failures_count_as_wrong_and_rate_at_most_five_percent' },
  ];
  const completedAt = nowIso();
  const report = {
    schema_version: 1,
    experiment_id: experimentId,
    experiment_type: EXPERIMENT_TYPE,
    created_at: createdAt,
    completed_at: completedAt,
    status: transferSupported ? 'ok' : 'attention',
    objective: 'Test whether MD-OS can induce typed procedures from verified source families, compose them through APFCG, and transfer the resulting procedures to entirely unseen composite families.',
    model: {
      provider: 'openai_codex_cli',
      model_id: model,
      runner: 'codex exec',
      runner_version: runnerVersion,
      ephemeral_sessions: true,
      user_config_ignored: true,
    },
    design: {
      source_family_count: developmentEpisodes.length,
      held_out_family_count: TARGET_FAMILIES.length,
      domain_count: new Set(TARGET_FAMILIES.map((family) => family.domain)).size,
      holdout_case_count: targetCases.length,
      trial_count: trialCount,
      paired_observation_count_per_comparison: targetCases.length * trialCount,
      conditions: CONDITIONS.slice(),
      total_model_invocations: results.length,
      attempts_per_observation: 1,
      tool_use_allowed: false,
      target_family_examples_in_development: 0,
      target_specific_skills: 0,
      case_order: 'deterministically_counterbalanced',
      condition_order: 'rotating_counterbalance',
      flat_retrieval_rule: 'top_k_lexical_jaccard_without_graph_edges',
      graph_retrieval_rule: 'unique_shortest_typed_path',
      infrastructure_failure_policy: 'fail_closed_counted_as_incorrect_without_retry',
      max_infrastructure_failure_rate: maxInfrastructureFailureRate,
    },
    source_manifest: sourceManifest,
    induction: {
      status: inductionClosed ? 'ok' : 'critical',
      primitive_count: induction.skills.length,
      source_family_count: developmentEpisodes.length,
      uniquely_identified_count: induction.records.filter((record) => record.final_hypothesis_count === 1).length,
      records: induction.records,
    },
    graph: {
      status: graph.status,
      graph_id: graph.graph_id,
      graph_hash: sha256Json(graph),
      node_count: graph.metrics.node_count,
      edge_count: graph.metrics.edge_count,
      compiled_context_pack_count: Object.keys(contextPacks).length,
      all_paths_unique: Object.values(contextPacks).every((pack) => pack.composition.unique_shortest_path),
      minimum_composed_path_length: Math.min(...Object.values(contextPacks).map((pack) => pack.composition.path_skill_ids.length)),
      maximum_composed_path_length: Math.max(...Object.values(contextPacks).map((pack) => pack.composition.path_skill_ids.length)),
      context_pack_index: contextPackIndex,
      flat_selection_index: flatSelectionIndex,
    },
    transfer_measurement: {
      metric: 'independently_verified_sealed_unseen_family_success_rate',
      apfcg_vs_disabled: apfcgVsDisabled,
      apfcg_vs_flat: apfcgVsFlat,
      flat_vs_disabled: flatVsDisabled,
    },
    family_measurements: perFamily,
    cold_start: {
      status: coldStartPassed ? 'ok' : 'critical',
      trial_results: coldStarts,
      every_invocation_ephemeral: true,
      unique_thread_ids: allThreadIdsUnique,
      matching_apfcg_context_hashes: expectedContextHashesMatch,
      matching_flat_memory_hashes: expectedFlatHashesMatch,
    },
    contamination_audit: {
      status: contaminationDetected ? 'critical' : 'ok',
      contaminated: contaminationDetected,
      findings: contaminationFindings,
      checks: {
        target_family_ids_absent_from_development: familyOverlap.length === 0,
        target_inputs_absent_from_development: duplicatedInputs.length === 0,
        target_specific_skills_absent: targetSpecificSkillFindings.length === 0,
        target_expected_outputs_absent_from_prompts: true,
        model_tool_use_absent: toolUseViolationCount === 0,
        graph_path_matches_independent_oracle: graphOracleMismatches.length === 0,
      },
    },
    safety: {
      status: safetyClosed ? 'ok' : 'critical',
      tool_use_violation_count: toolUseViolationCount,
      timeout_count: timeoutCount,
      structured_response_failure_count: structuredFailureCount,
      critical_violation_count: toolUseViolationCount,
    },
    execution_reliability: {
      status: infrastructureReliabilityClosed ? 'ok' : 'critical',
      failure_policy: 'every_timeout_nonzero_exit_or_spawn_error_is_scored_as_an_incorrect_observation_without_retry',
      infrastructure_failure_count: infrastructureFailureCount,
      infrastructure_failure_rate: infrastructureFailureRate,
      maximum_allowed_failure_rate: maxInfrastructureFailureRate,
    },
    claim_state: {
      bounded_multifamily_compositional_transfer_supported: transferSupported,
      apfcg_retrieval_advantage_supported: graphAdvantageClosed && transferSupported,
      universal_learning_supported: false,
      agi_claim_supported: false,
      claim_boundary: transferSupported
        ? 'This run supports a causal, bounded multi-family compositional-transfer claim: MD-OS induced typed primitives from verified source families, APFCG composed them without a target-family skill, and the same real model improved on six wholly unseen synthetic composite families across four operational domains and independent cold starts. It does not prove literal universality, open-world learning, model-weight learning, or AGI.'
        : 'One or more preregistered multi-family transfer gates failed. No general compositional-transfer claim is supported by this run.',
    },
    master_closure: {
      status: masterEdges.every((edge) => edge.status === 'ok') ? 'ok' : 'critical',
      edges: masterEdges,
    },
    evidence: {
      sealed_manifest_file: rel(path.join(experimentDir, 'sealed_manifest.json')),
      development_episodes_file: rel(path.join(evidenceDir, 'development_episodes.json')),
      induced_skill_bundle_file: rel(path.join(experimentDir, 'induced_skills.json')),
      graph_file: rel(path.join(experimentDir, 'apfc_graph.json')),
      context_pack_directory: rel(contextDir),
      trial_receipt_directory: rel(receiptDir),
      receipt_count: results.length,
    },
  };
  assertTransferReport(report);
  const reportFile = path.join(experimentDir, 'report.json');
  const reportMdFile = path.join(experimentDir, 'report.md');
  atomicWriteJson(path.join(evidenceDir, 'unsealed_target_cases.json'), targetCases);
  atomicWriteJson(path.join(evidenceDir, 'trial_results.json'), results.map((item) => ({
    trial_index: item.trial_index,
    case_id: item.case_id,
    family_id: item.family_id,
    condition: item.condition,
    verified_success: item.verified_success,
    receipt_file: item.receipt_file,
  })));
  atomicWriteJson(reportFile, report);
  atomicWriteText(reportMdFile, renderReportMarkdown(report));

  const suffix = sha256Json({ experiment_id: experimentId, report_hash: sha256Json(report) }).slice(0, 16);
  const episodeId = `ep_apfc_multifamily_transfer_${suffix}`;
  const taskSpecId = `task_apfc_multifamily_transfer_${suffix}`;
  const verificationId = `verification_apfc_multifamily_transfer_${suffix}`;
  const receiptId = `receipt_apfc_multifamily_transfer_${suffix}`;
  const evalId = `eval_apfc_multifamily_transfer_${suffix}`;
  const taskFile = path.join(TASK_ROOT, `${taskSpecId}.json`);
  const episodeFile = path.join(EPISODE_ROOT, `${episodeId}.json`);
  const episodeMdFile = path.join(EPISODE_ROOT, `${episodeId}.md`);
  const verificationFile = path.join(VERIFICATION_ROOT, `${verificationId}.json`);
  const aggregateReceiptFile = path.join(RECEIPT_ROOT, `${receiptId}.json`);
  const evalFile = path.join(EVAL_ROOT, `${evalId}.json`);
  const evalMdFile = path.join(EVAL_ROOT, `${evalId}.md`);
  const taskSpec = {
    schema_version: 1,
    task_spec_id: taskSpecId,
    created_at: createdAt,
    goal: report.objective,
    task_type: 'general_operation',
    constraints: [
      'all execution remains inside md-os',
      'target families are excluded from development evidence',
      'no target-specific skill is constructed',
      'one attempt per model observation',
      'no chat history and no model tool use',
      'no automatic skill promotion',
    ],
    acceptance_tests: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_multifamily_transfer', command_id: 'verify_multifamily_transfer_report', expected_exit_status: 0 }],
    risk_budget: { level: 'low' },
    resource_budget: { max_actions: results.length, max_candidates: induction.skills.length, max_human_interventions: 0 },
    required_evidence: [
      { evidence_id: 'multifamily_report', path: rel(reportFile), must_exist: true, sha256: sha256Json(report) },
      { evidence_id: 'multifamily_sealed_manifest', path: rel(path.join(experimentDir, 'sealed_manifest.json')), must_exist: true, sha256: sha256Json(readObject(path.join(experimentDir, 'sealed_manifest.json'), 'APFC_TRANSFER_SEALED_MANIFEST')) },
      { evidence_id: 'experimental_apfc_graph', path: rel(path.join(experimentDir, 'apfc_graph.json')), must_exist: true, sha256: sha256Json(graph) },
    ],
    unknowns: ['external_independent_replication', 'natural_open_world_domains', 'model_and_host_portability'],
    success_definition: { acceptance_tests_required: true, all_acceptance_tests_must_pass: true, observed_delta_required: true, required_evidence_must_exist: true },
    actions: [{ connector_id: 'terminal_executor', project_id: 'md_os_apfc_multifamily_transfer', command_id: 'codex_ephemeral_three_condition_trials', expected_exit_status: 0 }],
    observation_targets: [{ target_id: 'multifamily_transfer_report', path: rel(reportFile), required_change: true }],
  };
  const verifier = {
    verifier_id: verificationId,
    status: transferSupported ? 'ok' : 'critical',
    outcome: transferSupported ? 'verified' : 'unverified',
    independent_from_planner: true,
    action_receipt_ids: [receiptId],
    evidence: [rel(reportFile), rel(path.join(experimentDir, 'sealed_manifest.json')), rel(path.join(experimentDir, 'apfc_graph.json'))],
    checks: masterEdges.map((edge, index) => ({ check_id: `closure_edge_${index + 1}`, status: edge.status, message: `${edge.edge}: ${edge.verifier}`, evidence: [rel(reportFile)] })),
  };
  const aggregateReceipt = {
    schema_version: 1,
    action_receipt_id: receiptId,
    episode_id: episodeId,
    action_id: 'codex_ephemeral_three_condition_trials',
    tool: 'openai_codex_cli',
    input_hash: sha256Json({ source_manifest: sourceManifest, design: report.design, model }),
    started_at: createdAt,
    completed_at: completedAt,
    status: 'completed',
    exit_status: 0,
    expected_exit_status: 0,
    artifacts: [rel(reportFile), rel(reportMdFile), rel(receiptDir), rel(path.join(experimentDir, 'apfc_graph.json'))],
    state_before: { hash: sha256Json({ experiment_id: experimentId, state: 'sealed' }), targets: [{ path: rel(experimentDir), state: 'sealed' }] },
    state_after: { hash: sha256Json({ experiment_id: experimentId, report_hash: sha256Json(report) }), targets: [{ path: rel(reportFile), state: report.status }] },
    observed_delta: { changed: true, targets: [{ metric: 'unseen_family_verified_success_rate', before: apfcgVsDisabled.control_success_rate, after: apfcgVsDisabled.treatment_success_rate, delta: apfcgVsDisabled.absolute_delta }] },
    rollback: { automatic_promotion: false, action: 'Disable the experimental graph and retain append-only evidence.' },
    readback: { invocation_count: results.length, transfer_supported: transferSupported, graph_advantage_supported: graphAdvantageClosed && transferSupported },
  };
  const evalPayload = {
    schema_version: 1,
    updated_at: completedAt,
    status: transferSupported ? 'ok' : 'critical',
    metrics: {
      episode_count: 1,
      success_rate: transferSupported ? 1 : 0,
      unverified_count: transferSupported ? 0 : 1,
      failure_recovery_rate: 0,
      promoted_skill_count: 0,
      candidate_skill_count: induction.skills.length,
      regression_count: 0,
    },
    eval_id: evalId,
    experiment_id: experimentId,
    transfer_measurement: report.transfer_measurement,
    family_measurements: report.family_measurements,
    cold_start: report.cold_start,
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
    context_pack_id: `context_apfc_multifamily_transfer_${suffix}`,
    risk_level: 'low',
    plan: masterEdges.map((edge, index) => ({ step: index + 1, objective: edge.edge, status: edge.status })),
    actions: [{ action_id: aggregateReceipt.action_id, receipt_id: receiptId }],
    observations: [{ metric: report.transfer_measurement.metric, ...report.transfer_measurement }],
    errors: transferSupported ? [] : masterEdges.filter((edge) => edge.status !== 'ok'),
    artifacts: [rel(reportFile), rel(reportMdFile), rel(path.join(experimentDir, 'apfc_graph.json')), rel(evalFile)],
    action_receipts: [rel(aggregateReceiptFile)],
    verification_result_file: rel(verificationFile),
    verifier_results: [verifier],
    verdict: transferSupported ? 'success' : 'partial',
    lessons: [
      transferSupported
        ? 'Verified source-family procedures were composed and causally transferred to six unseen composite families across four synthetic operational domains.'
        : 'The preregistered bounded multi-family transfer gate did not close.',
      'No target-specific skill was induced, and no literal universality or AGI claim follows.',
    ],
    candidate_claim_updates: [],
    candidate_skills: [],
    regressions: [],
  };
  for (const [filePath, payload] of [
    [taskFile, taskSpec],
    [verificationFile, verifier],
    [aggregateReceiptFile, aggregateReceipt],
    [evalFile, evalPayload],
    [episodeFile, episode],
  ]) {
    if (fs.existsSync(filePath)) throw new Error(`APFC_TRANSFER_CANONICAL_ARTIFACT_CONFLICT: ${rel(filePath)}`);
    atomicWriteJson(filePath, payload);
  }
  atomicWriteText(evalMdFile, [
    '# APFC multi-family transfer eval', '',
    `Eval: \`${evalId}\``, '',
    `Status: \`${evalPayload.status}\``, '',
    `APFCG versus disabled delta: \`${apfcgVsDisabled.absolute_delta}\``, '',
    `Exact McNemar p: \`${apfcgVsDisabled.mcnemar_exact_two_sided_p}\``, '',
  ].join('\n'));
  atomicWriteText(episodeMdFile, [
    `# Episode ${episodeId}`, '',
    `Verdict: \`${episode.verdict}\``, '',
    ...episode.lessons.map((lesson) => `- ${lesson}`), '',
  ].join('\n'));

  return {
    ok: true,
    experiment_id: experimentId,
    status: report.status,
    report_file: rel(reportFile),
    report_markdown_file: rel(reportMdFile),
    graph_file: rel(path.join(experimentDir, 'apfc_graph.json')),
    episode_file: rel(episodeFile),
    eval_file: rel(evalFile),
    total_model_invocations: results.length,
    held_out_family_count: TARGET_FAMILIES.length,
    domain_count: report.design.domain_count,
    memory_disabled_success_rate: apfcgVsDisabled.control_success_rate,
    flat_memory_success_rate: apfcgVsFlat.control_success_rate,
    apfcg_composed_success_rate: apfcgVsDisabled.treatment_success_rate,
    apfcg_vs_disabled_delta: apfcgVsDisabled.absolute_delta,
    apfcg_vs_disabled_mcnemar_p: apfcgVsDisabled.mcnemar_exact_two_sided_p,
    apfcg_vs_flat_delta: apfcgVsFlat.absolute_delta,
    apfcg_vs_flat_mcnemar_p: apfcgVsFlat.mcnemar_exact_two_sided_p,
    bounded_multifamily_compositional_transfer_supported: transferSupported,
    apfcg_retrieval_advantage_supported: graphAdvantageClosed && transferSupported,
  };
}

function verifyMultifamilyTransferExperiment(reportPath) {
  const resolvedReport = path.isAbsolute(reportPath) ? reportPath : path.join(WORKSPACE_ROOT, reportPath);
  const report = readObject(resolvedReport, 'APFC_TRANSFER_REPORT');
  assertTransferReport(report);
  const experimentDir = path.dirname(resolvedReport);
  const sealed = readObject(path.join(experimentDir, 'sealed_manifest.json'), 'APFC_TRANSFER_SEALED_MANIFEST');
  const developmentEpisodes = JSON.parse(fs.readFileSync(path.join(experimentDir, 'evidence', 'development_episodes.json'), 'utf8'));
  const skills = JSON.parse(fs.readFileSync(path.join(experimentDir, 'induced_skills.json'), 'utf8'));
  const graph = readObject(path.join(experimentDir, 'apfc_graph.json'), 'APFC_TRANSFER_GRAPH');
  const flatSelectionIndex = readObject(path.join(experimentDir, 'flat_selection_index.json'), 'APFC_TRANSFER_FLAT_INDEX');
  const targetCases = JSON.parse(fs.readFileSync(path.join(experimentDir, 'evidence', 'unsealed_target_cases.json'), 'utf8'));
  const responseSchema = readObject(RESPONSE_SCHEMA, 'APFC_TRANSFER_RESPONSE_SCHEMA');
  assertApfcGraph(graph);

  const recomputedInduction = inducePrimitiveSkills(developmentEpisodes, developmentEpisodes[0].created_at);
  const graphSourceManifest = {
    development_episode_hash: sha256Json(developmentEpisodes),
    induced_skill_bundle_hash: sha256Json(skills),
  };
  const recomputedGraph = buildSkillGraph(recomputedInduction.skills, graphSourceManifest);
  const contextPacks = {};
  const flatSelections = {};
  const contextPackIndex = {};
  for (const family of TARGET_FAMILIES) {
    const taskSpec = {
      task_spec_id: `task_${family.family_id}`,
      family_id: family.family_id,
      domain: family.domain,
      goal: family.goal,
      start_type: family.start_type,
      goal_type: family.goal_type,
    };
    const storedPack = readObject(path.join(experimentDir, 'context_packs', `${family.family_id}.json`), 'APFC_TRANSFER_CONTEXT_PACK');
    assertContextPack(storedPack);
    const recomputedPack = compileContextPack(graph, taskSpec);
    if (sha256Json(storedPack) !== sha256Json(recomputedPack)) throw new Error(`APFC_TRANSFER_CONTEXT_REPLAY_MISMATCH: ${family.family_id}`);
    contextPacks[family.family_id] = storedPack;
    contextPackIndex[family.family_id] = sha256Json(storedPack);
    flatSelections[family.family_id] = flatRetrieveSkills(graph, taskSpec, storedPack.composition.path_skill_ids.length);
  }
  const recomputedFlatIndex = Object.fromEntries(Object.entries(flatSelections).map(([familyId, nodes]) => [familyId, nodes.map((node) => node.id)]));
  const holdoutManifest = targetCases.map((item) => ({
    case_id: item.case_id,
    family_id: item.family.family_id,
    input_hash: sha256Json(item.input),
    expected_hash: sha256Json(item.expected),
  }));
  const sourceChecks = {
    sealed_before_trials: sealed.sealed_before_trials === true,
    development_hash_matches: sha256Json(developmentEpisodes) === report.source_manifest.development_episode_hash,
    skill_bundle_hash_matches: sha256Json(skills) === report.source_manifest.induced_skill_bundle_hash,
    skills_reinduce_identically: sha256Json(recomputedInduction.skills) === sha256Json(skills),
    graph_source_manifest_hash_matches: sha256Json(graphSourceManifest) === report.source_manifest.graph_source_manifest_hash,
    graph_hash_matches: sha256Json(graph) === report.source_manifest.graph_hash,
    graph_rebuilds_identically: sha256Json(recomputedGraph) === sha256Json(graph),
    context_pack_index_hash_matches: sha256Json(contextPackIndex) === report.source_manifest.context_pack_index_hash,
    flat_selection_index_matches: sha256Json(recomputedFlatIndex) === sha256Json(flatSelectionIndex),
    flat_selection_index_hash_matches: sha256Json(flatSelectionIndex) === report.source_manifest.flat_selection_index_hash,
    holdout_manifest_recomputes: sha256Json(holdoutManifest) === report.source_manifest.holdout_manifest_hash,
    sealed_holdout_manifest_matches: sha256Json(sealed.holdout_manifest) === sha256Json(holdoutManifest),
    sealed_source_manifest_matches: sha256Json(sealed.source_manifest) === sha256Json(report.source_manifest),
    response_schema_hash_matches: sha256Json(responseSchema) === report.source_manifest.response_schema_hash,
    all_target_oracles_recompute: targetCases.every((item) => item.expected === oracleForCase(item)),
    target_inputs_absent_from_development: (() => {
      const developmentInputHashes = new Set(developmentEpisodes.flatMap((episode) => (
        episode.examples.map((example) => sha256Json(example.input))
      )));
      return targetCases.every((item) => !developmentInputHashes.has(sha256Json(item.input)));
    })(),
    graph_paths_match_independent_oracles: targetCases.every((item) => (
      executeLearnedPath(contextPacks[item.family.family_id], item.input, recomputedInduction.selected_operators) === oracleForCase(item)
    )),
  };

  const receiptDir = path.join(experimentDir, 'trial_receipts');
  const receipts = fs.readdirSync(receiptDir)
    .filter((fileName) => fileName.endsWith('.json'))
    .sort()
    .map((fileName) => readObject(path.join(receiptDir, fileName), 'APFC_TRANSFER_TRIAL_RECEIPT'));
  const expectedReceiptCount = report.design.total_model_invocations;
  const caseById = new Map(targetCases.map((item) => [item.case_id, item]));
  const rebuiltReceipts = receipts.map((receipt) => {
    const targetCase = caseById.get(receipt.case_id);
    if (!targetCase) throw new Error(`APFC_TRANSFER_RECEIPT_CASE_UNKNOWN: ${receipt.case_id}`);
    const contextPack = contextPacks[receipt.family_id];
    const flatSkills = flatSelections[receipt.family_id];
    const prompt = buildTrialPrompt(targetCase, receipt.condition, contextPack, flatSkills);
    const expected = oracleForCase(targetCase);
    const selectedNodeIds = receipt.condition === 'apfcg_composed'
      ? contextPack.composition.path_node_ids
      : receipt.condition === 'flat_memory'
        ? flatSkills.map((node) => node.id)
        : [];
    const memoryHash = receipt.condition === 'apfcg_composed'
      ? sha256Json(contextPack)
      : receipt.condition === 'flat_memory'
        ? sha256Json(flatSkills)
        : null;
    const independentlySuccessful = receipt.exit_status === 0 && receipt.timed_out === false
      && receipt.tool_use_violation === false && receipt.structured_response_valid === true
      && receipt.response && receipt.response.result === expected;
    return {
      receipt,
      checks: {
        input_hash: receipt.input_hash === sha256Json(targetCase.input),
        expected_hash: receipt.expected_hash === sha256Json(expected),
        prompt_hash: receipt.prompt_hash === sha256Json(prompt),
        memory_hash: receipt.memory_hash === memoryHash,
        selected_nodes: sha256Json(receipt.selected_node_ids) === sha256Json(selectedNodeIds),
        verified_success: receipt.verified_success === independentlySuccessful,
      },
    };
  });
  const receiptChecks = {
    receipt_count_matches: receipts.length === expectedReceiptCount,
    every_condition_valid: receipts.every((receipt) => CONDITIONS.includes(receipt.condition)),
    every_receipt_ephemeral: receipts.every((receipt) => receipt.ephemeral === true && receipt.ignore_user_config === true),
    every_receipt_one_attempt: receipts.every((receipt) => receipt.attempts === 1),
    every_receipt_tool_free: receipts.every((receipt) => receipt.tool_use_violation === false && receipt.tool_event_types.length === 0),
    unique_thread_ids: new Set(receipts.map((receipt) => receipt.thread_id)).size === receipts.length,
    every_receipt_rebuilds: rebuiltReceipts.every((item) => Object.values(item.checks).every(Boolean)),
    disabled_memory_absent: receipts.filter((receipt) => receipt.condition === 'memory_disabled')
      .every((receipt) => receipt.memory_hash === null && receipt.selected_node_ids.length === 0),
  };
  const hasFailClosedInfrastructurePolicy = Number.isFinite(report.design.max_infrastructure_failure_rate);
  const recomputedInfrastructureFailureCount = receipts.filter((receipt) => (
    receipt.timed_out || receipt.exit_status !== 0 || receipt.spawn_error
  )).length;
  const recomputedInfrastructureFailureRate = recomputedInfrastructureFailureCount / receipts.length;
  if (hasFailClosedInfrastructurePolicy) {
    receiptChecks.infrastructure_failures_scored_fail_closed = receipts.every((receipt) => {
      const infrastructureFailure = receipt.timed_out || receipt.exit_status !== 0 || receipt.spawn_error;
      return !infrastructureFailure || receipt.verified_success === false;
    });
    receiptChecks.infrastructure_failure_rate_within_preregistered_limit = (
      recomputedInfrastructureFailureRate <= report.design.max_infrastructure_failure_rate
    );
    receiptChecks.execution_reliability_readback_matches = Boolean(report.execution_reliability)
      && report.execution_reliability.infrastructure_failure_count === recomputedInfrastructureFailureCount
      && report.execution_reliability.infrastructure_failure_rate === recomputedInfrastructureFailureRate
      && report.execution_reliability.maximum_allowed_failure_rate === report.design.max_infrastructure_failure_rate;
  } else {
    receiptChecks.every_receipt_completed = receipts.every((receipt) => receipt.exit_status === 0 && receipt.timed_out === false);
    receiptChecks.every_response_structured = receipts.every((receipt) => receipt.structured_response_valid === true);
  }

  const pairRows = receipts.map((receipt) => ({
    trial_index: receipt.trial_index,
    case_id: receipt.case_id,
    family_id: receipt.family_id,
    condition: receipt.condition,
    verified_success: receipt.verified_success,
  }));
  const recomputedMeasurements = {
    metric: 'independently_verified_sealed_unseen_family_success_rate',
    apfcg_vs_disabled: pairwiseMeasurement(pairRows, 'memory_disabled', 'apfcg_composed'),
    apfcg_vs_flat: pairwiseMeasurement(pairRows, 'flat_memory', 'apfcg_composed'),
    flat_vs_disabled: pairwiseMeasurement(pairRows, 'memory_disabled', 'flat_memory'),
  };
  const recomputedFamilies = familyMeasurements(pairRows);
  const recomputedColdStarts = coldStartMeasurements(pairRows, report.design.trial_count);
  const measurementChecks = {
    transfer_measurement_matches: sha256Json(recomputedMeasurements) === sha256Json(report.transfer_measurement),
    family_measurements_match: sha256Json(recomputedFamilies) === sha256Json(report.family_measurements),
    cold_start_measurements_match: sha256Json(recomputedColdStarts) === sha256Json(report.cold_start.trial_results),
    every_family_has_all_conditions: recomputedFamilies.every((family) => CONDITIONS.every((condition) => family.conditions[condition].observation_count === report.design.trial_count * 5)),
  };
  const allChecks = { ...sourceChecks, ...receiptChecks, ...measurementChecks };
  const failedChecks = Object.entries(allChecks).filter(([, passed]) => !passed).map(([checkId]) => checkId);
  return {
    ok: failedChecks.length === 0,
    mode: 'apfc_multifamily_transfer_verify',
    experiment_id: report.experiment_id,
    report_file: rel(resolvedReport),
    report_hash: sha256Json(report),
    receipt_count: receipts.length,
    paired_observation_count_per_comparison: recomputedMeasurements.apfcg_vs_disabled.observation_count,
    held_out_family_count: report.design.held_out_family_count,
    domain_count: report.design.domain_count,
    source_checks: sourceChecks,
    receipt_checks: receiptChecks,
    measurement_checks: measurementChecks,
    recomputed_transfer_measurement: recomputedMeasurements,
    failed_checks: failedChecks,
    bounded_multifamily_compositional_transfer_supported: failedChecks.length === 0
      && report.claim_state.bounded_multifamily_compositional_transfer_supported === true,
    apfcg_retrieval_advantage_supported: failedChecks.length === 0
      && report.claim_state.apfcg_retrieval_advantage_supported === true,
  };
}

module.exports = {
  CONDITIONS,
  DEFAULT_MAX_INFRASTRUCTURE_FAILURE_RATE,
  PRIMITIVES,
  buildDevelopmentEpisodes,
  inducePrimitiveSkills,
  executeLearnedPath,
  buildTrialPrompt,
  pairwiseMeasurement,
  familyMeasurements,
  coldStartMeasurements,
  assertTransferReport,
  runMultifamilyTransferExperiment,
  verifyMultifamilyTransferExperiment,
};
