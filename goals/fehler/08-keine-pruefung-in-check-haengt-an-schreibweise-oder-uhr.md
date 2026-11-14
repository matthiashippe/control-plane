# Fehler Goal 08: Keine Prüfung in check hängt an Schreibweise oder Uhr

## Status
PLANNED

## Active Objective
Zwei Prüfungen in `check` urteilen heute nicht über den Code, den sie prüfen sollen. `test/known-ips.test.ts` hält eine
`datacenter`-Zeile nur dann gegen den Cache von `ops/fetchers.py`, wenn ihr Beleg genau `(fetcher-cache)` enthält: Eine Zeile mit
`(fetcher cache)`, `(Fetcher-Cache)` oder `fetcher-cache` ohne Klammern fällt still aus der Prüfung, und eine `datacenter`-Zeile mit
freiem Lookup-Beleg prüft niemand auf Quelle und Datum. Eine Besucheradresse kommt mit einem solchen Beleg also so durch wie vor
fehler 06. Und zwei Tests in `test/sandbox-api.test.ts` brechen den ersten Aufruf nach festen 200 ms ab und verlangen, dass er bis
dahin beim nachgebauten `sandboxd` ankam; unter Last werden sie bei korrektem Code rot (Linse K, sandbox 03 Zyklus 4: 2 von 10
Läufen bei Load 87 bis 113). Danach verlangt `test/known-ips.test.ts` für jede `datacenter`-Zeile eine feste Form des Belegs, auch
ohne Cache, und die beiden Sandbox-Tests brechen erst ab, wenn `sandboxd` den Aufruf gesehen hat, mit denselben Erwartungen.
Ändert nur Tests, `ops/known-ips.txt` und `ops/README.md`, kein Rollout.
Widerlegt, wenn die Zeile `203.0.113.7 datacenter AWS (fetcher cache)` schon heute rot ist. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-13-2.md` und `goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-2.md`.
MVP: Funktion, weil die Adressliste die einzige Sperre gegen eine Besucheradresse im öffentlichen Repo ist (Grundregel 8) und ein
Test, der unter Last bei korrektem Code rot wird, Zyklen und Linsen an der Uhr statt am Code festhält.

## Voraussetzungen
- fehler Goal 07 DONE

## Kontext für den Maker
- Ziel: Wer eine Adresse in `ops/known-ips.txt` einträgt, kommt mit einem Tippfehler im Beleg nicht mehr durch `check`, und wer
  einen Zyklus übergibt, bekommt von `check` und Linse K kein Rot, das nur die Last des code-host misst.
- Bestand am 14.11.2026 auf `7020272` (Kopf von `dev`): `test/known-ips.test.ts` hat sechs Fälle, der letzte
  („holds every (fetcher-cache) line against the cache of ops/fetchers.py“) läuft nur mit Cache (`it.skipIf(!existsSync(CACHE))`)
  und wählt seine Zeilen mit `text.includes(FETCHER_CACHE)`. Der Fall „keeps every line of the address list in the form …“ prüft nur
  `LINE`, also Adresse, Art und irgendeinen Beleg. In `ops/known-ips.txt` stehen zehn `datacenter`-Zeilen: sieben genau mit
  `(fetcher-cache)`, zwei mit `(ops/fetchers.py lookup 2026-11-12)` mitten im Beleg (Zeilen 11 und 13), eine mit
  `(RIPE RDAP 2026-11-12, PTR 448c.org)` (Zeile 20). Am selben Stand ist die Gegenprobe gelaufen: alte Testdatei, Liste nur mit
  `203.0.113.7 datacenter AWS (fetcher cache)`, Wegwerf-Repo mit dieser Adresse, ohne Cache ergibt `gruen`; das Goal ist also nicht
  widerlegt.
- Entscheidung Tech Lead (14.11.2026), Form des Belegs: Ein neuer Fall in `test/known-ips.test.ts`, der ohne Cache und ohne Netz
  läuft, Name genau „names the source of every datacenter line in a fixed form“ (die Prüfbefehle wählen ihn mit
  `-t 'source of every datacenter line'`). Er geht jede Zeile der Liste außer Kommentar und Leerzeile durch, deren Art `datacenter`
  ist:
  - Trifft der Text der Zeile `/fetcher.?cache/i`, muss die ganze Zeile `CACHE_LINE` treffen (`<address> datacenter <operator>
    (fetcher-cache)` und nichts danach).
  - Sonst muss sie eine Klammer mit Quelle und Datum tragen: `/\((ops\/fetchers\.py lookup|RIPE RDAP|ARIN RDAP) ([0-9]{4}-[0-9]{2}-[0-9]{2})[,)]/`,
    und das Datum muss ein Kalendertag sein (Monat 01 bis 12, Tag im Monat, `2026-02-30` ist rot). Kein Vergleich mit der Uhr, weil
    der Test sonst an einem Datum kippt. Die drei heutigen Lookup-Zeilen haben diese Form schon.
  - Die Meldung nennt die Zahl und je Zeile `line <n>: <Grund>`, nie eine Adresse, wie der Fall mit dem Cache.
  Der Fall mit dem Cache bleibt, wie er ist; eine falsch geschriebene Zeile macht jetzt der neue Fall rot, auch in CI.
- Entscheidung Tech Lead (14.11.2026), Sandbox-Tests: In „runs the command once and hands the repeat its result, even when it runs
  longer than the first request was held“ und „repeated create while the first one still runs: nothing new, the same sandbox in
  every answer“ ersetzt je ein eigener `AbortController` den Aufruf `AbortSignal.timeout(200)`. Abgebrochen wird erst, wenn der
  nachgebaute `sandboxd` den Aufruf gesehen hat: Der `respond`-Haken, der ohnehin am `gate` wartet, löst vorher ein Promise auf
  (`exec` beim ersten, `docker run` beim zweiten Test), der Test wartet darauf und ruft dann `abort()`. Danach dieselben Erwartungen
  (`expect(w.execs().length).toBe(1)`, `expect(creates(w)).toBe(1)` und alle folgenden). `test/sandbox-world.ts` und `src/` ändern
  sich nicht. Die beiden Wartezeiten von 100 ms danach prüfen, dass nichts Neues startet, und bleiben, weil sie bei Last nur
  weniger streng werden, nie falsch rot.
- Eine Gegenprobe für die Sandbox-Tests gibt es ohne Last nicht: Der alte Test ist auf einem ruhigen Rechner grün. Deshalb prüfen
  Punkt 3 die Form (kein fester Abbruch mehr, die Erwartungen unverändert gezählt) und zehn Läufe ohne Rot.
- `ops/known-ips.txt`: Der Kopfkommentar zu `datacenter` nennt die feste Form beider Belege. Die Zeilen selbst ändern sich nur, wenn
  der neue Fall eine heutige Zeile rot macht; dann wird die Zeile an die Form angepasst, nie gelöscht oder umgedeutet.
- `ops/README.md`, Abschnitt „Public addresses in this repository“: Die Zeile `datacenter` der Tabelle und der Absatz zu
  `fetcher-cache` nennen die feste Form (`(fetcher-cache)` genau, sonst `(<source> <YYYY-MM-DD>` mit den drei Quellen) und dass der
  neue Fall ohne Cache läuft.
- Tests nur mit Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`); keine Besucheradresse und keine Zeile
  aus dem Cache in Test, Fixture, Commit, PR, Kommentar oder Verdict.
