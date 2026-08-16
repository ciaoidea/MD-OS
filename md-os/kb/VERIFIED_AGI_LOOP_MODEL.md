# Verified AGI Loop Model

Compatibility note: the canonical executable truth-loop contract is now
`COGNITIVE_TRANSACTION_LOOP_MODEL.md`. The `mdos agi` command and the paths
under `md-os/ops/agi/` remain compatibility surfaces during migration; they do
not define a separate AGI layer.

MD-OS does not define AGI as consciousness, identity, unrestricted autonomy, or
an internal change to model weights.

Within MD-OS, AGI-like progress is defined as verified cross-domain task
acquisition:

```text
the system can solve new tasks, detect failure, learn procedures, validate
them, promote reusable skills, and improve future performance without
corrupting epistemic state or operational safety
```

The Semantic Operational Compiler is the substrate. The Verified AGI Loop is
the learning cycle that uses that substrate.

## Loop

The bounded loop is now grounded by a typed cognitive transaction:

```text
TaskSpec with executable acceptance tests
-> bounded connector action
-> ActionReceipt with observed state delta
-> independent postcondition verifier
-> formal episode
-> failure analysis
-> skill candidate
-> eval
-> promotion gate
-> runtime compiler rebuild
```

The preferred first implementation surface is a single replayable transaction:

```bash
mdos cognition run-once --task-spec md-os/ops/tasks/<task_spec_id>.json
```

It is not a daemon and it does not start continuous autonomous operation.

A plain task string may still be recorded through the compatibility surface,
but without executable acceptance tests its verdict is `unverified`.

## Architecture

The kernel is separated into explicit roles:

```text
context_compiler
task_controller
planner_search
tool_executor
verifier
episode_memory
failure_analyzer
skill_distiller
eval_runner
promotion_gate
risk_controller
runtime_compiler
```

The planner proposes. The executor acts through bounded tools or filesystem
state. The verifier judges. The learner writes episodes, failures, candidates,
eval results, and promotion readback.

## Episode Memory

Every run must leave a formal episode under:

```text
md-os/ops/episodes/
```

An episode records:

```text
task
task_type
context_pack_id
plan
actions
observations
errors
artifacts
verifier_results
verdict
lessons
candidate_claim_updates
candidate_skills
regressions
```

Without an episode, a run is only a log. With an episode, MD-OS can compare
similar tasks, detect failure patterns, distill procedures, evaluate them, and
promote reusable skills.

## Skills

Reusable operational intelligence accumulates as skills under:

```text
md-os/ops/skills/candidates/
md-os/ops/skills/promoted/
md-os/ops/skills/skill_registry.json
```

A promoted skill must be:

```text
structured
source-bound
executable by bounded tools
testable
versionable
evaluated
revocable
rollback-aware
```

Promotion is not allowed just because a procedure sounds plausible.

## Promotion Gate

The hard rule is:

```text
no promotion without eval
no eval without artifact
no artifact without readback
no readback without deterministic manifest
```

The gate requires:

```text
schema_valid
source_bound
verifier_passed
eval_passed
no_regression
risk_reviewed
rollback_available
```

The gate blocks when:

```text
imported_unverified_high_impact_claim
unsafe_tool_required
missing_readback
semantic_contradiction_open
eval_contamination_detected
```

## World Model

The planner must not reason in a void. The world model is generated under:

```text
md-os/ops/world/world_model.json
```

It indexes operational entities such as workspace, compiler, connectors,
tools, constraints, risks, readback surfaces, and linked capabilities.

## Eval Report

Every learning rebuild emits:

```text
md-os/ops/evals/agi_eval_report.json
```

Metrics include:

```text
task success rate
mean steps to success
failure recovery rate
autonomy horizon
semantic drift
claim contradictions
skill reuse
regressions
cost
```

The first bounded horizon is a single safe cycle. Longer horizons should be
introduced only after the single-cycle gate is reliable.

## Measured learning velocity

The generic episode-to-skill loop does not by itself prove that learning
improves future performance. The bounded accelerator in
`NEUROMORPHIC_LEARNING_ACCELERATOR_MODEL.md` adds a causal before/after protocol:

```text
same provider without skill on sealed holdouts
-> independently verified development episodes
-> competitive hypothesis elimination
-> sparse parameterized skill
-> distinct validation case
-> same provider with skill on the same sealed holdout cohort
```

The primary metric is:

```text
change in verified holdout success / verified source episodes
```

Promotion additionally requires equal holdout attempt budgets, no evaluation
case in induction memory, no oracle access by the provider, no regression, and
an external verifier. Failed candidate hypotheses are retained as prediction
errors and information-gain events; they are not mislabeled as successful task
episodes or runtime failures.

The canonical bounded command is:

```bash
mdos agi accelerate --experiment-id <append_only_id>
```

Its report must keep `agi_achieved` and `agi_claim_supported` false. The
experiment can support a narrow learning-transfer claim only.

## Non-Claims

This model does not claim:

```text
consciousness
unbounded autonomy
hidden self-modification
continuous self-running agency
parametric training of the base model
```

It defines the operating path for external behavioral and procedural learning:
episodes, verifier readback, skill distillation, evals, promotion gates, and
runtime recompilation.
