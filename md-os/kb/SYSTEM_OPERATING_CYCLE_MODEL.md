# System Operating Cycle Model

The System Operating Cycle is the bounded MD-OS loop that turns repository
state into current operational readback.

It imports the stronger operating-cycle pattern from the MD-OS workspace while
preserving this repository's safety rule: no autonomous continuous execution
unless explicitly requested and separately gated.

## Core Thesis

An operating filesystem is serious only if it can repeatedly answer:

```text
What is the state?
What changed?
What is valid?
What failed?
What should be read first on the next boot?
```

The System Operating Cycle is a deterministic `run-once` answer to those
questions.

## Command Surface

```bash
node md-os/os/operating_cycle.js status
node md-os/os/operating_cycle.js run-once
mdos cycle status
mdos cycle run-once
```

It writes:

```text
md-os/ops/runtime/operating_cycle_report.json
md-os/ops/runtime/operating_cycle_report.md
```

The schema is:

```text
md-os/schemas/operating_cycle_report.schema.json
```

## Cycle Phases

The default run-once cycle is:

```text
1. initialize runtime directories
2. compile natural-language programs
3. rebuild project state
4. rebuild global agenda
5. archive and active summaries
6. rebuild compact agentic core
7. rebuild workspace inventory
8. rebuild markdown graph
9. rebuild runtime lifecycle
10. rebuild semantic knowledge graph
11. rebuild self-release index
12. run AGI eval readback
13. rebuild runtime compiler
14. rebuild global index
15. rebuild hygiene and health
16. rebuild conceptual cold boot summary
17. write operating-cycle report
```

The sequence is deliberately conservative. It favors deterministic builders and
readback over direct action.

## Safety Boundary

The operating cycle must not:

- run as a hidden daemon;
- execute arbitrary user commands;
- mutate host-local secrets or credentials;
- bypass connector policy;
- perform hardware, network, or destructive actions;
- promote claims or permissions without verifier readback.

Continuous operation remains the job of the optional live/continuity service.
The operating cycle is the one-shot disciplined kernel of that behavior.

## Relation To Conceptual Cold Boot

The final phase rebuilds:

```text
md-os/ops/summary/conceptual_boot_summary.md
```

That file is the next session's compact conceptual memory. The cycle therefore
closes the loop:

```text
state -> rebuild -> verify -> conceptual summary -> next boot
```

## Failure Rule

A failed builder does not disappear. The cycle report records:

```text
failed phase
command
exit status
stderr tail
stdout tail
```

The cycle may continue through non-dependent phases only when the phase is
declared non-blocking. The default implementation treats builder failures as
cycle failures and reports them explicitly.

## Non-Claims

The System Operating Cycle is not a host scheduler, OS kernel, or autonomous
agent. It is a deterministic operating pass over the MD-OS filesystem.
