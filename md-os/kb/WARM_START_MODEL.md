# Warm Start Model

Warm Start is the MD-OS method for carrying recent working context from one
host runtime, hardware node, or session into the next without treating raw chat
history as canonical memory.

It exists because a first boot with only long-term filesystem state can be
stable but slow to reorient. A warm boot loads stable MD-OS filesystem state
first, then imports a verified capsule of recent volatile context as working
memory.

Compact formula:

```text
cold boot = filesystem only
conceptual cold boot = filesystem + generated conceptual summary
warm boot = filesystem + generated conceptual summary + verified recent working context
```

## Purpose

Warm Start preserves the volatile context that makes a system resume faster:

- current intent;
- active task;
- recent corrections;
- stable user preferences;
- recent decisions;
- open assumptions;
- risks;
- tools and connectors used;
- recent results;
- next likely actions;
- verification gates.

It must not preserve full chat transcripts by default.

## Files

The intended current Warm Start capsule path is:

```text
md-os/ops/warm_start/current.json
md-os/ops/warm_start/current.md
```

Crash recovery checkpoints live under:

```text
md-os/ops/warm_start/checkpoints/
md-os/ops/warm_start/recovery_journal.ndjson
```

This repository does not yet implement the full Warm Start command surface.
Until it does, Warm Start remains a model and must not be treated as available
runtime behavior.

## Boot Order

Warm Start is read only after stable identity, core state, and conceptual cold
boot summary:

```text
AGENTS.md
-> ME.md
-> md-os/kb/COGNITIVE_BOOTSTRAP.md
-> md-os/ops/core/agentic_core.md
-> md-os/ops/summary/conceptual_boot_summary.md
-> md-os/ops/warm_start/current.md if present
```

The capsule imports as working context:

```text
canonical = false
import_mode = working_context
```

Therefore it can orient the next action, but it cannot override identity,
permission, connector capability, claim status, replay, or generated readback.

## Relation To Conceptual Cold Boot

Conceptual Cold Boot is deterministic and rebuildable from repository state.

Warm Start is recent volatile context and must be validated against repository
state before action.

```text
Conceptual Cold Boot = what the repository currently means
Warm Start = what the last session was doing
```

## Non-Claims

Warm Start does not claim consciousness, subjective continuity, resurrection,
or identity transfer. It transfers operational context.
