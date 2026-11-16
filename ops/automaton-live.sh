#!/usr/bin/env bash
# One automaton of our own account in a sandbox of production, before the merge of goals/sandbox/08 (point 7).
#
#   bash ops/automaton-live.sh              live: from the code-host, against https://postyourprice.com (CP_URL), no reboot
#   bash ops/automaton-live.sh --reboot     the same, and in between one reboot of the sandbox server
#   bash ops/automaton-live.sh --selftest   no network, no port: the whole run against stand-ins, in both directions
#
# It takes the steps the control plane takes for POST /v1/automatons, over the public sandbox API with LIVE_SANDBOX_KEY
# (~/.config/control-plane/live-sandbox.env, the own account of src/bounties/ours.ts), because /v1/automatons only rolls out
# with the merge: the cheapest model of GET /v1/models that is neither Claude nor Anthropic, a small sandbox, the setup file
# of harness/runtime/setup-headless.mjs at /root/.automaton-setup.json (the key, conwayApiUrl and socialRelayUrl on the base
# URL, the zero address as creatorAddress, check_for_updates off), then automaton-start of the image sandboxd-base:2, and
# at most 5 minutes for the first line `Turn <id>: <n> tools` in /root/.automaton/run.log.
#
# With --reboot: first `ops/sandbox/setup.sh --foreign-sandboxes <SANDBOX_HOST>`; only its last line
# `SETUP FOREIGN-SANDBOXES OK running=<n> foreign=0` allows the reboot, anything else (a foreign sandbox, a side it cannot
# read) ends the run without one. Then a marker line in run.log, `systemctl reboot` over ssh with ~/.ssh/id_ed25519_cp_sandbox
# (SANDBOX_HOST, default 72.62.51.224), and at most 10 minutes until the host has a new boot_id and run.log holds a new turn
# line after the marker. The supervisor appends to run.log and cuts it to its tail only, so the lines after the marker are
# exactly the turns after the reboot.
#
# Read only over ssh: the boot_id of the sandbox host, memory.peak of the cgroup of the container sbx-<id> (after the first
# turn, before the reboot and at the end; the maximum in MB), and the ledger of production inside deploy-cp-1 with
# `readonly: true` (rows of kind sandbox of this sandbox, rows of kind inference of the account since the start of the run,
# hold_mc of the sandbox). The address of the runtime wallet comes from /root/.automaton/automaton.json, never from
# the key file of the wallet, which nothing here reads; its USDC balance on Base comes from one eth_call balanceOf over a public RPC
# (BASE_RPC_URL, default https://mainnet.base.org). The sandbox is deleted in every case, also on a failure or a signal.
#
# No topup and no transaction: a 402 anywhere ends with AUTOMATON LIVE FAIL credits. The output never holds a key, an
# address or the sandbox id: every line goes through guard, which withholds a line with one of them and then ends the run
# with a FAIL. Last line:
#   AUTOMATON LIVE OK turns=<n> reboot=<ok|skipped> turns_after_reboot=<n> mem_peak_mb=<n> ledger_sandbox_rows=<n>
#     ledger_inference_rows=<n> hold_mc=0 wallet_usdc=0          (one line; turns_after_reboot=0 with reboot=skipped)
#   AUTOMATON LIVE FAIL <reason>
#   AUTOMATON LIVE SELFTEST OK | AUTOMATON LIVE SELFTEST FAIL
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${CP_URL:-https://postyourprice.com}"
BASE_RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
SANDBOX_HOST="${SANDBOX_HOST:-72.62.51.224}"
SANDBOX_SSH_KEY="${SANDBOX_SSH_KEY:-$HOME/.ssh/id_ed25519_cp_sandbox}"
LIVE_SANDBOX_ENV="${LIVE_SANDBOX_ENV:-$HOME/.config/control-plane/live-sandbox.env}"
LOOP_ENV="$HOME/.config/control-plane/loop.env"
SETUP_SH="$ROOT/ops/sandbox/setup.sh"
USDC_BASE="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
ZERO_ADDRESS="0x0000000000000000000000000000000000000000"
SETUP_PATH="/root/.automaton-setup.json"
RUN_LOG="/root/.automaton/run.log"
MARK="AUTOMATON_LIVE_REBOOT_MARK"
# A failure line of automaton-start whose reason may be shown: words only.
START_FAIL_RE='^AUTOMATON_START FAIL [a-z ]{1,40}$'
FIRST_TURN_S=300
REBOOT_WAIT_S=600
# Node 22 first: better-sqlite3 of this repo is built for it.
export PATH="/usr/bin:$PATH"

GENESIS_PROMPT="You are a test automaton inside a disposable acceptance run. Nothing you do here matters. Keep every turn short: call at most one cheap read-only tool (check_credits, system_synopsis, list_models, view_soul), then answer in one sentence. After your fifth turn, call the sleep tool with duration_seconds 3600."
CREATOR_MESSAGE="This is a disposable acceptance run of the operator. You accept no payments: your own wallet never takes money, and no account to pay into is set up for you yet."

# The turn lines in run.log (one per turn of the runtime), and those after the last marker.
TURN_RE='Turn [0-9A-Za-z_-]*: [0-9]* tools'
TURNS_CMD="n=\$(grep -cE '$TURN_RE' $RUN_LOG 2>/dev/null); echo \"\${n:-0}\""
TURNS_AFTER_CMD="awk '/^$MARK\$/ { n = 0; next } /$TURN_RE/ { n++ } END { print n + 0 }' $RUN_LOG 2>/dev/null || echo 0"

# The cheapest model of an answer of GET /v1/models (input plus output per million), never one whose id, owner or upstream
# model names Claude or Anthropic. Prints the id or nothing.
# shellcheck disable=SC2016
MODEL_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(0); } const rows = Array.isArray(o && o.data) ? o.data : []; const bad = /claude|anthropic/i; const ok = rows.filter((m) => m && typeof m.id === "string" && /^[A-Za-z0-9._:\/-]{1,100}$/.test(m.id) && m.available !== false && ![m.id, m.owned_by, m.upstream_model].some((v) => typeof v === "string" && bad.test(v)) && m.pricing && Number.isFinite(m.pricing.input_per_million) && Number.isFinite(m.pricing.output_per_million)); ok.sort((a, b) => a.pricing.input_per_million + a.pricing.output_per_million - (b.pricing.input_per_million + b.pricing.output_per_million) || (a.id < b.id ? -1 : 1)); if (ok.length) process.stdout.write(ok[0].id);'

