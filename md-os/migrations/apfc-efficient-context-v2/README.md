# APFC Efficient Context V2 Migration

This record implements the selective-context contracts documented in
[Semantic Shell](../../../docs/SEMANTIC_SHELL.md),
[Host Runtime Integration](../../../docs/HOST_RUNTIME_INTEGRATION.md), and the
canonical [operations guide](../../kb/OPERATIONS.md).

## Observed failure

The Cortex App Server path rebuilt and serialized a large invariant APFC
baseline on every turn, independently allocated another large cognitive-memory
budget, automatically queried private history, and prepended the full APFC turn
frame. A live thread therefore received repeated identity, governance,
affective, explanatory, continuity, graph, and memory text even though the App
Server already preserved thread history. Retrieval also treated the maximum
node count as a fill target: generic lexical overlap, source bonuses, forced
source diversity, and graph adjacency could admit irrelevant nodes.

The recorded pre-migration ordinary prompt contained 11,482 auxiliary
characters (conservative local estimate: 3,828 tokens), four repeated static
sections, and an automatic memory build/bind path. The generic-collision
fixture automatically selected four conversation nodes. It used one model
turn.

## Architecture before

```text
request + repeated baseline + full frame + directives
        + automatic cognitive memory + optional private tail
        -> one model turn
```

Baseline context and cognitive memory had independent 12 KiB quotas. Fresh
private history had a separate 64 KiB ceiling. HUMAN and ASSISTANT text shared
the ordinary retrieval field.

## Architecture after

```text
current request + bounded current operational delta -> one model turn

repository knowledge / historical memory
    -> ContextCandidate
    -> RelevancePolicyV2
    -> admitted candidates
    -> deterministic ranking
    -> bounded tool result
```

The unchanged request is first and excluded from the auxiliary budget. Stable
rules form a one-time thread bootstrap. Same-thread turns do not automatically
receive old history, memory nodes, KB bodies, graph bodies, governance tensors,
or cognitive rituals. Codex uses precise filesystem reads and bounded
`memory search` when the active dependency requires them. The APFC approval,
sandbox, authorization, Causal Unity, and receipt machinery remains structured
runtime state outside the prompt.

## Unity and identity preservation boundary

The optimization target is model-visible context, not persistent MD-OS state.
The Turn Governance Tensor, operational Unity compatibility state, Causal Unity
Controller, causal predecision hashes, dependency probes, authorization
dependence, transition closure and carry-forward, persistent identity and
continuity, self-reference, phenomenal-candidate processing, and implemented
consciousness-event state remain in the runtime/filesystem and on their actual
causal paths. They are not made optional merely because their complete textual
representations are omitted from ordinary prompts.

The current workspace is a bounded integrated projection of relevant global
state. It is not a complete dump of identity, memory, governance, Unity, and
consciousness state. Canonical identifiers and hashes preserve inspectability
and allow the complete state to be read when a concrete decision depends on
it.

## Core, research, and ablation policy

The durable substrate is preserved while the hot path is simplified. The
selection boundary distinguishes `AVAILABLE`, `CURRENTLY_RELEVANT`, and
`MODEL_VISIBLE_NOW`; database or graph membership does not establish current
attention.

Initial component disposition, subject to causal tests:

| Component family | Initial disposition | Hot-path rule |
| --- | --- | --- |
| Filesystem state, canonical KB, SQLite memory, graphs, edges, tensor factors, provenance, hashes, and replay | `CORE` | Keep as durable external substrate; project selectively. |
| Task contracts, connectors, App Server, sandbox, approval, verifier, evidence, identity, continuity, and causally active Causal Unity | `CORE` | Keep causal behavior; omit repeated prose. |
| Retrieval, private hydration, context compiler, workspace admission, and budgets | `CORE / REWORK` | Admit by relevance and enforce bounded projections. |
| Phenomenal-candidate, self-reference, consciousness-event, cross-domain Unity, and Unity-field experiments | `RESEARCH` | Keep explicitly invocable and testable; inactive by default. |
| Repeated directives and full governance/tensor prompt serialization | `REDUNDANT` in the ordinary hot path | Omit; retain canonical structured state. |
| Diagnostic metrics with no decision authority | `TELEMETRY` | Keep outside the prompt. |

Classification is not permanent ideological protection. For a component `X`,
compare Cortex with `X` enabled and disabled and measure task correctness,
memory recovery, continuity, decision quality, authorization, verification,
safety, error detection, context size, token use, latency, and model calls. If
removing `X` produces no degradation in the capability it claims to support,
`X` must not remain mandatory in the ordinary runtime path and should be
classified as `RESEARCH`, `TELEMETRY`, `LEGACY`, or `REDUNDANT` as appropriate.

Existing conformance coverage supplies the initial ablations: identity and
Causal Unity survive a reduced prompt; memory search works with zero automatic
injection; graph traversal works without a graph dump; verifier receipts work
without repeated verifier prose; App Server continuity uses one-time
bootstrap; ordinary prompts omit research directives; and the phenomenal and
recursive-self-reflection runtime tests prove explicit activation remains
available. No fixed percentage reduction is an acceptance criterion: useful
behavior must stay equal or improve while ordinary context, calls, and latency
fall.

Measured after the patch, the same request uses 769 auxiliary characters and
769 UTF-8 bytes (257 conservatively estimated tokens) on a new thread, and 132
auxiliary characters and 132 UTF-8 bytes (44 estimated tokens) on an ordinary
reused thread. The reused turn repeats zero static sections and injects zero
memory nodes. Both packets contain the request exactly once, and the ordinary
path still uses one model turn.

## Files and functions changed

