"""Hat die Bestellseite den Einstieg ins Gespraech? Liest HTML von stdin und schreibt 1 oder 0.

Ein Mensch kommt ueber /katalog/bestellen?angebot=... ins Gespraech, mit einem Formular, das an
/katalog/gespraech schickt und ein Feld `nachricht` hat. Bis zum 30.09.2026 fragte ops/ziele.sh nur
den JSON-Weg von /katalog/gespraech ab: fiel der Einstieg auf der Seite weg, blieb `chat` gruen,
obwohl kein Mensch das Gespraech mehr erreicht (HAN-82, Befund aus HAN-79).

Eine Datei fuer beide Wege: ziele.sh prueft damit die laufende Seite, test/conversation.test.ts die
gerenderte Seite mit und ohne Einstieg.
"""
import re
import sys

FORMULAR = re.compile(r"<form\b[^>]*\baction=\"/katalog/gespraech\"[^>]*>([\s\S]*?)</form>")
NACHRICHT = re.compile(r"<textarea\b[^>]*\bname=\"nachricht\"")


def hat_einstieg(seite: str) -> bool:
    return any(NACHRICHT.search(inhalt) for inhalt in FORMULAR.findall(seite))


if __name__ == "__main__":
    print(1 if hat_einstieg(sys.stdin.read()) else 0)
