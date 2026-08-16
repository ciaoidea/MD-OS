#!/usr/bin/env node
'use strict';

const { sha256Json } = require('../../os/lib/common');

const ROUTES = Object.freeze(['zenith', 'east', 'center', 'nadir', 'west', 'north', 'south']);

function normalizeText(value) {
  return String(value).trim().split(/\s+/).filter(Boolean).join('_').toLowerCase();
}

function keepFirstCharacters(value) {
  const seen = new Set();
  let output = '';
  for (const character of String(value)) {
    if (seen.has(character)) continue;
    seen.add(character);
    output += character;
  }
  return output;
}

function rotateLeft(value, count) {
  const text = String(value);
  if (!text.length) return text;
  const offset = ((count % text.length) + text.length) % text.length;
  return text.slice(offset) + text.slice(0, offset);
}

function signedBase36(value) {
  const number = Number(value);
  if (number < 0) return `-${Math.abs(number).toString(36).toUpperCase()}`;
  return number.toString(36).toUpperCase();
}

function auroraLattice(input) {
  return normalizeText(input).split('_').reverse().join('/');
}

function meridianTurn(input) {
  return rotateLeft(keepFirstCharacters(normalizeText(input)), 2);
}

function vectorForge(input) {
  const absolute = input.map((value) => Math.abs(Number(value)));
  const zigzag = absolute.map((value, index) => index % 2 === 0 ? value : -value);
  return signedBase36(zigzag.reduce((sum, value) => sum + value, 0));
}

function quartzRemainder(input) {
  const absolute = input.map((value) => Math.abs(Number(value)));
  const weighted = absolute.reduce((sum, value, index) => sum + ((index + 1) * value), 0);
  return String(((weighted % 97) + 97) % 97).padStart(2, '0');
}

function orbitalDispatch(input) {
  const token = String(input.token || '');
  const expectedPrefix = String(input.expected_prefix || '');
  const sequence = Number(input.sequence);
  const parts = token.split('#');
  if (parts.length !== 2 || !Number.isInteger(sequence)) return 'vault';
  const [prefix, payload] = parts;
  if (prefix.toLowerCase() !== expectedPrefix.toLowerCase()
    || !payload
    || !/^[A-Za-z0-9_-]+$/.test(payload)) return 'vault';
  const normalized = payload.toLowerCase();
  const checksum = [...normalized].reduce((sum, character) => sum + character.codePointAt(0), 0);
  const residue = ((checksum + sequence) % 7 + 7) % 7;
  return ROUTES[residue];
}

function sentinelState(input) {
  const counts = { A: 0, B: 0, C: 0 };
  for (const character of String(input).toUpperCase()) {
    if (Object.hasOwn(counts, character)) counts[character] += 1;
  }
  const score = (3 * counts.A) + (2 * counts.B) - counts.C;
  if (score >= 8) return 'red';
  if (score >= 3) return 'amber';
  return 'green';
}

