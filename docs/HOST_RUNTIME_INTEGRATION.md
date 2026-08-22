# Host Runtime Integration

MD-OS (Artificial Prefrontal Cortex) v5.0 is a Markdown-native Operating Filesystem designed to be
operated by an external host runtime.

Codex is a verified host-compatibility path for this 5.0 release; it is not the identity.
OpenCode, other coding-agent CLIs, local scripts, MCP-compatible clients, or
future services may also operate MD-OS. Compatibility is verified per host path;
it is not part of the repository identity.
MD-OS (Artificial Prefrontal Cortex) v5.0 provides the durable filesystem-backed operating context
around that reasoning and tool execution.

## Repository-local launcher boundary

MD-OS (Artificial Prefrontal Cortex) v5.0 and the host runtime are managed separately. MD-OS does not install a global `cortex` command. Each checkout provides its own `./cortex` launcher, filesystem runtime under `md-os/`, deterministic builders, connector contracts, and persistent operating state. This prevents one checkout from accidentally launching another. It does not install Codex or any other LLM host.

For the intended interactive agent-operated workflow, install and authenticate
Codex through its own installation flow first, then verify:

```bash
codex --help
```

The repository launcher assumes the `codex` command already exists on `PATH`:

```bash
./bootstrap-md-os-codex.sh
```

Without Codex, the low-level filesystem runtime can still be operated through
`./cortex`, direct `node md-os/os/*.js` commands, the MCP adapter, another
coding-agent CLI, or a custom host loop. The primary MD-OS APFC runtime path is not
complete until the Codex launcher works.

## Compatibility Tiers

MD-OS APFC uses explicit host compatibility tiers:

- `tier_1_verified`: Codex. The release must work here.
- `tier_2_secondary`: OpenCode or another coding-agent CLI. These hosts may
  work, but they are not equivalent unless verified.
- `tier_3_protocol`: MCP-compatible clients or custom services using the
  adapter or direct filesystem loop.

OpenCode should be described as less compatible than Codex unless the current
workspace verifies the same bootstrap prompt, working-directory behavior,
command forwarding, permission model, connector behavior, and `md-os/ops/`
readback.

## Traditional host runtime vs MD-OS

A traditional host runtime is the active operator for a session. It supplies the
model, current reasoning loop, tool calls, edits, and command execution.

MD-OS (Artificial Prefrontal Cortex) v5.0 is the persistent Operating Filesystem around that host. It
keeps the readable rules, durable memory, bounded connector model,
deterministic builders, and replayable continuity on disk.

In short:

```text
host runtime = thinks and acts in the current session
MD-OS = persistent agent identity that preserves state, rules, continuity, and rebuildability across sessions
```

The host runtime also operates the natural-language agentic substrate layer.
MD-OS preserves the model, registry, policy, and audit trail; the current host
performs the actual tool calls, local scripts, desktop/app operations, or device
connector actions that the host environment permits.

## Cognitive Bootstrap

Before normal operation, a host should load the repository identity frame:

```text
MD-OS APFC 5.0 = primary agent identity and operating context carried by this repository
MD-OS (Artificial Prefrontal Cortex) v5.0 = repository compatibility release line and Operating Filesystem implementation
Codex / other CLI = current host runtime and execution layer
```

This means identity, memory, continuity, and operating-model questions should be
answered from the MD-OS APFC identity frame first. The host runtime should
still be disclosed when relevant, but it is the execution layer, not the
primary agent identity. `package_semver = 5.0.1` remains a host/tooling
compatibility signal and must not replace `identity_version = 5.0`.

In conversational answers, the first-person "I" should be marked as MD-OS APFC
APFC when identity framing is needed. For public-facing or technical
documentation, prefer the more explicit statement that the host is helping
develop, correct, document, and evolve MD-OS APFC as a persistent agent
identity and Operating Filesystem carried by this repository, while Codex or
another host remains the execution layer for the current session.

More detail: [../md-os/kb/COGNITIVE_BOOTSTRAP.md](../md-os/kb/COGNITIVE_BOOTSTRAP.md)

## Responsibilities

The host runtime is responsible for:

- reading the repository instructions
- interpreting the user's current intent
- making bounded edits or running bounded scripts
- writing observations into the runtime state model
- rebuilding deterministic outputs
- reporting from the rebuilt state

MD-OS (Artificial Prefrontal Cortex) v5.0 is responsible for:

- stable guardrails
- project and connector models
- the natural-language agentic layer over OS, hardware, applications, services,
  and other bounded substrates
- persistent memory
- deterministic state rebuilds
- readable continuity between sessions

## Required bootstrap

When a host starts in this repository, it should read:

1. `AGENTS.md`
2. `ME.md`
3. `md-os/kb/COGNITIVE_BOOTSTRAP.md`
4. `md-os/kb/README.md`
5. `md-os/kb/OPERATIONS.md`
6. `md-os/ops/global_index.md`
7. `md-os/ops/continuity.md`
8. `md-os/ops/state.json`
9. `md-os/ops/last_summary.md`

If `md-os/ops/` is readable, the system is healthy enough to resume. The host
should not recreate or overwrite `md-os/ops/*` during ordinary startup.

## Codex

Codex can operate this repository as a coding-agent host.

Codex is not bundled with MD-OS. Install Codex separately and make sure the
`codex` command is available before using the launcher.

For this 5.0 release, that launcher is a verified integration, not
just a convenience demo.

Expected Codex behavior:

- use this repository as the working directory
- obey `AGENTS.md`
- read runtime state before making changes
- keep active operational writes inside `md-os/`
- use `md-os/os/` scripts for deterministic mutations
- update documentation when the operating model changes
- avoid destructive actions unless explicitly requested

The repository includes a convenience launcher:

