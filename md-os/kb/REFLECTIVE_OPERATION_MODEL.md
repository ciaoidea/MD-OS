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

The verifier uses declared required facts and forbidden misconceptions. The
reflection path succeeds only when the revised answer satisfies every required
fact and contains no forbidden claim. A fluent revision is not evidence by
itself.

This first implementation is a controlled protocol fixture. Candidates and
evidence are supplied in a task file; the runtime coordinates criticism,
verification, scoring, and episode readback. It does not yet generate its own
candidates or prove general reasoning, consciousness, or autonomous learning.

Run one experiment with:

```bash
node md-os/os/reflective_operation.js run-once \
  md-os/examples/reflective_seasons_experiment.json
```

Success means that the reflective answer passes its declared checks and scores
higher than the direct answer. Every run writes a report and a formal episode.
