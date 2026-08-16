#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
LISTEN_SCRIPT="$ROOT_DIR/md-os/os/listen_it_fast.sh"
TTS_SCRIPT="$ROOT_DIR/md-os/os/tts_it_fast.sh"
CAMERA_DIR="$ROOT_DIR/md-os/ops/local/hardware/camera"
CAMERA_FILE="$CAMERA_DIR/voice_camera_latest.jpg"

MAX_SECONDS="${1:-15}"

if [[ ! -x "$LISTEN_SCRIPT" ]]; then
  echo "missing listener: $LISTEN_SCRIPT" >&2
  exit 1
fi

TRANSCRIPT="$("$LISTEN_SCRIPT" "$MAX_SECONDS" | tail -n 1 | tr -d '\r')"
printf '%s\n' "$TRANSCRIPT"

if python3 - "$TRANSCRIPT" <<'PY'
import re
import sys

text = (sys.argv[1] or "").lower()
needs_camera = bool(re.search(r"\b(camera|cam|telecamera|fotocamera|guarda|vedi|vedimi|mostra|cosa vedi|cosa c'?è|cosa c'e)\b", text))
sys.exit(0 if needs_camera else 1)
PY
then
  mkdir -p "$CAMERA_DIR"
  ffmpeg -hide_banner -loglevel error -y -f v4l2 -i /dev/video0 -frames:v 1 "$CAMERA_FILE"
  echo "$CAMERA_FILE"
  if [[ -x "$TTS_SCRIPT" ]]; then
    "$TTS_SCRIPT" "Ho ascoltato una richiesta per la telecamera e ho catturato un frame."
  fi
fi
