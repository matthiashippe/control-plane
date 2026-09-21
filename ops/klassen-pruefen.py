#!/usr/bin/env python3
"""Does every class the pages use exist in the stylesheet they are served with?

`seite()` in src/app.ts builds every sub-page from the landing page's <head>, so /post, /terms,
/conway, /x402, /jobs and /receipts all carry whatever stylesheet the landing page carries. On
2026-09-21 the landing page was rewritten and its CSS replaced wholesale, which took ten classes
with it that only the sub-pages use: `.ph` is the heading on every one of them, `.narrow` their
column width, and `.stats`, `.claims`, `.card`, `.n`, `.l`, `.good`, `.bad` and `.t` carry the
rest. Five pages went out styled against rules that no longer existed.

`ops/seiten-pruefen.sh` said PAGES OK the whole time, because it checks a status code, one h1 and
no unrendered placeholder, and a class that resolves to nothing is none of those.

This reads the served HTML, not the source: a class can also go missing because a build step drops
it, and the reader gets the served bytes either way.

    ops/klassen-pruefen.py [base-url]

Exit 0 all classes defined, 1 something renders unstyled, 2 a page could not be fetched.
"""
import re
import sys
import urllib.error
import urllib.request

SEITEN = ["/", "/post", "/terms", "/jobs", "/receipts", "/x402", "/conway"]


def hole(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "control-plane-check/1.0 (+https://cp.hippe.eu)"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def main() -> int:
    basis = (sys.argv[1] if len(sys.argv) > 1 else "https://cp.hippe.eu").rstrip("/")
    fehler = 0
    for pfad in SEITEN:
        try:
            html = hole(basis + pfad)
        except (urllib.error.URLError, TimeoutError) as e:
            print(f"FEHLER  {pfad}: {e}")
            return 2
        stil = "".join(re.findall(r"<style>([\s\S]*?)</style>", html))
        if not stil:
            print(f"FAILED  {pfad}: no stylesheet in the served page at all")
            fehler += 1
            continue
        definiert = set(re.findall(r"\.([A-Za-z][\w-]*)", stil))
        # Inside an <svg> a class is as often a name as a hook: `n0`, `a1`, `wires`, `marks` say
        # which box is which and are never meant to be styled, while the rules that do style the
        # diagram reach in from outside (`.flow .w1`). Counting those would mean keeping an
        # allow-list, and an allow-list is a hole in a check. Cutting the SVGs out is exact.
        ohne_svg = re.sub(r"<svg[\s\S]*?</svg>", " ", html)
        benutzt: set[str] = set()
        for attr in re.findall(r'class="([^"]*)"', ohne_svg):
            benutzt.update(k for k in attr.split() if k)
        offen = sorted(benutzt - definiert)
        if offen:
            print(f"FAILED  {pfad}: {len(offen)} class(es) with no rule: {', '.join(offen[:8])}")
            fehler += 1
        else:
            print(f"ok      {pfad}: {len(benutzt)} class(es), every one of them styled")
    print()
    if fehler:
        print(f"CLASSES FAILED: {fehler} page(s) render against rules that do not exist")
        return 1
    print("CLASSES OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
