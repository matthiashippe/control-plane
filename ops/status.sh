#!/usr/bin/env bash
# Lesender Statusbericht des laufenden Control Plane als JSON. Ändert nichts, startet nichts.
#   OPENROUTER_API_KEY=... ops/status.sh
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
CP_URL="${CP_URL:-https://cp.hippe.eu}"
HOSTNAME_ONLY="${CP_URL#https://}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST")

health_code=$(curl -s -m 10 -o /tmp/cp-health.$$ -w '%{http_code}' "$CP_URL/health" 2>/dev/null || echo 000)
health_body=$(cat /tmp/cp-health.$$ 2>/dev/null); rm -f /tmp/cp-health.$$
cert_end=$(echo | openssl s_client -servername "$HOSTNAME_ONLY" -connect "$HOSTNAME_ONLY:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
vm_stats=$("${SSH[@]}" 'cd /opt/control-plane/repo/deploy && printf "%s|%s|%s|%s|%s" \
  "$(docker compose -f docker-compose.prod.yml ps --format "{{.Service}}:{{.State}}" | paste -sd, -)" \
  "$(df -h / | awk "NR==2{print \$5}")" \
  "$(free -m | awk "NR==2{printf \"%d/%d\", \$3, \$2}")" \
  "$(docker inspect deploy-cp-1 --format "{{.RestartCount}}" 2>/dev/null || echo -1)" \
  "$(docker compose -f docker-compose.prod.yml logs --since 24h cp 2>/dev/null | grep -ci "provider_unavailable\|settlement_failed\|internal_error" | head -1)"' 2>/dev/null)
db_json=$("${SSH[@]}" 'cd /opt/control-plane/repo/deploy && docker compose -f docker-compose.prod.yml exec -T cp node -' < "$DIR/db-report.cjs" 2>/dev/null)
or_json=$(curl -s -m 10 https://openrouter.ai/api/v1/credits -H "Authorization: Bearer ${OPENROUTER_API_KEY:-none}" 2>/dev/null)
payto_hex=$(curl -s -m 10 -X POST https://mainnet.base.org -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x70a08231000000000000000000000000914102284463F4F58B1D2f6DB9aC80BFcaA7d614"},"latest"]}' 2>/dev/null)

HEALTH_CODE="$health_code" HEALTH_BODY="$health_body" CERT_END="$cert_end" VM_STATS="$vm_stats" \
DB_JSON="$db_json" OR_JSON="$or_json" PAYTO_HEX="$payto_hex" python3 <<'PY'
import os, json, datetime
def j(s, default=None):
    try: return json.loads(s)
    except Exception: return default
cert_days = None
if os.environ.get("CERT_END"):
    try:
        end = datetime.datetime.strptime(os.environ["CERT_END"].strip(), "%b %d %H:%M:%S %Y %Z").replace(tzinfo=datetime.timezone.utc)
        cert_days = (end - datetime.datetime.now(datetime.timezone.utc)).days
    except Exception: pass
vm = {}
parts = os.environ.get("VM_STATS", "").split("|")
if len(parts) == 5:
    num = lambda x, d=0: int((x or "").strip().splitlines()[0]) if (x or "").strip() else d
    vm = {"compose": parts[0], "disk_used": parts[1], "mem_mb": parts[2], "restarts": num(parts[3], -1), "errors_24h": num(parts[4])}
orc = j(os.environ.get("OR_JSON", ""), {}) or {}
ord_ = orc.get("data", {})
payto = None
pay = j(os.environ.get("PAYTO_HEX", ""), {}) or {}
if pay.get("result"): payto = int(pay["result"], 16) / 1e6
print(json.dumps({
    "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "health": {"status": int(os.environ.get("HEALTH_CODE", 0)), "body": os.environ.get("HEALTH_BODY", "")},
    "cert_days_left": cert_days,
    "vm": vm,
    "db": j(os.environ.get("DB_JSON", ""), {}),
    "openrouter": {"credits": ord_.get("total_credits"), "usage": round(ord_.get("total_usage", 0), 4),
                   "left": round(ord_.get("total_credits", 0) - ord_.get("total_usage", 0), 4)} if ord_ else None,
    "payto_usdc_base": payto,
}, indent=2))
PY
