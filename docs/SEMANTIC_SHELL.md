# MD-OS Cortex Agentic Shell

`./cortex` is the repository-local interactive entrypoint for MD-OS. It preserves the real
host-shell experience and fuses it with the native Codex agent loop. It is not
a browser console, a simulated filesystem, or a one-command text generator.

The operating rule is intentionally small:

```text
valid native input -> real host shell -> bounded observation
natural language   -> full Codex loop for the current workspace
```

The first path stays immediate. The second path can understand the repository,
load `AGENTS.md`, reason, inspect files and state, plan, use workspace-bounded
tools through the APFC action gate, observe effects,
correct its plan, verify the result, answer, and preserve the Codex thread.

Codex provides the plastic reasoning-and-tool loop. MD-OS provides the
persistent identity and Operational Context as Filesystem: method, memory,
semantic commitment gates, policy, bounded authority, executors, sensors,
verifiers, and ledger readback. `cortex` is where these layers meet the real
interactive shell.

## Prerequisites

- Python 3.10 or newer;
- Codex CLI installed, authenticated, and available as `codex`;
- Node.js 20 or newer for deterministic `cortex` runtime subcommands;
- a POSIX shell for the repository-local launcher (Windows uses the packaged command wrapper).

## Start

No installation or PATH modification is required. From the checkout root:

```bash
./cortex
```


Run `./cortex` from the checkout root. From another directory, use the explicit path to that checkout, for example `/path/to/MD-OS/cortex`.

On Linux, macOS, and BSD when `tmux` is available, an interactive invocation
attaches to one shared Cortex session derived from the Git workspace. Running
`./cortex` from a local terminal, an SSH login, or WebSSH while inside the same
repository therefore displays and controls the same REPL, App Server, active
turn, and Codex thread. Multiple clients may remain attached simultaneously.
Outside Git, the resolved current directory is the session boundary.

The complete startup message is:

```text
MD-OS cortex agentic shell
Native commands run directly; natural language enters the full Codex loop.
Use exit or Ctrl-D to leave.
```

Then type ordinary commands and natural language in the same interface:

```text
ls -la
cd ~/projects/project-a
what did we establish here in the previous session?
inspect the repository, verify the failing test, fix it, and run the checks
```

No quotes, apostrophes, prompt prefix, or special chat command are required.
Use `exit` or Ctrl-D to leave. The compatibility inputs `quit`, `/exit`, and
`/quit` also remain accepted even though the minimal startup text omits them.

Cortex enables terminal bracketed-paste mode. A single-line paste that fits the
current terminal row remains visible literally. For multiline or longer text,
Cortex stores the complete content in volatile memory and inserts
`[PASTED BLOCK 1]` at the cursor. The operator may continue typing before or
after that placeholder. On submission, Cortex replaces the placeholder with
the original text before sending the request to Codex; the label itself is
never sent. No special command, `.end`, or Ctrl-D is required. `/paste` remains
only as a compatibility fallback for terminals that remove bracketed-paste
events.

During an active Codex turn, Cortex keeps input canonical but disables terminal
echo. This prevents partially typed steering text from being interleaved with
streaming assistant or tool output. Pressing Enter prints a separate
confirmation containing the complete short input or `[paste]` for a long input,
then forwards the unchanged text through `turn/steer`.

One-shot natural-language input also uses the native Codex loop:

```bash
./cortex "explain the architecture of this repository"
```

The deterministic MD-OS runtime remains under the same command:

```bash
./cortex health
./cortex graphify status
./cortex replay
```

`cortex` dispatches known deterministic subcommands to `md-os/os/mdos.js`.
Running `cortex` without arguments opens the agentic shell; other free-form input
goes to the shell engine. `mdos` remains a deprecated command alias, while
`mdos-console` remains the compatibility engine name and is
not the public name.

## Exact interactive flow

For every complete input line:

```text
human input
├── cd / chdir / Set-Location
│   └── change the persistent parent REPL directory
│       └── update PWD, OLDPWD, prompt, completion, and observation queue
├── first token resolves to a native executable
│   └── execute immediately in the detected host shell
│       └── preserve bounded command/output/exit readback
└── natural language
    └── resolve current cwd and Git workspace
        └── reuse only the live in-process binding for the same workspace
            or thread/start -> a fresh persistent Codex thread by default
            or explicit /resume -> thread/list then thread/resume
        └── turn/start with the current cwd
            ├── current human request first, unchanged, exactly once
            ├── compact bootstrap only for a new/changed/reset thread binding
            ├── new shell observations and an explicit goal only when present
            ├── native AGENTS.md discovery and on-demand file inspection
            ├── optional bounded `memory search` chosen by Codex when needed
            ├── reasoning and planning
            ├── repository and state exploration
            ├── workspace-bounded tool use
            ├── deterministic APFC approval decisions
            ├── streamed tool and agent readback
            ├── correction and verification
            └── final answer and Codex-native session persistence
```

