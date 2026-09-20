#!/usr/bin/env python3
"""Macht den Auftragstest nachpruefbar statt behauptbar.

Die Startseite sagt ueber ihre eigenen Zahlen: "so you can check that number rather than believe
it". Fuer den Auftragstest vom 20.09.2026 galt das nicht, denn seine Ergebnisse lagen unter
.scratch/, das nicht im Repo ist. Dieses Skript traegt sie nach docs/research/data/ zusammen, wo
schon die Conway- und x402-Rohdaten unter CC0 liegen.

Es rechnet dabei die Kennzahlen aus den Rohdaten aus, statt sie irgendwo abzuschreiben. Am
20.09. sind beim Abschreiben von Zahlen fuenf Fehler passiert, alle beim Lesen unentdeckt und
alle beim Nachrechnen gefunden.

  ops/auftragstest-export.py
"""
import json, pathlib, sys, textwrap

QUELLE = pathlib.Path(".scratch/gtm/auftragstest")
ZIEL = pathlib.Path("docs/research/data/2026-09-20-auftragstest.json")
SEITE = pathlib.Path("src/public/index.html")
MARKE_AUF, MARKE_ZU = "<!-- AUFTRAGSTEST:START -->", "<!-- AUFTRAGSTEST:ENDE -->"
# Ziffern unter zehn liest man im Fliesstext als Wort, auch auf einer Entwicklerseite.
ZAHLWORT = {1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six",
            7: "seven", 8: "eight", 9: "nine"}

MAERKTE = [
    {"markt": "Hamburg", "auftrag_datei": "auftrag-01.md", "unter": "",
     "preis": "2.00 EUR", "art": "schoepferisch", "pruefung": "erfindungspruefung.json"},
    {"markt": "Austin", "auftrag_datei": "auftrag-02-us.md", "unter": "us",
     "preis": "5.00 USD", "art": "schoepferisch", "pruefung": "erfindungspruefung.json"},
    {"markt": "Dubai", "auftrag_datei": "auftrag-03-dubai.md", "unter": "dubai",
     "preis": "8.00 USD", "art": "faktisch", "pruefung": "erfindungspruefung.json"},
]