- Rollout: keiner, das Goal ändert weder `src/` noch `ops/*.sh` noch `deploy/`.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Belegläufe mit
  `CP_FETCHER_CACHE` auf eine Datei aus `mktemp`, nie auf den echten Cache schreibend.

## Done Condition
- [ ] `test/known-ips.test.ts` verlangt für jede `datacenter`-Zeile, deren Beleg `/fetcher.?cache/i` trifft, genau `(fetcher-cache)`
      am Zeilenende und für jede andere eine Klammer mit Quelle aus `ops/fetchers.py lookup`, `RIPE RDAP` oder `ARIN RDAP` und
      einem Kalendertag `JJJJ-MM-TT`, auch ohne Cache; sonst rot mit Zeilennummer und ohne Adresse.
      MVP: Funktion, weil ein Tippfehler im Beleg die Prüfung heute still abschaltet.
      Prüfung: `d=$(mktemp -d); for l in '203.0.113.7 datacenter AWS (fetcher cache)' '203.0.113.7 datacenter AWS fetcher-cache' '203.0.113.7 datacenter AWS (Fetcher-Cache)' '203.0.113.7 datacenter AWS (fetcher-cache) since 2026' '203.0.113.7 datacenter Example (RIPE RDAP)' '203.0.113.7 datacenter Example (whois 2026-11-12)' '203.0.113.7 datacenter Example (ARIN RDAP 2026-13-01)' '203.0.113.7 datacenter Example (RIPE RDAP 2026-02-30)' '203.0.113.7 datacenter Example (RIPE RDAP 12.11.2026)'; do printf '%s\n' "$l" > "$d/list"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts -t 'source of every datacenter line' >/dev/null 2>&1 && echo gruen || echo rot; done | tr '\n' ' '` muss genau `rot rot rot rot rot rot rot rot rot ` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s\n' '203.0.113.7 datacenter AWS (fetcher-cache)' '203.0.113.8 datacenter Example (ARIN RDAP 2026-11-12)' '203.0.113.9 datacenter Example resolver, PTR x.example (RIPE RDAP 2026-11-12, PTR x.example); resolver' '203.0.113.10 datacenter Example (ops/fetchers.py lookup 2026-11-12); note' '203.0.113.11 crawler crawl.example, PTR round trip' > "$d/list"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts -t 'source of every datacenter line' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"])'` muss `1 0` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s\n' '203.0.113.7 datacenter AWS (fetcher-cache)' '203.0.113.8 datacenter AWS (fetcher cache)' > "$d/list"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts -t 'source of every datacenter line' 2>&1 | grep -c 'line 2: '` muss mindestens 1 ausgeben.
      Prüfung: `d=$(mktemp -d); printf '%s\n' '203.0.113.7 datacenter AWS (fetcher-cache)' '203.0.113.8 datacenter AWS (fetcher cache)' > "$d/list"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts -t 'source of every datacenter line' 2>&1 | grep -c '203\.0\.113\.'` muss `0` ausgeben.
      Prüfung: `grep -cE '\.skip|skipIf|\.only|\.todo' test/known-ips.test.ts` muss `1` ausgeben.
