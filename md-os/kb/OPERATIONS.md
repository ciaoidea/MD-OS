# Operations

Healthy-system bootstrap order:
1. read `ME.md`
2. read `md-os/kb/COGNITIVE_BOOTSTRAP.md`
3. read `md-os/kb/README.md`
4. read `md-os/kb/OPERATIONS.md`
5. read `md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md`
6. read `md-os/ops/core/agentic_core.md`
7. read `md-os/ops/summary/conceptual_boot_summary.md`
8. read `md-os/kb/RUNTIME_DISCIPLINE_MODEL.md`
9. read `md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md`
10. read `md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md`
11. read `md-os/ops/global_index.md`
12. read `md-os/ops/semantic_knowledge_summary.md`
13. read `md-os/ops/releases/self_release_index.md`
14. read `md-os/ops/health_classification.md`
15. read `md-os/ops/agi/loop_status.md`
16. read `md-os/ops/skills/skill_registry.md`
17. read `md-os/ops/summary/active_work_items.md`
18. read `md-os/ops/continuity.md`
19. read `md-os/ops/state.json`
20. read `md-os/ops/last_summary.md`

Canonical builders:
- `node md-os/os/initialize_ops_memory.js`
- `node md-os/os/initialize_demo_ops.js`
- `node md-os/os/compile_programs.js`
- `node md-os/os/archive_runtime_state.js`
- `cortex replay`
- `cortex workspace patch <patch_file|-> [--dry-run]`
- `node md-os/os/build_project_state.js <project_id>`
- `node md-os/os/build_global_agenda.js`
- `node md-os/os/build_agentic_core.js`
- `node md-os/os/build_global_index.js`
- `node md-os/os/build_workspace_inventory.js`
- `node md-os/os/build_markdown_graph.js`
- `node md-os/os/build_semantic_knowledge_graph.js`
- `node md-os/os/build_semantic_commitment_gate.js status`
- `cortex semantic gate <proposal.json>`
- `node md-os/os/build_conceptual_boot_summary.js`
- `node md-os/os/agi_loop.js eval`
- `cortex agi run-once --task "<task>"`
- `cortex cognition run-once --task-spec md-os/ops/tasks/<task_spec_id>.json`
- `cortex cognition unity-test`
- `node md-os/os/epistemic_unity_runtime.js seal < candidate.json`
- `node md-os/os/epistemic_unity_runtime.js verify < verification.json`
- `cortex benchmark software-repair generate --case <case.json> --provider <provider.json> --configuration <configuration_id>`
- `cortex benchmark software-repair run --case <case.json> --provider <provider.json> --configuration <configuration_id>`
- `node md-os/os/build_software_repair_benchmark_index.js`
- `cortex agi eval`
- `cortex agi learn`
- `cortex agi promote`
- `node md-os/os/build_runtime_compiler.js`
- `node md-os/os/build_knowledge_import.js <import_id> <source_dir> [--initial-repository]`
- `node md-os/os/build_self_release_index.js`
- `node md-os/os/build_runtime_lifecycle_index.js`
- `node md-os/os/build_system_hygiene_status.js`
- `node md-os/os/build_health_classifier.js`
- `node md-os/os/build_health_dashboard.js`
- `node md-os/os/operating_cycle.js <status|run-once>`
- `cortex cycle <status|run-once>`
- `cortex boot-summary`
- `cortex hardware bootstrap`
- `cortex hardware list`
- `cortex hardware run "<explicit user intent>"`
- `cortex hardware clean`
- `cortex software bootstrap`
- `cortex software list`
- `cortex software clean`
- `cortex wolfram bootstrap`
- `cortex wolfram list`
- `cortex wolfram run <project_id> <calculation_id>`
- `cortex live <status|start|stop|restart>`
- `cortex role intake <role_id>`
- `cortex role sensemake <role_id>`
- `./bootstrap-md-os-codex.sh` runs a quick read-only hardware and software
  scan at host startup unless `MDOS_SKIP_HARDWARE_BOOTSTRAP=1` or
  `MDOS_SKIP_SOFTWARE_BOOTSTRAP=1` is set

Ordinary operating rule:
- treat injected bootstrap prompts as setup, not as status requests; do not
  emit verbose startup readback or health caveats unless explicitly asked
