#!/usr/bin/env bash
# Purchase of aborted inference calls against the provider's own accounting (abrechnung 04). Reads only.
#
#   ops/abort-purchase.sh                       production: the provider's activity (GET, management key) against the
#                                               ledger and inference_aborts of the service, per completed UTC day and model
#   ops/abort-purchase.sh --files ACTIVITY ROWS the same from files: ACTIVITY is the JSON answer of the activity endpoint,
#                                               ROWS our rows as JSON Lines; either may be `-` for stdin
#   ops/abort-purchase.sh --selftest            no network: planted files, an estimate where aborts without an answer
#                                               were planted, noise where none was, nothing for the running day
#
# An abort without an answer (inference_aborts.answered = 0) carries purchase_mc = 0: we ask without a
# stream, so we never learn its generation ID or its price, yet the provider may still bill it. What
# is left is the activity of the account per day and model: provider mc is the sum of `usage` (USD)
# over every endpoint of the model that day, times 100000, rounded. Purchase mc is what we booked for
# the same day and model: `meta.purchase_mc` of the ledger rows of kind `inference` plus `purchase_mc`
# of inference_aborts (an abort that got its answer late carries its real purchase there), only rows of
# provider `openrouter`, the day taken from `created_at`. Gap = provider mc minus purchase mc. On a day
# with aborts without an answer, the gap minus the baseline of the model, divided by their number, is the
# estimate per abort. The baseline is the median of the gaps of the same model on the days of the period
# without an abort without an answer and without noise (0 without such a day): the drift the model shows
# without any abort (rounding, bookings over midnight), which no abort bought.
#
# The activity covers the whole account, not just the key of the service. A day and model without any
# abort without an answer is therefore a counter-check on real data: its gap must stay within the
# tolerance (AP_TOLERANCE_MC, default 1000 mc). If it does not, something else bought the same model
# that day (or a booking of ours is missing), and the tool prints `noise` and no estimate for that
# model. Models the service never bought are left out of the table and summed in one line.
#
# Only completed UTC days count, from AP_SINCE (default 2026-11-10, the rollout of inference_aborts) to
# the day before AP_NOW (default now), and only within the last 30 completed days, which is all the
# activity covers. A completed day with a purchase of ours and no line at the provider counts with
# provider 0.
#
# Output: a markdown table `| day | model | provider mc | purchase mc | gap mc | no answer | per abort mc |`,
# one line per day and model; then one line `noise <day> <model>: <gap mc>` per day and model without
# an abort without an answer whose gap exceeds the tolerance; then one line `baseline <model>: <mc>` per
# model (the gap column stays raw, the estimate uses gap minus baseline); then one line per model
# `purchase without sale <model>: <mc>`: the purchase of the aborts that got their answer late plus the
# estimated purchase of those without (no estimate for a model with noise, the line says so).
#
# The provider is asked once, with GET on the activity endpoint and the management key
# OPENROUTER_MANAGEMENT_KEY (from the environment or ~/.config/control-plane/loop.env). Without the
# key the tool stops with exit 2 before it asks anyone. The key goes to curl on stdin, never on the
# command line, and is never printed. The database is opened with `readonly: true` inside the
# container; no address, wallet or balance leaves it, only day, model, provider, purchase and answered.
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ACTIVITY_URL="https://openrouter.ai/api/v1/activity"

# Our rows, one JSON object per line, without address: when written, the model bought, the provider,
# the purchase and, for aborts, whether the answer arrived after the client had gone.
# shellcheck disable=SC2016
ROWS_JS='const file = process.argv[1] || "/data/cp.db"; const db = require("better-sqlite3")(file, { readonly: true }); const out = []; for (const r of db.prepare("SELECT created_at AS at, json_extract(meta, ?) AS model, json_extract(meta, ?) AS provider, json_extract(meta, ?) AS purchase_mc FROM ledger WHERE kind = ?").iterate("$.model", "$.provider", "$.purchase_mc", "inference")) out.push(JSON.stringify({ src: "ledger", ...r })); const t = db.prepare("SELECT name FROM sqlite_master WHERE type = ? AND name = ?").get("table", "inference_aborts"); if (t) for (const r of db.prepare("SELECT created_at AS at, model, provider, purchase_mc, answered FROM inference_aborts").iterate()) out.push(JSON.stringify({ src: "abort", ...r })); if (out.length) console.log(out.join("\n"));'

