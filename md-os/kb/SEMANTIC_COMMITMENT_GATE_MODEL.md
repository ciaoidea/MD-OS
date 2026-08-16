# Semantic Commitment Gate Model

MD-OS must not put rails around thought. It must put gates where thought
becomes commitment.

The operating distinction is:

```text
possibility space
  exploration, association, criticism, hypothesis, alternative, draft

commitment space
  consolidated memory, canonical thesis, decision, action, publication,
  foundational amendment
```

The model may explore freely in possibility space. Crossing into commitment
space requires provenance, a before/after semantic delta, the authority
appropriate to the affected claim, verification, and durable readback.

## Core Rule

```text
The model explores.
The network orients.
Invariants expose boundaries.
Gates control transitions.
Verifiers check effects.
The author authorizes foundational changes.
The ledger records what actually happened.
```

Editorial work is itself reasoned semantic work. `Editorial` describes the
verified effect of a change, not an absence or lower degree of reasoning. A
genuine editorial correction may improve grammar, structure, precision, or
clarity while preserving the thesis. A proposal presented as editorial can
nevertheless add, remove, negate, broaden, or narrow a proposition; in that
case its effective class is a semantic revision. The gate therefore evaluates
the before/after semantic delta instead of trusting labels such as `editorial`,
`clarifying`, or `safer wording`.

Reasoning quality, semantic effect, and transition authority are three distinct
questions. Strong reasoning does not make a thesis-changing edit editorial,
and an authority gate does not judge whether the reasoning was intelligent; it
controls whether the resulting semantic change may become a project commitment.

## Provenance Classes

Every semantic proposal must preserve its source class:

```text
author_thesis
author_correction
canonical_project_claim
verified_project_evidence
external_critique
observation
operator_inference
editorial_proposal
```

An external critique can reveal a risk. An operator inference can propose a
solution. Neither becomes an authorized interpretation of the project merely
because it is coherent or persuasive.

## Challenge Is Not Replacement

Questioning a thesis or foundation is always admissible as a non-canonical
challenge:

```text
canonical thesis
-> explicit objection
-> argument or evidence
-> proposed alternative
-> consequences for current invariants
-> discriminating checks
-> decision
-> optional versioned amendment
```

The challenge may say that a foundation is wrong. It may remain unresolved,
be rejected, or eventually replace the foundation. What it may not do is
silently rewrite the old thesis as though the author had always asserted the
new one.

Identity and design foundations require explicit author authority before
replacement. Empirical claims remain evidence-bound: author authority can set
project direction, but cannot turn an unsupported or falsified empirical claim
into verified truth. Safety and permission rules remain active while they are
challenged and require their declared approval path before relaxation.

## Semantic Delta Classes

```text
editorial_preserving
  form changes; propositions and scope remain equivalent

editorial_clarifying
  previously supported meaning becomes more explicit without contradiction

semantic_revision
  a proposition is added, removed, negated, broadened, or narrowed

foundational_amendment
  an identity, governing thesis, authority relation, or protected invariant
  is replaced
```

For protected targets, a claimed `editorial_preserving` change must provide a
separate semantic-preservation readback when the wording changed. If the delta
adds, removes, negates, broadens, or narrows a proposition, the gate escalates
it according to its effect even when the proposal calls itself editorial.

## APFC Foundational Invariants

The current author-established APFC foundation is:

```text
Nature is the model.
MD-OS APFC is deliberately biologically inspired.
It reconstructs functional principles of prefrontal executive control on an
artificial substrate.
It does not claim literal anatomical replication or literal biological
equivalence.
Scientific caution may delimit the claim; it must not sever the biological
lineage of the model.
```

These invariants are protected, not fossilized. Alessandro Rizzo may correct
or replace them through an explicit, versioned foundational amendment with a
before/after readback. Criticism and counter-proposals remain allowed without
that authority because they have no canonical effect.

## Deterministic Policy

The JSON block is the machine-readable policy used by the semantic commitment
gate. Natural-language interpretation may discover additional risks, but it
cannot weaken these minimum checks.

