#!/usr/bin/env bash
# Einmalige Vorbereitung der VM (Ubuntu, Hostinger-Docker-Template): Docker prüfen, UFW, Verzeichnis.
#   deploy/setup-vm.sh
set -euo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
ssh -i "$KEY" -o StrictHostKeyChecking=accept-new "$HOST" bash -s <<'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null
apt-get install -y -qq ufw rsync >/dev/null
ufw allow 22/tcp >/dev/null; ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
ufw --force enable >/dev/null
mkdir -p /opt/control-plane/repo
chmod 700 /opt/control-plane
echo "VM bereit: $(hostname), docker $(docker --version | cut -d' ' -f3), ufw $(ufw status | head -1)"
REMOTE
