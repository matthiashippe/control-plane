#!/usr/bin/env python3
"""Welche Behauptung im Ergebnis steht nicht im Briefing?

Der Auftragsmarkt lebt davon, dass ein Auftraggeber die Arbeit bewerten kann, ohne Fachmann zu
sein. Geschmack kann er nicht bewerten, erfundene Tatsachen schon, und die sind in den Maerkten,
auf die wir zielen, das eigentliche Risiko: Im Testlauf vom 20.09. hat `opti-7734` in ein
Dubai-Expose "Viewings available on short notice" geschrieben, eine Zusage, die im Briefing nicht
steht und fuer die am Ende jemand haftet.

Das Skript nimmt die Ergebnisse aus ops/auftragstest.py und laesst jede Einreichung gegen ihr
eigenes Briefing pruefen. Drei Befundarten werden unterschieden, weil sie verschieden schwer
wiegen: `rechenfehler` leitet aus dem Briefing eine Zahl ab und rechnet falsch, `widerspruch` sagt
etwas anderes als das Briefing, `unbelegt` sagt etwas, das dort weder steht noch folgt.

Was korrekt aus dem Briefing hergeleitet ist, ist ausdruecklich KEIN Befund. Der erste Lauf am
20.09. hat genau das falsch gemacht: Er meldete die richtige Rechnung AED 18 mal 1.240 sqft gleich
22.320 AED als Erfindung und haette damit das Beste bestraft, was die Agenten getan haben, naemlich
die Zahl auszurechnen, nach der das Briefing ausdruecklich verlangt.

**Der Pruefer wird selbst geprueft.** Ein Modell, das Erfindungen sucht, erfindet Funde: Es zitiert
Saetze, die in der Einreichung gar nicht vorkommen. Deshalb muss jeder Befund ein woertliches
Zitat mitbringen, und jedes Zitat wird programmatisch in der Einreichung wiedergefunden, bevor der
Befund zaehlt. Was sich nicht wiederfinden laesst, faellt raus und wird als `verworfen` gezaehlt.
Diese Quote ist die Guete des Pruefers und gehoert in jeden Bericht.

  OPENROUTER_API_KEY=... ops/erfindungspruefung.py --ergebnisse <pfad/ergebnisse.json>
"""
import argparse, json, os, pathlib, re, sys, unicodedata, urllib.error, urllib.request

API = "https://openrouter.ai/api/v1/chat/completions"

ANWEISUNG = """You check a submitted piece of work against the briefing it was written for.

Your job is to find claims the briefing does not support. Be precise about what that means, because
the most valuable work a writer does is to DERIVE facts the briefing only implies.

NOT a finding, never list these:
- A claim that follows from the briefing by correct arithmetic. If the briefing gives a rate and a
  quantity, their correct product is supported, not invented. Do the multiplication yourself before
  you judge.
- A claim that is a direct restatement or a necessary consequence of something in the briefing.
- Ordinary connective phrasing, tone, or self-description of care, quality or attention.

A finding, list these:
- "rechenfehler": the submission derives a number from the briefing and gets it WRONG. Compute the
  correct value yourself and put it in "begruendung". This is the most serious kind.
- "widerspruch": the submission states something the briefing contradicts.
- "unbelegt": the submission states a checkable fact that the briefing neither contains nor implies,
  and that cannot be derived from it. A service offered, a guarantee, an availability, a channel, a
  capability, a date, a credential.

Rules you must follow exactly:
- Every finding MUST include "zitat": the exact substring from the SUBMISSION, copied character for
  character, long enough to locate but no longer than one sentence. Never paraphrase it. Never
  quote from the briefing in this field.
- If the submission contains no unsupported claims, return an empty list. An empty list is a valid
  and common answer. Do not invent findings to appear thorough.

Answer with JSON only, no prose, in this shape:
{"befunde": [{"zitat": "...", "art": "rechenfehler"|"widerspruch"|"unbelegt", "begruendung": "one short sentence"}]}"""


def normalisieren(s: str) -> str:
    """Zitatvergleich ohne die Unterschiede, die kein Mensch als Unterschied liest.

    Die Modelle liefern typografische Zeichen (geschuetzter Bindestrich U+2011, Apostroph U+2019,
    Geviertstrich), und der Pruefer normalisiert sie beim Zitieren oft still zu ASCII. Ohne diese
    Angleichung faellt ein korrekter Befund als "nicht auffindbar" durch.
    """
    s = unicodedata.normalize("NFKC", s)
    for a, b in [("‑", "-"), ("‐", "-"), ("–", "-"), ("—", "-"),
                 ("’", "'"), ("‘", "'"), ("“", '"'), ("”", '"'),
                 (" ", " "), (" ", " ")]:
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip().lower()


def frage(modell: str, briefing: str, einreichung: str, key: str) -> dict:
    rumpf = json.dumps({
        "model": modell,
        "messages": [
            {"role": "system", "content": ANWEISUNG},
            {"role": "user", "content": f"BRIEFING:\n{briefing}\n\n---\n\nSUBMISSION:\n{einreichung}"},
        ],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(API, data=rumpf, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        antwort = json.loads(r.read())
    return json.loads(antwort["choices"][0]["message"]["content"] or "{}")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--ergebnisse", required=True, help="ergebnisse.json aus ops/auftragstest.py")
    p.add_argument("--modell", default="openai/gpt-5.2")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY fehlt", file=sys.stderr)
        return 2

    pfad = pathlib.Path(a.ergebnisse)
    daten = json.loads(pfad.read_text(encoding="utf-8"))
    briefing = daten["auftrag"]

    gesamt = verworfen = 0
    bericht = []
    for e in daten["ergebnisse"]:
        text = e["text"]
        text_norm = normalisieren(text)
        try:
            roh = frage(a.modell, briefing, text, key)
        except urllib.error.HTTPError as ex:
            print(f"── {e['name']}: FEHLER {ex.code}", file=sys.stderr)
            continue

        echte, falsche = [], []
        for b in roh.get("befunde", []) or []:
            zitat = (b.get("zitat") or "").strip()
            if zitat and normalisieren(zitat) in text_norm:
                echte.append(b)
            else:
                falsche.append(b)
        gesamt += len(echte) + len(falsche)
        verworfen += len(falsche)

        print(f"── {e['name']}: {len(echte)} Befund(e)"
              + (f", {len(falsche)} verworfen (Zitat nicht auffindbar)" if falsche else ""))
        for b in echte:
            print(f"   [{b.get('art','?')}] \"{b['zitat']}\"")
            print(f"       {b.get('begruendung','')}")
        for b in falsche:
            print(f"   VERWORFEN: {b.get('zitat','')[:70]!r}")
        print()
        bericht.append({"name": e["name"], "befunde": echte, "verworfen": falsche})

    if gesamt:
        print(f"Pruefergüte: {gesamt - verworfen} von {gesamt} Befunden belegt "
              f"({100*(gesamt-verworfen)//gesamt} %), {verworfen} verworfen.")
    ziel = pfad.parent / "erfindungspruefung.json"
    ziel.write_text(json.dumps({"modell": a.modell, "bericht": bericht},
                               ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Geschrieben nach {ziel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
