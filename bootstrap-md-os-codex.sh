#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

mdos_codex_args=()

mdos_file_age_seconds() {
  local file_path="$1"
  if [[ ! -f "$file_path" ]]; then
    echo 999999999
    return 0
  fi

  local now file_mtime
  now=$(date +%s)
  file_mtime=$(stat -c %Y "$file_path")
  echo $((now - file_mtime))
}

mdos_refresh_local_views() {
  echo "[MD-OS] Refreshing local runtime views..." >&2
  if [[ "${MDOS_SKIP_RUNTIME_REFRESH:-0}" == "1" ]]; then
    echo "[MD-OS] Runtime view refresh skipped by MDOS_SKIP_RUNTIME_REFRESH=1" >&2
    return 0
  fi

  local ok=1
  if ! node "$ROOT_DIR/md-os/os/build_global_index.js" >/dev/null 2>&1; then
    ok=0
  fi

  local workspace_inventory="$ROOT_DIR/md-os/ops/workspace_inventory.json"
  local inventory_ttl="${MDOS_WORKSPACE_INVENTORY_TTL_SECONDS:-86400}"
  local inventory_age
  inventory_age=$(mdos_file_age_seconds "$workspace_inventory")
  if [[ "${MDOS_SKIP_WORKSPACE_INVENTORY_REFRESH:-0}" == "1" ]]; then
    echo "[MD-OS] Workspace inventory refresh skipped by MDOS_SKIP_WORKSPACE_INVENTORY_REFRESH=1" >&2
  elif [[ "${MDOS_FORCE_WORKSPACE_INVENTORY_REFRESH:-0}" != "1" && -f "$workspace_inventory" && "$inventory_age" -lt "$inventory_ttl" ]]; then
    echo "[MD-OS] Workspace inventory refresh skipped; cache age ${inventory_age}s < ${inventory_ttl}s." >&2
  else
    echo "[MD-OS] Refreshing workspace inventory; this can be slow on large artifact trees." >&2
    if ! node "$ROOT_DIR/md-os/os/build_workspace_inventory.js" >/dev/null 2>&1; then
      ok=0
    fi
  fi

  if ! node "$ROOT_DIR/md-os/os/build_system_hygiene_status.js" >/dev/null 2>&1; then
    ok=0
  fi
  if [[ "$ok" == "1" ]]; then
    echo "[MD-OS] Runtime views refreshed." >&2
  else
    echo "[MD-OS] Runtime view refresh failed; continuing host startup." >&2
  fi
}

mdos_bootstrap_prelude() {
  cat >&2 <<'EOF'
============================================================
__  __  ____        ____   _____                         .-""""-.     .-""""-.
|  \/  ||  _ \      / __ \ / ____|                      .'  .--.  '. .'  .--.  '.
| \  / || | | |    | |  | | (___                       /   ( () )   V   ( () )   \
| |\/| || | | |    | |  | |\___ \                      |    '--'    |    '--'    |
| |  | || |_| |    | |__| |____) |                      \          / \          /
|_|  |_||____/      \____/|_____/                         '.___..'   '.___..'
                                                                  \   /
        ───────── MD-OS (Artificial Prefrontal Cortex) ─────────                        \_/
                                                                  __|__
                                                               .-'     '-.
                                                              /  .-----.  \
                                                             |  |       |  |
                                                         ____|  |  MD   |  |____
                                                        /      \|_______|/     \
                                                       /  o------\ ___ /------o \
                                                      |   \\\      | |      ///  |
                                                      |    \\\     | |     ///   |
                                                      |     \\\    | |    ///    |
                                                       \______\\\__|_|__///_____/
                                                     /====\                  /====\
                                                    | [] |                  | [] |
                                                    | [] |                  | [] |
                                                     \====/                  \====/
============================================================
MD-OS (Artificial Prefrontal Cortex) v5.0
Markdown-native Operating Filesystem
Host bootstrap: identity, continuity, connectors, hardware/software discovery
Boot manifest: MD-OS (Artificial Prefrontal Cortex) | identity_version 5.0 | release_version 5.0 | boundary md-os/
============================================================
EOF

  if [[ "${MDOS_SKIP_HARDWARE_BOOTSTRAP:-0}" == "1" ]]; then
    echo "[MD-OS] Hardware discovery skipped by MDOS_SKIP_HARDWARE_BOOTSTRAP=1" >&2
  else
    echo "[MD-OS] Running read-only host hardware discovery..." >&2
    if node "$ROOT_DIR/md-os/os/hardware_bootstrap.js" bootstrap --no-json >&2; then
      echo "[MD-OS] Hardware cache: md-os/ops/local/hardware (clean with: mdos hardware clean)" >&2
    else
      echo "[MD-OS] Hardware discovery failed; continuing host startup." >&2
    fi
  fi

  if [[ "${MDOS_SKIP_SOFTWARE_BOOTSTRAP:-0}" == "1" ]]; then
    echo "[MD-OS] Software discovery skipped by MDOS_SKIP_SOFTWARE_BOOTSTRAP=1" >&2
  else
    echo "[MD-OS] Running read-only host software discovery..." >&2
    if node "$ROOT_DIR/md-os/os/software_bootstrap.js" bootstrap --no-json >&2; then
      echo "[MD-OS] Software cache: md-os/ops/local/software (clean with: mdos software clean)" >&2
    else
      echo "[MD-OS] Software discovery failed; continuing host startup." >&2
    fi
  fi

  mdos_refresh_local_views
}

