# MCP Connector Model

Terminology guardrail:

```text
md-os/ path != MCP protocol
MCP adapter != all connectors
connector != operating boundary
```

Canonical disambiguation:

```text
md-os/kb/MCP_BOUNDARY_TERMINOLOGY_MODEL.md
```

`md-os/` is the active operational boundary.

Inside the boundary:
- `md-os/kb/` defines the stable operating method
- `md-os/os/` contains deterministic builders and helpers
- `md-os/ops/` stores persistent runtime state

Connectors are intentionally generic OS device adapters:
- they read or write through bounded adapters
- they normalize external observations into snapshots
- they do not bypass runtime state

This means the architecture can target any substrate without changing the core
operating model. APIs are one substrate, not the boundary of the system.
