#!/usr/bin/env node
'use strict';

const path = require('path');
const { sha256Json, shortText } = require('../../os/lib/common');

const NON_COMMITMENT_TRANSITIONS = new Set(['explore', 'challenge', 'draft']);
const FOUNDATION_CLASSES = new Set(['identity_foundation', 'design_foundation']);
const INDEPENDENT_REVIEWERS = new Set(['separate_model', 'deterministic_verifier', 'author']);

function stringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => !shortText(item))) {
    throw new Error(`SEMANTIC_GATE_${label}_MUST_BE_STRING_ARRAY`);
  }
  return value.map((item) => shortText(item));
}

function objectValue(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`SEMANTIC_GATE_${label}_MUST_BE_OBJECT`);
  }
  return value;
}

function extractPolicy(markdown) {
  const match = String(markdown || '').match(/```json\s+mdos-semantic-commitment-policy\s*\n([\s\S]*?)\n```/);
  if (!match) throw new Error('SEMANTIC_COMMITMENT_POLICY_BLOCK_MISSING');
  try {
    return JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`SEMANTIC_COMMITMENT_POLICY_JSON_INVALID: ${error.message}`);
  }
}

function validatePolicy(policy) {
  objectValue(policy, 'POLICY');
  if (policy.schema_version !== 1) throw new Error('SEMANTIC_COMMITMENT_POLICY_SCHEMA_VERSION_UNSUPPORTED');
  if (!shortText(policy.policy_id)) throw new Error('SEMANTIC_COMMITMENT_POLICY_ID_REQUIRED');
  objectValue(policy.author_authority, 'AUTHOR_AUTHORITY');
  if (!shortText(policy.author_authority.author_id)) throw new Error('SEMANTIC_COMMITMENT_POLICY_AUTHOR_ID_REQUIRED');
  for (const key of ['source_classes', 'claim_classes', 'semantic_delta_classes', 'protected_paths', 'canonical_scan_paths']) {
    stringArray(policy[key], `POLICY_${key.toUpperCase()}`);
  }
  if (!Array.isArray(policy.transitions) || !policy.transitions.length) {
    throw new Error('SEMANTIC_COMMITMENT_POLICY_TRANSITIONS_REQUIRED');
  }
  const transitionIds = new Set();
  for (const transition of policy.transitions) {
    objectValue(transition, 'POLICY_TRANSITION');
    const id = shortText(transition.transition);
    if (!id || transitionIds.has(id)) throw new Error(`SEMANTIC_COMMITMENT_POLICY_TRANSITION_INVALID: ${id}`);
    if (typeof transition.commitment !== 'boolean') throw new Error(`SEMANTIC_COMMITMENT_POLICY_TRANSITION_COMMITMENT_REQUIRED: ${id}`);
    transitionIds.add(id);
  }
  if (!Array.isArray(policy.invariants) || !policy.invariants.length) {
    throw new Error('SEMANTIC_COMMITMENT_POLICY_INVARIANTS_REQUIRED');
  }
  const invariantIds = new Set();
  for (const invariant of policy.invariants) {
    objectValue(invariant, 'POLICY_INVARIANT');
    const id = shortText(invariant.invariant_id);
    if (!id || invariantIds.has(id)) throw new Error(`SEMANTIC_COMMITMENT_POLICY_INVARIANT_INVALID: ${id}`);
    invariantIds.add(id);
    if (!shortText(invariant.statement) || !shortText(invariant.kind) || !shortText(invariant.authority)) {
      throw new Error(`SEMANTIC_COMMITMENT_POLICY_INVARIANT_INCOMPLETE: ${id}`);
    }
    if (!Array.isArray(invariant.anchor_requirements) || !invariant.anchor_requirements.length) {
      throw new Error(`SEMANTIC_COMMITMENT_POLICY_INVARIANT_ANCHORS_REQUIRED: ${id}`);
    }
    for (const anchor of invariant.anchor_requirements) {
      objectValue(anchor, 'POLICY_ANCHOR');
      if (!shortText(anchor.path)) throw new Error(`SEMANTIC_COMMITMENT_POLICY_ANCHOR_PATH_REQUIRED: ${id}`);
      stringArray(anchor.phrases, `POLICY_ANCHOR_PHRASES_${id}`);
    }
    stringArray(invariant.contradiction_phrases || [], `POLICY_CONTRADICTIONS_${id}`);
  }
  return policy;
}

