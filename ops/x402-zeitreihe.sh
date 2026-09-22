#!/usr/bin/env bash
# Daily scan of the two public x402 directories.
#
# A snapshot says what the market looks like today. The value only comes from the series: whoever
# wants to know in October whether demand is growing needs September, and nobody can collect that
# after the fact. So this runs daily, starting today.
#
# Writes to /opt/control-plane/x402, deliberately NEXT TO the repo directory: `rollout.sh` mirrors
# the repo with --delete, and everything inside would be gone after the next deploy.
#
#   kennzahlen.ndjson      one line per run, small, that is the time series
#   roh/YYYY-MM-DD.csv.gz  the full scan, kept for 60 days
set -euo pipefail

REPO="${CP_REPO:-/opt/control-plane/repo}"
TARGET="${CP_X402_DIR:-/opt/control-plane/x402}"
TODAY="$(date -u +%F)"
mkdir -p "$TARGET/roh"

tmp="$(mktemp)"
# The error output of the scan is only named at the end. Before, it was always called
# `letzter-lauf.err`, even after a clean run, and then sat in the directory carrying nothing but the
# progress lines ("# cdp: 14960 entries"). Whoever looks reads an error message that is none; on
# 20.09.2026 exactly that cost a loop cycle. Now it is only called `.err` when the run failed.
stderr_tmp="$(mktemp)"
trap 'rm -f "$tmp" "$stderr_tmp"' EXIT

if ! python3 "$REPO/docs/research/data/x402-verzeichnis-scan.py" > "$tmp" 2>"$stderr_tmp"; then
  cp "$stderr_tmp" "$TARGET/letzter-lauf.err"
  echo "[x402] scan failed, see $TARGET/letzter-lauf.err" >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "x402 scan failed on $(hostname)" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

lines=$(wc -l < "$tmp")
if [[ "$lines" -lt 1000 ]]; then
  # Half a scan distorts the series permanently, and a gap is more honest than a wrong point. Both
  # directories together stood at 21,545 lines on 20.09.2026.
  echo "[x402] only $lines lines, that is not a complete scan. Nothing written." >&2
  [[ -n "${CP_ALERT_WEBHOOK:-}" ]] && curl -fsS -m 10 -d "x402 scan incomplete: $lines lines" "$CP_ALERT_WEBHOOK" >/dev/null || true
  exit 1
fi

line="$(python3 "$REPO/docs/research/data/x402-kennzahlen.py" "$tmp" --json)"
# A broken line in the series only shows up when somebody evaluates it, so check it here.
if ! printf '%s' "$line" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["dienste_gesamt"] > 1000, d'; then
  echo "[x402] metrics implausible, nothing appended to the series" >&2
  exit 1
fi
# One line per day, not one per run. The cron entry fires at 04:40, and a run by hand to check
# that the thing still works used to leave a second point for the same date; two points for one day
# quietly double-count in anything that reads the series as a daily sequence. So a line whose
# stichtag falls on today is replaced rather than joined.
series="$TARGET/kennzahlen.ndjson"
touch "$series"
python3 - "$series" "$TODAY" "$line" <<'PY'
import json, sys
path, today, line = sys.argv[1], sys.argv[2], sys.argv[3]
kept = []
with open(path) as f:
    for raw in f:
        raw = raw.strip()
        if not raw:
            continue
        try:
            if json.loads(raw).get("stichtag", "").startswith(today):
                continue
        except json.JSONDecodeError:
            pass  # keep anything unparseable rather than silently dropping a data point
        kept.append(raw)
kept.append(line.strip())
with open(path, "w") as f:
    f.write("\n".join(kept) + "\n")
PY
# The series also goes into the container, so the public page at /x402 can read it.
#
# It lives outside the repo directory on purpose (rollout mirrors that with --delete), and the
# container only sees its own volume. `docker cp` is the honest way across: no bind mount to add
# to deploy/**, which is not touched without a human, and no host path to guess at.
if docker cp "$series" deploy-cp-1:/data/x402.ndjson 2>/dev/null; then
  echo "[x402] series handed to the container for /x402"
else
  echo "[x402] could not hand the series to the container; /x402 keeps the older copy" >&2
fi

gzip -c "$tmp" > "$TARGET/roh/$TODAY.csv.gz"
find "$TARGET/roh" -name '*.csv.gz' -mtime +60 -delete

# From here on the run succeeded: the output is called `.log`, and an `.err` from an earlier failed
# attempt disappears. That way an `.err` present in the directory always means the last run went
# wrong, and only then.
cp "$stderr_tmp" "$TARGET/letzter-lauf.log"
rm -f "$TARGET/letzter-lauf.err"

echo "[x402] $TODAY: $lines lines, $(du -h "$TARGET/roh/$TODAY.csv.gz" | cut -f1) packed, series now $(wc -l < "$TARGET/kennzahlen.ndjson") points"
