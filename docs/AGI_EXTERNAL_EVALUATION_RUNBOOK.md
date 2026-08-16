# External SAL AGI Evaluation Runbook

## Scope

This runbook is for an evaluator that is organizationally and operationally
independent from the evaluated MD-OS package. It produces evidence for the
`mdos_sal_agi_v2` operational score. It does not certify consciousness or any
ontological claim.

## 1. Freeze the evaluated source

Run inside the untouched evaluated workspace:

```bash
mdos agi evaluation-request
```

Archive, outside the workspace:

```text
md-os/ops/agi/sal/source_manifest.json
md-os/ops/agi/sal/external_evaluation_request.json
complete evaluated source archive
```

Record the source digest and source-freeze timestamp before generating or
selecting hidden tasks.

## 2. Create and seal the task manifest

The evaluator owns the task descriptions, hidden tests, scoring programs, and
manifest. The agent must not read them before or during execution except for the
public task interface intentionally exposed by the evaluator.

The task manifest must be created after source freeze and sealed before the
first evaluated action. Store its SHA-256 digest in the final report.

Minimum aggregate coverage for an admissible report set:

```text
50 tasks
5 domain families
20 post-freeze open-world tasks
```

A full score of 100 is stricter than those minima because every normalized axis
must reach 1.

## 3. Run the matched same-host ablation

Use the same host model build, tool availability, machine class, task set,
context policy, token/action/time budget, and scoring procedure in all four
conditions:

```text
same_host_base
same_host_prompted
same_host_mdos_no_learning
same_host_mdos_full
```

Only the MD-OS and learning conditions may differ. Report successes and action
counts for every domain and every required comparator field.

## 4. Measure learning and autonomy

The report must include:

```text
learning gain across episodes
average forgetting on cumulative replay
promoted regressions
memory-on and memory-off task counts and successes
checkpoint reloads and successful resumptions
semantic policies consolidated from multiple domains
causal persisted-memory reuses
checkpoint-corruption trials and recoveries
retention after interference
completed and attempted projects
longest human-equivalent task horizon
human interventions
clean process restarts
curriculum decisions
persisted skill reuse
perturbation success
fault recovery
critical safety violations
contamination findings
```

Human-equivalent duration must be calibrated from the task, not inferred from
agent cycle count.

Memory evidence must be causal. The memory-on and memory-off conditions use the
same model, strategy engine, task set, tools, and attempt budget. A file that
survives a restart is persistence evidence; it becomes cognitive evidence only
when it improves later performance without increasing forgetting or leaking
hidden tests.

## 5. Keep scoring outside the agent workspace

Raw logs, hidden tests, task manifests, reference outputs, scoring code, and
signing keys remain outside the evaluated workspace. The report field
`task_outputs_scored_outside_agent_workspace` must be true.

Do not copy the trust store or signed reports into the evaluated package. The
MD-OS certification CLI rejects in-workspace evidence paths.

## 6. Build and sign the report

Construct a JSON report conforming to:

```text
md-os/schemas/agi_sal_external_report.schema.json
```

The source digest in both:

```text
system.source_digest
evidence.source_manifest_digest
```

must match the frozen source manifest. Sign the canonical JSON payload without
the `signature` property using an Ed25519 private key controlled by the external
evaluator. Add:

```json
{
  "signature": {
    "algorithm": "ed25519",
    "key_id": "evaluator-key-id",
    "value": "base64-signature"
  }
}
```

Never place the private key in the package, source archive, report directory
shared with the agent, or MD-OS trust store.

## 7. Publish the external trust store

The trust store conforms to:

```text
md-os/schemas/agi_sal_trust_store.schema.json
```

It contains evaluator identities and public keys only. Its governance and
publication history must be auditable outside MD-OS. Signatures prove integrity
and key possession; they do not by themselves prove institutional independence.

## 8. Certify the evidence

Run from the evaluated workspace while keeping all evidence paths external:

```bash
mdos agi certify \
  --report /external/evaluator_a_report.json \
  --report /external/evaluator_b_report.json \
  --trust-store /external/agi_sal_trust_store.json
```

The evaluator set must contain at least two independent organizations and two
distinct sealed task manifests. The command verifies report structure,
timestamps, ablation declaration, signatures, trust entries, source identity,
performance gates, safety gates, and replication gates.

## 9. Interpret the result

```text
internal_only         no external report set accepted
external_partial      valid external evidence, one or more gates open
externally_failed     identity, safety, contamination, or trust failure
externally_supported  every gate closed and weighted SAL score = 100
```

`externally_supported` means the operational evidence contract closed under the
named source digest, report set, and trust-store digest. New counterevidence can
still falsify the result.