While a Codex turn is still running, the REPL continues polling terminal input.
Type another message and press Enter to forward the unchanged steering text,
plus only newly produced operational deltas, through App Server `turn/steer`. It becomes additional user direction for that same
turn; it is not held as a separate later request and does not restart the App
Server. This steering path is enabled for a real interactive TTY, not redirected
one-shot stdin.

The bootstrap states the stable operating boundary and the availability of
external memory; it does not claim that the current task is understood. A
nontrivial turn identifies its dependency edges, reads the precise canonical
sources or bounded memory results required by those edges, and then acts or
states that context is insufficient.

Pressing `Esc` while a turn is active sends App Server `turn/interrupt`
immediately, without requiring Enter. At the ordinary prompt, `Esc` aborts the
current editable line like `Ctrl-C`; neither action exits the Cortex REPL.

## Codex slash commands

Cortex reserves every currently documented Codex slash-command name, so slash
input is never misrouted as an ordinary model prompt. `/help` prints the live
catalog. Protocol-backed or deterministic adapters cover `/goal`, `/compact`,
`/rename`, `/fork`, `/new`, `/resume`, `/clear`, `/status`, `/model`, `/diff`, `/review`,
`/exit`, and `/quit`. Commands that require a Codex TUI picker, clipboard, IDE,
desktop app, account dialog, or Windows-only setup remain recognized and return
an explicit capability notice instead of pretending the operation occurred.

There is no Python keyword classifier for natural language and no mandatory
`AGENT: os` / `AGENT: answer` routing header on this primary path. The final
assistant message is text; it is never silently re-executed by the parent
shell. Real model-selected actions happen through Codex tools constrained by
the APFC turn frame, workspace sandbox, and ordinary tool-result events.

The context boundary does not rewrite or summarize the human request. A thread
bootstrap is capped at 4 KiB and is sent only when the App Server thread starts,
the workspace or bootstrap hash changes, or the operator resets the thread. A
reused ordinary turn with no shell observations has at most 2 KiB of auxiliary
context; every turn has one 8 KiB auxiliary ceiling. These are ceilings, not
fill targets. The request is excluded from those budgets and is never truncated
to make room for optional context.

Repository knowledge, generated graph bodies, context packs, private history,
affective directives, reflection directives, and the full APFC governance frame
are not repeated in ordinary prompts. The APFC frame remains structured runtime
state for approval, sandboxing, causal closure, and receipts. Local
`last_turn.md`, `last_summary.md`, KB files, and graph files stay inspectable
through precise workspace reads. A legacy local `attention.json`, if present,
is ignored and is not recreated.

This is a model-visible-context optimization, not a reduction of MD-OS state.
Turn Governance Tensor and operational Unity state, Causal Unity predecision
hashes and dependency probes, authorization dependence, transition closure,
persistent identity and continuity, self-reference, phenomenal-candidate, and
consciousness-event mechanisms remain in their existing runtime/filesystem
paths. They continue to participate causally even when their full textual form
is absent from the prompt. Only the current integrated projection is made
model-visible; stable hashes and identifiers retain the route back to canonical
state. Causal Unity must remain on command/file authorization and transition
carry-forward paths and must never be demoted to optional telemetry.

The admission boundary distinguishes three states: `AVAILABLE`,
`CURRENTLY_RELEVANT`, and `MODEL_VISIBLE_NOW`. Filesystem memory, SQLite,
graphs, identity, continuity, evidence, and research mechanisms may remain
available without being currently relevant or prompt-visible. Ordinary-turn
participation is justified through causal or ablation tests, not architectural
naming. Experimental phenomenal-candidate, self-reference, consciousness-event,
and Unity-field paths remain explicit research capabilities and are inactive in
the default hot path unless a request or declared postcondition activates them.

Historical lookup is explicit and bounded:

```bash
./cortex memory search --query-file query.txt --limit 3 --max-chars 4096 --json
./cortex memory search --query-file query.txt --audit-assistant --json
./cortex context inspect --request-file request.txt --reused-thread --json
```

