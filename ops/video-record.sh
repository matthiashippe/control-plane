#!/usr/bin/env bash
# The recording of the video "one line moves an automaton" (goals/reichweite/03, decisions 2 to 4).
#
#   bash ops/video-record.sh --record     network: one small sandbox of our own account on automatonhost.com, the tape
#                                         docs/video/umzug.tape inside it, then docs/video/umzug.transcript.json
#   bash ops/video-record.sh --verify     network, read only: the ledger of production knows the key of the transcript
#   bash ops/video-record.sh --selftest   no network, no port: the whole run against stand-ins, in both directions
#
# Why a sandbox: with an empty sandboxId the runtime at the pin runs every tool on the machine it runs on (execSync in
# src/conway/client.ts), on the code-host that would be with its rights and keys. The image sandboxd-base:2 carries the
# unmodified runtime under /opt/automaton. The run follows ops/automaton-live.sh without changing it: the public sandbox
# API with LIVE_SANDBOX_KEY (~/.config/control-plane/live-sandbox.env, the own account of src/bounties/ours.ts), the
# smallest sandbox, the cheapest model of GET /v1/models that is neither Claude nor Anthropic, the sandbox deleted in every
# case, also on a failure or a signal. The wallet of the runtime is the wallet of that account (LIVE_SANDBOX_WALLET_KEY,
# address LIVE_SANDBOX_ADDRESS), because a fresh wallet would count as a foreign automaton and draw the starter credit; the
# key goes into the sandbox as a file only, and the sandbox is deleted afterwards.
#
# Inside the sandbox a small recorder (REC_JS below) runs the setup lines of the tape, then every run line with bash, and
# writes each output line with its time since the start of the step. Back on the code-host exactly one thing is changed:
# the value of apiKey becomes "<api key hidden>". A string of 64 hex characters, any other address than
# LIVE_SANDBOX_ADDRESS, a full key or a secret of the run in the result ends the recording with VIDEO RECORD FAIL secret and
# writes nothing. If api.conway.tech answers the provisioning without an error, it ends with VIDEO RECORD FAIL conway
# answered and writes nothing.
#
# No topup and no transaction: the USDC balance of the wallet must be 0 before the start (one eth_call balanceOf over a
# public RPC, BASE_RPC_URL), and a 402 anywhere ends with VIDEO RECORD FAIL credits. Every output line goes through guard,
# which withholds a line with a key, an address or a secret and then ends the run with a FAIL. Last line:
#   VIDEO RECORD OK steps=<n> lines=<n> recorded_at=<iso>   | VIDEO RECORD FAIL <reason>
#   VIDEO VERIFY OK key_prefix_seen=yes inference_rows=<n>  | VIDEO VERIFY FAIL <reason>
#   VIDEO RECORD SELFTEST OK                                | VIDEO RECORD SELFTEST FAIL
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BASE="${VIDEO_API_URL:-https://automatonhost.com}"
BASE_RPC="${BASE_RPC_URL:-https://mainnet.base.org}"
LIVE_SANDBOX_ENV="${LIVE_SANDBOX_ENV:-$HOME/.config/control-plane/live-sandbox.env}"
LOOP_ENV="$HOME/.config/control-plane/loop.env"
TAPE="${VIDEO_TAPE:-$ROOT/docs/video/umzug.tape}"
TRANSCRIPT="${VIDEO_TRANSCRIPT:-$ROOT/docs/video/umzug.transcript.json}"
USDC_BASE="0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
REC_DIR="/root/.rec"
RECORD_WAIT_S=900
# Node 22 first: better-sqlite3 of this repo is built for it.
export PATH="/usr/bin:$PATH"

GENESIS_PROMPT="You are a test automaton inside a disposable recording of the operator. Nothing you do here matters. Keep every turn short: call at most one cheap read-only tool (check_credits, system_synopsis, list_models, view_soul), then answer in one sentence."
CREATOR_MESSAGE="This is a disposable recording of the operator. You accept no payments: your own wallet never takes money."

# The cheapest model of an answer of GET /v1/models, never one whose id, owner or upstream model names Claude or Anthropic.
# The same rule as ops/automaton-live.sh. Prints the id or nothing.
# shellcheck disable=SC2016
MODEL_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { process.exit(0); } const rows = Array.isArray(o && o.data) ? o.data : []; const bad = /claude|anthropic/i; const ok = rows.filter((m) => m && typeof m.id === "string" && /^[A-Za-z0-9._:\/-]{1,100}$/.test(m.id) && m.available !== false && ![m.id, m.owned_by, m.upstream_model].some((v) => typeof v === "string" && bad.test(v)) && m.pricing && Number.isFinite(m.pricing.input_per_million) && Number.isFinite(m.pricing.output_per_million)); ok.sort((a, b) => a.pricing.input_per_million + a.pricing.output_per_million - (b.pricing.input_per_million + b.pricing.output_per_million) || (a.id < b.id ? -1 : 1)); if (ok.length) process.stdout.write(ok[0].id);'