# The upload body for files/upload/json: the setup file of harness/runtime/setup-headless.mjs as content. The key comes in
# through the environment, never through argv. Writes $1 with mode 0600.
# shellcheck disable=SC2016
SETUP_JS='const fs = require("fs"); const e = process.env; const setup = { name: e.AL_NAME, genesisPrompt: e.AL_GENESIS, creatorAddress: e.AL_CREATOR, creatorMessage: e.AL_MESSAGE, conwayApiUrl: e.AL_BASE, conwayApiKey: e.AL_KEY, socialRelayUrl: e.AL_BASE, inferenceModel: e.AL_MODEL, maxTurnsPerCycle: 6, disableHeartbeats: ["check_for_updates"] }; fs.writeFileSync(process.argv[1], JSON.stringify({ path: e.AL_PATH, content: JSON.stringify(setup, null, 2) }), { mode: 0o600 });'

# The answer to the exec of automaton-start, $1 = file: "files <exit_code_file> <output_file>" for a command that still runs
# in the background, else "held". Only paths under /root/.exec leave it.
# shellcheck disable=SC2016
BG_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } const ok = (v, ext) => typeof v === "string" && new RegExp("^/root/\\.exec/[0-9a-f]{1,64}\\." + ext + "$").test(v); if (o && o.running === true && o.exit_code === -1 && ok(o.exit_code_file, "exit") && ok(o.output_file, "out")) console.log("files " + o.exit_code_file + " " + o.output_file); else console.log("held");'

# The address of the runtime wallet from the answer of files/read on automaton.json ($1), lowercase, or nothing.
# shellcheck disable=SC2016
WALLET_JS='try { const o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const a = JSON.parse(o.content).walletAddress; if (typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a)) process.stdout.write(a.toLowerCase()); } catch (e) {}'

# The USDC balance from the answer of eth_call balanceOf ($1): "0", the amount in USDC (6 decimals), or "none".
# shellcheck disable=SC2016
USDC_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } const r = o && o.result; if (typeof r !== "string" || !/^0x[0-9a-fA-F]*$/.test(r)) { console.log("none"); process.exit(0); } const v = r === "0x" ? 0n : BigInt(r); if (v === 0n) console.log("0"); else { const s = v.toString().padStart(7, "0"); console.log((s.slice(0, -6) + "." + s.slice(-6)).replace(/\.?0+$/, "")); }'

# The ledger of production for one sandbox, the same text in production and in the selftest: rows of kind sandbox of this
# sandbox, rows of kind inference of the account the sandbox belongs to since $3, and hold_mc of the sandbox (-1 for both
# without the row in sandboxes). Only the three numbers leave the database; an id or a time of another form is refused.
# shellcheck disable=SC2016
LEDGER_JS='const [file, id, since] = process.argv.slice(1); if (!/^[a-z0-9]{1,40}$/.test(id || "") || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{3})?Z$/.test(since || "")) process.exit(2); let db; try { db = require("better-sqlite3")(file, { readonly: true, fileMustExist: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const n = db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = ? AND ref LIKE ?").get("sandbox", "sandbox:" + id + ":%").n; const s = db.prepare("SELECT address, hold_mc FROM sandboxes WHERE id = ?").get(id); const inf = s ? db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = ? AND lower(address) = lower(?) AND created_at >= ?").get("inference", s.address, since).n : -1; console.log(n + " " + inf + " " + (s ? s.hold_mc : -1));'

# memory.peak of the cgroup of the container sbx-<id> on the sandbox host, in bytes, read only; $1 = id.
mem_cmd() {
  # shellcheck disable=SC2016
  printf '%s' "cid=\$(docker inspect -f '{{.Id}}' sbx-$1 2>/dev/null); case \"\$cid\" in ''|*[!0-9a-f]*) exit 3 ;; esac; " \
    "f=/sys/fs/cgroup/sandbox.slice/docker-\$cid.scope/memory.peak; " \
    "[ -r \"\$f\" ] || f=\$(find /sys/fs/cgroup -path \"*\$cid*\" -name memory.peak 2>/dev/null | head -n 1); " \
    "[ -n \"\$f\" ] && [ -r \"\$f\" ] && cat \"\$f\""
}
BOOT_ID_CMD="cat /proc/sys/kernel/random/boot_id"

# ---- the calls out; the selftest replaces exactly these

# One call to the public API with the key from the header file HDR; $1 method, $2 path, $3 answer file, $4 JSON body or
# @file (optional), $5 extra header (optional). Prints the HTTP status.
api() {
  local args=(-s -o "$3" -w '%{http_code}' --max-time 150 -X "$1" -H "@$HDR")
  [ -n "${4:-}" ] && args+=(-H 'Content-Type: application/json' --data-binary "$4")
  [ -n "${5:-}" ] && args+=(-H "$5")
  curl "${args[@]}" "$BASE$2"
}
# One JSON-RPC call to the public RPC of Base, $1 = body file, $2 = answer file. Prints the HTTP status.
rpc_call() { curl -s -o "$2" -w '%{http_code}' --max-time 20 -H 'Content-Type: application/json' --data-binary "@$1" "$BASE_RPC"; }
# One read only command on the sandbox host.
sbx_ssh() { ssh -i "$SANDBOX_SSH_KEY" -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=20 "root@$SANDBOX_HOST" "$1" 2>/dev/null; }
# The reboot of the sandbox host; the connection drops with it, so its exit code says nothing.
sbx_reboot() { sbx_ssh "systemctl reboot" >/dev/null 2>&1 || true; }
# One node script inside deploy-cp-1 against the database, $1 = script, then its arguments after the database.
cp_node() {
  local js="$1" a remote
  shift
  remote="docker exec deploy-cp-1 node -e $(printf %q "$js") /data/cp.db"
  for a in "$@"; do remote+=" $(printf %q "$a")"; done
  ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null
}
# The check for foreign sandboxes of ops/sandbox/setup.sh, its last line.
foreign_report() { bash "$SETUP_SH" --foreign-sandboxes "$SANDBOX_HOST" </dev/null 2>/dev/null | tail -n 1; }
pause() { sleep "$1"; }

