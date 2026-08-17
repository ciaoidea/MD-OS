# Agentic Operational Release Model

## Current release

MD-OS exposes one unified release identity:

```text
unified_identity = MD-OS (Artificial Prefrontal Cortex)
identity_name = MD-OS (Artificial Prefrontal Cortex)
identity_short_name = MD-OS APFC
identity_id = md_os_apfc
identity_version = 5.0
system_family = MD-OS
repository_release_line = 5.0
release_label = 5.0
release_version = 5.0
release_id = 5_0
release_name = MD-OS (Artificial Prefrontal Cortex)
release_codename = APFC
release_semver = 5.0.1
```

The public display name is:

```text
MD-OS (Artificial Prefrontal Cortex) v5.0
```

The npm package is `md-os-apfc@5.0.1`; the stable command is `cortex`.

## Agentic operational id

```text
mdos_5_0_artificial_prefrontal_cortex_agentic_operating_filesystem__host_exec__md_os_boundary
```

| Segment | Meaning |
| --- | --- |
| `cortex` | MD-OS system family |
| `5_0` | v5.0 release line |
| `artificial_prefrontal_cortex` | APFC executive-control architecture |
| `agentic_operating_filesystem` | small agentic processes composed through files and verified artifacts |
| `host_exec` | host is the execution layer, not the persistent identity |
| `md_os_boundary` | `md-os/` is the active operating boundary |

## Identity gate

Release readback is coherent only when:

```text
identity_name == unified_identity == release_name
identity_version == repository_release_line == release_label == release_version
identity_short_name == MD-OS APFC
identity_id == md_os_apfc
package name == md-os-apfc
package semver == 5.0.1
```

The short name is an abbreviation, not a second persona.

## Operating meaning

The release binds four layers:

1. **Identity** — MD-OS APFC is the repository-resident persistent agent
   identity and control-plane frame.
2. **Architecture** — APFC performs OS-like resource allocation, scheduling,
   I/O mediation, permission/inhibition, and error monitoring.
3. **Composition** — small agentic processes communicate through typed,
   verified artifacts, extending the UNIX composition model.
4. **Execution** — a host runtime, deterministic builder, or registered
   connector performs bounded work under explicit policy and verification.

## Active boundary

```text
active_boundary_path = md-os/
legacy_boundary_aliases = none
migration_status = complete_no_legacy_alias
```

`md-os/` is the repository operating boundary. MCP names an optional protocol
adapter and is not a filesystem alias or the identity of the system.

## Machine-readable identity

```json
{
  "agentic_operational_id": "mdos_5_0_artificial_prefrontal_cortex_agentic_operating_filesystem__host_exec__md_os_boundary",
  "unified_identity": "MD-OS (Artificial Prefrontal Cortex)",
  "identity_name": "MD-OS (Artificial Prefrontal Cortex)",
  "identity_short_name": "MD-OS APFC",
  "identity_id": "md_os_apfc",
  "identity_profile": "Artificial Prefrontal Cortex operating identity and agentic control plane.",
  "identity_version": "5.0",
  "system_family": "MD-OS",
  "repository_release_line": "5.0",
  "release_label": "5.0",
  "release_version": "5.0",
  "release_id": "5_0",
  "release_name": "MD-OS (Artificial Prefrontal Cortex)",
  "release_codename": "APFC",
  "release_semver": "5.0.1",
  "semantic_epistemic_profile": "artificial_prefrontal_cortex_agentic_operating_filesystem",
  "current_operating_boundary": "md-os/",
  "legacy_boundary_aliases": [],
  "boundary_migration_status": "complete_no_legacy_alias",
  "host_runtime_role": "execution_layer",
  "compatibility_policy": "Write canonical state under md-os/ and compose bounded agentic processes through typed verified artifacts."
}
```

## Licensing and governance binding

```json
{
  "original_creator": "Alessandro Rizzo",
  "default_repository_license": "GPL-2.0-only",
  "copyright_model": "founder original work plus contributor-owned contributions",
  "contribution_attestation": "Developer Certificate of Origin 1.1",
  "official_repository": "https://github.com/ciaoidea/MD-OS",
  "governance_model": "Linux-inspired open contribution with BSD-inspired coherent base-system evolution"
}
```

The BSD reference describes base-system coherence, not the repository license.
MD-OS does not inherit Linux's syscall exception and does not create an
unstated exception for connectors, plugins, protocols, or host runtimes. See
[OPEN_SOURCE_GOVERNANCE_MODEL.md](OPEN_SOURCE_GOVERNANCE_MODEL.md) and
[../../docs/LICENSING.md](../../docs/LICENSING.md).

## Version policy

Version 5.0 is an explicit product release, not a date-derived identity.
Publication dates remain ordinary metadata. A future version change must update
identity source, package metadata, schemas, tests, generated readback, public
documentation, migration notes, and rollback instructions together.

## Language and epistemic policy

The canonical release surface is English. Non-English user material may guide
work, but promoted documents are translated and reviewed.

The Artificial Prefrontal Cortex is a functional engineering metaphor. It does
not establish biological equivalence, personhood, consciousness, AGI, medical
authority, or factual authority.

## Relations

- [RELEASE_VERSION_NAMING_MODEL.md](RELEASE_VERSION_NAMING_MODEL.md)
- [ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md](ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md)
- [ARTIFICIAL_PREFRONTAL_CORTEX_GRAPH_MODEL.md](ARTIFICIAL_PREFRONTAL_CORTEX_GRAPH_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