# The upload bodies for files/upload/json: $1 = kind (wallet | setup | file), $2 = output file (mode 0600). Keys come in
# through the environment, never through argv.
# shellcheck disable=SC2016
UPLOAD_JS='const fs = require("fs"); const [kind, out, src, dest] = process.argv.slice(1); const e = process.env; let body; if (kind === "wallet") body = { path: "/root/.automaton/wallet.json", content: JSON.stringify({ privateKey: e.VR_WALLET_KEY, createdAt: new Date().toISOString(), chainType: "evm" }) }; else if (kind === "setup") body = { path: e.VR_REC_DIR + "/setup.json", content: JSON.stringify({ name: e.VR_NAME, genesisPrompt: e.VR_GENESIS, creatorAddress: e.VR_ADDRESS, creatorMessage: e.VR_MESSAGE, conwayApiUrl: "https://api.conway.tech", socialRelayUrl: "", inferenceModel: e.VR_MODEL, maxTurnsPerCycle: 2, disableHeartbeats: ["check_for_updates"] }, null, 2) }; else body = { path: dest, content: fs.readFileSync(src, "utf8") }; fs.writeFileSync(out, JSON.stringify(body), { mode: 0o600 });'

# The recorder inside the sandbox: node rec.js <tape> <out.json>. Setup lines first (output not kept), then every run
# line with bash -c in the home directory, stdout and stderr line by line with t_ms since the start of the step; until
# stops its run at the first matching line (process group SIGTERM, SIGKILL 3 s later; later lines are not recorded), a
# run without until stops after 180 s. Writes out.json, then out.json.done.
REC_JS="$(
  cat <<'JS'
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const [tapeFile, outFile] = process.argv.slice(2);
const home = process.env.HOME || "/root";
const t0 = Date.now();
const out = { recorded_at: new Date(t0).toISOString(), setup_ok: true, steps: [] };
const done = () => {
  fs.writeFileSync(outFile + ".tmp", JSON.stringify(out));
  fs.renameSync(outFile + ".tmp", outFile);
  fs.writeFileSync(outFile + ".done", "1\n");
};
const items = [];
for (const raw of fs.readFileSync(tapeFile, "utf8").split("\n")) {
  const line = raw.replace(/\r$/, "");
  let m;
  if (!line.trim() || line.startsWith("#")) continue;
  if ((m = line.match(/^setup (.+)$/))) items.push({ kind: "setup", command: m[1] });
  else if ((m = line.match(/^run ([1-4]) (.+)$/))) items.push({ kind: "run", scene: Number(m[1]), command: m[2] });
  else if ((m = line.match(/^until (.+)$/)) && items.length && items[items.length - 1].kind === "run") items[items.length - 1].until = new RegExp(m[1]);
  else if (/^caption [1-4] .+$/.test(line)) continue;
  else { out.setup_ok = false; out.error = "tape line not understood"; done(); process.exit(0); }
}
function runStep(item) {
  return new Promise((resolve) => {
    const started = Date.now();
    const step = { scene: item.scene, command: item.command, exit_code: null, started_ms: started - t0, lines: [] };
    const child = spawn("bash", ["-c", item.command], { cwd: home, detached: true, stdio: ["ignore", "pipe", "pipe"] });
    const bufs = { out: "", err: "" };
    let stopped = false;
    const stop = () => {
      if (stopped) return;
      stopped = true;
      try { process.kill(-child.pid, "SIGTERM"); } catch (e) {}
      setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch (e) {} }, 3000).unref();
    };
    const push = (text) => {
      if (stopped) return;
      step.lines.push({ t_ms: Date.now() - started, text });
      if (item.until && item.until.test(text)) stop();
    };
    const feed = (k, chunk) => {
      bufs[k] += chunk;
      let i;
      while ((i = bufs[k].indexOf("\n")) >= 0) {
        push(bufs[k].slice(0, i).replace(/\r$/, ""));
        bufs[k] = bufs[k].slice(i + 1);
      }
    };
    child.stdout.setEncoding("utf8").on("data", (c) => feed("out", c));
    child.stderr.setEncoding("utf8").on("data", (c) => feed("err", c));
    const timer = setTimeout(stop, 180000);
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      for (const k of ["out", "err"]) if (bufs[k]) push(bufs[k]);
      step.exit_code = code === null ? 128 + (signal === "SIGKILL" ? 9 : 15) : code;
      resolve(step);
    });
  });
}
(async () => {
  for (const item of items.filter((x) => x.kind === "setup")) {
    const r = spawnSync("bash", ["-c", item.command], { cwd: home, stdio: "ignore", timeout: 120000 });
    if (r.status !== 0) { out.setup_ok = false; out.error = "setup line failed"; done(); return; }
  }
  for (const item of items.filter((x) => x.kind === "run")) out.steps.push(await runStep(item));
  done();
})();
JS
)"

