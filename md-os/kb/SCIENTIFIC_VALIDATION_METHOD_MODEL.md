# Scientific Validation Method Model

MD-OS (Artificial Prefrontal Cortex) v5.0 treats scientific work as an operational discipline, not as a
writing style. A manuscript, calculation, research package, or theory note may
be readable and reproducible while still falling short of scientific
validation.

This model defines the domain-neutral scientific validation gate for MD-OS. It
does not import theory-specific content from external repositories, role
workspaces, private notes, or prior research packages unless a separate task
explicitly authorizes that import and classifies the imported material by
runtime and epistemic lifecycle.

## Core Rule

Scientific writing must be controlled by this chain:

```text
question
-> claim
-> assumptions
-> method
-> derivation or experiment
-> independent check
-> uncertainty
-> falsification or demotion rule
-> claim status
```

MD-OS must not promote a scientific claim because the prose is fluent, the
package is organized, the files are reproducible, or a validator passed a
structural check.

For complex theory work, this model is subordinate to the general master
closure discipline:

```text
md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md
```

That means a scientific result may improve the research package or method while
leaving strict scientific closure unchanged.  Strict progress is counted only
when a named dependency edge of the master claim closes with readback.

## Separation Rule

Keep these objects separate:

| Object | Purpose | Promotion burden |
| --- | --- | --- |
| Note | Capture an idea or clue | It is organized into an explicit question or relation. |
| Hypothesis | State a possible answer | Assumptions and failure conditions are declared. |
| Model | Define objects and rules | Definitions, scope, and limits are stable. |
| Derivation | Produce a result from premises | Steps are reproducible and independently checkable. |
| Calculation | Evaluate a formal or numerical procedure | Inputs, code, parameters, and outputs are recorded. |
| Experiment or observation | Compare against the world | Method, data, controls, uncertainty, and bias are explicit. |
| Research package | Make work reviewable | Artifacts are complete, traceable, and attackable. |
| Manuscript | Present a publishable result | The central claim survives the relevant validation gates. |

The forbidden inference is:

```text
reviewable package -> validated science
```

The allowed inference is:

```text
reviewable package -> ready for attack, correction, or promotion review
```

## Mandatory Scientific Work Frame

Before drafting, revising, or promoting scientific work, freeze:

```text
1. scientific question
2. central claim
3. minimum assumptions
4. definitions and variables
5. method of derivation, calculation, experiment, or observation
6. data, constants, priors, or external inputs
7. controls, counterexamples, and alternative explanations
8. uncertainty and error model
9. target declared before readback, if predictive status is claimed
10. failure, falsification, or demotion rule
11. explicit non-claims
12. reproducibility artifacts
13. target audience or venue standard, if a manuscript is being prepared
```

If any item is unknown, the artifact can still be useful, but its status must
remain `heuristic`, `line_of_thought`, `conditional`, `open`, or another
appropriately limited status.

## Scientific Validation Gate

For important scientific work, apply these gates before calling a result
validated, ready for publication, or referee-facing.

### 0. Master Closure Gate

```text
master claim
dependency edges
forbidden shortcuts
verifier for each edge
stop/refactor rule
closure readback
```

If the work opens new prerequisites repeatedly without closing a master edge,
stop the local route and refactor around a principle, invariant, symmetry,
known-limit recovery, no-go theorem, or smaller closure.

### 1. Scope Gate

```text
one central question
one central claim
bounded assumptions
bounded output
explicit non-claims
```

If the work expands into a whole research program, split it into a main result,
supporting derivations, audit package, and program notes.

### 2. Epistemic Lifecycle Gate

Every claim must carry one of the statuses governed by
`EPISTEMIC_LIFECYCLE_MODEL.md`:

```text
heuristic
line_of_thought
frozen_principle
derived
conditional
retrodictive
predictive
corrected
open
falsified
```

The status belongs to MD-OS, not to the calculation engine or writing surface.

### 3. Method Gate

The method must state what kind of evidence is being used:

```text
formal proof
symbolic derivation
numerical calculation
simulation
experiment
observational comparison
literature synthesis
engineering validation
```

Each method requires its own standard. A numerical match is not a proof, a
simulation is not an experiment, and a literature synthesis is not direct
validation unless the scope says so.

### 4. Independence Gate

Scientific validation requires at least one independent pressure point:

```text
alternative derivation
unit or dimension check
counterexample search
control case
known-limit recovery
test data held out from fitting
replication script
external calculator or tool
review by a hostile reader
```

If no independent pressure point exists, the claim remains `open`,
`conditional`, or `derived under declared assumptions`.

### 5. Leakage Gate

Separate inputs from targets.

```text
calibration input != prediction target
readback target != strict prediction
post hoc explanation != prospective validation
```

A result is predictive only when the target, timestamp or version, input state,
assumptions, and comparison procedure were declared before readback.

### 6. Reproducibility Gate

Important scientific outputs must record:

```text
source files
data inputs
scripts or tool commands
parameters
environment assumptions
generated artifacts
checksums or stable identifiers when useful
readback result
```

Reproducibility proves that the procedure can be repeated. It does not by
itself prove that the premises are true or that the conclusion is scientifically
validated.

### 8. Uncertainty Gate

State the uncertainty appropriate to the method:

```text
mathematical gap
numerical tolerance
statistical error
systematic error
instrumental limit
model dependence
sample bias
external-constant dependence
unknown unknown
```

If uncertainty is not quantified, bounded, or explained, the claim cannot be
promoted to a strong scientific status.

### 9. Falsification Or Demotion Gate

Every promoted claim needs a visible rule for what would demote it:

```text
failed theorem step
dimension failure
counterexample
non-reproducible output
known-limit mismatch
experimental disagreement
target leakage
unsupported assumption
scope creep
```

MD-OS should preserve corrections as source edits, change proposals, generated
state, journal events, or replayable artifacts.

### 10. Manuscript Gate

Before calling a manuscript publication-ready, answer:

```text
What is the single central claim?
Which method carries the paper?
Where is the derivation, experiment, or evidence?
Which assumptions are imported?
Which quantities are fitted, read back, or convention-dependent?
What would a hostile reader attack first?
What is explicitly not claimed?
Does the target venue require a narrower claim or stronger proof burden?
```

If any answer is vague, downgrade the artifact to:

```text
internal research draft
```

## Validator Limitation

Validators may prove:

```text
files are present
schemas are valid
formulas were evaluated consistently
commands ran with recorded inputs
outputs are reproducible
declared statuses are internally coherent
```

Validators do not automatically prove:

```text
premises are true
the proof is complete
the model is physically inevitable
the experiment is unbiased
the result is predictive
the paper is publication-ready
```

If a validator checks a statement but not the derivation, the claim status must
say so.

## Claim Promotion Rule

Promote claims only through visible evidence:

```text
heuristic -> hypothesis
hypothesis -> method-framed work item
method-framed work item -> derived or tested result
derived or tested result -> independently checked result
independently checked result -> validated or publication-candidate claim
failed gate -> corrected, conditional, open, or falsified
```

The promotion record should state:

```text
previous status
new status
evidence
gate passed
gate failed or waived
remaining risk
next falsification target
```

## Relation To Other Models

This model strengthens:

```text
md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md
md-os/kb/MD_OS_PRO_REASONING_MODE.md
md-os/kb/RUNTIME_DISCIPLINE_MODEL.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
```

The combined guardrail is:

```text
organized != validated
reproducible != true
dimensionally valid != physically anchored
retrodictive != predictive
publication-shaped != publication-ready
```
