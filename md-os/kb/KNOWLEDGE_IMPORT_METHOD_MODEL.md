# Knowledge Import Method Model

MD-OS (Artificial Prefrontal Cortex) v5.0 must be able to import knowledge without confusing imported
material with canonical operating truth.

Knowledge import is the standard path for bringing external notes, papers,
repositories, exports, role material, documentation, and prior work into MD-OS
for review, extraction, classification, and possible promotion.

## Core Rule

Imported material is not trusted operating truth on arrival, but the import
must still enter the repository's own knowledge tree in a structured form. It
must not remain only as an opaque sidecar under runtime state.

The import path is:

```text
raw import
-> custody manifest
-> extraction
-> lifecycle classification
-> epistemic classification
-> deduplication and relation mapping
-> canonical imported-knowledge tree write
-> promotion or initial-repository assimilation decision
-> accepted bootstrap/source write when applicable
-> rebuild and readback
```

The standard structured import writes imported knowledge under:

```text
md-os/kb/imports/<import_id>/
```

That tree is canonical repository knowledge by location and indexing, but its
epistemic status remains imported/structured until reviewed. Do not flatten
external claims into existing stable models as trusted truth unless the import
has passed the relevant gates.

## Standard Directory Layout

Use this layout for general knowledge imports:

```text
md-os/ops/imports/knowledge/<import_id>/manifest.json
md-os/ops/imports/knowledge/<import_id>/raw/
md-os/ops/imports/knowledge/<import_id>/extracted/
md-os/ops/imports/knowledge/<import_id>/inventory.md
md-os/ops/imports/knowledge/<import_id>/classification.md
md-os/ops/imports/knowledge/<import_id>/relations.md
md-os/ops/imports/knowledge/<import_id>/identity_patch.md
md-os/ops/imports/knowledge/<import_id>/promotion_plan.md
md-os/ops/imports/knowledge/<import_id>/questions.md
md-os/ops/imports/knowledge/<import_id>/readback.md
```

And this canonical source-knowledge tree:

```text
md-os/kb/imports/<import_id>/README.md
md-os/kb/imports/<import_id>/SOURCE_MANIFEST.md
md-os/kb/imports/<import_id>/KNOWLEDGE_NODES.md
md-os/kb/imports/<import_id>/RELATIONS.md
md-os/kb/imports/<import_id>/IDENTITY_FRAME.md
md-os/kb/imports/<import_id>/OPERATING_BINDING.md
md-os/kb/imports/<import_id>/canonical_import.json
```

The `ops/imports` directory is custody, audit, extraction, generated readback,
and replay evidence. The `kb/imports` directory is the repository-resident
structured knowledge tree that ordinary Markdown and semantic graph builders
must see.

## Single Import Entrypoint

The standard operational entrypoint is one builder:

```bash
mdos knowledge import <import_id> <source_dir>
node md-os/os/build_knowledge_import.js <import_id> <source_dir>
```

The builder scans the source directory in read-only mode, writes the standard
runtime audit structure, writes the canonical imported-knowledge tree under
`md-os/kb/imports/<import_id>/`, and produces compact readback. It does not
mutate the source directory.

When source material must survive archival of the external source directory,
use an explicit raw-copy profile or explicit raw-copy selectors:

```bash
mdos knowledge import <import_id> <source_dir> --copy-theory-sources
node md-os/os/build_knowledge_import.js <import_id> <source_dir> --copy-theory-sources

mdos knowledge import <import_id> <source_dir> --copy-raw-ext=.tex,.svg --copy-raw-suffix=.schema.json
node md-os/os/build_knowledge_import.js <import_id> <source_dir> --copy-raw-ext=.tex,.svg --copy-raw-suffix=.schema.json
```

The theory-source profile preserves paper/theory source packages uniformly
across differently shaped intakes: TeX, LaTeX support files, DOT/SVG audit
maps, PDF, figure assets, ZIP packages, and schema JSON files.
For publication package evidence, the profile also raw-copies matching files
from `md-os/ops/artifacts/packages/` without indexing those generated artifact
directories as promoted operating state. The legacy `mcp/` filesystem boundary
is not a live alias in the complete migration state.

Raw-copy selectors materialize matching source files under:

```text
md-os/ops/imports/knowledge/<import_id>/raw/source/
```

