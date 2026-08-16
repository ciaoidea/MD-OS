# MCP Boundary Terminology Model

MD-OS (Artificial Prefrontal Cortex) v5.0 uses `md-os/` as the only active operational boundary directory.
There is no `mcp/` filesystem alias in the complete migration state. MCP names
the external Model Context Protocol, not the repository boundary.

## Core Distinction

Use these terms precisely:

| Term | Meaning |
| --- | --- |
| `md-os/` | The active MD-OS operational boundary directory in this 5.0 repository. |
| `mcp/` | Not a valid filesystem boundary path in this release. |
| `MCP` | Model Context Protocol, an external host/tool/resource protocol. |
| MCP adapter | The protocol bridge exposed by `node md-os/os/mcp_server.js`. |
| Connector | A bounded substrate adapter for APIs, terminals, filesystems, devices, applications, queues, services, or protocols. |
| Connector registry | The live connector registry under `md-os/ops/connectors/`. |

The operating rule is:

```text
md-os/ path != MCP protocol
no mcp/ filesystem alias
MCP adapter != all connectors
connector != operating boundary
```

## No Alias Policy

Do not create a filesystem `mcp/` path or symlink for MD-OS runtime state.

Builders must write canonical paths under `md-os/`. Any literal `mcp/` path is
a stale migration artifact and should be corrected to `md-os/` unless it is
quoted as historical evidence.

## Naming Rule

When explaining the architecture, prefer:

```text
`md-os/` is the current MD-OS operating boundary directory.
```

Avoid saying:

```text
MD-OS is the MCP connector.
Everything under md-os/ is the Model Context Protocol layer.
The connector is md-os/.
```

For the protocol bridge, say:

```text
The MCP adapter exposes selected MD-OS files and bounded tools to MCP-compatible hosts.
```

For connectors, say:

```text
Connectors are bounded substrate adapters registered and audited inside the MD-OS operating boundary.
```

## Protocol Adapter Policy

The `mcp:server` npm script, `mdos mcp-server` command, and
`md-os/os/mcp_server.js` file keep the MCP name because they expose the Model
Context Protocol adapter. They do not authorize or imply an `mcp/` filesystem
boundary.

The release-level migration policy is maintained in:

```text
md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md
```