- [ ] Die Zeile `203.0.113.7 datacenter AWS (fetcher cache)` ist mit der neuen Testdatei rot und war mit der alten grün, beide Male
      ohne Cache, und die echte Liste bleibt grün.
      MVP: Funktion, weil erst die Gegenprobe zeigt, dass der neue Fall genau die Lücke schließt, die der Vorschlag belegt.
      Prüfung: `d=$(mktemp -d); git init -q "$d/r"; printf 'seen 203.0.113.7\n' > "$d/r/a.txt"; git -C "$d/r" add a.txt; printf '203.0.113.7 datacenter AWS (fetcher cache)\n' > "$d/list"; CP_KNOWN_IPS="$d/list" CP_SCAN_ROOT="$d/r" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); git init -q "$d/r"; printf 'seen 203.0.113.7\n' > "$d/r/a.txt"; git -C "$d/r" add a.txt; printf '203.0.113.7 datacenter AWS (fetcher cache)\n' > "$d/list"; git show 7020272:test/known-ips.test.ts > test/known-ips-before.test.ts; CP_KNOWN_IPS="$d/list" CP_SCAN_ROOT="$d/r" CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips-before.test.ts >/dev/null 2>&1 && echo gruen || echo rot; rm -f test/known-ips-before.test.ts` muss `gruen` ausgeben.
      Prüfung: `d=$(mktemp -d); CP_FETCHER_CACHE="$d/none.tsv" PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"] >= 6, r["numFailedTests"])'` muss `True 0` ausgeben.
      Prüfung: `grep -c '^[0-9][0-9.]* datacenter ' ops/known-ips.txt` muss `10` ausgeben.
