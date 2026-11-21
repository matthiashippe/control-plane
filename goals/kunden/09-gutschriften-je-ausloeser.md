# Kunden Goal 09: Gutschriften je Auslöser

## Status
PLANNED

## Active Objective
Seit kunden 06 gibt der Dienst die Startgutschrift auf drei Wegen: beim ersten Lesen eines leeren Saldos (`grantOnFirstRead`, schreibt
`trigger: "first balance read"` in die Ledger-Zeile), beim ersten Denken ohne Guthaben (`grantOnFirstUse`, gerufen aus `handleChat` in
`src/inference/proxy.ts`) und nach dem dritten Lesen über mehr als eine Minute (`grantToWaitingRuntime`). Die beiden alten Wege buchen
ohne `trigger`, und der Block `runtime_funnel` in `ops/db-report.cjs` zählt nur, ob eine Runtime eine Gutschrift bekam, nicht auf
welchem Weg. Nach einer Woche zeigt die Leitzahl dann, ob mehr Runtimes eine Gutschrift bekommen, aber nicht, ob der neue Auslöser das
bewirkt oder nur die Gutschrift vorzieht, die die Runtime beim ersten Denken ohnehin bekommen hätte. Nach diesem Goal schreibt jeder Weg
seinen Auslöser, und `runtime_funnel` zählt je Woche die Gutschriften je Auslöser.
Leitzahl: Anteil neuer Runtimes mit Startgutschrift (6 von 9 bis 19.11.2026), dazu je Woche die Gutschriften mit
`first balance read`.
Widerlegt, wenn die Ledger-Zeilen der Gutschrift schon heute auf allen Wegen einen Auslöser tragen.
MVP: Funktion, weil der Loop sonst eine Woche nach kunden 06 nicht sagen kann, ob dessen Auslöser Runtimes hält, die vorher gingen.

## Voraussetzungen
- kunden Goal 08 DONE

## Kontext für den Maker
- Ziel: Eine Woche nach dem Rollout liest der Loop aus `ops/status.sh`, auf welchem Weg neue Runtimes ihre Startgutschrift bekamen, und
  weiß damit, ob der Auslöser aus kunden 06 Runtimes hält, die vorher ohne Gutschrift gingen.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 09; Loop-Triage 21.11.2026 (PRO-26350, PRO-26356). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-20-4.md`.
- Auslöser, englisch, als Feld `trigger` im `meta` der Ledger-Zeile `grant`: `grantOnFirstUse` aus `handleChat` schreibt
  `"first use"`, `grantToWaitingRuntime` schreibt `"kept asking"`, `grantOnFirstRead` bleibt bei `"first balance read"`. Die Gutschrift
  hinter einem Auftrag (`grantOnFirstUse` mit `{ for_bounty }` in `src/bounties/store.ts`) und die Gutschrift über
  `POST /v1/credits/starter` bleiben, wie sie sind; ohne Auslöser zählen sie als `unknown`. Betrag, Pool, Tageslimit und Reihenfolge der
  Wege bleiben unverändert.
- `runtime_funnel` in `ops/db-report.cjs`: Jede Woche bekommt das Feld `grants_by_trigger`, ein Objekt mit genau den Schlüsseln
  `first balance read`, `first use`, `kept asking` und `unknown`, gezählt über die erste Ledger-Zeile `grant` jeder Runtime der Woche
  (Kohorte wie heute, eigene Adressen nie); `total` bekommt dasselbe Feld als Summe der vier Wochen. Eine Zeile ohne `meta`, mit
  unlesbarem `meta` oder ohne `trigger` zählt als `unknown`, ein unbekannter Wert ebenfalls. Alle bestehenden Felder bleiben mit Name,
  Wert und Reihenfolge, damit `test/runtime-funnel.test.ts` unverändert grün bleibt.
- Tests, rot vor der Änderung (die Zeile im Progress Log nennt, womit):
  - `test/starter-trigger.test.ts` gegen `createApp` mit `openDb` wie `test/starter-waiting.test.ts`: die Gutschrift beim ersten Denken
    trägt `trigger` `first use` (Testname enthält `first use`), die nach dem dritten Lesen `kept asking` (Testname enthält
    `kept asking`), die beim ersten Lesen weiter `first balance read` (Testname enthält `first balance read`).
  - ein neuer Fall in `test/runtime-funnel.test.ts`: drei Runtimes einer Woche mit je einem Auslöser und eine vierte, deren Zeile
    `grant` kein `meta` hat, ergeben `grants_by_trigger` mit je 1 (Testname enthält `counts grants by trigger`); eine eigene Adresse mit Auslöser
    zählt nirgends (Testname enthält `never counts ours by trigger`).
- Rollout mit dem nächsten fälligen Deploy (`src/**`), Live-Prüfung wie in `LOOP.md`. Die Zahlen nach einer Woche misst der nächste Lauf
  von `ops/status.sh`; das ist nicht Teil dieses Goals.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 09: …`, mindestens zu `unknown` für alte Zeilen und die Gutschrift hinter einem
  Auftrag.
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem
  Server.

## Done Condition
- [ ] Jeder Weg zur Startgutschrift schreibt seinen Auslöser in die Ledger-Zeile; in beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/starter-trigger.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/first use/,/kept asking/,/first balance read/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `cat src/credits/starter.ts src/inference/proxy.ts | grep -cE 'trigger: "(first use|kept asking|first balance read)"'` muss mindestens 3 ausgeben.
      Prüfung: `pnpm -s vitest run test/starter.test.ts test/starter-waiting.test.ts test/starter-first-call.test.ts` muss Exit-Code 0 haben.
- [ ] `runtime_funnel` zählt je Woche die Gutschriften je Auslöser, alte Zeilen als `unknown`, nie eine eigene Adresse.
      Prüfung: `pnpm -s vitest run test/runtime-funnel.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const r=j.testResults.flatMap(f=>f.assertionResults);const t=r.filter(a=>a.status==="passed").map(a=>a.title);console.log(r.every(a=>a.status==="passed")&&[/counts grants by trigger/,/never counts ours by trigger/].every(x=>t.some(y=>x.test(y)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "grants_by_trigger" ops/db-report.cjs` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 09: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor der Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] Betrag, Pool, Tageslimit und Reihenfolge der Wege zur Gutschrift sind unverändert; die bestehenden Tests der Startgutschrift
      bleiben grün.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**` außer `src/credits/starter.ts` und `src/inference/proxy.ts`
- `GRANT_MC`, Pool und Tageslimit in `src/credits/starter.ts`: unverändert
- `ops/db-report.cjs`: nur der Block `runtime_funnel`; `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`:
  unverändert
- bestehende Fälle in `test/runtime-funnel.test.ts`, `test/starter*.test.ts`: unverändert, nur neue Fälle
- `docs/kunden/**`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion außer dem Rollout über `deploy.yml`, jeder Kontakt zum Betreiber eines Automatons
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
