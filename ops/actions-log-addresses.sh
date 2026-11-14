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
# A stranger address is an IPv4 or IPv6 address in a line that also holds an HTTP method followed by a path
# from "/" (a request line), that stands in none of CP_OWN_IPS_FILE (default ops/own-ips.txt),
# CP_KNOWN_IPS (default ops/known-ips.txt) and CP_CRAWLER_IPS (default ops/crawler-ips.txt), and that
# lies outside 0.0.0.0/8, 10.0.0.0/8, 127.0.0.0/8, 169.254.0.0/16, 172.16.0.0/12 and 192.168.0.0/16.
# An IPv6 address counts the same way: in a request line, glued to no letter, a valid address (eight
# groups of one to four hex digits, or at most seven with exactly one "::", optionally ending in a dotted
# IPv4 part), compared and counted in its full form (eight groups of four lowercase digits), so two
# spellings of one address count once; list entries are compared in that form too. ::, ::1, fe80::/10
# and fc00::/7 are private. ::ffff:<IPv4> counts as that IPv4 address under the IPv4 rules, once. A
# clock time like 05:57:46 is no address.
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
# The path of the list comes from ops/own-ips.sh (CP_OWN_IPS_FILE, else the list beside it). Only the
# path: this counts strangers in public logs, not customers, and --dir must run without network, so
# the live probe in `own_ips` is not wanted here.
# shellcheck source=ops/own-ips.sh
source "$HERE/own-ips.sh"
OWN="$CP_OWN_IPS_FILE"
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
    function load(path,   line, f, n) {
      while ((getline line < path) > 0) {
        if (line ~ /^[ \t]*#/) continue
        split(line, f, /[ \t]+/)
        if (f[1] == "" && f[2] != "") f[1] = f[2]
        if (f[1] == "") continue
        listed[f[1]] = 1
        n = v6(f[1])
        if (n != "") listed[n] = 1
      }
      close(path)
    }
    function octet(s) { return s ~ /^[0-9]+$/ && length(s) <= 3 && s + 0 <= 255 }
    function private(a, b) {
      return a == 0 || a == 10 || a == 127 || (a == 169 && b == 254) || (a == 172 && b >= 16 && b <= 31) || (a == 192 && b == 168)
    }
    function hex(s,   i, n) {
      n = 0
      for (i = 1; i <= length(s); i++) n = n * 16 + index("0123456789abcdef", substr(s, i, 1)) - 1
      return n
    }
    function pad(g) { return substr("0000", 1, 4 - length(g)) g }
    function hex4(n,   d, s, i) {
      s = ""
      for (i = 0; i < 4; i++) { d = n % 16; s = substr("0123456789abcdef", d + 1, 1) s; n = int(n / 16) }
      return s
    }
    # The full form (eight groups of four lowercase hex digits) of a valid IPv6 address, or "" for anything else.
    function v6(s,   head, tail, q, g, gl, gr, l, r, nl, nr, i, out, k) {
      s = tolower(s)
      if (s !~ /^[0-9a-f:.]+$/ || index(s, ":") == 0 || index(s, ":::") > 0) return ""
      if (index(s, ".") > 0) {
        k = 0
        for (i = length(s); i > 0; i--) if (substr(s, i, 1) == ":") { k = i; break }
        head = substr(s, 1, k)
        tail = substr(s, k + 1)
        if (index(head, ".") > 0 || split(tail, q, ".") != 4) return ""
        if (!(octet(q[1]) && octet(q[2]) && octet(q[3]) && octet(q[4]))) return ""
        s = head hex4((q[1] * 256) + q[2]) ":" hex4((q[3] * 256) + q[4])
      }
      k = index(s, "::")
      if (k > 0) {
        if (index(substr(s, k + 2), "::") > 0) return ""
        l = substr(s, 1, k - 1)
        r = substr(s, k + 2)
        nl = l == "" ? 0 : split(l, gl, ":")
        nr = r == "" ? 0 : split(r, gr, ":")
        if (nl + nr > 7) return ""
        out = ""
        for (i = 1; i <= nl; i++) { if (gl[i] !~ /^[0-9a-f][0-9a-f]?[0-9a-f]?[0-9a-f]?$/) return ""; out = out pad(gl[i]) ":" }
        for (i = 1; i <= 8 - nl - nr; i++) out = out "0000:"
        for (i = 1; i <= nr; i++) { if (gr[i] !~ /^[0-9a-f][0-9a-f]?[0-9a-f]?[0-9a-f]?$/) return ""; out = out pad(gr[i]) ":" }
        return substr(out, 1, length(out) - 1)
      }
      if (split(s, g, ":") != 8) return ""
      out = ""
      for (i = 1; i <= 8; i++) { if (g[i] !~ /^[0-9a-f][0-9a-f]?[0-9a-f]?[0-9a-f]?$/) return ""; out = out (i > 1 ? ":" : "") pad(g[i]) }
      return out
    }
    # Counts an IPv4 address once unless it is private or listed.
    function count4(a, b, c, d, cand,   ip) {
      ip = a "." b "." c "." d
      if (private(a, b) || (ip in listed) || (cand in listed) || (ip in seen)) return
      seen[ip] = 1
      print ip
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
        count4(o[1] + 0, o[2] + 0, o[3] + 0, o[4] + 0, cand)
      }
      # IPv6: a maximal run of hex digits, ":" and "." with a colon in it, not glued to a letter or "_", that is a valid
      # address. A clock time like 05:57:46 has three groups and no "::", so it is none.
      rest = $0
      pre = ""
      while (match(rest, /[0-9A-Fa-f.:]*:[0-9A-Fa-f.:]*/)) {
        cand = substr(rest, RSTART, RLENGTH)
        before = RSTART > 1 ? substr(rest, RSTART - 1, 1) : substr(pre, length(pre), 1)
        after = substr(rest, RSTART + RLENGTH, 1)
        pre = substr(rest, 1, RSTART + RLENGTH - 1)
        rest = substr(rest, RSTART + RLENGTH)
        if (before ~ /[A-Za-z_]/ || after ~ /[A-Za-z_]/) continue
        full = v6(cand)
        if (full == "") continue
        # ::ffff:0:0/96 is an IPv4 address: the loop above counted the dotted spelling, the hex one counts here.
        if (substr(full, 1, 30) == "0000:0000:0000:0000:0000:ffff:") {
          if (index(cand, ".") == 0) {
            h = hex(substr(full, 31, 4)); l4 = hex(substr(full, 36, 4))
            count4(int(h / 256), h % 256, int(l4 / 256), l4 % 256, cand)
          }
          continue
        }
        first = hex(substr(full, 1, 4))
        # ::, ::1, fe80::/10 and fc00::/7 are private.
        if (full == "0000:0000:0000:0000:0000:0000:0000:0000" || full == "0000:0000:0000:0000:0000:0000:0000:0001") continue
        if ((first >= 65152 && first <= 65215) || (first >= 64512 && first <= 65023)) continue
        if ((full in listed) || (full in seen)) continue
        seen[full] = 1
        print full
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
