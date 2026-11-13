# Fehler Goal 06: Der Beleg (fetcher-cache) in ops/known-ips.txt ist prüfbar

## Status
PLANNED

## Active Objective
Eine Zeile `<Adresse> datacenter <Betreiber> (fetcher-cache)` in `ops/known-ips.txt` erlaubt einer öffentlichen Adresse, in einer
getrackten Datei des öffentlichen Repos zu stehen. Heute liest kein Test diesen Beleg: `test/known-ips.test.ts` prüft nur Form, Art
und Fundstelle, und `test/visitor-addresses.test.ts` liest die Liste nicht. Wer die Adresse eines echten Besuchers mit diesem Beleg
einträgt, kommt also durch `check`, auch auf dem code-host, wo der Cache liegt. Danach prüft `test/known-ips.test.ts` dort, wo der
Cache von `ops/fetchers.py` liegt, jede Zeile mit `(fetcher-cache)` gegen den Cache: Die Adresse steht dort mit Art `datacenter` und
genau dem genannten Betreiber, sonst rot. Ohne Cache, also in CI, bleibt dieser Teil übersprungen wie heute.
Widerlegt, wenn eine gepflanzte Besucheradresse mit diesem Beleg den Test schon heute rot macht. Übernimmt
`goals/_vorschlaege/fehler-kritik-2026-11-12-5.md`.
MVP: Funktion, weil die Liste sonst ein Freibrief für jede Adresse ist, die jemand mit dem richtigen Beleg einträgt, und eine
Besucheradresse im öffentlichen Repo Grundregel 8 bricht.

## Voraussetzungen
- fehler Goal 05 DONE

## Kontext für den Maker
- Bestand am 13.11.2026 auf `92ffe8a` (Kopf von `dev`): `ops/known-ips.txt` hat 13 Einträge, sieben davon mit dem Beleg
  `AWS (fetcher-cache)` oder `GCP (fetcher-cache)`. Der Cache liegt auf dem code-host unter
  `~/.cache/control-plane/fetcher-cache.tsv` (oder `$CP_FETCHER_CACHE`), 960 Zeilen, erste Zeile ein Kommentar ab `#`, danach je
  Zeile `<ip>\t<owner>\t<kind>`; `kind` ist `datacenter` (236) oder `unknown` (723, `owner` meist `-`). Gelesen am 13.11.2026: Alle
  sieben Einträge stehen dort mit Art `datacenter` und genau dem Betreiber der Liste. Der Test muss also auf dem heutigen Stand grün
  sein, ohne dass die Liste sich ändert.
- Entscheidung Tech Lead (13.11.2026): Der neue Teil ist ein weiteres `it` in `test/known-ips.test.ts`, nicht in
  `test/visitor-addresses.test.ts`, weil nur `test/known-ips.test.ts` die Liste schon liest (`CP_KNOWN_IPS`, `LINE`, `listLines`).
  Sein Name enthält genau `against the cache of ops/fetchers.py`, weil die Prüfbefehle ihn mit `-t` wählen. Es läuft mit
  `it.skipIf(!existsSync(CACHE))`, `CACHE` wie in `test/visitor-addresses.test.ts`: `CP_FETCHER_CACHE` oder
  `~/.cache/control-plane/fetcher-cache.tsv`. Zeilen des Caches, die mit `#` beginnen oder leer sind, zählen nicht.
- Regel des Tests: Jede Zeile der Liste, deren Beleg `(fetcher-cache)` enthält, muss genau `<Adresse> datacenter <Betreiber> (fetcher-cache)`
  lauten (Beleg endet mit ` (fetcher-cache)`, davor ein Betreiber ohne Rest), und der Cache führt die Adresse mit Art `datacenter`
  und `owner` gleich dem Betreiber (Zeichen für Zeichen). Rot ist: Adresse fehlt im Cache, Art nicht `datacenter`, anderer Betreiber,
  Text nach `(fetcher-cache)`, andere Art als `datacenter` in der Liste. Die Fehlermeldung nennt Anzahl und Zeilennummern der Liste
  und den Grund je Zeile, nie eine Adresse, wie die übrigen Fälle der Datei.
