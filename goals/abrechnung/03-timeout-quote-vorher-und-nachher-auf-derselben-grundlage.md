# Abrechnung Goal 03: Timeout-Quote vorher und nachher auf derselben Grundlage

## Status
ACTIVE

## Active Objective
Die Timeout-Quote vorher (Caddy-Log mit Join aufs Ledger) und die Quote nachher (`--since-rollout`, Datenbank allein) zählen über
denselben Zeitraum nebeneinander, und `docs/abrechnung/timeouts.md` nennt die Abweichung mit ihren Ursachen, bevor kanal oder die Seite
eine Quote nennt. Dazu steht die gemessene Summe der berechneten Abbrüche vom 10.11.2026 mit ihrem Befehl in `docs/abrechnung/` und
`docs/kette.md` statt der ungemessenen 0,37 USD (`ROADMAP.md`, abrechnung 03; übernimmt `goals/_vorschlaege/abrechnung-kritik-2026-11-10-2.md`
und `goals/_vorschlaege/abrechnung-kritik-2026-11-10-3.md`).
Widerlegt, wenn beide Messungen über denselben Zeitraum gleich zählen; dann steht genau das in `timeouts.md`, und die Abweichung ist 0.
MVP: Funktion, weil die Quote nachher die Zahl ist, die nach außen geht, und eine Zahl auf anderer Grundlage als die vorher einem Kunden
eine Besserung verspricht, die niemand gemessen hat (`loop-constraints.md`, Grundregel 3).

## Voraussetzungen
- abrechnung Goal 02 DONE

## Kontext für den Maker
- Die beiden Messungen zählen heute Verschiedenes (Vorschlag `abrechnung-kritik-2026-11-10-3.md`): Der Join (`count join` in
  `ops/timeout-quote.sh`) zählt jede Anfrage im Caddy-Log, auch Wiederholungen, die der Coalescer (`src/inference/dedupe.ts`) mit einer
  laufenden Antwort bedient und die keine eigene Zeile haben (sie nehmen im Join das Modell einer Zeile, die während ihrer Laufzeit
  gebucht wurde). `--since-rollout` (`count rows`) zählt nur Zeilen in Ledger und `inference_aborts`, eine je Leader. Die Grenze 59,5 s
  gilt im Join auf Caddys Uhr, bei `--since-rollout` auf `duration_ms` des Dienstes, die erst beim Aufruf des Anbieters startet
  (`startedAt` in `src/inference/proxy.ts`, nach Auth und Reservierung). Der Join kennt heute keinen Zeitraum; der Vergleich braucht für
  beide Seiten dieselben Grenzen.
- Der Vergleich ordnet jede Abweichung genau einer Ursache zu: `coalesced` (Caddy-Anfrage ohne eigene Zeile, die eine Antwort des
  Coalescers bekam), `clock` (Anfrage mit eigener Zeile, die auf einer Uhr Timeout ist und auf der anderen nicht), `unmatched` (Caddy-
  Anfrage ohne jede Zeile oder Zeile ohne Caddy-Anfrage im Zeitraum). Die Ursachen ergeben zusammen genau die Abweichung, bei Anfragen
  wie bei Timeouts; geht die Rechnung nicht auf, meldet das Werkzeug das statt einer Zahl.
- Der Zeitraum beginnt frühestens mit dem Rollout von abrechnung 02 (erste Buchung mit `duration_ms`), denn vorher hat die Datenbank keine
  Dauer. Sind es bei der Messung wenige Anfragen, steht die Zahl trotzdem in `timeouts.md`, und die Zeile `Quote nach außen:` sagt, ob
  kanal und Seite eine Quote nennen dürfen und welche, oder warum noch keine.
