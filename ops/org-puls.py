#!/usr/bin/env python3
"""Laeuft die Firma noch, und bewegt sie etwas?

Liest auf stdin ein JSON-Dokument mit dem Zustand aus Paperclip (ops/org-puls.sh holt es) und
urteilt. Getrennt wie ops/ziele.py, damit das Urteilen vor gepflanzte Zustaende gestellt werden
kann, ohne das Netz zu beruehren.

Der Unterschied zu ops/org.sh: das misst, ob das Protokoll der Org zur Wirklichkeit passt. Das hier
misst, ob die Firma ueberhaupt atmet. Eine Org aus neunzehn Agenten, die niemand weckt, ist ein
Organigramm und kein Betrieb, und das faellt sonst niemandem auf, weil nichts rot wird.

Exit 0 wenn alles atmet, 1 bei einem Befund, 2 wenn nicht messbar.
"""
import json, sys
from datetime import datetime, timezone

# Ab wann ein Ticket als haengend gilt: es ist jemandem zugewiesen, steht auf in_progress und hat
# seit so vielen Minuten keinen Lauf gesehen.
HAENGT_MIN = 90
# Ab wann Stille auffaellt: so lange kein einziger Lauf, obwohl offene Arbeit da ist.
STILL_MIN = 120
# Das Fenster, in dem Fehler zaehlen. Aelteres ist Geschichte und darf nicht dauerhaft rot halten.
FENSTER_MIN = 360


def alter_min(ts, jetzt):
    if not ts:
        return None
    try:
        t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    except Exception:
        return None
    return (jetzt - t).total_seconds() / 60


