# Archive And Compaction Model

MD-OS keeps canonical project work items readable and replayable. Compaction
therefore starts as a materialized view, not as destructive deletion.

Command:

```bash
cortex compact
```

Equivalent command:

```bash
cortex archive
```

Builder:

```bash
node md-os/os/archive_runtime_state.js
```

Outputs:

```text
md-os/ops/summary/active_work_items.json
md-os/ops/summary/active_work_items.md
md-os/ops/archive/projects/<project_id>/terminal_work_items.ndjson
md-os/ops/archive/projects/<project_id>/terminal_summary.json
md-os/ops/archive/projects/<project_id>/terminal_summary.md
```

The active summary is the hot path for host agents with limited context:

```text
read active summary first
open project state only when needed
open raw source snapshots only when investigating
```

The archive view is non-destructive:

```text
canonical work_items.ndjson remains in place
terminal items are copied into archive views
replay can rebuild archive views from compiled project state
```

This addresses growth without hiding state in a database. A future policy may
allow sealed project archives, but the default runtime keeps replay and audit
simple.

## Stable Agentic Core

Project compaction is not enough for large sessions. A host also needs a small
stable core that preserves identity, objectives, ethics, operating principles,
and non-claims before it expands active work.

Builder:

```bash
node md-os/os/build_agentic_core.js
```

Outputs:

```text
md-os/ops/core/agentic_core.json
md-os/ops/core/agentic_core.md
```

This core is generated from `md-os/kb/AGENTIC_CORE_MODEL.md` and correlated with:

```text
ME.md
md-os/kb/AGENT_IDENTITY.md
md-os/kb/COGNITIVE_BOOTSTRAP.md
md-os/kb/OPERATIONS.md
md-os/kb/PERMISSION_MODEL.md
```

The read path for constrained context is therefore:

```text
agentic core
active work summary
global index
project details only when needed
raw sources only when investigating
```