- Die Summe der Abbrüche vom 10.11.2026 ist in abrechnung 01 gemessen (`goals/abrechnung/ANNAHMEN.md`, Goal 01): fünf berechnete
  Abbrüche, die Gutschrift in `src/credits/aborted.ts` nennt ihre fünf `ref`, `ops/live.sh` erwartet `REFUND_MC`. Miss sie selbst noch
  einmal lesend gegen die Produktion (Caddy-Log Status 0 und die Ledger-Zeilen dieser `ref`, Datenbank mit `readonly: true`) und schreib
  den Befehl so in die Doku, dass ein anderer ihn wiederholen kann, ohne Adresse, Wallet oder Guthaben eines Kunden.
- `LOOP.md` nennt die 0,37 USD auch; den Satz ändert nur ein Mensch, du nicht. `docs/kette.md` korrigierst du.
- Der Laufzeitpfad ändert sich nicht: kein `src/**`, also kein Rollout. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und
  vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [x] `ops/timeout-quote.sh --compare` (Produktion, nur lesend) und `--compare-files CADDY ROWS` fahren Join und Datenbank-Messung über
      denselben Zeitraum (`TQ_SINCE` und `TQ_UNTIL`, ISO-Zeit UTC; ohne `TQ_SINCE` ab der ersten Buchung mit `duration_ms`, ohne
      `TQ_UNTIL` bis zur letzten Zeile) und geben je Modell eine Zeile `| <Modell> | caddy | <Anfragen> | <Timeouts> | <Quote> |` und eine
      Zeile `| <Modell> | service | … |` aus, darunter die Abweichung bei Anfragen und Timeouts und je Ursache eine Zeile
      `cause coalesced: <n>`, `cause clock: <n>`, `cause unmatched: <n>`; die Ursachen ergeben zusammen die Abweichung. Der Selftest
      zeigt es in beide Richtungen, ohne Netz: gepflanzte Zeilen, die beide Messungen gleich zählen, ergeben Abweichung 0 und jede Ursache
      0; eine gepflanzte Wiederholung, die der Coalescer bedient, und ein Paar mit 59,7 s im Caddy-Log und 58,9 s `duration_ms` ergeben
      `cause coalesced: 1` und `cause clock: 1`; eine Zeile außerhalb des Zeitraums zählt in keiner der beiden Messungen. Jede dieser
      Selftest-Zeilen beginnt mit `ok   compare` oder `FAIL compare`.
      Prüfung: `bash ops/timeout-quote.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^ok   compare"` muss mindestens 4 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-compare.test.ts` muss Exit-Code 0 haben; der Test fährt `--compare-files` gegen
      gepflanzte Dateien und verlangt, dass die Summe der Ursachen gleich der Abweichung ist.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/timeout-quote-compare.test.ts` muss mindestens 3 ausgeben.
- [x] `docs/abrechnung/timeouts.md` hat den Abschnitt `## Vorher und nachher auf derselben Grundlage`: Zeitraum in UTC, je Modell die
      Zeilen `caddy` und `service` aus `--compare`, die Abweichung, je Ursache eine Zeile `- coalesced: <n>`, `- clock: <n>`,
      `- unmatched: <n>` mit einem Satz, was sie bedeutet, der Befehl, aus dem die Zahlen stammen, eine Zeile `Widerlegt:` (ja, wenn beide
      gleich zählen, sonst nein mit der Abweichung) und eine Zeile `Quote nach außen:` (welche Messung kanal und Seite nennen dürfen, mit
      Zeitraum und Zahl der Anfragen, oder warum noch keine). Keine Adresse.
      Prüfung: `grep -c "^## Vorher und nachher auf derselben Grundlage" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "timeout-quote.sh --compare" docs/abrechnung/timeouts.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^[|] *openai/[^|]+[|] *(caddy|service) *[|]" docs/abrechnung/timeouts.md` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "^- (coalesced|clock|unmatched): [0-9]+" docs/abrechnung/timeouts.md` muss 3 ausgeben.
      Prüfung: `grep -cE "^(Widerlegt|Quote nach außen): " docs/abrechnung/timeouts.md` muss 2 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/timeouts.md` muss 0 ausgeben.
