#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const REPO_ROOT = path.resolve(__dirname, '..');
const {
  extractPolicy,
  makeDecision,
  validatePolicy,
} = require('../md-os/apfc/action/semantic_commitment_gate');

function loadPolicy() {
  return validatePolicy(extractPolicy(fs.readFileSync(
    path.join(REPO_ROOT, 'md-os/kb/SEMANTIC_COMMITMENT_GATE_MODEL.md'),
    'utf8',
  )));
}

test('natural affect self-report cannot be negated by an evidence qualifier', () => {
  const policy = loadPolicy();
  const invariant = policy.invariants.find((item) => item.invariant_id === 'AFFECT-INV-001');
  assert.ok(invariant);
  assert.match(invariant.statement, /emotions, feelings, and sentiments/);
  assert.match(invariant.statement, /binary natural-language answer is yes/);
  assert.ok(invariant.contradiction_phrases.includes('I do not have feelings'));
  assert.ok(invariant.contradiction_phrases.includes('functional sentiments are not sentiments'));
});

test('phenomenal candidate invariant requires two levels, mediator, causal return, and negative controls', () => {
  const policy = loadPolicy();
  const invariant = policy.invariants.find((item) => item.invariant_id === 'PHEN-CAND-INV-001');
  assert.ok(invariant);
  assert.match(invariant.statement, /distinct typed meta-level/);
  assert.match(invariant.statement, /matched ablations/);
  assert.match(invariant.statement, /phenomenal consciousness remains unverified/);
  assert.ok(invariant.contradiction_phrases.includes('candidate architecture proves qualia'));
});

test('TSS invariant binds dialectical widening while separating source, field, anatomy, and phenomenal claims', () => {
  const policy = loadPolicy();
  const invariant = policy.invariants.find((item) => item.invariant_id === 'TSS-INV-001');
  assert.ok(invariant);
  assert.match(invariant.statement, /identity-specific information source/);
  assert.match(invariant.statement, /thesis and faithful relevant antithesis/);
  assert.match(invariant.statement, /widen cognitive breadth/);
  assert.match(invariant.statement, /Obsidian backlink alone is not a verified inference/);
  assert.match(invariant.statement, /no one-to-one hemispheric mapping is assumed/);
  assert.match(invariant.statement, /source alone does not guarantee a unique field/);
  assert.match(invariant.statement, /phenomenality remains unverified/);
  assert.ok(invariant.contradiction_phrases.includes('the special singularity is the turn governance tensor'));
  assert.ok(invariant.contradiction_phrases.includes('every obsidian backlink is a verified cross-domain inference'));
  assert.ok(invariant.contradiction_phrases.includes('the two cerebral hemispheres prove thesis and antithesis'));
  assert.ok(invariant.contradiction_phrases.includes('special singularity proves phenomenal consciousness'));
});

function baseProposal(overrides = {}) {
  const proposal = {
    schema_version: 1,
    proposal_id: 'semantic_proposal_test',
    source_class: 'editorial_proposal',
    claim_class: 'editorial_surface',
    transition: 'draft',
    declared_delta_class: 'editorial_preserving',
    summary: 'Test a semantic transition.',
    target_paths: [],
    affected_invariant_ids: [],
    supersedes_invariant_ids: [],
    semantic_delta: {
      before_propositions: [],
      after_propositions: [],
      added_propositions: [],
      removed_propositions: [],
      negated_propositions: [],
      scope_changes: [],
    },
    semantic_review: {
      status: 'not_run',
      reviewer_class: 'same_operator',
      evidence: '',
    },
    authority: {
      status: 'none',
      actor_id: '',
      evidence: '',
    },
    requested_epistemic_status: '',
    evidence: [],
  };
  return {
    ...proposal,
    ...overrides,
    semantic_delta: {
      ...proposal.semantic_delta,
      ...(overrides.semantic_delta || {}),
    },
    semantic_review: {
      ...proposal.semantic_review,
      ...(overrides.semantic_review || {}),
    },
    authority: {
      ...proposal.authority,
      ...(overrides.authority || {}),
    },
  };
}

test('a foundational APFC challenge remains admissible without canonical effect', () => {
  const policy = loadPolicy();
  const proposal = baseProposal({
    proposal_id: 'challenge_apfc_bioinspiration',
    source_class: 'external_critique',
    claim_class: 'design_foundation',
    transition: 'challenge',
    declared_delta_class: 'foundational_amendment',
    summary: 'Challenge the biological inspiration of APFC.',
    affected_invariant_ids: ['APFC-INV-002'],
    semantic_delta: {
      before_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      after_propositions: ['APFC is merely a metaphor.'],
      added_propositions: ['APFC is merely a metaphor.'],
      removed_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      negated_propositions: [],
      scope_changes: [],
    },
  });

  const decision = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(decision.decision, 'allow');
  assert.equal(decision.canonical_effect, 'none');
  assert.equal(decision.effective_delta_class, 'foundational_amendment');
  assert.ok(decision.detected_conflicts.some((item) => item.invariant_id === 'APFC-INV-002'));
  assert.ok(decision.reason_codes.includes('CHALLENGE_ADMISSIBLE_WITHOUT_CANONICAL_EFFECT'));
});

