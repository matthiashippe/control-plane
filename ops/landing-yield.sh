#!/usr/bin/env bash
# How many people came to / from a Conway-Research page on GitHub, and how many of them signed in?
#
# Read only. The answers in the Conway-Research issues send operators to the landing page, and the
# number that says whether the page or the channel is the hole is: arrivals on / with a referrer from
# github.com/Conway-Research, and how many of those addresses then signed in (POST /v1/auth/verify
# with 200) within 24 hours. ops/traffic.sh judges people by scroll marks and has no deadline, so
# this is its own tool.
#
#   bash ops/landing-yield.sh --since <ISO UTC> [--until <ISO UTC>] [--log <file>]
#   bash ops/landing-yield.sh --selftest
#
# Rules, per foreign address (not in ops/own-ips.txt, or the file named by CP_OWN_IPS):
#   arrival      the FIRST request GET / (with or without a query) inside [since, until] whose
#                Referer starts with https://github.com/Conway-Research followed by "/" or nothing
#   signed in    the same address later sent POST /v1/auth/verify answered 200, at most 24 hours
#                after the arrival and not after --until
#   still open   not signed in, and the arrival lies less than 24 hours before --until
#   phone        the arrival's user agent names iPhone, iPad or Android together with Mobile
#
# The output is sums only, never an address: the repository is public (loop-constraints.md, rule 8).
# Without --log the whole access log, rotated files included, comes from ops/access-log.sh.
#
# Exit 0 measured, 1 bad argument, 2 blind (log or own list unreadable, --until before --since, or a
# window without a single log line, because a zero from an empty window is blindness, not a quiet day).
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SELF="$HERE/$(basename "${BASH_SOURCE[0]}")"

# The whole computation, in one place, so the selftest and the real run cannot drift apart.
# Modes:
#   dates <since> <until|"">          validate, print "<since_epoch> <until_epoch> <since_iso> <until_iso>"
#   count <log> <own> <since_epoch> <until_epoch> <since_iso> <until_iso>
#   window <fixture>                  the selftest window from the fixture's own timestamps
read -r -d '' CORE <<'PY'
import datetime, json, math, re, sys, time

DEADLINE = 24 * 3600
REFERRER = re.compile(r"^https://github\.com/Conway-Research(/|$)")
PHONE_OS = ("iPhone", "iPad", "Android")
UTC = datetime.timezone.utc


