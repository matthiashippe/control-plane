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
# sandbox id or a balance. It writes in two places only, both for the check `sandbox` and never on the payment server's
# disk: ops/sandbox/setup.sh --client-key on the sandbox server, and one small sandbox of our own account, created, used
# and deleted through the public API, which books its started step in the ledger like any customer's.
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
#            command runs in the background there (`sleep 25; echo bg-ok`, timeout 120000, sandbox 05): its answer is 200
#            with running true and exit_code -1, the file from exit_code_file reads 0 within 60 s and the one from
#            output_file holds bg-ok, so the wrapper, coreutils timeout under gVisor and /root/.exec are proven in production
#   handoff  POST /v1/handoff with example values answers 201 with a two-digit match, GET /h/{code} shows three different
#            two-digit numbers with match among them, and the stream GET /v1/handoff/{code} with the poll token says pending
#            within 5 s (konto 02). Approves nothing: the code runs out unused after ten minutes. The poll token goes through
#            a header file in a mktemp -d folder that a trap deletes, never onto a command line or into the output
#   sandbox-foreign  the number of foreign accounts (no address and no key name of src/bounties/ours.ts) with at least one
#            ledger row of kind sandbox, the measure of the ROADMAP criterion; shown, and FAIL only when it cannot be read
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
  hdr="$(mktemp)"
  ans="$(mktemp)"
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
# body file, $5 what the stream sent within 5 s. Only words leave it, no code and no token.
# shellcheck disable=SC2016
HANDOFF_JS='const fs = require("fs"); const [cs, cf, ps, pf, sf] = process.argv.slice(1); const read = (f) => { try { return fs.readFileSync(f, "utf8"); } catch (e) { return ""; } }; let j = null; try { j = JSON.parse(read(cf)); } catch (e) { j = null; } const match = j && Number.isInteger(j.match) && j.match >= 10 && j.match <= 99 ? j.match : null; const nums = [...read(pf).matchAll(/<button[^>]*name="pick" value="([0-9]+)"/g)].map((m) => Number(m[1])); const two = nums.length === 3 && new Set(nums).size === 3 && nums.every((n) => n >= 10 && n <= 99); const numbers = !two ? "missing" : match !== null && nums.includes(match) ? "ok" : "nomatch"; const ev = /^event: state\r?\ndata: (.*)$/m.exec(read(sf)); let st = "none"; if (ev) { try { st = String(JSON.parse(ev[1]).state || "other"); } catch (e) { st = "other"; } } if (!/^[a-z]+$/.test(st)) st = "other"; console.log("create=" + cs + " match=" + (match === null ? "missing" : "ok") + " page=" + ps + " numbers=" + numbers + " stream=" + st);'
HANDOFF_GOOD="create=201 match=ok page=200 numbers=ok stream=pending"

judge_handoff() { # $1 = result line from HANDOFF_JS
  case "${1:-}" in
    "$HANDOFF_GOOD") echo "OK handoff: POST /v1/handoff 201, /h/{code} shows match among three numbers, the stream says pending; nothing approved" ;;
    "") echo "FAIL handoff: no result" ;;
    create=201\ match=missing*) echo "FAIL handoff: POST /v1/handoff answered 201 without a two-digit match" ;;
    create=201\ *page=200\ numbers=ok\ *) echo "FAIL handoff: the stream did not say pending within 5 s (${1##* })" ;;
    create=201\ *page=200\ *) echo "FAIL handoff: /h/{code} does not show match among three numbers (${1#*numbers=})" ;;
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
  d="$(mktemp -d)"
  trap 'rm -rf "$d"' RETURN
  c_code="$(curl -s -o "$d/create" -w '%{http_code}' --max-time 15 -H 'content-type: application/json' --data "$HANDOFF_BODY" "$BASE/v1/handoff")"
  code="$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$d/create" "$d/hdr" 2>/dev/null)"
  if [ -n "$code" ]; then
    p_code="$(curl -s -o "$d/page" -w '%{http_code}' --max-time 15 "$BASE/h/$code")"
    curl -s -N --max-time 5 -H "@$d/hdr" "$BASE/v1/handoff/$code" >"$d/stream" 2>/dev/null
  fi
  NODE_NO_WARNINGS=1 node -e "$HANDOFF_JS" "${c_code:-none}" "$d/create" "${p_code:-none}" "$d/page" "$d/stream"
}

