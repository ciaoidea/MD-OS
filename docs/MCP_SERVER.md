# MCP Server

`md-os/os/mcp_server.js` is a thin Model Context Protocol adapter for MD-OS (Artificial Prefrontal Cortex) v5.0
MD-OS APFC.

It does not replace the filesystem kernel. It exposes the existing readable
state and bounded runtime commands to MCP-compatible hosts over stdio JSON-RPC.

## Run

```bash
npm run mcp:server
```

or:

```bash
node md-os/os/mcp_server.js
```

When installed through the package bin:

```bash
mdos mcp-server
```

## Host Configuration

Point an MCP-compatible host at the server command from the repository root:

```json
{
  "mcpServers": {
    "mdos": {
      "command": "node",
      "args": ["md-os/os/mcp_server.js"]
    }
  }
}
```

The server writes only JSON-RPC messages to stdout. Diagnostics and child-script
stderr are returned inside tool results or JSON-RPC errors.

See [MCP_CLIENT_SETUP.md](MCP_CLIENT_SETUP.md) for generic host configuration
and verification steps.

## Resources

The server exposes readable MD-OS (Artificial Prefrontal Cortex) v5.0 state as MCP resources when the
backing files exist:

```text
mdos://kb/operations
mdos://kb/natural-language-programming-model
mdos://kb/model-context-protocol-adapter
mdos://ops/state
mdos://ops/global-index
mdos://ops/global-agenda
mdos://ops/active-summary
mdos://ops/change-proposals
mdos://ops/hygiene
mdos://ops/connector-registry
mdos://ops/hardware-device-registry
mdos://ops/hardware-inventory
mdos://ops/software-registry
mdos://ops/software-applications
mdos://ops/software-services
mdos://ops/compiled-programs
mdos://projects/<project_id>/status
mdos://projects/<project_id>/agenda
mdos://projects/<project_id>/work-items
```

These are read-only views into the text-native control plane.

## Tools

The server exposes bounded tools that call the existing deterministic scripts:

```text
mdos_replay
mdos_compile_programs
mdos_archive_runtime_state
mdos_hardware_bootstrap
mdos_hardware_clean
mdos_hardware_control
mdos_software_bootstrap
mdos_software_clean
mdos_continuity_status
mdos_continuity_start
mdos_continuity_stop
mdos_propose_change
mdos_register_signal
mdos_build_project
mdos_connector_list
mdos_terminal_run
mdos_api_run
```

The terminal and API tools still use local allowlists and profiles in:

```text
md-os/ops/connectors/terminal_connector.json
md-os/ops/connectors/api_connector.json
```

The MCP adapter does not accept arbitrary shell commands or arbitrary URLs.

## Boundary

The adapter is deliberately outside the core operating model:

```text
MCP-compatible host
  -> md-os/os/mcp_server.js
  -> existing MD-OS (Artificial Prefrontal Cortex) v5.0 builders/connectors
  -> md-os/ops readable state
```

This keeps the repository honest: MD-OS APFC can be MCP-compatible without making
the kernel dependent on any one host protocol.