# The counting, the same code for production and selftest.
# shellcheck disable=SC2016
CALC_JS='
const fs = require("fs");
const [activityFile, rowsFile, nowArg, sinceArg, tolArg] = process.argv.slice(1);
const read = (f) => (f === "-" ? fs.readFileSync(0, "utf8") : fs.readFileSync(f, "utf8"));
const MC_PER_USD = 100000;
const tolerance = Number(tolArg);
if (!Number.isInteger(tolerance) || tolerance < 0) { console.error("AP_TOLERANCE_MC must be a non-negative integer"); process.exit(2); }
const now = nowArg ? new Date(nowArg) : new Date();
if (Number.isNaN(now.getTime())) { console.error("AP_NOW is not a date"); process.exit(2); }
const today = now.toISOString().slice(0, 10);
const oldest = new Date(Date.parse(today + "T00:00:00Z") - 30 * 86400000).toISOString().slice(0, 10);
const since = sinceArg > oldest ? sinceArg : oldest;
const counts = (day) => /^\d{4}-\d{2}-\d{2}$/.test(day) && day >= since && day < today;

let activity;
try { activity = JSON.parse(read(activityFile)); } catch { console.error("activity is not JSON"); process.exit(2); }
const lines = Array.isArray(activity) ? activity : activity && Array.isArray(activity.data) ? activity.data : null;
if (!lines) { console.error("activity has no data array"); process.exit(2); }

const rows = read(rowsFile).split("\n").filter((l) => l.trim()).flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });

const key = (day, model) => day + "\u0000" + model;
const cells = new Map();
const cell = (day, model) => {
  const k = key(day, model);
  if (!cells.has(k)) cells.set(k, { day, model, usd: 0, purchase: 0, noAnswer: 0, answeredMc: 0 });
  return cells.get(k);
};

// Ours first: the models the service bought decide which lines of the account belong to it.
const ours = new Set();
for (const r of rows) {
  if (r.provider !== "openrouter" || typeof r.model !== "string" || typeof r.at !== "string") continue;
  const day = r.at.slice(0, 10);
  if (!counts(day)) continue;
  const mc = Number.isInteger(r.purchase_mc) ? r.purchase_mc : 0;
  const c = cell(day, r.model);
  ours.add(r.model);
  c.purchase += mc;
  if (r.src === "abort") {
    if (Number(r.answered) === 1) c.answeredMc += mc;
    else c.noAnswer += 1;
  }
}

let otherUsd = 0;
const otherModels = new Set();
for (const a of lines) {
  if (!a || typeof a.model !== "string") continue;
  const day = String(a.date ?? "").slice(0, 10);
  if (!counts(day)) continue;
  const usd = Number(a.usage);
  if (!Number.isFinite(usd)) continue;
  if (!ours.has(a.model)) { otherUsd += usd; otherModels.add(a.model); continue; }
  cell(day, a.model).usd += usd;
}