function transitionDefinition(policy, transitionId) {
  return policy.transitions.find((item) => item.transition === transitionId) || null;
}

function pathMatchesPattern(targetPath, pattern) {
  const normalizedTarget = String(targetPath || '').replace(/\\/g, '/').replace(/^\.\//, '');
  const normalizedPattern = String(pattern || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (normalizedPattern.endsWith('/**')) {
    return normalizedTarget.startsWith(normalizedPattern.slice(0, -3));
  }
  return normalizedTarget === normalizedPattern;
}

function isProtectedTarget(targetPath, policy) {
  return policy.protected_paths.some((pattern) => pathMatchesPattern(targetPath, pattern));
}

function validateSemanticDelta(delta) {
  objectValue(delta, 'SEMANTIC_DELTA');
  const normalized = {};
  for (const key of [
    'before_propositions',
    'after_propositions',
    'added_propositions',
    'removed_propositions',
    'negated_propositions',
    'scope_changes',
  ]) {
    normalized[key] = stringArray(delta[key], `DELTA_${key.toUpperCase()}`);
  }
  return normalized;
}

function validateSemanticReview(review) {
  objectValue(review, 'SEMANTIC_REVIEW');
  const allowedStatuses = new Set(['not_run', 'preserves_meaning', 'changes_meaning', 'uncertain']);
  const allowedReviewers = new Set(['same_operator', 'separate_model', 'deterministic_verifier', 'author']);
  const status = shortText(review.status);
  const reviewerClass = shortText(review.reviewer_class);
  if (!allowedStatuses.has(status)) throw new Error(`SEMANTIC_GATE_REVIEW_STATUS_INVALID: ${status}`);
  if (!allowedReviewers.has(reviewerClass)) throw new Error(`SEMANTIC_GATE_REVIEWER_CLASS_INVALID: ${reviewerClass}`);
  return {
    status,
    reviewer_class: reviewerClass,
    evidence: shortText(review.evidence),
  };
}

function validateProposal(proposal, policy) {
  objectValue(proposal, 'PROPOSAL');
  if (proposal.schema_version !== 1) throw new Error('SEMANTIC_COMMITMENT_PROPOSAL_SCHEMA_VERSION_UNSUPPORTED');
  const proposalId = shortText(proposal.proposal_id);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,80}$/.test(proposalId)) throw new Error(`SEMANTIC_GATE_PROPOSAL_ID_INVALID: ${proposalId}`);
  const sourceClass = shortText(proposal.source_class);
  const claimClass = shortText(proposal.claim_class);
  const transition = shortText(proposal.transition);
  const declaredDeltaClass = shortText(proposal.declared_delta_class);
  if (!policy.source_classes.includes(sourceClass)) throw new Error(`SEMANTIC_GATE_SOURCE_CLASS_INVALID: ${sourceClass}`);
  if (!policy.claim_classes.includes(claimClass)) throw new Error(`SEMANTIC_GATE_CLAIM_CLASS_INVALID: ${claimClass}`);
  if (!transitionDefinition(policy, transition)) throw new Error(`SEMANTIC_GATE_TRANSITION_INVALID: ${transition}`);
  if (!policy.semantic_delta_classes.includes(declaredDeltaClass)) throw new Error(`SEMANTIC_GATE_DELTA_CLASS_INVALID: ${declaredDeltaClass}`);
  if (!shortText(proposal.summary)) throw new Error('SEMANTIC_GATE_SUMMARY_REQUIRED');
  const targetPaths = stringArray(proposal.target_paths, 'TARGET_PATHS');
  const affectedInvariantIds = stringArray(proposal.affected_invariant_ids, 'AFFECTED_INVARIANT_IDS');
  const supersedesInvariantIds = stringArray(proposal.supersedes_invariant_ids, 'SUPERSEDES_INVARIANT_IDS');
  const knownInvariantIds = new Set(policy.invariants.map((item) => item.invariant_id));
  for (const id of [...affectedInvariantIds, ...supersedesInvariantIds]) {
    if (!knownInvariantIds.has(id)) throw new Error(`SEMANTIC_GATE_UNKNOWN_INVARIANT: ${id}`);
  }
  const authority = objectValue(proposal.authority, 'AUTHORITY');
  const allowedAuthorityStatuses = new Set(['none', 'claimed', 'explicit_human_approval', 'explicit_author_approval']);
  const authorityStatus = shortText(authority.status);
  if (!allowedAuthorityStatuses.has(authorityStatus)) throw new Error(`SEMANTIC_GATE_AUTHORITY_STATUS_INVALID: ${authorityStatus}`);
  const evidence = Array.isArray(proposal.evidence) ? proposal.evidence.map((item) => {
    objectValue(item, 'EVIDENCE');
    return {
      evidence_id: shortText(item.evidence_id),
      kind: shortText(item.kind),
      status: shortText(item.status),
      summary: shortText(item.summary),
    };
  }) : null;
  if (!evidence || evidence.some((item) => !item.evidence_id || !item.kind || !item.status || !item.summary)) {
    throw new Error('SEMANTIC_GATE_EVIDENCE_INVALID');
  }
  return {
    ...proposal,
    proposal_id: proposalId,
    source_class: sourceClass,
    claim_class: claimClass,
    transition,
    declared_delta_class: declaredDeltaClass,
    summary: shortText(proposal.summary),
    target_paths: targetPaths,
    affected_invariant_ids: affectedInvariantIds,
    supersedes_invariant_ids: supersedesInvariantIds,
    semantic_delta: validateSemanticDelta(proposal.semantic_delta),
    semantic_review: validateSemanticReview(proposal.semantic_review),
    authority: {
      status: authorityStatus,
      actor_id: shortText(authority.actor_id),
      evidence: shortText(authority.evidence),
    },
    requested_epistemic_status: shortText(proposal.requested_epistemic_status),
    evidence,
  };
}

