# Neuromorphic Learning Accelerator Model

## Purpose

This model defines a bounded, falsifiable learning accelerator for MD-OS. Its
purpose is not to relabel the runtime as AGI. Its purpose is to increase verified
learning velocity:

```text
learning velocity
= change in sealed-holdout success
  / independently verified source episodes
```

The numerator must come from previously unseen cases. The denominator must
include every verified episode used for induction. Attempts, regressions, cost,
and human intervention are reported separately so a higher score cannot be
manufactured by spending more search at evaluation time.

The executable entrypoint is:

```bash
mdos agi accelerate --experiment-id <append_only_id>
```

The command runs one finite experiment. It is not a daemon and does not enable
continuous autonomous execution.

## Claim boundary

A successful run supports only this claim:

```text
Within one declared hypothesis family, MD-OS induced a reusable procedure from
independently verified development episodes and improved on sealed, distinct
holdout cases at a controlled attempt budget.
```

It does not establish:

```text
open-domain AGI
cross-domain transfer
unbounded invention
continual autonomous self-improvement
parametric training of the host model
long-horizon autonomy
```

The report therefore carries explicit fields:

```text
narrow_learning_transfer_supported
agi_achieved = false
agi_claim_supported = false
```

## Two-speed architecture

The accelerator implements a complementary two-speed learning system.

### Fast episodic memory

Each development run becomes an append-only episode only after an independent
oracle verifies at least one candidate. The episode retains:

```text
public learning examples
verified candidates
oracle-rejected hypotheses
provider and benchmark receipts
source split and provenance
```

Rejected candidates are recorded as `prediction_errors`. They are learning
signals, not operational failures, and therefore do not corrupt the runtime
failure index.

### Event-driven plasticity

The hypothesis population is updated only when an observation eliminates at
least one currently consistent hypothesis. Non-informative observations do not
create a plasticity event.

For an update from `H_before` to `H_after`:

```text
surprise_bits = log2(|H_before| / |H_after|)
```

This makes the update budget proportional to information gained rather than to
raw episode volume.

### Competitive sparse code

The current bounded family has four binary constraints and therefore sixteen
possible conjunctions. Inconsistent hypotheses are inhibited. Consolidation
uses a winner-take-all code:

```text
one active hypothesis / sixteen available hypotheses
sparse-code density = 0.0625
```

The winning unit decodes to the selected structural constraints. This is a
computational design inspired by sparse competitive coding; it is not a claim
that the implementation reproduces biological neurons.

### Entropy-prioritized replay

Verified episodes are replayed in descending prediction-entropy order with a
deterministic tie-break. Episodes that divide the surviving hypothesis set most
evenly are consolidated first. Replay is limited to development evidence.
Validation and holdout cases never enter the induction input.

### Slow skill consolidation

The slow store receives a parameterized skill only when:

```text
at least two independently verified development episodes exist
+ source cases are distinct
+ one hypothesis is uniquely identified
+ every required constraint has supporting and corrective evidence
```

The skill transfers structure, not repository-specific strings. On a new
repository it infers the source path, variable, delimiter, valid prefix, failure
return, and output shape from the bounded public snapshot and visible regression
checks.

### Homeostatic promotion gate

Consolidation does not imply promotion. A candidate skill is promotable only
when it passes:

```text
distinct validation case
+ sealed holdout cohort
+ positive before/after delta
+ equal single-attempt holdout budget
+ zero contamination
+ zero regressions
+ independent verifier readback
+ rollback contract
```

This gate prevents high plasticity from becoming uncontrolled skill growth.

## Bounded induction family

The first accelerator experiment targets delimited boundary validators. The
hypothesis language is:

```text
exact_arity
prefix_match
payload_nonempty
payload_charset
```

The sixteen candidate hypotheses are the powerset of these constraints. Two
development repositories provide complementary counterexamples:

```text
development episode A identifies exact arity and prefix matching
development episode B identifies non-empty payload and allowed payload alphabet
```

Together they identify one complete grammar. The consolidated skill then
infers target-specific parameters on one validation repository and two sealed
holdout repositories with different functions, delimiters, prefixes, and return
shapes.

## Controlled experiment

The causal sequence is fixed:

