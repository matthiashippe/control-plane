# Abrechnung Goal 07: Neben der Timeout-Quote steht die Antwortquote

## Status
ACTIVE

## Active Objective
Wer bei uns liest, dass seine Anfragen ankommen, bekommt eine Zahl, die auch unsere Ausfälle zählt. Heute zählt `Quote nach außen:` in
`docs/abrechnung/timeouts.md` nur Timeouts unter Status 200 und 0; im selben Zeitraum antwortete der Dienst 1393 Mal mit 503 (Guthaben
beim Anbieter leer, 11.11. 02:01 bis 12.11.2026 08:22 UTC) gegen 1220 gezählte Anfragen, und „0,0 % Timeouts“ sagt nicht, dass Anfragen
bei uns ankommen. Danach rechnet `ops/answer-quote.sh` auf Grundlage von `ops/access-log.sh` den Anteil von `POST /v1/chat/completions`
mit Status 200 an allen Antworten außer 4xx über denselben Zeitraum wie die Quote, `docs/abrechnung/timeouts.md` trägt direkt unter
`Quote nach außen:` genau eine Zeile `Antwortquote nach außen:` und hält die Regel fest, dass kanal eine Quote nach außen nur mit beiden
Zeilen nennt oder über einen Zeitraum ohne Ausfall (`ROADMAP.md`, abrechnung 07; übernimmt `goals/_vorschlaege/abrechnung-kritik-2026-11-18-1.md`).
Widerlegt, wenn `grep -c 'Antwortquote nach außen:' docs/abrechnung/timeouts.md` am Kopf von `dev` schon 1 zählt.
MVP: Funktion, weil eine Quote nach außen ohne die 503 des Ausfalls einem Kunden 0,0 % zeigt, während mehr als die Hälfte seiner
Anfragen im Zeitraum abgewiesen wurde.

## Voraussetzungen
- abrechnung Goal 05 DONE

## Kontext für den Maker
- Ziel: Wer bei uns liest, dass seine Anfragen ankommen, bekommt eine Zahl, die auch unsere Ausfälle zählt.
- Warum nicht abrechnung 06 als Voraussetzung (Tech Lead, 21.11.2026): `ROADMAP.md` nennt 06 vor 07, aber 07 baut nicht darauf auf.
  06 steht auf `PAUSED` (Loop-Kritik 2026-11-19) und ändert `ops/timeout-quote.sh` und `ops/abort-purchase.sh`; 07 fasst keins von
  beiden an, liest das Caddy-Log mit einem eigenen Werkzeug und weist ein Datum ohne Uhrzeit von Anfang an selbst ab. Läuft 06 später,
  bleibt jede Zeile, die 06 in `timeouts.md` prüft, gültig (Liste unten).
