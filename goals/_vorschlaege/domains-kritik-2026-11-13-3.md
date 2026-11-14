Schwere: 3
Goal: domains 03
Befund: Der Zweig nach `changed=1` ist in der Produktion nie gelaufen: Der Live-Lauf aus Zyklus 1 setzte denselben Schlüssel (`changed=0`), belegt ist das Warten nur im Selbsttest mit Attrappen.
Beleg: Progress Log domains 03, Zyklus 1 (P4 `ok=1`), `ops/sandbox/setup.sh` schreibt den Schlüssel nur bei abweichendem Hash.
Empfehlung: Der Release Manager nennt im Kommentar die Zeile `client_key` samt `changed`; beim ersten Lauf mit `changed=1` belegt `docker logs … | grep -F "key not accepted"` mit Zeitstempeln, dass die Anlage nach mehr als `RECHECK_MS` seit der letzten Zeile kam.
Übernommen: domains 04, DONE und gemergt (PR #116); der erste Lauf mit `changed=1` steht in `docs/sandbox/schluesselwechsel.md` (2026-11-14)
