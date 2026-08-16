# Contributing

## License and contributor ownership

MD-OS is distributed under GNU GPL version 2 only
(`SPDX-License-Identifier: GPL-2.0-only`).

Alessandro Rizzo is the original creator. Contributors retain copyright in
their respective contributions unless a separate written agreement applies.
MD-OS does not require copyright assignment to the founder or project.

By contributing, you agree that your contribution may be distributed under
GPL-2.0-only and certify it under the
[Developer Certificate of Origin 1.1](DeveloperCertificateOfOrigin.txt).

## Sign your work

Every commit submitted for integration must carry a real-name sign-off:

```text
Signed-off-by: Full Name <email@example.com>
```

Create it with:

```bash
git commit -s
```

The sign-off certifies that you wrote the contribution or otherwise have the
right to submit it under the indicated license. It is not a copyright
assignment. Anonymous or pseudonymous provenance that cannot satisfy the DCO
is not accepted into the official mainline.

For jointly authored changes, add a `Co-developed-by` trailer for each
co-author followed immediately by that person's `Signed-off-by` trailer.
Do not add another person's sign-off without their authorization.

## Principles

Contributions should preserve the core model:

- text-native Natural Language Agentic Operating System semantics
- text-native state
- bounded execution
- deterministic builders
- human-readable memory
- explicit operational boundaries

MD-OS APFC is an operating layer for agent continuity, not a hardware OS, web app,
browser agent, or API-only automation framework.

## Contribution scope

Good contributions include:

- new generic connectors
- tighter runtime safety
- better project builders
- cleaner KB models
- documentation and examples

Avoid:

- hidden state layers that bypass `md-os/ops/`
- unbounded execution paths
- application-specific assumptions in the generic core
- incompatible or unattributed third-party material
- claims that connector interaction has a legal exception not declared by the
  project

## Third-party and generated material

Preserve all applicable third-party copyright and license notices. Do not
submit code, models, datasets, documents, media, device assets, or generated
material unless you have the right to contribute them under compatible terms.

Running material through an AI model, converter, connector, or builder does not
establish a right to relicense it. The signer remains responsible for the DCO
certification and for identifying relevant upstream provenance.

## Development flow

1. Update the relevant KB model before or alongside implementation.
2. Keep runtime writes inside `md-os/os/` and `md-os/ops/`.
3. Use deterministic scripts for mutation.
4. Add a focused test or explicit verification command for build-relevant
   changes.
5. Rebuild canonical artifacts after changes:

```bash
node md-os/os/build_project_state.js demo_general_system
node md-os/os/build_project_state.js demo_document_approval_flow
node md-os/os/build_global_agenda.js
node md-os/os/build_global_index.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_system_hygiene_status.js
```

For JavaScript, schema, runtime, CLI, or build-contract changes, run:

```bash
npm run check
npm test
npm run build:all
npm run replay
npm run replay
```

For licensing, attribution, governance, or packaging changes, also run:

```bash
node --test test/licensing_policy.test.js
npm pack --dry-run
```

## Pull request expectations

Each contribution should explain:

- what changed
- which layer changed
- which KB model was updated
- how the change was verified
- which third-party licenses or notices are affected
- whether generated runtime outputs changed
- any unresolved compatibility, publication, or legal risk

Pull requests should target the official repository:

```text
https://github.com/ciaoidea/MD-OS
```

The official mainline and fork policy are defined in
[GOVERNANCE.md](GOVERNANCE.md). Project-name usage is described in
[TRADEMARKS.md](TRADEMARKS.md).
