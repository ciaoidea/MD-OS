# MD-OS (Artificial Prefrontal Cortex) v5.0 Architecture

MD-OS (Artificial Prefrontal Cortex) v5.0 is a Markdown-native Operating Filesystem release.

![MD-OS (Artificial Prefrontal Cortex) v5.0 architecture schema](md-os-architecture-schema.svg)

`MD-OS` means Markdown Operating Filesystem. `5.0` is the current repository
release version. It is not a real-time hardware operating system. It is an
Operating Filesystem for persistent AI agents, robotic
systems, devices, and host runtimes: readable, correctable, replayable, and
portable across substrates.

The central architectural paradigm is natural-language robotic-agentic
programming. MD-OS is not only a memory layout for agents; it is a way to
program the operating behavior of a complex ecosystem made of humans, host
runtimes, MCP tools, internal applications, filesystems, devices, sensors,
robots, policies, telemetry, approvals, and recovery procedures.

It is an early reference implementation of the paradigm, not a claim that the
runtime lifecycle, permission model, replay semantics, connector coverage, or
robotic integrations are already mature.

## Artificial Prefrontal Cortex As The Operating System

The APFC is the executive control plane of MD-OS. The analogy to a prefrontal
cortex is functional:

| Executive role | MD-OS realization |
| --- | --- |
| resource allocation and attention | bounded context packs, salience, token, time, and action budgets |
| working state | task-scoped active memory and typed intermediate artifacts |
| scheduling and interruption | dependency-aware task selection, priority, stop rules, checkpoints, and recovery branches |
| I/O mediation | registered connectors for files, terminals, APIs, apps, queues, devices, sensors, and robots |
| permissions and inhibition | capability checks, forbidden paths, risk classes, approvals, and resource limits |
| error monitoring and debugging | expected-versus-observed comparison, independent verification, retry, rollback, escalation, or stop |

The APFC is not a biological simulation and MD-OS is not a POSIX or real-time
hardware kernel. The metaphor defines explicit control responsibilities around
reasoning models and external substrates. See
[ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md](../md-os/kb/ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md).

## UNIX Philosophy For Agentic Tasks

MD-OS adopts the compositional lesson of UNIX without pretending to be a POSIX
kernel. UNIX makes complex workflows from small programs connected by explicit
streams. MD-OS makes complex workflows from small agentic tasks connected by
explicit, schema-valid, independently verifiable artifacts.

```text
small program | small program | small program

becomes

bounded agentic task
  -> verified artifact
  -> bounded agentic task
  -> verified artifact
  -> bounded agentic task
```

The unit of composition is not an unconstrained agent session. It is a bounded
task contract:

```text
AgenticTask =
  Intent
  + DeclaredInputs
  + ContextBoundary
  + StatePreconditions
  + Permissions
  + ResourceBudget
  + ExecutionRoute
  + Verifier
  + DeclaredOutputs
  + StopCondition
```

Composition follows six rules:

1. One task has one bounded operational responsibility.
2. Inputs and outputs cross task boundaries as files or declared connector
   artifacts, never as hidden model memory.
3. Deterministic work remains in small deterministic programs; a reasoning
   model is used only where semantic judgment is actually required.
4. A downstream task consumes an upstream result only when its required
   verification state is satisfied.
5. Failure, missing evidence, or exhausted budget stops the edge unless an
   explicit recovery branch exists.
6. Every composed workflow remains inspectable, replayable, replaceable by
   stage, and bounded by the permissions of each task.

This makes the filesystem the agentic equivalent of the UNIX pipe boundary:
the interface is visible, portable, tool-independent, and testable. The current
runtime already provides TaskSpec, policy, connector, verifier, artifact, and
replay primitives; richer task-pipeline scheduling remains an incremental
runtime capability, not an assumed success claim.

### Design inheritance, not historical chronology

