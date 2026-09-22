# GOAL.md

## Status
DONE (2026-09-19 18:35, Verifier PASS im zweiten Lauf)

## Active Objective
Die vier Annahmen unter dem GTM-Plan mit belegbaren Daten prüfen, bevor weitere Reichweite gekauft
oder erarbeitet wird: Wie groß ist die zahlende Nachfrage wirklich (on-chain), wie viele neue
Betroffene kommen pro Woche nach, gibt es schon einen kompatiblen Ersatz, und was kostet ein
blockierter Nutzer die Alternative "ohne Control Plane weiterlaufen".

## Done Condition
- [x] `docs/research/2026-09-19-nachfrage.md` existiert und beantwortet die vier Fragen mit je
      einer Zahl oder einem ausdrücklichen "nicht ermittelbar", jeweils mit dem Befehl oder der
      URL, aus der die Zahl stammt
      Prüfung: die Datei enthält die Abschnitte `## F1` bis `## F4`, je einen Abschnitt
      `### Beleg` mit reproduzierbarem Befehl, und einen Abschnitt `## Konsequenz für den Plan`
- [x] F1 (Zahlungsfluss an Conway): Monatswerte 2026 für USDC-Zuflüsse an Conways payTo
      `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10` auf Base, plus Zahl der zahlenden Wallets je
      Monat und die letzten 30 Tage; Quelle ist die Kette, nicht eine Behauptung aus dem Handoff
- [x] F2 (Zulauf): Zahl unterschiedlicher GitHub-Nutzer mit Provisionierungs-Problem je Monat seit
      Juli 2026 und die Rate der letzten 30 Tage; dazu, ob nach dem 26.08.2026 noch Upstream-
      Aktivität stattfand
- [x] F3 (Wettbewerb): Gibt es einen anderen öffentlich erreichbaren Conway-kompatiblen Dienst
      oder Fork, der das Problem löst? Belegt durch Suche in GitHub-Code, Forks, npm und Web
- [x] F4 (kostenlose Alternative): Was genau kann ein blockierter Nutzer ohne Control Plane tun,
      belegt am Upstream-Code `Conway-Research/automaton@d8f8168`: kommt die Runtime ohne
      `--provision` hoch, wie weit läuft sie mit eigenem OpenAI-Key, was bricht, und was kostet
      ihn das an Arbeit. Ergebnis ist die ehrliche Antwort auf "warum sollte jemand zahlen"
- [x] Der GTM-Plan in STATE.md ist nach den Funden angepasst, inklusive Abbruchkriterium
- [x] goal-verifier PASS (prüft die Zahlen stichprobenartig selbst nach)

## Acceptance Criteria
- [x] Jede Zahl ist reproduzierbar: RPC-Aufruf, `gh`-Befehl, npm-API-URL oder Dateipfad
- [x] Keine Zahl aus dem alten Handoff wird übernommen, ohne sie neu zu belegen
- [x] Unsicherheit wird benannt (Zeitraum, Lücken, Rate-Limits), nicht geglättet
- [x] Die Konsequenz steht als Entscheidung da, nicht als Optionsliste: was wir tun, was wir lassen
- [x] Wenn die Daten gegen das Produkt sprechen, steht das genau so in der Datei

## Deny List
- Keine weiteren Kommentare in fremden Issues in diesem Goal
- Keine Zahlungen, keine Änderung am laufenden Dienst
- Keine Kontaktaufnahme zu einzelnen Wallet-Adressen oder Nutzern

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log

- Zyklus 1 (19.09.2026, 15:00 bis 17:30): Vier Recherchen parallel, Ergebnis in
  `docs/research/2026-09-19-nachfrage.md`. F1 als lückenloser On-Chain-Vollscan (5.652 Chunks,
  9.012 Transfer-Events), F4 als eigener Containerlauf der Upstream-Runtime mit unerreichbarem
  Kontostand. Zwei Agentenbehauptungen korrigiert (angeblicher Marketing-Pitch in #393, zu enge
  Issue-Kernliste).
- Zyklus 2 (19.09.2026, 17:40 bis 18:00): STATE.md auf die Funde angepasst. Messgröße von 50 auf
  fünf fremde Automatons in 30 Tagen, Abbruchkriterium unter drei am 19.10.2026, Positionierung auf
  die Abrechnungsschicht, Gateway-These als nächster Prüfauftrag, Goal 8 als nächste Build-Queue-
  Zeile. Die fünf offenen Punkte aus dem Handoff-Abschnitt "Nicht verifiziert" nachgeprüft:
  `/v1/status` liefert unverändert aus (`automatons: 1`), keine Antwort auf die drei
  Issue-Kommentare, PR `xpaysh/awesome-x402#1564` offen und unkommentiert, `ops/status.sh` läuft
  durch (Zertifikat 89 Tage, keine Restarts, keine Fehler in 24 h), on-chain seit 14:59 UTC nur
  Mikrobeträge einer einzelnen Wallet (0,034 USDC).

## Blockers

- Zyklus 3 (19.09.2026, 18:05 bis 18:35): Verifier-Lauf 1 (Sonnet, REJECT-Default) bestätigte die
  beiden Pflicht-Nachrechnungen exakt (F1-Chunk 4 Logs / 10,003386 USDC / 2 Wallets; alle acht
  Codestellen aus F4 gegen einen frischen Klon von `Conway-Research/automaton@d8f8168` inhaltlich
  richtig, Zeilenabweichungen im Rahmen weniger Zeilen), vergab aber REJECT wegen drei Lücken:
  keine Angabe zu Rate-Limits und Laufzeit des Vollscans, F3 und F4 ohne Zahl oder ausdrückliches
  "nicht ermittelbar".
  Behoben: Rohdaten aus der Vorsession gerettet nach `docs/research/data/`
  (9.012 Zeilen CSV plus Beschreibung), Unsicherheit der Erhebung in F1 benannt (2.000-Blöcke-Limit,
  Wiederholung bei Fehlschlag, 30 Minuten Laufzeit, was der Datensatz nicht zeigt), F3 auf "Null"
  und F4 auf "null Inferenz-Requests" plus ausdrücklich nicht ermittelbarem Arbeitsaufwand
  zugespitzt. Zusätzlich den unter UNSICHER gemeldeten Schwachpunkt geschlossen: die F2-Zahlen
  waren aus den gezeigten Befehlen nicht ableitbar, es gibt jetzt `docs/research/data/f2-affected.sh`
  mit Issue-Liste und Zähldefinition. Dabei fiel auf, dass Issue #371 (SIWE 500, 20.08.2026) in
  keiner Liste stand; es ist in F2, in der Antwortliste und in STATE.md ergänzt.
- Verifier-Lauf 2 (19.09.2026, 18:35): PASS, keine Gaps. Er hat die CSV selbst nachgerechnet
  (alle acht Monatswerte, 30-Tage-Fenster 430,01 / 44 / 90, 7-Tage-Fenster 70,00 / 10 / 16, keine
  Duplikate, keine Monatslücken), zwei Zeilen per `eth_getTransactionReceipt` gegen die Kette
  gestichprobt, `f2-affected.sh` ausgeführt (Juli 6, August 12, September 3, gesamt 20) und den
  Diff auf Abschwächungen geprüft. Offen geblieben ist nur, was nicht prüfbar ist: ob hinter den
  GitHub-Konten in F2 dieselbe Person mehrfach steckt.
