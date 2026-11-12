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
# With --topup in front of the source it prints threshold and amount for the automatic top-up at the provider instead:
#
#   AUTO TOPUP: threshold <X> USD, amount <Y> USD, warn threshold <T> USD, <d> USD per day      exit 0
#   AUTO TOPUP FAIL: <reason>                                                                   exit 2
#
# X is the warn threshold T plus two days of usage, rounded up to whole USD: one day at double usage and the time until the
# top-up is booked, so the balance stays above T while top-ups go through, and a failed top-up still warns with days to spare.
# Y is a week of usage, rounded up to a multiple of 5 USD and at least 10 USD, so there is at most one top-up a week.
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
#   ops/credit-runway.sh --topup [SOURCE]     threshold and amount of the automatic top-up, SOURCE is none, --container or
#                                             --files CREDITS KEY as above
set -uo pipefail

API="https://openrouter.ai/api/v1"
CONTAINER="${CP_CREDIT_CONTAINER:-deploy-cp-1}"

# The computation, the only one for every mode. Takes the mode (runway or topup) and the two answers as files, prints one
# line, exits 0, 1 or 2.
compute() {
  python3 -I - "$@" <<'PY'
import json, os, sys
from decimal import Decimal, InvalidOperation, ROUND_CEILING, ROUND_DOWN, ROUND_HALF_UP

MODE = sys.argv[1] if len(sys.argv) > 1 else ""

def fail(reason):
    print(f"AUTO TOPUP FAIL: {reason}" if MODE == "topup" else f"CREDIT RUNWAY FAIL: {reason}")
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

if len(sys.argv) != 4 or MODE not in ("runway", "topup"):
    fail("compute needs a mode and two files")
credits = data(sys.argv[2], "/credits")
usage = data(sys.argv[3], "/key")
left = number(credits, "total_credits", "/credits") - number(credits, "total_usage", "/credits")
weekly = number(usage, "usage_weekly", "/key")
daily = weekly / Decimal(7)

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
if MODE == "topup":
    top_at = (threshold + 2 * effective).to_integral_value(rounding=ROUND_CEILING)
    # A week of usage straight from usage_weekly, so no division by 7 can push an exact multiple of 5 over the edge.
    week = (max(weekly, 7 * min_daily) / 5).to_integral_value(rounding=ROUND_CEILING) * 5
    amount = max(Decimal(10), week)
    print(f"AUTO TOPUP: threshold {top_at} USD, amount {amount} USD, warn threshold {cents(threshold)} USD, {cents(effective)} USD per day")
    sys.exit(0)
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
  local mode="$1"
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
  compute "$mode" "$TMP/credits.json" "$TMP/key.json"
}

from_network() {
  local mode="$1" key="${OPENROUTER_API_KEY:-}"
  local env_file="$HOME/.config/control-plane/loop.env"
  if [[ -z "$key" && -r "$env_file" ]]; then
    key=$(sed -n -E 's/^(export[[:space:]]+)?OPENROUTER_API_KEY=//p' "$env_file" | tail -n 1)
    key="${key%\"}"; key="${key#\"}"; key="${key%\'}"; key="${key#\'}"
  fi
  if [[ -z "$key" ]]; then
    echo "$(fail_prefix "$mode") no OPENROUTER_API_KEY in the environment or in ~/.config/control-plane/loop.env"
    return 2
  fi
  # printf is a shell builtin, so the key reaches curl on stdin and never shows up in a process list.
  printf 'Authorization: Bearer %s\n' "$key" | curl -s -m 15 -H @- "$API/credits" >"$TMP/credits.json" 2>/dev/null
  printf 'Authorization: Bearer %s\n' "$key" | curl -s -m 15 -H @- "$API/key" >"$TMP/key.json" 2>/dev/null
  compute "$mode" "$TMP/credits.json" "$TMP/key.json"
}

fail_prefix() {
  if [[ "$1" == topup ]]; then echo "AUTO TOPUP FAIL:"; else echo "CREDIT RUNWAY FAIL:"; fi
}

# One source for both modes: none, --container or --files CREDITS KEY.
from_source() {
  local mode="$1"; shift
  case "${1:-}" in
    "") [[ $# -le 1 ]] || { echo "$(fail_prefix "$mode") unexpected argument $2"; return 2; }; from_network "$mode" ;;
    --container)
      [[ $# -eq 1 ]] || { echo "$(fail_prefix "$mode") unexpected argument $2"; return 2; }
      from_container "$mode" ;;
    --files)
      [[ $# -eq 3 ]] || { echo "$(fail_prefix "$mode") --files needs CREDITS and KEY"; return 2; }
      compute "$mode" "$2" "$3" ;;
    *)
      if [[ "$mode" == topup ]]; then
        echo "AUTO TOPUP FAIL: unknown argument $1 (none, --container, --files CREDITS KEY)"
      else
        echo "CREDIT RUNWAY FAIL: unknown argument $1 (none, --container, --files CREDITS KEY, --selftest, --topup)"
      fi
      return 2 ;;
  esac
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

  # topup name exit line credits key [VAR=value ...]: the automatic top-up, the whole line must match
  topup() {
    local name="$1" want="$2" expect="$3" credits="$4" key="$5"; shift 5
    printf '%s' "$credits" >"$TMP/c.json"
    printf '%s' "$key" >"$TMP/k.json"
    local line code
    line=$(env -u CP_CREDIT_WARN_DAYS -u CP_CREDIT_WARN_USD -u CP_CREDIT_MIN_DAILY_USD "$@" \
      bash "$self" --topup --files "$TMP/c.json" "$TMP/k.json")
    code=$?
    if [[ "$code" == "$want" && ( "$line" == "$expect" || ( "$expect" == *": " && "$line" == "$expect"* ) ) && "$line" != *$'\n'* ]]; then
      echo "ok   topup $name -> exit $code: $line"
    else
      echo "FAIL topup $name -> wanted exit $want and \"$expect\", got exit $code: $line"
      failed=1
    fi
  }
  local c47='{"data":{"total_credits":47,"total_usage":7}}'
  topup "21.84 USD used in a week (3.12 USD per day)" 0 \
    "AUTO TOPUP: threshold 16 USD, amount 25 USD, warn threshold 9.36 USD, 3.12 USD per day" "$c47" '{"data":{"usage_weekly":21.84}}'
  topup "no usage (minimum daily usage, minimum amount)" 0 \
    "AUTO TOPUP: threshold 7 USD, amount 10 USD, warn threshold 5.00 USD, 1.00 USD per day" "$c47" "$k0"
  topup "no usage at 0.50 USD minimum daily usage (minimum amount alone)" 0 \
    "AUTO TOPUP: threshold 6 USD, amount 10 USD, warn threshold 5.00 USD, 0.50 USD per day" "$c47" "$k0" CP_CREDIT_MIN_DAILY_USD=0.5
  topup "empty answer" 2 "AUTO TOPUP FAIL: " "$c47" ''
  topup "answer that is not JSON" 2 "AUTO TOPUP FAIL: " '<html>502</html>' "$k7"
  if [[ $failed -eq 0 ]]; then
    echo "CREDIT RUNWAY SELFTEST OK"
    return 0
  fi
  echo "CREDIT RUNWAY SELFTEST FAILED"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --topup) shift; from_source topup "$@" ;;
  *) from_source runway "$@" ;;
esac
