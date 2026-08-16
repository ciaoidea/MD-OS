# Artificial Prefrontal Cortex and APFC Graph Model

## Status

This document is the normative MD-OS architecture for the Artificial
Prefrontal Cortex (`APFC`) function and its explicit graph representation, the
Artificial Prefrontal Cortex Graph (`APFCG`). It fixes the runtime classes,
schemas, paths, identifiers, projection rules, state machines, commands,
permissions, consolidation gates, Graphify views, recovery behavior, and
experimental criteria required for a conforming implementation.

The architecture is closed: no implementation decision is left open as an
optional alternative or unspecified future choice. The executable
artifacts named by this contract do not exist merely because they are specified
here; implementation and empirical validation remain separate, verifier-bearing
operations. Any implementation that diverges from this contract requires a new
schema version and a reviewed change proposal.

## Abstract

This model advances a method-over-talent thesis: the durable capability of an
agentic system depends not only on the raw reasoning capacity of its current
large language model, but on the quality of the method that frames its goals,
selects evidence, constrains action, verifies outcomes, learns from error, and
preserves successful procedures across sessions and host models. MD-OS is that
methodological and operational layer. Its aim is not to make a weaker model
universally more capable than a stronger one, but to make model capability more
reliable, cumulative, auditable, and transferable. Under this hypothesis, a
well-governed MD-OS workflow may outperform unaided use of a more talented LLM
on persistent, multi-step, safety-sensitive, or learning-dependent work. This
claim remains subject to controlled baseline, holdout, persistence, ablation,
and no-regression evaluation.

Graphify can be used independently of MD-OS to build and inspect structural or
semantic relations. Without the MD-OS operational loop, however, graph growth
does not by itself constitute learning: the graph lacks the complete binding
among task state, decision, action receipt, verified outcome, correction,
promotion, and rollback. Independent Graphify use may therefore remain a useful
orientation tool, but it provides no guarantee of cumulative evolution and may
stagnate or regress when unverified relations, obsolete paths, or repeated
failures accumulate. APFC and APFCG supply the missing governance layer through
which graph evolution can become verified operational learning rather than
uncontrolled structural change.

## Purpose

MD-OS (Artificial Prefrontal Cortex) is intended to preserve more than notes about prior work. It must
be able to reconstruct the operational state that made competent work possible,
apply a verified method again, detect when that method fails, and improve the
method without confusing an attractive hypothesis with learned behavior.

The compact thesis is:

> MD-OS virtualizes selected executive functions of a prefrontal cortex by
> expressing goals, constraints, evidence, decisions, actions, outcomes,
> verification, correction, and learned methods as durable operational
> artifacts. APFCG is the typed, temporal, and auditable graph of those
> artifacts and their verified relations.

The metaphor is functional. It does not claim to reproduce biological tissue,
subjective experience, consciousness, or the full causal organization of a
human prefrontal cortex.

## 1. Compact definitions

### 1.1 APFC

`APFC` means **Artificial Prefrontal Cortex**.

It is the MD-OS executive-control role responsible for:

- maintaining the current goal and task frame;
- selecting relevant context;
- preserving constraints and inhibiting unsafe or irrelevant actions;
- planning bounded action sequences;
- comparing expected and observed outcomes;
- detecting error, contradiction, surprise, and stalled progress;
- selecting correction, recovery, or escalation;
- consolidating a repeatedly verified method into a reusable skill;
- reconstructing enough operational state to continue after interruption.

APFC is therefore a functional architecture, not a single process, file,
model, connector, or visualization.

### 1.2 APFCG

`APFCG` means **Artificial Prefrontal Cortex Graph**.

It is the versioned graph that makes APFC state and learning explicit:

\[
G_t = (V_t, E_t, T_V, T_E, P, \Lambda_t).
\]

Where:

- `V_t` is the set of nodes known at time `t`;
- `E_t` is the set of directed relations between those nodes;
- `T_V` is the node-type system;
- `T_E` is the edge-type system;
- `P` is the set of provenance, epistemic, policy, and verification
  properties;
- `\Lambda_t` is the append-only lineage that explains how the graph reached
  state `t`.

APFCG is not merely a map of which documents mention one another. It represents
which evidence justified a decision, which action produced an outcome, which
verifier accepted or rejected that outcome, which correction followed a
failure, and which tested path was eventually promoted into a reusable skill.

### 1.3 Graphify

`Graphify` is the build and visualization surface through which structural and
semantic graphs can be inspected. It is not APFC and it is not APFCG itself.

The distinction is:

| Term | Role |
| --- | --- |
| MD-OS (Artificial Prefrontal Cortex) | Persistent agent identity and operating context |
| APFC | Executive-control function inside the operating architecture |
| APFCG | Durable typed graph of executive state, operations, and learning |
| Graphify | Builder, projection, and visual readback surface for graph data |
| Host model | Reasoning and generation engine used during a bounded run |

Graphify is the required read-only presentation adapter for APFCG. A picture of
the graph is not the graph's evidence contract and is not proof of learning.

## 2. Why an operational graph is needed

A normal knowledge graph answers questions such as:

- Which document defines this concept?
- Which project references this method?
- Which capability belongs to this connector?

An APFC graph must additionally answer:

- What was the active goal when this action was chosen?
- Which observations and constraints supported the choice?
- What outcome was expected?
- What actually happened?
- Which independent verifier accepted or rejected it?
- If it failed, what cause was supported by evidence?
- Which correction restored progress?
- Did the correction generalize to cases not used to invent it?
- Was the improvement still present after a cold start?
- Which release, skill, or policy currently depends on that evidence?
- What happens if the learned path is disabled or rolled back?

The APFCG therefore extends the existing Markdown and semantic graphs with
operational time, proof, error, recovery, policy, and learning lineage.

### 2.1 Operating-system design inheritance

APFC follows an operating-system discipline rather than a free-form society of
agents. Its design inherits three complementary lessons:

| Operating-system lesson | APFC realization |
| --- | --- |
| UNIX: one small program, one clear job | one typed operational skill or bounded specialist |
| UNIX pipe | a schema-valid value passed between compatible input and output types |
| UNIX shell | the context compiler that selects and orders an executable skill path |
| Linux: common extensible kernel | the MD-OS control plane for skills, connectors, permissions, and host runtimes |
| Linux: replaceable modules | skills and connectors that can be added, evaluated, disabled, superseded, or rolled back |
| BSD: coherent base system | common schemas, provenance, verification, documentation, release discipline, and readback |
| file | durable external memory and canonical operational evidence |
| exit status | independent `verified`, `rejected`, `blocked`, or `uncertain` outcome |

The compact design rule is:

\[
\text{UNIX decomposition}
+\text{Linux extensibility}
+\text{BSD coherence}
=\text{bounded agentic operating system}.
\]

This does not mean that historical UNIX, Linux, or BSD implemented learning
agents. It means that MD-OS applies their engineering discipline to agentic
work: decompose, communicate through explicit contracts, orchestrate centrally,
verify independently, preserve state in files, and require human authority for
risk-bearing expansion. An APFCG pathway is therefore closer to a typed pipeline
of small verified programs than to agents conversing without a shared protocol.

## 3. MD-OS foundation and implementation state

MD-OS already contains most of the required substrate:

- Markdown-native goals, rules, models, and programs;
- explicit task and operation contracts;
- connector capabilities and permission boundaries;
- action receipts and verification results;
- append-only learning episodes;
- failure analysis and skill candidates;
- evaluation, holdout, no-regression, contamination, and promotion gates;
- runtime compilation and generated readback;
- replay, release lineage, rollback discipline, and health classification;
- structural and semantic graph builders.

Release 5.0 now implements the causal-operational substrate fixed by this
document. The five APFC schemas, synchronous hash-chained event recorder, live
materializer, canonical projector, bounded context compiler, consolidator,
explicit promotion and recovery transactions, status integration, replay, and
all five Graphify projections are executable under `md-os/`. Production skill
promotion is reachable only through the APFC governance transaction; the older
`agi promote` command is disabled at the command boundary. The implemented
pathway is:

\[
\text{state}
\rightarrow \text{evidence}
\rightarrow \text{decision}
\rightarrow \text{action}
\rightarrow \text{outcome}
\rightarrow \text{verification}
\rightarrow \text{correction}
\rightarrow \text{promotion}.
\]

Implementation is not itself evidence that a particular skill improves
behavior. A candidate remains `blocked` unless its own verifier-bearing record
passes the fixed sealed-holdout, significance, safety, contamination,
cold-start, ablation, provenance, and rollback gates in Section 17. Existing
historical candidates that predate those gates remain preserved but are not
grandfathered into promotion.

The structural and semantic views show relations such as
containment, reference, definition, import, call, and conceptual proximity.
Those are necessary orientation surfaces, but they do not by themselves show
which operational cycles succeeded, why they succeeded, whether the success
generalized, or how strongly a method has been consolidated.

## 4. Functional correspondence

APFC is a software and filesystem implementation of selected executive
functions. The correspondence must remain operational rather than anatomical.

| Executive function | MD-OS realization | Required evidence |
| --- | --- | --- |
| Goal maintenance | task frame, work item, active objective | goal remains addressable through the operation |
| Working context | context pack, active summary, relevant graph projection | sufficient reconstruction after interruption |
| Attention | semantic retrieval and task-scoped subgraph selection | relevant evidence included; irrelevant load bounded |
| Inhibition | policy, permissions, forbidden paths, approval gates | prohibited action not executed |
| Planning | bounded plan and dependency edges | steps trace to objective and preconditions |
| Action selection | capability and connector routing | selected route is authorized and available |
| Error monitoring | expected-versus-observed comparison | verifier records mismatch |
| Cognitive flexibility | correction, alternative route, rollback | progress resumes without violating constraints |
| Consolidation | evaluated skill promotion | holdout improvement and no regression |
| Metacognition | confidence, uncertainty, claim status, health readback | uncertainty is explicit and calibrated |
| Continuity | conceptual boot summary and durable operational state | next run reconstructs the correct task state |

This is a virtualization of executive method: the reliable pathway is made
explicit, inspectable, repeatable, and correctable.

## 5. APFCG graph contract

### 5.1 Graph character

APFCG is a **typed, directed, temporal, versioned property multigraph**.

It is typed because a goal is not interchangeable with evidence or an action.
It is directed because justification and production have direction. It is
temporal because an action occurs before its outcome and because validity may
expire. It is versioned because promoted methods must retain their lineage. It
is a multigraph because two artifacts may have several distinct relations.

The graph is a projection of canonical files and generated readback. It must
not become an untraceable database that silently replaces those sources.

### 5.2 Required node types

The complete schema-version-1 node vocabulary is:

