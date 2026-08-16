# Semantic Neural Overlay Model

MD-OS (Artificial Prefrontal Cortex) v5.0 can be described as a semantic-operational runtime wrapped around a
static LLM core.

This model gives precise language for the
[MD-OS architecture schema](../../docs/md-os-architecture-schema.svg).
It is a conceptual and architectural model, not a claim that MD-OS changes
foundation-model weights or creates an internal neural network inside the LLM.

## Core Thesis

A standard LLM mostly operates through this loop:

```text
prompt -> inference -> response
```

MD-OS adds a persistent semantic-operational layer around that loop:

```text
natural-language intent
  -> semantic task
  -> policy check
  -> connector selection
  -> bounded action or observation
  -> artifact or snapshot
  -> deterministic state rebuild
  -> active memory
  -> next semantic action proposal
```

In compact form:

```text
Static LLM + MD-OS Semantic Runtime = Dynamic Virtual LLM
```

Or:

```text
M0 + S_MD(t) -> Mv(t)
```

Where:

```text
M0      = the monolithic static LLM or host reasoning model
S_MD(t) = the evolving MD-OS semantic runtime over time
Mv(t)   = the dynamic virtual model produced by their combined operation
```

`Mv(t)` is not a new trained foundation model. It is the externally
materialized behavior of a model operating through persistent tasks,
connectors, policies, snapshots, active memory, semantic actions, deterministic
builders, and audit state.

## Claim Boundary

The semantic neural overlay is:

- an external semantic-operational graph
- a filesystem-backed control plane
- a task-completion layer for operational gaps
- a supervised action proposal and execution model
- a way to make model operation persistent, inspectable, and replayable

It is not:

- a new set of LLM weights
- a numerical neural network trained inside the repository
- an AGI claim
- a consciousness or sentience claim
- an unrestricted autonomous execution loop
- a bypass around host permissions, connector policy, or human approval

## From Token Completion To Task Completion

The analogy is:

```text
LLM:
linguistic context + missing word -> next token

MD-OS:
operational context + missing step -> next semantic task
```

The central shift is:

```text
LLMs complete words.
MD-OS completes supervised operational tasks.
```

This does not mean every proposed task should be executed. It means MD-OS can
detect operational gaps, propose candidate next actions, route them through
policy, select bounded connectors, and preserve the resulting artifacts.

## Semantic Operating System For Agents

MD-OS may be described as a semantic operating system for agents if the phrase
is kept inside the repository's non-claims.

The phrase means:

```text
semantic operating system for agents
= semantic Operating Filesystem
+ persistent operating context
+ bounded connectors
+ deterministic builders
+ inspectable state transitions
```

It does not mean:

```text
kernel
Linux replacement
robotics middleware replacement
AGI claim
sentience claim
unrestricted autonomous authority
```

The stricter architectural term remains:

```text
Markdown-native Operating Filesystem
```

The public-facing term is useful because it captures the central operating
shift: language is no longer only prompt text. It becomes a control surface for
supervised semantic actions over persistent state.

## Semantic Gap Filling

The task-completion layer reads operational context such as:

- active memory
- current project and work-item state
- source snapshots
- connector registry entries
- permission and safety policy
- unresolved dependencies
- missing artifacts
- incomplete state transitions
- recent journal and replay evidence

It can then identify gaps such as:

- missing task
- missing connector
- missing confirmation
- missing snapshot
- missing dependency
- missing state transition
- missing next action
- stale generated state
- weak audit evidence

The proposal path is:

```text
semantic gap
  -> candidate task
  -> policy check
  -> connector or builder selection
  -> action schedule or human approval request
```

## Operational Intelligence As Semantic Space

MD-OS creates an inspectable semantic space around the model. Operational
context is not one flat prompt; it is a set of dimensions:

- intent
- memory
- project and work-item state
- connector capability
- permission and safety policy
- dependencies and triggers
- artifacts and snapshots
- expected state transitions
- audit and replay context

These dimensions constrain and enable candidate next actions. In compact form:

```text
semantic dimensions + bounded procedures + persistent state
  -> semantic action field
  -> supervised task completion
```

The intelligence is operationally emergent in a practical, auditable sense. A
single semantic unit may be simple: classify a task, check a policy, select a
connector, rebuild an index, or record an artifact. Many small units can
cooperate through the filesystem, builders, state machines, and connector
contracts to produce a larger field of useful next actions.

The field remains bounded. MD-OS does not execute all possible actions. It
proposes or performs actions only through policy, connector capability,
permission, and explicit state transition rules.

## Filesystem-Backed Semantic Nodes

The semantic neural overlay can be stated more directly:

```text
MD-OS virtualizes semantic-operational nodes on disk.
```

These nodes are analogous to neural nodes by operating role, not by physical or
mathematical substrate. They are not:

```text
biological neurons
foundation-model weights
hidden model activations
a numerical neural network
an independently trained model
```

They are inspectable operating objects:

```text
Markdown knowledge files
natural-language programs
work items
policies
permission profiles
connector registry entries
snapshots
journal events
artifacts
generated indexes
state transitions
```

Their connections are also filesystem objects:

```text
Markdown links
graph edges
project relations
work-item dependencies
connector routes
builder inputs and outputs
agenda schedules
replay evidence
```

This is why the neural metaphor is useful but bounded. MD-OS externalizes part
of the operational structure that would otherwise remain implicit in a model's
transient reasoning context. The result is a persistent, readable, correctable,
and replayable semantic-operational network on disk.

