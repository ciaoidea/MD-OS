# MD-OS Pro Reasoning Mode

MD-OS (Artificial Prefrontal Cortex) v5.0 cannot change the neural capacity of a host model. It can,
however, spend more external procedure around the host: memory, branching,
tools, tests, correction, persistence, and readback.

This model defines the practical MD-OS procedure for high-stakes reasoning.
It is a procedural scaffold, not a claim about hidden model internals, model
parity, consciousness, or automatic correctness.

The mode is domain-neutral. It must not import domain-specific theory content,
calculation ledgers, connector outputs, or package artifacts unless a separate
task explicitly authorizes that import and classifies the imported material by
runtime lifecycle.

## Core Idea

The host model supplies local reasoning.

MD-OS supplies:

```text
context roots;
branching discipline;
master closure discipline;
verification gates;
epistemic labels;
error memory;
rebuildable files;
readback.
```

The practical goal is:

```text
fewer impulsive answers;
more explicit alternatives;
more tool-checked claims;
more durable correction;
less hidden backfitting.
```

In short:

```text
deeper behavior is approximated by spending more external procedure,
not by pretending the host model changed.
```

## When To Use

Use Pro Reasoning Mode for:

```text
scientific theory work;
mathematical derivations;
physical calculations;
code changes with nontrivial behavior;
referee-facing documents;
architecture decisions;
identity, memory, or operating-model changes;
connector capability or permission changes;
claims that may be reused as source of truth.
```

Do not use the full protocol for simple factual replies, small formatting
edits, trivial mechanical changes, or low-risk local cleanup.

## Mandatory Cycle

Every Pro Reasoning Mode run follows this cycle:

```text
1. root context
2. task frame
3. master closure frame
4. branch set
5. gate selection
6. external verification
7. correction ledger
8. persisted result
9. readback
10. rebuild
```

### 1. Root Context

Load the stable operating context before reasoning deeply:

```text
AGENTS.md
ME.md
md-os/kb/COGNITIVE_BOOTSTRAP.md
md-os/kb/README.md
md-os/kb/OPERATIONS.md
md-os/ops/core/agentic_core.md
md-os/kb/RUNTIME_DISCIPLINE_MODEL.md
md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md
md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md
md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
task-specific source files
```

This turns the filesystem into external working memory.

### 2. Task Frame

Write or state the operational frame:

```text
objective;
scope;
files affected;
non-goals;
known constraints;
success criteria;
failure criteria.
```

For research or theory work, include:

```text
what is already known;
what is assumed;
what must be derived;
what would count as target leakage;
what would falsify or demote the claim.
```

For code or connector work, include:

```text
behavioral contract;
permission boundary;
test surface;
side effects;
rollback or recovery note.
```

### 3. Master Closure Frame

Before branching deeply, define the closure that matters:

```text
master closure statement;
dependency edges;
forbidden shortcuts;
verifier or readback for each edge;
stop/refactor condition;
final closure readback.
```

For all complex work, use:

```text
md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md
```

The host must not raise closure progress merely because a local artifact,
supporting lemma, cleaner package, or plausible numerical match improved.

If no master edge closed, the correct readback is:

```text
method improved; closure unchanged
```

### 4. Branch Set

Before committing to a conclusion, create a small set of alternatives:

```text
branch A;
branch B;
branch C;
why each is plausible;
what would eliminate each branch.
```

For theory-building, branch selection must declare whether it is forced by:

```text
a frozen principle;
a theorem;
a finite scan;
a topological invariant;
a calculation;
a phenomenological target;
a human choice;
an unresolved assumption.
```

If the branch was selected by a target value, the result is at most
retrodictive until a target-independent prediction exists.

For architecture work, branch selection must declare whether it is forced by:

```text
repository invariant;
filesystem contract;
permission model;
runtime lifecycle;
existing builder behavior;
host compatibility requirement;
explicit user instruction;
unresolved implementation risk.
```

### 5. Gate Selection

Before promoting a result, pass the relevant gates:

```text
epistemic lifecycle gate;
scientific validation gate;
reproducibility gate;
source/generated lifecycle gate;
permission and side-effect gate;
failure gate.
```

Canonical sources:

```text
md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md
md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
md-os/kb/RUNTIME_DISCIPLINE_MODEL.md
md-os/kb/PERMISSION_MODEL.md
docs/FILESYSTEM_CONTRACT.md
```

### 6. External Verification

