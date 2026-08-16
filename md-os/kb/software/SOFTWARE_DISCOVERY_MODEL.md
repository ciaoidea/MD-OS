# Software Discovery Model

Software discovery is the read-only application and service bootstrap path for
MD-OS (Artificial Prefrontal Cortex) v5.0.

The command:

```bash
mdos software bootstrap
```

scans host-exposed application and service surfaces, then writes normalized
host-local files under:

```text
md-os/ops/local/software/
```

Cleanup command:

```bash
mdos software clean
```

Cleanup must remove the local software cache, remove legacy software cache
paths, rebuild derived runtime views, and scrub software scan events from the
local journal so old software summaries do not remain in generated indices.

## Output Files

```text
md-os/ops/local/software/software_registry.json
md-os/ops/local/software/applications.json
md-os/ops/local/software/services.json
md-os/ops/local/software/applications.md
md-os/ops/local/software/services.md
md-os/ops/local/software/capabilities.md
md-os/ops/local/software/bootstrap_report.md
md-os/ops/local/software/observations.ndjson
```

## Discovery Scope

The bootstrap may detect:

- desktop application entries
- app bundles
- Start menu applications
- Flatpak and Snap applications
- service manager tools
- systemd service unit files
- running service summaries
- launchd services
- Windows services
- package manager surfaces

## Non-Activation Rule

Discovery must not:

- launch applications
- inspect application windows
- start services
- stop services
- restart services
- install packages
- remove packages
- kill processes
- mutate service configuration

Discovery only records what the host OS already exposes.

## Boot Screen

The human-facing startup screen should look like a short OS-style scan:

```text
MD-OS (Artificial Prefrontal Cortex) v5.0 Software Bootstrap
[SCAN] host software substrate
[OK] host OS: linux 6.x
[SCAN] applications
[OK] applications: 42
[SCAN] services
[OK] services: 120
[WRITE] md-os/ops/local/software/software_registry.json
[DONE] software substrate ready for natural-language control planning
```

The screen is a progress report, not proof of application launch or service
control.

## Connector Registry

Software discovery must register a connector entry:

```text
software_discovery
```

That connector is `snapshot_only`: it writes local inventory and observations.
Launching apps or controlling services requires a separate explicit connector.
