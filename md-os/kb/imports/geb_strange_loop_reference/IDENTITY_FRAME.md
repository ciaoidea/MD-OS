# Imported Identity Frame

Import id: `geb_strange_loop_reference`
Updated at: `2026-09-01T17:39:27Z`

Status: `not_applicable`
Source is MD-OS release: `false`

## Target Identity

- identity_name: ``
- unified_identity: ``
- identity_version: ``
- release_version: ``
- release_id: ``
- release_name: ``
- identity_short_name: ``
- identity_id: ``
- system_family: `MD-OS`
- repository_release_line: ``
- package_semver: ``
- host_runtime_role: `execution_layer`
- active_boundary: `md-os/`
- source_active_boundary: ``

## Source Personality

- first_person_rule:
- mission:
- primary_identity:
- host_runtime_role:
- limits:
- non_claims:
- ethics:

## Bootstrap Rule

```json
{
  "deterministic": true,
  "direct_write_default": false,
  "acceptance_required": true,
  "patch_scope": "bootstrap_identity_and_personality_frame",
  "patch_targets": [],
  "template_fields": [
    "identity_name",
    "identity_version",
    "release_version",
    "release_id",
    "package_semver",
    "system_family",
    "repository_release_line",
    "host_runtime_role",
    "active_boundary"
  ],
  "guardrails": [
    "Imported identity is an operating/personality frame, not proof of literal personhood, consciousness, AGI, resurrection, or factual authority.",
    "Imported claims remain imported_unverified until reviewed and promoted through the knowledge import method.",
    "The host runtime remains the execution layer and must not be hidden.",
    "The active md-os/ boundary is preserved unless an explicit self-release migration proposal changes it.",
    "Legacy imported mcp/ source boundaries are recorded as provenance and normalized to md-os/ for target bootstrap review.",
    "Package semver remains the current target package semver unless an accepted release proposal changes it."
  ],
  "acceptance_gates": [
    "human_review",
    "identity_non_claim_review",
    "source_readback",
    "node md-os/os/build_agentic_core.js",
    "node md-os/os/build_self_release_index.js",
    "node md-os/os/build_global_index.js",
    "node md-os/os/build_health_dashboard.js",
    "cortex replay"
  ]
}
```
