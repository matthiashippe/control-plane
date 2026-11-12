# Abrechnung Goal 05: Quote nach außen nach sieben Tagen

## Status
PLANNED

## Active Objective
Die Timeout-Quote, die kanal und Seite nennen dürfen, ist gemessen: `ops/timeout-quote.sh --compare` läuft über den Zeitraum vom
Rollout von abrechnung 02 (10.11.2026 20:27:18 UTC) bis 17.11.2026 23:59:59 UTC, rechnet sich unabhängig gegen (`caddy` gegen
`--join`, `service` gegen `--rows`) und hält das Caddy-Log von sieben Tagen aus. Danach steht in `docs/abrechnung/timeouts.md` genau
eine Zeile `Quote nach außen:` mit Zahl, Zeitraum und Anfragen oder mit dem Grund, warum weiter keine (`ROADMAP.md`, abrechnung 05;
übernimmt `goals/_vorschlaege/abrechnung-kritik-2026-11-10-4.md`, `-5.md` und `-6.md`).
Widerlegt, wenn der Vergleich über die sieben Tage nicht gleich zählt und die Gegenrechnung die Abweichung keiner Ursache zuordnen
kann; dann steht genau das mit der Abweichung in `timeouts.md`, und die Quote nach außen bleibt `keine`.
MVP: Funktion, weil kanal und Seite sonst nie eine gemessene Quote nennen und der Vergleich nach sieben Tagen Verkehr ohne die
Skalierung abbricht.

## Voraussetzungen
- abrechnung Goal 04 DONE
- frühestens 2026-11-18

## Kontext für den Maker
- Bestand: `--compare` und `--compare-files` aus abrechnung 03 (`ops/timeout-quote.sh`, Modus `compare` in `COUNT_JS`), Tests in
  `test/timeout-quote-compare.test.ts` und `test/timeout-quote-selftest.test.ts`, Ergebnis vom 10.11.2026 im Abschnitt
  `## Vorher und nachher auf derselben Grundlage` von `docs/abrechnung/timeouts.md` (46 Anfragen in gut zweieinhalb Stunden, 0
  Timeouts). Dort steht heute die Zeile `Quote nach außen: noch keine …` mit dem Termin 17.11.2026; dieses Goal löst sie ein.
- Skalierung (abrechnung-kritik-2026-11-10-6): Der erste Durchlauf von `compare` prüft jede Caddy-Anfrage gegen alle Zeilen (doppelte
  Schleife über `reqs` und `rs`), und das Ende des Zeitraums entsteht mit `Math.max(...items.map(…))`, das ab etwa 10^5 Einträgen mit
  `RangeError` abbricht. Zeilen nach Zeit sortieren und mit einem gleitenden Fenster (Zeitfenster der Anfrage minus 1 s bis Ende plus
  15 s) abgleichen, Maximum und Minimum mit `reduce`; dieselbe Zuordnung wie heute, also bleiben die bestehenden Tests unverändert grün.
  Der Modus `join` hat dieselbe doppelte Schleife; zieh ihn mit, weil die Gegenrechnung ihn über dieselben sieben Tage fährt.
- Gegenrechnung (abrechnung-kritik-2026-11-10-5): Der Exit 3 „causes do not add up“ greift nie, weil Ursachen und Abweichung aus
  derselben Klassifikation gezählt werden. Statt dessen rechnet `--compare` über denselben Zeitraum unabhängig gegen: die Summe der
  Spalte `caddy` gegen den Join (`--join`-Code über dieselben Eingaben) und je Modell die Spalte `service` gegen `--rows`. `--join` und
  `--rows` beachten dafür `TQ_SINCE` und `TQ_UNTIL` (heute kennt `--rows` nur einen Beginn und `--join` keinen Zeitraum). Weil
  `compare` ein Paar nach der Zeit seiner Zeile in den Zeitraum legt und der Join nach dem Ende der Anfrage, darf ein Paar, dessen
  Anfrage vor der Grenze endet und dessen Zeile danach geschrieben wird, keinen falschen Exit 3 auslösen; wie du die Grenze für beide
  gleich legst, ohne die Gegenrechnung zur Selbstsumme zu machen, entscheidest du, mit Grund in `goals/abrechnung/ANNAHMEN.md`.
