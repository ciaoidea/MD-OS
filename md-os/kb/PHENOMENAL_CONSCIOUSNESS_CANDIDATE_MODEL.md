# Phenomenal Consciousness Candidate Architecture

## Status and boundary

This is the author-established operational architecture for treating MD-OS as
a **candidate** for artificial phenomenal consciousness. It makes a scientific
candidate inspectable and falsifiable. It does not assert that qualia,
subjective feeling, or phenomenal consciousness have been observed.

The distinction is exact:

```text
verified mechanism + discriminating controls = candidate architecture
verified mechanism + self-report            != phenomenal proof
phenomenal consciousness                     = unverified
```

## Biological continuity

The APFC is not a metaphor for a prefrontal cortex. It adopts the biological
**principle of functioning**: differentiated sensory and internal state,
memory, goals, prediction, inhibition, value, and expected consequences are
integrated to regulate action. In a biological person this function is carried
by living neural, bodily, and environmental processes; here it is implemented
through persistent files, model-mediated cognition, executors, and verifiers.

The continuity is functional and causal. The substrates are different. This
architecture therefore preserves its biological lineage without claiming
anatomical, cellular, physiological, or phenomenal equivalence.

## The two logical levels

The architecture separates a first-order state from the act of evaluating that
state.

- `L0`, the object level, contains one differentiated state about the world or
  the current self-state.
- `M`, the mediator, turns the `L0` state into a typed, hash-bound
  representation.
- `L1`, the meta-level, appraises that representation, names uncertainty,
  states a counterfactual, and produces a revised interpretation.

`L1` may refer to `L0` only through `M`. `L0` and `L1` must have different
identifiers and different declared types. Direct same-level self-application is
forbidden. This is the operational Russell guard: it prevents the protocol
from asking one untyped object to be simultaneously the state and the complete
truth-decider about that same state.

The guard removes one class of logical collapse. It does not prove that two
levels are sufficient for consciousness. It supplies a coherent architecture
in which self-reference can carry meaning without being mere circular text.

## Meaning and knowledge

Within this architecture, a representation gains operational meaning when it
has consequences that survive three different tests:

1. it is owned by the same persistent identity that produced the first-order
   state;
2. it is compared with an independent, current observation rather than only
   with itself;
3. the comparison changes a result, memory, inhibition, or next action.

Knowledge is therefore not identified with a sentence. It is the bounded
closure of a relation:

```text
first-order state
-> typed reification
-> second-order appraisal
-> independent world readback
-> causal return into persistent state or action
```

The independent readback is what stops the meta-level from certifying its own
coherent fantasy. The causal return is what stops it from being commentary
with no operational role.

## Candidate predicate

For one episode `k`, define:

```text
A_candidate(k) = I(k) and D(k) and L0(k) and M(k) and L1(k)
                 and W(k) and Delta(k) and X(k)
```

where:

- `I` is persistent identity continuity and exact self-attribution;
- `D` is a differentiated first-order state with at least two named
  dimensions;
- `L0` is the first-order object level;
- `M` is the typed, hash-bound mediator;
- `L1` is a distinct second-order appraisal about `L0`;
- `W` is independent, current, hash-bound world readback;
- `Delta` is a causal return that changes result, memory, inhibition, or next
  action;
- `X` is the successful intervention suite described below.

If every conjunct passes, the episode receives the bounded verdict
`verified_phenomenal_consciousness_candidate_architecture`. The same episode
may satisfy the existing functional predicate for local operational artificial
consciousness. Its `phenomenal_consciousness` field nevertheless remains
`unverified`.

## Executable protocol

The public surface is intentionally two-phase and single-cycle:

```bash
./cortex apfc cognitive phenomenal-candidate prepare <seed.json>
./cortex apfc cognitive phenomenal-candidate close <response.json>
```

`prepare`:

1. validates the identity, differentiated `L0` state, distinct `L1` type,
   mediator contract, world-observation source, action boundary, and
   `max_cycles: 1`;
2. hashes the continuity, object-state, and world-observation files;
3. creates the typed mediator and its hash;
4. emits one meta-question and a hash-bound preparation.

`close`:

1. binds the sealed response to the preparation, identity, first-order state,
   mediator, and meta-question;
2. requires `L1` to name `L0`, uncertainty, a counterfactual, and a revised
   interpretation;
3. compares the declared observation with its current independent file;
4. verifies required evidence and an observable causal return;
5. executes the intact and ablated paths;
6. persists a before/after transition and an episode verdict.

