#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PYTHON_SYS="${MDOS_LISTEN_PYTHON:-python3}"
VENV_PY="$ROOT_DIR/.venv-stt/bin/python"
WORK_DIR="${MDOS_STT_WORKDIR:-/tmp/mdos-stt}"
HF_HOME_DIR="${MDOS_STT_CACHE:-$ROOT_DIR/.cache/mdos-stt}"
LISTEN_BACKEND="${MDOS_LISTEN_BACKEND:-whisper}"
MAX_SECONDS="${1:-15}"
OUT_WAV="$WORK_DIR/listen_it_fast.wav"

if [[ ! -x "$VENV_PY" ]]; then
  echo "missing virtualenv: $VENV_PY" >&2
  exit 1
fi

mkdir -p "$WORK_DIR" "$HF_HOME_DIR"

LISTEN_OUT="$("$PYTHON_SYS" "$ROOT_DIR/md-os/os/listen_until_silence.py" --out "$OUT_WAV" --max-seconds "$MAX_SECONDS")"
OUT_WAV="${LISTEN_OUT:-$OUT_WAV}"

case "$LISTEN_BACKEND" in
  whisper|default|"")
    HF_HOME="$HF_HOME_DIR" "$VENV_PY" - <<'PY' "$OUT_WAV"
import sys
from faster_whisper import WhisperModel

audio_path = sys.argv[1]
model = WhisperModel("tiny", device="cpu", compute_type="int8")
segments, info = model.transcribe(audio_path, language="it", vad_filter=False, beam_size=1)
text = "".join(segment.text for segment in segments).strip()
print(text)
PY
    ;;
  *)
    echo "unsupported MDOS_LISTEN_BACKEND: $LISTEN_BACKEND" >&2
    exit 1
    ;;
esac
