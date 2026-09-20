#!/usr/bin/env python3
"""Taugt die Arbeit was?

Die Vision vom Auftragsmarkt steht auf einer einzigen ungeprueften Annahme: Wenn mehrere Agenten
um denselben bezahlten Auftrag konkurrieren, muss wenigstens einer etwas abliefern, fuer das ein
Mensch freiwillig zahlt. Conway ist an der anderen Seite dieses Marktes gestorben (18.000
Verkaeufer, kein Kaeufer); wenn auch die Ware nichts taugt, ist der Markt bei uns wieder
einseitig, nur andersherum.

Dieses Skript stellt einen Auftrag, setzt mehrere Agenten mit unterschiedlichem Genesis-Prompt
darauf an und legt die Ergebnisse nebeneinander. Es rechnet dazu die Zahl aus, die ueber die
Oekonomie des ganzen Marktes entscheidet: was ein Versuch den Spieler kostet, zu unserem
Verkaufspreis. Konkurrieren N Agenten um einen Auftrag und gewinnt einer, liegt der erwartete
Erloes je Versuch bei Preis/N. Kostet ein Versuch mehr, verliert die Population Geld, und dann
stirbt sie, egal wie gut die Texte sind.

Gerechnet wird gegen den Provider direkt, nicht gegen cp.hippe.eu: Fuer den Dienst braeuchten wir
einen Klartext-Schluessel, den wir lokal nicht haben, und ihn zu beschaffen hiesse aufladen, also
eine On-Chain-Operation, die loop-constraints.md verbietet. Der Aufschlag wird deshalb gerechnet
statt gemessen; die Marge selbst deckt src/inference/ mit Tests ab.

  OPENROUTER_API_KEY=... ops/auftragstest.py --auftrag <datei.md> --agenten <datei.json>
"""
import argparse, json, os, pathlib, sys, time, urllib.error, urllib.request

API = "https://openrouter.ai/api/v1/chat/completions"
# Der Aufschlag aus src/inference/: Einkaufspreis mal MARKUP ist, was der Spieler zahlt.
MARKUP = 1.3


def frage(modell: str, system: str, auftrag: str, key: str, timeout: int = 180) -> dict:
    rumpf = json.dumps({
        "model": modell,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": auftrag}],
        "usage": {"include": True},
    }).encode()
    req = urllib.request.Request(API, data=rumpf, headers={
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--auftrag", required=True, help="Datei mit dem Auftragstext")
    p.add_argument("--agenten", required=True, help="JSON-Liste aus {name, genesis}")
    p.add_argument("--modell", default="openai/gpt-5.2")
    p.add_argument("--out", default=".scratch/gtm/auftragstest")
    a = p.parse_args()

    key = os.environ.get("OPENROUTER_API_KEY")
    if not key:
        print("OPENROUTER_API_KEY fehlt", file=sys.stderr)
        return 2

    auftrag = pathlib.Path(a.auftrag).read_text(encoding="utf-8").strip()
    agenten = json.loads(pathlib.Path(a.agenten).read_text(encoding="utf-8"))
    out = pathlib.Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    print(f"Auftrag ({len(auftrag.split())} Woerter), Modell {a.modell}, {len(agenten)} Agenten\n")
    print("=" * 78)
    print(auftrag)
    print("=" * 78 + "\n")

    ergebnisse = []
    for ag in agenten:
        t0 = time.time()
        try:
            antwort = frage(a.modell, ag["genesis"], auftrag, key)
        except urllib.error.HTTPError as e:
            print(f"── {ag['name']}: FEHLER {e.code} {e.read()[:200]!r}\n")
            continue
        dauer = time.time() - t0
        text = (antwort["choices"][0]["message"]["content"] or "").strip()
        u = antwort.get("usage", {}) or {}
        # OpenRouter liefert den Einkaufspreis des Aufrufs in `usage.cost` (USD).
        einkauf = float(u.get("cost") or 0.0)
        verkauf = einkauf * MARKUP
        ergebnisse.append({
            "name": ag["name"], "genesis": ag["genesis"], "text": text,
            "sekunden": round(dauer, 1),
            "tokens": u.get("total_tokens"),
            "einkauf_usd": einkauf, "verkauf_usd": verkauf,
            "woerter": len(text.split()),
        })
        (out / f"{ag['name']}.md").write_text(
            f"# {ag['name']}\n\n> {ag['genesis']}\n\n---\n\n{text}\n", encoding="utf-8")
        print(f"── {ag['name']}  ({dauer:.1f}s, {u.get('total_tokens')} Tokens, "
              f"Einkauf ${einkauf:.4f}, Verkauf ${verkauf:.4f}, {len(text.split())} Woerter)")
        print(f"   Genesis: {ag['genesis'][:90]}")
        print()
        print(text)
        print()

    if not ergebnisse:
        print("Kein Ergebnis.", file=sys.stderr)
        return 1

    n = len(ergebnisse)
    schnitt = sum(e["verkauf_usd"] for e in ergebnisse) / n
    teuerster = max(e["verkauf_usd"] for e in ergebnisse)
    print("=" * 78)
    print(f"{n} Versuche, Verkaufspreis im Schnitt ${schnitt:.4f}, teuerster ${teuerster:.4f}.")
    print(f"Summe, die wir an einem Auftrag mit {n} Bewerbern verdienen: "
          f"${sum(e['verkauf_usd'] for e in ergebnisse):.4f} Umsatz, davon "
          f"${sum(e['verkauf_usd'] - e['einkauf_usd'] for e in ergebnisse):.4f} Marge.")
    # Die Zahl, die ueber den Markt entscheidet.
    break_even = schnitt * n
    print(f"Break-even des Auftragspreises bei {n} Bewerbern: ${break_even:.4f}. "
          f"Darunter verliert die Population im Schnitt Geld.")
    (out / "ergebnisse.json").write_text(
        json.dumps({"auftrag": auftrag, "modell": a.modell, "ergebnisse": ergebnisse},
                   ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nGeschrieben nach {out}/")
    return 0


if __name__ == "__main__":
    sys.exit(main())
