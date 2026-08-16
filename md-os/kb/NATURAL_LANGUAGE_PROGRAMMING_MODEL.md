# Natural-Language Programming Model

MD-OS (Artificial Prefrontal Cortex) v5.0 is a Markdown-native Operating Filesystem for persistent AI
agents and robotic systems.

The paradigm is Operational Context as Filesystem: the agent's operating
context is externalized into readable, auditable, reconstructible, and
actionable files.

Natural language is part of the operating surface, but it is not left as
ephemeral prompt text. It is stabilized into files that can be inspected,
corrected, replayed, and used by different hosts.

In familiar LLM terms, MD-OS is a distributed, persistent prompt/control plane:
the prompt is spread across Markdown knowledge, natural-language programs,
runtime state, append-only memory, connector contracts, and deterministic
builders instead of living only inside one model context window.

The main program is distributed across:
- markdown knowledge
- markdown natural-language programs
- structured project state
- append-only journal data
- deterministic scripts
- connector snapshots

Natural language acts as:
- specification layer
- correction layer
- scheduling layer
- naming layer
- policy layer

Markdown behaves as high-level batch semantics:
- ordered procedures
- constraints
- naming rules
- dependency rules
- exception handling rules
- canonical next actions

Natural-language programs live under:

```text
md-os/ops/programs/
```

They compile into:

```text
md-os/ops/compiled/programs.json
md-os/ops/compiled/programs.md
```

The agent is therefore not only prompted. It is programmed through stable
textual artifacts that can be compiled, inspected, corrected, and replayed.

## Agentic Task Pipelines

Natural-language programs should decompose complex objectives into small
agentic tasks, following the compositional philosophy of UNIX:

```text
small bounded task -> verified file artifact -> small bounded task
```

Each task must expose a file-level contract for declared inputs, outputs,
permissions, budget, verification, and failure state. The natural-language
layer describes semantic intent and constraints; deterministic builders and
connectors implement repeatable mechanics. No stage may depend on private chat
context as its only input, and no unverified output may silently become the
next stage's truth.
