# Semantic Operational Network Model

MD-OS (Artificial Prefrontal Cortex) v5.0 must operate as a coherent semantic-operational network, not as a
loose pile of Markdown notes.

The network is the working control plane formed by Markdown knowledge,
runtime state, lifecycle classes, epistemic statuses, deterministic builders,
connector contracts, journals, generated indexes, and replay evidence.

## Core Rule

Every nontrivial agentic action should be traceable through this chain:

```text
intent
-> semantic node
-> epistemic status
-> operating policy
-> allowed procedure
-> artifact or state transition
-> readback
-> replayable memory
```

If a step is missing, the action is not forbidden by default, but its status
must be downgraded to `open`, `conditional`, `local`, `draft`, or
`requires_review` until the missing step is supplied.

## Network Layers

The semantic operational network has five layers:

| Layer | Purpose | Canonical files |
| --- | --- | --- |
| Identity layer | Defines who is operating and under what non-claims. | `ME.md`, `AGENTS.md`, `md-os/kb/COGNITIVE_BOOTSTRAP.md`, `md-os/kb/AGENTIC_CORE_MODEL.md` |
| Semantic layer | Defines concepts, tasks, roles, relations, and action fields. | `md-os/kb/SEMANTIC_NEURAL_OVERLAY_MODEL.md`, `md-os/kb/NATURAL_LANGUAGE_PROGRAMMING_MODEL.md`, `md-os/kb/NATURAL_LANGUAGE_PROGRAMS.md` |
| Epistemic layer | Defines claim status, validation, demotion, and correction. | `md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md`, `md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md`, `md-os/kb/KNOWLEDGE_IMPORT_METHOD_MODEL.md` |
| Operational layer | Defines bounded procedures, runtime state, projects, connectors, and permissions. | `md-os/kb/OPERATIONS.md`, `md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md`, `md-os/kb/PERMISSION_MODEL.md`, `md-os/kb/CONNECTOR_CONTRACT.md` |
| Coherence layer | Defines graph connectivity, generated indexes, health, hygiene, replay, and self-release readback. | `md-os/kb/MARKDOWN_GRAPH_MODEL.md`, `md-os/kb/SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md`, `md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md`, `md-os/kb/GLOBAL_RUNTIME_INDEX.md`, `md-os/kb/SYSTEM_HYGIENE_MODEL.md`, `cortex replay` |

These layers must reinforce each other. A semantic proposal without epistemic
status is incomplete. An epistemic claim without an operating artifact is
unanchored. A connector action without policy is unsafe. A generated report
without replay or readback is weak evidence.

## Node Contract

A durable semantic-operational node should answer:

```text
What is this node?
Which layer owns it?
Which status does it carry?
What does it depend on?
Which procedure may update it?
Which artifact or readback proves the update?
What can demote or correct it?
```

Examples:

| Node | Required coherence |
| --- | --- |
| Knowledge model | linked from `md-os/kb/README.md`, referenced by operations when active, classified as source |
| Runtime state | classified by lifecycle, owned by a builder or host-local policy |
| Scientific claim | carries epistemic status, assumptions, validation method, and demotion rule |
| Connector action | registered connector, permission profile, side-effect statement, artifact, journal event |
| Generated index | deterministic builder, source hash, output path, journal event, replay coverage |

## Edge Contract

Edges must be explicit enough to support coherent action:

```text
depends_on
derives_from
updates
checks
permits
blocks
corrects
summarizes
replays
```

Markdown links provide human-visible edges. Generated graph edges provide
structural readback. Journal events and JSON relations provide machine-readable
operational edges.

Do not rely only on prose proximity. If a document participates in a stable
operation, link it to the closest canonical model.

## Epistemic-Semantic Coherence Gate

Before acting on a semantic proposal, MD-OS should check:

```text
1. Is the intent represented by a node or work item?
2. Is the node's lifecycle class clear?
3. If a claim is involved, is its epistemic status clear?
4. Is the relevant policy or permission model linked?
5. Is there an allowed builder, connector, or manual review path?
6. Will the action write an artifact, journal event, or generated state?
7. Can the result be read back from files rather than session memory?
8. Can replay confirm the stable operational result?
```

