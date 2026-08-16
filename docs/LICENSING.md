# Licensing and Attribution

## Current license

MD-OS (Artificial Prefrontal Cortex) is distributed under the **GNU General
Public License version 2 only**, identified by:

```text
SPDX-License-Identifier: GPL-2.0-only
```

The complete license and repository application notice are in
[../LICENSE](../LICENSE).

The original project was created by **Alessandro Rizzo**. Contributors retain
copyright in their own contributions unless a separate written agreement says
otherwise. See [../AUTHORS.md](../AUTHORS.md) and
[../CONTRIBUTING.md](../CONTRIBUTING.md).

## Effective scope

Unless a file or component carries a different notice, GPL-2.0-only is the
default license for repository-original source code, natural-language programs,
schemas, knowledge models, documentation, examples, tests, build scripts, and
other source artifacts distributed as part of MD-OS.

The default does not erase or replace:

- third-party licenses and copyright notices;
- licenses attached to vendored dependencies or imported knowledge;
- terms governing external datasets, models, media, fonts, firmware, or device
  assets;
- rights in user-provided inputs, connector snapshots, external operational
  records, or host-local state;
- copyright or other rights that do not belong to MD-OS copyright holders.

Third-party and externally sourced material must retain its own notices and
must not be represented as relicensed merely because it is stored near or
processed by MD-OS.

## Generated output and operational state

Running MD-OS does not make every output GPL automatically. GPLv2 itself states
that program output is covered only when its contents constitute a work based
on the program. That determination depends on the actual content and
applicable law.

In particular, no automatic ownership or relicensing claim is made over:

- user prompts and source materials;
- external connector responses;
- device observations and telemetry;
- independently authored documents;
- model outputs that do not contain protected MD-OS material;
- host-local runtime inventories under `md-os/ops/local/`.

Generated artifacts that reproduce or adapt protected MD-OS source may remain
subject to GPL-2.0-only. Distribution decisions must preserve provenance and
applicable third-party terms.

## Connectors and independent systems

MD-OS is not a kernel and does not copy Linux's syscall exception. The current
license grants no special linking, plugin, connector, protocol, API, or
host-runtime exception.

Communication with MD-OS does not receive a blanket legal classification in
this policy. Whether a connector or external program is independent,
aggregated, combined, or derivative depends on how it is designed and
distributed. A future stable interface exception or permissively licensed SDK
must be proposed explicitly, reviewed for compatibility, and verified before
publication.

## Transition from MIT

Earlier copies of this repository were offered under the MIT License. This
policy applies to the current 5.0.1 source distribution and future covered
contributions accepted under it. It does not revoke permissions already
received for historical MIT-licensed copies.

When material from an earlier MIT-licensed copy remains identifiable, preserve
its applicable historical copyright and permission notice when required. A
recipient may not assume that later GPL-covered changes are also available
under the historical MIT terms.

## Contribution provenance

MD-OS uses the Developer Certificate of Origin 1.1 rather than mandatory
copyright assignment. Each contribution must include:

```text
Signed-off-by: Full Name <email@example.com>
```

The sign-off certifies the contributor's right to submit the contribution under
the indicated open-source license. See
[../DeveloperCertificateOfOrigin.txt](../DeveloperCertificateOfOrigin.txt).

## Attribution, citation, and project identity

GPLv2 requires preservation of appropriate copyright and license notices when
covered work is distributed. The preferred project-level citation is defined
in [../CITATION.cff](../CITATION.cff).

Copyright, citation, governance, and project-name policy are separate:

- `LICENSE` grants copyright permissions and imposes copyleft conditions;
- `AUTHORS.md` records original creation and contributor ownership;
- `CITATION.cff` provides scholarly and project citation metadata;
- `GOVERNANCE.md` identifies the official mainline and integration process;
- `TRADEMARKS.md` addresses truthful project identification without
  restricting GPL software freedoms.

## Design lineage

The legal and engineering model intentionally combines distinct lessons:

```text
UNIX decomposition
+ Linux-style GPL reciprocity and open contribution
+ BSD-style coherent base-system evolution
+ APFC policy, scheduling, inhibition, verification, and readback
= MD-OS agentic Operating Filesystem
```

BSD-style coherence is an architectural discipline here, not a statement that
MD-OS uses a BSD license.

## Disclaimer

This document describes the project's intended licensing policy. It is not
legal advice and does not replace the controlling license text or applicable
law.