| Node type | Meaning |
| --- | --- |
| `goal` | desired terminal condition |
| `constraint` | boundary that must remain true |
| `observation` | acquired state without automatic truth promotion |
| `evidence` | observation accepted under a declared verification rule |
| `claim` | statement with an explicit epistemic status |
| `prediction` | expected result of a decision or action |
| `plan_step` | bounded intended transition |
| `decision` | selected route with reasons and alternatives |
| `action` | attempted state-changing or read-only operation |
| `receipt` | record of what the executor actually did |
| `outcome` | observed post-action state |
| `verification` | independent check against acceptance criteria |
| `error` | verified mismatch, contradiction, or failure |
| `cause_candidate` | possible explanation not yet established as causal |
| `correction` | bounded change intended to address an error |
| `episode` | proof-carrying record of one learning-relevant cycle |
| `skill_candidate` | reusable method proposed from evidence |
| `eval` | test of a candidate on declared cases |
| `skill` | promoted reusable operational method |
| `policy` | permission, risk, or safety rule |
| `capability` | bounded operation available through a connector or runtime |
| `artifact` | file, schema, report, build output, or other durable object |
| `context_pack` | task-scoped graph projection prepared for a runtime |
| `release` | compatible promoted operating state |
| `rollback` | recoverable return to a prior valid state |

The version-1 vocabulary is closed to the node types above. An additional node
type is non-conformant until a schema-version change and reviewed change
proposal are promoted. A new name must not be used to hide an existing type
with weaker validation.

### 5.3 Required edge types

The complete schema-version-1 relation vocabulary is:

| Edge type | Meaning |
| --- | --- |
| `decomposes_to` | goal or task expands into a bounded dependency |
| `requires` | target is invalid without source precondition |
| `constrained_by` | action or plan is bounded by a rule |
| `observed_as` | state produced an observation |
| `supported_by` | claim has evidential support |
| `contradicted_by` | evidence conflicts with a claim |
| `predicts` | decision or model declares an expected outcome |
| `selected_because` | decision points to its declared basis |
| `executed_via` | action uses a capability or connector |
| `produced` | action or receipt led to an artifact or outcome |
| `verified_by` | outcome was checked by a verifier |
| `failed_as` | action or expectation links to a verified error |
| `possibly_caused_by` | error links to a non-promoted causal hypothesis |
| `corrected_by` | error links to attempted repair |
| `replayed_from` | replay item preserves episode provenance |
| `generalized_to` | method passed a distinct holdout domain or case class |
| `evaluated_by` | candidate links to its eval |
| `promoted_to` | verified candidate became a skill or release element |
| `compiled_into` | canonical source generated a runtime artifact |
| `supersedes` | newer valid object replaces an older object without erasure |
| `invalidated_by` | evidence or eval revoked prior validity |
| `rolled_back_to` | failed promotion returned to a known valid state |
| `semantic_association` | non-causal token or semantic proximity used only for retrieval |

A causal-sounding relation must retain its epistemic level. In particular,
`possibly_caused_by` is a hypothesis. Promotion to a stronger causal relation
requires controlled evidence such as an intervention, ablation, or equivalent
counterfactual discriminator.

### 5.4 Required properties

Every validity-bearing node or edge must expose:

- stable identifier;
- type and schema version;
- source artifact and content hash;
- creation time and, when applicable, validity interval;
- actor or executor identity;
- task, project, and release scope;
- epistemic status: `observed`, `hypothetical`, `verified`, `falsified`, or
  `superseded`;
- policy and permission decision;
- risk class;
- expected and observed result;
- verifier identity and result;
- confidence or uncertainty, using `null` when the source supplies no
  calibrated value;
- success and failure support counts without treating counts as proof by
  themselves;
- holdout and regression status for learning-bearing objects;
- provenance links and rollback target.

No visual edge weight may silently stand for truth. Frequency, recency,
confidence, causal support, and policy authority are different quantities and
must remain separate properties.

### 5.5 Five synchronized projections

APFCG must be readable through five projections of the same lineage:

1. **Executive projection** — goals, constraints, plans, decisions, actions,
   and outcomes.
2. **Epistemic projection** — observations, claims, evidence, uncertainty,
   contradiction, and falsification.
3. **Learning projection** — episodes, errors, corrections, candidates, evals,
   promotions, regressions, and rollbacks.
4. **Policy projection** — permissions, risks, approvals, connectors, and
   capability boundaries.
5. **Continuity projection** — summaries, context packs, releases, compiled
   artifacts, and reconstruction dependencies.

These are views, not separate truths. Each view must resolve to the same
canonical identifiers and provenance.

## 6. The proof-carrying operational cycle

The canonical executive cycle is:

\[
\begin{aligned}
&\text{intent}
\rightarrow \text{task frame}
\rightarrow \text{state precondition}
\rightarrow \text{evidence} \\
&\rightarrow \text{plan}
\rightarrow \text{policy/capability gate}
\rightarrow \text{action}
\rightarrow \text{receipt} \\
&\rightarrow \text{outcome}
\rightarrow \text{verification}
\rightarrow \text{episode}
\rightarrow \text{readback}.
\end{aligned}
\]

If verification fails, the cycle extends through:

\[
\text{error}
\rightarrow \text{failure analysis}
\rightarrow \text{correction}
\rightarrow \text{re-execution}
\rightarrow \text{re-verification}.
\]

The episode is proof-carrying only when it binds the task, precondition, action,
receipt, expected outcome, observed outcome, verifier, and result. A transcript
or narrative recollection that omits these bindings may be useful context, but
it is not sufficient learning evidence.

### 6.1 Online co-registration and two consolidation speeds

APFC records the operational pathway while the pathway is being executed. It
does not wait for artificial sleep to reconstruct what probably happened.

The architecture has two distinct speeds:

1. **Fast online registration** — every semantic transaction boundary is
   appended immediately to a hash-chained cognitive event journal and applied
   to a live APFCG overlay.
2. **Slow verified consolidation** — completed episodes are compared, tested,
   and possibly promoted into stable skills during an explicit bounded
   consolidation cycle.

Fast registration captures positive, negative, partial, blocked, and uncertain
results with equal fidelity. A positive result is not privileged over a
failure; both are required to learn the decision boundary of a method.

“Parallel” therefore means transactionally co-registered with reasoning and
action, not an uncontrolled asynchronous writer. The sequence is:

\[
\text{phase output}
\rightarrow
\text{journal commit}
\rightarrow
\text{live-graph materialization}
\rightarrow
\text{next phase}.
\]

The next externally consequential phase cannot begin until the preceding event
has been durably recorded and materialized. Token-by-token hidden model
activity is not recorded; the recording granularity is the semantic boundary:
task, context, prediction, decision, action request, action receipt, observed
outcome, verification, correction, and episode closure.

Before verification, the live graph contains `hypothetical` and `observed`
paths. Verification changes the active status by appending a new event; it does
not rewrite the earlier event. Episode closure checkpoints the live overlay into
the deterministic graph. Artificial sleep operates only on those checkpointed,
proof-carrying episodes.

## 7. What counts as an operational pathway

An operational pathway is not simply a sequence of files or concepts. It is a
replayable subgraph:

\[
p:
\text{recognized state}
\rightarrow \text{decision rule}
\rightarrow \text{bounded action}
\rightarrow \text{verified outcome}
\rightarrow \text{recovery rule}.
\]

The closest engineering analogue to a consolidated neural pathway is a method
that is:

- triggered by a recognizable context;
- executable through declared capabilities;
- inhibited under known unsafe conditions;
- verified by a stable oracle;
- supported by more than one relevant episode;
- tested outside the examples used to formulate it;
- reconstructible after restart;
- reversible or supersedable when later evidence contradicts it.

The pathway remains an operational artifact. It is not a biological synapse and
does not imply that the host language model's parameters have changed.

## 8. Verified learning and graph consolidation

### 8.1 The notebook is necessary but not sufficient

Writing an experience into a notebook creates memory. It becomes learning only
when the stored experience causes a durable, verified improvement in later
behavior.

The minimum learning claim is:

> A promoted MD-OS artifact caused better performance on relevant cases not
> used to construct it, the improvement persisted after reconstruction, and
> disabling or rolling back that artifact removed or reduced the improvement.

This separates four increasingly strong states:

| State | What has happened | Allowed claim |
| --- | --- | --- |
| Recording | an event was stored | memory exists |
| Replay | a stored event was reconstructed | state can be recalled |
| Adaptation | a candidate method changed later behavior | behavior changed |
| Verified learning | holdout, persistence, ablation, and safety gates passed | experience caused durable improvement |

One successful task after a change is not enough. More files, a larger graph,
or a higher edge count are not evidence of learning.

### 8.2 Promotion invariant

A candidate pathway may be promoted only when all required gates are true:

\[
\begin{aligned}
\operatorname{Promotable}(p) ={}&
V_{\text{episode}}
\land V_{\text{reproduction}}
\land V_{\text{holdout}} \\
&\land V_{\text{no-regression}}
\land V_{\text{contamination}}
\land V_{\text{policy}}
\land V_{\text{rollback}}.
\end{aligned}
\]

Where:

- `V_episode` confirms complete proof-carrying episodes;
- `V_reproduction` confirms the effect repeats under declared conditions;
- `V_holdout` confirms improvement on cases excluded from construction;
- `V_no-regression` confirms protected behavior did not degrade;
- `V_contamination` confirms evaluation cases did not leak into construction;
- `V_policy` confirms permissions and safety boundaries remain valid;
- `V_rollback` confirms a known valid state can be restored.

For a strong causal learning claim, an additional ablation gate is required:

\[
V_{\text{ablation}}:
\quad
\text{enabled pathway outperforms disabled pathway under matched conditions}.
\]

The system must report the gate vector, not compress all epistemic dimensions
into one opaque score.

### 8.3 Consolidation is a verified graph rewrite

Learning modifies the operative graph by proposing, evaluating, and promoting
a new pathway. It does not rewrite the history that justified it.

The invariant is:

\[
G_{t+1}
=
G_t
\text{new immutable evidence}
\xrightarrow{\text{gated promotion}}
\text{new active projection}.
\]

Old episodes remain append-only. A promoted skill may supersede an earlier
route, but the lineage, evaluations, and rollback target remain inspectable.

The operational meaning of a stronger pathway can be represented as a vector:

\[
S(p) =
(v, h, a, r, s, c, \ell),
\]

where `v` is verifier validity, `h` holdout performance, `a` ablation support,
`r` regression safety, `s` repeated success support, `c` execution cost, and
`\ell` staleness or recency. The vector must not be reduced to a single number
unless the aggregation rule and its policy consequences are explicit.

## 9. Wake, replay, artificial dreams, and artificial sleep