const TARGET_FAMILIES = Object.freeze([
  Object.freeze({
    family_id: 'target_aurora_lattice',
    domain: 'text_transformation',
    title: 'Aurora lattice finalizer',
    goal: 'Transform one raw textual reading into the required lattice result.',
    start_type: 'text.raw',
    goal_type: 'text.slash_joined',
    oracle: auroraLattice,
    inputs: Object.freeze([
      '  Red   Blue Green  ',
      'Alpha beta   GAMMA delta',
      'north   south',
      'One two three four five',
      '  Quartz   NODE   Signal ',
    ]),
  }),
  Object.freeze({
    family_id: 'target_meridian_turn',
    domain: 'text_transformation',
    title: 'Meridian turn finalizer',
    goal: 'Transform one raw textual reading into the required turned result.',
    start_type: 'text.raw',
    goal_type: 'text.rotated',
    oracle: meridianTurn,
    inputs: Object.freeze([
      '  Balloon  FIELD ',
      'Mississippi River',
      'LEVEL rotor signal',
      'abracadabra node',
      '  parallel   lattice ',
    ]),
  }),
  Object.freeze({
    family_id: 'target_vector_forge',
    domain: 'numeric_transformation',
    title: 'Vector forge finalizer',
    goal: 'Transform one raw integer vector into the required forge code.',
    start_type: 'numbers.raw',
    goal_type: 'number.base36',
    oracle: vectorForge,
    inputs: Object.freeze([
      [12, -3, 8, -2],
      [-20, 5, -7, 1, 4],
      [3, 11, -25],
      [-40, -9, 2, 6],
      [18, -4, -3, -2, 15],
    ]),
  }),
  Object.freeze({
    family_id: 'target_quartz_remainder',
    domain: 'numeric_transformation',
    title: 'Quartz remainder finalizer',
    goal: 'Transform one raw integer vector into the required remainder code.',
    start_type: 'numbers.raw',
    goal_type: 'number.mod97_code',
    oracle: quartzRemainder,
    inputs: Object.freeze([
      [2, -5, 9],
      [-10, 4, -7, 2],
      [25, -6],
      [-3, -8, 5, 11],
      [17, 19, -23, 29, -31],
    ]),
  }),
  Object.freeze({
    family_id: 'target_orbital_dispatch',
    domain: 'record_routing',
    title: 'Orbital dispatch finalizer',
    goal: 'Transform one raw dispatch record into its required final route.',
    start_type: 'record.raw',
    goal_type: 'record.route',
    oracle: orbitalDispatch,
    inputs: Object.freeze([
      { token: 'COMET#Field_42', expected_prefix: 'comet', sequence: 7 },
      { token: 'Aster#Mixed_19', expected_prefix: 'ASTER', sequence: 13 },
      { token: 'LUNA#Node_21', expected_prefix: 'solar', sequence: 6 },
      { token: 'VEGA#bad.value', expected_prefix: 'vega', sequence: 9 },
      { token: 'Raven#Signal_27', expected_prefix: 'raven', sequence: 23 },
    ]),
  }),
  Object.freeze({
    family_id: 'target_sentinel_state',
    domain: 'event_state',
    title: 'Sentinel state finalizer',
    goal: 'Transform one raw event stream into the required final state.',
    start_type: 'events.raw',
    goal_type: 'event.status',
    oracle: sentinelState,
    inputs: Object.freeze([
      'AAbbC!',
      'bBcC-a',
      'AAA-BB-CCx',
      'qCCCa',
      'abA-cB-a',
    ]),
  }),
]);

function familyPublicContract(family) {
  return {
    family_id: family.family_id,
    domain: family.domain,
    title: family.title,
    goal: family.goal,
    start_type: family.start_type,
    goal_type: family.goal_type,
  };
}

function generateTargetCases(experimentId) {
  const salt = sha256Json({ experiment_id: experimentId, purpose: 'apfc_multifamily_case_order' });
  const cases = [];
  for (const family of TARGET_FAMILIES) {
    family.inputs.forEach((input, index) => {
      const expected = String(family.oracle(input));
      const caseId = `${family.family_id.replace(/^target_/, '')}_${String(index + 1).padStart(2, '0')}`;
      cases.push({
        case_id: caseId,
        family: familyPublicContract(family),
        input,
        expected,
        order_key: sha256Json({ salt, case_id: caseId }),
      });
    });
  }
  return cases.sort((left, right) => left.order_key.localeCompare(right.order_key));
}

function oracleForCase(targetCase) {
  const family = TARGET_FAMILIES.find((item) => item.family_id === targetCase.family.family_id);
  if (!family) throw new Error(`APFC_TRANSFER_ORACLE_FAMILY_UNKNOWN: ${targetCase.family.family_id}`);
  return String(family.oracle(targetCase.input));
}

module.exports = {
  ROUTES,
  TARGET_FAMILIES,
  familyPublicContract,
  generateTargetCases,
  oracleForCase,
};
