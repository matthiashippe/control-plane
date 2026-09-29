"""Ist das ein Katalog? Liest HTML von stdin und schreibt 1 oder 0.

Ein Katalog im Sinn des Ziels vom 02.10. sind mindestens drei Angebote zu je mindestens 11,13 EUR
(Break-even einer bezahlten Anzeige unter Selbstlieferung, ops/anzeigen-rechnung.py) und der Satz,
der sagt, wer liefert. Bis zum 30.09.2026 reichte ops/ziele.sh ein einziger Preis ueber 11,13 EUR,
also haette eine Seite mit einem Angebot und ohne Liefersatz das Ziel gruen gemacht (HAN-7, vom CTO
als vierter Messfehler derselben Sorte benannt).

Eine Datei fuer beide Wege: ziele.sh prueft damit die laufende Seite und im Selbsttest die
gepflanzten Faelle. Vorher stand dieselbe Regex zweimal im Skript, und eine Gegenprobe, die eine
Kopie prueft, beweist nichts ueber das Original.
"""
import html
import re
import sys

UNTERGRENZE = 11.13
ANGEBOTE = 3
LIEFERSATZ = (
    "Alle Texte liefern wir selbst. Sie werden mit KI geschrieben, "
    "kein anderer Händler und kein Freiberufler ist beteiligt."
)
# Preise wie "19 €", "11,13 €", "1.299,00 EUR". Punkt ist Tausender, Komma ist Dezimal.
PREIS = re.compile(r"(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:EUR|€)")


def sichtbarer_text(seite: str) -> str:
    # Nur was ein Mensch liest: kein <head> (Titel und Beschreibung wiederholen Teile), kein Skript.
    koerper = seite.split("</head>", 1)[-1]
    koerper = re.sub(r"<(script|style)\b[\s\S]*?</\1>", " ", koerper)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", koerper)))


def betraege(text: str) -> list[float]:
    out = []
    for ganz, rest in PREIS.findall(text):
        cent = int(rest.ljust(2, "0")) if rest else 0
        out.append(int(ganz.replace(".", "")) + cent / 100)
    return out


def ist_katalog(seite: str) -> bool:
    text = sichtbarer_text(seite)
    tragend = [b for b in betraege(text) if b >= UNTERGRENZE - 1e-9]
    return len(tragend) >= ANGEBOTE and LIEFERSATZ in text


if __name__ == "__main__":
    print(1 if ist_katalog(sys.stdin.read()) else 0)
