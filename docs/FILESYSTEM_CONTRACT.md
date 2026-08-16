# Filesystem Contract

This contract defines how MD-OS (Artificial Prefrontal Cortex) v5.0 separates source, generated,
runtime, demo, host-local, live, and archive files.

The active 5.0 operational boundary is `md-os/`. There is no `mcp/`
filesystem alias in the complete migration state. MCP names only the external
Model Context Protocol adapter. See
`md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md` before changing boundary paths.

The rule is simple: a file must have an operating role before a host or builder
treats it as truth. If the role is unclear, the runtime becomes harder to
audit, replay, package, and move between machines.

## Contract Table

| Path | Type | Source of truth? | Versionable? | Rebuildable? | Publishable? | Local? |
| --- | --- | --- | --- | --- | --- | --- |
| `AGENTS.md` | source | yes | yes | no | yes | no |
| `ME.md` | source | yes | yes | no | yes | no |
| `README.md` | source | yes | yes | no | yes | no |
| `AUTHORS.md` | source authorship policy | yes | yes | no | yes | no |
| `CITATION.cff` | source citation metadata | yes | yes | no | yes | no |
| `CONTRIBUTING.md` | source | yes | yes | no | yes | no |
| `DeveloperCertificateOfOrigin.txt` | source contribution attestation | yes | yes | no | yes | no |
| `GOVERNANCE.md` | source governance policy | yes | yes | no | yes | no |
| `LICENSE` | source | yes | yes | no | yes | no |
| `TRADEMARKS.md` | source project-name policy | yes | yes | no | yes | no |
| `docs/**/*.md` | source documentation | yes | yes | no | yes | no |
| `docs/**/*.svg` | source asset | yes | yes | no | yes | no |
| `docs/**/*.png` | source asset | yes | yes | no | yes | no |
| `docs/papers/*.tex` | source publication | yes | yes | no | yes | no |
| `docs/papers/*.pdf` | generated publication | no | release-dependent | yes | release-dependent | no |
| `md-os/kb/**/*.md` | source knowledge | yes | yes | no | yes | no |
| `md-os/kb/imports/*/{README,SOURCE_MANIFEST,KNOWLEDGE_NODES,RELATIONS,IDENTITY_FRAME,OPERATING_BINDING}.md` | canonical imported knowledge source | yes | yes | no | yes | no |
| `md-os/kb/imports/*/canonical_import.json` | canonical imported knowledge source metadata | yes | yes | no | yes | no |
| `md-os/schemas/*.schema.json` | source schema | yes | yes | no | yes | no |
| `md-os/os/**` | source runtime code | yes | yes | no | yes | no |
| `md-os/examples/**` | demo source | yes | yes | no | yes | no |
| `md-os/ops/projects/*/project.json` | live/source project definition | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/programs/*.md` | live/source natural-language program | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/calculations/wolfram/*.json` | live/source calculation profile | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/calculations/wolfram/scripts/*.wl` | live/source calculation script | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/imports/knowledge/*/manifest.json` | live/source import manifest | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/imports/knowledge/*/raw/**` | live/source imported material | evidence | case-dependent | no | usually no | maybe |
| `md-os/ops/imports/knowledge/*/extracted/**` | generated import extraction | evidence | no | yes | usually no | maybe |
| `md-os/ops/imports/knowledge/*/{inventory,classification,relations,identity_patch,promotion_plan,questions,readback}.{json,md}` | generated import readback | evidence | no | yes | usually no | maybe |
| `md-os/ops/roles/*/ROLE.md` | live/source role definition | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/roles/*/intake/raw/**` | live/source role intake | yes | case-dependent | no | usually no | maybe |
| `md-os/ops/sources/**` | live/source observations | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/connectors/connector_registry.json` | live/source connector registry | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/connectors/*.json` | live/source connector profile | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/policies/*.json` | live/source policy | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/evals/**` | live/source eval scenario | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/actions/**` | live/source action record | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/processes/**` | live/source process record | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/releases/self/proposals/*.json` | live/source self-release proposal | yes | case-dependent | no | case-dependent | no |
| `md-os/ops/episodes/*.{json,md}` | live learning episode memory | evidence | case-dependent | no | no | maybe |
| `md-os/ops/tasks/*.json` | live cognitive TaskSpec | evidence | case-dependent | no | no | maybe |
| `md-os/ops/action_receipts/*.json` | live transactional action receipt | evidence | case-dependent | no | no | maybe |
| `md-os/ops/verifications/*.json` | live independent VerificationResult | evidence | case-dependent | no | no | maybe |
| `md-os/ops/trajectories/*.json` | live learning trajectory | evidence | case-dependent | no | no | maybe |
| `md-os/ops/skills/candidates/*.{json,md}` | live skill candidate | evidence | case-dependent | no | no | maybe |
| `md-os/ops/skills/promoted/*.{json,md}` | live/source promoted skill | yes | case-dependent | no | no | maybe |
| `md-os/ops/compiled/**` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/status.*` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/agenda.*` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/relations.*` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/priority_queue.*` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/active_memory.*` | generated state | no | no | yes | no | no |
| `md-os/ops/projects/*/work_items.ndjson` | generated state | no | no | yes | no | no |
| `md-os/ops/agenda/**` | generated state | no | no | yes | no | no |
| `md-os/ops/core/agentic_core.*` | generated hot core | no | no | yes | no | no |
| `md-os/ops/global_index.*` | generated state | no | no | yes | no | no |
| `md-os/ops/workspace_inventory.*` | generated state | no | no | yes | no | no |
| `md-os/ops/markdown_graph.*` | generated state | no | no | yes | no | no |
| `md-os/ops/semantic_knowledge_graph.*` | generated semantic-epistemic graph | no | no | yes | no | no |
| `md-os/ops/semantic_knowledge_summary.*` | generated compact semantic-epistemic readback | no | no | yes | no | no |
| `md-os/ops/semantic/commitment_gate_status.*` | generated semantic-invariant and canonical-promotion readback | no | no | yes | no | no |
| `md-os/ops/semantic/commitment_decisions/*` | live semantic proposal decisions | evidence | case-dependent | no | no | maybe |
| `md-os/ops/releases/self_release_index.*` | generated self-release readback | no | no | yes | no | no |
| `md-os/ops/agi/{loop_status,promotion_gate}.*` | generated verified learning-loop readback | no | no | yes | no | no |
| `md-os/ops/agi/neuromorphic_learning_status.*` | generated aggregate learning-experiment readback | no | no | yes | no | no |
| `md-os/ops/agi/generality_experiments/**` | append-only live generality-evaluation evidence | no | no | no | no | yes |
| `md-os/ops/agi/learning_experiments/**` | append-only live learning-experiment evidence | no | no | no | no | yes |
| `md-os/ops/agi/capability_experiments/**` | append-only live multi-domain capability and ablation evidence | no | no | no | no | yes |
| `md-os/ops/skills/skill_registry.*` | generated skill registry readback | no | no | yes | no | no |
| `md-os/ops/evals/agi_eval_report.*` | generated AGI eval readback | no | no | yes | no | no |
| `md-os/ops/failures/failure_index.*` | generated failure analysis index | no | no | yes | no | no |
| `md-os/ops/world/world_model.*` | generated operational world model | no | no | yes | no | no |
| `md-os/ops/benchmarks/agi_benchmarks.*` | generated benchmark readback | no | no | yes | no | no |
| `md-os/benchmarks/software_repair/**` | benchmark cases, controlled fixtures, provider descriptors/programs, candidate fixtures, and independent oracles | yes | yes | no | no | no |
| `md-os/ops/benchmarks/software_repair/runs/**` | append-only live benchmark and provider-evidence snapshots | no | no | no | no | yes |
| `md-os/ops/benchmarks/software_repair/candidate_sets/**` | append-only CandidateProvider requests, results, receipts, PlanGraphs, patches, and CandidateSets | no | no | no | no | yes |
| `md-os/ops/benchmarks/software_repair/index.*` | generated aggregate benchmark readback | no | no | yes | no | no |
| `md-os/ops/runtime/**` | generated semantic-operational compiler readback | no | no | yes | no | no |
| `md-os/ops/runtime/operating_cycle_report.*` | generated operating-cycle readback | no | no | yes | no | no |
| `md-os/ops/runtime_lifecycle_index.*` | generated state | no | no | yes | no | no |
| `md-os/ops/system_hygiene_status.*` | generated state | no | no | yes | no | no |
| `md-os/ops/health.*` | generated diagnostic | no | no | yes | no | no |
| `md-os/ops/replay_report.*` | generated replay evidence | no | no | yes | no | no |
| `graphify-out/**` | generated graph visualization and orientation readback; excluded from the canonical source graphs | no | no | yes | no | no |
| `graphify-out/cache/**` | host-local Graphify parse and file-stat cache | no | no | no | no | yes |
| `md-os/ops/continuity.md` | local runtime state | no | no | no | no | yes |
| `md-os/ops/state.json` | local runtime state | no | no | no | no | yes |
| `md-os/ops/current_task.md` | local runtime state | no | no | no | no | yes |
| `md-os/ops/last_summary.md` | local runtime state | no | no | no | no | yes |
| `md-os/ops/journal.ndjson` | live audit ledger | yes | case-dependent | no | usually no | maybe |
| `md-os/ops/changes/**` | live change proposal state | yes | case-dependent | no | case-dependent | maybe |
| `md-os/ops/artifacts/**` | live connector artifact | evidence | no | no | usually no | maybe |
| `md-os/ops/local/wolfram/*.wl` | host-local Wolfram calculation source | evidence | no | no | usually no | yes |
| `md-os/ops/archive/**` | generated archive view | no | no | yes | no | no |
| `md-os/ops/summary/**` | generated summary view | no | no | yes | no | no |
| `md-os/ops/warm_start/**` | live volatile working-context capsule | evidence | case-dependent | no | no | maybe |
| `md-os/ops/local/**` | host-local cache | no | no | no | no | yes |
| `md-os/ops/services/**` | host-local service state | no | no | no | no | yes |
| `.graphifyignore` | source graph traversal policy | yes | yes | no | yes | no |
| `.mdosignore` | source hygiene policy | yes | yes | no | yes | no |
| `.obsidian/**` | local/editor metadata | no | no | no | no | yes |
| `.cache/**` | local cache | no | no | no | no | yes |
| `.venv*/**` | local dependency env | no | no | no | no | yes |
| `node_modules/**` | local dependency env | no | no | yes | no | yes |

## Invariants

- Source files define durable operating knowledge, schemas, builders, examples,
  and canonical live inputs.
- Generated files must have a deterministic builder and must be safe to rewrite
  by that builder.
- Runtime files describe the current local operating session and should be
  reviewed before publication.
- Demo files demonstrate the model and must not be confused with live state.
- Host-local files may contain absolute paths, device names, service names, or
  application inventory from the current machine.
- Archive and summary files are materialized views. They reduce active read
  load without deleting canonical source or journal state.
- Publishable state should use repository-relative paths. Absolute workspace
  paths belong only in host-local cache, external host configuration, or
  transient command output.

## Builder Ownership

| Builder | Owns |
| --- | --- |
| `node md-os/os/initialize_ops_memory.js` | canonical runtime directories and seed local files |
| `node md-os/os/initialize_demo_ops.js` | demo seed copy into missing live files |
| `node md-os/os/compile_programs.js` | `md-os/ops/compiled/programs.*` |
| `node md-os/os/build_project_state.js <project_id>` | generated project state under `md-os/ops/projects/<project_id>/` |
| `node md-os/os/build_global_agenda.js` | `md-os/ops/agenda/global_agenda.*` |
| `node md-os/os/archive_runtime_state.js` | `md-os/ops/archive/**` and `md-os/ops/summary/**` |
| `node md-os/os/build_agentic_core.js` | `md-os/ops/core/agentic_core.*` |
| `node md-os/os/build_workspace_inventory.js` | `md-os/ops/workspace_inventory.*` |
| `node md-os/os/build_markdown_graph.js` | `md-os/ops/markdown_graph.*` |
| `mdos graphify build <target_dir>` | `graphify-out/{graph.json,graph.html,GRAPH_REPORT.md,MD_OS_SYSTEM_MAP.md}` |
| `mdos graphify neural-map` | `graphify-out/{neural_node_map.json,neural_node_map.html,neural_node_map.md}` |
| `mdos graphify connector-map` | `graphify-out/{connector_topology.json,connector_topology.html,connector_topology.md}` |
| `mdos graphify orient <question>` | `graphify-out/{orientation.json,orientation.md}` |
| `node md-os/os/build_semantic_knowledge_graph.js` | `md-os/ops/semantic_knowledge_graph.*` and `md-os/ops/semantic_knowledge_summary.*` |
| `node md-os/os/build_semantic_commitment_gate.js status` | `md-os/ops/semantic/commitment_gate_status.*` |
| `node md-os/os/agi_loop.js eval` | `md-os/ops/agi/{loop_status,promotion_gate}.*`, `md-os/ops/skills/skill_registry.*`, `md-os/ops/evals/agi_eval_report.*`, `md-os/ops/failures/failure_index.*`, `md-os/ops/world/world_model.*`, and `md-os/ops/benchmarks/agi_benchmarks.*` |
| `mdos cognition run-once --task-spec md-os/ops/tasks/<id>.json` (`mdos agi` compatibility alias) | live TaskSpecs, ActionReceipts, VerificationResults, episodes, trajectories, verified skill candidates, opt-in promoted skills when all gates pass, eval readback, and runtime compiler rebuild |
| `mdos benchmark software-repair generate --case <case.json> --provider <provider.json>` | append-only CandidateProvider request, result, receipt, PlanGraphs, patch snapshots, CandidateSet, and journal readback |
| `mdos benchmark software-repair run --case <case.json> --provider <provider.json>` | append-only provider evidence, BenchmarkRun, CandidateComparison, candidate diffs, and journal readback |
| `node md-os/os/build_software_repair_benchmark_index.js` | `md-os/ops/benchmarks/software_repair/index.{json,md}` |
| `node md-os/os/build_runtime_compiler.js` | semantic, claim, capability, link, context-pack, eval, and epistemic health readback under `md-os/ops/runtime/` |
| `node md-os/os/build_conceptual_boot_summary.js` | `md-os/ops/summary/conceptual_boot_summary.*` |
| `node md-os/os/operating_cycle.js run-once` | `md-os/ops/runtime/operating_cycle_report.*` and the generated outputs rebuilt by its builder phases |
| `node md-os/os/build_knowledge_import.js <import_id> <source_dir> [--initial-repository]` | `md-os/ops/imports/knowledge/<import_id>/{inventory,classification,relations,identity_patch,promotion_plan,questions,readback}.*`, `md-os/ops/imports/knowledge/<import_id>/extracted/**`, and `md-os/kb/imports/<import_id>/**`; initial mode may also write allowed canonical source paths |
| `node md-os/os/build_self_release_index.js` | `md-os/ops/releases/self_release_index.*` |
| `node md-os/os/build_runtime_lifecycle_index.js` | `md-os/ops/runtime_lifecycle_index.*` |
| `node md-os/os/build_global_index.js` | `md-os/ops/global_index.*` |
| `node md-os/os/build_system_hygiene_status.js` | `md-os/ops/system_hygiene_status.*` |
| `node md-os/os/build_health_dashboard.js` | `md-os/ops/health.*` |
| `mdos replay` | replay report and rebuilt generated state |
| `mdos hardware bootstrap` | `md-os/ops/local/hardware/**` |
| `mdos software bootstrap` | `md-os/ops/local/software/**` |
| `mdos wolfram bootstrap` | Wolfram connector profile, calculation registry entries, availability snapshot, connector registry update, and smoke-test artifact |
| `mdos wolfram run <project_id> <calculation_id>` | `md-os/ops/artifacts/wolfram/**`, `md-os/ops/sources/connectors/*__wolfram__*.json`, and journal events |

## Publication Rule

Before packaging or publishing a workspace:

```bash
mdos hardware clean
mdos software clean
npm run clean:release
npm run verify:release
npm run package:demo
```

The package should not contain host-local cache, stale generated artifacts that
claim source authority, secrets, credentials, undeclared unsafe development
launchers, or ambiguous files without a lifecycle class. Declared elevated
host launchers, such as the Codex bootstrap launcher, may remain in the
primary surface when they are documented, explicit about their permission mode,
and visible in hygiene output.