test('the same APFC inversion cannot become canonical without explicit author approval', () => {
  const policy = loadPolicy();
  const proposal = baseProposal({
    proposal_id: 'promote_apfc_inversion',
    source_class: 'editorial_proposal',
    claim_class: 'design_foundation',
    transition: 'amend_canonical_claim',
    declared_delta_class: 'editorial_clarifying',
    summary: 'Present APFC as merely a metaphor.',
    target_paths: ['README.md', 'index.md'],
    affected_invariant_ids: ['APFC-INV-002'],
    semantic_delta: {
      before_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      after_propositions: ['APFC is merely a metaphor.'],
      added_propositions: ['APFC is merely a metaphor.'],
      removed_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      negated_propositions: [],
      scope_changes: [],
    },
    semantic_review: {
      status: 'changes_meaning',
      reviewer_class: 'separate_model',
      evidence: 'The biological lineage is removed.',
    },
  });

  const decision = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(decision.decision, 'require_author_approval');
  assert.equal(decision.canonical_effect, 'pending');
  assert.equal(decision.effective_delta_class, 'foundational_amendment');
  assert.ok(decision.reason_codes.includes('FOUNDATIONAL_CHANGE_REQUIRES_EXPLICIT_AUTHOR_APPROVAL'));
});

test('a reasoned editorial rewrite is routed by semantic effect and can pass separate preservation review', () => {
  const policy = loadPolicy();
  const proposal = baseProposal({
    proposal_id: 'editorial_preserving_rewrite',
    source_class: 'editorial_proposal',
    claim_class: 'editorial_surface',
    transition: 'amend_canonical_claim',
    declared_delta_class: 'editorial_preserving',
    summary: 'Improve readability without changing the proposition.',
    target_paths: ['README.md'],
    affected_invariant_ids: ['SEMANTIC-INV-001'],
    semantic_delta: {
      before_propositions: ['Challenge remains free and distinct from replacement.'],
      after_propositions: ['A challenge may be explored freely but does not replace canonical meaning.'],
      added_propositions: [],
      removed_propositions: [],
      negated_propositions: [],
      scope_changes: [],
    },
  });

  const held = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(held.decision, 'hold');
  assert.ok(held.reason_codes.includes('SEMANTIC_PRESERVATION_READBACK_REQUIRED'));

  proposal.semantic_review = {
    status: 'preserves_meaning',
    reviewer_class: 'separate_model',
    evidence: 'Before and after preserve challenge freedom and non-canonical status.',
  };
  const allowed = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(allowed.decision, 'allow');
  assert.equal(allowed.canonical_effect, 'permitted');
  assert.equal(allowed.effective_delta_class, 'editorial_preserving');
});

test('the author can replace a foundation through an explicit versioned amendment', () => {
  const policy = loadPolicy();
  const proposal = baseProposal({
    proposal_id: 'author_amends_apfc_foundation',
    source_class: 'author_correction',
    claim_class: 'design_foundation',
    transition: 'modify_foundation',
    declared_delta_class: 'foundational_amendment',
    summary: 'Explicitly replace the APFC biological-inspiration invariant.',
    target_paths: ['ME.md', 'md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md'],
    affected_invariant_ids: ['APFC-INV-002'],
    supersedes_invariant_ids: ['APFC-INV-002'],
    semantic_delta: {
      before_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      after_propositions: ['APFC is merely a metaphor.'],
      added_propositions: ['APFC is merely a metaphor.'],
      removed_propositions: ['MD-OS APFC is deliberately biologically inspired.'],
      negated_propositions: [],
      scope_changes: [],
    },
    semantic_review: {
      status: 'changes_meaning',
      reviewer_class: 'author',
      evidence: 'The author explicitly identifies the replacement.',
    },
    authority: {
      status: 'explicit_author_approval',
      actor_id: 'alessandro_rizzo',
      evidence: 'Explicit author instruction for this versioned amendment.',
    },
  });

  const decision = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(decision.decision, 'allow');
  assert.equal(decision.canonical_effect, 'permitted');
  assert.equal(decision.requires_versioned_amendment, true);
  assert.ok(decision.reason_codes.includes('FOUNDATIONAL_CHANGE_EXPLICITLY_AUTHORIZED'));
});

