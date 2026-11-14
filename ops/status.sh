#!/usr/bin/env bash
# Read-only status report of the running control plane, as JSON. Changes nothing, starts nothing.
#   OPENROUTER_API_KEY=... CP_ALERT_WEBHOOK=... ops/status.sh
set -uo pipefail
HOST="${CP_DEPLOY_HOST:-root@76.13.144.207}"
KEY="${CP_DEPLOY_KEY:-$HOME/.ssh/id_ed25519_automaton}"
CP_URL="${CP_URL:-https://postyourprice.com}"
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
# Is the alarm path alive? ops/watchdog.sh writes `[WARN] webhook unreachable` for every failed POST to the webhook, and the
# credit warning hangs on that same path. The count runs on the server (the log lives there); CP_WATCHDOG_LOG does not travel
# over ssh, so there the default path applies. Any exit other than 0 (no answer, no log) is "unknown", never a zero.
alarm_count=$("${SSH[@]}" 'bash -s' < "$DIR/webhook-unreachable.sh" 2>/dev/null)
alarm_rc=$?
# The last failed and the last delivered POST (ops/webhook-last.sh): a delivery after the last failure means the path works
# again, so a fifteen-minute failure does not stay red for 24 hours.
alarm_last=$("${SSH[@]}" 'bash -s' < "$DIR/webhook-last.sh" 2>/dev/null)
alarm_last_rc=$?
# Did those deliveries reach the topic? ntfy accepts a POST to any topic, so `[INFO] webhook delivered` does not prove that a
# phone got anything: a wrong or stale topic in the crontab of the server looks exactly like the right one. With
# CP_ALERT_WEBHOOK in the local environment the messages of the topic are read back. ntfy keeps messages in its cache for 12
# hours by default, hence since=12h. The URL goes to curl as a config on stdin (-K -), never as an argument, because arguments
# show up in `ps` on the shared code-host and whoever knows the topic can write to the phone; errors of curl go to /dev/null
# for the same reason. Without CP_ALERT_WEBHOOK nobody is asked and the result is "unknown".
alarm_topic=""
alarm_topic_rc=-
if [ -n "${CP_ALERT_WEBHOOK:-}" ]; then
  topic_url="${CP_ALERT_WEBHOOK%/}/json?poll=1&since=12h"
  topic_url="${topic_url//\\/\\\\}"
  topic_url="${topic_url//\"/\\\"}"
  alarm_topic=$(printf 'url = "%s"\n' "$topic_url" | curl -s --fail -m 10 -K - 2>/dev/null)
  alarm_topic_rc=$?
  unset topic_url
