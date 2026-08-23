# Markdown Graph Model

MD-OS must be readable as files and navigable as a graph.

The Markdown graph is not decorative documentation. It is part of the Operating
Filesystem discipline: every Markdown file should have a clear structural
position in the filesystem and, where possible, explicit logical links to the
operating concepts it depends on.

## Problem

Obsidian and similar Markdown graph tools only understand real links:

```md
[Operations](OPERATIONS.md)
[[OPERATIONS]]
```

They do not treat a path inside code formatting as a graph edge:

```md
`md-os/kb/OPERATIONS.md`
```

This means a repository can contain a strong Markdown operating model while
still looking disconnected in Obsidian.

## Graph Requirements

Every Markdown file should be connected in two ways:

1. Structural links: where the file lives in the MD-OS filesystem hierarchy.
2. Logical links: which operating models, procedures, policies, runtime views,
   or source artifacts the file depends on.

Structural links are derived from the filesystem:

```text
root documents -> README.md
docs/** -> README.md and docs/ONBOARDING.md
md-os/kb/** -> md-os/kb/README.md
md-os/kb/hardware/** -> md-os/kb/hardware/README.md
md-os/kb/software/** -> md-os/kb/software/README.md
md-os/ops/** -> md-os/ops/global_index.md and lifecycle model
md-os/shell/** -> README.md and md-os/shell/MDOS_SHELL.md
md-os/examples/** -> README.md and runtime lifecycle model
```

Logical links are explicit Markdown links written inside the document.

For coherent agentic operation, the graph must also preserve the core
semantic-operational network described in
[SEMANTIC_OPERATIONAL_NETWORK_MODEL.md](SEMANTIC_OPERATIONAL_NETWORK_MODEL.md).
The graph builder should report whether the core identity, semantic,
epistemic, operational, and readback nodes are present and structurally
connected.

The structural graph feeds the semantic knowledge graph described in
[SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md](SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md), where
every Markdown node receives semantic, cognitive, epistemic, and actionability
metadata plus compact health readback.

The generated self-release index described in
[SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md) is also part
of the core readback network when version identity, migration, compatibility,
or agentic improvement jumps change.

## Deterministic Builder

The canonical graph builder is:

```bash
node md-os/os/build_markdown_graph.js
cortex graph build
```

It scans Markdown files in the workspace, similar to a bounded `find`, then
writes:

```text
md-os/ops/markdown_graph.json
md-os/ops/markdown_graph.md
```

The JSON output is the structured graph contract. The Markdown output is the
Obsidian-friendly graph entrypoint.

## Default Graphify Orientation Layer

Graphify is the default native graph orientation surface over the same
operating filesystem. It is directly integrated as the first-pass context
routing layer when a task benefits from graph navigation, token reduction, or
dynamic repository-map refresh.

It produces generated visualization and routing artifacts under `graphify-out/`
without replacing the canonical Markdown graph under `md-os/ops/`.

Because those artifacts are derived and may be question-specific, the
canonical Markdown and semantic graph builders exclude `graphify-out/**` from
their source scans. Linking generated Graphify reports back into the stable
knowledge graph would create a self-referential graph and make volatile
orientation output look like durable source knowledge.

```bash
cortex graphify bootstrap
cortex graphify build .
cortex graphify connector-map
cortex graphify neural-map
cortex graphify orient "agentic task scheduling and verification"
```

`cortex graphify orient <question>` reads three bounded maps before selecting
context:

- the structural Graphify graph
- the semantic neural node map
- the sanitized connector topology

For operating work, the connector topology links the request to relevant
connectors, drivers, schemas, package scripts, tests, and readback. This makes
knowledge navigation more deterministic than broad file search: the agent
first finds the right operating domain, then reads the minimum useful files.

Operationally, Graphify has two default roles:

- reduce token load by selecting bounded context before broad file reads
- evolve the graph dynamically through bounded local update builds as files,
  connectors, schemas, audit artifacts, and knowledge nodes change

The default refresh path is:

```bash
cortex graphify build .
```

The default orientation path is:

```bash
cortex graphify orient "<question>"
```

## Generated Graph Role

`md-os/ops/markdown_graph.md` intentionally links to every scanned Markdown file.
That gives Obsidian a generated hub even before every source document has been
manually improved with in-file `Related` sections.

This does not replace in-file links. It provides a rebuildable safety net and a
diagnostic view:

- files with no explicit Markdown links
- unresolved Markdown links
- structural anchors
- graph zones
- source/generated/local/demo/live file context
- core semantic-operational node coverage
- structural input for semantic knowledge graph compaction

## Operating Rule

When adding a new stable Markdown source file, prefer adding a short `Related`
section with real Markdown links to the closest operating models.

When adding a new canonical operating model, link it from
[README.md](README.md) or [md-os/kb/README.md](README.md), and link it back to
the closest semantic, epistemic, lifecycle, permission, or operations model.

Generated Markdown files do not need manual `Related` sections. Their graph
position should come from the builder that owns them.

## Non-Goal

The Markdown graph builder must not mutate arbitrary Markdown files by default.
It produces generated graph state. Directly editing every Markdown file would
make generated runtime state fragile and would mix source authorship with
derived indexing.
