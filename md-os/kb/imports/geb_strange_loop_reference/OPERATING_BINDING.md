# Imported Operating Binding

Mode: `structured_import`
Canonical tree write: `true`
Direct bootstrap write: `false`
Path-preserving source write: `false`
Operational application candidates: `0`

## Initial Repository Rule

When import mode is `initial_repository`, the source MD-OS release is not
kept as a detached appendix. Its allowed knowledge and operating source
files are assimilated into the current repository tree, and the imported
identity frame patches the active bootstrap files. Runtime/generated state
must then be rebuilt by the ordinary MD-OS builders.

## Operational Application Layer

Import source-like MD-OS operating application state, not generated readback, host-local cache, locks, services, or artifacts.

Included roots:

- `md-os/ops/programs/`
- `md-os/ops/projects/`
- `md-os/ops/connectors/`
- `md-os/ops/policies/`
- `md-os/ops/calculations/`
- `md-os/ops/roles/`
- `md-os/ops/sources/`
- `md-os/ops/evals/`
- `md-os/ops/actions/`
- `md-os/ops/processes/`
- `md-os/ops/releases/self/proposals/`

Excluded roots:

- `md-os/ops/agenda/`
- `md-os/ops/archive/`
- `md-os/ops/artifacts/`
- `md-os/ops/compiled/`
- `md-os/ops/core/`
- `md-os/ops/imports/`
- `md-os/ops/local/`
- `md-os/ops/locks/`
- `md-os/ops/services/`
- `md-os/ops/summary/`

## Assimilation Candidates

- No path-preserving candidates for this import mode.
