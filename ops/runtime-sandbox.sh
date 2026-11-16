#!/usr/bin/env bash
# The sandbox walk of the unmodified runtime at the pin d8f8168 against production, once (goals/sandbox/04).
#
#   bash ops/runtime-sandbox.sh              live: from the code-host, against https://postyourprice.com
#   bash ops/runtime-sandbox.sh --selftest   no network: proves the judgement against planted data, in both directions
#
# Live mode builds the runtime in ${RUNTIME_DIR:-$HOME/.cache/control-plane/automaton-d8f8168} (clone of
# Conway-Research/automaton, checkout of the pin, pnpm install --frozen-lockfile, pnpm build; no Docker on the
# code-host), and before the walk checks that `git rev-parse HEAD` starts with the pin and `git status --porcelain` is
# empty: the runtime is unchanged. Then harness/e2e/sandbox-walk.mjs (the runtime's own client and tools) runs with
# LIVE_SANDBOX_KEY from ~/.config/control-plane/live-sandbox.env, the own account of the live check, paid from the
# credits it has. Then the ledger of production over CP_SSH_KEY from ~/.config/control-plane/loop.env, opened with
# `readonly: true` inside the container, like ops/live.sh: only two numbers leave it, the rows of kind sandbox for this
# sandbox and its reservation. Exactly one row is right (create and delete at once is one started step).
#
# No topup: the walk has no wallet and never calls the runtime's topup. A 402 on create ends with FAIL credits instead
# (loop-constraints.md, rule 10). Production changes only through its public API: one small sandbox, created, used,
# deleted. The script never prints the API key, an address or the sandbox id.
#
# Last line: RUNTIME SANDBOX OK ... ledger_rows=1 ... | RUNTIME SANDBOX FAIL <reason> | RUNTIME SANDBOX SELFTEST OK.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PIN=d8f8168
RUNTIME_REPO="https://github.com/Conway-Research/automaton.git"
RUNTIME_DIR="${RUNTIME_DIR:-$HOME/.cache/control-plane/automaton-$PIN}"
BASE="https://postyourprice.com"
WALK="$ROOT/harness/e2e/sandbox-walk.mjs"
LIVE_SANDBOX_ENV="$HOME/.config/control-plane/live-sandbox.env"
LOOP_ENV="$HOME/.config/control-plane/loop.env"
# Node 22 first: the runtime and better-sqlite3 of this repo are built for it.
export PATH="/usr/bin:$PATH"

# Rows of kind sandbox for one sandbox id and its reservation, the same text in production and in the selftest. An id
# that is not lowercase alphanumeric is refused, so no LIKE wildcard comes in with it.
# shellcheck disable=SC2016
LEDGER_JS='const [file, id] = process.argv.slice(1); if (!/^[a-z0-9]{1,40}$/.test(id || "")) process.exit(2); let db; try { db = require("better-sqlite3")(file, { readonly: true }); } catch (e) { const { DatabaseSync } = require("node:sqlite"); db = new DatabaseSync(file, { readOnly: true }); } const n = db.prepare("SELECT count(*) AS n FROM ledger WHERE kind = ? AND ref LIKE ?").get("sandbox", "sandbox:" + id + ":%").n; const s = db.prepare("SELECT hold_mc FROM sandboxes WHERE id = ?").get(id); console.log(n + " " + (s ? s.hold_mc : -1));'

# The judgement, $1 = walk file, $2 = output of the walk, $3 = ledger answer "<rows> <hold_mc>" or empty.
# shellcheck disable=SC2016
JUDGE_JS='const fs = await import("node:fs"); const url = await import("node:url");
const [walk, outFile, ledger] = process.argv.slice(1);
const { judgeSandboxWalk, parseSandboxResult } = await import(url.pathToFileURL(walk).href);
const r = parseSandboxResult(fs.readFileSync(outFile, "utf8"));
if (!r) { console.log("RUNTIME SANDBOX FAIL the walk gave no SANDBOX_RESULT"); process.exit(1); }
const m = /^([0-9]+) (-?[0-9]+)$/.exec(String(ledger || "").trim());
let hold = null;
if (r.id) { r.ledger_rows = m ? Number(m[1]) : null; hold = m ? Number(m[2]) : null; }
const v = judgeSandboxWalk(r);
if (r.id && m && hold !== 0) v.reasons.push(`ledger: hold_mc ${hold}, expected 0 after delete`);
if (r.id && !m) v.reasons.push("ledger: the query gave no answer");
const steps = (r.steps || []).map((s) => `${s.step}=${s.status}`).join(" ");
if (v.reasons.length === 0) { console.log(`RUNTIME SANDBOX OK pin=__PIN__ ${steps} ledger_rows=${r.ledger_rows} hold_mc=${hold}`); process.exit(0); }
if (v.reasons[0].startsWith("credits")) { console.log("RUNTIME SANDBOX FAIL credits: create answered 402, no topup was started"); process.exit(1); }
console.log(`RUNTIME SANDBOX FAIL ${v.reasons.join("; ")}`); process.exit(1);'

