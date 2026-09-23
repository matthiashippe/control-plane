#!/usr/bin/env bash
# Read-only status report of the running control plane, as JSON. Changes nothing, starts nothing.
#   OPENROUTER_API_KEY=... ops/status.sh
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
CP_URL="${CP_URL:-https://cp.hippe.eu}"
HOSTNAME_ONLY="${CP_URL#https://}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SSH=(ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$HOST")

# What counts as an error in the log, in one place, because a test reads this line and checks it
# against what the service actually writes.
#
# It used to be "provider_unavailable|settlement_failed|internal_error", and "internal_error" is
# the word in the RESPONSE body of a 500, never in the log. app.onError writes
# `[app] <method> <path>: <stack>`, so a 500 whose stack does not happen to contain that word was
# not counted, which is every 500. The counter could only ever report zero for the one class of
# failure it exists to report. It has reported zero for three days, and there really were none:
# zero `[app]` lines in seven days. A number that is right by luck is not a measurement.
# An extended regular expression: grep gets -E below, because without it the pipe is a literal
# character and the whole pattern matches nothing at all. That is the same blindness in a
# different disguise, and it is why the pattern and the -E live next to each other.
CP_ERROR_PATTERN="${CP_ERROR_PATTERN:-\[app\] |provider_unavailable|settlement_failed}"

health_code=$(curl -s -m 10 -o /tmp/cp-health.$$ -w '%{http_code}' "$CP_URL/health" 2>/dev/null || echo 000)
health_body=$(cat /tmp/cp-health.$$ 2>/dev/null); rm -f /tmp/cp-health.$$
cert_end=$(echo | openssl s_client -servername "$HOSTNAME_ONLY" -connect "$HOSTNAME_ONLY:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
# Eight placeholders for eight values. printf repeats its format when it is handed more arguments
# than it has slots, so the five-slot version silently joined field five and six without a
# separator and the parser then tried to read the Docker summary as an integer. The count of %s
# has to match the count of arguments below, and that is the only reason this line is worth a
# comment.
vm_stats=$("${SSH[@]}" 'cd /opt/control-plane/repo/deploy && printf "%s|%s|%s|%s|%s|%s|%s|%s" \
  "$(docker compose -f docker-compose.prod.yml ps --format "{{.Service}}:{{.State}}" | paste -sd, -)" \
  "$(df -h / | awk "NR==2{print \$5}")" \
  "$(free -m | awk "NR==2{printf \"%d/%d\", \$3, \$2}")" \
  "$(docker inspect deploy-cp-1 --format "{{.RestartCount}}" 2>/dev/null || echo -1)" \
  "$(docker compose -f docker-compose.prod.yml logs --since 24h cp 2>/dev/null | grep -ciE "'"$CP_ERROR_PATTERN"'" | head -1)" \
  "$(df -BM / | awk "NR==2{print \$4}" | tr -d M)" \
  "$(docker system df --format "{{.Type}}={{.Size}}" 2>/dev/null | paste -sd, -)" \
  "$(docker exec deploy-caddy-1 stat -c %s /var/log/caddy/access.log 2>/dev/null || echo 0)"' 2>/dev/null)
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
# Five fields until 2026-09-23, eight after. `== 5` silently produced an empty vm block against
# the longer line, which reads as "the VM did not answer" when the VM answered perfectly. A length
# check that fails closed on its own extension is worse than no check.
if len(parts) >= 5:
    num = lambda x, d=0: int((x or "").strip().splitlines()[0]) if (x or "").strip() else d
    # A percentage on its own warns of nothing: 15 % today and 15 % tomorrow, until it is 90 %.
    # What grows here is the Docker build cache, one layer set per deploy, and the access log,
    # about 10 MB a day with nothing rotating it. Measured on 2026-09-23: 41 GB free, 3.9 GB of
    # build cache with 3.3 GB reclaimable, and a 30 MB log. Nothing to do yet, and the numbers are
    # printed so the day there is something to do arrives as a reading and not as an outage.
    vm = {
        "compose": parts[0],
        "disk_used": parts[1],
        "mem_mb": parts[2],
        "restarts": num(parts[3], -1),
        "errors_24h": num(parts[4]),
        "disk_free_mb": num(parts[5]) if len(parts) > 5 else None,
        "docker": parts[6] if len(parts) > 6 else "",
        "access_log_mb": round(num(parts[7]) / 1048576, 1) if len(parts) > 7 else None,
    }
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
