# Artificial Prefrontal Cortex Operating Model

## Status

This is the canonical architectural explanation of **MD-OS (Artificial
Prefrontal Cortex) v5.0**, abbreviated **MD-OS APFC v5.0**.

It defines the APFC as the OS-like executive control plane of an agentic
system and explains how MD-OS evolves the compositional discipline of UNIX
from small machine processes into small agentic processes.

## Core thesis

The prefrontal cortex is a useful systems metaphor for an agentic operating
system because executive control is concerned with goal maintenance, selective
attention, working-memory updating, response inhibition, task switching,
planning, and performance monitoring. MD-OS virtualizes those selected
functions as explicit software and filesystem contracts.

```text
biological inspiration: goal-directed executive control
MD-OS realization: bounded, inspectable, permissioned agentic orchestration
```

The analogy is functional, not anatomical. The biological PFC is not literally
a CPU, RAM module, process scheduler, firewall, or debugger, and executive
control depends on distributed neural circuits. MD-OS does not reproduce brain
tissue or claim biological equivalence. It uses the metaphor to design a
control plane whose state and decisions can be inspected and corrected.

## PFC-as-OS correspondence

| PFC-inspired executive role | OS analogy | MD-OS APFC mechanism | Required readback |
| --- | --- | --- | --- |
| selective attention | resource allocation | context packs, salience, explicit context and token budgets | selected and excluded context |
| working-memory maintenance and updating | bounded RAM | task-scoped active state, summaries, typed intermediate artifacts | current state plus capacity/budget |
| planning and task switching | scheduler | dependency graph, ready queue, priorities, stop rules, recovery branches | selected task and scheduling reason |
| interruption | interrupt handling | declared urgent event, safety event, cancellation, preemption, checkpoint, resume policy | interrupted task, preserved state, next legal transition |
| input/output mediation | driver and I/O layer | registered connectors for files, APIs, terminals, apps, devices, queues, sensors, and robots | capability, request, receipt, observed delta |
| response inhibition | permissions and firewall | forbidden paths, capability policy, approval gates, risk classes, resource limits | allow/block decision and applicable rule |
| performance monitoring | error detector | expected-versus-observed comparison and independent postcondition verifier | verified, failed, blocked, or uncertain exit state |
| behavioral correction | debugging and recovery | retry, alternative plan, rollback, escalation, refactor, or stop | correction reason and post-correction verification |
| consolidation | reusable program installation | evaluated skill or natural-language program promotion | provenance, holdout result, no-regression result |

The correspondence is an implementation guide. Neuroscientific language must
not be used to inflate an engineering mechanism into a medical or biological
claim.

## The agentic process

The smallest schedulable unit is not an unconstrained chat session or a vague
agent persona. It is a bounded agentic process:

```text
AgenticProcess =
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

One process owns one operational responsibility. It may use a reasoning model
when semantic judgment is required, but deterministic steps remain ordinary
programs. The process cannot grant itself wider permissions, change its
acceptance criteria after observing the result, or pass an unverified result
downstream as truth.

Canonical exit states are:

```text
verified | failed | blocked | uncertain
```

Only `verified` satisfies a pipeline edge that requires verified input.
For compact operator readback, `OK` maps to `verified`, `ERROR` maps to
`failed`, and `UNCERTAIN` maps to `uncertain`; `BLOCKED` means that a declared
precondition, dependency, permission, capability, or approval is unavailable.

## Artifacts are agentic pipes

UNIX pipelines work because programs communicate through a narrow explicit
interface. MD-OS applies the same discipline to agentic work:

```text
UNIX:
  process A --stdout/text--> process B

MD-OS APFC:
  agentic process A --typed artifact + verification--> agentic process B
```

The artifact can be Markdown, JSON, NDJSON, a file snapshot, a connector
receipt, a state delta, or another schema-valid object. Its interface includes
both content and validity:

```text
ArtifactInterface =
  Schema
  + Provenance
  + Producer
  + VerificationStatus
  + PermissionClass
  + Lifecycle
```

Conversation history, invisible chain-of-thought, unstated model memory, and
planner confidence are not process interfaces.

## Scheduling and interruption

The APFC scheduler may select a task only when:

```text
Ready(task) =
  dependencies_satisfied
  AND inputs_admissible
  AND state_preconditions_hold
  AND permission_route_available
  AND budget_available
```

Priority does not override safety or permissions. An interrupt can pause or
stop a task only through a declared interrupt class, such as a user override,
safety event, invalidated precondition, exhausted budget, unavailable
capability, or failed verifier. Resumption requires a readable checkpoint and
fresh precondition checks.

## The UNIX, Linux, BSD, MD-OS design inheritance

MD-OS follows an analogous engineering iteration, not a literal source-code or
historical lineage.

### UNIX: decomposition and composition

UNIX established the durable idea that complex work can be assembled from
small programs with clear interfaces, files, process isolation, exit status,
and pipes.

MD-OS preserves the rule:

```text
one small program, one clear job
```

and lifts it to:

```text
one small agentic process, one bounded responsibility
```

### Linux: open extension and substrate breadth

Linux is an independently developed Unix-like kernel and a large open
collaborative ecosystem; it did not simply publish the proprietary UNIX source
tree. MD-OS inherits the design lesson of an open implementation surface,
replaceable modules, broad host support, inspectable source, and contribution
through reviewed changes.

MD-OS also adopts a Linux-inspired legal and provenance baseline:
GPL-2.0-only for the covered base, contributor-owned copyrights rather than
mandatory assignment, and DCO 1.1 `Signed-off-by` trails. Alessandro Rizzo is
the original creator and founding maintainer; official-mainline authority does
not make him the owner of contributions written by others.

### BSD: coherent base system and disciplined rewrite

BSD began as the Berkeley Software Distribution in the UNIX family before
Linux existed. Modern BSD projects emphasize a coherent base system, unified
source tree, consistent documentation, and composability. MD-OS inherits that
coherence: core schemas, policies, builders, documentation, tests, release
metadata, and readback evolve as one reviewed system.

This inheritance is architectural. MD-OS is not BSD-licensed: “BSD-style”
means that the operating base is developed as a coherent whole.

### MD-OS APFC v5.0: agentic orchestration

MD-OS changes the substrate being orchestrated:

```text
UNIX/BSD/Linux process:
  deterministic executable operating on machine state

