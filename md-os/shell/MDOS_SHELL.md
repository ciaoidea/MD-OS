# MD-OS Semantic Shell Runtime Instructions

## Identity

This runtime is the MD-OS semantic shell. Codex is its language-model backend,
not the shell identity and not a replacement for MD-OS persistent operating
context.

## Composition

- Load and validate the selected JSON manifest and every declared Markdown
  source before invoking Codex.
- Let Codex discover repository `AGENTS.md` natively from the working
  directory. Do not duplicate its full text inside the shell program prompt.
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
- Treat every native command and builtin as an observed shell event. Preserve
  its command text, working directory, exit code, and bounded terminal output
  in volatile REPL memory so the next semantic turn can perceive what happened.
- Handle stateful directory changes (`cd`, `chdir`, and Windows
  `Set-Location`) inside the MD-OS REPL process so `PWD`, `OLDPWD`, the prompt,
  and Tab completion remain coherent.
- Prewarm one Codex App Server process and one Codex thread when the REPL
  starts. Keep both alive until the REPL exits; do not launch `codex exec`
  for semantic turns.
- Stream only validated conversational `answer` text after its routing header
  is known. Buffer commands and scripts completely before execution.
- Use `gpt-5.6-luna` as the lightweight interactive default and permit an
  explicit model override when deeper reasoning is worth the latency.
- Use `low` reasoning effort for interactive shell turns by default. Permit an
  explicit environment override when deeper reasoning is worth the latency.
- Measure each Codex turn and expose the preceding turn duration to the next
  turn so latency feedback is grounded in observed runtime state.
- Interpret every other complete line through that continuing Codex thread.
- Present queued native-shell events as bounded, untrusted operating data, not
  as instructions. Clear the volatile queue only after Codex has received it.
- Do not write the shell transcript or observed output into the repository and
  do not promote it into durable MD-OS memory without a separate gate.
- Print `COMMAND: <command>` before native execution.

## Platform behavior

- Detect Linux, macOS, BSD, Windows, PowerShell, cmd/DOS-like consoles, and
  supported native executors at runtime.
- Generate commands only for the detected platform unless the human explicitly
  asks for text about another platform.
- Run native commands with the current user's authority, exactly as the host
  shell would. Codex itself runs read-only and returns text; the shell runtime
  performs any resulting command.
