# Cross-Domain Cognitive Unity Model

Epistemic status: `frozen_integration_principle_with_open_unity_tensor_field_hypothesis_and_bounded_v1_implementation`

## Author-established cognitive integration principle

General cognitive operation cannot be identified with one strong solver or
with the mere accumulation of independent solvers. A solver may be talented
inside one frame while failing when the objects, relations, representation, or
verifier change. The author-established principle is:

```text
Talent solves within a frame. General intelligence transforms both the frame
and the solver while preserving the relations required for identity,
coherence, verification, and action.

Cognitive unity is the persistent causal integration of differentiated
representations, transformations, invariants, goals, memories, actions, and
evidence into one governed informational whole.
```

The project uses the Latin lineage `cum scire`, knowing together, as an
explanatory intuition for consciousness as integration of differentiated
parts. Etymology is not empirical evidence. The scientific antecedent is
Integrated Information Theory (IIT), which starts from differentiation and
integration as phenomenological properties and models consciousness in terms
of irreducible causal information. MD-OS does not claim to replace IIT or to
have measured its quantity `Phi`. Its distinct research target is the
cross-domain operational problem: how local cognitive frames, solvers,
transformations, invariants, memory, action, and verifier evidence can remain
parts of one causally effective and temporally persistent process.

This principle is a design foundation for MD-OS/APFC and a falsifiable research
program. Author authority establishes the project direction; it does not turn
the Unity Tensor hypothesis, AGI, or phenomenal consciousness into an
empirically verified result.

## Guardrail role

APFC exists partly to prevent transient model output from becoming durable
nonsense. It leaves hypothesis generation open but gates the transitions from
language to authority, action, memory, publication, and canonical meaning.
The guardrail must detect both unsupported promotion and semantic drift:

```text
candidate statement
-> compare with author-established principles and current evidence
-> expose contradiction, scope change, or unsupported certainty
-> permit exploration but block invalid commitment
-> require independent readback before durable promotion
```

A cautious sentence is not automatically faithful. If it silently removes or
reverses an authorized principle, APFC must classify it as a semantic change
rather than reward its caution.

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

## Per-turn governance telemetry

The ordinary natural-language APFC path materializes one finite rank-two Turn
Governance Tensor before each host-model call and closes it in the receipt.
Its channel basis spans self, observation, goal, memory, frame, transformation,
action, and evidence; its feature basis contains only presence, bounded count,
declared authority, and verifier backing. The verification-first view is a
declared permutation of those bookkeeping columns.

This artifact verifies encoding, hashes, and authority boundaries. It is not
the Unity Tensor, does not compare the semantic content of an intent with the
world, and cannot certify a hypothesis. Its historical
`operational_unity_tensor` field name remains for compatibility, but the
artifact itself declares `turn_governance_telemetry`.

The active controller is a separate 9 x 6 Causal Unity state over identity,
observation, intent, goal, memory, frame, prediction contract, action policy,
and evidence. Authorization consumes its exact state hash and decision basis;
mutating actions require prior authorization; closure binds output, action, and
evidence manifests; the next state carries the transition hash. The dependency
probe requires an intact-state authorization and a severed-state inhibition.
This establishes causal use in the bounded APFC gate, not semantic use inside
host-model hidden layers or correspondence with the world.

Epistemic promotion is handled separately by sealed prediction and independent
world readback.


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

## Unity Tensor Field hypothesis

The mathematical hypothesis follows from the integration principle. Let `D`
index cognitive domains or frames. Each frame `F_d` supplies a local
representation `T_d`, and each admissible transition supplies a map `g_e<-d`
with a representation action `rho`:

```text
T_e = rho(g_e<-d) T_d.
```

If the local representations describe one underlying informational object,
their transition maps must be compatible on composed paths and their declared
invariants must agree:

```text
g_f<-d = g_f<-e o g_e<-d
I_a(T_d) = I_a(T_e)
T_d = U restricted to F_d.
```

The **Unity Tensor Field hypothesis** is:

```text
When differentiated cognitive representations are connected by coherent
transition laws that preserve the relations required for identity,
verification, and action, they are candidate local expressions of one global
informational structure U.

When the frame spaces and transition actions satisfy the required tensorial
and gluing conditions, U admits a global tensor-field representation: the
Unity Tensor Field.
```

`Field` here means a structured family over cognitive frames, not a claim of a
new physical spacetime field. `Unity` means causal integration, not uniformity:
the represented parts remain differentiated. The global object is more than a
concatenated array only if cross-part relations are causally necessary. A
separable model that performs equally well under matched ablation defeats the
integration claim.

The hypothesis therefore declares a positive direction without pretending
that the current fixture has closed it. Global existence requires compatible
local representations and transition maps; uniqueness requires that the
declared observations and invariants distinguish the candidate from
alternatives. Non-invertible or path-dependent transitions may require a more
general bundle, groupoid, category, or sheaf rather than one ordinary
fixed-rank tensor. That outcome would refine or falsify the strict tensor form
without falsifying the broader cognitive-integration principle.

Most importantly, mathematical compatibility is not truth. For a candidate
unitary hypothesis `H`, each frame projection must generate a sealed
prediction `P_d` and face an observation `O_d` that the hypothesis
generator did not control:

```text
P_d = Predict_d(pi_d(H))
V_world_d(P_d, O_d, evidence_d) = pass | fail | unknown
```