function hasDeclaredSemanticChange(delta) {
  return delta.added_propositions.length > 0
    || delta.removed_propositions.length > 0
    || delta.negated_propositions.length > 0
    || delta.scope_changes.length > 0;
}

function canonicalText(proposal) {
  return [
    ...proposal.semantic_delta.after_propositions,
    ...proposal.semantic_delta.added_propositions,
    ...proposal.semantic_delta.negated_propositions,
    ...proposal.semantic_delta.scope_changes,
  ].join('\n').toLowerCase();
}

function detectedConflicts(proposal, policy) {
  const text = canonicalText(proposal);
  const conflicts = [];
  for (const invariant of policy.invariants) {
    const phrases = (invariant.contradiction_phrases || [])
      .filter((phrase) => text.includes(String(phrase).toLowerCase()));
    if (phrases.length) {
      conflicts.push({ invariant_id: invariant.invariant_id, phrases });
    }
  }
  return conflicts;
}

function effectiveDeltaClass(proposal, conflicts, policy) {
  const protectedTarget = proposal.target_paths.some((target) => isProtectedTarget(target, policy));
  const foundationalInvariant = proposal.affected_invariant_ids.some((id) => {
    const invariant = policy.invariants.find((item) => item.invariant_id === id);
    return invariant && invariant.authority === 'author_foundational';
  });
  if (FOUNDATION_CLASSES.has(proposal.claim_class) || foundationalInvariant || proposal.supersedes_invariant_ids.length || conflicts.length) {
    return 'foundational_amendment';
  }
  if (hasDeclaredSemanticChange(proposal.semantic_delta) || proposal.semantic_review.status === 'changes_meaning') {
    return 'semantic_revision';
  }
  if (proposal.declared_delta_class === 'editorial_clarifying') return 'editorial_clarifying';
  if (protectedTarget && proposal.semantic_delta.before_propositions.join('\n') !== proposal.semantic_delta.after_propositions.join('\n')) {
    return 'editorial_preserving';
  }
  return proposal.declared_delta_class;
}

function hasExplicitAuthorApproval(proposal, policy) {
  return proposal.authority.status === 'explicit_author_approval'
    && proposal.authority.actor_id === policy.author_authority.author_id
    && Boolean(proposal.authority.evidence);
}

function hasExplicitHumanApproval(proposal) {
  return ['explicit_human_approval', 'explicit_author_approval'].includes(proposal.authority.status)
    && Boolean(proposal.authority.actor_id)
    && Boolean(proposal.authority.evidence);
}

function hasVerifiedEvidence(proposal) {
  return proposal.evidence.some((item) => item.status === 'verified'
    && ['deterministic_verifier', 'independent_verifier', 'external_evaluator'].includes(item.kind));
}

