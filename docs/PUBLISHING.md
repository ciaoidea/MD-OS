# Publishing

This repository is meant to be publishable as MD-OS (Artificial Prefrontal Cortex) v5.0, a
Markdown-native Operating Filesystem release.

Before publishing, make sure the public reader can understand what the system is,
how to run it, and what data is safe to expose.

## Public positioning

Describe the project as:

- MD-OS (Artificial Prefrontal Cortex) v5.0
- the 5.0 release of the Markdown Operating Filesystem family
- a Markdown-native Operating Filesystem for persistent AI agents and robotic
  systems
- a natural-language robotic-agentic programming paradigm for complex
  ecosystems of humans, agents, tools, applications, devices, sensors, robots,
  policies, telemetry, and recovery paths
- an early reference implementation, not a mature product runtime
- an implementation of the Operational Context as Filesystem paradigm
- a filesystem-backed operating context for agent continuity, robotic systems,
  devices, and host runtimes, not a real-time hardware OS
- a natural-language agentic layer between MD-OS and OS, hardware, applications,
  services, desktop surfaces, robots, controllers, sensors, and actuators
- a filesystem control plane for agent runtimes
- Codex-compatible in this 5.0 release: Codex is a verified host
  host runtime, while OpenCode and other hosts are secondary compatibility
  paths unless verified
- a natural-language programming runtime
- a generic connector-ready runtime
- a pure-filesystem bounded execution model
- a substrate-oriented runtime where APIs are one connector type, not the
  system boundary
- an official paper-backed presentation of the paradigm under `docs/papers/`
- a semantic operating layer for supervised AI agents
- an external semantic neural overlay around static LLM reasoning cores
- a Dynamic Virtual LLM only in the precise sense of a static model operated
  through evolving filesystem-backed tasks, connectors, policies, snapshots,
  active memory, semantic actions, audit, and replay

The stable release surface should be English. Non-English material may exist as
raw user-provided evidence, role intake, or local import material, but promoted
release documentation, KB entries, schemas, package metadata, launcher-visible
bootstrap text, and generated release summaries should be English.

Avoid describing it as:

- a browser agent
- a Codex-only architecture
- an OpenCode-equivalent runtime unless OpenCode compatibility has been
  explicitly verified
- another-host-only project
- a web application
- an autonomous shell execution tool
- an API-only automation framework
- a hardware operating system
- a classic operating system or kernel
- AGI
- a system that creates AGI
- a newly trained foundation model
- a system that changes model weights
- a numerical neural network inside the LLM core
- an uncontrolled autonomous agent
- a replacement for ROS, Linux, firmware, motor control, or safety systems
- a system that bypasses host permissions, drivers, application runtimes, or
  device safety layers

## Pre-publish checklist

Check for:

- secrets
- tokens
- private email addresses
- personal filesystem paths that should not be public
- real customer or vendor data
- private operational data
- stray temporary artifacts
- command profiles that execute destructive actions
- stale paper claims that no longer match README, `docs/`, or `md-os/kb/`
- package metadata that disagrees with `GPL-2.0-only`
- a missing or modified GPLv2 license body
- missing creator, contributor, DCO, governance, citation, or project-name
  policy files
- third-party material whose copyright or license notice would be lost
- generated or external material represented as automatically relicensed

The current demo data should be generic.

The publishable legal and governance surface must include:

```text
LICENSE
AUTHORS.md
CITATION.cff
CONTRIBUTING.md
DeveloperCertificateOfOrigin.txt
GOVERNANCE.md
TRADEMARKS.md
docs/LICENSING.md
md-os/kb/OPEN_SOURCE_GOVERNANCE_MODEL.md
```

The official repository target is
`https://github.com/ciaoidea/MD-OS`. Do not report a remote release as aligned
until the exact verified source state is committed and read back from that
repository.

## Rebuild before publishing

Run:

```bash
npm run verify
npm run replay
```

Or the direct commands:

