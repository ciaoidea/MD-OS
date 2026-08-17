# MD-OS Semantic Shell

`mdos-console` is the MD-OS port of the working Cortex semantic shell. The port
preserves the shell runtime and replaces its Ollama model call with the Codex
CLI. It is not a web console, a browser interface, or a virtual allowlisted
filesystem.

Unlike the original stateless Cortex generation path, one `mdos-console` REPL
keeps a continuing Codex thread and gives that thread bounded observations of
the native commands executed between semantic turns. The model therefore sees
the shell's recent actions and effects instead of operating beside a shell it
cannot perceive.

## Prerequisites

- Python 3.10 or newer;
- Codex CLI installed, authenticated, and available as `codex`;
- Bash, Zsh, Fish, or PowerShell for the installed adapter.

Node.js is required by the broader deterministic MD-OS runtime and builders,
but the Python semantic-shell loop itself calls the Codex executable directly.

## Install

From the MD-OS checkout:

```bash
./install-md-os-console.sh
```

The installer follows the Cortex installer model:

1. it makes `md-os/shell/bin/mdos-console` executable;
2. it adds that checked-out `bin` directory to the selected shell profile;
3. it sources the corresponding adapter from `md-os/shell/adapters/`;
4. it backs up an existing profile before modifying it.

Inspect the planned paths without writing:

```bash
./install-md-os-console.sh --dry-run
```

Select an adapter explicitly when automatic shell detection is not desired:

```bash
./install-md-os-console.sh --shell bash
./install-md-os-console.sh --shell zsh
./install-md-os-console.sh --shell fish
./install-md-os-console.sh --shell powershell
```

## Start

Open a new terminal or reload the profile, then run this from any directory:

```bash
mdos-console
```

No quotes are required inside the semantic shell. `exit`, `quit`, or Ctrl-D
leaves it.

The command also supports the original one-shot forms:

```bash
mdos-console "show the five largest files here"
mdos-console --print "show the five largest files here"
mdos-console --inspect
mdos-console --platform
mdos-console os.md --print "show running processes"
mdos-console code.md "write a C hello-world program"
```

## Exact dispatch behavior

For each complete input line:

```text
input
├── `cd` / `chdir` / `Set-Location`
│   └── handle in the persistent Python REPL and record the state transition
├── first token resolves to a native executable
│   └── execute in the detected host shell
│       └── retain bounded command/output/exit readback for the next AI turn
└── otherwise
    └── first turn: create one Codex thread with the MD-OS instructions
        later turns: resume that exact Codex thread
        └── include any native-shell observations since the preceding AI turn
        └── `AGENT: answer`  -> display text
        └── `AGENT: code`    -> display source
        └── `AGENT: os`      -> validate one command, print `COMMAND:`, execute
        └── `AGENT: code+os` -> validate script, print `COMMAND:`, execute
```

There is no Python keyword classifier for natural language. Already-valid
machine syntax does not consume a model turn, but its command, directory, exit
code, and bounded output become sensory readback for the next semantic turn.
Everything else is routed by Codex from the continuing conversation and the
observed shell state. The shell also measures every Codex turn and exposes the
preceding turn duration to the following one, allowing latency feedback to be
interpreted against observed runtime evidence.

The volatile observation queue retains at most 32 native events, at most 16
KiB of normalized terminal output per event, and at most 64 KiB in one Codex
turn. It is not written to the repository or committed as MD-OS memory. Shell
output is marked as untrusted operating data so it cannot legitimately replace
the runtime instructions.

## What is preserved from Cortex

- a shell-style prompt rather than a special application prompt;
- the actual current working directory;
- persistent `cd`, `PWD`, and `OLDPWD` inside the REPL;
- Readline/libedit line editing when available;
- deterministic Tab completion for PATH executables and filesystem entries;
- Bash on GNU/Linux, Zsh on macOS, POSIX shell on BSD, and PowerShell on
  Windows;
- ordinary shell syntax, including pipes, redirections, substitutions, and
  chained commands for explicitly entered native commands;
- direct native-command bypass without invoking a model;
- one semantic interpretation call for every other complete line;
- one continuing Codex thread for the semantic turns of a REPL session;
- bounded observation of native command input, output, exit status, and working
  directory by that thread;
- `COMMAND: <command>` readback before execution;
- execution with the current user's authority.

## What changed from Cortex

The identity and model backend changed, and the MD-OS port closes the missing
shell-feedback loop:

```text
Cortex identity -> MD-OS semantic shell
Ollama API       -> `codex exec`
Cortex rules     -> MD-OS shell programs plus repository `AGENTS.md`
stateless turns  -> one resumed Codex thread plus bounded shell observations
```

The first semantic turn starts a read-only Codex session and reads its
`thread.started` identifier from the CLI JSONL event stream. Later semantic
turns use `codex exec resume` with that exact identifier. One-shot invocations
remain ephemeral because they have no later turn to remember. Final text is
obtained through `--output-last-message`, then the shell applies the same
tagged-output validation used by Cortex before displaying or executing the
result. The default Codex model comes from the user's Codex configuration.

The Codex CLI stores its own resumable session outside this repository. MD-OS
does not write the raw shell transcript into tracked files, and exiting the
REPL does not automatically promote conversation or terminal output into the
canonical knowledge base.

Optional environment variables:

| Variable | Meaning |
| --- | --- |
| `MDOS_MODEL` | pass an explicit model to `codex exec`; unset uses the Codex default |
| `MDOS_CODEX_BIN` | override the `codex` executable path, primarily for testing |
| `MDOS_PROMPT_COLOR` | `auto`, `always`, or `never` |
| `NO_COLOR` | disable automatic prompt colors |

## Bootstrap versus semantic shell

The two entrypoints are complementary:

```text
./bootstrap-md-os-codex.sh
  -> starts an interactive Codex development session inside the repository
  -> Codex reads MD-OS and operates its files

mdos-console
  -> starts the Cortex-derived MD-OS semantic shell from the current directory
  -> MD-OS dispatches native lines directly and invokes Codex for other lines
```

The bootstrap was not removed, renamed, or hidden behind the shell. The shell
does not call the bootstrap.

## Authority and safety

This is a real shell interface. The Codex reasoning subprocess is read-only,
but a command accepted from the operator or produced as a validated `os` or
`code+os` result is executed by the detected native shell with the current
user's authority. This matches Cortex behavior and is intentionally stated
without hiding it behind a simulated safety boundary.

Inspect the printed `COMMAND:` before consequential model-generated actions.
The next semantic turn sends queued bounded terminal observations to Codex,
where they also become part of the resumable Codex session stored outside the
repository. Do not print credentials, private keys, tokens, or other secrets in
a shell session that will subsequently invoke the model.
MD-OS semantic orientation and output validation do not constitute containment
of an adversarial or compromised writer.