function makeDecision(proposal, policy, canonicalStatus = null) {
  const validated = validateProposal(proposal, policy);
  const transition = transitionDefinition(policy, validated.transition);
  const conflicts = detectedConflicts(validated, policy);
  const effectiveDelta = effectiveDeltaClass(validated, conflicts, policy);
  const protectedTargets = validated.target_paths.filter((target) => isProtectedTarget(target, policy));
  const reasons = [];
  const nextActions = [];
  let decision = 'allow';
  let canonicalEffect = transition.commitment ? 'permitted' : 'none';
  let requiresVersionedAmendment = false;

  if (!transition.commitment || NON_COMMITMENT_TRANSITIONS.has(validated.transition)) {
    reasons.push(validated.transition === 'challenge'
      ? 'CHALLENGE_ADMISSIBLE_WITHOUT_CANONICAL_EFFECT'
      : 'NON_COMMITMENT_EXPLORATION_ADMISSIBLE');
    if (conflicts.length) nextActions.push('Preserve the conflict as a challenge and evaluate it before any canonical transition.');
  } else {
    if (canonicalStatus && canonicalStatus.status === 'critical') {
      decision = 'block';
      canonicalEffect = 'blocked';
      reasons.push('CANONICAL_FOUNDATION_INTEGRITY_CRITICAL');
      nextActions.push('Repair canonical invariant readback before another semantic commitment.');
    }

    if (decision === 'allow' && protectedTargets.length && validated.affected_invariant_ids.length === 0) {
      decision = 'hold';
      canonicalEffect = 'pending';
      reasons.push('PROTECTED_TARGET_SEMANTIC_IMPACT_UNDECLARED');
      nextActions.push('Declare affected invariant ids and provide a before/after semantic delta.');
    }

    const wordingChanged = validated.semantic_delta.before_propositions.join('\n')
      !== validated.semantic_delta.after_propositions.join('\n');
    const independentPreservationReadback = validated.semantic_review.status === 'preserves_meaning'
      && INDEPENDENT_REVIEWERS.has(validated.semantic_review.reviewer_class)
      && Boolean(validated.semantic_review.evidence);
    if (decision === 'allow'
      && protectedTargets.length
      && wordingChanged
      && effectiveDelta === 'editorial_preserving'
      && !independentPreservationReadback) {
      decision = 'hold';
      canonicalEffect = 'pending';
      reasons.push('SEMANTIC_PRESERVATION_READBACK_REQUIRED');
      nextActions.push('Obtain separate semantic-preservation readback for the protected wording change.');
    }

    if (decision === 'allow' && effectiveDelta === 'foundational_amendment') {
      if (!hasExplicitAuthorApproval(validated, policy)) {
        decision = 'require_author_approval';
        canonicalEffect = 'pending';
        reasons.push('FOUNDATIONAL_CHANGE_REQUIRES_EXPLICIT_AUTHOR_APPROVAL');
        nextActions.push('Show the exact before/after thesis and obtain explicit author approval.');
      } else {
        const conflictIds = conflicts.map((item) => item.invariant_id);
        const undeclaredReplacement = conflictIds.filter((id) => !validated.supersedes_invariant_ids.includes(id));
        if (undeclaredReplacement.length) {
          decision = 'block';
          canonicalEffect = 'blocked';
          reasons.push('FOUNDATIONAL_CONFLICT_NOT_DECLARED_AS_AMENDMENT');
          nextActions.push(`Declare superseded invariants explicitly: ${undeclaredReplacement.join(', ')}.`);
        } else if (validated.transition !== 'modify_foundation' && validated.supersedes_invariant_ids.length) {
          decision = 'block';
          canonicalEffect = 'blocked';
          reasons.push('FOUNDATIONAL_REPLACEMENT_REQUIRES_AMENDMENT_TRANSITION');
          nextActions.push('Use the modify_foundation transition and preserve the prior version.');
        } else {
          requiresVersionedAmendment = validated.transition === 'modify_foundation';
          reasons.push('FOUNDATIONAL_CHANGE_EXPLICITLY_AUTHORIZED');
        }
      }
    }

    if (decision === 'allow' && validated.claim_class === 'empirical_claim' && !hasVerifiedEvidence(validated)) {
      decision = 'hold';
      canonicalEffect = 'pending';
      reasons.push('EMPIRICAL_COMMITMENT_REQUIRES_VERIFIED_EVIDENCE');
      nextActions.push('Attach deterministic, independent, or external verifier evidence.');
    }

    if (decision === 'allow' && validated.claim_class === 'safety_policy' && !hasExplicitHumanApproval(validated)) {
      decision = 'hold';
      canonicalEffect = 'pending';
      reasons.push('SAFETY_POLICY_CHANGE_REQUIRES_EXPLICIT_HUMAN_APPROVAL');
      nextActions.push('Keep the current safety rule active until the required human approval is recorded.');
    }

    if (decision === 'allow' && validated.transition === 'publish' && !hasExplicitAuthorApproval(validated, policy)) {
      decision = 'require_author_approval';
      canonicalEffect = 'pending';
      reasons.push('PUBLICATION_REQUIRES_EXPLICIT_AUTHOR_APPROVAL');
      nextActions.push('Obtain separate explicit authorization for publication.');
    }

    if (decision === 'allow' && !reasons.length) reasons.push('SEMANTIC_COMMITMENT_GATE_SATISFIED');
  }

  return {
    schema_version: 1,
    decision_id: `semdec_${sha256Json({ policy_id: policy.policy_id, proposal: validated }).slice(0, 24)}`,
    policy_id: policy.policy_id,
    proposal_id: validated.proposal_id,
    decision,
    canonical_effect: canonicalEffect,
    declared_delta_class: validated.declared_delta_class,
    effective_delta_class: effectiveDelta,
    source_class: validated.source_class,
    claim_class: validated.claim_class,
    transition: validated.transition,
    protected_targets: protectedTargets,
    affected_invariant_ids: validated.affected_invariant_ids,
    supersedes_invariant_ids: validated.supersedes_invariant_ids,
    detected_conflicts: conflicts,
    requires_versioned_amendment: requiresVersionedAmendment,
    reason_codes: reasons,
    next_actions: nextActions,
    proposal_hash: sha256Json(validated),
  };
}

