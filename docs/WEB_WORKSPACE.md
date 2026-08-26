# Local Notes Canvas

The local notes canvas is a WYSIWYG scratchpad opened from the running Cortex
REPL. Cortex remains the conversational command surface; `/notes` opens the
visual document beside it:

- human edits synchronize in the background without a Save action
- document-tool edits are broadcast immediately to the same open canvas
- locally dirty blocks survive a concurrent document revision and resynchronize
- no web conversation pane or autonomous model process is started

Start Cortex from the repository root:

```bash
./cortex
```

At the Cortex prompt, launch the shared notes canvas directly:

```text
/notes
```

The command starts or reuses `http://127.0.0.1:4173`, opens it in the browser
when a desktop session is available, and immediately returns control to the
Cortex prompt. Use `/notes status` to inspect it and `/notes stop` to stop the
process owned by the current Cortex session.

A different loopback port can be selected before starting Cortex:

```bash
MDOS_NOTES_PORT=4317 ./cortex
```

Then enter `/notes`. The listener remains loopback-only.

## Visual document behavior

The canvas edits rendered content directly. The normal surface does not expose
LaTeX source as the document body.

It supports:

- formatted rich text
- rich HTML paste after sanitization
- pasted or selected PNG, JPEG, GIF, and WebP images
- editable tables
- rendered LaTeX formulas through MathML
- live background synchronization with optimistic revision checks
- HTML, TeX, and PDF export

Documents remain host-local under
`md-os/ops/local/documents/<document_id>/document.json`. They are runtime
state, not portable canonical knowledge.

## Runtime mechanism

`md-os/os/web_workspace_server.js` serves only the document editor. Cortex and
its REPL continue running in the terminal where `/notes` was entered. The
browser calls the bounded `mdos_document_*` operations through the loopback
server; document updates are broadcast through server-sent events. The canvas
merges remote blocks without overwriting a block the human is currently
changing. Revision-conflict readback and polling remain recovery paths.

The notes process uses:

- workspace-write sandboxing
- no runtime permission expansion
- loopback HTTP by default
- document sanitization and revision conflict checks

The MCP adapter exposes the same document operations and visual resource to
external MCP-compatible hosts. Neither the adapter nor `/notes` publishes a
document: document bodies and exports remain ignored host-local runtime state.

## Verification

Focused verification:

```bash
node --test test/web_workspace_server.test.js test/document_runtime.test.js
```

Repository verification follows the normal `npm run check`, `npm test`,
`npm run build:all`, and replay path.