Do not rely on model arithmetic, fluent prose, or visual confidence for
important results.

Use external checks when available:

```text
python or node for numerical and structural checks;
latexmk for TeX reproducibility;
tests for code behavior;
unit and dimensional checks for physical quantities;
schema validation for structured state;
diff/cmp/readback for package verification;
MD-OS builders for generated runtime state.
```

Rule:

```text
If a number matters, compute it outside the LLM.
If a document matters, compile it outside the LLM.
If a package matters, extract it and test it outside the source tree.
If a runtime claim matters, rebuild and read the generated state.
If a connector matters, inspect its permission profile and side effects.
```

### 7. Correction Ledger

Every important correction should record:

```text
error;
cause;
affected files;
correction;
new guardrail;
remaining risk.
```

This is how MD-OS turns mistakes into durable operating knowledge rather than
repeating them in later sessions.

The ledger may live in:

```text
md-os/ops/changes/
md-os/ops/journal.ndjson
the relevant work item
the relevant package README
a stable KB correction note
```

Use append-only proposals for contested edits:

```text
mdos propose-change <target_path> <summary>
```

### 8. Persisted Result

Important results should be saved into the filesystem, not left only in chat.

Use the appropriate path:

```text
md-os/kb/                       stable knowledge
md-os/ops/                      runtime state and work outputs
md-os/ops/roles/<role_id>/      role-specific research and operating material
md-os/ops/artifacts/            generated packages, builds, figures, logs
md-os/ops/local/                host-local scripts and scratch state
docs/                         formal publishable documentation
```

Before adding a new operational path, classify it with:

```text
docs/FILESYSTEM_CONTRACT.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
```

Research files should state their epistemic status:

```text
heuristic;
line_of_thought;
frozen_principle;
derived;
conditional;
retrodictive;
predictive;
corrected;
open;
falsified.
```

### 9. Readback

Before finalizing, read back the actual files or outputs:

```text
open the edited file;
grep for key claims;
compare package files byte-for-byte;
extract PDF text if relevant;
check logs for warnings or errors;
inspect generated state after builders run;
state residual risks.
```

The final answer should report what was verified, not only what was intended.

### 10. Rebuild

After KB or operational source changes, rebuild generated views:

```text
node md-os/os/build_markdown_graph.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_system_hygiene_status.js
node md-os/os/build_health_dashboard.js
node md-os/os/build_global_index.js
```

If the change affects agent identity, objectives, ethics, non-claims, or
operating stance, also rebuild:

```text
node md-os/os/build_agentic_core.js
```

If natural-language programs changed, also run:

```text
node md-os/os/compile_programs.js
```

## Minimal Run Card

For important work, create or include a run card:

```text
Run:
Objective:
Scope:
Inputs:
Branches considered:
Selected branch:
Selection evidence:
External checks:
Epistemic status:
Files changed:
Failure rule:
Residual risk:
Next gate:
```

This can live inside the relevant note, package README, research ledger, work
item, or final report.

## Practical Emulation Map

The metaphorical tree becomes operational in MD-OS as follows:

| Metaphor | MD-OS implementation |
| --- | --- |
| deep roots | bootstrap files, KB, prior work, source readback |
| thick trunk | runtime discipline and lifecycle gates |
| many branches | explicit alternative hypotheses |
| pruning | branch elimination by evidence |
| fruit | verified outputs |
| tree rings | correction history and run cards |
| networked roots | markdown graph and cross-file links |

## Mode Levels

Use the smallest level that protects the work.

| Level | Use case | Required procedure |
| --- | --- | --- |
| `light` | ordinary nontrivial edits | task frame, readback, targeted check |
| `standard` | architecture or code behavior | branch set, gates, tests or builders, readback |
| `full` | source-of-truth claims, research, connector permissions, release material | complete mandatory cycle and persisted run card |

## Non-Claims

Pro Reasoning Mode does not:

```text
make the host model identical to a larger model;
expose hidden model internals;
guarantee correctness;
replace mathematical proof;
turn retrodiction into prediction;
authorize unsafe or unbounded actions;
make imported domain material canonical without explicit lifecycle review.
```

It makes the host runtime more auditable, less impulsive, and more
correction-capable by using MD-OS as an external reasoning scaffold.

## One-Line Rule

```text
MD-OS Pro Reasoning Mode = ordinary host reasoning + filesystem memory +
branching + external verification + correction ledger + rebuildable readback.
```
