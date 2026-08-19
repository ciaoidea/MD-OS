#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
MDOS_WORKSPACE=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)
INSTALL_PREFIX=${VECTOR_CONNECTOR_PREFIX:-"$HOME/.local"}
INSTALL_DIR="$INSTALL_PREFIX/lib/vector-cortex"
BIN_DIR="$INSTALL_PREFIX/bin"
DATA_DIR=${CORTEX_VECTOR_DATA_DIR:-"$HOME/.local/share/vector-cortex"}
SYSTEM_SERVICE=false
INSTALL_STT=true

for argument in "$@"; do
  case "$argument" in
    --system-service) SYSTEM_SERVICE=true ;;
    --without-stt) INSTALL_STT=false ;;
    --help)
      printf '%s\n' 'Usage: install.sh [--system-service] [--without-stt]'
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$argument" >&2
      exit 64
      ;;
  esac
done

for command in go openssl install ln mktemp sed; do
  if ! command -v "$command" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command" >&2
    exit 1
  fi
done

umask 077
mkdir -p "$INSTALL_DIR" "$BIN_DIR" "$DATA_DIR/certs"

printf '%s\n' 'Building Cortex-Vector Wi-Fi/gRPC bridge...'
(cd "$SCRIPT_DIR/bridge" && go build -trimpath -o "$INSTALL_DIR/vector-cortex" .)
printf '%s\n' 'Building Cortex-Vector BLE provisioning tool...'
(cd "$SCRIPT_DIR/provisioning" && go build -trimpath -o "$INSTALL_DIR/vector-cli" .)
if ldd "$INSTALL_DIR/vector-cli" 2>/dev/null | grep -q 'not found'; then
  printf '%s\n' 'The Vector BLE tool requires the host libsodium runtime library.' >&2
  exit 1
fi
install -m 0700 "$SCRIPT_DIR/bridge/transcribe.py" "$INSTALL_DIR/transcribe.py"
ln -sfn "$INSTALL_DIR/vector-cortex" "$BIN_DIR/vector-cortex"
ln -sfn "$INSTALL_DIR/vector-cli" "$BIN_DIR/vector-cli"

CERT_FILE="$DATA_DIR/certs/ep.crt"
KEY_FILE="$DATA_DIR/certs/ep.key"
if [[ ! -s "$CERT_FILE" || ! -s "$KEY_FILE" ]]; then
  printf '%s\n' 'Generating private local TLS certificate...'
  openssl req -x509 -newkey rsa:2048 -sha256 -nodes -days 3650 \
    -subj '/CN=escapepod.local' \
    -addext 'subjectAltName=DNS:escapepod.local' \
    -keyout "$KEY_FILE" -out "$CERT_FILE" >/dev/null 2>&1
  chmod 0600 "$CERT_FILE" "$KEY_FILE"
fi

if [[ "$INSTALL_STT" == true ]]; then
  if ! command -v python3 >/dev/null 2>&1; then
    printf '%s\n' 'python3 is required for local speech recognition' >&2
    exit 1
  fi
  printf '%s\n' 'Installing private local speech recognition...'
  python3 -m venv "$DATA_DIR/stt"
  "$DATA_DIR/stt/bin/python" -m pip install --disable-pip-version-check -r "$SCRIPT_DIR/bridge/requirements.txt"
  printf '%s\n' 'Preparing the local speech model...'
  HF_HOME="$DATA_DIR/models" "$DATA_DIR/stt/bin/python" -c \
    'from faster_whisper import WhisperModel; WhisperModel("base", device="cpu", compute_type="int8")'
fi

if [[ "$SYSTEM_SERVICE" == true ]]; then
  if ! command -v systemctl >/dev/null 2>&1; then
    printf '%s\n' 'systemctl is required for --system-service' >&2
    exit 1
  fi
  if ! command -v sudo >/dev/null 2>&1; then
    printf '%s\n' 'sudo is required to install the system service' >&2
    exit 1
  fi
  SERVICE_TMP=$(mktemp)
  trap 'rm -f "$SERVICE_TMP"' EXIT
  sed \
    -e "s|@USER@|$USER|g" \
    -e "s|@DATA_DIR@|$DATA_DIR|g" \
    -e "s|@INSTALL_DIR@|$INSTALL_DIR|g" \
    -e "s|@MDOS_WORKSPACE@|$MDOS_WORKSPACE|g" \
    "$SCRIPT_DIR/vector-cortex.service.in" >"$SERVICE_TMP"
  sudo install -m 0644 "$SERVICE_TMP" /etc/systemd/system/vector-cortex.service
  sudo systemctl daemon-reload
  sudo systemctl enable vector-cortex.service
  sudo systemctl restart vector-cortex.service
fi

printf 'VECTOR_CONNECTOR_INSTALL_OK install_dir=%s data_dir=%s service=%s stt=%s\n' "$INSTALL_DIR" "$DATA_DIR" "$SYSTEM_SERVICE" "$INSTALL_STT"
printf 'Ensure %s is present in PATH.\n' "$BIN_DIR"
