#!/usr/bin/env bash
# The sandbox walk of the unmodified runtime at the pin d8f8168 against production, once (goals/sandbox/04).
#
#   bash ops/runtime-sandbox.sh              live: from the code-host, against https://postyourprice.com
#   bash ops/runtime-sandbox.sh --selftest   no network: proves the judgement against planted data, in both directions
#
# Live mode builds the runtime in ${RUNTIME_DIR:-$HOME/.cache/control-plane/automaton-d8f8168} (clone of
# Conway-Research/automaton, checkout of the pin, pnpm install --frozen-lockfile, pnpm build; no Docker on the
# code-host), and before the walk checks that `git rev-parse HEAD` starts with the pin, `git status --porcelain` is
# empty and dist/ and node_modules/ (both ignored by git) are the stamped install and build: after each build one line
# "<HEAD> <dist_sum> <deps_sum>" goes to $(git rev-parse --absolute-git-dir)/control-plane-dist.sha256. A missing or
# other stamp, or another checksum over dist/, ends with FAIL dist/ and makes the next live run rebuild dist/ (and
# reinstall node_modules/ from scratch unless the third field of the stamp covers it). A third
# field that is missing (old stamp) or is not the checksum over node_modules/ (files and symlinks, the packages the
# runtime loads) ends with FAIL node_modules/ and makes the next live run delete node_modules/ and dist/, then run
# pnpm install --frozen-lockfile and pnpm build again. Only then the runtime is unchanged. Then
# harness/e2e/sandbox-walk.mjs (the runtime's own client and tools) runs with
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

# The checksum over dist/ of the clone in $1: sha256sum of every regular file under dist/ with its path relative to $1,
# sorted by path with LC_ALL=C, and sha256sum over that list. A changed, an added and a removed file all change it.
dist_sum() {
  local dir="$1" list
  list="$(cd "$dir" && find dist -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum)" || return 1
  list="$(printf '%s\n' "$list" | sha256sum)"
  echo "${list%% *}"
}

# The checksum over node_modules/ of the clone in $1: every regular file with content and path relative to $1 like
# dist_sum, plus every symlink with path and target (pnpm links the packages into its virtual store node_modules/.pnpm/,
# so a link to another version changes no file), each list sorted with LC_ALL=C, and sha256sum over both.
deps_sum() {
  local dir="$1" files links list
  [ -d "$dir/node_modules" ] || { echo none; return 0; }
  files="$(cd "$dir" && find node_modules -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum)" || return 1
  links="$(cd "$dir" && find node_modules -type l -printf '%p -> %l\n' | LC_ALL=C sort)" || return 1
  list="$(printf '%s\n--- links\n%s\n' "$files" "$links" | sha256sum)"
  echo "${list%% *}"
}

# The stamp of the clone in $1: inside its git directory, so `git status --porcelain` stays empty and it moves with the clone.
dist_stamp_file() {
  local gitdir
  gitdir="$(git -C "$1" rev-parse --absolute-git-dir 2>/dev/null)" || return 1
  echo "$gitdir/control-plane-dist.sha256"
}

# Writes the one line "<git rev-parse HEAD> <dist_sum> <deps_sum>" for the clone in $1, after each build.
write_dist_stamp() {
  local dir="$1" head sum deps file
  head="$(git -C "$dir" rev-parse HEAD 2>/dev/null)" || return 1
  sum="$(dist_sum "$dir")" || return 1
  deps="$(deps_sum "$dir")" || return 1
  file="$(dist_stamp_file "$dir")" || return 1
  printf '%s %s %s\n' "$head" "$sum" "$deps" >"$file"
}

# Succeeds when the third field of the stamp of the clone in $1 is the checksum over its node_modules/.
stamped_deps() {
  local stamp line="" s_deps=""
  stamp="$(dist_stamp_file "$1")" || return 1
  [ -f "$stamp" ] && read -r line <"$stamp"
  read -r _ _ s_deps _ <<<"$line"
  [ -n "$s_deps" ] && [ "$s_deps" = "$(deps_sum "$1")" ]
}

