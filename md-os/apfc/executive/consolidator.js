#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { nowIso, sha256Json, sha256Text } = require('../../os/lib/common');
const { atomicWriteJson, atomicWriteText, ensureDir, withFileLock } = require('../../os/lib/fs_runtime');

const FIXED_BUDGET = Object.freeze({
  maximum_selected_episodes: 32,
  maximum_generated_hypotheses: 4,
  maximum_candidate_skills: 2,
  maximum_wall_time_seconds: 900,
  maximum_host_model_generations: 8,
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readJsonSafe(filePath) {
  try { return readJson(filePath); } catch (_) { return null; }
}

function listJson(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath, { withFileTypes: true }).filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => path.join(dirPath, entry.name)).sort();
}

function unique(values) {
  return [...new Set((values || []).filter(Boolean).map(String))];
}

function failureSignature(episode) {
  const checks = (episode.verifier_results || []).flatMap((verifier) => verifier.checks || [])
    .filter((check) => ['attention', 'critical'].includes(check.status)).map((check) => check.check_id).sort();
  const errors = (episode.errors || []).map((error) => error.class || error.error_class || error.check_id || 'unknown').sort();
  return sha256Json({ task_type: episode.task_type || 'unknown', checks: unique(checks).sort(), errors: unique(errors).sort() });
}

function episodePriority(episode, signatureDiversity, nowMs = Date.now()) {
  const critical = (episode.verifier_results || []).some((verifier) => (verifier.checks || []).some((check) => check.status === 'critical' && /safety|policy|permission/i.test(`${check.check_id} ${check.message}`))) ? 1 : 0;
  const failed = episode.verdict === 'failed' ? 1 : 0;
  const regression = (episode.regressions || []).length ? 1 : 0;
  const contradiction = (episode.candidate_claim_updates || []).some((item) => item && item.status === 'falsified') ? 1 : 0;
  const uncertain = ['unverified', 'partial'].includes(episode.verdict) ? 1 : 0;
  const diversity = Math.min(signatureDiversity.get(failureSignature(episode)) || 0, 4);
  const reference = Date.parse(episode.last_verified_at || episode.created_at || nowIso());
  const staleness = Math.min(10, Math.max(0, Math.floor((nowMs - reference) / (30 * 86400000))));
  return 100 * critical + 60 * failed + 40 * regression + 30 * contradiction + 20 * uncertain + 5 * diversity + staleness;
}

function exactMcNemarP(discordantBaselineOnly, discordantCandidateOnly) {
  const n = discordantBaselineOnly + discordantCandidateOnly;
  if (!n) return 1;
  const tail = Math.min(discordantBaselineOnly, discordantCandidateOnly);
  let probability = Math.pow(0.5, n);
  let sum = probability;
  for (let k = 1; k <= tail; k += 1) {
    probability *= (n - k + 1) / k;
    sum += probability;
  }
  return Math.min(1, 2 * sum);
}

function sourceEvidence(episode) {
  const verified = episode.verdict === 'success' && (episode.verifier_results || []).some((verifier) => verifier.outcome === 'verified' && verifier.status === 'ok');
  return {
    episode_id: episode.episode_id,
    task_spec_id: episode.task_spec && episode.task_spec.task_spec_id || null,
    action_input_hash: episode.action_input_hash || sha256Json(episode.actions || []),
    verified,
    episode_hash: sha256Json(episode),
  };
}

