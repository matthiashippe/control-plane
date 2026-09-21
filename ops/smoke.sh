#!/usr/bin/env bash
# Smoke test after a deploy: checks from the outside whether the service does what it should.
#
#   ops/smoke.sh [BASE_URL] [--no-proxy] [--with-ratelimit]
#
# Without an argument it runs against https://cp.hippe.eu. Every check prints one line, a summary
# follows at the end; as soon as one check fails the script exits with 1.
#
# Why this exists: on 19.09.2026 this list was typed out by hand after every deploy, and twice
# something was missed doing so. The checks are not theory, each one stands for a bug that was
# really in production that day: the security headers were missing entirely, the body limit was
# missing (3 MB of junk to /v1/auth/nonce were answered with a 200), and the CSP hash hangs on the
# inline script of the landing page, which means every change to the page can silently switch off
# the live numbers.
#
# The script writes nothing, starts nothing and needs no API key.
#
# RATE LIMIT: `/v1/auth/*` and `/pay/` are capped at 60 requests per minute and client
# (src/ratelimit.ts). A standard run makes exactly ONE request against a capped path (the body
# limit test at /v1/auth/verify) and therefore cannot trip the limit. The run counts along and
# names the number in the summary. The limit itself is only checked with `--with-ratelimit`,
# because that test locks the executing machine out for the rest of the minute; after a deploy
# that is not what anybody wants.
set -uo pipefail

BASE="https://cp.hippe.eu"
NO_PROXY=0
WITH_RATELIMIT=0

while (($#)); do
  case "$1" in
    --no-proxy) NO_PROXY=1 ;;
    --with-ratelimit) WITH_RATELIMIT=1 ;;
    -h | --help)
      sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "unknown switch: $1" >&2
      exit 2
      ;;
    *) BASE="${1%/}" ;;
  esac
  shift
done

