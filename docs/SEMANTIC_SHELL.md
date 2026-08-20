# MD-OS Cortex Agentic Shell

`cortex` is the public interactive entrypoint for MD-OS. It preserves the real
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
- Bash, Zsh, Fish, or PowerShell for the installed adapter.

## Install

From the MD-OS checkout:

```bash
./install-md-os-console.sh
```

The installer:

1. makes the public `md-os/shell/bin/cortex` launcher and its compatibility
   engine executable;
2. puts that checked-out `bin` directory on the selected shell's `PATH`;
3. sources the corresponding adapter from `md-os/shell/adapters/`;
4. backs up an existing profile before changing it.

Preview the exact paths without writing:

```bash
./install-md-os-console.sh --dry-run
```

Select an adapter explicitly when needed:

```bash
./install-md-os-console.sh --shell bash
./install-md-os-console.sh --shell zsh
./install-md-os-console.sh --shell fish
./install-md-os-console.sh --shell powershell
```

Open a new terminal or reload the configured shell profile after installation.

## Start

Run this from any directory:

```bash
cortex
```

On Linux, macOS, and BSD when `tmux` is available, an interactive invocation
attaches to one shared Cortex session derived from the Git workspace. Running
`cortex` from a local terminal, an SSH login, or WebSSH while inside the same
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

Cortex enables terminal bracketed-paste mode. When a paste occurs inside the
editable line, Cortex immediately stores its complete text in volatile memory
and inserts `[PASTED BLOCK 1]` at the cursor. The operator may continue typing
before or after that placeholder. On submission, Cortex replaces the
placeholder with the original multiline text before sending the request to
Codex; the label itself is never sent. No special command, `.end`, or Ctrl-D is
required. `/paste` remains only as a compatibility fallback for terminals that
remove bracketed-paste events.

One-shot natural-language input also uses the native Codex loop:

```bash
cortex "explain the architecture of this repository"
```

The deterministic MD-OS runtime remains under the same command:

```bash
cortex health
cortex graphify status
cortex replay
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
        └── APFC dynamic input filter
            ├── read bounded canonical operational views
            ├── update or retain bounded private turn attention
            ├── retain mandatory goal/core state
            ├── select additional Markdown blocks by input relevance
            └── expose selected and omitted source paths
        └── reuse the in-process workspace binding when available
            or thread/list -> latest matching native Codex thread
            or thread/start -> a new persistent Codex thread
        └── turn/start with the current cwd
            ├── native AGENTS.md discovery
            ├── reasoning and planning
            ├── repository and state exploration
            ├── workspace-bounded tool use
            ├── deterministic APFC approval decisions
            ├── streamed tool and agent readback
            ├── correction and verification
            └── final answer and Codex-native session persistence
```

While a Codex turn is still running, the REPL continues polling terminal input.
Type another message and press Enter to forward it to the active turn through
the same APFC dynamic input filter and App Server `turn/steer`. It becomes additional user direction for that same
turn; it is not held as a separate later request and does not restart the App
Server. This steering path is enabled for a real interactive TTY, not redirected
one-shot stdin.

Pressing `Esc` while a turn is active sends App Server `turn/interrupt`
immediately, without requiring Enter. At the ordinary prompt, `Esc` aborts the
current editable line like `Ctrl-C`; neither action exits the Cortex REPL.

## Codex slash commands

Cortex reserves every currently documented Codex slash-command name, so slash
input is never misrouted as an ordinary model prompt. `/help` prints the live
catalog. Protocol-backed or deterministic adapters cover `/goal`, `/compact`,
`/rename`, `/fork`, `/new`, `/clear`, `/status`, `/model`, `/diff`, `/review`,
`/exit`, and `/quit`. Commands that require a Codex TUI picker, clipboard, IDE,
desktop app, account dialog, or Windows-only setup remain recognized and return
an explicit capability notice instead of pretending the operation occurred.

There is no Python keyword classifier for natural language and no mandatory
`AGENT: os` / `AGENT: answer` routing header on this primary path. The final
assistant message is text; it is never silently re-executed by the parent
shell. Real model-selected actions happen through Codex tools constrained by
the APFC turn frame, workspace sandbox, and ordinary tool-result events.

The APFC input filter is contextual rather than lexical: it does not classify
requests from a fixed phrase list and does not rewrite the human statement. For
each ordinary input and steering message, it selects bounded Markdown blocks
from the current operational core, active work, continuity, last verified
summary, and health state. Mandatory and relevance-selected sources are
declared inside the context sent to Codex. This makes the APFC causally present
before `turn/start` and `turn/steer`; it is not claimed to be an infallible
safety classifier or an output gate.

