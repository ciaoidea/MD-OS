# Agentic Operational Control Architecture

MD-OS (Artificial Prefrontal Cortex) v5.0 is an agentic operational control architecture.

It is not defined by a browser, a web app, a single connector, or a single host
runtime. Its core function is to transform agentic action into a process that
is valid, bounded, traceable, verifiable, and correctable.

Compact definition:

```text
MD-OS is an agentic operational controller that turns AI actions into valid,
traceable, verifiable, and correctable processes.
```

## Cognitive-Agent Status — 2026-07-18

MD-OS (Artificial Prefrontal Cortex) is a prototype of a bounded quasi-autonomous cognitive agent and
its persistent control plane. It can direct research and problem-solving steps
inside an externally authorized task envelope by generating hypotheses,
selecting discriminating observations, planning bounded actions, evaluating
results, and retaining verified operational lessons.

The task envelope must state or constrain the objective, operational boundary,
permissions, resources, available capabilities, acceptance tests, and stop
conditions. MD-OS (Artificial Prefrontal Cortex) cannot enlarge that envelope merely because a plan
would benefit from more access or time.

This is not a claim of demonstrated autonomous general intelligence. The
current architecture and evidence concern finite, bounded operating cycles;
open-world generality, indefinite autonomy, and independent external
replication remain unproven.

## Canonical Layer Hierarchy

The operating hierarchy is:

```text
MD-OS
|
+-- 1. Epistemic Layer
|   systemic operating self-model
|
+-- 2. Semantic Layer
|   local contextual awareness
|
+-- 3. State Layer
|   operational continuity
|
+-- 4. Policy Kernel
|   constraints, permissions, limits
|
+-- 5. Action Validity Layer
|   formal action-request validity
|
+-- 6. Execution Layer
|   controlled agentic execution
|
+-- 7. Verification Layer
|   outcome verification
|
+-- 8. Ledger Layer
    append-only memory, audit, replay
```

The Epistemic Layer is the coherence principle for the whole system:

```text
Epistemic Layer
  <-> Semantic / State / Policy / Action Validity / Execution / Verification / Ledger
```

## Layer Functions

| Layer | Function |
| --- | --- |
| Epistemic | defines identity, mandate, limits, truth status, and stop rules |
| Semantic | interprets local meaning, relations, ambiguity, and usefulness |
| State | preserves current process, open work, history, and continuity |
| Policy | translates limits into allow, block, confirm, verify, or escalate |
| Action Validity | decides whether a request may proceed toward execution |
| Execution | performs the bounded operation through a builder or connector |
| Verification | checks whether the intended outcome happened |
| Ledger | records evidence, transitions, errors, hashes, and outcomes |

## Cognitive Transaction Across The Layers

The eight layers constrain one end-to-end transaction rather than acting as
independent feature modules:

| Cognitive stage | Controlling layers | Required output |
| --- | --- | --- |
| Orient | Epistemic + Semantic + State | identity, mandate, relevant context, unknowns, current preconditions |
| Frame | Semantic + State + Policy | bounded TaskSpec with risks, resources, evidence, acceptance tests, and stop rules |
| Hypothesize and plan | Epistemic + Semantic + Action Validity | competing causal accounts and a bounded, testable plan whose predictions can be distinguished |
| Authorize | Policy + Action Validity | explicit allow, block, confirm, or escalate decision bound to a registered capability |
| Execute | Execution | builder or connector result plus an ActionReceipt and observed state delta |
| Judge | Verification | independent `verified`, `failed`, or `unverified` outcome against declared postconditions |
| Learn and continue | Ledger + Epistemic + State | episode, failure analysis, eval-gated skill proposal, rebuilt readback, and replay evidence |

Self-direction happens inside this transaction: the cognitive stages may choose
intermediate hypotheses and plans, but policy, capability, verification, and
ledger gates remain binding.

## Validity Formula

Pre-execution:

```text
ActionRequestValid =
  Epistemic
  AND Semantic
  AND State
  AND Policy
```

Execution routing:

```text
ExecutionValid =
  ActionRequestValid
  AND Capability
  AND Approval
  AND BrokeredExecution
```

Post-execution:

```text
OperationValid =
  ExecutionValid
  AND Executed
  AND Verified
  AND LedgerCommitted
  AND ReplayConsistent
```

Complete:

```text
Valid(Operation) =
  ActionRequestValid
  AND ExecutionValid
  AND OperationValid
```

## Operating Rule

Every nontrivial action should be framed through this path:

```text
identity and mandate
-> local meaning
-> persistent state
-> policy decision
-> action-request validity
-> capability, approval, and bounded execution
-> outcome verification
-> ledger commit
-> replay consistency
```

If one of these conditions is missing, MD-OS should prefer classification,
proposal, read-only inspection, dry-run, explicit confirmation, or escalation
over direct mutation.

## Relationship To The Operating Cycle

The operating cycle is the runtime manifestation of this architecture.

```text
bootstrap
-> orient
-> plan
-> execute bounded builders/connectors
-> verify readback
-> write conceptual boot summary
-> classify health
-> report cycle state
```

The current repository implements this as a deterministic `run-once` path, not
as an autonomous continuous loop:

```bash
node md-os/os/operating_cycle.js run-once
```

## Structural Distinctions

The following distinctions are mandatory:

```text
Epistemic is not a data module.
Semantic is not the highest layer.
Policy is not epistemic self-model.
Ledger is not operational working memory.
Execution is not action validity.
Verification is not audit history.
```

## Non-Claims

This architecture does not make MD-OS a host OS kernel, demonstrated autonomous
general intelligence, or a sentient system. It defines a disciplined operating
control stack for bounded, quasi-autonomous agent work over files, tools,
connectors, and generated readback.
