# Kunden Goal 10: Die Startgutschrift bleibt bei einem neuen Runtime-Pin geprüft

## Status
PAUSED

## Active Objective
Der Auslöser aus kunden 06 hängt am Schlüsselnamen `conway-automaton`, den die Runtime am Pin `d8f8168` bei der Anmeldung über SIWE
bekommt (`RUNTIME_KEY_NAME` in `src/credits/starter.ts`). Benennt eine neue Version der Runtime ihren Schlüssel um, gibt der Dienst die
Gutschrift wieder erst beim ersten Denken oder beim dritten Lesen, und kein Test wird rot: Der Job `e2e` prüft seit PR #318 nur
`balance_mc < credited_mc`, und `credited_mc` enthält die Gutschrift, muss sie aber nicht enthalten. Dazu schreiben
`src/auth/siwe.ts:204` und `src/app.ts:2536` für einen Schlüssel ohne Namen weiter das Literal statt `RUNTIME_KEY_NAME`; ändert sich der
Standard an einer Stelle, gibt `grantOnFirstRead` still keine Gutschrift mehr. Nach diesem Goal verlangt der Job `e2e` für die erste
Wallet genau eine Ledger-Zeile `grant` mit `trigger` `first balance read`, und beide Stellen nehmen `RUNTIME_KEY_NAME`.
Leitzahl: Anteil neuer Runtimes mit Startgutschrift (6 von 9 bis 19.11.2026); dieses Goal hält ihn bei einem neuen Pin.
Widerlegt, wenn der Job `e2e` am Kopf von `dev` schon heute rot wird, sobald `grantOnFirstRead` keine Gutschrift gibt.
MVP: Funktion, weil eine Runtime ohne Gutschrift nie denkt und damit nie zahlt, und ein neuer Pin das sonst still bricht.

## Voraussetzungen
- kunden Goal 09 DONE

