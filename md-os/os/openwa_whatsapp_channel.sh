#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PROFILE_FILE="$WORKSPACE_ROOT/md-os/ops/connectors/openwa_whatsapp_connector.json"
GATEWAY_WORKSPACE_ROOT="$(
  node -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
      const profile = JSON.parse(fs.readFileSync(file, "utf8"));
      process.stdout.write(
        process.env.OPENWA_GATEWAY_WORKSPACE_ROOT
        || (profile.routing && profile.routing.gateway_workspace_root)
        || ""
      );
    } catch (_) {}
  ' "$PROFILE_FILE"
)"

if [[ -n "$GATEWAY_WORKSPACE_ROOT" && "$GATEWAY_WORKSPACE_ROOT" != "$WORKSPACE_ROOT" ]]; then
  GATEWAY_CHANNEL="$GATEWAY_WORKSPACE_ROOT/md-os/os/openwa_whatsapp_channel.sh"
  case "${1:-help}" in
    start|stop|restart|status|docker-start|docker-stop|docker-status|docker-logs|bridge-start|bridge-stop|bridge-restart|bridge-status|bridge-logs|sessions|qr|snapshot|render-test)
      if [[ -f "$GATEWAY_CHANNEL" ]]; then
        exec bash "$GATEWAY_CHANNEL" "$@"
      fi
      ;;
  esac
fi

cd "$WORKSPACE_ROOT"

OPENWA_DIR="$WORKSPACE_ROOT/md-os/ops/local/openwa_runtime/OpenWA"
OPENWA_COMPOSE_FILE="$OPENWA_DIR/docker-compose.dev.yml"
LOCAL_DIR="$WORKSPACE_ROOT/md-os/ops/local/openwa_whatsapp"
API_KEY_FILE="$OPENWA_DIR/data/.api-key"
UNIT_NAME="openwa-whatsapp-mdos.service"
SESSION_ID="${OPENWA_SESSION_ID:-7af9bd94-c2a6-4ae5-bbd6-60704a8ec6cd}"

export OPENWA_BASE_URL="${OPENWA_BASE_URL:-http://127.0.0.1:2785/api}"
export OPENWA_SESSION_ID="$SESSION_ID"
export OPENWA_CODEX_EXEC="${OPENWA_CODEX_EXEC:-1}"
export OPENWA_CODEX_BIN="${OPENWA_CODEX_BIN:-codex}"
export OPENWA_CODEX_SANDBOX="${OPENWA_CODEX_SANDBOX:-workspace-write}"
export OPENWA_CODEX_TIMEOUT_MS="${OPENWA_CODEX_TIMEOUT_MS:-600000}"

if [[ -z "${OPENWA_API_KEY:-}" && -f "$API_KEY_FILE" ]]; then
  export OPENWA_API_KEY="$(<"$API_KEY_FILE")"
fi

usage() {
  cat <<'USAGE'
Usage:
  bash md-os/os/openwa_whatsapp_channel.sh start
  bash md-os/os/openwa_whatsapp_channel.sh stop
  bash md-os/os/openwa_whatsapp_channel.sh restart
  bash md-os/os/openwa_whatsapp_channel.sh status
  bash md-os/os/openwa_whatsapp_channel.sh docker-start|docker-stop|docker-status|docker-logs
  bash md-os/os/openwa_whatsapp_channel.sh bridge-start|bridge-stop|bridge-restart|bridge-status|bridge-logs
  bash md-os/os/openwa_whatsapp_channel.sh sessions|qr|snapshot|render-test

Layers:
  Docker/OpenWA API: md-os/ops/local/openwa_runtime/OpenWA
  MD-OS bridge:      openwa-whatsapp-mdos.service
  Local state:       md-os/ops/local/openwa_whatsapp
USAGE
}

docker_start() {
  cd "$OPENWA_DIR"
  docker compose -f "$OPENWA_COMPOSE_FILE" up -d --no-build openwa
}

docker_stop() {
  cd "$OPENWA_DIR"
  docker compose -f "$OPENWA_COMPOSE_FILE" down
}

docker_status() {
  cd "$OPENWA_DIR"
  docker compose -f "$OPENWA_COMPOSE_FILE" ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}"
  curl -sS "$OPENWA_BASE_URL/health" || true
  printf '\n'
}

docker_logs() {
  cd "$OPENWA_DIR"
  docker compose -f "$OPENWA_COMPOSE_FILE" logs -f --tail="${OPENWA_LOG_LINES:-120}" openwa
}

bridge_start() {
  systemctl --user start "$UNIT_NAME"
}

bridge_stop() {
  systemctl --user stop "$UNIT_NAME"
}

bridge_restart() {
  systemctl --user restart "$UNIT_NAME"
}

bridge_status() {
  systemctl --user status "$UNIT_NAME" --no-pager || true
  node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_service.js" status
  node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_connector.js" status
}

bridge_logs() {
  tail -f \
    "$LOCAL_DIR/service.log" \
    "$LOCAL_DIR/webhook.log" \
    "$LOCAL_DIR/worker.log"
}

case "${1:-help}" in
  start)
    docker_start
    bridge_start
    bridge_status
    ;;
  stop)
    bridge_stop
    docker_stop
    ;;
  restart)
    bridge_stop || true
    docker_stop || true
    docker_start
    bridge_start
    bridge_status
    ;;
  status)
    docker_status
    bridge_status
    ;;
  docker-start)
    docker_start
    ;;
  docker-stop)
    docker_stop
    ;;
  docker-status)
    docker_status
    ;;
  docker-logs)
    docker_logs
    ;;
  bridge-start)
    bridge_start
    ;;
  bridge-stop)
    bridge_stop
    ;;
  bridge-restart)
    bridge_restart
    ;;
  bridge-status)
    bridge_status
    ;;
  bridge-logs)
    bridge_logs
    ;;
  sessions)
    node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_connector.js" sessions
    ;;
  qr)
    node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_connector.js" get-qr "$SESSION_ID"
    printf 'QR HTML: %s\n' "$LOCAL_DIR/qr/openwa_qr.html"
    ;;
  snapshot)
    node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_connector.js" snapshot
    ;;
  render-test)
    node "$WORKSPACE_ROOT/md-os/os/openwa_whatsapp_connector.js" render-reply \
      "quali sono tutte le utenze di Monfalcone su voismart dammi i numeri di telefono interni nome e cognome delle persone e cellulari in una tabella"
    ;;
  help|-h|--help)
    usage
    ;;
  *)
    usage
    exit 1
    ;;
esac
