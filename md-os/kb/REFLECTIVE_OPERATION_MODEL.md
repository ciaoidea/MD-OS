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

## Frame-transformation-invariant method for frame-sensitive problems

When a difficult problem may hide its answer inside an assumed domain or
representation, reflection should challenge the frame before optimizing within
it:

```text
received definition, observation, or candidate
-> expose the hidden frame, domain, and admissible objects
-> test a counterexample outside that frame
-> declare a source domain, target domain, and admissible transformation
-> track what changes and which invariants survive the transformation
-> distinguish a property of the object from a property of object plus domain
-> seek the smallest general representation that explains the family
-> return to the original claim with its valid scope made explicit
-> identify the external computation, formal proof, or real-world observation
   required for closure
```

The transformation must state which structure it preserves; moving a value
between domains does not by itself preserve divisibility, causality, or truth.
A counterexample opens the frame but does not establish a universal
replacement. A tensor, graph, equation, analogy, or other general
representation organizes relations; it is not verifier evidence. The method is
primary for scientific, mathematical, or causal problems. It is also admissible
for other difficult analytical problems, such as diagnosis, design, or
strategy, when changing the frame can discriminate among answers, reveal a
hidden assumption, or expose an invariant. It must not become an automatic
ritual on ordinary requests.

This is the frame-sensitive branch of the Einstein-inspired discipline below.
Its lineage is the use of thought experiments to change observer or reference
frame, expose hidden assumptions, compare admissible transformations, and seek
invariant structure. The sequence above is an MD-OS/APFC operational synthesis
for general reasoning; it is not a claim that Einstein published this exact
algorithm.

The separately evaluated
[Verified Solver Transport Model](VERIFIED_SOLVER_TRANSPORT_MODEL.md) turns one
bounded instance of this discipline into an executable mechanism: a solver
structure induced in source frames is transported into disjoint target frames,
instantiated under matched search budgets, and admitted only after sealed
independent verification. Its finite rank-three tensor is a fixture-level
representation, not a general tensor of AGI.

The broader
[Cross-Domain Cognitive Unity Model](CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md)
makes candidate-law construction part of bounded Cortex reflection. Cortex
compares competing laws on development evidence, seals a unique candidate
before the target verifier is exposed, and then tests transformation law,
invariants, controls, roundtrip, composition, and causal reuse. The inspectable
artifact records the candidate set and falsifier; hidden reasoning or a
post-hoc explanation cannot satisfy this contract.

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

Historical grounding includes the comparison of inside and outside descriptions
in [Einstein's elevator reasoning](https://www.einstein-online.info/en/spotlight/equivalence_light/)
and the role of coordinate transformations and invariant spacetime coincidences
described in [Einstein's philosophy of science](https://plato.stanford.edu/entries/einstein-philscience/).
These sources support the methodological lineage, not identity with the exact
MD-OS/APFC protocol.

The verifier uses declared required facts and forbidden misconceptions, but
content checks alone do not establish contact with reality. Whenever reflection
claims to learn a fact, the candidate and its prediction must precede the
observation, and the observation must be independently bound to current
evidence:

```text
self-question or Gedankenexperiment
-> competing hypotheses
-> sealed candidate and discriminating prediction
-> independent observation, calculation, formal proof, or experiment
-> hash-bound epistemic readback receipt
-> verified anchor or fail-closed rejection
```

The reflection path cannot create a verified cognitive anchor from
`verdict=pass` and a verbal evidence label. The receipt must have a valid
content hash, identify an independent verifier, confirm pre-observation
sealing, and resolve every evidence reference to a current workspace-relative
file with matching SHA-256. The broader Unity Tensor verifier additionally
requires heterogeneous frame predictions, coherent transformations and
invariants, simpler-baseline and severing controls, contamination audit, and
independent replication. A fluent revision, internal consistency, and elegant
tensor notation are not evidence by themselves.

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
