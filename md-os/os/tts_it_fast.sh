#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <text>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_PY="$ROOT_DIR/.venv-tts/bin/python"
TMP_DIR="${TMPDIR:-/tmp}/mdos-tts"
MP3_FILE="$TMP_DIR/tts_it_fast.mp3"

mkdir -p "$TMP_DIR"

if [[ ! -x "$VENV_PY" ]]; then
  echo "missing virtualenv: $VENV_PY" >&2
  exit 1
fi

TEXT="$*"
export MDOS_TTS_TEXT="$TEXT"
export MDOS_TTS_MP3="$MP3_FILE"

"$VENV_PY" - <<'PY'
import os
from gtts import gTTS

text = os.environ["MDOS_TTS_TEXT"]
out = os.environ["MDOS_TTS_MP3"]
gTTS(text=text, lang='it', slow=False).save(out)
PY

ffmpeg -loglevel error -y -i "$MP3_FILE" -f wav - 2>/dev/null | aplay
