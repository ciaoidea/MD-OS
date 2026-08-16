# Operational Sensemaking Model

Operational Sensemaking is the MD-OS layer after Role Chaos Intake.

Role Chaos Intake answers:

```text
what is on the desk?
which formats exist?
which weak operational signals appear?
what should an expert clarify first?
```

Operational Sensemaking answers:

```text
which cases are present?
which symptoms, actions, systems, outcomes, and operations recur?
which relations appear between them?
which root causes are plausible, with evidence and confidence?
```

It is role-first. It must parse and carry the role contract from:

```text
md-os/ops/roles/<role_id>/ROLE.md
```

The role contract defines mission, expected outputs, systems, hard boundaries,
and escalation points. Sensemaking should not claim that a relation or action
is operationally relevant unless it can be tied back to the role or explicitly
marked as uncertain.

It is not magic understanding. It is structured hypothesis generation:

```text
hypothesis + evidence + confidence + question
```

For new-hire assistance, the sensemaking output is the chat grounding layer.
When the new hire asks how to handle a concrete ticket, order, request, or
exception, MD-OS APFC should answer from the role contract, reconstructed cases,
work patterns, relation graph, and unresolved expert questions. If the evidence
is weak or an action crosses a role boundary, MD-OS APFC must say so and ask for
approval or expert clarification.

## Directory Layout

For each role:

```text
md-os/ops/roles/<role_id>/cases/cases.ndjson
md-os/ops/roles/<role_id>/cases/cases.json
md-os/ops/roles/<role_id>/cases/cases.md
md-os/ops/roles/<role_id>/graph/relation_graph.json
md-os/ops/roles/<role_id>/graph/relation_graph.md
md-os/ops/roles/<role_id>/analysis/sensemaking.json
md-os/ops/roles/<role_id>/analysis/role_understanding.md
md-os/ops/roles/<role_id>/analysis/root_cause_candidates.md
md-os/ops/roles/<role_id>/analysis/work_patterns.md
md-os/ops/roles/<role_id>/analysis/questions_for_expert.md
```

The source material remains under:

```text
md-os/ops/roles/<role_id>/intake/raw/
```

## Case Record

A case is a reconstructed unit of work:

```json
{
  "case_id": "case_...",
  "role_id": "backoffice_ordini",
  "source_files": ["md-os/ops/roles/backoffice_ordini/intake/raw/example.txt"],
  "operation_signals": ["ticket_triage", "approval_or_escalation"],
  "systems": ["Ticketing", "ERP"],
  "symptoms": ["production_blocked"],
  "actions": ["escalate", "notify"],
  "outcomes": ["resolved"],
  "cause_signals": ["missing_data"],
  "role_relevance": {
    "score": 0.42,
    "reasons": ["matched role systems: Ticketing, ERP"]
  },
  "confidence": "medium"
}
```

The builder splits CSV, JSON, NDJSON, and text material into reconstructed
cases where possible. Large or proprietary exports still need connectors or
extractors to become precise operational evidence.

## Relation Graph

The relation graph connects observed entities:

```text
case -> operation
case -> system
case -> symptom
case -> action
case -> outcome
symptom -> cause_candidate
cause_candidate -> action
```

Edges keep counts and evidence paths. The graph is an audit artifact, not a
claim of final truth.

## Root Cause Candidates

Root causes are candidates, not conclusions. Each candidate must include:

- label
- evidence count
- observed symptoms
- observed actions
- evidence files
- confidence
- expert question

The system should prefer useful uncertainty over false certainty.

## Builder

Use:

```bash
mdos role sensemake <role_id>
```

or:

```bash
node md-os/os/build_role_sensemaking.js <role_id>
```

Run `mdos role intake <role_id>` first. Sensemaking can run without perfect
extractors, but non-text formats remain weak evidence until extracted into
readable text.
