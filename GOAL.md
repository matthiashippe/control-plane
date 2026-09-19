# GOAL.md

## Status
ACTIVE

## Active Objective
Die vier Annahmen unter dem GTM-Plan mit belegbaren Daten prüfen, bevor weitere Reichweite gekauft
oder erarbeitet wird: Wie groß ist die zahlende Nachfrage wirklich (on-chain), wie viele neue
Betroffene kommen pro Woche nach, gibt es schon einen kompatiblen Ersatz, und was kostet ein
blockierter Nutzer die Alternative "ohne Control Plane weiterlaufen".

## Done Condition
- [ ] `docs/research/2026-09-19-nachfrage.md` existiert und beantwortet die vier Fragen mit je
      einer Zahl oder einem ausdrücklichen "nicht ermittelbar", jeweils mit dem Befehl oder der
      URL, aus der die Zahl stammt
      Prüfung: die Datei enthält die Abschnitte `## F1` bis `## F4`, je einen Abschnitt
      `### Beleg` mit reproduzierbarem Befehl, und einen Abschnitt `## Konsequenz für den Plan`
- [ ] F1 (Zahlungsfluss an Conway): Monatswerte 2026 für USDC-Zuflüsse an Conways payTo
      `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10` auf Base, plus Zahl der zahlenden Wallets je
      Monat und die letzten 30 Tage; Quelle ist die Kette, nicht eine Behauptung aus dem Handoff
- [ ] F2 (Zulauf): Zahl unterschiedlicher GitHub-Nutzer mit Provisionierungs-Problem je Monat seit
      Juli 2026 und die Rate der letzten 30 Tage; dazu, ob nach dem 26.08.2026 noch Upstream-
      Aktivität stattfand
- [ ] F3 (Wettbewerb): Gibt es einen anderen öffentlich erreichbaren Conway-kompatiblen Dienst
      oder Fork, der das Problem löst? Belegt durch Suche in GitHub-Code, Forks, npm und Web
- [ ] F4 (kostenlose Alternative): Was genau kann ein blockierter Nutzer ohne Control Plane tun,
      belegt am Upstream-Code `Conway-Research/automaton@d8f8168`: kommt die Runtime ohne
      `--provision` hoch, wie weit läuft sie mit eigenem OpenAI-Key, was bricht, und was kostet
      ihn das an Arbeit. Ergebnis ist die ehrliche Antwort auf "warum sollte jemand zahlen"
- [ ] Der GTM-Plan in STATE.md ist nach den Funden angepasst, inklusive Abbruchkriterium
- [ ] goal-verifier PASS (prüft die Zahlen stichprobenartig selbst nach)

## Acceptance Criteria
- [ ] Jede Zahl ist reproduzierbar: RPC-Aufruf, `gh`-Befehl, npm-API-URL oder Dateipfad
- [ ] Keine Zahl aus dem alten Handoff wird übernommen, ohne sie neu zu belegen
- [ ] Unsicherheit wird benannt (Zeitraum, Lücken, Rate-Limits), nicht geglättet
- [ ] Die Konsequenz steht als Entscheidung da, nicht als Optionsliste: was wir tun, was wir lassen
- [ ] Wenn die Daten gegen das Produkt sprechen, steht das genau so in der Datei

## Deny List
- Keine weiteren Kommentare in fremden Issues in diesem Goal
- Keine Zahlungen, keine Änderung am laufenden Dienst
- Keine Kontaktaufnahme zu einzelnen Wallet-Adressen oder Nutzern

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log

## Blockers