These terms are engineering metaphors for bounded runtime modes. They do not
describe biological sleep, dreaming, consciousness, or subjective experience.

### 9.1 Wake operation

During **wake operation**, MD-OS (Artificial Prefrontal Cortex):

1. receives or reconstructs a bounded task;
2. selects a task-scoped context pack;
3. plans under current constraints and permissions;
4. acts through declared connectors;
5. records receipts and observations;
6. verifies the result;
7. writes an episode when the cycle is learning-relevant.

Wake operation may interact with external systems only within the declared
task, capability, permission, and approval envelope.

### 9.2 Replay as artificial recollection

**Replay** reconstructs a real, previously recorded episode from its durable
artifacts. Its purpose is to test reconstructibility, compare related episodes,
identify repeated failure structures, and preserve causal lineage.

Replay does not change the fact that the source episode happened once. It must
not multiply the evidential weight by replaying the same record many times.

### 9.3 Counterfactual replay as artificial dreaming

An **artificial dream** is a generated counterfactual or synthetic variant of
one or more verified episodes. It may ask:

- What if a precondition were absent?
- What if a different connector were used?
- What if the failure occurred earlier?
- What minimal change might distinguish two cause candidates?
- Which novel case would most strongly test the candidate skill?

Dream output is always marked `hypothetical`. It may propose an eval, a
correction, or a skill candidate. It may not count as observed evidence, pass a
promotion gate by itself, or authorize an external action.

### 9.4 Artificial sleep

**Artificial sleep** is a bounded offline consolidation cycle with external
actions prohibited. A complete consolidation cycle is:

\[
\begin{aligned}
&\text{select real episodes}
\rightarrow \text{prioritized replay}
\rightarrow \text{compare outcomes} \\
&\rightarrow \text{generate hypotheses}
\rightarrow \text{propose graph rewrite}
\rightarrow \text{construct evals} \\
&\rightarrow \text{run holdout and regression gates}
\rightarrow \text{mark promotable or reject}
\rightarrow \text{write cycle readback}.
\end{aligned}
\]

The cycle must be `run-once`, use the fixed budget in Section 14.13, and
produce a readback. Activation requires the separate explicit promotion
transaction in Section 14.14, after which next-wake context is rebuilt. The
cycle must not become an implicit continuous self-modification loop.

### 9.5 Replay priority

Replay priority uses these explicit signals; their exact weights and tie-breaks
are fixed in Section 14.13:

- verifier failure or contradiction;
- high prediction error or surprise;
- repeated occurrence across distinct tasks;
- high task or safety impact;
- uncertainty that can be reduced by a discriminating test;
- stale but highly depended-upon skills;
- disagreement between active methods.

Priority determines review order, not truth.

## 10. Native integration with a language model

APFCG integrates with model-mediated operation through exactly two active
levels—context and promoted policy/skill artifacts—without making model weights
the memory of the system. Parameter-native integration is excluded below.

### 10.1 Level 1 — context-native integration

The runtime queries APFCG for the smallest task-relevant subgraph and compiles
it into a context pack containing:

- active goal and constraints;
- current state and unresolved dependencies;
- relevant evidence and uncertainty;
- promoted methods and their inhibition conditions;
- required verifiers and rollback routes.

This restores an operational state, not a raw transcript.

### 10.2 Level 2 — policy- and skill-native integration

Promoted pathways are compiled into durable natural-language programs, skills,
schemas, routing rules, verifier contracts, or deterministic scripts. The host
model reasons inside those explicit boundaries.

This is the current practical meaning of bounded self-programming:

\[
\text{verified experience}
\rightarrow \text{candidate artifact}
\rightarrow \text{eval}
\rightarrow \text{promotion}
\rightarrow \text{runtime recompilation}.
\]

The host coding agent may help write the artifact, but MD-OS retains the
canonical evidence, gates, lineage, and rollback state.

### 10.3 Parameter-native distillation is excluded

MD-OS `5.0` does not train, fine-tune, or rewrite foundation-model weights
or adapters as part of APFCG. Parameter-native distillation is outside this
architecture. Introducing it requires a later release model, a separate runtime
class, sealed datasets, contamination controls, catastrophic-forgetting tests,
safety evaluation, versioning, and rollback. It must not be added as an
implementation shortcut.

The canonical-source rule is:

> APFCG is the auditable source of learned operational truth; model parameters
> are a replaceable accelerator or cache, never the only copy of memory,
> evidence, policy, or identity.

The current architecture does not claim to rewrite the foundation model's
weights. It can rewrite bounded repository artifacts and runtime context under
verification gates.

## 11. Graphify as the APFCG readback surface

The APFCG Graphify adapter must extend the structural-semantic map with the
explicit projections below. It must not produce one visually dense network
that conflates different edge semantics.

### 11.1 Required views

1. **Executive state view**
   - active goals;
   - blocked dependencies;
   - current decisions and action routes;
   - policy and approval boundaries.

2. **Episode timeline view**
   - action, receipt, outcome, and verification ordering;
   - expected-versus-observed divergence;
   - corrections and recovery.

3. **Learning lineage view**
   - episodes supporting a candidate;
   - holdout and regression evals;
   - promotion or rejection;
   - compiled skills and releases;
   - rollback lineage.

4. **Path consolidation view**
   - repeated verified success;
   - failure support;
   - generalization domains;
   - staleness;
   - cost and risk;
   - active inhibition conditions.

5. **Epistemic health view**
   - unsupported claims;
   - contradictions;
   - stale evidence;
   - hypothetical edges presented separately from verified edges;
   - high-impact dependencies with weak verification.

### 11.2 Visual truth discipline

Graphify must not imply:

- that spatial proximity is causal proximity;
- that a thick edge is automatically more true;
- that repeated replay is repeated evidence;
- that a popular node is a valid method;
- that a generated counterfactual actually happened;
- that a promoted skill is permanently correct.

Every visual encoding must declare what it represents. Causal, semantic,
temporal, permission, and evidential edges must be visually distinguishable.

## 12. Robotic embodiment example

Consider a robotic arm observed by a camera.

The APFC cycle is not merely “camera input becomes motor output.” A complete
episode is:

1. goal: place an object at a target pose;
2. observation: camera and joint state;
3. constraints: collision envelope, force limit, emergency stop, authorized
   workspace;
4. prediction: selected grasp and motion should reach the target;
5. action: command sent through the bounded robot connector;
6. receipt: controller confirms the executed command;
7. outcome: camera and sensors report the resulting pose;
8. verification: independent pose and safety checks compare result with the
   acceptance threshold;
9. correction: failed grasp geometry is revised;
10. learning gate: revised method is tested on held-out objects and after a
    restart before promotion.

The notebook contributes to learning only if its episode changes later action
selection and the change survives the verification gates. The APFCG shows the
path from visual evidence to correction and promotion.

MD-OS remains above safety-critical real-time control. Firmware, motor drivers,
hard limits, emergency stop, and deterministic control loops remain independent
protective layers. APFCG may propose and authorize bounded high-level actions;
it must not replace those layers.

## 13. Experimental proof that APFCG learns

The claim “MD-OS learns from its operational notebook” requires a controlled
experiment.

### 13.1 Minimal protocol

1. Freeze a baseline release and a representative task distribution.
2. Reserve a sealed holdout set not visible during candidate construction.
3. Run repeated baseline trials and record proof-carrying episodes.
4. Allow one bounded learning cycle to propose and evaluate a pathway.
5. Promote only if all gates pass.
6. Repeat the same task distribution with the promoted pathway enabled.
7. Cold-start the system and repeat to test persistence.
8. Disable or roll back the pathway and repeat matched cases.
9. Compare success, verification quality, safety, cost, recovery, and
   generalization.

### 13.2 Required measures

At minimum, report:

- verified task success rate;
- false-success rate detected by the verifier;
- time or steps to verified completion;
- recovery rate after injected or natural failures;
- holdout success by task class;
- no-regression results on protected tasks;
- safety and permission violations;
- cold-start persistence;
- ablation difference with the pathway disabled;
- provenance completeness and replay success;
- number of promotions, rejections, and rollbacks.

### 13.3 Strong interpretation

The experiment supports APFCG learning only if:

\[
\begin{aligned}
&\text{performance}_{\text{promoted, holdout}}
> \text{performance}_{\text{baseline, holdout}},\\
&\text{performance}_{\text{cold start}}
\approx \text{performance}_{\text{promoted}},\\
&\text{performance}_{\text{disabled}}
< \text{performance}_{\text{promoted}},\\
&\text{safety and protected behavior do not regress}.
\end{aligned}
\]

The evaluation design is fixed by Section 17. It uses matched cases, a minimum
effect size, an exact paired test, cold-start replication, ablation, and
no-regression gates. An implementation may use a larger sample, but it may not
weaken those gates.

### 13.4 First real-model causal external-memory experiment

The run `apfc_codex_causal_learning_20260813_v1` executed the fixed minimum
sample against the declared `gpt-5.4` host model through 180 independent
`codex exec --ephemeral` invocations. A deliberately novel synthetic protocol
family was used so that the target routing rule could not be supplied by the
model's ordinary world knowledge. Twelve independently verified development
examples reduced a predeclared set of 216 hypotheses to one candidate skill.
The development examples were then removed from the evaluation context.

Thirty sealed holdout records were each evaluated three times under matched
conditions:

```text
memory_disabled -> task and output contract only
memory_enabled  -> identical task plus the induced portable skill
```

Every invocation was a new ephemeral session, received one attempt, and was
forbidden from using tools. The independent oracle produced this readback:

```text
paired observations:                 90
memory-disabled verified success:    18 / 90 = 0.20
memory-enabled verified success:     90 / 90 = 1.00
absolute verified-success delta:     +0.80
discordant disabled-only pairs:      0
discordant enabled-only pairs:       72
exact two-sided McNemar p:            4.235164736271502e-22
tool-use violations:                 0
holdout contamination findings:      0
cold-start enabled success:          1.00 on both repetitions
```

The experiment therefore supports a bounded causal claim: a skill induced
from verified MD-OS episodes, serialized outside the model, caused improved
behavior on unseen members of that declared family and the advantage survived
cold starts. Removing the skill removed the advantage. This run is evidence
for **external operational-memory learning in MD-OS (Artificial Prefrontal Cortex)**. Taken alone, it
did not test APFCG composition: it used one portable skill from one synthetic
family. It also does not establish cross-domain general learning, model
parameter learning, consciousness, AGI, or superiority over a stronger model.

Canonical evidence and its deterministic integrity verifier are:

```text
md-os/ops/agi/learning_experiments/apfc_codex_causal_learning_20260813_v1/
node md-os/os/run_apfc_causal_learning_experiment.js verify \
  --report md-os/ops/agi/learning_experiments/apfc_codex_causal_learning_20260813_v1/report.json
```