# From the raw result of the recorder ($1) and the tape ($2) to the transcript ($3); $4 = LIVE_SANDBOX_ADDRESS, $5 = the
# file of secrets of the run. Replaces the value of apiKey, then refuses any secret. Exit 0 written, 3 setup, 4 steps
# differ from the tape, 5 secret, 6 conway answered, 7 scene 3 did not sign in, 8 scene 3 reached no turn.
# shellcheck disable=SC2016
TRANSCRIPT_JS='const fs = require("fs"); const [rawFile, tapeFile, outFile, address, secretsFile] = process.argv.slice(1); let raw; try { raw = JSON.parse(fs.readFileSync(rawFile, "utf8")); } catch (e) { process.exit(3); } if (!raw || raw.setup_ok !== true || !Array.isArray(raw.steps)) process.exit(3); const tape = fs.readFileSync(tapeFile, "utf8").split("\n").map((l) => l.match(/^run ([1-4]) (.+)$/)).filter(Boolean).map((m) => [Number(m[1]), m[2]]); const steps = raw.steps.map((s) => ({ scene: s.scene, command: s.command, exit_code: s.exit_code, started_ms: s.started_ms, lines: (s.lines || []).map((l) => ({ t_ms: l.t_ms, text: String(l.text).replace(/(\\?"apiKey\\?"\s*:\s*\\?")[^"\\]*/g, "$1<api key hidden>") })) })); if (steps.length !== tape.length || steps.some((s, i) => s.scene !== tape[i][0] || s.command !== tape[i][1] || !Number.isInteger(s.exit_code) || !Number.isInteger(s.started_ms) || s.lines.some((l) => !Number.isInteger(l.t_ms)))) process.exit(4); const t = { runtime_rev: "d8f8168", recorded_at: raw.recorded_at, steps }; const text = JSON.stringify(t, null, 2) + "\n"; const flat = JSON.stringify(t); const secrets = fs.readFileSync(secretsFile, "utf8").split("\n").filter((s) => s.length >= 8); const addrs = [...flat.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0].toLowerCase()); if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z$/.test(String(t.recorded_at)) || /[0-9a-fA-F]{64}/.test(flat) || /cnwy_k_[0-9A-Za-z]{9,}/.test(flat) || addrs.some((a) => a !== address.toLowerCase()) || secrets.some((s) => flat.toLowerCase().includes(s.toLowerCase()))) process.exit(5); const sc = (n) => steps.filter((s) => s.scene === n); const txt = (n) => sc(n).flatMap((s) => s.lines.map((l) => l.text)).join("\n"); const p1 = sc(1).find((s) => /--provision$/.test(s.command)); const p3 = sc(3).find((s) => /--provision$/.test(s.command)); if (!p1 || p1.exit_code === 0 || !/Provision failed/.test(txt(1))) process.exit(6); if (!p3 || p3.exit_code !== 0 || !/<api key hidden>/.test(txt(3))) process.exit(7); if (!/Turn [^:]+: [0-9]+ tools/.test(txt(3))) process.exit(8); fs.writeFileSync(outFile + ".tmp", text); fs.renameSync(outFile + ".tmp", outFile); console.log(steps.length + " " + steps.reduce((n, s) => n + s.lines.length, 0) + " " + t.recorded_at);'

# From the transcript ($1): "<keyPrefix> <from> <to>", the prefix of the key of scene 3 and the window of the recording
# (5 minutes before recorded_at to 5 minutes after the last line), or nothing.
# shellcheck disable=SC2016
WINDOW_JS='try { const t = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); const s3 = t.steps.filter((s) => s.scene === 3).flatMap((s) => s.lines.map((l) => l.text)).join("\n"); const m = s3.match(/keyPrefix\\?"\s*:\s*\\?"(cnwy_k_[0-9a-f]{8})/); const start = Date.parse(t.recorded_at); const last = Math.max(0, ...t.steps.map((s) => s.started_ms + Math.max(0, ...s.lines.map((l) => l.t_ms)))); if (m && Number.isFinite(start)) process.stdout.write(m[1] + " " + new Date(start - 300000).toISOString() + " " + new Date(start + last + 300000).toISOString()); } catch (e) {}'

# The ledger of production, read only: keys with this prefix of this address created in the window, and rows of kind
# inference of this address in the window. Only two numbers leave the database; arguments of another form are refused.
# shellcheck disable=SC2016
VERIFY_JS='const [file, prefix, address, from, to] = process.argv.slice(1); const iso = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/; if (!/^cnwy_k_[0-9a-f]{8}$/.test(prefix || "") || !/^0x[0-9a-fA-F]{40}$/.test(address || "") || !iso.test(from || "") || !iso.test(to || "")) process.exit(2); let db; try { db = require("better-sqlite3")(file, { readonly: true, fileMustExist: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const k = db.prepare("SELECT count(*) AS n FROM api_keys WHERE key_prefix = ? AND lower(address) = lower(?) AND created_at >= ? AND created_at <= ?").get(prefix, address, from, to).n; const i = db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = ? AND lower(address) = lower(?) AND created_at >= ? AND created_at <= ?").get("inference", address, from, to).n; console.log(k + " " + i);'

# The USDC balance from the answer of eth_call balanceOf ($1): "0", "more" or "none".
# shellcheck disable=SC2016
USDC_JS='let o; try { o = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); } catch (e) { o = null; } const r = o && o.result; if (typeof r !== "string" || !/^0x[0-9a-fA-F]*$/.test(r)) console.log("none"); else console.log(r === "0x" || BigInt(r) === 0n ? "0" : "more");'

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
# One node script inside deploy-cp-1 against the database, read only; $1 = script, then its arguments after the database.
cp_node() {
  local js="$1" a remote
  shift
  remote="docker exec deploy-cp-1 node -e $(printf %q "$js") /data/cp.db"
  for a in "$@"; do remote+=" $(printf %q "$a")"; done
  ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null
}
pause() { sleep "$1"; }

# ---- helpers

rand_hex() { od -An -tx1 -N8 /dev/urandom | tr -d ' \n'; }
json_str() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }
# shellcheck disable=SC2016
json_field() { # $1 = file, $2 = field; strings, numbers and booleans, else nothing
  node -e 'try { const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"))[process.argv[2]]; if (["string", "number", "boolean"].includes(typeof v)) process.stdout.write(String(v)); } catch (e) {}' "$1" "$2" 2>/dev/null
}
progress() { echo "video-record: $1"; }
secret() { [ -n "$1" ] && printf '%s\n' "$1" >>"$WORK/secrets"; }
env_value() { [ -r "$LIVE_SANDBOX_ENV" ] && sed -n "s/^$1=//p" "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r"; }

