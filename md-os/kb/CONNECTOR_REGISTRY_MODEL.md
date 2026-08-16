# Connector Registry Model

The connector registry is the canonical live inventory of available and planned connectors.

It is the operational map of the natural-language agentic substrate layer:
which OS, hardware, application, service, desktop, browser, queue, robot,
sensor, actuator, or other substrate MD-OS can observe or control, and under
which explicit boundaries.

Purpose:
- make connector capability explicit
- separate implemented adapters from planned adapters
- represent connectors that MD-OS still needs to fabricate
- expose substrate coverage of the system
- avoid hidden assumptions about what the agent can touch

Canonical location:
- `md-os/ops/connectors/connector_registry.json`

Each connector record should include:
- `connector_id`
- `name`
- `kind`
- `status`
- `implemented`
- `read_capabilities`
- `write_capabilities`
- `execution_mode`
- `notes`

Typical statuses:
- `ready`
- `planned`
- `designing`
- `blocked`
- `disabled`
- `experimental`
- `configured`
- `missing_host_prerequisite`

Connector lifecycle:
- `planned`: the substrate need is known but the connector is not designed
- `designing`: capabilities, access method, and safety boundaries are being
  specified
- `experimental`: implementation exists but is not yet stable
- `ready`: implementation and verification are sufficient for ordinary bounded
  use
- `blocked`: missing credentials, tools, network/device access, or human
  authorization prevents implementation or use
- `disabled`: connector exists but should not be used
- `configured`: connector profile and runtime support exist, but host
  availability still needs bootstrap verification
- `missing_host_prerequisite`: connector is configured, but the current host is
  missing a required local executable, credential, device, or service

Typical execution modes:
- `snapshot_only`
- `bounded_exec`
- `bounded_symbolic_script_or_code`
- `read_write`
- `human_confirmed_write`
