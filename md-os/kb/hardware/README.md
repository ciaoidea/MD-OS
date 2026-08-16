# Hardware Substrate Control

This folder defines the Markdown-first hardware and peripheral control model
for MD-OS (Artificial Prefrontal Cortex) v5.0.

MD-OS does not replace Linux, Windows, macOS, kernels, drivers, device managers,
or hardware APIs. It operates above them.

The host operating system discovers and exposes hardware. MD-OS discovers those
host-exposed capabilities, registers them, constrains them, and makes them
operable through natural language, policy, audit, and bounded connectors.

Canonical documents:
- `HOST_SUBSTRATE_CONTROL_MODEL.md`
- `DEVICE_DISCOVERY_MODEL.md`
- `HARDWARE_SAFETY_POLICY.md`

Runtime hardware discovery output is machine-specific and lives under the
cleanable host-local cache:

```text
md-os/ops/local/hardware/
```

It is not portable project knowledge. It can be removed with:

```bash
mdos hardware clean
```

Deterministic hardware discovery and future hardware connectors live under:

```text
md-os/os/
```

Initial bootstrap command:

```bash
mdos hardware bootstrap
```

The Codex bootstrap launcher runs this read-only scan at startup
after printing the MD-OS banner. Set `MDOS_SKIP_HARDWARE_BOOTSTRAP=1` to skip
startup hardware discovery.

The bootstrap is read-only. It does not activate cameras, record audio, print,
change volume, move devices, or perform hardware writes.

Explicit control commands use a separate connector:

```bash
mdos hardware list
mdos hardware run "turn up the volume"
mdos screen capture
mdos display status
```

Control actions write host-local audit records and artifacts under
`md-os/ops/local/hardware/`.