```bash
node md-os/os/initialize_ops_memory.js
node md-os/os/compile_programs.js
node md-os/os/build_project_state.js demo_general_system
node md-os/os/build_project_state.js demo_document_approval_flow
node md-os/os/build_global_agenda.js
node md-os/os/archive_runtime_state.js
node md-os/os/build_workspace_inventory.js
node md-os/os/build_markdown_graph.js
node md-os/os/build_runtime_lifecycle_index.js
node md-os/os/build_global_index.js
node md-os/os/build_system_hygiene_status.js
node md-os/os/build_health_dashboard.js
```

Regenerate the official presentation paper whenever architecture, positioning,
Codex runtime framing, MCP connector framing, role onboarding, AGI-like claim
language, or production limits change:

```bash
latexmk -pdf -interaction=nonstopmode -halt-on-error \
  -output-directory=docs/papers \
  docs/papers/text_native_agentic_os_paper.tex
```

Then inspect:

```bash
sed -n '1,160p' md-os/ops/global_index.md
sed -n '1,160p' md-os/ops/markdown_graph.md
sed -n '1,160p' md-os/ops/system_hygiene_status.md
sed -n '1,160p' md-os/ops/workspace_inventory.md
```

If local development files are intentionally present, document the exception in
`.mdosignore`. Do not use `.mdosignore` to hide files that should be part of
the public release decision.

## Recommended public surface

Publish:

- root documentation
- `docs/`
- `md-os/kb/`
- `md-os/os/`
- `md-os/examples/`
- default launcher scripts

Do not publish local runtime state:

- `md-os/ops/artifacts/`
- `md-os/ops/local/`, especially host-specific hardware, application, and service
  inventories
- `md-os/ops/journal.ndjson`
- generated indices and inventories under `md-os/ops/`
- connector snapshots copied from real systems
- local programs copied from private operational workflows

Review carefully before publishing:

- host configs with broad permission defaults
- generated paper PDFs under `docs/papers/`
- declared elevated launchers, especially the root Codex launcher
  `bootstrap-md-os-codex.sh`, because its explicit `--unsafe` mode passes
  `--dangerously-bypass-approvals-and-sandbox`; the default path remains
  sandboxed and approval-gated

The paper source under `docs/papers/text_native_agentic_os_paper.tex` is not
optional or separate from the system. It is official presentation material for
MD-OS (Artificial Prefrontal Cortex) v5.0 and must stay aligned with the README, architecture docs,
knowledge base, connector model, role onboarding model, and production limits.

The package manifest uses `files` to publish demo seeds from `md-os/examples/`
instead of local state from `md-os/ops/`.

Use [FILESYSTEM_CONTRACT.md](FILESYSTEM_CONTRACT.md) as the formal file-role
table when deciding whether a path belongs in the public release, demo
workspace, or live local runtime.

Before copying, packaging, or distributing a workspace that has scanned local
devices or local software, run:

```bash
npm run verify:release
```

Use this to create a clean scaffolded demo workspace under `.cache/` or under
`MDOS_DEMO_PACKAGE_DIR`:

```bash
npm run package:demo
```

For cleanup only:

```bash
make clean-release
```

or:

```bash
mdos hardware clean
mdos software clean
```

The clean commands also refresh derived runtime indices and scrub host-local
scan events from the local journal so stale device, application, or service
summaries are not left behind in generated views.

The same rule applies to future local substrate caches such as desktop,
browser, robot, or sensor inventories: public packages should include the layer
model and connector code, not private details of the machine where MD-OS was
developed.

## README expectations

The README should answer:

- What is this?
- What is it not?
- How do I run it?
- How does Codex or another CLI fit?
- Which host runtime path is primary, and which are secondary?
- Where does state live?
- How do I add a signal?
- How do I add a connector?
- What files should I inspect after running it?

## Host runtime statement

Use this framing:

```text
Codex is a verified host-compatibility path for MD-OS (Artificial Prefrontal Cortex) v5.0; it is not the identity.
OpenCode or another agent runtime may operate the same filesystem layer as a
secondary compatibility path by reading the repository instructions, writing
bounded source signals under md-os/ops/sources/, and running deterministic
builders from md-os/os/.
```

This makes clear that Codex is an execution path, not the repository identity,
while the filesystem architecture remains portable to other verified hosts.
