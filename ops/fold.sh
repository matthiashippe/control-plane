#!/usr/bin/env bash
# What does somebody see who does not scroll?
#
#   ops/fold.sh                 every page in the sitemap, at a phone width
#   ops/fold.sh 1440 900        at a desktop size
#   ops/fold.sh --selftest      prove it sees a hidden link as hidden and a real one as real
#   CP_FOLD_HTML=file ops/fold.sh   measure one local file instead of the live pages
#
# Why this exists. Of the 18 addresses that had ever loaded the landing page by 2026-09-23, 17
# left no mark below the fold. Everything this service offers was being judged on one screen, and
# nothing measured that screen. It turned out that /check, the only thing a person can do here
# without a key, an account, a terminal or any money, was unreachable on a phone: the nav link to
# it is display:none under 30rem and the one in the prose sat 117 px below the fold.
#
# Two things this measures that are easy to get wrong, both of which it got wrong first:
#
#   The headline. Reading only an element's OWN text nodes looks like the way to avoid counting a
#   paragraph twice, and it drops any heading whose lines are wrapped in spans, which this one is.
#   A measurement that cannot see the h1 is not a measurement of what a visitor sees. It now takes
#   the outermost element that carries text and skips anything inside one it already took.
#
#   Reachable. A link inside a collapsed menu still reports a rectangle, so a rectangle proves
#   nothing. The test is elementFromPoint at the link's centre, and it must find the link itself
#   or something inside it: `hit.contains(a)` was in there once and made every display:none link
#   reachable, because at the point where a hidden link reports (0,0) the topmost element is an
#   ancestor, and an ancestor contains it.
#
# The iframe is not decoration. headless Chrome reports innerWidth 500 for any --window-size below
# 500, so a phone width can only be had inside a frame. See ops/phone.sh, which found that.
set -uo pipefail
BASE="${CP_URL:-https://postyourprice.com}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
W="${1:-390}"
H="${2:-844}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

if [[ ! -x "$CHROME" ]]; then
  echo "COULD NOT TELL: no Chrome at $CHROME. Set CHROME_BIN." >&2
  exit 2
fi

probe_html() { # page-file width height
  cat > "$WORK/probe.html" <<HTML
<!doctype html><html><head><title>t</title>
<style>html,body{margin:0;padding:0}iframe{border:0;display:block}</style></head><body>
<pre id="out">PENDING</pre>
<iframe id="f" src="$1" width="$2" height="$3"></iframe>
<script>
var W = $2, H = $3;
var f = document.getElementById("f");
function measure() {
  var d, w;
  try { d = f.contentDocument; w = f.contentWindow; } catch (e) {
    document.getElementById("out").textContent = "BLOCKED " + e.message; return; }
  if (!d || !d.body || !d.body.firstChild) { setTimeout(measure, 200); return; }
  var out = { visible: [], cut: [], reachable: [], hidden: 0, links: 0, height: 0 };
  var taken = [];
  function ancestorTaken(el) {
    for (var t = 0; t < taken.length; t++) { if (taken[t].contains(el)) return true; }
    return false;
  }
  var all = d.querySelectorAll("h1,h2,h3,p,li,code,pre,blockquote");
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (ancestorTaken(el)) continue;
    var own = (el.textContent || "").replace(/\s+/g, " ").trim();
    if (!own) continue;
    var r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    taken.push(el);
    var entry = { tag: el.tagName.toLowerCase(), text: own.slice(0, 88), top: Math.round(r.top) };
    if (r.bottom <= H) out.visible.push(entry);
    else if (r.top < H) out.cut.push(entry);
  }
  var as = d.querySelectorAll("a[href]");
  out.links = as.length;
  for (var k = 0; k < as.length; k++) {
    var a = as[k], r2 = a.getBoundingClientRect();
    var t2 = (a.textContent || "").replace(/\s+/g, " ").trim();
    if (!t2) continue;
    var cs = w.getComputedStyle(a);
    if (cs.display === "none" || cs.visibility === "hidden" || r2.height === 0) { out.hidden++; continue; }
    var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;
    if (cx < 0 || cy < 0 || cx >= W || cy >= H) continue;
    var hit = d.elementFromPoint(cx, cy);
    if (!hit) continue;
    if (hit === a || a.contains(hit)) {
      out.reachable.push({ text: t2.slice(0, 34), href: a.getAttribute("href"), top: Math.round(r2.top) });
    }
  }
  out.height = d.documentElement.scrollHeight;
  document.getElementById("out").textContent = "RESULT " + JSON.stringify(out);
}
setTimeout(measure, 500);
</script></body></html>
HTML
  "$CHROME" --headless --disable-gpu --no-sandbox --allow-file-access-from-files \
    --virtual-time-budget=9000 --window-size=1700,1200 \
    --dump-dom "file://$WORK/probe.html" 2>/dev/null \
    | sed -n 's/.*<pre id="out">\(RESULT [^<]*\)<\/pre>.*/\1/p' | head -1
}

