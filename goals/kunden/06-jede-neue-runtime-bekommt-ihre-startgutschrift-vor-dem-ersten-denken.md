# Kunden Goal 06: Jede neue Runtime bekommt ihre Startgutschrift vor dem ersten Denken

## Status
ACTIVE

## Active Objective
Von 9 neuen fremden Runtimes der vier Wochen bis 19.11.2026 bekamen 3 keine Startgutschrift, die größte Verluststufe im Trichter,
obwohl der Pool Platz für 71 Gutschriften hatte (`docs/kunden/trichter.md`, Abschnitt „Die Stufe mit dem größten Verlust“). Die
Gutschrift gibt es heute erst beim ersten Inferenz-Aufruf ohne Guthaben (`grantOnFirstUse` in `src/credits/starter.ts`, gerufen aus
`handleChat`) oder beim dritten Lesen eines leeren Saldos über mehr als eine Minute (`grantToWaitingRuntime`, gerufen aus
`GET /v1/credits/balance` in `src/app.ts`); die drei Runtimes gingen, bevor einer der beiden Auslöser griff. Nach diesem Goal ist
zuerst gemessen, welche Anfragen neue Runtimes ohne Gutschrift nach dem Anlegen ihres Schlüssels stellten, und gegen den Start der
Runtime am Pin `d8f8168` gelegt; danach gibt der Dienst die Gutschrift auf genau dem Aufruf, den die Runtime vor ihrem ersten Denken
macht, einmal je Adresse, nie für eigene Läufe.
Leitzahl: Anteil neuer Runtimes mit Startgutschrift im Block `runtime_funnel` von `ops/status.sh` (6 von 9 bis 19.11.2026).
Widerlegt, wenn die Runtimes ohne Gutschrift nach dem Anlegen ihres Schlüssels keine Anfrage mehr stellten; dann steht das im
Dokument, der Auslöser bleibt, und die Punkte 3 und 4 fallen weg (Zeile `Ergebnis: kein Aufruf nach dem Schlüssel`).
MVP: Funktion, weil eine Runtime ohne Gutschrift nie denkt und damit nie zahlt.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Eine neue fremde Runtime, die zu uns wechselt, kann sofort denken, statt zu gehen, bevor sie die Gutschrift sieht.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 06; Loop-Triage 20.11.2026 (PRO-25822, PRO-25825). Übernimmt
  `goals/_vorschlaege/kunden-trichter-2026-11-19-1.md`.
- Messung, nur lesend (Datenbank mit `readonly: true` über `ops/db-report.cjs` im Container `cp` wie in kunden 01 und 03, Zugriffslog
  über `ops/access-log.sh`). Werkzeug `ops/starter-paths.sh` (Bash mit eingebettetem Node oder Python wie `ops/customer-decline.sh`):
  - Datenbankteil: `CP_REPORT=starter-paths` in `ops/db-report.cjs` gibt je neuer fremder Runtime im Fenster (`CP_SINCE`, `CP_UNTIL`;
    erster Schlüssel `conway-automaton` einer Adresse, die `oursClause` nicht als eigene führt, wie `runtime_funnel`) nur
    `{n, key_at, granted}` aus, ohne Adresse und ohne Schlüssel; ohne `CP_REPORT` bleibt der Bericht Byte für Byte wie heute.
  - Zuordnung zum Log: die Logzeile `POST /v1/auth/verify` oder `POST /v1/auth/api-keys` mit Status 200 oder 201 von einer fremden
    Adresse, deren `ts` `key_at` am nächsten liegt, höchstens 5 s entfernt; deren Adresse gehört zur Runtime. Eigene Adressen über
    `ops/own-ips.sh` werden nie zugeordnet.
  - Ausgabe, Englisch: `STARTER since <t> until <u>: <k> new runtimes, <g> granted`; je Runtime
    `RUNTIME <n>: key <ISO>, granted yes|no, ips <m>`; je Runtime ohne Gutschrift und je Pfad in den 24 Stunden nach `key_at`
    `PATH <n> <METHOD> <pfad>: <zahl>`, Pfad ohne Query, jedes Segment mit einer Adresse ersetzt durch `:address`; zuletzt
    `UNMATCHED: <x> runtimes without a log line within 5 s`. Keine Adresse, kein Schlüssel in der Ausgabe.
  - `--db-json <datei>`, `--log <datei>`, `--selftest` ohne Netz in beide Richtungen (Zeilen `ok … ours`, `ok … path`,
    `ok … unmatched`), Fixtures nur mit Adressen aus RFC 5737 unter `ops/fixtures/starter-paths-*`; kein lesbares Log oder JSON
    ist Exit 2, eine Zeit, die keine ISO-Zeit in UTC ist, Exit 1.
