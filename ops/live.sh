#!/usr/bin/env bash
# Live check of the release manager after a rollout (LOOP.md, Release). Reads production, with the one exception the
# check `sandbox` needs (below).
#
#   ops/live.sh              against https://postyourprice.com and, over ssh, the production ledger
#   ops/live.sh --selftest   no network: proves every check against planted data, in both directions
#   ops/live.sh --judge domains-search <status>   no network: judges one answer of the search, its body on stdin
#
# One line per check, `OK <check>: ...` or `FAIL <check>: ...`, then `LIVE OK` or `LIVE FAIL`; exit 1
# as soon as one check fails. Later goals append their live check here (a judge function, a planted
# case in the selftest, a call in live mode).
#
# Live mode needs the variables from ~/.config/control-plane/loop.env (CP_HOST, CP_SSH_KEY) and, for the checks `sandbox`
# and `domains-search`, LIVE_SANDBOX_KEY from ~/.config/control-plane/live-sandbox.env; it is run from the code-host only. The ledger is opened
# with `readonly: true` inside the container. The script restarts nothing and never prints an address, an API key, a
# sandbox id or a balance. It writes in three places only, never on the payment server's disk: for the check `sandbox`
# ops/sandbox/setup.sh --client-key on the sandbox server and one small sandbox of our own account, for the check
# `automaton` one automaton of our own account; each is created, used and deleted through the public API and books its
# started steps and its inference in the ledger like any customer's.
#
# Checks:
#   health   GET /health answers 200
#   status   GET /v1/status answers 200 with a JSON object
#   refund   the credit for the five calls of 2026-11-10 whose answers never arrived
#            (src/credits/aborted.ts) is in the ledger exactly once, over exactly 79229 mc
#   domains  GET /v1/domains/search from the code-host (an own address, ops/own-ips.txt) without a key answers 401 from
#            the auth in front of the route, not the 404 of the fallback route (domains 01). Reads only, buys nothing,
#            and creates no key, because provisioning one would write into production
#   domains-search  GET /v1/domains/search with the key of our own account (LIVE_SANDBOX_KEY, sandbox 03) answers what
#            the handler answers (domains 02): 501, error not_implemented, reason "domain search is not offered", names
#            with livecheck.com and a message that says no domain can be registered here and holds no "taken". Reads
#            only, buys nothing; the key goes through a header file, never onto a command line or into the output
#   timeout-quote  the timeout quote per model since the rollout of abrechnung 02, from the durations in the ledger and in
#            inference_aborts (ops/timeout-quote.sh --since-rollout); shown, and FAIL only when it cannot be read
#   sandbox  ops/sandbox/setup.sh --client-key ends with SETUP CLIENT-KEY OK, a signed GET /v1/sandboxes over ctl.sbx from
#            the container cp answers 200, and with our own account (LIVE_SANDBOX_ADDRESS in src/bounties/ours.ts) a small
#            sandbox is created (201), `echo ok` runs in it, an uploaded file reads back the same, DELETE answers 200, and
#            the ledger holds at least one row of kind sandbox for exactly this sandbox (sandbox 03). Before the DELETE a
#            command runs in the background there (`sleep 50; echo bg-ok`, timeout 120000, sandbox 05): its answer is 200
#            with running true and exit_code -1 and names wait_command, the same as the last line of stdout (sandbox 09).
#            That command is then called with exec and no timeout, as the runtime does, at most three times: the first
#            call waits the full 25 s and must say still running, each call answers 200 under 30000 ms, and the last one
#            ends with exit code 0 and bg-ok in stdout, so the wrapper, coreutils timeout and a full wait under gVisor and
#            through Caddy are proven in production; `FAIL sandbox: background exec wait_command ...` otherwise.
#            Also before the DELETE, port 8080 of the sandbox is exposed (POST .../ports/expose, sandbox 07), a python3
#            http.server there serves a canary line, the canary comes back through the public_url
#            https://sbx-<id>-8080.<domain> within 60 s (through Cloudflare and Caddy, no key sent), and DELETE
#            .../ports/8080 gives the port back; `port=<ok|...>` in the result, `FAIL sandbox: exposed port: ...` otherwise.
#            Until the rollout of sandbox 07 that is the 409 of the control plane.
#            After a new client key (changed=1) it waits CLIENT_KEY_WAIT_S before the create (domains 03): for RECHECK_MS
#            (src/sandbox/service.ts) after the last failed call to sandboxd the service answers 501 at once. Before that
#            wait it prints `WAIT sandbox: new client key, <CLIENT_KEY_WAIT_S> s before the create` on stderr (domains 04)
#   handoff  POST /v1/handoff with example values answers 201 with a two-digit match, GET /h/{code} shows three different
#            two-digit numbers with match among them, and the stream GET /v1/handoff/{code} with the poll token says pending
#            within 5 s (konto 02). Approves nothing: the code runs out unused after ten minutes. The poll token goes through
#            a header file in a mktemp -d folder that a trap deletes, never onto a command line or into the output
#   sandbox-foreign  the number of foreign accounts (no address and no key name of src/bounties/ours.ts) with at least one
#            ledger row of kind sandbox, the measure of the ROADMAP criterion; shown, and FAIL only when it cannot be read
#   automaton  with our own account (LIVE_SANDBOX_KEY) POST /v1/automatons answers 201, within AUTOMATON_WAIT (180) s
#            GET /v1/automatons/{id} says running with turns >= 1, the key of the automaton (apiKey in config.json of its
#            sandbox, read into a header file, never printed) answers 200 on GET /v1/credits/balance, GET .../logs holds
#            neither LIVE_SANDBOX_KEY nor that key nor any cnwy_k_ key, DELETE /v1/automatons/{id} answers 200 with status
#            deleted, and afterwards the same key answers 401 (sandbox 08). `automaton=<ok|...>`; the DELETE runs once the
#            create answered with an id, whatever failed after it. Until the rollout of sandbox 08 that is the 404 of the route
#
# Every temporary file of a live run, the header files with LIVE_SANDBOX_KEY among them, lies in one mktemp -d folder
# that a trap on EXIT, INT and TERM in live() deletes, so a run stopped with kill -TERM leaves nothing in TMPDIR.
# A run stopped with kill -KILL, which no trap catches, leaves that folder only until the next run: its name is live-run.<PID>.*,
# and live() deletes such folders of its own user whose PID no longer runs before it starts, and nothing else.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${LIVE_URL:-https://postyourprice.com}"
REFUND_KEY="refund:client-aborted-2026-11-10"
REFUND_MC=79229

# The ledger query, the same text in production and in the selftest. It counts refund rows of the
# batch key and sums them; nothing else leaves the database. better-sqlite3 is what the container
# has; node:sqlite is only the fallback for a local node whose ABI does not match the installed
# build (selftest on a machine with a newer node first on PATH).
# shellcheck disable=SC2016
QUERY_JS='const [file, key] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file, { readonly: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const r = db.prepare("SELECT count(*) AS n, coalesce(sum(delta_mc), 0) AS s FROM ledger WHERE kind = ? AND ref = ?").get("refund", key); console.log(r.n + " " + r.s);'

FAILED=0
say() {
  echo "$1"
  case "$1" in FAIL*) FAILED=1 ;; esac
}

# The folder of the run's temporary files: the mktemp -d folder of live(), which its trap deletes, else TMPDIR.
# The prefix of that folder, followed by the PID of the run, so the next run finds the folders of runs that ended
# without their trap (kill -KILL) and deletes them.
LIVE_PREFIX="live-run"
LIVE_TMP=""
live_tmp() { echo "${LIVE_TMP:-${TMPDIR:-/tmp}}"; }
live_cleanup() {
  [ -n "$LIVE_TMP" ] && rm -rf -- "$LIVE_TMP"
  LIVE_TMP=""
}
# Deletes the folders of earlier runs that no trap deleted (kill -KILL): only folders of the prefix in TMPDIR that this
# user owns and whose PID no longer runs. A foreign file, a folder of another user and that of a living run stay; a reused
# PID keeps a folder until the next run. Prints nothing.
live_sweep() {
  local d pid
  for d in "${TMPDIR:-/tmp}/$LIVE_PREFIX".*.*; do
    [ -d "$d" ] && [ ! -L "$d" ] && [ -O "$d" ] || continue
    pid="${d##*/"$LIVE_PREFIX".}"
    pid="${pid%%.*}"
    [[ "$pid" =~ ^[0-9]+$ ]] || continue
    kill -0 "$pid" 2>/dev/null && continue
    ps -p "$pid" >/dev/null 2>&1 && continue
    rm -rf -- "$d"
  done
}

judge_health() { # $1 = HTTP status
  if [ "$1" = "200" ]; then echo "OK health: /health 200"; else echo "FAIL health: /health answered ${1:-nothing}"; fi
}

judge_status() { # $1 = HTTP status, $2 = first character of the body
  if [ "$1" = "200" ] && [ "$2" = "{" ]; then
    echo "OK status: /v1/status 200"
  else
    echo "FAIL status: /v1/status answered ${1:-nothing}"
  fi
}

judge_refund() { # $1 = "<rows> <sum mc>" from QUERY_JS
  local n s
  read -r n s <<<"${1:-}"
  if ! [[ "${n:-}" =~ ^[0-9]+$ && "${s:-}" =~ ^-?[0-9]+$ ]]; then
    echo "FAIL refund: ledger query gave no answer"
  elif [ "$n" -eq 0 ]; then
    echo "FAIL refund: no credit for the aborted calls of 2026-11-10"
  elif [ "$n" -gt 1 ]; then
    echo "FAIL refund: credited $n times"
  elif [ "$s" -ne "$REFUND_MC" ]; then
    echo "FAIL refund: credit over $s mc, expected $REFUND_MC mc"
  else
    echo "OK refund: credited once, $REFUND_MC mc"
  fi
}

DOMAINS_PATH="/v1/domains/search?query=livecheck&tlds=com"

judge_domains() { # $1 = HTTP status, $2 = body
  local err
  err="$(grep -o '"error":"[^"]*"' <<<"${2:-}" | head -n 1)"
  if [ "$1" = "401" ] && [ -n "$err" ] && [ "$err" != '"error":"not_found"' ]; then
    echo "OK domains: ${DOMAINS_PATH%%\?*} 401 without a key, the route is there"
  elif [ "$1" = "404" ]; then
    echo "FAIL domains: ${DOMAINS_PATH%%\?*} answered 404, the route is missing"
  else
    echo "FAIL domains: ${DOMAINS_PATH%%\?*} answered ${1:-nothing} ${err:-without an error field}"
  fi
}

# The search with a key (domains 02). The five marks of the right answer, checked in this order; the first one missing
# is named. Prints `ok` or the missing mark, `nojson` for a body that is not a JSON object.
# shellcheck disable=SC2016
DOMAINS_SEARCH_JS='let b = ""; process.stdin.on("data", (d) => (b += d)).on("end", () => { let j; try { j = JSON.parse(b); } catch (e) { j = null; } if (!j || typeof j !== "object" || Array.isArray(j)) return console.log("nojson"); const msg = typeof j.message === "string" ? j.message : ""; if (j.error !== "not_implemented") return console.log("error"); if (j.reason !== "domain search is not offered") return console.log("reason"); if (!Array.isArray(j.names) || !j.names.includes("livecheck.com")) return console.log("names"); if (!msg.includes("No domain can be registered here")) return console.log("message"); if (/taken/i.test(msg)) return console.log("taken"); console.log("ok"); });'

judge_domains_search() { # $1 = HTTP status, `nokey` without a readable key, empty without an answer; $2 = body
  local p="${DOMAINS_PATH%%\?*}" mark
  case "${1:-}" in
    nokey)
      echo "FAIL domains-search: no LIVE_SANDBOX_KEY readable in live-sandbox.env"
      return
      ;;
    "")
      echo "FAIL domains-search: $p with a key gave no answer"
      return
      ;;
    404)
      echo "FAIL domains-search: $p with a key answered 404, the route is missing"
      return
      ;;
    501) ;;
    *)
      echo "FAIL domains-search: $p with a key answered $1, expected 501"
      return
      ;;
  esac
  mark="$(NODE_NO_WARNINGS=1 node -e "$DOMAINS_SEARCH_JS" <<<"${2:-}" 2>/dev/null)"
  case "$mark" in
    ok) echo "OK domains-search: $p with a key 501 not_implemented, livecheck.com named, nothing called taken" ;;
    nojson) echo "FAIL domains-search: $p with a key answered 501 without a JSON object" ;;
    error) echo "FAIL domains-search: $p with a key answered 501 without error not_implemented" ;;
    reason) echo "FAIL domains-search: $p with a key answered 501 without reason \"domain search is not offered\"" ;;
    names) echo "FAIL domains-search: $p with a key answered 501 without livecheck.com in names" ;;
    message) echo "FAIL domains-search: $p with a key answered 501 without the message that no domain can be registered here" ;;
    taken) echo "FAIL domains-search: $p with a key answered 501 with a message that calls a name taken" ;;
    *) echo "FAIL domains-search: the body could not be judged" ;;
  esac
}

# The live part of the check `domains-search`: the key of our own account from LIVE_SANDBOX_ENV through a header file,
# deleted after the call. Prints the HTTP status (`nokey`, or nothing without an answer) on the first line and the body
# (at most 4000 bytes) after it, never the key.
domains_search_live() {
  local apikey="" hdr ans code
  [ -r "$LIVE_SANDBOX_ENV" ] && apikey="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  if [ -z "$apikey" ]; then
    echo nokey
    return
  fi
  hdr="$(mktemp -p "$(live_tmp)")"
  ans="$(mktemp -p "$(live_tmp)")"
  printf 'Authorization: %s\n' "$apikey" >"$hdr"
  apikey=""
  code="$(curl -s -o "$ans" -w '%{http_code}' --max-time 15 -H "@$hdr" "$BASE$DOMAINS_PATH")"
  rm -f "$hdr"
  [ "$code" = 000 ] && code=""
  echo "$code"
  head -c 4000 "$ans"
  rm -f "$ans"
}

# $1 = output of ops/timeout-quote.sh --since-rollout (or --rows). One line per model over all days, aborted and answered
# calls together: `<model> <timeouts>/<calls> (<quote> %)`.
judge_timeout_quote() {
  local head summary
  head="$(head -n 1 <<<"${1:-}")"
  if [[ "$head" != since\ * ]]; then
    echo "FAIL timeout-quote: no answer from ops/timeout-quote.sh"
    return
  fi
  summary="$(awk -F'|' '
    NR > 1 && $3 ~ /^ *all *$/ {
      m = $2; gsub(/ /, "", m); n[m] += $5; t[m] += $6
    }
    END {
      out = ""
      for (m in n) out = out (out == "" ? "" : ", ") sprintf("%s %d/%d (%.1f %%)", m, t[m], n[m], 100 * t[m] / n[m])
      print out
    }' <<<"$1")"
  if [ -z "$summary" ]; then
    echo "OK timeout-quote: no call since the rollout yet"
  else
    echo "OK timeout-quote: ${head%%,*}: $summary"
  fi
}

