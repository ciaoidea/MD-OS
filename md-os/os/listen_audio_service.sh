#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_PY="$ROOT_DIR/.venv-stt/bin/python"

if [[ ! -x "$VENV_PY" ]]; then
  echo "missing virtualenv: $VENV_PY" >&2
  exit 1
fi

exec "$VENV_PY" "$ROOT_DIR/md-os/os/audio_listen_service.py" "$@"
