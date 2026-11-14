# Fehler Goal 11: Der Abgleich mit dem Fetcher-Cache läuft auch in CI

## Status
PLANNED

## Active Objective
Seit fehler 06 prüft `test/known-ips.test.ts` jede Zeile `(fetcher-cache)` in `ops/known-ips.txt` gegen den Cache von
`ops/fetchers.py` (Adresse vorhanden, Art `datacenter`, gleicher Betreiber). Diese Prüfung steckt in `cacheFinding` und läuft nur im
Fall mit `it.skipIf(!existsSync(CACHE))`, also in CI nie und auf dem code-host nur gegen die echte Liste. Ein Umbau, der den
Betreibervergleich oder die Prüfung „Adresse im Cache“ verliert, bleibt heute überall grün (Gegenprobe im Vorschlag: 6 bestanden,
0 rot). Danach ruft ein neuer Fall in derselben Datei `cacheFinding` ohne Cache-Datei mit einer gepflanzten Map aus
Dokumentationsadressen auf, so wie der Fall für `isPublic`: Adresse fehlt, Art `unknown`, anderer Betreiber und Text nach dem Beleg
sind je rot mit ihrem Grund, die passende Zeile ergibt `null`. Ändert nur den Test, kein Rollout.
Widerlegt, wenn dieser Umbau schon heute in `check` ohne Cache-Datei rot wird. Übernimmt
`goals/_vorschlaege/fehler-nacharbeit-2026-11-14-1.md`.
MVP: Funktion, weil sonst eine Besucheradresse mit Beleg `(fetcher-cache)` nach einem solchen Umbau wieder durchkäme (Grundregel 8),
ohne dass `check` es merkt.

## Voraussetzungen
- fehler Goal 10 DONE

## Kontext für den Maker
- Ziel: Verliert jemand den Betreibervergleich oder die Prüfung „Adresse im Cache“ in `cacheFinding`, wird `check` rot, auch in CI
  ohne Cache-Datei.
- Bestand am 14.11.2026 auf `459ae13` (Kopf von `dev`), `test/known-ips.test.ts`:
  - `cacheFinding(text, cache)` (Zeilen 171 bis 182) liefert für eine Zeile mit `(fetcher-cache)` den Grund oder `null`, mit genau
    diesen Gründen: `kind is not datacenter`, `text besides the operator and (fetcher-cache)`, `address not in the cache`,
    `kind in the cache is not datacenter`, `other operator in the cache`. Die Map hat den Typ
    `Map<string, Array<{ owner: string; kind: string }>>`, wie `cacheEntries` sie aus der TSV-Datei baut.
  - Der Fall „holds every (fetcher-cache) line against the cache of ops/fetchers.py“ (Zeile 319) ist der einzige Aufruf und trägt
    `it.skipIf(!existsSync(CACHE))`. `CP_FETCHER_CACHE` setzt den Pfad des Caches; ein Pfad, der nicht existiert, überspringt den
    Fall wie in CI.
  - Der Fall „tells public addresses from documentation, private and reserved ones“ (Zeile 206) ist das Muster: eine reine Funktion,
    feste Eingaben, kein Dateizugriff.
- Entscheidung Tech Lead (14.11.2026), der neue Fall: im selben `describe`, Name genau
  „compares fetcher-cache lines with a planted cache map, without the cache file“, ohne `skipIf`. Er baut die Map direkt im Test
  (kein Lesen einer Datei, kein `cacheEntries`) und erwartet mit `toBe` je genau den Grund:
  - Adresse nicht in der Map: `address not in the cache`
  - Adresse in der Map nur mit Art `unknown`: `kind in the cache is not datacenter`
  - Adresse in der Map mit Art `datacenter` und anderem Betreiber: `other operator in the cache`
  - Zeile mit Text nach `(fetcher-cache)`, Adresse passend in der Map: `text besides the operator and (fetcher-cache)`
  - passende Zeile (Adresse, Art `datacenter`, gleicher Betreiber): `null`
  Adressen nur aus `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24`, Betreiber erfunden (etwa `Example Hosting`,
  `Other Cloud`), weil die Datei selbst von `check` auf öffentliche Adressen durchsucht wird.
- Entscheidung Tech Lead (14.11.2026), nur Zuwachs: Der Diff an `test/known-ips.test.ts` fügt nur Zeilen hinzu. `cacheFinding`, die
  Gründe und die bestehenden Fälle bleiben Zeichen für Zeichen, weil die Gegenproben genau diese Stellen per `sed` umbauen:
  ` && r.owner === m[2]` (Betreibervergleich) und `return "address not in the cache"` (Adresse im Cache) stehen je genau einmal in
  der Datei.
- Gegenprobe: Eine umgebaute Kopie liegt für die Dauer des Prüfbefehls als `test/known-ips-mutant.test.ts` im Worktree (sonst greift
  `include` aus `vitest.config.ts` nicht) und wird per `trap` gelöscht; sie ist nie getrackt und nie im Commit.
- Kein Rollout, kein Schritt auf dem Server, kein Lauf von `ops/fetchers.py` und keine Abfrage im Netz.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout.

