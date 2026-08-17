# Agentic Operation Model

MD-OS generalizes the operating-system abstraction from machine operations to
agentic operations.

This model is the bridge between natural-language intent and runtime control.
It makes `agentic operation` the first-class unit that binds intent, semantic
resolution, state, policy, capability, execution, verification, ledger, and
replay.

## Core Thesis

Classical operating systems control machine operations:

```text
program
-> syscall
-> kernel
-> permission check
-> driver/resource
-> state/log
```

An agentic operating filesystem controls agentic operations:

```text
intent
-> agentic operation
-> policy and capability gate
-> connector or builder
-> artifact/readback
-> state/ledger/replay
```

Compact distinction:

```text
classical OS = control of machine operations
agentic OS = control of cognitive and instrumental agent operations
```

## Small Agentic Tasks And Composition

The compositional unit is a small agentic task, analogous in operating
philosophy to a small UNIX program.

```text
UNIX program composition:
  program A -> explicit text stream -> program B

MD-OS task composition:
  agentic task A -> verified typed artifact -> agentic task B
```

A small agentic task does one bounded operational job. It declares the inputs
it may read, the state it expects, the permissions and budget it may consume,
the execution route it may use, the output it must produce, and the verifier
that decides whether the output is admissible downstream.

```text
ComposableAgenticTask =
  Intent
  + Inputs
  + ContextBoundary
  + Preconditions
  + Policy
  + Capability
  + Budget
  + ExecutionRoute
  + Verifier
  + Outputs
  + StopCondition
```

Tasks compose only through explicit artifacts. Chat history, unstated model
memory, planner confidence, and fluent prose are not valid task interfaces.

```text
Task B may consume Output A
IFF
  Output A exists
  AND Output A matches its declared schema
  AND Verification A satisfies the required outcome
  AND Task B explicitly declares Output A as an input
```

Deterministic stages should remain deterministic programs or builders. Agentic
reasoning belongs only in stages that need interpretation, hypothesis choice,
planning, or other semantic judgment. This preserves the UNIX property that a
stage can be inspected, replaced, tested, and replayed independently.

Composition does not aggregate permissions. Every task retains its own
boundary, capability set, approval requirements, resource budget, verifier,
and stop condition. A failed or unverified edge stops the pipeline unless a
declared recovery branch handles that state.

## Definition

An agentic operation is a bounded state transition initiated by interpreted
intent, constrained by policy, routed through a declared capability or
connector, and complete only when evidence, readback, and ledger state are
written.

```text
AgenticOperation =
  Intent
  + EpistemicFrame
  + SemanticTarget
  + StatePrecondition
  + PolicyDecision
  + Capability
  + ExecutionRoute
  + Approval
  + Verification
  + LedgerCommit
```

An operation is valid only when all three stages hold:

```text
ActionRequestValid =
  Epistemic
  AND Semantic
  AND State
  AND Policy

ExecutionValid =
  ActionRequestValid
  AND Capability
  AND Approval
  AND BrokeredExecution

OperationValid =
  ExecutionValid
  AND Executed
  AND Verified
  AND LedgerCommitted
```

## Classical OS To Agentic OS Mapping

| Classical OS primitive | Agentic OS primitive | MD-OS implementation |
| --- | --- | --- |
| machine operation | agentic operation | operation report, journal, action record |
| process | agentic process | project/work trajectory and runtime report |
| syscall | agentic syscall | bounded builder or connector command |
| kernel | policy/action gate | operating cycle, permission model, runtime discipline |
| permission | action permission | policy decision, capability gate, approval state |
| driver | connector | `md-os/os/*_connector.js` |
| device/resource | external substrate | API, terminal, filesystem, desktop, robot, service, app |
| file | operational artifact | Markdown, JSON, NDJSON, connector artifacts |
| memory | operational memory | active memory, conceptual boot summary, context packs |
| virtual memory | context paging | summaries, warm-start capsules, context packs |
| scheduler | task prioritization | agenda, work-item state, project state |
| log | audit ledger | journal, report, replay readback |
| crash recovery | replay | deterministic builders and `cortex replay` |

## Relationship To Existing Runtime Objects

`process` is not required to be a host process. In MD-OS, a process is a
persistent operational trajectory.

`connector run` is not a full operation by itself. It is only the execution
route. The operation also needs intent, policy, verification, and readback.

`builder run` is not proof of correctness by itself. It becomes an operation
only when its output is checked and recorded.

## Promotion Rule

The paradigm is not fully present when these ideas live only in documentation.

The paradigm becomes operational when sensitive or nontrivial paths can answer:

```text
What did the agent intend?
Was the request valid?
Was execution valid?
Was the operation valid?
Which evidence makes that answer inspectable?
```

The first implementation layer in this repository is the bounded operating
cycle:

```bash
node md-os/os/operating_cycle.js run-once
```

It does not replace every connector with a kernel path yet. It establishes the
runtime cycle and readback shape required for that hardening.

## Non-Claims

This model does not claim that MD-OS is a host operating-system kernel. It does
not claim subjective consciousness, unrestricted autonomy, or AGI.

It claims that agentic work needs a control abstraction analogous to operating
systems: bounded operation, explicit permission, declared capability, brokered
execution, state transition, verification, ledger, and replay.