- [ ] Die beiden Tests in `test/sandbox-api.test.ts`, die den ersten Aufruf nach festen 200 ms abbrachen, brechen erst ab, wenn der
      nachgebaute `sandboxd` ihn gesehen hat, mit denselben Erwartungen, und sind in zehn Läufen hintereinander grün.
      MVP: Funktion, weil `check` und Linse K sonst unter Last bei korrektem Code rot werden und ein Zyklus an der Uhr hängt.
      Prüfung: `grep -c 'AbortSignal.timeout(' test/sandbox-api.test.ts` muss `0` ausgeben.
      Prüfung: `grep -c 'new AbortController()' test/sandbox-api.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -c 'expect(w.execs().length).toBe(1)' test/sandbox-api.test.ts` muss `3` ausgeben.
      Prüfung: `grep -c 'expect(creates(w)).toBe(1)' test/sandbox-api.test.ts` muss `4` ausgeben.
      Prüfung: `for i in 1 2 3 4 5 6 7 8 9 10; do PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts -t 'runs the command once and hands the repeat its result|repeated create while the first one still runs' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print("ok" if r["numPassedTests"] == 2 and r["numFailedTests"] == 0 else "rot")'; done | sort | uniq -c | sed 's/^ *//'` muss genau `10 ok` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-api.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numFailedTests"], r["numPendingTests"])'` muss `0 0` ausgeben.
- [ ] `ops/known-ips.txt` und `ops/README.md` nennen die feste Form des Belegs einer `datacenter`-Zeile.
      MVP: Funktion, weil wer die nächste Adresse einträgt, die Form aus der Liste und der Doku liest, nicht aus dem Test.
      Prüfung: `grep '^#' ops/known-ips.txt | grep -c 'RIPE RDAP'` muss mindestens 1 ausgeben.
      Prüfung: `grep '^#' ops/known-ips.txt | grep -c 'YYYY-MM-DD'` muss mindestens 1 ausgeben.
      Prüfung: `grep '^| .datacenter. |' ops/README.md | grep -c 'ARIN RDAP'` muss `1` ausgeben.
      Prüfung: `grep -c 'YYYY-MM-DD' ops/README.md` muss mindestens 1 ausgeben.
- [ ] Nur die beiden Tests, `ops/known-ips.txt`, `ops/README.md` und Dateien des Goals ändern sich, `src/` nicht, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(test/known-ips\.test\.ts|test/sandbox-api\.test\.ts|ops/known-ips\.txt|ops/README\.md|goals/fehler/)' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src test/sandbox-world.ts ops/fetchers.py | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt die Gegenprobe: alte Testdatei mit `(fetcher cache)` ohne Cache grün, neue rot.
- [ ] Keine Besucheradresse, keine Zeile aus dem Cache von `ops/fetchers.py` und keine öffentliche IPv4-Adresse außerhalb von
      `ops/known-ips.txt` in Test, Fixture, Commit, PR, Kommentar, Log oder Verdict; Tests nur mit Dokumentationsadressen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.claude/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `test/sandbox-world.ts`, `ops/fetchers.py`, `ops/own-ips.txt`, `ops/crawler-ips.txt`, `ops/*.sh`
- der Cache von `ops/fetchers.py` (`~/.cache/control-plane/fetcher-cache.tsv`): nur lesen, nie schreiben, nie ins Repo
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