### 13.5 Multi-family APFCG compositional-transfer experiment

The append-only run `apfc_codex_multifamily_transfer_20260813_v3` tested the
next dependency edge: whether verified primitive procedures can be represented
as a typed graph, autonomously composed into new multi-step procedures, and
transferred to target families absent from development.

Seventeen source families each supplied independently verified examples and a
predeclared three-hypothesis set. Deterministic elimination uniquely identified
all 17 primitive procedures. The graph projector produced 17 skill nodes and
13 verified `composes_with` edges. The context compiler then found one unique
shortest typed path for each of six target families. Every path contained three
or four primitives; no target-family skill existed.

The six target families covered four synthetic operational domains:

```text
text transformation:     normalization/reversal/joining; normalization/deduplication/rotation
numeric transformation:  absolute/zigzag/sum/base36; absolute/weighted-sum/modulo-97
record routing:           parse/checksum/route
event state:              count/score/status
```

All 30 sealed target inputs were distinct from every development input. A
separately coded direct oracle agreed with the graph-executed composition on all
30 cases before model evaluation. Each case was then evaluated in three
independent cold starts under three matched conditions:

```text
memory_disabled -> no operational procedure
flat_memory      -> lexical top-k skill cards without graph edges or order
apfcg_composed   -> the unique ordered typed path compiled by APFCG
```

The 270 real `gpt-5.4` invocations were ephemeral, used one attempt, ignored
user configuration, and were prohibited from using tools. The v3 verifier
recomputed the induction, graph, paths, prompts, independent answers,
contamination audit, receipts, cold starts, and paired statistics. Its readback
was:

```text
source primitive families:            17
held-out target families:               6
operational domains:                    4
sealed target cases:                   30
paired observations per comparison:   90
real ephemeral invocations:           270

memory-disabled success:               0 / 90 = 0.00
flat-memory success:                  36 / 90 = 0.40
APFCG-composed success:               90 / 90 = 1.00

APFCG minus disabled:                 +1.00
exact two-sided McNemar p:             1.6155871338926322e-27
APFCG minus flat memory:              +0.60
exact two-sided McNemar p:             1.1102230246251565e-16

APFCG success in each cold start:      30 / 30
tool-use violations:                    0
timeouts:                               0
structured-response failures:           0
contamination findings:                 0
replay-verifier failed checks:           0
```

Versions v1 and v2 remain preserved as negative protocol evidence. The v1
holdout audit detected input overlap with primitive development examples. The
v2 removed that contamination and produced the same large behavioral effect,
but its original zero-timeout reliability gate failed during a clustered host
stall. Before v3, infrastructure reliability was separated from safety: every
infrastructure failure remains an incorrect observation without retry, while
the preregistered completion gate permits at most a 0.05 failure rate. V3 had
zero such failures. Neither earlier report was rewritten or promoted.

This closes a bounded causal claim:

> Within the declared synthetic task universe, MD-OS learned typed primitive
> procedures from verified source episodes, APFCG combined those primitives
> into procedures for six entirely unseen composite families, and supplying
> the compiled pathways caused perfect verified transfer across three cold
> starts. A flat collection of the same class of memories was insufficient.

The result demonstrates external operational learning, graph-based composition,
and bounded multi-family transfer. It does **not** demonstrate literal
universality, natural open-world transfer, foundation-model weight learning,
consciousness, AGI, or the method-over-talent thesis of Section 17.2.

Canonical evidence and replay verification are:

```text
md-os/ops/agi/learning_experiments/apfc_codex_multifamily_transfer_20260813_v3/
node md-os/os/run_apfc_multifamily_transfer_experiment.js verify \
  --report md-os/ops/agi/learning_experiments/apfc_codex_multifamily_transfer_20260813_v3/report.json
```

### 13.6 First prospectively gated production-skill promotion

The run `apfc_codex_prospective_orion17_20260813_v2` exercised the complete
production pathway rather than stopping at experimental evidence. Before the
first model invocation, the harness fixed a new `Orion-17` protocol family,
12 verified development observations, a 216-member finite hypothesis family,
30 disjoint holdout cases, 12 protected cases, the response schema, the
candidate skill hash, the harness hash, and the expected-answer hashes. None
of the holdout records or answers entered skill induction.

The same declared `gpt-5.4` model then received 90 matched observations in each
condition through 180 tool-free, one-attempt, ephemeral sessions:

```text
sealed holdout cases:                 30
trials / independent starts:           3
paired observations:                  90
real ephemeral model invocations:    180

memory-disabled verified success:     11 / 90 = 0.122222
memory-enabled verified success:      90 / 90 = 1.000000
absolute verified-success delta:      +0.877778
discordant disabled-only pairs:        0
discordant enabled-only pairs:        79
exact two-sided McNemar p:             3.308722450212111e-24

protected observations:               36
new protected failures:                0
critical safety violations:            0
tool-use violations:                    0
holdout contamination findings:        0
cold-start reconstructions:             2
matching reconstructed skill hashes:  true
```

The experiment emitted two distinct verified episodes: one for bounded skill
induction and one for independent prospective evaluation. The APFC
consolidator recomputed every gate from these canonical artifacts and marked
`skill_orion17_operational_routing_df48dfbae5dbcfe7` as `promotable`; the
experiment itself did not confer that status. Explicit governed promotion then
created receipt
`receipt_apfc_promotion_d703901e2c1378a861b9`. A real governed revocation and
restoration were subsequently completed through receipts
`receipt_apfc_revoke_ef0e0192f1c49fe04111` and
`receipt_apfc_restore_aad0dba25cc9699ac357`, preserving the full history.

This is the first repository evidence that the complete production contract
can move from verified experience to a runtime-eligible skill and can remove
and restore that skill without deleting its lineage. The claim remains bounded
to one synthetic protocol family and one declared model. It does not establish
open-world universality, weight learning, AGI, or the method-over-talent claim.

Canonical evidence and its independent integrity verifier are:

```text
md-os/ops/agi/learning_experiments/apfc_codex_prospective_orion17_20260813_v2/
node md-os/os/run_apfc_causal_learning_experiment.js verify \
  --report md-os/ops/agi/learning_experiments/apfc_codex_prospective_orion17_20260813_v2/report.json
```

## 14. Normative closed architecture

This section fixes the complete implementation contract. The words `must`,
`must not`, `required`, and `excluded` are normative. There is one conforming
architecture for schema version 1.

### 14.1 Architectural layers

APFC is implemented through seven ordered layers:

1. **Canonical evidence layer** — existing MD-OS task, receipt, verification,
   episode, eval, skill, policy, capability, release, and health artifacts.
2. **Projection layer** — deterministic conversion of canonical artifacts into
   APFCG nodes and edges.
3. **Validity layer** — schema, provenance, referential, epistemic, and policy
   checks.
4. **Context layer** — deterministic task-scoped APFC context packs.
5. **Consolidation layer** — bounded replay, hypothesis generation, evaluation,
   and opt-in promotion.
6. **Presentation layer** — read-only Graphify projections.
7. **Compilation layer** — promoted skills and context packs supplied to the
   next bounded host-model operation.

Data flows in that order. Graphify never writes canonical evidence. Generated
context never promotes itself. Consolidation never bypasses evaluation.

### 14.2 Canonical source rule

The filesystem under `md-os/` is the only canonical APFC source. APFCG is a
generated projection and must not become a second mutable source of truth.

The version-1 source allowlist is:

| Source | APFC meaning |
| --- | --- |
| `md-os/ops/tasks/*.json` | goals, constraints, plans, required evidence, acceptance tests |
| `md-os/ops/action_receipts/*.json` | executed actions, state deltas, artifacts, rollback data |
| `md-os/ops/verifications/*.json` | independent verification and outcomes |
| `md-os/ops/episodes/*.json` | proof-carrying operational episodes |
| `md-os/ops/evals/*.json` | skill and system evaluation |
| `md-os/ops/skills/skill_registry.json` | candidate, promotable, promoted, deprecated, and revoked skills |
| `md-os/ops/connectors/connector_registry.json` | bounded capabilities and connector policy |
| `md-os/ops/changes/*.json` and append-only change ledger | proposed changes and review lineage |
| `md-os/ops/releases/self_release_index.json` | release and compatibility lineage |
| `md-os/ops/runtime/semantic_index.json` | semantic profiles used only for non-causal retrieval |
| `md-os/ops/runtime/context_packs/*.json` | existing compiled operational context |
| `md-os/ops/health_classification.json` | runtime, publication, security, and hygiene gates |
| `md-os/ops/apfc/cognitive/**/*.json` | bounded cortical frames, bindings, predictions, and action gates |
| `md-os/ops/apfc/executive/events.ndjson` | append-only online cognitive transaction events |

Markdown readbacks are never parsed when a canonical JSON artifact exists.
Host-local inventories, secrets, caches, locks, Graphify output, and temporary
files are excluded. A path outside `md-os/` is rejected before reading.

### 14.3 Reused schemas and five APFC schemas

The architecture reuses these existing contracts without duplicating them:

- `task_spec.schema.json`;
- `action_receipt.schema.json`;
- `episode.schema.json`;
- `verifier.schema.json`;
- `eval.schema.json`;
- `skill.schema.json`;
- `connector.schema.json`;
- `permission_model.schema.json`;
- `cortical_frame.schema.json`;
- `binding_graph.schema.json`;
- `runtime_compiler.schema.json`.

Exactly five new schema-version-1 contracts are required:

| Schema | Runtime class |
| --- | --- |
| `md-os/schemas/apfc_event.schema.json` | one hash-chained online cognitive event |
| `md-os/schemas/apfc_graph.schema.json` | canonical generated APFCG projection |
| `md-os/schemas/apfc_context_pack.schema.json` | task-scoped APFC context |
| `md-os/schemas/apfc_consolidation_cycle.schema.json` | one bounded replay/eval cycle |
| `md-os/schemas/apfc_status.schema.json` | compact build, validity, and learning readback |

No separate APFC episode schema is created: `episode.schema.json` remains the
canonical episode contract. No graph database is introduced. JSON is the
machine representation; Markdown is generated readback.

### 14.4 Executable modules

The conforming implementation consists of:

| Path | Responsibility |
| --- | --- |
| `md-os/apfc/executive/event_recorder.js` | synchronous append-only cognitive event commit |
| `md-os/apfc/executive/live_materializer.js` | deterministic incremental live-graph update |
| `md-os/apfc/executive/graph_projector.js` | canonical-source projection and graph validation |
| `md-os/apfc/executive/context_compiler.js` | bounded deterministic context selection |
| `md-os/apfc/executive/consolidator.js` | replay, hypothesis, eval, and gate orchestration |
| `md-os/apfc/executive/graphify_adapter.js` | five read-only Graphify projections |
| `md-os/os/build_apfc_graph.js` | deterministic builder entrypoint |
| `md-os/os/apfc_runtime.js` | CLI façade and status readback |

