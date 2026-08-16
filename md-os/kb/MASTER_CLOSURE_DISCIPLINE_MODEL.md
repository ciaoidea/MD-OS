# Master Closure Discipline Model

MD-OS must prevent work from becoming a sequence of locally successful actions
that never closes the real objective.

This model is domain-neutral.  It applies to science, mathematics, software
architecture, connector design, robotics, publication, knowledge import,
operations, and release work.

The core discipline is:

```text
define the master closure;
decompose it into dependency edges;
count progress only when an edge closes;
reject local work that proliferates targets without closing an edge.
```

## Core Rule

Every nontrivial task must distinguish:

```text
local artifact progress
supporting lemma progress
master closure progress
```

Local artifacts may be useful.  Supporting lemmas may be correct.  But neither
counts as master closure unless it closes a named dependency edge of the
objective.

## Master Closure Frame

Before extended work, define:

```text
1. objective
2. master closure statement
3. dependency edges
4. forbidden shortcuts
5. verification command or readback for each edge
6. stop/refactor condition
7. final closure readback
```

The master closure statement must be falsifiable or operationally checkable.

Bad:

```text
improve the system until it works
```

Good:

```text
the connector is complete only when capability, permission profile, dry-run,
side-effect log, recovery note, schema validation, and replay pass
```

## Cross-Domain Shapes

### Scientific Theory

```text
principle
-> central object
-> equation/action
-> derivation
-> known-limit recovery
-> prediction/falsifier
```

### Mathematical Proof

```text
statement
-> definitions
-> lemmas
-> main implication
-> counterexample search
-> proof checker or independent review
```

### Software Architecture

```text
invariant
-> API/contract
-> implementation
-> tests
-> migration path
-> runtime readback
```

### Connector

```text
capability
-> permission profile
-> input/output schema
-> dry-run or sandbox
-> side-effect log
-> recovery/rollback
-> registered readback
```

### Robotics Or Hardware Operation

```text
mission objective
-> safety envelope
-> simulation or read-only proof
-> actuator boundary
-> telemetry readback
-> recovery state
```

### Knowledge Import

```text
raw source custody
-> manifest
-> extraction
-> lifecycle classification
-> epistemic classification
-> promotion plan
-> rebuild/readback
```

### Publication

```text
central claim
-> method
-> evidence
-> uncertainty
-> falsification/demotion rule
-> reproducible package
-> manuscript readiness
```

## Progress Discipline

For complex work, report three progress classes:

```text
artifact_progress
method_progress
closure_progress
```

`artifact_progress` may rise when files, scripts, notes, packages, or indexes
are added.

`method_progress` may rise when the workflow becomes more controlled,
auditable, reproducible, or safer.

`closure_progress` may rise only when a dependency edge of the master closure
changes from `OPEN` to `CLOSED` with readback.

If no edge closes, say:

```text
method improved; closure unchanged
```

## Anti-Proliferation Rule

After two consecutive local steps that open new prerequisites without closing a
master edge, stop and refactor.

Required readback:

```text
target proliferation detected
current master edge still open
new strategy required: symmetry, invariant, contract, no-go, or smaller closure
```

This prevents infinite useful-looking work.

## Symmetry And Invariant Preference

When many outputs appear independent, prefer a unifying structure:

```text
symmetry
invariant
conservation law
commutant
contract
canonical functor
single schema
single builder
single permission profile
```

Do not solve ten knobs one by one if a master object can remove the knobs.

## Forbidden Progress Claims

Do not say:

```text
almost closed
basically done
just one more gate
TOE-like
production-ready
verified enough
```

unless the exact master closure edge is named and its verifier passed.

## Final Readback Template

Every master-closure run should report:

```text
master closure: OPEN/CLOSED/FALSIFIED
closed edges:
open edges:
local artifacts added:
method improvements:
closure progress changed: yes/no
if yes, which edge:
new risks:
next single edge:
```

## Relation To Existing MD-OS Models

This model is upstream of domain-specific methods:

```text
SCIENTIFIC_VALIDATION_METHOD_MODEL.md
CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md
CONNECTOR_CONTRACT.md
PROJECT_OPERATING_MODEL.md
ROBOTIC_AGENTIC_PROGRAMMING_MODEL.md
KNOWLEDGE_IMPORT_METHOD_MODEL.md
RUNTIME_DISCIPLINE_MODEL.md
```

Each domain can specialize the master closure shape, but no domain should
discard the master closure discipline.
