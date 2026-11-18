# Abrechnung Goal 05: Quote nach außen nach sieben Tagen

## Status
ACTIVE

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
- [x] `--compare` und `--join` gleichen Anfragen und Zeilen nach Zeit sortiert in einem gleitenden Fenster ab, und kein Maximum oder
      Minimum entsteht mehr mit Spread über eine Liste. `bash ops/timeout-quote.sh --selftest-scale` pflanzt ohne Netz 200000
      Caddy-Zeilen und 200000 passende Zeilen, fährt `--compare-files` darüber und gibt `ok   compare scale: 200000 requests` und als
      letzte Zeile `TIMEOUT QUOTE SCALE OK` aus, in unter 10 Sekunden. Mit dem Abgleich von heute bricht derselbe Lauf mit `RangeError`
      ab oder überschreitet die 10 Sekunden; die Zeile im Progress Log nennt, womit.
      Prüfung: `timeout 10 bash ops/timeout-quote.sh --selftest-scale` muss Exit-Code 0 haben und als letzte Zeile `TIMEOUT QUOTE SCALE OK` ausgeben.
      Prüfung: `grep -cE "Math\.(max|min)\(\.\.\." ops/timeout-quote.sh` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/timeout-quote-scale.test.ts` muss Exit-Code 0 haben; der Test fährt `--selftest-scale` und
      verlangt die Zeile `ok   compare scale: 200000 requests`.
      Prüfung: `pnpm -s vitest run test/timeout-quote-compare.test.ts test/timeout-quote-selftest.test.ts` muss Exit-Code 0 haben.
- [x] `--compare` rechnet sich unabhängig gegen: Es gibt eine Zeile `check caddy: compare <Anfragen> <Timeouts>, join <Anfragen>
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
- [x] `docs/abrechnung/timeouts.md` hat den Abschnitt `## Nach sieben Tagen`: der Befehl
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
- [x] Kritik: `ops/abort-purchase.sh` liest den Management-Key nur aus `~/.config/control-plane/openrouter-management.env` (0600),
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
- [x] Kritik: Der Einkauf je Abbruch ohne Antwort ist über dieselben Tage gemessen wie `--compare`. `docs/abrechnung/einkauf-abbrueche.md`
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
- [x] Der Laufzeitpfad bleibt unverändert, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Kritik: Die Zeile `Anbieterwahl:` in `docs/abrechnung/timeouts.md` begründet das Routing mit der Messung über sieben Tage statt
      mit dem 10.11.2026. Heute steht dort „weil der Einkauf ohne Verkauf im Zeitraum bei beiden Modellen 0 mc ist“, während
      `## Nach sieben Tagen` in `docs/abrechnung/einkauf-abbrueche.md` ohne den 10.11. 8558 mc für 20 Abbrüche bei openai/gpt-5.2
      nennt. Danach steht in `timeouts.md` genau eine Zeile `Anbieterwahl:`; sie nennt den Zeitraum bis 17.11.2026, verweist auf
      `## Nach sieben Tagen`, nennt Quote nach außen und Einkauf je Abbruch (Zahl oder Grund) und entscheidet daraus, ob das Routing
      bleibt. Die Begründung „bei beiden Modellen 0 mc“ steht nirgends mehr in der Datei.
      MVP: Funktion, weil die Anbieterwahl sonst auf einer Zahl steht, die die eigene Messung desselben Goals widerlegt
      (`ROADMAP.md`, abrechnung 04: die Anbieterwahl rechnet mit dieser Kostenzahl).
      Prüfung: `grep -c "^Anbieterwahl: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -c "bei beiden Modellen 0 mc" docs/abrechnung/timeouts.md` muss 0 ausgeben.
      Prüfung: `grep "^Anbieterwahl: " docs/abrechnung/timeouts.md | grep -c "17\.11\.2026"` muss 1 ausgeben.
      Prüfung: `grep "^Anbieterwahl: " docs/abrechnung/timeouts.md | grep -c "Nach sieben Tagen"` muss 1 ausgeben.
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
- 2026-11-18 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: `ops/timeout-quote.sh` gleicht in `--compare` und `--join` Anfragen und Zeilen nach Zeit sortiert im Fenster ab (Binärsuche, Gleichstand an die frühere Zeile), Ende des Zeitraums mit `reduce`, `--selftest-scale` mit 200000 Anfragen; `--compare` rechnet `caddy` gegen den Join und `service` je Modell gegen `--rows` über denselben Zeitraum (`--join`, `--rows`, `--since-rollout` lesen jetzt `TQ_SINCE` und `TQ_UNTIL`), Exit 3 mit `independent check failed: <welche>` vor jeder Ursachenzeile; Grenzregel in `ANNAHMEN.md` Goal 05; gemessen 18.11.2026 00:17 UTC: 1220 Anfragen, 0 Timeouts in beiden Messungen, Gegenrechnung gleich, `Quote nach außen: 0,0 % (0 von 1220 …)` neben vorher 3 von 224; Einkauf je Abbruch über 10. bis 17.11.: keine Zahl wegen `noise` am 10.11. bei `openai/gpt-5.2`, daneben 8558 mc für 20 Abbrüche ohne den 10.11.; Punkt 4 lag seit der Reparatur vom 13.11.2026 gebaut vor. Rot vorher: Scale mit dem Abgleich von `origin/dev` auf denselben 200000 Zeilen `timeout 10` Exit 124, ohne Zeitlimit nach 3 min 52 s `RangeError: Maximum call stack size exceeded`; `test/timeout-quote-scale.test.ts` und die drei neuen Fälle `independent` in `test/timeout-quote-compare.test.ts` mit dem Skript von `origin/dev` 4 failed von 12; Selftest `compare check boundary` mit einem Join nach dem Ende der Anfrage `FAIL` (`check caddy: compare 1 0, join 2 0`, Exit 3); dieselbe Verfälschung (bediente Wiederholung als Paar) im Skript von `origin/dev` Exit 0 mit `cause`-Zeilen, die Summenprobe bleibt stumm (service 2 statt 1); `test/abort-purchase-key-file.test.ts` mit dem Skript von 57acba8 4 failed von 6, erster Fall „Key nur in `loop.env`“ rot. Prüfbefehle: P1 `timeout 10 … --selftest-scale` Exit 0, letzte Zeile `TIMEOUT QUOTE SCALE OK`; `Math.(max|min)(...` -> 0; vitest scale Exit 0; vitest compare und selftest Exit 0. P2 `--selftest` Exit 0, letzte Zeile `TIMEOUT QUOTE SELFTEST OK`; `^ok   compare check` -> 6; `independent` im Test -> 3; vitest compare Exit 0; `independent check failed` -> 2. P3 (Netz) `^check service openai/` -> 2; `## Nach sieben Tagen` -> 1; Befehl -> 1; Tabellenzeilen -> 4; `check`-Zeilen -> 3; `Quote nach außen:` -> 1 und 1; `Widerlegt:` -> 1; `## Goal 05` -> 1; Adressen -> 0. P4 vitest Exit 0; `openrouter-management.env` -> 2; `loop.env` -> 0; `stat` -> 600; `--selftest` Exit 0. P5 (Netz) `^purchase without sale ` -> 2; `## Nach sieben Tagen` -> 1; Befehl -> 1; Zeile -> 1; in `timeouts.md` -> 1; Adressen -> 0. P6 `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` -> 0; `node scripts/check.mjs` Exit 0 (2353 passed, grün in 87 s).
- 2026-11-18 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; `dev` hatte seit dem Start keinen neuen Commit, nichts zu mergen, jeder Prüfbefehl neu gefahren, die Messung über dieselben sieben Tage wiederholt sich mit denselben Zahlen. Prüfbefehle: P1 `timeout 10 … --selftest-scale` Exit 0, letzte Zeile `TIMEOUT QUOTE SCALE OK`; `Math.(max|min)(...` -> 0; vitest scale, compare, selftest Exit 0. P2 `--selftest` Exit 0, letzte Zeile `TIMEOUT QUOTE SELFTEST OK`; `^ok   compare check` -> 6; `independent` im Test -> 3; vitest compare Exit 0; `independent check failed` -> 2. P3 (Netz) `--compare` Exit 0, `^check service openai/` -> 2 (`check caddy: compare 1220 0, join 1220 0`, gpt-5-mini 995 0 gegen rows 995 0, gpt-5.2 225 0 gegen rows 225 0); `## Nach sieben Tagen` -> 1; Befehl -> 1; Tabellenzeilen -> 4; `check`-Zeilen -> 3; `Quote nach außen:` -> 1 und 1; `Widerlegt:` -> 1; `## Goal 05` -> 1; Adressen -> 0. P4 vitest Exit 0; `openrouter-management.env` -> 2; `loop.env` -> 0; `stat` -> 600; `--selftest` Exit 0. P5 (Netz) Exit 0, `^purchase without sale ` -> 2; `## Nach sieben Tagen` -> 1; Befehl -> 1; Zeile -> 1; in `timeouts.md` -> 1; Adressen -> 0. P6 `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` -> 0; `node scripts/check.mjs` Exit 0 (2353 passed, grün in 216 s). Job `e2e` am Kopf 6bd5fb0 grün (`gh pr checks 266`: e2e pass 10m33s, check pass).
- 2026-11-18 Zyklus 3: Punkt 7 gebaut: Die Zeile `Anbieterwahl:` in `docs/abrechnung/timeouts.md` steht auf der Messung bis 17.11.2026 und verweist auf `## Nach sieben Tagen`. Sie nennt die Quote nach außen 0,0 % (0 von 1220) und beim Einkauf je Abbruch „keine Zahl“ wegen `noise`. Ohne den 10.11. sind es bei gpt-5.2 8558 mc für 20 Abbrüche, also 1,8 % von 488347 mc Einkauf, und 7783 mc davon an einem einzigen Abbruch. Daraus folgt: Das Routing bleibt. Neu gemessen mit `AP_SINCE=2026-11-11 AP_NOW=2026-11-18T00:00:00Z bash ops/abort-purchase.sh`, Ergebnis `purchase without sale openai/gpt-5.2: 8558`, Spalte Einkauf mc für gpt-5.2 summiert 488347. Vor dem Fix lieferten dieselben greps auf der Datei von 4f49738 `bei beiden Modellen 0 mc` -> 1, `17.11.2026` in der Zeile -> 0, `Nach sieben Tagen` in der Zeile -> 0. Prüfbefehle: P7 `^Anbieterwahl: ` -> 1; `bei beiden Modellen 0 mc` -> 0; `17\.11\.2026` -> 1; `Nach sieben Tagen` -> 1. P3 `^Quote nach außen: ` -> 1, Adressen -> 0. P6 Diff gegen `src` und `deploy` -> 0; `node scripts/check.mjs` Exit 0 (grün in 109 s).

## Blockers