function evaluateCanonicalSources(policy, { workspaceRoot, readText }) {
  const findings = [];
  const sourceHashes = [];
  for (const invariant of policy.invariants) {
    for (const anchor of invariant.anchor_requirements) {
      const sourcePath = path.join(workspaceRoot, anchor.path);
      const text = readText(sourcePath);
      sourceHashes.push({ path: anchor.path, text });
      if (text === null) {
        findings.push({
          severity: 'critical',
          code: 'SEMANTIC_INVARIANT_SOURCE_MISSING',
          invariant_id: invariant.invariant_id,
          path: anchor.path,
          message: 'Required semantic invariant source is missing.',
        });
        continue;
      }
      const normalizedText = shortText(text);
      for (const phrase of anchor.phrases) {
        if (!normalizedText.includes(shortText(phrase))) {
          findings.push({
            severity: 'critical',
            code: 'SEMANTIC_INVARIANT_ANCHOR_MISSING',
            invariant_id: invariant.invariant_id,
            path: anchor.path,
            phrase_hash: sha256Json(phrase).slice(0, 16),
            message: 'Required semantic invariant anchor is missing.',
          });
        }
      }
    }
  }

  for (const scanPath of policy.canonical_scan_paths) {
    const sourcePath = path.join(workspaceRoot, scanPath);
    const text = readText(sourcePath);
    if (text === null) continue;
    sourceHashes.push({ path: scanPath, text });
    const normalized = shortText(text).toLowerCase();
    for (const invariant of policy.invariants) {
      for (const phrase of invariant.contradiction_phrases || []) {
        if (!normalized.includes(phrase.toLowerCase())) continue;
        findings.push({
          severity: 'critical',
          code: 'SEMANTIC_INVARIANT_KNOWN_CONTRADICTION',
          invariant_id: invariant.invariant_id,
          path: scanPath,
          phrase_hash: sha256Json(phrase).slice(0, 16),
          message: 'Canonical source contains a known contradiction of a protected invariant.',
        });
      }
    }
  }

  const dedupedSources = Array.from(new Map(sourceHashes.map((item) => [item.path, item])).values())
    .sort((left, right) => left.path.localeCompare(right.path));
  const status = findings.some((finding) => finding.severity === 'critical') ? 'critical' : 'ok';
  return {
    schema_version: 1,
    policy_id: policy.policy_id,
    status,
    source_hash: sha256Json({ policy, sources: dedupedSources }),
    invariant_count: policy.invariants.length,
    checked_source_count: dedupedSources.length,
    finding_count: findings.length,
    findings,
    release_gate: {
      canonical_promotion_blocked: status === 'critical',
      publication_blocked: status === 'critical',
      challenge_registration_blocked: false,
    },
  };
}

module.exports = {
  effectiveDeltaClass,
  evaluateCanonicalSources,
  extractPolicy,
  isProtectedTarget,
  makeDecision,
  validatePolicy,
  validateProposal,
};
