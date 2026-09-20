#!/usr/bin/env python3
"""Loest die Erfindungspruefung ueberhaupt aus, was sie ausloesen soll?

In Zyklus 48 kam die Befundart `rechenfehler` dazu, ohne einen einzigen Beleg, dass sie je
feuert. Ein Pruefer, den niemand prueft, ist dasselbe wie ein Test, der ohne den zugehoerigen Fix
gruen bleibt.

Diese Probe faehrt ops/erfindungspruefung.py gegen Einreichungen mit bekannter Wahrheit: eine
saubere, die keinen Befund ergeben darf, und je eine mit einem gepflanzten Fehler jeder Art. Die
saubere ist die wichtigere Haelfte, denn ein Pruefer, der alles meldet, ist als Qualitaetstor
wertlos, und genau daran ist die Pruefung auf Werbetext gescheitert.

Gemessen wird beides getrennt: Treffer (wurde der gepflanzte Fehler gefunden, mit der richtigen
Art) und Fehlalarm (wie viele Befunde kamen dazu, die niemand gepflanzt hat).

  OPENROUTER_API_KEY=... ops/pruef-probe.py --probe ops/proben/dubai-fakten.json
"""
import argparse, json, os, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from erfindungspruefung import frage, normalisieren  # noqa: E402


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--probe", required=True)
    p.add_argument("--modell", default="openai/gpt-5.2")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY fehlt", file=sys.stderr)
        return 2

    d = json.loads(pathlib.Path(a.probe).read_text(encoding="utf-8"))
    briefing = d["briefing"]

    treffer = erwartet_gesamt = fehlalarm = 0
    for probe in d["proben"]:
        text = probe["text"]
        text_norm = normalisieren(text)
        roh = frage(a.modell, briefing, text, key)
        # Nur Befunde mit auffindbarem Zitat zaehlen, wie im Werkzeug selbst.
        befunde = [b for b in (roh.get("befunde") or [])
                   if (b.get("zitat") or "").strip()
                   and normalisieren(b["zitat"]) in text_norm]

        offen = list(probe["erwartet"])
        zusatz = []
        for b in befunde:
            passend = next((e for e in offen
                            if e["art"] == b.get("art")
                            and normalisieren(e["muster"]) in normalisieren(b["zitat"])), None)
            if passend:
                offen.remove(passend)
            else:
                zusatz.append(b)

        erwartet_gesamt += len(probe["erwartet"])
        treffer += len(probe["erwartet"]) - len(offen)
        fehlalarm += len(zusatz)

        marke = "OK " if not offen else "MISS"
        print(f"── {marke} {probe['name']}: {len(probe['erwartet']) - len(offen)}"
              f"/{len(probe['erwartet'])} erwartet gefunden, {len(zusatz)} zusaetzlich")
        for e in offen:
            print(f"   NICHT GEFUNDEN: [{e['art']}] mit {e['muster']!r}")
        for b in befunde:
            print(f"   [{b.get('art','?')}] \"{b['zitat'][:90]}\"")
            if b.get("begruendung"):
                print(f"       {b['begruendung'][:120]}")
        print()

    print(f"Treffer: {treffer}/{erwartet_gesamt} gepflanzte Fehler gefunden. "
          f"Fehlalarm: {fehlalarm} ungepflanzte Befunde.")
    return 0 if treffer == erwartet_gesamt else 1


if __name__ == "__main__":
    sys.exit(main())
