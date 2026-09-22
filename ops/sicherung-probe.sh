#!/usr/bin/env bash
# Does a backup actually come back up as a service?
#
# `ops/backup.sh` runs nightly, checks `integrity_check` and reconciles the ledger against the
# balances, and `test/backup.test.ts` covers the WAL handling in detail. All of that says the file
# is a sound database. None of it says the service starts on it.
#
# The deploy canary is not that proof either: it boots the new image against a copy of the LIVE
# database, which is the file the running service already holds open. The backup, the thing that
# would actually be reached for after a disk failure, has never been booted. A backup nobody has
# restored is a hope.
#
# So: newest backup, throwaway container, no published ports, answer from inside, then gone. The
# live service is not touched at any point and the copy is read from a temporary directory.
#
#   ops/sicherung-probe.sh            newest backup
#   ops/sicherung-probe.sh --oldest   the oldest one still kept, which is the older format risk
set -euo pipefail

KEY="${CP_SSH_KEY:-$HOME/.ssh/id_ed25519_automaton}"
HOST="${CP_HOST:-root@76.13.144.207}"
PICK="tail -1"
[[ "${1:-}" == "--oldest" ]] && PICK="head -1"

ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST" bash -s <<REMOTE
set -euo pipefail
source_db=\$(ls -1 /opt/control-plane/backups/cp-*.db 2>/dev/null | sort | $PICK)
[[ -n "\$source_db" ]] || { echo "FAILED  no backup in /opt/control-plane/backups"; exit 1; }
echo "probe:  \$(basename "\$source_db"), \$(stat -c %s "\$source_db") bytes, written \$(stat -c %y "\$source_db" | cut -d. -f1)"

workdir=\$(mktemp -d)
trap 'rm -rf "\$workdir"; docker rm -f cp-restore-probe >/dev/null 2>&1 || true' EXIT
cp "\$source_db" "\$workdir/cp.db"
chmod 666 "\$workdir/cp.db"

# No published ports and a name of its own: this must not be reachable from outside and must not
# collide with the running container. The environment comes from the same file the service uses,
# because a backup that only boots without credentials proves nothing about the real start path.
docker run -d --name cp-restore-probe \
  --env-file /opt/control-plane/.env \
  -e CP_DB_PATH=/data/cp.db -e CP_HOST=0.0.0.0 -e CP_PORT=8402 \
  -v "\$workdir":/data \
  control-plane:latest >/dev/null

# Asked with node, not with curl or wget: the image carries neither. The first version of this
# probe used wget, got nothing back, and reported that the service had not come up while its own
# start line stood in the log two lines below. A probe that cannot ask is not a failing service.
ask() {
  docker exec cp-restore-probe node -e "
    fetch('http://127.0.0.1:8402'+process.argv[1]).then(r=>r.text()).then(t=>console.log(t)).catch(()=>process.exit(1));
  " "\$1" 2>/dev/null || true
}

for i in \$(seq 1 30); do
  [[ -n "\$(ask /health)" ]] && break
  sleep 1
done

answer=\$(ask /health)
if [[ "\$answer" != *'"ok":true'* ]]; then
  echo "FAILED  the service did not come up on the backup"
  docker logs cp-restore-probe 2>&1 | tail -15
  exit 1
fi
echo "ok      /health on the restored copy: \$answer"

status=\$(ask /v1/status)
[[ -n "\$status" ]] && echo "ok      /v1/status answers as well, \$(printf '%s' "\$status" | head -c 60)…"

# The numbers have to match the file, not the live service: a backup is older by design.
docker exec cp-restore-probe node -e '
const db = require("better-sqlite3")("/data/cp.db", { readonly: true });
const one = (sql) => db.prepare(sql).get();
const w = one("select count(*) n, coalesce(sum(balance_mc),0) s from wallets");
const l = one("select coalesce(sum(delta_mc),0) s from ledger");
const b = one("select count(*) n from bounties");
console.log(\`ok      restored content: \${w.n} wallets, \${w.s} mc, ledger sum \${l.s}, \${b.n} bounties\`);
if (w.s !== l.s) { console.log("FAILED  balances and ledger disagree in the backup"); process.exit(1); }
console.log("ok      balances and ledger agree");
'
echo "RESTORE PROBE OK"
REMOTE

# A stamp, for the same reason ops/neuling-probe.ts writes one: a probe that does not run every
# cycle ages in silence, and on 2026-09-22 its last result had to be dug out of the protocol
# rather than read off. ops/check-all.sh prints how old this is and how many commits have landed.
mkdir -p "${CP_PROBE_STAMPS:-.scratch/probes}"
printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(git rev-parse --short HEAD)" \
  > "${CP_PROBE_STAMPS:-.scratch/probes}/sicherung"
