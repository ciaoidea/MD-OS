# MD-OS Control Console Runtime

This experimental runtime adds a second, separate entrypoint to MD-OS:

```text
bootstrap-md-os-codex.sh
  -> Codex operates MD-OS for development

mdos console start
  -> MD-OS owns the interaction loop and invokes Codex as a bounded proposal engine
```

It does not replace or invoke `bootstrap-md-os-codex.sh`.

The first implementation uses stable non-interactive `codex exec` calls with:

```text
ephemeral session
read-only sandbox
JSON Schema output
deterministic model bypass for preauthorized native read-only commands
no automatic execution of model proposals
explicit human approval for every model action proposal
registered module routes only
```

Start it locally:

```bash
mdos console start
```

The HTTP server binds only to `127.0.0.1`. Interaction history is kept in
memory while human commands and bounded event metadata are written to private,
Git-ignored local history by default. Full transcripts require the explicit
`--save-chat` option.
