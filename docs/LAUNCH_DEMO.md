# Launch Demo

The launch demo should show the core MD-OS (Artificial Prefrontal Cortex) v5.0 idea in under one
minute:

```text
Markdown program -> compiler -> AI host action -> MCP adapter -> bounded tool -> Markdown state update
```

## Split-Screen Storyboard

Left side:

- MCP-compatible host or terminal client
- host calls `mdos_register_signal`
- host can call `mdos_compile_programs`
- host then calls `mdos_build_project` or `mdos_replay`

Right side:

- Obsidian opened at the MD-OS (Artificial Prefrontal Cortex) v5.0 workspace
- `md-os/ops/global_index.md`
- `md-os/ops/agenda/global_agenda.md`
- `md-os/ops/projects/demo_general_system/agenda.md`
- `md-os/ops/projects/demo_general_system/work_items.ndjson` if showing raw state

## Demo Flow

1. Start from a fresh workspace:

```bash
npx --package md-os-apfc mdos init my-agent-os
cd my-agent-os
```

2. Open the folder in Obsidian.

3. Start the MCP server:

```bash
npm run mcp:server
```

4. In the host, call:

```text
mdos_register_signal
```

with:

```json
{
  "project_id": "demo_general_system",
  "summary": "Prepare the MD-OS launch demo with Obsidian-visible runtime state."
}
```

5. Show Obsidian updating:

```text
md-os/ops/projects/demo_general_system/agenda.md
md-os/ops/agenda/global_agenda.md
md-os/ops/global_index.md
```

6. Call:

```text
mdos_replay
```

7. End on:

```text
matched_before: true
```

## README Caption

Use a short caption above the GIF:

```text
An agent writes state through MCP. MD-OS rebuilds readable Markdown. Obsidian
shows the agent's memory and agenda as normal files.
```

## Launch One-Liner

```text
MD-OS (Artificial Prefrontal Cortex) v5.0 is a Markdown-native Operating Filesystem for persistent AI agents, robotic systems, and host tooling: MCP-compatible, Obsidian-friendly, and built on readable files instead of hidden state.
```