- Start der Runtime am Pin (Klon wie in kunden 05): was `src/index.ts` und `src/identity/provision.ts` nach der Anmeldung vor dem
  ersten Aufruf von `/v1/chat/completions` rufen, mit Fundstelle `src/<pfad>.ts:<zeile>`; nach dem Code ist es
  `conway.getCreditsBalance()` vor `bootstrapTopup` in `src/index.ts`, also `GET /v1/credits/balance`. Das Dokument legt Messung und
  Code nebeneinander.
- `docs/kunden/startgutschrift.md`, Deutsch: `Gemessen: <ISO UTC>`, der Befehl und die volle Ausgabe als Codeblock, je Fundstelle
  `- Runtime: src/<pfad>.ts:<zeile> am Pin d8f8168, <was sie ruft>`, `Erster Aufruf vor dem ersten Denken: <METHOD> <pfad>` und genau
  eine Zeile `Ergebnis: Auslöser <METHOD> <pfad>, weil <Beleg>` oder `Ergebnis: kein Aufruf nach dem Schlüssel, weil <Beleg>`.
- Der neue Auslöser (nur bei `Ergebnis: Auslöser`): Auf dem Aufruf aus `Ergebnis:` bekommt eine Adresse mit Saldo 0, deren Schlüssel
  `conway-automaton` heißt und die über SIWE angelegt wurde (nicht über die schlüssellose Anmeldung), die Gutschrift über
  `grantOnFirstUse`, einmal je Adresse, mit Tageslimit und Pool wie heute, nie bei geschlossener Aufnahme (`intakeClosed`). Nie für
  eine eigene Adresse: `ourAddresses` aus `src/bounties/ours.ts` (Liste `OURS` und Schlüssel aus `OUR_KEY_NAMES`). Ist der Aufruf
  `GET /v1/credits/balance`, bleibt `balance_cents` Name, Typ und Platz, und die Antwort trägt wie heute `granted_cents` und `hint`.
  Die beiden bisherigen Auslöser bleiben.
- Schutz des Pools: Wie viele Gutschriften der neue Auslöser in den 14 Tagen vor der Messung eigenen Läufen gegeben hätte (Adressen,
  die nur von Adressen aus `ops/own-ips.txt` kamen, aber nicht in `OURS` stehen), zählt das Werkzeug mit `--own-check` als Zeile
  `OWN WOULD GRANT: <n>`; das Dokument trägt genau eine Zeile `Schutz des Pools: <n> eigene Läufe hätten gezogen`. Ist `<n>` größer
  als 0, legt das Goal diese Läufe vor dem Rollout auf einen Schlüsselnamen aus `OUR_KEY_NAMES` oder eine Adresse aus `OURS`, und das
  Dokument nennt je Lauf eine Zeile `- Umgestellt: <pfad>`.
- Test `test/starter-first-call.test.ts` gegen `createApp` mit `openDb` wie die bestehenden Tests der Startgutschrift: eine fremde
  Adresse mit SIWE-Schlüssel `conway-automaton` und Saldo 0 bekommt auf dem ersten Aufruf genau eine Ledger-Zeile der Gutschrift
  (Testname enthält `grants on the first call`), beim zweiten keine zweite (`grants once`), eine Adresse aus `OURS` und ein Schlüssel
  aus `OUR_KEY_NAMES` bekommen keine (`never grants ours`), bei geschlossener Aufnahme und leerem Pool keine (`intake closed`,
  `empty pool`), ein Schlüssel der schlüssellosen Anmeldung keine (`keyless`). Rot vor dem Fix; die Zeile im Progress Log nennt, womit.
