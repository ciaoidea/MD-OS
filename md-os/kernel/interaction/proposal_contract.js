#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const { nowIso, shortText } = require('../../os/lib/common');

const SOURCE_TYPES = new Set(['human', 'agent', 'sensor']);
const LANES = new Set(['answer', 'action', 'observation', 'clarification', 'stop']);
const EPISTEMIC_STATUSES = new Set(['observation', 'supported_inference', 'proposal', 'unknown']);
const ID_RE = /^[a-z][a-z0-9_-]*(\.[a-z0-9_-]+)+$/;
const COMMAND_RE = /^[a-z][a-z0-9_-]{0,80}$/;

const SOURCE_POLICY = Object.freeze({
  human: { authority: 'operator', content_type: 'natural_language', default_id: 'local_operator' },
  agent: { authority: 'advisory', content_type: 'agent_message', default_id: 'external_agent' },
  sensor: { authority: 'evidentiary', content_type: 'sensor_observation', default_id: 'external_sensor' },
});

function runtimeId(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assertExactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label}_MUST_BE_OBJECT`);
  }
  const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unexpected.length) throw new Error(`${label}_UNEXPECTED_FIELDS: ${unexpected.join(',')}`);
  const missing = allowed.filter((key) => !Object.prototype.hasOwnProperty.call(value, key));
  if (missing.length) throw new Error(`${label}_MISSING_FIELDS: ${missing.join(',')}`);
}

function boundedText(value, label, { min = 0, max = 12000 } = {}) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (text.length < min) throw new Error(`${label}_TOO_SHORT`);
  if (text.length > max) throw new Error(`${label}_TOO_LONG`);
  return text;
}

function normalizeInputEvent(input = {}) {
  const sourceType = shortText(input.source_type || 'human').toLowerCase();
  if (!SOURCE_TYPES.has(sourceType)) throw new Error(`INPUT_SOURCE_TYPE_INVALID: ${sourceType}`);
  const sourcePolicy = SOURCE_POLICY[sourceType];
  const content = boundedText(input.content, 'INPUT_CONTENT', { min: 1, max: 12000 });
  const sourceId = boundedText(input.source_id || sourcePolicy.default_id, 'INPUT_SOURCE_ID', { min: 1, max: 120 });
  return {
    schema_version: 1,
    event_id: runtimeId('input'),
    received_at: nowIso(),
    source_type: sourceType,
    source_id: sourceId,
    authority: sourcePolicy.authority,
    content_type: sourcePolicy.content_type,
    content,
  };
}

function normalizeParameters(parameters) {
  let entries;
  if (Array.isArray(parameters)) {
    entries = parameters.map((entry, index) => {
      assertExactKeys(entry, ['name', 'value'], `PROPOSAL_ACTION_PARAMETER_${index}`);
      return [entry.name, entry.value];
    });
  } else if (parameters && typeof parameters === 'object') {
    entries = Object.entries(parameters);
  } else {
    throw new Error('PROPOSAL_ACTION_PARAMETERS_MUST_BE_OBJECT_OR_ENTRY_ARRAY');
  }
  if (entries.length > 32) throw new Error('PROPOSAL_ACTION_PARAMETERS_TOO_MANY');
  const normalizedEntries = entries.map(([key, value]) => {
    const normalizedKey = shortText(key);
    if (!/^[a-z][a-z0-9_]{0,80}$/.test(normalizedKey)) {
      throw new Error(`PROPOSAL_ACTION_PARAMETER_KEY_INVALID: ${normalizedKey}`);
    }
    if (typeof value !== 'string') {
      throw new Error(`PROPOSAL_ACTION_PARAMETER_VALUE_INVALID: ${normalizedKey}`);
    }
    const normalizedValue = boundedText(value, `PROPOSAL_ACTION_PARAMETER_${normalizedKey}`, { max: 2000 });
    return [normalizedKey, normalizedValue];
  });
  const duplicates = normalizedEntries
    .map(([key]) => key)
    .filter((key, index, keys) => keys.indexOf(key) !== index);
  if (duplicates.length) throw new Error(`PROPOSAL_ACTION_PARAMETERS_DUPLICATE: ${[...new Set(duplicates)].join(',')}`);
  return Object.fromEntries(normalizedEntries);
}

function validateProposal(payload) {
  const proposalKeys = ['schema_version', 'lane', 'summary', 'response', 'epistemic_status', 'action'];
  const actionKeys = [
    'requested',
    'capability_id',
    'module_id',
    'command_name',
    'parameters',
    'expected_effect',
    'required_sensor',
    'required_verifier',
  ];
  assertExactKeys(payload, proposalKeys, 'PROPOSAL');
  assertExactKeys(payload.action, actionKeys, 'PROPOSAL_ACTION');
  if (payload.schema_version !== 1) throw new Error('PROPOSAL_SCHEMA_VERSION_UNSUPPORTED');

  const lane = shortText(payload.lane);
  if (!LANES.has(lane)) throw new Error(`PROPOSAL_LANE_INVALID: ${lane}`);
  const epistemicStatus = shortText(payload.epistemic_status);
  if (!EPISTEMIC_STATUSES.has(epistemicStatus)) {
    throw new Error(`PROPOSAL_EPISTEMIC_STATUS_INVALID: ${epistemicStatus}`);
  }

  const actionRequested = payload.action.requested === true;
  if (lane === 'action' && !actionRequested) throw new Error('ACTION_LANE_REQUIRES_ACTION');
  if (lane !== 'action' && actionRequested) throw new Error('NON_ACTION_LANE_CANNOT_REQUEST_ACTION');

  const action = {
    requested: actionRequested,
    capability_id: boundedText(payload.action.capability_id, 'PROPOSAL_CAPABILITY_ID', { max: 160 }),
    module_id: boundedText(payload.action.module_id, 'PROPOSAL_MODULE_ID', { max: 160 }),
    command_name: boundedText(payload.action.command_name, 'PROPOSAL_COMMAND_NAME', { max: 81 }),
    parameters: normalizeParameters(payload.action.parameters),
    expected_effect: boundedText(payload.action.expected_effect, 'PROPOSAL_EXPECTED_EFFECT', { max: 1200 }),
    required_sensor: boundedText(payload.action.required_sensor, 'PROPOSAL_REQUIRED_SENSOR', { max: 160 }),
    required_verifier: boundedText(payload.action.required_verifier, 'PROPOSAL_REQUIRED_VERIFIER', { max: 160 }),
  };

  if (actionRequested) {
    if (!ID_RE.test(action.capability_id)) throw new Error('PROPOSAL_CAPABILITY_ID_INVALID');
    if (!ID_RE.test(action.module_id)) throw new Error('PROPOSAL_MODULE_ID_INVALID');
    if (!COMMAND_RE.test(action.command_name)) throw new Error('PROPOSAL_COMMAND_NAME_INVALID');
    if (!action.expected_effect) throw new Error('PROPOSAL_EXPECTED_EFFECT_REQUIRED');
    if (!action.required_sensor) throw new Error('PROPOSAL_REQUIRED_SENSOR_REQUIRED');
    if (!action.required_verifier) throw new Error('PROPOSAL_REQUIRED_VERIFIER_REQUIRED');
  } else if (
    action.capability_id
    || action.module_id
    || action.command_name
    || Object.keys(action.parameters).length
    || action.expected_effect
    || action.required_sensor
    || action.required_verifier
  ) {
    throw new Error('NON_ACTION_LANE_ACTION_FIELDS_MUST_BE_EMPTY');
  }

  return {
    schema_version: 1,
    lane,
    summary: boundedText(payload.summary, 'PROPOSAL_SUMMARY', { min: 1, max: 1200 }),
    response: boundedText(payload.response, 'PROPOSAL_RESPONSE', { min: 1, max: 12000 }),
    epistemic_status: epistemicStatus,
    action,
  };
}

function buildActionCatalogue(registry) {
  const modules = Array.isArray(registry && registry.modules) ? registry.modules : [];
  return modules.flatMap((module) => module.commands
    .filter((command) => command.mcp_tool)
    .map((command) => {
      const tool = command.mcp_tool;
      const capability = module.capabilities[0] || null;
      return {
        module_id: module.module_id,
        command_name: command.command_name,
        capability_id: capability ? capability.capability_id : '',
        risk: capability ? capability.risk : 'critical',
        summary: command.summary,
        parameters: tool.input_schema && tool.input_schema.properties || {},
        required_parameters: tool.input_schema && tool.input_schema.required || [],
        argument_order: tool.argument_order || [],
      };
    }))
    .sort((left, right) => `${left.module_id}.${left.command_name}`.localeCompare(`${right.module_id}.${right.command_name}`));
}

function resolveProposalAction(proposal, registry) {
  if (!proposal.action.requested) throw new Error('PROPOSAL_DOES_NOT_REQUEST_ACTION');
  const module = registry.modules.find((item) => item.module_id === proposal.action.module_id);
  if (!module) throw new Error(`PROPOSAL_MODULE_NOT_REGISTERED: ${proposal.action.module_id}`);
  const capability = module.capabilities.find((item) => item.capability_id === proposal.action.capability_id);
  if (!capability) throw new Error(`PROPOSAL_CAPABILITY_NOT_REGISTERED: ${proposal.action.capability_id}`);
  const command = module.commands.find((item) => item.command_name === proposal.action.command_name);
  if (!command || !command.mcp_tool) {
    throw new Error(`PROPOSAL_COMMAND_NOT_INTERACTIVE: ${proposal.action.module_id}.${proposal.action.command_name}`);
  }

  const tool = command.mcp_tool;
  const allowed = new Set(tool.argument_order || []);
  const supplied = Object.keys(proposal.action.parameters);
  const unexpected = supplied.filter((key) => !allowed.has(key));
  if (unexpected.length) throw new Error(`PROPOSAL_PARAMETERS_NOT_REGISTERED: ${unexpected.join(',')}`);
  const required = tool.input_schema && Array.isArray(tool.input_schema.required)
    ? tool.input_schema.required
    : tool.argument_order;
  const missing = required.filter((key) => !Object.prototype.hasOwnProperty.call(proposal.action.parameters, key));
  if (missing.length) throw new Error(`PROPOSAL_PARAMETERS_MISSING: ${missing.join(',')}`);

  const args = tool.argument_order
    .filter((key) => Object.prototype.hasOwnProperty.call(proposal.action.parameters, key))
    .map((key) => String(proposal.action.parameters[key]));
  return {
    module_id: module.module_id,
    command_name: command.command_name,
    capability_id: capability.capability_id,
    risk: capability.risk,
    args,
  };
}

module.exports = {
  buildActionCatalogue,
  normalizeInputEvent,
  resolveProposalAction,
  runtimeId,
  validateProposal,
};
