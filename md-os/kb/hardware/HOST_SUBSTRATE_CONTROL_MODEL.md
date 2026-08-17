# Host Substrate Control Model

MD-OS (Artificial Prefrontal Cortex) v5.0 is a natural-language control plane over host-exposed
substrates.

It should not reinvent lower layers:

```text
hardware
  -> host operating system
  -> drivers, device nodes, APIs, services, apps, and permissions
  -> MD-OS discovery
  -> connector registry
  -> natural-language intent
  -> bounded action
  -> memory, audit, and replay
```

## Core Claim

MD-OS does not control hardware directly from the metal. It controls hardware
through the surfaces that the host operating system already exposes.

Examples:
- Linux exposes cameras through `/dev/video*`, V4L2, PipeWire, and tools such
  as `v4l2-ctl`.
- Linux and macOS expose printers through CUPS commands such as `lpstat` and
  `lp`.
- Linux exposes audio through PipeWire, PulseAudio, ALSA, and tools such as
  `pactl`, `wpctl`, and `amixer`.
- Windows exposes devices through Device Manager, PowerShell, WinRT, COM, and
  device APIs.
- macOS exposes devices through System Information, AVFoundation, CoreAudio,
  CUPS, and automation APIs.

MD-OS turns those host substrates into readable capabilities and bounded
connectors.

## Natural-Language Layer

Human intent may be expressed as:

```text
turn up the volume
print "hello"
look at my shirt
find available cameras
```

MD-OS should translate that intent only after it has:
- discovered the relevant capability
- registered the capability
- checked policy and consent requirements
- selected a bounded connector
- prepared an auditable action record

Discovery is not control. Control requires an explicit connector and policy.

## Control Layer

The intended model is:

```text
cortex hardware bootstrap
  -> discovers host-exposed devices and capability surfaces

cortex hardware run "<explicit user intent>"
  -> selects a bounded connector
  -> performs a local action or capture
  -> writes an audit record and any input/output artifact
```

Examples:

```bash
cortex hardware run "turn up the volume"
cortex audio volume down
cortex audio volume zero
cortex hardware run "look at the desktop"
cortex screen capture
cortex display status
```

Device input and output are first-class:
- an input action may read a sensor, camera frame, microphone sample, screen
  capture, serial stream, or robot telemetry
- an output action may set volume, print, write serial/GPIO, move an actuator,
  or send a command to a robot controller
- every produced artifact should live in the host-local hardware cache
- every action should append to the host-local action log

Robot arms, legs, grippers, wheels, drones, tools, and actuators follow the
same pattern, but require a dedicated connector, hard limits, explicit stop and
emergency-stop commands, and an external safety/runtime layer. MD-OS may plan
and command through that layer; it must not replace firmware, motor drivers,
real-time loops, or safety-certified controllers.
