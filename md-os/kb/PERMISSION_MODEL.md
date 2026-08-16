# Permission Model

MD-OS connectors must declare what class of action they can perform before a
host runtime uses them.

The permission model separates capability from risk:

```text
capability = what the connector can do
risk level = operational impact if used incorrectly
approval rule = whether a human or host policy must authorize it
audit rule = what must be written after use
```

## Capability Classes

- `read-only`: observe state without modifying external systems.
- `write-local`: write generated or local files inside `md-os/`.
- `write-project`: update project-scoped runtime state.
- `network-read`: read from a remote service.
- `network-write`: write to a remote service.
- `shell-safe`: execute an allowlisted low-risk command.
- `shell-dangerous`: execute a command with destructive or broad side effects.
- `hardware-read`: observe hardware, devices, or telemetry.
- `hardware-write`: change hardware, device, display, audio, GPIO, actuator, or robot state.
- `destructive`: delete, reset, overwrite, stop, disable, or irreversibly mutate state.
- `requires-approval`: require explicit human or host authorization before execution.

## Risk Levels

- `low`: read-only or generated local output.
- `medium`: local writes, bounded project updates, or non-destructive network reads.
- `high`: network writes, hardware writes, shell commands with broad host effects.
- `critical`: destructive operations, safety-relevant robotics, irreversible external state.

## Required Action Gate

Every connector action should be classifiable as:

```text
connector_id
permission_profile
capabilities
risk_level
requires_approval
dry_run_available
audit_required
recovery_note_required
```

If a connector cannot provide these fields, it should remain experimental or
planned.

## Canonical Policy File

The live policy is:

```text
md-os/ops/policies/permission_model.json
```

The schema is:

```text
md-os/schemas/permission_model.schema.json
```