## Semantic Actions

In MD-OS, an action is not merely a shell command or tool call. It is a
meaningful state transition under constraints.

```text
Semantic Action =
  Intent
  + Context
  + Capability
  + Policy
  + Trigger
  + State Transition
  + Artifact
```

Or:

```text
As = f(intent, context, capability, policy, trigger, state_transition, artifact)
```

A semantic action says:

```text
perform this meaningful state transition,
under these constraints,
using this bounded connector or deterministic builder,
and record the result as a persistent artifact or snapshot
```

This is different from:

```text
run this command
```

The command, if one exists, is only the substrate-level implementation detail.
The semantic action is the inspectable operating object.

## Semantic Action Schedule

An agenda says:

```text
what should be done and when
```

A semantic action schedule says:

```text
which action makes sense in the current state,
with which connector or builder,
under which policy,
with which expected artifact,
and with which state transition
```

The schedule is therefore not only temporal. It is semantic, contextual,
policy-governed, and auditable.

## External Neural Structure

The neural metaphor is useful only if it remains external and semantic.

The mapping is:

```text
LLM core          -> central reasoning nucleus
MD-OS runtime     -> external semantic control plane
connectors        -> operational synapses
tasks             -> active semantic units
snapshots         -> memory traces
policies          -> inhibitory/control mechanisms
active memory     -> working memory
semantic actions  -> motor outputs
task completion   -> predictive operational completion
state rebuild     -> plasticity over time
```

The nodes are not neurons in the machine-learning sense. They are operating
artifacts:

- tasks
- snapshots
- connector profiles
- permission rules
- active summaries
- project state
- natural-language programs
- generated indices
- semantic action candidates
- journal and replay evidence

The edges are also operating artifacts or reconstructible relations:

- dependencies
- triggers
- references
- constraints
- state transitions
- source-to-generated rebuild paths
- connector-to-artifact routes
- policy-to-action gates

## Current MD-OS Mapping

The semantic runtime is already partially represented by current MD-OS files:

| Runtime concept | MD-OS representation |
| --- | --- |
| Tasks | `md-os/ops/projects/*/project.json`, work items, agendas |
| Active memory | `md-os/ops/projects/*/active_memory.*`, `md-os/ops/summary/*`, `md-os/ops/core/*` |
| Connectors | `md-os/ops/connectors/connector_registry.json`, connector profiles, `md-os/os/*_connector.js` |
| Snapshots | `md-os/ops/sources/**`, `md-os/ops/artifacts/**`, journal events |
| Policies | `md-os/kb/PERMISSION_MODEL.md`, connector profiles, safety models |
| Semantic actions | natural-language programs, connector runs, builders, proposed state transitions |
| State rebuild | deterministic builders under `md-os/os/` and `mdos replay` |
| Runtime graph | `md-os/ops/markdown_graph.*`, project relations, explicit Markdown links |
| Audit | `md-os/ops/journal.ndjson`, replay report, generated status files |

## Implementation Direction

The next implementation maturity step is not blind autonomy. It is a bounded
task-completion engine that can produce auditable candidate tasks.

Such an engine should:

1. Read active memory, project state, connector registry, policies, and recent
   snapshots.
2. Detect missing dependencies, missing artifacts, stale generated state, or
   incomplete work-item transitions.
3. Produce candidate semantic actions with expected state effects.
4. Classify risk and required authorization before execution.
5. Prefer read-only diagnostics and proposal files by default.
6. Execute only through explicit builders or registered connectors.
7. Write a journal event, artifact, snapshot, or report after action.
8. Rebuild generated state and report from files, not transient chat memory.

## Supervised Generativity

In the current 5.0 release, the human interlocutor remains the primary
high-level generator. Natural language triggers the operating loop:

```text
human instruction
  -> generated task candidate
  -> policy filter
  -> connector or builder selection
  -> controlled execution or proposal
  -> snapshot or artifact
  -> state update
```

A future daemon may propose tasks automatically, but the governance rule stays
the same: it should propose tasks and request approval for risky actions rather
than execute dangerous work without authorization.

## Safe Positioning

Use:

```text
MD-OS is a semantic operating layer for supervised AI agents.
```

Use:

```text
MD-OS transforms a static LLM into a Dynamic Virtual LLM by wrapping it in
an external semantic runtime made of task completion, active memory,
connectors, policies, snapshots, and semantic actions.
```

Use:

```text
MD-OS gives a static LLM an external semantic nervous system.
```

Avoid:

```text
MD-OS trains a new foundation model.
MD-OS changes the model weights.
MD-OS is AGI.
MD-OS is sentient.
MD-OS can autonomously execute any task.
```

## One-Minute Explanation

MD-OS is a semantic operating layer for monolithic LLMs.

A normal LLM is powerful but mostly static from an operational perspective. It
completes language, answers prompts, and can call tools, but it does not
naturally preserve persistent operational state across tasks, connectors,
policies, actions, and memory.

MD-OS wraps the static model with a semantic runtime composed of tasks,
connectors, policies, snapshots, active memory, deterministic builders, and
semantic actions.

The key idea is to extend the completion principle from words to tasks. A
language model predicts missing words from linguistic context. MD-OS predicts
missing operational actions from filesystem-backed operational context.

The result is a Dynamic Virtual LLM: not a new trained neural model, but an
external semantic neural overlay that lets a static LLM behave like a
persistent, inspectable, evolving operational system.
