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
cortex mcp-server
```

## Host Configuration

Point an MCP-compatible host at the server command from the repository root:

```json
{
  "mcpServers": {
    "cortex": {
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
ui://mdos/document-editor/v1.html
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

The `mdos://` resources are read-only views into the text-native control plane.
The `ui://` resource is a self-contained MCP Apps interface; it can call only
the bounded document tools declared below.

## Tools

The server exposes bounded tools that call the existing deterministic scripts:

```text
mdos_document_open
mdos_document_create
mdos_document_read
mdos_document_save
mdos_document_apply
mdos_document_render_math
mdos_document_export
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

## Visual Document Editor

`mdos_document_open` and `mdos_document_create` bind their result to
`ui://mdos/document-editor/v1.html`. An MCP Apps-capable host can therefore
show a fullscreen WYSIWYG canvas while leaving its normal chat composer
available. The user edits the rendered document, not LaTeX or HTML source.

The canvas supports:

- formatted rich text and rich clipboard paste
- editable HTML tables
- pasted or uploaded PNG, JPEG, GIF, and WebP images
- LaTeX formulas rendered to browser-native MathML
- a shared vector Whiteboard with bounded text annotations
- atomic autosave, revision-conflict detection, and assistant block edits
- portable JSON save, open, and new-file controls; open and new save first
- HTML, TeX, and PDF export; PDF uses XeLaTeX with shell escape disabled

Cancelling the portable save prevents Open or New from replacing the current
canvas. The compact AI icon is executed only by the local `/notes` workspace;
inside an external MCP Apps host it reports that boundary instead of starting a
second model turn.

Each authoritative document is stored locally at:

```text
md-os/ops/local/documents/<document_id>/document.json
md-os/ops/local/documents/<document_id>/exports/*
```

The storage is host-local and excluded from canonical or publishable state.
Portable `.mdos-notes.json` files are written through the browser and may
contain private notes; they are not repository artifacts.
Every block has a stable id. The visual client and assistant both save against
an expected revision, so a stale writer receives a conflict instead of silently
overwriting newer work. HTML, image data URIs, and LaTeX are validated before
they enter the stored document.

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
