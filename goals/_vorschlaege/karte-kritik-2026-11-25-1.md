Schwere: 3
Goal: karte 03
Befund: karte 03 rechnet Sichtungen, Klicks und Käufe im Fenster ab 22.11. 21:26 UTC als eine Summe, obwohl werbung 01 am 23.11. 07:33 UTC mitten im Fenster gemergt wurde, und die übernommene Trennung vor und nach werbung 01 fehlt.
Beleg: `git show origin/dev:goals/karte/03-kauft-jemand-per-karte.md | grep -c -E "werbung 01|Werbung ab"` -> `0` | goals/karte/03-kauft-jemand-per-karte.md:9, :17, :92 | goals/_vorschlaege/karte-kritik-2026-11-23-1.md (Übernommen: in karte 03 vor dem Start am 30.11.)
Empfehlung: Vor dem 30.11. eine Zeile `Werbung ab: <completedAt deploy werbung 01>` in karte 03 aufnehmen, `VIEWS`, `CLICKS` und `ORDERS` davor und danach getrennt ausgeben und `Ergebnis` samt Vorschlag nur auf den Stand nach werbung 01 stützen.