MD-OS combines UNIX decomposition, Linux-style open modular extension, and
BSD-style base-system coherence. BSD historically predates Linux; the order is
an MD-OS development method, not a claim that BSD rewrote Linux. For this
project, “open it, then rewrite it coherently” means exposing the implementation
for contribution and then keeping schemas, runtime, documentation, tests, and
release readback aligned as one system.

The legal and governance binding is equally explicit: the covered MD-OS base
is GPL-2.0-only, Alessandro Rizzo is the original creator, contributors retain
copyright in their own contributions, and DCO 1.1 records the right to submit
each change. BSD-style coherence describes the unified base-system method; it
does not mean that MD-OS uses a BSD license. See
[LICENSING.md](LICENSING.md) and
[OPEN_SOURCE_GOVERNANCE_MODEL.md](../md-os/kb/OPEN_SOURCE_GOVERNANCE_MODEL.md).

## Architecture Status — 2026-07-18

MD-OS (Artificial Prefrontal Cortex) is a prototype of a bounded quasi-autonomous cognitive agent and
its persistent operating context. Given an explicit objective and a delimited
environment, it can use an available reasoning model and permitted tools to
investigate a problem, formulate competing hypotheses, design checks that
distinguish them, execute allowed steps, verify the observed result, and retain
the resulting episode for correction or later reuse.

`Quasi-autonomous` has a narrow operational meaning here. After a human or an
authorized upstream system supplies the goal and authority envelope, the
prototype can choose intermediate questions, subgoals, hypotheses, plans, and
verification steps without requiring a human to select every individual move.
It cannot grant itself new permissions, escape the declared boundary, remove
approval gates, increase its budget, run indefinitely, promote its own claims
or skills without evidence, or redefine success after execution.

MD-OS (Artificial Prefrontal Cortex) is not demonstrated autonomous general intelligence. Current
evidence supports bounded operating and learning mechanisms in finite,
controlled environments. It does not establish open-world generality,
indefinite autonomy, independent external replication, consciousness, or
personhood. The finite AGI-prerequisite experiment preserves this boundary by
reporting both `AGI achieved: false` and `AGI claim supported: false`; see
[AGI_V3_VALIDATION_REPORT.md](../md-os/kb/AGI_V3_VALIDATION_REPORT.md).

The date above records the state of this architecture description. It does not
create a new identity or software release. The repository compatibility line
remains `5.0`, the package version remains `5.0.1`, and the persistent
identity name remains `MD-OS (Artificial Prefrontal Cortex)`.

## System Roles

MD-OS separates cognition, authority, execution, and evidence instead of
presenting them as one opaque agent process.

| Role | Architectural responsibility | Explicit boundary |
| --- | --- | --- |
| Human or authorized upstream system | supplies goals, scope, permissions, budgets, acceptance criteria, and high-risk approvals | remains the source of authority; is not replaced by a success claim from the agent |
| MD-OS (Artificial Prefrontal Cortex) | maintains the persistent identity frame, operational context, task state, policy routing, continuity, and learning records | is an operating frame and control plane, not proof of personhood, consciousness, or AGI |
| Reasoning model | proposes interpretations, hypotheses, plans, explanations, and candidate corrections | does not own durable memory, permissions, execution authority, or truth |
| Host runtime | loads context and operates the repository and available tools | is the current execution layer, not the persistent MD-OS (Artificial Prefrontal Cortex) identity |
| Builders and connectors | compile state or read and write through explicitly bounded substrates | may act only through registered capabilities, paths, commands, hosts, risks, and approvals |
| Independent verifier | evaluates declared postconditions, evidence, state deltas, and acceptance tests | judges outcomes separately from the planner and executor |
| Ledger, episodes, evals, and replay | preserve what was attempted, observed, learned, promoted, and reconstructed | recorded activity is evidence to inspect, not automatic proof of success |

This separation is the central safety and truth boundary: the planner proposes,
the policy layer authorizes or blocks, the executor acts, the verifier judges,
and the ledger preserves the evidence.

## Architecture At A Glance

