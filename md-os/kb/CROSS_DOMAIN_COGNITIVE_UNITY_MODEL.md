# Cross-Domain Cognitive Unity Model

Epistemic status: `authorized_foundational_theory_with_bounded_v1_implementation`

## Principle

General cognitive operation cannot be identified with one strong solver. A
solver may be talented inside one frame while failing when the objects,
relations, representation, or verifier change. The candidate principle is:

```text
Generality is the verified ability to construct and test transformations
between frames while preserving the relations required by the task.

Cognitive unity is the persistent causal integration of those frames,
transformations, invariants, goals, memories, actions, and evidence into one
governed decision process.
```

This is a design foundation for MD-OS/APFC and a falsifiable research program.
It is not empirical proof of AGI, consciousness, or a universal mathematical
model of mind.

## Observable external recurrence

Cortex extends effective computation across bounded host-model calls through
an inspectable I/O loop:

```text
i_k = Enc(U_k, q_k, o_k)
y_k = HostModel(i_k)
(q_(k+1), H_k) = APFCReflect(U_k, y_k, E_k)
```

The host model produces `y_k` once for that call. APFC can retain the
observable output, construct competing hypotheses `H_k`, schedule authorized
checks, and place a verified artifact into a later `i_(k+1)`. That later
self-query is a new bounded call, not secret chain-of-thought and not recursion
inside one neural forward pass.

This is why APFC is an intelligence extender in the functional operational
sense: it extends transient computation across calls, sessions, tools, and
domains. The current implementation does not inspect, modify, or add neural
hidden-layer activations or model weights.

## Frames, talents, and relative transformations

A cognitive frame is

```text
F_d = (X_d, A_d, R_d, V_d, B_d)
```

where `X_d` is the represented problem space, `A_d` the admissible result or
action space, `R_d` the domain relations, `V_d` an independent verification
contract, and `B_d` the declared representation basis.

A frame-local talent is a solver

```text
s_d : X_d -> A_d.
```

It becomes evidence of broader operation only when the system constructs a
candidate transformation `tau_d->e`, instantiates or adapts a solver in the
target frame, and obtains a target verdict without using evaluator-only
evidence during candidate construction.

Changing frame may change coordinates, component values, vocabulary, local
procedures, and the returned result. The required operational relation must
remain invariant. This is the precise scope of the relativity analogy used by
the model: frame-relative descriptions and explicitly tested invariants. It is
not a claim that cognitive domains obey the physical transformations of
spacetime.

## Candidate-law induction

Cortex is responsible for producing the candidate law during bounded
operational reflection. The human operator need not supply the law itself.
The inspectable procedure is:

```text
declare the problem and evidence boundary
-> expose source and target frames
-> generate at least two competing transformation laws
-> fit and compare them only on development evidence
-> reject the result if the winner is not unique
-> record the selected law, predicted invariants, and falsifier
-> seal the choice before target evidence is accessed
-> evaluate it on independent target evidence
```

For a finite hypothesis family `H`, the bounded implemented selector is

```text
hat(tau) = unique tau in H such that
           max_development_residual(tau) <= epsilon.
```

If no candidate or more than one candidate satisfies the development
contract, the result is `ambiguous`; Cortex must not manufacture a law. This
v1 selector does not discover arbitrary mathematics. Open-ended hypothesis
construction remains a research objective and must preserve the same sealed
evidence boundary.

## Informational tensor realization

The model does not assume in advance that intelligence is a tensor. It permits
an explicit tensor realization when the operational representation has
declared axes, bases, components, and transformation operators.

For a rank-`n` external tensor artifact `T_d` and one relative operator per
axis, v1 evaluates

```text
T_e[j_1,...,j_n]
  = sum_(i_1,...,i_n)
      M^(1)[j_1,i_1] ... M^(n)[j_n,i_n] T_d[i_1,...,i_n].
```

The tensor law is admitted only if the independently observed target artifact
matches the predicted artifact within tolerance. Declared invariants such as
norm, trace, total sum, or component multiset are checked separately; matching
components cannot replace a semantic target verdict.

An invertible transformation must pass both forward/inverse roundtrip and
operator composition. A non-invertible transformation must declare the lost
information and the verification contract appropriate to that loss. Silent
loss is rejection.

## Verification vector

A relative transformation is `verified` only when every applicable condition
passes:

