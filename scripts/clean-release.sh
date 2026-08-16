#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

find "$ROOT_DIR" -type d -name '__pycache__' -prune -exec rm -rf {} +
find "$ROOT_DIR" -type f -name '*.pyc' -delete

if [[ -f "$ROOT_DIR/md-os/os/hardware_bootstrap.js" ]]; then
  node "$ROOT_DIR/md-os/os/hardware_bootstrap.js" clean
fi

if [[ -f "$ROOT_DIR/md-os/os/software_bootstrap.js" ]]; then
  node "$ROOT_DIR/md-os/os/software_bootstrap.js" clean
fi

rm -rf \
  "$ROOT_DIR/md-os/ops/local/openwa_whatsapp" \
  "$ROOT_DIR/md-os/ops/local/openwa_runtime"

if [[ -f "$ROOT_DIR/md-os/os/build_workspace_inventory.js" ]]; then
  node "$ROOT_DIR/md-os/os/build_workspace_inventory.js"
fi

if [[ -f "$ROOT_DIR/md-os/os/build_system_hygiene_status.js" ]]; then
  node "$ROOT_DIR/md-os/os/build_system_hygiene_status.js"
fi

if [[ -f "$ROOT_DIR/md-os/os/build_runtime_lifecycle_index.js" ]]; then
  node "$ROOT_DIR/md-os/os/build_runtime_lifecycle_index.js"
fi

if [[ -f "$ROOT_DIR/md-os/os/build_health_classifier.js" ]]; then
  node "$ROOT_DIR/md-os/os/build_health_classifier.js"
fi

if [[ -f "$ROOT_DIR/md-os/os/build_health_dashboard.js" ]]; then
  node "$ROOT_DIR/md-os/os/build_health_dashboard.js"
fi

if [[ -f "$ROOT_DIR/docs/papers/text_native_agentic_os_paper.pdf" ]]; then
  echo "review generated paper artifact: docs/papers/text_native_agentic_os_paper.pdf"
fi
