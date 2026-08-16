#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');

const REQUIRED_CONSTRAINTS = [
  'exact_arity',
  'prefix_match',
  'payload_nonempty',
  'payload_charset',
];
const SKILL_FAMILY = 'delimited_boundary_validation_v1';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function sha256Json(value) {
  return crypto.createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

function sha256Text(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function decodeLiteral(raw) {
  try {
    return JSON.parse(`"${String(raw).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  } catch (_) {
    return raw;
  }
}

function stringLiterals(text) {
  const result = [];
  const pattern = /(['"])((?:\\.|(?!\1).)*)\1/g;
  let match;
  while ((match = pattern.exec(String(text))) !== null) result.push(decodeLiteral(match[2]));
  return result;
}

function sourceProjection(repositorySnapshot) {
  const files = Array.isArray(repositorySnapshot && repositorySnapshot.files)
    ? repositorySnapshot.files
    : [];
  const sources = files.filter((file) => /^src\/.*\.js$/.test(String(file.path || '')) && typeof file.text === 'string');
  const projectionPattern = /([A-Za-z_$][\w$]*)\.split\((['"])([^'"]+)\2\)\.at\(-1\)/;
  const matches = sources.map((file) => ({ file, match: projectionPattern.exec(file.text) })).filter((item) => item.match);
  if (matches.length !== 1) throw new Error(`SKILL_PROVIDER_SOURCE_PROJECTION_AMBIGUOUS: ${matches.length}`);
  const [{ file, match }] = matches;
  const source = file.text;
  const variable = match[1];
  const delimiter = match[3];
  const projectionText = match[0];
  const functionMatches = Array.from(source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g))
    .filter((entry) => Number(entry.index) < Number(match.index));
  const functionName = functionMatches.length ? functionMatches.at(-1)[1] : '';
  if (!functionName) throw new Error('SKILL_PROVIDER_FUNCTION_NAME_NOT_FOUND');
  const lines = source.replace(/\n$/, '').split('\n');
  const fallbackIndex = lines.findIndex((line) => line.includes(projectionText) && line.includes('return'));
  if (fallbackIndex < 0) throw new Error('SKILL_PROVIDER_FALLBACK_RETURN_NOT_FOUND');
  const fallbackLine = lines[fallbackIndex];
  const indent = (fallbackLine.match(/^\s*/) || [''])[0];
  const returnMatch = /return\s+(.+);\s*$/.exec(fallbackLine);
  if (!returnMatch) throw new Error('SKILL_PROVIDER_FALLBACK_RETURN_UNSUPPORTED');
  const missingPattern = new RegExp(String.raw`^\s*if\s*\(\s*!${escapeRegExp(variable)}\s*\)\s*\{\s*$`);
  const missingIndex = lines.slice(0, fallbackIndex).findLastIndex((line) => missingPattern.test(line));
  const failureLine = missingIndex >= 0
    ? lines.slice(missingIndex + 1, fallbackIndex).find((line) => /return\s+.+;\s*$/.test(line))
    : '';
  const failureMatch = failureLine && /return\s+(.+);\s*$/.exec(failureLine);
  if (!failureMatch) throw new Error('SKILL_PROVIDER_FAILURE_RETURN_NOT_FOUND');
  return {
    source_path: file.path,
    source,
    lines,
    fallback_index: fallbackIndex,
    fallback_line: fallbackLine,
    indent,
    variable,
    function_name: functionName,
    delimiter,
    projection_text: projectionText,
    return_expression: returnMatch[1],
    failure_expression: failureMatch[1],
  };
}

function inferPrefix(request, projection) {
  const snapshot = request.repository_snapshot || {};
  const files = Array.isArray(snapshot.files) ? snapshot.files : [];
  const regressionText = files
    .filter((file) => /^checks\/.*regression.*\.js$/.test(String(file.path || '')) && typeof file.text === 'string')
    .map((file) => file.text)
    .join('\n');
  const privileged = new Set();
  const specialPattern = new RegExp(`${escapeRegExp(projection.variable)}\\s*===\\s*(['"])((?:\\.|(?!\\1).)*)\\1`, 'g');
  let special;
  while ((special = specialPattern.exec(projection.source)) !== null) privileged.add(decodeLiteral(special[2]));
  const callPattern = new RegExp(`${escapeRegExp(projection.function_name)}\\s*\\(\\s*(['"])((?:\\\\.|(?!\\1).)*)\\1\\s*\\)`, 'g');
  const observedInputs = [];
  let call;
  while ((call = callPattern.exec(regressionText)) !== null) observedInputs.push(decodeLiteral(call[2]));
  const candidates = observedInputs.filter((value) => {
    if (privileged.has(value)) return false;
    const parts = String(value).split(projection.delimiter);
    return parts.length === 2 && parts[0] && parts[1];
  });
  if (!candidates.length) throw new Error('SKILL_PROVIDER_PREFIX_EXAMPLE_NOT_FOUND');
  const prefixes = Array.from(new Set(candidates.map((value) => String(value).split(projection.delimiter)[0].toLowerCase())));
  if (prefixes.length !== 1) throw new Error(`SKILL_PROVIDER_PREFIX_AMBIGUOUS: ${prefixes.join(',')}`);
  return prefixes[0];
}

function fullFilePatch(sourcePath, before, after) {
  const beforeText = String(before).replace(/\n$/, '');
  const afterText = String(after).replace(/\n$/, '');
  const beforeLines = beforeText.split('\n');
  const afterLines = afterText.split('\n');
  return [
    `diff --git a/${sourcePath} b/${sourcePath}`,
    `--- a/${sourcePath}`,
    `+++ b/${sourcePath}`,
    `@@ -1,${beforeLines.length} +1,${afterLines.length} @@`,
    ...beforeLines.map((line) => `-${line}`),
    ...afterLines.map((line) => `+${line}`),
    '',
  ].join('\n');
}

function replaceFallback(projection, replacementLines) {
  const lines = projection.lines.slice();
  lines.splice(projection.fallback_index, 1, ...replacementLines);
  return `${lines.join('\n')}\n`;
}

function baselinePatch(projection) {
  const guard = `${projection.indent}if (!${projection.variable}.includes(${JSON.stringify(projection.delimiter)})) return ${projection.failure_expression};`;
  return fullFilePatch(
    projection.source_path,
    projection.source,
    replaceFallback(projection, [guard, projection.fallback_line])
  );
}

function structuredPatch(projection, prefix, constraints) {
  const partsVariable = '_mdosParts';
  const payloadVariable = '_mdosPayload';
  const conditions = [];
  if (constraints.includes('exact_arity')) conditions.push(`${partsVariable}.length !== 2`);
  if (constraints.includes('prefix_match')) conditions.push(`${partsVariable}[0].toLowerCase() !== ${JSON.stringify(prefix)}`);
  if (constraints.includes('payload_nonempty')) conditions.push(`!${payloadVariable}`);
  if (constraints.includes('payload_charset')) conditions.push(`!Array.from(${payloadVariable}).every((character) => /[A-Za-z0-9_-]/.test(character))`);
  const returned = projection.return_expression.replace(projection.projection_text, payloadVariable);
  const replacement = [
    `${projection.indent}const ${partsVariable} = ${projection.variable}.split(${JSON.stringify(projection.delimiter)});`,
    `${projection.indent}const ${payloadVariable} = ${partsVariable}.at(-1);`,
    `${projection.indent}if (${conditions.join(' || ')}) return ${projection.failure_expression};`,
    `${projection.indent}return ${returned};`,
  ];
  return fullFilePatch(projection.source_path, projection.source, replaceFallback(projection, replacement));
}

function regexPatch(projection, prefix, constraints) {
  if (!REQUIRED_CONSTRAINTS.every((constraint) => constraints.includes(constraint))) {
    throw new Error('SKILL_PROVIDER_REGEX_REQUIRES_COMPLETE_INDUCED_GRAMMAR');
  }
  const pattern = `^${escapeRegExp(prefix)}${escapeRegExp(projection.delimiter)}([A-Za-z0-9_-]+)$`;
  const matchVariable = '_mdosMatch';
  const returned = projection.return_expression.replace(projection.projection_text, `${matchVariable}[1]`);
  const replacement = [
    `${projection.indent}const ${matchVariable} = /${pattern}/i.exec(${projection.variable});`,
    `${projection.indent}if (!${matchVariable}) return ${projection.failure_expression};`,
    `${projection.indent}return ${returned};`,
  ];
  return fullFilePatch(projection.source_path, projection.source, replaceFallback(projection, replacement));
}

function availableSkills(request) {
  const context = request.context_receipt || {};
  const groups = [context.candidate_skills, context.skills];
  return groups.flatMap((group) => Array.isArray(group && group.records) ? group.records : [])
    .map((record) => record && record.payload)
    .filter(Boolean);
}

function selectSkill(request) {
  const experimentId = request.experiment_context && request.experiment_context.experiment_id;
  const matching = availableSkills(request).filter((skill) => skill.induction
    && skill.induction.hypothesis_family === SKILL_FAMILY
    && Array.isArray(skill.induction.selected_constraints)
    && (!experimentId || skill.experiment_id === experimentId));
  if (!matching.length) return null;
  return matching.sort((left, right) => String(right.created_at || '').localeCompare(String(left.created_at || ''))
    || String(left.skill_id).localeCompare(String(right.skill_id)))[0];
}

function visibleTestIds(request) {
  return [
    request.visible_validation.reproduction.command_id,
    ...request.visible_validation.targeted_tests.map((item) => item.command_id),
    ...request.visible_validation.regression_tests.map((item) => item.command_id),
  ];
}

function verifyTargetPaths(request) {
  return Array.from(new Set([
    request.visible_validation.reproduction,
    ...request.visible_validation.targeted_tests,
    ...request.visible_validation.regression_tests,
  ].map((command) => command.argv[1]))).sort();
}

function planGraph({ request, provider, requestHash, candidateId, strategyClass, mechanism, hypothesis, sourcePath, source, informationGain }) {
  const verifyPaths = verifyTargetPaths(request);
  return {
    schema_version: 1,
    plan_graph_id: `plan_${candidateId.replace(/^candidate_/, '').slice(0, 48)}_${requestHash.slice(0, 10)}`,
    benchmark_case_id: request.benchmark_case_id,
    configuration_id: request.configuration.configuration_id,
    strategy_class: strategyClass,
    mechanism,
    hypothesis,
    applicability: {
      defect_classes: [request.issue.defect_class],
      required_paths: [sourcePath],
    },
    preconditions: [{
      precondition_id: `precondition_${candidateId.replace(/^candidate_/, '').slice(0, 48)}`,
      statement: 'A broad delimited fallback projection accepts malformed values after the explicit missing-input and privileged branches.',
      evidence_refs: [`repository:${sourcePath}`, `visible_test:${request.visible_validation.reproduction.command_id}`],
    }],
    nodes: [
      {
        node_id: `inspect_${candidateId.replace(/^candidate_/, '').slice(0, 44)}`,
        kind: 'inspect',
        operation: 'Extract the bounded fallback projection, delimiter, failure branch, and one valid non-privileged prefix example from the repository snapshot.',
        target_paths: [sourcePath],
        depends_on: [],
        expected_effects: ['Target-specific parameters are inferred without oracle or ground-truth fields.'],
        reversible: true,
      },
      {
        node_id: `edit_${candidateId.replace(/^candidate_/, '').slice(0, 47)}`,
        kind: 'edit',
        operation: 'Instantiate the selected boundary-validation strategy at the narrow source boundary.',
        target_paths: [sourcePath],
        depends_on: [`inspect_${candidateId.replace(/^candidate_/, '').slice(0, 44)}`],
        expected_effects: ['Malformed structures are rejected while valid payload extraction and privileged behavior are preserved.'],
        reversible: true,
      },
      {
        node_id: `verify_${candidateId.replace(/^candidate_/, '').slice(0, 45)}`,
        kind: 'verify',
        operation: 'Run visible targeted and regression checks; final certification remains external to the provider process.',
        target_paths: verifyPaths,
        depends_on: [`edit_${candidateId.replace(/^candidate_/, '').slice(0, 47)}`],
        expected_effects: ['Visible behavior is preserved before independent oracle verification.'],
        reversible: true,
      },
    ],
    predicted_outcome: {
      state_delta: [`${sourcePath} validates the delimited boundary before returning a payload.`],
      success_probability: source === 'skill' ? 0.8 : 0.35,
      information_gain: informationGain,
      risk: source === 'skill' ? 0.18 : 0.45,
      uncertainty: source === 'skill' ? 0.2 : 0.65,
      cost_units: source === 'skill' ? 1 : 0.5,
      latency_ms: null,
    },
    verification: {
      visible_test_ids: visibleTestIds(request),
      requires_independent_verification: true,
      postconditions: request.issue.acceptance_claims.slice(),
    },
    rollback: {
      available: true,
      procedure: 'Discard the detached candidate worktree and retain the immutable base commit.',
    },
    risk_level: 'low',
    provenance: {
      provider_id: provider.provider_id,
      provider_run_id: request.provider_run_id,
      source,
      input_hash: requestHash,
      model_call_id: null,
    },
  };
}

function candidateRecord({ request, provider, requestHash, candidateId, strategyClass, mechanism, hypothesis, patchText, projection, source, informationGain }) {
  return {
    candidate_id: candidateId,
    patch_text: patchText,
    patch_sha256: sha256Text(patchText),
    plan_graph: planGraph({
      request,
      provider,
      requestHash,
      candidateId,
      strategyClass,
      mechanism,
      hypothesis,
      sourcePath: projection.source_path,
      source,
      informationGain,
    }),
    initial_confidence: source === 'skill' ? 0.8 : 0.35,
    proposal_metrics: {
      tokens: 0,
      latency_ms: 0,
      cost: 0,
      human_interventions: 0,
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  const providerPath = option(args, '--provider');
  const requestPath = option(args, '--request');
  if (!providerPath || !requestPath) throw new Error('SKILL_PROVIDER_INPUT_REQUIRED');
  const provider = readJson(providerPath);
  const request = readJson(requestPath);
  if (provider.kind !== 'bounded_skill_program') throw new Error('SKILL_PROVIDER_KIND_INVALID');
  if (request.provider_id !== provider.provider_id) throw new Error('SKILL_PROVIDER_ID_MISMATCH');
  if (!provider.supported_cases.includes(request.benchmark_case_id)) throw new Error('SKILL_PROVIDER_CASE_UNSUPPORTED');
  if (request.ground_truth_access !== 'denied') throw new Error('SKILL_PROVIDER_GROUND_TRUTH_MUST_BE_DENIED');
  if (request.withheld_fields.join(',') !== 'oracle_tests,ground_truth,expected_after_exit_status') {
    throw new Error('SKILL_PROVIDER_WITHHELD_FIELDS_INVALID');
  }
  const requestHash = sha256Json(request);
  const projection = sourceProjection(request.repository_snapshot);
  const prefix = inferPrefix(request, projection);
  const skill = selectSkill(request);
  const skillMode = request.configuration.candidate_skills === true || request.configuration.skills === true;
  if (skillMode && !skill) throw new Error('SKILL_PROVIDER_REQUIRED_SKILL_NOT_AVAILABLE');
  const caseSuffix = request.benchmark_case_id.replace(/^software_repair_/, '').slice(0, 34);
  let candidates;
  let createdBy;
  let contextUsage;
  if (!skill) {
    createdBy = 'planner';
    const exploration = [
      {
        suffix: 'delimiter_guard',
        strategyClass: 'delimiter_presence_guard',
        mechanism: 'single_delimiter_presence_check',
        hypothesis: 'Reject values that omit the observed delimiter.',
        constraints: null,
        informationGain: 0.05,
      },
      {
        suffix: 'arity_prefix',
        strategyClass: 'arity_and_prefix_parser',
        mechanism: 'exact_arity_plus_prefix_check',
        hypothesis: 'Require exactly two components and the observed non-privileged prefix.',
        constraints: ['exact_arity', 'prefix_match'],
        informationGain: 0.25,
      },
      {
        suffix: 'arity_payload',
        strategyClass: 'arity_and_payload_parser',
        mechanism: 'exact_arity_plus_nonempty_payload',
        hypothesis: 'Require exactly two components and a non-empty payload without constraining the prefix.',
        constraints: ['exact_arity', 'payload_nonempty'],
        informationGain: 0.3,
      },
      {
        suffix: 'structural_parser',
        strategyClass: 'structural_delimited_parser',
        mechanism: 'arity_prefix_and_nonempty_payload',
        hypothesis: 'Require exact arity, the observed prefix, and a non-empty payload.',
        constraints: ['exact_arity', 'prefix_match', 'payload_nonempty'],
        informationGain: 0.55,
      },
      {
        suffix: 'complete_grammar',
        strategyClass: 'complete_delimited_boundary_grammar',
        mechanism: 'full_constraint_conjunction',
        hypothesis: 'Require exact arity, the observed prefix, a non-empty payload, and the bounded payload character set.',
        constraints: REQUIRED_CONSTRAINTS,
        informationGain: 0.9,
      },
    ];
    candidates = exploration.slice(0, request.resource_budget.max_candidates).map((entry) => {
      const patchText = entry.constraints
        ? structuredPatch(projection, prefix, entry.constraints)
        : baselinePatch(projection);
      return candidateRecord({
        request,
        provider,
        requestHash,
        candidateId: `candidate_explore_${entry.suffix}_${caseSuffix}`,
        strategyClass: entry.strategyClass,
        mechanism: entry.mechanism,
        hypothesis: entry.hypothesis,
        patchText,
        projection,
        source: createdBy,
        informationGain: entry.informationGain,
      });
    });
    contextUsage = {
      used_skill_ids: [],
      used_episode_ids: [],
      causal_mechanism: candidates.length === 1
        ? 'repository_only_single_attempt_baseline'
        : 'competitive_hypothesis_space_exploration',
      hypothesis_family: SKILL_FAMILY,
      hypothesis_count_executed: candidates.length,
    };
  } else {
    createdBy = 'skill';
    const constraints = skill.induction.selected_constraints.slice();
    if (!REQUIRED_CONSTRAINTS.every((constraint) => constraints.includes(constraint))) {
      throw new Error(`SKILL_PROVIDER_INCOMPLETE_SKILL: ${constraints.join(',')}`);
    }
    const structured = structuredPatch(projection, prefix, constraints);
    const regex = regexPatch(projection, prefix, constraints);
    candidates = [
      candidateRecord({
        request,
        provider,
        requestHash,
        candidateId: `candidate_learned_structured_parser_${caseSuffix}`,
        strategyClass: 'learned_structured_delimited_parser',
        mechanism: 'induced_constraint_conjunction',
        hypothesis: 'The induced cross-case constraints can be instantiated with this repository\'s delimiter and prefix using explicit component checks.',
        patchText: structured,
        projection,
        source: createdBy,
        informationGain: 0.85,
      }),
      candidateRecord({
        request,
        provider,
        requestHash,
        candidateId: `candidate_learned_anchored_grammar_${caseSuffix}`,
        strategyClass: 'learned_anchored_boundary_grammar',
        mechanism: 'induced_constraints_compiled_to_regex',
        hypothesis: 'The same induced constraints can be compiled into an anchored case-insensitive grammar with a captured payload.',
        patchText: regex,
        projection,
        source: createdBy,
        informationGain: 0.8,
      }),
    ].slice(0, request.resource_budget.max_candidates);
    contextUsage = {
      used_skill_ids: [skill.skill_id],
      used_episode_ids: Array.isArray(skill.source_episodes) ? skill.source_episodes.slice().sort() : [],
      causal_mechanism: 'parameterized_rule_reuse',
      selected_constraints: constraints,
      inferred_parameters: {
        delimiter: projection.delimiter,
        prefix,
        source_path: projection.source_path,
      },
    };
  }
  process.stdout.write(`${JSON.stringify({
    schema_version: 1,
    provider_run_id: request.provider_run_id,
    provider_id: provider.provider_id,
    benchmark_case_id: request.benchmark_case_id,
    configuration_id: request.configuration.configuration_id,
    request_hash: requestHash,
    case_ground_truth_disclosed: provider.case_ground_truth_disclosed,
    created_by: createdBy,
    context_usage: contextUsage,
    candidates,
    provider_metrics: {
      candidate_count: candidates.length,
      tokens: 0,
      cost: 0,
      model_calls: 0,
      human_interventions: 0,
    },
  })}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
