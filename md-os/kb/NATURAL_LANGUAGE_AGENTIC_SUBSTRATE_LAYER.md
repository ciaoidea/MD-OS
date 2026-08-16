# Natural-Language Agentic Substrate Layer

This is the explicit architectural claim:

```text
MD-OS creates a natural-language agentic layer between MD-OS and the real
execution substrates of a host machine.
```

This is the substrate for natural-language robotic-agentic programming:
durable language artifacts program the surrounding ecosystem of humans, host
runtimes, tools, applications, services, devices, sensors, robots, policies,
approvals, telemetry, and recovery paths.

Those substrates include:
- the host operating system
- hardware and peripherals
- installed applications
- desktop and window systems
- filesystems
- terminals
- browsers
- APIs and services
- queues and external systems
- robots, controllers, sensors, and actuators

MD-OS is not a replacement for Linux, Windows, macOS, firmware, drivers,
desktop environments, application runtimes, robot controllers, or safety
systems.

MD-OS is the control plane above them:
- identity
- memory
- policy
- natural-language programs
- connector registry
- discovery state
- bounded action routing
- artifacts
- audit
- replay
- continuity

## Layer Shape

```text
human natural-language intent
  -> MD-OS memory, policy, and registry
  -> natural-language agentic substrate layer
  -> bounded connector
  -> OS / hardware / application / service / robot substrate
  -> input, output, artifact, telemetry, or action result
  -> host-local cache and audit log
```

The layer has three responsibilities for each substrate:

1. Discover what exists.
2. Control what is explicitly authorized.
3. Capture input/output artifacts and audit the action.

## OS Layer Examples

```text
"create a folder"
"find this file"
"show processes"
"open a terminal"
```

MD-OS should route these through filesystem, terminal, desktop, or platform
connectors. The host OS remains the authority for permissions and execution.

## Hardware Layer Examples

```text
"turn up the volume"
"mute the volume"
"look at the desktop"
"print this text"
"read the serial sensor"
```

MD-OS should first discover the hardware, then execute only through explicit
hardware connectors. Input artifacts and action logs are host-local and
cleanable.

## Application Layer Examples

```text
"open Firefox"
"open LibreOffice"
"export this document to PDF"
"write this sentence in the active app"
"read the current window"
```

Installed applications are local substrates. Their inventory and runtime
artifacts should live under cleanable host-local state, not portable project
knowledge.

## Robot And Actuator Layer Examples

```text
"move the arm by 10 degrees"
"close the gripper"
"read leg telemetry"
"stop immediately"
```

Robot and actuator control must be routed through dedicated connectors with
hard limits, controller feedback, stop and emergency-stop behavior, and an
external safety/runtime layer. MD-OS may command the controller; it must not
replace real-time control loops, firmware, motor drivers, or safety-certified
systems.

## Portability Rule

Stable knowledge lives in `md-os/kb/`.

Host-specific discovery, app inventories, hardware inventories, screenshots,
device logs, and application artifacts must live under cleanable local runtime
state such as:

```text
md-os/ops/local/hardware/
md-os/ops/local/software/
md-os/ops/local/desktop/
```

The portable MD-OS package should contain the layer model and connector code,
not the private shape of a user's machine.