# ---- sandbox (sandbox 03)

SANDBOX_HOST="${SANDBOX_HOST:-72.62.51.224}"
CTL_URL="https://ctl.sbx.postyourprice.com"
LIVE_SANDBOX_ENV="$HOME/.config/control-plane/live-sandbox.env"
OURS_TS="$ROOT/src/bounties/ours.ts"

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

# The answer to the background exec of the check `sandbox`, $1 = file: "files <exit_code_file> <output_file>" when it
# is the answer to a command still running (running true, exit_code -1, both files under /root/.exec), else one word
# (`nojson`, `notrunning`, `nofiles`). Only paths of that form leave it, so nothing else of the answer reaches a URL.
# shellcheck disable=SC2016
BG_ANSWER_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } if (!o || typeof o !== "object") { console.log("nojson"); process.exit(0); } if (o.running !== true || o.exit_code !== -1) { console.log("notrunning"); process.exit(0); } const ok = (v, ext) => typeof v === "string" && new RegExp("^/root/\\.exec/[0-9a-f]{1,64}\\." + ext + "$").test(v); if (!ok(o.exit_code_file, "exit") || !ok(o.output_file, "out")) { console.log("nofiles"); process.exit(0); } console.log("files " + o.exit_code_file + " " + o.output_file);'

# $1 = HTTP status, $2 = answer file of the background exec. Prints the status itself when it is not 200, else the
# output of BG_ANSWER_JS.
bg_start() {
  if [ "${1:-}" != 200 ]; then
    echo "${1:-none}"
    return
  fi
  (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$BG_ANSWER_JS" "$2" 2>/dev/null) || echo nojson
}

# Why the background step failed, $1 = its token from sandbox_live.
bg_reason() {
  case "${1:-}" in
    "" | skipped) echo "did not run" ;;
    start-notrunning) echo "of sleep 25 answered 200 without running true and exit_code -1" ;;
    start-nofiles) echo "answered 200 without exit_code_file and output_file under /root/.exec" ;;
    start-nojson) echo "answered 200 without a JSON object" ;;
    start-*) echo "of sleep 25 answered ${1#start-}, expected 200" ;;
    noexit) echo "wrote no exit_code_file within 60 s" ;;
    exit-*) echo "ended with exit code ${1#exit-}, expected 0" ;;
    out-*) echo "output_file read answered ${1#out-}, expected 200" ;;
    wrong) echo "output_file holds no bg-ok" ;;
    *) echo "failed: $1" ;;
  esac
}

# $1 = "client_key=<ok|fail> ctl=<status> create=<status> exec=<ok|wrong|status> bg=<ok|...> files=<ok|wrong|...>
# delete=<status> ledger=<rows>", the result line of sandbox_live. Judges in the order of the steps and names the first
# one that failed.
judge_sandbox() {
  local toks tok client_key="" ctl="" create="" exec_="" bg="" files="" delete="" ledger=""
  read -ra toks <<<"${1:-}"
  for tok in "${toks[@]}"; do
    case "$tok" in
      client_key=*) client_key="${tok#*=}" ;;
      ctl=*) ctl="${tok#*=}" ;;
      create=*) create="${tok#*=}" ;;
      exec=*) exec_="${tok#*=}" ;;
      bg=*) bg="${tok#*=}" ;;
      files=*) files="${tok#*=}" ;;
      delete=*) delete="${tok#*=}" ;;
      ledger=*) ledger="${tok#*=}" ;;
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
    echo "FAIL sandbox: background exec $(bg_reason "$bg")"
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
  else
    echo "OK sandbox: client key set, ctl.sbx 200, created, exec ok, background exec ok, files ok, deleted, ledger rows: $ledger"
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