- Rollout mit dem nächsten fälligen Deploy (`src/**`), Live-Prüfung wie in `LOOP.md`. Die Leitzahl misst der nächste Lauf von
  `ops/status.sh` nach einer Woche; das ist nicht Teil dieses Goals.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 06: …`, mindestens zur Zuordnung über den Anmelde-Aufruf und zur Grenze
  zwischen SIWE und schlüsselloser Anmeldung.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem Server.

## Done Condition
- [x] `ops/starter-paths.sh` zählt je neuer Runtime ohne Gutschrift ihre Anfragen nach dem Anlegen des Schlüssels je Pfad, nie eine
      eigene Adresse, und nennt keine Adresse; in beide Richtungen bewiesen.
      Prüfung: `bash ops/starter-paths.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/starter-paths.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/starter-paths.sh --selftest | grep -cE "^ok .*path"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/starter-paths.sh --selftest | grep -cE "^ok .*unmatched"` muss mindestens 1 ausgeben.
      Prüfung: `cat ops/fixtures/starter-paths-* | grep -oE '"(remote_ip|client_ip)": ?"[^"]*"' | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `bash ops/starter-paths.sh --selftest | grep -cE "0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts` muss Exit-Code 0 haben.
- [x] Welche Anfragen die neuen Runtimes ohne Gutschrift stellten und was die Runtime am Pin vor dem ersten Denken ruft, steht gemessen
      in `docs/kunden/startgutschrift.md`, ohne Adresse.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-20T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/startgutschrift.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cE "^STARTER since .*: [0-9]+ new runtimes, [0-9]+ granted$" docs/kunden/startgutschrift.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^- Runtime: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+ am Pin d8f8168, " docs/kunden/startgutschrift.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE "^Ergebnis: (Auslöser (GET|POST) /[^ ]+, weil |kein Aufruf nach dem Schlüssel, weil )" docs/kunden/startgutschrift.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Schutz des Pools: [0-9]+ eigene Läufe hätten gezogen$" docs/kunden/startgutschrift.md` muss 1 ausgeben.
      Prüfung: `cat docs/kunden/startgutschrift.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 06: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung (Netz): `d=$(mktemp -d); git clone -q https://github.com/Conway-Research/automaton "$d" && git -C "$d" checkout -q d8f8168 && grep -oE "^- Runtime: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+" docs/kunden/startgutschrift.md | sed 's/^- Runtime: //' | while IFS=: read -r p n; do sed -n "${n}p" "$d/$p" | grep -qiE "balance|credit|topup|provision|fetch|request|/v1/" || echo "falsch $p:$n"; done` muss nichts ausgeben.
- [x] Eine neue fremde Runtime bekommt die Gutschrift auf dem Aufruf aus `Ergebnis:`, einmal, nie eine eigene Adresse, nie bei
      geschlossener Aufnahme, leerem Pool oder schlüsselloser Anmeldung; in beide Richtungen bewiesen.
      Prüfung: `grep -q "^Ergebnis: kein Aufruf nach dem Schlüssel" docs/kunden/startgutschrift.md && echo entfaellt || pnpm -s vitest run test/starter-first-call.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/grants on the first call/,/grants once/,/never grants ours/,/intake closed/,/empty pool/,/keyless/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` oder `entfaellt` ausgeben.
      Prüfung: `pnpm -s vitest run test/starter.test.ts test/starter-waiting.test.ts` muss Exit-Code 0 haben.