```text
human-authorized objective
+ boundary + permissions + budget + acceptance criteria + stop conditions
  |
  v
stable identity and knowledge
  AGENTS.md + ME.md + md-os/kb/ + compact agentic core
  |
  v
cognitive transaction
  TaskSpec -> competing hypotheses -> PlanGraph -> selected bounded plan
  |
  v
operational validity
  epistemic status -> semantic fit -> current state -> policy -> capability
  |
  v
bounded execution
  deterministic builder or registered connector -> ActionReceipt -> state delta
  |
  v
independent verification
  required evidence + postconditions + acceptance tests -> verified/failed/unverified
  |
  v
learning and continuity
  Episode -> failure analysis -> skill candidate -> eval/promotion gate
  -> runtime rebuild -> journal/index/health -> replay
```

The diagram is a validity path, not a promise that every planned subsystem is
already mature. A missing policy, capability, receipt, verifier, or acceptance
contract stops the corresponding operation from becoming verified success.

## Cognitive Transaction

The smallest truth-bearing unit of cognitive work is a bounded transaction:

```text
TaskSpec
-> hypothesis and plan competition
-> policy and capability decision
-> bounded action
-> observed state delta
-> independent postcondition verification
-> proof-carrying episode
-> evaluated reusable competence
```

The transaction uses the following artifacts:

| Stage | Primary artifact or surface | Required meaning |
| --- | --- | --- |
| Orient | `AGENTS.md`, `ME.md`, `md-os/ops/core/agentic_core.*`, conceptual boot summary | load identity, mandate, limits, and current state before task-specific work |
| Frame | `TaskSpec` under `md-os/ops/tasks/` | bind goal, constraints, risk/resource budgets, evidence, actions, observations, and executable acceptance tests |
| Reason and plan | hypotheses plus `PlanGraph` where supported | keep causal alternatives, predictions, uncertainty, preconditions, rollback, and postconditions explicit |
| Authorize | permission model, policy kernel, connector registry | prove that the requested route is within scope and that the capability exists |
| Execute | builder or connector plus `ActionReceipt` | record the bounded tool identity, inputs, outputs, exit state, before/after state, and observed delta |
| Verify | `VerificationResult` | independently check evidence and postconditions; return only `verified`, `failed`, or `unverified` |
| Learn | `Episode`, failure record, skill candidate, eval, promotion gate | retain experience without turning an attempt or plausible lesson into an untested capability |
| Continue | journal, runtime compiler, indices, health readback, replay | make the operation inspectable, reconstructible, resumable, and correctable across sessions |

Success is therefore stricter than generating a plausible answer or writing an
artifact:

```text
Success(task) =
  verifiable TaskSpec
  AND policy-approved execution
  AND receipts for declared actions
  AND required state delta observed
  AND required evidence present
  AND all acceptance tests passed
```

The canonical executable contract is
[COGNITIVE_TRANSACTION_LOOP_MODEL.md](../md-os/kb/COGNITIVE_TRANSACTION_LOOP_MODEL.md).

## Bounded Self-Direction

Within an authorized task envelope, the prototype is designed to perform the
following work without step-by-step human selection:

- inspect local state and, when separately authorized, bounded public sources;
- identify important unknowns and decompose an objective into testable parts;
- formulate multiple causal or solution hypotheses;
- choose observations or tests that discriminate between those hypotheses;
- rank candidate plans by predicted utility, risk, and evidence;
- operate registered builders and connectors inside their capability profiles;
- compare observed outcomes with declared postconditions;
- retry, refactor, stop, or report failure according to budgets and stop rules;
- write episodes and propose reusable procedures for independent evaluation.

The autonomy envelope excludes:

- inventing credentials, capabilities, consent, or authority;
- modifying hidden tests or moving acceptance criteria after seeing a result;
- autonomous continuous execution unless explicitly requested and separately
  gated;
- network publication, external writes, destructive actions, or hardware
  effects without the required connector policy and approval;