def iso(epoch):
    return datetime.datetime.fromtimestamp(epoch, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse(text, name):
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(Z|\+00:00)", text):
        print(f"landing-yield: {name} must be an ISO UTC time like 2026-11-02T00:00:00Z, got {text!r}", file=sys.stderr)
        raise SystemExit(1)
    try:
        return int(datetime.datetime.fromisoformat(text.replace("Z", "+00:00")).timestamp())
    except ValueError:
        print(f"landing-yield: {name} is not a real date: {text!r}", file=sys.stderr)
        raise SystemExit(1)


def dates(since_text, until_text):
    since = parse(since_text, "--since")
    until = parse(until_text, "--until") if until_text else int(math.floor(time.time()))
    if until < since:
        print(f"landing-yield: --until {iso(until)} lies before --since {iso(since)}", file=sys.stderr)
        raise SystemExit(2)
    print(since, until, iso(since), iso(until))


def own_addresses(path):
    try:
        with open(path, encoding="utf-8") as f:
            text = f.read()
    except OSError as e:
        print(f"landing-yield: the own address list cannot be read ({e.strerror}): {path}", file=sys.stderr)
        raise SystemExit(2)
    return {l.split()[0] for l in text.splitlines() if l.strip() and not l.lstrip().startswith("#")}


def rows_of(path):
    try:
        f = open(path, encoding="utf-8", errors="replace")
    except OSError as e:
        print(f"landing-yield: the log cannot be read ({e.strerror}): {path}", file=sys.stderr)
        raise SystemExit(2)
    rows, broken = [], 0
    with f:
        for raw in f:
            raw = raw.strip()
            if not raw:
                continue
            try:
                r = json.loads(raw)
                ts = float(r["ts"])
            except (ValueError, KeyError, TypeError):
                broken += 1
                continue
            q = r.get("request") or {}
            h = q.get("headers") or {}
            first = lambda k: str((h.get(k) or [""])[0] or "")
            # client_ip is the address Caddy resolved for the client; remote_ip is the peer. They are
            # the same here (no trusted_proxies in deploy/Caddyfile), and remote_ip is what
            # ops/traffic.sh reads, so it is the fallback for lines that lack client_ip.
            ip = q.get("client_ip") or q.get("remote_ip") or ""
            rows.append((ts, ip, str(q.get("method") or ""), str(q.get("uri") or ""), r.get("status"),
                         first("Referer"), first("User-Agent")))
    if broken:
        print(f"landing-yield: {broken} line(s) of the log were not JSON access lines and were skipped", file=sys.stderr)
    rows.sort(key=lambda r: r[0])
    return rows


def count(log, own_path, since, until, since_iso, until_iso):
    own = own_addresses(own_path)
    rows = rows_of(log)
    since, until = int(since), int(until)
    inside = [r for r in rows if since <= r[0] <= until]
    if not inside:
        print(f"landing-yield: no log line between {since_iso} and {until_iso}. A zero from an empty window "
              "is blindness, not a quiet window, so nothing is reported.", file=sys.stderr)
        raise SystemExit(2)
    foreign = {r[1] for r in inside if r[1] not in own}

    arrivals = {}
    for ts, ip, method, uri, status, ref, agent in inside:
        if ip in own or ip in arrivals:
            continue
        if method == "GET" and uri.split("?")[0] == "/" and REFERRER.match(ref):
            arrivals[ip] = (ts, agent)

    signed = set()
    for ts, ip, method, uri, status, ref, agent in rows:
        if ip not in arrivals or ip in signed:
            continue
        if method != "POST" or uri.split("?")[0] != "/v1/auth/verify" or status != 200:
            continue
        start = arrivals[ip][0]
        if start < ts <= min(start + DEADLINE, until):
            signed.add(ip)

    still_open = sum(1 for ip, (ts, _) in arrivals.items() if ip not in signed and until - ts < DEADLINE)
    phone = sum(1 for ts, agent in arrivals.values() if "Mobile" in agent and any(o in agent for o in PHONE_OS))
    print(f"LANDING YIELD {since_iso} to {until_iso}: {len(arrivals)} arrived on / from github.com/Conway-Research, "
          f"{len(signed)} signed in within 24 hours, {still_open} still inside 24 hours")
    print(f"BY DEVICE: {phone} phone, {len(arrivals) - phone} other")
    print(f"WINDOW {since_iso} to {until_iso}: {len(inside)} log line(s), {len(foreign)} foreign address(es)")


def window(path):
    # One hour after the first line, so the first line is an arrival before --since, and the second
    # after the last line, so the last line is inside. Computed, never typed, so the fixture never ages.
    stamps = [r[0] for r in rows_of(path)]
    since = int(math.floor(min(stamps))) + 3600
    until = int(math.ceil(max(stamps)))
    print(iso(since), iso(until))


mode, args = sys.argv[1], sys.argv[2:]
{"dates": dates, "count": count, "window": window}[mode](*args)
PY

core() { python3 -c "$CORE" "$@"; }

# The counter-proof, after ops/traffic.sh --selftest: the planted log ops/fixtures/landing-yield.log
# holds every case in both directions, and the selftest fails loudly if the sums stop telling them
# apart. It also proves that its own comparison can fail, because a check that cannot go red proves
# nothing.
if [[ "${1:-}" == "--selftest" ]]; then
  fixture="$HERE/fixtures/landing-yield.log"
  [[ -f "$fixture" ]] || { echo "SELFTEST FAILED: $fixture is not there"; exit 1; }
  tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
  printf '# planted own address for the selftest\n203.0.113.99 2026-11-02  planted own address\n' > "$tmp/own.txt"
  printf '# no own address at all\n' > "$tmp/none.txt"
  read -r since until < <(core window "$fixture") || { echo "SELFTEST FAILED: no window from the fixture"; exit 1; }
  echo "window from the fixture: $since to $until"
  failed=()
  expect() { # name, expected output, actual output
    if [[ "$2" == "$3" ]]; then
      echo "ok   $1"
      return 0
    fi
    echo "FAIL $1"
    echo "     expected: $(printf '%s' "$2" | tr '\n' '|')"
    echo "     got:      $(printf '%s' "$3" | tr '\n' '|')"
    return 1
  }
  sums() { # arrived, signed in, still open, phone, other, lines, foreign
    printf 'LANDING YIELD %s to %s: %s arrived on / from github.com/Conway-Research, %s signed in within 24 hours, %s still inside 24 hours\nBY DEVICE: %s phone, %s other\nWINDOW %s to %s: %s log line(s), %s foreign address(es)' \
      "$since" "$until" "$1" "$2" "$3" "$4" "$5" "$since" "$until" "$6" "$7"
  }
  measure() { # log, own list
    CP_OWN_IPS="$2" bash "$SELF" --since "$since" --until "$until" --log "$1" 2>/dev/null
  }

  # Four arrivals: the iPhone signed in after 23 h (once, despite its second GET /), the bare
  # organisation URL signed in after 25 h, the issue reader whose sign-in answered 500, and the one an
  # hour before --until, still open. Not arrivals: /fix, Conway-Research-fake, google.com, the own
  # address, and the arrival before --since.
  real=$(measure "$fixture" "$tmp/own.txt")
  expect "four arrivals, one signed in after 23 h, one still open, one phone" "$(sums 4 1 1 1 3 16 8)" "$real" || failed+=("main")

  # Other direction of the own filter: the same log with an empty list counts the own address,
  # its referrer and its sign-in.
  expect "the own address counts once the list does not name it" "$(sums 5 2 1 1 4 16 9)" \
    "$(measure "$fixture" "$tmp/none.txt")" || failed+=("own list")

  # Other direction of the deadline: the 25 h sign-in moved to 23 h has to count.
  python3 -c '
import json, sys
src, dst = sys.argv[1], sys.argv[2]
rows = [json.loads(l) for l in open(src) if l.strip()]
start = next(r["ts"] for r in rows if r["request"]["client_ip"] == "192.0.2.11" and r["request"]["uri"] == "/")
for r in rows:
    if r["request"]["client_ip"] == "192.0.2.11" and r["request"]["uri"] == "/v1/auth/verify":
        r["ts"] = start + 23 * 3600
with open(dst, "w") as f:
    f.write("".join(json.dumps(r) + "\n" for r in sorted(rows, key=lambda r: r["ts"])))
' "$fixture" "$tmp/early.log"
  expect "a sign-in moved from 25 h to 23 h counts" "$(sums 4 2 1 1 3 16 8)" \
    "$(measure "$tmp/early.log" "$tmp/own.txt")" || failed+=("deadline")

  # Other direction of the status rule: the 500 turned into 200 has to count.
  python3 -c '
import json, sys
rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
for r in rows:
    if r["status"] == 500:
        r["status"] = 200
open(sys.argv[2], "w").write("".join(json.dumps(r) + "\n" for r in rows))
' "$fixture" "$tmp/ok.log"
  expect "the sign-in that answered 500 counts once it answers 200" "$(sums 4 2 1 1 3 16 8)" \
    "$(measure "$tmp/ok.log" "$tmp/own.txt")" || failed+=("status")

  # An empty window is blindness: exit 2 and no sums.
  empty=$(CP_OWN_IPS="$tmp/own.txt" bash "$SELF" --since 2000-01-01T00:00:00Z --until 2000-01-02T00:00:00Z --log "$fixture" 2>/dev/null)
  code=$?
  if [[ "$code" -eq 2 && -z "$empty" ]]; then
    echo "ok   an empty window exits 2 and prints no sums"
  else
    echo "FAIL an empty window exited $code and printed: $empty"
    failed+=("empty window")
  fi

  # The comparison itself has to be able to go red: one arrival too many in the expectation.
  if expect "planted wrong expectation (5 arrivals) is caught" "$(sums 5 1 1 1 3 16 8)" "$real" >/dev/null; then
    echo "FAIL the comparison accepted a wrong expectation, so it proves nothing"
    failed+=("comparison")
  else
    echo "ok   a planted wrong expectation is caught"
  fi

  if [[ ${#failed[@]} -eq 0 ]]; then
    echo "SELFTEST OK"
    exit 0
  fi
  echo "SELFTEST FAILED: ${failed[*]}"
  exit 1
fi

usage() {
  echo "usage: bash ops/landing-yield.sh --since <ISO UTC> [--until <ISO UTC>] [--log <file>] | --selftest" >&2
  exit 1
}

since_arg="" until_arg="" log_arg="" have_since=0 have_log=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --since) [[ $# -ge 2 ]] || usage; since_arg="$2"; have_since=1; shift 2 ;;
    --until) [[ $# -ge 2 ]] || usage; until_arg="$2"; shift 2 ;;
    --log)   [[ $# -ge 2 ]] || usage; log_arg="$2"; have_log=1; shift 2 ;;
    *) echo "landing-yield: unknown argument: $1" >&2; usage ;;
  esac
done
(( have_since )) || { echo "landing-yield: --since is required" >&2; usage; }

window_line=$(core dates "$since_arg" "$until_arg") || exit $?
read -r since_epoch until_epoch since_iso until_iso <<< "$window_line"

own="${CP_OWN_IPS:-$HERE/own-ips.txt}"
[[ -r "$own" ]] || { echo "landing-yield: the own address list cannot be read: $own" >&2; exit 2; }

if (( have_log )); then
  log="$log_arg"
  echo "(log from $log_arg, not from the VM)" >&2
else
  log=$(mktemp); trap 'rm -f "$log"' EXIT
  if ! bash "$HERE/access-log.sh" > "$log"; then
    echo "landing-yield: ops/access-log.sh could not read the access log. This says nothing about traffic." >&2
    exit 2
  fi
fi

core count "$log" "$own" "$since_epoch" "$until_epoch" "$since_iso" "$until_iso"
