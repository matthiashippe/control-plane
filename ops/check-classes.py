#!/usr/bin/env python3
"""Does every class the pages use exist in the stylesheet they are served with?

`seite()` in src/app.ts builds every sub-page from the landing page's <head>, so /post, /terms,
/conway, /x402, /jobs and /receipts all carry whatever stylesheet the landing page carries. On
2026-09-21 the landing page was rewritten and its CSS replaced wholesale, which took ten classes
with it that only the sub-pages use: `.ph` is the heading on every one of them, `.narrow` their
column width, and `.stats`, `.claims`, `.card`, `.n`, `.l`, `.good`, `.bad` and `.t` carry the
rest. Five pages went out styled against rules that no longer existed.

`ops/check-pages.sh` said PAGES OK the whole time, because it checks a status code, one h1 and
no unrendered placeholder, and a class that resolves to nothing is none of those.

This reads the served HTML, not the source: a class can also go missing because a build step drops
it, and the reader gets the served bytes either way.

What this does not see, and it cost a cycle to learn: a class having a rule is not the same as a
class being styled right. On 2026-09-21 the restored stylesheet kept `.stats .n` and lost `.stats`,
so /conway showed its four figures one per row, correctly formatted and in the wrong place, and
this script said CLASSES OK. `.kicker` survived only inside `#market .kicker { display: none }`,
which is a rule, so that passed too while the kicker rendered as ordinary body text.

Rules whose selector carries an `#id` are therefore not counted: an id belongs to one place on one
page and cannot be what makes a class work wherever it is used. That much is exact. The rest is not
checkable without a CSS engine, so nothing here replaces looking at the page.

The same day, `pre` and inline `code` lost their panel and their chip on the sub-pages for the same
reason, and an element check was written here to catch it. It was removed again within the hour:
`code, pre, .mono { font-family: var(--mono) }` survived the rewrite, so the elements were still
mentioned in a rule and the check passed against the broken page. Telling "mentioned" from "styled"
means knowing which properties matter for which element, which is taste, and a check that cannot
fail is worse than no check because it reads as coverage. What is left is the class check, which
does fail when it should, and the habit of opening the page.

    ops/check-classes.py [base-url]

Exit 0 all classes defined, 1 something renders unstyled, 2 a page could not be fetched.
"""
import re
import sys
import urllib.error
import urllib.request

def pages_from_sitemap(base: str) -> list[str]:
    """Which pages to check, asked of the service instead of kept here.

    This array used to be seven paths and had lost two of them: /fix was never added, and /check
    shipped on 2026-09-22 while three separate hand-kept lists across this repo stayed at their old
    length. A class with no rule on the newest page is exactly the thing this script exists to
    catch, and it could not see the page.

    An empty or improbably short list raises rather than silently checking nothing.
    """
    try:
        xml = fetch(base + "/sitemap.xml")
    except Exception as e:  # noqa: BLE001 - any failure here means the list is unknown, not empty
        print(f"COULD NOT TELL: the sitemap at {base} was not readable: {e}", file=sys.stderr)
        raise SystemExit(2)
    # Match any host, not the one this script was told to use. Those were the same thing until
    # 2026-09-23, when the sitemap moved to postyourprice.com while base still said cp.hippe.eu:
    # the pattern matched nothing, paths came back empty, and this printed "the sitemap named 0
    # page(s)" about a sitemap with nine of them.
    paths = [m or "/" for m in re.findall(r"<loc>https?://[^/]*([^<]*)</loc>", xml)]
    if len(paths) < 5:
        print(
            f"COULD NOT TELL: the sitemap named {len(paths)} page(s), too few to be the real list.",
            file=sys.stderr,
        )
        raise SystemExit(2)
    return paths



def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "https://cp.hippe.eu").rstrip("/")
    failures = 0
    for path in pages_from_sitemap(base):
        try:
            html = fetch(base + path)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"ERROR   {path}: {e}")
            return 2
        style = "".join(re.findall(r"<style>([\s\S]*?)</style>", html))
        if not style:
            print(f"FAILED  {path}: no stylesheet in the served page at all")
            failures += 1
            continue
        # An id-scoped rule styles one place on one page and cannot be what makes a class work
        # wherever it is used, so those selectors do not count as a definition.
        without_id = "\n".join(
            rule for rule in re.findall(r"[^{}]+\{[^{}]*\}", style) if "#" not in rule.split("{")[0]
        )
        defined = set(re.findall(r"\.([A-Za-z][\w-]*)", without_id))
        # Inside an <svg> a class is as often a name as a hook: `n0`, `a1`, `wires`, `marks` say
        # which box is which and are never meant to be styled, while the rules that do style the
        # diagram reach in from outside (`.flow .w1`). Counting those would mean keeping an
        # allow-list, and an allow-list is a hole in a check. Cutting the SVGs out is exact.
        without_svg = re.sub(r"<svg[\s\S]*?</svg>", " ", html)
        used: set[str] = set()
        for attr in re.findall(r'class="([^"]*)"', without_svg):
            used.update(k for k in attr.split() if k)
        unstyled = sorted(used - defined)

        if unstyled:
            print(f"FAILED  {path}: {len(unstyled)} class(es) with no rule: {', '.join(unstyled[:8])}")
            failures += 1
        else:
            print(f"ok      {path}: {len(used)} class(es), every one of them styled")
    print()
    if failures:
        print(f"CLASSES FAILED: {failures} page(s) render against rules that do not exist")
        return 1
    print("CLASSES OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