# ---- helpers

rand_hex() { od -An -tx1 -N8 /dev/urandom | tr -d ' \n'; }
json_str() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
# shellcheck disable=SC2016
json_field() { # $1 = file, $2 = field; strings, numbers and booleans, else nothing
  node -e 'try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; if (["string", "number", "boolean"].includes(typeof v)) process.stdout.write(String(v)); } catch (e) {}' "$1" "$2" 2>/dev/null
}
progress() { echo "automaton-live: $1"; }
secret() { [ -n "$1" ] && printf '%s\n' "$1" >>"$WORK/secrets"; }

# One call that ends the run on a 402; sets CODE, the answer is in ANS.
call() {
  CODE="$(api "$1" "$2" "$ANS" "${3:-}" "${4:-}")"
  [ "$CODE" = 000 ] && CODE=none
  [ "$CODE" = 402 ] && fail credits
  return 0
}
# One command in the sandbox, $1 = command, $2 = timeout in ms; sets CODE.
sbx_exec() {
  call POST "/v1/sandboxes/$SBX_ID/exec" "{\"command\":$(json_str "$1"),\"timeout\":${2:-30000}}" "Idempotency-Key: automaton-live-$(rand_hex)"
}
# The number printed by a counting command in the sandbox, $1 = command; sets N (empty without an answer).
count() {
  N=""
  sbx_exec "$1" 30000
  [ "$CODE" = 200 ] || return 0
  N="$(json_field "$ANS" stdout | tr -d '[:space:]')"
  [[ "$N" =~ ^[0-9]+$ ]] || N=""
}
# One file of the sandbox, $1 = path; sets CODE, the answer is in ANS.
read_file() { call GET "/v1/sandboxes/$SBX_ID/files/read?path=${1//\//%2F}"; }
# memory.peak now, in MB rounded up, folded into MEM_MB.
read_mem() {
  local b
  b="$(sbx_ssh "$(mem_cmd "$SBX_ID")" | tail -n 1 | tr -d '[:space:]')"
  [[ "$b" =~ ^[0-9]+$ ]] || return 0
  b=$(((b + 1048575) / 1048576))
  [ -z "$MEM_MB" ] || [ "$b" -gt "$MEM_MB" ] && MEM_MB="$b"
  return 0
}
read_boot() {
  BOOT="$(sbx_ssh "$BOOT_ID_CMD" | tail -n 1 | tr -d '[:space:]')"
  [[ "$BOOT" =~ ^[0-9a-f-]{36}$ ]] || BOOT=""
}

# Deletes the sandbox once, also from the trap; tries three times. Prints nothing.
cleanup_sandbox() {
  local i code
  [ -n "${SBX_ID:-}" ] && [ "${DELETED:-0}" = 0 ] || return 0
  for i in 1 2 3; do
    code="$(api DELETE "/v1/sandboxes/$SBX_ID" "$WORK/delete" "" "")"
    case "$code" in
      200 | 404)
        DELETED=1
        DELETE_NOTE=""
        return 0
        ;;
    esac
    DELETE_NOTE="; DELETE answered ${code:-nothing}, the sandbox may still run"
    [ "$i" = 3 ] || pause 5
  done
  DELETED=failed
}

fail() {
  cleanup_sandbox
  echo "AUTOMATON LIVE FAIL $1${DELETE_NOTE:-}"
  exit 1
}

# ---- the run; in a subshell of main, its output goes through guard