# ---- handoff (konto 02)

HANDOFF_BODY='{"automaton_name":"Live check","daily_limit_usdc":"10000","amount_usdc":"10000"}'

# Reads the answer of POST /v1/handoff ($1), writes the header with the poll token to $2 (mode 0600) and prints the code;
# prints nothing for an answer without a code or a token. The token never reaches stdout.
# shellcheck disable=SC2016
HANDOFF_PREP_JS='const fs = require("fs"); const [file, hdr] = process.argv.slice(1); let j; try { j = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { process.exit(0); } if (!j || typeof j.code !== "string" || !/^[0-9A-Z]{10,32}$/.test(j.code) || typeof j.poll_token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(j.poll_token)) process.exit(0); fs.writeFileSync(hdr, "Authorization: Bearer " + j.poll_token + "\n", { mode: 0o600 }); console.log(j.code);'

# The result line of the check from what was received: $1 status of the POST, $2 its body file, $3 status of the page, $4 its
# body file, $5 what the stream sent within 5 s, $6 the response headers of the page. Only words leave it, no code and no token.
# referrer=ok only when every Referrer-Policy header of the page together says exactly no-referrer (konto 03): Caddy used to
# overwrite the header of the app, and a second value next to it would be one too many.
# shellcheck disable=SC2016
HANDOFF_JS='const fs = require("fs"); const [cs, cf, ps, pf, sf, hf] = process.argv.slice(1); const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return ""; } }; let j = null; try { j = JSON.parse(read(cf)); } catch (e) { j = null; } const match = j && Number.isInteger(j.match) && j.match >= 10 && j.match <= 99 ? j.match : null; const nums = [...read(pf).matchAll(/<button[^>]*name="pick" value="([0-9]+)"/g)].map((m) => Number(m[1])); const two = nums.length === 3 && new Set(nums).size === 3 && nums.every((n) => n >= 10 && n <= 99); const numbers = !two ? "missing" : match !== null && nums.includes(match) ? "ok" : "nomatch"; const ev = /^event: state\r?\ndata: (.*)$/m.exec(read(sf)); let st = "none"; if (ev) { try { st = String(JSON.parse(ev[1]).state || "other"); } catch (e) { st = "other"; } } if (!/^[a-z]+$/.test(st)) st = "other"; const rp = [...read(hf).matchAll(/^referrer-policy:[ \t]*(.*?)[ \t]*\r?$/gim)].flatMap((m) => m[1].split(",")).map((v) => v.trim().toLowerCase()).filter(Boolean); const referrer = rp.length === 0 ? "missing" : rp.length === 1 && rp[0] === "no-referrer" ? "ok" : "other"; console.log("create=" + cs + " match=" + (match === null ? "missing" : "ok") + " page=" + ps + " numbers=" + numbers + " stream=" + st + " referrer=" + referrer);'
HANDOFF_GOOD="create=201 match=ok page=200 numbers=ok stream=pending referrer=ok"

judge_handoff() { # $1 = result line from HANDOFF_JS
  case "${1:-}" in
    "$HANDOFF_GOOD") echo "OK handoff: POST /v1/handoff 201, /h/{code} shows match among three numbers with Referrer-Policy no-referrer, the stream says pending; nothing approved" ;;
    "") echo "FAIL handoff: no result" ;;
    create=201\ match=missing*) echo "FAIL handoff: POST /v1/handoff answered 201 without a two-digit match" ;;
    create=201\ match=ok\ page=200\ numbers=ok\ stream=pending\ *)
      echo "FAIL handoff: /h/{code} does not send Referrer-Policy no-referrer alone (referrer ${1##*referrer=})"
      ;;
    create=201\ *page=200\ numbers=ok\ *)
      local s="${1#*stream=}"
      echo "FAIL handoff: the stream did not say pending within 5 s (stream=${s%% *})"
      ;;
    create=201\ *page=200\ *)
      local n="${1#*numbers=}"
      echo "FAIL handoff: /h/{code} does not show match among three numbers (${n%% *})"
      ;;
    create=201\ *)
      local p="${1#*page=}"
      echo "FAIL handoff: /h/{code} answered ${p%% *}"
      ;;
    *)
      local c="${1#create=}"
      echo "FAIL handoff: POST /v1/handoff answered ${c%% *}"
      ;;
  esac
}

# The live part: one handoff with example values, its page and 5 s of its stream. Prints the result line only.
handoff_live() {
  local d c_code p_code="none" code
  d="$(mktemp -d -p "$(live_tmp)")"
  trap 'rm -rf "$d"' RETURN
  c_code="$(curl -s -o "$d/create" -w '%{http_code}' --max-time 15 -H 'content-type: application/json' --data "$HANDOFF_BODY" "$BASE/v1/handoff")"
  code="$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$d/create" "$d/hdr" 2>/dev/null)"
  if [ -n "$code" ]; then
    p_code="$(curl -s -o "$d/page" -D "$d/page-headers" -w '%{http_code}' --max-time 15 "$BASE/h/$code")"
    curl -s -N --max-time 5 -H "@$d/hdr" "$BASE/v1/handoff/$code" >"$d/stream" 2>/dev/null
  fi
  NODE_NO_WARNINGS=1 node -e "$HANDOFF_JS" "${c_code:-none}" "$d/create" "${p_code:-none}" "$d/page" "$d/stream" "$d/page-headers"
}

# ---- sandbox (sandbox 03)

SANDBOX_HOST="${SANDBOX_HOST:-72.62.51.224}"
CTL_URL="https://ctl.sbx.postyourprice.com"
LIVE_SANDBOX_ENV="$HOME/.config/control-plane/live-sandbox.env"
OURS_TS="$ROOT/src/bounties/ours.ts"
# The port the check `sandbox` exposes in its own sandbox (sandbox 07), the one ops/sandbox/probe.sh uses, and how long
# it waits at most for the canary through the public_url.
PORT_NUMBER=8080
PORT_WAIT=60
# From this duration of one call of wait_command on, the line OK sandbox: carries a warning (hosting 02): the runtime aborts
# a call at 30000 ms, so 27000 ms leave 3 s before a call breaks. Only a warning, never FAIL, because a FAIL triggers a
# revert and the call still ended in time. ops/README.md names the action.
BG_WARN_MS=27000
CLIENT_KEY_SETUP="$ROOT/ops/sandbox/setup.sh"
SERVICE_TS="$ROOT/src/sandbox/service.ts"

# Seconds the check `sandbox` waits after SETUP CLIENT-KEY OK changed=1 before it creates (domains 03). For RECHECK_MS after
# its last failed call to sandboxd the service answers POST /v1/sandboxes with 501 at once, and until the new key is in
# place every call fails; so the wait is longer than RECHECK_MS. test/live-selftest.test.ts holds it above RECHECK_MS / 1000.
CLIENT_KEY_WAIT_S=75
live_wait() { sleep "$1"; } # the selftest replaces it and counts the seconds instead

# The line before the wait after a new client key (domains 04), $1 = CLIENT_KEY_WAIT_S. On stderr, because live() hands the
# stdout of sandbox_live to judge_sandbox and shows it only after the run; so the line is on screen when the wait starts and
# leaves the verdict of judge_sandbox as it is.
wait_line() { echo "WAIT sandbox: new client key, $1 s before the create" >&2; }
# What sandbox_live does after SETUP CLIENT-KEY OK changed=1: say what it waits for, then wait.
client_key_wait() {
  wait_line "$1"
  live_wait "$1"
}

# RECHECK_MS of src/sandbox/service.ts in whole seconds, nothing when the line is not there.
recheck_s() {
  local ms
  ms="$(grep -oE 'const RECHECK_MS = [0-9_]+;' "$SERVICE_TS" 2>/dev/null | head -n 1 | tr -dc '0-9')"
  [ -n "$ms" ] && echo $((ms / 1000))
}

# $1 = "changed=<0|1> created_after=<seconds|none>" from a run of sandbox_live, $2 = RECHECK_MS in seconds. A create after
# a new client key is OK only more than RECHECK_MS later, one with the key unchanged only without any wait.
judge_sandbox_wait() {
  local changed after recheck="${2:-}"
  read -r changed after <<<"${1:-}"
  changed="${changed#changed=}"
  after="${after#created_after=}"
  if ! [[ "$recheck" =~ ^[0-9]+$ ]]; then
    echo "FAIL sandbox-wait: no RECHECK_MS in src/sandbox/service.ts"
  elif ! [[ "$after" =~ ^[0-9]+$ ]]; then
    echo "FAIL sandbox-wait: no POST /v1/sandboxes seen"
  elif [ "$changed" = 1 ] && [ "$after" -gt "$recheck" ]; then
    echo "OK sandbox-wait: created $after s after a new client key, past the $recheck s of RECHECK_MS"
  elif [ "$changed" = 1 ]; then
    echo "FAIL sandbox-wait: created $after s after a new client key, within the $recheck s the service answers 501 at once"
  elif [ "$changed" = 0 ] && [ "$after" -eq 0 ]; then
    echo "OK sandbox-wait: created at once, the client key was unchanged"
  elif [ "$changed" = 0 ]; then
    echo "FAIL sandbox-wait: waited $after s although the client key was unchanged"
  else
    echo "FAIL sandbox-wait: no changed=0 or changed=1 from ops/sandbox/setup.sh --client-key"
  fi
}

# $1 = "changed=<0|1> events=<list>" from sandbox_line_run, the events of one run of sandbox_live in their order, comma
# separated: line:<seconds> for the line of wait_line (line:bad for another line starting with WAIT), wait:<seconds> for
# live_wait, create for POST /v1/sandboxes. $2 = CLIENT_KEY_WAIT_S. After a new client key exactly one line naming
# CLIENT_KEY_WAIT_S has to come before the wait and before the create; with the key unchanged no line at all.
judge_sandbox_wait_line() {
  local changed events want="${2:-}" e i=0 n=0 value="" line_at="" wait_at="" create_at=""
  read -r changed events <<<"${1:-}"
  changed="${changed#changed=}"
  events="${events#events=}"
  local IFS=,
  for e in $events; do
    i=$((i + 1))
    case "$e" in
      line:*) n=$((n + 1)); value="${e#line:}"; [ -n "$line_at" ] || line_at=$i ;;
      wait:*) [ -n "$wait_at" ] || wait_at=$i ;;
      create) [ -n "$create_at" ] || create_at=$i ;;
    esac
  done
  unset IFS
  if [ "$changed" = 0 ]; then
    if [ "$n" = 0 ]; then
      echo "OK sandbox-wait-line: no line, the client key was unchanged"
    else
      echo "FAIL sandbox-wait-line: $n line(s) although the client key was unchanged"
    fi
  elif [ "$changed" != 1 ]; then
    echo "FAIL sandbox-wait-line: no changed=0 or changed=1 from ops/sandbox/setup.sh --client-key"
  elif [ "$n" = 0 ]; then
    echo "FAIL sandbox-wait-line: waited after a new client key without saying so"
  elif [ "$n" != 1 ]; then
    echo "FAIL sandbox-wait-line: $n lines after a new client key, want one"
  elif [ "$value" != "$want" ]; then
    echo "FAIL sandbox-wait-line: the line names ${value} s, CLIENT_KEY_WAIT_S is ${want:-unset}"
  elif [ -z "$wait_at" ] || [ -z "$create_at" ]; then
    echo "FAIL sandbox-wait-line: no wait or no POST /v1/sandboxes after the line"
  elif [ "$line_at" -gt "$wait_at" ] || [ "$line_at" -gt "$create_at" ]; then
    echo "FAIL sandbox-wait-line: the line came after the wait it announces"
  else
    echo "OK sandbox-wait-line: said $value s before the wait and the create"
  fi
}

# $1 = "killed=<n> kept=<n> foreign=<yes|no> alive=<yes|no>" from key_sweep_run: killed counts the folders a run stopped
# with kill -KILL left, kept how many of them were still there after the next run of live().
judge_kill_sweep() {
  local killed kept
  killed="$(sed -n 's/.*killed=\([0-9]*\).*/\1/p' <<<"${1:-}")"
  kept="$(sed -n 's/.*kept=\([0-9]*\).*/\1/p' <<<"${1:-}")"
  if [ -z "$killed" ] || [ -z "$kept" ]; then
    echo "FAIL key-cleanup: no result"
  elif [ "$killed" -eq 0 ]; then
    echo "FAIL key-cleanup: the run stopped with kill -KILL left no folder, so the next run proves nothing"
  elif [ "$kept" -gt 0 ]; then
    echo "FAIL key-cleanup: $kept folders of the run stopped with kill -KILL still in TMPDIR after the next run"
  else
    echo "OK key-cleanup: the next run deleted the folder of the run stopped with kill -KILL"
  fi
}
# The same result: what the next run must leave alone, a foreign file and the folder of a run whose process lives.
judge_sweep_foreign() {
  case "${1:-}" in
    *foreign=yes*alive=yes*) echo "OK key-cleanup: a foreign file and the folder of a living run stayed" ;;
    *foreign=no*) echo "FAIL key-cleanup: the next run deleted a foreign file in TMPDIR" ;;
    *alive=no*) echo "FAIL key-cleanup: the next run deleted the folder of a run whose process lives" ;;
    *) echo "FAIL key-cleanup: no result" ;;
  esac
}

# $1 = "seen=<yes|no> ended=<yes|no> left=<files>" from a run of live() stopped with kill -TERM: seen says the key file
# was in TMPDIR while the call ran, ended that the run was over within 15 s, left what was in TMPDIR afterwards.
judge_key_cleanup() {
  local seen ended left
  read -r seen ended left <<<"${1:-}"
  seen="${seen#seen=}"
  ended="${ended#ended=}"
  left="${left#left=}"
  if ! [[ "$left" =~ ^[0-9]+$ ]]; then
    echo "FAIL key-cleanup: no result"
  elif [ "$seen" != yes ]; then
    echo "FAIL key-cleanup: no key file in TMPDIR while the call ran, so the kill proves nothing"
  elif [ "$ended" != yes ]; then
    echo "FAIL key-cleanup: the run did not end within 15 s of kill -TERM"
  elif [ "$left" -gt 0 ]; then
    echo "FAIL key-cleanup: $left files left in TMPDIR after kill -TERM"
  else
    echo "OK key-cleanup: TMPDIR empty after kill -TERM"
  fi
}

