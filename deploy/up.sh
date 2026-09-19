#!/usr/bin/env bash
# Deploy auf die VM: Repo-Stand per rsync nach /opt/control-plane, dann Compose bauen und starten.
#   deploy/up.sh            (Host aus CP_DEPLOY_HOST, Default root@76.13.144.207)
# Voraussetzung: deploy/setup-vm.sh einmal gelaufen, /opt/control-plane/.env vorhanden.
#
# NUR FÜR DEN KALTSTART: Erstinstallation, oder wenn der Dienst ohnehin schon unten ist.
# `up -d --build` zerstört den alten Container, bevor feststeht, ob der neue hochkommt, und Caddy
# antwortet in dieser Zeit mit 502. Für das Update eines laufenden Dienstes deshalb
# **deploy/rollout.sh** nehmen: baut erst, beweist das Image an einer Kopie der Datenbank und
# schaltet erst dann um. Auch Caddyfile-Änderungen wirken nur über rollout.sh (Inode-Falle, siehe
# deploy/README.md).
set -euo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
SSH=(ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST")

rsync -az --delete -e "ssh -i $KEY -o StrictHostKeyChecking=accept-new" \
  --exclude node_modules --exclude dist --exclude .git --exclude harness/certs --exclude harness/state \
  --exclude '*.db' --exclude '.env' \
  "$REPO/" "$HOST:/opt/control-plane/repo/"

"${SSH[@]}" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/control-plane/repo/deploy
[[ -f /opt/control-plane/.env ]] || { echo "FEHLT: /opt/control-plane/.env (siehe .env.example)"; exit 1; }
ln -sf /opt/control-plane/.env .env
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 5 cp
REMOTE