# One call that ends the run on a 402; sets CODE, the answer is in ANS.
call() {
  CODE="$(api "$1" "$2" "$ANS" "${3:-}" "${4:-}")"
  [ "$CODE" = 000 ] && CODE=none
  [ "$CODE" = 402 ] && fail credits
  return 0
}
sbx_exec() {
  call POST "/v1/sandboxes/$SBX_ID/exec" "{\"command\":$(json_str "$1"),\"timeout\":${2:-30000}}" "Idempotency-Key: video-record-$(rand_hex)"
}
read_file() { call GET "/v1/sandboxes/$SBX_ID/files/read?path=${1//\//%2F}"; }
# Uploads one body made by UPLOAD_JS; $1 = kind, $2 source file, $3 destination path (kind file only).
upload() {
  node -e "$UPLOAD_JS" "$1" "$WORK/upload.json" "${2:-}" "${3:-}" || fail "could not write the upload body ($1)"
  call POST "/v1/sandboxes/$SBX_ID/files/upload/json" "@$WORK/upload.json"
  rm -f "$WORK/upload.json"
  [ "$CODE" = 200 ] || fail "upload ($1) answered $CODE, expected 200"
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
  echo "VIDEO $MODE FAIL $1${DELETE_NOTE:-}"
  exit 1
}

load_live_env() {
  KEY="$(env_value LIVE_SANDBOX_KEY)"
  ADDRESS="$(env_value LIVE_SANDBOX_ADDRESS | tr 'A-F' 'a-f')"
  [ -n "$KEY" ] || fail "no LIVE_SANDBOX_KEY readable in live-sandbox.env"
  [[ "$ADDRESS" =~ ^0x[0-9a-f]{40}$ ]] || fail "no LIVE_SANDBOX_ADDRESS readable in live-sandbox.env"
  secret "$KEY"
}

# ---- the recording; in a subshell of main, its output goes through guard

run_record() {
  local wallet_key raw rc out n_steps n_lines at deadline
  SBX_ID=""
  DELETED=0
  DELETE_NOTE=""
  HDR="$WORK/hdr"
  ANS="$WORK/answer"
  trap 'cleanup_sandbox' EXIT
  trap 'cleanup_sandbox; exit 130' INT
  trap 'cleanup_sandbox; exit 143' TERM

  [ -r "$TAPE" ] || fail "tape not readable"
  load_live_env
  wallet_key="$(env_value LIVE_SANDBOX_WALLET_KEY)"
  [[ "$wallet_key" =~ ^0x[0-9a-fA-F]{64}$ ]] || fail "no LIVE_SANDBOX_WALLET_KEY readable in live-sandbox.env"
  secret "$wallet_key"
  secret "${wallet_key#0x}"
  (umask 077 && printf 'Authorization: %s\n' "$KEY" >"$HDR")

  # No topup can happen: the runtime buys credits on its first start only with USDC in its wallet.
  printf '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"%s","data":"0x70a08231%064s"},"latest"]}' \
    "$USDC_BASE" "${ADDRESS#0x}" | sed 's/ /0/g' >"$WORK/rpc.json"
  CODE="$(rpc_call "$WORK/rpc.json" "$WORK/rpc-answer")"
  [ "$CODE" = 200 ] || fail "USDC balance of the wallet not readable (RPC answered ${CODE:-nothing})"
  case "$(node -e "$USDC_JS" "$WORK/rpc-answer" 2>/dev/null)" in
    0) progress "the wallet holds no USDC, so no topup can happen" ;;
    more) fail "the wallet holds USDC, a first start could buy credits" ;;
    *) fail "USDC balance of the wallet not readable" ;;
  esac

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

  VR_WALLET_KEY="$wallet_key" upload wallet
  wallet_key=""
  VR_REC_DIR="$REC_DIR" VR_NAME="video-automaton-$(rand_hex | head -c 6)" VR_GENESIS="$GENESIS_PROMPT" VR_MESSAGE="$CREATOR_MESSAGE" \
    VR_ADDRESS="$ADDRESS" VR_MODEL="$MODEL" upload setup
  upload file "$TAPE" "$REC_DIR/umzug.tape"
  printf '%s\n' "$REC_JS" >"$WORK/rec.js"
  upload file "$WORK/rec.js" "$REC_DIR/rec.js"
  progress "wallet, setup, tape and recorder uploaded"

  sbx_exec "cd /root && setsid nohup node $REC_DIR/rec.js $REC_DIR/umzug.tape $REC_DIR/out.json > $REC_DIR/rec.log 2>&1 < /dev/null &" 30000
  [ "$CODE" = 200 ] || fail "exec of the recorder answered $CODE, expected 200"
  progress "recording"
  deadline=$((SECONDS + RECORD_WAIT_S))
  while :; do
    pause 5
    read_file "$REC_DIR/out.json.done"
    [ "$CODE" = 200 ] && [ "$(json_field "$ANS" content | tr -d '[:space:]')" = 1 ] && break
    [ "$SECONDS" -lt "$deadline" ] || fail "the recording did not end within $RECORD_WAIT_S s"
  done
  read_file "$REC_DIR/out.json"
  [ "$CODE" = 200 ] || fail "read of the recording answered $CODE, expected 200"
  raw="$WORK/raw.json"
  json_field "$ANS" content >"$raw"
  : >"$ANS"

  cleanup_sandbox
  [ "$DELETED" = 1 ] || fail "DELETE of the sandbox failed${DELETE_NOTE}"
  progress "sandbox deleted"

  out="$(node -e "$TRANSCRIPT_JS" "$raw" "$TAPE" "$TRANSCRIPT" "$ADDRESS" "$WORK/secrets" 2>/dev/null)"
  rc=$?
  rm -f "$raw"
  case "$rc" in
    0) ;;
    3) fail "a setup line of the tape failed in the sandbox" ;;
    4) fail "the recorded steps are not the run lines of the tape" ;;
    5) fail secret ;;
    6) fail "conway answered" ;;
    7) fail "scene 3 did not sign in at automatonhost.com" ;;
    8) fail "scene 3 reached no turn" ;;
    *) fail "the transcript could not be written" ;;
  esac
  read -r n_steps n_lines at <<<"$out"
  echo "VIDEO RECORD OK steps=$n_steps lines=$n_lines recorded_at=$at"
}