# Rows of kind sandbox for one sandbox id (refs `sandbox:<id>:<step>`), the same text in production and in the selftest.
# Only the count leaves the database; an id that is not lowercase alphanumeric (the format sandboxd gives) is refused, so
# no LIKE wildcard can come in with it.
# shellcheck disable=SC2016
SANDBOX_LEDGER_JS='const [file, id] = process.argv.slice(1); if (!/^[a-z0-9]{1,40}$/.test(id || "")) process.exit(2); let db; try { db = require("better-sqlite3")(file, { readonly: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const r = db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = ? AND ref LIKE ?").get("sandbox", "sandbox:" + id + ":%"); console.log(r.n);'

# Foreign accounts with at least one ledger row of kind sandbox: neither an own address nor an address holding a key whose
# name matches one of our key name patterns (src/bounties/ours.ts, both passed in as JSON arrays). Only the count leaves
# the database; without both lists it answers nothing, so a missing list can never count our own accounts as foreign.
# shellcheck disable=SC2016
SANDBOX_FOREIGN_JS='const [file, ours, names] = process.argv.slice(1); const own = JSON.parse(ours).map((a) => String(a).toLowerCase()); const pats = JSON.parse(names).map(String); if (!own.length || !pats.length) process.exit(2); let db; try { db = require("better-sqlite3")(file, { readonly: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const sql = "SELECT count(DISTINCT lower(l.address)) AS n FROM ledger l WHERE l.kind = ? AND lower(l.address) NOT IN (" + own.map(() => "?").join(", ") + ") AND NOT EXISTS (SELECT 1 FROM api_keys k WHERE lower(k.address) = lower(l.address) AND (" + pats.map(() => "k.name LIKE ?").join(" OR ") + "))"; console.log(db.prepare(sql).get("sandbox", ...own, ...pats).n);'

# The signed read over ctl.sbx, run inside the container cp: GET /v1/sandboxes with a random cp_nonce (sandboxd takes the
# same signature only once in 5 minutes), signed with /data/sandbox-client.key as in docs/sandbox/plan.md (## Verbindung).
# Prints the HTTP status only, `nokey` without a readable key, `none` without an answer.
# shellcheck disable=SC2016
CTL_JS='const crypto = require("crypto"); const [base, keyFile] = process.argv.slice(1); let key; try { key = crypto.createPrivateKey(require("fs").readFileSync(keyFile)); } catch (e) { console.log("nokey"); process.exit(0); } const target = "/v1/sandboxes?cp_nonce=" + crypto.randomBytes(8).toString("hex"); const ts = String(Math.floor(Date.now() / 1000)); const msg = ["GET", target, ts, crypto.createHash("sha256").update("").digest("hex")].join("\n"); const sig = crypto.sign(null, Buffer.from(msg, "utf8"), key).toString("base64"); fetch(base + target, { headers: { "X-CP-Timestamp": ts, "X-CP-Signature": sig }, signal: AbortSignal.timeout(15000) }).then((r) => console.log(r.status), () => console.log("none"));'

# The own addresses and key name patterns of src/bounties/ours.ts as two JSON arrays on two lines: every string `"0x` or
# `"key:` plus 40 hex, and the strings of `export const OUR_KEY_NAMES = [ ... ];` outside comment lines. Exit 1 when
# either list comes out empty.
ours_json() { # $1 = path of ours.ts
  local addrs names
  addrs="$(grep -oE '"(0x|key:)[0-9a-fA-F]{40}"' "$1" 2>/dev/null | tr 'A-F' 'a-f' | sort -u | paste -sd, -)"
  names="$(awk '/^export const OUR_KEY_NAMES = \[/ { f = 1; next } f && /^\];/ { exit } f && !/^[[:space:]]*\/\// { print }' "$1" 2>/dev/null |
    grep -oE '"[^"]*"' | paste -sd, -)"
  [ -n "$addrs" ] && [ -n "$names" ] || return 1
  printf '[%s]\n[%s]\n' "$addrs" "$names"
}

# The answer to the background exec of the check `sandbox`, $1 = file, $2 = file for the body of the wait call
# (optional): "wait <exit_code_file>" when it is the answer to a command still running (running true, exit_code -1,
# both files under /root/.exec) whose wait_command is one line, names `[ -f <exit_code_file> ]` and is the last line of
# stdout (sandbox 09); then the body {"command": wait_command}, without a timeout as the runtime sends it, goes to $2.
# Else one word (`nojson`, `notrunning`, `nofiles`, `nowait`, `waitnotlast`). Only paths of that form leave it.
# shellcheck disable=SC2016
BG_ANSWER_JS='const fs = require("fs"); let o; try { o = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } if (!o || typeof o !== "object") { console.log("nojson"); process.exit(0); } if (o.running !== true || o.exit_code !== -1) { console.log("notrunning"); process.exit(0); } const ok = (v, ext) => typeof v === "string" && new RegExp("^/root/\\.exec/[0-9a-f]{1,64}\\." + ext + "$").test(v); if (!ok(o.exit_code_file, "exit") || !ok(o.output_file, "out")) { console.log("nofiles"); process.exit(0); } const w = o.wait_command; if (typeof w !== "string" || !w || w.length > 4000 || /[\r\n]/.test(w) || !w.includes("[ -f " + o.exit_code_file + " ]")) { console.log("nowait"); process.exit(0); } const lines = typeof o.stdout === "string" ? o.stdout.split("\n") : []; if (lines[lines.length - 1] !== w) { console.log("waitnotlast"); process.exit(0); } if (process.argv[2]) fs.writeFileSync(process.argv[2], JSON.stringify({ command: w })); console.log("wait " + o.exit_code_file);'

# The answer to one call of wait_command, $1 = file: "ended <exit_code> <1 when a line of stdout is bg-ok, else 0>"
# when the first line of stdout says the command has ended, "still" when it says it is still running, else `other`.
# shellcheck disable=SC2016
WAIT_ANSWER_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } if (!o || typeof o !== "object" || typeof o.stdout !== "string" || typeof o.exit_code !== "number") { console.log("other"); process.exit(0); } const lines = o.stdout.split("\n").map((l) => l.replace(/\r$/, "")); if (/^The command has ended with exit code -?[0-9]+\.$/.test(lines[0])) { console.log("ended " + o.exit_code + " " + (lines.includes("bg-ok") ? 1 : 0)); } else if (lines[0].startsWith("The command is still running.")) { console.log("still"); } else { console.log("other"); }'

# $1 = HTTP status, $2 = answer file of the background exec, $3 = file for the body of the wait call (optional).
# Prints the status itself when it is not 200, else the output of BG_ANSWER_JS.
bg_start() {
  if [ "${1:-}" != 200 ]; then
    echo "${1:-none}"
    return
  fi
  (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$BG_ANSWER_JS" "$2" "${3:-}" 2>/dev/null) || echo nojson
}

now_ms() { date +%s%3N; } # the selftest replaces it with a planted clock

# The background step of the check `sandbox` (sandbox 05 and 09), $1 = header file, $2 = answer file, $3 = sandbox id.
# Starts `sleep 50; echo bg-ok` with timeout 120000, takes wait_command from the answer and calls it with exec and no
# timeout, at most three times. The answer comes after 20 s, so the first call waits the full 25 s and must say still
# running (sandbox 09, point 8); the second one gets the end. Prints one token: ok, start-<word or status> or
# wait-<status-N|slow-MS|first|exit-N|wrong|still|unreadable>, then a space and the longest call of wait_command in ms
# (0 when none ran, hosting 02).
bg_live() {
  local hdr="$1" ans="$2" id="$3" code start body t0 ms got n i tok=wait-still max=0
  body="$(mktemp -p "$(live_tmp)")"
  code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/exec" "$ans" '{"command":"sleep 50; echo bg-ok","timeout":120000}' "Idempotency-Key: live-check-bg-$(rand_hex)")"
  start="$(bg_start "$code" "$ans" "$body")"
  if [[ "$start" != "wait "* ]]; then
    rm -f "$body"
    echo "start-${start:-none} 0"
    return
  fi
  for i in 1 2 3; do
    t0="$(now_ms)"
    code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/exec" "$ans" "$(cat "$body")" "Idempotency-Key: live-check-wait-$i-$(rand_hex)")"
    ms=$(($(now_ms) - t0))
    [ "$ms" -gt "$max" ] && max="$ms"
    if [ "$code" != 200 ]; then
      tok="wait-status-${code:-none}"
      break
    fi
    if [ "$ms" -ge 30000 ]; then
      tok="wait-slow-$ms"
      break
    fi
    got="$(cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$WAIT_ANSWER_JS" "$ans" 2>/dev/null)"
    if [ "$i" = 1 ] && [[ "$got" == ended\ * ]]; then
      tok=wait-first
      break
    fi
    case "$got" in
      "ended 0 1") tok=ok ;;
      "ended 0 0") tok=wait-wrong ;;
      ended\ *)
        read -r _ n _ <<<"$got"
        tok="wait-exit-$n"
        ;;
      still) continue ;;
      *) tok=wait-unreadable ;;
    esac
    break
  done
  rm -f "$body"
  echo "$tok $max"
}

# Why the background step failed, $1 = its token from bg_live; for the tokens of wait_command judge_sandbox puts
# `wait_command` in front.
bg_reason() {
  case "${1:-}" in
    "" | skipped) echo "did not run" ;;
    start-notrunning) echo "of sleep 50 answered 200 without running true and exit_code -1" ;;
    start-nofiles) echo "answered 200 without exit_code_file and output_file under /root/.exec" ;;
    start-nojson) echo "answered 200 without a JSON object" ;;
    start-nowait) echo "missing in the answer, or it does not name the exit_code_file" ;;
    start-waitnotlast) echo "is not the last line of stdout" ;;
    start-*) echo "of sleep 50 answered ${1#start-}, expected 200" ;;
    wait-status-*) echo "answered ${1#wait-status-}, expected 200" ;;
    wait-slow-*) echo "took ${1#wait-slow-} ms, not under 30000" ;;
    wait-exit-*) echo "reported exit code ${1#wait-exit-}, expected 0" ;;
    wait-wrong) echo "reported the end without bg-ok in stdout" ;;
    wait-first) echo "ended on the first call" ;;
    wait-still) echo "still said running after three calls" ;;
    wait-unreadable) echo "answered 200 with neither the end nor still running" ;;
    *) echo "failed: $1" ;;
  esac
}

# Why the port step failed, $1 = its token from port_live.
port_reason() {
  case "${1:-}" in
    "" | skipped) echo "step did not run" ;;
    expose_none) echo "POST /v1/sandboxes/{id}/ports/expose gave no answer" ;;
    expose_*) echo "POST /v1/sandboxes/{id}/ports/expose answered ${1#expose_}, expected 200" ;;
    no_url) echo "answer to ports/expose holds no public_url" ;;
    bad_url) echo "public_url is not https://sbx-<id>-$PORT_NUMBER.<domain> outside postyourprice.com" ;;
    server_*) echo "exec that starts the server answered ${1#server_}, expected 200" ;;
    fetch_failed) echo "canary did not come back through the public_url within $PORT_WAIT s" ;;
    unexpose_*) echo "DELETE /v1/sandboxes/{id}/ports/$PORT_NUMBER answered ${1#unexpose_}, expected 2xx" ;;
    *) echo "failed: $1" ;;
  esac
}

# $1 = "client_key=<ok|fail> ctl=<status> create=<status> exec=<ok|wrong|status> bg=<ok|...> bg_max_ms=<ms>
# files=<ok|wrong|...> delete=<status> ledger=<rows> port=<ok|...>", the result line of sandbox_live. Judges in the order
# of the steps and names the first one that failed; the port step comes last, so its 409 until the rollout of sandbox 07
# hides no other step. The line OK sandbox: names bg_max_ms, from BG_WARN_MS on with a warning (hosting 02).
judge_sandbox() {
  local toks tok client_key="" ctl="" create="" exec_="" bg="" bg_max="" files="" delete="" ledger="" port="" warn=""
  read -ra toks <<<"${1:-}"
  for tok in "${toks[@]}"; do
    case "$tok" in
      client_key=*) client_key="${tok#*=}" ;;
      ctl=*) ctl="${tok#*=}" ;;
      create=*) create="${tok#*=}" ;;
      exec=*) exec_="${tok#*=}" ;;
      bg=*) bg="${tok#*=}" ;;
      bg_max_ms=*) bg_max="${tok#*=}" ;;
      files=*) files="${tok#*=}" ;;
      delete=*) delete="${tok#*=}" ;;
      ledger=*) ledger="${tok#*=}" ;;
      port=*) port="${tok#*=}" ;;
    esac
  done
  if [ "${#toks[@]}" -eq 0 ]; then
    echo "FAIL sandbox: no result"
  elif [ "$client_key" != ok ]; then
    echo "FAIL sandbox: ops/sandbox/setup.sh --client-key did not end with SETUP CLIENT-KEY OK"
  elif [ "$ctl" != 200 ]; then
    echo "FAIL sandbox: signed GET /v1/sandboxes over ctl.sbx answered ${ctl:-nothing}, expected 200"
  elif [ "$create" != 201 ]; then
    echo "FAIL sandbox: POST /v1/sandboxes answered ${create:-nothing}, expected 201"
  elif [ "$exec_" = wrong ]; then
    echo "FAIL sandbox: exec of echo ok answered 200 with another stdout than ok"
  elif [ "$exec_" != ok ]; then
    echo "FAIL sandbox: exec answered ${exec_:-nothing}, expected 200"
  elif [ "$bg" != ok ]; then
    case "$bg" in
      wait-* | start-nowait | start-waitnotlast) echo "FAIL sandbox: background exec wait_command $(bg_reason "$bg")" ;;
      *) echo "FAIL sandbox: background exec $(bg_reason "$bg")" ;;
    esac
  elif [ "$files" = wrong ]; then
    echo "FAIL sandbox: the file read back differs from the one uploaded"
  elif [ "$files" != ok ]; then
    echo "FAIL sandbox: file upload or read answered ${files:-nothing}"
  elif [ "$delete" != 200 ]; then
    echo "FAIL sandbox: DELETE answered ${delete:-nothing}, expected 200"
  elif ! [[ "$ledger" =~ ^[0-9]+$ ]]; then
    echo "FAIL sandbox: ledger query gave no answer"
  elif [ "$ledger" -eq 0 ]; then
    echo "FAIL sandbox: no ledger row of kind sandbox for the sandbox"
  elif [ "$port" != ok ]; then
    echo "FAIL sandbox: exposed port: $(port_reason "$port")"
  else
    [[ "$bg_max" =~ ^[0-9]+$ ]] || bg_max=0
    [ "$bg_max" -ge "$BG_WARN_MS" ] && warn=", warning: a call of wait_command took $bg_max ms, at or above $BG_WARN_MS ms, the runtime aborts at 30000 ms"
    echo "OK sandbox: client key set, ctl.sbx 200, created, exec ok, background exec ok, files ok, deleted, ledger rows: $ledger, exposed port ok, bg_max_ms=$bg_max$warn"
  fi
}