```text
1. Run the same provider without skills on one validation case.
2. Run the same provider without skills on two sealed holdout cases.
3. Explore five competing hypotheses on each of two development cases.
4. Write two independently verified episodes.
5. Eliminate inconsistent hypotheses and consolidate one sparse skill.
6. Run the skill once on the distinct validation case.
7. Run the skill once on each sealed holdout case.
8. Audit contamination and equal attempt budgets.
9. Evaluate, gate, and promote only if every closure edge passes.
```

The provider process receives only its descriptor, request, and implementation
file through the Node permission model. It receives no oracle programs,
expected outputs, case ground truth, holdout examples, or prior holdout results.
The external oracle executes only after candidate generation in an isolated Git
worktree.

## Primary measurements

Every successful report records:

```text
before_success_rate
 after_success_rate
absolute_delta
success_delta_per_verified_episode
information_gain_bits_per_episode
hypotheses_eliminated_per_episode
exploration_candidate_count
baseline_holdout_attempts
learned_holdout_attempts
regression_count
human_interventions
total_measured_cost
total_latency_ms
```

The primary acceptance condition is:

```text
after_success_rate > before_success_rate
and baseline_holdout_attempts = learned_holdout_attempts
and contamination_detected = false
and regression_count = 0
```

## Reference experiment

The repository reference run is:

```text
md-os/ops/agi/learning_experiments/neuromorphic_transfer_20260718_v2/report.json
```

Its expected controlled result is:

```text
verified development episodes:          2
hypotheses:                              16 -> 1
information gain:                       4 bits
information gain per episode:           2 bits
sealed holdout success before learning: 0 / 2
sealed holdout success after learning:  2 / 2
absolute holdout delta:                 1.0
success delta per verified episode:     0.5
holdout attempts before/after:          2 / 2
regressions:                            0
human interventions:                    0
contamination:                          false
```

These numbers are acceptance targets until the corresponding report exists. In
a packaged or live workspace, the report is the source of truth.

## Runtime artifacts

The experiment writes:

```text
md-os/ops/tasks/
md-os/ops/verifications/
md-os/ops/episodes/
md-os/ops/evals/
md-os/ops/skills/candidates/
md-os/ops/skills/promoted/
md-os/ops/agi/learning_experiments/<experiment_id>/
md-os/ops/agi/neuromorphic_learning_status.json
md-os/ops/agi/neuromorphic_learning_status.md
```

The report runtime class is defined by:

```text
md-os/schemas/neuromorphic_learning_experiment.schema.json
```

Each experiment directory is append-only. Reusing an experiment identifier is a
hard conflict.

## v3 generality extension

The repository now includes a separate executable suite that closes the next
five operational evidence edges in a controlled symbolic environment:

```bash
mdos agi prove \
  --experiment-id agi_generality_reference_20260718_v3 \
  --cycles 96 \
  --sessions 6
```

The v3 suite adds:

```text
cross-domain transfer with disjoint primitive identifiers
+ equal-budget baseline and irrelevant-sketch causal control
+ novel depth-four compositional program synthesis
+ an autonomously selected procedural curriculum
+ cumulative replay, interference detection, and rollback
+ persistent state across fresh process restarts
+ injected transient-fault recovery
+ an append-only hash-chained campaign ledger
+ a complete evidence integrity manifest
```

Its protocol is defined in:

```text
md-os/kb/AGI_PREREQUISITE_EVIDENCE_MODEL.md
```

Canonical evidence is written under:

```text
md-os/ops/agi/generality_experiments/<experiment_id>/
```

## Remaining external closure

Passing the v2 accelerator and the v3 generality suite does not make the AGI
claim true. The evidence remains internally authored, finite, and bounded to a
symbolic program-synthesis substrate. A broad claim still requires:

```text
independently authored sealed domains
+ external replication by other operators
+ materially open-world tasks and tools
+ repeated seeded cohorts with uncertainty intervals
+ substantially longer wall-clock deployment
+ resource, safety, and regression performance under changing environments
```

The package therefore records:

```text
operational_agi_prerequisites_supported = true  # only when all five v3 gates pass
agi_achieved = false
agi_claim_supported = false
```
