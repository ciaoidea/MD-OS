# Wolfram Connector Model

The Wolfram connector integrates bounded symbolic and numerical calculations
into MD-OS (Artificial Prefrontal Cortex) v5.0 as a registered procedural
surface. The host prerequisite is a locally available `wolframscript`
executable; the connector does not require a cloud Wolfram session.

Wolfram execution is not treated as an ad hoc shell command. Each calculation
comes from an explicit profile, receives an epistemic status, runs with source,
time, and output bounds, and produces a hashed artifact, normalized connector
snapshot, and journal readback.

## Operating Chain

```text
explicit calculation profile
-> source and path policy
-> local wolframscript execution
-> bounded stdout and stderr
-> hashed artifact
-> connector snapshot
-> epistemic interpretation
-> rebuild and replay
```

## Commands

```bash
mdos wolfram bootstrap
mdos wolfram list
mdos wolfram run <project_id> <calculation_id>
mdos math list
mdos math run <project_id> <calculation_id>
mdos connector wolfram bootstrap
mdos connector wolfram list
mdos connector wolfram run <project_id> <calculation_id>
```

## Runtime Files

- Connector profile: `md-os/ops/connectors/wolfram_connector.json`
- Calculation registry: `md-os/ops/calculations/wolfram/*.json`
- Versionable calculation scripts: `md-os/ops/calculations/wolfram/scripts/*.wl`
- Host-local scripts: `md-os/ops/local/wolfram/*.wl`
- Result artifacts: `md-os/ops/artifacts/wolfram/*.txt`
- Source snapshots: `md-os/ops/sources/connectors/*__wolfram__*.json`
- Calculation schema: `md-os/schemas/wolfram_calculation.schema.json`
- Driver: `md-os/os/wolfram_connector.js`

## Bootstrap Contract

`mdos wolfram bootstrap` creates a missing default profile, discovers
host-local `.wl` scripts, registers calculation profiles for previously
unknown scripts, tests whether `wolframscript` is on `PATH`, updates the live
connector registry, and writes an availability snapshot. When the executable
is available, bootstrap also runs this bounded smoke calculation:

```wolfram
FullSimplify[D[x^2, x] == 2 x]
```

The expected engine result is `True`. The artifact and connector snapshot are
the operational readback; conversation alone is not evidence that the
calculation succeeded.

## Calculation Contract

Each calculation declares exactly one source: `wolfram_code` or `script_path`.
Registry files use this shape:

```json
{
  "schema_version": 1,
  "calculation_id": "example_symbolic_gate",
  "project_id": "demo_general_system",
  "script_path": "md-os/ops/calculations/wolfram/scripts/example_symbolic_gate.wl",
  "summary": "Run a bounded symbolic gate.",
  "timeout_ms": 30000,
  "max_source_bytes": 200000,
  "max_output_bytes": 200000,
  "epistemic_status": "conditional",
  "expected_gates": ["exampleGate"]
}
```

The executable must be `wolframscript`; optional engine flags are limited to
`-local`. Script paths must resolve inside the workspace and under an
allowlisted Wolfram script root. The current calculation surface rejects
Wolfram primitives that perform external I/O, launch processes, load external
code, or mutate host files. This is a policy guard, not a claim that the
Wolfram kernel is a complete security sandbox.

## Epistemic Rule

A correct Wolfram result establishes only the declared formal calculation. It
does not, by itself, establish the physical interpretation, assumptions, data
quality, empirical validity, or predictive status of a wider claim.

Allowed statuses are:

```text
heuristic
conditional
derived
retrodictive
predictive
open
falsified
```

Interpretation and promotion remain governed by
`md-os/kb/EPISTEMIC_LIFECYCLE_MODEL.md` and, for scientific work,
`md-os/kb/SCIENTIFIC_VALIDATION_METHOD_MODEL.md`.

## Safety And Audit

The connector is explicit-run only; it does not introduce continuous or
autonomous calculation. Every run records the calculation identifier, source
mode, source hash, output hash, timeout, output bound, exit status, duration,
artifact path, snapshot path, and epistemic status. Failed kernel execution is
reported as failed and is never converted into a successful calculation claim.
