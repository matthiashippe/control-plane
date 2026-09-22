#!/usr/bin/env python3
"""Makes the bounty trial checkable instead of merely claimed.

The landing page says about its own numbers: "so you can check that number rather than believe it".
For the bounty trial of 20.09.2026 that was not true, because its results sat under .scratch/, which
is not in the repo. This script collects them into docs/research/data/, where the Conway and x402
raw data already sit under CC0.

It computes the metrics from the raw data instead of copying them from somewhere. On 20.09. five
mistakes happened while copying numbers by hand, all of them unnoticed when read and all of them
found when recomputed.

The German keys of the export are the schema of the published data set and stay as they are; the
same holds for the keys read from .scratch/, which ops/bounty-test.py and
ops/invention-check.py write.

  ops/bounty-test-export.py
"""
import json, pathlib, sys, textwrap

SOURCE = pathlib.Path(".scratch/gtm/auftragstest")
TARGET = pathlib.Path("docs/research/data/2026-09-20-auftragstest.json")
PAGE = pathlib.Path("src/public/index.html")
MARK_OPEN, MARK_CLOSE = "<!-- BOUNTY_TRIAL:START -->", "<!-- BOUNTY_TRIAL:END -->"
# Digits below ten read as a word in running text, even on a developer page.
NUMBER_WORD = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
               7: "seven", 8: "eight", 9: "nine"}

MARKETS = [
    {"city": "Hamburg", "brief_file": "auftrag-01.md", "subdir": "",
     "price": "2.00 EUR", "kind": "schoepferisch", "check": "erfindungspruefung.json"},
    {"city": "Austin", "brief_file": "auftrag-02-us.md", "subdir": "us",
     "price": "5.00 USD", "kind": "schoepferisch", "check": "erfindungspruefung.json"},
    {"city": "Dubai", "brief_file": "auftrag-03-dubai.md", "subdir": "dubai",
     "price": "8.00 USD", "kind": "faktisch", "check": "erfindungspruefung.json"},
]


def main() -> int:
    if not SOURCE.exists():
        print(f"{SOURCE} is missing", file=sys.stderr)
        return 2

    export = {
        "stichtag": "2026-09-20",
        "zweck": "Drei Auftraege aus drei Maerkten, je drei Agenten mit verschiedenem "
                 "Genesis-Prompt, Modell openai/gpt-5.2. Erzeugt mit ops/bounty-test.py, geprueft "
                 "mit ops/invention-check.py. Die Preise sind gesetzt, nicht gezahlt: Es gab "
                 "keinen Auftraggeber, der Geld ausgeschuettet haette.",
        "lizenz": "CC0, wie der Rest von docs/research/data/",
        "maerkte": [],
    }

    for m in MARKETS:
        folder = SOURCE / m["subdir"] if m["subdir"] else SOURCE
        results = json.loads((folder / "ergebnisse.json").read_text(encoding="utf-8"))
        check_file = folder / m["check"]
        findings = {}
        if check_file.exists():
            p = json.loads(check_file.read_text(encoding="utf-8"))
            findings = {b["name"]: b["befunde"] for b in p["bericht"]}

        entries = []
        for e in results["ergebnisse"]:
            entries.append({
                "agent": e["name"],
                "genesis_prompt": e["genesis"],
                "einreichung": e["text"],
                "woerter": e["woerter"],
                "sekunden": e["sekunden"],
                "tokens": e["tokens"],
                "einkauf_usd": round(e["einkauf_usd"], 6),
                "verkauf_usd": round(e["verkauf_usd"], 6),
                "befunde": findings.get(e["name"], []),
            })

        production = round(sum(x["verkauf_usd"] for x in entries), 6)
        export["maerkte"].append({
            "markt": m["city"],
            "auftragspreis": m["price"],
            "auftragsart": m["kind"],
            "briefing": results["auftrag"],
            "modell": results["modell"],
            "bewerber": len(entries),
            "produktion_verkauf_usd": production,
            "marge_usd": round(sum(x["verkauf_usd"] - x["einkauf_usd"] for x in entries), 6),
            "einreichungen": entries,
        })

    TARGET.write_text(json.dumps(export, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{TARGET}: {len(export['maerkte'])} markets")
    for m in export["maerkte"]:
        finding_count = sum(len(e["befunde"]) for e in m["einreichungen"])
        print(f"  {m['markt']:<8} {m['auftragspreis']:>9}  production ${m['produktion_verkauf_usd']:.4f}"
              f"  {m['bewerber']} entrants, {finding_count} findings")
    write_paragraph(export)
    return 0


def write_paragraph(export: dict) -> None:
    """The paragraph on the landing page, from the same numbers as the export file.

    Copied by hand it would be wrong at the first recomputation; that is exactly how five counting
    mistakes came about on 20.09.2026. So it sits between two markers and is generated. It is then
    typeset like the rest of the file, so nobody notices the difference between a written and a
    generated paragraph.
    """
    dubai = next(m for m in export["maerkte"] if m["markt"] == "Dubai")
    invented = next(
        (b for e in dubai["einreichungen"] for b in e["befunde"]
         if "Viewings" in b.get("zitat", "")), None)
    assert invented, "the documented invention case is missing, paragraph not generated"

    n = NUMBER_WORD.get(dubai["bewerber"], str(dubai["bewerber"]))
    price = dubai["auftragspreis"].replace(".00", "")
    sentence = (
        "A third kind of evidence, about what this service is turning into. On 20 September 2026 "
        f"I gave the same brief to {n} agents that differed in nothing but their genesis prompt, "
        "and paid for their thinking at this service's own price list. The Dubai brief was a "
        "listing for a 1,240 sqft flat with a service charge of AED 18 per sqft, and it said "
        f"outright that buyers want the numbers listings hide. All {n} worked out the annual "
        "charge of AED 22,320 without being asked. One of them also wrote "
        f"<q>{invented['zitat'].rstrip('.')}</q>, which the brief does not contain and which the "
        f"seller would be held to. The {n} competing attempts cost "
        f"${dubai['produktion_verkauf_usd']:.4f} to produce at the price charged here, against a "
        f"bounty of {price}. The briefs, every submission, the costs and the checks are "
        '<a href="https://github.com/matthiashippe/control-plane/blob/main/docs/research/data/'
        '2026-09-20-auftragstest.json">in the repository under CC0</a>, including the two other '
        "markets, so you can judge the work rather than take my word for it."
    )
    # break_on_hyphens and break_long_words off: otherwise the wrapping breaks the repo URL in the
    # middle of the hyphen in "control-plane", and the href ends up carrying a line break.
    html = "  <p>\n" + textwrap.fill(sentence, width=98, initial_indent="    ",
                                      subsequent_indent="    ", break_on_hyphens=False,
                                      break_long_words=False) + "\n  </p>\n"

    t = PAGE.read_text(encoding="utf-8")
    start, end = t.index(MARK_OPEN), t.index(MARK_CLOSE)
    t = t[:start + len(MARK_OPEN)] + "\n" + html + "  " + t[end:]
    PAGE.write_text(t, encoding="utf-8")
    print(f"Paragraph in {PAGE} refreshed ({len(sentence.split())} words)")


if __name__ == "__main__":
    sys.exit(main())
