#!/usr/bin/env bash
# Is the account (konto) ready to be switched on? Read-only, changes nothing on the server.
#   ops/konto-ready.sh
#
# Checks the values of docs/konto/euro.md, section "Für konto 06", point 4, in /opt/control-plane/.env on the server and
# prints one line per name: `<NAME> set`, `<NAME> missing` or `<NAME> wrong` (CP_KONTO_RPC_URL is free: `set` or
# `default`; CP_BRIDGE_URL and CP_BRIDGE_KEY_FILE: `set` or `empty`), then `key_file readable` or `key_file unreadable`,
# tested inside the running container, because the container only sees its own paths, and last `container current`
# or `container stale`: whether the running container `cp` has the same value as the file for every CP_KONTO_* name (a
# name absent in both counts as equal). deploy.yml only rolls out when the runtime path changed, so a value set in the
# file reaches the service only after a forced rollout; until then the service still answers 503 konto_unavailable.
#
# No value ever leaves the server: this file is sent over ssh to `bash -s`, it picks single lines out of the env file
# with grep by name and compares them right there, and only the words above come back.
#
# Exit 0 when every required line says `set`, the key file is readable and the container is current, 1 otherwise, 2 with `ssh failed` when the
# server could not be asked. The bridge values do not change the exit, they come after konto 16.
set -uo pipefail

if [[ "${1:-}" == "--on-server" ]]; then
  # CP_READY_ENV_FILE exists for the offline test only; ssh does not carry it, so on the server the default applies.
  ENV_FILE="${CP_READY_ENV_FILE:-/opt/control-plane/.env}"
  COMPOSE_FILE="/opt/control-plane/repo/deploy/docker-compose.prod.yml"

  # The value of the last line `NAME=...` (compose reads the last one too), without surrounding quotes. Kept in a
  # variable on the server and never printed.
  value_of() {
    local v
    v=$(grep -E "^[[:space:]]*$1=" "$ENV_FILE" 2>/dev/null | sed -n '$s/^[^=]*=//p')
    v="${v%$'\r'}"
    if [[ "$v" == \"*\" || "$v" == \'*\' ]]; then v="${v:1:${#v}-2}"; fi
    printf '%s' "$v"
  }
  has_name() { grep -qE "^[[:space:]]*$1=" "$ENV_FILE" 2>/dev/null; }

  ready=0
  # A required name: missing when absent or empty, wrong when it must be one value and is another.
  required() {
    local name="$1" want="${2:-}" v
    v=$(value_of "$name")
    if ! has_name "$name" || [[ -z "$v" ]]; then
      echo "$name missing"; ready=1
    elif [[ -n "$want" && "$v" != "$want" ]]; then
      echo "$name wrong"; ready=1
    else
      echo "$name set"
    fi
  }
  optional() {
    local name="$1" absent="$2"
    if [[ -n "$(value_of "$name")" ]]; then echo "$name set"; else echo "$name $absent"; fi
  }

  if [[ ! -r "$ENV_FILE" ]]; then echo "env_file unreadable"; ready=1; fi
  required CP_KONTO_CHAIN_ID 8453
  required CP_KONTO_MAINNET 1
  optional CP_KONTO_RPC_URL default
  required CP_KONTO_KEY_FILE
  required CP_KONTO_AUTH_PROXY_ID
  optional CP_BRIDGE_URL empty
  optional CP_BRIDGE_KEY_FILE empty

  key_file=$(value_of CP_KONTO_KEY_FILE)
  # stdin from /dev/null: this script itself arrives on stdin, and docker would swallow the rest of it.
  if [[ -n "$key_file" ]] && docker compose -f "$COMPOSE_FILE" exec -T cp test -r "$key_file" </dev/null >/dev/null 2>&1; then
    echo "key_file readable"
  else
    echo "key_file unreadable"; ready=1
  fi

  # The container reads .env through env_file, so each CP_KONTO_* value it runs with must equal the file. Both values
  # stay in variables on the server; only the word comes back.
  container=current
  for name in CP_KONTO_CHAIN_ID CP_KONTO_MAINNET CP_KONTO_RPC_URL CP_KONTO_KEY_FILE CP_KONTO_AUTH_PROXY_ID; do
    file_value=$(value_of "$name")
    running_value=$(docker compose -f "$COMPOSE_FILE" exec -T cp printenv "$name" </dev/null 2>/dev/null)
    if [[ "$file_value" != "$running_value" ]]; then container=stale; fi
  done
  if [[ "$container" == current ]]; then echo "container current"; else echo "container stale"; ready=1; fi
  exit "$ready"
fi

HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
SELF="${BASH_SOURCE[0]}"

out=$(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" 'bash -s -- --on-server' <"$SELF" 2>/dev/null)
rc=$?
if [[ $rc -ne 0 && $rc -ne 1 ]] || [[ -z "$out" ]]; then
  echo "ssh failed"
  exit 2
fi
printf '%s\n' "$out"
exit "$rc"