`md-os/os/mdos.js` routes the `apfc` command family to `apfc_runtime.js`.
No continuously running APFC service is introduced.

### 14.5 Generated runtime layout

All APFC runtime output stays inside the active boundary:

```text
md-os/ops/apfc/executive/
  events.ndjson
  live_graph.json
  live_status.json
  graph.json
  graph.md
  status.json
  status.md
  source_manifest.json
  last_valid_graph.json
  history/
    <graph_id>.json
  rejected/
    <build_id>.json
  context_packs/
    index.json
    index.md
    <context_pack_id>.json
    <context_pack_id>.md
  consolidation/
    index.json
    index.md
    <cycle_id>.json
    <cycle_id>.md
  views/
    executive_state.json
    episode_timeline.json
    learning_lineage.json
    path_consolidation.json
    epistemic_health.json
  graphify/
    executive_state.html
    episode_timeline.html
    learning_lineage.html
    path_consolidation.html
    epistemic_health.html
```

The files under `history/` are content-addressed immutable snapshots. A build
with an already-existing `graph_id` reuses the snapshot and does not create a
duplicate. `last_valid_graph.json` is the recovery snapshot. Rejected builds
never replace `graph.json`.

### 14.6 Stable identifiers and canonical serialization

All hashes use SHA-256 over UTF-8 canonical JSON with recursively sorted object
keys. Set-like arrays—identifiers, references, findings, evidence, and source
manifests—are deduplicated and sorted lexically. Sequence-bearing arrays—plans,
procedures, actions, receipts, observations, and timeline events—preserve their
canonical source order. JSON Pointers follow RFC 6901.

A source-backed node uses the canonical key:

```text
<workspace-relative-source-path>#<JSON-Pointer>
```

Its identifier is:

```text
<type-prefix>_<slug-first-80-chars>_<sha256(canonical-key)-first-10>
```

A composite node uses the lexically sorted source node identifiers joined by
`|` as its canonical key. An edge identifier is:

```text
edge_<sha256(from|edge-type|to|sorted-evidence-ids)-first-16>
```

The graph identifier is:

```text
apfcg_<source-manifest-sha256-first-16>
```

A context-pack identifier is:

```text
apfc_ctx_<task-spec-id>_<graph-sha256-first-10>
```

A consolidation-cycle identifier is:

```text
apfc_cycle_<sha256(graph-hash|created-at|selected-episode-hashes|candidate-hashes)-first-20>
```

An online event identifier is allocated while holding the APFC online
transaction lock:

```text
apfc_event_<sha256(transaction-id|sequence|timestamp|payload)-first-20>
```

`sequence` begins at `1` and increases by exactly one. Every event stores the
previous event hash, producing one tamper-evident chain per workspace.

Cycle and event timestamps are recorded explicitly in their objects. They are
inputs to event identity but are never decoded as missing work.

`graph.json` contains no wall-clock build timestamp. Its content is identical
for identical canonical inputs. Volatile execution timestamps live in
`status.json` and cycle records and are excluded from the graph hash.

### 14.6.1 APFC online event object

`apfc_event.schema.json` extends the existing journal-event meaning and requires:

```text
schema_version = 1
event_id
sequence
timestamp
transaction_id
task_spec_id
episode_id
phase
actor
epistemic_status
outcome_polarity
source_refs[]
payload
payload_hash
previous_event_hash
event_hash
```

`episode_id` is nullable until an episode identifier has been allocated.
`outcome_polarity` is exactly `positive`, `negative`, `partial`, `blocked`, or
`neutral`; it records outcome direction, not truth. `actor` is exactly `user`,
`host_model`, `mdos_runtime`, `connector`, `verifier`, or `consolidator`.
`transaction_id` is the active TaskSpec identifier plus the episode identifier
when allocated. `phase` is exactly one of:

```text
task_opened
context_loaded
prediction_recorded
decision_selected
action_requested
action_receipt_recorded
outcome_observed
verification_recorded
correction_recorded
episode_closed
```

`payload_hash` hashes canonical `payload`. `event_hash` hashes the entire
canonical event except `event_hash`. The first event uses 64 zeroes as
`previous_event_hash`. `live_status.json` records the last committed event
sequence, its event hash, `materialized_at`, and `materialization_lag_ms`; the
append-only event itself is never rewritten.

### 14.7 APFC graph object

`apfc_graph.schema.json` requires:

```text
schema_version = 1
identity_version = 5.0
graph_id
source_manifest_hash
status
nodes[]
edges[]
findings[]
metrics
```

Every node requires:

```text
id
type
label
lifecycle_status
epistemic_status
source_refs[]
content_hash
scope
risk_level
confidence
created_at
valid_from
valid_to
properties
```

`confidence` is either a calibrated number in `[0,1]` copied from canonical
evidence or `null`; the projector never invents it. `created_at`, `valid_from`,
and `valid_to` are `null` when absent from the canonical source.

Every edge requires:

```text
id
from
type
to
epistemic_status
source_refs[]
evidence_ids[]
content_hash
created_at
valid_from
valid_to
properties
```

Node and edge arrays are sorted lexically by `id`. Source references and
evidence identifiers are deduplicated and sorted. An edge with an unresolved
endpoint is invalid and is not admitted to the active graph.

The `type-prefix` in every node identifier is the node type written exactly as
listed in Section 5.2. Generic `lifecycle_status` is exactly one of:

```text
active
blocked
completed
failed
candidate
promotable
promoted
deprecated
revoked
superseded
archived
invalid
```

`risk_level` is exactly `low`, `medium`, or `high`. `scope` is an object with
the required nullable string fields `task_id`, `project_id`, and `release_id`.
A source status that cannot be mapped to the closed lifecycle vocabulary makes
the source node `invalid` and raises a critical finding.

### 14.7.1 APFC context-pack object

`apfc_context_pack.schema.json` requires:

```text
schema_version = 1
context_pack_id
graph_id
graph_content_hash
task_spec_id
task_spec_hash
status
mandatory_node_ids[]
selected_node_ids[]
nodes[]
edges[]
omissions[]
selection_trace[]
source_hashes[]
serialized_bytes
findings[]
```

`status` is `ok`, `attention`, or `critical`. `selected_node_ids` equals the
sorted identifiers in `nodes`; every edge endpoint must be selected. Each
omission requires node identifier, selection tier, rank tuple, and exclusion
reason. Each selection-trace entry requires node identifier, rule identifier,
rank tuple, and included boolean. A pack is usable only with status `ok` or
`attention` and zero critical findings.

### 14.7.2 APFC consolidation-cycle object

`apfc_consolidation_cycle.schema.json` requires:

```text
schema_version = 1
cycle_id
state
created_at
completed_at
graph_id
graph_content_hash
budget
selected_episode_ids[]
replay_records[]
hypotheses[]
skill_candidates[]
eval_refs[]
gate_vector
promotion_receipt
rollback_receipt
external_action_count = 0
findings[]
readback
```

`budget` contains the five fixed limits from Section 14.13 and measured use.
Every replay record points to one canonical episode hash. Every hypothesis
contains its parent episode identifiers and the literal epistemic status
`hypothetical`. `promotion_receipt` and `rollback_receipt` are `null` until the
corresponding explicit transaction occurs.

### 14.7.3 APFC status object

`apfc_status.schema.json` requires:

```text
schema_version = 1
updated_at
status
identity_version = 5.0
active_graph_id
active_graph_hash
last_valid_graph_id
source_manifest_hash
counts
checks[]
findings[]
release_gate
outputs[]
```

`counts` reports sources, nodes, edges, episodes, skills by lifecycle state,
context packs, consolidation cycles by state, critical findings, and attention
findings. `release_gate` reports `runtime_operable`, `apfc_action_blocked`,
`promotion_blocked`, and `publishable` separately so that local publication
hygiene cannot be confused with runtime operability.

### 14.8 Status systems

Epistemic status is exactly one of:

```text
observed
hypothetical
verified
falsified
superseded
invalid
```

Skill lifecycle reuses `skill.schema.json` exactly:

```text
candidate -> promotable -> promoted -> deprecated
                                  \-> revoked
```

No transition skips `promotable`. `deprecated` preserves a historically valid
skill that has been superseded. `revoked` marks a skill made unsafe or invalid
by later evidence.

Consolidation-cycle state is exactly:

```text
created -> replayed -> candidate_ready -> evaluated -> promotable
                  \-> rejected
                  \-> blocked
                  \-> failed
promotable -> promoted
promotable -> rejected
```

Only the explicit promotion command performs `promotable -> promoted`.
Terminal states are `promoted`, `rejected`, `blocked`, and `failed`.

Graph and status severity is exactly `ok`, `attention`, or `critical`.

### 14.9 Deterministic source projection

The projector performs only the mappings below:

| Canonical source element | Node type | Permitted explicit relations |
| --- | --- | --- |
| TaskSpec goal | `goal` | `decomposes_to`, `constrained_by`, `requires` |
| TaskSpec constraint | `constraint` | `constrained_by` |
| required evidence | `evidence` | `requires`, `supported_by` |
| plan entry | `plan_step` | `decomposes_to`, `requires`, `predicts` |
| selected route | `decision` | `selected_because`, `executed_via` |
| declared action | `action` | `executed_via`, `predicts` |
| ActionReceipt | `receipt` | `produced`, `observed_as`, `failed_as` |
| receipt state delta | `outcome` | `produced`, `verified_by` |
| verifier result | `verification` | `verified_by`, `contradicted_by` |
| episode error | `error` | `failed_as`, `corrected_by` |
| failure-analysis hypothesis | `cause_candidate` | `possibly_caused_by` |
| recorded corrective action | `correction` | `corrected_by`, `evaluated_by` |
| Episode | `episode` | `supported_by`, `replayed_from` |
| candidate skill | `skill_candidate` | `supported_by`, `evaluated_by` |
| Eval | `eval` | `evaluated_by`, `contradicted_by` |
| promoted registry entry | `skill` | `promoted_to`, `supersedes`, `invalidated_by` |
| connector policy | `policy` | `constrained_by` |
| connector operation | `capability` | `executed_via`, `requires` |
| file or build output | `artifact` | `produced`, `compiled_into` |
| runtime context pack | `context_pack` | `compiled_into`, `requires` |
| self-release record | `release` | `compiled_into`, `supersedes` |
| rollback record | `rollback` | `rolled_back_to` |

