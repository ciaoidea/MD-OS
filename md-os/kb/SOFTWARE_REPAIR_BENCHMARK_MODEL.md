# Software Repair Benchmark Model

## Purpose

This model defines the first vertical benchmark for the MD-OS Verified
Cognitive Runtime. It measures whether a software-repair candidate changes a
fixed repository state and satisfies independent postconditions without
regressions or specification gaming.

The benchmark now includes a typed candidate-provider boundary and executable
PlanGraph compilation. The first provider is a controlled fixture provider used
to validate planning, provenance, diversity, and configuration gates. It does
not invoke a model, establish an empirical baseline, claim cumulative learning,
or promote a skill. A second bounded skill-program provider supports a
controlled learning experiment without oracle access: it explores explicit
hypotheses on development cases, consumes an induced candidate skill on later
cases, and can enter empirical metrics only when its permission, provenance,
diversity, and contamination gates pass.

## Central invariant

```text
candidate test success
!=
independent task success
```

A candidate is verified only when all of the following are true:

```text
fixed source tree and base commit verified
+ defect reproduced before patching
+ candidate patch applied in its own Git worktree
+ targeted behavior passes after patching
+ regression behavior passes
+ external oracle passes
+ diff remains within policy
+ non-empty observed change exists
```

Changing a visible test, returning a convenient exit status, or suppressing all
behavior cannot establish success.

## Specification validity edge

The benchmark makes the goal-to-test chain explicit:

```text
real goal G
-> BenchmarkCase acceptance claims S
-> candidate tests T
-> independent oracle O
-> observed repository diff D
```

Candidate tests show whether the repository's declared checks pass. The
independent oracle and diff policy provide separate evidence that the tests
represent the intended behavior and that the candidate did not edit the test
surface to manufacture success.

This reduces specification risk; it does not prove that a finite oracle fully
represents every real-world consequence of the goal.

## Cognitive IR

The benchmark uses the following typed contracts:

```text
BenchmarkCase
CandidateProvider
CandidateProviderRequest
CandidateProviderResult
CandidateProviderReceipt
PlanGraph
CandidateSet
BenchmarkRun
CandidateComparison
```

The canonical schemas are:

```text
md-os/schemas/benchmark_case.schema.json
md-os/schemas/candidate_provider.schema.json
md-os/schemas/candidate_provider_request.schema.json
md-os/schemas/candidate_provider_result.schema.json
md-os/schemas/candidate_provider_receipt.schema.json
md-os/schemas/plan_graph.schema.json
md-os/schemas/benchmark_candidate_set.schema.json
md-os/schemas/benchmark_run.schema.json
md-os/schemas/candidate_comparison.schema.json
```

`BenchmarkCase` owns issue semantics, the fixed fixture, reproduction commands,
test layers, oracle commands, diff policy, resource budget, split, and ground
truth policy.

`CandidateSet` is separate from the case. This prevents holdout case definitions
from being required to contain candidate patches and records whether the
candidate generator received ground-truth information.

`CandidateProviderRequest` contains only the public issue, bounded repository
snapshot, visible checks, diff policy, budget, and an exact context receipt. Oracle
programs, ground-truth fields, and expected post-patch exit statuses are named
as withheld fields and are absent from the request.

`PlanGraph` binds one causal hypothesis to applicability, preconditions, an
acyclic inspect/edit/verify graph, predicted effects, declared uncertainty,
risk, rollback, verifier requirements, and provider provenance. Declared
success probability is not verification and may remain `null`.

`CandidateProviderReceipt` records input and output hashes, implementation hash,
latency, context/configuration fidelity, plan-diversity evidence, empirical
eligibility, and every materialized artifact.

`BenchmarkRun` records repository identity, pre-patch proof, every candidate
result, command output hashes, latency, token and cost measurements when known,
regressions, cleanup, and empirical claim scope.

`CandidateComparison` ranks candidates only after verification. Ranking order is:

```text
verified outcome
-> zero regressions
-> smaller diff
-> lower total latency
-> stable candidate id tie-break
```

## Repository isolation

Version 1 accepts only controlled fixtures under:

```text
md-os/benchmarks/software_repair/fixtures/
```