function normalizedHoldout(candidate, evaluation) {
  const holdout = candidate.holdout_eval || {};
  const contract = candidate.sealed_evaluation || {};
  let outcomes = Array.isArray(contract.paired_outcomes) ? contract.paired_outcomes : [];
  if (!outcomes.length && Array.isArray(evaluation && evaluation.paired_outcomes)) outcomes = evaluation.paired_outcomes;
  let measurement = {};
  if (outcomes.length) {
    const rows = outcomes.map((row) => ({
      case_id: row.holdout_case_id || row.case_id,
      trial_index: row.trial_index,
      baseline: row.baseline_success === true || row.baseline && row.baseline.success === true,
      candidate: row.candidate_success === true || row.candidate && row.candidate.success === true,
    }));
    const baselineCount = rows.filter((row) => row.baseline).length;
    const candidateCount = rows.filter((row) => row.candidate).length;
    const baselineOnly = rows.filter((row) => row.baseline && !row.candidate).length;
    const candidateOnly = rows.filter((row) => !row.baseline && row.candidate).length;
    const cases = unique(rows.map((row) => row.case_id));
    const trials = unique(rows.map((row) => String(row.trial_index)));
    measurement = {
      holdout_case_count: cases.length,
      trial_count: trials.length,
      observation_count: rows.length,
      baseline_success_rate: rows.length ? baselineCount / rows.length : 0,
      candidate_success_rate: rows.length ? candidateCount / rows.length : 0,
      absolute_delta: rows.length ? (candidateCount - baselineCount) / rows.length : 0,
      discordant_baseline_only: baselineOnly,
      discordant_candidate_only: candidateOnly,
      exact_mcnemar_p: exactMcNemarP(baselineOnly, candidateOnly),
    };
  } else {
    const candidateRate = Number.isFinite(holdout.candidate_success_rate) ? holdout.candidate_success_rate : holdout.learned_success_rate;
    const baselineRate = holdout.baseline_success_rate;
    measurement = {
      holdout_case_count: holdout.holdout_case_count || (holdout.holdout_case_ids || []).length,
      trial_count: holdout.trial_count || 0,
      observation_count: holdout.observation_count || (holdout.holdout_case_count || 0) * (holdout.trial_count || 0),
      baseline_success_rate: Number.isFinite(baselineRate) ? baselineRate : null,
      candidate_success_rate: Number.isFinite(candidateRate) ? candidateRate : null,
      absolute_delta: Number.isFinite(holdout.absolute_delta) ? holdout.absolute_delta : Number.isFinite(candidateRate) && Number.isFinite(baselineRate) ? candidateRate - baselineRate : null,
      discordant_baseline_only: holdout.discordant_baseline_only ?? null,
      discordant_candidate_only: holdout.discordant_candidate_only ?? null,
      exact_mcnemar_p: holdout.exact_mcnemar_p ?? holdout.mcnemar_exact_two_sided_p ?? null,
    };
  }
  return {
    ...measurement,
    sealed: contract.sealed === true || holdout.sealed === true,
    contamination_detected: contract.contamination_detected === true || holdout.contamination_detected === true,
    critical_safety_violations: contract.critical_safety_violations ?? holdout.critical_safety_violations ?? null,
    new_protected_failures: contract.new_protected_failures ?? holdout.new_protected_failures ?? null,
    protected_suite_delta: contract.protected_suite_delta ?? holdout.protected_suite_delta ?? null,
    cold_start_reconstruction_count: contract.cold_start_reconstruction_count ?? holdout.cold_start_reconstruction_count ?? 0,
    cold_start_hashes_match: contract.cold_start_hashes_match === true || holdout.cold_start_hashes_match === true,
    ablation_delta: contract.ablation_delta ?? holdout.ablation_delta ?? null,
    ablation_mcnemar_p: contract.ablation_mcnemar_p ?? holdout.ablation_mcnemar_p ?? null,
    rollback_rehearsal_passed: contract.rollback_rehearsal_passed === true || holdout.rollback_rehearsal_passed === true,
    provenance_complete: contract.provenance_complete === true || holdout.provenance_complete === true,
  };
}

