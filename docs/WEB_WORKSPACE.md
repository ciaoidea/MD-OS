# Local Notes Canvas

The local notes canvas is a WYSIWYG scratchpad opened from the running Cortex
REPL. Cortex remains the conversational command surface; `/notes` opens the
visual document beside it:

- human edits synchronize in the background; the floppy icon separately writes
  a portable notes file
- document-tool edits are broadcast immediately to the same open canvas
- locally dirty blocks survive a concurrent document revision and resynchronize
- no web conversation pane is started; the AI process starts only after a human
  presses the AI icon

Start Cortex from the repository root:

```bash
./cortex
```

At the Cortex prompt, launch the shared notes canvas directly:

```text
/notes
```

The command starts `http://127.0.0.1:4173`. If a notes server is already
running, `/notes` restarts it and waits for the replacement process to become
ready, so the browser always reaches the current server code. It then opens the
workspace when a desktop session is available and immediately returns control
to the Cortex prompt. It also prints one or more `CORTEX NOTES BOOX` URLs for private
IPv4 interfaces. Copy the plain Wi-Fi URL into the Boox browser. LAN access is
intentionally unauthenticated, so anyone who can reach the port can use the
editor.

Use `/notes status` to print the local and Boox links without restarting the
server. `/notes stop` stops the process. The lifecycle controls used by Cortex
accept requests only from loopback; they cannot be invoked from the Boox or
another LAN client. The LAN transport is plain HTTP: use it only on a trusted
Wi-Fi and do not expose or forward the port to the Internet.

A different loopback port can be selected before starting Cortex:

```bash
MDOS_NOTES_PORT=4317 ./cortex
```

Then enter `/notes`. To force loopback-only operation instead:

```bash
MDOS_NOTES_LAN=0 ./cortex
```

## Visual document behavior

The canvas edits rendered content directly. The normal surface does not expose
LaTeX source as the document body.

It supports:

- formatted rich text
- rich HTML paste after sanitization
- pasted or selected PNG, JPEG, GIF, and WebP images
- editable tables
- rendered LaTeX formulas through MathML
- one shared `Whiteboard` for handwriting with a stylus, touch, or mouse
- compact graphic controls for formatting, insertion, deletion, and PDF export, with readable tooltips and accessible labels
- compact floppy, open-file, new-file, and AI icons at the left of the same
  wrapping toolbar
- vector pen and eraser strokes, pen pressure when exposed by the browser, color, undo, and clear controls
- in-memory streaming previews across simultaneous browser and Boox sessions while the pen is moving
- idempotent batched commits for completed strokes, with bounded quiet retry and an optional refresh control
- one compact icon-control row above the document, kept together at the left rather than overlapping the canvas
- shared vertical resizing from 600 to 3000 logical pixels through contraction, expansion, default-height icons, or the lower drag handle
- insertion at the page marker selected before choosing Text, Table, Formula, Image, or Whiteboard
- live background synchronization with optimistic revision checks for ordinary document edits
- HTML, TeX, and PDF export

The floppy icon writes a portable `.mdos-notes.json` file that follows
`md-os/schemas/visual_document.schema.json`. Background synchronization and
portable file saving are separate: synchronization keeps the shared live
`notes` document current, while the floppy creates a file at a location chosen
by the human. Opening another notes file or creating a clean file first invokes
that portable save. If the save chooser is cancelled or the write fails, the
current canvas is not replaced or cleared. Imported files are size-bounded and
validated by the document runtime before their blocks become authoritative.

The AI icon handles both ordinary written text and handwriting. It submits only
the selected/latest meaningful text block, or a temporary crop around the most
recent Whiteboard strokes. The crop is not added to the document file: durable
Whiteboard content remains vector strokes plus a bounded text annotation. The
AI must answer in at most 240 characters and can only read the document and
apply one bounded document edit. A normal correction replaces the target block;
otherwise a short rich-text block is inserted below it. A Whiteboard answer is
drawn as a short blue calligraphic annotation near the questioned handwriting.
There is no continuous or automatic AI loop.

On the Boox, click the intended vertical position in the document, select
`Whiteboard` from the toolbar, and write directly in the white area with the
pen. During handwriting, short bounded segments travel through the existing SSE
channel and remain in memory; they do not touch the document file. Each completed
stroke is appended as vector points to the single shared board with a stable ID,
and nearby completed operations share one durable commit. If the connection
drops, the client keeps the operations and retries silently with increasing
delays; refresh forces the pending batch immediately. Other open sessions receive
the same strokes without replacing their own concurrent work. Reopening the notes
restores the editable vector drawing. Dragging the lower handle previews height
changes locally in 50-pixel steps and enqueues one absolute resize operation on
release, avoiding a write for every pointer movement. The chosen height is also
restored and synchronized across sessions. No PNG copy is stored.

The synchronized document remains host-local under
`md-os/ops/local/documents/<document_id>/document.json`. They are runtime
state, not portable canonical knowledge, and must never be committed or
published to GitHub. Portable files are written only through the browser's
save/download action and may contain private notes; keep them outside the
repository unless they have been deliberately sanitized for publication.

## Runtime mechanism

`md-os/os/web_workspace_server.js` serves only the document editor. Cortex and
its REPL continue running in the terminal where `/notes` was entered. The
browser calls the bounded `mdos_document_*` operations through the local
server; document updates are broadcast through server-sent events. Loopback
requests remain local. Requests arriving through another interface are accepted
without a credential. The canvas merges remote blocks without overwriting a
block the human is currently changing.
Revision-conflict readback and polling remain recovery paths.

The notes process uses:

- repository read-only sandboxing for the on-demand AI turn
- only `mdos_document_read` and `mdos_document_apply` as AI tools
- no tool network access or runtime permission expansion
- unauthenticated LAN access by default
- `MDOS_NOTES_LAN=0` for loopback-only binding
- document sanitization and revision conflict checks

Pressing AI sends the bounded target text, or the temporary handwriting crop,
to the configured Codex model service. On the default unauthenticated LAN
listener, anyone who can reach the port can press AI, consume model usage, and
change the shared notes document. Use only trusted Wi-Fi, or set
`MDOS_NOTES_LAN=0` for loopback-only use.

The MCP adapter exposes the same document operations and visual resource to
external MCP-compatible hosts. The compact AI action is currently executed by
the local `/notes` workspace. Neither the adapter nor `/notes` publishes a
document: document bodies and exports remain ignored host-local runtime state.

## Verification

Focused verification:

```bash
node --test test/web_workspace_server.test.js test/document_runtime.test.js
```

Repository verification follows the normal `npm run check`, `npm test`,
`npm run build:all`, and replay path.
