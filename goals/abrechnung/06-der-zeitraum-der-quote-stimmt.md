# Abrechnung Goal 06: Der Zeitraum der Quote stimmt, und kein Tag zählt, den der Anbieter noch korrigiert

## Status
PLANNED

## Active Objective
Jede Zahl, die kanal nach außen nennt, zählt jeden Tag ihres Zeitraums und keinen, den der Anbieter noch ändert. Danach weist
`ops/timeout-quote.sh` ein Datum ohne Uhrzeit in `TQ_SINCE` und `TQ_UNTIL` mit Exit 2 ab, statt den letzten Tag still abzuschneiden,
`--compare` rechnet die Caddy-Seite ein zweites Mal ohne jede Zuordnung gegen, und `ops/abort-purchase.sh` rechnet Tage, deren Ende
weniger als 72 h zurückliegt, als `provisional` nicht in den Einkauf je Abbruch. Der Einkauf je Abbruch für 10. bis 17.11.2026 ist
danach neu gemessen, samt der Antwort, ob die 7783 mc vom 12.11. ein Abbruch oder eine Korrektur des Anbieters sind (`ROADMAP.md`,
abrechnung 06; übernimmt `goals/_vorschlaege/abrechnung-kritik-2026-11-18-3.md` und `goals/_vorschlaege/abrechnung-kritik-2026-11-18-2.md`).
Widerlegt, wenn `TQ_UNTIL=2026-11-17 ops/timeout-quote.sh` am Kopf von `dev` schon mit Exit 2 endet.
MVP: Funktion, weil kanal sonst eine Quote oder einen Einkauf nennt, dem ein Tag fehlt oder dessen Tage der Anbieter danach noch ändert.

## Voraussetzungen
- abrechnung Goal 05 DONE
- frühestens 2026-11-21

## Kontext für den Maker
- Ziel: Wer bei uns eine Zahl über unsere Antworten liest (Quote nach außen, Einkauf je Abbruch), bekommt eine, die jeden Tag ihres
  Zeitraums zählt und sich nicht mehr ändert, weil der Anbieter einen Tag nachträglich korrigiert.
- Datum ohne Uhrzeit (abrechnung-kritik-2026-11-18-3): `parseIso` in `ops/timeout-quote.sh` nimmt seit abrechnung 05 mit `(T|$)` auch
  `2026-11-17` an; `TQ_UNTIL=2026-11-17` heißt dann 17.11. 00:00 UTC und schneidet den ganzen letzten Tag still ab. Am Kopf von `dev`
  (c54416a) endet `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17 bash ops/timeout-quote.sh --compare-files /dev/null /dev/null` mit
  Exit 0 und der Kopfzeile `period … to 2026-11-17T00:00:00.000Z`. Volle Form heißt Datum, Uhrzeit und Zone (`Z` oder Offset); eine
  Uhrzeit ohne Zone liest `Date.parse` als Ortszeit und wird genauso abgewiesen. Die Meldung auf stderr nennt die Variable und die volle
  Form als Beispiel (`… use the full form, e.g. 2026-11-17T23:59:59Z`). Ein leerer Wert bleibt erlaubt und heißt wie heute „kein Rand“
  (`ops/live.sh` ruft `--rows` mit `TQ_SINCE=''`).
- Gegenrechnung ohne Zuordnung (abrechnung-kritik-2026-11-18-3): `check caddy` aus abrechnung 05 zählt über `joinCalls`, also über
  dieselbe Zuordnung `ownRow` wie der Vergleich; ein Fehler in `ownRow` verschiebt beide Zählungen gleich und bleibt unsichtbar
  (`goals/abrechnung/ANNAHMEN.md`, `## Goal 05`, „Geteilt sind nur …“). Neu ist eine Funktion `caddyEnds`, die nur das Caddy-Log liest
  (`callsOf`) und die Anfragen nach ihrem Ende zählt: die Untergrenze mit dem Ende von `TQ_SINCE` plus 15 s bis `TQ_UNTIL` minus 15 s,
  die Obergrenze von `TQ_SINCE` minus 15 s bis `TQ_UNTIL` plus 15 s, je für Anfragen und Timeouts. Liegt die Spalte `caddy` des
  Vergleichs außerhalb einer der beiden Spannen, endet der Lauf mit Exit 3 und `independent check failed: caddy ends`. Ob die Ränder
  so genau stimmen (eine Zeile wird bis 15 s nach dem Ende der Anfrage geschrieben, frühestens 1 s vor ihrem Beginn), entscheidest du
  mit Grund in `goals/abrechnung/ANNAHMEN.md` unter `## Goal 06`; die Funktion ruft weder `ownRow` noch `joinCalls`, `byTime` oder
  `rowsOf`. Die Zeile `check caddy: compare …, join …` bleibt, weil sie eine falsch einsortierte Klasse fängt.
