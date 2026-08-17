# MD-OS Semantic Shell

`mdos-console` is the MD-OS port of the working Cortex semantic shell. The port
preserves the shell runtime and replaces its Ollama model call with the Codex
CLI. It is not a web console, a browser interface, or a virtual allowlisted
filesystem.

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
│   └── handled in the persistent Python REPL process
├── first token resolves to a native executable
│   └── complete original line executed by the detected host shell
└── otherwise
    └── Codex receives the complete line and linked MD-OS Markdown instructions
        └── `AGENT: answer`  -> display text
        └── `AGENT: code`    -> display source
        └── `AGENT: os`      -> validate one command, print `COMMAND:`, execute
        └── `AGENT: code+os` -> validate script, print `COMMAND:`, execute
```

There is no Python keyword classifier for natural language. Already-valid
machine syntax does not consume a model turn. Everything else is routed by
Codex from the complete human meaning.

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
- `COMMAND: <command>` readback before execution;
- execution with the current user's authority.

## What changed from Cortex

Only the identity and model backend changed materially:

```text
Cortex identity -> MD-OS semantic shell
Ollama API       -> `codex exec`
Cortex rules     -> MD-OS shell programs plus repository `AGENTS.md`
```

Each semantic turn starts an ephemeral Codex process with a read-only Codex
sandbox and obtains its final text through `--output-last-message`. The shell
then applies the same tagged-output validation used by Cortex before displaying
or executing the result. The default Codex model comes from the user's Codex
configuration.

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
MD-OS semantic orientation and output validation do not constitute containment
of an adversarial or compromised writer.
