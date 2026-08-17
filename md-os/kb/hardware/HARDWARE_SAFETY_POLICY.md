# Hardware Safety Policy

Hardware and peripheral control must be explicit, bounded, and auditable.

## Defaults

Default mode:

```text
discovery_only
```

Discovery may list host-exposed devices and capabilities. It must not perform
control actions.

## Consent Requirements

Always require explicit consent for:
- camera capture
- microphone capture
- screen capture
- printing
- serial writes
- GPIO writes
- actuator or robot motion
- any action that affects another person, device, account, or environment

## Safe Action Classes

Read-only actions:
- list devices
- list host tools
- list printers without printing
- list audio sinks/sources without recording
- list camera device nodes without opening streams
- list display/session metadata

Reversible local actions:
- set volume
- select default output
- mute/unmute

Physical or external actions:
- print
- capture camera/microphone data
- write to serial/GPIO
- move robot or actuator
- enable/disable monitors or display outputs
- send commands to robot arms, legs, grippers, tools, wheels, or drones

Physical or external actions require stronger policy, logging, and often human
confirmation.

## Input And Output Artifacts

Hardware connectors may produce input artifacts or perform output actions.

Examples:
- screen capture -> image artifact under `md-os/ops/local/hardware/screenshots/`
- camera look-once -> image artifact under host-local hardware cache
- microphone sample -> audio artifact under host-local hardware cache
- serial read -> text or binary artifact under host-local hardware cache
- volume set -> host-local action log entry
- robot motion command -> host-local action log entry plus controller response

Artifacts that reveal the local machine or environment are not portable state.
They must remain cleanable with `cortex hardware clean`.

## Robot And Actuator Policy

Robot arms, legs, grippers, wheels, drones, and actuator systems require:
- a dedicated connector for the controller substrate
- explicit target device selection
- bounded speed, force, range, and duration limits
- dry-run or simulation support where possible
- stop and emergency-stop commands
- controller feedback logging
- no autonomous motion loop unless an external safety/runtime layer owns it

## Audit Requirements

Every hardware action connector should write:
- requested natural-language intent
- selected device
- selected connector
- policy decision
- timestamp
- host command/API used
- result
- error output if any

Audit records should live under:

```text
md-os/ops/local/hardware/actions.ndjson
```

Discovery records should live under:

```text
md-os/ops/local/hardware/observations.ndjson
```

The hardware directory is host-local and cleanable with `cortex hardware clean`.