# The live part of the check `sandbox`, $1 = ssh key. Prints the result line for judge_sandbox and nothing else: no id,
# no key. Once a sandbox exists it is deleted, whatever failed before.
sandbox_live() {
  local sshkey="$1" client_key=fail ctl=none create=none exec_=skipped bg=skipped files=skipped delete=skipped ledger=none
  local last remote apikey="" hdr ans code id="" out text start exitf outf deadline
  last="$(CP_HOST="$CP_HOST" CP_SSH_KEY="$sshkey" bash "$ROOT/ops/sandbox/setup.sh" --client-key "$SANDBOX_HOST" </dev/null 2>/dev/null | tail -n 1)"
  case "$last" in "SETUP CLIENT-KEY OK"*) client_key=ok ;; esac

  remote="docker exec deploy-cp-1 node -e $(printf %q "$CTL_JS") $(printf %q "$CTL_URL") /data/sandbox-client.key"
  ctl="$(ssh -i "$sshkey" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null | tail -n 1)"
  [[ "$ctl" =~ ^[a-z0-9]{1,8}$ ]] || ctl="${ctl:+error}"

  [ -r "$LIVE_SANDBOX_ENV" ] && apikey="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  if [ -z "$apikey" ]; then
    create=nokey
  else
    hdr="$(mktemp)"
    ans="$(mktemp)"
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

      # A command longer than the hold limit runs in the background (sandbox 05): answered after 20 s, then its exit
      # code and output are read from the files the answer names, for at most 60 s.
      code="$(sandbox_api "$hdr" POST "/v1/sandboxes/$id/exec" "$ans" '{"command":"sleep 25; echo bg-ok","timeout":120000}' "Idempotency-Key: live-check-bg-$(rand_hex)")"
      start="$(bg_start "$code" "$ans")"
      if [[ "$start" == "files "* ]]; then
        read -r _ exitf outf <<<"$start"
        bg=noexit
        deadline=$((SECONDS + 60))
        while [ "$SECONDS" -lt "$deadline" ]; do
          sleep 5
          code="$(sandbox_api "$hdr" GET "/v1/sandboxes/$id/files/read?path=${exitf//\//%2F}" "$ans")"
          [ "$code" = 200 ] || continue
          out="$(json_field "$ans" content | tr -d '[:space:]')"
          if [ "$out" != 0 ]; then
            [[ "$out" =~ ^[0-9]{1,3}$ ]] && bg="exit-$out" || bg="exit-unreadable"
          else
            code="$(sandbox_api "$hdr" GET "/v1/sandboxes/$id/files/read?path=${outf//\//%2F}" "$ans")"
            if [ "$code" != 200 ]; then
              bg="out-$code"
            elif grep -qx 'bg-ok' <<<"$(json_field "$ans" content | tr -d '\r')"; then
              bg=ok
            else
              bg=wrong
            fi
          fi
          break
        done
      else
        bg="start-${start:-none}"
      fi

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

      delete="$(sandbox_api "$hdr" DELETE "/v1/sandboxes/$id" "$ans")"

      remote="docker exec deploy-cp-1 node -e $(printf %q "$SANDBOX_LEDGER_JS") /data/cp.db $(printf %q "$id")"
      ledger="$(ssh -i "$sshkey" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null | tail -n 1)"
      [[ "$ledger" =~ ^[0-9]+$ ]] || ledger=none
    fi
    rm -f "$hdr" "$ans"
  fi
  apikey=""
  echo "client_key=$client_key ctl=${ctl:-none} create=${create:-none} exec=$exec_ bg=$bg files=$files delete=${delete:-none} ledger=$ledger"
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
  # (sandbox 05) fails on its own too: held instead of running, a 504, no exit file within 60 s, stopped at its timeout
  # (124), no bg-ok in the output, and a result line without the step at all.
  local s_good="client_key=ok ctl=200 create=201 exec=ok bg=ok files=ok delete=200 ledger=1"
  local s_case s_line s_expect
  for s_case in "$s_good|OK" "${s_good/ledger=1/ledger=0}|FAIL" "${s_good/exec=ok/exec=wrong}|FAIL" \
    "${s_good/ctl=200/ctl=401}|FAIL" "${s_good/client_key=ok/client_key=fail}|FAIL" \
    "client_key=ok ctl=200 create=501 exec=skipped files=skipped delete=skipped ledger=none|FAIL" \
    "${s_good/files=ok/files=wrong}|FAIL" "${s_good/ledger=1/ledger=none}|FAIL" "|FAIL" \
    "${s_good/bg=ok/bg=start-notrunning}|FAIL" "${s_good/bg=ok/bg=start-504}|FAIL" "${s_good/bg=ok/bg=noexit}|FAIL" \
    "${s_good/bg=ok/bg=exit-124}|FAIL" "${s_good/bg=ok/bg=wrong}|FAIL" "${s_good/ bg=ok/}|FAIL"; do
    s_line="${s_case%|*}"
    s_expect="${s_case##*|}"
    got="$(judge_sandbox "$s_line")"
    echo "planted sandbox '${s_line}': $got"
    [ "${got%% *}" = "$s_expect" ] || all_ok=0
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

  # The check `handoff` through the real parts (HANDOFF_PREP_JS, HANDOFF_JS, judge_handoff), both directions: the answer of a
  # working service, then a 404 of the POST, an answer without match, a stream without pending, a page without match among
  # its numbers and a 404 of the page. The poll token of the planted answer is made here, not written out.
  local h_tok h_ok h_page h_pending h_case h_name h_cs h_cf h_ps h_pf h_sf h_expect
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
  [ -n "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$dir/h-create-ok" "$dir/h-hdr")" ] && grep -q "Bearer $h_tok" "$dir/h-hdr" ||
    { echo "FAIL selftest: HANDOFF_PREP_JS did not take the planted answer"; all_ok=0; }
  [ -z "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_PREP_JS" "$dir/h-create-404" "$dir/h-hdr-404")" ] && [ ! -e "$dir/h-hdr-404" ] ||
    { echo "FAIL selftest: HANDOFF_PREP_JS took a 404"; all_ok=0; }
  for h_case in "ok 201 ok 200 ok ok OK" "404 404 404 none 404 none FAIL" "nomatch 201 nomatch 200 ok ok FAIL" \
    "nopending 201 ok 200 ok none FAIL" "pagenomatch 201 ok 200 nomatch ok FAIL" "page404 201 ok 404 404 ok FAIL"; do
    read -r h_name h_cs h_cf h_ps h_pf h_sf h_expect <<<"$h_case"
    got="$(judge_handoff "$(NODE_NO_WARNINGS=1 node -e "$HANDOFF_JS" "$h_cs" "$dir/h-create-$h_cf" "$h_ps" "$dir/h-page-$h_pf" "$dir/h-stream-$h_sf")")"
    echo "planted handoff $h_name: $got"
    [ "${got%% *}" = "$h_expect" ] || all_ok=0
  done

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

  local code body
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/health")"
  say "$(judge_health "$code")"

  body="$(mktemp)"
  code="$(curl -s -o "$body" -w '%{http_code}' --max-time 15 "$BASE/v1/status")"
  say "$(judge_status "$code" "$(head -c 1 "$body")")"
  rm -f "$body"

  body="$(mktemp)"
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
        # The start of the background exec of the check `sandbox`, the answer's body on stdin.
        bg_body="$(mktemp)"
        head -c 4000 >"$bg_body"
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
