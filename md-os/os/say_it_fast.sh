#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <text>" >&2
  exit 1
fi

TEXT="$*"
VOICE_NAME="${MDOS_AUDIO_SAY_VOICE:-Italian+sandro}"
SPEECH_RATE="${MDOS_AUDIO_SAY_RATE:--10}"

if ! spd-say -l it -y "$VOICE_NAME" -r "$SPEECH_RATE" --wait "$TEXT"; then
  spd-say -l it --wait "$TEXT"
fi