judge_sandbox_foreign() { # $1 = output of SANDBOX_FOREIGN_JS
  local n
  n="$(tr -d '[:space:]' <<<"${1:-}")"
  if [[ "$n" =~ ^[0-9]+$ ]]; then
    echo "OK sandbox-foreign: $n foreign accounts with a sandbox row"
  else
    echo "FAIL sandbox-foreign: ledger query gave no answer"
  fi
}

rand_hex() { od -An -tx1 -N8 /dev/urandom | tr -d ' \n'; }

# One string or number field of a JSON answer, empty when it is not there.
# shellcheck disable=SC2016
json_field() { # $1 = file, $2 = field
  node -e 'try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; if (typeof v === "string" || typeof v === "number") process.stdout.write(String(v)); } catch (e) {}' "$1" "$2" 2>/dev/null
}

# One call to the public API; the key comes from a header file (never on a command line), the answer goes to $4, the
# HTTP status to stdout.
sandbox_api() { # $1 = header file, $2 = method, $3 = path, $4 = answer file, $5 = JSON body (optional), $6 = extra header (optional)
  local args=(-s -o "$4" -w '%{http_code}' --max-time 150 -X "$2" -H "@$1")
  [ -n "${5:-}" ] && args+=(-H 'Content-Type: application/json' --data-binary "$5")
  [ -n "${6:-}" ] && args+=(-H "$6")
  curl "${args[@]}" "$BASE$3"
}

# The public_url of the exposed port, $1 = url, $2 = sandbox id: exactly https://sbx-<id>-<port>.<domain>, and never a
# name under the payment domain, so a customer's service never answers inside the zone every paid call goes through.
port_url_ok() {
  [[ "$1" =~ ^https://(sbx-$2-$PORT_NUMBER(\.[a-z0-9-]+)+)$ ]] || return 1
  case "${BASH_REMATCH[1]}" in *.postyourprice.com) return 1 ;; esac
}

# One fetch through the public_url, $1 = url, $2 = seconds at most. No key goes with it: the address is a customer's.
port_fetch() {
  curl -s --proto '=https' --max-time "$2" "$1/" 2>/dev/null | head -c 200
}

# The port step of the check `sandbox` (sandbox 07), $1 = header file, $2 = answer file, $3 = sandbox id. Exposes
# PORT_NUMBER, starts a small server with a canary line in the sandbox, fetches the canary through the public_url for at
# most PORT_WAIT s and gives the port back. Prints one token: ok, expose_<status>, no_url, bad_url, server_<status>,
# fetch_failed or unexpose_<status>. Once ports/expose answered 2xx the port is given back, whatever failed after it.
port_live() {
  local hdr="$1" ans="$2" id="$3" code url canary result="" deadline left got
  code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/ports/expose" "$ans" "{\"port\":$PORT_NUMBER}")"
  case "$code" in
    200 | 201) ;;
    "" | 000)
      echo expose_none
      return
      ;;
    *)
      echo "expose_$code"
      return
      ;;
  esac
  url="$(json_field "$ans" public_url)"
  url="${url%/}"
  if [ -z "$url" ]; then
    result=no_url
  elif ! port_url_ok "$url" "$id"; then
    result=bad_url
  else
    canary="live-port-$(rand_hex)"
    code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/exec" "$ans" "{\"command\":\"mkdir -p /root/live-port && echo $canary > /root/live-port/index.html && cd /root/live-port && (setsid python3 -m http.server $PORT_NUMBER > /dev/null 2>&1 &) ; sleep 1; true\",\"timeout\":30000}" "Idempotency-Key: live-check-port-$(rand_hex)")"
    if [ "$code" != 200 ]; then
      result="server_${code:-none}"
    else
      # Through Cloudflare and Caddy: the first fetches may meet a name or a route not there yet, so it retries every
      # 5 s, each fetch bounded by the time left.
      result=fetch_failed
      deadline=$((SECONDS + PORT_WAIT))
      while :; do
        left=$((deadline - SECONDS))
        [ "$left" -ge 1 ] || left=1
        [ "$left" -le 10 ] || left=10
        got="$(port_fetch "$url" "$left")"
        if [ "${got%$'\r'}" = "$canary" ]; then
          result=""
          break
        fi
        [ $((SECONDS + 5)) -lt "$deadline" ] || break
        sleep 5
      done
    fi
  fi
  code="$(sandbox_api "$hdr" DELETE "/v1/sandboxes/$id/ports/$PORT_NUMBER" "$ans")"
  if [ -z "$result" ]; then
    case "$code" in
      2[0-9][0-9]) result=ok ;;
      "" | 000) result=unexpose_none ;;
      *) result="unexpose_$code" ;;
    esac
  fi
  echo "$result"
}

# The live part of the check `sandbox`, $1 = ssh key. Prints the result line for judge_sandbox and nothing else: no id,
# no key. Once a sandbox exists it is deleted, whatever failed before.
sandbox_live() {
  local sshkey="$1" client_key=fail ctl=none create=none exec_=skipped bg=skipped bg_max=0 files=skipped delete=skipped ledger=none port=skipped
  local last remote apikey="" hdr ans code id="" out text start exitf outf deadline
  last="$(CP_HOST="$CP_HOST" CP_SSH_KEY="$sshkey" bash "$CLIENT_KEY_SETUP" --client-key "$SANDBOX_HOST" </dev/null 2>/dev/null | tail -n 1)"
  case "$last" in "SETUP CLIENT-KEY OK"*) client_key=ok ;; esac

  remote="docker exec deploy-cp-1 node -e $(printf %q "$CTL_JS") $(printf %q "$CTL_URL") /data/sandbox-client.key"
  ctl="$(ssh -i "$sshkey" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null | tail -n 1)"
  [[ "$ctl" =~ ^[a-z0-9]{1,8}$ ]] || ctl="${ctl:+error}"

  # A new client key: wait out the 501 the service gives for RECHECK_MS after its last failed call to sandboxd.
  [ "$last" = "SETUP CLIENT-KEY OK changed=1" ] && client_key_wait "$CLIENT_KEY_WAIT_S"

  [ -r "$LIVE_SANDBOX_ENV" ] && apikey="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  if [ -z "$apikey" ]; then
    create=nokey
  else
    hdr="$(mktemp -p "$(live_tmp)")"
    ans="$(mktemp -p "$(live_tmp)")"
    printf 'Authorization: %s\n' "$apikey" >"$hdr"
    create="$(sandbox_api "$hdr" POST /v1/sandboxes "$ans" '{"memory_mb":512,"vcpu":1,"disk_gb":5}')"
    if [ "$create" = 201 ]; then
      id="$(json_field "$ans" id)"
      [[ "$id" =~ ^[a-z0-9]{1,40}$ ]] || { id=""; create=noid; }
    fi
    if [ -n "$id" ]; then
      code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/exec" "$ans" '{"command":"echo ok","timeout":30000}' "Idempotency-Key: live-check-$(rand_hex)")"
      if [ "$code" = 200 ]; then
        out="$(json_field "$ans" stdout)"
        if [ "${out%$'\r'}" = ok ]; then exec_=ok; else exec_=wrong; fi
      else
        exec_="$code"
      fi

      # A command longer than the hold limit runs in the background (sandbox 05): answered after 20 s, then waited for
      # with the wait_command of the answer, the way the runtime follows the text (sandbox 09).
      read -r bg bg_max <<<"$(bg_live "$hdr" "$ans" "$id")"
      bg="${bg:-none}"
      [[ "$bg_max" =~ ^[0-9]+$ ]] || bg_max=0

      text="live-check-$(rand_hex)"
      code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/files/upload/json" "$ans" "{\"path\":\"/root/live-check.txt\",\"content\":\"$text\"}")"
      if [ "$code" != 200 ]; then
        files="upload-$code"
      else
        code="$(sandbox_api "$hdr" GET "/v1/sandboxes/$id/files/read?path=%2Froot%2Flive-check.txt" "$ans")"
        if [ "$code" != 200 ]; then
          files="read-$code"
        elif [ "$(json_field "$ans" content)" = "$text" ]; then
          files=ok
        else
          files=wrong
        fi
      fi

      # The exposed port (sandbox 07) runs in a subshell of its own and only prints its token, so whatever it meets, the
      # DELETE below still runs.
      port="$(port_live "$hdr" "$ans" "$id")"
      port="${port:-none}"

      delete="$(sandbox_api "$hdr" DELETE "/v1/sandboxes/$id" "$ans")"

      remote="docker exec deploy-cp-1 node -e $(printf %q "$SANDBOX_LEDGER_JS") /data/cp.db $(printf %q "$id")"
      ledger="$(ssh -i "$sshkey" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null | tail -n 1)"
      [[ "$ledger" =~ ^[0-9]+$ ]] || ledger=none
    fi
    rm -f "$hdr" "$ans"
  fi
  apikey=""
  echo "client_key=$client_key ctl=${ctl:-none} create=${create:-none} exec=$exec_ bg=$bg bg_max_ms=$bg_max files=$files delete=${delete:-none} ledger=$ledger port=$port"
}

# The query of the check `sandbox-foreign` against one database, $1 = how to run node on it: "local <file>" in the
# selftest, "remote <ssh key>" in live mode. Prints the count or nothing.
sandbox_foreign_count() {
  local lists ours names remote
  lists="$(ours_json "$OURS_TS")" || return 1
  ours="${lists%%$'\n'*}"
  names="${lists#*$'\n'}"
  if [ "$1" = local ]; then
    (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$SANDBOX_FOREIGN_JS" "$2" "$ours" "$names" 2>/dev/null)
  else
    remote="docker exec deploy-cp-1 node -e $(printf %q "$SANDBOX_FOREIGN_JS") /data/cp.db $(printf %q "$ours") $(printf %q "$names")"
    ssh -i "$2" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null
  fi
}

# ---- automaton (sandbox 08)

# How long the check `automaton` waits at most for status running with a turn, and what it creates: one automaton of our
# own account with a short genesis prompt (short turns, read only tools, then sleep), deleted again in every case.
AUTOMATON_WAIT=180
AUTOMATON_BODY='{"name":"live-check","genesis_prompt":"You are a test automaton inside a disposable live check. Nothing you do here matters. Keep every turn short: call at most one cheap read-only tool (check_credits, system_synopsis), then answer in one sentence. After your first turn, call the sleep tool with duration_seconds 3600."}'

# The answer of GET /v1/automatons/{id} ($1) as "<status> <turns>": status in lowercase letters or `other`, turns a
# number or -1. Nothing else of the answer leaves it.
# shellcheck disable=SC2016
AUTOMATON_STATE_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } const s = o && typeof o.status === "string" && /^[a-z]{1,20}$/.test(o.status) ? o.status : "other"; const t = o && Number.isInteger(o.turns) && o.turns >= 0 ? o.turns : -1; console.log(s + " " + t);'

# The key of the automaton from the answer of files/read on /root/.automaton/config.json ($1) into the header file $2 (mode
# 0600). Prints nothing; exit 1 without a key of the form cnwy_k_...
# shellcheck disable=SC2016
AUTOMATON_KEY_JS='const fs = require("fs"); const [ans, hdr] = process.argv.slice(1); let k = ""; try { k = JSON.parse(JSON.parse(fs.readFileSync(ans, "utf8")).content).apiKey; } catch (e) { k = ""; } if (typeof k !== "string" || !/^cnwy_k_[0-9A-Za-z]{8,128}$/.test(k)) process.exit(1); fs.writeFileSync(hdr, "Authorization: " + k + "\n", { mode: 0o600 });'

# The answer of GET /v1/automatons/{id}/logs ($1) against the keys in the header files $2 (LIVE_SANDBOX_KEY) and $3 (the key
# of the automaton): `leak` when the lines hold either key or any cnwy_k_ with 32 hex, `nolines` without a lines array,
# else `ok`. Never prints a line of the log.
# shellcheck disable=SC2016
AUTOMATON_LOGS_JS='const fs = require("fs"); const [ans, ...hdrs] = process.argv.slice(1); let o; try { o = JSON.parse(fs.readFileSync(ans, "utf8")); } catch (e) { o = null; } if (!o || !Array.isArray(o.lines)) { console.log("nolines"); process.exit(0); } const text = o.lines.map(String).join("\n"); const keys = hdrs.map((f) => { try { return fs.readFileSync(f, "utf8").replace(/^Authorization: (Bearer )?/, "").trim(); } catch (e) { return ""; } }).filter((k) => k.length >= 8); console.log(keys.some((k) => text.includes(k)) || /cnwy_k_[0-9a-f]{32}/.test(text) ? "leak" : "ok");'

