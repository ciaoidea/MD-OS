# Semantic Knowledge Graph Model

MD-OS (Artificial Prefrontal Cortex) v5.0 must preserve semantic coherence as the Markdown network grows.

The semantic knowledge graph is the generated readback that turns every
Markdown file into a profiled concept node. It complements the Markdown graph:
the Markdown graph checks structural connectivity, while the semantic knowledge
graph checks meaning, cognitive role, epistemic status, actionability, concept
terms, and concept relations.

## Core Rule

Every Markdown node must receive a semantic profile:

```text
Markdown node
-> semantic layer
-> node kind
-> cognitive role
-> epistemic status
-> actionability
-> concept terms
-> structural relation
-> compact readback
```

If a new Markdown file is added, the next semantic graph rebuild must classify
it the same way as the existing network. Growth is not allowed to remain an
unrelated pile of notes.

## Semantic-Epistemic Binding

Every semantic node must also be epistemic.

```text
semantic node without epistemic status = incomplete node
```

The graph must expose:

```text
epistemic_profiled_node_count
missing_epistemic_node_count
epistemic_profile_complete
```

If any Markdown node has semantic metadata but no epistemic status, the graph
must report a critical finding. Semantic classification alone is not enough for
MD-OS action.

## Growth Rule

New concepts are related automatically through two paths:

```text
Markdown links and structural edges
concept co-occurrence inside profiled Markdown nodes
```

The first path preserves deliberate human and structural relations. The second
path gives newly learned concepts an initial semantic adjacency even before a
human writes explicit links.

## Compaction Rule

The full graph may grow large. Health checks and bootstraps must prefer the
compact summary:

```text
md-os/ops/semantic_knowledge_summary.json
md-os/ops/semantic_knowledge_summary.md
```

The complete graph remains available at:

```text
md-os/ops/semantic_knowledge_graph.json
md-os/ops/semantic_knowledge_graph.md
```

Health must read the compact summary first so that coherence checking does not
require loading the full semantic graph during ordinary status inspection.

## Generated Outputs

Canonical builder:

```bash
node md-os/os/build_semantic_knowledge_graph.js
```

CLI entrypoint:

```bash
mdos semantic graph build
```

Generated readback:

```text
semantic graph = complete profiled node and edge graph
semantic summary = compact health and bootstrap surface
```

## Required Coverage

The graph is coherent only when:

```text
profiled_node_count == markdown_node_count
epistemic_profiled_node_count == markdown_node_count
unprofiled_node_count == 0
missing_epistemic_node_count == 0
semantic_profile_complete == true
epistemic_profile_complete == true
```

Disconnected nodes are attention findings. Incomplete profiles are critical
findings.

## Relation To Other Models

This model binds:

- [SEMANTIC_OPERATIONAL_NETWORK_MODEL.md](SEMANTIC_OPERATIONAL_NETWORK_MODEL.md)
- [SEMANTIC_NEURAL_OVERLAY_MODEL.md](SEMANTIC_NEURAL_OVERLAY_MODEL.md)
- [MARKDOWN_GRAPH_MODEL.md](MARKDOWN_GRAPH_MODEL.md)
- [EPISTEMIC_LIFECYCLE_MODEL.md](EPISTEMIC_LIFECYCLE_MODEL.md)
- [KNOWLEDGE_IMPORT_METHOD_MODEL.md](KNOWLEDGE_IMPORT_METHOD_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
- [RUNTIME_STATE_LIFECYCLE_MODEL.md](RUNTIME_STATE_LIFECYCLE_MODEL.md)
- [SYSTEM_HYGIENE_MODEL.md](SYSTEM_HYGIENE_MODEL.md)

The semantic knowledge graph is not the hidden reasoning of the model. It is a
filesystem readback that makes MD-OS semantic growth inspectable, compactable,
and correctable.