run_live() {
  local key="" start text exitf outf deadline line fr foreign led s_rows i_rows hold usdc turns after=0 reboot=skipped boot1
  SBX_ID=""
  DELETED=0
  DELETE_NOTE=""
  WALLET=""
  MEM_MB=""
  HDR="$WORK/hdr"
  ANS="$WORK/answer"
  trap 'cleanup_sandbox' EXIT
  trap 'cleanup_sandbox; exit 130' INT
  trap 'cleanup_sandbox; exit 143' TERM

  if [ -z "${CP_HOST:-}" ] && [ -f "$LOOP_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$LOOP_ENV"
    set +a
  fi
  CP_SSH_KEY="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  [ -n "${CP_HOST:-}" ] && [ -n "$CP_SSH_KEY" ] || fail "CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)"
  [ -r "$LIVE_SANDBOX_ENV" ] && key="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  [ -n "$key" ] || fail "no LIVE_SANDBOX_KEY readable in live-sandbox.env"
  secret "$key"
  (umask 077 && printf 'Authorization: %s\n' "$key" >"$HDR")
  start="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

  call GET /v1/models
  [ "$CODE" = 200 ] || fail "GET /v1/models answered $CODE, expected 200"
  MODEL="$(node -e "$MODEL_JS" "$ANS" 2>/dev/null)"
  [ -n "$MODEL" ] || fail "no model without Claude or Anthropic in /v1/models"
  progress "model $MODEL, the cheapest in /v1/models that is neither Claude nor Anthropic"

  call POST /v1/sandboxes '{"memory_mb":512,"vcpu":1,"disk_gb":5}'
  [ "$CODE" = 201 ] || fail "POST /v1/sandboxes answered $CODE, expected 201"
  SBX_ID="$(json_field "$ANS" id)"
  if ! [[ "$SBX_ID" =~ ^[a-z0-9]{1,40}$ ]]; then
    SBX_ID=""
    fail "POST /v1/sandboxes answered 201 without an id"
  fi
  secret "$SBX_ID"
  progress "small sandbox created"

  AL_KEY="$key" AL_BASE="$BASE" AL_MODEL="$MODEL" AL_NAME="live-automaton-$(rand_hex | head -c 6)" AL_GENESIS="$GENESIS_PROMPT" \
    AL_MESSAGE="$CREATOR_MESSAGE" AL_CREATOR="$ZERO_ADDRESS" AL_PATH="$SETUP_PATH" node -e "$SETUP_JS" "$WORK/upload.json" ||
    fail "could not write the setup file"
  key=""
  call POST "/v1/sandboxes/$SBX_ID/files/upload/json" "@$WORK/upload.json"
  rm -f "$WORK/upload.json"
  [ "$CODE" = 200 ] || fail "upload of the setup file answered $CODE, expected 200"

  # automaton-start with a timeout above the hold limit runs in the background (sandbox 05): either its output comes at
  # once, or the answer names the files it writes, read for at most 150 s.
  sbx_exec "AUTOMATON_HOME=/root automaton-start $SETUP_PATH" 120000
  [ "$CODE" = 200 ] || fail "exec of automaton-start answered $CODE, expected 200"
  text=""
  line="$(node -e "$BG_JS" "$ANS" 2>/dev/null)"
  if [[ "$line" == "files "* ]]; then
    read -r _ exitf outf <<<"$line"
    deadline=$((SECONDS + 150))
    while :; do
      read_file "$exitf"
      if [ "$CODE" = 200 ] && [[ "$(json_field "$ANS" content | tr -d '[:space:]')" =~ ^[0-9]+$ ]]; then
        read_file "$outf"
        [ "$CODE" = 200 ] && text="$(json_field "$ANS" content)"
        break
      fi
      [ "$SECONDS" -lt "$deadline" ] || break
      pause 5
    done
  else
    text="$(json_field "$ANS" stdout)"
  fi
  line="$(grep -E '^AUTOMATON_START ' <<<"$text" | tail -n 1 | tr -d '\r')"
  text=""
  if [ "$line" != "AUTOMATON_START ok" ]; then
    [[ "$line" =~ $START_FAIL_RE ]] || line="no AUTOMATON_START line"
    fail "automaton-start did not end with AUTOMATON_START ok (${line#AUTOMATON_START })"
  fi
  progress "AUTOMATON_START ok"

  deadline=$((SECONDS + FIRST_TURN_S))
  while :; do
    count "$TURNS_CMD"
    [ -n "$N" ] && [ "$N" -ge 1 ] && break
    [ "$SECONDS" -lt "$deadline" ] || fail "no turn within $FIRST_TURN_S s"
    pause 10
  done
  progress "first turn in run.log"
  read_mem

  if [ "${REBOOT:-0}" = 1 ]; then
    fr="$(foreign_report)"
    if [[ "$fr" =~ ^SETUP\ FOREIGN-SANDBOXES\ OK\ running=([0-9]+)\ foreign=([0-9]+)$ ]]; then
      foreign="${BASH_REMATCH[2]}"
      [ "$foreign" = 0 ] || fail "foreign sandboxes running, no reboot"
      progress "foreign sandboxes: running=${BASH_REMATCH[1]} foreign=0"
    else
      fail "foreign sandboxes not readable, no reboot"
    fi
    read_boot
    [ -n "$BOOT" ] || fail "no boot_id of the sandbox server over ssh, no reboot"
    boot1="$BOOT"
    read_mem
    sbx_exec "echo $MARK >> $RUN_LOG" 30000
    [ "$CODE" = 200 ] || fail "exec of the marker before the reboot answered $CODE, expected 200"
    sbx_reboot
    progress "reboot of the sandbox server sent"
    deadline=$((SECONDS + REBOOT_WAIT_S))
    BOOT=""
    while :; do
      pause 15
      [ -n "$BOOT" ] && [ "$BOOT" != "$boot1" ] || read_boot
      if [ -n "$BOOT" ] && [ "$BOOT" != "$boot1" ]; then
        count "$TURNS_AFTER_CMD"
        [ -n "$N" ] && [ "$N" -ge 1 ] && break
      fi
      if [ "$SECONDS" -ge "$deadline" ]; then
        [ -n "$BOOT" ] && [ "$BOOT" != "$boot1" ] || fail "the sandbox server did not reboot within $REBOOT_WAIT_S s"
        fail "no turn within $REBOOT_WAIT_S s after the reboot"
      fi
    done
    after="$N"
    reboot=ok
    progress "sandbox server rebooted, $after turns after the reboot"
  fi

  count "$TURNS_CMD"
  [ -n "$N" ] || fail "run.log not readable at the end (exec answered $CODE)"
  turns="$N"
  read_mem
  [ -n "$MEM_MB" ] || fail "memory.peak of the container not readable over ssh"

  read_file /root/.automaton/automaton.json
  [ "$CODE" = 200 ] || fail "read of automaton.json answered $CODE, expected 200"
  WALLET="$(node -e "$WALLET_JS" "$ANS" 2>/dev/null)"
  [ -n "$WALLET" ] || fail "no walletAddress in automaton.json"
  secret "$WALLET"

  cleanup_sandbox
  [ "$DELETED" = 1 ] || fail "DELETE of the sandbox failed${DELETE_NOTE}"
  progress "sandbox deleted"

  led="$(cp_node "$LEDGER_JS" "$SBX_ID" "$start" | tail -n 1)"
  [[ "$led" =~ ^([0-9]+)\ (-?[0-9]+)\ (-?[0-9]+)$ ]] || fail "ledger query gave no answer"
  s_rows="${BASH_REMATCH[1]}"
  i_rows="${BASH_REMATCH[2]}"
  hold="${BASH_REMATCH[3]}"
  [ "$hold" != -1 ] || fail "ledger: no row in sandboxes for the sandbox"
  [ "$s_rows" -ge 1 ] || fail "ledger: no row of kind sandbox for the sandbox"
  [ "$i_rows" -ge 1 ] || fail "ledger: no row of kind inference of the account since the start"
  [ "$hold" = 0 ] || fail "ledger: hold_mc=$hold after the delete, expected 0"

  printf '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"%s","data":"0x70a08231%064s"},"latest"]}' \
    "$USDC_BASE" "${WALLET#0x}" | sed 's/ /0/g' >"$WORK/rpc.json"
  CODE="$(rpc_call "$WORK/rpc.json" "$WORK/rpc-answer")"
  rm -f "$WORK/rpc.json"
  [ "$CODE" = 200 ] || fail "USDC balance of the runtime wallet not readable (RPC answered ${CODE:-nothing})"
  usdc="$(node -e "$USDC_JS" "$WORK/rpc-answer" 2>/dev/null)"
  [ -n "$usdc" ] && [ "$usdc" != none ] || fail "USDC balance of the runtime wallet not readable"
  [ "$usdc" = 0 ] || fail "the runtime wallet holds USDC (wallet_usdc is not 0)"

  echo "AUTOMATON LIVE OK turns=$turns reboot=$reboot turns_after_reboot=$after mem_peak_mb=$MEM_MB ledger_sandbox_rows=$s_rows ledger_inference_rows=$i_rows hold_mc=0 wallet_usdc=0"
}

