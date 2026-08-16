# Natural-Language Agentic Substrate Layer

This is the plain statement:

```text
MD-OS creates a natural-language agentic layer between MD-OS and the real
execution substrates of a host machine.
```

This layer is the basis for natural-language robotic-agentic programming. The
user is not merely asking for isolated tool calls; the user is programming an
ecosystem of agents, applications, services, devices, sensors, robots,
policies, approvals, telemetry, and recovery paths through durable operating
artifacts.

Those substrates include:

- the host operating system
- hardware and peripherals
- desktop and window systems
- installed applications
- filesystems
- terminals
- browsers
- APIs and services
- queues and external systems
- robots, controllers, sensors, and actuators

MD-OS is not the hardware operating system, driver stack, application runtime,
robot controller, firmware, real-time loop, or safety system. Linux, Windows,
macOS, ROS, device drivers, application runtimes, and safety controllers remain
the lower layers that expose real capabilities.

MD-OS is the agentic control plane above them. It gives natural-language intent
a durable route through memory, policy, connector registration, bounded action,
artifact capture, audit, and replay.

## Operating Path

```text
human natural-language intent
  -> MD-OS memory, policy, and registry
  -> natural-language agentic substrate layer
  -> bounded connector
  -> OS / hardware / application / service / robot substrate
  -> input, output, artifact, telemetry, or action result
  -> host-local cache and audit log
```

This makes the layer concrete:

1. MD-OS discovers what the host exposes.
2. MD-OS registers capabilities and their allowed read/write boundaries.
3. MD-OS routes explicit user intent to the correct bounded connector.
4. MD-OS stores input/output artifacts and action records in readable files.
5. MD-OS rebuilds state from those files instead of depending on hidden chat
   memory.

## What This Means

If the user says:

```text
turn up the volume
look at the desktop
print "hello"
open LibreOffice
read the serial sensor
move the arm by 10 degrees
```

MD-OS should not pretend these are only chat phrases. They are operating
intents. The system should map each intent to a discovered substrate, a
registered connector, a policy boundary, an execution path, and an audit trail.

Discovery is not control. Finding a camera, printer, display, audio device, app,
or robot interface only means the substrate exists. Using it requires an
explicit connector, allowed capabilities, host permissions, and user intent.

## Portability

The portable repository should contain the model, connector contracts, scripts,
and public documentation.

Private host shape must stay in cleanable local runtime state, for example:

```text
md-os/ops/local/hardware/
md-os/ops/local/software/
md-os/ops/local/desktop/
```

This keeps MD-OS distributable without packaging a user's hardware inventory,
desktop state, screenshots, application inventory, or device logs.

## Canonical KB

The canonical knowledge-base model is:

```text
md-os/kb/NATURAL_LANGUAGE_AGENTIC_SUBSTRATE_LAYER.md
```