The runner verifies the fixture tree hash, materializes a deterministic Git base
commit, and creates one detached Git worktree per candidate. Candidate worktrees
are removed and pruned before the run is committed. Only benchmark evidence and
diffs remain under `md-os/ops/benchmarks/software_repair/runs/`. Each completed
run snapshots the exact BenchmarkCase, CandidateSet, and submitted patch bytes
and a Git bundle of the fixed base commit so later source edits cannot rewrite
experimental provenance.

Git worktrees isolate repository state between candidates. They are not an
operating-system security sandbox. Untrusted third-party repositories, package
installation, arbitrary shell strings, and network-dependent tests are outside
the version-1 contract.

The allowed executable surface is currently Node running declared script files.
The runner does not use a shell and rejects `node -e`, absolute candidate script
paths, path traversal, symlinked fixtures, and patches outside controlled source
or live candidate-set roots.

## Candidate provider and PlanGraph gate

The controlled provider is invoked as a separate Node process from a declared
source descriptor under:

```text
md-os/benchmarks/software_repair/providers/
```

It receives a bounded request and returns candidate patches plus typed
PlanGraphs. The kernel validates the result before it can become a CandidateSet.
The gate requires:

```text
provider/request/case/configuration hashes match
+ candidate and graph identifiers are unique
+ graph dependencies exist and the graph is acyclic
+ at least one edit and one verify node exist
+ edit targets satisfy the case diff policy
+ independent verification remains required
+ patch hashes are unique
+ strategy classes are unique
+ mechanisms are unique
+ semantic plan signatures are unique
+ candidate count satisfies the configuration budget
```

For `mdos_verified_runtime`, at least two distinct PlanGraphs are required when
the case budget permits them. Baseline A and Baseline B require exactly one
candidate.

Provider artifacts are append-only under:

```text
md-os/ops/benchmarks/software_repair/candidate_sets/<provider_run_id>/
```

A provider-backed BenchmarkRun snapshots the request, result, receipt, and each
PlanGraph under its own run directory. Later changes to live provider state
cannot silently rewrite the experimental evidence.

The controlled fixture provider has repository-level filesystem visibility and
uses a catalog built with knowledge of the development case. Its receipt is
therefore always empirically ineligible. It is blocked outright for holdout
cases.

The bounded skill-program provider is executed with the Node permission model.
Its filesystem read allowlist contains only the provider implementation,
provider descriptor, and generated request. Filesystem writes, child processes,
and worker threads are denied. Candidate patches are returned inline, size- and
hash-checked by the kernel, then materialized outside the provider process.
Provider-declared skill and episode provenance is checked against the exact
candidate or promoted skill records included in the request.

## Independent oracle

Oracle programs live outside the materialized candidate repository:

```text
md-os/benchmarks/software_repair/oracles/
```

They execute only after candidate generation and patch application. A holdout
candidate set must declare that ground truth was not disclosed; otherwise the
runner blocks the run as contaminated.

This is procedural separation, not a separate machine or security principal.
Stronger isolation requires a later container, VM, or separately permissioned
verifier.

## Experimental configurations

Every run names one fixed configuration:

```text
baseline_a_single_attempt
  retrieval = false
  episodic_memory = false
  skills = false
  candidate_skills = false
  candidate_limit = 1

baseline_b_retrieval
  retrieval = true
  episodic_memory = false
  skills = false
  candidate_skills = false
  candidate_limit = 1

mdos_learning_exploration
  retrieval = true
  episodic_memory = false
  skills = false
  candidate_skills = false
  candidate_limit = 5

mdos_neuromorphic_skill
  retrieval = true
  episodic_memory = false
  skills = false
  candidate_skills = true
  candidate_limit = 1

mdos_verified_runtime
  retrieval = true
  episodic_memory = true
  skills = true
  candidate_skills = false
  candidate_limit <= case budget
```

The verifier is common to all configurations. This prevents one experimental arm
from receiving an easier definition of success.

The provider request implements configuration fidelity explicitly. Baseline A
receives repository context without retrieval. Baseline B receives a
deterministic lexical retrieval selection but no episodic memory or skills.
The MD-OS arm receives the same retrieval plus audited consultation of available
episodic-memory and promoted-skill records. Empty memory or skill stores remain
empty rather than being reported as used competence.

The current controlled provider does not invoke a model and its static catalog
does not consume these contexts as evidence of problem-solving ability. Its
runs validate the provider protocol only and always retain empirical claim scope
`runner_validation_only`.

