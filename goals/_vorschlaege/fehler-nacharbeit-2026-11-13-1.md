Schwere: 1
Goal: fehler 01
Befund: Die neuen Tests kopieren ihr Gerüst statt es zu teilen: vier Watchdog-Tests bauen je dieselben Fakes und denselben Helfer `answer`, und der Adress-Scan (Regex, `git ls-files`, Binär-Ausnahme, Listen lesen) steht zweimal in `test/known-ips.test.ts` und ein drittes Mal in `test/visitor-addresses.test.ts`.
Beleg: `git grep -n -E '^const answer = |^function sandbox\(' origin/dev -- 'test/watchdog-*.test.ts' | wc -l` -> 8 | test/known-ips.test.ts:175
Empfehlung: Zwei gemeinsame Helfer unter `test/` wie `test/sandbox-world.ts`: einer für den Watchdog (Fakes für curl, docker, openssl, sleep, date, `answer`, `run` mit Webhook und Zustand), einer für den Adress-Scan (`IPV4`, `trackedFiles`, Textdateien ohne Nullbyte, `listedAddresses`); `test/known-ips.test.ts:169` bis `:179` nutzt dann `findingFiles` und `addressesIn` aus derselben Datei.
MVP: Schönheit

Linse Q, Frage 2 (Logik-Duplikate). Goals: fehler 01 (test/watchdog-credit.test.ts, test/watchdog-credit-kritik.test.ts), fehler 02 (test/visitor-addresses.test.ts), fehler 03 (test/watchdog-webhook-fail.test.ts, test/watchdog-webhook-fail-daily.test.ts), fehler 04 (test/known-ips.test.ts).
Die Kopien laufen schon auseinander: nur zwei der vier Watchdog-Tests ersetzen `sleep`, nur einer `date`; `listedAddresses` gibt in test/visitor-addresses.test.ts:21 bei fehlender Liste eine leere Menge zurück, in test/known-ips.test.ts:69 wirft es.
In test/known-ips.test.ts wiederholt die Schleife in Zeile 169 bis 179 das Lesen mit Binär-Ausnahme aus `findingFiles` (Zeile 115, dort zusätzlich mit zweitem Wurzelverzeichnis und ohne die Liste selbst) und baut in Zeile 175 `addressesIn` (Zeile 135) inline nach; Zeile 27 sagt selbst „The same candidate pattern as test/visitor-addresses.test.ts“.
