# Cognitive Transaction Loop Model

Epistemic status: `operational_contract`

MD-OS accumulates verified operational competence, not context volume and not
self-declared task success.

The Cognitive Transaction Loop is the first kernel path of the model-agnostic
cognitive hypervisor:

```text
human-readable Markdown and policy source
-> typed Cognitive IR
-> bounded connector transaction
-> observed state delta
-> independent postcondition verification
-> proof-carrying episode
-> evaluated reusable competence
```

The existing `cortex agi ...` command family remains a compatibility alias during
the migration. It does not name a separate AGI layer. The preferred command
surface is:

```bash
cortex cognition run-once --task-spec md-os/ops/tasks/<task_spec_id>.json
```

## Truth Invariant

```text
Success(task) =
  TaskSpecVerifiable
  AND ExecutionPolicyPassed
  AND DeclaredActionsReceipted
  AND RequiredStateDeltaObserved
  AND RequiredEvidencePresent
  AND AllAcceptanceTestsPassed
```

Administrative completion, context availability, artifact existence, or an
episode write cannot independently satisfy this invariant.

When the acceptance contract is incomplete, the verdict is `unverified`, not
`success`. When a declared action, postcondition, evidence requirement, or
acceptance test fails, the verdict is `failed`.

## First Cognitive IR

The executable IR now consists of:

```text
TaskSpec
ActionReceipt
VerificationResult
Episode
PlanGraph
```

`PlanGraph` is currently executable in the bounded software-repair benchmark
vertical. Later increments may add temporal Belief, Evidence, SkillProgram, and
causal transition objects without weakening the truth invariant.

### TaskSpec

A TaskSpec is live cognitive task evidence under `md-os/ops/tasks/`. It binds:

```text
goal
constraints
acceptance_tests
risk_budget
resource_budget
required_evidence
unknowns
success_definition
declared_actions
observation_targets
```

Acceptance tests are references to commands already registered in the bounded
terminal connector. The Cognitive Transaction Loop does not accept arbitrary
shell text as an implicit capability.

### ActionReceipt

Every declared action produces an ActionReceipt under
`md-os/ops/action_receipts/` with:

```text
input hash
bounded tool identity
start and completion time
exit status
connector artifacts
state before
state after
observed delta
rollback declaration
readback
```

A receipt proves that an action was attempted and records its consequences. It
does not prove that the task succeeded.

### VerificationResult

The postcondition verifier writes a VerificationResult under
`md-os/ops/verifications/`. It executes the declared acceptance procedures
separately from the transaction executor and checks required evidence and
observed deltas. Its outcome is exactly one of:

```text
verified
unverified
failed
```

Only `verified` maps to an episode verdict of `success`.

### PlanGraph

A PlanGraph binds one repair strategy to a causal hypothesis, applicability,
preconditions, an acyclic inspect/edit/verify graph, predicted state effects,
declared uncertainty, risk, rollback, postconditions, and provider provenance.

Multiple plans are accepted as distinct only when strategy class, mechanism,
semantic graph signature, and patch hash are distinct. A declared probability
or utility is a prediction, not evidence of success. Candidate ranking remains
downstream of the independent postcondition verifier.

The first executable provider path is:

```text
bounded public BenchmarkCase projection
-> CandidateProviderRequest
-> CandidateProviderResult
-> PlanGraph validation and diversity gate
-> CandidateSet v2
-> transactional benchmark runner
-> provider evidence snapshot
```

The controlled fixture provider is development evidence for the protocol only.
It is empirically ineligible and cannot run against holdout cases.

## Promotion Discipline

Skill promotion is opt-in. `run-once` defaults to no promotion.

A successful source episode may create a candidate, but cannot prove that the
candidate improves future performance. `improves` remains false until a
distinct holdout evaluation measures improvement. Promotion additionally
requires evidence from at least two distinct verified episodes, a passing
holdout eval, no regression, risk review, and rollback.

Writing an episode, candidate, eval record, or promotion-gate record is not a
substitute for those conditions.

If a skill claims `cross_domain_transfer`, `tensorial_transformation`, or
`cognitive_unity`, ordinary source and holdout evidence is necessary but not
sufficient. The candidate must cite current hash-bound relative-transformation
evidence and, for unity claims, a hash-bound cognitive-unity state. Every
production manifest
entry must resolve to a safe workspace-relative evidence file whose current
SHA-256 still matches; embedded fixture evidence is not promotion evidence. The
transaction loop, APFC consolidation, and the final APFC promotion transaction
all fail closed when those artifacts are missing, stale, altered, or
fixture-only. See the
[Cross-Domain Cognitive Unity Model](CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md).

## Transaction Boundary

The first executor supports only command references registered in the existing
`terminal_executor` connector. Task artifacts, observation targets, receipts,
and verification files must stay inside `md-os/`.

The connector remains responsible for command allowlisting, bounded output,
redaction, timeout, snapshot emission, and journal readback. Future connector
types must satisfy the same receipt and postcondition contracts before joining
the cognitive transaction path.

## Master Closure For The First Increment

Objective:

```text
replace self-declared success with success grounded in observable task
postconditions
```

Dependency edges:

```text
TaskSpec contract
-> transactional execution
-> ActionReceipt
-> independent acceptance verification
-> truthful verdict and metrics
-> promotion blocked without cross-episode holdout evidence
```

Forbidden shortcuts:

```text
task string present => success
context pack present => success
episode written => task executed
source episode check => skill improvement
promotion requested => promotion allowed
```

Stop/refactor condition:

```text
do not add belief learning, model routing, planner search, or multimodal
representation while the truth invariant can still be bypassed
```

## Deferred Kernel Layers

This first increment does not claim to implement:

```text
probabilistic temporal belief graph
dynamic hybrid context compilation
model broker
metacognitive controller
learned or model-driven multi-plan search beyond the controlled provider
counterfactual simulation
causal credit assignment
holdout skill compiler
learned multimodal APFC encoders
```

Those layers remain downstream of verified outcomes. Training or consolidating
them on self-declared success would preserve the administrative loop under more
sophisticated representations.
