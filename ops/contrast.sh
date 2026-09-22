#!/usr/bin/env bash
# Is the text readable, in both colour schemes?
#
# The stylesheet carries a light scheme behind @media (prefers-color-scheme: light) and nobody had
# ever seen it. **Headless Chrome reports dark regardless**, with or without --force-dark-mode:
# measured on 2026-09-23, window.matchMedia("(prefers-color-scheme: dark)").matches is true in a
# plain run. So every screenshot and every measurement this project has taken was of the dark
# scheme, and the light one, which is what most phones show in daylight, was unseen code.
#
# --blink-settings=preferredColorScheme=1 forces light. There is no flag for dark and none is
# needed: a plain headless run already reports dark, which is the whole reason the light scheme was
# unseen. (preferredColorScheme=2 hangs rather than switching, measured twice.) --force-dark-mode
# does not change the media query at all.
#
# What it measures: the WCAG contrast ratio of every text node against the background actually
# painted behind it. 4.5 is the threshold for body text, 3.0 for text at 24 px or above, or 18.66 px
# bold. Below that a sighted reader in sunlight loses the sentence.
#
#   ops/contrast.sh                 both schemes, the pages a stranger opens
#   ops/contrast.sh --quick         light only, three pages, for ops/check-all.sh
#   ops/contrast.sh light /terms    one scheme, one page
#   ops/contrast.sh --selftest      proves it catches grey on grey
#
# Exit 0: everything readable. Exit 1: something is not. Exit 2: no Chrome.
set -uo pipefail
cd "$(dirname "$0")/.."

BASE="${CP_URL:-https://cp.hippe.eu}"
CHROME="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT

if [[ ! -x "$CHROME" ]]; then
  echo "COULD NOT TELL: no Chrome at $CHROME. Set CHROME_BIN." >&2
  exit 2
fi