- [x] Eigene Läufe ziehen aus dem neuen Auslöser keine Gutschrift.
      Prüfung: `d=docs/kunden/startgutschrift.md; grep -q "^Ergebnis: kein Aufruf nach dem Schlüssel" "$d" && echo entfaellt || { n=$(sed -nE 's/^Schutz des Pools: ([0-9]+) eigene Läufe hätten gezogen$/\1/p' "$d"); [ -n "$n" ] && { [ "$n" = 0 ] || [ "$(grep -c '^- Umgestellt: ' "$d")" -ge 1 ]; } && echo geschuetzt || echo offen; }` muss `geschuetzt` oder `entfaellt` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor der Änderung rot; die Zeile im Progress Log nennt, womit.
- [ ] `GET /v1/credits/balance` behält `balance_cents` mit Name, Typ und Platz; die bestehenden Tests der Startgutschrift bleiben grün.
- [ ] Ohne `CP_REPORT` gibt `ops/db-report.cjs` dasselbe aus wie auf `origin/dev`.
- [ ] Code, Kommentare und Testnamen Englisch, Dokument, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**` außer `src/credits/starter.ts`, `src/app.ts` und, nur wenn der Aufruf aus `Ergebnis:` dort liegt, der Datei seiner Route
- `src/bounties/ours.ts`: nur ein neuer Schlüsselname in `OUR_KEY_NAMES`, wenn der Schutz des Pools ihn verlangt
- `ops/db-report.cjs`: nur der neue Zweig für `CP_REPORT=starter-paths`; `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`,
  `ops/own-ips.txt`: unverändert
- `GRANT_MC`, Pool und Tageslimit in `src/credits/starter.ts`: unverändert
- `docs/kunden/trichter.md`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion außer dem Rollout über `deploy.yml`, jeder Kontakt zum Betreiber eines Automatons
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-20 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `ops/starter-paths.sh` mit Zweig `CP_REPORT=starter-paths` in `ops/db-report.cjs` (Selftest in beide Richtungen, Test `test/starter-paths-report.test.ts` rot gegen `ops/db-report.cjs` von `origin/dev` mit 3 von 5); Messung 20.11. 07:58 UTC: 9 neue Runtimes, 6 mit Gutschrift, Runtime 9 las nach dem Schlüssel einmal `GET /v1/credits/balance` und ging, Runtime 1 rief nichts mehr, Runtime 5 teilt ihre Adresse mit einer anderen Wallet; Ergebnis Auslöser `GET /v1/credits/balance` (`src/index.ts:349` und `src/agent/loop.ts:956` am Pin), Schutz des Pools 0; `grantOnFirstRead` in `src/credits/starter.ts`, gerufen aus `src/app.ts`; `test/starter-first-call.test.ts` rot vor dem Fix (7 von 8, keine Gutschrift auf dem ersten Lesen), jeder Schutz einzeln als Mutation rot (ohne Prüfung auf schlüssellose Adresse, eigene Adresse, Schlüsselname, geschlossene Aufnahme je ein Test); `test/auth.test.ts` und `test/the-board-where-it-looks.test.ts` auf das neue Ende der SIWE-Strecke umgestellt (ANNAHMEN.md). Prüfbefehle: P1 `SELFTEST OK`, 7, 3, 4, 0, 0, vitest Exit 0; P2 `spaet genug`, 1, 5, 1, 1, 0, 4, Netz leer; P3 `alle`, vitest Exit 0; P4 `geschuetzt`; P5 `check` Exit 0 (grün in 263 s).
- 2026-11-20 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5; `dev` `c04233f` (PR #318, Saldo-Prüfung des Jobs `e2e` gegen `credited_mc`) in den Goal-Branch gemergt, Job `e2e` am Kopf `5aeb7d6` grün (`E2E OK … balance_cents=505 balance_mc=505609 credited_mc=516000 …`). Prüfbefehle: P1 `SELFTEST OK`, 7, 3, 4, 0, 0, vitest Exit 0; P2 `spaet genug`, 1, 5, 1, 1, 0, 5, Netz leer; P3 `alle`, vitest Exit 0; P4 `geschuetzt`; P5 `check` Exit 0 (236 Dateien, 2492 Tests).

## Blockers