## Done Condition
- [ ] Der neue Fall ruft `cacheFinding` ohne Cache-Datei mit einer gepflanzten Map auf und ist grün; die ganze Datei ist ohne Cache
      grün, nur der Fall mit dem echten Cache ist übersprungen.
      MVP: Funktion, weil der Abgleich heute in CI gar nicht geprüft wird.
      Prüfung: `CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts -t 'compares fetcher-cache lines with a planted cache map, without the cache file' --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"])'` muss `1 0` ausgeben.
      Prüfung: `CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run test/known-ips.test.ts --reporter=json 2>/dev/null | python3 -c 'import json,sys; r=json.load(sys.stdin); print(r["numPassedTests"], r["numFailedTests"], r["numPendingTests"])'` muss `7 0 1` ausgeben.
      Prüfung: `grep -c 'skipIf' test/known-ips.test.ts` muss `1` ausgeben.
      Prüfung: `grep -cE '\.only|\.todo|it\.skip\(' test/known-ips.test.ts` muss `0` ausgeben.
- [ ] Gegenprobe Betreiber: Ohne ` && r.owner === m[2]` ist der neue Fall rot, die Datei von `459ae13` mit demselben Umbau bleibt ohne
      Cache grün.
      MVP: Funktion, weil erst die Gegenprobe zeigt, dass der Fall genau die Lücke des Vorschlags misst.
      Prüfung: `grep -cF ' && r.owner === m[2]' test/known-ips.test.ts` muss `1` ausgeben.
      Prüfung: `m=test/known-ips-mutant.test.ts; trap 'rm -f "$m"' EXIT; sed 's/ && r\.owner === m\[2\]//' test/known-ips.test.ts > "$m"; if cmp -s test/known-ips.test.ts "$m"; then echo unveraendert; elif CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run "$m" -t 'compares fetcher-cache lines with a planted cache map, without the cache file' >/dev/null 2>&1; then echo gruen; else echo rot; fi` muss `rot` ausgeben.
      Prüfung: `m=test/known-ips-mutant.test.ts; trap 'rm -f "$m"' EXIT; git show 459ae13:test/known-ips.test.ts | sed 's/ && r\.owner === m\[2\]//' > "$m"; if git show 459ae13:test/known-ips.test.ts | cmp -s - "$m"; then echo unveraendert; elif CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run "$m" >/dev/null 2>&1; then echo gruen; else echo rot; fi` muss `gruen` ausgeben.
- [ ] Gegenprobe Adresse im Cache: Liefert `cacheFinding` für eine fehlende Adresse `null`, ist der neue Fall rot, die Datei von
      `459ae13` mit demselben Umbau bleibt ohne Cache grün.
      MVP: Funktion, weil eine fehlende Adresse sonst als belegt durchgeht.
      Prüfung: `grep -cF 'return "address not in the cache"' test/known-ips.test.ts` muss `1` ausgeben.
      Prüfung: `m=test/known-ips-mutant.test.ts; trap 'rm -f "$m"' EXIT; sed 's/return "address not in the cache"/return null/' test/known-ips.test.ts > "$m"; if cmp -s test/known-ips.test.ts "$m"; then echo unveraendert; elif CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run "$m" -t 'compares fetcher-cache lines with a planted cache map, without the cache file' >/dev/null 2>&1; then echo gruen; else echo rot; fi` muss `rot` ausgeben.
      Prüfung: `m=test/known-ips-mutant.test.ts; trap 'rm -f "$m"' EXIT; git show 459ae13:test/known-ips.test.ts | sed 's/return "address not in the cache"/return null/' > "$m"; if git show 459ae13:test/known-ips.test.ts | cmp -s - "$m"; then echo unveraendert; elif CP_FETCHER_CACHE=/nonexistent/fetcher-cache.tsv PATH=/usr/bin:$PATH pnpm -s vitest run "$m" >/dev/null 2>&1; then echo gruen; else echo rot; fi` muss `gruen` ausgeben.
- [ ] Der Fall nimmt nur Dokumentationsadressen, und der Diff an der Datei ist reiner Zuwachs.
      MVP: Funktion, weil das Repo öffentlich ist und die Gegenproben auf den unveränderten Stellen beruhen.
      Prüfung: `git diff origin/dev...HEAD -- test/known-ips.test.ts | grep -E '^\+[^+]' | grep -oE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' | grep -vcE '^(192\.0\.2|198\.51\.100|203\.0\.113)\.'` muss `0` ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- test/known-ips.test.ts | grep -cE '^-[^-]|^-$'` muss `0` ausgeben.
      Prüfung: `git ls-files test/known-ips-mutant.test.ts | wc -l` muss `0` ausgeben.
- [ ] Nur `test/known-ips.test.ts` und Dateien des Goals ändern sich, und `check` ist grün.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vE '^(test/known-ips\.test\.ts|goals/fehler/)' | wc -l` muss `0` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Zeile im Progress Log nennt beide Gegenproben: neuer Fall mit Umbau rot, Datei von `459ae13` mit demselben Umbau grün.
- [ ] Keine echte Besucheradresse, kein Lesen oder Schreiben des echten Caches durch den neuen Fall, kein Lauf von `ops/fetchers.py`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `.claude/**`, `scripts/check.mjs`,
  `deploy/**`, `harness/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/**` (auch `ops/known-ips.txt`, `ops/fetchers.py`), jeder Test unter `test/` außer `test/known-ips.test.ts`,
  `vitest.config.ts`, `package.json`
- `~/.cache/control-plane/fetcher-cache.tsv`: nie ändern, nie ins Repo
- jede Goal-Datei außer dieser, jedes Verdict, jeder Vorschlag unter `goals/_vorschlaege/`, jedes `ANNAHMEN.md` eines anderen Topics,
  `docs/audit/**`, `loop-dauerauftrag.md`, `STATE.md`, `loop-run-log.md`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