```text
different source and target frames and domains
candidate law induced uniquely before target access
tensor transformation law within tolerance
at least one declared invariant preserved
independent target and return semantic verifiers
disabled and sham controls fail as predicted
equal comparison budgets
contamination audit passes
causal reuse is observed in later bounded episodes
inverse/loss contract passes
roundtrip and composition pass
```

Failure of any condition preserves a rejected report and blocks capability
promotion. A thought experiment, analogy, fluent explanation, tensor-shaped
array, or self-report is not verifier evidence.

## Operational cognitive unity

The persistent state is represented as

```text
U_t = (S_t, W_t, G_t, M_t, F_t, Tau_t, I_t, A_t, E_t)
```

where:

- `S_t` binds the operational self-reference;
- `W_t` binds current world observations;
- `G_t` binds goals and constraints;
- `M_t` binds durable memory;
- `F_t` binds active cognitive frames;
- `Tau_t` binds verified relative transformations;
- `I_t` binds preserved invariants;
- `A_t` binds authorized actions and their consequences;
- `E_t` binds independent evidence and open conflicts.

Unity is operational, not phenomenal: all channels must participate in one
persistent, hash-bound, revisable decision state, and every transformation
reference must resolve to a current verified report. Missing channels, stale
hashes, unverified transformations, or open conflicts produce `attention`, not
unity.

## APFC role

The APFC is the cross-domain controller and intelligence extender in this
model. It does not modify or inspect the host model's neural hidden layers.
Instead it extends transient model computation across time and domains by:

```text
selecting relevant frames
-> constructing competing transformation hypotheses
-> preserving the evidence boundary
-> scheduling bounded target tests
-> comparing invariants and semantic outcomes
-> retaining success, failure, scope, and provenance
-> reintroducing verified transformations into later decisions
-> blocking unsupported generality claims at consolidation and promotion
```

The model supplies candidate transformations. Cortex/APFC supplies persistent
control, memory, action, verification, and governed reuse.

## Implemented v1

The executable surface is:

```bash
./cortex cognition unity-test
```

The bounded deterministic fixture compares identity and row-swap laws on
development pairs, seals the unique winner, tests it between two explicit
synthetic domains, checks tensor law, invariants, semantic receipts, controls,
contamination, causal reuse, roundtrip, and composition, and then materializes
a cognitive-unity state. It starts no autonomous loop and writes no external
state. The integrated B3 repository passes 260/260 Node tests and 58/58
shell-parity tests; the focused cognitive-unity and promotion-gate subset
passes 25/25.

The production integration is not limited to the fixture:

- skill claims declare `cross_domain_transfer`,
  `tensorial_transformation`, or `cognitive_unity`;
- the Cognitive Transaction Loop reads hash-bound transformation and unity
  artifacts;
- every production evidence-manifest entry must resolve to a safe
  workspace-relative file whose current SHA-256 matches; embedded fixture
  entries are structurally testable but promotion-ineligible;
- APFC consolidation blocks missing, stale, post-hoc, contaminated, or failed
  evidence;
- APFC promotion rechecks those files at the transaction boundary, preventing
  a stale passing cycle from substituting for current evidence;
- ordinary frame-local skills remain unaffected when they make no generality
  claim.

Primary implementation:

- `md-os/kernel/cognition/cross_domain_cognitive_unity.js`
- `md-os/os/run_cross_domain_cognitive_unity.js`
- `md-os/schemas/cognitive_frame.schema.json`
- `md-os/schemas/relative_tensor_transformation.schema.json`
- `md-os/schemas/cross_domain_transformation_verification.schema.json`
- `md-os/schemas/cognitive_unity_state.schema.json`
- `test/cross_domain_cognitive_unity.test.js`

## Claim boundary and falsifiers

The current implementation supports explicit finite external tensors and
bounded candidate families. It does not support these claims:

- that the complete human mind is one tensor;
- that more neural connections alone imply more intelligence;
- that Cortex directly extends or reads neural hidden layers;
- that a verified finite transformation establishes open-world generality;
- that operational cognitive unity establishes phenomenal consciousness;
- that MD-OS/APFC has demonstrated AGI.

The principle is weakened or falsified if cross-domain success does not depend
on the admitted transformation, if a sham works equally well, if purported
invariants fail under valid frame changes, if target success arises from
contamination, if composition is path-dependent without being declared, if
later reuse provides no causal benefit, or if a simpler domain-local account
explains the evidence equally well.