if [[ "${1:-}" == "--selftest" ]]; then
  # One link that is really there and one hidden the way this site hides its nav on a phone. A
  # checker that reports two is believing rectangles; one that reports none cannot see at all.
  cat > "$WORK/t.html" <<'HTML'
<!doctype html><html><head><title>t</title><style>.gone{display:none}</style></head><body>
<h1><span><span>A headline in spans</span></span></h1>
<p><a href="/here">visible link</a> <a class="gone" href="/gone">hidden link</a></p>
<p style="margin-top:2000px">far below the fold <a href="/deep">deep link</a></p>
</body></html>
HTML
  out="$(probe_html "$WORK/t.html" 390 844)"
  echo "$out"
  echo
  python3 - "$out" <<'PY'
import json, sys
raw = sys.argv[1]
d = json.loads(raw[len("RESULT "):]) if raw.startswith("RESULT ") else {}
reach = [r["href"] for r in d.get("reachable", [])]
heads = [v["text"] for v in d.get("visible", []) if v["tag"] == "h1"]
ok = ("/here" in reach) and ("/gone" not in reach) and ("/deep" not in reach) and heads
print("SELFTEST  reachable=%s hidden_counted=%s h1_seen=%s" % (reach, d.get("hidden"), heads))
if ok:
    print("SELFTEST OK  the real link is reachable, the hidden one is not, the deep one is not,")
    print("             and the headline in spans was seen.")
    raise SystemExit(0)
print("SELFTEST FAILED  it cannot tell those apart, so its counts mean nothing.")
raise SystemExit(1)
PY
  exit $?
fi

if [[ -n "${CP_FOLD_HTML:-}" ]]; then
  pages=("$CP_FOLD_HTML")
else
  pages=()
  while IFS= read -r line; do
    [[ -n "$line" ]] && pages+=("$line")
  # The host is stripped by pattern, not by comparing against BASE. Those two were the same thing
  # until 2026-09-23, when the sitemap moved to postyourprice.com while BASE still said
  # cp.hippe.eu: the substitution matched nothing and the page list filled with strings that equal
  # no path. Four tools then reported, quietly, that they could not judge anything.
  done < <(curl -s -m 15 "$BASE/sitemap.xml" | grep -oE '<loc>[^<]*' | sed -E 's|^<loc>https?://[^/]*||' | sed 's|^$|/|')
  if (( ${#pages[@]} < 5 )); then
    echo "COULD NOT TELL: the sitemap named ${#pages[@]} page(s)." >&2
    exit 2
  fi
fi

echo "What is on the first screen at ${W}x${H}, and what a thumb can reach there"
echo
thin=0
for path in "${pages[@]}"; do
  if [[ -n "${CP_FOLD_HTML:-}" ]]; then
    cp "$path" "$WORK/page.html"; name="$path"
  else
    name="$path"
    curl -sS -m 20 "$BASE$path" -o "$WORK/page.html" || { echo "  $name  did not answer"; continue; }
  fi
  out="$(probe_html "$WORK/page.html" "$W" "$H")"
  if [[ -z "$out" ]]; then echo "  $name  could not be measured"; continue; fi
  printf '%s\n' "$out" | CP_NAME="$name" CP_H="$H" python3 -c '
import json, os, sys
raw = sys.stdin.read().strip()
d = json.loads(raw[len("RESULT "):])
name, H = os.environ["CP_NAME"], int(os.environ["CP_H"])
reach = d["reachable"]
content = [r for r in reach if r["top"] > 60]
print("  %-10s %d of %d link(s) reachable, %d hidden by this width; page is %d px tall" % (
    name, len(reach), d["links"], d["hidden"], d["height"]))
for v in d["visible"][:4]:
    print("        %4d  %-5s %s" % (v["top"], v["tag"], v["text"][:70]))
for c in d["cut"][:1]:
    print("        %4d  %-5s %s  <- cut by the fold" % (c["top"], c["tag"], c["text"][:52]))
for r in content:
    print("        link %4d  %-30s -> %s" % (r["top"], r["text"][:30], r["href"][:44]))
if not content:
    print("        no link below the header is reachable on this screen")
    sys.exit(3)
' || thin=$((thin+1))
  echo
done

if (( thin > 0 )); then
  echo "$thin page(s) offer nothing to tap below the header on this screen."
fi
