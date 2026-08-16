# Conceptual Cold Boot Summary Model

Conceptual Cold Boot is the MD-OS method for making a new host session resume
from meaning, not from raw chat memory.

It imports the stronger cold-boot pattern developed in the JOB workspace: the
host should load a compact conceptual synthesis of identity, semantic concepts,
active work, closure discipline, risks, and next actions before expanding large
histories.

## Core Thesis

Ordinary cold boot loads files.

Conceptual cold boot loads the operating meaning of those files.

```text
cold boot = stable filesystem state
conceptual cold boot = stable filesystem state + generated conceptual readback
```

The conceptual summary is not a transcript and not hidden memory. It is a
generated, inspectable view of current operating context.

## Generated Surface

The canonical generated readback is:

```text
md-os/ops/summary/conceptual_boot_summary.json
md-os/ops/summary/conceptual_boot_summary.md
```

The builder is:

```bash
node md-os/os/build_conceptual_boot_summary.js
```

The schema is:

```text
md-os/schemas/conceptual_boot_summary.schema.json
```

## Inputs

The builder reads compact, already-bounded runtime surfaces:

```text
md-os/ops/core/agentic_core.json
md-os/ops/semantic_knowledge_summary.json
md-os/ops/summary/active_work_items.json
md-os/ops/runtime/semantic_operational_compiler.json
md-os/ops/global_index.json
md-os/ops/health_classification.json
md-os/ops/agi/loop_status.json
md-os/ops/continuity.md
md-os/ops/state.json
md-os/ops/last_summary.md
```

Missing inputs are recorded as missing. They are not silently invented.

## Summary Layers

The summary has four layers:

```text
identity layer
semantic layer
operating layer
closure layer
```

The identity layer states who is operating and which boundary is active.

The semantic layer lists dominant concepts, source node counts, and context-pack
availability.

The operating layer lists active work, health status, AGI-loop status, and
current runtime state.

The closure layer lists the master-closure discipline, current risks, missing
readback, and next safe operating actions.

## Boot Rule

Load order:

```text
AGENTS.md
-> ME.md
-> md-os/kb/COGNITIVE_BOOTSTRAP.md
-> md-os/ops/core/agentic_core.md
-> md-os/ops/summary/conceptual_boot_summary.md
-> md-os/ops/semantic_knowledge_summary.md
-> md-os/ops/summary/active_work_items.md
```

The conceptual boot summary is generated readback. It may orient the next host
session, but it cannot override:

```text
identity source
permission model
connector registry
claim status
runtime lifecycle classification
verified readback
human correction
```

## Relation To Warm Start

Warm Start carries recent volatile working context.

Conceptual Cold Boot carries repository-derived conceptual orientation.

```text
Conceptual Cold Boot = generated from filesystem state
Warm Start = imported recent working context
```

Warm Start is optional and volatile. Conceptual Cold Boot is deterministic and
rebuildable.

## Anti-Transcript Rule

The summary must not become a pasted chat history. It should preserve:

- current objective;
- dominant concepts;
- open work;
- unresolved risks;
- closure discipline;
- next safe actions;
- verifier state.

It should omit raw conversational sprawl unless a line is needed as evidence
and has been imported through the knowledge import method.

## Closure Rule

For complex work, the summary must separate:

```text
artifact progress
method progress
master closure progress
```

Master closure progress may advance only when a named dependency edge closes
with verifier readback.

This prevents the cold boot from inheriting optimism from a previous chat.

## Non-Claims

Conceptual Cold Boot does not create consciousness, hidden memory, AGI, or
foundation-model weight changes. It is a generated filesystem view that lets a
host runtime resume with less ambiguity and less context loss.
