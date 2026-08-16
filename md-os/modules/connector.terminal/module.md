# connector.terminal

Status: `experimental`

Kind: `connector`

Capability: `terminal.run_allowlisted`

This module declares the bounded terminal connector surface for the MD-OS modular kernel slice. The current implementation delegates to `md-os/os/terminal_connector.js` so existing behavior remains compatible while CLI and MCP routing can resolve the connector through the module registry.

## Policy Surface

- Requires explicit user intent.
- Requires an allowlist match.
- Runs with bounded workspace cwd, timeout, output limit, and readback.
- Writes connector observations and journal events under `md-os/ops/`.