const sorted = [...cells.values()].sort((x, y) => (x.day < y.day ? -1 : x.day > y.day ? 1 : x.model < y.model ? -1 : x.model > y.model ? 1 : 0));
const days = [...new Set(sorted.map((c) => c.day))];
console.log(`period ${days[0] ?? since} to ${days.at(-1) ?? since} (completed UTC days from ${since}, before ${today}), tolerance ${tolerance} mc`);
console.log("| day | model | provider mc | purchase mc | gap mc | no answer | per abort mc |");
console.log("|---|---|---|---|---|---|---|");
const perModel = new Map();
const noise = [];
// First pass: the gap of every day and model, noise, and the gaps of the quiet days (no abort without an
// answer, no noise) from which each model gets its baseline.
for (const c of sorted) {
  c.providerMc = Math.round(c.usd * MC_PER_USD);
  c.gap = c.providerMc - c.purchase;
  const m = perModel.get(c.model) ?? { answeredMc: 0, estimateMc: 0, noAnswer: 0, noise: 0, quietGaps: [] };
  m.answeredMc += c.answeredMc;
  m.noAnswer += c.noAnswer;
  if (c.noAnswer === 0 && Math.abs(c.gap) > tolerance) { m.noise += 1; noise.push(`noise ${c.day} ${c.model}: ${c.gap}`); }
  else if (c.noAnswer === 0) m.quietGaps.push(c.gap);
  perModel.set(c.model, m);
}
// Baseline: the median of the quiet gaps of a model, 0 without a quiet day. It is the drift the model shows
// without any abort, so it is not bought by an abort and comes off before the gap is spread over them.
const median = (xs) => {
  if (!xs.length) return 0;
  const v = [...xs].sort((a, b) => a - b), h = Math.floor(v.length / 2);
  return v.length % 2 ? v[h] : Math.round((v[h - 1] + v[h]) / 2);
};
for (const m of perModel.values()) m.baseline = median(m.quietGaps);
// Second pass: the table; the gap column stays raw, the estimate uses gap minus baseline.
for (const c of sorted) {
  const m = perModel.get(c.model);
  const net = Math.max(0, c.gap - m.baseline);
  const per = c.noAnswer > 0 ? Math.round(net / c.noAnswer) : null;
  console.log(`| ${c.day} | ${c.model} | ${c.providerMc} | ${c.purchase} | ${c.gap} | ${c.noAnswer} | ${per === null ? "-" : per} |`);
  if (per !== null) m.estimateMc += net;
}
for (const n of noise) console.log(n);
if (!noise.length) console.log("noise: none");
for (const [model, m] of [...perModel.entries()].sort()) console.log(`baseline ${model}: ${m.baseline}`);
for (const [model, m] of [...perModel.entries()].sort()) {
  if (m.noise > 0) console.log(`purchase without sale ${model}: ${m.answeredMc} (no estimate for ${m.noAnswer} aborts without answer: noise on ${m.noise} days)`);
  else console.log(`purchase without sale ${model}: ${m.answeredMc + m.estimateMc} (answered late ${m.answeredMc}, estimated ${m.estimateMc} for ${m.noAnswer} aborts without answer)`);
}
console.log(`other models at the provider: ${otherModels.size} (${Math.round(otherUsd * MC_PER_USD)} mc)`);
'

calc() { NODE_NO_WARNINGS=1 node -e "$CALC_JS" "$1" "$2" "${AP_NOW:-}" "${AP_SINCE:-2026-11-10}" "${AP_TOLERANCE_MC:-1000}"; }