- write stable knowledge into `md-os/kb/`
- write runtime state into `md-os/ops/`
- keep publishable and rebuildable operating state path-portable: prefer
  repository-relative paths such as `md-os/ops/...` and resolve the workspace root
  at runtime
- allow absolute host paths only in explicit host-local state such as
  `md-os/ops/local/**`, external host configuration, or transient command output;
  those files must stay cleanable and must not become canonical source
- use `docs/FILESYSTEM_CONTRACT.md` as the formal file-role table before adding
  new operational paths
- classify runtime files by lifecycle: source of truth, generated state, local
  runtime state, demo state, live agent state, or archived state
- maintain semantic-operational network coherence through
  `md-os/kb/SEMANTIC_OPERATIONAL_NETWORK_MODEL.md`: every nontrivial action
  should trace intent to semantic node, epistemic status when claims are
  involved, operating policy, allowed procedure, artifact or state transition,
  readback, and replayable memory
- maintain whole-network semantic knowledge coherence through
  `md-os/kb/SEMANTIC_KNOWLEDGE_GRAPH_MODEL.md`: every Markdown node should
  receive a semantic layer, cognitive role, epistemic status, actionability,
  concept terms, structural relation, and compact health readback; new concepts
  must be related automatically during rebuild
- maintain the possibility-versus-commitment boundary through
  `md-os/kb/SEMANTIC_COMMITMENT_GATE_MODEL.md`: exploration, criticism,
  hypotheses, and challenges remain admissible, while consolidation, canonical
  revision, foundational replacement, and publication require provenance,
  before/after semantic delta, invariant comparison, appropriate authority,
  and generated gate readback
- for high-stakes reasoning, scientific derivation, referee-facing documents,
  nontrivial code behavior, architecture decisions, identity changes, or
  connector permission changes, use
  `md-os/kb/MD_OS_PRO_REASONING_MODE.md`: root context, task frame, branch set,
  gates, external verification, correction ledger, persisted result, readback,
  and rebuild
- for any complex task that risks target proliferation, use
  `md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md`: define the master closure,
  dependency edges, forbidden shortcuts, verifier for each edge, stop/refactor
  condition, and final closure readback before counting progress
- for coding-host work driven by natural language, use
  `md-os/kb/CODEX_NATURAL_LANGUAGE_OPERATOR_MODEL.md`: turn prompt intent into
  bounded scope, durable artifacts, schemas/tests, command readback, replay,
  compiler rebuild, and concise final report
- for every natural-language turn, distinguish invariant orientation from
  task-specific sufficiency: load and hash the identity/bootstrap/core/current
  operating baseline plus the generated context-pack catalog; treat lexical
  source matches as advisory only; before a nontrivial claim or action, resolve
  the real dependency edges against canonical sources and current readback or
  report insufficient context
- read `md-os/ops/health_classification.md` before treating a global health
  `critical` as runtime failure; it separates runtime, compiler, AGI-loop,
  publication, security, and local-hygiene scopes without lowering severity
- for scientific writing, derivations, research packages, validation reports,
  or publication-facing work, use
  `md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md` as the methodological gate:
  freeze the central question, claim, assumptions, method, independent checks,
  uncertainty, falsification or demotion rule, reproducibility artifacts, and
  claim status before promoting the work
- for complex theory building, combine the scientific validation method with
  `md-os/kb/MASTER_CLOSURE_DISCIPLINE_MODEL.md`: define the central claim,
  dependency edges, known-limit checks, falsifier, and verifier for every edge
  before reporting closure progress
- keep the scientific validation method domain-neutral in root knowledge; do
  not import theory-specific content from external repositories, role
  workspaces, or private notes unless a separate task explicitly authorizes
  that import and classifies the material by lifecycle
- classify important research claims by epistemic lifecycle: heuristic,
  line-of-thought, frozen-principle, derived, conditional, retrodictive,
  predictive, corrected, open, or falsified
- treat `retrodiction != strict prediction` as a hard guardrail for theory
  building and scientific readback
- keep the compact agentic core rebuilt in `md-os/ops/core/agentic_core.md`
  before expanding large project histories
- keep the conceptual cold boot summary rebuilt in
  `md-os/ops/summary/conceptual_boot_summary.md` before relying on session
  memory for orientation; it is generated readback, not canonical identity or
  permission state