# ok | missing | commit | changed | unbuilt, for the clone in $1 against the pin $2.
runtime_state() {
  local dir="$1" pin="$2" head porcelain
  [ -d "$dir/.git" ] || { echo missing; return; }
  head="$(git -C "$dir" rev-parse HEAD 2>/dev/null)" || { echo missing; return; }
  [[ -n "$pin" && "$head" == "$pin"* ]] || { echo commit; return; }
  porcelain="$(git -C "$dir" status --porcelain 2>/dev/null)" || { echo changed; return; }
  [ -z "$porcelain" ] || { echo changed; return; }
  [ -f "$dir/dist/conway/client.js" ] && [ -f "$dir/dist/agent/tools.js" ] || { echo unbuilt; return; }
  echo ok
}

# The last line for the state $1 of the clone, the walk output in $2 and the ledger answer $3.
judge() {
  case "$1" in
    ok) ;;
    commit) echo "RUNTIME SANDBOX FAIL the runtime clone is not at the pin $PIN"; return 1 ;;
    changed) echo "RUNTIME SANDBOX FAIL the runtime clone has changes (git status --porcelain is not empty)"; return 1 ;;
    *) echo "RUNTIME SANDBOX FAIL the runtime clone is $1"; return 1 ;;
  esac
  node --input-type=module -e "${JUDGE_JS//__PIN__/$PIN}" "$WALK" "$2" "${3:-}"
}

build_runtime() {
  if [ ! -d "$RUNTIME_DIR/.git" ]; then
    mkdir -p "$(dirname "$RUNTIME_DIR")"
    git clone -q "$RUNTIME_REPO" "$RUNTIME_DIR" || return 1
  fi
  git -C "$RUNTIME_DIR" checkout -q "$PIN" || return 1
  if [ ! -f "$RUNTIME_DIR/dist/conway/client.js" ] || [ ! -f "$RUNTIME_DIR/dist/agent/tools.js" ]; then
    (cd "$RUNTIME_DIR" && pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm build >/dev/null 2>&1) || return 1
  fi
}

rand_hex() { od -An -tx1 -N4 /dev/urandom | tr -d ' \n'; }

live() {
  local state apikey="" out id ledger="" remote rc
  build_runtime || { echo "RUNTIME SANDBOX FAIL the runtime at $PIN could not be cloned or built"; return 1; }
  state="$(runtime_state "$RUNTIME_DIR" "$PIN")"
  [ "$state" = ok ] || { judge "$state" /dev/null ""; return 1; }
  echo "runtime: $(git -C "$RUNTIME_DIR" rev-parse --short=7 HEAD), git status --porcelain empty"

  [ -r "$LIVE_SANDBOX_ENV" ] && apikey="$(sed -n 's/^LIVE_SANDBOX_KEY=//p' "$LIVE_SANDBOX_ENV" | head -n 1 | tr -d "\"'\r")"
  [ -n "$apikey" ] || { echo "RUNTIME SANDBOX FAIL no LIVE_SANDBOX_KEY in $LIVE_SANDBOX_ENV"; return 1; }
  [ -r "$LOOP_ENV" ] || { echo "RUNTIME SANDBOX FAIL $LOOP_ENV is missing"; return 1; }
  set -a
  # shellcheck disable=SC1090
  . "$LOOP_ENV"
  set +a

  out="$(mktemp)"
  SANDBOX_WALK_URL="$BASE" SANDBOX_WALK_KEY="$apikey" SANDBOX_WALK_NAME="rt-walk-$(rand_hex)" RUNTIME_DIST="$RUNTIME_DIR/dist" \
    node "$WALK" >"$out" 2>&1 </dev/null
  apikey=""
  # shellcheck disable=SC2016
  id="$(node --input-type=module -e 'const { parseSandboxResult } = await import((await import("node:url")).pathToFileURL(process.argv[1]).href); const r = parseSandboxResult((await import("node:fs")).readFileSync(process.argv[2], "utf8")); if (r && typeof r.id === "string") process.stdout.write(r.id);' "$WALK" "$out" 2>/dev/null)"
  if [[ "$id" =~ ^[a-z0-9]{1,40}$ ]]; then
    remote="docker exec deploy-cp-1 node -e $(printf %q "$LEDGER_JS") /data/cp.db $(printf %q "$id")"
    ledger="$(ssh -i "$CP_SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "$remote" 2>/dev/null | tail -n 1)"
    [[ "$ledger" =~ ^[0-9]+\ -?[0-9]+$ ]] || ledger=""
  fi
  id=""
  judge ok "$out" "$ledger"
  rc=$?
  rm -f "$out"
  return "$rc"
}