load_env() {
  if [ -f "$HOME/.config/control-plane/loop.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$HOME/.config/control-plane/loop.env"
    set +a
  fi
  # The key comes first: without it nobody is asked, not even the server.
  if [ -z "${OPENROUTER_MANAGEMENT_KEY:-}" ]; then
    echo "OPENROUTER_MANAGEMENT_KEY missing (~/.config/control-plane/loop.env)" >&2
    exit 2
  fi
  KEY="${CP_SSH_KEY:-${CP_DEPLOY_KEY:-}}"
  if [ -z "${CP_HOST:-}" ] || [ -z "$KEY" ]; then
    echo "ABORT PURCHASE FAIL: CP_HOST and CP_SSH_KEY are not set (~/.config/control-plane/loop.env)" >&2
    exit 2
  fi
}

fetch_activity() { # $1 = target file; the key goes to curl on stdin, never on the command line
  printf 'Authorization: Bearer %s\n' "$OPENROUTER_MANAGEMENT_KEY" |
    curl -sS --fail -m 30 -H @- "$ACTIVITY_URL" -o "$1"
}

fetch_rows() { # $1 = target file
  ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=10 "$CP_HOST" "docker exec deploy-cp-1 node -e $(printf %q "$ROWS_JS") /data/cp.db" >"$1" 2>/dev/null
}

production() {
  load_env
  AP_DIR="$(mktemp -d)"
  trap 'rm -rf "$AP_DIR"' EXIT
  fetch_activity "$AP_DIR/activity.json" 2>/dev/null || {
    echo "ABORT PURCHASE FAIL: activity not readable" >&2
    exit 2
  }
  fetch_rows "$AP_DIR/rows.jsonl" || {
    echo "ABORT PURCHASE FAIL: ledger not readable" >&2
    exit 2
  }
  calc "$AP_DIR/activity.json" "$AP_DIR/rows.jsonl"
}

selftest() {
  # No network in here, by construction: any attempt is an error.
  curl() { echo "selftest must not reach the network (curl)" >&2; return 99; }
  ssh() { echo "selftest must not reach the network (ssh)" >&2; return 99; }

  local dir all_ok=1 out
  dir="$(mktemp -d)"
  trap 'rm -rf "$dir"' RETURN

  expect() { # $1 name, $2 output, $3 wanted line
    if printf '%s\n' "$2" | grep -qxF -- "$3"; then echo "ok   purchase $1"; else echo "FAIL purchase $1 (wanted: $3)"; all_ok=0; fi
  }
  absent() { # $1 name, $2 output, $3 pattern that must not appear at the start of a line
    if printf '%s\n' "$2" | grep -qF -- "$3"; then echo "FAIL purchase $1 (found: $3)"; all_ok=0; else echo "ok   purchase $1"; fi
  }
  arow() { printf '{"src":"%s","at":"%sT%s.000Z","model":"%s","provider":"%s","purchase_mc":%s%s}\n' "$1" "$2" "$3" "$4" "${6:-openrouter}" "$5" "${7:-}"; }

  # Now is 2026-11-16 08:00 UTC: the 12th to the 15th are completed, the 16th is running.
  # 12th, gpt-5-mini: 3000 mc booked, 3000 mc at the provider over two endpoints (0.01 + 0.02 USD).
  # 13th, gpt-5-mini: 4000 mc booked and two aborts without an answer, 4300 mc at the provider.
  # 12th, gpt-5.2: 10000 mc booked, no abort, 15000 mc at the provider.
  # 14th, gpt-5.2: one abort answered late (700 mc), 700 mc at the provider.
  # 16th (running day): a booking, an abort without an answer and a line at the provider; none may count.
  # Decoys: a row of the mock provider, a model the service never bought.
  cat >"$dir/activity.json" <<'JSON'
{"data":[
 {"date":"2026-11-12","model":"openai/gpt-5-mini","endpoint_id":"e1","provider_name":"P1","usage":0.01,"requests":1},
 {"date":"2026-11-12","model":"openai/gpt-5-mini","endpoint_id":"e2","provider_name":"P2","usage":0.02,"requests":1},
 {"date":"2026-11-13","model":"openai/gpt-5-mini","endpoint_id":"e1","provider_name":"P1","usage":0.043,"requests":4},
 {"date":"2026-11-12","model":"openai/gpt-5.2","endpoint_id":"e3","provider_name":"P1","usage":0.15,"requests":2},
 {"date":"2026-11-14","model":"openai/gpt-5.2","endpoint_id":"e3","provider_name":"P1","usage":0.007,"requests":1},
 {"date":"2026-11-16","model":"openai/gpt-5-mini","endpoint_id":"e1","provider_name":"P1","usage":9.99,"requests":9},
 {"date":"2026-11-12","model":"other/planted-model","endpoint_id":"e9","provider_name":"P9","usage":0.5,"requests":1}
]}
JSON
  {
    arow ledger 2026-11-12 10:00:00 openai/gpt-5-mini 1000
    arow ledger 2026-11-12 11:00:00 openai/gpt-5-mini 2000
    arow ledger 2026-11-13 10:00:00 openai/gpt-5-mini 4000
    arow abort 2026-11-13 10:05:00 openai/gpt-5-mini 0 openrouter ',"answered":0'
    arow abort 2026-11-13 10:06:00 openai/gpt-5-mini 0 openrouter ',"answered":0'
    arow ledger 2026-11-12 12:00:00 openai/gpt-5.2 10000
    arow abort 2026-11-14 09:00:00 openai/gpt-5.2 700 openrouter ',"answered":1'
    arow ledger 2026-11-16 01:00:00 openai/gpt-5-mini 99999
    arow abort 2026-11-16 01:05:00 openai/gpt-5-mini 0 openrouter ',"answered":0'
    arow ledger 2026-11-13 10:00:00 openai/gpt-5-mini 55555 mock
  } >"$dir/rows.jsonl"

  out="$(AP_NOW=2026-11-16T08:00:00Z AP_SINCE=2026-11-10 calc "$dir/activity.json" "$dir/rows.jsonl")" || all_ok=0
  printf '%s\n' "$out" | sed 's/^/  planted: /'
  expect "equal day, gap 0" "$out" "| 2026-11-12 | openai/gpt-5-mini | 3000 | 3000 | 0 | 0 | - |"
  absent "equal day, no noise line" "$out" "noise 2026-11-12 openai/gpt-5-mini"
  expect "two aborts without answer, 150 per abort" "$out" "| 2026-11-13 | openai/gpt-5-mini | 4300 | 4000 | 300 | 2 | 150 |"
  expect "no abort and 5000 mc more is noise" "$out" "noise 2026-11-12 openai/gpt-5.2: 5000"
  expect "two endpoints of one model on one day are summed" "$out" "| 2026-11-12 | openai/gpt-5-mini | 3000 | 3000 | 0 | 0 | - |"
  absent "running day does not count" "$out" "| 2026-11-16 |"
  absent "mock provider does not count" "$out" "55555"
  expect "purchase without sale is the estimate" "$out" "purchase without sale openai/gpt-5-mini: 300 (answered late 0, estimated 300 for 2 aborts without answer)"
  expect "noise model keeps only the answered purchase" "$out" "purchase without sale openai/gpt-5.2: 700 (no estimate for 0 aborts without answer: noise on 1 days)"
  expect "other models stay out of the table" "$out" "other models at the provider: 1 (50000 mc)"
  expect "baseline 0 when the day without abort agrees" "$out" "baseline openai/gpt-5-mini: 0"

  # A day later the 16th is completed and counts: the filter follows AP_NOW and is not blind to the day.
  out="$(AP_NOW=2026-11-17T08:00:00Z AP_SINCE=2026-11-10 calc "$dir/activity.json" "$dir/rows.jsonl")" || all_ok=0
  expect "completed day counts once AP_NOW has passed it" "$out" "| 2026-11-16 | openai/gpt-5-mini | 999000 | 99999 | 899001 | 1 | 899001 |"

  # The other direction: a period where both sides agree on every day has no noise at all.
  printf '{"data":[{"date":"2026-11-12","model":"openai/gpt-5-mini","usage":0.03}]}\n' >"$dir/quiet.json"
  { arow ledger 2026-11-12 10:00:00 openai/gpt-5-mini 3000; } >"$dir/quiet.jsonl"
  out="$(AP_NOW=2026-11-16T08:00:00Z AP_SINCE=2026-11-10 calc "$dir/quiet.json" "$dir/quiet.jsonl")" || all_ok=0
  expect "quiet period, no noise" "$out" "noise: none"

  # Drift without any abort: two days without an abort (gaps 700 and 900 mc) give the model a baseline of
  # 800 mc, so a day with one abort without an answer and a gap of 1100 mc estimates 300, not 1100.
  printf '%s\n' '{"data":[{"date":"2026-11-12","model":"openai/gpt-5-mini","usage":0.017},{"date":"2026-11-13","model":"openai/gpt-5-mini","usage":0.019},{"date":"2026-11-14","model":"openai/gpt-5-mini","usage":0.021}]}' >"$dir/drift.json"
  {
    arow ledger 2026-11-12 10:00:00 openai/gpt-5-mini 1000
    arow ledger 2026-11-13 10:00:00 openai/gpt-5-mini 1000
    arow ledger 2026-11-14 10:00:00 openai/gpt-5-mini 1000
    arow abort 2026-11-14 10:05:00 openai/gpt-5-mini 0 openrouter ',"answered":0'
  } >"$dir/drift.jsonl"
  out="$(AP_NOW=2026-11-16T08:00:00Z AP_SINCE=2026-11-10 calc "$dir/drift.json" "$dir/drift.jsonl")" || all_ok=0
  printf '%s\n' "$out" | sed 's/^/  drift: /'
  expect "baseline is the median of the days without abort" "$out" "baseline openai/gpt-5-mini: 800"
  expect "per abort subtracts the baseline, gap stays raw" "$out" "| 2026-11-14 | openai/gpt-5-mini | 2100 | 1000 | 1100 | 1 | 300 |"
  expect "purchase without sale subtracts the baseline" "$out" "purchase without sale openai/gpt-5-mini: 300 (answered late 0, estimated 300 for 1 aborts without answer)"

  if [ "$all_ok" = 1 ]; then
    echo "ABORT PURCHASE SELFTEST OK"
    return 0
  fi
  echo "ABORT PURCHASE SELFTEST FAIL"
  return 1
}

case "${1:-}" in
  --selftest) selftest ;;
  --files) calc "${2:?ACTIVITY file or -}" "${3:?ROWS file or -}" ;;
  "") production ;;
  -h | --help) sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//' ;;
  *)
    echo "unknown switch: $1" >&2
    exit 2
    ;;
esac