- self-promoting claims, skills, permissions, identity changes, or releases;
- treating fluent reasoning, elapsed time, artifact count, or self-report as
  evidence that the objective was achieved.

This is why `bounded quasi-autonomous cognitive agent` is accurate while
`autonomous general intelligence` is not.

## Evidence And Maturity Boundary

The architecture uses three different evidence levels:

| Level | What may be said | What may not be inferred |
| --- | --- | --- |
| Implemented mechanism | the repository contains typed task, plan, receipt, verifier, episode, eval, connector, runtime, health, and replay paths, with maturity varying by component | that every connector, domain, deployment mode, or planned cognitive layer is complete |
| Finite demonstration | controlled suites demonstrate selected transfer, invention, curriculum, continual-learning, recovery, and bounded-horizon properties under stated budgets | open-world generality, unrestricted task coverage, or independent real-world replication |
| Unproven target | the architecture is intended to support increasingly general, persistent, correctable problem solving | that MD-OS (Artificial Prefrontal Cortex) is AGI, conscious, indefinitely autonomous, or a mature production agent runtime |

Important deferred or incomplete areas include open-world evaluation,
independent external replication, long-duration deployment evidence, broader
model-driven plan search, dynamic model brokering, stronger process and network
sandboxing, mature multi-host compatibility, and safety-certified physical
robotics integration. These gaps are architecture inputs, not details to hide
behind the word `prototype`.

## Core claim

The real paradigm is not Markdown by itself and not a single program. It is
Operational Context as Filesystem: the operational context of an agent is
externalized into files that can be read, audited, rebuilt, transferred, and
used for bounded action.

For robotic and device-oriented work, the same paradigm becomes ecosystem
programming in natural language: missions, roles, procedures, safety
boundaries, connector contracts, telemetry snapshots, and recovery paths are
written as durable operating artifacts and materialized by deterministic
builders and bounded connectors.

The real program is not only code. It is the combination of:

- stable natural-language knowledge
- natural-language programs
- structured source signals
- persistent runtime state
- deterministic scripts
- explicit connector contracts

This lets a human or an agent inspect the system without relying on hidden
process memory.

## Semantic Runtime Overlay

The LLM-facing architecture can also be described as a semantic neural overlay:

```text
Static LLM + MD-OS Semantic Runtime = Dynamic Virtual LLM
```

This is an external runtime claim, not a model-weight claim. The static LLM
remains the reasoning core. MD-OS supplies the surrounding semantic runtime:
tasks, connectors, policies, snapshots, active memory, semantic actions,
deterministic builders, audit, and replay.

The corresponding completion shift is:

```text
LLMs complete words.
MD-OS completes supervised operational tasks.
```

In this frame, a semantic action is not just a tool call. It is a meaningful
state transition under policy, routed through a bounded connector or builder,
and recorded as an artifact, snapshot, journal event, or rebuilt state.

With the non-claims stated, MD-OS can also be called a semantic operating
system for agents: not a kernel or robotics middleware, but a semantic
Operating Filesystem that turns intent, memory, policy, connector capability,
artifacts, and state transitions into an inspectable semantic action field.

The same architecture can be described as semantic-operational node
virtualization on disk. Files, work items, policies, connector profiles,
snapshots, artifacts, and generated state act as neural-like semantic nodes:
analogous to neural nodes by role, but not numerical neurons, hidden
activations, model weights, or a trained network. Links, indices, journals,
schedules, and state transitions connect those nodes into a
filesystem-backed semantic neural overlay.

The canonical model is
[SEMANTIC_NEURAL_OVERLAY_MODEL.md](../md-os/kb/SEMANTIC_NEURAL_OVERLAY_MODEL.md).

Natural language is not left as transient prompt text. It is stabilized into
Markdown, JSON, NDJSON, and deterministic scripts that can be inspected,
corrected, replayed, and reused by different hosts.