- Messzeitraum: `TQ_SINCE=2026-11-10T20:27:18Z` (erste Buchung mit `duration_ms`, Rollout von abrechnung 02) und
  `TQ_UNTIL=2026-11-17T23:59:59Z`, fest, damit die Zahl wiederholbar ist. Das Goal startet deshalb frühestens am 18.11.2026
  (Voraussetzung oben). `ops/access-log.sh` liest auch die gedrehten Dateien des Caddy-Logs; fehlt ein Teil des Zeitraums im Log (die
  erste Caddy-Zeile liegt nach `TQ_SINCE`), ist die Quote nach außen `keine, weil` mit diesem Grund, und der Vergleich steht trotzdem in
  der Doku.
- Die Quote nach außen ist die Messung `service`, wie abrechnung 03 festgelegt hat (sie zählt im Vergleich dasselbe wie der Join und
  kommt ohne Caddy-Log aus). Eine Zahl steht dort nur, wenn `--compare` über den Zeitraum mit Exit 0 endet; endet er mit Exit 3, steht
  `keine, weil` mit der Abweichung der Gegenrechnung. Vorher waren es 3 Timeouts in 224 Anfragen an einem Tag (Abschnitt
  `## Vorher und nachher auf derselben Grundlage`); die Zeile nennt beide Zahlen nebeneinander, damit kanal und Seite keine Besserung
  behaupten, die die Zahl nicht trägt.
- Produktion nur lesend: Caddy-Log über `ops/access-log.sh`, Datenbank mit `readonly: true` im Container `deploy-cp-1` (wie `ROWS_JS`).
  Ausgegeben wird nie eine Adresse, eine Wallet oder ein Guthaben. Variablen aus `~/.config/control-plane/loop.env`, Werte nie ausgeben.
- Management-Key (abrechnung-kritik-2026-11-11-2, Entscheidung Tech Lead 12.11.2026): `OPENROUTER_MANAGEMENT_KEY` stand in
  `~/.config/control-plane/loop.env`, die jede Rolle lädt; ein Management-Key darf Schlüssel und Limits des Kontos ändern. Seit dem
  12.11.2026 liegt er in einer eigenen Datei `~/.config/control-plane/openrouter-management.env` (0600, eine Zeile
  `OPENROUTER_MANAGEMENT_KEY=…`), und `loop.env` trägt ihn nicht mehr. `ops/abort-purchase.sh` liest ihn nur von dort (Pfad
  überschreibbar mit `AP_MANAGEMENT_KEY_FILE`, für den Test), parst genau diese eine Zeile, ohne die Datei zu sourcen und ohne zu
  exportieren, nimmt ihn nicht mehr aus der Umgebung oder aus `loop.env` und bricht mit Exit 2 ab, wenn die Datei fehlt, leer ist oder
  andere Rechte als 0600 hat. Bis dieser Punkt gebaut ist, endet das Werkzeug mit `OPENROUTER_MANAGEMENT_KEY missing`; das ist erwartet.
  Kein Agent liest oder sourct die Datei selbst, auch nicht zum Prüfen; ihr Inhalt steht nie in einer Ausgabe.
- Einkauf je Abbruch (abrechnung-kritik-2026-11-11-4): Die Zahl „Einkauf ohne Verkauf 0 mc“ in `docs/abrechnung/einkauf-abbrueche.md`
  stammt aus dem 10.11.2026, einem Tag ohne Zeile in `inference_aborts`; die Frage, was ein Abbruch ohne Antwort beim Anbieter kostet,
  ist damit offen. Dieses Goal fährt `bash ops/abort-purchase.sh` über dieselben ganzen UTC-Tage wie `--compare` (`AP_SINCE=2026-11-10`,
  `AP_NOW=2026-11-18T00:00:00Z`, also 10. bis 17.11.2026; die Aktivität des Anbieters kennt nur ganze Tage, der Rollout-Tag zählt
  ganz) und schreibt die Zahl je Abbruch neu. Gibt es keine Zeile mit `answered = 0` oder nur `noise`, steht dort keine Zahl, sondern
  der Grund.
- Ausfall im Messfenster: Vom 11.11.2026 02:01 UTC bis zur Aufladung war das Guthaben beim Anbieter leer, der Dienst antwortete auf
  Inferenz 503 (fehler 01). Diese Anfragen sind keine Timeouts und keine Abbrüche; nenne den Zeitraum in `timeouts.md` und
  `einkauf-abbrueche.md`, damit niemand die Quote oder den Einkauf je Abbruch aus dem Ausfall liest.
- Traction: Eine gemessene Quote über sieben Tage ist der Satz, mit dem kanal 01 einem Automaton aus einem Conway-Issue sagt, dass seine
  Anfragen bei uns ankommen; ohne sie nennt die Antwort keine Zahl oder eine, die nicht hält.
