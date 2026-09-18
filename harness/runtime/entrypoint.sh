#!/usr/bin/env bash
# Kommandos: provision | run | health | shell
set -euo pipefail
cd /opt/automaton
API="${CONWAY_API_URL:?CONWAY_API_URL fehlt}"

case "${1:-run}" in
  health)
    node -e '
      const url = process.env.CONWAY_API_URL + "/health";
      fetch(url).then(async (r) => { console.log(r.status, await r.text()); process.exit(r.ok ? 0 : 1); })
        .catch((e) => { console.error("health failed:", e.message); process.exit(1); });'
    ;;
  provision)
    # 1. Wallet anlegen (Upstream-CLI), 2. automaton.json ohne Key (Headless-Setup),
    # 3. SIWE-Provisionierung gegen das Control Plane (schreibt config.json mit dem Key).
    node dist/index.js --init
    node /opt/harness/setup-headless.mjs /setup.json
    node dist/index.js --provision
    echo "PROVISION_RESULT $(cat "$HOME/.automaton/config.json")"
    ;;
  run)
    exec node dist/index.js --run
    ;;
  shell)
    exec bash
    ;;
  *)
    exec "$@"
    ;;
esac