- Gepflanzter Fehler in `ownRow`: Der Selftest kopiert das Skript nach `mktemp`, verfälscht `ownRow` (etwa: das Fenster endet am Ende
  der Anfrage statt 15 s danach, oder der Abstand des Generation-Starts darf 30 s statt 2 s sein) und fährt die Kopie mit
  `--compare-files` über gepflanzte Zeilen, deren Zuordnung sich dadurch ändert; verlangt ist Exit 3 mit `independent check failed`.
  Mit dem Skript von `dev` endet dieselbe Verfälschung mit Exit 0; die Zeile im Progress Log nennt die Verfälschung und beide Exit-Codes.
- Vorläufige Tage (abrechnung-kritik-2026-11-18-2): Der Anbieter korrigiert Tageswerte nachträglich, den 10.11.2026 am 18.11. um
  3913 mc (`docs/abrechnung/einkauf-abbrueche.md`, `## Nach sieben Tagen`); gemessen wurde am 18.11. um 00:18 UTC, 18 Minuten nach dem
  Ende des 17.11. `ops/abort-purchase.sh` bekommt `AP_SETTLE_H` (Standard 72): Ein Tag, dessen Ende (der folgende Tag 00:00 UTC)
  weniger als `AP_SETTLE_H` Stunden vor `AP_NOW` liegt, steht weiter in der Tabelle, bekommt eine Zeile
  `provisional <Tag> <Modell>: <Lücke mc>` und zählt weder für `noise` noch für `baseline` noch für die Schätzung in
  `purchase without sale`. Gibt es keinen solchen Tag, steht `provisional: none` (wie `noise: none`). Der Selftest fährt eine feste Uhr,
  etwa `AP_NOW=2026-11-18T00:18:00Z`: der 15.11. ist `provisional` (Ende 48 h 18 min vorher) und geht nicht in die Schätzung, der
  14.11. zählt (72 h 18 min). Bestehende Fälle in `--selftest` und `test/abort-purchase.test.ts` (etwa `AP_NOW=2026-11-23T08:00:00Z` mit
  `noise 2026-11-20`) behalten ihre Erwartung mit `AP_SETTLE_H=0`; abrechnung 04 prüft im Audit `^ok   purchase` mindestens 5 und
  `^ok   purchase .*baseline` mindestens 2.
- Fester Zeitraum: Heute legt `AP_NOW` zugleich das Ende des Zeitraums und damit fest, welche Tage abgeschlossen sind. Für die
  wiederholbare Messung über 10. bis 17.11.2026 mit der echten Uhr bekommt das Werkzeug `AP_UNTIL` (letzter gezählter Tag, einschließlich,
  `JJJJ-MM-TT`, Standard der Tag vor `AP_NOW`); ein Tag nach `AP_NOW` zählt nie. Der Befehl der Messung ist
  `AP_SINCE=2026-11-10 AP_UNTIL=2026-11-17 bash ops/abort-purchase.sh`, gefahren frühestens am 21.11.2026 (72 h nach dem Ende des 17.11.),
  deshalb die Voraussetzung oben. Steht dann noch eine Zeile `provisional`, ist die Uhr falsch; nicht vor dem 21.11. messen.
- 7783 mc vom 12.11.2026: Bei `openai/gpt-5.2` hing der Einkauf ohne Verkauf an einem einzigen Abbruch am 12.11., dem Tag, an dem der
  Ausfall (Guthaben beim Anbieter leer, 11.11. 02:01 bis 12.11.2026 08:22 UTC) endete. Belege für die Antwort: der Tageswert des
  Anbieters für den 12.11. heute gegen 366344 mc vom 18.11. (Tabelle in `## Nach sieben Tagen`), Zeit und Modell dieser einen Zeile in
  `inference_aborts` gegen das Ende des Ausfalls, die Lücke des 12.11. in der neuen Messung. Die Antwort ist `Abbruch`,
  `Korrektur des Anbieters` oder `nicht entscheidbar`, je mit dem Beleg, der sie trägt.
