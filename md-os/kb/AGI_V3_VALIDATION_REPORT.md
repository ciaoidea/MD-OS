# AGI v3 Validation Report

## Validated package state

Canonical experiment:

```text
agi_generality_reference_20260718_v3
```

Command:

```bash
mdos agi prove \
  --experiment-id agi_generality_reference_20260718_v3 \
  --cycles 96 \
  --sessions 6
```

Result:

```text
master status:                          ok
operational prerequisite suite:         supported
AGI achieved:                           false
AGI claim supported:                    false
```

## Five-gate readback

| Gate | Result | Primary evidence |
|---|---:|---|
| Cross-domain transfer | `ok` | 0/3 baseline, 0/3 sham, 3/3 learned |
| Novel compositional invention | `ok` | 3/3 depth-four programs across 3 novel, pairwise-distinct sketches |
| Persistent autonomous curriculum | `ok` | 96 autonomous task decisions |
| Continual learning | `ok` | final accuracy 1, average forgetting 0 |
| Bounded long-horizon autonomy | `ok` | 6 processes, 5 restarts, 0 human interventions |

Additional readback:

```text
source/holdout domain-family overlap:  0
source/holdout primitive-ID overlap:   0
equal transfer search budget:          true
depth-two invention controls:           0/3
verified depth-four inventions:         3/3
novel pairwise-distinct sketches:       3
interfering proposals rejected:        1 in sequential suite
campaign regression proposals rejected: 5
promoted regressions:                  0
controlled transient faults:           3
recovered transient faults:            3
verified campaign skills retained:     93/93
campaign retained accuracy:            1
campaign ledger events:                108
campaign ledger valid:                 true
learner requests:                       110
learner receipts:                       110
independent verifications:              110
boundary audit findings:                0
evidence files hashed:                  447
```

Evidence root digest:

```text
c048d8e7235b9605b62492982586d19e93a59a6d7068f226fc56809d3ad0ae6d
```

## Verification commands

The following validations passed on the packaged source tree:

```bash
npm run check

node --test \
  test/agi_evidence_suite.test.js \
  test/neuromorphic_learning.test.js \
  test/agi_loop.test.js \
  test/software_repair_benchmark.test.js

npm run build:all
```

Results:

```text
syntax check:                           pass
targeted proof and regression tests:    22/22 pass
canonical full runtime build:           pass
master report JSON Schema:              pass
autonomous state JSON Schema:           pass
all 447 evidence file hashes:            pass
runtime source hashes in manifest:       pass
```

The new AGI evidence test file contains seven positive and negative tests. It
checks the transfer ablation, contaminated-request rejection, ledger-tamper
detection, novel program synthesis, public-only curriculum selection, the full
five-gate integration run, and the schema-enforced claim boundary.

## Scope boundary

The run demonstrates the five operational edges in a finite symbolic
program-synthesis environment. It does not demonstrate open-world AGI,
indefinite autonomy, or independent external replication. Those fields remain
false in the master schema and report.
