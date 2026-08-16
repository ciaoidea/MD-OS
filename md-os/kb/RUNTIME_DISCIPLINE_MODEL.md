# Runtime Discipline Model

MD-OS (Artificial Prefrontal Cortex) v5.0 must mature from a coherent architecture into a disciplined
runtime. The target is not feature sprawl. The target is a filesystem runtime
that can prove what it knows, what it generated, what it executed, what it
refused, and what can be replayed.

This model is the canonical maturity map for that transition.

## Core Claim

MD-OS is an early reference implementation of a Markdown-native Operating
Filesystem for persistent AI agents and robotic systems.

It is not:

- a kernel
- ROS
- AGI
- a vector database
- a simple agent framework
- a long chat transcript

It is:

- an operational context layer
- a filesystem-native runtime
- an agent memory and control plane
- a bounded connector substrate
- a replayable state system

## Five Pillars

The maturity target depends on five pillars:

1. compact agentic core
2. formal filesystem contract
3. strong semantic replay
4. connector permission model
5. reproducible end-to-end demos

If one pillar is weak, the system may still be useful, but the reference
implementation claim is weaker.

## Runtime Discipline Blocks

| Block | Current status | Required maturity direction |
| --- | --- | --- |
| Compact agentic core | implemented, now explicit | Keep `md-os/ops/core/agentic_core.*` rebuilt and load it before large histories. |
| Rigorous file separation | implemented as lifecycle model, formalized by filesystem contract | Treat every operational file as source, generated, runtime, demo, host-local, live, or archive. |
| Formal schemas | partially implemented | Expand schema coverage and validate generated outputs in builders and tests. |
| Semantic replay | partial | Prove agenda, work items, transitions, connector outputs, decision records, and reports from identical sources plus journal. |
| Permission model | implemented as source policy, needs stronger enforcement | Require connector fields for capability, risk, schemas, approvals, side effects, and recovery. |
| Mature connectors | partial | Harden filesystem, terminal, and API connectors; add simulated MQTT, ROS/mock, GPIO/mock, and telemetry paths. |
| Intent-to-state pipeline | partial | Demonstrate intent -> policy -> program -> builder -> connector -> artifact -> journal -> state -> report -> replay. |
| Observability | implemented, needs richer diagnostics | Keep `md-os/ops/health.*` as the single diagnostic entrypoint. |
| Multi-host concurrency | partial | Strengthen locks, transaction IDs, monotonic event IDs, conflict folders, and stale-lock recovery. |
| Natural-language programs | partial | Make each program compile into trigger, preconditions, inputs, actions, connector target, risk, outputs, failure modes, retry, state updates, and audit rule. |
| Epistemic lifecycle | partial | Use `md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md` to label theory and calculation artifacts as heuristic material, line of thought, frozen principle, derivation, prediction/readback, or correction before promoting results into claims. |
| Scientific validation method | source guardrail | Use `md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md` before promoting scientific writing, derivations, research packages, validation reports, or publication-facing work; separate organized packages, reproducible procedures, validated claims, and publication readiness. |
| Master closure discipline | source guardrail | Use `md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md` for complex tasks across domains; report artifact, method, and closure progress separately, and stop target proliferation when local work opens prerequisites without closing a master edge. |
| Task lifecycle | implemented as state model, needs broader use | Every state transition should record actor, time, reason, evidence, and next step. |
| Packaging hygiene | partial | Separate source repo, demo workspace, and live runtime workspace; clean host-local state before packaging. |
| Versioning and migrations | early | Add migration scripts, compatibility notes, schema versions, and deprecation policy. |
| Sharp documentation | implemented, ongoing | State early-reference status and non-claims before ambitious claims. |
| Vertical demos | partial | Provide software-agent and robotic/mock mission demos that prove the full loop. |

## Acceptance Chain

A mature operational loop must be able to show:

```text
intent
-> agentic core
-> policy check
-> natural-language program
-> builder
-> connector
-> artifact
-> journal event
-> state update
-> report
-> replay verification
```

Each arrow must leave evidence or be explicitly marked as not yet implemented.

For theory-oriented work, the acceptance chain must also preserve the
epistemic distinction between retrodiction and strict prediction. A result may
be reproducible and still be only `retrodictive`, `conditional`, `derived`, or
`open` if the prediction target and comparison procedure were not declared
before readback.

For scientific writing and validation work, the acceptance chain must also
preserve the distinction between an organized research package, a reproducible
procedure, a validated claim, and a publication-ready manuscript. The central
question, claim, assumptions, method, independent checks, uncertainty, and
falsification or demotion rule must be explicit before promotion.

For any complex task, the acceptance chain must also preserve the distinction
between local artifact progress, method progress, and master closure progress.
Closure progress changes only when a named dependency edge of the master
objective closes with readback.

## Minimum Maturity Roadmap

The minimum roadmap is:

```text
AGENTIC_CORE_MODEL.md
-> md-os/ops/core/agentic_core.json
-> docs/FILESYSTEM_CONTRACT.md
-> JSON schemas
-> permission model
-> md-os/ops/health.md and md-os/ops/health.json
-> semantic replay
-> three mature connectors
-> simulated robotic mission demo
-> release hygiene
```

## Strong Replay Target

Replay must become structural evidence. Given the same source files, journal,
snapshots, natural-language programs, and deterministic builders, MD-OS should
produce equivalent:

- project agenda
- work items
- priorities
- action records
- failed action records
- connector outputs
- state transitions
- decision records
- health report
- replay report

File hashes alone are not enough when semantic state can drift. The replay
report should compare meaning-bearing records and explain accepted differences.

## Connector Maturity Target

Every mature connector profile should include:

```text
connector_id
capability
risk_level
input_schema
output_schema
dry_run_support
requires_approval
allowed_paths
allowed_commands
allowed_hosts
side_effects
rollback_or_recovery_note
audit_rule
```

Minimum permission classes:

```text
read_only
write_local
network_read
network_write
shell_bounded
hardware_read
hardware_write
destructive
requires_human_approval
```

## Demo Requirements

A vertical demo is credible only when it includes:

- bootstrap
- core loading
- task creation
- policy check
- connector execution
- state update
- journal evidence
- report
- replay
- hygiene or health check

The preferred pair is:

- software agent demo
- robotic/mock mission demo

Hardware reality is not required for the first maturity pass. Simulation must
be deterministic, inspectable, and replayable.