- Doku, die frühere Goals im Audit prüfen und die gleich bleiben muss: `docs/abrechnung/timeouts.md` behält genau zwei Zeilen
  `^(Widerlegt|Quote nach außen): ` (abrechnung 03) und genau drei Zeilen `^- (coalesced|clock|unmatched): ` (abrechnung 03), genau eine
  Zeile `^Einkauf je Abbruch ohne Antwort: ` und genau eine `^Anbieterwahl: ` mit `17.11.2026` und `Nach sieben Tagen` (abrechnung 05).
  `docs/abrechnung/einkauf-abbrueche.md` behält `## Nach sieben Tagen` und genau eine Zeile `^Einkauf je Abbruch ohne Antwort: ` im Muster
  von abrechnung 05 (`<mc> mc (<n> Abbrüche, 10.11. bis 17.11.2026)` oder `keine Zahl, weil `). Ändert die neue Messung die Zahlen, die
  `Anbieterwahl:` nennt, ziehst du sie in dieser Zeile nach.
- Messung der Quote mit der neuen Gegenrechnung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh
  --compare` noch einmal fahren und die Zeile `check caddy ends:` in `## Nach sieben Tagen` von `timeouts.md` ergänzen. Endet der Lauf
  mit Exit 3, wird `Quote nach außen:` zu `keine, weil <Abweichung>`. Fehlt der Anfang des Zeitraums inzwischen im Caddy-Log (gedrehte
  Dateien weg, die erste Caddy-Zeile liegt nach `TQ_SINCE`), steht das als Grund dort, und die Quote vom 18.11. bleibt mit diesem Hinweis.
- Produktion nur lesend: Caddy-Log über `ops/access-log.sh`, Datenbank mit `readonly: true` im Container `deploy-cp-1`, Aktivität des
  Anbieters nur per GET. Ausgegeben wird nie eine Adresse, eine Wallet oder ein Guthaben. Variablen aus
  `~/.config/control-plane/loop.env`, Werte nie ausgeben. Den Management-Key liest nur `ops/abort-purchase.sh` aus seiner eigenen Datei.
- Der Dienst ändert sich nicht: kein `src/**`, also kein Rollout; der Merge bekommt wegen `ops/**` die übliche Live-Prüfung. Node 22
  vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Gedankenstrich und nichts zu den
  Bedingungen des Anbieters in Doku oder Code (`check` prüft es).

## Done Condition
- [ ] `ops/timeout-quote.sh` weist in `TQ_SINCE` und `TQ_UNTIL` ein Datum ohne Uhrzeit und eine Uhrzeit ohne Zone mit Exit 2 ab, bevor
      es zählt; die Meldung auf stderr nennt die Variable und die volle Form (`full form`). Ein leerer Wert bleibt erlaubt. Der Selftest hat
      einen Fall, dessen Zeile mit `ok   period date without time` beginnt; mit dem Skript von `dev` ist er rot, die Zeile im Progress
      Log nennt es.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17 bash ops/timeout-quote.sh --compare-files /dev/null /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17 bash ops/timeout-quote.sh --compare-files /dev/null /dev/null 2>&1 | grep -c "full form"` muss mindestens 1 ausgeben.
      Prüfung: `TQ_SINCE=2026-11-10 bash ops/timeout-quote.sh --rows /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59 bash ops/timeout-quote.sh --compare-files /dev/null /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare-files /dev/null /dev/null` muss Exit-Code 0 haben.
      Prüfung: `TQ_SINCE= bash ops/timeout-quote.sh --rows /dev/null` muss Exit-Code 0 haben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^ok   period date without time"` muss mindestens 1 ausgeben.