- use `md-os/kb/AGENTIC_OPERATIONAL_CONTROL_ARCHITECTURE.md` and
  `md-os/kb/AGENTIC_OPERATION_MODEL.md` for nontrivial action: intent,
  epistemic frame, semantic target, state, policy, capability, execution,
  verification, ledger, and replay
- use `md-os/kb/SYSTEM_OPERATING_CYCLE_MODEL.md` and `cortex cycle run-once` to
  rebuild the operating filesystem as one bounded pass; do not treat the cycle
  as an autonomous daemon
- use `md-os/kb/WARM_START_MODEL.md` only after stable boot and conceptual
  boot summary; warm-start capsules are volatile working context and cannot
  override canonical source or generated verifier readback
- register contested edits with `cortex propose-change <target_path> <summary>`
- keep low-level mutation in `md-os/os/`
- treat host-native editing primitives as optional; when one fails before
  touching the workspace, use the native `cortex workspace patch` fallback
  without modifying AppArmor, `/etc`, host permissions, or the network policy;
  the fallback accepts either Git unified diff or a `*** Begin Patch` envelope
- keep live connector coverage explicit in `md-os/ops/connectors/connector_registry.json`
- import external knowledge through
  `md-os/kb/KNOWLEDGE_IMPORT_METHOD_MODEL.md`: raw import, custody manifest,
  extraction, lifecycle classification, epistemic classification,
  deduplication, promotion plan, acceptance, rebuild, and readback; do not
  copy external claims directly into `md-os/kb/` on arrival
- keep host-specific hardware discovery state explicit and cleanable in
  `md-os/ops/local/hardware/`
- keep hardware input/output artifacts and control action logs in
  `md-os/ops/local/hardware/`
- keep host-specific application and service discovery state explicit and
  cleanable in `md-os/ops/local/software/`
- keep optional service state explicit in `md-os/ops/services/`
- use `md-os/ops/roles/<role_id>/intake/raw/` as the bounded calderone for
  messy role-specific operating material, then run
  `cortex role intake <role_id>` to produce rebuildable inventory, candidate
  operations, and expert questions
- after role intake, run `cortex role sensemake <role_id>` to reconstruct
  initial cases, relation graph, work patterns, root-cause candidates, and
  role-specific expert questions
- for new-hire assisted work, use Codex chat inside the MD-OS workspace as the
  interactive surface: answer from `ROLE.md`, `analysis/role_understanding.md`,
  reconstructed cases, work patterns, and generated expert questions
- connect only MCP resources and tools already authenticated and authorized for
  the assisted new hire; keep the new hire supervising the interaction and do
  not assume independent credentials or unsupervised authority
- when assisting a new hire, recommend only role-bounded next actions; flag
  hard boundaries, missing approval, uncertain evidence, and unanswered expert
  questions instead of inventing internal policy
- read `md-os/ops/summary/active_work_items.md` before expanding large project
  histories
- run `cortex graph build` after documentation or knowledge-base changes when
  Obsidian graph coherence matters
- use `cortex graphify orient "<question>"` as the default graph-aware context
  routing surface for nontrivial repository navigation, and run
  `cortex graphify build .` when the graph should evolve with current files,
  connectors, schemas, audit artifacts, and knowledge nodes
- run `cortex semantic graph build` after documentation or knowledge-base changes
  when semantic, epistemic, or cognitive node cohesion matters
- use `md-os/kb/COGNITIVE_TRANSACTION_LOOP_MODEL.md` for the executable truth
  loop: typed TaskSpec, bounded transaction, ActionReceipt, observed delta,
  independent postcondition verification, formal episode, and truthful verdict;
  `md-os/kb/VERIFIED_AGI_LOOP_MODEL.md` preserves the wider learning and
  compatibility model
- use `md-os/kb/CROSS_DOMAIN_COGNITIVE_UNITY_MODEL.md` when a claim depends on
  relations surviving a declared change of domain or frame: induce one unique
  candidate law from competing development hypotheses before sealed target
  evidence, declare the finite representation and transformation, verify
  invariants and semantic receipts independently, bind all underlying evidence
  by current file hash, and fail closed on ambiguity, contamination, post-hoc
  selection, sham observations, or undeclared information loss
