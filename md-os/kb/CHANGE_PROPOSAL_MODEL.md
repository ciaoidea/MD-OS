# Change Proposal Model

MD-OS avoids contested concurrent edits by treating risky runtime mutations as
append-only proposals.

The default rule is:

```text
if a human or agent may be editing the same runtime file,
do not overwrite it directly;
register a change proposal.
```

Command:

```bash
mdos propose-change <target_path> <summary>
```

Canonical storage:

```text
md-os/ops/changes/proposals.ndjson
md-os/ops/changes/proposals/<change_id>.json
```

Each proposal records:

```json
{
  "schema_version": 1,
  "change_id": "chg_x",
  "status": "proposed",
  "target_path": "md-os/ops/continuity.md",
  "target_sha256": "...",
  "summary": "...",
  "writer_id": "human",
  "created_at": "...",
  "conflict_policy": "do_not_mutate_target_without_review"
}
```

The target path must stay inside the `md-os/` boundary. This keeps MD-OS aligned
with its active operational scope and prevents a connector or host agent from
turning a proposal mechanism into general workspace mutation.

This is not a merge engine. It is the first concurrency primitive:

```text
direct write for deterministic builders
append-only proposal for ambiguous edits
human or policy review before application
```

