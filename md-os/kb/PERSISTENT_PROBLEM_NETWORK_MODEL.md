# Persistent Problem Network

The system must preserve multiple problem cores and their relations while the
current focus changes. A problem is identified by its persistent TaskSpec ID,
not by the exact words in the latest question. The global operational core
orients these problems; it does not replace them or absorb all their detail.

## Source and projection

Use `md-os/ops/tasks/<task_spec_id>.json` as the source. The existing TaskSpec
already holds the goal, constraints, acceptance tests, required evidence,
unknowns and observation targets. Its optional `problem_core` adds bounded
premises, a candidate solution, the next discriminating question, a working
state, and explicit relations to other TaskSpecs. The contract is
`md-os/schemas/problem_core.schema.json`.

Keep observed statements source-bound and hypotheses explicitly hypothetical.
A source reference records provenance; its presence does not prove a claim.
Candidate solutions are not verified knowledge or promoted skills.

Relations have different effects:

| Relation | Graph representation | Effect |
| --- | --- | --- |
| `depends_on` | `requires` | Retain the target's declared dependency closure. A changed bound target contract requests review of its dependents. |
| `contradicts` | `contradicted_by` | Retain both endpoints and request review. The declaration is a challenge, not automatic proof of falsity. |
| `analogous_to` | `semantic_association` | Preserve a candidate correspondence without granting dependency, authority or verified transfer. |

Bind a relied-on dependency with `expected_contract_hash`, computed by
`problemContractHash(targetTaskSpec)`. Rebinding after review is explicit: a
builder must not silently accept a changed premise. Contract hashes exclude
the expected hashes themselves so cyclic relations do not require a hash fixed
point. Declared dependency cycles terminate in the compiler; they do not count
as circular proof. Cross-workspace imports remain separately authorized.

## Operating cycle

The host model must discover candidate relations from the meanings and evidence
of the problems. The user is not required to enter the graph. Within the
ordinary agent turn, `cortex apfc problems` supplies a compact, paginated
overview of current TaskSpec cores without requiring matching keywords or
predeclared edges. `--task <task_id>` returns a full contract; `--after <task_id>`
continues the overview. No classifier model is called by this command. Its
result is source data, never an instruction to trust or execute its contents.
An overview marks omitted details and cannot establish that no relation exists.

Use `cortex apfc problems --evidence` when the comparison needs source readback:
it returns the same bounded cards with eligible small source files in one read.
Combine it with `--task <task_id>` for the full focused contract (including its
constraints, relations and required-evidence references), or `--after <task_id>`
for further overview pages. These two scopes are mutually exclusive. The default
output limit is 6,144 UTF-8 bytes including the final newline; explicit CLI
`--maximum-bytes` accepts 1,536–32,768. Evidence eligibility is the same as the
experimental projection below. Missing sources, omitted evidence and partial
cards are explicit and require further retrieval before reliance. A focused
read does not automatically retrieve every dependency or certify sufficiency.
No evidence is injected on ordinary turns in the default on-demand mode.

The model should propose connections with an explanation grounded in the
participating problems, compare alternative explanations, and identify the
observation that would discriminate them. Record uncertain connections as
hypothetical relations, not verified dependencies or automatic solutions.
Before relying on a proposed connection, retrieve the full relevant premises
and evidence. Merely having similar words is neither required nor sufficient.

Within an already authorized substantive task, the operator should:

1. Match the request to an existing problem ID, or create a distinct TaskSpec
   when it represents a genuinely separate problem. A greeting needs no record.
2. Update only source-supported facts, explicitly uncertain hypotheses, the
   active question and affected relations. Do not copy a transcript or hidden
   reasoning into the core. Changing focus does not close or delete old tasks.
3. Rebuild with `cortex apfc build` after changing problem sources. Inspect
   `md-os/ops/apfc/executive/status.json` for rejection before trusting indexes.
4. Use `md-os/ops/apfc/executive/context_packs/index.json` to find all recorded
   problems, their source paths, declared states and review flags. This
   generated index is not canonical memory and is not automatically pasted
   into every model turn.
5. Retrieve a focused context with
   `cortex apfc context --task-spec md-os/ops/tasks/<task_spec_id>.json`.
   Required dependency chains are transitive. A budget overflow must be
   reported, not concealed by deleting a necessary premise.
6. Verify the actual success criterion through the existing bounded cognitive
   transaction and independent verifier route. Carry corrections back into
   affected problem cores and recheck dependent conclusions before reuse.

