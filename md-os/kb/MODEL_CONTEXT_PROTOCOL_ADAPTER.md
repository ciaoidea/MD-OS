# Model Context Protocol Adapter

MD-OS APFC can be exposed to MCP-compatible hosts through:

```bash
node md-os/os/mcp_server.js
```

This adapter is not the kernel. It is a bridge from the Model Context Protocol
into the existing text-native operating layer.

Terminology guardrail:

```text
md-os/ is the MD-OS operating boundary directory.
MCP is the external Model Context Protocol.
This file describes the protocol adapter, not the whole operating boundary.
```

Canonical disambiguation:

```text
md-os/kb/MCP_BOUNDARY_TERMINOLOGY_MODEL.md
```

## Responsibilities

The adapter may:

- expose readable `md-os/kb/` and `md-os/ops/` files as resources
- expose deterministic builders as bounded tools
- expose read-only hardware bootstrap and host-local hardware cleanup as
  bounded tools
- expose read-only software bootstrap and host-local software cleanup as
  bounded tools
- expose explicit hardware control intents as bounded tools when backed by a
  dedicated connector and host substrate
- expose the optional continuity service start/stop/status switch as bounded
  tools
- expose allowlisted terminal and API connector actions as bounded tools

The adapter must not:

- accept arbitrary shell commands
- accept arbitrary URLs
- bypass connector profiles
- replace canonical project state
- store hidden state outside the filesystem runtime

## Stable Direction

The internal `md-os/` directory remains the active operational boundary. External
MCP compatibility is useful because it lets more hosts operate the same control
plane, but the durable source of truth remains Markdown, JSON, NDJSON, and
deterministic scripts.
