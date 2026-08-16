#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <text>" >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
TTS_SCRIPT="$ROOT_DIR/md-os/os/tts_it_fast.sh"
KOKORO_SCRIPT="$ROOT_DIR/md-os/os/kokoro_speak.sh"
SAY_SCRIPT="$ROOT_DIR/md-os/os/say_it_fast.sh"
VOICE_ENGINE="${MDOS_AUDIO_SPEAK_VOICE:-say}"

run_tts() {
  [[ -x "$TTS_SCRIPT" ]] && "$TTS_SCRIPT" "$*"
}

run_kokoro() {
  [[ -x "$KOKORO_SCRIPT" ]] && "$KOKORO_SCRIPT" "$*"
}

run_say() {
  exec "$SAY_SCRIPT" "$*"
}

case "$VOICE_ENGINE" in
  kokoro)
    run_kokoro
    ;;
  tts|gtts)
    if run_tts; then
      exit 0
    fi
    run_say
    ;;
  say|system|spd)
    if [[ -x "$SAY_SCRIPT" ]] && "$SAY_SCRIPT" "$*"; then
      exit 0
    fi
    run_tts
    ;;
  default|auto)
    if [[ -x "$SAY_SCRIPT" ]] && "$SAY_SCRIPT" "$*"; then
      exit 0
    fi
    run_tts
    ;;
  *)
    echo "unsupported MDOS_AUDIO_SPEAK_VOICE: $VOICE_ENGINE" >&2
    exit 1
    ;;
esac