def main():
    try:
        d = json.load(sys.stdin)
    except Exception as exc:
        print(f"nicht lesbar: {exc}")
        return 2
    if not d.get("erreichbar"):
        print("PULS  Paperclip antwortet nicht auf /api/health")
        return 2

    jetzt = datetime.fromisoformat(d["jetzt"].replace("Z", "+00:00"))
    agenten = d.get("agenten", [])
    tickets = d.get("tickets", [])
    laeufe = d.get("laeufe", [])
    befunde = []

    print(f"Puls der Firma, {d['jetzt']}")
    print()

    # 1. Agenten im Fehler. Einer reicht: die Rolle faellt aus, und nach ORG.md haengt daran ein
    #    Schritt des Takts.
    kaputt = [a for a in agenten if a.get("status") == "error"]
    print(f"  Agenten            {len(agenten)} gesamt, {len(kaputt)} im Fehler")
    for a in kaputt:
        print(f"    FEHLER  {a['name']}")
        befunde.append(f"{a['name']} steht auf error")

    # 2. Laeuft ueberhaupt etwas, und wann zuletzt?
    letzter = max((alter_min(l.get("startedAt") or l.get("createdAt"), jetzt) or 1e9) for l in laeufe) if laeufe else None
    juengster = min((alter_min(l.get("startedAt") or l.get("createdAt"), jetzt) or 1e9) for l in laeufe) if laeufe else None
    # Was "offen" heisst, und warum die Liste laenger ist, als sie aussieht.
    #
    # Bis zum 30.09.2026 zaehlte dieses Werkzeug nur todo, in_progress und backlog. Es meldete
    # "3 offen", waehrend 22 Tickets nicht erledigt waren: acht standen auf in_review und warteten
    # auf Matthias, elf auf blocked, und bei mehreren davon war der Blocker laengst weg. Ein
    # Ticket, das auf jemanden wartet, ist nicht erledigt, es wartet, und genau das soll man sehen.
    OFFEN = ("todo", "in_progress", "backlog", "blocked", "in_review")
    offen = [t for t in tickets if t.get("status") in OFFEN]
    arbeit = [t for t in tickets if t.get("status") in ("todo", "in_progress", "backlog")]
    wartet_auf_menschen = [t for t in tickets if t.get("status") == "in_review"]
    blockiert = [t for t in tickets if t.get("status") == "blocked"]
    if juengster is None:
        print("  Laeufe             keiner, nie")
        if arbeit:
            befunde.append("kein einziger Lauf, obwohl Arbeit offen ist")
    else:
        print(f"  Letzter Lauf       vor {juengster:.0f} Minuten")
        if arbeit and juengster > STILL_MIN:
            print(f"    STILL   {len(arbeit)} Tickets in Arbeit und seit {juengster:.0f} Minuten kein Lauf")
            befunde.append(f"seit {juengster:.0f} Minuten kein Lauf bei {len(arbeit)} Tickets in Arbeit")

    # 3. Gehen die Laeufe durch? Eine Firma, in der jeder Lauf scheitert, verbraucht Kontingent und
    #    erzeugt nichts.
    # Die Fehlerquote in einem Zeitfenster, nicht ueber alle Zeit und nicht ueber die letzten N.
    #
    # Beide Abkuerzungen liegen daneben: eine Quote ueber alle Laeufe bleibt fuer immer rot, wenn
    # ein Fehler einmal behoben ist, und "die letzten fuenf" haelt gruen, solange zufaellig fuenf
    # gute dazwischenliegen. Am 29.09.2026 meldete dieses Werkzeug PULS OK bei 75 Prozent
    # Fehlerquote, weil die neun kaputten Laeufe vom Morgen aus dem Fenster gerutscht waren und die
    # Fuenf gerade passten. Gefunden vom Challenge-Schwarm.
    fertig = [l for l in laeufe if l.get("status") in ("succeeded", "failed")]
    frisch = [l for l in fertig if (alter_min(l.get("startedAt"), jetzt) or 1e9) <= FENSTER_MIN]
    schlecht = [l for l in frisch if l.get("status") == "failed"]
    if frisch:
        quote = len(schlecht) / len(frisch)
        print(f"  Laeufe ({FENSTER_MIN//60} h)      {len(frisch)}, davon {len(schlecht)} gescheitert ({quote*100:.0f} Prozent)")
        if len(frisch) >= 3 and quote >= 0.5:
            print(f"    ROT     {quote*100:.0f} Prozent der Laeufe im Fenster sind gescheitert")
            befunde.append(f"{len(schlecht)} von {len(frisch)} Laeufen der letzten {FENSTER_MIN//60} Stunden sind gescheitert")
    else:
        alt_fertig = len(fertig)
        print(f"  Laeufe ({FENSTER_MIN//60} h)      keine ({alt_fertig} aelter als das Fenster)")

    # 4. Haengende Tickets: zugewiesen, in Arbeit, aber niemand laeuft dafuer.
    laufend = {l.get("agentId") for l in laeufe if l.get("status") == "running"}
    haengt = []
    for t in tickets:
        if t.get("status") != "in_progress":
            continue
        a = alter_min(t.get("updatedAt"), jetzt)
        if a is not None and a > HAENGT_MIN and t.get("assigneeAgentId") not in laufend:
            haengt.append((t.get("identifier"), a))
    print(f"  Tickets            {len(tickets)} gesamt, {len(offen)} offen, {len(haengt)} haengen")
    print(f"    davon            {len(arbeit)} in Arbeit, {len(blockiert)} blockiert, "
          f"{len(wartet_auf_menschen)} warten auf einen Menschen")
    # Nachrichten, die sich stapeln, sind ein Befund: niemand liest sie, und die Firma plant weiter
    # ohne die Antwort. Ab fuenf faellt es auf.
    if len(wartet_auf_menschen) >= 5:
        print(f"    STAPEL  {len(wartet_auf_menschen)} Tickets warten auf eine Antwort von Matthias")
        befunde.append(f"{len(wartet_auf_menschen)} Tickets warten auf eine Antwort von Matthias")
    for ident, a in haengt:
        print(f"    HAENGT  {ident} seit {a:.0f} Minuten in Arbeit, niemand laeuft dafuer")
        befunde.append(f"{ident} haengt seit {a:.0f} Minuten")

    # 5. Modelle: eine stille Umstellung auf ein anderes Modell ist ein Befund, kein Detail.
    modelle = sorted({a.get("model") or "(leer)" for a in agenten})
    print(f"  Modelle            {', '.join(modelle)}")
    if len(modelle) > 1:
        befunde.append(f"die Agenten laufen auf verschiedenen Modellen: {', '.join(modelle)}")

    print()
    if befunde:
        print(f"PULS {len(befunde)} BEFUND(E)")
        for b in befunde:
            print(f"  - {b}")
        return 1
    print("PULS OK")
    return 0


sys.exit(main())
