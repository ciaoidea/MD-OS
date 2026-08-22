# Reflective Operation Model

The first bounded reflective operation compares two paths on the same question:

```text
direct:     candidate -> verdict
reflective: candidate -> critique -> evidence -> revision -> verdict
```

Reflection may also originate internally through an explicit self-question:

```text
candidate result
-> ask what could be wrong or incomplete
-> answer the new question
-> compare with evidence
-> find the hidden limit
-> confirm or revise
-> use the verdict in the next step
```

The mirror analogy is operational: a result is directed back toward the system
and becomes new input. The important property is not verbal repetition but a
changed or better-bounded next step grounded in evidence.

## Einstein-inspired Gedankenexperiment discipline

When direct observation is unavailable or a problem contains competing causal
or mathematical explanations, reflection may construct a Gedankenexperiment:

```text
declared principle
-> explicit premises and invariants
-> controlled imaginary situation
-> vary one relevant condition
-> derive necessary consequences
-> inspect symmetry, limiting cases, and counterexamples
-> expose circular or hidden assumptions
-> derive a discriminating prediction
-> identify the real observation, computation, or proof needed for closure
```

The operation is admissible only when the imagined transformation could change
the choice among hypotheses or reveal a missing lemma. It must not run as a
ritual on ordinary requests. Its output remains a hypothesis, derivation, or
candidate test until an independent observation, calculation, formal checker,
or physical experiment verifies it. Narrative force, elegance, resemblance to
a famous historical argument, and internal consistency are not verification.

"Einstein-inspired" identifies the methodological lineage of disciplined
thought experiments. It does not claim Einstein's identity, authority,
insight, or exact personal method.

The verifier uses declared required facts and forbidden misconceptions. The
reflection path succeeds only when the revised answer satisfies every required
fact and contains no forbidden claim. A fluent revision is not evidence by
itself.

This first implementation is a controlled protocol fixture. Candidates and
evidence are supplied in a task file; the runtime coordinates criticism,
verification, scoring, and episode readback. It does not yet generate its own
candidates or prove general reasoning, consciousness, or autonomous learning.
The Gedankenexperiment discipline is currently a canonical reasoning rule, not
a separately validated automatic generator.

Run one experiment with:

```bash
node md-os/os/reflective_operation.js run-once \
  md-os/examples/reflective_seasons_experiment.json
```

Success means that the reflective answer passes its declared checks and scores
higher than the direct answer. Every run writes a report and a formal episode.
