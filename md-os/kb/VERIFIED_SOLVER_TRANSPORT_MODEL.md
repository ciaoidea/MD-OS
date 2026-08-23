# Verified Solver Transport Model

## Status and claim boundary

This model defines a bounded candidate mechanism for generality: transport a
verified solver structure between explicitly different frames, instantiate a
frame-local solver under equal budgets, and admit the transport only after
independent hidden verification.

The repository contains controlled synthetic evidence for one two-step
invariant across five finite frames. It does not establish open-world
generalization, a universal representation of intelligence, a general tensor
of AGI, externally replicated learning, or AGI.

## Core objects

A frame is

    F = (P_F, A_F, R_F, V_F)

where P_F is the problem space, A_F the answer or action space, R_F the domain
relations and assumptions, and V_F an independent verification contract.

A frame-local talent is a solver

    s_F : P_F -> A_F

that may be strong inside F without transferring outside it.

A candidate frame transformation

    tau : F -> F'

contains a problem encoder, a result decoder, the structure claimed to be
preserved, and a verifier. A transported result is admissible only when the
transformed solver is generated before hidden evidence is exposed and the
decoded result passes the original-frame verification contract.

The candidate generality operator is

    G(C_t, F, p) -> (F', tau, s_F', a, evidence)

where C_t is persistent operational context. The operator is not admitted as
general merely because it changes representations: the transformation, result,
budget, contamination boundary, and claimed invariant all require readback.

## Verified transport contract

For problem p, encoder E_tau, target solver s_F', and decoder D_tau, the bounded
preservation condition is

    V_F(p, D_tau(s_F'(E_tau(p)))) = pass.

Textual equality is not required; preservation of the declared operational
relation is. Persistent context commits the transport only on pass:

    pass    -> retain transformation, solver structure, scope, evidence, verdict
    fail    -> retain the falsification; do not promote the transport
    unknown -> retain the hypothesis as unverified; do not promote it

## Finite transport tensor

The controlled fixture defines a binary rank-three tensor

    T[frame, solver_step, operator_kind]

with shape [5, 2, 3]. Its axes are five finite synthetic frames, two ordered
solver positions, and three operator kinds: filter, map, and reduce.

The observed invariant is filter>map. Components depend on the frame basis,
while the tested operator sequence survives a reversal permutation of that
basis. For permutation matrix P, the implemented transformation law is

    T_prime[i,p,o] = sum_j P[i,j] * T[j,p,o].

Applying the inverse permutation reconstructs T exactly. This establishes a
finite permutation-equivariant tensor representation of solver structure in
the fixture. It does not establish covariance under arbitrary changes of
basis, a tensor field over open domains, or a tensor representation of AGI.

## Controlled experiment

Experiment verified_solver_transport_20260823_v1 uses repository-local,
deterministic tasks.

Source frames:

- numeric signal processing;
- text normalization.

Wholly different target frames:

- operational record routing;
- graph route selection;
- spatial sensor-grid projection.

The source frames independently admit the same structural solver sketch,
filter>map. Target primitive identifiers and semantic domains are absent from
the admitted source solvers. Candidate generation receives public task examples
but no target program, hidden test, evaluator-only expected value, or oracle
object.

Each target is evaluated under the same 12-candidate budget:

    memory disabled:    no prioritized solver structure
    reversed sham:      map>filter
    verified transport: filter>map

An independently coded target oracle runs only after candidate generation. The
preregistered closure condition requires:

- two independently admitted source frames;
- source/target domain and primitive separation;
- no forbidden evaluator data in learner requests;
- equal candidate budgets;
- 0/3 success for both controls;
- 3/3 target-frame and 6/6 hidden-case success for verified transport;
- identical source and target tensor invariants;
- exact recovery after the tested frame-basis permutation.

## Observed result

The deterministic report returns:

    status:                              ok
    memory-disabled success:             0/3
    reversed-sham success:               0/3
    verified-transport success:          3/3
    verified hidden cases:               6/6
    delta over memory-disabled control:  1.0
    tensor shape:                         [5, 2, 3]
    tensor nonzero components:            10
    frame-permutation equivariance:       pass
    contamination audit:                  ok
    report hash:                          a079b062412a1546b951a0aa83afbade4955b15545026e1e1e73d6665c665fd6

The causal interpretation is bounded: under the fixture's fixed enumeration
order and equal candidate budget, prioritizing the source-induced invariant is
the changed condition that makes all three target solvers reachable; disabling
it or reversing it removes the advantage.

## Falsifiers and limits

The bounded result is falsified if a control solves a preregistered target,
verified transport fails a target or hidden case, evaluator-only data enters
the learner request, budgets differ, the source invariant is not independently
present in both source frames, or inverse frame-basis transformation fails.

The experiment has only three target frames and six hidden cases. It has no
population-level statistical claim, external replication, real-world noise,
continual frame discovery, arbitrary solver depth, or open-world evaluator.
The tensor uses one discrete permutation family. The result supports a
mechanism inside a controlled finite family, not AGI.

## Implementation and evidence

- md-os/kernel/cognition/verified_solver_transport_experiment.js
- md-os/schemas/verified_solver_transport_experiment.schema.json
- test/verified_solver_transport_experiment.test.js

The experiment runs once and starts no autonomous loop. A future extension must
separate frame discovery from evaluator labels, add composed unseen transports,
precommit a larger sealed cohort, and obtain independent external replication
before widening the claim.

This experiment is bounded evidence for one transported solver invariant. The
general runtime contract that now governs candidate-law induction, relative
tensor transformations, cognitive-unity state, and APFC promotion is defined
separately in the
[Cross-Domain Cognitive Unity Model](CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md).
The two results must not be conflated: the solver-transport tensor records one
finite mechanism, while the cognitive-unity model defines how future
cross-domain claims must be constructed and verified.