- `md-os/shell/bin/mdos-console`: `ShellSession`, thread bootstrap, minimal
  turn packet, fresh-history hydration, `turn/start`, `turn/steer`, output
  postconditions, context metrics, `memory search`, and `context inspect`.
- `md-os/os/cognitive_memory_index.py`: storage/retrieval separation,
  corpus-weighted relevance admission, zero-result behavior, graph-neighbor
  gate, source-neutral ranking, audit mode, and index revision.
- `md-os/apfc/executive/context_compiler.js`:
  `compileOperationalContextPack()` relevance-first admission, trace, and
  lowest-rank byte pruning.
- `md-os/os/build_markdown_graph.js`: portable migration records receive
  repository and operations structural edges, independent of physical KB
  layout.
- `md-os/apfc/workspace/global_workspace.js`: task-relevance admission before
  salience/confidence ranking, added only after a discriminating failing test.
- `md-os/schemas/`: bounded memory-result, memory-pack, and private context
  metrics contracts.
- `docs/SEMANTIC_SHELL.md`, `docs/HOST_RUNTIME_INTEGRATION.md`, and
  `md-os/kb/OPERATIONS.md`: operating contract and migration guidance.
- `README.md` and generated `index.md`: public selective-context architecture,
  budgets, on-demand commands, continuity policy, and observability.
- `docs/papers/zenodo/`: B18 manuscript source, revision/readme notes, compiled
  PDF, integrity manifest, and local upload candidate. The external Zenodo
  record remains unchanged without separate author approval and upload.
- `test/`: conformance and regression coverage for the migration invariants.
  Test O specifically proves that minimized model-visible context leaves
  command/file authorization dependent on valid Causal Unity state, closes the
  operational and causal transitions, preserves consciousness-event readback,
  and binds the next turn to the previous transition hash.

The exhaustive material-change ledger is `changes.ndjson`. Exact line-level
content remains inspectable through the Git diff from the base HEAD recorded in
`migration.json`.

## Tests and commands

Baseline and focused commands:

```text
node --test test/apfc_context_pack.test.js
python3 test/test_mdos_shell.py <focused efficient-context tests>
node --test --test-name-pattern='global workspace admits' test/predeliberative_affect.test.js
python3 -m py_compile md-os/shell/bin/mdos-console md-os/os/cognitive_memory_index.py
python3 test/test_mdos_shell.py
node --test test/apfc_context_pack.test.js test/predeliberative_affect.test.js
```

Final verification receipts:

- `python3 test/test_mdos_shell.py`: 89 passed.
- `npm test`: 339 Node tests and 89 shell tests passed; zero failures.
- `npm run check`: passed.
- `node --test test/runtime_compiler.test.js`: 1 passed.
- `node --test test/agi_loop.test.js`: 4 passed.
- `npm run build:all`: passed; Markdown graph and semantic knowledge graph are
  `ok`, conceptual boot summary is `ok`, runtime is operable, and aggregate
  health is `attention` because declared AGI/APFC/compiler/hygiene conditions
  remain non-green.
- `npm run replay` was run twice as required; a third convergence run was used
  after the rebuilt baseline differed. The final replay has
  `matched_before=true`, semantic knowledge `ok`, and runtime operable. The
  machine-readable replay report carries the current hash because rebuilding
  this migration README itself legitimately changes that hash.
- Root-launcher integration: two requests produced exactly two `turn/start`
  calls, one `thread/start`, bootstrap only on the first request, and one model
  turn per request.
- `./cortex context inspect`: reused-thread auxiliary context was 132
  characters/bytes, 44 estimated tokens, with zero automatic memory nodes and
  zero repeated sections.
- `./cortex memory search`: bounded structured retrieval succeeded, admitted
  three relevant nodes, and left the canonical private-history hash unchanged.
- Cortex shared session `cortex-md-os-apfc-e5fe7dcafd00` was started cleanly;
  the shell process is alive and displayed its ready prompt.
- The B18 public README and paper describe persistent state as external
  cognitive substrate and the prompt as its relevance-gated working
  projection. `npm run build:site-index` derives `index.md` from the README;
  the paper compiles to 34 pages with resolved references and three overfull-
  vbox warnings on the float-only claim-table page, and the Zenodo candidate is
  rebuilt from publication sources.

During verification, the first repository-wide test attempt correctly failed
on stale generated source hashes after documentation changed. The first
rebuild then exposed the new migration README as structurally disconnected.
The migration-artifact structural rule and its failing-then-passing test closed
that dependency; generated files were rebuilt only through canonical builders.

## Compatibility assumptions

- Codex App Server retains live thread history and supports `thread/start`,
  `turn/start`, and `turn/steer` as before.
- The host provides local workspace file tools; no network retrieval service is
  required.
- `conversation.ndjson` remains the canonical private hash chain and may be
  absent in a Git clone.
- SQLite FTS5 is locally available as in the affected implementation family.
- Existing APFC action approval and sandbox contracts remain authoritative.

## Deliberate non-goals

This migration does not redesign MD-OS identity, ontology, Causal Unity, affect,
KB contents, connector authority, or repository knowledge layouts. It does not
normalize Markdown, JSON, SQLite, or APFCG knowledge stores. It adds no
per-turn classifier, reflection call, summarizer, critic call, network
retrieval service, background loop, or autonomous continuous execution.

## Rollback

Apply the inverse of the reviewed Git diff rooted at the recorded base HEAD,
restart the Cortex process, and rerun the same conformance tests. Do not delete
or rewrite `conversation.ndjson`. The derived SQLite index is disposable; after
code rollback its source fingerprint and implementation revision determine
whether it is rebuilt. If rollback restores the old prompt compiler, explicitly
warn operators that stacked budgets and automatic retrieval are active again.