# ok | missing | commit | changed | unbuilt | dist | deps, for the clone in $1 against the pin $2. dist: dist/ is not the
# stamped build at HEAD (no stamp, a stamp of another commit, or another checksum). deps: node_modules/ is not the stamped
# install (third field of the stamp missing, as in a stamp of the old format, or another checksum).
runtime_state() {
  local dir="$1" pin="$2" head porcelain stamp line="" s_head="" s_dist="" s_deps=""
  [ -d "$dir/.git" ] || { echo missing; return; }
  head="$(git -C "$dir" rev-parse HEAD 2>/dev/null)" || { echo missing; return; }
  [[ -n "$pin" && "$head" == "$pin"* ]] || { echo commit; return; }
  porcelain="$(git -C "$dir" status --porcelain 2>/dev/null)" || { echo changed; return; }
  [ -z "$porcelain" ] || { echo changed; return; }
  [ -f "$dir/dist/conway/client.js" ] && [ -f "$dir/dist/agent/tools.js" ] || { echo unbuilt; return; }
  stamp="$(dist_stamp_file "$dir")" || { echo dist; return; }
  [ -f "$stamp" ] && read -r line <"$stamp"
  read -r s_head s_dist s_deps _ <<<"$line"
  [ -n "$s_head" ] && [ "$s_head $s_dist" = "$head $(dist_sum "$dir")" ] || { echo dist; return; }
  [ -n "$s_deps" ] && [ "$s_deps" = "$(deps_sum "$dir")" ] || { echo deps; return; }
  echo ok
}