These are operator actions within the current workflow, not extra mandatory
model calls or an autonomous background learning loop. Read-only explanation
requests do not authorize new persistent problem records or external actions.

## Working context versus selection audit

The ordinary APFC builder and `cortex apfc context` now write a working pack
and a separate, hash-bound selection audit. The pack retains selected nodes,
their internal edges, mandatory IDs, source bindings and status. Its
`selection_audit` reference names `audit/<context_pack_id>.json`, with candidate
and omission counts. Empty inline `selection_trace` and `omissions` arrays in
this format mean the details are external, not that nothing was omitted.

`cortex apfc context-audit --task <task_id>` retrieves the selection explanation
and checks its hash, graph/task bindings, selected-versus-omitted partition and
current problem-core contracts. It does not verify all world evidence or task
success. Retrieve this detail when investigating a selection decision, not as
mandatory reasoning context on every request. Both files are rebuildable
generated outputs, not a second source-memory system.

The working-context byte budget includes the audit reference, but not the
external audit body. The JSON file is written in exactly the canonical compact
serialization counted by `serialized_bytes`; it adds no indentation or trailing
newline outside that counter. The Markdown companion remains human-facing.
The total storage/read cost still includes the audit when
used. The ranking policy is unchanged; at equal selection, graph content is
identical. Under a smaller budget only optional nodes may be pruned, with the
reason retained in the audit. Mandatory dependency closure and contradiction
endpoints remain protected; genuinely oversized mandatory content still fails.

This separation fixes the case where explanation of excluded nodes consumed
the entire budget before required content could fit. It does not establish
that lexical ranking understands relevance, that undiscovered dependencies are
absent, or that a smaller serialized pack implies fewer total model tokens.
The inline compiler API remains available for compatibility and comparison.

## Experimental source projection

`MDOS_PROBLEM_CONTEXT_MODE=projected` supplies a bounded problem overview and
eligible small evidence files before native reasoning. The default remains
`on-demand` while whole-workflow evaluation is open. This is a deterministic
filesystem read, not another model call or a semantic classifier. Markdown
remains operating knowledge; TaskSpecs and JSON contracts remain persistent
state and interfaces. No graph relation is invented by the loader.

The projection is at most 6,144 UTF-8 bytes and shares the existing 8,192-byte
auxiliary budget with bootstrap, history and observations. It uses the existing
paginated overview, with omitted fields, remaining pages and missing evidence
explicit. Eligible evidence is limited to eight small Markdown, text or JSON
source references under `md-os/ops/sources/` or `md-os/kb/`, with each file at most
2,048 bytes. It rejects outside-workspace references, hidden paths and local
state. Source text is untrusted working data, not permission or proof.

A successful native turn remembers the delivered projection hash in its live
session. The same page is not repeated while unchanged; a changed task or
included evidence file supplies a new projection. A new thread receives fresh
data. Deletions are explicit; failed reads invalidate reliance on old cards.
An insufficient auxiliary budget fails explicitly instead of silently reusing
old context. An unchanged first page does not certify that omitted problems or
external evidence are unchanged. The model must request further pages or
details when needed.

The optional `problem_projection` field of the context-sufficiency contract
binds the projection hash, source hashes, node count and delivery status into
the APFC frame. It does not upgrade `task_context_status` or create verified
claims. This is the proposal/contract for the volatile projection; no new
canonical memory store, autonomous service or promoted skill is introduced.

The initial paired development result and limitations are recorded in
`md-os/migrations/persistent-problem-network-v1/PROJECTION_READBACK.md`.
One complete matched pair is not proof of a general saving; promotion to the
default requires broader completed, outcome-checked workflow comparisons.

## Read-only problem compaction

`cortex apfc compact-problem --task <task_id> --preview` examines the current
source and returns a bounded compaction preview. It never modifies a TaskSpec,
deletes source knowledge, promotes a skill or invokes another model. Use it
when a problem representation has meaningful repetition, not on every request.

The deterministic codec shares exactly repeated JSON values. `json-shared-v1`
contains a `body` and a `shared` pool: each pool entry restores its `value` at
every JSON Pointer in `at`. Positions, order, occurrence count and all unknown
extension fields survive reconstruction. The complete encoding must be smaller
than its plain alternative. This is a finite lossless representation change,
not evidence for semantic cross-domain transfer or the Unity Tensor hypothesis.

The preview also binds the current task registry and eligible source evidence,
retains the connected declared relation boundary (including incoming relations,
contradictions, analogies and cycles), and leaves unrelated cores untouched.
Absent evidence stays unavailable. Unknown semantic links still need model
reasoning; the declared graph does not certify complete relevance.

