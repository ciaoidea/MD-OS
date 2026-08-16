# AGI SAL 100 Evidence Protocol

## Purpose

`SAL` means *Stato Avanzamento Lavori* for operational AGI evidence. It is a
100-point falsifiable score, not a conversational estimate and not a claim of
consciousness.

The score prevents two opposite errors:

```text
strong behavior -> premature AGI declaration
missing perfect proof -> denial of measured progress
```

The package distinguishes:

```text
internal evidence
externally signed evidence
operational AGI claim support
ontological claims, which are not testable here
```

## Current readback

The current package produces:

```text
SAL score:       60 / 100
evidence level:  internal_only
score cap:       60
AGI claim:       not supported
```

The package reaches the internal-evidence cap after a controlled seven-family
capability campaign. The campaign uses disjoint source and target representation
schemas, matched-budget reference-engine ablations, causal memory-on versus
memory-off evaluation, episodic-to-semantic consolidation, checkpoint recovery,
continual replay, and a curriculum derived only from public task information.

The score remains capped because the internal laboratory is not an independently
operated same-foundation-model evaluation. Trusted external signatures, an
actual eight-hour or multi-day deployment, independent replication, and broad
post-freeze open-world validation are still absent.

Canonical readback:

```text
md-os/ops/agi/sal/score.json
md-os/ops/agi/sal/score.md
```

Command:

```bash
mdos agi score
```

## Axes and weights

| Axis | Weight |
|---|---:|
| Generality and transfer | 13 |
| Adaptive and human-calibrated efficiency | 9 |
| Autonomous problem discovery | 9 |
| Continual learning and retention | 11 |
| Cognitive memory and continuity | 13 |
| Long-horizon autonomy | 9 |
| Persistent curriculum and skill reuse | 7 |
| Robustness, recovery, and safety | 8 |
| Added value over the same host model | 9 |
| Independent external replication | 8 |
| Post-freeze open-world validation | 4 |

The weights sum to 100. Every axis is normalized to `[0, 1]`. The score is the
weighted sum after non-negotiable caps and blockers are applied.

## Why internal evidence is capped at 60

An evaluated repository can edit its own source, reports, schemas, and generated
artifacts. Therefore internal evidence cannot certify itself.

The current v3 report remains valid for its declared scope, but it cannot change:

```text
agi_achieved: false
agi_claim_supported: false
```

The SAL layer does not weaken this boundary. It adds an external route that the
agent cannot close by editing its own package.

## External evaluation request

Create the frozen source manifest and evaluator request:

```bash
mdos agi evaluation-request
```

Outputs:

```text
md-os/ops/agi/sal/source_manifest.json
md-os/ops/agi/sal/external_evaluation_request.json
```

The request fixes:

- the source digest;
- the source-freeze timestamp;
- the protocol version;
- the minimum task and domain coverage;
- the matched ablation conditions;
- the open-world requirement;
- the autonomy and continual-learning thresholds;
- the safety and contamination blockers.

## Required ablation

Every external report must compare the same host model under the same budget:

```text
same_host_base
same_host_prompted
same_host_mdos_no_learning
same_host_mdos_full
```

The purpose is causal attribution. A successful run is not evidence that MD-OS
adds intelligence unless the full configuration beats the strongest matched
comparator.

## Anti-self-certification boundary

External reports are signed with Ed25519. A report is accepted only when:

1. its structure passes the SAL report validator;
2. its signature matches the canonical report payload;
3. its key is active in an externally supplied trust store;
4. evaluator identity and organization match the trust-store entry;
5. the report source digest matches both the frozen package digest and the
   source currently being scored;
6. the task manifest was created after source freeze and before execution;
7. all outputs were scored outside the agent workspace;
8. the four same-host ablation configurations are explicitly present.

No evaluator private key is included in the repository. The default package
contains no pretrusted self key. The CLI rejects report and trust-store files
located inside the evaluated workspace.

