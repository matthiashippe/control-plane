#!/usr/bin/env python3
"""
Zustand unserer Reddit-Beitraege, von aussen gesehen.

    python3 ops/reddit-status.py [konto]

Reddit ist fuer unauthentifizierte Abrufe zu (403 auf alles, auch auf die .json-Endpunkte). Zwei
Wege bleiben, beide aus der Kanalrecherche vom 20.09.2026:

  arctic-shift   das oeffentliche Archiv. Liefert Text, Autor und Zeitpunkt, liest aber rund
                 20 Sekunden nach Erstellung; eine spaetere Entfernung sieht man dort nicht.
  embed.reddit   der Host fuer Einbettungen. Liefert die aktuelle Stimmenzahl und zeigt, ob ein
                 Beitrag ueberhaupt noch ausgeliefert wird.

Zusammen beantworten sie die Frage, die ein Autor selbst nicht beantworten kann: Ein gefilterter
Kommentar sieht fuer den, der ihn geschrieben hat, voellig normal aus.
"""
import datetime
import json
import sys
import urllib.error
import urllib.request

KONTO = sys.argv[1] if len(sys.argv) > 1 else "matthiasmusic10"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"

# Threads, unter denen wir etwas geschrieben haben. Neue hier eintragen.
THREADS = [
    ("1w7wz82", "r/AI_Agents: If your agent can pay for things automatically, it can also get scammed"),
    ("1wk1qfk", "r/AI_Agents: How do you handle service discovery for agents that need to pay for APIs"),
]


def hole(url: str, roh: bool = False):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=25) as r:
            inhalt = r.read().decode("utf-8", "replace")
            return inhalt if roh else json.loads(inhalt)
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        return None if roh else {"__fehler": str(e)}


def live(permalink: str) -> str:
    seite = hole(permalink.replace("www.reddit.com", "embed.reddit.com"), roh=True)
    if not seite:
        return "kein Abruf moeglich"
    if "[removed]" in seite or "[deleted]" in seite:
        return "ENTFERNT ODER GELOESCHT"
    marke = 'faceplate-number number="'
    if marke in seite:
        rest = seite.split(marke, 1)[1]
        return f"sichtbar, {rest.split(chr(34), 1)[0]} Stimme(n)"
    return "sichtbar, Stimmenzahl nicht gefunden"


def main() -> None:
    offen = 0
    for tid, titel in THREADS:
        print(f"── {titel}")
        daten = hole(f"https://arctic-shift.photon-reddit.com/api/comments/search?link_id={tid}&limit=100")
        if "__fehler" in daten:
            print(f"   Archiv nicht erreichbar: {daten['__fehler']}\n")
            continue
        alle = daten.get("data", [])
        eigene = [c for c in alle if c.get("author") == KONTO]
        fremde_antworten = [c for c in alle if c.get("author") != KONTO and any(
            c.get("parent_id", "").endswith(e.get("id", "")) for e in eigene)]
        print(f"   Kommentare im Thread: {len(alle)}, davon von uns: {len(eigene)}")
        if not eigene:
            print("   (noch nichts von uns hier)\n")
            continue
        for c in eigene:
            t = datetime.datetime.fromtimestamp(c["created_utc"], datetime.timezone.utc)
            weg = c.get("removed_by_category") or c.get("banned_by")
            zustand = f"ENTFERNT ({weg})" if weg else "in Ordnung"
            permalink = "https://www.reddit.com" + c.get("permalink", "")
            print(f"   geschrieben {t:%Y-%m-%d %H:%M} UTC, im Archiv {zustand}")
            print(f"   LIVE: {live(permalink)}")
            print(f"   {permalink}")
        if fremde_antworten:
            offen += len(fremde_antworten)
            print(f"   ⚠ {len(fremde_antworten)} ANTWORT(EN) AUF UNSEREN KOMMENTAR:")
            for a in fremde_antworten:
                print(f"     {a.get('author')}: {a.get('body', '')[:160]}")
        print()
    if offen:
        print(f"{offen} unbeantwortete Antwort(en). Eine Frage, die stehenbleibt, kostet mehr als keine Antwort.")


if __name__ == "__main__":
    main()
