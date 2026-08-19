# Markdown Operating System for Robotic Agents (MD-OS CORTEX)

## Artificial Prefrontal Cortex (APFC)

This package contains Alessandro Rizzo's revised MD-OS CORTEX/APFC v5.0
manuscript for the MD-OS 5.0 release line and its 5.0.1 package baseline, its
bibliography, editable TikZ sources, publication figures, and reproducible
build rules. Correspondence: `a.rizzo@physiks.net`. Author ORCID:
[0000-0002-8030-3540](https://orcid.org/0000-0002-8030-3540).

## Revision state

The source and PDF in this directory are now the 17 August 2026 artifact
revision. They extend the original deposited manuscript with the implemented
Cortex agentic shell, persistent Codex App Server/thread binding, direct native
command route, bounded shell-event readback, active-turn steering and Escape
interruption, workspace-bound local/SSH/WebSSH continuity, and the semantic
commitment gate. The scientific results measured against the earlier baseline
remain explicitly historical; the revision does not relabel them as new
experiments.

Zenodo record `21960027` remains the immutable 15 August 2026 preprint until a
new Zenodo version is explicitly deposited. Updating this repository does not
update Zenodo automatically.

The revision validation is intentionally conservative: 206/206 Node tests
pass, while the shell parity suite has one unresolved `cancel` versus `decline`
expectation. The aggregate revision is therefore not described as fully green.

Canonical repository: [ciaoidea/MD-OS](https://github.com/ciaoidea/MD-OS).
The repository and this covered manuscript package are distributed under
`GPL-2.0-only`; third-party works and cited material retain their own terms.

The manuscript uses a compact Nature-inspired editorial layout: a full-width
title and abstract, a two-column scientific body, wide figures and tables, and
numbered references. It does not claim to be an official Nature submission
template.

## Manuscript focus

The paper presents MD-OS as a file-native method for cumulative, verified
language-model agency. Its contribution is not merely that an agent can call
tools. It specifies how a world event is interpreted relative to a persistent
self-frame, how a proposal becomes a bounded operation, how success is accepted
only through evidence and an independent verifier, and how a verified episode
can become reusable method.

The concrete architecture evaluated in the manuscript is stated explicitly:

```text
CORTEX = CODEX + MD-OS

Codex = execution stack used by the evaluated artifact, not its persistent identity
Codex CLI = OpenAI's local open-source coding agent; Apache-2.0; source on GitHub
OpenAI model/service = inference substrate used by the CLI; not claimed open source
MD-OS/APFC = persistent identity, executive method, constraints, and readback
APFCG = durable conceptual and operational graph carried by MD-OS
```

The public Codex CLI source is the official OpenAI repository
[openai/codex](https://github.com/openai/codex). The repository is licensed
under Apache 2.0. This open-source statement applies specifically to the CLI
source and related components identified by OpenAI; it does not imply that the
OpenAI model weights, Codex cloud, or hosted inference service are open source.

The embodied learning mechanism is equally explicit:

```text
ROBOT ACTS
-> WEBCAM OBSERVES THE ROBOT'S OWN BODY
-> MD-OS BINDS COMMAND TO OBSERVED EFFECT
-> APFCG CONSOLIDATES THE VERIFIED BODY-ACTION-EFFECT MODEL
-> APFC USES THE MODEL TO PREDICT AND FILTER FUTURE ACTIONS
```

This is the operational source of new capability. The agent no longer treats
vision as passive input: it learns how its own commands transform its body and
the scene. The resulting operational self-model supports prediction, action
selection, fault detection, limits and affordances. This is functional
self-perception with measurable behavioural consequences, not a claim of
phenomenal consciousness.

This is a composition, not an identity collapse. The open-source Codex CLI is
the currently verified local execution host, while the selected OpenAI model
supplies inference through it. MD-OS is the repository-resident persistent
agent identity and Operating Filesystem; its APFCG is intended to survive a
change of host only when the replacement host has been explicitly verified.

The revision adds four conceptual elements that are explicitly separated from
the already measured v5.0 results:

- the `WORLD — EVENT — ME.md — MEANING — EXPERIENCE` self-reference crossing;
- the distinction between peak model capacity and cumulative verified progress;
- a neuroscience-grounded account of executive control, episodic memory,
  non-REM/REM consolidation, replay, and skilled flow;
- a proposed graph-to-weights pipeline that compiles the Artificial Prefrontal
  Cortex Graph (APFCG)
  visualized by Obsidian into provenance-linked training data, trains a cloned
  model or adapter, and promotes it only after sealed regression, safety,
  identity, and new-task gates.

It also links the physical demonstration video
[Robotic Lab---Speedy Evolv learns to use its new arm attachment by observing
itself on webcam](https://www.youtube.com/watch?v=pztIw7zgXh4) to the paper's
closed sensory--agentic loop. The video is treated as a demonstration artifact;
the manuscript specifies the synchronized logs, held-out prediction tests,
cold-start persistence and APFC ablation needed to establish learning and
operational emergence quantitatively.

APFCG is heterogeneous. It relates Markdown pages, concepts, claims and
schemas; JSON/NDJSON state and evidence; workflows through applications and
actions; Python, JavaScript, PHP, shell and other registered executors; and
connectors to APIs, devices and bounded external substrates. Obsidian displays
the linked-Markdown projection of this network, not its complete execution
semantics.

The graph-to-weights pipeline is a design proposal. MD-OS v5.0 does not update
LLM parameters. The paper also does not claim biological equivalence, AGI,
physical-robot safety, or a completed comparison against OpenClaw.

## OpenClaw distinction

The manuscript treats OpenClaw as a serious comparator, not a straw man.
OpenClaw documents a self-hosted gateway, sessions, workspaces, memory, tools,
skills, plugins, and automation. MD-OS is positioned at another abstraction:
the persistent, host-portable method that makes an action validity-bearing,
verifiable, replayable, and eligible—or ineligible—for learning.

The paper specifies a direct comparison protocol using the same model, tools,
budgets, and sealed longitudinal tasks across a host-only workflow, OpenClaw
hosting MD-OS, and another compatible host running the same MD-OS state.

## Figure set

| Manuscript file | Purpose |
|---|---|
| `figures/md_os_apfc_apfcg_architecture_v2.tex` | Main CORTEX = Codex + MD-OS/APFCG architecture and wake--consolidation--flow cycle |
| `figures/md_os_cortex_proto_agi_schema.tex` | Original MD-OS CORTEX proto-AGI schema and conceptual overview |
| `figures/self_experience_cross.tex` | Relative self, event, meaning, experience, and episode graph |
| `figures/consolidation_pipeline.tex` | Proposed wake/readback/graph-to-weights consolidation cycle |
| `figures/system_pipeline.tex` | Intent-to-verification operational pipeline |
| `figures/apfc_robotics_architecture.tex` | Primary technical robotics architecture |
| `figures/apfc_robotics_architecture_color_alternative.tex` | Optional colour CAD alternative |
| `figures/results_dashboard_lncs.tex` | Bounded artifact-results dashboard |

Editable TikZ bodies are in `sources/`. Standalone PDF, SVG, and 300-dpi PNG
exports are in `figures/standalone/`. The redesigned main CORTEX graphic, the
original CORTEX schema, and the underlying robot plates are in
`figures/assets/`. The imported original schema is retained as an unchanged
byte-for-byte project asset at
`figures/assets/md_os_cortex_proto_agi_schema.png`.

## Scientific boundary

APFC is a biologically inspired functional abstraction of selected executive
operations, coupled to explicit episodic and knowledge stores. It is not a
one-to-one simulation of the human prefrontal cortex. The manuscript states the
correspondence and the non-equivalence for every neuroscience-to-engineering
mapping.

In robotics, APFC is a non-real-time mission-level filter. A filtered request
must cross a hard authority boundary into an independent safety and real-time
controller. Only that downstream controller commands actuators.

## Build and verification

Compile all standalone figures and the Nature-inspired manuscript:

```sh
make paper
```

Compile only the manuscript:

```sh
latexmk -pdf -interaction=nonstopmode -halt-on-error paper.tex
```

Compile only the standalone plates:

```sh
make figures
```

Verify package hashes after the build:

```sh
sha256sum -c MANIFEST.sha256
```

The reviewed `paper.pdf` and standalone figure PDFs are versioned for the
Zenodo/GitHub artifact. LaTeX scratch files such as `.aux`, `.log`, `.fls`, and
`.fdb_latexmk` remain local and must not be published.

The selected technical robot image was losslessly normalized at the container
level to remove incompatible PNG metadata; its visual content was not altered.
