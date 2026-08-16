# Connectors

Connectors are bounded device adapters for MD-OS (Artificial Prefrontal Cortex) v5.0. They connect the
operating layer to an external substrate.

In the natural-language agentic substrate layer, connectors are the concrete
joint between natural-language intent and the host's real capabilities. MD-OS
does not directly become Linux, Windows, macOS, a driver stack, a desktop app,
or a robot controller. It routes explicit intent through registered connectors
that bind to those lower substrates.

A substrate can be an API, terminal, filesystem, browser, desktop application,
mailbox, calendar, agenda, planning board, queue, device, monitoring system,
ticketing system, or another source of operational signals.

APIs are not privileged in the connector model. They are preferred when they are
stable and expressive enough, but the runtime does not depend on API coverage.
The same snapshot and builder path applies when the useful surface is a shell
command, a file tree, a desktop app, a browser session, a queue, or a device.

For workplace onboarding, MCP resources and tools can expose the new hire's
already-authenticated work surface: mail, calendar, agenda, planning boards,
tickets, documents, folders, and internal applications. This lowers internal
technology integration cost because the company can bind existing tools through
bounded MCP connectors instead of building a bespoke API layer before MD-OS APFC
can assist the role. The authority remains the new hire's authorized session,
supervised by the new hire.

## Core rule

Connectors emit snapshots. Builders own canonical project state.

This means a connector should not directly decide project truth. It should
capture observations and write them into the normalized source format.

The connector boundary is the contract, not the transport. A connector may use
HTTP, local process execution, filesystem reads, UI automation, device I/O, or a
message queue, as long as the behavior is bounded and the output is inspectable.

The plain rule is: every operating intent needs a discovered substrate, a
registered connector, declared read/write capabilities, and an auditable output.

## Connector lifecycle

1. Declare the connector in `md-os/ops/connectors/connector_registry.json`.
2. Define any stable model guidance in `md-os/kb/`.
3. Implement bounded behavior in `md-os/os/` if code is required.
4. Emit snapshots into `md-os/ops/sources/connectors/`.
5. Run project and global builders.
6. Inspect the generated state.

## Snapshot format

The recommended source snapshot shape is:

```json
{
  "schema_version": 1,
  "connector_name": "example_connector",
  "connector_kind": "api",
  "project_id": "example_project",
  "captured_at": "2026-04-24T18:00:00Z",
  "signals": [
    {
      "source_id": "example_signal_001",
      "captured_at": "2026-04-24T18:00:00Z",
      "summary": "Example operational signal",
      "status_hint": "open",
      "priority": "high",
      "owner_hint": "Operator Name",
      "entities": ["entity_a"],
      "tags": ["generic"],
      "suspected_causes": ["unknown_state"],
      "depends_on": [],
      "next_step": "Investigate and normalize runtime state",
      "due_at": "2026-04-25T09:00:00Z",
      "external_parties": ["vendor_x"]
    }
  ]
}
```

Template:

```text
md-os/examples/connector_snapshot.template.json
```

## Registry entry

Connector registry entries live in:

```text
md-os/ops/connectors/connector_registry.json
```

Each entry should say:

- `connector_id`
- human-readable `name`
- connector `kind`
- `status`
- whether it is `implemented`
- `execution_mode`
- read capabilities
- write capabilities
- notes

Example kinds:

- `manual`
- `filesystem`
- `terminal`
- `api`
- `mathematics`
- `desktop`
- `application`
- `service`
- `browser`
- `queue`
- `device`
- `messaging`
- `monitoring`
- `ticketing`

## Adding a connector

1. Choose a stable connector ID, for example `github_issues`.
2. Add a registry entry.
3. Decide the execution mode:
   - `snapshot_only` for read-only/manual ingestion.
   - `bounded_exec` for explicit allowlisted execution.
   - `human_confirmed_write` for actions that require confirmation.
   - `read_write` for internal filesystem builders.
4. Create a script in `md-os/os/` if the connector needs code.
5. Make the script write snapshots to `md-os/ops/sources/connectors/`.
6. Add docs under `docs/` if humans need to operate it.
7. Rebuild:

```bash
node md-os/os/build_project_state.js <project_id>
node md-os/os/build_global_agenda.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_global_index.js
node md-os/os/build_system_hygiene_status.js
```

## Connector output rules

A connector snapshot should:

- identify the project with `project_id`
- use stable `source_id` values where possible
- include a short `summary`
- include a `next_step`
- mark priority and status with simple strings
- include relevant entities and tags
- preserve raw connector details inside an additional nested object if needed

The terminal connector uses `connector_runtime` for command metadata. Other
connectors may extend the same nested object with bounded substrate-specific
readback without changing the normalized snapshot contract.

## Safety rules

- Do not execute arbitrary user-provided shell strings.
- Do not store secrets in snapshots.
- Do not overwrite canonical project state directly.
- Do not bypass `md-os/ops/connectors/connector_registry.json`.
- Do not make connector behavior depend on hidden state.
- Do not perform destructive writes by default.

## Existing connector

The first implemented connector is the terminal connector:

```bash
node md-os/os/terminal_connector.js list
node md-os/os/terminal_connector.js run demo_general_system node_version
```

See [TERMINAL_CONNECTOR.md](TERMINAL_CONNECTOR.md).

The API connector provides the same pattern for allowlisted HTTP requests:

```bash
node md-os/os/api_connector.js list
node md-os/os/api_connector.js run demo_general_system github_rate_limit
```

See [API_CONNECTOR.md](API_CONNECTOR.md).
