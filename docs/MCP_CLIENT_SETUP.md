# MCP Client Setup

MD-OS (Artificial Prefrontal Cortex) v5.0 includes a stdio Model Context Protocol adapter:

```bash
node md-os/os/mcp_server.js
```

The adapter is tested at the JSON-RPC stdio level by the local `node:test`
suite. Individual host applications can add their own config details and
permission behavior, so verify each host before claiming full support for that
host.

## Generic Host Config

From a checked-out or scaffolded MD-OS (Artificial Prefrontal Cortex) v5.0 workspace, configure the host to
run:

```json
{
  "mcpServers": {
    "md-os-apfc": {
      "command": "node",
      "args": ["md-os/os/mcp_server.js"],
      "cwd": "/absolute/path/to/my-agent-os"
    }
  }
}
```

Some hosts do not support `cwd`. In that case, use an absolute script path:

```json
{
  "mcpServers": {
    "md-os-apfc": {
      "command": "node",
      "args": ["/absolute/path/to/my-agent-os/md-os/os/mcp_server.js"]
    }
  }
}
```

These absolute paths belong to the external host configuration, not to the
portable MD-OS workspace state. If you move the workspace, update the host
configuration or launch the adapter from inside the moved workspace so the
runtime can resolve `md-os/` relative to the current directory.

## Verify The Server First

Before wiring a host, verify the server locally:

```bash
npm run mcp:server:list-tools
node md-os/os/mcp_server.js --list-resources
```

Expected tool names include:

```text
mdos_replay
mdos_compile_programs
mdos_archive_runtime_state
mdos_hardware_bootstrap
mdos_hardware_clean
mdos_hardware_control
mdos_software_bootstrap
mdos_software_clean
mdos_propose_change
mdos_register_signal
mdos_build_project
mdos_connector_list
mdos_terminal_run
mdos_api_run
```

## Host Verification Checklist

For each client such as Claude Desktop, Cursor, Continue, or another
MCP-compatible host, verify:

- the host can start `node md-os/os/mcp_server.js`
- `resources/list` shows `mdos://ops/global-index`
- `resources/read` can read `mdos://ops/state`
- `tools/list` shows the `mdos_*` tools
- `mdos_connector_list` returns the connector registry
- `mdos_register_signal` can create a source signal in a disposable demo
  workspace
- `mdos_replay` returns `matched_before: true` after the first stable replay

## Safe Claim Language

Use this before host-by-host verification:

```text
MCP-compatible adapter included.
Tested stdio JSON-RPC server.
Host-specific setup guides in progress.
```

Use stronger host-specific claims only after testing that host directly.
