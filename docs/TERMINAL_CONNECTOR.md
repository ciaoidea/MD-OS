# Terminal Connector

The terminal connector is a bounded terminal device adapter for MD-OS (Artificial Prefrontal Cortex) v5.0
MD-OS APFC.

It demonstrates how a real connector can execute something useful while staying
bounded and inspectable.

## Purpose

The terminal connector:

- reads an allowlist of command profiles
- runs a selected command ID
- captures stdout, stderr, exit code, and duration
- validates `project_id`, `command_id`, and connector IDs with a strict
  allowlist
- rejects working directories outside the workspace
- runs with a minimal environment containing only `PATH`
- truncates and redacts captured output
- writes a raw artifact
- writes a normalized connector snapshot
- appends a journal event

It does not execute arbitrary shell strings.

## Files

```text
md-os/os/terminal_connector.js                  connector implementation
md-os/ops/connectors/terminal_connector.json    command allowlist
md-os/ops/sources/connectors/                   generated snapshots
md-os/ops/artifacts/terminal/                   raw command artifacts
md-os/ops/journal.ndjson                        connector run events
```

## List commands

```bash
node md-os/os/terminal_connector.js list
```

Or:

```bash
npm run connector:terminal:list
```

## Run a command

```bash
node md-os/os/terminal_connector.js run <project_id> <command_id>
```

Example:

```bash
node md-os/os/terminal_connector.js run demo_general_system node_version
```

Or:

```bash
npm run connector:terminal:run:node-version
```

## Rebuild after running

After a connector emits a snapshot, rebuild the affected project:

```bash
node md-os/os/build_project_state.js demo_general_system
node md-os/os/build_global_agenda.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_global_index.js
```

## Command profile shape

Command profiles are configured in:

```text
md-os/ops/connectors/terminal_connector.json
```

Example:

```json
{
  "schema_version": 1,
  "connector_id": "terminal_executor",
  "default_timeout_ms": 15000,
  "max_stdout_bytes": 200000,
  "max_stderr_bytes": 200000,
  "redact_patterns": ["token=", "api_key=", "secret="],
  "commands": [
    {
      "command_id": "node_version",
      "argv": ["node", "--version"],
      "cwd": ".",
      "summary": "Capture the local Node.js version.",
      "priority": "low",
      "tags": ["terminal", "runtime", "version"],
      "entities": ["node_runtime"]
    }
  ]
}
```

The connector uses `argv` directly through `spawnSync`. It does not pass a shell
string for interpretation. `cwd` is resolved relative to the workspace and must
remain inside it.

## Generated snapshot

Running the connector writes a file like:

```text
md-os/ops/sources/connectors/demo_general_system__terminal__node_version.json
```

The snapshot includes:

- connector identity
- project ID
- captured timestamp
- normalized signal
- command metadata under `connector_runtime`

## Generated artifact

The raw command output is written to:

```text
md-os/ops/artifacts/terminal/
```

The artifact includes:

- command ID
- project ID
- execution timestamp
- working directory
- argv
- exit code
- duration
- configured output byte limits
- stdout
- stderr

## Adding another terminal command

1. Edit `md-os/ops/connectors/terminal_connector.json`.
2. Add a new command object with `command_id`, `argv`, `cwd`, and `summary`.
3. Run:

```bash
node md-os/os/terminal_connector.js list
node md-os/os/terminal_connector.js run <project_id> <new_command_id>
node md-os/os/build_project_state.js <project_id>
```

## Safety expectations

- Keep commands narrow.
- Prefer read-only inspection commands.
- Use fixed `argv` arrays.
- Do not accept arbitrary user shell input.
- Use a specific `cwd` inside the workspace.
- Keep output limits and redaction patterns in the connector profile.
- Add destructive commands only with explicit human confirmation behavior.