- Neues Werkzeug `ops/answer-quote.sh` (Englisch in Code, Kommentaren und Ausgabe), Muster `ops/timeout-quote.sh` (Bash mit Node für das
  Zählen, `set -uo pipefail`):
  - `ops/answer-quote.sh` ohne Argument liest Produktion nur über `bash ops/access-log.sh` (stdout, älteste Zeile zuerst);
    `ops/answer-quote.sh --files CADDY` liest dieselben JSON-Zeilen aus einer Datei (`-` für stdin); `--selftest` pflanzt Zeilen ohne
    Netz (`curl` und `ssh` als Funktionen, die mit 99 abbrechen, wie in `ops/timeout-quote.sh`).
  - Gezählt wird jede Zeile mit `request.method` gleich `POST` und `request.uri` auf `/v1/chat/completions` (dieselbe Regel
    `/^\/v1\/chat\/completions(\?|$)/` wie `callsOf`), deren Ende (`ts` plus `duration`) im Zeitraum liegt, beide Ränder eingeschlossen.
    Nenner sind alle diese Zeilen außer Status 400 bis 499, Zähler die mit Status 200. Status 0 (der Client brach ab) und jeder 5xx
    zählen im Nenner und nicht im Zähler. 4xx fällt heraus, weil es eine Antwort an den Client über seine eigene Anfrage ist (etwa 402
    ohne Guthaben, 401 ohne Anmeldung) und keine verlorene Antwort des Dienstes; ohne diese Regel zählte jede Anfrage ohne Guthaben gegen
    uns.
  - Zeitraum aus `TQ_SINCE` und `TQ_UNTIL`, dieselben Variablen wie die Quote, damit beide Zeilen mit einem Satz Variablen gemessen
    werden. Ein leerer Wert heißt „kein Rand“. Ein Datum ohne Uhrzeit oder eine Uhrzeit ohne Zone (`Z` oder Offset) endet mit Exit 2 und
    einer Meldung auf stderr, die die Variable und die volle Form nennt (`… use the full form, e.g. 2026-11-17T23:59:59Z`), weil
    `Date.parse("2026-11-17")` den 17.11. um 00:00 UTC liefert und den letzten Tag still abschnitte (abrechnung-kritik-2026-11-18-3).
  - Blind ist nicht leer: Liegt die erste lesbare Zeile des Logs nach `TQ_SINCE` oder hat das Log keine lesbare Zeile, endet der Lauf
    mit Exit 2 und `access log starts after TQ_SINCE` beziehungsweise `access log has no line`, bevor eine Zahl erscheint, denn ein
    gedrehtes Log, das den Anfang des Zeitraums verloren hat, ergäbe eine falsche Quote (Kopf von `ops/access-log.sh`).
  - Ausgabe, nur Zahlen, nie eine Adresse oder Wallet: eine Zeile `period <since> to <until>` (ISO, `start`/`end` bei leerem Rand),
    je Status eine Zeile `status <code>: <n>` (aufsteigend, 0 zuerst), dann genau eine Zeile
    `answers: <Status 200> of <Nenner> (<Quote mit einer Nachkommastelle> %), excluded 4xx <n>`. Bei Nenner 0 steht statt der Quote `-`.
  - Selftest-Zeilen beginnen mit `ok   answers ` oder `FAIL answers `, letzte Zeile `ANSWER QUOTE SELFTEST OK` oder
    `ANSWER QUOTE SELFTEST FAIL` (Exit 1). Pflichtfälle: 503 zählt im Nenner und nicht im Zähler (`ok   answers 503 counts against`),
    4xx fällt heraus (`ok   answers 4xx excluded`), Status 0 zählt im Nenner (`ok   answers abort counts against`), eine Zeile, deren
    Ende 1 s nach `TQ_UNTIL` liegt, zählt nicht und eine mit Ende genau auf `TQ_UNTIL` zählt (`ok   answers period edge`), ein
    Datum ohne Uhrzeit mit Exit 2 (`ok   answers period date without time`), ein Log, das nach `TQ_SINCE` beginnt, mit Exit 2
    (`ok   answers log starts late`), ein anderer Pfad (`GET /v1/chat/completions`, `POST /v1/models`) zählt nicht
    (`ok   answers other route ignored`). Die gepflanzten Zeilen tragen eine Adresse unter `request.remote_ip`, damit der Selftest zeigt,
    dass keine in der Ausgabe steht.
- Test `test/answer-quote.test.ts` nach dem Muster `test/timeout-quote-selftest.test.ts`: ein Fall fährt `--selftest` und verlangt die
  letzte Zeile; ein Fall kopiert das Skript nach `mktemp`, verfälscht die Statusregel so, dass 503 herausfällt (wie 4xx), und verlangt
  `FAIL answers 503 counts against` mit Exit 1; ein Fall verfälscht sie so, dass 4xx mitzählt, und verlangt `FAIL answers 4xx excluded`
  mit Exit 1. Damit ist jeder Pflichtfall gegen genau den Fehler gesichert, den die Kritik vom 18.11. fand.
- Messung, nur lesend, vom code-host aus: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh`, derselbe
  Zeitraum wie `Quote nach außen:`. Im Abschnitt `## Nach sieben Tagen` von `docs/abrechnung/timeouts.md` stehen danach der Befehl, das
  Datum der Messung und die Ausgabe als Codeblock. Weicht die Zahl der 503 von den 1393 im Absatz „Ausfall im Zeitraum“ ab, nennst du
  im selben Abschnitt den Grund (die 1393 zählten ab `TQ_SINCE` ohne oberen Rand und nach dem Beginn statt nach dem Ende). Endet der
  Lauf mit Exit 2, weil das Log den Anfang des Zeitraums nicht mehr enthält, ist die Zeile `Antwortquote nach außen: keine, weil <Grund>`.
- Die Zeile, direkt unter `Quote nach außen:` und ohne Leerzeile dazwischen:
  `Antwortquote nach außen: <x,y> % (<200> von <Nenner> Anfragen, 10.11.2026 20:27 bis 17.11.2026 23:59 UTC, ohne 4xx), davon <n> mit 503 während des Ausfalls 11.11. 02:01 bis 12.11.2026 08:22 UTC.`
  Prozent mit Komma und einer Nachkommastelle wie die Quote. Danach eine Zeile
  `Regel nach außen: <Satz>`: kanal nennt `Quote nach außen` nur zusammen mit `Antwortquote nach außen` oder über einen Zeitraum ohne
  Ausfall, und ein Ausfall ist jede Stunde mit einem 5xx auf `POST /v1/chat/completions`. Deutsch, klare Wörter, kein Gedankenstrich.
