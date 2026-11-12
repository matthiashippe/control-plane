#!/usr/bin/env bash
# Live check of the release manager after a rollout (LOOP.md, Release). Reads production, with the one exception the
# check `sandbox` needs (below).
#
#   ops/live.sh              against https://postyourprice.com and, over ssh, the production ledger
#   ops/live.sh --selftest   no network: proves every check against planted data, in both directions
#
# One line per check, `OK <check>: ...` or `FAIL <check>: ...`, then `LIVE OK` or `LIVE FAIL`; exit 1
# as soon as one check fails. Later goals append their live check here (a judge function, a planted
# case in the selftest, a call in live mode).
#
# Live mode needs the variables from ~/.config/control-plane/loop.env (CP_HOST, CP_SSH_KEY) and, for the check `sandbox`,
# LIVE_SANDBOX_KEY from ~/.config/control-plane/live-sandbox.env; it is run from the code-host only. The ledger is opened
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
#   timeout-quote  the timeout quote per model since the rollout of abrechnung 02, from the durations in the ledger and in
#            inference_aborts (ops/timeout-quote.sh --since-rollout); shown, and FAIL only when it cannot be read
#   sandbox  ops/sandbox/setup.sh --client-key ends with SETUP CLIENT-KEY OK, a signed GET /v1/sandboxes over ctl.sbx from
#            the container cp answers 200, and with our own account (LIVE_SANDBOX_ADDRESS in src/bounties/ours.ts) a small
#            sandbox is created (201), `echo ok` runs in it, an uploaded file reads back the same, DELETE answers 200, and
#            the ledger holds at least one row of kind sandbox for exactly this sandbox (sandbox 03)
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

# $1 = "client_key=<ok|fail> ctl=<status> create=<status> exec=<ok|wrong|status> files=<ok|wrong|...> delete=<status>
# ledger=<rows>", the result line of sandbox_live. Judges in the order of the steps and names the first one that failed.
judge_sandbox() {
  local toks tok client_key="" ctl="" create="" exec_="" files="" delete="" ledger=""
  read -ra toks <<<"${1:-}"
  for tok in "${toks[@]}"; do
    case "$tok" in
      client_key=*) client_key="${tok#*=}" ;;
      ctl=*) ctl="${tok#*=}" ;;
      create=*) create="${tok#*=}" ;;
      exec=*) exec_="${tok#*=}" ;;
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
    echo "OK sandbox: client key set, ctl.sbx 200, created, exec ok, files ok, deleted, ledger rows: $ledger"
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
  local sshkey="$1" client_key=fail ctl=none create=none exec_=skipped files=skipped delete=skipped ledger=none
  local last remote apikey="" hdr ans code id="" out text
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
  echo "client_key=$client_key ctl=${ctl:-none} create=${create:-none} exec=$exec_ files=$files delete=${delete:-none} ledger=$ledger"
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
  # a file that reads back different, a ledger query without an answer, and no result at all.
  local s_good="client_key=ok ctl=200 create=201 exec=ok files=ok delete=200 ledger=1"
  local s_case s_line s_expect
  for s_case in "$s_good|OK" "${s_good/ledger=1/ledger=0}|FAIL" "${s_good/exec=ok/exec=wrong}|FAIL" \
    "${s_good/ctl=200/ctl=401}|FAIL" "${s_good/client_key=ok/client_key=fail}|FAIL" \
    "client_key=ok ctl=200 create=501 exec=skipped files=skipped delete=skipped ledger=none|FAIL" \
    "${s_good/files=ok/files=wrong}|FAIL" "${s_good/ledger=1/ledger=none}|FAIL" "|FAIL"; do
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

  local remote answer
  remote="docker exec deploy-cp-1 node -e $(printf %q "$QUERY_JS") /data/cp.db $(printf %q "$REFUND_KEY")"
  answer="$(ssh -i "$key" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null)"
  say "$(judge_refund "$answer")"

  say "$(judge_timeout_quote "$(CP_HOST="$CP_HOST" CP_SSH_KEY="$key" bash "$ROOT/ops/timeout-quote.sh" --since-rollout 2>/dev/null)")"

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
  "") live ;;
  -h | --help) awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0" ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