Ordinary memory search is driven by HUMAN input. Full HUMAN and ASSISTANT text
remains hash-bound in the private chronology; assistant-only terminology is
available only through the explicit audit mode. Search can successfully return
zero nodes. Candidate generation, admission or rejection, informative terms,
score, final rank, and omission reason are returned as inspectable telemetry.

Explicit legacy JSON/Markdown programs and `MDOS_CODEX_BACKEND=exec` retain the
older tagged-output protocol only as compatibility paths. They do not define
the normal interactive architecture.

## Workspace-bound continuity

The App Server process starts lazily on the first natural-language request and
stays alive until the REPL exits. Native-only use therefore pays no model
startup cost.

The REPL also keeps the Python shell engine loaded for its lifetime. Changes to
`md-os/shell/bin/mdos-console` therefore require a process restart: exit the
shared Cortex REPL and run `./cortex` again. `build:all`, graph rebuilds, and
replay refresh generated files but do not hot-reload the running shell engine.
After restart, `cortex context inspect` must expose the current bootstrap hash
and efficient-context budgets; older values indicate that an older process is
still attached.

Interactive Cortex processes are first bound to one shared terminal session by
Git workspace on POSIX systems with `tmux`. This makes local, SSH, and WebSSH
entrypoints converge on the same live process rather than merely opening the
same directory in separate processes. Set `MDOS_SHARED_SESSION=never` only when
an intentionally isolated interactive process is required; set it to `always`
to require `tmux` rather than falling back when it is unavailable.

Codex threads are also bound by current Git workspace, falling back to the
exact current directory outside Git. On ordinary process boot, `cortex`
starts a fresh thread and does not list stored conversations. Later turns reuse
that live thread only while the process remains in the same workspace. Moving
to another repository starts another fresh thread.

This is the default isolation boundary:

```text
cd ~/projects/project-a
-> fresh Codex thread + identity + private folder chronology when present

cd ~/projects/project-b
-> fresh Codex thread + identity + project-b private chronology when present
```

Codex's session store remains available only as optional chat history.
`/resume` explicitly enables one lookup and resume of the latest matching
thread. `/new` and `/clear` close the current App Server and force the next
request through `thread/start`. Fresh threads prefer the verified compact
`portable_state.json` handoff. When that handoff is unavailable, they receive
at most two complete recent exchanges and at most 4 KiB from
`md-os/ops/local/cortex/conversation.ndjson`. Cortex appends each
successful exchange to this private hash chain; it stores human inputs and the
final assistant response, not hidden reasoning, tool traces, model ids, or
Codex thread ids.

The private file has a different transport rule from the repository sources:
a physical copy of the whole folder carries it, while Git ignores it. Therefore
`cp -a`, `rsync -a`, or a full archive can preserve the conversation across
directories or computers, but `git push` and `git clone` cannot. The versioned
`md-os/continuity/portable_state.json` remains a privacy-reviewed operational
summary without a transcript. Set `MDOS_PRIVATE_CONVERSATION=off` to disable
local conversation persistence.

Git privacy and network privacy are separate. Hydration sends the selected
private excerpt to the configured model provider as inference context. A local
model is required if the transcript must not leave the machine at all.

The ordinary context compiler also excludes host-local `last_turn.md` and
`last_summary.md`. They can be inspected only when the current human request
explicitly calls for historical diagnosis; they are not implicit identity or
continuity inputs.

Git-clone-carried operational continuity comes from
`md-os/continuity/portable_state.json`. Cortex imports it only after checking
its self-hash, identity-source hashes, evidence hashes, schema-level field
boundaries, and non-authoritative policy. A rejected capsule is shown as
rejected and contributes no working-context content.

If explicit `/resume` finds that another process owns the stored thread,
Cortex stops with attach guidance. Ordinary fresh boot does not depend on that
thread and therefore does not encounter this conflict.

## Shell observations

Valid native commands bypass the model completely, but the REPL retains a
bounded observation of their command, directory, exit code, and normalized
terminal output. Those unconsumed observations are attached to the next Codex
turn as operating data, then cleared only after successful delivery.

The volatile queue retains at most 32 events and at most 16 KiB of output per
event. Only the newest material that fits the unified 8 KiB auxiliary turn
ceiling is sent to the model. The queue is not written into the repository.
Tool output deltas are rendered without flattening their newlines, so tables,
process lists, test output, and compiler diagnostics retain terminal shape.
The default `full` trace also renders the Codex reasoning summaries made
available by the protocol, plan updates, commands and command input/output,
file changes and diffs, MCP progress, web searches, approvals, and agent
messages. It does not expose private hidden chain-of-thought that Codex does not
publish. Set `MDOS_CODEX_TRACE=compact` to hide reasoning/plan/diff detail, or
`MDOS_CODEX_TRACE=quiet` to keep only essential output and prompts.

