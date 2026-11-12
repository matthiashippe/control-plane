#!/usr/bin/env bash
# How long the balance at the inference provider lasts, read only, in one line.
#
# On 2026-11-11 the balance ran out at 02:01 UTC and every inference request of a paying automaton got 503 for 28 hours,
# because nobody looked. This tool turns balance and daily usage into a runway and compares it with a threshold:
#
#   CREDIT RUNWAY OK: <left> USD, <days> days at <per day> USD per day, threshold <usd> USD     exit 0
#   CREDIT RUNWAY LOW: ...                                                                      exit 1
#   CREDIT RUNWAY FAIL: <reason>                                                                exit 2
#
# Balance is data.total_credits minus data.total_usage of GET /api/v1/credits, daily usage is data.usage_weekly of
# GET /api/v1/key divided by 7. Both answer the normal OPENROUTER_API_KEY; no management key is read.
#
# LOW when the balance is 0 or less, when it lasts for fewer than CP_CREDIT_WARN_DAYS days (default 3) or when it is below
# CP_CREDIT_WARN_USD (default 5). The daily usage is at least CP_CREDIT_MIN_DAILY_USD (default 1): when every request fails,
# usage drops to 0, and an outage must not make the runway endless.
#
# Modes:
#   ops/credit-runway.sh                      key from the environment or ~/.config/control-plane/loop.env, handed to curl
#                                             on stdin, never on the command line and never printed
#   ops/credit-runway.sh --container          on the server: both requests from inside deploy-cp-1 with the key of the
#                                             container, so the key never leaves it (used by ops/watchdog.sh)
#   ops/credit-runway.sh --files CREDITS KEY  the same computation from two saved answers
#   ops/credit-runway.sh --selftest           no network, planted answers in every direction
set -uo pipefail

API="https://openrouter.ai/api/v1"
CONTAINER="${CP_CREDIT_CONTAINER:-deploy-cp-1}"

# The computation, the only one for every mode. Reads the two answers from files, prints one line, exits 0, 1 or 2.
compute() {
  python3 -I - "$@" <<'PY'
import json, os, sys
from decimal import Decimal, InvalidOperation, ROUND_DOWN, ROUND_HALF_UP

def fail(reason):
    print(f"CREDIT RUNWAY FAIL: {reason}")
    sys.exit(2)

def setting(name, default):
    raw = os.environ.get(name, "").strip() or default
    try:
        value = Decimal(raw)
    except InvalidOperation:
        fail(f"{name} is not a number")
    if value < 0:
        fail(f"{name} is negative")
    return value

def data(path, label):
    try:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    except OSError:
        fail(f"no answer from {label}")
    if not text.strip():
        fail(f"empty answer from {label}")
    try:
        body = json.loads(text, parse_float=Decimal, parse_int=Decimal)
    except ValueError:
        fail(f"answer from {label} is not JSON")
    inner = body.get("data") if isinstance(body, dict) else None
    if not isinstance(inner, dict):
        code = body.get("error", {}).get("code") if isinstance(body, dict) and isinstance(body.get("error"), dict) else None
        fail(f"answer from {label} has no data" + (f" (error {code})" if code is not None else ""))
    return inner

def number(inner, field, label):
    value = inner.get(field)
    if not isinstance(value, Decimal):
        fail(f"{label} has no number in data.{field}")
    return value

if len(sys.argv) != 3:
    fail("compute needs two files")
credits = data(sys.argv[1], "/credits")
usage = data(sys.argv[2], "/key")
left = number(credits, "total_credits", "/credits") - number(credits, "total_usage", "/credits")
daily = number(usage, "usage_weekly", "/key") / Decimal(7)

warn_days = setting("CP_CREDIT_WARN_DAYS", "3")
warn_usd = setting("CP_CREDIT_WARN_USD", "5")
min_daily = setting("CP_CREDIT_MIN_DAILY_USD", "1")
effective = max(daily, min_daily)
if effective <= 0:
    fail("daily usage and CP_CREDIT_MIN_DAILY_USD are both 0")

days = max(left, Decimal(0)) / effective
threshold = max(warn_usd, warn_days * effective)
low = left <= 0 or left < threshold

cents = lambda d: d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
tenth = lambda d: d.quantize(Decimal("0.1"), rounding=ROUND_DOWN)
word = "LOW" if low else "OK"
print(f"CREDIT RUNWAY {word}: {cents(left)} USD, {tenth(days)} days at {cents(effective)} USD per day, threshold {cents(threshold)} USD")
sys.exit(1 if low else 0)
PY
}

# Runs inside the service container: fetches both answers with the key of the container and prints them as one JSON object
# of two strings. The answers carry no key, only numbers and a masked label, and only numbers leave compute().
CONTAINER_JS='
const key = process.env.OPENROUTER_API_KEY || "";
const get = async (path) => {
  if (!key) return "";
  try {
    const r = await fetch("https://openrouter.ai/api/v1/" + path, { headers: { Authorization: "Bearer " + key }, signal: AbortSignal.timeout(15000) });
    return await r.text();
  } catch { return ""; }
};
Promise.all([get("credits"), get("key")]).then(([credits, k]) => process.stdout.write(JSON.stringify({ credits, key: k })));
'

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

