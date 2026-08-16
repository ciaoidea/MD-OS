# AGI SAL v4 Validation Report

## Result

The v4 work does not declare that MD-OS is AGI and does not set the current SAL
score to 100. It closes the engineering path by which an operational score of
100 can be produced only from external, sealed, signed, causally controlled,
and independently replicated evidence.

Current verified readback:

```text
SAL score:                         45.25 / 100
evidence level:                    internal_only
internal score cap:                60
operational AGI claim supported:   false
AGI achieved:                      not_ontologically_attestable
runtime operable:                  true
publishable:                       true
```

## Added controls

The v4 evaluator adds:

```text
published 100-point weighted score
internal evidence cap
same-host four-condition ablation
source-freeze manifest
post-freeze task ordering
external hidden-test ownership
external output scoring
Ed25519 report integrity
external trust-store boundary
current-source digest binding
stale-report fail-closed behavior
independent evaluator and task-manifest replication
open-world, continual-learning, autonomy, robustness, and safety gates
```

No evaluator private key or pretrusted self key is shipped.

## Negative controls

Executable tests verify that:

```text
an internal result cannot self-certify
an altered signed report is rejected
an untrusted evaluator is rejected
an incomplete ablation is rejected
a task manifest created before source freeze is rejected
one evaluator is capped below 100
a report for a different source is scored 0
missing open-world evidence prevents 100
missing added value over the host model prevents 100
only two independent perfect report sets can close the operational score at 100
```

The synthetic perfect reports exist only inside the test process. They prove the
score and gate logic, not MD-OS performance. They are generated with ephemeral
keys and are not retained as evidence.

## Repository validation

The final validation sequence includes:

```text
npm run check
npm test
npm run build:all
npm run replay
npm run replay
node md-os/os/mdos.js agi score
node md-os/os/mdos.js agi evaluation-request
```

The complete test suite passes with 125 tests and zero failures. The build
produces `status: ok`, all health scopes remain `ok`, and the second replay is
stable. Canonical current values are read from:

```text
md-os/ops/health_classification.json
md-os/ops/health.json
md-os/ops/replay_report.json
md-os/ops/agi/sal/score.json
md-os/ops/agi/sal/source_manifest.json
md-os/ops/agi/sal/external_evaluation_request.json
```

## Additional defect closed

During full-suite validation, Graphify launcher resolution was found to use a
login shell for `PATH` lookup. On some hosts this ignored the bounded test PATH
and selected a different installed executable. Launcher lookup is now performed
deterministically in-process, and the fake Graphify test uses the current Node
executable directly. All eight Graphify connector tests pass.

## Remaining evidence gap

The package cannot create the missing evidence internally. SAL 100 still
requires actual external execution of the evaluation request by at least two
independent organizations over distinct sealed task manifests. Required evidence
includes a positive same-host MD-OS ablation, far-domain open-world tasks,
continual learning with bounded forgetting, human-calibrated long-horizon
autonomy, perturbation recovery, zero contamination, and zero critical safety
violations.

The correct present claim is:

```text
100-point evidence protocol implemented:          true
score engine can close 100 only under all gates:  true
current operational SAL score:                    45.25
current AGI claim supported:                      false
external evaluation ready:                       true
```