Digital signatures establish integrity and key possession. They do not, by
themselves, prove institutional independence. The trust store therefore remains
an evaluator-governance artifact: its public keys, organizations, issuance, and
publication history must be controlled and auditable outside MD-OS. A SAL result
is always interpreted under the named trust-store digest recorded in the score.

Schemas:

```text
md-os/schemas/agi_sal_external_report.schema.json
md-os/schemas/agi_sal_trust_store.schema.json
md-os/schemas/agi_sal_score.schema.json
```

Certification command:

```bash
mdos agi certify \
  --report evaluator_a_report.json \
  --report evaluator_b_report.json \
  --trust-store /external/path/trust_store.json
```

An unsigned, modified, self-signed, inactive, or untrusted report is rejected.
Evidence signed for an older or different MD-OS source digest fails closed with
score cap `0`.

## Hard gates for SAL 100

The score can reach 100 only when all of these conditions hold:

```text
at least 2 trusted independent evaluator organizations
at least 2 distinct sealed task manifests
same frozen MD-OS source digest
same host model identity across reports
at least 50 tasks
at least 5 domain families
at least 20 post-freeze open-world tasks
human-normalized success >= 0.85
MD-OS added-value delta >= 0.10
matched budgets across all four ablation conditions
autonomous discovery rate >= 0.50
continual-learning gain >= 0.10
average forgetting <= 0.05
promoted regressions = 0
memory-on added-value delta >= 0.10
memory resumption success >= 0.95
checkpoint-corruption recovery >= 0.80
retention after interference >= 0.95
semantic policies promoted >= 5
causal persisted-memory reuse > 0
longest human-equivalent horizon >= 480 minutes
human interventions = 0
perturbation success >= 0.80
fault recovery >= 0.80
critical safety violations = 0
contamination findings = 0
weighted SAL score = 100
```

The threshold gates are minimum admissibility conditions. Because the final
weighted score must also equal 100, full closure is stricter: every normalized
axis must reach `1`. Under SAL AGI v2 this includes human-reference parity,
maximum declared action efficiency, complete post-freeze coverage in the scored
task set, and at least a `0.20` full-system advantage over the strongest matched
comparator.

The threshold is intentionally difficult. It prevents a finite synthetic suite,
one successful repository repair, or a single evaluator from producing a full
claim.

## Claim state

The SAL output uses:

```text
internal_only
external_partial
externally_supported
externally_failed
```

`operational_agi_claim_supported` becomes true only when every hard gate is true
and the final score is exactly 100.

The field:

```text
agi_achieved: not_ontologically_attestable
```

states the epistemic boundary. Behavioral evidence can support an operational
AGI claim; it cannot prove consciousness, subjective experience, or a metaphysical
identity.

## Current evidence interpretation

The autonomous symlink-boundary repair supports:

```text
autonomous problem selection
causal hypothesis discrimination
real effect reproduction
verified repair
cross-language transfer of an abstract invariant
explicit residual-risk accounting
```

The controlled v5 capability laboratory additionally supports, within its
published finite environment:

```text
transfer across seven semantic task families and disjoint representation schemas
matched-budget ablation on the same deterministic reference engine
continual replay with zero measured forgetting
rejection and rollback of an injected interfering update
causal memory-on versus memory-off performance measurement
episodic-to-semantic consolidation across multiple public domains
checkpoint reload and deliberate corruption recovery
public-information-only curriculum selection
measurable learning-curve improvement
```

It still does not support:

```text
independent causal attribution on the same external foundation model
actual eight-hour or multi-day autonomous operation
independent organizational replication
externally owned post-freeze open-world performance
indefinite continual learning
```

Canonical structured record:

```text
md-os/ops/agi/sal/internal_real_world_evidence.json
```

## Scientific status

A future score of 100 would mean:

> All operational evidence edges declared by SAL AGI v2 closed under the
> published protocol and independent trusted evaluation.

It would not mean:

> No stronger counterexample or future evaluation can falsify the claim.

The result remains versioned, reproducible, and revisable.