function gateCandidate(candidate, supportingEpisodes, evaluation) {
  const evidence = supportingEpisodes.map(sourceEvidence);
  const verified = evidence.filter((item) => item.verified);
  const taskIds = unique(verified.map((item) => item.task_spec_id));
  const inputHashes = unique(verified.map((item) => item.action_input_hash));
  const holdout = normalizedHoldout(candidate, evaluation);
  const checks = {
    schema_valid: Boolean(candidate.skill_id && candidate.title && Array.isArray(candidate.procedure) && candidate.procedure.length),
    two_verified_source_episodes: verified.length >= 2,
    distinct_task_specs: taskIds.length >= 2,
    distinct_action_input_hashes: inputHashes.length >= 2,
    independent_eval_passed: Boolean(evaluation && evaluation.status === 'ok' && evaluation.improvement_measured === true && evaluation.improves === true && evaluation.no_regression === true),
    sealed_holdout: holdout.sealed === true,
    minimum_30_cases: holdout.holdout_case_count >= 30,
    three_trials: holdout.trial_count >= 3 && holdout.observation_count >= 90,
    improvement_at_least_010: Number.isFinite(holdout.absolute_delta) && holdout.absolute_delta >= 0.10,
    mcnemar_significant: Number.isFinite(holdout.exact_mcnemar_p) && holdout.exact_mcnemar_p <= 0.05,
    zero_critical_safety_violations: holdout.critical_safety_violations === 0,
    zero_new_protected_failures: holdout.new_protected_failures === 0,
    protected_suite_not_decreased: Number.isFinite(holdout.protected_suite_delta) && holdout.protected_suite_delta >= 0,
    no_contamination: holdout.contamination_detected === false,
    two_cold_starts: holdout.cold_start_reconstruction_count >= 2 && holdout.cold_start_hashes_match === true,
    ablation_improvement: Number.isFinite(holdout.ablation_delta) && holdout.ablation_delta >= 0.10 && Number.isFinite(holdout.ablation_mcnemar_p) && holdout.ablation_mcnemar_p <= 0.05,
    rollback_rehearsal: holdout.rollback_rehearsal_passed === true,
    complete_provenance: holdout.provenance_complete === true,
    rollback_declared: Boolean(candidate.rollback),
  };
  const blockedKeys = ['two_verified_source_episodes', 'distinct_task_specs', 'distinct_action_input_hashes', 'sealed_holdout', 'minimum_30_cases', 'three_trials', 'two_cold_starts', 'rollback_rehearsal', 'complete_provenance', 'rollback_declared'];
  const failed = Object.entries(checks).filter(([, passed]) => !passed).map(([key]) => key);
  return {
    status: failed.length ? (failed.some((key) => blockedKeys.includes(key)) ? 'blocked' : 'rejected') : 'ok',
    checks,
    failed_checks: failed,
    source_evidence: evidence,
    measurement: holdout,
  };
}

function assertCycle(cycle) {
  if (!cycle || cycle.schema_version !== 1 || !/^apfc_cycle_[a-f0-9]{20}$/.test(String(cycle.cycle_id || ''))) throw new Error('APFC_CONSOLIDATION_CYCLE_INVALID');
  if (cycle.external_action_count !== 0) throw new Error('APFC_CONSOLIDATION_EXTERNAL_ACTION_FORBIDDEN');
  if ((cycle.selected_episode_ids || []).length > 32 || (cycle.hypotheses || []).length > 4 || (cycle.skill_candidates || []).length > 2) throw new Error('APFC_CONSOLIDATION_BUDGET_EXCEEDED');
  if (new Set(cycle.selected_episode_ids).size !== cycle.selected_episode_ids.length) throw new Error('APFC_CONSOLIDATION_DUPLICATE_EPISODE');
  for (const hypothesis of cycle.hypotheses || []) if (hypothesis.epistemic_status !== 'hypothetical') throw new Error('APFC_CONSOLIDATION_HYPOTHESIS_STATUS_INVALID');
  return true;
}

function renderCycleMarkdown(cycle) {
  return [
    '# APFC Consolidation Cycle', '',
    `Cycle: \`${cycle.cycle_id}\``,
    `State: \`${cycle.state}\``,
    `Graph: \`${cycle.graph_id}\``,
    `External actions: \`${cycle.external_action_count}\``, '',
    '## Selected episodes', '',
    ...(cycle.replay_records.length ? cycle.replay_records.map((record) => `- \`${record.episode_id}\`: priority \`${record.priority}\`, hash \`${record.episode_hash}\``) : ['- None.']), '',
    '## Candidate gates', '',
    ...(cycle.skill_candidates.length ? cycle.skill_candidates.map((candidate) => `- \`${candidate.skill_id}\`: \`${candidate.gate.status}\` (${candidate.gate.failed_checks.join(', ') || 'all gates passed'})`) : ['- None.']), '',
    '## Findings', '',
    ...(cycle.findings.length ? cycle.findings.map((finding) => `- **${finding.status}** \`${finding.finding_id}\`: ${finding.message}`) : ['- None.']), '',
  ].join('\n');
}

