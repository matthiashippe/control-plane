# Messung Goal 08: Der Nenner der Anzeigen-Konversion ist nie still 0

## Status
DONE

## Active Objective
`ops/anzeigen-rechnung.py` rechnet aus, ob eine bezahlte Anzeige sich trägt, und ihr Nenner sind die fremden Adressen an der
Bezahlroute aus `./ops/access-log.sh`. `adressen_an_der_bezahlroute` liest heute nur `stdout` des Logs (Zeile 75) und prüft den
Exit-Code nicht; startet das Log nicht oder läuft es in die Zeitgrenze, gibt sie still 0 zurück (Zeile 77). Endet
`access-log.sh` mit Fehler, nachdem es einen Teil des Logs gedruckt hat (etwa eine rotierte Datei, dann bricht ssh ab), zählt
das Programm diesen Teil als ganzes Log: Mit zwei fremden Adressen und einem Zahler steht heute Exit 0 und „TRAEGT am oberen
Ende des Bands.“ da, eine Konversion von 50 Prozent auf einem halben Log. Endet es mit Fehler ohne Ausgabe, steht
„Adressen, die das Angebot ansahen 0“ wie eine Messung da.
Nach diesem Goal endet das Programm mit Exit 2, leerem `stdout` und genau einer Zeile auf `stderr`, wenn `./ops/access-log.sh`
nicht startet, mit einem Exit ungleich 0 endet oder in die Zeitgrenze läuft, und zählt dann nichts. Auf einem Log, das mit 0
endet, bleibt jede Ausgabe Zeichen für Zeichen gleich.
Widerlegt, wenn `ops/anzeigen-rechnung.py` am Kopf von `dev` bei einem `access-log.sh`, das zwei fremde Adressen druckt und mit
1 endet, schon nicht mit Exit 0 endet (der Maker prüft das zuerst mit dem vierten Prüfbefehl von Punkt 1 an der Merge-Basis,
heute `exit 0 stdout 653 stderr 0`, und schreibt das Ergebnis in die erste Zeile des Progress Log).
MVP: Funktion, weil die Anzeigen-Rechnung die Entscheidung über bezahlte Kanäle trägt (`ZIELE.md`, Break-even 11,13 EUR) und ein
halbes Log sie heute still auf „trägt“ kippen kann.

## Voraussetzungen
- messung Goal 07 DONE

## Kontext für den Maker
- Ziel: Wer die Anzeigen-Rechnung liest, bekommt entweder eine Zahl aus dem ganzen Log oder ein klares „nicht messbar“, nie eine
  Konversion auf einem Log, das nicht ganz gelesen wurde.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 08; übernimmt `goals/_vorschlaege/messung-kritik-2026-11-14-8.md`.
- **`ops/anzeigen-rechnung.py`.** Eine neue Ausnahme `AccessLogUnreadable` neben `OwnListMissing`. `adressen_an_der_bezahlroute`
  wirft sie statt `return 0`:
  - `./ops/access-log.sh` startet nicht (`OSError`, etwa Datei fehlt oder ist nicht ausführbar): Grund
    `./ops/access-log.sh did not start`;
  - es läuft in die Zeitgrenze (`subprocess.TimeoutExpired`): Grund `./ops/access-log.sh ran past <n> s`;
  - es endet mit einem Exit ungleich 0: Grund `./ops/access-log.sh ended with exit <code>`; dann zählt auch kein Teil, den es vor
    dem Fehler gedruckt hat.
  `main` fängt sie wie `OwnListMissing` mit derselben Form `anzeigen-rechnung: <Grund>, so nothing is counted.` auf `stderr` und
  gibt 2 zurück, bevor die erste Zeile auf `stdout` steht. Die `stderr` von `access-log.sh` wird weiter verworfen und nie
  weitergegeben, weil sie Host und Adresse des Servers nennen kann. Die Reihenfolge bleibt: zuerst `own_addresses()`, dann das Log;
  fehlt die eigene Liste, gilt deren Meldung.