def main() -> int:
    if not QUELLE.exists():
        print(f"{QUELLE} fehlt", file=sys.stderr)
        return 2

    export = {
        "stichtag": "2026-09-20",
        "zweck": "Drei Auftraege aus drei Maerkten, je drei Agenten mit verschiedenem "
                 "Genesis-Prompt, Modell openai/gpt-5.2. Erzeugt mit ops/auftragstest.py, geprueft "
                 "mit ops/erfindungspruefung.py. Die Preise sind gesetzt, nicht gezahlt: Es gab "
                 "keinen Auftraggeber, der Geld ausgeschuettet haette.",
        "lizenz": "CC0, wie der Rest von docs/research/data/",
        "maerkte": [],
    }

    for m in MAERKTE:
        ordner = QUELLE / m["unter"] if m["unter"] else QUELLE
        erg = json.loads((ordner / "ergebnisse.json").read_text(encoding="utf-8"))
        pruef_datei = ordner / m["pruefung"]
        befunde = {}
        if pruef_datei.exists():
            p = json.loads(pruef_datei.read_text(encoding="utf-8"))
            befunde = {b["name"]: b["befunde"] for b in p["bericht"]}

        eintraege = []
        for e in erg["ergebnisse"]:
            eintraege.append({
                "agent": e["name"],
                "genesis_prompt": e["genesis"],
                "einreichung": e["text"],
                "woerter": e["woerter"],
                "sekunden": e["sekunden"],
                "tokens": e["tokens"],
                "einkauf_usd": round(e["einkauf_usd"], 6),
                "verkauf_usd": round(e["verkauf_usd"], 6),
                "befunde": befunde.get(e["name"], []),
            })

        produktion = round(sum(x["verkauf_usd"] for x in eintraege), 6)
        export["maerkte"].append({
            "markt": m["markt"],
            "auftragspreis": m["preis"],
            "auftragsart": m["art"],
            "briefing": erg["auftrag"],
            "modell": erg["modell"],
            "bewerber": len(eintraege),
            "produktion_verkauf_usd": produktion,
            "marge_usd": round(sum(x["verkauf_usd"] - x["einkauf_usd"] for x in eintraege), 6),
            "einreichungen": eintraege,
        })

    ZIEL.write_text(json.dumps(export, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"{ZIEL}: {len(export['maerkte'])} Maerkte")
    for m in export["maerkte"]:
        n_befunde = sum(len(e["befunde"]) for e in m["einreichungen"])
        print(f"  {m['markt']:<8} {m['auftragspreis']:>9}  Produktion ${m['produktion_verkauf_usd']:.4f}"
              f"  {m['bewerber']} Bewerber, {n_befunde} Befunde")
    absatz_schreiben(export)
    return 0


def absatz_schreiben(export: dict) -> None:
    """Der Absatz auf der Startseite, aus denselben Zahlen wie die Exportdatei.

    Von Hand abgeschrieben waere er schon beim ersten Nachrechnen falsch; genau so sind am
    20.09.2026 fuenf Zaehlfehler entstanden. Deshalb steht er zwischen zwei Marken und wird
    erzeugt. Gesetzt wird er danach wie der Rest der Datei, damit der Unterschied zwischen
    geschriebenem und erzeugtem Absatz niemandem auffaellt.
    """
    dubai = next(m for m in export["maerkte"] if m["markt"] == "Dubai")
    erfunden = next(
        (b for e in dubai["einreichungen"] for b in e["befunde"]
         if "Viewings" in b.get("zitat", "")), None)
    assert erfunden, "der belegte Erfindungsfall fehlt, Absatz nicht erzeugt"

    n = ZAHLWORT.get(dubai["bewerber"], str(dubai["bewerber"]))
    preis = dubai["auftragspreis"].replace(".00", "")
    satz = (
        "A third kind of evidence, about what this service is turning into. On 20 September 2026 "
        f"I gave the same brief to {n} agents that differed in nothing but their genesis prompt, "
        "and paid for their thinking at this service's own price list. The Dubai brief was a "
        "listing for a 1,240 sqft flat with a service charge of AED 18 per sqft, and it said "
        f"outright that buyers want the numbers listings hide. All {n} worked out the annual "
        "charge of AED 22,320 without being asked. One of them also wrote "
        f"<q>{erfunden['zitat'].rstrip('.')}</q>, which the brief does not contain and which the "
        f"seller would be held to. The {n} competing attempts cost "
        f"${dubai['produktion_verkauf_usd']:.4f} to produce at the price charged here, against a "
        f"bounty of {preis}. The briefs, every submission, the costs and the checks are "
        '<a href="https://github.com/matthiashippe/control-plane/blob/main/docs/research/data/'
        '2026-09-20-auftragstest.json">in the repository under CC0</a>, including the two other '
        "markets, so you can judge the work rather than take my word for it."
    )
    # break_on_hyphens und break_long_words aus: Sonst bricht der Umbruch die Repo-URL mitten im
    # Bindestrich von "control-plane" auf, und im href steht ein Zeilenumbruch.
    html = "  <p>\n" + textwrap.fill(satz, width=98, initial_indent="    ",
                                      subsequent_indent="    ", break_on_hyphens=False,
                                      break_long_words=False) + "\n  </p>\n"

    t = SEITE.read_text(encoding="utf-8")
    auf, zu = t.index(MARKE_AUF), t.index(MARKE_ZU)
    t = t[:auf + len(MARKE_AUF)] + "\n" + html + "  " + t[zu:]
    SEITE.write_text(t, encoding="utf-8")
    print(f"Absatz in {SEITE} erneuert ({len(satz.split())} Woerter)")


if __name__ == "__main__":
    sys.exit(main())
