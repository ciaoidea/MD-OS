# Procedure discovery and reuse

Cortex discovers maintained procedures before an operational model turn. This
corrects a gap where conversation retrieval and linked TaskSpecs could hide an
existing, unlinked manual or candidate skill. It does not promote source material,
grant permissions, or establish that an operation succeeded.

## Sources and discovery

`md-os/os/procedure_memory.py` derives an in-memory catalog from:

- `md-os/ops/skills/{candidates,promoted}/*.json` with a skill ID and procedure;
- `md-os/ops/sources/manual/*.md`;
- working patterns in the APFC anchor memory;
- explicit documents in `md-os/procedures/registry.json` and the private overlay
  `md-os/ops/local/cortex/procedure_registry.json`.

Both registries use `procedure_registry.schema.json`. An entry references an
existing Markdown or JSON source and can supply a title, description, aliases,
and operation definitions. Private sources must be registered in the private
overlay. Discovery never recursively scans private folders or conversation logs.
It works even when chronology is missing or invalid. Source references inside a
procedure are pointers for further review; reading the parent does not prove
those referenced instructions were reviewed.

Search uses the requested service and operation, without requiring the word
“procedure”. It is lexical retrieval, so aliases matter and a no-match result is
not proof that no procedure exists. At most three cards are returned by default;
additional pages require the returned catalog hash. A changed catalog invalidates
the cursor. Unavailable, malformed, oversized or escaping sources produce an
explicit partial result rather than silent absence. Limits are 1,024 documents,
256 KiB per document and 16 MiB total; no generated catalog requires rebuilding.

Inspect locally without a model call:

```sh
./cortex procedure search "Aster status" --json
./cortex procedure read --id proc_ID --source-hash SHA256 --json
```

Use the actual ID and hash returned by search. `--offset` continues a read;
search pagination also needs `--catalog-hash`.

## Native conversation

New threads register `mdos_procedure` with actions `search`, `read`, `select` and
`status`, plus `dismiss` for reviewed sources that do not fit. Relevant source cards, bounded to 2 KiB, are prepared before the model
chooses its first tool. Full documents remain on-demand reads. Ordinary unrelated
conversation receives no procedure cards.

Selection requires all pages of the current source to have been delivered through
this tool, an operation, and an applicability explanation. Changed source content,
changed operational metadata, a different workspace, or a changed request
invalidates prior review. Steering keeps the original task scope and audit events,
clears selection, and requires renewed review. A fully reviewed but inapplicable source can be dismissed with a concrete reason.
When all currently suggested cards are dismissed and the catalog is complete,
the gate permits authorized exploration. This is an applicability assessment,
not proof that no applicable procedure exists among lower-ranked results.
Source/definition or request changes invalidate dismissals. Selection includes a
`procedure_binding` for a TaskSpec that reuses that source.

Operation definitions can distinguish read, prepare and write effects, record
verification status and evidence references, and require bounded file-existence
or SHA-256 state guards. A read operation's recorded evidence does not verify a
write operation. Existing unstructured sources remain usable, with operation
evidence explicitly `unspecified`. Neither a recorded `verified` label nor an
applicability explanation independently proves semantic correctness.

The native gate checks command/file approval requests that the host sends to
Cortex, after existing authorization checks. It permits recognized discovery,
requires current source review when relevant candidates exist, and refuses an
incomplete catalog for operational approvals. A preparation rejection is explained
to the model; an actual user or host denial remains binding. External MCP tools
and commands that do not request approval are observed, not universally intercepted.
The private turn receipt states this coverage explicitly. Source review is separate
from authorization, connector results and independent outcome verification.

The installed App Server protocol registers dynamic tools at `thread/start`, not
`thread/resume`. A private, workspace-bound registration marker allows current
threads to resume. Older threads, or threads copied to another workspace, require
`/new`; Cortex reports this rather than silently resuming without the interface.
Provider history is preserved. Running console processes load new code on restart.

## Registered execution

A TaskSpec may include the exact `procedure_binding` returned by selection:
`procedure_id`, `source_hash`, `definition_hash`, `operation`, `workspace_hash`.
The compiler checks it and binds the source hash and definition. The
executor rechecks source, definition and declared conditions before every action.
A change between actions stops the next action and produces a blocked receipt.
Closure and later outcome readback recheck source and definition freshness,
including explicitly registered private sources, without reapplying consumed
preconditions as postconditions.
Existing registered tasks without a procedure binding retain their current rules.
A binding establishes source freshness and declared conditions; it is not a
mandatory capability token for every host tool or proof of the model's understanding.

The result remains subject to the existing independent verifier. A selection,
successful command exit, or final model answer cannot replace verification.

## Regression evidence and privacy

`test_procedure_memory.py` covers natural discovery, corrupt chronology, paging,
source/metadata/request/workspace invalidation, malformed catalogs, tool binding,
legacy-thread refusal and private receipt coverage. `guarded_procedure.test.js`
executes a real two-action fixture and checks that changing a procedure condition
prevents the second action. All fixture names and data are synthetic.

Private overlays, thread markers and turn receipts stay under the Git-ignored
`md-os/ops/local/` boundary. Publish only runtime code, schemas, documentation and
synthetic tests after inspecting staged content. No migration promotes existing
skills or rewrites chronology, identity or business records.