# The last line for the state $1 of the clone, the walk output in $2 and the ledger answer $3.
judge() {
  case "$1" in
    ok) ;;
    commit) echo "RUNTIME SANDBOX FAIL the runtime clone is not at the pin $PIN"; return 1 ;;
    changed) echo "RUNTIME SANDBOX FAIL the runtime clone has changes (git status --porcelain is not empty)"; return 1 ;;
    dist) echo "RUNTIME SANDBOX FAIL dist/ is not the build at the pin"; return 1 ;;
    deps) echo "RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin (pnpm install --frozen-lockfile)"; return 1 ;;
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
  # Build when dist/ is missing or is not the stamped build at the pin; a clone with changes is left as it is for judge.
  # When node_modules/ is not the stamped install (state deps, and for unbuilt or dist no stamp, an old stamp or another
  # checksum in its third field), install from scratch: pnpm does not see a changed file under node_modules/ and would
  # report everything up to date, and the new stamp would cover it.
  local state
  state="$(runtime_state "$RUNTIME_DIR" "$PIN")"
  case "$state" in
    unbuilt | dist | deps)
      [ -d "$RUNTIME_DIR/.git" ] && rm -rf "$RUNTIME_DIR/dist"
      stamped_deps "$RUNTIME_DIR" || { [ -d "$RUNTIME_DIR/.git" ] && rm -rf "$RUNTIME_DIR/node_modules"; }
      (cd "$RUNTIME_DIR" && pnpm install --frozen-lockfile >/dev/null 2>&1 && pnpm build >/dev/null 2>&1) || return 1
      write_dist_stamp "$RUNTIME_DIR" || return 1
      ;;
  esac
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
  # A planted clone: one commit, dist/ and node_modules/ ignored like at the pin, built files and packages present.
  # The packages like pnpm lays them out: files in the virtual store node_modules/.pnpm/, a symlink node_modules/viem to
  # one version, and a second version with the same content that only a relinked node_modules/viem would point to.
  plant_deps() {
    mkdir -p "$1/node_modules/.pnpm/viem@0.0.0" "$1/node_modules/.pnpm/viem@0.0.1"
    printf 'export const viem = "planted";\n' >"$1/node_modules/.pnpm/viem@0.0.0/index.js"
    printf 'export const viem = "planted";\n' >"$1/node_modules/.pnpm/viem@0.0.1/index.js"
    ln -sfn .pnpm/viem@0.0.0 "$1/node_modules/viem"
  }
  mkdir -p "$repo/dist/conway" "$repo/dist/agent"
  plant_deps "$repo"
  printf 'dist\nnode_modules\n' >"$repo/.gitignore"
  printf 'export const planted = true;\n' >"$repo/index.ts"
  : >"$repo/dist/conway/client.js"
  : >"$repo/dist/agent/tools.js"
  git -C "$repo" init -q
  git -C "$repo" -c user.name=selftest -c user.email=selftest@invalid add .gitignore index.ts
  git -C "$repo" -c user.name=selftest -c user.email=selftest@invalid commit -qm planted
  pin="$(git -C "$repo" rev-parse --short=7 HEAD)"
  # The stamp of the planted build, through the same code as after a live build.
  write_dist_stamp "$repo"

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
  # dist/ is ignored by git, so only the stamp tells the build at the pin from any other dist/.
  printf 'changed\n' >"$repo/dist/conway/client.js"
  check dist-changed "RUNTIME SANDBOX FAIL dist/ is not the build at the pin" "$(runtime_state "$repo" "$pin")" good "1 0"
  : >"$repo/dist/conway/client.js"
  printf 'x\n' >"$repo/dist/extra.js"
  check dist-added "RUNTIME SANDBOX FAIL dist/ is not the build at the pin" "$(runtime_state "$repo" "$pin")" good "1 0"
  rm -f "$repo/dist/extra.js"
  rm -f "$(dist_stamp_file "$repo")"
  check dist-unstamped "RUNTIME SANDBOX FAIL dist/ is not the build at the pin" "$(runtime_state "$repo" "$pin")" good "1 0"
  write_dist_stamp "$repo"
  printf '%s %s\n' 0000000000000000000000000000000000000000 "$(dist_sum "$repo")" >"$(dist_stamp_file "$repo")"
  check dist-other-commit "RUNTIME SANDBOX FAIL dist/ is not the build at the pin" "$(runtime_state "$repo" "$pin")" good "1 0"
  write_dist_stamp "$repo"
  # node_modules/ is ignored by git as well, and the runtime loads viem and ulid from it: only the third field of the stamp
  # tells the install at the pin from any other node_modules/.
  local deps_fail="RUNTIME SANDBOX FAIL node_modules/ is not the install at the pin"
  printf 'export const viem = "changed";\n' >"$repo/node_modules/.pnpm/viem@0.0.0/index.js"
  check deps-changed "$deps_fail" "$(runtime_state "$repo" "$pin")" good "1 0"
  plant_deps "$repo"
  printf 'x\n' >"$repo/node_modules/.pnpm/viem@0.0.0/extra.js"
  check deps-added "$deps_fail" "$(runtime_state "$repo" "$pin")" good "1 0"
  rm -f "$repo/node_modules/.pnpm/viem@0.0.0/extra.js"
  ln -sfn .pnpm/viem@0.0.1 "$repo/node_modules/viem"
  check deps-relinked "$deps_fail" "$(runtime_state "$repo" "$pin")" good "1 0"
  plant_deps "$repo"
  printf '%s %s\n' "$(git -C "$repo" rev-parse HEAD)" "$(dist_sum "$repo")" >"$(dist_stamp_file "$repo")"
  check deps-old-stamp "$deps_fail" "$(runtime_state "$repo" "$pin")" good "1 0"
  write_dist_stamp "$repo"

  # build_runtime against the planted clone, with a pnpm that counts its calls and writes the built files on build.
  local calls="$tmp/pnpm.calls" got
  build_case() {
    : >"$calls"
    (
      PIN="$pin"
      RUNTIME_DIR="$repo"
      pnpm() {
        echo "$*" >>"$calls"
        # Like pnpm: an install over an existing node_modules/ sees no changed file and leaves it as it is.
        [ "${1:-}" = install ] && [ ! -d node_modules ] && plant_deps .
        if [ "${1:-}" = build ]; then
          mkdir -p dist/conway dist/agent
          printf 'export const built = true;\n' >dist/conway/client.js
          printf 'export const built = true;\n' >dist/agent/tools.js
        fi
        return 0
      }
      build_runtime
    ) || echo "build_runtime failed" >>"$calls"
  }
  n=$((n + 1))
  printf 'changed\n' >"$repo/dist/conway/client.js"
  build_case
  got="builds=$(grep -c '^build$' "$calls") state=$(runtime_state "$repo" "$pin")"
  if [ "$got" = "builds=1 state=ok" ] && ! grep -q failed "$calls"; then echo "ok   rebuild-changed-dist: $got"; else echo "FAIL rebuild-changed-dist: expected 'builds=1 state=ok', got '$got'"; bad=$((bad + 1)); fi
  n=$((n + 1))
  build_case
  got="pnpm_calls=$(grep -c . "$calls") state=$(runtime_state "$repo" "$pin")"
  if [ "$got" = "pnpm_calls=0 state=ok" ]; then echo "ok   reuse-stamped-dist: $got"; else echo "FAIL reuse-stamped-dist: expected 'pnpm_calls=0 state=ok', got '$got'"; bad=$((bad + 1)); fi
  # A stale file the build does not overwrite must be gone after the rebuild, so the new stamp cannot cover it.
  n=$((n + 1))
  printf 'stale\n' >"$repo/dist/stale.js"
  build_case
  got="builds=$(grep -c '^build$' "$calls") stale=$([ -e "$repo/dist/stale.js" ] && echo kept || echo gone) state=$(runtime_state "$repo" "$pin")"
  if [ "$got" = "builds=1 stale=gone state=ok" ] && ! grep -q failed "$calls"; then echo "ok   rebuild-drops-stale: $got"; else echo "FAIL rebuild-drops-stale: expected 'builds=1 stale=gone state=ok', got '$got'"; bad=$((bad + 1)); fi

  # A changed file under node_modules/: pnpm alone would call the install up to date, so build_runtime installs from scratch.
  n=$((n + 1))
  printf 'export const viem = "changed";\n' >"$repo/node_modules/.pnpm/viem@0.0.0/index.js"
  build_case
  got="installs=$(grep -c '^install --frozen-lockfile$' "$calls") builds=$(grep -c '^build$' "$calls") planted=$(grep -q changed "$repo/node_modules/.pnpm/viem@0.0.0/index.js" && echo kept || echo gone) state=$(runtime_state "$repo" "$pin")"
  if [ "$got" = "installs=1 builds=1 planted=gone state=ok" ] && ! grep -q failed "$calls"; then echo "ok   rebuild-changed-deps: $got"; else echo "FAIL rebuild-changed-deps: expected 'installs=1 builds=1 planted=gone state=ok', got '$got'"; bad=$((bad + 1)); fi
  # No stamp (a fresh cache, a deleted stamp): the state is dist, and a rebuild of dist/ alone would write the changed
  # node_modules/ into the first stamp, so build_runtime installs from scratch unless the stamp covers node_modules/.
  n=$((n + 1))
  printf 'export const viem = "changed";\n' >"$repo/node_modules/.pnpm/viem@0.0.0/index.js"
  rm -f "$(dist_stamp_file "$repo")"
  build_case
  got="installs=$(grep -c '^install --frozen-lockfile$' "$calls") builds=$(grep -c '^build$' "$calls") planted=$(grep -q changed "$repo/node_modules/.pnpm/viem@0.0.0/index.js" && echo kept || echo gone) state=$(runtime_state "$repo" "$pin")"
  if [ "$got" = "installs=1 builds=1 planted=gone state=ok" ] && ! grep -q failed "$calls"; then echo "ok   rebuild-unstamped-deps: $got"; else echo "FAIL rebuild-unstamped-deps: expected 'installs=1 builds=1 planted=gone state=ok', got '$got'"; bad=$((bad + 1)); fi

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