Natural-language programs are Markdown files under `md-os/ops/programs/`. They
are compiled by `md-os/os/compile_programs.js` into canonical runtime state under
`md-os/ops/compiled/`.

The system is not API-first. It is substrate-first. APIs are important when
available, but they are only one bounded surface among terminals, filesystems,
desktop applications, browsers, devices, queues, and future adapters.

Stated without abstraction: MD-OS creates a natural-language agentic layer
between itself and the real execution substrates of the host machine. Those
substrates include the host OS, hardware, peripherals, desktop/window system,
installed applications, filesystems, terminals, browsers, APIs, services,
queues, robots, controllers, sensors, and actuators. MD-OS discovers them,
registers them, routes explicit user intent to bounded connectors, captures
input/output artifacts, and writes auditable state.

The system is also not model-first. A model supplies reasoning, but persistent
agent operation needs durable memory, bounded actions, readable goals,
telemetry, audit, and replay. MD-OS is the Operating Filesystem around that
model, not the intelligence itself.

## Boundary

`md-os/` is the active operational boundary.

Everything that changes operational state should be represented under `md-os/`.

Root files such as `AGENTS.md`, `ME.md`, and `README.md` explain identity,
guardrails, and usage, but the live runtime boundary is `md-os/`.

## Layers

```text
human natural-language intent
  translated into explicit operating intent

root files
  AGENTS.md, ME.md, README.md
  define Operating Filesystem identity, guardrails, and public usage

md-os/kb/
  stable knowledge base
  defines the natural-language operating model, connector contracts, project
  model, and hygiene

md-os/ops/
  persistent runtime state
  stores natural-language programs, compiled program state, source snapshots,
  compiled project state, agendas, indices, active summaries, archive views,
  change proposals, journal, connector registry, and artifacts
  files must be classified as source, generated, local, demo, live, or archive

md-os/os/
  deterministic runtime
  contains builders, helpers, and bounded executors

natural-language agentic substrate layer
  discovery + registry + policy + connector selection + action/audit

host substrates
  OS, hardware, peripherals, desktop, installed apps, filesystems, terminals,
  browsers, APIs, services, queues, robots, controllers, sensors, actuators
```

## Data flow

```text
human intent or external system event
  -> natural-language program in md-os/ops/programs/
  -> compiled program state in md-os/ops/compiled/
  -> source snapshot in md-os/ops/sources/
  -> project builder
  -> md-os/ops/projects/<project_id>/
  -> global agenda, active summary, archive views, and global index
  -> next host runtime session reads the rebuilt state
```

The replay path uses the same flow after removing known compiled outputs. That
keeps runtime continuity testable instead of depending on trust in the previous
session.

Source snapshots can come from:

- a human writing a manual signal
- the terminal connector
- an API adapter
- a filesystem scanner
- a desktop adapter
- any future connector that follows the contract

## Connector rule

Connectors are adapters. They do not own truth.

A connector reads or writes through a bounded substrate, then emits normalized
snapshots. Builders decide how those snapshots become canonical project state.

This keeps connectors replaceable. A browser connector, terminal connector, API
connector, filesystem connector, device connector, and desktop connector can all
feed the same project state model.

The stable architectural question is not whether a system exposes an API. The
question is whether the connector can observe or act through a bounded,
inspectable, and documented substrate.

## Host runtime rule

Codex is a verified host-compatibility path for this 5.0 release, but Codex
is still not the architecture. It is the host that operates the architecture.
OpenCode or another LLM runtime may operate the same filesystem layer as a
secondary path, but should not be described as Codex-compatible by default.

The host reads the repository, follows `AGENTS.md`, manipulates bounded files
and scripts, and reports from the rebuilt runtime state.

The same `md-os/` control plane should remain usable by different hosts, while
Codex remains the verified compatibility path for MD-OS APFC.

MCP-compatible hosts can use `md-os/os/mcp_server.js` as a protocol adapter. The
adapter exposes existing MD-OS (Artificial Prefrontal Cortex) v5.0 files as resources and bounded builders
or connectors as tools; it does not move truth out of the filesystem runtime.