- `ops/known-ips.txt`: die Kopfzeile zur Art `datacenter` nennt die Form `<operator> (fetcher-cache)` und dass der Test sie gegen den
  Cache prüft, wo er liegt. Die Einträge ändern sich nicht. `ops/README.md`, Abschnitt „Public addresses in this repository“: ein
  Satz, dass `test/known-ips.test.ts` jede Zeile mit `(fetcher-cache)` gegen den Cache prüft, wo er liegt (`CP_FETCHER_CACHE`), und
  ohne ihn diesen Teil überspringt.
- Fixtures nur mit Dokumentationsadressen (`203.0.113.0/24` und Verwandte), nie eine Adresse aus dem echten Cache: Der Cache hält
  Adressen echter Besucher, und das Repo ist öffentlich (Grundregel 8). Kein Prüfbefehl und kein Test schreibt in den echten Cache;
  `ops/fetchers.py` wird nicht aufgerufen, weil schon eine Abfrage den Cache wachsen lässt und `test/visitor-addresses.test.ts` auf
  dem code-host rot macht (`goals/fehler/ANNAHMEN.md`, Falle aus fehler 04).
- Die Gegenprobe vor dem Fix (Punkt 2) legt die Testdatei von `92ffe8a` kurz als `test/known-ips-before.test.ts` ab und löscht sie im
  selben Befehl; sie ist nie Teil eines Commits.
- Unter `src/` und in `ops/*.sh` ändert sich nichts, also löst das Goal keinen Rollout aus (Grundregel 5).
- Traction: Die Liste wächst mit jeder neuen Adresse in Fixtures und Daten; ein Beleg, den niemand prüft, ist der Weg, auf dem eine
  Besucheradresse wieder ins öffentliche Repo kommt, nachdem fehler 02 sie herausgeholt hat.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Neue Dateien vor dem lokalen
  `check` stagen, weil die Regeln nur `git ls-files` lesen.

## Done Condition
- [ ] `test/known-ips.test.ts` prüft jede Zeile mit `(fetcher-cache)` gegen den Cache: Eine gepflanzte Besucheradresse mit diesem
      Beleg, ein anderer Betreiber, eine im Cache fehlende Adresse und Text nach dem Beleg machen den Test rot, eine passende Zeile
      lässt ihn grün, und die Meldung nennt keine Adresse.
      MVP: Funktion, weil genau dieser Fall heute durch `check` kommt.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\t-\tunknown\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\tGCP\tdatacenter\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.8\tAWS\tdatacenter\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache) since 2026\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\tAWS\tdatacenter\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\tAWS\tdatacenter\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"])'` muss `1 0` ausgeben.
      Prüfung: `d=$(mktemp -d); printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\t-\tunknown\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts -t 'against the cache of ops/fetchers' 2>&1 | grep -c '203\.0\.113\.7'` muss `0` ausgeben.
