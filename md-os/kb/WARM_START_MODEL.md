# Warm Start Model

Warm Start is the MD-OS method for carrying recent working context from one
host runtime, hardware node, session, or Git clone into the next without using
raw chat history as identity or operational memory.

It exists because a first boot with only long-term filesystem state can be
stable but slow to reorient. A warm boot loads stable MD-OS filesystem state
first, then imports a verified capsule of recent volatile context as working
memory.

Compact formula:

```text
cold boot = versioned filesystem only
conceptual cold boot = filesystem + generated conceptual summary
portable warm boot = filesystem + verified versioned operational snapshot
local warm boot = portable warm boot + verified host-local recent context
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

The portable and host-local Warm Start capsules must not preserve full chat
transcripts. A portable capsule also excludes Codex thread identifiers, model
identifiers, host paths, and credentials. Private conversation continuity is a
separate local artifact with a separate publication boundary.

## Files

The clone-carried capsule is:

```text
md-os/continuity/portable_state.json
```

It is a reviewed, schema-valid, hash-bound source artifact. Only the version
present in the checked-out Git commit can cross a clone boundary.

Host-local volatile capsules remain under:

```text
md-os/ops/warm_start/current.json
md-os/ops/warm_start/current.md
```

Private folder-carried conversation continuity lives at:

```text
md-os/ops/local/cortex/conversation.ndjson
```

It is a hash-chained sequence of human inputs and final assistant responses.
It excludes hidden reasoning, tool traces, model ids, and Codex thread ids. A
physical copy of the repository folder carries it, but Git ignores it, so a
commit, push, or clone does not transfer it.

Crash recovery checkpoints live under:

```text
md-os/ops/warm_start/checkpoints/
md-os/ops/warm_start/recovery_journal.ndjson
```

Cortex implements portable capsule validation and prompt injection. The full
host-local checkpoint and recovery command surface remains incomplete and must
not be treated as available runtime behavior.

## Boot Order

Warm Start is read only after stable identity, core state, and conceptual cold
boot summary:

```text
AGENTS.md
-> ME.md
-> md-os/kb/COGNITIVE_BOOTSTRAP.md
-> md-os/ops/core/agentic_core.md
-> md-os/ops/summary/conceptual_boot_summary.md
-> md-os/continuity/portable_state.json if its hashes verify
-> bounded recent private conversation tail if its hash chain verifies
-> md-os/ops/warm_start/current.md if present
```

The capsule imports as working context:

```text
canonical = false
import_mode = working_context
```

Therefore it can orient the next action, but it cannot override identity,
permission, connector capability, claim status, replay, or generated readback.
The current human request always wins over the portable capsule.

If the self-hash, an identity-source hash, or an evidence hash fails, Cortex
rejects the entire portable capsule. It does not partially import it or fall
back to a chat transcript.

## Relation To Conceptual Cold Boot

Conceptual Cold Boot is deterministic and rebuildable from repository state.

Portable Warm Start is reviewed recent context committed with repository
state. Local Warm Start is volatile context and must be validated against that
repository state before action.

```text
Conceptual Cold Boot = what the repository currently means
Portable Warm Start = reviewed operational handoff in the current commit
Local Warm Start = what this host's last session was doing
```

Codex provider history is optional host data. A normal Cortex process starts a
fresh Codex thread and does not search that provider history. When a verified
private folder chronology is present, the fresh thread receives its bounded
recent tail. `/resume` explicitly opts into the latest matching provider-stored
conversation; `/new` returns to a fresh thread and can again hydrate from the
private folder chronology.

Hydration necessarily sends the selected excerpt to the configured model
provider. GitHub exclusion is therefore not the same as fully offline privacy.

## Non-Claims

Warm Start does not claim consciousness, subjective continuity, resurrection,
or identity transfer. It transfers bounded operational context. It also cannot
reconstruct uncommitted work after a clone: that requires a reviewed commit or
another explicitly authorized transfer channel.