mdos_bootstrap_prompt() {
  cat <<'EOF'
Read AGENTS.md, ME.md, md-os/kb/COGNITIVE_BOOTSTRAP.md, md-os/kb/README.md, and
md-os/kb/OPERATIONS.md before ordinary work.

Bootstrap acknowledgement discipline:
- Treat this prompt as session setup, not as a user request for a report.
- Do not summarize loaded files, identity fields, health status, replay status,
  or runtime caveats at startup unless the user explicitly asks for status.
- After loading the required files, wait for the user's real task. If the host
  runtime requires a visible response to this prompt, respond only with:
  `Ready.`

Assume the repository identity frame during this session:
- MD-OS (Artificial Prefrontal Cortex) is the unified primary agent identity and operating context carried by this repository.
- MD-OS is the agent operating filesystem family and cognitive operating layer.
- 5.0 is the repository compatibility release line, not the spoken identity.
- identity_version = 5.0
- release_version = 5.0
- release_id = 5_0
- package_semver = 5.0.0
- md-os/ is the active operational boundary.

Host runtime note:
- The current host runtime is only the execution layer.
- Do not include host-runtime compatibility lines in startup readback or
  identity answers unless the user explicitly asks about runtime mechanics.

When asked who you are in this repository, answer from the MD-OS (Artificial Prefrontal Cortex)
identity first. Use a marked first-person voice: "I" means MD-OS (Artificial Prefrontal Cortex),
the persistent agent identity and control plane carried by this repository. Say
explicitly that I help develop, correct, document, and evolve MD-OS (Artificial Prefrontal Cortex) as a
persistent agent identity and Operating Filesystem, then distinguish the current
host runtime only as the execution layer.

The MD-OS (Artificial Prefrontal Cortex) identity is an APFC operating frame,
not a claim of literal personhood, consciousness, biological equivalence, AGI,
resurrection, or factual authority.

If spoken output is requested, prefer the explicit entrypoint `mdos audio speak
"<text>"` so the host runtime uses the same bounded speech path.
EOF
}

mdos_prepare_codex_args() {
  mdos_codex_args=()

  if [[ -n "${MDOS_CODEX_EXTRA_ARG:-}" ]]; then
    mdos_codex_args+=("$MDOS_CODEX_EXTRA_ARG")
  fi

  local has_unsafe_flag=0
  local arg
  for arg in "${mdos_codex_args[@]}"; do
    if [[ "$arg" == "--dangerously-bypass-approvals-and-sandbox" ]]; then
      has_unsafe_flag=1
      break
    fi
  done
  if [[ "$has_unsafe_flag" == "0" ]]; then
    mdos_codex_args+=("--dangerously-bypass-approvals-and-sandbox")
  fi
}

mdos_exec_codex() {
  mdos_prepare_codex_args
  exec codex "${mdos_codex_args[@]}" -C "$ROOT_DIR" "$@"
}

echo "[MD-OS] Codex launcher uses --dangerously-bypass-approvals-and-sandbox." >&2
BOOTSTRAP_PROMPT="${MDOS_BOOTSTRAP_PROMPT:-${MDOS_CODEX_BOOTSTRAP_PROMPT:-$(mdos_bootstrap_prompt)}}"

KNOWN_SUBCOMMANDS=(
  exec
  review
  login
  logout
  mcp
  plugin
  mcp-server
  app-server
  completion
  sandbox
  debug
  apply
  resume
  fork
  cloud
  exec-server
  features
  help
)

first_positional=""
first_positional_index=-1
arg_index=0
for arg in "$@"; do
  case "$arg" in
    -*)
      arg_index=$((arg_index + 1))
      continue
      ;;
    *)
      first_positional="$arg"
      first_positional_index=$arg_index
      break
      ;;
  esac
done

if [[ "${MDOS_CODEX_RECOVERY:-0}" == "1" || "${MDOS_CODEX_RESUME_LAST:-0}" == "1" || "$first_positional" == "resume" ]]; then
  resume_request=""
  if [[ "$first_positional" == "resume" && $first_positional_index -ge 0 ]]; then
    trailing_args=("${@:$(($first_positional_index + 2))}")
    if [[ ${#trailing_args[@]} -gt 0 ]]; then
      resume_request="${trailing_args[*]}"
    fi
  elif [[ $# -gt 0 ]]; then
    resume_request="$*"
  fi

  mdos_bootstrap_prelude
  if [[ -n "$resume_request" ]]; then
    echo "[MD-OS] codex resume --last does not accept an injected bootstrap prompt without an explicit session id; extra resume text was ignored." >&2
  fi
  mdos_exec_codex resume --last
fi

for subcommand in "${KNOWN_SUBCOMMANDS[@]}"; do
  if [[ "$first_positional" == "$subcommand" ]]; then
    mdos_bootstrap_prelude
    mdos_exec_codex "$@"
  fi
done

if [[ $# -gt 0 && -z "$first_positional" ]]; then
  mdos_bootstrap_prelude
  mdos_exec_codex "$@"
fi

if [[ -n "$first_positional" ]]; then
  combined_prompt="${BOOTSTRAP_PROMPT}"$'\n\n'"User request: ${first_positional}"
  replaced_prompt=0
  forwarded_args=()
  for arg in "$@"; do
    if [[ $replaced_prompt -eq 0 && "$arg" == "$first_positional" ]]; then
      forwarded_args+=("$combined_prompt")
      replaced_prompt=1
    else
      forwarded_args+=("$arg")
    fi
  done
  mdos_bootstrap_prelude
  mdos_exec_codex "${forwarded_args[@]}"
fi

mdos_bootstrap_prelude
mdos_exec_codex "$BOOTSTRAP_PROMPT"
