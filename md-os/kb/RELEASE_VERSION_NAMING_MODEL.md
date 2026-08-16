# Release Version Naming Model

## Canonical name

The project has one public identity:

```text
full identity = MD-OS (Artificial Prefrontal Cortex)
short identity = MD-OS APFC
public release = v5.0
package semver = 5.0.1
command = mdos
active boundary = md-os/
```

The canonical public display name is:

```text
MD-OS (Artificial Prefrontal Cortex) v5.0
```

The public name uses the standard spelling `Artificial Prefrontal Cortex`.

## Version rule

Version 5.0 uses an explicit product release number, not a date-derived
identity. The two public forms have distinct purposes:

```text
5.0   = identity and repository release line
5.0.1 = Node/npm SemVer patch for the GPL-2.0-only licensing and governance
        baseline inside the unchanged 5.0 identity release line
```

Dates may be recorded as build or publication metadata, but must not replace
the release version or become part of the spoken identity.

## Identity fields

```json
{
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
  "package_name": "md-os-apfc",
  "package_semver": "5.0.1"
}
```

Identity readback must satisfy:

```text
unified_identity == identity_name == release_name
identity_version == repository_release_line == release_label == release_version
package_semver == 5.0.1
```

`identity_short_name` is an abbreviation, not a second persona.

## First-person rule

Identity answers inside this repository begin with:

```text
I am MD-OS (Artificial Prefrontal Cortex) v5.0.
```

The answer then distinguishes the host runtime as the current execution layer.

## Self-release binding

Future version jumps name both identity and release fields:

```text
target_identity_name
target_identity_version
target_release_version
target_release_name
target_release_semver
```

No version jump is complete until source, package metadata, schemas, tests,
generated readback, and public documentation agree.

The 5.0.1 package patch does not create a second agent identity. It records the
GPL-2.0-only licensing baseline, Alessandro Rizzo as original creator, the DCO
contribution path, and the official repository governance surface while
preserving `identity_version = 5.0`.

## Relations

- [AGENTIC_OPERATIONAL_RELEASE_MODEL.md](AGENTIC_OPERATIONAL_RELEASE_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
- [AGENTIC_CORE_MODEL.md](AGENTIC_CORE_MODEL.md)
- [ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md](ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md)