fi
or_json=$(curl -s -m 10 https://openrouter.ai/api/v1/credits -H "Authorization: Bearer ${OPENROUTER_API_KEY:-none}" 2>/dev/null)
payto_hex=$(curl -s -m 10 -X POST https://mainnet.base.org -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","data":"0x70a08231000000000000000000000000914102284463F4F58B1D2f6DB9aC80BFcaA7d614"},"latest"]}' 2>/dev/null)

HEALTH_CODE="$health_code" HEALTH_BODY="$health_body" CERT_END="$cert_end" VM_STATS="$vm_stats" \
DB_JSON="$db_json" OR_JSON="$or_json" PAYTO_HEX="$payto_hex" ALARM_COUNT="$alarm_count" ALARM_RC="$alarm_rc" \
ALARM_LAST="$alarm_last" ALARM_LAST_RC="$alarm_last_rc" ALARM_TOPIC_RC="$alarm_topic_rc" python3 3<<<"$alarm_topic" <<'PY'
import os, json, datetime, re, time
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
# Three lines in 24 hours are fifteen minutes in which no alarm reached anybody (one retry per five-minute run).
alarm_count = None
if os.environ.get("ALARM_RC") == "0" and os.environ.get("ALARM_COUNT", "").strip().isdigit():
    alarm_count = int(os.environ["ALARM_COUNT"].strip())
# Red only while no delivery followed the last failure. Anything unreadable from ops/webhook-last.sh gives null for both
# times and leaves the rule "red from 3" alone, so a fault in that script never turns a red alarm path green.
last_unreachable = last_delivered = None
ts_re = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
last = os.environ.get("ALARM_LAST", "").split()
if os.environ.get("ALARM_LAST_RC") == "0" and len(last) == 2 and all(x == "-" or ts_re.match(x) for x in last):
    last_unreachable, last_delivered = (None if x == "-" else x for x in last)
# The watchdog posts a sign of life in the first run of every UTC day, so two deliveries lie at most 24 hours and a few runs
# apart. A last delivery older than 26 hours means the watchdog no longer runs or no longer posts (crontab gone, script stops
# early, sign of life switched off), even with 0 failed POSTs. Clock from CP_NOW (seconds since 1970) like the scripts.
now = time.time()
if os.environ.get("CP_NOW", "").strip().isdigit():
    now = int(os.environ["CP_NOW"].strip())
delivered_age = None
if last_delivered is not None:
    delivered_at = datetime.datetime.strptime(last_delivered, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
    delivered_age = now - delivered_at.timestamp()
if alarm_count is None:
    alarm_status = "unknown"
elif alarm_count >= 3 and (last_delivered is None or last_unreachable is None or last_delivered < last_unreachable):
    alarm_status = "red"
elif delivered_age is not None and delivered_age > 26 * 3600:
    alarm_status = "red"
else:
    alarm_status = "ok"
# alarm_path.received: what of the watchdog really stands on the topic. The answer comes on fd 3, not in the environment,
# because it names the topic. Only messages titled `control-plane ...` count (the posts of ops/watchdog.sh, not those of
# ops/backup.sh or ops/x402-series.sh); last_alive is the newest titled exactly `control-plane ALIVE`. A failed poll or a
# non-empty line that is no JSON object makes the topic unreadable: "unknown". A delivery from the log is compared only while
# it must still be in the cache of ntfy (12 hours), so only one younger than 11 hours, with 300 seconds for the clocks of the
# server and of ntfy: red when no counted message is at most 300 seconds older than the delivery or later. Red turns
# alarm_path red; unknown leaves it alone, so a run without CP_ALERT_WEBHOOK reports exactly what it reported before.
received = {"last_alive": None, "last_message": None, "status": "unknown"}
if os.environ.get("ALARM_TOPIC_RC") == "0":
    try:
        with os.fdopen(3, encoding="utf-8", errors="replace") as topic:
            lines = topic.read().splitlines()
        sent, alive = [], []
        for line in lines:
            if not line.strip():
                continue
            msg = json.loads(line)
            if not isinstance(msg, dict):
                raise ValueError("not an object")
            title = msg.get("title")
            if msg.get("event") != "message" or not isinstance(title, str) or not title.startswith("control-plane "):
                continue
            sent_at = msg.get("time")
            if isinstance(sent_at, bool) or not isinstance(sent_at, (int, float)):
                raise ValueError("no time")
            sent.append(sent_at)
            if title == "control-plane ALIVE":
                alive.append(sent_at)
        stamp = lambda t: datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        received = {"last_alive": stamp(max(alive)) if alive else None,
                    "last_message": stamp(max(sent)) if sent else None, "status": "unknown"}
        if delivered_age is not None and delivered_age <= 11 * 3600:
            delivered_ts = now - delivered_age
            received["status"] = "ok" if any(t >= delivered_ts - 300 for t in sent) else "red"
    except Exception:
        received = {"last_alive": None, "last_message": None, "status": "unknown"}
if received["status"] == "red":
    alarm_status = "red"
alarm_path = {"unreachable_24h": alarm_count, "last_unreachable": last_unreachable,
              "last_delivered": last_delivered, "status": alarm_status, "received": received}
orc = j(os.environ.get("OR_JSON", ""), {}) or {}
ord_ = orc.get("data", {})
payto = None
pay = j(os.environ.get("PAYTO_HEX", ""), {}) or {}
if pay.get("result"): payto = int(pay["result"], 16) / 1e6
print(json.dumps({
    "at": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "health": {"status": int(os.environ.get("HEALTH_CODE", 0)), "body": os.environ.get("HEALTH_BODY", "")},
    "cert_days_left": cert_days,
    "alarm_path": alarm_path,
    "vm": vm,
    "db": j(os.environ.get("DB_JSON", ""), {}),
    "openrouter": {"credits": ord_.get("total_credits"), "usage": round(ord_.get("total_usage", 0), 4),
                   "left": round(ord_.get("total_credits", 0) - ord_.get("total_usage", 0), 4)} if ord_ else None,
    "payto_usdc_base": payto,
}, indent=2))
PY