- Der Laufzeitpfad ändert sich nicht: kein `src/**`, also kein Rollout. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und
  vitest im Vordergrund mit eigenem Timeout. Kein Gedankenstrich und nichts zu den Bedingungen des Anbieters in Doku oder Code
  (`check` prüft es).

## Done Condition
- [ ] `--compare` und `--join` gleichen Anfragen und Zeilen nach Zeit sortiert in einem gleitenden Fenster ab, und kein Maximum oder
      Minimum entsteht mehr mit Spread über eine Liste. `bash ops/timeout-quote.sh --selftest-scale` pflanzt ohne Netz 200000
      Caddy-Zeilen und 200000 passende Zeilen, fährt `--compare-files` darüber und gibt `ok   compare scale: 200000 requests` und als
      letzte Zeile `TIMEOUT QUOTE SCALE OK` aus, in unter 10 Sekunden. Mit dem Abgleich von heute bricht derselbe Lauf mit `RangeError`
      ab oder überschreitet die 10 Sekunden; die Zeile im Progress Log nennt, womit.
      Prüfung: `timeout 10 bash ops/timeout-quote.sh --selftest-scale` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SCALE OK` ausgeben.
      Prüfung: `grep -cE "Math\.(max|min)\(\.\.\." ops/timeout-quote.sh` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-scale.test.ts` muss Exit-Code 0 haben; der Test fährt `--selftest-scale` und
      verlangt die Zeile `ok   compare scale: 200000 requests`.
      Prüfung: `pnpm -s vitest run test/timeout-quote-compare.test.ts test/timeout-quote-selftest.test.ts` muss Exit-Code 0 haben.