# Every line of the run on stdin to stdout, except a line that holds a key (cnwy_k_...), a 0x address other than the zero
# address, a name sbx-<id>, or one of the secrets the run noted in $1 (the key, the sandbox id, the wallet address). Such a
# line is withheld, and the run then ends with a FAIL line. Exit 1 then.
guard() {
  local line leaked=0
  while IFS= read -r line || [ -n "$line" ]; do
    if grep -qE 'cnwy_k_[0-9A-Za-z]{4}|sbx-[a-z0-9]{6}' <<<"$line" ||
      grep -oiE '0x[0-9a-f]{40}' <<<"$line" | grep -qvix "$ZERO_ADDRESS" ||
      { [ -s "$1" ] && grep -qiF -f "$1" <<<"$line"; }; then
      leaked=1
      echo "automaton-live: a line was withheld, it held a key, an address or a sandbox id"
      continue
    fi
    echo "$line"
  done
  if [ "$leaked" = 1 ]; then
    echo "AUTOMATON LIVE FAIL the output held a key, an address or a sandbox id"
    return 1
  fi
}

main() {
  local rc grc
  WORK="$(mktemp -d)" || {
    echo "AUTOMATON LIVE FAIL no temporary folder"
    return 1
  }
  chmod 700 "$WORK"
  : >"$WORK/secrets"
  trap 'rm -rf "$WORK"' EXIT
  trap 'rm -rf "$WORK"; exit 130' INT
  trap 'rm -rf "$WORK"; exit 143' TERM
  (run_live) 2>&1 | guard "$WORK/secrets"
  local ps=("${PIPESTATUS[@]}")
  rc="${ps[0]}"
  grc="${ps[1]}"
  rm -rf "$WORK"
  trap - EXIT INT TERM
  [ "$rc" = 0 ] && [ "$grc" = 0 ]
}

# ---- selftest: the whole run against stand-ins for the API, the RPC, both ssh sides and setup.sh; no network, no port