If answers are missing, MD-OS should prefer:

```text
proposal
classification
question
dry-run
read-only inspection
change proposal
```

over direct mutation.

## Strong Coherence Requirement

The core network is strongly coherent only when the following canonical nodes
are present and connected by the Markdown graph:

```text
ME.md
AGENTS.md
README.md
md-os/kb/README.md
md-os/kb/OPERATIONS.md
md-os/kb/AGENTIC_CORE_MODEL.md
md-os/kb/COGNITIVE_BOOTSTRAP.md
md-os/kb/SEMANTIC_OPERATIONAL_NETWORK_MODEL.md
md-os/kb/SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md
md-os/kb/SEMANTIC_NEURAL_OVERLAY_MODEL.md
md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md
md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md
md-os/kb/KNOWLEDGE_IMPORT_METHOD_MODEL.md
md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md
md-os/kb/MARKDOWN_GRAPH_MODEL.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
md-os/kb/PERMISSION_MODEL.md
md-os/kb/CONNECTOR_CONTRACT.md
md-os/kb/WORK_ITEM_STATE_MACHINE.md
md-os/ops/global_index.md
md-os/ops/health.md
md-os/ops/markdown_graph.md
md-os/ops/semantic_knowledge_graph.md
md-os/ops/semantic_knowledge_summary.md
md-os/ops/releases/self_release_index.md
md-os/ops/runtime_lifecycle_index.md
```

The Markdown graph builder should report whether these nodes are present and
structurally connected. Missing or isolated core nodes mean the semantic
operational network is not ready for strong coherent action.

## Operating Pattern

For ordinary work:

```text
read core -> classify intent -> locate node -> check lifecycle
-> check epistemic status when claims are involved
-> select policy/procedure -> act through builder or connector
-> write artifact/state -> rebuild indexes -> read back -> report
```

For scientific or claim-heavy work:

```text
claim -> epistemic lifecycle -> scientific validation method
-> assumptions -> derivation or evidence -> falsification/demotion rule
-> reproducibility artifact -> publication or audit status
```

For connector work:

```text
intent -> connector registry -> permission model -> dry-run/read-only when possible
-> bounded action -> artifact -> journal -> generated state -> readback
```

## Failure Modes

Avoid these failures:

```text
semantic action without lifecycle class
claim promotion without epistemic status
semantic node without epistemic profile
connector execution without permission profile
generated state treated as source
release jump without explicit self-release proposal and readback
source knowledge copied from imports without custody
Markdown graph disconnected from operating models
health status reported without reading generated state
session memory treated as durable state
```

## Relation To Other Models

This model binds:

- [SEMANTIC_NEURAL_OVERLAY_MODEL.md](SEMANTIC_NEURAL_OVERLAY_MODEL.md)
- [SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md](SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md)
- [EPISTEMIC_LIFECYCLE_MODEL.md](EPISTEMIC_LIFECYCLE_MODEL.md)
- [SCIENTIFIC_VALIDATION_METHOD_MODEL.md](SCIENTIFIC_VALIDATION_METHOD_MODEL.md)
- [KNOWLEDGE_IMPORT_METHOD_MODEL.md](KNOWLEDGE_IMPORT_METHOD_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
- [MARKDOWN_GRAPH_MODEL.md](MARKDOWN_GRAPH_MODEL.md)
- [RUNTIME_STATE_LIFECYCLE_MODEL.md](RUNTIME_STATE_LIFECYCLE_MODEL.md)
- [PERMISSION_MODEL.md](PERMISSION_MODEL.md)
- [CONNECTOR_CONTRACT.md](CONNECTOR_CONTRACT.md)
- [OPERATIONS.md](OPERATIONS.md)

It does not replace those models. It states how they must cohere so that
MD-OS can act as a stable agentic Operating Filesystem.