## Kontext für den Maker
- Ziel: Wer den Pin der Runtime hebt, sieht im Job `e2e` sofort, wenn neue Runtimes ihre Startgutschrift nicht mehr vor dem ersten
  Denken bekommen.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 10; Loop-Triage 21.11.2026 (PRO-26350, PRO-26356). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-20-5.md` und `goals/_vorschlaege/kunden-nacharbeit-2026-11-21-4.md`. Ein Goal statt eines
  Pflege-PR `fix`, weil `fix` nur `scripts/**` ändern darf und hier `harness/e2e/` und `src/` gemeint sind (Tech Lead, 21.11.2026).
- Ledger-Abfrage des Jobs `e2e`: Der eingebettete Block in `harness/e2e/full.sh` (Abschnitt `--- balance and ledger`) zieht in eine
  eigene Datei `harness/e2e/ledger.cjs`, die die Datenbank aus `CP_E2E_DB` liest (Standard `/data/cp.db`, `readonly: true`).
  `full.sh` führt sie im Container `cp` mit `node -e "$(cat harness/e2e/ledger.cjs)"` aus, damit nichts gemountet werden muss. Die
  Ausgabe bleibt das JSON von heute mit allen Feldern und bekommt `first_read_grants`: die Zahl der Ledger-Zeilen `grant` der ersten
  Wallet, deren `meta` den `trigger` `first balance read` trägt.
- `full.sh` endet mit `E2E FAIL`, wenn `first_read_grants` nicht genau 1 ist, und nennt `first_read_grants=<n>` in den Zeilen
  `E2E FAIL` und `E2E OK`. Alle anderen Bedingungen bleiben.
- Test `test/e2e-ledger.test.ts`: baut mit `openDb` eine Datenbank in einem temporären Ordner, fährt `harness/e2e/ledger.cjs` mit
  `CP_E2E_DB` dagegen und verlangt `first_read_grants` 1 für eine Wallet, deren Gutschrift über `grantOnFirstRead` kam (Testname
  enthält `one first read grant`), und 0 für eine, deren Gutschrift über `grantOnFirstUse` kam (Testname enthält
  `no first read grant`); rot vor der Änderung.
- `RUNTIME_KEY_NAME`: `src/auth/siwe.ts` und `src/app.ts` nehmen die Konstante statt des Literals `"conway-automaton"`; liegt die
  Konstante dafür besser an einer gemeinsamen Stelle (Import ohne Zyklus), zieht sie dorthin und `src/credits/starter.ts` importiert
  sie. Ein Test in `test/starter-first-call.test.ts` oder einer neuen Datei legt einen SIWE-Schlüssel ohne Namen an und verlangt, dass
  sein Name `RUNTIME_KEY_NAME` ist (Testname enthält `default key name`).
- Rot vor dem Fix für den Job `e2e`: Der Maker zeigt einmal lokal mit `pnpm e2e` oder am Draft-PR, dass der Job mit
  `first_read_grants=0` endet, wenn `grantOnFirstRead` in einem Wegwerf-Commit nie gibt, und nennt das im Progress Log; der
  Wegwerf-Commit kommt nicht in den PR.
- Rollout mit dem nächsten fälligen Deploy (`src/**`), Live-Prüfung wie in `LOOP.md`.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [ ] Der Job `e2e` verlangt für die erste Wallet genau eine Ledger-Zeile `grant` mit `trigger` `first balance read`; in beide
      Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/e2e-ledger.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/one first read grant/,/no first read grant/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -cE '"\$first_read_grants" != "1"' harness/e2e/full.sh` muss 1 ausgeben.
      Prüfung: `grep -c 'first_read_grants=\$first_read_grants' harness/e2e/full.sh` muss 2 ausgeben.
      Prüfung: `grep -c 'harness/e2e/ledger.cjs' harness/e2e/full.sh` muss mindestens 1 ausgeben.
      Prüfung (Netz): `gh pr checks "$(gh pr list -R matthiashippe/control-plane --head goal/kunden-10 --state open --json number -q '.[0].number')" -R matthiashippe/control-plane --json name,bucket -q '.[] | select(.name=="e2e") | .bucket'` muss genau `pass` ausgeben.
- [ ] Ein Schlüssel ohne Namen heißt überall `RUNTIME_KEY_NAME`, kein Literal mehr.
      Prüfung: `cat src/auth/siwe.ts src/app.ts | grep -c '"conway-automaton"'` muss 0 ausgeben.
      Prüfung: `cat src/auth/siwe.ts src/app.ts | grep -c 'RUNTIME_KEY_NAME'` muss mindestens 2 ausgeben.
      Prüfung: `pnpm -s vitest run --reporter=json test/starter-first-call.test.ts test/auth.test.ts 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=j.testResults.flatMap(f=>f.assertionResults);console.log(r.every(a=>a.status==="passed")&&r.some(a=>/default key name/.test(a.title))?"alle":"fehlt")})'` muss `alle` ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor der Änderung rot, der Job `e2e` einmal mit `first_read_grants=0`; die Zeile im Progress Log nennt, womit.
- [ ] Die Ausgabe der Ledger-Abfrage trägt alle Felder von heute; die übrigen Bedingungen in `full.sh` sind unverändert.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `.env*`, `*.db`
- `harness/**` außer `harness/e2e/full.sh` und der neuen `harness/e2e/ledger.cjs`
- `src/**` außer `src/auth/siwe.ts`, `src/app.ts`, `src/credits/starter.ts` und, nur für die Konstante, einer neuen Datei unter `src/`
- `GRANT_MC`, Pool, Tageslimit und die Wege zur Gutschrift in `src/credits/starter.ts`: unverändert
- der Pin der Runtime (`harness/runtime/**`, `d8f8168`): unverändert
- `docs/kunden/**`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion außer dem Rollout über `deploy.yml`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Pause: Kurs-Check 2026-11-21, reine Testpflege für einen Pin-Wechsel, der nicht ansteht (Pin d8f8168 bleibt, die Gutschrift aus kunden 06 ist mit Tests belegt); vor ihm laufen kunden 08 und 09, die an zahlenden Kunden messen