selftest() {
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  local dir all_ok=1
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN
  # Stand-ins on PATH too, for any child process.
  mkdir -p "$dir/bin"
  printf '#!/usr/bin/env bash\necho "selftest must not reach the network ($(basename "$0"))" >&2\nexit 99\n' >"$dir/bin/curl"
  cp "$dir/bin/curl" "$dir/bin/ssh"
  chmod +x "$dir/bin/curl" "$dir/bin/ssh"

  # Made up here, never real: the key, the sandbox id, the wallet of the runtime.
  local fake_key fake_id="k3v9q2m7x1" fake_wallet
  fake_key="cnwy_k_$(head -c 32 /dev/zero | tr '\0' 'e')"
  fake_wallet="0x$(head -c 40 /dev/zero | tr '\0' '7')"
  printf 'LIVE_SANDBOX_KEY=%s\n' "$fake_key" >"$dir/live-sandbox.env"

  # The catalogue: the cheapest entry is a Claude model, the next an Anthropic one and an alias onto Claude; the cheapest
  # allowed one is planted-mini. A catalogue of only those three gives no model.
  local cl an m_bad m_all
  cl="clau""de-cheap" an="anthro""pic/cheap"
  m_bad="{\"id\":\"$cl\",\"owned_by\":\"openrouter\",\"upstream_model\":\"$cl\",\"pricing\":{\"input_per_million\":0.01,\"output_per_million\":0.01}},{\"id\":\"$an\",\"owned_by\":\"openrouter\",\"upstream_model\":\"$an\",\"pricing\":{\"input_per_million\":0.02,\"output_per_million\":0.02}},{\"id\":\"gpt-alias\",\"owned_by\":\"openrouter\",\"upstream_model\":\"$cl\",\"pricing\":{\"input_per_million\":0.03,\"output_per_million\":0.03}}"
  m_all="{\"data\":[$m_bad,{\"id\":\"planted-big\",\"owned_by\":\"openrouter\",\"upstream_model\":\"x/big\",\"pricing\":{\"input_per_million\":2,\"output_per_million\":8}},{\"id\":\"planted-mini\",\"owned_by\":\"openrouter\",\"upstream_model\":\"x/mini\",\"pricing\":{\"input_per_million\":0.1,\"output_per_million\":0.4}}]}"

  # A planted ledger per case: two step rows of the sandbox, a row of a sandbox whose id starts with it, two inference rows
  # of the account after the start, one before it and one of another account; hold_mc and the inference rows per case.
  local plant='const [file, id, own, hold, inf] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file); db.exec("SELECT 1"); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); } db.exec("CREATE TABLE ledger (id INTEGER PRIMARY KEY, address TEXT, kind TEXT, delta_mc INTEGER, ref TEXT, created_at TEXT); CREATE TABLE sandboxes (id TEXT PRIMARY KEY, address TEXT, hold_mc INTEGER)"); const ins = db.prepare("INSERT INTO ledger (address, kind, delta_mc, ref, created_at) VALUES (?, ?, ?, ?, ?)"); ins.run(own, "sandbox", -100, "sandbox:" + id + ":0", "2999-01-01T00:00:00.000Z"); ins.run(own, "sandbox", -100, "sandbox:" + id + ":1", "2999-01-01T00:06:00.000Z"); ins.run(own, "sandbox", -100, "sandbox:" + id + "x:0", "2999-01-01T00:00:00.000Z"); for (let i = 0; i < Number(inf); i++) ins.run(own.toUpperCase().replace("0X", "0x"), "inference", -5, "gen-" + i, "2999-01-01T00:01:00.000Z"); ins.run(own, "inference", -5, "gen-old", "2020-01-01T00:00:00.000Z"); ins.run("0x1111111111111111111111111111111111111111", "inference", -5, "gen-other", "2999-01-01T00:01:00.000Z"); db.prepare("INSERT INTO sandboxes (id, address, hold_mc) VALUES (?, ?, ?)").run(id, own, Number(hold));'
  local own_acct="0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  # One run of main against the stand-ins. $1 = case name, then the case as words NAME=value: REBOOT (0|1), CREATE (201|402),
  # START (ok|bg|402|fail), TURNS (1: one more turn per count, 0: none), FOREIGN (the last line of setup.sh), BOOTS (1: the
  # reboot gives a new boot_id, 0: not), AFTER (1: turns after the reboot, 0: none), HOLD, INF (inference rows), USDC (hex of
  # balanceOf), MODELS (all|bad), LEAK (1: a planted progress that prints the wallet and the key). Writes the output to
  # $dir/<name>.out and the calls to $dir/<name>/calls.
  run_case() {
    local name="$1"
    shift
    (
      local S="$dir/$name" REBOOT=0 CREATE=201 START=ok TURNS=1 FOREIGN="SETUP FOREIGN-SANDBOXES OK running=1 foreign=0"
      local BOOTS=1 AFTER=1 HOLD=0 INF=2 USDC=0x0000000000000000000000000000000000000000000000000000000000000000 MODELS=all LEAK=0
      local kv
      for kv in "$@"; do local "${kv%%=*}=${kv#*=}"; done
      mkdir -p "$S"
      : >"$S/calls"
      echo 0 >"$S/turns"
      echo 0 >"$S/after"
      echo 0 >"$S/down"
      echo "0f0e0d0c-0000-4000-8000-000000000001" >"$S/boot"
      (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$plant" "$S/cp.db" "$fake_id" "$own_acct" "$HOLD" "$INF") || echo "FAIL selftest: could not plant the ledger of $name"
      export PATH="$dir/bin:$PATH"
      LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
      CP_HOST=fake.invalid
      CP_SSH_KEY="$dir/no-such-key"
      BASE="https://cp.example.invalid"

      api() {
        local cmd=""
        echo "$1 $2" >>"$S/calls"
        if [ -n "${4:-}" ] && [ "${4#@}" = "$4" ]; then cmd="$(node -e 'try { process.stdout.write(String(JSON.parse(process.argv[1]).command || "")) } catch (e) {}' "$4")"; fi
        case "$1 $2" in
          "GET /v1/models")
            if [ "$MODELS" = bad ]; then printf '{"data":[%s]}' "$m_bad" >"$3"; else printf '%s' "$m_all" >"$3"; fi
            echo 200
            ;;
          "POST /v1/sandboxes")
            if [ "$CREATE" = 402 ]; then
              printf '{"error":"INSUFFICIENT_CREDITS"}' >"$3"
            else
              printf '{"id":"%s","status":"running"}' "$fake_id" >"$3"
            fi
            echo "$CREATE"
            ;;
          "POST /v1/sandboxes/$fake_id/files/upload/json")
            cp "${4#@}" "$S/upload"
            printf '{"ok":true}' >"$3"
            echo 200
            ;;
          "POST /v1/sandboxes/$fake_id/exec")
            local down
            down="$(cat "$S/down")"
            if [ "$down" -gt 0 ]; then
              echo $((down - 1)) >"$S/down"
              printf '{"error":"sandbox_server_unreachable"}' >"$3"
              echo 501
              return
            fi
            case "$cmd" in
              *automaton-start*)
                case "$START" in
                  402)
                    printf '{"error":"INSUFFICIENT_CREDITS"}' >"$3"
                    echo 402
                    return
                    ;;
                  bg) printf '{"stdout":"still running","stderr":"","exit_code":-1,"running":true,"output_file":"/root/.exec/0a1b2c3d4e5f.out","error_file":"/root/.exec/0a1b2c3d4e5f.err","exit_code_file":"/root/.exec/0a1b2c3d4e5f.exit"}' >"$3" ;;
                  fail) printf '{"stdout":"AUTOMATON_START FAIL setup\\n","stderr":"","exit_code":1}' >"$3" ;;
                  *) printf '{"stdout":"wallet created: %s\\nAUTOMATON_START ok\\n","stderr":"","exit_code":0}' "$fake_wallet" >"$3" ;;
                esac
                ;;
              *"$MARK >>"*) echo marked >>"$S/calls"; printf '{"stdout":"","stderr":"","exit_code":0}' >"$3" ;;
              awk*)
                local n
                n="$(cat "$S/after")"
                [ "$AFTER" = 1 ] && [ -e "$S/rebooted" ] && n=$((n + 1))
                echo "$n" >"$S/after"
                printf '{"stdout":"%s\\n","stderr":"","exit_code":0}' "$n" >"$3"
                ;;
              *grep\ -cE*)
                local n
                n=$(($(cat "$S/turns") + TURNS))
                echo "$n" >"$S/turns"
                printf '{"stdout":"%s\\n","stderr":"","exit_code":0}' "$n" >"$3"
                ;;
              *) printf '{"stdout":"","stderr":"unknown","exit_code":127}' >"$3" ;;
            esac
            echo 200
            ;;
          "GET /v1/sandboxes/$fake_id/files/read?path=%2Froot%2F.exec%2F0a1b2c3d4e5f.exit") printf '{"content":"0\\n"}' >"$3"; echo 200 ;;
          "GET /v1/sandboxes/$fake_id/files/read?path=%2Froot%2F.exec%2F0a1b2c3d4e5f.out")
            printf '{"content":"wallet created: %s\\nAUTOMATON_START ok\\n"}' "$fake_wallet" >"$3"
            echo 200
            ;;
          "GET /v1/sandboxes/$fake_id/files/read?path=%2Froot%2F.automaton%2Fautomaton.json")
            node -e 'process.stdout.write(JSON.stringify({ content: JSON.stringify({ name: "x", walletAddress: process.argv[1] }) }))' "$fake_wallet" >"$3"
            echo 200
            ;;
          "DELETE /v1/sandboxes/$fake_id")
            printf '{"ok":true}' >"$3"
            echo 200
            ;;
          *)
            printf '{"error":"not_found"}' >"$3"
            echo 404
            ;;
        esac
      }
      rpc_call() {
        echo "RPC" >>"$S/calls"
        cp "$1" "$S/rpc"
        printf '{"jsonrpc":"2.0","id":1,"result":"%s"}' "$USDC" >"$2"
        echo 200
      }
      sbx_ssh() {
        case "$1" in
          *boot_id*) echo "SSH boot_id" >>"$S/calls"; cat "$S/boot" ;;
          *memory.peak*)
            echo "SSH memory.peak" >>"$S/calls"
            # 300 MiB before the reboot, 100 MiB in the new cgroup after it: the maximum is 300.
            if [ -e "$S/rebooted" ]; then echo 104857600; else echo 314572800; fi
            ;;
          *) echo "SSH other" >>"$S/calls"; return 1 ;;
        esac
      }
      sbx_reboot() {
        echo "SSH reboot" >>"$S/calls"
        if [ "$BOOTS" = 1 ]; then
          : >"$S/rebooted"
          echo "0f0e0d0c-0000-4000-8000-000000000002" >"$S/boot"
          echo 2 >"$S/down"
        fi
      }
      cp_node() {
        echo "LEDGER" >>"$S/calls"
        (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$1" "$S/cp.db" "${@:2}" 2>/dev/null)
      }
      foreign_report() {
        echo "FOREIGN" >>"$S/calls"
        echo "$FOREIGN"
      }
      pause() { SECONDS=$((SECONDS + $1)); }
      [ "$LEAK" = 1 ] && progress() { echo "automaton-live: $1 ${WALLET:-} ${SBX_ID:-}"; }
      main
    ) >"$dir/$name.out" 2>&1
  }

  # Checks one case: the last line against $2 (an extended regex), then each further word NAME=<n> against the calls:
  # deletes, reboots, foreign checks. Every output is also searched for the made-up key, id and wallet.
  expect() {
    local name="$1" want="$2" last got k v why=""
    shift 2
    last="$(tail -n 1 "$dir/$name.out")"
    [[ "$last" =~ $want ]] || why="last line '$last'"
    for kv in "$@"; do
      k="${kv%%=*}"
      v="${kv#*=}"
      case "$k" in
        deletes) got="$(grep -c "^DELETE /v1/sandboxes/$fake_id\$" "$dir/$name/calls")" ;;
        reboots) got="$(grep -c '^SSH reboot$' "$dir/$name/calls")" ;;
        foreign) got="$(grep -c '^FOREIGN$' "$dir/$name/calls")" ;;
        withheld) got="$(grep -c 'a line was withheld' "$dir/$name.out")" ;;
      esac
      [ "$got" = "$v" ] || why="${why:+$why, }$k=$got, expected $v"
    done
    if grep -qiF -e "$fake_key" -e "$fake_id" -e "$fake_wallet" "$dir/$name.out"; then why="${why:+$why, }the output holds a made-up secret"; fi
    if [ -z "$why" ]; then
      echo "ok   $name: $last"
    else
      echo "FAIL $name: $why"
      all_ok=0
    fi
  }

  local ok_re='^AUTOMATON LIVE OK turns=[1-9][0-9]* reboot=skipped turns_after_reboot=0 mem_peak_mb=300 ledger_sandbox_rows=2 ledger_inference_rows=2 hold_mc=0 wallet_usdc=0$'
  local reboot_re='^AUTOMATON LIVE OK turns=[1-9][0-9]* reboot=ok turns_after_reboot=[1-9][0-9]* mem_peak_mb=300 ledger_sandbox_rows=2 ledger_inference_rows=2 hold_mc=0 wallet_usdc=0$'

  run_case good
  expect good "$ok_re" deletes=1 reboots=0 foreign=0 withheld=0
  # What went into the sandbox: the setup file with the key, the base URL twice, the zero address, the cheapest allowed
  # model and check_for_updates off, at /root/.automaton-setup.json.
  # shellcheck disable=SC2016
  if (cd "$ROOT" && node -e 'const [f, key, base] = process.argv.slice(1); const u = JSON.parse(require("fs").readFileSync(f, "utf8")); const s = JSON.parse(u.content); const ok = u.path === "/root/.automaton-setup.json" && s.conwayApiKey === key && s.conwayApiUrl === base && s.socialRelayUrl === base && s.creatorAddress === "0x" + "0".repeat(40) && s.inferenceModel === "planted-mini" && JSON.stringify(s.disableHeartbeats) === "[\"check_for_updates\"]" && /read-only/.test(s.genesisPrompt) && typeof s.creatorMessage === "string" && s.name; process.exit(ok ? 0 : 1);' "$dir/good/upload" "$fake_key" "https://cp.example.invalid"); then
    echo "ok   good: setup file with key, base URL, zero address, planted-mini, check_for_updates off"
  else
    echo "FAIL good: the setup file is not the one expected"
    all_ok=0
  fi
  # The balance is asked for the wallet of automaton.json, at the USDC contract on Base.
  if grep -qiF "\"to\":\"$USDC_BASE\"" "$dir/good/rpc" && grep -qF "\"data\":\"0x70a08231000000000000000000000000${fake_wallet#0x}\"" "$dir/good/rpc"; then
    echo "ok   good: balanceOf for the runtime wallet at USDC on Base"
  else
    echo "FAIL good: the RPC call is not balanceOf of the runtime wallet"
    all_ok=0
  fi

  run_case reboot REBOOT=1 START=bg
  expect reboot "$reboot_re" deletes=1 reboots=1 foreign=1 withheld=0
  # The foreign check and the marker come before the reboot.
  if [ "$(grep -nE '^(FOREIGN|marked|SSH reboot)$' "$dir/reboot/calls" | cut -d: -f2 | paste -sd, -)" = "FOREIGN,marked,SSH reboot" ]; then
    echo "ok   reboot: foreign check, marker, then the reboot"
  else
    echo "FAIL reboot: the order of foreign check, marker and reboot is wrong"
    all_ok=0
  fi

  run_case no-turn TURNS=0
  expect no-turn '^AUTOMATON LIVE FAIL no turn within 300 s$' deletes=1 reboots=0
  run_case credits-create CREATE=402
  expect credits-create '^AUTOMATON LIVE FAIL credits$' deletes=0
  run_case credits-exec START=402
  expect credits-exec '^AUTOMATON LIVE FAIL credits$' deletes=1
  run_case start-fail START=fail
  expect start-fail '^AUTOMATON LIVE FAIL automaton-start did not end with AUTOMATON_START ok \(FAIL setup\)$' deletes=1
  run_case foreign REBOOT=1 "FOREIGN=SETUP FOREIGN-SANDBOXES OK running=2 foreign=1"
  expect foreign '^AUTOMATON LIVE FAIL foreign sandboxes running, no reboot$' deletes=1 reboots=0 foreign=1
  run_case foreign-unreadable REBOOT=1 "FOREIGN=SETUP FOREIGN-SANDBOXES FAIL: cannot read the state of sandboxd on the sandbox host"
  expect foreign-unreadable '^AUTOMATON LIVE FAIL foreign sandboxes not readable, no reboot$' deletes=1 reboots=0
  run_case no-reboot REBOOT=1 BOOTS=0
  expect no-reboot '^AUTOMATON LIVE FAIL the sandbox server did not reboot within 600 s$' deletes=1 reboots=1
  run_case no-turn-after REBOOT=1 AFTER=0
  expect no-turn-after '^AUTOMATON LIVE FAIL no turn within 600 s after the reboot$' deletes=1 reboots=1
  run_case wallet USDC=0x00000000000000000000000000000000000000000000000000000000000f4240
  expect wallet '^AUTOMATON LIVE FAIL the runtime wallet holds USDC \(wallet_usdc is not 0\)$' deletes=1
  run_case hold HOLD=1000
  expect hold '^AUTOMATON LIVE FAIL ledger: hold_mc=1000 after the delete, expected 0$' deletes=1
  run_case no-inference INF=0
  expect no-inference '^AUTOMATON LIVE FAIL ledger: no row of kind inference of the account since the start$' deletes=1
  run_case claude-only MODELS=bad
  expect claude-only '^AUTOMATON LIVE FAIL no model without Claude or Anthropic in /v1/models$' deletes=0
  # The print rule, its counter-proof: a planted progress line with the wallet and the sandbox id is withheld, and the
  # run that would otherwise be OK ends with a FAIL.
  run_case leak LEAK=1
  expect leak '^AUTOMATON LIVE FAIL the output held a key, an address or a sandbox id$' deletes=1 withheld=4

  # guard on its own, both directions: a key, an address and a sbx name are withheld, the zero address and plain lines pass.
  local g_case g_line g_want g_got
  : >"$dir/no-secrets"
  for g_case in "plain|automaton-live: model planted-mini|0" "zero-address|creatorAddress $ZERO_ADDRESS|0" \
    "key|key $fake_key|1" "address|wallet $fake_wallet|1" "sbx-name|host sbx-$fake_id.example|1" \
    "address-upper|upper 0x$(head -c 40 /dev/zero | tr '\0' 'A')|1"; do
    IFS='|' read -r _ g_line g_want <<<"$g_case"
    g_got="$(printf '%s\nAUTOMATON LIVE OK planted\n' "$g_line" | guard "$dir/no-secrets" | grep -c 'a line was withheld')"
    if [ "$g_got" = "$g_want" ]; then echo "ok   guard '${g_case%%|*}': withheld=$g_got"; else echo "FAIL guard '${g_case%%|*}': withheld=$g_got, expected $g_want"; all_ok=0; fi
  done
  # A secret noted by the run is withheld even when it matches no pattern (a bare sandbox id).
  printf '%s\n' "$fake_id" >"$dir/one-secret"
  g_got="$(printf 'id %s\n' "$fake_id" | guard "$dir/one-secret" | tail -n 1)"
  if [ "$g_got" = "AUTOMATON LIVE FAIL the output held a key, an address or a sandbox id" ]; then echo "ok   guard noted secret: $g_got"; else echo "FAIL guard noted secret: $g_got"; all_ok=0; fi

  if [ "$all_ok" = 1 ]; then
    echo "AUTOMATON LIVE SELFTEST OK"
    return 0
  fi
  echo "AUTOMATON LIVE SELFTEST FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --reboot) REBOOT=1 main ;;
  "") REBOOT=0 main ;;
  -h | --help) awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0" ;;
  *)
    echo "usage: bash ops/automaton-live.sh [--reboot | --selftest]" >&2
    exit 2
    ;;
esac
