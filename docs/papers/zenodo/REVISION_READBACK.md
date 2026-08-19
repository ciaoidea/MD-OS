# MD-OS CORTEX paper revision readback

## 17 August 2026 artifact revision

This revision updates the manuscript from the immutable Zenodo snapshot at
record `21960027` to repository commit
`a447abe5d312f1da0dc87a78b4e87c8379aa632f`. It adds the implemented Cortex
agentic-shell control surface without rewriting the original bounded
experiments as new results.

Added manuscript coverage:

- `cortex` as the public MD-OS interactive entry point;
- direct native-command execution without a model call;
- bounded volatile command/output/exit readback delivered as untrusted data;
- one lazily started Codex App Server and workspace-bound Codex thread;
- one shared `tmux`-backed Cortex process across local, SSH, and WebSSH clients;
- active-turn `turn/steer` input and Escape/`turn/interrupt` behavior;
- explicit limits of pre-model/post-model flow mediation;
- separation of full host authority from semantic, privacy, publication, and
  commitment authorization;
- the semantic commitment gate and its provenance, semantic-delta, challenge,
  authority, and verifier-readback boundaries.

Validation observed before rebuilding this revision:

- `npm run check`: passed;
- Node test suite: 206/206 passed;
- Python shell parity suite: 28 passed and 1 failed;
- open mismatch: non-interactive approval produced `cancel`, while the test
  expected `decline`;
- aggregate test closure: **not closed** until that mismatch is resolved or the
  expected contract is explicitly revised.

Build and runtime readback after the manuscript update:

- `make paper`: passed;
- revised PDF: 18 A4 pages, 4,286,560 bytes;
- undefined references, multiply defined labels, overfull boxes, and fatal
  LaTeX errors: none after the second build;
- `npm run build:all`: completed with exit status 0;
- APFC graph and semantic commitment gate: `ok`;
- semantic operational compiler and aggregate health: `critical`;
- principal compiler contamination: ignored host-local Kokoro `.venv`
  Markdown/license material was indexed as semantic source, producing
  duplicate claims and broken third-party documentation links;
- additional semantic findings: six disconnected Cortex shell Markdown nodes;
- two consecutive `npm run replay` invocations completed, but the final
  readback remained `matched_before: false`;
- release closure and publication readiness: **not closed**.

The section below remains the readback for the original 15 August manuscript.

Date: 15 August 2026
Author: Alessandro Rizzo (`a.rizzo@physiks.net`),
[ORCID 0000-0002-8030-3540](https://orcid.org/0000-0002-8030-3540)

Canonical repository: [ciaoidea/MD-OS](https://github.com/ciaoidea/MD-OS).  The
manuscript source and compiled PDF expose this repository reference directly.

## Closed objective

The manuscript now introduces the system under the explicit title
**Markdown Operating System for Robotic Agents (MD-OS CORTEX)**, with the
subtitle **Artificial Prefrontal Cortex (APFC)**.

The operational architecture is no longer implicit:

```text
CORTEX = CODEX + MD-OS
```

- Codex is the shorthand for the evaluated execution stack: OpenAI's local
  Codex CLI, a selected external OpenAI model, tools, terminal, and the bounded
  read--write--execute loop.
- Codex CLI source is publicly developed at
  [openai/codex](https://github.com/openai/codex) under the Apache 2.0 license.
- The open-source claim applies to the CLI source, not to OpenAI model weights,
  Codex cloud, or the hosted model service.
- MD-OS is the repository-resident persistent identity, method, policy,
  operational memory, verification, readback, and continuity layer.
- APFC is the active executive-control function within MD-OS.
- APFCG is the persistent heterogeneous conceptual and operational graph on
  which APFC operates.

## Codex open-source boundary

The paper now separates three layers that must not be collapsed:

```text
Codex CLI = local OpenAI coding-agent software, public source, Apache 2.0
OpenAI model/service = inference substrate used through the CLI
MD-OS APFC/APFCG = persistent identity, method, memory, policy, and readback
```

The exact statement is therefore not "the whole Codex system is open source."
It is: **the Codex CLI used as the local host is an open-source OpenAI project;
the availability of its source does not publish or relicense the underlying
model weights or hosted services.** The abstract, formal composition section,
equation, principal architecture figure, bibliography, and package README all
state this boundary explicitly.

## Scientific clarification

The abstract introduces the prefrontal cortex as functionally comparable to an
executive operating system while explicitly rejecting a literal centralized
kernel or one-to-one biological equivalence. The neuroscience section separates
prefrontal executive coordination, hippocampal episodic binding, distributed
systems consolidation, replay, and the limited transient-hypofrontality
hypothesis.

The following sequence is presented as a proposed engineering extension, not
as a measured v5.0 result:

```text
APFC control -> verified episode -> APFCG -> offline robotic replay
-> isolated candidate weight consolidation -> sealed promotion
-> reduced APFC deliberation during verified flow
```

Identity, policy, anomaly detection, evidence capture, and hard robot safety
remain active during flow.

## Closed sensory--agentic loop

The paper now states its embodied mechanism at the beginning of the abstract:

```text
robot acts -> webcam observes the robot -> command is bound to bodily effect
-> verifier admits repeatable evidence -> APFCG consolidates the self-model
-> APFC predicts and filters the next action
```

The associated demonstration is the MD-OS YouTube video *Robotic
Lab---Speedy Evolv learns to use its new arm attachment by observing itself on
webcam*, published 11 May 2026. The camera is interpreted as reafferent sensory
evidence, not merely human monitoring. The robot becomes an observable causal
object inside its own world model.

The paper defines operational self-perception without claiming consciousness,
and defines operational emergence through five tests: the capability is not a
prewritten command--effect table, arises from the closed loop, persists as
reconstructible state, improves sealed future behaviour, and disappears when
the consolidated APFC self-model is ablated.

## Architecture figure

The main raster architecture figure was generated by editing the original
project schema with the built-in image-generation workflow. It visualizes the
LLM core, APFC, APFCG, Obsidian projection, world sensors, connectors, devices,
robotic replay, candidate weight consolidation, flow, and persistent hard
safety. A typeset statement directly below the image makes
`CORTEX = CODEX + MD-OS` explicit.

The original source schema was not deleted or overwritten. Its project copy
and historical source both have SHA-256:

```text
59cfacaae6233003b3fb06bff8a17b59c03cc964be9c3fd46eaebdffafd1959d
```

## Verification readback

- `make paper`: passed.
- Final PDF: 17 A4 pages.
- PDF metadata title and author: correct.
- Undefined citations/references: none.
- Multiply defined labels: none.
- Fatal LaTeX errors: none.
- Overfull boxes: none.
- Standalone figure PDF builds: passed.
- Standalone SVG and 300-dpi PNG exports: regenerated.
- `sha256sum -c MANIFEST.sha256`: passed; every listed artifact returned `OK`.

## Claim boundary

The paper reports the verified 194/194 artifact test result, the controlled
repair-verifier fixture, bounded finite-family learning, and replay convergence.
It does not claim that v5.0 already modifies LLM weights, reproduces biological
sleep, demonstrates general learning or AGI, proves host security, completes a
direct OpenClaw benchmark, or validates physical robot safety. The arm video is
classified as a physical demonstration of the sensory--agentic loop, not as a
controlled quantitative proof of retained learning or emergence.

The cited external sources are the official
[Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli), OpenAI's
[open-source components documentation](https://learn.chatgpt.com/docs/open-source),
and the public [openai/codex repository](https://github.com/openai/codex). The
claim that Codex is the verified host path for this artifact is an MD-OS
release property, not a claim made by those external sources.