- Doku, die frühere Goals im Audit prüfen und die gleich bleiben muss: `docs/abrechnung/timeouts.md` behält genau zwei Zeilen
  `^(Widerlegt|Quote nach außen): ` und genau drei Zeilen `^- (coalesced|clock|unmatched): ` (abrechnung 03), die Zeile
  `Quote nach außen:` unverändert im Muster von abrechnung 05 (`… Messung service)`), genau eine Zeile `^Einkauf je Abbruch ohne Antwort: `
  und genau eine `^Anbieterwahl: ` mit `17.11.2026` und `Nach sieben Tagen` (abrechnung 05), dazu die Tabellen mit `caddy` und `service`
  und die Zeilen `check caddy` und `check service` in `## Nach sieben Tagen`. Keine Adresse (Prüfung unten).
- Produktion nur lesend: Caddy-Log nur über `ops/access-log.sh`, sonst nichts. Variablen aus `~/.config/control-plane/loop.env`, Werte
  nie ausgeben. Ausgegeben wird nie eine Adresse, eine Wallet oder ein Guthaben.
- Der Dienst ändert sich nicht: kein `src/**`, also kein Rollout; der Merge bekommt wegen `ops/**` die übliche Live-Prüfung.
  `ops/timeout-quote.sh` und `ops/abort-purchase.sh` bleiben unverändert, damit abrechnung 06 ohne Konflikt weiterlaufen kann.
  Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Gedankenstrich und nichts
  zu den Bedingungen des Anbieters in Doku oder Code (`check` prüft es).

## Done Condition
- [x] `ops/answer-quote.sh` zählt den Anteil von `POST /v1/chat/completions` mit Status 200 an allen Antworten außer 4xx, nach dem Ende
      der Anfrage im Zeitraum aus `TQ_SINCE` und `TQ_UNTIL`, und gibt `status <code>: <n>` je Status und genau eine Zeile `answers: …`
      aus. Der Selftest läuft ohne Netz und hat die Pflichtfälle aus dem Kontext, darunter je einen für 503 und für 4xx; keine Adresse in
      der Ausgabe.
      Prüfung: `bash ops/answer-quote.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `ANSWER QUOTE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers 503 counts against"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers 4xx excluded"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers abort counts against"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers period edge"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers other route ignored"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^FAIL"` muss 0 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -cE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -c "ops/access-log.sh" ops/answer-quote.sh` muss mindestens 1 ausgeben.
- [x] Das Werkzeug ist nie blind still: Ein Datum ohne Uhrzeit, eine Uhrzeit ohne Zone, ein leeres Log und ein Log, das nach `TQ_SINCE`
      beginnt, enden mit Exit 2, bevor eine Zahl erscheint; ein leerer Rand bleibt erlaubt.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17 bash ops/answer-quote.sh --files /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17 bash ops/answer-quote.sh --files /dev/null 2>&1 | grep -c "full form"` muss mindestens 1 ausgeben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59 bash ops/answer-quote.sh --files /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh --files /dev/null` muss Exit-Code 2 haben.
      Prüfung: `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh --files /dev/null 2>&1 | grep -c "^answers: "` muss 0 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers period date without time"` muss 1 ausgeben.
      Prüfung: `bash ops/answer-quote.sh --selftest | grep -c "^ok   answers log starts late"` muss 1 ausgeben.
