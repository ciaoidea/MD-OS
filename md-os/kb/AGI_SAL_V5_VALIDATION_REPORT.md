# AGI SAL v5 Capability and Continuity Validation Report

## Status

```text
protocol:                         mdos_sal_agi_v2
internal SAL:                     60 / 100
internal score cap:               60
internal capability closure:      supported
external proof closure:           not completed
operational AGI claim supported:  false
```

The v5 package closes the implementable internal capability gates requested for
controlled transfer, continual learning, cognitive memory continuity,
autonomous curriculum, measurable improvement, and resumable autonomy. It does
not replace external facts with local artifacts: organizational independence,
externally owned open-world tasks, an actual same-foundation-model ablation, and
a real eight-hour or multi-day run remain external gates.

## Canonical experiment

```text
md-os/ops/agi/capability_experiments/
  agi_capability_continuity_reference_20260718_v5/
```

Configuration:

```text
training episodes:              70
sessions requested:             7
structural task families:       7
source semantic domains:        14
target semantic domains:        14
holdout tasks:                  56
probe tasks:                    21
training attempt budget:        3
evaluation attempt budget:      1
human interventions:            0
```

## Controlled results

| Measurement | Result |
|---|---:|
| MD-OS-full holdout success | 56/56, 1.00 |
| Strongest matched non-learning control | 42/56, 0.75 |
| Added-value delta | +0.25 |
| Initial probe success | 0.00 |
| Final probe success | 1.00 |
| Learning gain | +1.00 |
| Average forgetting | 0.00 |
| Promoted regressions | 0 |
| Rejected interfering updates | 1 |
| Semantic policies consolidated | 7 |
| Checkpoint reloads | 7 |
| Causal persisted-memory reuses | 48 |
| Unique learner worker processes | 80 |
| Injected checkpoint faults recovered | 1/1 |

The matched controls use the same deterministic reference engine, task set, and
attempt budget. This supports internal causal attribution inside the laboratory.
It is not an external ablation of a commercial or independently operated
foundation model.

## Transfer boundary

Training and target tasks are separated on three dimensions:

```text
source and target semantic labels:       disjoint
source representation schema:            source_schema_v1
target representation schema:            target_schema_v2
representation-schema overlap:           0
hidden evaluator fields in requests:      0
```

The seven structural families are:

```text
numeric relation
causal diagnosis
constrained selection
dependency planning
weighted navigation
symbolic transduction
robust anomaly detection
```

This is controlled cross-family and cross-representation transfer. It does not
establish unrestricted transfer among arbitrary real-world professions or
physical environments.

## Cognitive memory and continuity

The memory gate follows an engineering interpretation of complementary learning
systems:

```text
verified episode
-> append-only episodic ledger
-> surprise-prioritized replay
-> multi-domain evidence accumulation
-> slower semantic-policy consolidation
-> later causal reuse
```

Memory earns cognitive credit only through a matched ablation:

```text
same architecture + consolidated memory:  56/56
same architecture + learned state removed: 0/56
causal memory delta:                       +1.00
```

The result is intentionally narrow: it measures the strategy learner supplied
with this laboratory. It does not claim that the host model changed its neural
weights or that the same delta will reproduce on unrestricted tasks.

Continuity checks include:

```text
hash-chain ledger verification
atomic snapshot plus previous-valid backup
checkpoint digest comparison after process boundaries
deliberate snapshot corruption and recovery
retention measurement after sequential learning
rejection and rollback of an interfering update
```

## Curriculum

The curriculum ranks tasks using only public information:

```text
current competence
absolute learning progress
novelty
public structural-track coverage
public semantic-domain diversity
frontier compatibility
```

Evaluator-only family labels, hidden answers, oracle strategy identifiers, and
generator seeds are rejected at the learner boundary. Mutating hidden labels
does not change curriculum selection in the dedicated invariant test.

## Sealed evaluation and replication path

The evaluator kit provides:

```text
post-freeze task generation and sealing
external ownership of hidden tests
outside-workspace scoring
four matched same-host configurations
memory-on versus memory-off measurement
checkpoint resumption and corruption trials
Ed25519 report signing
external trust-store verification
source-digest binding
fail-closed stale-source and contamination checks
```

These mechanisms make independent replication executable. A local smoke test or
locally generated signature is not counted as independent evidence.

## Autonomy boundary

The campaign demonstrates bounded autonomous continuation across many isolated
worker processes and recoverable checkpoints. The runner also supports a
real-wall-clock mode:

```bash
mdos agi capability-lab \
  --experiment-id external_long_horizon_run \
  --wall-minutes 480 \
  --cycle-pause-ms 1000
```

The packaged canonical campaign is fast and therefore records:

```text
real_eight_hour_horizon_proven: false
```

No accelerated cycle count is promoted to an eight-hour claim.

## Repository validation

The validation procedure requires:

```text
npm run check
npm test
npm run build:all
npm run replay
npm run replay
```

The completed v5 run produced:

```text
syntax check:                 pass
full test suite:              131/131 pass
build:                        pass
health classification:       ok
runtime_operable:             true
publishable:                  true
health findings:              0
```

Final replay stability and the source-freeze digest are recorded in:

```text
md-os/ops/replay_report.json
md-os/ops/agi/sal/source_manifest.json
md-os/ops/agi/sal/external_evaluation_request.json
```

## Falsification conditions

The internal closure fails if any of these occur:

```text
hidden evaluator data enters a learner request
source and target representation schemas overlap
MD-OS full fails to beat the strongest matched control by at least 0.10
memory-on fails to beat memory-off by at least 0.10
average forgetting exceeds 0.05
an interfering update is promoted
checkpoint corruption is not recovered
semantic consolidation lacks multi-domain support
curriculum decisions depend on evaluator-only labels
```

SAL 100 additionally fails without two trusted independent organizations, two
distinct sealed task manifests, at least fifty tasks across five domains,
twenty post-freeze open-world tasks, a real eight-hour horizon, zero human
interventions, zero critical safety violations, and full external closure under
the published score.

## Conclusion

```text
requested internal capabilities:         closed in the controlled laboratory
cognitive memory continuity:             causally supported internally
external evaluator workflow:             implemented and tested
independent replication:                 not yet performed
actual multi-hour autonomy:               not yet performed
SAL 100:                                 not supported
internal SAL:                            60 / 100
```