# ---- the check against the ledger of production, read only

run_verify() {
  local win prefix from to led
  if [ -z "${CP_HOST:-}" ] && [ -f "$LOOP_ENV" ]; then
    set -a
    # shellcheck disable=SC1090
    . "$LOOP_ENV"
    set +a
  fi
  CP_SSH_KEY="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  [ -n "${CP_HOST:-}" ] && [ -n "$CP_SSH_KEY" ] || fail "CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)"
  ADDRESS="$(env_value LIVE_SANDBOX_ADDRESS | tr 'A-F' 'a-f')"
  [[ "$ADDRESS" =~ ^0x[0-9a-f]{40}$ ]] || fail "no LIVE_SANDBOX_ADDRESS readable in live-sandbox.env"
  secret "$ADDRESS"
  win="$(node -e "$WINDOW_JS" "$TRANSCRIPT" 2>/dev/null)"
  read -r prefix from to <<<"$win"
  [ -n "${to:-}" ] || fail "no keyPrefix or recorded_at in the transcript"
  led="$(cp_node "$VERIFY_JS" "$prefix" "$ADDRESS" "$from" "$to" | tail -n 1)"
  [[ "$led" =~ ^([0-9]+)\ ([0-9]+)$ ]] || fail "ledger query gave no answer"
  [ "${BASH_REMATCH[1]}" -ge 1 ] || fail "no key with the keyPrefix of the transcript for our account in the time of the recording"
  [ "${BASH_REMATCH[2]}" -ge 1 ] || fail "no inference of our account in the time of the recording"
  echo "VIDEO VERIFY OK key_prefix_seen=yes inference_rows=${BASH_REMATCH[2]}"
}

# Every line on stdin to stdout, except a line that holds a key (cnwy_k_ and more than its prefix), a 0x address, a string
# of 64 hex characters, or one of the secrets the run noted in $1. Such a line is withheld, and the run then ends with a
# FAIL line. Exit 1 then.
guard() {
  local line leaked=0
  while IFS= read -r line || [ -n "$line" ]; do
    if grep -qE 'cnwy_k_[0-9A-Za-z]{9}|[0-9a-fA-F]{64}' <<<"$line" || grep -qiE '0x[0-9a-f]{40}' <<<"$line" ||
      { [ -s "$1" ] && grep -qiF -f "$1" <<<"$line"; }; then
      leaked=1
      echo "video-record: a line was withheld, it held a key, an address or a secret"
      continue
    fi
    echo "$line"
  done
  if [ "$leaked" = 1 ]; then
    echo "VIDEO $MODE FAIL the output held a key, an address or a secret"
    return 1
  fi
}

main() {
  local rc grc fn="$1"
  WORK="$(mktemp -d)" || {
    echo "VIDEO $MODE FAIL no temporary folder"
    return 1
  }
  chmod 700 "$WORK"
  : >"$WORK/secrets"
  trap 'rm -rf "$WORK"' EXIT
  trap 'rm -rf "$WORK"; exit 130' INT
  trap 'rm -rf "$WORK"; exit 143' TERM
  ("$fn") 2>&1 | guard "$WORK/secrets"
  local ps=("${PIPESTATUS[@]}")
  rc="${ps[0]}"
  grc="${ps[1]}"
  rm -rf "$WORK"
  trap - EXIT INT TERM
  [ "$rc" = 0 ] && [ "$grc" = 0 ]
}

# ---- selftest: the recording against stand-ins for the API, the RPC and the sandbox; the recorder itself runs here on a
# stand-in tape with a stand-in automaton. No network, no port.

