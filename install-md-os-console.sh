#!/usr/bin/env bash
set -euo pipefail

REPOSITORY_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
CONSOLE_SOURCE="$REPOSITORY_DIR/md-os/os/mdos_console.js"
USER_BIN_DIR="${XDG_BIN_HOME:-${HOME}/.local/bin}"
CONSOLE_TARGET="$USER_BIN_DIR/mdos-console"

usage() {
  printf '%s\n' \
    'Usage:' \
    '  ./install-md-os-console.sh' \
    '  ./install-md-os-console.sh --uninstall' \
    '' \
    'Installs a user-local mdos-console command that always opens this MD-OS workspace.'
}

if [[ "${1:-}" == '--help' || "${1:-}" == '-h' ]]; then
  usage
  exit 0
fi

if [[ ! -x "$CONSOLE_SOURCE" ]]; then
  printf 'ERROR: console runtime is not executable: %s\n' "$CONSOLE_SOURCE" >&2
  exit 66
fi

if [[ "${1:-}" == '--uninstall' ]]; then
  if [[ -L "$CONSOLE_TARGET" && "$(readlink "$CONSOLE_TARGET")" == "$CONSOLE_SOURCE" ]]; then
    rm -- "$CONSOLE_TARGET"
    printf 'Removed %s\n' "$CONSOLE_TARGET"
    exit 0
  fi
  printf 'ERROR: refusing to remove a command not owned by this workspace: %s\n' "$CONSOLE_TARGET" >&2
  exit 73
fi

if [[ -n "${1:-}" ]]; then
  usage >&2
  exit 64
fi

mkdir -p -- "$USER_BIN_DIR"

if [[ -e "$CONSOLE_TARGET" || -L "$CONSOLE_TARGET" ]]; then
  if [[ -L "$CONSOLE_TARGET" && "$(readlink "$CONSOLE_TARGET")" == "$CONSOLE_SOURCE" ]]; then
    printf 'Already installed: %s\n' "$CONSOLE_TARGET"
  else
    printf 'ERROR: target already exists; refusing to overwrite it: %s\n' "$CONSOLE_TARGET" >&2
    exit 73
  fi
else
  ln -s -- "$CONSOLE_SOURCE" "$CONSOLE_TARGET"
  printf 'Installed %s -> %s\n' "$CONSOLE_TARGET" "$CONSOLE_SOURCE"
fi

case ":${PATH}:" in
  *":${USER_BIN_DIR}:"*)
    printf '%s\n' 'Run from any directory: mdos-console'
    ;;
  *)
    printf '%s\n' \
      "Add this directory to your PATH: $USER_BIN_DIR" \
      "Then run from any directory: mdos-console"
    ;;
esac