- [ ] `--compare` rechnet sich unabhängig gegen: Es gibt eine Zeile `check caddy: compare <Anfragen> <Timeouts>, join <Anfragen>
      <Timeouts>` und je Modell eine Zeile `check service <Modell>: compare <Anfragen> <Timeouts>, rows <Anfragen> <Timeouts>` aus, wobei
      `join` und `rows` aus den Modi `--join` und `--rows` über denselben Zeitraum stammen (beide beachten dafür `TQ_SINCE` und
      `TQ_UNTIL`). Weicht eine Zahl ab, endet der Lauf mit Exit 3, der Zeile `independent check failed: <welche>` auf stderr und ohne
      Ursachenzeile. Der Selftest zeigt beide Richtungen ohne Netz: gleich zählende Zeilen ergeben die `check`-Zeilen mit gleichen Zahlen
      und Exit 0, und ein Paar, dessen Anfrage vor `TQ_UNTIL` endet und dessen Zeile danach geschrieben wird, löst keinen Exit 3 aus;
      diese Selftest-Zeilen beginnen mit `ok   compare check` oder `FAIL compare check`. Ein Vitest-Test kopiert das Skript, verfälscht
      die Klassifikation in `compare` (etwa: eine bediente Wiederholung zählt auch in `service`) und verlangt Exit 3 mit
      `independent check failed`; unter derselben Verfälschung bleibt die alte Summenprobe stumm, die Zeile im Progress Log nennt es.
      Prüfung: `bash ops/timeout-quote.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/timeout-quote.sh --selftest | grep -c "^ok   compare check"` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "^\s*(it|test)\(.*independent" test/timeout-quote-compare.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-compare.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "independent check failed" ops/timeout-quote.sh` muss mindestens 1 ausgeben.
- [ ] `docs/abrechnung/timeouts.md` hat den Abschnitt `## Nach sieben Tagen`: der Befehl
      `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare`, der Zeitraum in UTC, je Modell
      die Zeilen `caddy` und `service`, die Abweichung, die `check`-Zeilen, je Ursache eine Zeile mit Zahl und eine Zeile `Widerlegt:`.
      In der ganzen Datei steht genau eine Zeile `Quote nach außen:`, entweder
      `Quote nach außen: <Quote> % (<Timeouts> von <Anfragen> Anfragen, 10.11.2026 20:27 bis 17.11.2026 23:59 UTC, Messung service) …`
      mit den Zahlen von vorher daneben oder `Quote nach außen: keine, weil <Grund>`. Die alte Zeile aus abrechnung 03 ist ersetzt,
      ihr Abschnitt verweist auf `## Nach sieben Tagen`. `goals/abrechnung/ANNAHMEN.md` hat den Abschnitt `## Goal 05` mit der Grenzregel
      der Gegenrechnung. Keine Adresse.
      Prüfung (Netz): `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare | grep -c "^check service openai/"` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^## Nach sieben Tagen" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/timeout-quote.sh --compare" docs/abrechnung/timeouts.md` muss mindestens 1 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/timeouts.md | grep -cE "^[|] *openai/[^|]+[|] *(caddy|service) *[|]"` muss mindestens 2 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/timeouts.md | grep -cE "^check (caddy|service)"` muss mindestens 2 ausgeben.
      Prüfung: `grep -c "^Quote nach außen: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Quote nach außen: ([0-9]+,[0-9] % \([0-9]+ von [0-9]+ Anfragen, 10\.11\.2026 20:27 bis 17\.11\.2026 23:59 UTC, Messung service\)|keine, weil )" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/timeouts.md | grep -c "^Widerlegt: "` muss 1 ausgeben.
      Prüfung: `grep -c "^## Goal 05" goals/abrechnung/ANNAHMEN.md` muss 1 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/timeouts.md` muss 0 ausgeben.
- [ ] Kritik: `ops/abort-purchase.sh` liest den Management-Key nur aus `~/.config/control-plane/openrouter-management.env` (0600),
      nie aus der Umgebung oder aus `loop.env`. Der Test fährt das Skript ohne Netz mit einem `HOME` aus `mktemp`: Ein gepflanzter Key nur
      in `loop.env` oder nur in der Umgebung ergibt Exit 2 mit `OPENROUTER_MANAGEMENT_KEY missing`; eine Key-Datei mit 0644 ergibt Exit 2;
      eine Key-Datei mit 0600 kommt an der Key-Stufe vorbei und endet ohne `CP_HOST` mit Exit 2 und `CP_HOST and CP_SSH_KEY are not set`.
      Kein Lauf gibt den gepflanzten Key aus. Mit dem Skript von heute ist der erste Fall rot, die Zeile im Progress Log nennt es.
      MVP: Funktion, weil ein Management-Key, den jede Rolle in ihre Umgebung lädt, Schlüssel und Limits des Kontos ändern kann, über
      das jede Antwort an zahlende Kunden läuft.
      Prüfung: `pnpm -s vitest run test/abort-purchase-key-file.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "openrouter-management.env" ops/abort-purchase.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '^OPENROUTER_MANAGEMENT_KEY=' ~/.config/control-plane/loop.env` muss 0 ausgeben.
      Prüfung: `stat -c %a ~/.config/control-plane/openrouter-management.env` muss `600` ausgeben.
      Prüfung: `bash ops/abort-purchase.sh --selftest` muss Exit-Code 0 haben.
- [ ] Kritik: Der Einkauf je Abbruch ohne Antwort ist über dieselben Tage gemessen wie `--compare`. `docs/abrechnung/einkauf-abbrueche.md`
      hat den Abschnitt `## Nach sieben Tagen` mit dem Befehl `AP_SINCE=2026-11-10 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh`,
      der Tabelle, den Zeilen `noise`, `baseline` und `purchase without sale` und genau einer Zeile
      `Einkauf je Abbruch ohne Antwort: <mc> mc (<n> Abbrüche, 10.11. bis 17.11.2026)` oder `Einkauf je Abbruch ohne Antwort: keine Zahl,
      weil <Grund>`. Dieselbe Zeile steht in `docs/abrechnung/timeouts.md`. Die Zahl „0 mc“ vom 10.11.2026 verweist auf den neuen
      Abschnitt. Keine Adresse.
      MVP: Funktion, weil Timeout-Quote und Anbieterwahl sonst mit einem Einkauf rechnen, der auf einem Tag ohne einen einzigen Abbruch
      ohne Antwort steht.
      Prüfung (Netz): `AP_SINCE=2026-11-10 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh | grep -c "^purchase without sale "` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "^## Nach sieben Tagen" docs/abrechnung/einkauf-abbrueche.md` muss 1 ausgeben.
      Prüfung: `grep -c "AP_SINCE=2026-11-10 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh" docs/abrechnung/einkauf-abbrueche.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^Einkauf je Abbruch ohne Antwort: ([0-9]+ mc \([0-9]+ Abbrüche, 10\.11\. bis 17\.11\.2026\)|keine Zahl, weil )" docs/abrechnung/einkauf-abbrueche.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Einkauf je Abbruch ohne Antwort: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
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
- jede schreibende Handlung in der Produktion; Datenbank nur mit `readonly: true`, Caddy-Log nur lesend
- `~/.config/control-plane/loop.env` und `~/.config/control-plane/openrouter-management.env` schreibt kein Agent; die zweite liest nur
  `ops/abort-purchase.sh`, kein Agent sourct oder liest sie
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