- [x] `test/answer-quote.test.ts` fährt den Selftest und zwei verfälschte Kopien des Skripts: Eine, in der 503 herausfällt, endet mit
      `FAIL answers 503 counts against` und Exit 1, eine, in der 4xx mitzählt, mit `FAIL answers 4xx excluded` und Exit 1.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/answer-quote.test.ts` muss mindestens 3 ausgeben.
      Prüfung: `grep -c "FAIL answers 503 counts against" test/answer-quote.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "FAIL answers 4xx excluded" test/answer-quote.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/answer-quote.test.ts` muss Exit-Code 0 haben.
- [x] Die Antwortquote über die sieben Tage steht neben der Quote: `## Nach sieben Tagen` in `docs/abrechnung/timeouts.md` hat den Befehl
      `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh`, das Datum der Messung und deren Ausgabe mit
      genau einer Zeile `answers: `; direkt unter `Quote nach außen:` steht genau eine Zeile `Antwortquote nach außen:` mit Zahl, Zeitraum
      und Anfragen oder `keine, weil `, danach genau eine Zeile `Regel nach außen:`, die beide Zeilen und den Zeitraum ohne Ausfall nennt.
      Die Zeilen früherer Goals bleiben. Keine Adresse.
      Prüfung (Netz): `TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh | grep -c "^answers: "` muss 1 ausgeben.
      Prüfung: `grep -c "TQ_SINCE=2026-11-10T20:27:18Z TQ_UNTIL=2026-11-17T23:59:59Z bash ops/answer-quote.sh" docs/abrechnung/timeouts.md` muss mindestens 1 ausgeben.
      Prüfung: `sed -n '/^## Nach sieben Tagen/,/^## /p' docs/abrechnung/timeouts.md | grep -c "^answers: "` muss 1 ausgeben.
      Prüfung: `grep -c "^Antwortquote nach außen: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Antwortquote nach außen: ([0-9]+,[0-9] % \([0-9]+ von [0-9]+ Anfragen, 10\.11\.2026 20:27 bis 17\.11\.2026 23:59 UTC, ohne 4xx\)|keine, weil )" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -A1 "^Quote nach außen: " docs/abrechnung/timeouts.md | grep -c "^Antwortquote nach außen: "` muss 1 ausgeben.
      Prüfung: `grep -c "^Regel nach außen: " docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep "^Regel nach außen: " docs/abrechnung/timeouts.md | grep -c "Antwortquote nach außen.*ohne Ausfall\|ohne Ausfall.*Antwortquote nach außen"` muss 1 ausgeben.
      Prüfung: `grep -cE "^(Widerlegt|Quote nach außen): " docs/abrechnung/timeouts.md` muss 2 ausgeben.
      Prüfung: `grep -cE "^Quote nach außen: ([0-9]+,[0-9] % \([0-9]+ von [0-9]+ Anfragen, 10\.11\.2026 20:27 bis 17\.11\.2026 23:59 UTC, Messung service\)|keine, weil )" docs/abrechnung/timeouts.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^- (coalesced|clock|unmatched): [0-9]+" docs/abrechnung/timeouts.md` muss 3 ausgeben.
      Prüfung: `grep -cE "0x[0-9a-fA-F]{40}|\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" docs/abrechnung/timeouts.md` muss 0 ausgeben.
- [x] Der Laufzeitpfad und die Werkzeuge von abrechnung 06 bleiben unverändert, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- ops/timeout-quote.sh ops/abort-purchase.sh | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die beiden verfälschten Kopien in `test/answer-quote.test.ts` waren mit dem fertigen Skript rot und sind es nach jeder Änderung an
      der Statusregel; die Zeile im Progress Log nennt die Verfälschungen und ihre Exit-Codes.
- [ ] Der Job `e2e` am Kopf des PR ist grün (`gh pr checks`).
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `harness/runtime/**`, `.env*`
- `ops/timeout-quote.sh`, `ops/abort-purchase.sh` und `ops/access-log.sh` (abrechnung 06 baut daran; das neue Werkzeug ruft
  `ops/access-log.sh` nur auf)
- jede schreibende Handlung in der Produktion; Caddy-Log nur lesend über `ops/access-log.sh`
- `~/.config/control-plane/loop.env` schreibt kein Agent
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-21 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `ops/answer-quote.sh` mit Selftest (11 Fälle), `test/answer-quote.test.ts`, Messung über die sieben Tage (1197 von 2613, 45,8 %, 1393 mit 503 alle im Ausfall) und die Zeilen `Antwortquote nach außen:` und `Regel nach außen:` in `docs/abrechnung/timeouts.md`; Ende der Anfrage ist `ts` (ANNAHMEN.md). Rot gesehen: der Test mit einem Selftest, dessen 503-Fall nur 200 pflanzt (Fall 2 rot); die Kopie mit `status <= 599` endet mit `FAIL answers 503 counts against` und Exit 1, die mit `false` mit `FAIL answers 4xx excluded` und Exit 1; Gegenprobe auf der Produktionskopie mit vier gepflanzten Zeilen (+1 je 200, 402, 503) und mit gekürztem Log (Exit 2), `jq` zählt je Status gleich. Prüfbefehle: Punkt 1 alle 9 wie erwartet (Exit 0, letzte Zeile OK, je 1, FAIL 0, Adressen 0, access-log 2); Punkt 2 alle 7 (Exit 2, 2, 2, full form 1, answers 0, je 1); Punkt 3 (3, 1, 1, vitest Exit 0); Punkt 4 alle 12 (Netz 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 3, 0); Punkt 5 (0, 0, `check` Exit 0, 2507 Tests grün).
- 2026-11-21 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` ohne neue Commits seit dem Start, nichts zu mergen. Prüfbefehle: Punkt 1 alle 9 (Exit 0 mit `ANSWER QUOTE SELFTEST OK`, je 1, FAIL 0, Adressen 0, access-log 2); Punkt 2 alle 7 (Exit 2, full form 1, Exit 2, Exit 2, answers 0, je 1); Punkt 3 (3, 1, 1, vitest Exit 0 mit 3 Tests); Punkt 4 alle 12 (Netz 1, 1, 1, 1, 1, 1, 1, 1, 2, 1, 3, 0); Punkt 5 (0, 0, `check` Exit 0 mit 2507 Tests).

## Blockers