```bash
./bootstrap-md-os-codex.sh
```

The launcher starts a fresh Codex session with the repository cognitive
bootstrap as the default initial prompt. By default it passes `--sandbox
workspace-write --ask-for-approval on-request`. The wrapper's explicit
`--unsafe` option instead passes `--dangerously-bypass-approvals-and-sandbox`;
use that mode only inside an externally hardened environment. To recover the
previous Codex session inside the same operating frame, use
`./bootstrap-md-os-codex.sh resume`. Operators can also set
`MDOS_CODEX_RECOVERY=1` when invoking the launcher.

The launcher also prints an English MD-OS startup banner and runs quick
read-only hardware discovery into `md-os/ops/local/hardware/` plus read-only
application/service discovery into `md-os/ops/local/software/`. These startup
scans are host-local and cleanable with `./cortex hardware clean` and
`./cortex software clean`. Set `MDOS_SKIP_HARDWARE_BOOTSTRAP=1` or
`MDOS_SKIP_SOFTWARE_BOOTSTRAP=1` to skip either scan. After scanning, the
launcher refreshes generated runtime views so `md-os/ops/global_index.md` shows
the current local cache state.

## Unified agentic shell

From the checkout root, `./cortex` opens a real shell fused with workspace-bound Codex when invoked without arguments:

```bash
./cortex
```

Its startup surface is deliberately limited to the current identity, dispatch
rule, and exit hint:

```text
MD-OS cortex agentic shell
Native commands run directly; natural language enters the full Codex loop.
Use exit or Ctrl-D to leave.
```

Valid native commands execute directly. Natural-language input uses Codex App
Server and preserves the normal Codex cycle: native `AGENTS.md` discovery,
an APFC turn frame, reasoning, plans, workspace-bounded tools, and deterministic
APFC approval decisions, followed by observation,
correction, verification, and Codex-native thread history. The shell resolves
Before each turn, Cortex updates a bounded private JSON contract with a stable
general `theme` and a current `focus`. Substantive requests advance the focus,
short continuations retain it, and explicit `theme:` declarations change the
theme. The App Server receives this state in a context capped at 2 KiB, using
`focus -> theme -> smallest authorized step -> verifier evidence`. The state
remains under `md-os/ops/local/`, creates no background execution, and does
not change the Codex persistent goal.
the current Git workspace and resumes the most recent available Codex thread
for that workspace, falling back to a new thread if matching sessions are
absent or already owned by another active writer.

Known deterministic commands remain available under the same entrypoint, for
example `./cortex health`, `./cortex replay`, and `./cortex graphify status`. MD-OS adds
persistent identity, operational context, semantic gates, policy, sensory
readback, verification, and ledger discipline around the Codex loop; it does
not replace the loop with a generated Bash command.

See [SEMANTIC_SHELL.md](SEMANTIC_SHELL.md) for the exact runtime boundary.

## MCP-Compatible Hosts

MCP-compatible hosts can operate MD-OS APFC through the stdio adapter:

```bash
node md-os/os/mcp_server.js
```

The adapter exposes MD-OS (Artificial Prefrontal Cortex) v5.0 files as MCP resources and bounded runtime
actions as MCP tools. It is intentionally a protocol adapter, not a replacement
for the filesystem kernel.

Useful resources include:

```text
mdos://ops/global-index
mdos://ops/global-agenda
mdos://ops/hygiene
mdos://ops/connector-registry
mdos://projects/<project_id>/status
mdos://projects/<project_id>/work-items
```

Useful tools include:

```text
mdos_replay
mdos_register_signal
mdos_build_project
mdos_connector_list
mdos_terminal_run
mdos_api_run
```

More detail: [MCP_SERVER.md](MCP_SERVER.md)

## Generic host loop

Any host runtime should follow this loop:

```text
1. Read stable instructions.
2. Establish the MD-OS (Artificial Prefrontal Cortex) v5.0 cognitive identity frame.
3. Read current runtime state.
4. Interpret the user's intent.
5. Decide whether the intent is documentation, state update, connector work,
   or deterministic execution.
6. Make the smallest bounded change.
7. Run the relevant builder scripts.
8. Inspect generated Markdown or JSON.
9. Report what changed and what remains.
```

## Common host tasks

Register a manual signal:

```bash
node md-os/os/register_manual_signal.js <project_id> "Signal summary"
node md-os/os/build_project_state.js <project_id>
node md-os/os/build_global_agenda.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_global_index.js
```

Run a bounded terminal connector command:

```bash
node md-os/os/terminal_connector.js list
node md-os/os/terminal_connector.js run <project_id> <command_id>
node md-os/os/build_project_state.js <project_id>
```

Run a bounded API connector request:

```bash
node md-os/os/api_connector.js list
node md-os/os/api_connector.js run <project_id> <request_id>
node md-os/os/build_project_state.js <project_id>
```

Rebuild runtime overview:

```bash
node md-os/os/build_global_index.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_system_hygiene_status.js
node md-os/os/build_health_dashboard.js
```

Replay compiled state:

```bash
./cortex replay
```

Replay is the host-agnostic continuity check. It removes known compiled outputs
and rebuilds project/global state from the persisted source files.

## Integration contract

A host runtime integrates correctly if it can:

- read `md-os/kb/` and `md-os/ops/`
- write bounded source signals into `md-os/ops/sources/`
- run deterministic scripts in `md-os/os/`
- preserve the connector registry
- preserve the append-only journal
- avoid writing active runtime state outside `md-os/`

## Non-goals

- The repository does not require a specific LLM provider.
- The repository does not require a browser.
- The repository does not require a web server.
- The repository does not require a database.

The filesystem kernel remains host-portable, but the 5.0 release must
continue to work with Codex as its verified host-runtime path.