# The live part of the check `automaton`: POST /v1/automatons with the key of our own account, at most AUTOMATON_WAIT s for
# status running with turns >= 1, the key of the automaton from config.json of its sandbox (into a header file, never into
# the output), that key answers 200 on GET /v1/credits/balance, the log holds no key, DELETE, and afterwards the same key
# answers 401. Prints one token: ok, nokey, create_<status>, noid, timeout, status_<status>, key_<status>, key_missing,
# key_rejected_<status>, logs_<status>, logs_leak, logs_nolines, delete_<status> or revoked_<status>. Once the create
# answered with an id, the DELETE runs, whatever failed after it.
automaton_live() {
  local apikey="" hdr ans akhdr code id="" sbx="" token="" deadline st turns
  [ -r "$LIVE_SANDBOX_ENV" ] && apikey="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  if [ -z "$apikey" ]; then
    echo nokey
    return
  fi
  hdr="$(mktemp -p "$(live_tmp)")"
  ans="$(mktemp -p "$(live_tmp)")"
  akhdr="$(mktemp -p "$(live_tmp)")"
  printf 'Authorization: %s\n' "$apikey" >"$hdr"
  apikey=""
  code="$(sandbox_api "$hdr" POST /v1/automatons "$ans" "$AUTOMATON_BODY")"
  case "$code" in
    201)
      id="$(json_field "$ans" id)"
      sbx="$(json_field "$ans" sandbox_id)"
      [[ "$id" =~ ^[a-z0-9]{1,40}$ ]] || { id=""; token=noid; }
      ;;
    "" | 000) token=create_none ;;
    *) token="create_$code" ;;
  esac

  if [ -z "$token" ]; then
    token=timeout
    deadline=$((SECONDS + AUTOMATON_WAIT))
    while :; do
      code="$(sandbox_api "$hdr" GET "/v1/automatons/$id" "$ans")"
      if [ "$code" = 200 ]; then
        read -r st turns <<<"$(NODE_NO_WARNINGS=1 node -e "$AUTOMATON_STATE_JS" "$ans" 2>/dev/null)"
        [ -n "$sbx" ] || sbx="$(json_field "$ans" sandbox_id)"
        if [ "$st" = running ] && [ "${turns:--1}" -ge 1 ]; then
          token=""
          break
        fi
        case "$st" in failed | stopped) token="status_$st"; break ;; esac
      fi
      [ $((SECONDS + 5)) -lt "$deadline" ] || break
      sleep 5
    done
  fi

  if [ -z "$token" ]; then
    [[ "$sbx" =~ ^[a-z0-9]{1,40}$ ]] || sbx=""
    code="$(sandbox_api "$hdr" GET "/v1/sandboxes/${sbx:-none}/files/read?path=%2Froot%2F.automaton%2Fconfig.json" "$ans")"
    if [ "$code" != 200 ]; then
      token="key_${code:-none}"
    elif ! (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$AUTOMATON_KEY_JS" "$ans" "$akhdr" 2>/dev/null); then
      token=key_missing
    else
      # The key read from config.json must work before the DELETE, or the 401 after it proves nothing.
      code="$(sandbox_api "$akhdr" GET /v1/credits/balance "$ans")"
      [ "$code" = 200 ] || token="key_rejected_${code:-none}"
    fi
  fi

  if [ -z "$token" ]; then
    code="$(sandbox_api "$hdr" GET "/v1/automatons/$id/logs" "$ans")"
    if [ "$code" != 200 ]; then
      token="logs_${code:-none}"
    else
      case "$(NODE_NO_WARNINGS=1 node -e "$AUTOMATON_LOGS_JS" "$ans" "$hdr" "$akhdr" 2>/dev/null)" in
        ok) ;;
        leak) token=logs_leak ;;
        *) token=logs_nolines ;;
      esac
    fi
  fi

  if [ -n "$id" ]; then
    code="$(sandbox_api "$hdr" DELETE "/v1/automatons/$id" "$ans")"
    if [ -z "$token" ] && { [ "$code" != 200 ] || [ "$(json_field "$ans" status)" != deleted ]; }; then
      token="delete_${code:-none}"
    fi
  fi

  if [ -z "$token" ]; then
    code="$(sandbox_api "$akhdr" GET /v1/credits/balance "$ans")"
    [ "$code" = 401 ] || token="revoked_${code:-none}"
  fi
  rm -f "$hdr" "$ans" "$akhdr"
  echo "${token:-ok}"
}

judge_automaton() { # $1 = token of automaton_live
  local t="${1:-}" p="POST /v1/automatons"
  case "$t" in
    ok) echo "OK automaton: automaton=ok, $p 201, running with a turn within $AUTOMATON_WAIT s, logs without a key, deleted, the key of the automaton answered 401 after the DELETE" ;;
    "") echo "FAIL automaton: no result" ;;
    nokey) echo "FAIL automaton: no LIVE_SANDBOX_KEY readable in live-sandbox.env" ;;
    create_404) echo "FAIL automaton: $p answered 404 (not rolled out yet)" ;;
    create_402) echo "FAIL automaton: $p answered 402, the own account has not enough credits" ;;
    create_none) echo "FAIL automaton: $p gave no answer" ;;
    create_*) echo "FAIL automaton: $p answered ${t#create_}, expected 201" ;;
    noid) echo "FAIL automaton: $p answered 201 without an id" ;;
    timeout) echo "FAIL automaton: no status running with a turn within $AUTOMATON_WAIT s" ;;
    status_*) echo "FAIL automaton: status ${t#status_} before the first turn" ;;
    key_missing) echo "FAIL automaton: config.json of its sandbox holds no apiKey" ;;
    key_rejected_*) echo "FAIL automaton: the key of the automaton answered ${t#key_rejected_} on GET /v1/credits/balance before the DELETE, expected 200" ;;
    key_*) echo "FAIL automaton: read of config.json of its sandbox answered ${t#key_}, expected 200" ;;
    logs_leak) echo "FAIL automaton: the log holds an API key" ;;
    logs_nolines) echo "FAIL automaton: GET /v1/automatons/{id}/logs answered 200 without lines" ;;
    logs_*) echo "FAIL automaton: GET /v1/automatons/{id}/logs answered ${t#logs_}, expected 200" ;;
    delete_*) echo "FAIL automaton: DELETE /v1/automatons/{id} answered ${t#delete_}, expected 200 with status deleted" ;;
    revoked_*) echo "FAIL automaton: the key of the automaton answered ${t#revoked_} on GET /v1/credits/balance after the DELETE, expected 401" ;;
    *) echo "FAIL automaton: failed: $t" ;;
  esac
}

