# Standalone Agent Loop

`md-os/examples/standalone_agent_loop.js` is a minimal host-runtime example.

It shows the formal loop without requiring Codex or another CLI:

```text
read instructions and state
-> send bounded prompt to a model
-> receive JSON decision
-> optionally register source signals
-> rebuild state
-> optionally replay
```

By default it is dry-run. It prints the model decision but does not mutate
runtime state unless `--apply` is passed.

## Run With Ollama

```bash
MDOS_AGENT_PROVIDER=ollama \
MDOS_AGENT_MODEL=llama3.1 \
node md-os/examples/standalone_agent_loop.js "Summarize current runtime state"
```

Default Ollama endpoint:

```text
http://127.0.0.1:11434/api/chat
```

Override with:

```bash
MDOS_AGENT_BASE_URL=http://127.0.0.1:11434/api/chat
```

## Run With An OpenAI-Compatible Endpoint

```bash
MDOS_AGENT_PROVIDER=openai-compatible \
MDOS_AGENT_BASE_URL=https://api.openai.com/v1/chat/completions \
MDOS_AGENT_MODEL=<model> \
MDOS_AGENT_API_KEY=<key> \
node md-os/examples/standalone_agent_loop.js "Create a bounded source signal"
```

## Apply Mode

```bash
node md-os/examples/standalone_agent_loop.js --apply "Create a signal for the demo project"
```

The model must return JSON shaped like:

```json
{
  "summary": "short host decision",
  "signals": [
    {
      "project_id": "demo_general_system",
      "summary": "bounded source signal"
    }
  ],
  "run_replay": true
}
```

Apply mode converts those entries into manual signals and runs the relevant
builders. It does not grant arbitrary shell or connector execution.