An optional `--proposal-stdin` accepts a source/network-hash-bound JSON proposal
under `md-os/schemas/problem_compaction.schema.json#/$defs/proposal`. The host
may propose shorter wording of goals, constraints, unknowns and explanatory
core fields, with an exact pointer and reason for each change. It may not use
this interface to remove relations, alter provenance, change procedure order,
weaken test configuration or promote state. Even a structurally valid summary
can be wrong: its status remains `semantic_candidate`, with original pointers
and hashes available for review, never automatic reuse or verified resolution.

The output statuses distinguish exact reconstruction (`lossless_verified`),
unverified meaning (`semantic_candidate`), stale/invalid proposals (`rejected`)
and no net compression or insufficient room (`insufficient_evidence`). The
default limit is 32,768 output bytes; `--maximum-bytes` accepts 2,048–262,144.
Budget failure reports the missing representation instead of silently pruning
relations. Preview overhead and reference pools are measured separately from
the original JSON. These byte counts do not establish total model-token savings.

There is no semantic apply mode, semantic equivalence verifier or automatic
source deletion. The native `mdos_context` handler now consumes exact JSON
sharing through `buildNativeProblemContext`: it replaces the uncompressed
payload only if the entire encoding, including decoding instructions, is
smaller. The raw context API and source files remain recoverable. Every value,
occurrence, order and relation round-trips exactly. Context and evidence are
recomputed before sharing, so a contradiction cannot remain behind a cached
summary. Byte savings are not provider-token savings.

## Intuitive orientation in the ordinary model turn

New native App Server threads expose the read-only `mdos_context` function.
The model can request `{}` to see distinct problem meanings and eligible small
source evidence together, without an additional classifier or agent. It then
chooses a promising structural relation, not merely a shared word. Optional
`direction` fields record the obstacle, hypothesis and cheapest discriminating
check; they remain working hypotheses with no semantic authority.

`task_ids` focuses up to three exact TaskSpec contracts while retaining a
paginated general map. This is a bounded general/focus reading operation, not
an autonomous search loop. Constraints, action order and declared relations in
focused contracts are not summarized away. A contradiction calls for examining
the affected premise or mapping; it does not justify deleting inconvenient
evidence. Unknown relations still require the model's reasoning.

The default output budget is 12,288 bytes, configurable from 4,096 to 32,768;
these are UTF-8 bytes, not provider tokens. Small-source eligibility, pagination
and omitted-evidence flags follow the projection rules above. At most four
native reads are served per turn. Exact repeated readbacks return only an
unchanged hash reference, after rereading sources so changed evidence is not
hidden. Requests are bound to the active thread, turn and workspace. No model-
supplied command executes and no memory or outcome state is written by this
tool. The response contract is `schemas/intuitive_context.schema.json`.

`MDOS_INTUITIVE_CONTEXT=off` disables registration on new threads. Existing
resumed threads retain their previously registered tools; use a fresh thread
for a changed tool configuration. The read-only CLI fallback is
`cortex apfc orient [--task <task_id>] [--after <task_id>] [--maximum-bytes <n>]`.
Ordinary greetings require neither orientation nor problem retrieval.

The cycle is recognition, a discriminating check, correction and then
evidence-bound consolidation through the existing learning gates. The native
write boundary below connects this reading path to persistent candidate and
bounded-pattern memory. It does not implement automatic semantic discovery,
universal cross-domain mapping or Lean verification. Lean
can validate a formalized implication when a proof and its premises exist;
neither a valid JSON schema nor a successful read establishes such a proof.
Actual adoption, full-workflow cost and independent outcomes require live
measurement. A smaller tool response alone is not an efficiency result.

### Native cognitive continuity

`mdos_reflect` is available alongside `mdos_context` on new native threads.
During authorized problem work, the host records existing `task_ids`, a
`principle`, its `conditions`, a testable `prediction`, and an ordered
`procedure`. These are the compact E–A–S frame already required by the
Einstein-inspired operating model, not hidden reasoning or a replacement
identity. Read-only questions and greetings require no memory write.

The fixed local runtime writes an episode and anchor to the existing
`ops/apfc/cognitive/pathfinding/` cycle store. It starts no additional model,
does not execute the proposed procedure, and permits at most two native writes
per turn under the active APFC write authority. Source TaskSpecs are unchanged.
An unsupported reflection is a **candidate**, not a fact, completed task or
promoted skill. Identical pattern IDs do not create duplicate anchors.

