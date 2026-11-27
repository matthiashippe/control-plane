Schwere: 5
Goal: kunden 16
Befund: Im öffentlichen Repo stehen Zahlungen und Umsatz des einen Sandbox-Kunden als Beträge, zusammen mit den Uhrzeiten seiner Aufladungen, entgegen Grundregel 8 (`loop-constraints.md` Zeile 39 bis 40, „Umsatz je Kunde“).
Beleg: `git grep -c "zweimal [0-9]* USD gezahlt" origin/dev -- docs/kunden/sandbox-kunde-2026-11.md` -> `origin/dev:docs/kunden/sandbox-kunde-2026-11.md:1` | docs/kunden/sandbox-kunde-2026-11.md:151
Empfehlung: Beträge je Kunde auf `dev` maskieren wie in `docs/kunden/rueckgang-2026-11.md` (`*.**`), Goal 16 bekommt keinen Betrag im Dateinamen (umbenennen nur über einen Menschen, weil die Datei nach DONE eingefroren ist), und die Prüfung von Linse B auf Beträge je Kunde fängt auch ganze Zahlen; ob die Git-Historie bereinigt wird, entscheidet Matthias (wie beim Vorfall vom 19.11. in `goals/RISIKEN.md` Zeile 9).

## Fundstellen

Die Beträge stehen hier bewusst nicht, weil dieser Vorschlag im selben öffentlichen Repo liegt.

- `goals/kunden/16-warum-der-erste-sandbox-kunde-nach-10-usd-aufhoert.md` Zeile 1 und Dateiname: der Gesamtbetrag des einen Kunden.
- `docs/kunden/sandbox-kunde-2026-11.md` Zeile 151: Zahl und Höhe seiner Aufladungen. Das Dokument sagt in Zeile 9 bis 10 selbst, Beträge je Kunde stünden dort nicht.
- `docs/richtung/2026-11-26.md` Zeile 19 bis 21: Sandbox-Kosten, Höhe beider Aufladungen mit Uhrzeit (03:00 und 14:50 am 21.11.) und Inferenz-Ausgabe desselben Kunden; dazu Zeile 105 und 131.
- `ROADMAP.md` Zeile 18: Ausgabe einer einzelnen Adresse am 19.11.
- Goal 16, Abschnitt Active Objective: die Uhrzeiten beider Aufladungen. `goals/kunden/ANNAHMEN.md` Zeile 10 hält Zeiten der Aufladung je Kunde gerade deshalb aus dem Repo, weil Zeit und Betrag zusammen die öffentliche USDC-Überweisung auf Base und damit die Wallet kenntlich machen.

## Warum die Prüfung es nicht fing

`goals/kunden/verdicts/16-z4-B.md` Zeile 10 sucht Beträge je Kunde mit `grep -cE "[0-9][.,][0-9]{2} USD"`. Das Muster trifft nur Beträge mit zwei Nachkommastellen, nicht ganze Beträge.

## Gegenprüfung

Ein frischer Subagent sollte den Befund widerlegen und bestätigte ihn: Das Repo ist öffentlich (`gh repo view matthiashippe/control-plane --json visibility` -> `PUBLIC`), keine Annahme und kein Vorschlag erlaubt Beträge je Kunde, und gemeldet war es noch nicht.
Übernommen: Tech Lead, PRO-31352 Glied 1, Schwere 5 (Grundregel 8), Goal-Datei, Dateiname, Prüfung der Linse B und Git-Historie als Vorlage an Matthias (2026-11-27)
