#!/usr/bin/env bash
# How many stranger addresses do the logs of GitHub Actions runs of this public repository carry?
#
# Until 2026-11-12 ops/deploy-window.sh printed the address of every visitor it listed under AFFECTED,
# and deploy.yml put that output into the logs of a public repository, where GitHub keeps it readable
# for 90 days. This script counts those addresses before the logs are deleted and proves afterwards
# that none is left. It prints counts only, never an address, not even on stderr.
#
#   ops/actions-log-addresses.sh --dir <dir>
#        logs on disk: one subdirectory per run, named by the run id, holding *.txt at any depth
#        (the layout `unzip` makes of the archive from gh api repos/<repo>/actions/runs/<id>/logs)
#   ops/actions-log-addresses.sh --runs <id>,<id>,...
#        downloads the logs of these runs with gh into a directory from mktemp -d and deletes it at the end
#   ops/actions-log-addresses.sh --workflow deploy.yml
#        the same for every run of that workflow, all pages
#
# The repository comes from CP_REPO (default matthiashippe/control-plane).
#
# A stranger address is an IPv4 address in a line that also holds an HTTP method followed by a path
# from "/" (a request line), that stands in none of CP_OWN_IPS_FILE (default ops/own-ips.txt),
# CP_KNOWN_IPS (default ops/known-ips.txt) and CP_CRAWLER_IPS (default ops/crawler-ips.txt), and that
# lies outside 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12 and 192.168.0.0/16.
# Documentation addresses count, so a test can plant them as visitors. A line like
# "(new own address <address>, written to own-ips.txt)" is no request line and does not count.
#
# Output: one line "<id> <n>" per run (distinct stranger addresses of that run) or "<id> no-log" (the
# log is gone, gh answers 404 or 410), ascending by id, then "total <n>" (distinct over all runs).
#
# Exit 0: counted. Exit 2: could not count (gh failed while listing or on a log for another reason
# than a missing one, bad arguments, unreadable list). Exit 2 never prints a total line, so a network
# error is never read as zero.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
REPO="${CP_REPO:-matthiashippe/control-plane}"
OWN="${CP_OWN_IPS_FILE:-$ROOT/ops/own-ips.txt}"
KNOWN="${CP_KNOWN_IPS:-$ROOT/ops/known-ips.txt}"
CRAWLER="${CP_CRAWLER_IPS:-$ROOT/ops/crawler-ips.txt}"

# Every message is a fixed text plus run ids and HTTP status codes; nothing from gh or a log is echoed.
die() {
  echo "actions-log-addresses: $*" >&2
  exit 2
}

usage() {
  echo "usage: ops/actions-log-addresses.sh --dir <dir> | --runs <id>,<id>,... | --workflow <file>" >&2
  exit 2
}