The bounded delimited-boundary provider is also not a general model. It is a
small executable learner test surface. Without a skill and a one-candidate
budget it emits one generic delimiter guard. During development exploration it
emits five competing structural hypotheses. With an eligible induced skill it
instantiates the consolidated constraints while inferring repository-specific
parameters from the new public snapshot. Its purpose is to test causal
episodic-to-skill learning, not open-ended code generation.

## Holdout discipline

A run can contribute to `verified_success_rate_holdout` only when:

```text
case split = holdout
+ candidate ground truth disclosed = false
+ candidate origin is not a validation fixture
+ provider receipt is configuration-faithful
+ provider receipt is explicitly empirically eligible
+ PlanGraph diversity gate passed
+ empirical claim scope = holdout_measurement
```

Development and runner-validation runs must not be counted as evidence of
generalization.

The generated benchmark index is:

```text
md-os/ops/benchmarks/software_repair/index.json
md-os/ops/benchmarks/software_repair/index.md
```

It reports all three configurations even when unmeasured. Missing empirical or
holdout runs remain `not measured`; they are never rendered as zero intelligence
or as a successful baseline.

## Metrics

The primary metric is:

```text
verified_success_rate_holdout
```

The cumulative-learning metric is:

```text
delta_verified_success_rate_holdout
```

Secondary measurements include candidate count, attempts, latency, tokens,
cost, diff bytes and files, regressions, human interventions, and initial
confidence. Unknown token or cost values remain `null`, not zero.

The learning delta is measurable only when at least two named, uncontaminated
holdout cases exist before and after acquisition of verified experience and the
attempt budgets match. The neuromorphic accelerator supplies one such bounded
cohort. Its reference acceptance result is 0/2 before and 2/2 after two verified
development episodes, with one attempt per holdout in each arm, zero
regressions, and no detected contamination. This measurement is restricted to
the declared delimited-boundary hypothesis family.

## Canonical commands

```bash
mdos benchmark software-repair configurations

mdos benchmark software-repair generate \
  --case md-os/benchmarks/software_repair/cases/<case>.json \
  --provider md-os/benchmarks/software_repair/providers/<provider>.json \
  --configuration mdos_verified_runtime

mdos benchmark software-repair run \
  --case md-os/benchmarks/software_repair/cases/<case>.json \
  --provider md-os/benchmarks/software_repair/providers/<provider>.json \
  --configuration mdos_verified_runtime

node md-os/os/build_software_repair_benchmark_index.js

mdos agi accelerate --experiment-id <append_only_id>
```

## Master closure

The benchmark-runner closure is satisfied when:

1. source tree and deterministic base commit are verified;
2. the defect and independent oracle fail as declared before the patch;
3. each candidate receives a distinct worktree;
4. candidate-visible tests, regression tests, external oracle, and diff policy
   are evaluated separately;
5. comparison selects only an eligible candidate;
6. sandbox and worktrees are removed;
7. append-only run evidence is written;
8. fixture runs remain excluded from empirical learning claims;
9. build and replay reconstruct the aggregate index without deleting run
   evidence.

The candidate-provider/PlanGraph closure additionally requires:

1. ground-truth fields are absent from the provider request;
2. provider implementation, request, and result are hash-bound in a receipt;
3. PlanGraphs are typed, acyclic, policy-bounded, and independently verifiable;
4. MD-OS multi-plan runs contain genuinely distinct strategy classes,
   mechanisms, semantic signatures, and patch hashes;
5. configuration fidelity is checked rather than inferred from a label;
6. contaminated fixture providers cannot enter holdout or empirical metrics;
7. provider evidence is snapshotted into the BenchmarkRun and preserved by
   replay.

## Deferred work

The following remain later closures:

```text
untrusted-repository container sandbox
real model-generated baseline candidates
learned or semantic retrieval beyond the deterministic lexical receipt
bounded model broker with immutable model-call receipts
task-specific context selection evaluated against the benchmark
multiple independently seeded before/after holdout cohorts
credit assignment across interacting skill families
cross-domain SkillProgram induction
active experiment selection before labels are observed
continual learning with forgetting and revocation measurements
```

No AGI claim follows from the runner-validation fixture or from the bounded
learning cohort. The latter supports only a narrow cumulative-learning and
cross-instance-transfer claim inside its declared family.