- [ ] `--compare` rechnet die Caddy-Seite ohne jede Zuordnung gegen: Die Funktion `caddyEnds` zählt die Caddy-Anfragen nach ihrem Ende im
      Zeitraum, mit 15 s Toleranz an beiden Rändern, und gibt die Zeile
      `check caddy ends: compare <Anfragen> <Timeouts>, ends <min>..<max> <Timeouts min>..<Timeouts max>` aus. Liegt die Spalte `caddy`
      außerhalb, endet der Lauf mit Exit 3 und `independent check failed: caddy ends` auf stderr. Der Selftest zeigt beide Richtungen ohne
      Netz (Zeilen `ok   compare check ends …`: gleich zählende Zeilen mit Exit 0, eine Anfrage, deren Ende 10 s vor `TQ_UNTIL` liegt und
      deren Zeile danach geschrieben wird, mit Exit 0) und einen gepflanzten Fehler in `ownRow` in einer Kopie des Skripts, der mit Exit 3
      endet (Zeile `ok   compare check ownRow fault`). Unter derselben Verfälschung endet das Skript von `dev` mit Exit 0, die Zeile im
      Progress Log nennt es. `--selftest-scale` bleibt unter 10 Sekunden.
      Prüfung: `bash ops/timeout-quote.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^ok   compare check ends"` muss mindestens 2 ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^ok   compare check ownRow fault"` muss 1 ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^FAIL"` muss 0 ausgeben.
      Prüfung: `sed -n '/const caddyEnds/,/^};/p' ops/timeout-quote.sh | grep -cE "ownRow|joinCalls|byTime|rowsOf"` muss 0 ausgeben.
      Prüfung: `grep -c "independent check failed: caddy ends" ops/timeout-quote.sh` muss mindestens 1 ausgeben.
      Prüfung: `timeout 10 bash ops/timeout-quote.sh --selftest-scale` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SCALE OK` ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-compare.test.ts test/timeout-quote-selftest.test.ts test/timeout-quote-scale.test.ts` muss Exit-Code 0 haben.
- [ ] Die Quote über die sieben Tage trägt die neue Gegenrechnung: `## Nach sieben Tagen` in `docs/abrechnung/timeouts.md` hat genau eine
      Zeile `check caddy ends:` aus dem Lauf `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare`
      mit dem Datum der Messung daneben; endete er mit Exit 3, ist `Quote nach außen:` `keine, weil <Abweichung>`.
      `goals/abrechnung/ANNAHMEN.md` hat den Abschnitt `## Goal 06` mit der Randregel von `caddyEnds`, der Regel für ein Datum ohne
      Uhrzeit und der Regel für vorläufige Tage. Keine Adresse.
      Prüfung (Netz): `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare | grep -c "^check caddy ends: "` muss 1 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/timeouts.md | grep -c "^check caddy ends: compare "` muss 1 ausgeben.
      Prüfung: `grep -cE "^(Widerlegt|Quote nach außen): " docs/abrechnung/timeouts.md` muss 2 ausgeben.
      Prüfung: `grep -cE "^Quote nach außen: ([0-9]+,[0-9] % \([0-9]+ von [0-9]+ Anfragen, 10\.11\.2026 20:27 bis 17\.11\.2026 23:59 UTC, Messung service\)|keine, weil )" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "^## Goal 06" goals/abrechnung/ANNAHMEN.md` muss 1 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/timeouts.md` muss 0 ausgeben.