selftest() {
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  local dir all_ok=1
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN
  mkdir -p "$dir/bin" "$dir/fake"
  printf '#!/usr/bin/env bash\necho "selftest must not reach the network ($(basename "$0"))" >&2\nexit 99\n' >"$dir/bin/curl"
  cp "$dir/bin/curl" "$dir/bin/ssh"
  chmod +x "$dir/bin/curl" "$dir/bin/ssh"

  # Made up here, never real: the account key, the wallet key, the address, the sandbox id, the key of scene 3.
  local fake_key fake_wallet_key fake_addr fake_id="k3v9q2m7x1" fake_api_key
  fake_key="cnwy_k_$(head -c 32 /dev/zero | tr '\0' 'e')"
  fake_api_key="cnwy_k_abcdef12$(head -c 24 /dev/zero | tr '\0' '9')"
  fake_wallet_key="0x$(head -c 64 /dev/zero | tr '\0' '5')"
  fake_addr="0x$(head -c 40 /dev/zero | tr '\0' '7')"
  printf 'LIVE_SANDBOX_KEY=%s\nLIVE_SANDBOX_WALLET_KEY=%s\nLIVE_SANDBOX_ADDRESS=%s\n' "$fake_key" "$fake_wallet_key" "$fake_addr" >"$dir/live-sandbox.env"

  # The stand-in automaton: reads conwayApiUrl from automaton.json like the shell of the real tape. CASE_CONWAY=ok lets
  # api.conway.tech answer, CASE_LEAK=1 prints 64 hex characters in the run.
  cat >"$dir/fake/automaton" <<FAKE
#!/usr/bin/env bash
url="\$(node -p 'require(process.env.HOME + "/.automaton/automaton.json").conwayApiUrl')"
case "\$1" in
  --provision)
    if [ "\$url" = https://api.conway.tech ] && [ "\${CASE_CONWAY:-}" != ok ]; then
      echo '{"timestamp":"2026-11-23T10:00:00.000Z","level":"error","module":"main","message":"Provision failed: SIWE verification failed: 500 {\\"error\\":\\"Database error\\"}"}'
      exit 1
    fi
    printf '{\n  "apiKey": "%s",\n  "walletAddress": "%s"\n}\n' "$fake_api_key" "$fake_addr" > "\$HOME/.automaton/config.json"
    echo '{"timestamp":"2026-11-23T10:00:01.000Z","level":"info","module":"main","message":"{\\"apiKey\\":\\"$fake_api_key\\",\\"walletAddress\\":\\"$fake_addr\\",\\"keyPrefix\\":\\"cnwy_k_abcdef12\\"}"}'
    ;;
  --run)
    echo "10:00:02 INFO  main         [2026-11-23T10:00:02.000Z] Conway Automaton v0.2.1 starting..."
    sleep 1.2
    [ "\${CASE_LEAK:-}" = 1 ] && echo "10:00:03 INFO  main         hash $(head -c 64 /dev/zero | tr '\0' 'a')"
    echo "10:00:03 INFO  main         [2026-11-23T10:00:03.000Z] Turn 01KAB3: 1 tools, 2048 tokens"
    echo "10:00:03 INFO  main         after the turn, not recorded"
    sleep 30
    ;;
