# Raspberry Pi Node Model

A Raspberry Pi can host MD-OS (Artificial Prefrontal Cortex) v5.0 as a physical edge node.

MD-OS does not replace Raspberry Pi OS, Linux, systemd, device drivers, GPIO
libraries, ROS 2, firmware, or safety systems. It runs above them as the
agentic operating layer for memory, bounded action, audit, and continuity.

## Layer Position

```text
Raspberry Pi hardware
  -> Raspberry Pi OS / Linux
  -> systemd / shell / GPIO libraries / device APIs / ROS 2 when present
  -> bounded MD-OS connectors
  -> md-os/ops readable state
  -> md-os/os deterministic builders
  -> host runtime or local agent loop
```

The hardware and Linux stack provide execution, networking, device access, and
low-level safety.

MD-OS provides:

- readable operating memory
- connector source snapshots
- bounded command and device actions
- deterministic state rebuilds
- project agendas and work-item state
- audit history
- continuity after reboot or host-runtime change

## Suitable Uses

A Raspberry Pi node is a good fit for:

- home or lab automation controllers
- sensor and telemetry collectors
- local MCP servers
- lightweight robot supervisors
- edge monitoring nodes
- bounded relay, camera, GPIO, serial, MQTT, or HTTP adapters
- offline-readable operational memory for a device

## Operating Pattern

```text
sensor, device, local service, or human request
  -> bounded connector
  -> source snapshot in md-os/ops/sources/
  -> deterministic builder
  -> project state, agenda, journal, and continuity files
  -> optional bounded action through an allowlisted connector
```

Actions should remain explicit and bounded. A Raspberry Pi connector can request
or execute an allowed operation, but destructive or safety-critical behavior
should stay behind dedicated device safety layers and human approval rules.

## Reboot Continuity

On reboot, the Raspberry Pi does not need hidden session memory to resume. A
host runtime or local loop can read:

1. `AGENTS.md`
2. `ME.md`
3. `md-os/kb/COGNITIVE_BOOTSTRAP.md`
4. `md-os/kb/OPERATIONS.md`
5. `md-os/ops/global_index.md`
6. `md-os/ops/continuity.md`
7. `md-os/ops/state.json`
8. relevant project state under `md-os/ops/projects/`

Then it can continue from readable filesystem state.

## Correct Claim

Use:

```text
MD-OS on Raspberry Pi is a persistent Operating Filesystem above Linux for
bounded device coordination, memory, audit, and replay.
```

Avoid:

```text
MD-OS replaces Raspberry Pi OS.
MD-OS is a real-time hardware operating system.
MD-OS replaces firmware, drivers, ROS 2, or safety systems.
```
