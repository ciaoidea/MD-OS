# Live Mode And Continuity Service Model

Live mode is the user-facing name for MD-OS (Artificial Prefrontal Cortex) v5.0's optional interactive
runtime switch.

The continuity service is the internal implementation behind live mode.

It exists to make operational presence easy to turn on and off without making
the system secretly always-on.

## Service Claim

The service does not make MD-OS conscious or sentient in a phenomenological
sense.

It makes MD-OS operationally present:
- it keeps a readable heartbeat
- it periodically rebuilds derived runtime views
- it records its cycles in the journal
- it leaves status, PID, stop, and log files under `md-os/ops/services/`
- it can be stopped without deleting canonical state

This supports an interactive persistent agent operating layer while preserving
the non-claim that MD-OS is not AGI itself.

## Commands

Preferred user-facing commands:

```bash
cortex live status
cortex live start
cortex live stop
cortex live restart
cortex live run
```

Backward-compatible technical commands:

```bash
cortex continuity status
cortex continuity start
cortex continuity stop
cortex continuity restart
cortex continuity run
```

NPM equivalents:

```bash
npm run live:status
npm run live:start
npm run live:stop
npm run live:restart
npm run live:once
```

Technical NPM aliases:

```bash
npm run continuity:status
npm run continuity:start
npm run continuity:stop
npm run continuity:restart
npm run continuity:once
```

Direct script:

```bash
node md-os/os/continuity_service.js status
node md-os/os/continuity_service.js start
node md-os/os/continuity_service.js stop
```

## Runtime Files

Canonical service files:

```text
md-os/ops/services/continuity_service.status.json
md-os/ops/services/continuity_service.pid
md-os/ops/services/continuity_service.stop.json
md-os/ops/services/continuity_service.log
```

The status file is the readable truth for operators and host runtimes. The PID
file is only a local process guard. The stop file is the clean shutdown request.
The log file is append-only operational telemetry.

## Bounded Loop

When running, the service performs a bounded cycle:

1. compile natural-language programs
2. rebuild project state for known projects
3. rebuild global agenda
4. rebuild active archive and hot summary views
5. rebuild global index
6. rebuild workspace inventory
7. rebuild system hygiene status
8. write heartbeat and cycle status

The service does not accept arbitrary commands, URLs, or hidden writes. New
external perception or action must still enter through explicit connectors.

## Host Chat Rule

In a Codex or other host chat, the natural instruction:

```text
turn live mode on
```

should map to:

```bash
cortex live start
```

Likewise:

```text
live mode status -> cortex live status
turn live mode off -> cortex live stop
```

The host chat remains the conversational surface. Live mode keeps the MD-OS
runtime present and up to date while the host is operating it.

## Toggle Rule

The service is opt-in.

```text
off = persisted state remains readable and resumable
on = persisted state receives heartbeat and scheduled rebuilds
```

Turning it off should stop the process and leave the last status, log, journal,
and compiled runtime files available for inspection and replay.
