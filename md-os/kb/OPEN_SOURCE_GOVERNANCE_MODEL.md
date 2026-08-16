# Open Source Governance Model

## Purpose

This model binds the legal, authorship, contribution, governance, and
whole-system engineering policy of MD-OS (Artificial Prefrontal Cortex) v5.0.

It operationalizes the design inheritance already present in MD-OS:

```text
UNIX  -> small processes with explicit interfaces
Linux -> reciprocal open collaboration and modular substrate breadth
BSD   -> coherent base-system evolution
APFC  -> bounded agentic scheduling, policy, inhibition, verification, readback
```

The inheritance is architectural, not a claim of source-code lineage. The BSD
reference means base-system coherence; it does not select a BSD license.

## Canonical legal identity

```text
project = MD-OS (Artificial Prefrontal Cortex)
original_creator = Alessandro Rizzo
copyright_model = founder_original_work_plus_contributor_owned_contributions
default_repository_license = GPL-2.0-only
contribution_attestation = Developer Certificate of Origin 1.1
official_repository = https://github.com/ciaoidea/MD-OS
identity_release_line = 5.0
package_semver = 5.0.1
```

The project-level copyright notice is:

```text
Copyright (C) 2026 Alessandro Rizzo and MD-OS contributors
```

This collective notice does not transfer contributor copyright to the founder.

## Policy layers

| Layer | Canonical artifact | Function |
| --- | --- | --- |
| copyright license | `LICENSE` | GPL-2.0-only permissions, reciprocity, source, notices, warranty disclaimer |
| licensing scope | `docs/LICENSING.md` | source, generated output, third-party, connector, and MIT-transition boundaries |
| authorship | `AUTHORS.md` | original creator and contributor-ownership model |
| contribution provenance | `DeveloperCertificateOfOrigin.txt`, `CONTRIBUTING.md` | right-to-submit certification and sign-off trail |
| official integration | `GOVERNANCE.md` | mainline authority, maintainer duties, decision process, forks |
| project identity | `TRADEMARKS.md` | truthful naming and avoidance of false official-status claims |
| citation | `CITATION.cff` | machine-readable project citation |

No layer may silently override another. In particular:

- the project-name policy must not remove GPL freedoms;
- the GPL must not be misrepresented as ownership of user inputs or unrelated
  external material;
- founder governance must not be misrepresented as ownership of contributor
  copyrights;
- “BSD-style” must not be misread as BSD licensing;
- connector interoperability must not be described as a legal exception that
  has not been granted.

## Linux-style contribution model

MD-OS adopts these Linux-inspired properties:

1. copyleft distribution of the official base under GPL version 2 only;
2. contributor copyright remains distributed rather than assigned by default;
3. contribution provenance is certified with DCO 1.1 and `Signed-off-by`;
4. official mainline authority is a governance role, not ownership of every
   contribution;
5. forks remain permitted while official release identity remains governed
   separately;
6. licensing and interface exceptions must be explicit, narrow, and reviewed.

MD-OS does not adopt Linux's syscall exception because MD-OS is not a kernel.

## BSD-style base-system coherence

MD-OS adopts these BSD-inspired engineering properties:

1. one coherent source tree;
2. knowledge, schemas, runtime, connectors, tests, documentation, and release
   readback evolve together;
3. the base system has common contracts and lifecycle classifications;
4. changes close whole dependency edges rather than accumulating disconnected
   local patches;
5. generated outputs are rebuilt from source and never treated as independent
   hand-edited truth.

This is a development and release discipline, not a permissive-license grant.

## Agentic UNIX composition

The legal and governance policy supports the technical composition rule:

```text
one bounded agentic process
-> one typed artifact
-> one verifier readback
-> one explicit exit state
```

Open source makes the process definitions inspectable. Base-system coherence
keeps contracts aligned. The APFC constrains permissions and composition. GPL
reciprocity keeps distributed derivatives of the covered base available under
the same license.

## Contribution gate

A contribution is admissible only when:

```text
known contributor identity
+ valid Signed-off-by
+ right-to-submit certification
+ compatible inbound license
+ preserved third-party notices
+ bounded scope
+ focused verification
+ coherent generated readback when build-relevant
```

Anonymous provenance, incompatible code, missing notices, or unverifiable
licensing claims block integration.

## Release and migration rule

The GPL-2.0-only policy begins with package semver 5.0.1 inside the unchanged
MD-OS identity release line 5.0. Historical copies legitimately received under
MIT retain the permissions attached to those copies. Later GPL-covered changes
are not automatically available under the historical MIT grant.

The migration closes only when:

1. `LICENSE` contains an application notice plus the verbatim GPLv2 text;
2. package and host-facing version metadata agree on 5.0.1;
3. author, DCO, governance, identity, citation, and scope artifacts exist;
4. the public README and publishing checklist identify GPL-2.0-only;
5. focused licensing tests pass;
6. check, test, build, semantic readback, health, and replay gates complete;
7. the official repository target is recorded without claiming a completed
   push before remote verification.

## Rollback rule

A rollback may restore prior source content only if the person performing it
has authority to distribute that content under the restored terms. It must not
claim to revoke licenses already granted for copies previously distributed.

If verification fails before publication, the migration remains incomplete and
must be repaired or withheld rather than described as an accepted release.

## Relations

- [ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md](ARTIFICIAL_PREFRONTAL_CORTEX_OS_MODEL.md)
- [AGENTIC_OPERATIONAL_RELEASE_MODEL.md](AGENTIC_OPERATIONAL_RELEASE_MODEL.md)
- [RELEASE_VERSION_NAMING_MODEL.md](RELEASE_VERSION_NAMING_MODEL.md)
- [SELF_RELEASE_EVOLUTION_MODEL.md](SELF_RELEASE_EVOLUTION_MODEL.md)
- [RUNTIME_STATE_LIFECYCLE_MODEL.md](RUNTIME_STATE_LIFECYCLE_MODEL.md)
