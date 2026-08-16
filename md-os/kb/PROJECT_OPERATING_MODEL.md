# Project Operating Model

Each project lives under `md-os/ops/projects/<project_id>/`.

Canonical files:
- `project.json`
- `work_items.ndjson`
- `status.json`
- `status.md`
- `agenda.json`
- `agenda.md`
- `relations.json`
- `relations.md`
- `priority_queue.json`
- `priority_queue.md`
- `active_memory.json`
- `active_memory.md`

Signals do not become truth directly. They are compiled into:
- work items
- agenda
- relations
- scheduler buckets
- active memory

Work items use the canonical state machine documented in
`WORK_ITEM_STATE_MACHINE.md`.

Terminal work items remain in `work_items.ndjson`, but
`archive_runtime_state.js` also emits non-destructive archive views under:

```text
md-os/ops/archive/projects/<project_id>/
```