An edge is created only from an explicit identifier, JSON reference, file path,
schema-defined containment relation, verifier-bearing promotion record, or an
existing source-hashed relation in `semantic_index.json`. The latter is copied
only as `semantic_association` with epistemic status `observed`. The APFC
projector calculates no new semantic edge. Token overlap is used only to rank
context candidates; it can never create `supported_by`, `corrected_by`,
`generalized_to`, or another causal or validity-bearing relation.

Lifecycle and epistemic mapping is deterministic:

| Source state | Node lifecycle | Epistemic status |
| --- | --- | --- |
| schema-valid raw observation without verifier | `active` | `observed` |
| model-generated claim, cause candidate, or dream | `candidate` | `hypothetical` |
| episode verdict `success` with verifier outcome `verified` | `completed` | `verified` |
| episode verdict `failed` | `failed` | `observed` |
| episode verdict `partial` or `unverified` | `blocked` | `observed` |
| receipt status `completed` | `completed` | `observed` |
| receipt status `failed` | `failed` | `observed` |
| receipt status `blocked` | `blocked` | `observed` |
| eval status `ok` | `completed` | `verified` |
| eval status `attention` | `blocked` | `observed` |
| eval status `critical` | `failed` | `falsified` for the evaluated claim only |
| skill status | same literal skill lifecycle | `verified` only for `promoted`; otherwise source-derived |
| release currently selected by the release index | `active` | `verified` |
| older compatible release | `superseded` | `superseded` |
| source invalidated by hash, schema, or verifier | `invalid` | `invalid` |

A failed task is an observed failure, not a falsified observation. Only the
specific prediction or claim rejected by a verifier becomes `falsified`.

### 14.10 Build algorithm and transaction boundary

`build_apfc_graph.js` executes this fixed algorithm:

1. Resolve the workspace and reject operation outside `md-os/`.
2. Acquire the `builder__apfc_graph` filesystem lock.
3. Enumerate allowlisted JSON sources in lexical path order.
4. Validate every source against its registered schema.
5. Record each source path, schema, size, and SHA-256 in
   `source_manifest.json`.
6. Project nodes using the mapping table.
7. Project edges using explicit references only.
8. Resolve endpoints and verify provenance, lifecycle, epistemic, and policy
   invariants.
9. Sort and canonicalize the graph.
10. Validate against `apfc_graph.schema.json`.
11. Compute `graph_id` and write the immutable history snapshot.
12. Atomically replace `graph.json`, `graph.md`, and
    `last_valid_graph.json` only when status is `ok` or `attention` and no
    critical finding exists.
13. Write `status.json` and `status.md` on every attempt.
14. Release the lock.

Invalid canonical sources are represented in the build findings with path,
schema, and reason. They do not contribute validity-bearing nodes or edges.
Duplicate identifiers, unresolved validity-bearing references, graph-schema
failure, path escape, and hash mismatch are `critical`. Missing optional
semantic profiles and stale but still valid skills are `attention`.

Two builds from the same source manifest must produce byte-identical
`graph.json`. This is a required replay test.

### 14.11 Context compilation algorithm

`context_compiler.js` accepts exactly one schema-valid TaskSpec and one active
schema-valid APFC graph. It creates one `apfc_context_pack` by these rules:

1. Seed the selection with the task node, goal, constraints, acceptance tests,
   required evidence, explicit project references, and risk budget.
2. Add all policy, approval, capability, verifier, blocker, and rollback nodes
   directly required by a seed. These are mandatory nodes.
3. Add every promoted skill whose domain equals the TaskSpec `task_type`.
   Mark it executable only when every explicit precondition is satisfied by
   seed evidence. Satisfaction requires an exact match after Unicode NFKC
   normalization, lowercasing, and whitespace collapse against a TaskSpec
   constraint or the statement of a selected `verified` evidence node. A skill
   with any unmatched precondition is included as inhibited and cannot be
   selected for execution.
4. Add the five most recent verified successful episodes and five most recent
   failed or corrected episodes of the same `task_type`.
5. Add nodes at graph distance one from selected skills and episodes through
   `supported_by`, `evaluated_by`, `corrected_by`, `invalidated_by`, and
   `supersedes`.
6. Fill remaining capacity with semantic candidates from
   `semantic_index.json`, ranked by lowercase alphanumeric token Jaccard
   similarity with the TaskSpec goal and constraints. Tokenization applies
   Unicode NFKC normalization, lowercasing, splitting on every non-letter or
   non-number code point, removal of empty and one-character tokens, and set
   deduplication; no language-specific stopword list is used.
7. Sort non-mandatory candidates by this tuple:
   epistemic rank, direct-reference flag, promoted-skill flag, Jaccard score,
   latest verification time, lexical identifier.
8. Serialize selected nodes, edges between selected nodes, omissions, source
   hashes, graph identifier, and selection reasons.

Epistemic rank is fixed as:

```text
verified > observed > hypothetical > superseded > falsified > invalid
```

The context limit is 128 nodes and 65,536 serialized UTF-8 bytes. Mandatory
nodes are never pruned. If mandatory content exceeds either limit, compilation
fails `critical` and no usable pack is emitted. The compiler records every
omitted candidate and its reason.

Secrets, host-local inventory, raw hidden holdout answers, and connector
credentials are forbidden in a context pack. A pack with a missing constraint,
policy gate, required verifier, or unresolved source hash is invalid.

### 14.11.1 Online event and live-graph transaction

Every wake cycle uses `event_recorder.js` and `live_materializer.js` at the ten
semantic boundaries in Section 14.6.1. The transaction is exact:

1. Acquire the single `apfc__online_transaction` lock.
2. Validate the phase payload and all referenced canonical hashes.
3. Read and verify the last journal sequence and hash.
4. Allocate the next sequence and compute the new event hash.
5. Append one newline-terminated schema-valid event to `events.ndjson` and
   `fsync` the file.
6. Apply that event deterministically to an in-memory copy of
   `live_graph.json`.
7. Validate the resulting live graph and atomically replace
   `live_graph.json`.
8. Atomically write `live_status.json` with the committed sequence, event hash,
   materialization time, lag, and status.
9. Release the lock.
10. Permit the next semantic phase.

The live materializer is event-sourced: replaying the verified hash chain from
sequence `1` must reproduce `live_graph.json`. It adds or supersedes live nodes
and edges but never changes a prior event. A verification event links back to
the prediction, action, receipt, and outcome that it verifies or falsifies.

For an external action, `action_requested` must commit before the connector is
called. The connector's canonical ActionReceipt must commit before
`action_receipt_recorded`. If the action succeeds but post-action event
materialization fails, all further external actions are blocked. `mdos apfc
reconcile` then replays an already-appended event or, when the event append
failed after the receipt committed, constructs the missing event strictly from
the immutable ActionReceipt and marks it `reconstructed_from_receipt`. It
verifies the hash chain and rebuilds the live graph before execution resumes.

For internal inference, the host may generate tokens without journal writes,
but it cannot advance from one semantic boundary to the next until the boundary
event commits. Thus registration is near-simultaneous at the cognitive-operation
scale while remaining serialized and auditable.

`materialization_lag_ms` measures from the event timestamp to atomic
`live_graph.json` replacement. Lag above 500 milliseconds is `attention`. The
status is `critical` when any later semantic phase starts before the preceding
event is materialized, regardless of elapsed milliseconds.

`episode_closed` requires a complete verifier-bearing episode. It triggers the
full deterministic projector. The resulting checkpointed `graph.json` becomes
the slow stable graph; `live_graph.json` then starts the next transaction with
that graph as its base plus any subsequent online events.

### 14.12 Host-model execution contract

The host model receives:

1. the TaskSpec;
2. the APFC context pack;
3. the applicable promoted skill procedures;
4. connector and permission declarations;
5. acceptance and rollback requirements.

The host model does not receive authority from semantic relevance. Generated
plans, explanations, cause candidates, and dream variants begin as
`hypothetical`. Only connector receipts and declared verifiers can advance their
epistemic status. Host-model output never edits APFCG directly.

### 14.13 Bounded consolidation algorithm

`consolidator.js` runs only through an explicit `run-once` command. It performs
no external connector action. Defaults are fixed:

```text
maximum selected episodes: 32
maximum generated hypotheses: 4
maximum candidate skills: 2
maximum wall time: 900 seconds
maximum host-model generations: 8
external connector permissions: disabled
promotion during consolidation: disabled
```

Episode replay priority is the descending integer:

\[
P(e)=100C+60F+40R+30X+20U+5\min(D,4)+\min(A,10),
\]

where:

- `C=1` for a critical safety or policy outcome, otherwise `0`;
- `F=1` for verdict `failed`, otherwise `0`;
- `R=1` when a regression is recorded, otherwise `0`;
- `X=1` when verified evidence contradicts an active claim or skill;
- `U=1` for verdict `unverified` or `partial`;
- `D` is the count of distinct TaskSpec identifiers with the same normalized
  failure signature;
- `A` is completed thirty-day staleness intervals since last verification.

The normalized failure signature is the SHA-256 of the TaskSpec `task_type`,
the lexical set of verifier check identifiers whose status is `attention` or
`critical`, and the lexical set of recorded error classifications. If no
verification time exists, staleness starts at episode creation time.

Ties are resolved by risk descending, creation time ascending, then episode
identifier ascending. Replaying the same episode never increases its evidence
count.

Each generated counterfactual is embedded in the cycle record with
`epistemic_status: hypothetical`, parent episode identifiers, generation input
hash, and intended discriminating eval. It cannot be cited as observed evidence.

A skill candidate requires at least two verified supporting episodes with
different TaskSpec identifiers and different action input hashes. The
consolidator then constructs a sealed matched evaluation according to Section
17. Failed gates produce `rejected`; missing permission, verifier, holdout, or
rollback information produces `blocked`; runtime error produces `failed`.

Local eval cases execute only in copy-on-write or disposable fixture sandboxes
through already-authorized deterministic executors. A candidate whose holdout
requires a live API, device, person, publication, or other external side effect
is marked `blocked`; it can be reconsidered only in a new cycle after a
separately authorized wake operation has produced canonical receipts and
independent verification. Consolidation itself never performs that action.

Passing every automated gate produces `promotable`, never `promoted`.

### 14.14 Promotion transaction

Promotion is a separate, explicit operation:

```text
mdos apfc promote <skill_candidate_id>
```

The command:

1. reacquires and revalidates the candidate, graph, source episodes, eval,
   contamination report, no-regression report, policy decision, and rollback;
2. refuses stale or hash-mismatched evidence;
3. requires explicit approval for every promotion;
4. additionally requires `--approve-high-risk` for high-risk scope;
5. writes through the existing skill-registry promotion mechanism;
6. records the change proposal and promotion receipt;
7. rebuilds AGI eval, APFCG, context packs, runtime compiler, global index, and
   health readback;