probe() {
  cat <<'JS'
<script>
// Chrome hands back two formats and they use different scales. `rgb(20, 23, 15)` is 0..255 and
// `color(srgb 0.984314 0.984314 0.964706 / 0.76)` is 0..1 with an alpha. The first version of this
// divided everything by 255, so every srgb() colour came out as near-black, and it reported the
// whole header of the landing page as 1.01 contrast, which is invisible text. The header is fine.
// Measuring the measurement is the only reason that was caught before something got "fixed".
function parse(c) {
  var nums = (c.match(/-?\d+(\.\d+)?/g) || []).map(Number);
  var srgb = /^color\(/.test(c);
  var rgb = nums.slice(0, 3).map(function (v) { return srgb ? v : v / 255; });
  var alpha = nums.length > 3 ? nums[3] : 1;
  return { rgb: rgb, a: isNaN(alpha) ? 1 : alpha };
}
// A half-transparent colour is not the colour a reader sees. Composite it onto what is behind it,
// which is what the browser paints.
function over(fg, bg) {
  return fg.rgb.map(function (v, i) { return v * fg.a + bg.rgb[i] * (1 - fg.a); });
}
function lumOf(rgb) {
  var f = rgb.map(function (v) {
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
}
function ratio(fgStr, bgStr, pageStr) {
  var page = parse(pageStr || "rgb(255,255,255)");
  var bg = parse(bgStr);
  var bgRgb = over(bg, page);
  var fg = parse(fgStr);
  var fgRgb = over(fg, { rgb: bgRgb, a: 1 });
  var l1 = lumOf(fgRgb), l2 = lumOf(bgRgb);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
// The background actually painted behind an element, which is usually an ancestor's. Reading the
// element's own background-color gives rgba(0,0,0,0) for almost everything and would score every
// paragraph on the page as pure black on its own colour.
function behind(el, win) {
  for (var n = el; n; n = n.parentElement) {
    var bg = win.getComputedStyle(n).backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(bg)) return bg;
  }
  return win.getComputedStyle(win.document.body).backgroundColor || "rgb(255,255,255)";
}
function measure() {
  var f = document.getElementById("f"), d, w;
  try { d = f.contentDocument; w = f.contentWindow; } catch (e) { document.title = "BLOCKED"; return; }
  if (!d || !d.body || !d.body.firstChild) { setTimeout(measure, 150); return; }
  var bad = [], checked = 0;
  d.querySelectorAll("body *").forEach(function (el) {
    var text = "";
    for (var i = 0; i < el.childNodes.length; i++) {
      if (el.childNodes[i].nodeType === 3) text += el.childNodes[i].textContent;
    }
    if (!text.trim()) return;
    var cs = w.getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || parseFloat(cs.opacity) < 0.1) return;
    var size = parseFloat(cs.fontSize), weight = parseInt(cs.fontWeight, 10) || 400;
    var large = size >= 24 || (size >= 18.66 && weight >= 700);
    var need = large ? 3.0 : 4.5;
    var r = ratio(cs.color, behind(el, w), w.getComputedStyle(d.body).backgroundColor);
    checked++;
    if (r < need) {
      bad.push(el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "") +
        " " + r.toFixed(2) + "<" + need + " " + JSON.stringify(text.trim().slice(0, 24)));
    }
  });
  document.title = "CHECKED=" + checked + " BAD=" + bad.length + (bad.length ? " :: " + bad.slice(0, 4).join(" | ") : "");
}
setTimeout(measure, 500);
</script>
JS
}

one() { # scheme path
  local scheme="$1" path="$2" name flag
  name="$(printf '%s' "$path" | tr -c 'a-zA-Z0-9' '_')"
  # Light needs the flag; dark is what headless Chrome already reports, with or without one.
  # preferredColorScheme=2 hangs here rather than switching, measured twice on 2026-09-23, so dark
  # runs with no flag at all. That is not a workaround: a plain run IS the dark scheme, which is
  # exactly why the light one had never been seen.
  flag=""; [[ "$scheme" == "light" ]] && flag="--blink-settings=preferredColorScheme=1"
  if [[ -n "${CP_CONTRAST_HTML:-}" ]]; then
    cp "$CP_CONTRAST_HTML" "$WORK/p-$name.html"
  elif ! curl -sS -m 20 "$BASE$path" -o "$WORK/p-$name.html"; then
    echo "  COULD NOT TELL  $path did not answer"; return 2
  fi
  {
    printf '<!doctype html><html><head><title>pending</title><style>html,body{margin:0}iframe{border:0;display:block}</style></head><body>'
    printf '<iframe id="f" src="p-%s.html" width="900" height="900"></iframe>' "$name"
    probe
    printf '</body></html>'
  } > "$WORK/f-$name-$scheme.html"
  "$CHROME" --headless --disable-gpu --no-sandbox --allow-file-access-from-files \
    $flag --window-size=1000,1000 --virtual-time-budget=7000 \
    --dump-dom "file://$WORK/f-$name-$scheme.html" 2>/dev/null | grep -oE '<title>[^<]*' | sed 's/<title>//'
}

if [[ "${1:-}" == "--selftest" ]]; then
  cat > "$WORK/bad.html" <<'HTML'
<!doctype html><html><head><title>t</title></head>
<body style="background:#888"><p style="color:#999;font-size:14px">grey on grey, unreadable</p></body></html>
HTML
  echo "must report BAD=1:"
  CP_CONTRAST_HTML="$WORK/bad.html" one light /selftest
  cat > "$WORK/good.html" <<'HTML'
<!doctype html><html><head><title>t</title></head>
<body style="background:#fff"><p style="color:#111;font-size:14px">black on white, fine</p></body></html>
HTML
  echo "must report BAD=0:"
  CP_CONTRAST_HTML="$WORK/good.html" one light /selftest
  exit 0
fi

if [[ "${1:-}" == "--quick" ]]; then
  # For ops/check-all.sh. Light only, because dark is what every other measurement already sees,
  # and the three pages a stranger opens.
  SCHEMES=(light); PATHS=(/ /check /fix)
elif [[ -n "${1:-}" ]]; then
  SCHEMES=("$1"); PATHS=("${2:-/}")
else
  SCHEMES=(light dark); PATHS=(/ /check /fix /post /jobs /terms)
fi

echo "Is the text readable? $BASE"
echo
failures=0
for scheme in "${SCHEMES[@]}"; do
  echo "  $scheme"
  for path in "${PATHS[@]}"; do
    line="$(one "$scheme" "$path")"
    printf '    %-10s %s\n' "$path" "$line"
    [[ "$line" == *"BAD=0"* ]] || failures=$((failures + 1))
  done
done
echo
if [[ "$failures" -gt 0 ]]; then
  echo "UNREADABLE: $failures page/scheme combination(s) carry text below the WCAG threshold."
  exit 1
fi
echo "READABLE: every text node clears 4.5, or 3.0 where it is large."
