#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="${MDOS_DEMO_PACKAGE_DIR:-$ROOT_DIR/.cache/md-os-v5.0-demo}"

if [[ -e "$TARGET_DIR" ]]; then
  echo "demo target already exists: $TARGET_DIR" >&2
  echo "set MDOS_DEMO_PACKAGE_DIR to an empty path for another demo workspace" >&2
  exit 1
fi

node "$ROOT_DIR/md-os/os/mdos.js" init "$TARGET_DIR"
echo "demo workspace: $TARGET_DIR"
