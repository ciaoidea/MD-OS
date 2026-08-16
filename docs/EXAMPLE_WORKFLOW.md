# Example Workflow

This walkthrough shows the full loop from human intent to rebuilt runtime state.

It uses the existing `demo_general_system` project.

## Goal

Capture a new operational task:

```text
Document how a host runtime should use MD-OS (Artificial Prefrontal Cortex) v5.0.
```

## Step 1: inspect current state

```bash
sed -n '1,160p' md-os/ops/global_index.md
sed -n '1,160p' md-os/ops/projects/demo_general_system/status.md
```

This tells you which projects exist and how many open items are already known.

## Step 2: register a manual signal

```bash
node md-os/os/register_manual_signal.js demo_general_system "Document how a host runtime should use MD-OS (Artificial Prefrontal Cortex) v5.0"
```

This appends a signal to:

```text
md-os/ops/sources/manual/demo_general_system.json
```

The source signal is raw input. It is not yet the compiled project state.

## Step 3: rebuild the project

```bash
node md-os/os/build_project_state.js demo_general_system
```

This reads matching source snapshots from `md-os/ops/sources/` and rebuilds:

```text
md-os/ops/projects/demo_general_system/work_items.ndjson
md-os/ops/projects/demo_general_system/status.json
md-os/ops/projects/demo_general_system/status.md
md-os/ops/projects/demo_general_system/agenda.json
md-os/ops/projects/demo_general_system/agenda.md
md-os/ops/projects/demo_general_system/relations.json
md-os/ops/projects/demo_general_system/relations.md
md-os/ops/projects/demo_general_system/priority_queue.json
md-os/ops/projects/demo_general_system/priority_queue.md
md-os/ops/projects/demo_general_system/active_memory.json
md-os/ops/projects/demo_general_system/active_memory.md
```

## Step 4: rebuild global views

```bash
node md-os/os/build_global_agenda.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_global_index.js
node md-os/os/build_system_hygiene_status.js
```

These files now reflect the new project state:

```text
md-os/ops/agenda/global_agenda.md
md-os/ops/global_index.md
md-os/ops/system_hygiene_status.md
```

## Step 5: inspect the result

```bash
sed -n '1,220p' md-os/ops/projects/demo_general_system/work_items.ndjson
sed -n '1,160p' md-os/ops/projects/demo_general_system/agenda.md
sed -n '1,160p' md-os/ops/agenda/global_agenda.md
```

The new signal should now appear as a work item and agenda entry.

## What happened

```text
human sentence
  -> manual source snapshot
  -> project builder
  -> work item
  -> project agenda
  -> global agenda
  -> resumable runtime state
```

This is the base operating loop for the system.

## Replay the state

After rebuilding, verify that compiled state can be reconstructed:

```bash
mdos replay
```

or:

```bash
npm run replay
```

Replay preserves source snapshots and project definitions, removes known
compiled outputs, runs the builders again, and reports whether the replay
fingerprint matched the previous compiled state.

## Same loop with a connector

A connector replaces the manual signal step.

Example:

```bash
node md-os/os/terminal_connector.js list
node md-os/os/terminal_connector.js run demo_general_system node_version
node md-os/os/build_project_state.js demo_general_system
node md-os/os/build_global_agenda.js
```

The connector writes a normalized snapshot to:

```text
md-os/ops/sources/connectors/
```

The builder treats that snapshot like any other source.

## Host runtime version of the workflow

If Codex or another CLI is operating the repo, the host should do the same thing:

1. Read current state.
2. Convert the user's request into a bounded file or script action.
3. Run the relevant builder.
4. Inspect generated state.
5. Explain the result.

The host should not keep the important result only in chat memory. The result
should be reflected in `md-os/`.
