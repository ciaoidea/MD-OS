# Codex Natural Language Operator Model

Natural language is the command interface for MD-OS operation. It is not the
stable memory of the system by itself.

The stable form is:

```text
natural language intent
-> bounded task frame
-> provenance and before/after semantic delta
-> semantic commitment gate when canonical state may change
-> repository artifact
-> schema or test
-> command readback
-> replay
-> runtime compiler rebuild
-> final report
```

This model applies when a coding host such as Codex operates the repository.
The host may receive natural-language instructions, read the codebase, edit
files, and run commands, but the work is complete only when the repository
contains the durable artifacts that preserve and verify the result.

## Operating Formula

```text
Natural language = command surface
AGENTS.md = operating constitution
schemas = grammar
tests = externalized reality checks
replay = verified memory
compiler = cognitive runtime readback
```

The operator should not leave important rules in conversational context.
Security policy, claim status, skill promotion rules, command contracts,
episode format, eval criteria, and identity gates must be stored in the
repository.

For nontrivial repository navigation, Graphify is the default first-pass graph
orientation layer. The operator should prefer:

```bash
cortex graphify orient "<question>"
```

before broad file reads when a current graph exists, and should refresh the
graph with:

```bash
cortex graphify build .
```

when the graph needs to evolve with current files, connectors, schemas, audit
artifacts, or knowledge nodes.

## Task Frame

A well-formed natural-language task should be converted into:

```text
goal
scope
forbidden paths
required outputs
acceptance criteria
master closure frame when the task is complex
epistemic rules
execution rules
verification commands
final readback
```

If the user gives an underspecified task, the host should infer a conservative
scope from the current repository contracts. If the missing information would
make the task unsafe or identity-changing, the host should ask a short
clarifying question before editing.

## Hard Rules

- Never introduce autonomous continuous execution unless explicitly requested
  and separately gated.
- Never report closure progress on a complex task unless a named master-closure
  dependency edge closed with readback; use
  `md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md` when a task risks target
  proliferation.
- Never modify host-local, unsafe, secret, credential, publication-sensitive,
  or append-only audit files unless explicitly requested.
- Never promote a claim, skill, capability, identity element, connector, or
  permission expansion without verifier readback.
- Every new runtime artifact must be schema-valid when a schema exists, or must
  be accompanied by a schema/proposal when it creates a new runtime class.
- Every operation must produce readback.
- Every learning cycle must write an episode.
- Every promoted skill must have an eval.
- Every build-relevant change must be covered by a focused test or an explicit
  verification command.
- Runtime generated outputs should be rebuilt by builders, not edited by hand.
- Challenge remains admissible and must retain its source and non-canonical
  status; replacement requires the authority appropriate to the affected claim.
- No critique, inference, or editorial proposal becomes an authorized project
  interpretation without provenance, before/after semantic readback, invariant
  comparison, and the required approval.
- Classify an edit by its effective semantic delta, not by its stated editorial
  intention. Added, removed, negated, broadened, or narrowed propositions must
  be routed as semantic revisions.
- Treat editorial correction as reasoned semantic work. `Editorial` means that
  the verified before/after delta preserves or clarifies the supported thesis;
  it does not mean unreasoned or merely mechanical wording work.
- Do not constrain exploration, criticism, hypotheses, or drafts merely because
  they conflict with a canonical thesis. Constrain their promotion into memory,
  canonical knowledge, decision, action, identity, or publication.

## Verification Ladder

Use the smallest sufficient verification first, then broaden based on risk.

For JavaScript, runtime logic, schemas, or build-output contracts:

```bash
npm run check
npm test
npm run build:all
npm run replay
npm run replay
```

For runtime compiler changes:

```bash
node --test test/runtime_compiler.test.js
```

For verified learning-loop changes:

```bash
node --test test/agi_loop.test.js
```

For documentation and knowledge-base changes that affect semantic or operating
state:

```bash
node md-os/os/build_semantic_commitment_gate.js status
node md-os/os/build_markdown_graph.js
node md-os/os/mdos.js graphify build . --no-viz
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_semantic_knowledge_graph.js
node md-os/os/agi_loop.js eval
node md-os/os/build_runtime_compiler.js
node md-os/os/build_global_index.js
node md-os/os/build_health_dashboard.js
```

## Output Discipline

The final report should state:

```text
files changed
commands run
tests passed or failed
runtime outputs changed
health status
unresolved risks
```

The report should be short, concrete, and grounded in generated readback.

## Prompt Template

```text
Goal:
[desired result]

Scope:
[allowed files or directories]

Do not modify:
[forbidden paths or state classes]

Required outputs:
[files, schemas, tests, runtime artifacts]

Acceptance criteria:
[commands and readback that must pass]

Semantic commitment frame when meaning may change:
- provenance class
- claim class
- transition from possibility space to commitment space
- propositions before and after
- added, removed, negated, broadened, or narrowed propositions
- affected and superseded invariants
- authority and approval evidence
- challenge status when no canonical effect is requested

Epistemic rules:
- every claim must have status
- complex tasks use a master closure frame
- progress is counted only when a master edge closes
- every operation must have readback
- every promoted skill must have eval
- no identity update without explicit gate

Execution rules:
- make the smallest sufficient change
- run targeted checks first
- then run full checks when risk or scope requires it
- report exact commands and results
```

## MD-OS Specific Rule

For MD-OS, the correct operating path is:

```text
prompt
-> diff
-> focused test
-> full test when needed
-> build
-> replay
-> health/readback
-> compiler rebuild
```

The host should never ask the user to trust a conversational answer when the
repository can produce a stronger artifact, test, replay, or generated readback.

## Unified Agentic Shell Path

The public `cortex` command can fuse a real host shell with the native Codex
agent loop without reducing either layer:

```text
human input
├── valid native command
│   -> host shell
│   -> bounded observation
└── natural language
    -> current workspace
    -> native Codex thread list/resume/start
    -> AGENTS.md discovery
    -> reason -> plan -> explore -> tool -> act with full host authority
    -> observe -> correct -> verify -> report
```

The layers have distinct responsibilities:

```text
shell = continuous interaction, cwd, commands, pipes, processes
Codex = plastic reasoning, planning, repository exploration, and tool use
MD-OS = identity, method, persistent operational context, semantic gates,
        policy, bounded authority, executors, sensors, verifiers, and ledger
```

MD-OS must preserve Codex's native agent cycle on this path. It may orient,
constrain, observe, verify, and persist commitments, but it must not replace the
cycle with a classifier whose final output is executed as one unrestricted
host command. Direct human commands retain host-shell authority. Agent-selected actions run with full current-user host authority and no approval
prompts. Final assistant text
is never itself an executable capability.

Codex-native thread history remains outside the repository. Workspace changes
select workspace-specific threads; raw conversation and shell history do not
become canonical MD-OS memory without the semantic commitment gate.
