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
#   ops/seiten-pruefen.sh [base]
set -uo pipefail
BASE="${1:-${CP_URL:-https://cp.hippe.eu}}"
fehler=0
ok()   { echo "ok      $1"; }
bad()  { fehler=$((fehler+1)); echo "FAILED  $1"; [[ -n "${2:-}" ]] && echo "        $2"; }

# One list, used by both loops below. Two literals would drift the day a page is added.
SEITEN=(/ /post /terms /jobs /receipts /x402 /conway /fix)

for pfad in "${SEITEN[@]}"; do
  antwort=$(curl -s -m 15 -w '\n%{http_code}\n%{content_type}' "$BASE$pfad" 2>/dev/null)
  code=$(printf '%s' "$antwort" | tail -2 | head -1)
  typ=$(printf '%s' "$antwort" | tail -1)
  html=$(printf '%s' "$antwort" | sed '$d' | sed '$d')

  vorher=$fehler
  [[ "$code" == "200" ]] || { bad "$pfad answers $code"; continue; }
  [[ "$typ" == text/html* ]] || bad "$pfad is $typ, not HTML"

  # Text without markup: a sentence split across two elements is still a sentence to a reader.
  text=$(printf '%s' "$html" | sed -e 's/<[^>]*>/ /g' -e 's/  */ /g')

  printf '%s' "$html" | grep -q '<title>[^<]' || bad "$pfad has no title"
  [[ "$(printf '%s' "$html" | grep -c '<h1')" == "1" ]] || bad "$pfad does not have exactly one h1"

  for rest in '<!--MARKET-->' '<!--NUMBERS-->' '${' 'undefined' 'NaN' '[object Object]'; do
    if printf '%s' "$html" | grep -qF "$rest"; then
      bad "$pfad still contains $rest" "$(printf '%s' "$text" | grep -oF -m1 -A0 "$rest" | head -1)"
    fi
  done

  # The plural that keeps slipping, against a named list so prose does not raise false alarms.
  schief=$(printf '%s' "$text" | grep -oE '\b1 (jobs|agents|submissions|services|providers|wallets|tests|calls|attempts|buyers|receipts|entries)\b' | head -1)
  [[ -z "$schief" ]] || bad "$pfad says \"$schief\"" "one of something does not take the plural"

  (( fehler == vorher )) && ok "$pfad: 200 HTML, one h1, nothing unrendered"
done

# The card a link unfurls into, per page, because a broken one is invisible until somebody shares.
for bild in /og.png /og-x402.png; do
  code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$bild")
  [[ "$code" == "200" ]] && ok "$bild: 200" || bad "$bild answers $code"
done

# Every path any page offers has to exist, or that page sends people into a wall.
#
# This covered the landing page alone until 2026-09-22. The adversarial read of that day checked
# every link by hand and found them sound, and since then sections have come and gone on /post,
# /fix, /conway and /jobs. A guarantee that covers one page out of eight is no guarantee for the
# other seven.
geprueft=0
schluesselpflichtig=""
for seite in "${SEITEN[@]}"; do
  ziele=$(curl -s -m 15 "$BASE$seite" | grep -oE 'href="/[a-z0-9./#-]*"' | sed 's/href="//;s/"//' | cut -d'#' -f1 | grep -v '^$' | sort -u)
  for ziel in $ziele; do
    code=$(curl -s -m 15 -o /dev/null -w '%{http_code}' "$BASE$ziel")
    geprueft=$((geprueft + 1))
    [[ "$code" =~ ^(200|302)$ ]] && continue
    # A 401 on a /v1/ path is not a wall, it is the condition the page states: /terms links
    # /v1/credits/history and says next to it that the receipt needs your own key. Named out loud,
    # so the exception cannot hide a link that really is dead.
    if [[ "$code" == "401" && "$ziel" == /v1/* ]]; then
      schluesselpflichtig="$schluesselpflichtig $seite->$ziel"
      continue
    fi
    bad "$seite links $ziel, which answers $code"
  done
done
ok "every internal link on every page resolves ($geprueft link(s))"
[[ -n "$schluesselpflichtig" ]] && echo "        (key-only by design:$schluesselpflichtig)"

# And the anchors into the repository documentation.
#
# Three pages send a reader to a heading in a Markdown file on `main`. A heading rename kills such
# a link silently, and one was renamed this very morning ("The four calls" became "Three calls and
# a signature"); none of the three pointed at it, which was luck rather than care. Checked against
# the file as `main` serves it, because that is what the reader gets, and against the working tree,
# because that is what the next deploy will mean.
python3 - "$BASE" <<'PY_ANKER' || fehler=$((fehler + 1))
import re, subprocess, sys, urllib.request

def anker(zeile):
    t = zeile.strip().lstrip("#").strip().lower()
    return re.sub(r"\s+", "-", re.sub(r"[^\w\s-]", "", t))

basis = sys.argv[1]
seiten = ["/", "/post", "/jobs", "/receipts", "/x402", "/conway", "/terms", "/fix"]
muster = re.compile(r"https://github\.com/matthiashippe/control-plane/blob/main/([\w./-]+)#([\w-]+)")
gefunden, schlecht = set(), 0
for pfad in seiten:
    req = urllib.request.Request(basis + pfad, headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    with urllib.request.urlopen(req, timeout=15) as r:
        for datei, marke in muster.findall(r.read().decode("utf-8", "replace")):
            gefunden.add((pfad, datei, marke))

for pfad, datei, marke in sorted(gefunden):
    for wo in ("origin/main", "worktree"):
        if wo == "worktree":
            try:
                text = open(datei).read()
            except OSError:
                text = ""
        else:
            text = subprocess.run(["git", "show", f"{wo}:{datei}"], capture_output=True, text=True).stdout
        if not text:
            print(f"  FAILED  {pfad} links {datei}#{marke}, and {datei} is not in {wo}")
            schlecht += 1
            continue
        if marke not in {anker(z) for z in text.splitlines() if z.startswith("#")}:
            print(f"  FAILED  {pfad} links {datei}#{marke}, and no heading in {wo} makes that anchor")
            schlecht += 1
if schlecht:
    print(f"  {schlecht} dead documentation anchor(s)")
    raise SystemExit(1)
print(f"  ok      all {len(gefunden)} documentation anchor(s) resolve, on main and in the working tree")
PY_ANKER

echo
if (( fehler == 0 )); then echo "PAGES OK"; else echo "PAGES FAILED: $fehler"; fi
exit $(( fehler == 0 ? 0 : 1 ))