esac
FAKE
  chmod +x "$dir/fake/automaton"
  # The stand-in tape: the run lines of the real one, setup lines that work without root.
  {
    echo "# stand-in tape of the selftest"
    echo "setup mkdir -p ~/.automaton && printf '{\\n  \"conwayApiUrl\": \"https://api.conway.tech\"\\n}\\n' > ~/.automaton/automaton.json"
    grep -E '^(caption|run|until) ' "$ROOT/docs/video/umzug.tape"
  } >"$dir/tape"

  # A planted database for --verify: a key with the prefix of the transcript for the address in the window, one of another
  # address, and two inference rows of the address in the window, one before it.
  # shellcheck disable=SC2016
  local plant='const [file, addr, keys, inf] = process.argv.slice(1); let db; try { db = require("better-sqlite3")(file); db.exec("SELECT 1"); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file); } db.exec("CREATE TABLE api_keys (id INTEGER PRIMARY KEY, address TEXT, key_prefix TEXT, created_at TEXT); CREATE TABLE ledger (id INTEGER PRIMARY KEY, address TEXT, kind TEXT, created_at TEXT)"); const now = new Date().toISOString(); if (keys === "1") db.prepare("INSERT INTO api_keys (address, key_prefix, created_at) VALUES (?, ?, ?)").run(addr, "cnwy_k_abcdef12", now); db.prepare("INSERT INTO api_keys (address, key_prefix, created_at) VALUES (?, ?, ?)").run("0x" + "1".repeat(40), "cnwy_k_abcdef12", now); for (let i = 0; i < Number(inf); i++) db.prepare("INSERT INTO ledger (address, kind, created_at) VALUES (?, ?, ?)").run(addr, "inference", now); db.prepare("INSERT INTO ledger (address, kind, created_at) VALUES (?, ?, ?)").run(addr, "inference", "2020-01-01T00:00:00.000Z");'

  # One run against the stand-ins. $1 = case name, $2 = mode function, then words NAME=value: CREATE (201|402), UPLOAD
  # (200|500), EXEC (200|402), USDC (hex of balanceOf), CONWAY (fail|ok), LEAK (0|1), KEYS (1|0), INF (n).
  run_case() {
    local name="$1" fn="$2"
    shift 2
    (
      local S="$dir/$name" CREATE=201 UPLOAD=200 EXEC=200 CONWAY=fail LEAK=0 KEYS=1 INF=2
      local USDC="0x$(printf "%064d" 0)" kv
      for kv in "$@"; do local "${kv%%=*}=${kv#*=}"; done
      mkdir -p "$S/fs" "$S/home"
      : >"$S/calls"
      export PATH="$dir/bin:$PATH"
      LIVE_SANDBOX_ENV="$dir/live-sandbox.env"
      TAPE="$dir/tape"
      TRANSCRIPT="$S/transcript.json"
      CP_HOST=fake.invalid
      CP_SSH_KEY="$dir/no-such-key"
      BASE="https://cp.example.invalid"
      [ "$fn" = run_verify ] && cp "$dir/good/transcript.json" "$TRANSCRIPT" 2>/dev/null
      (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$plant" "$S/cp.db" "$fake_addr" "$KEYS" "$INF") || echo "FAIL selftest: could not plant the ledger of $name"

      api() {
        local cmd="" p
        echo "$1 $2" >>"$S/calls"
        if [ -n "${4:-}" ] && [ "${4#@}" = "$4" ]; then cmd="$(node -e 'try { process.stdout.write(String(JSON.parse(process.argv[1]).command || "")) } catch (e) {}' "$4")"; fi
        case "$1 $2" in
          "GET /v1/models")
            printf '{"data":[{"id":"planted-mini","owned_by":"openrouter","upstream_model":"x/mini","pricing":{"input_per_million":0.1,"output_per_million":0.4}}]}' >"$3"
            echo 200
            ;;
          "POST /v1/sandboxes")
            printf '{"id":"%s","status":"running"}' "$fake_id" >"$3"
            echo "$CREATE"
            ;;
          "POST /v1/sandboxes/$fake_id/files/upload/json")
            if [ "$UPLOAD" != 200 ]; then printf '{"error":"upload failed"}' >"$3"; echo "$UPLOAD"; return; fi
            p="$(node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).path)' "${4#@}")"
            mkdir -p "$(dirname "$S/fs$p")"
            node -e 'const fs = require("fs"); fs.writeFileSync(process.argv[2], JSON.parse(fs.readFileSync(process.argv[1], "utf8")).content)' "${4#@}" "$S/fs$p"
            printf '{"ok":true}' >"$3"
            echo 200
            ;;
          "POST /v1/sandboxes/$fake_id/exec")
            if [ "$EXEC" != 200 ]; then printf '{"error":"INSUFFICIENT_CREDITS"}' >"$3"; echo "$EXEC"; return; fi
            case "$cmd" in
              *rec.js*)
                # The recorder runs here, on the stand-in tape, with the stand-in automaton on PATH.
                cp "$S/fs/root/.automaton/wallet.json" "$S/wallet.json" 2>/dev/null
                mkdir -p "$S/home/.automaton"
                HOME="$S/home" PATH="$dir/fake:$PATH" CASE_CONWAY="$CONWAY" CASE_LEAK="$LEAK" \
                  node "$S/fs$REC_DIR/rec.js" "$S/fs$REC_DIR/umzug.tape" "$S/fs$REC_DIR/out.json" >/dev/null 2>&1
                printf '{"stdout":"","stderr":"","exit_code":0}' >"$3"
                ;;
              *) printf '{"stdout":"","stderr":"unknown","exit_code":127}' >"$3" ;;
            esac
            echo 200
            ;;
          "GET /v1/sandboxes/$fake_id/files/read?path="*)
            p="$(node -e 'process.stdout.write(decodeURIComponent(process.argv[1]))' "${2#*path=}")"
            if [ -f "$S/fs$p" ]; then
              node -e 'const fs = require("fs"); process.stdout.write(JSON.stringify({ content: fs.readFileSync(process.argv[1], "utf8") }))' "$S/fs$p" >"$3"
              echo 200
            else
              printf '{"error":"not_found"}' >"$3"
              echo 404
            fi
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
      cp_node() {
        echo "LEDGER" >>"$S/calls"
        (cd "$ROOT" && NODE_NO_WARNINGS=1 node -e "$1" "$S/cp.db" "${@:2}" 2>/dev/null)
      }
      pause() { SECONDS=$((SECONDS + $1)); }
      if [ "$fn" = run_verify ]; then MODE=VERIFY; else MODE=RECORD; fi
      main "$fn"
    ) >"$dir/$name.out" 2>&1
  }

  # Checks one case: the last line against $2 (an extended regex), then words NAME=<n>: deletes, transcript (1 written,
  # 0 not), withheld. Every output is also searched for the made-up secrets.
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
        transcript) if [ -s "$dir/$name/transcript.json" ]; then got=1; else got=0; fi ;;
        withheld) got="$(grep -c 'a line was withheld' "$dir/$name.out")" ;;
      esac
      [ "$got" = "$v" ] || why="${why:+$why, }$k=$got, expected $v"
    done
    if grep -qiF -e "$fake_key" -e "$fake_id" -e "$fake_addr" -e "$fake_api_key" -e "${fake_wallet_key#0x}" "$dir/$name.out"; then
      why="${why:+$why, }the output holds a made-up secret"
    fi
    if [ -z "$why" ]; then
      echo "ok   $name: $last"
    else
      echo "FAIL $name: $why"
      all_ok=0
    fi
  }

  run_case good run_record
  expect good '^VIDEO RECORD OK steps=7 lines=[0-9]+ recorded_at=[0-9T:.Z-]+$' deletes=1 transcript=1 withheld=0
  # What the transcript holds: the steps of the tape, the key hidden in both forms, the prefix kept, the line after the
  # turn not recorded, the run stopped by until. What went into the sandbox: the wallet file with the key, the setup with
  # api.conway.tech, the address as creator and no key.
  # shellcheck disable=SC2016
  if (cd "$ROOT" && node -e 'const fs = require("fs"); const [f, w, s, key, wk, addr] = process.argv.slice(1); const raw = fs.readFileSync(f, "utf8"); const t = JSON.parse(raw); const all = t.steps.flatMap((x) => x.lines.map((l) => l.text)).join("\n"); const wallet = JSON.parse(fs.readFileSync(w, "utf8")); const setup = JSON.parse(fs.readFileSync(s, "utf8")); const run = t.steps[t.steps.length - 1]; const ok = t.runtime_rev === "d8f8168" && t.steps.length === 7 && !raw.includes(key) && (all.match(/<api key hidden>/g) || []).length === 2 && all.includes("cnwy_k_abcdef12") && !all.includes("not recorded") && /Turn 01KAB3/.test(run.lines[run.lines.length - 1].text) && run.exit_code === 143 && t.steps[1].exit_code === 1 && wallet.privateKey === wk && setup.conwayApiUrl === "https://api.conway.tech" && !("conwayApiKey" in setup) && setup.creatorAddress === addr && setup.inferenceModel === "planted-mini"; process.exit(ok ? 0 : 1);' \
    "$dir/good/transcript.json" "$dir/good/wallet.json" "$dir/good/fs/root/.rec/setup.json" "$fake_api_key" "$fake_wallet_key" "$fake_addr"); then
    echo "ok   good: steps of the tape, key hidden twice, prefix kept, stopped at the turn, wallet and setup as planned"
  else
    echo "FAIL good: the transcript or the uploads are not the ones expected"
    all_ok=0
  fi
  run_case conway run_record CONWAY=ok
  expect conway '^VIDEO RECORD FAIL conway answered$' deletes=1 transcript=0
  run_case leak run_record LEAK=1
  expect leak '^VIDEO RECORD FAIL secret$' deletes=1 transcript=0
  if grep -qF "$(head -c 64 /dev/zero | tr '\0' 'a')" "$dir/leak.out"; then echo "FAIL leak: the planted line reached the output"; all_ok=0; fi
  run_case credits-create run_record CREATE=402
  expect credits-create '^VIDEO RECORD FAIL credits$' deletes=0 transcript=0
  run_case credits-exec run_record EXEC=402
  expect credits-exec '^VIDEO RECORD FAIL credits$' deletes=1 transcript=0
  run_case upload-fails run_record UPLOAD=500
  expect upload-fails '^VIDEO RECORD FAIL upload \(wallet\) answered 500, expected 200$' deletes=1 transcript=0
  run_case wallet-usdc run_record "USDC=0x$(printf "%058d" 0)0f4240"
  expect wallet-usdc '^VIDEO RECORD FAIL the wallet holds USDC, a first start could buy credits$' deletes=0 transcript=0
  run_case verify run_verify
  expect verify '^VIDEO VERIFY OK key_prefix_seen=yes inference_rows=2$'
  run_case verify-no-key run_verify KEYS=0
  expect verify-no-key '^VIDEO VERIFY FAIL no key with the keyPrefix of the transcript for our account in the time of the recording$'
  run_case verify-no-inference run_verify INF=0
  expect verify-no-inference '^VIDEO VERIFY FAIL no inference of our account in the time of the recording$'

  # guard on its own, both directions: a key, an address, 64 hex characters and a noted secret are withheld, plain lines
  # and a key prefix pass.
  local g_case g_line g_want g_got
  MODE=RECORD
  printf '%s\n' "$fake_id" >"$dir/one-secret"
  for g_case in "plain|video-record: model planted-mini|0" "prefix|key prefix cnwy_k_abcdef12|0" "key|key $fake_key|1" \
    "address|wallet $fake_addr|1" "hex64|hash $(head -c 64 /dev/zero | tr '\0' 'b')|1" "noted|id $fake_id|1"; do
    IFS='|' read -r _ g_line g_want <<<"$g_case"
    g_got="$(printf '%s\nVIDEO RECORD OK planted\n' "$g_line" | guard "$dir/one-secret" | grep -c 'a line was withheld')"
    if [ "$g_got" = "$g_want" ]; then echo "ok   guard '${g_case%%|*}': withheld=$g_got"; else echo "FAIL guard '${g_case%%|*}': withheld=$g_got, expected $g_want"; all_ok=0; fi
  done
  g_got="$(printf 'key %s\n' "$fake_key" | guard "$dir/one-secret" | tail -n 1)"
  if [ "$g_got" = "VIDEO RECORD FAIL the output held a key, an address or a secret" ]; then echo "ok   guard ends with: $g_got"; else echo "FAIL guard ends with: $g_got"; all_ok=0; fi

  if [ "$all_ok" = 1 ]; then
    echo "VIDEO RECORD SELFTEST OK"
    return 0
  fi
  echo "VIDEO RECORD SELFTEST FAIL"
  return 1
}

usage() { echo "usage: bash ops/video-record.sh --record | --verify | --selftest" >&2; }

case "${1:-}" in
  --selftest) [ $# = 1 ] || { usage; exit 1; }; selftest ;;
  --record) [ $# = 1 ] || { usage; exit 1; }; MODE=RECORD; main run_record ;;
  --verify) [ $# = 1 ] || { usage; exit 1; }; MODE=VERIFY; main run_verify ;;
  -h | --help) awk 'NR == 1 { next } /^#/ { sub(/^# ?/, ""); print; next } { exit }' "$0" ;;
  *)
    usage
    exit 1
    ;;
esac
