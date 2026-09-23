#!/usr/bin/env bash
# Do the pages say anything obviously wrong?
#
# `ops/smoke.sh` proves the API and the security headers. Nothing looked at what the pages
# actually say, and twice in a row something visibly wrong went live: "1 jobs paid out" on
# 2026-09-21, and one line next to it "to the agents that won them". Both were caught by reading
# the live page with my eyes, which is not a process.
#
# This is not a design review and cannot be one. It catches the class of mistake that is cheap to
# catch and embarrassing to ship: a placeholder that never got replaced, a template that leaked as
# text, a number rendered as `undefined`, a plural that does not agree with the one in front of it.
#
#   ops/check-pages.sh [base]
set -uo pipefail
BASE="${1:-${CP_URL:-https://postyourprice.com}}"
failures=0
ok()   { echo "ok      $1"; }
bad()  { failures=$((failures+1)); echo "FAILED  $1"; [[ -n "${2:-}" ]] && echo "        $2"; }

# The list comes from the service, not from this file. "Two literals would drift the day a page is
# added" is what the old comment here said about keeping one array instead of two, and on
# 2026-09-23 the array itself drifted: /check shipped and three separate hand-kept lists, this one
# among them, did not grow. The sitemap is the service's own answer to which pages are meant to be
# found, and test/sitemap-covers-pages.test.ts holds it to the routes from both sides.
#
# An empty list is a failure and not an empty run: a check that silently verifies nothing is worse
# than one that is missing.
# `while read` and not `mapfile`: this repo runs on the bash macOS ships, which is 3.2 and has no
# mapfile at all. The first version failed with "command not found" and then "unbound variable".
PAGES=()
while IFS= read -r line; do
  [[ -n "$line" ]] && PAGES+=("$line")
  # The host is stripped by pattern, not by comparing against BASE. Those two were the same thing
  # until 2026-09-23, when the sitemap moved to postyourprice.com while BASE still said
  # cp.hippe.eu: the substitution matched nothing and the page list filled with strings that equal
  # no path. Four tools then reported, quietly, that they could not judge anything.
