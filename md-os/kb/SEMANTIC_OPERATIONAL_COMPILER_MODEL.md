# Semantic Operational Compiler Model

MD-OS compiles Markdown knowledge into runtime cognition, not only memory.

The compiler turns the repository graph into bounded operational indexes:

```text
Markdown vault
-> semantic index
-> claim graph
-> capability graph
-> link graph
-> context packs
-> epistemic health
-> eval readback
-> replayable state
```

Canonical command:

```bash
mdos compile-runtime
```

Equivalent direct builder:

```bash
node md-os/os/build_runtime_compiler.js
```

## Outputs

Generated runtime output lives under `md-os/ops/runtime/`:

```text
md-os/ops/runtime/semantic_operational_compiler.json
md-os/ops/runtime/semantic_index.json
md-os/ops/runtime/claim_index.json
md-os/ops/runtime/capability_index.json
md-os/ops/runtime/link_index.json
md-os/ops/runtime/context_packs/
md-os/ops/runtime/eval_results.json
md-os/ops/runtime/epistemic_health.json
md-os/ops/runtime/semantic_drift_report.md
```

These files are generated readback. Source remains in Markdown, schemas,
connectors, programs, project definitions, and other canonical source paths.

## Semantic Node Contract

Every compiled semantic node must expose:

```text
id
path
title
type
semantic_layer
cognitive_role
epistemic_status
concept_terms
actionability
depends_on
enables
tools
risks
tests
```

The node is incomplete if it cannot answer:

```text
what it is
what it says
what it enables
what can use it
what risk it opens
what readback or test closes it
```

## Claim Invariant

Every compiled claim must carry one bounded status:

```text
raw
hypothesis
working_model
validated
reproducible
deprecated
contradicted
```

Claims without status are compiler failures. Contradicted claims may remain in
the graph, but they must not silently drive action.

## Capability Invariant

Knowledge becomes operational only when it compiles into explicit capability
records:

```text
capability_id
capability_type
source_nodes
tools
file_targets
requires
risks
readback
rollback
tests
```

Capability types:

```text
informational
procedural
instrumental
regulatory
diagnostic
repair
identity-bearing
```

Medium or high risk capability records must include permission or approval
gates. Every capability must include readback.

## Context Compiler

The host should not load the whole repository when a compact task pack is
enough. The runtime compiler emits context packs for:

```text
bootstrap
operations
epistemic
semantic_task
import
runtime_health
```

Each pack contains selected nodes, claims, capabilities, and compact text for
bounded injection into the host runtime.

## Epistemic Health

The compiler must check for:

```text
claim duplicate
claim conflict
stale instruction marker
missing or broken Markdown link
unsafe operation
identity drift
semantic orphan
```

The output is:

```text
md-os/ops/runtime/epistemic_health.json
md-os/ops/runtime/semantic_drift_report.md
```

## Import Binding

Knowledge import remains the intake path. Runtime compilation is the promotion
readback path. After an import, the repository should rebuild:

```text
markdown graph
semantic graph
self-release index
runtime compiler
global index
health
replay
```

This is the stable distinction:

```text
knowledge import = custody and structured arrival
runtime compiler = operational cognition readback
```
