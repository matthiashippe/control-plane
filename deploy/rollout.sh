#!/usr/bin/env bash
# Update des laufenden Dienstes mit dem kürzestmöglichen Ausfall.
#   deploy/rollout.sh            (Host aus CP_DEPLOY_HOST, Default root@76.13.144.207)
#
# Unterschied zu deploy/up.sh: `up.sh` fährt `up -d --build` und mischt damit Bauen und Umschalten.
# Schlägt der Build oder der Start des neuen Containers fehl, ist der alte längst zerstört und der
# Dienst ganz weg; genau so war er am 19.09.2026 dreimal nicht erreichbar. Hier wird erst gebaut,
# dann das neue Image an einem Kanarienvogel gegen eine Kopie der Datenbank bewiesen, und erst dann
# umgeschaltet. Geht unterwegs etwas schief, bleibt der alte Container stehen.
#
# `up.sh` bleibt für den Kaltstart: Erstinstallation, oder wenn der Dienst schon unten ist und es
# nichts gibt, worauf man zurückfallen könnte.
#
# Was das Skript NICHT kann: echten Parallelbetrieb. Warum, steht in deploy/README.md unter
# "Warum kein echtes Blau/Grün".
set -euo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
CP_URL="${CP_URL:-https://cp.hippe.eu}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

# Vor dem Deploy von außen nachsehen. Ist der Dienst schon kaputt, ist dieses Skript das falsche
# Werkzeug, und der Ausfall danach wäre fälschlich dem Deploy zugeschrieben worden.
vorher="$(curl -s -m 10 -o /dev/null -w '%{http_code}' "$CP_URL/health" || echo 000)"
if [[ "$vorher" != "200" ]]; then
  echo "ABBRUCH: $CP_URL/health antwortet mit $vorher, nicht 200."
  echo "Der Dienst ist bereits gestört. Erst ops/status.sh ansehen; für einen Kaltstart deploy/up.sh."
  exit 1
fi

rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude dist --exclude .git --exclude harness/certs --exclude harness/state \
  --exclude '*.db' --exclude '.env' \
  "$REPO/" "$HOST:/opt/control-plane/repo/"

"${SSH[@]}" bash -s <<REMOTE
set -euo pipefail
cd /opt/control-plane/repo/deploy
[[ -f /opt/control-plane/.env ]] || { echo "FEHLT: /opt/control-plane/.env (siehe .env.example)"; exit 1; }
ln -sf /opt/control-plane/.env .env
export CP_HEALTH_TIMEOUT="${CP_HEALTH_TIMEOUT:-150}"
export CP_QUIESCE_TIMEOUT="${CP_QUIESCE_TIMEOUT:-90}"
export CP_CANARY="${CP_CANARY:-1}"
bash rollout-remote.sh
REMOTE

# Der Beweis steht nicht in `docker ps`, sondern draußen: Caddy, TLS und der Dienst zusammen.
nachher="$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$CP_URL/health" || echo 000)"
echo "[rollout] $CP_URL/health -> $nachher"
[[ "$nachher" == "200" ]] || { echo "ABBRUCH: Von außen antwortet der Dienst nicht. Sofort nachsehen."; exit 1; }
# Der Rauchtest gehört an den Deploy, nicht in eine Anleitung, die man vergisst. Er prüft unter
# anderem, ob Caddy das neue Caddyfile wirklich gelesen hat: Der Unit-Test vergleicht Repo mit
# Repo und kann das nicht beantworten, der Rauchtest rechnet den CSP-Hash gegen das ausgelieferte
# Skript. Ein Fehlschlag hier ist ein Fehlschlag des Deploys.
rauchtest="$(cd "$(dirname "$0")/.." && pwd)/ops/smoke.sh"
if [[ -x "$rauchtest" ]]; then
  echo "[rollout] Rauchtest ..."
  if "$rauchtest" "$CP_URL"; then
    echo "[rollout] Rauchtest bestanden."
  else
    echo "[rollout] ACHTUNG: Rauchtest fehlgeschlagen. Der Dienst antwortet, liefert aber nicht das"
    echo "[rollout] Erwartete. Rückweg: docker tag control-plane:rollback control-plane:latest &&"
    echo "[rollout] docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate cp"
    exit 1
  fi
else
  echo "[rollout] ops/smoke.sh fehlt oder ist nicht ausführbar, Rauchtest übersprungen."
fi