# ---- selftest: planted SANDBOX_RESULT lines, planted ledger answers, planted runtime clones; no network

# One planted walk output for the case $1: the real walk of the runtime (test/sandbox-walk.test.ts) with one change.
# shellcheck disable=SC2016
PLANT_JS='const which = process.argv[1];
const r = { name: "walk-selftest", id: "abcde12345", content: "sandbox-walk-0123456789ab", steps: [
  { step: "create_sandbox", tool: "create_sandbox", status: 201, http: [201], text: "Sandbox created: {id} (1 vCPU, 512MB RAM)", error: false },
  { step: "exec", tool: "exec", status: 200, http: [200], text: "exit_code: 0\nstdout: ok\n\nstderr: ", error: false },
  { step: "write_file", tool: "write_file", status: 200, http: [200], text: "File written: /root/sandbox-walk.txt", error: false },
  { step: "read_file", tool: "read_file", status: 200, http: [200], text: "sandbox-walk-0123456789ab", error: false },
  { step: "expose_port", tool: "expose_port", status: 200, http: [200], text: "Port 8080 exposed at: https://sbx-{id}-8080.sbx.example", error: false },
  { step: "remove_port", tool: "remove_port", status: 200, http: [200], text: "Port 8080 removed", error: false },
  { step: "list_sandboxes", tool: "list_sandboxes", status: 200, http: [200], text: "{id} [running] 1vCPU/512MB ", error: false, listed: true },
  { step: "delete", tool: null, status: 200, http: [], text: "" },
  { step: "list_after_delete", tool: "list_sandboxes", status: 200, http: [200], text: "No sandboxes found.", error: false, listed: false } ] };
const s = (n) => r.steps.find((x) => x.step === n);
if (which === "exec_wrong") s("exec").text = "exit_code: 0\nstdout: \n\nstderr: ";
if (which === "expose_409") Object.assign(s("expose_port"), { status: 409, http: [409], text: "Conway API error: POST /v1/sandboxes/{id}/ports/expose -> 409: {}", error: true });
if (which === "expose_payment") s("expose_port").text = "Port 8080 exposed at: https://sbx-{id}-8080.postyourprice.com";
if (which === "remove_missing") r.steps = r.steps.filter((x) => x.step !== "remove_port");
if (which === "retried_503") s("list_sandboxes").http = [503, 200];
if (which === "still_listed") s("list_after_delete").listed = true;
if (which === "create_402") { r.id = null; r.steps = [{ step: "create_sandbox", tool: "create_sandbox", status: 402, http: [402], text: "Conway API error: POST /v1/sandboxes -> 402: {}", error: true }]; }
if (which === "none") { console.log("no result line"); process.exit(0); }
console.log("SANDBOX_RESULT " + JSON.stringify(r));'

