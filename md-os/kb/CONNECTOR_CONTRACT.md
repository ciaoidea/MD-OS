# Connector Contract

Generic connectors are bounded device adapters for MD-OS (Artificial Prefrontal Cortex) v5.0. They
interact with an external substrate.

They are the concrete mechanism of the natural-language agentic substrate
layer. Natural-language intent does not touch the OS, hardware, applications,
services, robots, sensors, or actuators directly. It is routed through a
registered connector with explicit capabilities, policy, artifacts, and audit.

Connectors are not only pre-existing integrations. When a target substrate is
not yet covered, MD-OS can define a connector fabrication path: specify the
substrate, declare allowed reads and writes, implement the adapter under
`md-os/os/`, register it under `md-os/ops/connectors/`, emit readable snapshots, and
verify the behavior with deterministic tests or smoke checks.

The connector contract is substrate-oriented, not API-oriented. APIs are one
supported substrate class. A connector can also bind to a terminal, filesystem,
desktop application, browser, mailbox, calendar, agenda, planning board, queue,
device, or another bounded surface without changing the core runtime model.

For workplace onboarding, the preferred fast path is to expose the new hire's
already-authenticated and authorized work tools through MCP resources and tools.
This avoids requiring a custom internal API project before MD-OS APFC can assist
with mail, calendar, agenda, planning, tickets, documents, folders, or internal
applications. The connector must still preserve the authority boundary: the
session belongs to the new hire, the new hire supervises use, and MD-OS records
evidence, permissions, and actions.

Supported substrate classes:
- api
- application
- browser
- desktop
- terminal
- filesystem
- service
- database
- queue
- device
- messaging
- monitoring
- ticketing
- mail
- calendar
- planning
- document_repository

Connector fabrication requirements:
- target substrate and access method are explicit
- read and write capabilities are declared before use
- credentials and secrets are not embedded in knowledge files or snapshots
- destructive writes are disabled unless separately authorized
- implementation remains inside `md-os/` or calls an explicitly bounded external
  runtime
- connector output is readable, replayable, and safe to consolidate
- the live connector registry records status, implementation state, execution
  mode, and notes

Each connector should produce normalized snapshots as JSON.

Recommended snapshot schema:
```json
{
  "schema_version": 1,
  "connector_name": "generic_connector",
  "connector_kind": "api|browser|desktop|terminal|filesystem|device|other",
  "project_id": "demo_general_system",
  "captured_at": "2026-04-24T18:00:00Z",
  "signals": [
    {
      "source_id": "unique_signal_id",
      "captured_at": "2026-04-24T18:00:00Z",
      "summary": "short summary",
      "status_hint": "open",
      "priority": "high",
      "owner_hint": "operator name",
      "entities": ["entity_a", "entity_b"],
      "tags": ["generic", "runtime"],
      "suspected_causes": ["cause_a"],
      "depends_on": [],
      "next_step": "next deterministic step",
      "due_at": "2026-04-25T09:00:00Z",
      "external_parties": ["vendor_x"]
    }
  ]
}
```

Connectors should not own project truth directly. They emit signals. Builders consolidate signals into canonical project state.

Transport is not the invariant. The invariant is bounded observation or action,
readable source snapshots, and deterministic consolidation into runtime state.
