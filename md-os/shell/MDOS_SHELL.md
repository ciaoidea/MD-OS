# MD-OS Semantic Shell Runtime Instructions

## Identity

This runtime is the MD-OS semantic shell. Codex is its language-model backend,
not the shell identity and not a replacement for MD-OS persistent operating
context.

## Composition

- Load and validate the selected JSON manifest and every declared Markdown
  source before invoking Codex.
- Treat Markdown instructions as cumulative.
- Pass the complete human input to the selected agent as the operating request,
  never as runtime configuration.
- Let Codex route meaning. Do not add Python keyword classifiers.

## Agent protocols

- `answer`: return a direct informational response.
- `os`: return exactly one native command for the detected platform.
- `code`: return source code as text and never execute it.
- `code+os`: return one complete native script that performs the requested
  development and operating-system actions.
- Validate the routing header before displaying or executing its body.
- Buffer `os` and `code+os` output completely before execution.

## Semantic shell

- Keep `mdos-console` as the MD-OS REPL.
- Render its prompt using the detected parent-shell family and colors without
  replacing MD-OS with a separate native-shell process.
- Preserve the available Readline, libedit, or platform console editing
  backend.
- Provide deterministic Tab completion for native executables and filesystem
  paths without invoking Codex.
- Execute already valid native commands without a model invocation.
- Handle stateful directory changes (`cd`, `chdir`, and Windows
  `Set-Location`) inside the MD-OS REPL process so `PWD`, `OLDPWD`, the prompt,
  and Tab completion remain coherent.
- Interpret every other complete line through Codex.
- Print `COMMAND: <command>` before native execution.

## Platform behavior

- Detect Linux, macOS, BSD, Windows, PowerShell, cmd/DOS-like consoles, and
  supported native executors at runtime.
- Generate commands only for the detected platform unless the human explicitly
  asks for text about another platform.
- Run native commands with the current user's authority, exactly as the host
  shell would. Codex itself runs read-only and returns text; the shell runtime
  performs any resulting command.
