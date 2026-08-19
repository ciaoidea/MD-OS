#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

if [[ $# -ne 1 || -z "${1// }" ]]; then
  printf '%s\n' 'Usage: npm run connector:vector:setup -- "Wi-Fi name"' >&2
  exit 64
fi

SSID=$1
printf '%s\n' 'Installing the complete Cortex-Vector connector...'
bash "$SCRIPT_DIR/install.sh" --system-service

printf '%s\n' 'Put Vector in pairing mode so its six-digit PIN is visible.'
printf '%s\n' 'The PIN and Wi-Fi password will be requested privately and will not be stored.'
"$HOME/.local/bin/vector-cli" wifi "$SSID"

printf '%s\n' 'VECTOR_CONNECTOR_SETUP_OK'
