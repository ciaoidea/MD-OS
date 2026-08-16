# Device Discovery Model

Device discovery is the read-only hardware bootstrap path for MD-OS (Artificial Prefrontal Cortex) v5.0
MD-OS APFC.

The command:

```bash
mdos hardware bootstrap
```

scans host-exposed hardware and peripheral surfaces, then writes normalized
host-local state under:

```text
md-os/ops/local/hardware/
```

This directory is a cleanable cache for the current computer, not portable
project knowledge. Remove it with:

```bash
mdos hardware clean
```

Cleanup must also rebuild derived runtime views and scrub hardware scan events
from the local journal so old hardware summaries do not remain in generated
indices, workspace inventories, or journal history.

## Outputs

Expected files:

```text
md-os/ops/local/hardware/device_registry.json
md-os/ops/local/hardware/inventory.md
md-os/ops/local/hardware/capabilities.md
md-os/ops/local/hardware/bootstrap_report.md
md-os/ops/local/hardware/observations.ndjson
```

## Discovery Scope

The bootstrap may inspect:
- host OS and architecture
- available hardware-related tools
- audio output/input surfaces
- camera device nodes or camera listings
- printer listings
- display/session information
- USB summaries
- serial device paths
- GPIO chip paths

The bootstrap must not:
- activate a camera stream
- record microphone input
- print a page
- change volume
- move hardware
- send serial/GPIO writes
- perform hidden background observation

## Boot Screen

The command should behave like an MD-OS boot screen:

```text
MD-OS (Artificial Prefrontal Cortex) v5.0 Hardware Bootstrap
[SCAN] host substrate
[OK] host OS: linux
[SCAN] audio
[OK] audio control surface discovered
[SCAN] camera
[--] camera not found
[WRITE] md-os/ops/local/hardware/device_registry.json
[DONE] hardware substrate ready for natural-language control planning
```

The screen is a progress report, not proof of hardware activation.

## Registry Semantics

The device registry describes what MD-OS has discovered and what would be
needed for future control.

Example:

```json
{
  "device_id": "camera_video0",
  "category": "camera",
  "status": "discovered",
  "requires_consent": true,
  "control_status": "discovery_only",
  "planned_actions": ["look_once", "start_live", "stop_live"]
}
```

No discovered device is considered safe to control until a dedicated connector
and policy exist.

When a connector exists, control is still separate from discovery:

```text
discovery -> registry -> explicit user intent -> connector -> artifact/action log
```

Input-producing actions, such as desktop capture or future camera look-once,
write host-local artifacts. Output-producing actions, such as audio volume or
future robot controller commands, write host-local action records and controller
results. Both are removable with `mdos hardware clean`.