Stable communication discipline comes from the thread bootstrap and native
repository instructions; it is not repeated as a per-turn ritual. Nontrivial
work announces its object and reason before using a tool,
then reports only material doubts, failed assumptions, changed hypotheses,
decisions, or a progress heartbeat when work lasts longer than 60 seconds.
When a material doubt exists, Cortex asks the critical question within the
same turn, tests the hidden premise or failure case, and revises the answer
before committing to it.
These messages are streamed from the same ordinary turn. They do not start an
inner-voice process, a background call, a timer, or a second turn. Simple
answers remain direct. The result is operational
transparency rather than a fabricated transcript of private chain-of-thought.

Each completed session turn appends compact metrics to the Git-ignored
`md-os/ops/local/cortex/context_metrics.ndjson`. It records hashes, sizes,
estimated token count, selected source classes, memory-call counts, duplicate
event hashes removed, model-turn count, duration, and deterministic output-gate
verdict. The metrics file is never injected into model context.

## Safety and authority

The two action paths have different authority:

- a command typed explicitly by the human runs directly with the current
  user's host-shell authority;
- a Codex-generated command or file change runs with `approvalPolicy:
  untrusted`, `workspaceWrite`, network disabled, and an APFC decision for
  approval requests.

The APFC gate fails closed without an active turn frame. It rejects external
working directories, network authority, destructive commands, and additional
permission requests. It may approve bounded local commands and workspace file
changes without interrupting the human. Explicit native commands remain a
separate human-controlled path and retain ordinary host-shell authority.

Do not print credentials, private keys, tokens, or other secrets before a
natural-language turn: bounded shell output may be sent to Codex as context.
No shell observation or raw chat is promoted into canonical MD-OS memory
without a separate semantic commitment gate.

## Preserved shell behavior

- actual current working directory;
- persistent `cd`, `PWD`, and `OLDPWD`;
- host-shaped prompt and colors;
- Readline/libedit editing when available;
- deterministic Tab completion for executables and paths;
- pipes, redirections, substitutions, and chained native commands;
- Bash on GNU/Linux, Zsh on macOS, POSIX shell on BSD, and PowerShell on
  Windows;
- direct native-command execution without a model call;
- bounded sensory readback for the following agent turn.

## Codex configuration

The shell inherits the model and reasoning effort from the user's Codex
configuration by default. Optional overrides are explicit:

| Variable | Meaning |
| --- | --- |
| `MDOS_MODEL` | select an explicit Codex model; default: inherit Codex configuration |
| `MDOS_SHARED_SESSION` | `auto` (default), `always`, or `never`; control the POSIX per-workspace shared `tmux` session |
| `MDOS_REASONING_EFFORT` | select a supported effort; default: inherit Codex configuration |
| `MDOS_CODEX_BACKEND` | `app-server` (native persistent path) or `exec` compatibility mode |
| `MDOS_CODEX_BIN` | override the `codex` executable, primarily for testing |
| `MDOS_CODEX_TRACE` | `full` (default), `compact`, or `quiet` event rendering |
| `MDOS_CODEX_COLOR` | `auto` (default), `always`, or `never` for Codex event and answer colors |
| `MDOS_PROMPT_COLOR` | `auto`, `always`, or `never` |
| `NO_COLOR` | disable automatic prompt and Codex colors |

The implementation uses Codex App Server's documented thread lifecycle and
streamed structured items. ANSI colors are rendered locally from item type and
status because the protocol does not supply the Codex terminal client's already
rendered byte stream. See the official
[Codex App Server documentation](https://learn.chatgpt.com/docs/app-server).

## Bootstrap versus `cortex`

The bootstrap still exists and has a separate role:

```text
./bootstrap-md-os-codex.sh
  -> opens the ordinary interactive Codex client in this repository

./cortex
  -> opens the MD-OS shell from any directory
  -> native input stays shell-native
  -> natural language enters a workspace-bound ordinary Codex agent thread
```

The bootstrap is not called once per shell turn and is not replaced by the
agentic shell. Both paths use Codex as the host runtime while MD-OS carries the
persistent identity, method, semantic gates, and Operating Filesystem.