- [ ] `ops/abort-purchase.sh` markiert Tage, deren Ende weniger als `AP_SETTLE_H` Stunden (Standard 72) vor `AP_NOW` liegt, mit der Zeile
      `provisional <Tag> <Modell>: <Lücke mc>` und rechnet sie weder in `noise` noch in `baseline` noch in die Schätzung; ohne solchen Tag
      steht `provisional: none`. `AP_UNTIL` legt den letzten gezählten Tag fest. Der Selftest fährt eine feste Uhr und hat mindestens zwei
      Zeilen `ok   purchase provisional …` (ein Tag innerhalb von 72 h ist vorläufig und fehlt in der Schätzung, ein Tag knapp darüber
      zählt) und eine Zeile `ok   purchase until …`; die bestehenden Fälle behalten ihre Erwartung. Mit dem Skript von `dev` sind die neuen
      Fälle rot, die Zeile im Progress Log nennt es.
      Prüfung: `bash ops/abort-purchase.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `ABORT PURCHASE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest | grep -c "^ok   purchase provisional"` muss mindestens 2 ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest | grep -c "^ok   purchase until"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest | grep -c "^ok   purchase"` muss mindestens 8 ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest | grep -c "^FAIL"` muss 0 ausgeben.
      Prüfung: `grep -cE "^\s*(it|test)\(.*provisional" test/abort-purchase.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/abort-purchase.test.ts test/abort-purchase-key-file.test.ts` muss Exit-Code 0 haben.
- [ ] Der Einkauf je Abbruch über 10. bis 17.11.2026 ist ohne vorläufigen Tag neu gemessen. `docs/abrechnung/einkauf-abbrueche.md` hat den
      Abschnitt `## Nach 72 Stunden` mit dem Befehl `AP_SINCE=2026-11-10 AP_UNTIL=2026-11-17 bash ops/abort-purchase.sh`, dem Datum der
      Messung, der Tabelle, den Zeilen `noise`, `provisional`, `baseline` und `purchase without sale` und genau einer Zeile
      `7783 mc am 12.11.2026: <Abbruch | Korrektur des Anbieters | nicht entscheidbar>, weil <Beleg>`. Die eine Zeile
      `Einkauf je Abbruch ohne Antwort:` der Datei trägt die neue Zahl oder den Grund und verweist auf `Nach 72 Stunden`; dieselbe Zeile
      steht in `docs/abrechnung/timeouts.md`. `## Nach sieben Tagen` verweist auf den neuen Abschnitt. Keine Adresse.
      MVP: Funktion, weil Anbieterwahl und kanal sonst mit einem Einkauf rechnen, dessen letzte Tage der Anbieter danach noch änderte.
      Prüfung (Netz): `AP_SINCE=2026-11-10 AP_UNTIL=2026-11-17 bash ops/abort-purchase.sh | grep -c "^provisional "` muss 0 ausgeben.
      Prüfung (Netz): `AP_SINCE=2026-11-10 AP_UNTIL=2026-11-17 bash ops/abort-purchase.sh | grep -c "^purchase without sale "` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^## Nach 72 Stunden" docs/abrechnung/einkauf-abbrueche.md` muss 1 ausgeben.
      Prüfung: `grep -c "AP_SINCE=2026-11-10 AP_UNTIL=2026-11-17 bash ops/abort-purchase.sh" docs/abrechnung/einkauf-abbrueche.md` muss mindestens 1 ausgeben.
      Prüfung: `sed -n '/^## Nach 72 Stunden/,/^## /p' docs/abrechnung/einkauf-abbrueche.md | grep -cE "^7783 mc am 12\.11\.2026: (Abbruch|Korrektur des Anbieters|nicht entscheidbar), weil "` muss 1 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/einkauf-abbrueche.md | grep -c "Nach 72 Stunden"` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^Einkauf je Abbruch ohne Antwort: ([0-9]+ mc \([0-9]+ Abbrüche, 10\.11\. bis 17\.11\.2026\)|keine Zahl, weil )" docs/abrechnung/einkauf-abbrueche.md` muss 1 ausgeben.
      Prüfung: `grep "^Einkauf je Abbruch ohne Antwort: " docs/abrechnung/einkauf-abbrueche.md | grep -c "Nach 72 Stunden"` muss 1 ausgeben.
      Prüfung: `cat docs/abrechnung/einkauf-abbrueche.md docs/abrechnung/timeouts.md | grep -c "^Einkauf je Abbruch ohne Antwort: "` muss 2 ausgeben.
      Prüfung: `cat docs/abrechnung/einkauf-abbrueche.md docs/abrechnung/timeouts.md | grep "^Einkauf je Abbruch ohne Antwort: " | sort -u | wc -l` muss 1 ausgeben.
      Prüfung: `grep -c "^Anbieterwahl: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/einkauf-abbrueche.md` muss 0 ausgeben.
- [ ] Der Laufzeitpfad bleibt unverändert, und `check` ist grün.
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
- jede schreibende Handlung in der Produktion; Datenbank nur mit `readonly: true`, Caddy-Log nur lesend, beim Anbieter nur GET
- `~/.config/control-plane/loop.env` und `~/.config/control-plane/openrouter-management.env` schreibt kein Agent; die zweite liest nur
  `ops/abort-purchase.sh`, kein Agent sourct oder liest sie
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