- [ ] Vor dem Fix war derselbe Fall grün, danach ist er rot: Mit gepflanzter Besucheradresse und einem Scan-Wurzelverzeichnis, in dem
      sie steht, besteht die ganze Testdatei von `92ffe8a`, die neue nicht.
      MVP: Funktion, weil nur so belegt ist, dass der neue Teil die Lücke schließt und nicht ein anderer Fall der Datei.
      Prüfung: `d=$(mktemp -d); git init -q "$d/r"; printf 'seen 203.0.113.7\n' > "$d/r/a.txt"; git -C "$d/r" add a.txt; printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\t-\tunknown\n' > "$d/c"; git show 92ffe8a:test/known-ips.test.ts > test/known-ips-before.test.ts; CP_KNOWN_IPS="$d/list" CP_SCAN_ROOT="$d/r" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips-before.test.ts >/dev/null 2>&1 && echo gruen || echo rot; rm -f test/known-ips-before.test.ts` muss `gruen` ausgeben.
      Prüfung: `d=$(mktemp -d); git init -q "$d/r"; printf 'seen 203.0.113.7\n' > "$d/r/a.txt"; git -C "$d/r" add a.txt; printf '203.0.113.7 datacenter AWS (fetcher-cache)\n' > "$d/list"; printf '# ip\towner\tkind\n203.0.113.7\t-\tunknown\n' > "$d/c"; CP_KNOWN_IPS="$d/list" CP_SCAN_ROOT="$d/r" CP_FETCHER_CACHE="$d/c" pnpm -s vitest run test/known-ips.test.ts >/dev/null 2>&1 && echo gruen || echo rot` muss `rot` ausgeben.
      Prüfung: `git ls-files test/known-ips-before.test.ts | wc -l` muss 0 ausgeben.
- [ ] Ohne Cache ist der neue Teil übersprungen und der Rest grün; auf dem code-host hält die echte Liste gegen den echten Cache.
      MVP: Funktion, weil CI keinen Cache hat und `check` dort grün bleiben muss, und weil die sieben Einträge von heute echt sind.
      Prüfung: `d=$(mktemp -d); CP_FETCHER_CACHE="$d/fehlt.tsv" pnpm -s vitest run test/known-ips.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPendingTests"], r["numFailedTests"])'` muss `1 0` ausgeben.
      Prüfung: `test -f ~/.cache/control-plane/fetcher-cache.tsv && env -u CP_FETCHER_CACHE pnpm -s vitest run test/known-ips.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPendingTests"], r["numFailedTests"])'` muss auf dem code-host `0 0` ausgeben.
      Prüfung: `grep -cE '\.skip\(|\.only|\.todo' test/known-ips.test.ts` muss 0 ausgeben.
      Prüfung: `grep -c 'skipIf' test/known-ips.test.ts` muss 1 ausgeben.
- [ ] `ops/known-ips.txt` und `ops/README.md` nennen die Prüfung gegen den Cache, die Einträge der Liste bleiben unverändert.
      MVP: Funktion, weil wer eine Zeile einträgt, wissen muss, dass der Beleg geprüft wird und in welcher Form.
      Prüfung: `grep -c 'CP_FETCHER_CACHE' ops/README.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '^#.*(fetcher-cache).*test/known-ips.test.ts\|^#.*test/known-ips.test.ts.*(fetcher-cache)' ops/known-ips.txt` muss mindestens 1 ausgeben.
      Prüfung: `diff <(git show origin/dev:ops/known-ips.txt | grep -vE '^(#|$)') <(grep -vE '^(#|$)' ops/known-ips.txt) && echo gleich` muss `gleich` ausgeben.
- [ ] Nur die Testdatei, die Liste, `ops/README.md` und Dateien des Goals ändern sich, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(test/known-ips\.test\.ts|ops/known-ips\.txt|ops/README\.md|goals/fehler/)' | wc -l` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt die Gegenprobe: alte Testdatei mit gepflanzter Besucheradresse grün, neue rot.
- [ ] Keine Adresse aus dem echten Cache und keine andere öffentliche IPv4-Adresse in Test, Fixture, Commit, PR, Kommentar, Log oder
      Verdict; Fixtures nur aus `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, `ops/README.md` Englisch wie die ganze Datei, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.claude/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/*.sh`, `ops/fetchers.py`, `ops/own-ips.txt`, `ops/crawler-ips.txt`, `test/visitor-addresses.test.ts`
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`
- der echte Cache `~/.cache/control-plane/fetcher-cache.tsv`: nur lesen, nie schreiben, nie `ops/fetchers.py` gegen ihn laufen lassen
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