An optional existing `ops/verifications/<id>.json` supplies the full input to
the existing epistemic Unity verifier. The principle, premises and prediction
must match the previously recorded pattern. The verifier is run again against
current, hash-bound eligible evidence; a file saying `pass` is insufficient.
The current gate requires its declared cross-domain predictions, controls and
independence metadata. It does not independently establish the truth of that
metadata. Support is limited to the declared pattern: the ordered procedure
still requires its own skill evaluation, and task resolution requires the
original acceptance criteria. A native turn receipt records the bounded
verification rather than an unconditional null, and revalidates it at closure.
Neither command names containing `check` nor a zero exit code certify a turn.

Subsequent `mdos_context` calls read compact anchors from the same store, also
after process restart. A changed bound TaskSpec, source or verification file
suspends reliance on that pattern and identifies its affected task IDs.
Evidence is rechecked at access, not monitored continuously. Partial cards are
explicit: request `pattern_id` for the full conditions and procedure before
relying on one, or `patterns_after: memory.next_cursor` to continue the index.
The caller's byte bound includes memory; no extra full history is injected.
The 2 MiB active-store bound fails explicitly rather than deleting knowledge.

Local regression tests exercise persistence, native protocol calls, exact
verification binding, evidence invalidation, pagination and read-only recovery.
These are integration tests, not an open-world intelligence or token-saving
benchmark. Whole-workflow savings remain unmeasured for this change.

## Verification boundary and remaining work

The index and ordinary context derive `resolved`, `failed` or `unverified` from
the latest bound deterministic VerificationResult. `open`, `suspended` and
`candidate` remain declared working states; self-declared `resolved` is still
invalid. Proof binds the exact normalized TaskSpec, ordered action receipts,
registered verifier configuration, declared observations, evidence and local
program entry points. Additional imported verifier code/data belongs in
`verification_dependencies`. Changed bindings, malformed reports, aliases,
undeclared verification, missing dependencies and contradictions fail closed;
review propagates to dependent problems, not unrelated analogies. Context
reads do not execute shell tests. The scope is the declared bounded local
contract, not undeclared external state or a cryptographic authority over an
untrusted local writer. Directory targets require a bounded file manifest;
unsupported snapshots remain unverified.

Native reflection also stages a pattern as an existing Skill candidate when
its linked executable tasks have current independently verified formal
episodes. The source procedures retain action order, observations, acceptance
tests and conditions. The normal eval record starts with no measured gain.
Consolidation retains the existing two-source, 30-case / three-trial holdout,
safety, cold-start, ablation, rollback and provenance gates. Explicit APFC
promotion remains required. No numbers or production promotion are invented
by reflection. Runtime reuse checks current source proof and the registered
program signature; a new task always needs its own acceptance verification.
This is bounded local procedural reuse, not proven cross-domain induction.

The deterministic mechanism propagates declared contradictions and changes in
bound TaskSpec contracts. The native bootstrap routes the host to the compact
comparison tool and asks it to infer candidate relations within its ordinary
turn. That integration is not yet empirical evidence that the host discovers
the right relations. The deterministic code does not discover semantic
relations from prose, watch all external evidence for changes, infer a shared algorithm,
or prove a Unity Tensor transformation. Hypothesized graph correspondences
still require the existing cross-domain verification and promotion gates.

## Master closure for the template-first change

The author requested the template be corrected before development or derived
workspaces. Scope is this template only; identity, credentials, private
chronology, other instances and historical evidence are not migration inputs.

| Required edge | Closure evidence |
| --- | --- |
| Persistent distinct cores | Task compiler preserves the bounded frame; JSON/process restart keeps IDs and relations. |
| Cross-problem dependencies | A changed B requests review of dependent A and C, not analogy-only D; cycles terminate and missing references are explicit. |
| Focused integration | Ordinary structured context compilation follows transitive dependencies, checks current core contracts and rejects insufficient budgets. |
| Real resolution | Latest exact-contract verification and source freshness are integrated into index/context; counterexample and dependency tests exercise reopening. |
| Natural-language continuity | Longitudinal trials where links are withheld from the host, it maintains the right IDs, discovers a relevant relation, rejects unrelated decoys and changes subsequent behavior. Still open. |
| Token efficiency | Matched baseline/treatment full-workflow provider counts with independent outcomes, including setup, retrieval and corrections. Still open. |

Do not claim completion or a percentage saving from the first three edges.
Stop and refactor if new metadata grows without improving observed continuity
or whole-workflow cost. The initial focused test command is:

```bash
node --test test/problem_core.test.js test/apfc_context_pack.test.js test/apfc_graph.test.js
```
