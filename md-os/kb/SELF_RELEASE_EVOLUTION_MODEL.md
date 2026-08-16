# Self Release Evolution Model

MD-OS (Artificial Prefrontal Cortex) v5.0 can evolve through explicit self-release proposals, not through
implicit self-modification.

The self-release path lets MD-OS implement patch releases, minor releases,
major releases, or agentic improvement jumps while preserving identity,
boundary discipline, semantic coherence, replay, and human review.

## Core Rule

A new version of MD-OS is not accepted because the host says it improved.

A new version is accepted only when it has:

```text
release proposal
-> version identity
-> improvement hypothesis
-> migration plan
-> compatibility policy
-> semantic and epistemic impact
-> deterministic implementation
-> tests
-> build
-> replay
-> health/readback
-> release manifest
```

The current host runtime may implement the release work, but the release is
owned by the Operating Filesystem state.

Every release proposal is also a semantic-epistemic node: it must state which
semantic operating concepts change, which epistemic statuses are created or
modified, and which compact readback proves the change.

## Release Types

| Type | Meaning | Required discipline |
| --- | --- | --- |
| `patch` | Corrects behavior or documentation without changing the operating model. | tests, build, readback |
| `minor` | Adds a bounded capability or builder while preserving compatibility. | migration note, tests, replay |
| `major` | Changes identity, boundary, schema, or operating assumptions. | migration plan, compatibility policy, rollback |
| `agentic_jump` | Adds a new self-control, perception, reasoning, or semantic-growth layer. | full semantic, epistemic, health, replay, and release review |

An `agentic_jump` must not be shipped as a silent patch.

## Proposal Location

Self-release proposals live under:

```text
md-os/ops/releases/self/proposals/<release_id>.json
```

They are source state, not generated output.

Generated readback lives at:

```text
md-os/ops/releases/self_release_index.json
md-os/ops/releases/self_release_index.md
```

## Proposal Contract

Each proposal should declare:

```json
{
  "schema_version": 1,
  "release_id": "mdos_5_1_example",
  "target_identity_name": "Example APFC",
  "target_identity_version": "5.0",
  "target_personality_profile": "Compact description of the new operating personality.",
  "personality_continuity_rule": "State what remains continuous across the identity change.",
  "identity_epistemic_gates": [
    "unified_identity_check",
    "personality_profile_check",
    "first_person_rule_check",
    "non_claim_preservation_check"
  ],
  "target_release_label": "5.1",
  "target_release_semver": "5.1.0",
  "target_release_version": "5.0",
  "target_release_name": "Example APFC",
  "release_type": "minor",
  "status": "proposed",
  "objective": "What improves.",
  "improvement_hypothesis": "Why this improves MD-OS.",
  "semantic_epistemic_impact": "Which semantic nodes, epistemic statuses, and readback gates change.",
  "scope": ["what may change"],
  "non_goals": ["what must not change"],
  "migration_plan": ["bounded migration steps"],
  "compatibility_policy": "How existing workspaces keep operating.",
  "acceptance_criteria": ["observable success conditions"],
  "required_gates": [
    "npm_run_check",
    "npm_test",
    "build_all",
    "mdos_replay_matched",
    "semantic_knowledge_ok",
    "health_readback"
  ],
  "rollback_plan": ["how to undo or demote the release"]
}
```

Personality changes are release changes. A new personality must not be patched
into prose alone. It must enter as a self-release proposal with target identity,
personality profile, continuity rule, identity epistemic gates, generated
readback, tests, health, and replay.

## Improvement Jump Gate

Before accepting an `agentic_jump`, answer:

```text
1. What new self-control loop is added?
2. Which files become the canonical source?
3. Which generated readback proves the loop exists?
4. Which tests prevent regression?
5. Which health or replay signal catches failure?
6. Does the jump preserve the active boundary?
7. Does the jump preserve English release surface?
8. What is the rollback or demotion path?
```

If any answer is missing, the proposal remains `proposed` or
`requires_review`.

## No Trash Rule

Self-release work must avoid release debris:

```text
no duplicate release folders for the same target
no generated files promoted as source
no old boundary aliases
no stale manifests after rejected proposals
no heavyweight graph reads during ordinary health checks
```

Use compact indexes for health and bootstrap. Expand full generated evidence
only when reviewing a release.

## Relation To Other Models

This model binds:

- [AGENTIC_OPERATIONAL_RELEASE_MODEL.md](AGENTIC_OPERATIONAL_RELEASE_MODEL.md)
- [SEMANTIC_OPERATIONAL_NETWORK_MODEL.md](SEMANTIC_OPERATIONAL_NETWORK_MODEL.md)
- [SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md](SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md)
- [RUNTIME_STATE_LIFECYCLE_MODEL.md](RUNTIME_STATE_LIFECYCLE_MODEL.md)
- [SYSTEM_HYGIENE_MODEL.md](SYSTEM_HYGIENE_MODEL.md)
- [CHANGE_PROPOSAL_MODEL.md](CHANGE_PROPOSAL_MODEL.md)

It defines how MD-OS can develop, correct, document, and evolve itself as a
persistent agent and Operating Filesystem carried by this repository without
confusing a session decision with a verified release.