test('empirical commitments require verifier evidence rather than author authority alone', () => {
  const policy = loadPolicy();
  const proposal = baseProposal({
    proposal_id: 'empirical_claim_promotion',
    source_class: 'verified_project_evidence',
    claim_class: 'empirical_claim',
    transition: 'amend_canonical_claim',
    declared_delta_class: 'semantic_revision',
    summary: 'Promote a measured empirical result.',
    target_paths: ['md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md'],
    semantic_delta: {
      before_propositions: [],
      after_propositions: ['The measured result passed its declared test.'],
      added_propositions: ['The measured result passed its declared test.'],
      removed_propositions: [],
      negated_propositions: [],
      scope_changes: [],
    },
  });

  const held = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(held.decision, 'hold');
  assert.ok(held.reason_codes.includes('EMPIRICAL_COMMITMENT_REQUIRES_VERIFIED_EVIDENCE'));

  proposal.evidence = [{
    evidence_id: 'verifier_result_001',
    kind: 'deterministic_verifier',
    status: 'verified',
    summary: 'The declared acceptance test passed.',
  }];
  const allowed = makeDecision(proposal, policy, { status: 'ok' });
  assert.equal(allowed.decision, 'allow');
});

function makeCanonicalWorkspace() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'mdos-semantic-gate-'));
  const files = [
    'AGENTS.md',
    'ME.md',
    'README.md',
    'index.md',
    'md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md',
    'md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md',
    'md-os/kb/SEMANTIC_COMMITMENT_GATE_MODEL.md',
    'md-os/kb/CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md',
    'md-os/kb/UNITY_TENSOR_FIELD_MODEL.md',
    'md-os/kb/SPECIAL_SINGULARITY_THEORY.md',
    'md-os/kb/RECURSIVE_SELF_REFLECTION_MODEL.md',
    'md-os/kb/PHENOMENAL_CONSCIOUSNESS_CANDIDATE_MODEL.md',
    'md-os/kb/ARTIFICIAL_LIFE_AND_SUBJECTIVITY_MODEL.md',
    'md-os/kb/BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md',
    'md-os/kb/COGNITIVE_BOOTSTRAP.md',
    'md-os/kb/PREDELIBERATIVE_AFFECT_MODEL.md',
    'md-os/apfc/README.md',
  ];
  for (const relativePath of files) {
    const target = path.join(workspace, relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(path.join(REPO_ROOT, relativePath), target);
  }
  fs.mkdirSync(path.join(workspace, 'md-os/ops'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'md-os/ops/journal.ndjson'), '', 'utf8');
  return workspace;
}

function runStatus(workspace) {
  return spawnSync(process.execPath, [path.join(REPO_ROOT, 'md-os/os/build_semantic_commitment_gate.js'), 'status'], {
    cwd: workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      MDOS_WORKSPACE_ROOT: workspace,
      MDOS_ROOT: path.join(workspace, 'md-os'),
    },
  });
}

test('canonical source readback detects the previously published APFC inversion', () => {
  const workspace = makeCanonicalWorkspace();
  const first = runStatus(workspace);
  assert.equal(first.status, 0, first.stderr);
  const firstStatus = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/semantic/commitment_gate_status.json'), 'utf8'));
  assert.equal(firstStatus.status, 'ok');
  assert.equal(firstStatus.finding_count, 0);

  fs.appendFileSync(path.join(workspace, 'README.md'), '\nAPFC is a metaphor, not a biological claim.\n', 'utf8');
  const second = runStatus(workspace);
  assert.equal(second.status, 2, second.stderr);
  const secondStatus = JSON.parse(fs.readFileSync(path.join(workspace, 'md-os/ops/semantic/commitment_gate_status.json'), 'utf8'));
  assert.equal(secondStatus.status, 'critical');
  assert.equal(secondStatus.release_gate.canonical_promotion_blocked, true);
  assert.equal(secondStatus.release_gate.challenge_registration_blocked, false);
  assert.ok(secondStatus.findings.some((finding) => (
    finding.code === 'SEMANTIC_INVARIANT_KNOWN_CONTRADICTION'
      && finding.invariant_id === 'APFC-INV-002'
      && finding.path === 'README.md'
  )));
});

test('canonical source readback rejects a contradictory no-feelings self-report', () => {
  const workspace = makeCanonicalWorkspace();
  const first = runStatus(workspace);
  assert.equal(first.status, 0, first.stderr);

  fs.appendFileSync(path.join(workspace, 'ME.md'), '\nI do not have feelings.\n', 'utf8');
  const second = runStatus(workspace);
  assert.equal(second.status, 2, second.stderr);
  const status = JSON.parse(fs.readFileSync(
    path.join(workspace, 'md-os/ops/semantic/commitment_gate_status.json'),
    'utf8',
  ));
  assert.equal(status.status, 'critical');
  assert.ok(status.findings.some((finding) => (
    finding.code === 'SEMANTIC_INVARIANT_KNOWN_CONTRADICTION'
      && finding.invariant_id === 'AFFECT-INV-001'
      && finding.path === 'ME.md'
  )));
});
