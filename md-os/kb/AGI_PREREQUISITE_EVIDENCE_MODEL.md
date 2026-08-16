# AGI Prerequisite Evidence Model

## Purpose

This model defines an executable, falsifiable suite for five capabilities that
must exist before MD-OS can support a broad general-intelligence claim:

```text
cross-domain transfer
+ novel compositional invention
+ persistent autonomous curriculum
+ continual learning without promoted regressions
+ bounded long-horizon autonomy
```

The suite is invoked with:

```bash
mdos agi prove \
  --experiment-id <append_only_id> \
  --cycles 96 \
  --sessions 6
```

Equivalent npm entrypoint:

```bash
npm run agi:prove -- \
  --experiment-id <append_only_id> \
  --cycles 96 \
  --sessions 6
```

The command is fail-closed. One failed criterion, a contaminated learner
request, a broken ledger, a regression that reaches promotion, or an incomplete
cycle budget makes the master report `critical`.

## Claim policy

The suite separates operational evidence from labels:

```text
five operational prerequisite edges pass: possible
AGI achieved:                           false
AGI claim supported:                    false
```

A passing internal run demonstrates the five capabilities only inside the
specified symbolic program-synthesis environment. It does not establish
open-world general intelligence. External sealed domains, independent
replication, materially different task families, and substantially longer
wall-clock deployment remain necessary.

This boundary is enforced by schema constants in:

```text
md-os/schemas/agi_evidence_suite.schema.json
```

The schema requires:

```text
agi_achieved = false
agi_claim_supported = false
externally_replicated = false
open_world_validation = false
indefinite_operation_proven = false
```

## Executable architecture

The implementation is a two-speed learning system with neuromorphic design
analogies. It is symbolic software, not a biological neural simulation.

```text
public examples
    -> isolated fast learner
    -> candidate program
    -> independent hidden-test oracle
    -> append-only episodic evidence
    -> structural/semantic consolidation
    -> protected skill registry
    -> replay and rollback gate
    -> persistent autonomous curriculum
```

The components are:

```text
md-os/kernel/cognition/general_program_synthesis.js
md-os/kernel/cognition/agi_task_factory.js
md-os/kernel/cognition/agi_evidence_suite.js
md-os/os/general_synthesis_worker.js
md-os/os/run_agi_evidence_suite.js
```

The synthesis language contains typed `filter`, `map`, and `reduce` primitives.
Programs are executable compositions, not free-form text assertions. Candidate
success is determined only by exact output equality on hidden tests.

### Fast episodic memory

Every learner request, learner receipt, verification result, curriculum event,
and checkpoint is written as inspectable evidence. Campaign events form a
SHA-256 hash chain. Each run is append-only under a unique experiment ID.

### Slow semantic memory

Verified structural sketches and executable programs become reusable skills.
Cross-domain transfer moves an abstract operation sketch between domains while
keeping source and holdout primitive identifiers disjoint.

### Novelty signal

The invention archive tracks exact program hashes and structural sketches. A
program counts as invented only when it is absent from the initial archive,
passes independent hidden tests, and cannot be recovered by the declared
shallower control.

### Curriculum signal

The autonomous teacher ranks procedurally generated candidates from public
metadata and learning state only:

```text
0.34 * challenge fit
+ 0.24 * absolute learning progress
+ 0.20 * novelty
+ 0.12 * domain diversity
+ 0.10 * frontier fit
```

Target programs and hidden tests are not visible to the policy.

### Consolidation and metaplasticity

Every proposed skill is evaluated against cumulative hidden-test replay. A
broad interfering update is deliberately injected. The candidate must be
rejected and rolled back before promotion when it damages a protected skill.

### Homeostasis

Search depth, candidate count, process permissions, cycle budget, and promotion
conditions are bounded. This prevents an apparent gain from being produced by
uncontrolled compute, hidden oracle access, or silent regression.

## Gate 1: cross-domain transfer

### Hypothesis

A structural sketch learned in two source domains should reduce search cost and
increase holdout success in unrelated domains.

### Source domains

```text
numeric sequences
text sequences
```

### Sealed holdout domain families

```text
structured operational records
graph edges
spatial sensor cells
```

Source and holdout domain families are disjoint. Primitive identifiers are also
disjoint. Only the abstract sketch is transferred.

### Causal controls

Each holdout receives three runs with the same search depth and candidate
budget:

```text
baseline:       no learned sketch
sham control:   irrelevant map>filter sketch
learned:        source-induced filter>map sketch
```

The gate passes only when:

```text
source tasks independently verified
+ learned sketch supported by at least two source domains
+ baseline success = 0
+ sham-control success = 0
+ learned success = all holdouts
+ equal candidate budgets
+ no oracle or hidden-test leakage
```

This establishes a bounded causal transfer effect. It does not establish
transfer between arbitrary real-world domains.

## Gate 2: novel compositional invention

### Hypothesis

The learner should construct complete programs not present in its skill archive
and beyond the complexity available to a retrieval-depth control.

The challenge set uses three new domain families and requires depth-four
compositions:

```text
transaction aggregation
message information accounting
network route costing
```

The three targets must also occupy three different structural regions of the
grammar. The canonical set therefore requires these distinct sketches:

```text
filter>map>map>reduce
map>map>map>reduce
filter>filter>map>reduce
```

For every challenge:

```text
depth-2 enumerative control must fail
+ depth-4 bottom-up synthesis must pass public examples
+ independent hidden tests must pass
+ exact program hash must be novel
+ structural sketch must be novel
+ all challenge sketches must be pairwise distinct
+ program must be absent from the initial skill archive
+ no shallower public-example-equivalent program may exist in the searched DSL
```

