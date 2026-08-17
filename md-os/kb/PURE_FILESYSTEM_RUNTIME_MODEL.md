# Pure Filesystem Runtime Model

This runtime deliberately avoids introducing a database as the source of truth.

The coordination model is:
- lock directories
- stale lock cleanup
- atomic `tmp + fsync + rename` writes
- protected append for journal-like files
- append-only change proposals for ambiguous concurrent edits
- materialized active summaries for low-context reads

The reason is epistemic as much as technical:
- state remains readable
- state remains diffable
- state remains correctable by humans
- state does not split into hidden and visible truth layers
- compiled state can be replayed from source snapshots, natural-language
  programs, project definitions, and deterministic builders

Direct deterministic builders may rewrite their known outputs. Human or agent
edits that could collide with another writer should use:

```bash
cortex propose-change <target_path> <summary>
```

Large histories should be read through:

```text
md-os/ops/summary/active_work_items.md
```

before expanding into project-level work item streams.