dir="" runs="" workflow="" sources=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dir) [[ $# -ge 2 ]] || usage; dir="$2"; sources=$((sources + 1)); shift 2 ;;
    --runs) [[ $# -ge 2 ]] || usage; runs="$2"; sources=$((sources + 1)); shift 2 ;;
    --workflow) [[ $# -ge 2 ]] || usage; workflow="$2"; sources=$((sources + 1)); shift 2 ;;
    -h|--help) usage ;;
    *) usage ;;
  esac
done
[[ $sources -eq 1 ]] || usage

for list in "$OWN" "$KNOWN" "$CRAWLER"; do
  [[ -r "$list" ]] || die "cannot read the address list $list"
done

work="$(mktemp -d)" || die "mktemp failed"
trap 'rm -rf "$work"' EXIT
results="$work/results"
all="$work/all"
: > "$results"
: > "$all"

# The status code from a gh error, never the rest of its message.
http_status() {
  grep -oE 'HTTP [0-9]{3}' "$1" | head -n 1
}

if [[ -z "$dir" ]]; then
  ids="$work/ids"
  if [[ -n "$workflow" ]]; then
    [[ "$workflow" =~ ^[A-Za-z0-9._-]+$ ]] || die "workflow must be a file name like deploy.yml"
    if ! gh api --paginate "repos/$REPO/actions/workflows/$workflow/runs?per_page=100" \
      --jq '.workflow_runs[].id' > "$ids" 2> "$work/err"; then
      die "gh could not list the runs of $workflow ($(http_status "$work/err" || true))"
    fi
  else
    tr ',' '\n' <<< "$runs" | sed '/^$/d' > "$ids"
  fi
  while IFS= read -r id; do
    [[ "$id" =~ ^[0-9]+$ ]] || die "run ids must be numbers"
  done < "$ids"
  dir="$work/logs"
  mkdir -p "$dir"
  for id in $(sort -un "$ids"); do
    if ! gh api "repos/$REPO/actions/runs/$id/logs" > "$work/$id.zip" 2> "$work/err"; then
      status="$(http_status "$work/err" || true)"
      if [[ "$status" == "HTTP 404" || "$status" == "HTTP 410" ]]; then
        echo "$id no-log" >> "$results"
        rm -f "$work/$id.zip"
        continue
      fi
      die "gh failed on the log of run $id (${status:-no HTTP status})"
    fi
    mkdir -p "$dir/$id"
    unzip -q -o "$work/$id.zip" -d "$dir/$id" > /dev/null 2>&1 || die "could not unpack the log of run $id"
    rm -f "$work/$id.zip"
  done
else
  [[ -d "$dir" ]] || die "no such directory: --dir"
fi

# Prints the distinct stranger addresses of the request lines on stdin, one per line. The output goes
# only into files inside $work, which is deleted on exit.
strangers() {
  awk -v own="$OWN" -v known="$KNOWN" -v crawler="$CRAWLER" '
    function load(path,   line, f) {
      while ((getline line < path) > 0) {
        if (line ~ /^[ \t]*#/) continue
        split(line, f, /[ \t]+/)
        if (f[1] == "" && f[2] != "") f[1] = f[2]
        if (f[1] != "") listed[f[1]] = 1
      }
      close(path)
    }
    function octet(s) { return length(s) <= 3 && s + 0 <= 255 }
    function private(a, b) {
      return a == 0 || a == 10 || a == 127 || (a == 169 && b == 254) || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168)
    }
    BEGIN { load(own); load(known); load(crawler) }
    /(^|[^A-Za-z])(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS|CONNECT|TRACE) \// {
      rest = $0
      pre = ""
      while (match(rest, /[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/)) {
        cand = substr(rest, RSTART, RLENGTH)
        before = RSTART > 1 ? substr(rest, RSTART - 1, 1) : substr(pre, length(pre), 1)
        after = substr(rest, RSTART + RLENGTH, 1)
        pre = substr(rest, 1, RSTART + RLENGTH - 1)
        rest = substr(rest, RSTART + RLENGTH)
        if (before ~ /[0-9A-Za-z.]/ || after ~ /[0-9A-Za-z]/ || (after == "." && rest ~ /^\.[0-9]/)) continue
        split(cand, o, ".")
        if (!(octet(o[1]) && octet(o[2]) && octet(o[3]) && octet(o[4]))) continue
        ip = (o[1] + 0) "." (o[2] + 0) "." (o[3] + 0) "." (o[4] + 0)
        if (private(o[1] + 0, o[2] + 0) || (ip in listed) || (cand in listed) || (ip in seen)) continue
        seen[ip] = 1
        print ip
      }
    }
  '
}

for run in "$dir"/*/; do
  [[ -d "$run" ]] || continue
  id="$(basename "$run")"
  [[ "$id" =~ ^[0-9]+$ ]] || die "every subdirectory of --dir must be named by a run id"
  found="$work/run-$id"
  find "$run" -type f -name '*.txt' -print0 | xargs -0 -r cat | strangers > "$found" \
    || die "could not read the log of run $id"
  cat "$found" >> "$all"
  echo "$id $(sort -u "$found" | wc -l | tr -d ' ')" >> "$results"
done

sort -n -k1,1 "$results"
echo "total $(sort -u "$all" | wc -l | tr -d ' ')"