- **Zeitgrenze.** Standard bleibt 180 s. `CP_ACCESS_LOG_TIMEOUT` (Sekunden, positive Zahl) überschreibt sie, damit ein Test den
  Fall ohne drei Minuten Warten zeigt. Ein Wert, der keine positive Zahl ist, endet mit Exit 2, einer `stderr`-Zeile, die
  `CP_ACCESS_LOG_TIMEOUT` nennt, und ohne `access-log.sh` zu starten. Ein Log mit Exit 0 und leerer Ausgabe bleibt, wie es ist
  (0 Betrachter, „Noch-nicht-messbar“, Exit 2), weil `access-log.sh` einen leeren Strom selbst als unlesbar mit Exit 2 meldet.
- Der Docstring oben nennt bei Exit 2, dass auch ein Log, das nicht ganz gelesen wurde, „could not look“ ist, und
  `CP_ACCESS_LOG_TIMEOUT`.
- **Test `test/anzeigen-rechnung-access-log.test.ts`**, neu, ohne Netz, nach dem Muster von
  `test/anzeigen-rechnung-own-ips.test.ts` (Kopie von `ops/anzeigen-rechnung.py` und `ops/own-ips.sh` in `mkdtemp`, nachgebautes
  `ops/access-log.sh`, nachgebautes `ssh` vorn im `PATH`, das mit 255 endet, `HOME`, `CP_OWN_IPS_FILE` und `CP_OWN_IPS_SEEN` im
  Temp-Ordner, Adressen nur aus den Dokumentationsbereichen, in `run()` die Prüfung, dass keine Zeile von `stdout` oder `stderr`
  eine dieser Adressen nennt):
  - `it("stops with exit 2 when ops/access-log.sh prints part of the log and ends with exit 1")`: das Log druckt zwei fremde
    Adressen an `/pay/` und endet mit 1; Exit 2, `stdout` leer, genau eine Zeile auf `stderr`, die mit `anzeigen-rechnung: `
    beginnt und `exit 1` nennt;
  - `it("stops with exit 2 when ops/access-log.sh prints nothing and ends with exit 1")`: Exit 2, `stdout` leer, dieselbe Zeile;
  - `it("stops with exit 2 when ops/access-log.sh does not start")`: das nachgebaute Log fehlt; Exit 2, `stdout` leer, eine Zeile
    mit `did not start`;
  - `it("stops with exit 2 when ops/access-log.sh runs past CP_ACCESS_LOG_TIMEOUT")`: `CP_ACCESS_LOG_TIMEOUT=1`, das Log ist
    `exec sleep 5` (mit `exec`, damit kein Enkelprozess die Pipe offen hält); Exit 2, `stdout` leer, eine Zeile mit `ran past`,
    der Lauf dauert unter 4 s;
  - `it("stops with exit 2 when CP_ACCESS_LOG_TIMEOUT is not a positive number and never starts ops/access-log.sh")`:
    `CP_ACCESS_LOG_TIMEOUT=abc`, das Log legt beim Start eine Markierung an; Exit 2, `stderr` nennt `CP_ACCESS_LOG_TIMEOUT`, die
    Markierung fehlt;
  - `it("never forwards the stderr of ops/access-log.sh")`: das Log schreibt `ssh: connect to host 203.0.113.7 port 22` auf
    `stderr` und endet mit 255; Exit 2, `exit 255` in der Zeile, `203.0.113.7` weder in `stdout` noch in `stderr`;
  - `it("counts a log that ends with exit 0 as before")`: dasselbe Log wie im ersten Fall, aber Exit 0; Exit 0, eine Zeile
    `Adressen, die das Angebot ansahen   2` und `TRAEGT am oberen Ende des Bands.`.
  Rot vor dem Fix sind die Fälle 1 bis 6 (heute Exit 0 mit „TRAEGT“ oder Exit 2 mit der Zeile „Adressen, die das Angebot ansahen
  0“ auf `stdout`); die Zeile im Progress Log nennt das mit Zahl.
- `test/anzeigen-rechnung-own-ips.test.ts` bleibt Zeichen für Zeichen und grün, ebenso `test/own-ips-readers.test.ts`, dessen
  Ausnahme für `ops/anzeigen-rechnung.py` an den Pfad gebunden ist, nicht an die Zeile. `python3 ops/anzeigen-rechnung.py
  --selftest` und die Zeile in `ops/check-all.sh` bleiben unverändert.
- Kein Rollout. `ops/anzeigen-rechnung.py` läuft nur am code-host aus dem Checkout. Kein Test und kein Prüfbefehl ruft die VM,
  ssh oder das echte `ops/access-log.sh` auf.
- Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich. Node 22 vorn im
  `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add`
  stagen. Kein `pkill -f`. Eine Entscheidung, die dieser Text offen lässt, schreibt der Maker als Zeile `- messung 08 (Engineer CP,
  <Datum>): …` in `goals/messung/ANNAHMEN.md`.

## Done Condition
- [x] `adressen_an_der_bezahlroute` gibt nie mehr still 0 zurück: Startet `./ops/access-log.sh` nicht, endet es mit einem Exit
      ungleich 0 oder läuft es in die Zeitgrenze, endet `ops/anzeigen-rechnung.py` mit Exit 2, leerem `stdout` und einer Zeile auf
      `stderr`.
      Prüfung: `grep -cE '^class AccessLogUnreadable\(Exception\)' ops/anzeigen-rechnung.py` muss 1 ausgeben.
      Prüfung: `awk '/^def adressen_an_der_bezahlroute/,/^def rechne/' ops/anzeigen-rechnung.py | grep -cE '^\s*return 0\s*$'` muss 0 ausgeben.
      Prüfung: `grep -c 'CP_ACCESS_LOG_TIMEOUT' ops/anzeigen-rechnung.py` muss mindestens 2 ausgeben.
      Prüfung: `T=$(mktemp -d); mkdir $T/ops $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; cp ops/anzeigen-rechnung.py ops/own-ips.sh $T/ops/; printf '203.0.113.99 x\n' > $T/own.txt; printf '{"request":{"client_ip":"%s","uri":"/pay/x"},"status":200}\n' 198.51.100.23 192.0.2.50 > $T/log; printf '#!/bin/sh\ncat %s/log\nexit 1\n' $T > $T/ops/access-log.sh; chmod +x $T/ops/access-log.sh; cd $T; echo '{"db":{"market":{"foreign_payers":1,"foreign_topup_mc":100000,"foreign_margin_mc":1000,"foreign_inference_mc":10000}}}' | env -u CP_OWN_IPS PATH=$T/bin:/usr/bin:/bin HOME=$T CP_OWN_IPS_FILE=$T/own.txt CP_OWN_IPS_SEEN=$T/seen python3 ops/anzeigen-rechnung.py > out 2> err; echo "exit $? stdout $(wc -c < out) stderr $(grep -c '^anzeigen-rechnung: .*exit 1' err)"` muss genau `exit 2 stdout 0 stderr 1` ausgeben.
- [x] Auf einem Log, das mit 0 endet, bleibt jede Ausgabe gleich: Programm an der Merge-Basis und am Kopf geben auf demselben Log
      und auf einem leeren Log bei zwei Klickpreisen dieselbe Ausgabe und denselben Exit.
      Prüfung: `T=$(mktemp -d); mkdir $T/ops $T/bin; printf '#!/bin/sh\nexit 255\n' > $T/bin/ssh; chmod +x $T/bin/ssh; cp ops/own-ips.sh $T/ops/; git show $(git merge-base origin/dev HEAD):ops/anzeigen-rechnung.py > $T/old.py; cp ops/anzeigen-rechnung.py $T/new.py; printf '203.0.113.99 x\n' > $T/own.txt; printf '{"request":{"client_ip":"%s","uri":"/pay/x"},"status":200}\n' 198.51.100.23 192.0.2.50 203.0.113.99 > $T/log; M='{"db":{"market":{"foreign_payers":1,"foreign_topup_mc":100000,"foreign_margin_mc":1000,"foreign_inference_mc":10000,"open_bounties":0}}}'; cd $T; for l in log empty; do touch $T/empty; printf '#!/bin/sh\ncat %s/%s\n' $T $l > ops/access-log.sh; chmod +x ops/access-log.sh; for c in 0.10 5; do for p in old new; do echo "$M" | env -u CP_OWN_IPS PATH=$T/bin:/usr/bin:/bin HOME=$T CP_OWN_IPS_FILE=$T/own.txt CP_OWN_IPS_SEEN=$T/seen python3 $p.py --cpc $c > $p-$l-$c.out 2>&1; echo "exit $?" >> $p-$l-$c.out; done; done; done; cat old-*.out > old.all; cat new-*.out > new.all; cmp -s old.all new.all && echo same` muss genau `same` ausgeben.
      Prüfung: `python3 ops/anzeigen-rechnung.py --selftest | tail -n1` muss genau `ANZEIGEN SELFTEST OK` ausgeben.