Raw copies are preserved evidence, not promoted operating truth. They remain
bounded source material with manifest hashes, and the canonical knowledge view
still carries only structured profiles, bounded text extraction, and promotion
readback.

If the source directory is itself an MD-OS release, the same builder must also
extract the source identity/personality frame into a deterministic import
artifact:

```text
md-os/ops/imports/knowledge/<import_id>/identity_patch.json
md-os/ops/imports/knowledge/<import_id>/identity_patch.md
```

The identity patch is generated from canonical source/readback files such as
`ME.md`, `AGENTS.md`, `md-os/kb/COGNITIVE_BOOTSTRAP.md`,
`md-os/kb/AGENTIC_OPERATIONAL_RELEASE_MODEL.md`,
`md-os/ops/core/agentic_core.json`, and
`md-os/ops/releases/self_release_index.json`. It is a structured proposal for
patching this repository's bootstrap identity frame. It must be deterministic,
source-hashed, and reviewable.

For ordinary imports it does not silently rewrite `AGENTS.md`, `ME.md`,
launcher prompts, or stable KB files. For an explicit initial-repository import,
the same deterministic patch becomes the intended bootstrap write.

The identity patch target can be any imported MD-OS identity/personality frame.
Do not hard-code a named persona. Historical, fictional, organizational, role,
or project identities remain operating/personality frames unless separately
validated. Importing such a frame is not a claim of literal personhood,
consciousness, AGI, resurrection, or factual authority.

The default import mode is efficient:

```text
inventory every allowed file up to the configured cap
hash source files by chunk
extract bounded text prefixes, headings, terms, and metadata
classify every imported file semantically and epistemically
build capped concept relations
write compact readback for ordinary review
write canonical imported-knowledge nodes under md-os/kb/imports/<import_id>/
```

Environment caps may tune large imports:

```text
MDOS_KNOWLEDGE_IMPORT_MAX_FILES
MDOS_KNOWLEDGE_IMPORT_MAX_TEXT_BYTES
MDOS_KNOWLEDGE_IMPORT_MAX_RELATIONS
MDOS_KNOWLEDGE_IMPORT_MAX_EXTRACTED_FILES
```

## Initial Repository Mode

An initial MD-OS repository may be deliberately initialized from another MD-OS
release:

```bash
mdos knowledge import <import_id> <source_dir> --initial-repository
node md-os/os/build_knowledge_import.js <import_id> <source_dir> --initial-repository
```

This mode is for a virgin or deliberately reset target repository. It is not
the normal review-only intake path.

If the source is detected as an MD-OS release, initial-repository mode:

```text
writes the canonical import tree under md-os/kb/imports/<import_id>/
copies allowed source knowledge into the current md-os/kb/ tree
copies the source-like operational application layer into md-os/ops/
patches AGENTS.md, ME.md, README.md, COGNITIVE_BOOTSTRAP.md, release/core
identity models, and launcher bootstrap text from the imported identity frame
keeps generated runtime state excluded
keeps the source directory read-only
requires rebuild/readback after the write
```

Allowed initial path-preserving targets are source-like MD-OS artifacts:

```text
md-os/kb/**/*.md
md-os/schemas/*.json
md-os/examples/**/*.{md,json,ndjson,txt,yaml,yml,toml,csv}
docs/**/*.{md,svg,png,tex}
md-os/ops/programs/*.md
md-os/ops/projects/*/project.json
md-os/ops/connectors/*.json
md-os/ops/policies/*.json
md-os/ops/calculations/**/*.{json,md,ndjson,txt,yaml,yml,toml,csv}
md-os/ops/roles/**/*.{md,json,ndjson,txt,yaml,yml,toml,csv}
md-os/ops/sources/**/*.{md,json,ndjson,txt,yaml,yml,toml,csv}
md-os/ops/evals/**/*.{md,json,ndjson,txt}
md-os/ops/actions/**/*.{md,json,ndjson,txt,yaml,yml,toml,csv}
md-os/ops/processes/**/*.{md,json,ndjson,txt,yaml,yml,toml,csv}
md-os/ops/releases/self/proposals/*.json
```

The operational application layer is the source-like `ops` surface that makes a
persona/repository operational, not only descriptive:

```text
natural-language programs
project definitions
connector registry and connector profiles
permission and operating policies
calculation profiles and bounded calculation scripts
role definitions and raw role intake
manual or connector source observations
eval scenarios
action and process source records
self-release proposals
```

