#!/usr/bin/env node
'use strict';

const { sha256Json, shortText } = require('../../os/lib/common');

const HYPOTHESIS_FAMILY = 'delimited_boundary_validation_v1';
const CONSTRAINTS = Object.freeze([
  'exact_arity',
  'prefix_match',
  'payload_nonempty',
  'payload_charset',
]);

function powerset(values) {
  const result = [];
  const limit = 1 << values.length;
  for (let mask = 0; mask < limit; mask += 1) {
    result.push(values.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return result;
}

function allHypotheses() {
  return powerset(CONSTRAINTS).map((constraints) => ({
    hypothesis_id: `hyp_${constraints.length ? constraints.join('_') : 'accept_all'}`,
    constraints,
  }));
}

function normalizeExample(example, parameters) {
  const input = String(example && example.input || '');
  const delimiter = String(parameters && parameters.delimiter || '');
  const prefix = String(parameters && parameters.prefix || '');
  if (!delimiter) throw new Error('SKILL_INDUCTION_DELIMITER_REQUIRED');
  if (!prefix) throw new Error('SKILL_INDUCTION_PREFIX_REQUIRED');
  if (!example || typeof example.valid !== 'boolean') throw new Error('SKILL_INDUCTION_LABEL_REQUIRED');
  const parts = input.split(delimiter);
  const payload = parts.at(-1) || '';
  return {
    input,
    valid: example.valid,
    features: {
      exact_arity: parts.length === 2,
      prefix_match: parts.length >= 1 && parts[0].toLowerCase() === prefix.toLowerCase(),
      payload_nonempty: payload.length > 0,
      payload_charset: Array.from(payload).every((character) => /[A-Za-z0-9_-]/.test(character)),
    },
  };
}

function predictsValid(hypothesis, normalizedExample) {
  return hypothesis.constraints.every((constraint) => normalizedExample.features[constraint] === true);
}

function isConsistent(hypothesis, normalizedExamples) {
  return normalizedExamples.every((example) => predictsValid(hypothesis, example) === example.valid);
}

function predictionEntropy(hypotheses, normalizedExamples) {
  if (!hypotheses.length) return 0;
  const counts = new Map();
  for (const hypothesis of hypotheses) {
    const signature = normalizedExamples.map((example) => predictsValid(hypothesis, example) ? '1' : '0').join('');
    counts.set(signature, (counts.get(signature) || 0) + 1);
  }
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / hypotheses.length;
    entropy -= probability * Math.log2(probability);
  }
  return Number(entropy.toFixed(6));
}

function informationGain(beforeCount, afterCount) {
  if (!beforeCount || !afterCount || afterCount > beforeCount) return 0;
  return Number(Math.log2(beforeCount / afterCount).toFixed(6));
}

function normalizeCase(caseObservation) {
  if (!caseObservation || caseObservation.split !== 'development') {
    throw new Error('SKILL_INDUCTION_DEVELOPMENT_EPISODE_REQUIRED');
  }
  if (caseObservation.hypothesis_family !== HYPOTHESIS_FAMILY) {
    throw new Error(`SKILL_INDUCTION_FAMILY_UNSUPPORTED: ${caseObservation.hypothesis_family}`);
  }
  const parameters = caseObservation.parameters || {};
  const examples = Array.isArray(caseObservation.examples) ? caseObservation.examples : [];
  if (!examples.length) throw new Error('SKILL_INDUCTION_EXAMPLES_REQUIRED');
  return {
    benchmark_case_id: shortText(caseObservation.benchmark_case_id),
    episode_id: shortText(caseObservation.episode_id),
    split: caseObservation.split,
    parameters: {
      delimiter: String(parameters.delimiter || ''),
      prefix: String(parameters.prefix || ''),
    },
    examples: examples.map((example) => normalizeExample(example, parameters)),
  };
}

function selectActiveCurriculum(caseObservations) {
  const remaining = caseObservations.map(normalizeCase);
  let hypotheses = allHypotheses();
  const steps = [];
  while (remaining.length) {
    const ranked = remaining.map((item) => ({
      item,
      entropy: predictionEntropy(hypotheses, item.examples),
    })).sort((left, right) => right.entropy - left.entropy
      || left.item.benchmark_case_id.localeCompare(right.item.benchmark_case_id));
    const selected = ranked[0];
    const before = hypotheses.length;
    hypotheses = hypotheses.filter((hypothesis) => isConsistent(hypothesis, selected.item.examples));
    if (!hypotheses.length) {
      throw new Error(`SKILL_INDUCTION_INCONSISTENT_EVIDENCE: ${selected.item.benchmark_case_id}`);
    }
    steps.push({
      rank: steps.length + 1,
      benchmark_case_id: selected.item.benchmark_case_id,
      episode_id: selected.item.episode_id,
      selection_entropy_bits: selected.entropy,
      hypothesis_count_before: before,
      hypothesis_count_after: hypotheses.length,
      information_gain_bits: informationGain(before, hypotheses.length),
      example_count: selected.item.examples.length,
    });
    remaining.splice(remaining.indexOf(selected.item), 1);
  }
  return {
    initial_hypothesis_count: allHypotheses().length,
    final_hypotheses: hypotheses,
    steps,
    total_information_gain_bits: Number(steps.reduce((sum, step) => sum + step.information_gain_bits, 0).toFixed(6)),
  };
}

function plasticityEvents(caseObservations, curriculum) {
  const byEpisode = new Map(caseObservations.map(normalizeCase).map((item) => [item.episode_id, item]));
  let hypotheses = allHypotheses();
  const events = [];
  for (const step of curriculum.steps) {
    const observation = byEpisode.get(step.episode_id);
    if (!observation) throw new Error(`SKILL_INDUCTION_CURRICULUM_EPISODE_MISSING: ${step.episode_id}`);
    for (let index = 0; index < observation.examples.length; index += 1) {
      const example = observation.examples[index];
      const before = hypotheses.length;
      const next = hypotheses.filter((hypothesis) => predictsValid(hypothesis, example) === example.valid);
      if (!next.length) throw new Error(`SKILL_INDUCTION_EVENT_INCONSISTENT: ${step.episode_id}:${index}`);
      const gain = informationGain(before, next.length);
      hypotheses = next;
      if (gain <= 0) continue;
      events.push({
        event_id: `plasticity_${String(events.length + 1).padStart(2, '0')}`,
        episode_id: step.episode_id,
        benchmark_case_id: step.benchmark_case_id,
        example_index: index,
        label: example.valid ? 'valid' : 'invalid',
        feature_vector: { ...example.features },
        hypothesis_count_before: before,
        hypothesis_count_after: next.length,
        surprise_bits: gain,
        update_rule: 'error_or_surprise_triggered_local_update',
      });
    }
  }
  return events;
}

function constraintTraces(caseObservations, selectedConstraints, decay = 0.85) {
  const normalized = caseObservations.map(normalizeCase);
  const traces = Object.fromEntries(CONSTRAINTS.map((constraint) => [constraint, {
    constraint,
    eligibility_trace: 0,
    positive_coactivations: 0,
    corrective_negative_events: 0,
    contradictory_events: 0,
    consolidated: false,
  }]));
  for (const observation of normalized) {
    for (const example of observation.examples) {
      for (const constraint of CONSTRAINTS) {
        const trace = traces[constraint];
        trace.eligibility_trace *= decay;
        if (example.valid && example.features[constraint]) {
          trace.positive_coactivations += 1;
          trace.eligibility_trace += 0.25;
        } else if (!example.valid && !example.features[constraint]) {
          trace.corrective_negative_events += 1;
          trace.eligibility_trace += 1;
        } else if (example.valid && !example.features[constraint]) {
          trace.contradictory_events += 1;
          trace.eligibility_trace -= 1;
        }
      }
    }
  }
  for (const constraint of CONSTRAINTS) {
    const trace = traces[constraint];
    trace.eligibility_trace = Number(trace.eligibility_trace.toFixed(6));
    trace.consolidated = selectedConstraints.includes(constraint)
      && trace.positive_coactivations > 0
      && trace.corrective_negative_events > 0
      && trace.contradictory_events === 0;
  }
  return CONSTRAINTS.map((constraint) => traces[constraint]);
}

function induceDelimitedBoundarySkill({ episodes, createdAt, skillId = 'skill_delimited_boundary_validation_induced_v1' }) {
  if (!Array.isArray(episodes) || episodes.length < 2) {
    throw new Error('SKILL_INDUCTION_MINIMUM_TWO_EPISODES_REQUIRED');
  }
  const observations = episodes.map((episode) => {
    if (!episode || episode.verdict !== 'success') {
      throw new Error(`SKILL_INDUCTION_VERIFIED_EPISODE_REQUIRED: ${episode && episode.episode_id || 'unknown'}`);
    }
    const verifier = Array.isArray(episode.verifier_results) ? episode.verifier_results[0] : null;
    if (!verifier || verifier.outcome !== 'verified') {
      throw new Error(`SKILL_INDUCTION_INDEPENDENT_VERIFIER_REQUIRED: ${episode.episode_id}`);
    }
    const observation = episode.learning_observation || {};
    return {
      ...observation,
      episode_id: episode.episode_id,
    };
  });
  const curriculum = selectActiveCurriculum(observations);
  const ordered = curriculum.final_hypotheses.slice().sort((left, right) => left.constraints.length - right.constraints.length
    || left.hypothesis_id.localeCompare(right.hypothesis_id));
  const selected = ordered[0];
  const uniquelyIdentified = curriculum.final_hypotheses.length === 1;
  const sourceEpisodes = episodes.map((episode) => episode.episode_id).sort();
  const sourceCases = observations.map((item) => item.benchmark_case_id).sort();
  const events = plasticityEvents(observations, curriculum);
  const traces = constraintTraces(observations, selected.constraints);
  const eliminated = curriculum.initial_hypothesis_count - curriculum.final_hypotheses.length;
  const skill = {
    schema_version: 1,
    skill_id: shortText(skillId),
    title: 'Induce and apply delimited boundary validators',
    description: 'A bounded symbolic repair skill induced from independently verified development episodes. It transfers structural constraints while inferring target-specific delimiters, prefixes, variables, return shapes, and source paths from each new repository.',
    status: 'candidate',
    domain: 'software_repair',
    task_types: ['software_repair'],
    inputs: ['repository_snapshot', 'visible_tests', 'defect_class'],
    tools: ['deterministic_hypothesis_elimination', 'parameterized_patch_synthesis', 'independent_oracle'],
    preconditions: [
      'defect_class_is_missing_boundary_validation',
      'repository_contains_a_delimited_fallback_projection',
      'visible_regression_contains_at_least_one_valid_non_privileged_example',
      'candidate_generation_has_no_oracle_or_ground_truth_access',
    ],
    procedure: [
      'extract the fallback projection, delimiter, failure return, and valid prefix from the bounded repository snapshot',
      'instantiate the induced structural constraints for the target delimiter and prefix',
      'synthesize at least two semantically distinct patch plans',
      'run visible tests and an external oracle in isolated git worktrees',
      'promote only after a measured improvement on sealed holdout cases with no regression',
    ],
    success_criteria: [
      'malformed delimited values are rejected',
      'valid case-insensitive prefixes and payloads are preserved',
      'only the declared source boundary changes',
      'holdout success exceeds the no-skill baseline',
      'no holdout example appears in source episodes or induction input',
    ],
    failure_modes: [
      'unsupported_source_projection',
      'ambiguous_prefix_inference',
      'inconsistent_training_evidence',
      'holdout_contamination',
      'visible_or_oracle_regression',
    ],
    rollback: 'Remove or demote the skill artifact and rebuild the skill registry, benchmark index, runtime compiler, and AGI eval readback.',
    evals: [],
    source_episodes: sourceEpisodes,
    source_cases: sourceCases,
    source_splits: ['development'],
    verifier_status: 'ok',
    verified_outcome_count: sourceEpisodes.length,
    holdout_eval: null,
    promotion_gate_status: 'critical',
    created_at: createdAt,
    induction: {
      hypothesis_family: HYPOTHESIS_FAMILY,
      hypothesis_language: CONSTRAINTS.slice(),
      initial_hypothesis_count: curriculum.initial_hypothesis_count,
      final_hypothesis_count: curriculum.final_hypotheses.length,
      uniquely_identified: uniquelyIdentified,
      selected_hypothesis_id: selected.hypothesis_id,
      selected_constraints: selected.constraints.slice(),
      final_hypothesis_ids: curriculum.final_hypotheses.map((item) => item.hypothesis_id).sort(),
      active_curriculum: curriculum.steps,
      total_information_gain_bits: curriculum.total_information_gain_bits,
      learning_efficiency: {
        verified_episode_count: sourceEpisodes.length,
        informative_event_count: events.length,
        eliminated_hypothesis_count: eliminated,
        information_gain_bits_per_episode: Number((curriculum.total_information_gain_bits / sourceEpisodes.length).toFixed(6)),
        eliminated_hypotheses_per_episode: Number((eliminated / sourceEpisodes.length).toFixed(6)),
      },
      induction_source_hash: sha256Json(observations.map((item) => ({
        benchmark_case_id: item.benchmark_case_id,
        split: item.split,
        parameters: item.parameters,
        examples: item.examples,
      }))),
    },
    neuromorphic_learning: {
      architecture: 'complementary_learning_systems_v1',
      fast_episodic_encoding: {
        mode: 'append_only_verified_episode_memory',
        episode_count: sourceEpisodes.length,
      },
      event_driven_plasticity: {
        update_policy: 'update_only_when_evidence_reduces_the_consistent_hypothesis_set',
        event_count: events.length,
        events,
      },
      sparse_engram: {
        representation: 'winner_take_all_hypothesis_code',
        active_units: [selected.hypothesis_id],
        active_unit_count: 1,
        available_unit_count: curriculum.initial_hypothesis_count,
        density: Number((1 / curriculum.initial_hypothesis_count).toFixed(6)),
        decoded_constraints: selected.constraints.slice(),
      },
      lateral_inhibition: {
        mechanism: 'inconsistent_hypothesis_elimination',
        inhibited_hypothesis_count: eliminated,
        winner: selected.hypothesis_id,
      },
      replay_consolidation: {
        scheduling: 'descending_prediction_entropy_then_deterministic_tie_break',
        replay_order: curriculum.steps.map((step) => step.episode_id),
        total_information_gain_bits: curriculum.total_information_gain_bits,
      },
      metaplasticity: {
        eligibility_decay: 0.85,
        constraint_traces: traces,
      },
      homeostatic_gate: {
        minimum_verified_episodes: 2,
        unique_hypothesis_required: true,
        holdout_required_for_promotion: true,
        state: uniquelyIdentified ? 'candidate_consolidated' : 'blocked_ambiguous',
      },
    },
    applicability: {
      defect_classes: ['missing_boundary_validation'],
      hypothesis_family: HYPOTHESIS_FAMILY,
      target_parameters_are_inferred: true,
    },
  };
  return {
    skill,
    curriculum,
    uniquely_identified: uniquelyIdentified,
  };
}

function renderSkillMarkdown(skill) {
  const induction = skill.induction || {};
  return [
    `# ${skill.title}`,
    '',
    `Skill: \`${skill.skill_id}\``,
    '',
    `Status: \`${skill.status}\``,
    '',
    skill.description,
    '',
    '## Induction',
    '',
    `- Family: \`${induction.hypothesis_family}\``,
    `- Hypotheses: \`${induction.initial_hypothesis_count} -> ${induction.final_hypothesis_count}\``,
    `- Selected constraints: \`${(induction.selected_constraints || []).join(', ')}\``,
    `- Information gain: \`${induction.total_information_gain_bits} bits\``,
    `- Informative events: \`${skill.neuromorphic_learning && skill.neuromorphic_learning.event_driven_plasticity.event_count || 0}\``,
    `- Bits per verified episode: \`${induction.learning_efficiency && induction.learning_efficiency.information_gain_bits_per_episode || 0}\``,
    '',
    '## Active curriculum',
    '',
    '| Rank | Case | Episode | Hypotheses | Information gain |',
    '|---:|---|---|---:|---:|',
    ...(induction.active_curriculum || []).map((step) => `| ${step.rank} | ${step.benchmark_case_id} | ${step.episode_id} | ${step.hypothesis_count_before} -> ${step.hypothesis_count_after} | ${step.information_gain_bits} |`),
    '',
    '## Promotion evidence',
    '',
    `- Source episodes: \`${(skill.source_episodes || []).length}\``,
    `- Verifier: \`${skill.verifier_status}\``,
    `- Holdout: \`${skill.holdout_eval ? skill.holdout_eval.status : 'not_measured'}\``,
    `- Promotion gate: \`${skill.promotion_gate_status}\``,
    '',
  ].join('\n');
}

module.exports = {
  CONSTRAINTS,
  HYPOTHESIS_FAMILY,
  allHypotheses,
  induceDelimitedBoundarySkill,
  isConsistent,
  normalizeExample,
  predictionEntropy,
  predictsValid,
  renderSkillMarkdown,
  selectActiveCurriculum,
};