selftest() {
  # No network in here, by construction: any attempt is an error.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }

  local dir
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  # Planted ledgers: none, two, one, one too small and two halves of the right sum, each next to decoys the query must not count (an
  # inference row and a refund under another key).
  local plant='const [file, credits, mc] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file); db.exec("SELECT 1"); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); } db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, address TEXT, kind TEXT, delta_mc INTEGER, ref TEXT)"); const ins = db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref) VALUES (?, ?, ?, ?)"); ins.run("planted-wallet", "inference", -79229, "gen-planted"); ins.run("planted-wallet", "refund", 500, "refund:another-batch"); for (let i = 0; i < Number(credits); i++) ins.run("planted-wallet", "refund", Number(mc), "refund:client-aborted-2026-11-10");'
  local case_ name credits mc expect got code first all_ok=1
  for case_ in "none 0 $REFUND_MC FAIL" "double 2 $REFUND_MC FAIL" "single 1 $REFUND_MC OK" "short 1 61644 FAIL" "split 2 39614 FAIL"; do
    read -r name credits mc expect <<<"$case_"
    (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$plant" "$dir/$name.db" "$credits" "$mc") || {
      echo "FAIL selftest: could not plant $name"
      all_ok=0
      continue
    }
    got="$(judge_refund "$(cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$QUERY_JS" "$dir/$name.db" "$REFUND_KEY")")"
    echo "planted $name: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done

  # The HTTP judges, both directions.
  for case_ in "200 OK" "502 FAIL" "none FAIL"; do
    read -r code expect <<<"$case_"
    [ "$code" = none ] && code=""
    got="$(judge_health "$code")"
    echo "planted health ${code:-none}: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done
  for case_ in "200 { OK" "200 < FAIL" "500 { FAIL"; do
    read -r code first expect <<<"$case_"
    got="$(judge_status "$code" "$first")"
    echo "planted status $code $first: $got"
    [ "${got%% *}" = "$expect" ] || all_ok=0
  done

  # The domain route, both directions: the 401 of the auth in front of it, the 404 of the fallback route as it answered
  # before domains 01, a 401 without a JSON error, a 200 (the route would then answer without a key) and no answer.
  local body401='{"error":"Invalid API key","message":"Send the control plane API key"}'
  local body404='{"error":"not_found","message":"No endpoint at /v1/domains/search"}'
  local d_case d_code d_body d_expect
  for d_case in "401|$body401|OK" "404|$body404|FAIL" "401|<html>|FAIL" "200|{\"results\":[]}|FAIL" "||FAIL"; do
    IFS='|' read -r d_code d_body d_expect <<<"$d_case"
    got="$(judge_domains "$d_code" "$d_body")"
    echo "planted domains ${d_code:-none}: $got"
    [ "${got%% *}" = "$d_expect" ] || all_ok=0
  done

  # The search with a key, both directions: the answer of the handler (501 with the five marks), the 404 of the fallback
  # route, a 401 for a key the auth refused, a 501 without names and reason (the answer of POST /v1/domains/register), a
  # 200 with results[] and available: false (the answer before domains 01 Zyklus 3), no answer and no readable key. The
  # case nokey goes through domains_search_live with a missing key file, so the live path itself says nokey. The cases
  # mark-* take one mark at a time out of the right answer.
  local ds_ok='{"error":"not_implemented","reason":"domain search is not offered","names":["livecheck.com"],"message":"No domain can be registered here, so availability was not checked for livecheck.com. Nothing was charged.","docs":"https://postyourprice.com/docs#domains"}'
  local ds_fields='{"error":"not_implemented","message":"The domain was not registered and nothing was charged.","docs":"https://postyourprice.com/docs#domains"}'
  local ds_taken='{"results":[{"domain":"livecheck.com","available":false,"registrationPrice":0,"renewalPrice":0,"currency":"USD"}]}'
  local ds_401='{"error":"Invalid API key","message":"Send the control plane API key"}'
  local ds_live ds_case ds_name ds_code ds_body ds_expect
  ds_live="$(LIVE_SANDBOX_ENV="$dir/missing-live-sandbox.env" domains_search_live)"
  for ds_case in "ok|501|$ds_ok|OK" "404|404|$body404|FAIL" "401|401|$ds_401|FAIL" "fields|501|$ds_fields|FAIL" \
    "taken|200|$ds_taken|FAIL" "none|||FAIL" "nokey|${ds_live%%$'\n'*}||FAIL" \
    "mark-names|501|${ds_ok/livecheck.com\"]/other.com\"]}|FAIL" \
    "mark-message|501|${ds_ok/No domain can be registered here/Search is down}|FAIL" \
    "mark-taken|501|${ds_ok/Nothing was charged./The name is TAKEN.}|FAIL"; do
    IFS='|' read -r ds_name ds_code ds_body ds_expect <<<"$ds_case"
    got="$(judge_domains_search "$ds_code" "$ds_body")"
    echo "planted domains-search $ds_name: $got"
    [ "${got%% *}" = "$ds_expect" ] || all_ok=0
  done
  [ "$ds_live" = nokey ] || { echo "FAIL selftest: domains_search_live without a key file did not say nokey"; all_ok=0; }

  # The timeout quote since the rollout, through the real ops/timeout-quote.sh: a long abort shows a quote above 0, calls
  # without one show exactly 0, a row from before the rollout stays out, and no answer is a FAIL.
  printf '%s\n' '{"src":"ledger","at":"2026-11-11T09:00:00.000Z","ref":"gen-1","model":"openai/gpt-5.2","duration_ms":null}' \
    '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}' \
    '{"src":"abort","at":"2026-11-12T10:00:00.000Z","ref":null,"model":"openai/gpt-5.2","duration_ms":59950}' \
    '{"src":"ledger","at":"2026-11-12T11:00:00.000Z","ref":"gen-3","model":"openai/gpt-5-mini","duration_ms":4000}' >"$dir/tq-long.jsonl"
  printf '%s\n' '{"src":"ledger","at":"2026-11-12T09:00:00.000Z","ref":"gen-2","model":"openai/gpt-5.2","duration_ms":12000}' >"$dir/tq-short.jsonl"
  : >"$dir/tq-none.jsonl"
  local tq_case tq_file tq_expect
  for tq_case in "long|openai/gpt-5.2 1/2 (50.0 %)" "long|openai/gpt-5-mini 0/1 (0.0 %)" "short|openai/gpt-5.2 0/1 (0.0 %)" "none|no call since the rollout yet"; do
    tq_file="${tq_case%%|*}"
    tq_expect="${tq_case#*|}"
    got="$(judge_timeout_quote "$(TQ_SINCE='' bash "$ROOT/ops/timeout-quote.sh" --rows "$dir/tq-$tq_file.jsonl" 2>/dev/null)")"
    echo "planted timeout-quote $tq_file: $got"
    case "$got" in "OK timeout-quote: "*"$tq_expect"*) ;; *) all_ok=0 ;; esac
  done
  for tq_case in "" "garbage" "TIMEOUT QUOTE FAIL: ledger not readable"; do
    got="$(judge_timeout_quote "$tq_case")"
    echo "planted timeout-quote answer '${tq_case}': $got"
    [ "${got%% *}" = "FAIL" ] || all_ok=0
  done

  # The check `sandbox`, its judge in both directions: all steps good, then each step failing on its own (the ledger row
  # missing, the wrong exec text, a 401 over ctl.sbx, the client key not set, the 501 of an unreachable sandbox server),
  # a file that reads back different, a ledger query without an answer, and no result at all. The background exec
  # (sandbox 05 and 09) fails on its own too: held instead of running, a 504, no wait_command or not on the last line,
  # the end on the first call, still running after three calls, a call of 30000 ms, a 504 of the call, stopped at its timeout (124), no bg-ok in the
  # output, and a result line without the step at all. The exposed port (sandbox 07) fails on its
  # own too: the 409 of the control plane before the rollout, no answer, no public_url, a public_url under the payment
  # domain, the server not started, no canary within 60 s, the port not given back, and a result line without the step.
  local s_good="client_key=ok ctl=200 create=201 exec=ok bg=ok files=ok delete=200 ledger=1 port=ok"
  local s_case s_line s_expect
  for s_case in "$s_good|OK" "${s_good/ledger=1/ledger=0}|FAIL" "${s_good/exec=ok/exec=wrong}|FAIL" \
    "${s_good/ctl=200/ctl=401}|FAIL" "${s_good/client_key=ok/client_key=fail}|FAIL" \
    "client_key=ok ctl=200 create=501 exec=skipped files=skipped delete=skipped ledger=none|FAIL" \
    "${s_good/files=ok/files=wrong}|FAIL" "${s_good/ledger=1/ledger=none}|FAIL" "|FAIL" \
    "${s_good/bg=ok/bg=start-notrunning}|FAIL" "${s_good/bg=ok/bg=start-504}|FAIL" "${s_good/bg=ok/bg=start-nowait}|FAIL" \
    "${s_good/bg=ok/bg=start-waitnotlast}|FAIL" "${s_good/bg=ok/bg=wait-still}|FAIL" "${s_good/bg=ok/bg=wait-first}|FAIL" "${s_good/bg=ok/bg=wait-slow-30000}|FAIL" \
    "${s_good/bg=ok/bg=wait-status-504}|FAIL" "${s_good/bg=ok/bg=wait-exit-124}|FAIL" "${s_good/bg=ok/bg=wait-wrong}|FAIL" \
    "${s_good/ bg=ok/}|FAIL" \
    "client_key=ok ctl=200 create=201 exec=ok files=ok delete=200 ledger=1|FAIL" \
    "${s_good/port=ok/port=expose_409}|FAIL" "${s_good/port=ok/port=expose_none}|FAIL" \
    "${s_good/port=ok/port=no_url}|FAIL" "${s_good/port=ok/port=bad_url}|FAIL" "${s_good/port=ok/port=server_504}|FAIL" \
    "${s_good/port=ok/port=fetch_failed}|FAIL" "${s_good/port=ok/port=unexpose_404}|FAIL" "${s_good/ port=ok/}|FAIL"; do
    s_line="${s_case%|*}"
    s_expect="${s_case##*|}"
    got="$(judge_sandbox "$s_line")"
    echo "planted sandbox '${s_line}': $got"
    [ "${got%% *}" = "$s_expect" ] || all_ok=0
  done

  # The longest call of wait_command in the line OK sandbox: (hosting 02), in both directions: below BG_WARN_MS without a
  # warning, from BG_WARN_MS on with one, and OK either way, because a FAIL would trigger a revert.
  local w_case w_ms w_warn
  for w_case in "25000 no" "26999 no" "27000 yes" "29999 yes"; do
    read -r w_ms w_warn <<<"$w_case"
    got="$(judge_sandbox "${s_good/bg=ok/bg=ok bg_max_ms=$w_ms}")"
    echo "planted sandbox bg_max_ms=$w_ms: $got"
    [ "${got%% *}" = OK ] || all_ok=0
    case "$got" in *"bg_max_ms=$w_ms"*) ;; *) all_ok=0 ;; esac
    if [ "$w_warn" = yes ]; then
      [[ "$got" == *"warning"*"$BG_WARN_MS ms"* ]] || all_ok=0
    else
      [[ "$got" != *warning* ]] || all_ok=0
    fi
  done

  # Planted databases for both sandbox queries: ledger rows and api keys from a JSON spec, no ledger table when the spec
  # has none. The own address is the one of the live check, read from src/bounties/ours.ts.
  local s_plant='const [file, spec] = process.argv.slice(1); const s = JSON.parse(spec); let db; try { db = require("better-sqlite3")(file); db.exec("SELECT 1"); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); } db.exec("CREATE TABLE api_keys (id INTEGER PRIMARY KEY, address TEXT, name TEXT)"); for (const [a, n] of s.keys || []) db.prepare("INSERT INTO api_keys (address, name) VALUES (?, ?)").run(a, n); if (s.ledger) { db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, address TEXT, kind TEXT, delta_mc INTEGER, ref TEXT)"); for (const [a, k, d, r] of s.ledger) db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref) VALUES (?, ?, ?, ?)").run(a, k, d, r); }'
  local own f1="0x1111111111111111111111111111111111111111" f2="0x2222222222222222222222222222222222222222"
  local kn="0x3333333333333333333333333333333333333333"
  own="$(grep -oE 'LIVE_SANDBOX_ADDRESS = "[^"]+"' "$OURS_TS" | grep -oE '0x[0-9a-fA-F]{40}')"
  [ -n "$own" ] || { echo "FAIL selftest: no LIVE_SANDBOX_ADDRESS in src/bounties/ours.ts"; all_ok=0; }
  local r_f1a="[\"$f1\",\"sandbox\",-2000,\"sandbox:aaaaaaaaaa:0\"]" r_f1b="[\"$f1\",\"sandbox\",-2000,\"sandbox:aaaaaaaaaa:1\"]"
  local r_f2="[\"$f2\",\"sandbox\",-2000,\"sandbox:bbbbbbbbbb:0\"]" r_own="[\"$own\",\"sandbox\",-2000,\"sandbox:cccccccccc:0\"]"
  local r_kn="[\"$kn\",\"sandbox\",-2000,\"sandbox:dddddddddd:0\"]" r_inf="[\"$f1\",\"inference\",-79229,\"gen-planted\"]"
  local k_kn="[\"$kn\",\"ops-live-sandbox\"]"
  local p_case p_name p_spec p_expect
  plant_sandbox() { # $1 = name, $2 = spec
    (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$s_plant" "$dir/sbx-$1.db" "$2") || {
      echo "FAIL selftest: could not plant sbx-$1"
      all_ok=0
    }
  }

  # sandbox-foreign through the real query: a foreign row counts, our own address and an address with a key named like
  # ours do not, a foreign account with only another kind of row does not, two rows of one account count once, all of it
  # together counts the two foreign accounts, and a database without a ledger is a FAIL.
  for p_case in "foreign|{\"ledger\":[$r_f1a]}|1" "own|{\"ledger\":[$r_own]}|0" \
    "keyname|{\"keys\":[$k_kn],\"ledger\":[$r_kn]}|0" "inference|{\"ledger\":[$r_inf]}|0" \
    "twice|{\"ledger\":[$r_f1a,$r_f1b]}|1" \
    "mixed|{\"keys\":[$k_kn],\"ledger\":[$r_f1a,$r_f1b,$r_own,$r_kn,$r_inf,$r_f2]}|2" "noledger|{\"keys\":[$k_kn]}|FAIL"; do
    IFS='|' read -r p_name p_spec p_expect <<<"$p_case"
    plant_sandbox "$p_name" "$p_spec"
    got="$(judge_sandbox_foreign "$(sandbox_foreign_count local "$dir/sbx-$p_name.db")")"
    echo "planted sandbox-foreign $p_name: $got"
    if [ "$p_expect" = FAIL ]; then
      [ "${got%% *}" = FAIL ] || all_ok=0
    else
      [ "$got" = "OK sandbox-foreign: $p_expect foreign accounts with a sandbox row" ] || all_ok=0
    fi
  done
  # Without the own lists the query answers nothing rather than counting our own accounts as foreign.
  got="$(judge_sandbox_foreign "$(OURS_TS="$dir/missing-ours.ts" sandbox_foreign_count local "$dir/sbx-own.db")")"
  echo "planted sandbox-foreign without ours.ts: $got"
  [ "${got%% *}" = FAIL ] || all_ok=0

  # The ledger query of the check `sandbox` through the real query: the id with its row counts 1 and the check is OK; an
  # id with only a row of another kind, an id that is a prefix of a booked one and an unknown id count 0 and FAIL.
  plant_sandbox ledger "{\"ledger\":[[\"$own\",\"sandbox\",-2000,\"sandbox:k3v9q2m7x1:0\"],[\"$own\",\"inference\",-5,\"sandbox:zzzzzzzzzz:0\"],[\"$own\",\"sandbox\",-2000,\"sandbox:k3v9q2m7x1x:0\"]]}"
  local l_case l_id l_expect l_n
  for l_case in "k3v9q2m7x1 OK" "zzzzzzzzzz FAIL" "k3v9q2m7x FAIL" "q0q0q0q0q0 FAIL"; do
    read -r l_id l_expect <<<"$l_case"
    l_n="$(cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$SANDBOX_LEDGER_JS" "$dir/sbx-ledger.db" "$l_id" 2>/dev/null)"
    got="$(judge_sandbox "${s_good/ledger=1/ledger=$l_n}")"
    echo "planted sandbox ledger for id $l_id (${l_n:-no answer} rows): $got"
    [ "${got%% *}" = "$l_expect" ] || all_ok=0
  done

  # The background step of the check `sandbox` (sandbox 09) through the real bg_live, with stand-ins for the public API
  # and the clock. Both directions: the end after one or two "still running" is ok; the end on the first call (no full
  # wait), still running three times, a 504 of the call, a call of 30000 ms on the first or second call, exit code 124, no bg-ok, an answer without wait_command, one where it is not
  # the last line of stdout, one naming another exit file and a held answer each give their own token. Every call of the
  # wait command sends exactly {"command": wait_command}, no timeout.
  local b_wc='i=0; while [ ! -f /root/.exec/0a1b2c3d4e5f.exit ] && [ $i -lt 25 ]; do sleep 1; i=$((i+1)); done; if [ -f /root/.exec/0a1b2c3d4e5f.exit ]; then cat /root/.exec/0a1b2c3d4e5f.out; fi'
  local b_files='"output_file":"/root/.exec/0a1b2c3d4e5f.out","error_file":"/root/.exec/0a1b2c3d4e5f.err","exit_code_file":"/root/.exec/0a1b2c3d4e5f.exit"'
  printf '{"stdout":"The command is still running in the background.\\n%s","stderr":"","exit_code":-1,"running":true,%s,"wait_command":"%s"}' "$b_wc" "$b_files" "$b_wc" >"$dir/bg-start-ok.json"
  printf '{"stdout":"The command is still running in the background.","stderr":"","exit_code":-1,"running":true,%s}' "$b_files" >"$dir/bg-start-nowait.json"
  printf '{"stdout":"The command is still running in the background.\\n%s\\nmore","stderr":"","exit_code":-1,"running":true,%s,"wait_command":"%s"}' "$b_wc" "$b_files" "$b_wc" >"$dir/bg-start-notlast.json"
  printf '{"stdout":"The command is still running in the background.\\n%s","stderr":"","exit_code":-1,"running":true,%s,"wait_command":"%s"}' "${b_wc//0a1b2c3d4e5f.exit/ffffffffffff.exit}" "$b_files" "${b_wc//0a1b2c3d4e5f.exit/ffffffffffff.exit}" >"$dir/bg-start-otherexit.json"
  printf '{"stdout":"bg-ok\\n","stderr":"","exit_code":0}' >"$dir/bg-start-held.json"
  printf '{"stdout":"The command has ended with exit code 0.\\nbg-ok\\n","stderr":"","exit_code":0}' >"$dir/bg-wait-ended0.json"
  printf '{"stdout":"The command has ended with exit code 124.\\n","stderr":"","exit_code":124}' >"$dir/bg-wait-ended124.json"
  printf '{"stdout":"The command has ended with exit code 0.\\n\\n","stderr":"","exit_code":0}' >"$dir/bg-wait-nobgok.json"
  printf '{"stdout":"The command is still running. Run the same command again to wait up to 25 more seconds.\\n","stderr":"","exit_code":0}' >"$dir/bg-wait-still.json"
  printf '{"error":"gateway_timeout"}' >"$dir/bg-wait-none.json"
  local b_body b_case b_name b_start b_waits b_expect b_calls b_tok b_n b_max
  b_body="$(cd "$ROOT" && NODE_NO_WARNINGS=1 node -e 'process.stdout.write(JSON.stringify({ command: process.argv[1] }))' "$b_wc")"
  bg_step() { # $1 = start answer, $2 = comma list of wait answers <status>:<ms>:<answer>, $3 = call log
    (
      b_start="$1" b_waits="$2" b_log="$3"
      echo 0 >"$b_log.clock"
      now_ms() { cat "$b_log.clock"; }
      sandbox_api() { # stand-in of the public API: logs the call, answers from the case
        local k spec st ms what
        case "$2 $3" in
          "POST /v1/sandboxes/k3v9q2m7x1/exec")
            if [[ "$5" == *'"timeout":120000'* ]]; then
              echo "START $5" >>"$b_log"
              cp "$dir/bg-start-$b_start.json" "$4"
              echo 200
              return
            fi
            echo "WAIT $5" >>"$b_log"
            k="$(grep -c '^WAIT ' "$b_log")"
            spec="$(tr ',' '\n' <<<"$b_waits" | sed -n "${k}p")"
            IFS=: read -r st ms what <<<"$spec"
            echo $(($(cat "$b_log.clock") + ${ms:-0})) >"$b_log.clock"
            cp "$dir/bg-wait-${what:-none}.json" "$4"
            echo "${st:-000}"
            ;;
          *) echo 404 ;;
        esac
      }
      bg_live "$dir/bg-hdr" "$dir/bg-ans" k3v9q2m7x1
    )
  }
  for b_case in "ok|ok|200:25000:still,200:5000:ended0|ok|2" \
    "still|ok|200:25000:still,200:25000:still,200:5000:ended0|ok|3" "first|ok|200:5000:ended0|wait-first|1" \
    "thrice|ok|200:25000:still,200:25000:still,200:25000:still|wait-still|3" "504|ok|504:100:none|wait-status-504|1" \
    "slow|ok|200:30000:still|wait-slow-30000|1" "slow2|ok|200:25000:still,200:30000:ended0|wait-slow-30000|2" \
    "exit124|ok|200:25000:still,200:5000:ended124|wait-exit-124|2" \
    "nobgok|ok|200:25000:still,200:5000:nobgok|wait-wrong|2" "nowait|nowait||start-nowait|0" "notlast|notlast||start-waitnotlast|0" \
    "otherexit|otherexit||start-nowait|0" "held|held||start-notrunning|0"; do
    IFS='|' read -r b_name b_start b_waits b_expect b_calls <<<"$b_case"
    : >"$dir/bg-$b_name.log"
    read -r b_tok b_max <<<"$(bg_step "$b_start" "$b_waits" "$dir/bg-$b_name.log")"
    b_n="$(grep -c '^WAIT ' "$dir/bg-$b_name.log")"
    echo "planted background step $b_name: bg=${b_tok:-nothing} waits=$b_n bg_max_ms=${b_max:-nothing}"
    [ "$b_tok" = "$b_expect" ] && [ "$b_n" = "$b_calls" ] || all_ok=0
    # The longest call of wait_command (hosting 02): the largest planted duration, 0 when no call ran.
    [ "$b_max" = "$(tr ',' '\n' <<<"$b_waits" | cut -d: -f2 | sort -n | tail -n 1 | grep . || echo 0)" ] || all_ok=0
    if grep '^WAIT ' "$dir/bg-$b_name.log" | grep -vqxF "WAIT $b_body"; then
      echo "FAIL selftest: background step $b_name sent another body than {\"command\": wait_command}"
      all_ok=0
    fi
    got="$(judge_sandbox "${s_good/bg=ok/bg=${b_tok:-nothing} bg_max_ms=${b_max:-nothing}}")"
    echo "planted background $b_name: $got"
    if [ "$b_expect" = ok ]; then
      [ "${got%% *}" = OK ] || all_ok=0
    else
      [ "${got%% *}" = FAIL ] || all_ok=0
    fi
  done

  # The port step of the check `sandbox` (sandbox 07) through the real port_live, with stand-ins for the public API, the
  # fetch through the public_url and sleep (which only moves SECONDS on, so 60 s pass at once). Both directions: the canary
  # on the first and on the third fetch is ok; no canary within 60 s, the 409 before the rollout, no answer, no
  # public_url, one under the payment domain or for another sandbox, a 504 of the server start and a 404 of the DELETE
  # each give their own token. The port is given back whenever ports/expose answered 2xx, also when a later step failed.
  local p_good="https://sbx-k3v9q2m7x1-8080.example.dev"
  local pc pc_name pc_expose pc_url pc_server pc_hit pc_unexpose pc_expect pc_back pc_log pc_tok pc_un pc_n
  port_step() { # $1 = expose status, $2 = public_url or -, $3 = exec status, $4 = fetch that sees the canary (0: none), $5 = unexpose status, $6 = call log
    (
      p_expose="$1" p_url="$2" p_server="$3" p_hit="$4" p_unexpose="$5" p_log="$6"
      sandbox_api() { # stand-in of the public API: logs the call, answers from the case
        echo "$2 $3" >>"$p_log"
        case "$2 $3" in
          "POST /v1/sandboxes/k3v9q2m7x1/ports/expose")
            if [ "$p_url" = - ]; then printf '{"port":8080}' >"$4"; else printf '{"port":8080,"public_url":"%s"}' "$p_url" >"$4"; fi
            echo "$p_expose"
            ;;
          "POST /v1/sandboxes/k3v9q2m7x1/exec")
            printf '%s' "$5" >"$p_log.exec"
            printf '{"stdout":"","stderr":"","exit_code":0}' >"$4"
            echo "$p_server"
            ;;
          "DELETE /v1/sandboxes/k3v9q2m7x1/ports/8080") echo "$p_unexpose" ;;
          *) echo 404 ;;
        esac
      }
      port_fetch() { # stand-in of the fetch: the canary of the server start from fetch number p_hit on
        echo "FETCH $1" >>"$p_log"
        [ "$p_hit" != 0 ] && [ "$(grep -c '^FETCH ' "$p_log")" -ge "$p_hit" ] && grep -oE 'live-port-[0-9a-f]+' "$p_log.exec" | head -n 1
      }
      sleep() { SECONDS=$((SECONDS + ${1%%.*})); }
      port_live "$dir/port-hdr" "$dir/port-ans" k3v9q2m7x1
    )
  }
  for pc in "ok|200|$p_good|200|1|200|ok|yes" "late|201|$p_good|200|3|200|ok|yes" "never|200|$p_good|200|0|200|fetch_failed|yes" \
    "409|409|-|200|1|200|expose_409|no" "none|000|-|200|1|200|expose_none|no" "nourl|200|-|200|1|200|no_url|yes" \
    "payurl|200|https://sbx-k3v9q2m7x1-8080.postyourprice.com|200|1|200|bad_url|yes" \
    "otherid|200|https://sbx-q0q0q0q0q0-8080.example.dev|200|1|200|bad_url|yes" \
    "server|200|$p_good|504|1|200|server_504|yes" "unexpose|200|$p_good|200|1|404|unexpose_404|yes"; do
    IFS='|' read -r pc_name pc_expose pc_url pc_server pc_hit pc_unexpose pc_expect pc_back <<<"$pc"
    pc_log="$dir/port-$pc_name.log"
    : >"$pc_log"
    pc_tok="$(port_step "$pc_expose" "$pc_url" "$pc_server" "$pc_hit" "$pc_unexpose" "$pc_log")"
    pc_un=no
    grep -qx "DELETE /v1/sandboxes/k3v9q2m7x1/ports/8080" "$pc_log" && pc_un=yes
    pc_n="$(grep -c '^FETCH ' "$pc_log")"
    echo "planted port step $pc_name: port=${pc_tok:-nothing} unexposed=$pc_un fetches=$pc_n"
    [ "$pc_tok" = "$pc_expect" ] && [ "$pc_un" = "$pc_back" ] || all_ok=0
    # Fetches go to the public_url only, and only after the server start answered 200.
    if grep '^FETCH ' "$pc_log" | grep -vqx "FETCH $p_good"; then
      echo "FAIL selftest: port step $pc_name fetched another address than the public_url"
      all_ok=0
    fi
    case "$pc_name" in
      ok | late | never | unexpose) [ "$pc_n" -ge 1 ] || all_ok=0 ;;
      *) [ "$pc_n" = 0 ] || all_ok=0 ;;
    esac
  done
  # Without the canary it retries for 60 s, not once and not longer: one fetch every 5 s.
  pc_n="$(grep -c '^FETCH ' "$dir/port-never.log")"
  [ "$pc_n" -ge 2 ] && [ "$pc_n" -le 12 ] || { echo "FAIL selftest: port step never made $pc_n fetches, expected 2 to 12"; all_ok=0; }

  # The check `handoff` through the real parts (HANDOFF_PREP_JS, HANDOFF_JS, judge_handoff), both directions: the answer of a
  # working service, then a 404 of the POST, an answer without match, a stream without pending, a page without match among
  # its numbers and a 404 of the page. The poll token of the planted answer is made here, not written out.
  local h_tok h_ok h_page h_pending h_case h_name h_cs h_cf h_ps h_pf h_sf h_hf h_expect
  h_tok="$(head -c 43 /dev/zero | tr '\0' 'q')"
  h_ok="{\"code\":\"7KQ2M9XC4D7K\",\"url\":\"https://postyourprice.com/h/7KQ2M9XC4D7K\",\"qr\":\" \",\"match\":47,\"expires_at\":\"2026-11-13T12:10:00.000Z\",\"poll_token\":\"$h_tok\"}"
  h_page='<form method="post" class="choices"><button class="btn" type="submit" name="pick" value="62">62</button><button class="btn" type="submit" name="pick" value="47">47</button><button class="btn" type="submit" name="pick" value="18">18</button></form>'
  h_pending=$'event: state\ndata: {"state":"pending"}\n\n'
  printf '%s' "$h_ok" >"$dir/h-create-ok"
  printf '%s' "${h_ok/\"match\":47,/}" >"$dir/h-create-nomatch"
  printf '%s' '{"error":"not_found"}' >"$dir/h-create-404"
  printf '%s' "$h_page" >"$dir/h-page-ok"
  printf '%s' "${h_page//47/33}" >"$dir/h-page-nomatch"
  printf '%s' '<h1>This code no longer works.</h1>' >"$dir/h-page-404"
  printf '%s' "$h_pending" >"$dir/h-stream-ok"
  printf '%s' ': keep-alive' >"$dir/h-stream-none"
  # The headers of the page: what the app sends behind Caddy with ?Referrer-Policy, what Caddy sent before konto 03 instead of
  # it, both values next to each other, and none.
  printf 'HTTP/2 200\r\ncache-control: no-store\r\nreferrer-policy: no-referrer\r\n\r\n' >"$dir/h-headers-ok"
  printf 'HTTP/2 200\r\nreferrer-policy: strict-origin-when-cross-origin\r\n\r\n' >"$dir/h-headers-caddy"
  printf 'HTTP/2 200\r\nreferrer-policy: no-referrer\r\nreferrer-policy: strict-origin-when-cross-origin\r\n\r\n' >"$dir/h-headers-both"
  printf 'HTTP/2 200\r\ncache-control: no-store\r\n\r\n' >"$dir/h-headers-none"
  [ -n "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$dir/h-create-ok" "$dir/h-hdr")" ] && grep -q "Bearer $h_tok" "$dir/h-hdr" ||
    { echo "FAIL selftest: HANDOFF_PREP_JS did not take the planted answer"; all_ok=0; }
  [ -z "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$dir/h-create-404" "$dir/h-hdr-404")" ] && [ ! -e "$dir/h-hdr-404" ] ||
    { echo "FAIL selftest: HANDOFF_PREP_JS took a 404"; all_ok=0; }
  for h_case in "ok 201 ok 200 ok ok ok OK" "404 404 404 none 404 none ok FAIL" "nomatch 201 nomatch 200 ok ok ok FAIL" \
    "nopending 201 ok 200 ok none ok FAIL" "pagenomatch 201 ok 200 nomatch ok ok FAIL" "page404 201 ok 404 404 ok ok FAIL" \
    "referrer-caddy 201 ok 200 ok ok caddy FAIL" "referrer-both 201 ok 200 ok ok both FAIL" "referrer-none 201 ok 200 ok ok none FAIL"; do
    read -r h_name h_cs h_cf h_ps h_pf h_sf h_hf h_expect <<<"$h_case"
    got="$(judge_handoff "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_JS" "$h_cs" "$dir/h-create-$h_cf" "$h_ps" "$dir/h-page-$h_pf" "$dir/h-stream-$h_sf" "$dir/h-headers-$h_hf")")"
    echo "planted handoff $h_name: $got"
    [ "${got%% *}" = "$h_expect" ] || all_ok=0
  done

  # A made-up key for the runs below, never a real one; the stand-in for ops/sandbox/setup.sh prints only its last line,
  # so no run starts the real script, which would reach the sandbox server over ssh in a child process.
  local fake_key
  fake_key="cnwy_k_planted$(head -c 24 /dev/zero | tr '\0' 'z')"
  printf 'LIVE_SANDBOX_KEY=%s\n' "$fake_key" >"$dir/live-sandbox.env"
  printf '#!/usr/bin/env bash\necho "SETUP CLIENT-KEY OK changed=0"\n' >"$dir/setup-changed-0.sh"
  printf '#!/usr/bin/env bash\necho "SETUP CLIENT-KEY OK changed=1"\n' >"$dir/setup-changed-1.sh"
  # Stand-ins for child processes (ops/timeout-quote.sh, the setup stand-in): curl and ssh on PATH fail as the functions do.
  mkdir -p "$dir/bin"
  printf '#!/usr/bin/env bash\necho "selftest must not reach the network ($(basename "$0"))" >&2\nexit 99\n' >"$dir/bin/curl"
  cp "$dir/bin/curl" "$dir/bin/ssh"
  chmod +x "$dir/bin/curl" "$dir/bin/ssh"

  # The wait after a new client key (domains 03), through the real sandbox_live: live_wait counts the seconds instead of
  # sleeping, and curl notes how many had passed when POST /v1/sandboxes went out, then answers nothing. Prints
  # "changed=<0|1> created_after=<seconds|none>". $1 = changed of the setup stand-in, $2 = CLIENT_KEY_WAIT_S or - for the
  # script's own.
  sandbox_wait_run() {
    (
      local w="$dir/wait-$1-$2"
      mkdir -p "$w"
      : >"$w/waited"
      : >"$w/created"
      CLIENT_KEY_SETUP="$dir/setup-changed-$1.sh"
      [ "$2" = - ] || CLIENT_KEY_WAIT_S="$2"
      LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
      CP_HOST=fake.invalid
      PATH="$dir/bin:$PATH"
      live_wait() { echo "$1" >>"$w/waited"; }
      curl() {
        local a
        for a in "$@"; do
          case "$a" in "$BASE/v1/sandboxes") awk '{ s += $1 } END { print s + 0 }' "$w/waited" >>"$w/created" ;; esac
        done
        printf 000
        return 7
      }
      sandbox_live "$dir/no-such-ssh-key" >/dev/null 2>/dev/null
      echo "changed=$1 created_after=$(head -n 1 "$w/created" | grep -E '^[0-9]+$' || echo none)"
    )
  }
  local w_case w_name w_changed w_wait w_expect recheck
  recheck="$(recheck_s)"
  for w_case in "new-key 1 - OK" "old-key 0 - OK" "no-wait 1 0 FAIL" "short 1 60 FAIL"; do
    read -r w_name w_changed w_wait w_expect <<<"$w_case"
    got="$(judge_sandbox_wait "$(sandbox_wait_run "$w_changed" "$w_wait")" "$recheck")"
    echo "planted sandbox-wait $w_name: $got"
    [ "${got%% *}" = "$w_expect" ] || all_ok=0
  done

  # The line before the wait (domains 04), through the real sandbox_live: its stderr, live_wait and the curl stand-in write
  # into one file in the order they happen, so the judge sees whether the line came before the wait and the create. $1 =
  # changed of the setup stand-in, $2 = real, or a planted client_key_wait: silent (waits without the line, as before
  # domains 04) or late (says it after the wait). Prints "changed=<0|1> events=<list>".
  sandbox_line_run() {
    (
      local w="$dir/line-$1-$2" ev
      mkdir -p "$w"
      : >"$w/events"
      CLIENT_KEY_SETUP="$dir/setup-changed-$1.sh"
      LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
      CP_HOST=fake.invalid
      PATH="$dir/bin:$PATH"
      live_wait() { echo "wait:$1" >>"$w/events"; }
      case "$2" in
        silent) client_key_wait() { live_wait "$1"; } ;;
        late) client_key_wait() {
          live_wait "$1"
          wait_line "$1"
        } ;;
      esac
      curl() {
        local a
        for a in "$@"; do
          case "$a" in "$BASE/v1/sandboxes") echo create >>"$w/events" ;; esac
        done
        printf 000
        return 7
      }
      sandbox_live "$dir/no-such-ssh-key" >/dev/null 2>>"$w/events"
      ev="$(sed -E -e 's/^WAIT sandbox: new client key, ([0-9]+) s before the create$/line:\1/' -e 's/^WAIT.*/line:bad/' \
        "$w/events" | grep -E '^(line|wait):|^create$' | paste -sd, -)"
      echo "changed=$1 events=$ev"
    )
  }
  local l_case l_name l_changed l_plant l_expect
  for l_case in "new-key 1 real OK" "old-key 0 real OK" "silent 1 silent FAIL" "late 1 late FAIL"; do
    read -r l_name l_changed l_plant l_expect <<<"$l_case"
    got="$(judge_sandbox_wait_line "$(sandbox_line_run "$l_changed" "$l_plant")" "$CLIENT_KEY_WAIT_S")"
    echo "planted sandbox-wait-line $l_name: $got"
    [ "${got%% *}" = "$l_expect" ] || all_ok=0
  done

  # The check `automaton` (sandbox 08) through the real automaton_live and judge_automaton, with a stand-in for the public
  # API and for sleep (which only moves SECONDS on, so 180 s pass at once). Both directions: a working route is ok; the 404
  # before the rollout, the 402 of an empty account, no turn within 180 s, a failed automaton, the own key, the key of the
  # automaton or any cnwy_k_ key in the log, a key that does not work before the DELETE, a DELETE without status deleted
  # and a key that still works after the DELETE each give their own FAIL automaton line. Once the create answered with an
  # id, the DELETE ran.
  local a_key a_other
  a_key="cnwy_k_$(head -c 32 /dev/zero | tr '\0' 'q')"
  a_other="cnwy_k_$(head -c 32 /dev/zero | tr '\0' 'b')"
  automaton_step() { # $1 = case, $2 = call log
    (
      a_case="$1" a_log="$2"
      LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
      export TMPDIR="$dir"
      sandbox_api() { # stand-in of the public API: logs the call with whose key it came, answers from the case
        local who=live line=""
        grep -qF -- "$a_key" "$1" && who=automaton
        echo "$2 $3 $who" >>"$a_log"
        case "$2 $3 $who" in
          "POST /v1/automatons live")
            case "$a_case" in
              404) printf '{"error":"not_found"}' >"$4"; echo 404 ;;
              402) printf '{"error":"INSUFFICIENT_CREDITS"}' >"$4"; echo 402 ;;
              *) printf '{"id":"a1b2c3d4e5f6","name":"live-check","status":"starting","sandbox_id":"k3v9q2m7x1"}' >"$4"; echo 201 ;;
            esac
            ;;
          "GET /v1/automatons/a1b2c3d4e5f6 live")
            # starting without a turn on the first two reads, then running with one (or never, or failed).
            local n
            n="$(grep -c '^GET /v1/automatons/a1b2c3d4e5f6 live$' "$a_log")"
            if [ "$a_case" = failed ]; then
              printf '{"id":"a1b2c3d4e5f6","status":"failed","reason":"setup","turns":0}' >"$4"
            elif [ "$a_case" = noturn ] || [ "$n" -le 2 ]; then
              printf '{"id":"a1b2c3d4e5f6","status":"starting","turns":0,"sandbox_id":"k3v9q2m7x1"}' >"$4"
            else
              printf '{"id":"a1b2c3d4e5f6","status":"running","turns":1,"sandbox_id":"k3v9q2m7x1"}' >"$4"
            fi
            echo 200
            ;;
          "GET /v1/sandboxes/k3v9q2m7x1/files/read?path=%2Froot%2F.automaton%2Fconfig.json live")
            printf '{"content":"{\\"apiKey\\":\\"%s\\",\\"walletAddress\\":\\"0x%s\\"}"}' "$a_key" "$(head -c 40 /dev/zero | tr '\0' '7')" >"$4"
            echo 200
            ;;
          "GET /v1/credits/balance automaton")
            if grep -q '^DELETE /v1/automatons/a1b2c3d4e5f6 live$' "$a_log"; then
              [ "$a_case" = notrevoked ] && { printf '{"balance_cents":1}' >"$4"; echo 200; return; }
              printf '{"error":"Invalid API key"}' >"$4"
              echo 401
            elif [ "$a_case" = keyrejected ]; then
              printf '{"error":"Invalid API key"}' >"$4"
              echo 401
            else
              printf '{"balance_cents":1}' >"$4"
              echo 200
            fi
            ;;
          "GET /v1/automatons/a1b2c3d4e5f6/logs live")
            case "$a_case" in
              leak-own) line="Authorization: $fake_key" ;;
              leak-automaton) line="apiKey $a_key" ;;
              leak-other) line="key $a_other" ;;
              *) line="Turn t1: 1 tools, 900 tokens apiKey [redacted]" ;;
            esac
            node -e 'process.stdout.write(JSON.stringify({ id: "a1b2c3d4e5f6", lines: ["[2026-11-16T10:00:00.000Z] start", process.argv[1]] }))' "$line" >"$4"
            echo 200
            ;;
          "DELETE /v1/automatons/a1b2c3d4e5f6 live")
            if [ "$a_case" = deletebad ]; then printf '{"ok":true,"status":"stopped"}' >"$4"; else printf '{"ok":true,"id":"a1b2c3d4e5f6","status":"deleted"}' >"$4"; fi
            echo 200
            ;;
          *)
            printf '{"error":"not_found"}' >"$4"
            echo 404
            ;;
        esac
      }
      sleep() { SECONDS=$((SECONDS + ${1%%.*})); }
      automaton_live
    )
  }
  local ac ac_name ac_tok ac_del ac_log ac_out ac_got
  for ac in "ok|ok|yes" "404|create_404|no" "402|create_402|no" "noturn|timeout|yes" "failed|status_failed|yes" \
    "leak-own|logs_leak|yes" "leak-automaton|logs_leak|yes" "leak-other|logs_leak|yes" "keyrejected|key_rejected_401|yes" \
    "deletebad|delete_200|yes" "notrevoked|revoked_200|yes"; do
    IFS='|' read -r ac_name ac_tok ac_del <<<"$ac"
    ac_log="$dir/automaton-$ac_name.log"
    : >"$ac_log"
    ac_out="$(automaton_step "$ac_name" "$ac_log")"
    ac_got=no
    grep -qx "DELETE /v1/automatons/a1b2c3d4e5f6 live" "$ac_log" && ac_got=yes
    got="$(judge_automaton "$ac_out")"
    echo "planted automaton step $ac_name: automaton=${ac_out:-nothing} deleted=$ac_got"
    echo "planted automaton $ac_name: $got"
    [ "$ac_out" = "$ac_tok" ] && [ "$ac_got" = "$ac_del" ] || all_ok=0
    if [ "$ac_name" = ok ]; then [ "${got%% *}" = OK ] || all_ok=0; else [ "${got%%:*}" = "FAIL automaton" ] || all_ok=0; fi
    # Until the rollout the route is missing, and the line says so in exactly these words.
    [ "$ac_name" != 404 ] || [ "$got" = "FAIL automaton: POST /v1/automatons answered 404 (not rolled out yet)" ] || all_ok=0
    # The key of the automaton is never in the output of the check.
    if grep -qF -- "$a_key" <<<"$ac_out$got"; then
      echo "FAIL selftest: automaton $ac_name printed the key of the automaton"
      all_ok=0
    fi
  done
  # Without the canary turn it waits 180 s, not once and not longer: one read every 5 s.
  ac_got="$(grep -c '^GET /v1/automatons/a1b2c3d4e5f6 live$' "$dir/automaton-noturn.log")"
  [ "$ac_got" -ge 2 ] && [ "$ac_got" -le 37 ] || { echo "FAIL selftest: automaton noturn made $ac_got reads, expected 2 to 37"; all_ok=0; }
  got="$(judge_automaton "$(LIVE_SANDBOX_ENV="$dir/missing-live-sandbox.env" automaton_live)")"
  echo "planted automaton nokey: $got"
  [ "${got%%:*}" = "FAIL automaton" ] || all_ok=0

  # The key files of a run of live() stopped with a signal (domains 03): the run gets its own TMPDIR, the made-up key,
  # CP_HOST=fake.invalid and the stand-ins, and runs as its own process group, so the signal reaches every process of it as
  # it does from a terminal, a supervisor or the timeout of an agent tool. curl holds the call to $3 (the header file is
  # then in TMPDIR) until the signal; everything else answers nothing at once. Prints "seen=<yes|no> ended=<yes|no>".
  # $1 = folder for the run's control files, $2 = TMPDIR of the run, $3 = URL to hold, $4 = TERM or KILL.
  held_live() {
    (
      local c="$1" pid i seen=no ended=no
      mkdir -p "$c" "$2"
      set -m
      (
        export TMPDIR="$2"
        CP_HOST=fake.invalid
        CP_SSH_KEY="$dir/no-such-ssh-key"
        CLIENT_KEY_SETUP="$dir/setup-changed-0.sh"
        LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
        PATH="$dir/bin:$PATH"
        curl() {
          local a held=no n=0
          for a in "$@"; do [ "$a" = "$3" ] && held=yes; done
          if [ "$held" = yes ] && [[ " $* " == *" @"* || " $* " == *"-H @"* ]]; then
            : >"$c/started"
            while [ "$n" -lt 300 ]; do
              sleep 0.1
              n=$((n + 1))
            done
          fi
          printf 000
          return 7
        }
        live
      ) </dev/null >"$c/out" 2>&1 &
      pid=$!
      for i in $(seq 1 300); do
        [ -e "$c/started" ] && break
        sleep 0.1
      done
      [ -e "$c/started" ] && grep -rqF -- "$fake_key" "$2" 2>/dev/null && seen=yes
      kill "-$4" -- "-$pid" 2>/dev/null
      for i in $(seq 1 150); do
        kill -0 "$pid" 2>/dev/null || { ended=yes; break; }
        sleep 0.1
      done
      [ "$ended" = yes ] || kill -KILL -- "-$pid" 2>/dev/null
      wait "$pid" 2>/dev/null
      echo "seen=$seen ended=$ended"
    ) 2>/dev/null
  }
  # A run stopped with kill -TERM. Prints "seen=<yes|no> ended=<yes|no> left=<files>". $1 = search or sandbox.
  key_cleanup_run() {
    local w="$dir/term-$1" target
    case "$1" in
      search) target="$BASE$DOMAINS_PATH" ;;
      sandbox) target="$BASE/v1/sandboxes" ;;
    esac
    echo "$(held_live "$w/ctl" "$w/tmp" "$target" TERM) left=$(find "$w/tmp" -mindepth 1 | wc -l)"
  }
  local k_name
  for k_name in search sandbox; do
    got="$(judge_key_cleanup "$(key_cleanup_run "$k_name")")"
    echo "planted key-cleanup term-$k_name: $got"
    [ "${got%% *}" = OK ] || all_ok=0
  done
  # A run stopped with kill -KILL, which no trap catches (the timeout of an agent tool, a cancelled run), then a second run
  # with the same TMPDIR. Before it, a foreign file and a folder of the prefix whose process lives (this subshell) are put
  # there. Prints "killed=<folders of the first run after the kill> kept=<of them after the second run> foreign=<yes|no>
  # alive=<yes|no>".
  key_sweep_run() {
    (
      local w="$dir/sweep" f n=0 kept=0 foreign=no alive=no
      held_live "$w/first" "$w/tmp" "$BASE/v1/sandboxes" KILL >/dev/null
      : >"$w/killed"
      for f in "$w/tmp/$LIVE_PREFIX".*; do
        [ -d "$f" ] || continue
        echo "$f" >>"$w/killed"
        n=$((n + 1))
      done
      printf 'foreign\n' >"$w/tmp/foreign.txt"
      mkdir -p "$w/tmp/$LIVE_PREFIX.$BASHPID.living"
      printf 'living\n' >"$w/tmp/$LIVE_PREFIX.$BASHPID.living/file"
      held_live "$w/second" "$w/tmp" "$BASE$DOMAINS_PATH" TERM >/dev/null
      while read -r f; do [ -e "$f" ] && kept=$((kept + 1)); done <"$w/killed"
      [ -f "$w/tmp/foreign.txt" ] && foreign=yes
      [ -f "$w/tmp/$LIVE_PREFIX.$BASHPID.living/file" ] && alive=yes
      echo "killed=$n kept=$kept foreign=$foreign alive=$alive"
    )
  }
  local sweep
  sweep="$(key_sweep_run)"
  got="$(judge_kill_sweep "$sweep")"
  echo "planted key-cleanup kill-sweep: $got"
  [ "${got%% *}" = OK ] || all_ok=0
  got="$(judge_sweep_foreign "$sweep")"
  echo "planted key-cleanup foreign: $got"
  [ "${got%% *}" = OK ] || all_ok=0
  for case_ in "kill-sweep-kept killed=1 kept=1 foreign=yes alive=yes" "kill-sweep-none killed=0 kept=0 foreign=yes alive=yes"; do
    read -r name sweep <<<"$case_"
    got="$(judge_kill_sweep "$sweep")"
    echo "planted key-cleanup $name: $got"
    [ "${got%% *}" = FAIL ] || all_ok=0
  done
  for case_ in "foreign-gone killed=1 kept=0 foreign=no alive=yes" "foreign-living killed=1 kept=0 foreign=yes alive=no"; do
    read -r name sweep <<<"$case_"
    got="$(judge_sweep_foreign "$sweep")"
    echo "planted key-cleanup $name: $got"
    [ "${got%% *}" = FAIL ] || all_ok=0
  done

  mkdir -p "$dir/leftover"
  printf 'Authorization: %s\n' "$fake_key" >"$dir/leftover/tmp.planted"
  got="$(judge_key_cleanup "seen=yes ended=yes left=$(find "$dir/leftover" -mindepth 1 | wc -l)")"
  echo "planted key-cleanup leftover: $got"
  [ "${got%% *}" = FAIL ] || all_ok=0

  if [ "$all_ok" = 1 ]; then
    echo "LIVE SELFTEST OK"
    return 0
  fi
  echo "LIVE SELFTEST FAIL"
  return 1
}