Forbidden initial targets remain generated runtime state, host-local cache,
locks, services, artifacts, dependency directories, external source mutation,
and runtime code replacement unless a separate self-release migration
explicitly authorizes it.

## Import Manifest

Each import must declare:

```json
{
  "schema_version": 1,
  "import_id": "example_import",
  "created_at": "ISO-8601 timestamp",
  "source_kind": "repository|document|paper|notes|export|role_material|other",
  "source_location": "human-readable locator, not necessarily a URL",
  "source_access": "read_only|copied_by_user|connector_snapshot|generated_extract",
  "permission_status": "authorized|user_provided|public|unknown|restricted",
  "scope": "what is being imported",
  "non_goals": ["what must not be imported"],
  "allowed_targets": ["md-os/kb/", "md-os/ops/programs/", "docs/"],
  "forbidden_targets": ["paths or domains not allowed"],
  "epistemic_default": "heuristic|conditional|open",
  "promotion_requires": ["human_review", "source_readback", "dedupe", "rebuild"]
}
```

If permission status is `unknown` or `restricted`, the import may be inventoried
but not promoted.

## Import Stages

### 1. Intent And Scope

Freeze:

```text
why the import exists
which source is being imported
which parts are in scope
which parts are explicitly excluded
who authorized the import
where promoted material may land
```

### 2. Raw Capture

Preserve source material without rewriting it.

Allowed:

```text
copy user-provided files
record connector snapshots
record manual source notes
record checksums and paths
```

Forbidden:

```text
silently summarize into canonical KB
overwrite existing canonical files
import secrets or credentials
cross a read-only boundary
```

### 3. Extraction

Convert material into readable text only through bounded tools or explicit
manual extraction.

Record:

```text
tool or connector used
input file
output file
known extraction loss
hash or timestamp
```

If extraction is partial, mark the evidence as partial.

### 4. Lifecycle Classification

Classify files using:

```text
docs/FILESYSTEM_CONTRACT.md
md-os/kb/RUNTIME_STATE_LIFECYCLE_MODEL.md
```

Imported raw files are live source material. Generated inventories and
extractions are rebuildable or review artifacts. Promoted knowledge becomes
source only after explicit acceptance.

### 5. Epistemic Classification

Classify claims using:

```text
md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md
md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md
```

External claims should default to:

```text
heuristic
conditional
open
```

They may be promoted only with evidence, assumptions, scope, failure rules, and
readback.

### 6. Deduplication And Relations

Before promotion, compare imported material with existing MD-OS knowledge:

```text
same concept
conflicting claim
superseded rule
duplicate wording
missing relation
new dependency
new connector candidate
new natural-language program candidate
```

Conflicts should become change proposals, not silent overwrites.

### 7. Promotion Plan

A promotion plan must state:

```text
target file
imported source evidence
claim status
reason for promotion
expected edit
risks
rollback or correction note
required rebuilds
```

Allowed promotion targets:

```text
md-os/kb/                       stable operating knowledge
md-os/ops/programs/             natural-language programs
md-os/ops/connectors/           connector registry or profiles
md-os/ops/projects/             live project definitions when appropriate
md-os/ops/evals/                eval scenarios
docs/                         formal publishable docs
```

Do not promote directly into generated state.

### 8. Acceptance And Write

Accepted promotions are written through ordinary MD-OS edit discipline:

```text
source edit or append-only proposal
readback
rebuild
health check
final report
```

Contested imports use:

```text
mdos propose-change <target_path> <summary>
```

### 9. Rebuild And Readback

After promotion, run the relevant builders:

```text
node md-os/os/build_agentic_core.js      if identity/core/operating stance changed
node md-os/os/compile_programs.js        if natural-language programs changed
node md-os/os/build_markdown_graph.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_system_hygiene_status.js
node md-os/os/build_health_dashboard.js
node md-os/os/build_global_index.js
```

Report from rebuilt files, not from the import session alone.

## Import Status Values

Use these status values:

```text
captured
inventoried
extracted
classified
promotion_planned
promotion_proposed
promoted
rejected
archived
blocked_permission
blocked_extraction
blocked_conflict
```

## Relation To Boundary Policy

The complete 5.0 boundary policy uses `md-os/` as the only filesystem
operating boundary. Knowledge import paths must not depend on a filesystem
alias. The rule remains:

```text
imported material enters live import state before it becomes canonical knowledge
```
