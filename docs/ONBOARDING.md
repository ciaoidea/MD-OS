# Onboarding

This guide is for a person opening the repository for the first time.

For a less technical introduction, start with
[`POPULAR_PRESENTATION.md`](POPULAR_PRESENTATION.md). It explains the project
through the transition from MS-DOS batch files to semantic Markdown operating
programs orchestrated by Codex.

MD-OS (Artificial Prefrontal Cortex) v5.0 is a Markdown-native Operating Filesystem. It externalizes
the operational context of persistent AI agents and robotic systems into
readable, auditable, reconstructible, and actionable files.

The important point: the repository is not the model and not a real-time
hardware OS. It is the filesystem-backed operating context around a model,
host runtime, robotic system, device, or other bounded substrate.

Said directly: MD-OS creates a natural-language agentic layer between itself
and the host machine's real substrates: the OS, hardware, peripherals, desktop,
installed applications, filesystems, terminals, browsers, APIs, services,
robots, controllers, sensors, and actuators. It does not replace them. It
discovers them, registers them, routes explicit user intent through bounded
connectors, captures artifacts, and audits actions.

On a Raspberry Pi, this means Raspberry Pi OS or Linux remains the hardware
operating system. MD-OS runs above it as the readable memory, connector,
agenda, audit, and continuity layer for bounded device coordination.

## Runtime Requirement

MD-OS (Artificial Prefrontal Cortex) v5.0 is the persistent agent and Operating Filesystem on disk. It
does not include the LLM host runtime inside the package.

For local filesystem operation you need Node.js 20 or newer and the `cortex` or
`node md-os/os/*.js` commands. For the intended LLM-operated workflow, install
Codex separately. Other coding-agent CLIs, MCP-compatible clients, or custom
host loops can be integrated, but Codex is the verified runtime path for
this 5.0 release.

OpenCode can be tried as a secondary host, but do not assume Codex parity. It
is less compatible until the same bootstrap, launcher, permission, command, and
runtime-readback behavior has been verified.

Verify that the Codex host command exists before using the repository launcher:

```bash
codex --help
./bootstrap-md-os-codex.sh
```

The launchers do not install Codex. They start an already-installed Codex
runtime in this workspace with the MD-OS cognitive bootstrap loaded. Use
`./bootstrap-md-os-codex.sh resume` when you want to recover the most recent
Codex session instead of opening a fresh one.

## Browse With Obsidian

The programmable agentic structure is easy to inspect as an Obsidian vault
because the operating knowledge and generated views are Markdown-first.

Useful Markdown entry points:

```text
AGENTS.md
ME.md
README.md
docs/
md-os/kb/
md-os/ops/global_index.md
md-os/ops/summary/active_work_items.md
md-os/ops/agenda/global_agenda.md
md-os/ops/projects/*/status.md
md-os/ops/projects/*/agenda.md
```

Obsidian is only a navigation and editing surface. The runtime remains the
filesystem plus deterministic builders in `md-os/os/`.

## Five-minute path

1. Read the root files:

```bash
sed -n '1,160p' AGENTS.md
sed -n '1,120p' ME.md
sed -n '1,220p' README.md
```

2. Initialize and rebuild a fresh public clone:

```bash
npm run build:all
npm run replay
```

3. Read the generated runtime index:

```bash
sed -n '1,160p' md-os/ops/global_index.md
```

4. Inspect the generated project state:

```bash
sed -n '1,160p' md-os/ops/projects/demo_general_system/status.md
sed -n '1,160p' md-os/ops/projects/demo_general_system/agenda.md
sed -n '1,160p' md-os/ops/summary/active_work_items.md
```

5. Add one manual signal:

```bash
node md-os/os/register_manual_signal.js demo_general_system "Review connector documentation for a new external host runtime"
node md-os/os/build_project_state.js demo_general_system
node md-os/os/build_global_agenda.js
node md-os/os/archive_runtime_state.js
```

6. Inspect the compiled result:

```bash
sed -n '1,200p' md-os/ops/projects/demo_general_system/work_items.ndjson
sed -n '1,160p' md-os/ops/agenda/global_agenda.md
```

## What you should understand after that

- `md-os/kb/` is stable knowledge.
- `md-os/ops/` is runtime memory.
- `md-os/os/` is deterministic code.
- Natural-language control files are part of the Operating Filesystem, not just
  documentation.
- Natural-language programs live in `md-os/ops/programs/` and compile into
  `md-os/ops/compiled/`.
- Source snapshots are raw observations.
- Builders compile raw observations into project state.
- `cortex compact` builds the hot active-work summary and terminal archive
  views without deleting canonical work items.
- `cortex propose-change <target_path> <summary>` records contested edits as
  append-only proposals under `md-os/ops/changes/`.