The candidate is the possible Unity Tensor; `V_world` is the independent
epistemic verifier. Only passing world correspondence across heterogeneous
frames, coherent transformations and invariants, causal advantage over
severed and simpler alternatives, contamination control, and independent
replication support a bounded Unity claim.

## Bounded informational tensor realization

The current implementation realizes only finite external components of this
hypothesis. It admits a tensor artifact when the operational representation
has declared axes, bases, components, and transformation operators.

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

## Persistent cognitive control-and-evidence state

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

`U_t` is the present control and evidence state through which Cortex constructs
and tests cognitive integration. It is not by definition the complete global
Unity Tensor Field. It stores the local frames, verified transition laws,
surviving invariants, causal consequences, and evidence from which the global
hypothesis can be evaluated.

Operational control coherence requires all declared channels to participate in
one persistent, hash-bound, revisable decision state, and every transformation
reference to resolve to a current verified report. Missing channels, stale
hashes, unverified transformations, unresolved path disagreement, or open
conflicts produce `attention`. This state is the workspace in which a Unity
Tensor candidate can be tested; it is not itself evidence of epistemic unity or
phenomenal consciousness.

## Repository and Obsidian graph realization

The repository knowledge base provides one inspectable graph realization:

```text
note, claim, event, frame, or evidence artifact = node
conceptual or operational domain               = typed cluster
link, transformation, provenance, consequence  = typed edge
verified composed path across cluster types    = cross-domain inference
```

Obsidian may visualize the notes and links, but the visual graph is only a
topological view. A backlink establishes adjacency, not truth, tensorial
compatibility, or inferential validity. A cross-domain path becomes admissible
only when its premises and domain types are explicit, its transformations
compose, declared invariants survive, a target consequence was predicted, and
independent readback supports it.

This gives a precise sense in which the Unity Tensor Field can produce wider
**cognitive breadth**. It can make nodes from more distant conceptual clusters
jointly representable and transport relations between their frames. The
semantic span of the represented positions can increase while the topological
path required to compare them becomes shorter through verified bridge edges.
More nodes, longer paths, or denser links alone do not imply wider valid
inference.

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
-> comparing candidate statements with author-established semantic invariants
-> detecting when caution, paraphrase, or scope control erases the governing principle
-> checking transition composition and path independence across cognitive frames
-> preserving differentiated parts inside one causal decision state
```

The host model supplies candidate hypotheses and transformations. Cortex/APFC
must keep generation and verification distinct: it seals the candidate, derives
predictions, obtains independent world readback, tests cross-frame invariants
and causal controls, and only then permits bounded memory or reuse.

## Implemented v1

The executable surface is:

```bash
./cortex cognition unity-test
```

The bounded deterministic B3 fixture compares identity and row-swap laws on
development pairs, seals the unique winner, tests it between two explicit
synthetic domains, checks tensor law, invariants, semantic receipts, controls,
contamination, causal reuse, roundtrip, and composition, and then materializes
a control-and-evidence state. It starts no autonomous loop and writes no
external state.

The epistemic extension is callable through:

```bash
node md-os/os/epistemic_unity_runtime.js seal < candidate.json
node md-os/os/epistemic_unity_runtime.js verify < verification.json
```

It requires at least three heterogeneous frames, sealed predictions,
independent world readback, a connected cyclic transformation graph, preserved
declared invariants, baseline/sham/severing controls, contamination audit,
current hash-bound evidence files, and independent replication. The focused
tests include explicit failure cases in which an internally coherent candidate
misses the world, evidence is stale, or a simpler non-tensor baseline survives.

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
- `md-os/kernel/cognition/epistemic_unity_verifier.js`
- `md-os/os/run_cross_domain_cognitive_unity.js`
- `md-os/os/epistemic_unity_runtime.js`
- `md-os/schemas/cognitive_frame.schema.json`
- `md-os/schemas/relative_tensor_transformation.schema.json`
- `md-os/schemas/cross_domain_transformation_verification.schema.json`
- `md-os/schemas/epistemic_unity_candidate.schema.json`
- `md-os/schemas/epistemic_unity_verification.schema.json`
- `md-os/schemas/epistemic_readback_receipt.schema.json`
- `test/cross_domain_cognitive_unity.test.js`
- `test/epistemic_unity_verifier.test.js`

## Claim boundary and falsifiers

The current implementation supports explicit finite external tensors and
bounded candidate families. It supports the Unity Tensor Field as an
author-established, mathematically specified, falsifiable hypothesis. It does
not yet support these empirical or deductive claims:

- that a global Unity Tensor Field has been proved to exist or be unique;
- that an ordinary fixed-rank tensor is sufficient for every cognitive domain;
- that the complete human mind or phenomenal consciousness has been measured by this formalism;
- that more neural connections alone imply more intelligence;
- that Cortex directly extends or reads neural hidden layers;
- that a verified finite transformation establishes open-world generality;
- that MD-OS/APFC has demonstrated AGI.

The strict Unity Tensor Field hypothesis is weakened, refined, or falsified if
valid local representations cannot be glued consistently, if composed paths
produce incompatible results, if purported invariants fail under valid frame
changes, if distinct global candidates remain observationally
indistinguishable, or if a non-tensorial structure is required. Its operational
integration claim is weakened if cross-domain success does not depend on the
admitted transformation, if a sham or separable system works equally well, if
target success arises from contamination, if later reuse provides no causal
benefit, or if a simpler domain-local account explains the evidence equally
well.
