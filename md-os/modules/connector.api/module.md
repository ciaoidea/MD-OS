# connector.api

Status: `experimental`

Kind: `connector`

Capability: `api.request_allowlisted`

This module declares the bounded API connector surface for the MD-OS modular kernel slice. The current implementation delegates to `md-os/os/api_connector.js` so existing behavior remains compatible while CLI and MCP routing can resolve the connector through the module registry.

## Policy Surface

- Requires explicit user intent.
- Requires an allowlisted request profile.
- Uses bounded timeout and response-body capture.
- Writes connector observations and journal events under `md-os/ops/`.
