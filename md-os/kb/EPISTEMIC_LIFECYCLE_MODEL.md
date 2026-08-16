# Epistemic Lifecycle Model

MD-OS (Artificial Prefrontal Cortex) v5.0 separates operational reproducibility from epistemic truth.

The filesystem can make a reasoning path readable, auditable,
reconstructible, and actionable. It does not make a theory true by itself.
Every theoretical or computational result should therefore carry an epistemic
status that says what kind of claim is being made.

## Operating Definition

MD-OS can be described as a linearizer of thought in geometric-procedural
form.

This phrase is useful only if it stays operational. It does not mean that
thought is reduced to a single flat sentence. It means that fluid or heuristic
cognition is externalized into a navigable operational space and then routed
through bounded procedures:

```text
fluid or heuristic thought
-> textual nodes
-> relations and dependencies
-> procedures
-> states
-> checks
-> reconstruction and replay
```

The model is geometric because ideas, clues, results, and assumptions become a
space of files, links, hierarchies, indices, graphs, and operational
boundaries.

The model is procedural because the same material is not left as
contemplation. It becomes actions, builders, gates, audits, states, and
transitions.

In short:

```text
intuition -> trajectory
trajectory -> structure
structure -> procedure
procedure -> verifiable memory
```

The practical outcome is claim discipline. MD-OS should make it clear whether
a result is still a clue, a line of thought, a source principle, a reproducible
derivation, a prediction/readback artifact, or a correction.

## Lifecycle

```text
heuristic material
-> line of thought
-> frozen principle
-> derivation
-> prediction or readback
-> correction
-> replay
```

In MD-OS terms:

- `heuristic`: notes, journal entries, intake material, and raw analysis.
- `line_of_thought`: note blocks, natural-language programs, work items, and
  dependency sketches that organize a possible path.
- `frozen_principle`: source-of-truth files such as `md-os/kb/**`, `ME.md`,
  `AGENTS.md`, and canonical programs.
- `derivation`: deterministic scripts, symbolic calculations, builders, and
  reproducible transforms.
- `prediction_or_readback`: research results, connector outputs, gates,
  audits, and comparison artifacts.
- `correction`: change proposals, source edits, rebuilds, and replay.

## Practical Phase Table

| Phase | Typical files or artifacts | Promotion condition | Failure to avoid |
| --- | --- | --- | --- |
| `heuristic` | notes, journal entries, intake material, raw analysis | The clue is organized into an explicit relation or work item. | Treating a useful intuition as a claim. |
| `line_of_thought` | linked notes, natural-language programs, work items, dependency sketches | Assumptions and dependencies are clear enough to freeze or test. | Hiding missing assumptions inside fluent prose. |
| `frozen_principle` | `md-os/kb/**`, `ME.md`, `AGENTS.md`, canonical programs | The principle is accepted as source of truth for future operation. | Freezing a principle without reviewable scope and limits. |
| `derivation` | deterministic scripts, builders, reproducible transforms | Inputs, method, and outputs are recorded and repeatable. | Presenting a derived result without declared assumptions. |
| `prediction_or_readback` | gates, connector snapshots, audit outputs, comparison artifacts | The comparison target and method are explicit. | Calling retrodiction a strict prediction. |
| `correction` | change proposals, source edits, rebuilds, replay reports | The correction changes source or generated state with visible evidence. | Correcting silently without preserving why the claim changed. |

## Claim Promotion Rule

A claim may be promoted only when its previous phase, assumptions, evidence,
and failure condition are visible.

Use this minimum checklist before promoting theory-oriented material:

```text
What phase is it in now?
What assumptions does it depend on?
What source or artifact records it?
What would count as a failed gate?
Was the target declared before readback?
What changed if this is a correction?
```

If those answers are missing, the result should remain `heuristic`,
`conditional`, `derived`, or `open`.

## Logos And Clues

In this model, logic as logos is the ordered chain of ideas. It is broader
than formal calculation alone: it is thought arranged as a coherent
trajectory with explicit constraints.

Clues are local segments of that trajectory:

```text
clue
-> relation
-> thought segment
-> coherent line
-> principle
-> derivation
-> prediction
```

MD-OS should not leave these segments scattered. It turns them into an
operational geometry:

- nodes: ideas, clues, results, assumptions, hypotheses, and corrections
- edges: dependencies, analogies, derivations, contradictions, and revisions
- paths: lines of thought that can be inspected and continued
- principles: frozen starting segments promoted into source of truth
- gates: verification or falsification points

The threshold is explicit:

```text
suggestive chain = heuristic
constrained chain = operational logos
constrained chain + calculation + failure risk = predictive theory
```

## Epistemic Status Values

Computational and theoretical artifacts should use one of:

```text
heuristic
conditional
derived
retrodictive
predictive
open
falsified
```

The status belongs to MD-OS, not to the calculation engine. A calculator may
return `True`, but MD-OS still has to say whether the result is derived under
declared assumptions, conditional on an unfinished proof, retrodictive against
known data, predictive before readback, open, or falsified.

## Guardrail

Retrodiction must not be presented as strict prediction.

A result is `predictive` only when the prediction target, timestamp or version,
input state, assumptions, and comparison procedure were declared before
readback. Otherwise it is `retrodictive`, `conditional`, `derived`, or
`open`.

Every theory-oriented work item, calculation profile, gate, or research result
should therefore state which phase it occupies:

```text
heuristic
line_of_thought
frozen_principle
derivation
prediction_or_readback
correction
```

The same artifact may move through phases over time, but the movement must be
visible through source edits, change proposals, generated state, journal
events, rebuilds, or replay. MD-OS may stabilize and audit the path, but it
does not make the theory true merely by storing it.
