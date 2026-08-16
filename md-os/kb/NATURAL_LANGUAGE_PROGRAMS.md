# Natural-Language Programs

MD-OS turns natural language from a conversational interface into a persistent
operational programming layer.

Another way to say this in familiar LLM terms: a program is a durable,
inspectable prompt fragment with a required shape. It can be edited by humans,
compiled into runtime JSON, audited, replayed, and reused by multiple host
runtimes.

Programs are Markdown files with a verifiable shape:

```text
md-os/ops/programs/<program_id>.md
```

Required sections:

- `Trigger`
- `Conditions`
- `Actions`
- `Output`

The deterministic compiler is:

```bash
node md-os/os/compile_programs.js
```

It writes:

```text
md-os/ops/compiled/programs.json
md-os/ops/compiled/programs.md
```

This lets natural-language instructions become persistent operating programs
that can be inspected, edited, compiled, audited, and replayed.
