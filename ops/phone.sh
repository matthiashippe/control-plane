#!/usr/bin/env bash
# Does a page fit a phone, measured at a phone width that headless Chrome actually applies?
#
# Twelve of the sixty foreign addresses in the access log to 2026-09-23 carried a phone user agent,
# and nothing had ever checked what they saw. A page that overflows sideways on a phone shows a
# reader half a sentence and a horizontal scrollbar, and nobody reports it: they leave.
#
# **--window-size below 500 does not do what it says.** Measured on 2026-09-23: 320, 375, 390 and
# 500 all report window.innerWidth === 500 in headless Chrome, and only at 800 does it follow. So
# every measurement at a phone width taken that way is a measurement at 500 px, and it says nothing
# about a phone. That is why this loads the page inside an iframe of the wanted width, where the
# width is honoured and media queries fire against it.
#
# It also needs --allow-file-access-from-files to read into the frame, and a timer rather than the
# frame's load event, which does not fire reliably here.
#
#   ops/phone.sh                  the landing page, /check and /fix at 320, 390 and 430
#   ops/phone.sh 390 /terms       one width, one path
#   ops/phone.sh --selftest       proves it catches an overflow that is really there
#
# Exit 0: everything fits. Exit 1: something overflows, with the elements named.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

# An element wider than the viewport is only a fault when its parent does not scroll. A <pre> with
# overflow-x: auto is supposed to hold a long line and scroll inside itself; counting its child as
# an overflow reports every code block on the site as broken, which the first version did.
probe() {
  cat <<'JS'
<script>
function measure() {
  var f = document.getElementById("f"), d, w;
  try { d = f.contentDocument; w = f.contentWindow; } catch (e) { document.title = "BLOCKED " + e.message; return; }
  if (!d || !d.body || !d.body.firstChild) { setTimeout(measure, 150); return; }
  var over = [];
  d.querySelectorAll("body *").forEach(function (el) {
    var r = el.getBoundingClientRect();
    var p = el.parentElement;
    var scrolls = p && getComputedStyle(p).overflowX !== "visible";
    if (!scrolls && r.right > w.innerWidth + 1) {
      over.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") + "->" + Math.round(r.right));
    }
  });
  // Try to scroll sideways and see whether anything moves. document.scrollWidth wider than the
  // viewport is NOT the same thing: /jobs reports 439 in a 430 px frame at every width and does not
  // budge when you scroll it, because a child that scrolls inside itself still widens that number.
  // A rule built on scrollWidth alone reported a fault on /jobs that a reader cannot experience,
  // which is a false alarm and costs the next cycle an hour.
  w.scrollTo(300, 0);
  var moved = w.scrollX;
  w.scrollTo(0, 0);
  document.title = "V=" + w.innerWidth + " SCROLLW=" + d.documentElement.scrollWidth +
    " MOVED=" + moved +
    " OVER=" + over.length + (over.length ? " :: " + over.slice(0, 4).join(" | ") : "");
}
setTimeout(measure, 400);
</script>
JS
}

one() { # width path
  local width="$1" path="$2" name
  name="$(printf '%s' "$path" | tr -c 'a-zA-Z0-9' '_')"
  if [[ -n "${CP_PHONE_HTML:-}" ]]; then
    cp "$CP_PHONE_HTML" "$WORK/page-$name.html"
  elif ! curl -sS -m 20 "$BASE$path" -o "$WORK/page-$name.html"; then
    echo "  COULD NOT TELL  $path did not answer"; return 2
  fi
  {
    printf '<!doctype html><html><head><title>pending</title><style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    printf '<iframe id="f" src="page-%s.html" width="%s" height="900"></iframe>' "$name" "$width"
    probe
    printf '</body></html>'
  } > "$WORK/frame-$name-$width.html"
  "$CHROME" --headless --disable-gpu --no-sandbox --allow-file-access-from-files \
    --window-size=1000,1000 --virtual-time-budget=6000 \
    --dump-dom "file://$WORK/frame-$name-$width.html" 2>/dev/null \
    | grep -oE '<title>[^<]*' | sed 's/<title>//'
}

if [[ "${1:-}" == "--selftest" ]]; then
  # A page that really does overflow, so a run that finds nothing is distinguishable from a run
  # that cannot see. Without this the tool passes on a blank page just as happily.
  cat > "$WORK/bad.html" <<'HTML'
<!doctype html><html><head><title>t</title></head><body>
<div style="width:1200px;background:#eee">far too wide for a phone</div>
</body></html>
HTML
  echo "must report an overflow:"
  CP_PHONE_HTML="$WORK/bad.html" one 390 /selftest
  cat > "$WORK/good.html" <<'HTML'
<!doctype html><html><head><title>t</title></head><body>
<div style="max-width:100%;background:#eee">fits</div>
</body></html>
HTML
  echo "must report none:"
  CP_PHONE_HTML="$WORK/good.html" one 390 /selftest
  exit 0
fi

if [[ -n "${1:-}" ]]; then
  WIDTHS=("$1"); PATHS=("${2:-/}")
else
  WIDTHS=(320 390 430); PATHS=(/ /check /fix /post /jobs /terms)
fi

echo "Does it fit a phone? $BASE"
echo
failures=0
for width in "${WIDTHS[@]}"; do
  echo "  at ${width} px"
  for path in "${PATHS[@]}"; do
    line="$(one "$width" "$path")"
    printf '    %-10s %s\n' "$path" "$line"
    # Two faults, both of which a reader can feel: an element sticking out past the viewport, and
    # the page actually moving when you push it sideways. MOVED is measured by scrolling, not
    # inferred from scrollWidth, which reads 439 on /jobs in a 430 px frame while the page does not
    # budge. A rule built on scrollWidth alone raises a fault nobody can experience.
    moved="$(printf '%s' "$line" | sed -n 's/.*MOVED=\([0-9]*\).*/\1/p')"
    if [[ "$line" != *"OVER=0"* ]]; then
      failures=$((failures + 1))
    elif [[ -n "$moved" && "$moved" -gt 0 ]]; then
      printf '               and the page really moves sideways: scrolled to %s px\n' "$moved"
      failures=$((failures + 1))
    fi
  done
done
echo
if [[ "$failures" -gt 0 ]]; then
  echo "OVERFLOW: $failures page/width combination(s) push past the viewport."
  exit 1
fi
echo "FITS: nothing pushes past the viewport at any of these widths."