## Persistent agent systems and robots

MD-OS (Artificial Prefrontal Cortex) v5.0 can support persistent agent runtimes and robotic systems as
an operating context layer.

It should sit above the safety-critical control loop:

```text
Human intent
  -> MD-OS Operating Filesystem
  -> bounded connector
  -> robot stack, API, terminal, filesystem, device, or queue
  -> bounded action
  -> telemetry or result snapshot
  -> Markdown/JSON state
  -> replayable audit trail
```

It does not replace Linux, RTOS layers, ROS 2, firmware, drivers, motor
control, emergency stops, or safety-certified systems.

## Raspberry Pi edge nodes

A Raspberry Pi can run MD-OS (Artificial Prefrontal Cortex) v5.0 as an edge node above Raspberry Pi OS
or another Linux distribution.

```text
Raspberry Pi hardware
  -> Raspberry Pi OS / Linux
  -> systemd, shell, GPIO libraries, device APIs, or ROS 2
  -> bounded MD-OS connectors
  -> md-os/ops readable state
  -> deterministic builders
  -> host runtime, MCP client, or local agent loop
```

This makes the Pi useful as a persistent device-side memory and coordination
node: it can collect telemetry, write source snapshots, rebuild project state,
serve MCP resources, and request bounded actions through explicit connector
contracts.

The Pi still owns the physical runtime through Linux and device libraries.
MD-OS owns the persistent operating context: goals, memory, audit, agenda,
continuity, and bounded action routing.

## Runtime artifacts

Important runtime locations:

- `md-os/ops/state.json`: runtime health and mode.
- `md-os/ops/global_index.md`: current cross-project map.
- `md-os/ops/continuity.md`: continuity notes.
- `md-os/ops/last_summary.md`: last stable summary.
- `md-os/ops/journal.ndjson`: append-only event log.
- `md-os/ops/changes/`: append-only proposals for contested edits.
- `md-os/ops/connectors/connector_registry.json`: available and planned
  connectors.
- `md-os/ops/local/hardware/`: cleanable host-local hardware discovery cache.
- `md-os/ops/local/software/`: cleanable host-local application and service
  discovery cache.
- `md-os/ops/sources/`: raw source snapshots.
- `md-os/ops/projects/`: compiled project state.
- `md-os/ops/agenda/`: consolidated agenda.
- `md-os/ops/summary/active_work_items.md`: hot active-work view for low-context
  reads.
- `md-os/ops/archive/`: non-destructive terminal work-item archive views.

## Deterministic builders

The canonical builders are:

```bash
mdos replay
node md-os/os/compile_programs.js
node md-os/os/build_project_state.js <project_id>
node md-os/os/build_global_agenda.js
node md-os/os/archive_runtime_state.js
node md-os/os/build_global_index.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_system_hygiene_status.js
node md-os/os/build_health_dashboard.js
```

Builders should be deterministic: given the same input files, they should
produce the same state shape.

`mdos replay` is the end-to-end check. It preserves source snapshots, project
definitions, connector config, artifacts, change proposals, and journal history,
removes compiled state, rebuilds it, and emits a replay fingerprint for
canonical project, active-summary, and global agenda/index state. Volatile
inventory and hygiene outputs are rebuilt but are not part of the equality
fingerprint.

## Safety constraints

- Keep execution bounded inside `md-os/`.
- Avoid destructive actions by default.
- Use append-only change proposals for ambiguous concurrent edits.
- Prefer readable files over hidden state.
- Use explicit connector contracts.
- Keep low-level mutation in `md-os/os/`.
- Keep persistent state in `md-os/ops/`.
- Keep stable knowledge in `md-os/kb/`.

## Why this is useful

Agent sessions are normally fragile because context can disappear between runs.
This repository makes context durable:

- instructions are readable
- memory is externalized
- actions are bounded
- state can be rebuilt
- a different host runtime can resume the same system
