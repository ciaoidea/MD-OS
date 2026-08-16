#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <text>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
VENV_PY="${MDOS_KOKORO_PYTHON:-$ROOT_DIR/md-os/ops/local/audio/kokoro/runtime/.venv/bin/python}"
KOKORO_DIR="${MDOS_KOKORO_CACHE:-$ROOT_DIR/md-os/ops/local/audio/kokoro/cache}"
MODEL_NAME="${MDOS_KOKORO_MODEL:-kokoro-v1.0.int8.onnx}"
VOICES_NAME="${MDOS_KOKORO_VOICES:-voices-v1.0.bin}"
VOICE_NAME="${MDOS_KOKORO_VOICE:-am_michael}"
LANGUAGE="${MDOS_KOKORO_LANGUAGE:-en-us}"
SPEED="${MDOS_KOKORO_SPEED:-1.15}"
PITCH="${MDOS_KOKORO_PITCH:-1.0}"
NO_PLAY="${MDOS_KOKORO_NO_PLAY:-0}"
OUTPUT_WAV="${MDOS_KOKORO_OUTPUT_WAV:-${TMPDIR:-/tmp}/mdos-kokoro/kokoro.wav}"
MODEL_URL="${MDOS_KOKORO_MODEL_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.int8.onnx}"
VOICES_URL="${MDOS_KOKORO_VOICES_URL:-https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin}"
AUTO_DOWNLOAD="${MDOS_KOKORO_AUTO_DOWNLOAD:-0}"

mkdir -p "$KOKORO_DIR" "$(dirname "$OUTPUT_WAV")"

if [[ ! -x "$VENV_PY" ]]; then
  echo "missing virtualenv: $VENV_PY" >&2
  exit 1
fi

MODEL_PATH="$KOKORO_DIR/$MODEL_NAME"
VOICES_PATH="$KOKORO_DIR/$VOICES_NAME"

if [[ ! -f "$MODEL_PATH" && "$AUTO_DOWNLOAD" != "1" ]]; then
  echo "missing model file: $MODEL_PATH" >&2
  echo "set MDOS_KOKORO_AUTO_DOWNLOAD=1 to allow an explicit download" >&2
  exit 1
fi

if [[ ! -f "$VOICES_PATH" && "$AUTO_DOWNLOAD" != "1" ]]; then
  echo "missing voices file: $VOICES_PATH" >&2
  echo "set MDOS_KOKORO_AUTO_DOWNLOAD=1 to allow an explicit download" >&2
  exit 1
fi

if [[ ! -f "$MODEL_PATH" ]]; then
  echo "downloading Kokoro model to $MODEL_PATH" >&2
  curl -fL --retry 3 --retry-delay 2 "$MODEL_URL" -o "$MODEL_PATH"
fi

if [[ ! -f "$VOICES_PATH" ]]; then
  echo "downloading Kokoro voices to $VOICES_PATH" >&2
  curl -fL --retry 3 --retry-delay 2 "$VOICES_URL" -o "$VOICES_PATH"
fi

TEXT="$*"
export MDOS_KOKORO_TEXT="$TEXT"
export MDOS_KOKORO_MODEL_PATH="$MODEL_PATH"
export MDOS_KOKORO_VOICES_PATH="$VOICES_PATH"
export MDOS_KOKORO_VOICE_NAME="$VOICE_NAME"
export MDOS_KOKORO_LANGUAGE="$LANGUAGE"
export MDOS_KOKORO_SPEED="$SPEED"
export MDOS_KOKORO_PITCH="$PITCH"
export MDOS_KOKORO_OUTPUT_WAV="$OUTPUT_WAV"

"$VENV_PY" - <<'PY'
import os
from pathlib import Path

import soundfile as sf
from kokoro_onnx import Kokoro

text = os.environ["MDOS_KOKORO_TEXT"]
model_path = os.environ["MDOS_KOKORO_MODEL_PATH"]
voices_path = os.environ["MDOS_KOKORO_VOICES_PATH"]
voice_name = os.environ["MDOS_KOKORO_VOICE_NAME"]
language = os.environ["MDOS_KOKORO_LANGUAGE"]
speed = float(os.environ["MDOS_KOKORO_SPEED"])
pitch = float(os.environ["MDOS_KOKORO_PITCH"])
output_wav = Path(os.environ["MDOS_KOKORO_OUTPUT_WAV"])

kokoro = Kokoro(model_path, voices_path)
voices = kokoro.get_voices()
if voice_name not in voices:
    raise ValueError(f"unknown voice: {voice_name}. Available voices: {', '.join(sorted(voices))}")

audio, sample_rate = kokoro.create(
    text=text,
    voice=voice_name,
    speed=speed,
    lang=language,
)
sf.write(output_wav, audio, sample_rate)
print(f"pitch={pitch}")
print(f"model={model_path}")
print(f"voices={voices_path}")
print(f"voice={voice_name}")
print(f"language={language}")
print(f"speed={speed}")
print(f"output={output_wav}")
PY

if [[ "$PITCH" != "1" && "$PITCH" != "1.0" ]]; then
  PITCHED_WAV="${OUTPUT_WAV%.wav}.pitched.wav"
  ffmpeg -loglevel error -y -i "$OUTPUT_WAV" -filter:a "asetrate=24000*${PITCH},aresample=24000" "$PITCHED_WAV"
  mv "$PITCHED_WAV" "$OUTPUT_WAV"
fi

if [[ "$NO_PLAY" == "1" ]]; then
  exit 0
fi

if command -v paplay >/dev/null 2>&1; then
  exec paplay "$OUTPUT_WAV"
fi

if command -v pw-play >/dev/null 2>&1; then
  exec pw-play "$OUTPUT_WAV"
fi

if command -v aplay >/dev/null 2>&1; then
  exec aplay "$OUTPUT_WAV"
fi

exec ffplay -nodisp -autoexit -loglevel error "$OUTPUT_WAV"
