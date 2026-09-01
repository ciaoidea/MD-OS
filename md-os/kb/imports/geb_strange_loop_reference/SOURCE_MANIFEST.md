# Import Source Manifest

Import id: `geb_strange_loop_reference`
Created at: `2026-09-01T17:39:27Z`
Source: `md-os/ops/sources/geb_strange_loop_reference`

## Manifest

```json
{
  "schema_version": 1,
  "import_id": "geb_strange_loop_reference",
  "created_at": "2026-09-01T17:39:27Z",
  "import_mode": "structured_import",
  "source_kind": "repository",
  "source_location": "md-os/ops/sources/geb_strange_loop_reference",
  "source_access": "read_only_reference",
  "permission_status": "user_provided",
  "scope": "general knowledge import",
  "non_goals": [
    "No unstructured raw dump into canonical knowledge.",
    "No destructive source mutation.",
    "No generated runtime state promotion."
  ],
  "allowed_targets": [
    "AGENTS.md",
    "ME.md",
    "bootstrap-md-os-codex.sh",
    "md-os/kb/",
    "md-os/ops/imports/knowledge/<import_id>/raw/",
    "md-os/ops/programs/",
    "md-os/ops/releases/self/proposals/",
    "docs/"
  ],
  "forbidden_targets": [
    "generated runtime state",
    "external source directory mutation"
  ],
  "epistemic_default": "imported_unverified",
  "promotion_requires": [
    "human_review",
    "source_readback",
    "dedupe",
    "semantic_epistemic_profile",
    "rebuild"
  ],
  "identity_patch_status": "not_applicable",
  "canonical_import_target": "md-os/kb/imports/geb_strange_loop_reference/",
  "initial_repository": false,
  "raw_copy": {
    "enabled": false,
    "managed": true,
    "target_path": "md-os/ops/imports/knowledge/geb_strange_loop_reference/raw/source",
    "file_count": 0,
    "total_size_bytes": 0,
    "extensions": [],
    "suffixes": [],
    "include_artifact_packages": false,
    "files": []
  }
}
```

## Files

- `REFERENCE.md` | sha256 `b4918cccd8e27a55395829b77db26e464136988a8f85a6f59fd9284fd424f431` | `.md` | `1854` bytes