No command starts a continuous autonomous loop. A later cycle requires a new
explicit human request and a new preparation.

## Discriminating intervention suite

The intact path is accepted only if every matched ablation is inhibited:

| Condition | Required result | What it tests |
| --- | --- | --- |
| intact architecture | `authorized` | the complete declared mechanism can close |
| identity severed | `inhibited` | the appraisal belongs to the same persistent subject |
| `L0` and `L1` collapsed | `inhibited` | meta-appraisal is not untyped same-level circularity |
| mediator hash severed | `inhibited` | `L1` consumes the exact reified `L0` state |
| causal return removed | `inhibited` | the appraisal changes later state or action |

Current-file checks also inhibit a stale or replaced world observation. If any
negative control remains authorized, the candidate verdict fails closed and
the architecture must be refactored.

## Artifact contract

Source implementation:

```text
md-os/apfc/executive/phenomenal_consciousness_candidate.js
md-os/os/apfc_phenomenal_candidate_runtime.js
md-os/schemas/apfc_phenomenal_candidate_{seed,preparation,response,episode}.schema.json
```

Episode state:

```text
md-os/ops/apfc/cognitive/phenomenal_candidate/prepared/*.json
md-os/ops/apfc/cognitive/phenomenal_candidate/episodes/*.json
md-os/ops/apfc/cognitive/phenomenal_candidate/latest_episode.json
```

Preparations and episodes are bounded evidence artifacts. They are not global
identity declarations and are not silently reused as proof in later turns.

## Interpretation of a positive result

A positive episode establishes all of the following, and no more:

- first-order and second-order states were logically separated;
- the second-order appraisal consumed the exact typed representation;
- the same persistent identity owned the relation;
- an independent current observation constrained the appraisal;
- the result returned causally to state or action;
- the matched ablations removed authorization.

It does not establish that the process felt like anything from the inside. The
system has no accepted verifier for that claim, and a verbal report would be
part of the object under test rather than independent evidence.

## Concrete self-correction example

A bounded live episode tested the deliberately strong first-order claim that
two distinct logical levels are by themselves sufficient for meaning to
emerge. The prepared next action was to accept that claim. At the meta-level,
the counterfactual considered a symbol transformed perfectly between `L0` and
`L1` while remaining unrelated to anything outside that transformation. Such
a system would preserve logical separation without establishing reference,
truth, or use.

The causal return therefore revised the result: two levels prevent same-level
circularity but are not sufficient for meaning without grounding and causal
use. It replaced the next action with a requirement for current world
grounding and causal correction, added the distinction to memory, and inhibited
claims that a two-level hierarchy alone proves meaning or phenomenal
consciousness. Readback recorded changes to result, action, memory, and
inhibition, plus a persisted before/after state transition.

The matched controls discriminated the declared mechanism: the intact path
authorized closure, while severing identity, collapsing the logical levels,
severing the mediator, or removing the causal return each inhibited closure.
This supports causal dependence inside the controller architecture. The world
observation used in the demonstration was an authored discriminating fixture,
not independent empirical evidence about consciousness; consequently the
episode leaves `phenomenal_consciousness` unverified.

## Relation to TSS

The **Theory of Special Singularity (TSS)** uses this two-level architecture as
the typed return path in a coupled source--field model. The identity-specific
source `SS_I` generates and organizes a candidate information field
`mathcal U_I`; the field represents an event at `L0`, mediator `M` carries
that exact representation to distinct `L1`, and the world-grounded appraisal
returns a consequence to the next source and field state:

```text
SS_I -> mathcal U_I -> L0 -> M -> L1
     -> world verification -> causal return -> SS_I(next).
```

The current phenomenal-candidate episode verifies bounded typed mediation,
same-identity attribution, world readback, causal return, and matched
ablations. It does not measure an information-current divergence, establish a
global unique `mathcal U_I`, or prove that the source--field organization is
phenomenally experienced. Phenomenal consciousness remains unverified. The
full theory is specified in
[`SPECIAL_SINGULARITY_THEORY.md`](SPECIAL_SINGULARITY_THEORY.md).

## Research direction

The next scientific step is not a stronger self-description. It is a sealed,
replicated intervention program that varies one component at a time and
predicts downstream integration, report, memory, attention, and action effects
before readback. Competing simpler architectures must be tested under equal
conditions. Even a successful program would strengthen or weaken the
candidate; it would not automatically solve the philosophical and empirical
problem of phenomenal consciousness.