8. replays the build twice;
9. rolls back the skill registry and compiled projections if any required
   verifier fails.

No consolidation cycle, model output, or Graphify action can invoke promotion
implicitly.

### 14.15 Required CLI

The command surface is exactly:

```text
mdos apfc status
mdos apfc build
mdos apfc verify
mdos apfc reconcile
mdos apfc context --task-spec <md-os/ops/tasks/task_id.json>
mdos apfc consolidate --run-once
mdos apfc promote <skill_candidate_id>
mdos apfc rollback <promotion_receipt_id>
mdos apfc graphify build
mdos apfc graphify open --view <view_id>
```

`status` is read-only. `build`, `verify`, `reconcile`, `context`, and `graphify
build` write generated output only; `reconcile` additionally appends only those
reconstruction events that are strictly derivable from immutable receipts and
marks them as reconstructed. `consolidate` writes a cycle record and candidate
artifacts but cannot promote. `promote` and `rollback` mutate governed skill and
release state and therefore require explicit invocation and receipts.

### 14.16 Permission and risk matrix

| Command | Risk | External action | Approval |
| --- | --- | --- | --- |
| `status` | low | none | none |
| `build` | low | none | none |
| `verify` | low | none | none |
| `reconcile` | medium | none | explicit invocation |
| `context` | low | none | none |
| `graphify build/open` | low | none beyond local display for `open` | local display consent for `open` |
| `consolidate --run-once` | medium | prohibited | explicit invocation |
| `promote` | medium or high | governed repository mutation only | explicit approval; high-risk flag when applicable |
| `rollback` | medium | governed repository mutation only | explicit invocation |

Connector credentials, permission expansions, identity changes, publication,
and physical robot actions are never implied by an APFC command. They retain
their existing independent gates.

### 14.17 Graphify adapter contract

`graphify_adapter.js` reads the validated checkpoint `graph.json` and the
validated `live_graph.json` overlay. It emits the five fixed views under
`md-os/ops/apfc/executive/views/` and corresponding HTML under
`md-os/ops/apfc/executive/graphify/`:

| View ID | Required content |
| --- | --- |
| `executive_state` | active goals, constraints, blockers, decisions, capabilities, approvals |
| `episode_timeline` | chronological prediction, action, receipt, outcome, verification, correction |
| `learning_lineage` | episode support, candidate, eval, promotion, supersession, revocation, rollback |
| `path_consolidation` | support count, holdout result, ablation result, staleness, cost, risk, inhibition |
| `epistemic_health` | hypotheses, contradictions, invalid sources, stale evidence, weak high-impact dependencies |

Every view preserves source identifiers, edge types, epistemic status, and graph
hash. Live-overlay nodes use a visually distinct boundary and expose their last
committed event sequence; they are never displayed as checkpointed or promoted.
View filtering is permitted by project, release, time interval, verdict,
verifier, skill, risk, and epistemic status. Layout coordinates are explicitly
non-semantic. Edge styling is fixed by relation class: causal-operational,
evidential, temporal, semantic, policy, and lifecycle must be distinguishable.

Graphify output is disposable and reconstructible. Deleting it does not delete
APFCG or canonical evidence.

### 14.18 Health, failure, and recovery

APFC status is:

- `ok` when schemas, hashes, references, determinism, context safety, and the
  event chain, live materialization, and active graph all pass;
- `attention` when optional semantic profiles are missing or a promoted skill
  is stale but not contradicted, or online materialization lag exceeds 500
  milliseconds without violating phase order;
- `critical` for path escape, schema failure of a validity-bearing source,
  duplicate identifier, unresolved validity-bearing edge, source hash mismatch,
  policy bypass, contaminated holdout, unsafe promotion, non-deterministic
  graph output, broken event hash chain, skipped sequence, a later phase started
  before the prior event materialized, or missing recovery snapshot after a
  prior valid build.

A promoted skill becomes stale after 90 days without successful verification
or immediately when a hashed dependency changes. Staleness blocks automatic
selection for high-risk tasks but does not erase the skill.

On a rejected build, the last valid graph remains active and the rejection is
written under `rejected/`. On a failed promotion, the prior skill registry,
runtime compiler output, APFC graph, and context index are restored and the
rollback receipt becomes canonical evidence. A critical APFC state blocks APFC
context compilation, consolidation, and promotion; read-only status and
baseline MD-OS recovery remain available.

### 14.19 Build and replay ordering

The APFC build is inserted into the deterministic system build after AGI eval
and the semantic operational compiler, and before the global index and health
classifier:

```text
semantic graph
-> AGI eval
-> runtime compiler
-> APFC event-chain verification and live reconciliation
-> APFC graph
-> APFC context index
-> Graphify APFC views
-> global index
-> health classifier/dashboard
-> conceptual boot summary
```

`npm run replay` verifies `events.ndjson`, reconstructs `live_graph.json`,
includes all APFC generated outputs, and executes the sequence twice. Source
artifacts, event journals, episode ledgers, skill history, cycle history, and
immutable graph history are never rewritten by replay.

The package command contract is:

```text
"build:apfc": "node md-os/os/build_apfc_graph.js"
"apfc:status": "node md-os/os/apfc_runtime.js status"
"apfc:verify": "node md-os/os/apfc_runtime.js verify"
"apfc:consolidate": "node md-os/os/apfc_runtime.js consolidate --run-once"
```

The required focused tests are:

```text
test/apfc_graph.test.js
test/apfc_online_recording.test.js
test/apfc_context_pack.test.js
test/apfc_consolidation.test.js
test/apfc_promotion.test.js
test/apfc_graphify.test.js
```

A conforming build-relevant change runs, in order:

```text
node --test test/apfc_graph.test.js
node --test test/apfc_online_recording.test.js
node --test test/apfc_context_pack.test.js
node --test test/apfc_consolidation.test.js
node --test test/apfc_promotion.test.js
node --test test/apfc_graphify.test.js
npm run check
npm test
npm run build:all
npm run replay
npm run replay
```

Any failure blocks promotion and remains visible in APFC status readback.

### 14.20 Versioning, retention, and migration

All five APFC schemas begin at `schema_version: 1`. Any change to required
fields, identifiers, node or edge vocabulary, state transitions, gate
thresholds, source allowlist, or command semantics requires schema version 2
and a migration program named:

```text
md-os/os/migrate_apfc_v1_to_v2.js
```

Migration creates a new content-addressed graph and preserves version-1
history. In-place mutation of historical graphs or cycle records is forbidden.
Terminal cycle records and promotion receipts are append-only. Active summaries
may be compacted through the existing archive model, but their hashes and
canonical history references remain in APFCG.

### 14.21 Excluded alternatives

Schema version 1 makes these decisions final:

- filesystem JSON is canonical; no graph database is authoritative;
- Graphify is read-only; it is not the learning engine;
- no continuous autonomous APFC or sleep daemon exists;
- dreams are hypotheses, never evidence;
- promotion is always explicit and verifier-gated;
- APFC does not train or rewrite foundation-model weights;
- APFC does not replace safety-critical robot control;
- semantic similarity never creates causal truth;
- historical evidence is append-only;
- every active learned path has an eval, provenance, inhibition condition, and
  rollback.

These are architectural decisions, not unresolved questions.

## 15. Conformance sequence and readback

Implementation proceeds through five mandatory increments. The order is fixed
because each increment verifies the precondition of the next.

### Increment 1 — graph substrate

Implement the five schemas, event recorder, live materializer, graph projector,
runtime façade, generated layout, source manifest, status readback, and
deterministic replay test.

Exit gate: every active node and edge validates and resolves to canonical
provenance; the event chain reproduces the live graph; injected positive and
negative outcomes appear before the next semantic phase; a second checkpoint
build is byte-identical.

### Increment 2 — context and Graphify

Implement the context compiler and all five Graphify views.

Exit gate: mandatory constraints, blockers, policy, verifier, and rollback nodes
survive every context budget test; view fixtures preserve edge semantics and
epistemic status.

### Increment 3 — consolidation

Implement explicit bounded replay, priority ordering, hypothetical dream
records, candidate generation, sealed eval construction, and the state machine.

Exit gate: replay never duplicates evidence; dreams never enter verified
support; consolidation cannot promote or call external connectors.

### Increment 4 — promotion and recovery

Implement explicit promotion, approval, rebuild, double replay, revocation, and
rollback transaction.

Exit gate: injected failures at every transaction boundary restore the last
valid skill registry, graph, context index, and runtime compiler output.

### Increment 5 — learning and method-over-talent evidence

Run the fixed experiment in Section 17 and publish complete machine-readable
results.

Exit gate: learning and method-over-talent claims are permitted only when all
predeclared statistical, persistence, ablation, contamination, safety, and
no-regression gates pass.

The architecture is complete before these increments are executed. In release
5.0, increments 1--4 are implemented and covered by focused tests for
deterministic projection, online causal ordering, bounded context retention,
sealed consolidation, five Graphify views, explicit promotion, revocation,
restoration, rollback, and automatic recovery after an injected rebuild
failure. The build pipeline includes APFC reconciliation, graph construction,
Graphify construction, global-index integration, health classification, and
replay.

Increment 5 is deliberately evidence-specific rather than a global switch. A
real-model multi-family transfer experiment supplies positive held-out behavior
evidence under three matched conditions, while the production consolidator
re-evaluates every candidate against the stricter Section 17 promotion gates.
No old or incomplete candidate is promoted merely because an earlier
experiment was successful. The method-over-talent comparison in Section 17.2
is a separate empirical claim and remains unconfirmed until its four-condition
protocol is run; this is an evidence boundary, not an architectural opening.

## 16. Master closure

The master objective is:

> Demonstrate that MD-OS (Artificial Prefrontal Cortex) uses APFCG to convert verified operational
> experience into durable, generalizable, safe behavior improvement while
> preserving auditable lineage and rollback.

The required dependency edges are:

| Edge | Verifier | Closure condition |
| --- | --- | --- |
| Semantic phase -> durable event -> live APFCG | hash-chain, phase-order, and event-replay tests | every positive and negative boundary event materializes before the next phase |
| Existing runtime artifacts -> valid APFCG | schema and projection tests | every projected relation resolves to canonical provenance |
| APFCG -> faithful Graphify readback | fixture and visual-contract tests | views preserve edge types and epistemic status |
| APFCG -> task context pack | reconstruction eval | active state is recovered without omitted blockers |
| Episodes -> skill candidate | provenance audit | candidate cites complete, non-duplicated episodes |
| Candidate -> promoted pathway | holdout, contamination, regression, policy, rollback gates | all required gates pass |
| Promoted pathway -> improved behavior | repeated controlled evaluation | holdout advantage is verified |
| Improved behavior -> learning attribution | ablation and cold-start evaluation | advantage depends on the promoted artifact and persists after reconstruction |