- `cortex software bootstrap` builds a cleanable host-local application and
  service inventory under `md-os/ops/local/software/`.
- Replay removes compiled state and rebuilds it from sources and project
  definitions.
- Codex is the host runtime role for the agent-operated path. Other hosts
  such as OpenCode or another CLI can operate this system only as secondary
  compatibility paths until verified against the same files and commands.

## First read order for an agent host

When an LLM host opens this repo, use this order:

On a fresh public clone, run `npm run init:demo` before reading paths under
`md-os/ops/`. If `md-os/ops/` already contains readable runtime state, preserve
it and do not initialize it again.

1. `AGENTS.md`
2. `ME.md`
3. `README.md`
4. `md-os/kb/README.md`
5. `md-os/kb/OPERATIONS.md`
6. `md-os/ops/global_index.md`
7. `md-os/ops/continuity.md`
8. `md-os/ops/state.json`
9. `md-os/ops/last_summary.md`

If `md-os/ops/` is readable, do not enter recovery mode and do not recreate
runtime state implicitly.

## What to edit first

For a new project:

1. Copy `md-os/examples/project.template.json`.
2. Create `md-os/ops/projects/<project_id>/project.json`.
3. Add source signals under `md-os/ops/sources/manual/` or
   `md-os/ops/sources/connectors/`.
4. Run `node md-os/os/build_project_state.js <project_id>`.
5. Run `node md-os/os/build_global_agenda.js`.
6. Run `node md-os/os/archive_runtime_state.js`.
7. Run `node md-os/os/build_markdown_graph.js`.
8. Run `node md-os/os/build_global_index.js`.

For a new natural-language program:

1. Create `md-os/ops/programs/<program_id>.md`.
2. Include `Trigger`, `Conditions`, `Actions`, and `Output` sections.
3. Run `node md-os/os/compile_programs.js`.
4. Inspect `md-os/ops/compiled/programs.json`.

For workplace role onboarding from a messy handover:

This is the path for forming MD-OS APFC against a real job role when the company
has no clean training package and can only provide files, exports, procedures,
examples, and scattered notes.

Give the assisted new hire the real work surface through MCP where available:
mail, calendar, agenda, planning boards, tickets, documents, folders, internal
apps, and other bounded resources. The goal is to use the company's existing
tools without forcing a new custom API project before onboarding can start.
These resources should be systems and sessions already authenticated and
authorized for the new hire, supervised by the new hire during the work.

1. Create or let the builder create `md-os/ops/roles/<role_id>/ROLE.md`.
2. Drop raw material into `md-os/ops/roles/<role_id>/intake/raw/`.
3. Run `cortex role intake <role_id>`.
4. Inspect `inventory.md`, `task_map.md`, `candidate_operations.md`, and
   `questions_for_expert.md`.
5. Run `cortex role sensemake <role_id>`.
6. Inspect `analysis/role_understanding.md`, `cases/cases.md`,
   `graph/relation_graph.md`, `analysis/root_cause_candidates.md`, and
   `analysis/work_patterns.md`.
7. Start Codex in the workspace and let the new hire ask MD-OS APFC role-specific
   questions in chat.
8. Use MD-OS APFC to suggest next actions, flag approvals, explain recurring
   patterns, and stop when the role boundary is unclear.
9. Attach available MCP resources for the role's actual tools using the new
   hire's authorized sessions instead of designing bespoke APIs first.
10. Ask the expert only the generated blocking questions.
11. Promote validated candidate operations into `md-os/ops/programs/`.

For a new connector:

1. Read `md-os/kb/CONNECTOR_CONTRACT.md`.
2. Add or update a registry entry in `md-os/ops/connectors/connector_registry.json`.
3. Emit normalized snapshots into `md-os/ops/sources/connectors/`.
4. Rebuild affected project state.

See [CONNECTORS.md](CONNECTORS.md).

## What not to do

- Do not put active runtime state outside `md-os/ops/`.
- Do not let connectors own canonical project truth.
- Do not add unbounded command execution.
- Do not hide memory in a database unless the text-native runtime remains the
  inspectable source of truth.
- Do not make the core repository application-specific.

## Next documents

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [NATURAL_LANGUAGE_AGENTIC_SUBSTRATE_LAYER.md](NATURAL_LANGUAGE_AGENTIC_SUBSTRATE_LAYER.md)
- [HOST_RUNTIME_INTEGRATION.md](HOST_RUNTIME_INTEGRATION.md)
- [EXAMPLE_WORKFLOW.md](EXAMPLE_WORKFLOW.md)
- [CONNECTORS.md](CONNECTORS.md)
- [API_CONNECTOR.md](API_CONNECTOR.md)
- [STANDALONE_AGENT_LOOP.md](STANDALONE_AGENT_LOOP.md)