done < <(curl -s -m 15 "$BASE/sitemap.xml" | grep -oE '<loc>[^<]*' | sed -E 's|^<loc>https?://[^/]*||' | sed 's|^$|/|')
if (( ${#PAGES[@]} < 5 )); then
  echo "COULD NOT TELL: the sitemap named ${#PAGES[@]} page(s), which is too few to be the real list." >&2
  exit 2
fi

# How long a page has to answer in. A switch, so the failure below can be produced on purpose
# rather than waited for: CP_PAGE_TIMEOUT=0.05 makes every fetch break off mid-transfer.
PAGE_TIMEOUT="${CP_PAGE_TIMEOUT:-15}"
fetch_failed=0

for path in "${PAGES[@]}"; do
  response=$(curl -s -m "$PAGE_TIMEOUT" -w '\n%{http_code}\n%{content_type}' "$BASE$path" 2>/dev/null)
  # curl's own verdict, which this script ignored until 2026-09-23.
  #
  # "pages say nothing obviously wrong" failed twice, at 22:25 on 22.09. and 01:26 on 23.09., both
  # times reporting "/ has no title" on a page whose title is at byte 132 of 59,621 and has never
  # been missing. A transfer that breaks off after the response header still reports 200 in -w,
  # and an empty body then leaves `html` empty, so every content check fails at once and the first
  # one to speak is the title. The page was fine; the fetch was not, and the report said the
  # opposite of what happened.
  #
  # A fetch that did not complete is not evidence about the page, so it ends the run as
  # undetermined instead of accusing it. ops/check-all.sh already treats exit 2 that way.
  rc=$?
  if (( rc != 0 )); then
    echo "COULD NOT TELL: $path did not transfer (curl exit $rc). That says nothing about the page." >&2
    fetch_failed=1
    continue
  fi
  code=$(printf '%s' "$response" | tail -2 | head -1)
  ctype=$(printf '%s' "$response" | tail -1)
  html=$(printf '%s' "$response" | sed '$d' | sed '$d')

  before=$failures
  [[ "$code" == "200" ]] || { bad "$path answers $code"; continue; }
  # A 200 with nothing behind it is the same thing wearing a success code, and it produced that
  # same "has no title" without curl ever reporting an error.
  if [[ -z "$html" ]]; then
    echo "COULD NOT TELL: $path answered 200 with an empty body. That is a transfer, not a page." >&2
    fetch_failed=1
    continue
  fi
  [[ "$ctype" == text/html* ]] || bad "$path is $ctype, not HTML"

  # Text without markup: a sentence split across two elements is still a sentence to a reader.
  text=$(printf '%s' "$html" | sed -e 's/<[^>]*>/ /g' -e 's/  */ /g')

  # A body that arrived but has no title is the failure this script has reported three times, at
  # 22:25 on 22.09. and at 01:26 and 05:40 on 23.09., each time naming a title that is at byte 132
  # of the page and has never been missing: ten fetches in a row a minute later all carried it.
  # Guessing has now cost three cycles, so the evidence gets kept instead.
  # Bash pattern matching, not a pipe into grep -q. That pipe is what produced the failure this
  # block used to report: grep -q exits the moment it matches, printf keeps writing into a closed
  # pipe and takes SIGPIPE, and `set -o pipefail` at the top of this file turns the pipeline status
  # into 141. The condition then reads as "no title" on a page whose title grep had just found.
  #
  # Measured on 2026-09-23 against the kept body of a run that failed: 7 of 60 runs reported no
  # title, 0 of 60 without pipefail, 0 of 60 with the pattern match below. It only ever hit / and
  # /jobs because at 60 and 65 KB printf is still writing when grep is already done, which is why
  # it looked random and why it survived three cycles.
  if [[ ! "$html" =~ \<title\>[^\<] ]]; then
    # .scratch and not /tmp. The first version of this trap wrote to /tmp, the file was gone
    # within the hour, and the re-measurement it existed for only worked because the page is live
    # and could be fetched again. A failure that happens once would have left nothing. .scratch is
    # in the repository directory, is gitignored, and survives a restart.
    evidence="${CP_EVIDENCE_DIR:-$(cd "$(dirname "$0")/.." && pwd)/.scratch/evidence}"
    mkdir -p "$evidence" 2>/dev/null
    keep="$evidence/cp-notitle-$(date -u +%Y%m%dT%H%M%S)-$(printf '%s' "$path" | tr -c 'a-zA-Z0-9' '_').html"
    if printf '%s' "$html" > "$keep" 2>/dev/null; then
      bad "$path has no title" "body kept at $keep, $(printf '%s' "$html" | wc -c | tr -d ' ') bytes, http $code, type $ctype"
    else
      # The body is the whole point of this branch, so failing to keep it is worth saying out
      # loud rather than reporting the finding as if the evidence were safe.
      bad "$path has no title" "COULD NOT KEEP THE BODY at $keep. $(printf '%s' "$html" | wc -c | tr -d ' ') bytes, http $code, type $ctype"
    fi
  fi
  [[ "$(printf '%s' "$html" | grep -c '<h1')" == "1" ]] || bad "$path does not have exactly one h1"

  for leftover in '<!--MARKET-->' '<!--NUMBERS-->' '${' 'undefined' 'NaN' '[object Object]'; do
    # Same reason as the title check above: no pipe, no SIGPIPE, no false alarm. A literal
    # comparison here, because these are fixed strings and not patterns.
    if [[ "$html" == *"$leftover"* ]]; then
      bad "$path still contains $leftover" "$(printf '%s' "$text" | grep -oF -m1 -A0 "$leftover" | head -1)"
    fi
  done

  # The plural that keeps slipping, against a named list so prose does not raise false alarms.
  mismatch=$(printf '%s' "$text" | grep -oE '\b1 (jobs|agents|submissions|services|providers|wallets|tests|calls|attempts|buyers|receipts|entries)\b' | head -1)
  [[ -z "$mismatch" ]] || bad "$path says \"$mismatch\"" "one of something does not take the plural"

  (( failures == before )) && ok "$path: 200 HTML, one h1, nothing unrendered"
done

# The card a link unfurls into, per page, because a broken one is invisible until somebody shares.
for image in /og.png /og-x402.png; do
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$image")
  [[ "$code" == "200" ]] && ok "$image: 200" || bad "$image answers $code"
done

# Every path any page offers has to exist, or that page sends people into a wall.
#
# This covered the landing page alone until 2026-09-22. The adversarial read of that day checked
# every link by hand and found them sound, and since then sections have come and gone on /post,
# /fix, /conway and /jobs. A guarantee that covers one page out of eight is no guarantee for the
# other seven.
checked=0
key_only=""
for page in "${PAGES[@]}"; do
  targets=$(curl -s -m 15 "$BASE$page" | grep -oE 'href="/[a-z0-9./#-]*"' | sed 's/href="//;s/"//' | cut -d'#' -f1 | grep -v '^$' | sort -u)
  for target in $targets; do
    code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$target")
    checked=$((checked + 1))
    [[ "$code" =~ ^(200|302)$ ]] && continue
    # A 401 on a /v1/ path is not a wall, it is the condition the page states: /terms links
    # /v1/credits/history and says next to it that the receipt needs your own key. Named out loud,
    # so the exception cannot hide a link that really is dead.
    if [[ "$code" == "401" && "$target" == /v1/* ]]; then
      key_only="$key_only $page->$target"
      continue
    fi
    bad "$page links $target, which answers $code"
  done
done
ok "every internal link on every page resolves ($checked link(s))"
[[ -n "$key_only" ]] && echo "        (key-only by design:$key_only)"

# And the anchors into the repository documentation.
#
# Three pages send a reader to a heading in a Markdown file on `main`. A heading rename kills such
# a link silently, and one was renamed this very morning ("The four calls" became "Three calls and
# a signature"); none of the three pointed at it, which was luck rather than care. Checked against
# the file as `main` serves it, because that is what the reader gets, and against the working tree,
# because that is what the next deploy will mean.
python3 - "$BASE" <<'PY_ANCHORS' || failures=$((failures + 1))
import re, subprocess, sys, urllib.request

def anchor(line):
    t = line.strip().lstrip("#").strip().lower()
    return re.sub(r"\s+", "-", re.sub(r"[^\w\s-]", "", t))

base = sys.argv[1]
pages = ["/", "/post", "/jobs", "/receipts", "/x402", "/conway", "/terms", "/fix"]
pattern = re.compile(r"https://github\.com/matthiashippe/control-plane/blob/main/([\w./-]+)#([\w-]+)")
found, bad_count = set(), 0
for path in pages:
    req = urllib.request.Request(base + path, headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        for file, mark in pattern.findall(r.read().decode("utf-8", "replace")):
            found.add((path, file, mark))

for path, file, mark in sorted(found):
    for where in ("origin/main", "worktree"):
        if where == "worktree":
            try:
                text = open(file).read()
            except OSError:
                text = ""
        else:
            text = subprocess.run(["git", "show", f"{where}:{file}"], capture_output=True, text=True).stdout
        if not text:
            print(f"  FAILED  {path} links {file}#{mark}, and {file} is not in {where}")
            bad_count += 1
            continue
        if mark not in {anchor(ln) for ln in text.splitlines() if ln.startswith("#")}:
            print(f"  FAILED  {path} links {file}#{mark}, and no heading in {where} makes that anchor")
            bad_count += 1
if bad_count:
    print(f"  {bad_count} dead documentation anchor(s)")
    raise SystemExit(1)
print(f"  ok      all {len(found)} documentation anchor(s) resolve, on main and in the working tree")
PY_ANCHORS

echo
# A run that could not fetch something has not checked it, and "PAGES OK" would be a claim about
# a page nobody looked at. It is decided before the verdict is printed, not after, because the
# first version printed both and the summary line of ops/check-all.sh shows the last line of the
# output: it marked the check undetermined and captioned it "PAGES OK".
if (( fetch_failed == 1 )); then
  echo "PAGES UNDETERMINED: at least one page did not transfer, so this run judges nothing."
  exit 2
fi
if (( failures == 0 )); then echo "PAGES OK"; else echo "PAGES FAILED: $failures"; fi
exit $(( failures == 0 ? 0 : 1 ))