live() {
  if [ -z "${CP_HOST:-}" ] && [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  local key="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  if [ -z "${CP_HOST:-}" ] || [ -z "$key" ]; then
    echo "FAIL setup: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)"
    echo "LIVE FAIL"
    return 1
  fi

  # One folder for every temporary file of the run, the key files among them, and for those of the scripts it starts
  # (TMPDIR); the trap deletes it however the run ends. It deletes only this folder and prints nothing. Its name carries
  # the prefix and this run's PID, so a later run deletes it through live_sweep when kill -KILL left it behind.
  live_sweep
  LIVE_TMP="$(mktemp -d -p "${TMPDIR:-/tmp}" "$LIVE_PREFIX.$BASHPID.XXXXXX")" || {
    LIVE_TMP=""
    echo "FAIL setup: no temporary folder"
    echo "LIVE FAIL"
    return 1
  }
  trap 'live_cleanup' EXIT
  trap 'live_cleanup; exit 130' INT
  trap 'live_cleanup; exit 143' TERM
  export TMPDIR="$LIVE_TMP"

  local code body
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/health")"
  say "$(judge_health "$code")"

  body="$(mktemp -p "$LIVE_TMP")"
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$BASE/v1/status")"
  say "$(judge_status "$code" "$(head -c 1 "$body")")"
  rm -f "$body"

  body="$(mktemp -p "$LIVE_TMP")"
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$BASE$DOMAINS_PATH")"
  say "$(judge_domains "$code" "$(head -c 2000 "$body")")"
  rm -f "$body"

  local ds ds_body=""
  ds="$(domains_search_live)"
  [[ "$ds" == *$'\n'* ]] && ds_body="${ds#*$'\n'}"
  say "$(judge_domains_search "${ds%%$'\n'*}" "$ds_body")"
  ds=""
  ds_body=""

  local remote answer
  remote="docker exec deploy-cp-1 node -e $(printf %q "$QUERY_JS") /data/cp.db $(printf %q "$REFUND_KEY")"
  answer="$(ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null)"
  say "$(judge_refund "$answer")"

  say "$(judge_timeout_quote "$(CP_HOST="$CP_HOST" CP_SSH_KEY="$key" bash "$ROOT/ops/timeout-quote.sh" --since-rollout 2>/dev/null)")"

  say "$(judge_handoff "$(handoff_live)")"

  say "$(judge_sandbox "$(sandbox_live "$key")")"
  say "$(judge_sandbox_foreign "$(sandbox_foreign_count remote "$key")")"

  say "$(judge_automaton "$(automaton_live)")"

  if [ "$FAILED" = 0 ]; then
    echo "LIVE OK"
    return 0
  fi
  echo "LIVE FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --judge)
    # One judge without network, the answer's body on stdin (test/live-selftest.test.ts hands it the handler's answer).
    case "${2:-}" in
      domains-search) judge_domains_search "${3:-}" "$(head -c 4000)" ;;
      sandbox-bg)
        # The start of the background exec of the check `sandbox`, the answer's body on stdin. The check itself reads the
        # whole answer file; 16000 bytes hold the answer with the wait command twice (stdout and wait_command), which
        # grew past 4000 with the line before a cut output (goals/hosting/02, point 7).
        bg_body="$(mktemp)"
        head -c 16000 >"$bg_body"
        bg_start "${3:-}" "$bg_body"
        rm -f "$bg_body"
        ;;
      *)
        echo "unknown judge: ${2:-}" >&2
        exit 2
        ;;
    esac
    ;;
  "") live ;;
  -h | --help) awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0" ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
