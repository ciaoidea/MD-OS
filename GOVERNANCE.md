# MD-OS Governance

## Purpose

MD-OS follows a Linux-inspired open contribution model and a BSD-inspired
coherent-base-system discipline for an agentic Operating Filesystem. The
licensing model, governance model, and architectural inheritance are distinct:

```text
UNIX  -> small composable processes and explicit interfaces
Linux -> copyleft collaboration, modular extension, and contributor provenance
BSD   -> one coherent base system evolved with code, contracts, tests, and docs
MD-OS -> bounded agentic processes composed through verified artifacts
```

“BSD-inspired” describes whole-system engineering discipline; it does not mean
that MD-OS is distributed under a BSD license. The repository license is
GPL-2.0-only.

## Founder and official mainline

Alessandro Rizzo is the original creator and founding maintainer of MD-OS
(Artificial Prefrontal Cortex).

The official project repository is:

```text
https://github.com/ciaoidea/MD-OS
```

The official mainline is the default branch and the releases, tags, and
artifacts published from that repository by authorized maintainers. A fork is
permitted by the GPL but does not become an official MD-OS release merely by
using compatible source code.

## Copyright model

- Alessandro Rizzo retains copyright in the original work he created.
- Each contributor retains copyright in their own contribution unless a
  separate written agreement applies.
- Copyright assignment to the founder or project is not required.
- Contributions are accepted under GPL-2.0-only through the Developer
  Certificate of Origin 1.1 and a valid `Signed-off-by` trail.
- Existing third-party notices and licenses must be preserved.

This distributed copyright model deliberately favors durable community
reciprocity. It also means a future relicensing may require permission from
multiple copyright holders.

## Maintainer responsibilities

Maintainers:

1. preserve the identity and active `md-os/` operating boundary;
2. review contribution provenance, licensing, policy, safety, and architecture;
3. keep knowledge, schemas, runtime, tests, documentation, generated readback,
   and release metadata coherent as one base system;
4. reject changes that bypass permissions, verification, audit, or lifecycle
   contracts;
5. run the release gates appropriate to the change;
6. distinguish official releases from experiments, forks, and host-local state;
7. record material governance or release-policy changes in durable source
   artifacts.

## Decision model

Technical decisions should prefer, in order:

1. repository invariants and safety boundaries;
2. verified behavior and reproducible evidence;
3. compatibility with the declared release contract;
4. the smallest coherent whole-system change;
5. maintainer judgment when evidence does not resolve the choice.

The founding maintainer has final integration authority for the official
mainline. That authority controls the official repository; it does not remove
the GPL rights of downstream recipients or the copyright of contributors.

## Forks and ecosystem implementations

Forks may modify and redistribute covered work under GPL-2.0-only. They should:

- preserve copyright and license notices;
- provide corresponding source as required by GPLv2;
- identify modifications and avoid representing a fork as an official release;
- follow [TRADEMARKS.md](TRADEMARKS.md) for project-name and logo usage.

Independent programs, connectors, external systems, and aggregated works remain
subject to the actual facts of their relationship to GPL-covered work and to
applicable law. MD-OS currently grants no Linux-syscall-style exception.

## Amendments

Changes to this governance file require the same review, verification, release
readback, and publication discipline as other release-policy changes.