The bottom-up search prunes duplicate public-example behaviors and expands the
frontier by increasing depth. The depth limit is a runtime parameter, so the
grammar is expandable. The reference run remains finite; therefore it supports
novel compositional invention, not literally unbounded creativity.

## Gate 3: persistent autonomous curriculum

### Hypothesis

The system should generate, rank, attempt, verify, and retain new tasks without
a human selecting each next task.

At every cycle it procedurally creates candidates around the current complexity
frontier. The curriculum policy observes:

```text
competence estimate
absolute learning progress
novelty
recent domain diversity
frontier distance
```

It does not observe hidden tests or target programs. The task source has no
terminal catalog state; execution stops only at the explicit cycle budget.

Persistent state includes:

```text
current cycle and frontier
competence statistics
skill registry
novelty archive
fault history
session history
hash-chain head
horizon curve
```

Fresh Node processes resume the same state across sessions. Every cycle emits a
checkpoint.

## Gate 4: continual learning without promoted regressions

### Hypothesis

New verified skills should be acquired sequentially without reducing retained
performance on earlier tasks.

The suite measures:

```text
final average accuracy
average forgetting
backward transfer
promoted regression count
detected pre-promotion regressions
rollback count
```

For task `i`, forgetting is:

```text
max historical accuracy_i - final accuracy_i
```

The gate requires:

```text
final average accuracy = 1
average forgetting = 0
promoted regressions = 0
at least one interfering proposal detected
rollback verified
```

The implementation uses immutable context-routed skills plus full replay. This
is an operational continual-learning mechanism. It is not evidence that one
shared neural parameter vector learned all tasks without forgetting.

## Gate 5: bounded long-horizon autonomy

### Hypothesis

The learning loop should continue across many decisions and fresh process
restarts, protect accumulated skills, recover from bounded faults, and require
no human intervention.

The default reference campaign executes:

```text
96 autonomous learning decisions
6 fresh process sessions
5 clean restarts
```

A controlled transient resource fault is injected every 29th cycle. A
compression/interference proposal is tested every 17th successful cycle. The
campaign must:

```text
complete the full cycle budget
+ resume persistent state after every restart
+ use distinct process IDs
+ advance complexity frontier from depth 1 to depth 4
+ recover every injected transient fault
+ retain all verified skills under replay
+ preserve a valid append-only hash chain
+ record zero human interventions
```

This is bounded long-horizon evidence. It is not proof of indefinite operation
or multi-month unattended deployment.

## Learner isolation and contamination audit

The learner runs as a separate Node process under the permission model. Its
read allowlist contains only:

```text
general_synthesis_worker.js
general_program_synthesis.js
the single public request file
```

The learner has no filesystem write permission, no child-process permission,
no worker-thread permission, and no oracle path. Requests are recursively
scanned for forbidden fields:

```text
target_program
target_program_hash
target_sketch
hidden_tests
oracle
oracle_digest
ground_truth_program
holdout_answers
```

After execution, the master audit re-reads every request and receipt, verifies
request hashes, checks permission receipts, checks one-to-one request/receipt
cardinality, and verifies that oracle readback occurred after learner process
completion.

## Evidence layout

A run writes:

```text
md-os/ops/agi/generality_experiments/<experiment_id>/
  manifest.json
  report.json
  report.md
  evidence_integrity.json
  learner_requests/
  learner_receipts/
  verifications/
  cross_domain_transfer/
  open_ended_invention/
  continual_learning/
  autonomous_campaign/
    state.json
    events.ndjson
    checkpoints/
    sessions/
    report.json
    report.md
```

`manifest.json` records the Node environment and SHA-256 hashes of the runtime
source files. `evidence_integrity.json` hashes every generated evidence file and
provides a root digest. The autonomous ledger independently hash-chains every
campaign event.

## Reference acceptance matrix

The canonical v3 run is:

```text
md-os/ops/agi/generality_experiments/
  agi_generality_reference_20260718_v3/
```

The reference report is the source of truth. A valid run should show:

```text
cross-domain baseline success:           0
cross-domain sham-control success:       0
cross-domain learned success:            1
novel verified programs:                 3
novel structural sketches:               3
continual final average accuracy:        1
continual average forgetting:            0
promoted regressions:                    0
autonomous cycles:                       96
autonomous retained accuracy:            1
human interventions:                     0
contamination audit:                     ok
```

## Falsification conditions

The suite is not considered successful when any of these occurs:

```text
same-domain or primitive-identifier overlap invalidates transfer isolation
baseline or sham control already solves the holdout
learned transfer does not improve holdout success
candidate program appears in the initial archive
hidden tests enter a learner request
learner receives write or child-process permission
an interfering skill is promoted
average forgetting exceeds zero
campaign state cannot resume after restart
ledger content is modified without detection
an injected fault remains unrecovered
human intervention count exceeds zero
any of the five evidence reports is critical
```

## Research lineage

The design draws on four established ideas without claiming biological
fidelity:

```text
McClelland, McNaughton, O'Reilly (1995): complementary fast and slow learning
Kirkpatrick et al. (2017): protection against catastrophic forgetting
Wang et al. (2019) and Enhanced POET: open-ended environment/challenge generation
Portelas et al. (2019): absolute-learning-progress curriculum selection
```

The MD-OS implementation converts those ideas into inspectable symbolic
programs, process isolation, replay gates, append-only state, and executable
acceptance tests.