command -v python3 >/dev/null || { echo "python3 is missing, it is needed for the JSON checks" >&2; exit 2; }
command -v openssl >/dev/null || { echo "openssl is missing, it is needed for the CSP hash" >&2; exit 2; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

CHECKED=0
FAILURES=0
SKIPPED=0
# Requests against the paths the rate limiter counts. See the header of this file.
CAPPED_REQUESTS=0

if [[ -t 1 ]]; then
  C_OK=$'\033[32m'; C_RED=$'\033[31m'; C_GREY=$'\033[90m'; C_OFF=$'\033[0m'
else
  C_OK=""; C_RED=""; C_GREY=""; C_OFF=""
fi

ok() {
  CHECKED=$((CHECKED + 1))
  printf '%sOK%s      %s\n' "$C_OK" "$C_OFF" "$1"
}

fail() {
  CHECKED=$((CHECKED + 1))
  FAILURES=$((FAILURES + 1))
  printf '%sFAIL%s    %s\n' "$C_RED" "$C_OFF" "$1"
}

skipped() {
  SKIPPED=$((SKIPPED + 1))
  printf '%sSKIPPED%s %s%s%s\n' "$C_GREY" "$C_OFF" "$C_GREY" "$1" "$C_OFF"
}

# One GET; puts the body under $TMP/<name>.body and the headers under $TMP/<name>.head and prints
# the status code. 000 means: no answer at all (DNS, TLS, connection).
fetch() {
  local name="$1" path="$2"
  shift 2
  local output
  # On a connection error curl prints "000" itself and exits with an error code; that is why the
  # code is not appended here, only an empty result is substituted.
  output=$(curl -sS --max-time 20 -o "$TMP/$name.body" -D "$TMP/$name.head" -w '%{http_code}' \
    "$@" "$BASE$path" 2>"$TMP/$name.err")
  echo "${output:-000}"
}

# A header line from a stored answer, name without the colon, compared case-insensitively.
header() {
  grep -i "^$2:" "$TMP/$1.head" | tail -1 | cut -d: -f2- | tr -d '\r' | sed 's/^ *//'
}

# A value from a JSON answer. Path with dots, lists by index: "accepts.0.scheme".
# Exit 1 = field missing, exit 2 = the answer is not JSON at all.
json_value() {
  python3 - "$TMP/$1.body" "$2" <<'PY'
import json, sys
try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception as e:
    print(f"not valid JSON: {e}", file=sys.stderr)
    sys.exit(2)
value = data
for part in sys.argv[2].split("."):
    if not part:
        continue
    try:
        value = value[int(part)] if isinstance(value, list) else value[part]
    except Exception:
        sys.exit(1)
if isinstance(value, bool):
    print("true" if value else "false")
elif isinstance(value, (dict, list)):
    print(json.dumps(value, separators=(",", ":"), ensure_ascii=False))
else:
    print(value)
PY
}

echo "Smoke test against $BASE"
echo

# --- 1. /health ---------------------------------------------------------------
# The check everything else hangs on: does the container answer at all, and is it reachable
# through Caddy. The watchdog on the VM asks for exactly this path (ops/watchdog.sh).
code=$(fetch health /health)
if [[ "$code" == "000" ]]; then
  fail "/health: no answer ($(tr -d '\n' <"$TMP/health.err"))"
  echo
  echo "Aborting: the service is not reachable from here, the remaining checks would be timeouts only."
  exit 1
elif [[ "$code" != "200" ]]; then
  fail "/health: $code instead of 200"
elif [[ "$(json_value health ok)" != "true" ]]; then
  fail "/health: 200, but ok is not true ($(head -c 200 "$TMP/health.body"))"
else
  ok "/health: 200, ok:true, version $(json_value health version)"
fi

# --- 2. /v1/status ------------------------------------------------------------
# The public status without an API key. The landing page pulls its numbers from here, and the
# automaton count is the metric of the 30 day trial. If a field is missing here, the page sits
# there with empty boxes without anything else standing out.
code=$(fetch status /v1/status)
if [[ "$code" != "200" ]]; then
  fail "/v1/status: $code instead of 200"
else
  models=$(json_value status models)
  model_count=$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$models" 2>/dev/null || echo 0)
  markup=$(json_value status markup)
  automatons=$(json_value status automatons)
  tiers=$(json_value status topup_tiers_usd)
  problems=""
  # Without models the runtime cannot think, and the price cache from src/index.ts would be empty.
  [[ "$model_count" -gt 0 ]] || problems="$problems models empty;"
  # A markup below 1 would mean we sell below purchase. On 19.09. the catalogue was gone once already.
  python3 -c 'import sys; sys.exit(0 if float(sys.argv[1]) >= 1 else 1)' "$markup" 2>/dev/null || problems="$problems markup=$markup;"
  # The number has to be there and be a number; it counts paying operators, not registrations.
  [[ "$automatons" =~ ^[0-9]+$ ]] || problems="$problems automatons=$automatons;"
  [[ "$tiers" == *"["* ]] || problems="$problems topup_tiers_usd missing;"
  if [[ -n "$problems" ]]; then
    fail "/v1/status: $problems"
  else
    ok "/v1/status: 200, $model_count model(s), markup $markup, automatons $automatons, tiers $tiers"
  fi
fi

# --- 3. the version from /health and /v1/status match --------------------------
# A cheap counter-check that a single build is really running: both numbers come from the same
# constant in src/app.ts. If they differ, an old container is still answering alongside.
v_health=$(json_value health version 2>/dev/null)
v_status=$(json_value status version 2>/dev/null)
if [[ -n "$v_health" && "$v_health" == "$v_status" ]]; then
  ok "version consistent: $v_health in /health and /v1/status"
else
  fail "version inconsistent: /health=$v_health, /v1/status=$v_status"
fi

# --- 4. landing page ----------------------------------------------------------
# Two pieces of content are not cosmetic: the link to without-control-plane.md is the promise to
# show the free route before anybody pays, and the imprint anchor is the obligation under German
# law (DDG § 5, "easy to recognise and directly reachable").
code=$(fetch page /)
if [[ "$code" != "200" ]]; then
  fail "/: $code instead of 200"
else
  problems=""
  [[ "$(header page content-type)" == *"text/html"* ]] || problems="$problems content-type=$(header page content-type);"
  grep -q "docs/without-control-plane.md" "$TMP/page.body" || problems="$problems link to without-control-plane.md missing;"
  # The imprint moved to /terms on 2026-09-21 with the rest of the fine print, so the landing page
  # carries the link and not the anchor. What the duty asks for is that it is easily recognisable,
  # directly reachable and permanently available, which a footer link on every page satisfies; it
  # does not ask for the address on the page somebody lands on. The anchor itself is checked on the
  # page that now holds it, a few lines below.
  grep -q 'href="/terms#impressum"' "$TMP/page.body" || problems="$problems link to /terms#impressum missing;"
  grep -q 'href="/terms"' "$TMP/page.body" || problems="$problems link to the fine print missing;"
  if [[ -n "$problems" ]]; then
    fail "/: $problems"
  else
    ok "/: 200 HTML, link to without-control-plane.md, imprint anchor and reference present"
  fi
fi

# --- 4b. Every page the sitemap names ------------------------------------------
# Added on 2026-09-21, right after /conway went out returning a 500 to everybody who clicked it.
# The smoke test had eleven green checks and none of them touched the new page, because every
# check here names a path by hand and nobody adds one for the page they just built.
#
# The sitemap is the list of pages the service itself publishes, so driving the check from it
# covers the next page without anybody remembering to. What is asserted is deliberately shallow:
# a 200, an HTML content type, and a heading. A page that renders its error block still passes,
# and that is correct, because an empty series is not a broken deploy.
code=$(fetch sitemap /sitemap.xml)
if [[ "$code" != "200" ]]; then
  fail "/sitemap.xml: $code instead of 200"
else
  pages=$(grep -o '<loc>[^<]*</loc>' "$TMP/sitemap.body" | sed 's|<loc>https://[^/]*||; s|</loc>||')
  broken=""
  count=0
  for page in $pages; do
    count=$((count + 1))
    name="page$count"
    pcode=$(fetch "$name" "$page")
    ctype=$(header "$name" content-type)
    if [[ "$pcode" != "200" ]]; then
      broken="$broken $page=$pcode;"
    elif [[ "$ctype" != *"text/html"* ]]; then
      broken="$broken $page=$ctype;"
    elif ! grep -q '<h1' "$TMP/$name.body"; then
      broken="$broken $page=no-h1;"
    fi
  done
  CAPPED_REQUESTS=$((CAPPED_REQUESTS + count))
  if [[ -n "$broken" ]]; then
    fail "pages from the sitemap:$broken"
  else
    ok "all $count page(s) in the sitemap: 200 HTML with a heading"
  fi
fi

# --- 5. /impressum ------------------------------------------------------------
# The path people and auditors guess first. It has to lead to the anchor on the landing page and
# not into nothing; a 404 here is grounds for a warning letter, not a blemish.
code=$(fetch impressum /impressum)
target=$(header impressum location)
if [[ "$code" == "302" && "$target" == "/terms#impressum" ]]; then
  # And the target has to hold what the redirect promises. A 302 into a page without the anchor is
  # a 302 into the top of a page, which is not "directly reachable" in any sense a court would use.
  code_t=$(fetch terms /terms)
  if [[ "$code_t" == "200" ]] && grep -q 'id="impressum"' "$TMP/terms.body" \
     && grep -q "20457 Hamburg" "$TMP/terms.body"; then
    ok "/impressum: 302 to /terms#impressum, and the address is there"
  else
    fail "/impressum leads to /terms, but that page answered $code_t without the imprint anchor or the address"
  fi
else
  fail "/impressum: $code to '$target', expected 302 to /terms#impressum"
fi

# --- 6. /.well-known/x402 -----------------------------------------------------
# The machine-readable description through which other agents find the service and pay it. Without
# a valid `accepts` a client does not know where to pay, and the topup fails before anybody notices
# that the page itself still looks the way it always did.
code=$(fetch x402 /.well-known/x402)
if [[ "$code" != "200" ]]; then
  fail "/.well-known/x402: $code instead of 200"
else
  x402version=$(json_value x402 x402Version)
  valid=$?
  problems=""
  [[ $valid -eq 2 ]] && problems="$problems not valid JSON;"
  [[ "$x402version" == "1" ]] || problems="$problems x402Version=$x402version;"
  for field in status models topup register inference; do
    json_value x402 "endpoints.$field" >/dev/null 2>&1 || problems="$problems endpoints.$field missing;"
  done
  # The payment offer: network, asset and recipient. `accepts` is empty when CP_PAY_TO is not set
  # on the VM; then /pay answers 503 as well and nobody can top up.
  scheme=$(json_value x402 accepts.0.scheme 2>/dev/null)
  payto=$(json_value x402 accepts.0.payTo 2>/dev/null)
  network=$(json_value x402 accepts.0.network 2>/dev/null)
  asset=$(json_value x402 accepts.0.asset 2>/dev/null)
  [[ "$scheme" == "exact" ]] || problems="$problems accepts[0].scheme=$scheme;"
  [[ "$payto" =~ ^0x[0-9a-fA-F]{40}$ ]] || problems="$problems payTo=$payto;"
  [[ -n "$network" ]] || problems="$problems network missing;"
  [[ "$asset" =~ ^0x[0-9a-fA-F]{40}$ ]] || problems="$problems asset=$asset;"
  if [[ -n "$problems" ]]; then
    fail "/.well-known/x402: $problems"
  else
    ok "/.well-known/x402: 200 JSON, x402Version 1, endpoints complete, payment exact on $network to $payto"
  fi
fi

# --- 7. /llms.txt -------------------------------------------------------------
# The short description for other models and crawlers. The setup line is the only part anybody
# really types out; without it the file is nothing but advertising.
code=$(fetch llms /llms.txt)
if [[ "$code" != "200" ]]; then
  fail "/llms.txt: $code instead of 200"
else
  problems=""
  [[ "$(header llms content-type)" == *"text/plain"* ]] || problems="$problems content-type=$(header llms content-type);"
  grep -q "conwayApiUrl" "$TMP/llms.body" || problems="$problems conwayApiUrl missing;"
  grep -q "automaton --provision" "$TMP/llms.body" || problems="$problems 'automaton --provision' missing;"
  if [[ -n "$problems" ]]; then
    fail "/llms.txt: $problems"
  else
    ok "/llms.txt: 200 text with the setup line (conwayApiUrl, automaton --provision)"
  fi
fi

# --- 8. security headers ------------------------------------------------------
# The headers are set by Caddy, not by the application (deploy/Caddyfile). On 19.09. they were
# missing entirely, and when rolling out a Caddyfile change that is exactly the trap: the Caddyfile
# is a file bind mount, rsync swaps the inode, the running container does not see the new version,
# and even `caddy reload` then still reads the old one. A green `docker compose up -d` proves
# nothing here, this check does.
if ((NO_PROXY)); then
  skipped "security headers: --no-proxy, the headers come from Caddy and are absent on a direct app start"
else
  problems=""
  hsts=$(header page strict-transport-security)
  [[ "$hsts" == *"max-age="* ]] || problems="$problems HSTS ($hsts);"
  [[ "$(header page x-content-type-options)" == "nosniff" ]] || problems="$problems nosniff;"
  [[ "$(header page x-frame-options)" == "DENY" ]] || problems="$problems X-Frame-Options DENY;"
  [[ "$(header page referrer-policy)" == "strict-origin-when-cross-origin" ]] || problems="$problems Referrer-Policy;"
  csp=$(header page content-security-policy)
  [[ "$csp" == *"default-src 'none'"* ]] || problems="$problems CSP default-src 'none';"
  if [[ -n "$problems" ]]; then
    fail "security headers:$problems"
  else
    ok "security headers: HSTS, nosniff, DENY, Referrer-Policy and CSP are in place"
  fi
fi

# --- 9. the CSP hash matches the inline script that is served ------------------
# The CSP allows the inline script of the landing page by sha256 hash instead of 'unsafe-inline'.
# If the hash does not match the script, the browser blocks it silently: the page loads, looks
# right and shows no live numbers ever again. No status code gives that away.
# `test/public.test.ts` checks repo against repo; here we check what the server really serves, and
# that is exactly the open question after a deploy.
if ((NO_PROXY)); then
  skipped "CSP hash: --no-proxy, without Caddy there is no CSP header (the repo comparison is done by pnpm test)"
elif [[ ! -s "$TMP/page.body" ]]; then
  fail "CSP hash: no landing page loaded, cannot check"
else
  page_hash=$(python3 - "$TMP/page.body" <<'PY'
import base64, hashlib, re, sys
html = open(sys.argv[1], encoding="utf-8").read()
# The same regex as in test/public.test.ts, so both hash the same script content.
match = re.search(r"<script>([\s\S]*?)</script>", html)
if not match:
    sys.exit(1)
print("sha256-" + base64.b64encode(hashlib.sha256(match.group(1).encode("utf-8")).digest()).decode())
PY
  )
  csp=$(header page content-security-policy)
  if [[ -z "$page_hash" ]]; then
    # No inline script any more: then no hash may be left in the CSP either.
    if [[ "$csp" == *"sha256-"* ]]; then
      fail "CSP hash: the page has no inline script any more, but the CSP still carries a sha256 hash"
    else
      ok "CSP hash: no inline script on the page, none in the CSP"
    fi
  elif [[ "$csp" == *"$page_hash"* ]]; then
    ok "CSP hash: ${page_hash:0:22}… covers the inline script that is served"
  else
    fail "CSP hash does not match: the page needs '$page_hash', the CSP allows '$csp'. The live numbers are blocked."
  fi
fi

# --- 10. body limit -----------------------------------------------------------
# Before 19.09. the service accepted bodies of any size; 3 MB of junk to /v1/auth/nonce produced a
# 200. The limit is set by Caddy (`request_body max_size 1MB`), not by the application, so it is
# the first thing to fall out on any Caddyfile problem. What is sent is a syntactically valid SIWE
# request with an over-long `message`: if the limit takes hold, a 413 comes back; if it is missing,
# the application answers 400 "Malformed SIWE message", and that 400 is the alarm.
# Cost for the rate limit: exactly one request against a capped path.
if ((NO_PROXY)); then
  skipped "body limit: --no-proxy, the limit is in deploy/Caddyfile and does not exist without Caddy"
else
  python3 - "$TMP/big.json" <<'PY'
import json, sys
# Just above 1 MB, so the limit takes hold for sure and the test still stays fast.
json.dump({"message": "a" * 1_100_000, "signature": "0x00", "chain_type": "evm"}, open(sys.argv[1], "w"))
PY
  CAPPED_REQUESTS=$((CAPPED_REQUESTS + 1))
  code=$(curl -sS --max-time 30 -o "$TMP/limit.body" -D "$TMP/limit.head" -w '%{http_code}' \
    -X POST -H 'content-type: application/json' -H 'Expect: 100-continue' \
    --data-binary @"$TMP/big.json" "$BASE/v1/auth/verify" 2>"$TMP/limit.err")
  code="${code:-000}"
  if [[ "$code" == "413" ]]; then
    ok "body limit: 1.1 MB to /v1/auth/verify gives a 413"
  elif [[ "$code" == "000" ]]; then
    # Caddy may also close the connection instead of answering cleanly. That is a hint that a limit
    # takes hold, but no proof, and therefore not green.
    fail "body limit: no answer to 1.1 MB ($(tr -d '\n' <"$TMP/limit.err")). Without a 413 it is not proven that the limit takes hold."
  else
    fail "body limit: 1.1 MB to /v1/auth/verify gives $code instead of 413. The limit in the Caddyfile does not take hold."
  fi
fi

# --- 11. /v1/credits/balance without a key ------------------------------------
# The lock in front of all /v1/* paths behind the API key. If it fails, anybody reads the balance
# of other people's wallets; in the security review of 19.09. that was the most expensive finding.
# Not rate limited: /v1/credits/balance is not in OPEN_PATHS (src/app.ts).
code=$(fetch balance /v1/credits/balance)
if [[ "$code" == "401" ]]; then
  ok "/v1/credits/balance without a key: 401"
else
  fail "/v1/credits/balance without a key: $code instead of 401 ($(head -c 200 "$TMP/balance.body"))"
fi

# --- 12. rate limit (only on request) -----------------------------------------
# Deliberately outside the standard run: the test locks the executing machine out for the rest of
# the minute window, and whoever runs it by accident after a deploy locks the operator out of their
# own service. Runs last, so the lockout does not hit another check.
if ((WITH_RATELIMIT)); then
  echo
  echo "$C_GREY--with-ratelimit: 65 requests to /v1/auth/nonce. This IP will get 429 until the end of the minute window.$C_OFF"
  blocked_at=0
  for i in $(seq 1 65); do
    CAPPED_REQUESTS=$((CAPPED_REQUESTS + 1))
    rl=$(curl -sS --max-time 10 -o "$TMP/rl.body" -D "$TMP/rl.head" -w '%{http_code}' \
      -X POST "$BASE/v1/auth/nonce" 2>/dev/null)
    rl="${rl:-000}"
    if [[ "$rl" == "429" ]]; then
      blocked_at=$i
      break
    fi
  done
  retry=$(header rl retry-after)
  # What is checked is THAT the limit takes hold and delivers a usable Retry-After, not the exact
  # number: the limiter counts inside a running minute window, and if somebody from the same address
  # asked before, the 429 comes earlier than at 60. A fixed lower bound would therefore not be a
  # finding here but a random number generator.
  note=""
  ((blocked_at > 0 && blocked_at < 30)) && note=" (the minute window had already started)"
  if ((blocked_at == 0)); then
    fail "rate limit: 65 requests to /v1/auth/nonce without a single 429. The limit does not take hold."
  elif [[ ! "$retry" =~ ^[0-9]+$ ]] || ((retry < 1 || retry > 60)); then
    fail "rate limit: 429 at request $blocked_at, but Retry-After is '$retry' instead of a number of seconds up to 60."
  else
    ok "rate limit: request $blocked_at gives a 429 with Retry-After ${retry}s$note"
  fi
else
  skipped "rate limit: only with --with-ratelimit, because the test locks the caller out for a minute"
fi

# --- summary ------------------------------------------------------------------
echo
echo "$CHECKED checks, $FAILURES failures, $SKIPPED skipped."
if ((WITH_RATELIMIT)); then
  echo "Requests against rate limited paths in this run: $CAPPED_REQUESTS. The limit is 60 per minute and client; --with-ratelimit exceeds it on purpose."
else
  echo "Requests against rate limited paths in this run: $CAPPED_REQUESTS of 60 per minute and client."
fi
if ((SKIPPED > 0)) && ((NO_PROXY)); then
  echo "Careful: --no-proxy leaves out the checks that hang on Caddy (headers, CSP hash, body limit)."
  echo "A run without the proxy does not replace the smoke test against the real endpoint."
fi
if ((FAILURES > 0)); then
  echo "${C_RED}Smoke test failed.$C_OFF"
  exit 1
fi
echo "${C_OK}Smoke test passed.$C_OFF"