- use `cortex cognition unity-test` only to verify the bounded synthetic
  mechanism; its embedded fixture is structurally testable but cannot establish
  production promotion, AGI, consciousness, or direct access to neural hidden
  activations
- use `md-os/kb/SOFTWARE_REPAIR_BENCHMARK_MODEL.md` for reproducible repair
  cases, fixed experimental configurations, independent oracles, diff policy,
  holdout contamination gates, and aggregate benchmark readback
- every natural-language App Server turn must prepare and close the bounded
  Turn Governance Tensor; the historical `operational_unity_tensor` field
  name is compatibility-only, its exact feature permutation proves bookkeeping
  integrity rather than semantic or world truth, raw private text must not enter
  it, and the artifact must declare that it is not world-grounded epistemic unity
- after changing `md-os/shell/bin/mdos-console`, exit the shared Cortex REPL and
  launch `./cortex` again; build and replay refresh generated state but cannot
  hot-reload the already running Python engine, and the next turn must expose
  the current frame schema plus context-sufficiency contract before the change
  is considered active
- require the Causal Unity Controller on every APFC action path: prepare the
  hash-bound 9 x 6 predecision state, consume its exact hash and decision basis
  at authorization, require matching preauthorization for every mutating
  action, close over output/action/evidence readback, and bind the transition
  hash into the next turn; the intact/severed dependency probe must fail closed
  and is controller-dependence evidence only
- for reflective learning or Unity Tensor claims, require a candidate sealed
  before observation, discriminating predictions, an independent verifier, and
  current hash-bound evidence; a raw `pass`, fluent explanation, valid
  governance tensor, or self-issued evidence label cannot create a verified
  anchor
- for a bounded empirical Unity result, additionally require at least three
  heterogeneous frames, connected cyclic transformations, preserved declared
  invariants, rejected simpler baseline, sham and severing controls,
  contamination audit, and independent replication
- treat runs whose `empirical_claim_scope` is `runner_validation_only` as tests
  of the benchmark mechanism, never as evidence of intelligence or cumulative
  learning
- never treat task presence, context availability, receipt existence, episode
  creation, or source-episode eval as proof that the task succeeded or that a
  skill improved future performance
- use `cortex cognition run-once --task-spec md-os/ops/tasks/<task_spec_id>.json`
  for a verifiable cognitive transaction; `cortex agi` remains a compatibility
  alias
- use `cortex agi run-once --task "<task>"` only as the compatibility form for
  one bounded learning cycle; without acceptance tests it must remain
  `unverified`; do
  not start a continuous autonomous loop from this command family
- run `cortex agi eval` after editing episodes, skills, evals, failures, world
  model inputs, or benchmark definitions so the AGI loop readback remains
  deterministic
- run `cortex compile-runtime` after semantic graph, import, connector, identity,
  permission, or operational-program changes so semantic nodes, claims,
  capabilities, links, context packs, evals, and epistemic health are compiled
  into `md-os/ops/runtime/`
- use `cortex knowledge import <import_id> <source_dir>` as the single standard
  intake path for external repositories, notes, papers, exports, or
  documentation directories; it inventories, hashes, extracts bounded text,
  classifies semantic and epistemic profiles, maps relations, writes canonical
  imported knowledge under `md-os/kb/imports/<import_id>/`, writes a promotion
  plan, and produces compact readback
- use `cortex knowledge import <import_id> <source_dir> --initial-repository`
  only when a virgin or deliberately reset repository should become the
  imported MD-OS release identity and assimilate its allowed knowledge plus
  operational application layer into the current repository tree: programs,
  project definitions, connectors, policies, calculations, roles, sources,
  evals, actions, processes, and self-release proposals
- run `cortex self release status` after version, identity, builder, gate, or
  compatibility changes so self-evolution remains explicit, reviewable,
  replayable, and bounded by `md-os/kb/SELF_RELEASE_EVOLUTION_MODEL.md`

Replay rule:
- `cortex replay` removes only known compiled outputs and rebuilds runtime state
  from `md-os/ops/projects/*/project.json`, `md-os/ops/sources/`, preserved journal
  state, natural-language programs, archive summaries, and deterministic
  builders.
