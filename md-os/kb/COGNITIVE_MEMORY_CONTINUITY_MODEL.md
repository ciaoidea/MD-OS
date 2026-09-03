# Cognitive Memory and Continuity Model

## Status

This document specifies the operational memory model used by the AGI capability
laboratory. It is a falsifiable engineering model inspired by computational
neuroscience. It is not a biological simulation and does not establish
consciousness, personhood, or AGI by itself.

## Why memory is a cognitive gate

A system that solves each task from a blank state can display strong local
reasoning without accumulating competence. General cognition requires at least:

```text
experience encoding
-> persistence across interruptions
-> selective retrieval
-> consolidation into reusable structure
-> resistance to interference
-> measurable improvement on later tasks
```

The complementary-learning-systems account motivates a division between a fast
store for individual episodes and a slower system that integrates regularities
across episodes. Replay provides a mechanism for reactivating prior experience
during consolidation. Work on hippocampal representational differentiation
shows why overlapping memories must also be separated enough to reduce later
interference.

These principles are used as design constraints, not as claims of neural
fidelity.

## Memory layers

### 1. Episodic memory

Each independently verified episode records:

```text
task digest
public structural features
public semantic domain
attempted strategies
verified outcome
surprise
process session
ledger predecessor hash
```

The replay buffer is bounded and ordered by surprise. Hidden answers, oracle
strategy labels, evaluator-only structural-family labels, and generator seeds
are excluded from the learner state.

### 2. Semantic memory

A strategy policy is consolidated only when evidence satisfies all of these
conditions:

```text
support >= 3 verified episodes
semantic domains >= 2
empirical confidence >= 0.75
same public structural track
```

The promoted policy stores the strategy, support, domain count, confidence, and
an evidence digest. It does not store hidden answers.

### 3. Continuity state

Continuity is represented by:

```text
append-only hash-chain ledger
atomic snapshot
previous-snapshot recovery copy
checkpoint reload count
successful resumption count
corruption recovery count
causal reuse count
```

A process restart is not counted as continuity unless the reloaded memory digest
matches the prior checkpoint or a declared corruption is recovered from the
previous valid snapshot.

## Filesystem-carried operational identity continuity

Learning-memory continuity and operational identity continuity are related but
different tests. The learning gate above asks whether retained memory improves
later performance. Identity portability asks whether a fresh execution host can
reconstruct the same recorded operational agent state without depending on a
provider-side chat thread.

For MD-OS, the physical carrier is the workspace directory:

```text
canonical identity, governance, and knowledge sources
+ reviewed hash-bound portable operational state
+ reconstructible operational artifacts
+ Git-ignored hash-chained private conversation chronology
= recorded operational identity-continuity carrier
```

When all of those files are copied and their declared bindings verify, a fresh
Cortex process can resume the same recorded identity, constraints, working
context, and bounded query-relevant conversation. This is an architectural result:
identity and continuity are externalized into inspectable files and are not
owned by the current model process or its provider thread.

At each Cortex turn, the verified chronology is projected into the local,
Git-ignored `cognitive_memory.sqlite3` index together with APFCG and the
semantic knowledge graph. FTS finds older episodes relevant to the current
request, sparse typed factors preserve the selected cross-domain links, and a
12 KiB maximum pack enters the APFC context. If no semantic match exists on a
fresh thread, Cortex falls back to the verified recent tail. The database is
derived and disposable: deleting it removes the accelerator, not the source
memory, and the next turn rebuilds it from verified files.

The word `same` is deliberately bounded. It means equivalent verified
operational state at boot, not numerical identity of a running process. Model
weights, hidden activations, RAM, unrecorded history, credentials, installed
software, clocks, network services, and physical device state are outside the
carrier. Copied host-local observations must be treated as observations of the
source host until replaced by current target-host readback.

Git and physical copies have different semantics. A clean clone carries the
canonical identity and the reviewed `md-os/continuity/portable_state.json`, but
Git intentionally omits `md-os/ops/local/cortex/conversation.ndjson`. A
physical folder copy carries both when ignored files are included. The current
automated discriminator verifies that only the physical-copy path recovers a
private canary in a fresh process and thread. A real migration to a separately
provisioned second machine or device remains necessary to close the strongest
cross-device portability claim.

## Causal memory test

Persistence alone earns no cognitive credit. The laboratory compares:

```text
same strategy engine + learned memory
against
same strategy engine + learned state removed
```

The attempt budget, task set, verifier, and execution engine are identical.
Memory is considered effective only when:

```text
memory_on_success_rate - memory_off_success_rate >= 0.10
```

A persisted-skill reuse is counted only after a checkpoint has been loaded and
when the learned first choice succeeds while the amnesic first choice fails.
Simply opening a stored file or entering a new process does not count.

## Interference and forgetting

The system measures retention on cumulative probes. It rejects a proposed
memory update when the update lowers replay performance. Required conditions:

```text
average forgetting <= 0.05
promoted regressions = 0
injected interfering update = rejected
rollback digest = verified
```

Structural tracks are derived only from public task features. This prevents the
curriculum and memory system from learning evaluator-owned labels.

## Cognitive continuity gate

The gate closes only when all are true:

```text
ledger chain valid
causal memory delta >= 0.10
at least 5 semantic policies consolidated
at least 2 successful checkpoint reloads
causal persisted-memory reuse > 0
average forgetting <= 0.05
interfering update rejected
```

External SAL 100 evidence adds stricter requirements:

```text
memory resumption success >= 0.95
checkpoint-corruption recovery >= 0.80
retention after interference >= 0.95
independent evaluator ownership of hidden tests
multi-hour or multi-day execution evidence
```

## Limitations

The current implementation uses symbolic task representations and a strategy
portfolio. It demonstrates controlled episodic-to-semantic consolidation and
causal value of persisted state inside the laboratory. It does not prove that a
foundation model has changed its internal weights, that memory generalizes to
all real domains, or that continuity persists indefinitely.

The packaged fast campaign proves resumability across processes and controlled
faults. It does not substitute accelerated cycles for an actual eight-hour or
multi-day run.

## Scientific references

- McClelland, McNaughton, and O'Reilly, "Why there are complementary learning
  systems in the hippocampus and neocortex," Psychological Review 102 (1995),
  419-457. DOI: 10.1037/0033-295X.102.3.419.
- O'Reilly et al., "Complementary learning systems," Cognitive Science 38
  (2014), 1229-1248. DOI: 10.1111/j.1551-6709.2011.01214.x.
- Favila, Chanales, and Kuhl, "Experience-dependent hippocampal pattern
  differentiation prevents interference during subsequent learning," Nature
  Communications 7, 11066 (2016). DOI: 10.1038/ncomms11066.