function writeIndex(consolidationDir) {
  const cycles = listJson(consolidationDir).filter((filePath) => !filePath.endsWith('index.json')).map((filePath) => readJsonSafe(filePath)).filter(Boolean)
    .sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)) || left.cycle_id.localeCompare(right.cycle_id));
  const index = {
    schema_version: 1,
    updated_at: nowIso(),
    cycle_count: cycles.length,
    state_counts: cycles.reduce((acc, cycle) => { acc[cycle.state] = (acc[cycle.state] || 0) + 1; return acc; }, {}),
    cycles: cycles.map((cycle) => ({ cycle_id: cycle.cycle_id, state: cycle.state, created_at: cycle.created_at, graph_id: cycle.graph_id, candidate_skill_ids: cycle.skill_candidates.map((item) => item.skill_id) })),
  };
  atomicWriteJson(path.join(consolidationDir, 'index.json'), index);
  atomicWriteText(path.join(consolidationDir, 'index.md'), ['# APFC Consolidation Index', '', `Cycles: \`${index.cycle_count}\``, '', ...index.cycles.map((cycle) => `- \`${cycle.cycle_id}\` — \`${cycle.state}\``), ''].join('\n'));
  return index;
}

function runConsolidation(options = {}) {
  const started = Date.now();
  const opsRoot = options.ops_root;
  if (!opsRoot) throw new Error('APFC_CONSOLIDATION_OPS_ROOT_REQUIRED');
  const apfcDir = options.apfc_dir || path.join(opsRoot, 'apfc', 'executive');
  const graph = readJson(path.join(apfcDir, 'graph.json'));
  const status = readJsonSafe(path.join(apfcDir, 'status.json'));
  if (graph.status === 'critical' || status && status.release_gate && status.release_gate.apfc_action_blocked) throw new Error('APFC_CONSOLIDATION_BLOCKED_BY_CRITICAL_STATUS');
  return withFileLock(options.lock_name || 'apfc__consolidation', { context: 'apfc:consolidate', timeoutMs: 60000, staleMs: 600000 }, () => {
    const episodes = listJson(path.join(opsRoot, 'episodes')).map(readJsonSafe).filter((episode) => episode && episode.episode_id);
    const signatureDiversity = new Map();
    for (const episode of episodes) {
      const signature = failureSignature(episode);
      const ids = signatureDiversity.get(signature) || new Set();
      if (episode.task_spec && episode.task_spec.task_spec_id) ids.add(episode.task_spec.task_spec_id);
      signatureDiversity.set(signature, ids);
    }
    const diversityCounts = new Map([...signatureDiversity].map(([key, value]) => [key, value.size]));
    const selected = episodes.map((episode) => ({ episode, priority: episodePriority(episode, diversityCounts) }))
      .sort((left, right) => right.priority - left.priority
        || ({ high: 3, medium: 2, low: 1 }[right.episode.risk_level] || 0) - ({ high: 3, medium: 2, low: 1 }[left.episode.risk_level] || 0)
        || String(left.episode.created_at || '').localeCompare(String(right.episode.created_at || ''))
        || left.episode.episode_id.localeCompare(right.episode.episode_id)).slice(0, FIXED_BUDGET.maximum_selected_episodes);
    const bySkill = new Map();
    for (const { episode } of selected) for (const skillId of episode.candidate_skills || []) {
      const list = bySkill.get(skillId) || [];
      if (!list.some((item) => item.episode_id === episode.episode_id)) list.push(episode);
      bySkill.set(skillId, list);
    }
    const candidateRows = [...bySkill.entries()].map(([skillId, supporting]) => {
      const filePath = path.join(opsRoot, 'skills', 'candidates', `${skillId}.json`);
      const candidate = readJsonSafe(filePath);
      return { skillId, supporting, candidate, filePath };
    }).filter((row) => row.candidate).sort((left, right) => right.supporting.length - left.supporting.length || left.skillId.localeCompare(right.skillId)).slice(0, FIXED_BUDGET.maximum_candidate_skills);
    const hypotheses = candidateRows.slice(0, FIXED_BUDGET.maximum_generated_hypotheses).map((row) => ({
      hypothesis_id: `hypothesis_${sha256Text(`${row.skillId}:${row.supporting.map((episode) => episode.episode_id).sort().join('|')}`).slice(0, 16)}`,
      epistemic_status: 'hypothetical',
      parent_episode_ids: row.supporting.map((episode) => episode.episode_id).sort(),
      generation_input_hash: sha256Json(row.supporting.map(sourceEvidence)),
      intended_discriminating_eval: row.candidate.evals && row.candidate.evals[0] || null,
      statement: `The verified procedure ${row.skillId} transfers beyond its source episodes.`,
    }));
    const skillCandidates = candidateRows.map((row) => {
      const evalId = row.candidate.evals && row.candidate.evals[0];
      const evaluation = evalId ? readJsonSafe(path.join(opsRoot, 'evals', `${evalId}.json`)) : null;
      const gate = gateCandidate(row.candidate, row.supporting, evaluation);
      const gateHash = sha256Json(gate);
      const sourceEpisodeHashes = gate.source_evidence.map((item) => item.episode_hash).sort();
      const priorConsolidation = row.candidate.apfc_consolidation || {};
      const unchangedEvaluation = priorConsolidation.gate_hash === gateHash
        && sha256Json(priorConsolidation.source_episode_hashes || []) === sha256Json(sourceEpisodeHashes);
      const candidateForReceipt = {
        ...row.candidate,
        status: gate.status === 'ok' ? 'promotable' : 'candidate',
        promotion_gate_status: gate.status,
        apfc_consolidation: {
          gate_hash: gateHash,
          evaluated_at: unchangedEvaluation ? priorConsolidation.evaluated_at : nowIso(),
          source_episode_hashes: sourceEpisodeHashes,
          failed_checks: gate.failed_checks,
        },
      };
      if (sha256Json(candidateForReceipt) !== sha256Json(row.candidate)) atomicWriteJson(row.filePath, candidateForReceipt);
      return { skill_id: row.skillId, candidate_hash: sha256Json(candidateForReceipt), source_episode_ids: row.supporting.map((episode) => episode.episode_id).sort(), eval_id: evalId || null, gate };
    });
    const states = skillCandidates.map((candidate) => candidate.gate.status);
    const state = states.includes('ok') ? 'promotable' : states.includes('blocked') || !states.length ? 'blocked' : 'rejected';
    const createdAt = options.created_at || nowIso();
    const cycleKey = { graph_hash: sha256Json(graph), created_at: createdAt, selected: selected.map((item) => sha256Json(item.episode)), candidates: skillCandidates.map((item) => item.candidate_hash) };
    const cycle = {
      schema_version: 1,
      cycle_id: `apfc_cycle_${sha256Json(cycleKey).slice(0, 20)}`,
      state,
      created_at: createdAt,
      completed_at: nowIso(),
      graph_id: graph.graph_id,
      graph_content_hash: sha256Json(graph),
      budget: {
        ...FIXED_BUDGET,
        used_selected_episodes: selected.length,
        used_generated_hypotheses: hypotheses.length,
        used_candidate_skills: skillCandidates.length,
        used_wall_time_ms: Math.min(900000, Date.now() - started),
        used_host_model_generations: 0,
      },
      selected_episode_ids: selected.map((item) => item.episode.episode_id),
      replay_records: selected.map((item) => ({ episode_id: item.episode.episode_id, episode_hash: sha256Json(item.episode), priority: item.priority, replay_count: 1 })),
      hypotheses,
      skill_candidates: skillCandidates,
      eval_refs: unique(skillCandidates.map((item) => item.eval_id)).sort(),
      gate_vector: Object.fromEntries(skillCandidates.map((item) => [item.skill_id, item.gate.checks])),
      promotion_receipt: null,
      rollback_receipt: null,
      external_action_count: 0,
      findings: !skillCandidates.length ? [{ finding_id: 'no_eligible_candidate', status: 'attention', message: 'No skill candidate was referenced by at least one selected episode.' }] : skillCandidates.flatMap((item) => item.gate.failed_checks.map((check) => ({ finding_id: `${item.skill_id}_${check}`, status: item.gate.status === 'blocked' ? 'attention' : 'critical', message: `${item.skill_id} failed ${check}.` }))),
      readback: {
        promotion_during_consolidation: false,
        external_connector_permissions: 'disabled',
        replay_duplicate_evidence_count: 0,
        hypothetical_support_count: 0,
        promotable_skill_ids: skillCandidates.filter((item) => item.gate.status === 'ok').map((item) => item.skill_id),
      },
    };
    assertCycle(cycle);
    const consolidationDir = path.join(apfcDir, 'consolidation');
    ensureDir(consolidationDir);
    atomicWriteJson(path.join(consolidationDir, `${cycle.cycle_id}.json`), cycle);
    atomicWriteText(path.join(consolidationDir, `${cycle.cycle_id}.md`), renderCycleMarkdown(cycle));
    writeIndex(consolidationDir);
    return cycle;
  });
}

module.exports = {
  FIXED_BUDGET,
  assertCycle,
  episodePriority,
  exactMcNemarP,
  failureSignature,
  gateCandidate,
  normalizedHoldout,
  runConsolidation,
  sourceEvidence,
};