selftest() {
  # The selftest must never reach the network or build anything.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }
  pnpm() { echo "selftest must not build (pnpm)" >&2; return 99; }
  local tmp repo pin bad=0 n=0
  tmp="$(mktemp -d)"
  repo="$tmp/runtime"
  # A planted clone: one commit, dist/ ignored like at the pin, built files present.
  mkdir -p "$repo/dist/conway" "$repo/dist/agent"
  printf 'dist\n' >"$repo/.gitignore"
  printf 'export const planted = true;\n' >"$repo/index.ts"
  : >"$repo/dist/conway/client.js"
  : >"$repo/dist/agent/tools.js"
  git -C "$repo" init -q
  git -C "$repo" -c user.name=selftest -c user.email=selftest@invalid add .gitignore index.ts
  git -C "$repo" -c user.name=selftest -c user.email=selftest@invalid commit -qm planted
  pin="$(git -C "$repo" rev-parse --short=7 HEAD)"

  # case: <name> <expected prefix> <runtime state> <walk variant> <ledger answer>
  check() {
    local name="$1" want="$2" state="$3" variant="$4" ledger="$5" out line
    n=$((n + 1))
    out="$tmp/$name.out"
    node -e "$PLANT_JS" "$variant" >"$out"
    line="$(judge "$state" "$out" "$ledger" | tail -n 1)"
    if [[ "$line" == "$want"* ]]; then
      echo "ok   $name: $line"
    else
      echo "FAIL $name: expected '$want...', got '$line'"
      bad=$((bad + 1))
    fi
  }

  # The planted ledger itself, through the same query text as in production: one row, reservation 0.
  local db="$tmp/cp.db" ledger_good
  (cd "$ROOT" && node -e 'const db = require("better-sqlite3")(process.argv[1]); db.exec("CREATE TABLE ledger (kind TEXT, ref TEXT); CREATE TABLE sandboxes (id TEXT, hold_mc INTEGER);"); db.prepare("INSERT INTO ledger VALUES (?, ?)").run("sandbox", "sandbox:abcde12345:0"); db.prepare("INSERT INTO ledger VALUES (?, ?)").run("sandbox", "sandbox:other00000:0"); db.prepare("INSERT INTO ledger VALUES (?, ?)").run("topup", "sandbox:abcde12345:x"); db.prepare("INSERT INTO sandboxes VALUES (?, ?)").run("abcde12345", 0); db.close();' "$db" 2>/dev/null)
  ledger_good="$(cd "$ROOT" && node -e "$LEDGER_JS" "$db" abcde12345 2>/dev/null)"
  n=$((n + 1))
  if [ "$ledger_good" = "1 0" ]; then echo "ok   ledger-query: $ledger_good"; else echo "FAIL ledger-query: expected '1 0', got '$ledger_good'"; bad=$((bad + 1)); fi
  n=$((n + 1))
  if (cd "$ROOT" && node -e "$LEDGER_JS" "$db" "abc%" >/dev/null 2>&1); then echo "FAIL ledger-wildcard: an id with % was taken"; bad=$((bad + 1)); else echo "ok   ledger-wildcard: refused"; fi

  check good "RUNTIME SANDBOX OK" "$(runtime_state "$repo" "$pin")" good "$ledger_good"
  check exec-wrong "RUNTIME SANDBOX FAIL exec" ok exec_wrong "1 0"
  check expose-409 "RUNTIME SANDBOX FAIL expose_port: status 409" ok expose_409 "1 0"
  check expose-payment-domain "RUNTIME SANDBOX FAIL expose_port" ok expose_payment "1 0"
  check remove-missing "RUNTIME SANDBOX FAIL remove_port" ok remove_missing "1 0"
  check retried-503 "RUNTIME SANDBOX FAIL list_sandboxes: the runtime got 503" ok retried_503 "1 0"
  check still-listed "RUNTIME SANDBOX FAIL list_after_delete" ok still_listed "1 0"
  check ledger-0 "RUNTIME SANDBOX FAIL ledger: 0 rows" ok good "0 0"
  check ledger-2 "RUNTIME SANDBOX FAIL ledger: 2 rows" ok good "2 0"
  check ledger-none "RUNTIME SANDBOX FAIL ledger" ok good ""
  check hold-left "RUNTIME SANDBOX FAIL ledger: hold_mc 1000" ok good "1 1000"
  check create-402 "RUNTIME SANDBOX FAIL credits: create answered 402, no topup was started" ok create_402 ""
  check no-result "RUNTIME SANDBOX FAIL the walk gave no SANDBOX_RESULT" ok none "1 0"
  check other-commit "RUNTIME SANDBOX FAIL the runtime clone is not at the pin" "$(runtime_state "$repo" "$PIN")" good "1 0"
  printf 'changed\n' >>"$repo/index.ts"
  check changed-file "RUNTIME SANDBOX FAIL the runtime clone has changes" "$(runtime_state "$repo" "$pin")" good "1 0"
  git -C "$repo" checkout -q -- index.ts
  printf 'x\n' >"$repo/extra.ts"
  check untracked-file "RUNTIME SANDBOX FAIL the runtime clone has changes" "$(runtime_state "$repo" "$pin")" good "1 0"
  rm -f "$repo/extra.ts"
  rm -f "$repo/dist/agent/tools.js"
  check unbuilt "RUNTIME SANDBOX FAIL the runtime clone is unbuilt" "$(runtime_state "$repo" "$pin")" good "1 0"
  check missing "RUNTIME SANDBOX FAIL the runtime clone is missing" "$(runtime_state "$tmp/nothing" "$pin")" good "1 0"

  rm -rf "$tmp"
  if [ "$bad" -eq 0 ]; then
    echo "$n cases as expected"
    echo "RUNTIME SANDBOX SELFTEST OK"
    return 0
  fi
  echo "RUNTIME SANDBOX SELFTEST FAIL ($bad of $n cases)"
  return 1
}

case "${1:-}" in
  --selftest) SANDBOX_WALK_DOMAIN=sbx.example selftest ;;
  # Against production the public URL of an exposed port lies under the domain of the sandbox host (sandboxd.service).
  "") SANDBOX_WALK_DOMAIN="${SANDBOX_WALK_DOMAIN:-$(sed -n 's/^Environment=SANDBOXD_DOMAIN=//p' "$ROOT/ops/sandbox/sandboxd.service")}" live ;;
  *) echo "usage: bash ops/runtime-sandbox.sh [--selftest]"; exit 2 ;;
esac
