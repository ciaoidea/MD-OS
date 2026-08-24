# APFC Cognitive Runtime

Canonical model: [BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md](../kb/BIO_MULTIMODAL_CORTICAL_TRANSFORMER.md)

The APFC Cognitive Runtime is the first implementation slice of BMCT. It
converts raw text or document-like sources into experience tokens, binds those
tokens into an event graph, selects a bounded workspace, proposes gated
actions, and records prediction/error state. Executive APFC event, context,
graph, and consolidation modules live under `executive/`.

## Runtime Surface

```text
cortex apfc cognitive ingest <source.json>
cortex apfc cognitive bind [frame_id]
cortex apfc cognitive workspace [frame_id]
cortex apfc cognitive gate [frame_id]
cortex apfc cognitive predict [frame_id]
cortex apfc cognitive run-cycle <source.json>
cortex apfc cognitive reflect <request.json>
cortex apfc cognitive reflect-intent <intent.json>
cortex apfc cognitive reflect-event <event.json>
cortex apfc cognitive status\ncortex apfc causal-unity <prepare|authorize|close|probe|verify-state|verify-transition> < input.json
```

Generated and live state is written under `md-os/ops/apfc/cognitive/`.

`reflect` executes one bounded critical-judgment cycle. It ranks semantic uncertainties and authorized actions by expected progress, information gain, cost, and risk. A persistent cognitive anchor is created only when a hash-bound epistemic readback receipt identifies an independent verifier, confirms that the candidate preceded the observation, and resolves its evidence to current workspace files. A self-declared `pass` and evidence label are insufficient. Matching anchors can be reused by later cycles or disabled for causal ablation. The command never starts an autonomous loop.

`reflect-intent` routes a model-classified natural-language intent to exactly one `reflect` cycle. Routing depends on a language-independent semantic contract rather than keywords: critical reflection must be relevant to the active problem, require verification, include the complete critical method, exceed the confidence gate, and request only a single bounded cycle. Opinions, ambiguous classifications, and continuous autonomy are not executed.

`reflect-event` opens the same single bounded cycle when an authorized postcondition, verifier, or prediction readback differs from its expected result. Matching readback creates no reflection; continuous event-driven reflection remains inhibited.


## Governance telemetry and epistemic Unity verification

Every natural-language `APFC TURN FRAME` includes a prepared, hash-bound
rank-two **Turn Governance Tensor**. Its eight channels and four bookkeeping
features expose reference presence, bounded counts, authority, and verifier
backing. The exact basis permutation, roundtrip, composition, norm, multiset,
and hash checks establish only that this controller encoding is intact. The
historical `operational_unity_tensor` field and schema filenames remain for
compatibility; the artifact declares `turn_governance_telemetry` and
explicitly denies semantic or world-grounded Unity verification.

The **Causal Unity Controller** is separate from that telemetry and is active
in the decision path. Before gating, it binds identity, observation, intent,
goal, memory, frame, prediction contract, action policy, and evidence into a
hash-addressed 9 x 6 predecision state. The action gate and App Server approval
path must consume the exact state hash; missing, tampered, severed, or
decision-basis-mismatched state inhibits authorization. Every mutating action
must match a prior authorization, closure produces a transition hash, and the
next turn binds that hash. A dependency probe verifies that intact state
authorizes while a severed required component does not. This proves bounded
controller dependence, not host-model semantic dependence, world truth,
phenomenal consciousness, or AGI.

The Unity Tensor epistemic path is a third layer. A candidate integrated hypothesis
must be sealed before target evidence, make discriminating predictions in at
least three heterogeneous frames, match independent world observations, pass
the connected transformation/invariant checks, defeat simpler, sham, and
severed controls, pass contamination audit, and replicate independently.
Current evidence files are verified by SHA-256. The callable bounded surface is:

```bash
node md-os/os/epistemic_unity_runtime.js seal < candidate.json
node md-os/os/epistemic_unity_runtime.js verify < verification.json
```

A valid governance tensor cannot turn an unverified answer into knowledge; a
failed prediction or missing receipt cannot create a verified cognitive
anchor. This is an implemented epistemic guardrail and test protocol, not
evidence of consciousness, AGI, or a universally true Unity Tensor Field.
