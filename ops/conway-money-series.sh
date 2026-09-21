#!/usr/bin/env bash
# Daily scan of the money still going into Conway.
#
# Conway's sign-up has been broken since July 2026 and its payment endpoint has not. The landing
# page and the article both say so with numbers from a single scan on 19 September, and a number
# from a single day ages badly: by the time somebody reads the article in October, "44 wallets sent
# 430 USDC in 30 days" is either still true, no longer true, or worse, and none of the three can be
# told apart from a static file. So it gets measured daily, starting today.
#
# The expensive part is already done. `docs/research/data/2026-09-19-conway-payto-transfers.csv`
# holds every transfer up to 20 September and took half an hour of eth_getLogs. This script only
# ever scans forward from the newest block it already has, which is about 22 chunks a day.
#
# Writes to /opt/control-plane/conway-money, deliberately NEXT TO the repo directory: `rollout.sh`
# mirrors the repo with --delete, and everything inside would be gone after the next deploy.
#
#   metrics.ndjson   one line per run, small, that is the time series
#   delta.csv        every transfer found since the base file, same columns
#
# English names throughout, including the ones on disk, unlike the older x402 series next door.
# That series is not the convention, it is the part of the repo the language pass has not reached
# (`loop-constraints.md`: "Alles im Code ist Englisch, ausnahmslos").
set -euo pipefail

REPO="${CP_REPO:-/opt/control-plane/repo}"
TARGET="${CP_CONWAY_MONEY_DIR:-/opt/control-plane/conway-money}"
BASE="$REPO/docs/research/data/2026-09-19-conway-payto-transfers.csv"
TODAY="$(date -u +%F)"
mkdir -p "$TARGET"
delta="$TARGET/delta.csv"
touch "$delta"

if [[ ! -s "$BASE" ]]; then
  echo "[conway-money] the base file is missing or empty: $BASE" >&2
  exit 1
fi

metrics() { python3 "$REPO/docs/research/data/conway-money-metrics.py" "$BASE" "$delta" --json; }

# The resume point comes out of the data, not out of a state file. A state file can drift away from
# the rows it claims to describe, and then the series has a hole nobody can see; the newest block in
# the files themselves cannot.
before="$(metrics)"
from_block=$(( $(printf '%s' "$before" | python3 -c 'import json,sys; print(json.load(sys.stdin)["last_block"])') + 1 ))

fresh="$(mktemp)"
errors="$(mktemp)"
trap 'rm -f "$fresh" "$errors"' EXIT

if ! python3 "$REPO/docs/research/data/conway-payto-scan.py" --from-block "$from_block" > "$fresh" 2>"$errors"; then
  cp "$errors" "$TARGET/last-run.err"
  echo "[conway-money] scan failed, see $TARGET/last-run.err" >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "conway money scan failed on $(hostname)" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

found=$(wc -l < "$fresh" | tr -d ' ')
cat "$fresh" >> "$delta"

after="$(metrics)"
series="$TARGET/metrics.ndjson"
touch "$series"
# A series is only worth something if a bad run cannot enter it. Money never goes down, because
# transfers are only ever added, and the scan only ever moves forward.
#
# The comparison that matters is against the LAST LINE OF THE SERIES, not against this run's own
# starting figures. Both of those come from the same files, so a base file that lost half its rows
# would satisfy any before/after check and still write a line claiming the money had vanished. The
# previous day's line is the only reading that was taken while the data was still whole.
if ! python3 - "$before" "$after" "$series" <<'PY'
import json, sys
before, after = json.loads(sys.argv[1]), json.loads(sys.argv[2])
assert after["usdc_total"] >= before["usdc_total"], (before["usdc_total"], after["usdc_total"])
assert after["last_block"] >= before["last_block"], (before["last_block"], after["last_block"])
assert after["transfers_total"] >= before["transfers_total"], "transfers went backwards in this run"

previous = None
with open(sys.argv[3]) as handle:
    for raw in handle:
        raw = raw.strip()
        if raw:
            try:
                previous = json.loads(raw)
            except json.JSONDecodeError:
                pass
if previous:
    assert after["usdc_total"] >= previous["usdc_total"], \
        f'usdc_total fell from {previous["usdc_total"]} to {after["usdc_total"]} since the last run'
    assert after["transfers_total"] >= previous["transfers_total"], \
        f'transfers_total fell from {previous["transfers_total"]} to {after["transfers_total"]}'
PY
then
  echo "[conway-money] the new figures are not plausible, nothing appended to the series" >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "conway money series implausible on $(hostname)" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

# Whether the payment endpoint still takes money is the other half of the claim this series
# exists for, and it is one plain GET. Nothing is signed here: an x402 demand is just a 402 with a
# description of what it wants, and answering it would take a signature this script never makes.
pay_status=$(curl -s -o /dev/null -m 15 -w '%{http_code}' \
  -A 'control-plane-check/1.0 (+https://cp.hippe.eu)' \
  'https://api.conway.tech/pay/5/0x0000000000000000000000000000000000000001' || echo 000)
after=$(python3 - "$after" "$pay_status" <<'PY'
import json, sys
values = json.loads(sys.argv[1])
values["pay_endpoint_status"] = int(sys.argv[2])
print(json.dumps(values, separators=(",", ":")))
PY
)

# One line per day, not one per run, same as the x402 series: a run by hand to check that the thing
# still works used to leave a second point for the same date, and two points for one day quietly
# double-count in anything that reads the series as a daily sequence.
python3 - "$series" "$TODAY" "$after" <<'PY'
import json, sys
path, today, line = sys.argv[1], sys.argv[2], sys.argv[3]
kept = []
with open(path) as f:
    for raw in f:
        raw = raw.strip()
        if not raw:
            continue
        try:
            if json.loads(raw).get("measured_at", "").startswith(today):
                continue
        except json.JSONDecodeError:
            pass  # keep anything unparseable rather than silently dropping a data point
        kept.append(raw)
kept.append(line.strip())
with open(path, "w") as f:
    f.write("\n".join(kept) + "\n")
PY

# The receipts behind the claim, so the page can name transfers a reader can look up. A separate
# file rather than a field in the series: the series is a record of what was true on each day and
# has to stay small, the receipts are current state and only the newest ones are ever shown.
python3 "$REPO/docs/research/data/conway-money-metrics.py" "$BASE" "$delta" --recent 25 > "$TARGET/recent.csv"

# Both files go into the container, the same way the x402 series does: no bind mount to add to
# deploy/**, which is not touched without a human, and no host path to guess at.
if docker cp "$series" deploy-cp-1:/data/conway-money.ndjson 2>/dev/null \
  && docker cp "$TARGET/recent.csv" deploy-cp-1:/data/conway-recent.csv 2>/dev/null; then
  echo "[conway-money] series and receipts handed to the container"
else
  echo "[conway-money] could not hand the files to the container; it keeps the older copies" >&2
fi

cp "$errors" "$TARGET/last-run.log"
rm -f "$TARGET/last-run.err"

echo "[conway-money] $TODAY: $found new transfer(s) from block $from_block, series now $(wc -l < "$series" | tr -d ' ') point(s)"
# The figures go in as an argument, not through the pipe: a heredoc already owns stdin here, and
# piping as well leaves the script reading its own source as JSON.
python3 - "$after" <<'PY'
import json, sys
d = json.loads(sys.argv[1])
print(f"             30 days: {d['usdc_30d']:.2f} USDC from {d['wallets_30d']} wallet(s), "
      f"data through {d['data_through']}")
PY