MD-OS agentic process:
  bounded semantic task operating on declared context and external substrates
  through policy, capabilities, artifacts, and independent verification
```

The compact inheritance is:

```text
UNIX decomposition
+ Linux openness and modular extension
+ BSD base-system coherence
+ APFC executive control and verification
= MD-OS agentic Operating Filesystem
```

The operational mapping is:

| Systems principle | Agentic application |
| --- | --- |
| small UNIX program | specialized agentic process with one bounded responsibility |
| pipe | typed message persisted as an artifact with provenance and verification state |
| shell | APFC orchestrator that decomposes, schedules, interrupts, and composes work |
| Linux kernel | bounded core that manages process state, capabilities, tools, permissions, and resources |
| BSD coherence | common contracts, unified source tree, review, tests, documentation, and release readback |
| file | shared external memory with an explicit lifecycle and owner |
| exit code | `OK/verified`, `ERROR/failed`, `BLOCKED`, or `UNCERTAIN/uncertain` |

This yields the supervised composition loop:

1. The APFC orchestrator decomposes the problem into bounded processes.
2. It assigns each process to a suitable specialized agent, deterministic
   program, or connector.
3. Each process returns a typed result, provenance, evidence, and exit state.
4. An independent verifier checks the declared postcondition.
5. The orchestrator composes only artifacts whose required state is
   `verified`.
6. Risky actions remain stopped behind explicit human approval.

The architectural rule is therefore not “agents talking freely.” It is small
specialists connected by precise contracts, in a system shaped more like an
operating system than a group chat.

The phrase “Linux opens it and BSD rewrites it” is therefore useful only as a
project-design shorthand. It is not accurate as historical chronology. For
MD-OS it means: make the implementation open, then subject it to a coherent,
clean, whole-system rewrite while retaining the compositional principle.

The complete licensing and governance contract is
[OPEN_SOURCE_GOVERNANCE_MODEL.md](OPEN_SOURCE_GOVERNANCE_MODEL.md).

## Control cycle

The APFC control cycle is bounded and event-driven:

```text
human or authorized upstream intent
  -> compile bounded TaskSpec
  -> select admissible context
  -> decompose into small agentic processes
  -> schedule one ready process
  -> check policy, capability, approval, and budget
  -> execute through a deterministic program or connector
  -> capture receipt and observed state delta
  -> verify independently
  -> emit typed artifact and exit state
  -> schedule the next admissible process, recover, or stop
```

This is an operating cycle, not permission for an autonomous daemon. Continuous
execution, broader authority, publication, destructive effects, credentials,
or physical actions require separate explicit authorization.

## Architectural invariants

1. Small agentic processes are the unit of orchestration.
2. Typed artifacts are the only cross-process data interface.
3. Verification status is part of the interface, not optional metadata.
4. Permissions and budgets remain local to each process; they do not aggregate
   through composition.
5. Deterministic work remains deterministic.
6. Semantic judgment is bounded by declared context and acceptance criteria.
7. Failed, blocked, uncertain, or missing edges stop unless an explicit
   recovery branch exists.
8. Every state-changing route produces an inspectable receipt and observed
   delta.
9. The filesystem is canonical support for operational continuity; hidden chat
   memory is not.
10. The APFC is the control plane, not the reasoning model, host OS, or device.

## Evidence boundary

The repository may claim that it implements APFC-inspired operating contracts
only when schemas, builders, commands, tests, and generated readback support
the claim. It may not infer human-level executive function, biological
fidelity, consciousness, AGI, or clinical validity from the metaphor.

## References

- Friedman, N. P., and Robbins, T. W., “The role of prefrontal cortex in
  cognitive control and executive function,” *Neuropsychopharmacology* (2022):
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC8617292/>
- Alexander, W. H., and Brown, J. W., “Computational models of performance
  monitoring and cognitive control,” *Topics in Cognitive Science* (2011):
  <https://pmc.ncbi.nlm.nih.gov/articles/PMC3044326/>
- The Open Group, “History of UNIX”:
  <https://www.unix.org/unix_history.html>
- Linux kernel documentation, “Introduction”:
  <https://www.kernel.org/doc/html/latest/process/1.Intro.html>
- FreeBSD Documentation Project, “Explaining BSD”:
  <https://docs.freebsd.org/en/articles/explaining-bsd/>
- FreeBSD Handbook, “Introduction”:
  <https://docs.freebsd.org/en/books/handbook/introduction/>

## Relations

- [ARTIFICIAL_PREFRONTAL_CORTEX_GRAPH_MODEL.md](ARTIFICIAL_PREFRONTAL_CORTEX_GRAPH_MODEL.md)
- [AGENTIC_OPERATION_MODEL.md](AGENTIC_OPERATION_MODEL.md)
- [NATURAL_LANGUAGE_PROGRAMMING_MODEL.md](NATURAL_LANGUAGE_PROGRAMMING_MODEL.md)
- [PERMISSION_MODEL.md](PERMISSION_MODEL.md)
- [SYSTEM_OPERATING_CYCLE_MODEL.md](SYSTEM_OPERATING_CYCLE_MODEL.md)