Before selecting those blocks, Cortex maintains a private JSON contract at
`md-os/ops/local/apfc/attention.json`: `theme` holds the stable general
objective and `focus` the current point. Substantive requests advance focus; a
minimal continuation retains it; an explicit `theme:` declaration changes both.
Theme is bounded to 384 characters, focus to 256, and the complete dynamic
context to 2 KiB. The frame applies `focus -> theme -> smallest authorized step
-> verifier evidence`. The state is mode `0600`, excluded from publication, and
does not start an autonomous turn or replace `/goal`. The small
continuation recognizer affects only focus retention; it does not classify,
rewrite, authorize, or execute the human request.

Explicit legacy JSON/Markdown programs and `MDOS_CODEX_BACKEND=exec` retain the
older tagged-output protocol only as compatibility paths. They do not define
the normal interactive architecture.

## Workspace-bound continuity

The App Server process starts lazily on the first natural-language request and
stays alive until the REPL exits. Native-only use therefore pays no model
startup cost.

Interactive Cortex processes are first bound to one shared terminal session by
Git workspace on POSIX systems with `tmux`. This makes local, SSH, and WebSSH
entrypoints converge on the same live process rather than merely opening the
same directory in separate processes. Set `MDOS_SHARED_SESSION=never` only when
an intentionally isolated interactive process is required; set it to `always`
to require `tmux` rather than falling back when it is unavailable.

Codex threads are also bound by current Git workspace, falling back to the exact current
directory outside Git. On the first semantic turn in a workspace, `cortex` asks
Codex App Server for the most recent matching `cli`, `vscode`, `exec`, or
`appServer` thread and resumes it. If none exists, it starts one. Moving to a
different repository selects that repository's thread; moving back reuses the
first binding.

This is the missing continuity boundary:

```text
cd ~/projects/project-a
-> resume project-a Codex history and project-a instructions

cd ~/projects/project-b
-> resume project-b Codex history and project-b instructions
```

Codex's own session store remains authoritative for chat history. MD-OS does
not invent a parallel `.bash_history` for conversation and does not copy raw
Codex transcripts into Git.

If another non-shared Cortex process already owns the latest workspace thread,
the new process stops with attach guidance. It does not silently create a new
thread, because doing so would split the suspended discussion into competing
histories. Exit the isolated process and run `cortex` again to enter the shared
workspace session.

## Shell observations

Valid native commands bypass the model completely, but the REPL retains a
bounded observation of their command, directory, exit code, and normalized
terminal output. Those unconsumed observations are attached to the next Codex
turn as operating data, then cleared only after successful delivery.

The volatile queue retains at most 32 events, at most 16 KiB of output per
event, and at most 64 KiB in one turn. It is not written into the repository.
Tool output deltas are rendered without flattening their newlines, so tables,
process lists, test output, and compiler diagnostics retain terminal shape.
The default `full` trace also renders the Codex reasoning summaries made
available by the protocol, plan updates, commands and command input/output,
file changes and diffs, MCP progress, web searches, approvals, and agent
messages. It does not expose private hidden chain-of-thought that Codex does not
publish. Set `MDOS_CODEX_TRACE=compact` to hide reasoning/plan/diff detail, or
`MDOS_CODEX_TRACE=quiet` to keep only essential output and prompts.

Every interactive semantic turn also receives a compact live-legibility
contract. Nontrivial work announces its object and reason before using a tool,
then reports only material doubts, failed assumptions, changed hypotheses,
decisions, or a progress heartbeat when work lasts longer than 60 seconds.
When a material doubt exists, Cortex asks the critical question within the
same turn, tests the hidden premise or failure case, and revises the answer
before committing to it.
These messages are streamed from the same ordinary turn. They do not start an
inner-voice process, a background call, a timer, or a second turn. Simple
answers remain direct. The result is operational
transparency rather than a fabricated transcript of private chain-of-thought.

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

cortex
  -> opens the MD-OS shell from any directory
  -> native input stays shell-native
  -> natural language enters a workspace-bound ordinary Codex agent thread
```

The bootstrap is not called once per shell turn and is not replaced by the
agentic shell. Both paths use Codex as the host runtime while MD-OS carries the
persistent identity, method, semantic gates, and Operating Filesystem.