- [x] `test/anzeigen-rechnung-access-log.test.ts` belegt die sieben Fälle, und die bestehenden Tests von
      `ops/anzeigen-rechnung.py` und `own_ips` bleiben unverändert grün.
      Prüfung: `grep -cE 'it\("(stops with exit 2 when ops/access-log.sh prints part of the log and ends with exit 1|stops with exit 2 when ops/access-log.sh prints nothing and ends with exit 1|stops with exit 2 when ops/access-log.sh does not start|stops with exit 2 when ops/access-log.sh runs past CP_ACCESS_LOG_TIMEOUT|stops with exit 2 when CP_ACCESS_LOG_TIMEOUT is not a positive number and never starts ops/access-log.sh|never forwards the stderr of ops/access-log.sh|counts a log that ends with exit 0 as before)"' test/anzeigen-rechnung-access-log.test.ts` muss 7 ausgeben.
      Prüfung: `pnpm -s vitest run test/anzeigen-rechnung test/own-ips` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test | grep -vcE '^test/anzeigen-rechnung-access-log\.test\.ts$'` muss 0 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und unter `ops/` ändert sich nur `ops/anzeigen-rechnung.py`.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts|docs)/|^goals/kanal/'` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops | grep -vcE '^ops/anzeigen-rechnung\.py$'` muss 0 ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Fälle 1 bis 6 des neuen Tests waren vor dem Fix rot; die Zeile im Progress Log nennt sie und womit.
- [ ] Kein Teil eines Logs, das mit Fehler endet, geht in den Nenner ein.
- [ ] Keine Ausgabe von `ops/anzeigen-rechnung.py` nennt eine Adresse oder gibt die `stderr` von `access-log.sh` weiter.
- [ ] Code, Kommentare, Meldungen und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `docs/**`, `.env*`, `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/anzeigen-rechnung.py`, vor allem `ops/access-log.sh`, `ops/own-ips.sh`,
  `ops/own-ips.txt` und `ops/check-all.sh`
- jeder bestehende Test unter `test/`, vor allem `test/anzeigen-rechnung-own-ips.test.ts` und `test/own-ips-readers.test.ts`;
  neu ist nur `test/anzeigen-rechnung-access-log.test.ts`
- `goals/kanal/**`
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`), die VM, ssh und jede Datei auf dem Server; Produktion weder
  lesend noch schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Widerlegung geprüft: vierter Prüfbefehl von Punkt 1 an der Merge-Basis adee769 gibt `exit 0 stdout 653 stderr 0`, das Goal ist nicht widerlegt.
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4 gebaut (`AccessLogUnreadable` statt `return 0`, `CP_ACCESS_LOG_TIMEOUT`, neuer Test mit sieben Fällen); vor dem Fix rot die Fälle 1 und 5 mit Exit 0 und „TRAEGT“, die Fälle 2, 3, 4 und 6 mit Exit 2 und „Adressen, die das Angebot ansahen 0“ auf `stdout` (6 failed, 1 passed). Prüfbefehle: P1 `grep` 1, `awk` 0, `grep CP_ACCESS_LOG_TIMEOUT` 4, Probe `exit 2 stdout 0 stderr 1`; P2 `same` (Gegenprobe mit gepflanzter Abweichung in `new.py`: leer), Selftest `ANZEIGEN SELFTEST OK`; P3 `grep it(` 7, vitest Exit 0 (28 passed), Diff `test` 0; P4 `check` Exit 0 (1948 passed), gesperrte Pfade 0, `ops` 0.
- 2026-11-16 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `origin/dev` (adee769) war schon im Branch, kein Code geändert, kein Laufzeitpfad. Prüfbefehle: P1 `grep` 1, `awk` 0, `grep CP_ACCESS_LOG_TIMEOUT` 4, Probe `exit 2 stdout 0 stderr 1`; P2 `same`, Selftest `ANZEIGEN SELFTEST OK`; P3 `grep it(` 7, vitest Exit 0 (28 passed), Diff `test` 0; P4 `check` Exit 0 (1948 passed), gesperrte Pfade 0, `ops` 0.
- 2026-11-16 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
- keine
