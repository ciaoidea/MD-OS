# Software Substrate Control

This folder defines the Markdown-first application and service discovery model
for MD-OS (Artificial Prefrontal Cortex) v5.0.

MD-OS does not replace the host operating system, package manager, service
manager, desktop shell, application runtime, or process supervisor. It operates
above them.

The host operating system exposes applications and services. MD-OS discovers
those surfaces, writes a host-local inventory, and later routes explicit
natural-language intent through bounded software connectors.

Runtime software discovery output is machine-specific and lives under:

```text
md-os/ops/local/software/
```

This directory is local, portable=false, and safe to delete:

```bash
mdos software clean
```

Deterministic software discovery and future software connectors live under:

```text
md-os/os/
```

Current discovery command:

```bash
mdos software bootstrap
```

Aliases:

```bash
mdos apps discover
mdos services discover
```

The bootstrap may run during Codex startup unless
`MDOS_SKIP_SOFTWARE_BOOTSTRAP=1` is set.

The bootstrap is read-only. It must not launch applications, inspect windows,
start services, stop services, restart services, install packages, remove
packages, or kill processes.