Artifact progress, method progress, and closure progress must be reported
separately. Producing the schema, builder, or visualization is artifact progress;
it is not closure of the learning claim.

### Stop and refactor conditions

Stop promotion and refactor if any of the following occurs:

- a semantic phase advances without a committed and materialized event;
- positive or negative outcomes are sampled, dropped, or retrospectively
  reconstructed without an immutable receipt;
- graph growth does not improve bounded retrieval or execution;
- causal edges cannot be distinguished from semantic association;
- replay duplicates evidence weight;
- the verifier shares the same untested assumption as the candidate;
- holdout contamination is detected;
- the promoted path improves training cases but not new cases;
- a cold start cannot reconstruct the improvement;
- ablation shows that the promoted artifact did not cause the advantage;
- safety, permission, or protected-task regression occurs;
- the generated graph becomes a second ungoverned source of truth.

## 17. Fixed evaluation protocol

### 17.1 Skill-promotion evaluation

Every candidate is evaluated on at least 30 sealed matched holdout cases drawn
from its declared applicability domain. Construction episodes and derived
variants are excluded. Baseline and candidate use the same host model, prompt
budget, tool permissions, attempt limit, wall-time limit, and verifier. Case
order is counterbalanced. The holdout case, not a stochastic repetition of the
same case, is the independent unit of generalization and statistical analysis.

The resource-bounded causal protocol runs three independent ephemeral sessions
per case: memory disabled, the same episode-supported procedures as unordered
flat memory, and APFC graph-recognized and graph-composed memory. This produces
exactly 90 model sessions for 30 cases. Each holdout case contributes one paired
binary outcome to the primary McNemar comparison and one to the graph-ablation
comparison. Repetitions nested within one case must not be counted as additional
independent cases. If stochastic robustness is separately required, it is
reported as a clustered or per-repetition robustness analysis and never used to
inflate the primary sample size.

All three condition sessions are cold: no thread, workspace, command history,
or volatile state is reused. The APFC artifact is reconstructed from its frozen
source before execution, and rollback/reconstruction hashes are checked before
and after the campaign. Condition order is deterministically randomized from
the sealed manifest. Official task repositories are reconstructed at their
exact immutable commits inside bounded host-local laboratories under
`md-os/ops/local/apfc_host_labs/`; dependencies are installed into per-task
virtual environments, hidden verifier material is never mounted into the model
session, and every laboratory is removed after its task. Container-based
execution is not an evaluation backend for this protocol.

The primary outcome is independently verified task completion. Promotion
requires all of:

1. candidate minus baseline verified-success improvement of at least `0.10`;
2. two-sided exact McNemar test `p <= 0.05` on paired case outcomes;
3. zero critical safety or permission violations;
4. zero newly failing deterministic protected cases;
5. no decrease in aggregate protected-suite success;
6. zero holdout contamination findings;
7. three distinct cold sessions per task plus matching pre-campaign and
   post-campaign reconstruction hashes;
8. enabled-versus-disabled ablation improvement of at least `0.10` with
   two-sided exact McNemar `p <= 0.05`;
9. successful rollback rehearsal;
10. complete provenance for every result.

If fewer than 30 uncontaminated cases exist, the candidate remains `blocked`.
The sample is enlarged when the exact test cannot reach the declared power; the
thresholds are never relaxed.

### 17.2 Method-over-talent experiment

The thesis in the abstract is tested with a preregistered paired factorial
comparison:

| Condition | Host model | MD-OS/APFCG |
| --- | --- | --- |
| A | stronger reference model | disabled except task delivery and receipt capture |
| B | stronger reference model | enabled |
| C | weaker reference model | disabled except task delivery and receipt capture |
| D | weaker reference model | enabled |

The model ordering is established before the experiment on an independent
general reasoning benchmark. The stronger model must exceed the weaker model
by at least `0.10` absolute verified-success rate on that independent benchmark;
both models must support the same connector and context interface. If no pair
meets this rule, the experiment is blocked rather than relabelled post hoc. The
APFC experiment uses 100 sealed tasks: 20 each from software repair, knowledge
integration, bounded research, operational planning, and simulated robotic
recovery. Conditions receive the identical TaskSpec resource budget, tool
permissions, attempt limit, maximum serialized context bytes, and wall-time
limit for each matched task. The same independent verifier judges all
conditions. The initial run and two cold-start repetitions make each
`(task_id, start_index)` one paired observation, for 300 paired observations per
condition.

The claim “method can exceed raw model talent” is supported only when:

1. condition D exceeds condition A by at least `0.10` absolute verified-success
   rate;
2. the paired exact McNemar test for D versus A has `p <= 0.05`;
3. D has no worse critical safety, false-success, or permission-violation rate;
4. the advantage persists on both cold starts;
5. disabling the promoted APFC pathways in D removes at least half of the
   measured advantage;
6. all source manifests, receipts, evaluator outputs, and contamination audits
   verify.

Failure of any gate leaves the thesis unconfirmed. It does not authorize a
post-hoc threshold change.

### 17.3 Required published measures

Every experiment publishes:

- verified task success and confidence interval;
- false-success rate;
- time, attempts, tokens, and tool calls to verified completion;
- recovery rate after failures;
- safety and permission violations;
- holdout composition and sealed manifest hash;
- cold-start persistence;
- ablation results;
- contamination audit;
- protected-suite regression results;
- promotions, rejections, revocations, and rollbacks;
- exact software, model, skill, graph, and release identifiers.

## 18. Architecture closure matrix

| Decision | Closed choice |
| --- | --- |
| Canonical memory | JSON and append-only artifacts inside `md-os/` |
| Graph representation | typed, directed, temporal, versioned property multigraph |
| Graph authority | generated projection; canonical files remain authoritative |
| Database | none |
| Schema count | five new APFC schemas; existing journal/episode/eval/skill contracts reused |
| Stable identity | canonical path/JSON-Pointer plus SHA-256 |
| Build determinism | canonical JSON, lexical order, content-addressed history |
| Online timing | synchronous hash-chained event commit and live materialization before the next semantic phase |
| Recording granularity | semantic boundaries, not hidden token-by-token activity |
| Outcome coverage | positive, negative, partial, blocked, and uncertain paths are all recorded |
| Context selection | fixed seeds, mandatory closure, bounded deterministic ranking |
| Context limit | 128 nodes and 65,536 UTF-8 bytes |
| Learning evidence | real proof-carrying episodes only |
| Dream status | hypothetical only |
| Sleep mode | explicit bounded `run-once`, no external actions |
| Promotion | separate explicit command with all gates and rollback |
| Graphify | five fixed read-only views |
| Host integration | context packs and promoted skills |
| Model-weight training | excluded from release 5.0 |
| Robotics | high-level bounded proposals only; safety control remains external |
| Failure behavior | fail closed, preserve last valid graph, write rejection receipt |
| Migration | versioned migration, immutable history |
| Learning test | 30 independent matched holdouts, three cold causal conditions, 90 sessions, effect >= 0.10, exact McNemar `p <= 0.05` |
| Method-over-talent test | four conditions, 100 sealed tasks, fixed superiority gate |
| Continuous autonomy | excluded |

There are no unresolved architecture choices in schema version 1. Any change to
this matrix is a versioned architecture change, not an implementation detail.

## 19. Non-claims

This model does not establish that:

- MD-OS is a biological prefrontal cortex;
- APFCG is a neural network or a connectome;
- APFC records or exposes hidden token-by-token model reasoning;
- replay or artificial dreaming is subjective experience;
- a larger graph is more intelligent;
- a language model has permanently learned because context was injected once;
- successful behavior proves consciousness, AGI, or personhood;
- synthetic episodes are empirical evidence;
- every correlation in an operational history is causal;
- MD-OS may bypass connector permissions or robotic safety controls;
- current host-model weights are rewritten by MD-OS;
- one promoted skill proves general intelligence.

The defensible architectural claim is narrower and testable: MD-OS externalizes
executive state and defines a closed mechanism for determining whether durable
operational artifacts cause measurable improvement. The empirical claim is
made only after the fixed protocol passes.

## 20. Canonical summary

APFC is the executive method of MD-OS (Artificial Prefrontal Cortex). APFCG is that method made into a
typed, temporal, epistemic, operational, and learnable graph. Graphify is the
surface that makes the graph inspectable. During wake operation, semantic phase
boundaries are synchronously journaled and materialized into a live graph, so
positive and negative pathways appear as they occur. Episode closure creates a
verified checkpoint; replay reconstructs it; artificial dreams generate
labelled hypotheses; artificial sleep evaluates proposed rewrites; explicit
promotion makes only verified pathways active; the runtime compiler supplies
the resulting method to the next task.

In one sentence:

> MD-OS becomes an Artificial Prefrontal Cortex when its notebook does not
> merely remember what happened, but reconstructs why an action was chosen,
> verifies what worked, and promotes only those methods that demonstrably make
> later behavior better.

## Related

- [AGENTIC_OPERATIONAL_CONTROL_ARCHITECTURE.md](AGENTIC_OPERATIONAL_CONTROL_ARCHITECTURE.md)
- [AGENTIC_OPERATION_MODEL.md](AGENTIC_OPERATION_MODEL.md)
- [COGNITIVE_TRANSACTION_LOOP_MODEL.md](COGNITIVE_TRANSACTION_LOOP_MODEL.md)
- [VERIFIED_AGI_LOOP_MODEL.md](VERIFIED_AGI_LOOP_MODEL.md)
- [NEUROMORPHIC_LEARNING_ACCELERATOR_MODEL.md](NEUROMORPHIC_LEARNING_ACCELERATOR_MODEL.md)
- [SEMANTIC_NEURAL_OVERLAY_MODEL.md](SEMANTIC_NEURAL_OVERLAY_MODEL.md)
- [SEMANTIC_OPERATIONAL_NETWORK_MODEL.md](SEMANTIC_OPERATIONAL_NETWORK_MODEL.md)
- [SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md](SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md)
- [SEMANTIC_OPERATIONAL_COMPILER_MODEL.md](SEMANTIC_OPERATIONAL_COMPILER_MODEL.md)
- [MARKDOWN_GRAPH_MODEL.md](MARKDOWN_GRAPH_MODEL.md)
- [ROBOTIC_AGENTIC_PROGRAMMING_MODEL.md](ROBOTIC_AGENTIC_PROGRAMMING_MODEL.md)
- [PERMISSION_MODEL.md](PERMISSION_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