from_container() {
  docker exec "$CONTAINER" node -e "$CONTAINER_JS" >"$TMP/pair.json" 2>/dev/null
  python3 -I - "$TMP/pair.json" "$TMP/credits.json" "$TMP/key.json" <<'PY'
import json, sys
try:
    pair = json.load(open(sys.argv[1], encoding="utf-8"))
except (OSError, ValueError):
    pair = {}
for field, path in (("credits", sys.argv[2]), ("key", sys.argv[3])):
    value = pair.get(field) if isinstance(pair, dict) else None
    open(path, "w", encoding="utf-8").write(value if isinstance(value, str) else "")
PY
  compute "$TMP/credits.json" "$TMP/key.json"
}

from_network() {
  local key="${OPENROUTER_API_KEY:-}"
  local env_file="$HOME/.config/control-plane/loop.env"
  if [[ -z "$key" && -r "$env_file" ]]; then
    key=$(sed -n -E 's/^(export[[:space:]]+)?OPENROUTER_API_KEY=//p' "$env_file" | tail -n 1)
    key="${key%\"}"; key="${key#\"}"; key="${key%\'}"; key="${key#\'}"
  fi
  if [[ -z "$key" ]]; then
    echo "CREDIT RUNWAY FAIL: no OPENROUTER_API_KEY in the environment or in ~/.config/control-plane/loop.env"
    return 2
  fi
  # printf is a shell builtin, so the key reaches curl on stdin and never shows up in a process list.
  printf 'Authorization: Bearer %s\n' "$key" | curl -s -m 15 -H @- "$API/credits" >"$TMP/credits.json" 2>/dev/null
  printf 'Authorization: Bearer %s\n' "$key" | curl -s -m 15 -H @- "$API/key" >"$TMP/key.json" 2>/dev/null
  compute "$TMP/credits.json" "$TMP/key.json"
}

selftest() {
  local failed=0 self="$0"
  # expect name exit credits key [VAR=value ...]
  check() {
    local expect="$1" name="$2" want="$3" credits="$4" key="$5"; shift 5
    printf '%s' "$credits" >"$TMP/c.json"
    printf '%s' "$key" >"$TMP/k.json"
    local line code
    line=$(env -u CP_CREDIT_WARN_DAYS -u CP_CREDIT_WARN_USD -u CP_CREDIT_MIN_DAILY_USD "$@" \
      bash "$self" --files "$TMP/c.json" "$TMP/k.json")
    code=$?
    local prefix="CREDIT RUNWAY ${expect^^}: "
    if [[ "$code" == "$want" && "$line" == "$prefix"* && "$line" != *$'\n'* ]]; then
      echo "ok   $expect $name -> exit $code: $line"
    else
      echo "FAIL $expect $name -> wanted exit $want and \"$prefix...\", got exit $code: $line"
      failed=1
    fi
  }
  local k7='{"data":{"usage_weekly":7}}' k0='{"data":{"usage_weekly":0}}' k35='{"data":{"usage_weekly":35}}'
  check low "20 USD bought, 20.16 USD used" 1 '{"data":{"total_credits":20,"total_usage":20.16}}' "$k7"
  check ok "40 USD left at 7 USD per week" 0 '{"data":{"total_credits":47,"total_usage":7}}' "$k7"
  check low "4 USD left at no usage (minimum daily usage and minimum amount)" 1 '{"data":{"total_credits":4,"total_usage":0}}' "$k0"
  check low "2.50 USD left at no usage, minimum amount off (minimum daily usage alone)" 1 \
    '{"data":{"total_credits":2.5,"total_usage":0}}' "$k0" CP_CREDIT_WARN_USD=0
  check ok "15 USD left at 5 USD per day (exactly 3 days)" 0 '{"data":{"total_credits":15,"total_usage":0}}' "$k35"
  check low "14.99 USD left at 5 USD per day (just under 3 days)" 1 '{"data":{"total_credits":14.99,"total_usage":0}}' "$k35"
  check fail "empty answer" 2 '' "$k7"
  check fail "answer that is not JSON" 2 '<html>502</html>' "$k7"
  check fail "error answer without data" 2 '{"error":{"code":402,"message":"Insufficient credits"}}' "$k7"
  check fail "usage answer without usage_weekly" 2 '{"data":{"total_credits":47,"total_usage":7}}' '{"data":{}}'
  if [[ $failed -eq 0 ]]; then
    echo "CREDIT RUNWAY SELFTEST OK"
    return 0
  fi
  echo "CREDIT RUNWAY SELFTEST FAILED"
  return 1
}

case "${1:-}" in
  "") from_network ;;
  --container) from_container ;;
  --files)
    [[ $# -eq 3 ]] || { echo "CREDIT RUNWAY FAIL: --files needs CREDITS and KEY"; exit 2; }
    compute "$2" "$3" ;;
  --selftest) selftest ;;
  *) echo "CREDIT RUNWAY FAIL: unknown argument $1 (none, --container, --files CREDITS KEY, --selftest)"; exit 2 ;;
esac