- [x] `docs/abrechnung/abbrueche-2026-11-10.md` nennt die berechneten Abbrüche vom 10.11.2026 je Fall in einer Tabellenzeile (Ende in
      UTC, Dauer im Caddy-Log, Betrag in mc), die Summe in mc und USD und den lesenden Befehl, aus dem sie stammt, ohne Adresse, Wallet
      oder Guthaben. Die Summe ist dieselbe, die `ops/live.sh` als Gutschrift erwartet, und `docs/kette.md` nennt sie mit Verweis auf
      diese Datei statt der 0,37 USD.
      Prüfung: `grep -c "$(sed -n 's/^REFUND_MC=//p' ops/live.sh)" docs/abrechnung/abbrueche-2026-11-10.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^[|] *2026-11-10" docs/abrechnung/abbrueche-2026-11-10.md` muss 5 ausgeben.
      Prüfung: `grep -cE "docker exec|ops/[a-z-]+\.sh" docs/abrechnung/abbrueche-2026-11-10.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/abbrueche-2026-11-10.md` muss 0 ausgeben.
      Prüfung: `grep -c "0,37" docs/kette.md` muss 0 ausgeben.
      Prüfung: `grep -c "abbrueche-2026-11-10.md" docs/kette.md` muss mindestens 1 ausgeben.
- [x] Der Laufzeitpfad bleibt unverändert, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Der Job `e2e` am Kopf des PR ist grün (`gh pr checks`).
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-10 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `ops/timeout-quote.sh --compare` und `--compare-files` zählen Join und Datenbank über denselben Zeitraum mit Ursachen coalesced, clock und unmatched, gemessen 46 gegen 46 Anfragen und 0 gegen 0 Timeouts (10.11.2026 20:27 bis 23:01 UTC, Abweichung 0), Abbrüche vom 10.11. neu gemessen (fünf, 79229 mc) in `docs/abrechnung/abbrueche-2026-11-10.md`, `docs/kette.md` ohne 0,37. Rot vorher: `test/timeout-quote-compare.test.ts` 6 von 6 rot gegen den alten Stand von `ops/timeout-quote.sh` (unbekannter Schalter), die neuen Selftest-Zeilen `compare` rot mit ausgeschaltetem Zeitraum (5 FAIL), ausgeschaltetem Coalescer-Abgleich (3 FAIL) und `TQ_LIMIT_S=58` (3 FAIL); Gegenprobe an Kopien der Produktionsdaten mit gepflanzter Wiederholung und Uhren-Paar ergibt `cause coalesced: 1` und `cause clock: 1`. Prüfbefehle: `bash ops/timeout-quote.sh --selftest` Exit 0, letzte Zeile `TIMEOUT QUOTE SELFTEST OK`; `grep -c "^ok   compare"` 15; `pnpm -s vitest run test/timeout-quote-compare.test.ts` 6 passed; `grep -cE "^\s*(it|test)\("` 6; Punkt 2: 1, 1, 4, 3, 2, 0; Punkt 3: 1, 5, 3, 0, 0, 1; `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` 0; `node scripts/check.mjs` Exit 0 (100 Dateien, 1272 Tests).
- 2026-11-10 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `origin/dev` war schon im Branch (nichts zu mergen), alle Prüfbefehle am Kopf `b811f44` neu gefahren. Prüfbefehle (Node 22.23.4): `bash ops/timeout-quote.sh --selftest` Exit 0, letzte Zeile `TIMEOUT QUOTE SELFTEST OK`, 0 FAIL; `grep -c "^ok   compare"` 15; `pnpm -s vitest run test/timeout-quote-compare.test.ts` Exit 0, 6 passed; `grep -cE "^\s*(it|test)\("` 6; Punkt 2: 1, 1, 4, 3, 2, 0; Punkt 3: 1, 5, 3, 0, 0, 1; `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` 0; `node scripts/check.mjs` Exit 0 (100 Dateien, 1272 Tests; der erste Lauf endete bei Last 150 mit Exit 1 durch `Timeout calling onTaskUpdate` bei 1272 grünen Tests, der zweite grün); `gh pr checks 8`: check pass, e2e pass am Kopf `b811f44`.

## Blockers
