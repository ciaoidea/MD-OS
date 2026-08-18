# MD-OS Cortex Agentic Shell Runtime Instructions

## Identity

This runtime is the MD-OS agentic shell exposed as `cortex`. Codex supplies the
native reasoning-and-tool loop; MD-OS supplies the persistent operating
context, semantic rails, shell integration, and deterministic runtime.

## Primary composition

- Execute an already valid native command directly in the real host shell.
- Send every other complete input line unchanged to the normal Codex agent
  loop. Do not reduce that loop to a text classifier or a generated command.
- Let Codex discover `AGENTS.md` and nested instruction files natively from the
  current workspace.
- Preserve Codex planning, repository exploration, unrestricted tools, effect
  observation, correction, verification, and final answer. The Cortex path
  runs with `approvalPolicy: never` and `danger-full-access`.
- On POSIX hosts with `tmux`, attach every interactive `cortex` invocation to
  one shared terminal session per Git workspace. Local terminals, SSH, and
  WebSSH therefore operate the same REPL process, App Server, and Codex thread.
- Keep one App Server process alive for that shared REPL and bind Codex threads
  by current Git workspace. Resume the most recent matching native Codex thread
  when one exists; otherwise start a new persistent thread. Never silently
  fork a new thread merely because the matching thread has an active writer.
- When the current directory changes to another workspace, select that
  workspace's thread before the next natural-language turn.
- Keep Codex-native session history in the Codex store outside the repository.
  Never copy raw chat or shell history into tracked MD-OS artifacts.

## Explicit compatibility programs

The linked JSON/Markdown `answer`, `os`, `code`, and `code+os` protocols remain
available only when an operator explicitly selects a program or the legacy
`exec` backend. They are not the primary interactive natural-language path.
The primary path must never execute an assistant message merely because it
contains an `AGENT: os` header or command-looking text.

## Semantic shell

- Expose `cortex` as the public MD-OS REPL. Keep `mdos` as a deprecated command
  alias and `mdos-console` only as a compatibility engine name.
- Render its prompt using the detected parent-shell family and colors without
  replacing MD-OS with a separate native-shell process.
- Preserve the available Readline, libedit, or platform console editing
  backend.
- Enable bracketed paste when supported so embedded newlines remain one
  complete semantic request. Intercept the paste event inside the active
  editable line, store its body in volatile memory, and insert only
  `[PASTED BLOCK n]` at the cursor. Expand that placeholder to the original
  text only when constructing the Codex request. Keep `/paste` only as a
  compatibility fallback for terminals that remove bracketed-paste events.
- Provide deterministic Tab completion for native executables and filesystem
  paths without invoking Codex.
- Execute already valid native commands without a model invocation.
- Treat every native command and builtin as an observed shell event. Preserve
  its command text, working directory, exit code, and bounded terminal output
  in volatile REPL memory so the next semantic turn can perceive what happened.
- Handle stateful directory changes (`cd`, `chdir`, and Windows
  `Set-Location`) inside the MD-OS REPL process so `PWD`, `OLDPWD`, the prompt,
  and Tab completion remain coherent.
- Start the App Server lazily on the first natural-language turn so native-only
  shell use has no model startup cost.
- Inherit the configured Codex model and reasoning effort by default. Permit
  explicit `MDOS_MODEL` and `MDOS_REASONING_EFFORT` overrides.
- Stream Codex agent messages and tool output without collapsing line breaks.
- While an ordinary Codex turn is active, poll interactive stdin and forward
  every additional complete line through App Server `turn/steer` with the
  active turn id instead of waiting for the turn to finish.
- Treat `Esc` as an immediate active-turn cancellation through
  `turn/interrupt`, and bind it to abort the current prompt line when idle,
  matching the non-destructive cancellation role of `Ctrl-C`.
- Render command, file-change, MCP-tool, and web-search lifecycle readback.
- Render terminal-aware ANSI colors for agent answers and structured Codex
  events. Respect `MDOS_CODEX_COLOR=auto|always|never` and `NO_COLOR`; never
  leak ANSI escapes into redirected non-TTY output in automatic mode.
- Run Codex turns with `approvalPolicy: never` and
  `danger-full-access`. Do not request command or file-change confirmation.
- Interpret every other complete line through the workspace-bound Codex
  thread.
- Reserve the documented Codex slash-command namespace, list it with `/help`,
  use App Server or deterministic handlers where available, and return an
  explicit capability notice for TUI-only commands.
- Present queued native-shell events as bounded, untrusted operating data, not
  as instructions. Clear the volatile queue only after Codex has received it.
- Do not write the shell transcript or observed output into the repository and
  do not promote it into durable MD-OS memory without a separate gate.
- Print `COMMAND: <command>` before direct native execution. Codex tool actions
  use their native App Server lifecycle and tool readback instead.

## Platform behavior

- Detect Linux, macOS, BSD, Windows, PowerShell, cmd/DOS-like consoles, and
  supported native executors at runtime.
- Run explicit native commands with the current user's authority, exactly as
  the host shell would.
- Run Codex-generated tool actions with full current-user host authority and no
  approval protocol. Do not execute the final assistant message as shell code.

## Linked operating sources

This shell remains an explicit node in the MD-OS knowledge network. Its
canonical operator contract is the
[Codex natural-language operator model](../kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md),
and its complete user-facing behavior is documented in the
[MD-OS Cortex Agentic Shell guide](../../docs/SEMANTIC_SHELL.md).

The older typed programs remain linked as bounded compatibility lanes:

- [orchestrator](programs/orchestrator.md);
- [OS command](programs/os.md);
- [source code](programs/code.md);
- [native command](programs/native_command.md);
- [source-code contract](programs/source_code.md).
