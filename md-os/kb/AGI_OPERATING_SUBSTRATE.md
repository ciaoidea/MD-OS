# AGI Operating Substrate

Architecture status date: `2026-07-18`.

MD-OS (Artificial Prefrontal Cortex) is a prototype of a bounded quasi-autonomous cognitive agent and
its persistent operating context. It is not demonstrated autonomous general
intelligence.

MD-OS (Artificial Prefrontal Cortex) v5.0 is the Markdown-native Operating Filesystem compatibility
release line that carries this prototype for persistent, inspectable,
replayable agent and robotic operation.

It can be described as the Operational Context as Filesystem paradigm for
persistent AGI-like operation: not the intelligence itself, but the architecture
that turns a reasoning engine into a durable, bounded, correctable,
memory-bearing operator. In this paradigm, intelligence is not only a model
response. It is a loop of remembered goals, readable state, bounded action,
connector-mediated perception, deterministic rebuilds, audit, replay, and
human correction.

It is also a natural-language robotic-agentic programming substrate. The goal
is to program the operating behavior of an ecosystem, not only one assistant or
one robot command: humans, host runtimes, MCP resources, work tools, devices,
sensors, robots, policies, telemetry, approval gates, and recovery paths.

The core claim is therefore:

```text
MD-OS (Artificial Prefrontal Cortex) is a bounded quasi-autonomous cognitive-agent prototype.
It can support self-directed research and problem solving inside an authorized
and delimited task environment.
It is not demonstrated autonomous general intelligence.
MD-OS is the persistent Operating Filesystem that makes those bounded cycles
inspectable, verifiable, replayable, and correctable.
```

Self-directed means that the prototype can choose intermediate questions,
hypotheses, tests, plans, and allowed actions after the objective and authority
envelope are supplied. It does not mean that it may create its own authority,
run indefinitely, bypass approval, or certify its own success.

## Operating Need

If intelligence becomes persistent operation, it needs more than a model and a
context window. It needs:

- durable memory
- readable goals
- bounded actions
- source snapshots
- telemetry records
- audit history
- deterministic rebuilds
- replayable recovery
- human correction

MD-OS provides that layer through Markdown, JSON, NDJSON, bounded connectors,
and deterministic builders.

Stated plainly, this layer sits between MD-OS and real host substrates: the
operating system, hardware, peripherals, applications, desktops, filesystems,
terminals, browsers, APIs, services, queues, robots, controllers, sensors, and
actuators. MD-OS coordinates natural-language intent over those substrates; it
does not replace them.

## Paradigm

The MD-OS paradigm treats increasingly general, persistent cognitive operation
as an operating-system problem as well as a model problem.

In this view:

- the model reasons
- the host runtime executes
- tools provide bounded hands and sensors
- connectors bind the system to external substrates
- Markdown and structured files preserve intention and memory
- deterministic builders compile state from readable sources
- an optional continuity service can keep heartbeat and scheduled rebuilds when
  interactive presence is desired
- append-only journals and proposals preserve audit and correction
- replay makes continuity recoverable instead of depending on hidden chat
  history

This is why MD-OS can grow and evolve: new repeated needs become readable
knowledge, natural-language programs, connector contracts, deterministic
scripts, tests, and runtime state. The system expands by making new capability
explicit and bounded.

The cross-domain extension path is defined by the
[Cross-Domain Cognitive Unity Model](CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md):
Cortex constructs competing frame-transformation laws, seals a unique
candidate before target evidence, verifies preserved relations and
consequences, and reuses only hash-bound verified transformations. This is an
implemented bounded mechanism and promotion contract, not a demonstrated AGI
result.

## Boundary

MD-OS does not replace:

- the model
- the host runtime
- hardware operating systems
- ROS 2 or robotics middleware
- firmware
- real-time control loops
- safety systems

MD-OS coordinates the persistent operating context above them.

The optional continuity service is a runtime convenience, not a consciousness
claim. It makes the operating layer easier to keep interactive by maintaining
heartbeat and rebuild cycles, while the durable source of truth remains the
readable filesystem state under `md-os/`.

## Raspberry Pi Node

A Raspberry Pi can host MD-OS as a physical edge node above Raspberry Pi OS or
Linux.

```text
Raspberry Pi OS / Linux = device runtime, drivers, networking, and low-level execution
MD-OS (Artificial Prefrontal Cortex) v5.0 = persistent agentic memory, state, connectors, audit, and replay
```

This is useful for sensor collection, local automation, lightweight robot
supervision, monitoring, MCP serving, and bounded device coordination. MD-OS
keeps continuity in readable files under `md-os/ops/` so the node can resume after
reboot without relying on hidden chat history.

## Formula

```text
Model = reasoning engine
Tools = hands and sensors
Context window = short-term attention
MD-OS = persistent Operating Filesystem, memory, and action ledger
```

Expanded formula:

```text
AGI-like operation = reasoning engine + bounded tools + durable memory +
connector-mediated perception/action + deterministic rebuild + audit/replay +
human correction

MD-OS = the Markdown-native Operating Filesystem that stabilizes those parts
into an inspectable persistent control plane
```