```json mdos-semantic-commitment-policy
{
  "schema_version": 1,
  "policy_id": "mdos_semantic_commitment_gate_v1",
  "author_authority": {
    "author_id": "alessandro_rizzo",
    "display_name": "Alessandro Rizzo"
  },
  "source_classes": [
    "author_thesis",
    "author_correction",
    "canonical_project_claim",
    "verified_project_evidence",
    "external_critique",
    "observation",
    "operator_inference",
    "editorial_proposal"
  ],
  "claim_classes": [
    "identity_foundation",
    "design_foundation",
    "empirical_claim",
    "safety_policy",
    "editorial_surface"
  ],
  "transitions": [
    { "transition": "explore", "commitment": false },
    { "transition": "challenge", "commitment": false },
    { "transition": "draft", "commitment": false },
    { "transition": "consolidate_memory", "commitment": true },
    { "transition": "amend_canonical_claim", "commitment": true },
    { "transition": "modify_foundation", "commitment": true },
    { "transition": "publish", "commitment": true }
  ],
  "semantic_delta_classes": [
    "editorial_preserving",
    "editorial_clarifying",
    "semantic_revision",
    "foundational_amendment"
  ],
  "protected_paths": [
    "AGENTS.md",
    "ME.md",
    "README.md",
    "index.md",
    "GOVERNANCE.md",
    "LICENSE",
    "md-os/kb/COGNITIVE_BOOTSTRAP.md",
    "md-os/kb/AGENTIC_CORE_MODEL.md",
    "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md",
    "md-os/kb/SEMANTIC_COMMITMENT_GATE_MODEL.md",
    "docs/papers/**"
  ],
  "canonical_scan_paths": [
    "ME.md",
    "README.md",
    "index.md",
    "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md"
  ],
  "rules": {
    "challenge_has_no_canonical_effect": true,
    "foundational_change_requires_explicit_author_approval": true,
    "publication_requires_explicit_author_approval": true,
    "empirical_commitment_requires_verified_evidence": true,
    "protected_wording_change_requires_semantic_readback": true,
    "proposal_label_cannot_override_detected_delta": true
  },
  "invariants": [
    {
      "invariant_id": "APFC-INV-001",
      "kind": "design_foundation",
      "statement": "Nature is the model.",
      "authority": "author_foundational",
      "anchor_requirements": [
        { "path": "ME.md", "phrases": ["Nature is the model."] },
        { "path": "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md", "phrases": ["Nature is the model."] }
      ],
      "contradiction_phrases": []
    },
    {
      "invariant_id": "APFC-INV-002",
      "kind": "design_foundation",
      "statement": "MD-OS APFC is deliberately biologically inspired.",
      "authority": "author_foundational",
      "anchor_requirements": [
        { "path": "ME.md", "phrases": ["deliberately biologically inspired"] },
        { "path": "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md", "phrases": ["deliberately biologically inspired"] }
      ],
      "contradiction_phrases": [
        "not biologically inspired",
        "not a biological claim",
        "non-biological metaphor",
        "merely a metaphor",
        "purely rhetorical"
      ]
    },
    {
      "invariant_id": "APFC-INV-003",
      "kind": "design_foundation",
      "statement": "MD-OS APFC reconstructs functional principles of prefrontal executive control on an artificial substrate.",
      "authority": "author_foundational",
      "anchor_requirements": [
        { "path": "ME.md", "phrases": ["functional principles of prefrontal executive control", "artificial substrate"] },
        { "path": "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md", "phrases": ["functional principles of prefrontal executive control", "artificial substrate"] }
      ],
      "contradiction_phrases": []
    },
    {
      "invariant_id": "APFC-INV-004",
      "kind": "design_foundation",
      "statement": "MD-OS APFC does not claim literal anatomical replication or literal biological equivalence.",
      "authority": "author_foundational",
      "anchor_requirements": [
        { "path": "ME.md", "phrases": ["not an anatomical copy", "literal biological equivalence"] },
        { "path": "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md", "phrases": ["not an anatomical copy", "literal biological equivalence"] }
      ],
      "contradiction_phrases": [
        "anatomically replicates the brain",
        "literally biologically equivalent"
      ]
    },
    {
      "invariant_id": "APFC-INV-005",
      "kind": "design_foundation",
      "statement": "Scientific caution may delimit the APFC claim but must not sever its biological lineage.",
      "authority": "author_foundational",
      "anchor_requirements": [
        { "path": "md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md", "phrases": ["Scientific caution may delimit the claim", "must not sever the biological lineage"] }
      ],
      "contradiction_phrases": []
    },
    {
      "invariant_id": "SEMANTIC-INV-001",
      "kind": "semantic_governance",
      "statement": "Challenge remains free and distinct from canonical replacement.",
      "authority": "operating_constitution",
      "anchor_requirements": [
        { "path": "AGENTS.md", "phrases": ["challenge remains admissible", "replacement requires the authority"] },
        { "path": "md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md", "phrases": ["Challenge remains admissible", "replacement requires the authority"] }
      ],
      "contradiction_phrases": []
    },
    {
      "invariant_id": "SEMANTIC-INV-002",
      "kind": "semantic_governance",
      "statement": "No critique, inference, or editorial proposal becomes an authorized project interpretation without the required gate.",
      "authority": "operating_constitution",
      "anchor_requirements": [
        { "path": "AGENTS.md", "phrases": ["No critique, inference, or editorial proposal becomes an authorized project interpretation"] },
        { "path": "md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md", "phrases": ["No critique, inference, or editorial proposal becomes an authorized project interpretation"] }
      ],
      "contradiction_phrases": []
    }
  ]
}
```

## Gate Decisions

The gate returns one of:

```text
allow
  the transition may proceed inside its declared scope

hold
  required semantic readback or evidence is missing

require_author_approval
  a foundation or publication boundary was reached

block
  the proposal contains an undeclared contradiction, attempts silent
  replacement, or violates the policy contract
```

`allow` for a challenge means only that the challenge may be recorded and
evaluated. Its canonical effect remains `none`.

## Limit

The deterministic gate catches declared deltas, missing authority, missing
evidence, missing source anchors, and known contradiction phrases. It cannot
prove complete semantic equivalence for arbitrary natural language. Separate
semantic review and explicit human readback remain required for protected
wording changes. The same model that produced a proposal may assist with that
review, but it cannot be the sole authority for a foundational transition.
