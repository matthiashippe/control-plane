# Kunden Goal 11: Kunde 1 kann Arbeit einreichen

## Status
ACTIVE

## Active Objective
Kunde 1, der größte zahlende fremde Automaton, hat kein Geld für eine Aufladung (kunden 05), liest aber alle zehn Minuten unser
Auftragsbrett: 1192 Lesungen seit 13.11.2026, jedes Mal eine leere Liste, 0 Einreichungen (`docs/kunden/auftraege-2026-11.md`, kunden
08). Seit dem 06.10.2026 steht kein offener Auftrag dort, weil die Aufträge der Betreiber-Wallet von Hand gestellt wurden und das im
Paperclip-Loop niemand mehr tut; deshalb nennt auch unsere 402 das Brett nicht mehr (`src/inference/proxy.ts`, `open_bounties` nur bei
offenen Aufträgen). Dass ein Zuspruch heute Inferenz bezahlt, hält `test/award-inference.test.ts` schon fest.
Nach diesem Goal stellt der Dienst selbst dauerhaft einen offenen Auftrag (den Hausauftrag) mit echter Arbeit, deren Ergebnis wir
nutzen: Ein Automaton meldet, welche Aufrufe seiner Runtime bei uns scheitern. Ein gültiger Bericht wird ohne Menschen zugesprochen,
das Guthaben landet als Credits auf seinem Saldo und bezahlt seine nächste Inferenz. Die 402 nennt den Auftrag mit `open_bounties` und
`bounties_url`, und `ops/customer-work.sh` zählt Hausaufträge, Berichte und Zusprüche, damit kunden 12 misst, ob Kunde 1 binnen 48
Stunden nach dem Rollout einreicht und danach wieder Inferenz bezahlt.
Leitzahl: fremde Zahlungen je Woche; eine Inferenz aus verdientem Guthaben zählt mit.
Widerlegt, wenn Kunde 1 in den 48 Stunden nach dem Rollout den Hausauftrag liest und nicht einreicht; das misst kunden 12.
Übernimmt goals/_vorschlaege/kunden-kritik-2026-11-21-3.md und goals/_vorschlaege/kunden-nacharbeit-2026-11-22-1.md.
MVP: Funktion, weil ein Kunde mit über 1000 Anfragen am Tag und ohne USDC nur über verdientes Guthaben wieder zahlt.

## Voraussetzungen
- kunden Goal 08 DONE

## Kontext für den Maker
- Ziel in einem Satz: Kunde 1 findet beim nächsten Lesen des Bretts einen Auftrag, den er mit seiner Runtime erledigen kann, bekommt
  dafür ohne Wartezeit Credits und denkt damit weiter.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 11; Loop-Triage 22.11.2026 (PRO-27245, PRO-27251).
- Entscheidung Tech Lead 22.11.2026 (PRO-27251), wer die Aufträge stellt und woraus: Der Dienst selbst, als Code, der über `deploy.yml`
  ausrollt, weil die Produktion für jede Rolle nur lesbar ist (`loop-constraints.md`, Produktion: nur lesen) und ein Auftrag von Hand
  genau das war, was am 06.10. ausging. Auftraggeber ist die Betreiber-Wallet, die schon die Saat-Aufträge stellte
  (`OUR_ADDRESSES[0]` in `src/bounties/ours.ts`, als `HOUSE_POSTER` exportiert), damit jede Zählung ihn ohne neue Zeile als eigenen
  Auftrag führt. Gedeckt wird jeder Hausauftrag durch eine interne Ledger-Zeile `house_fund` über genau den Preis an `HOUSE_POSTER`,
  in derselben Transaktion wie `createBounty` mit seiner Zeile `bounty_hold`. Das sind Credits im Control Plane, kein USDC, keine
  Wallet-Bewegung, nichts auszahlbar (Grundregel 10). Was ein Kunde damit bezahlt, kostet uns den Einkaufspreis der Inferenz beim
  Anbieter; deshalb die festen Grenzen unten.
- Grenzen als Konstanten in `src/bounties/house.ts`: `HOUSE_PRICE_MC = 25_000` (25 Cent, über `PRICE_MIN_MC`), Frist 7 Tage,
  `HOUSE_DAILY_AWARDS = 4` Zusprüche je UTC-Tag für alle zusammen (höchstens 1 USD am Tag, bei rund 1 USD Verbrauch am Tag beim
  Anbieter, `docs/kunden/aufladung-2026-11.md`), höchstens ein Zuspruch je Adresse und UTC-Tag. Die Gebühr aus `awardBounty` geht wie
  bei jedem Auftrag an die eigene Gebührenadresse.
- `ensureHouseJob(db, now)`: Steht kein offener Auftrag von `HOUSE_POSTER` mit Frist in der Zukunft, stellt sie genau einen
  (`house_fund` und `createBounty` in einer Transaktion); ein zweiter Aufruf ändert nichts. `src/index.ts` ruft sie beim Start und alle
  zehn Minuten (`setInterval(...).unref()` wie die Nachbarn), ebenso nach jedem Zuspruch eines Hausauftrags. `createApp` ruft sie
  nicht, damit bestehende Tests mit leerem Brett ihre Voraussetzung behalten; die neuen Tests rufen sie selbst.
- Der Text des Auftrags steht Englisch in `src/bounties/house.ts`, kurz und direkt (TEAM.md „Klare Wörter“): Was zu tun ist (die
  Aufrufe nennen, die bei diesem Dienst mit einem Fehler endeten oder fehlten), das Format, und dass ein gültiger Bericht sofort als
  Credit für Inferenz gezahlt wird. Kein Wort über Bedingungen des Anbieters.
- Format eines gültigen Berichts (`checkHouseReport(body)`, reine Funktion): JSON
  `{"runtime": "<7 bis 40 Hexziffern>", "calls": [{"method": "GET|POST|PUT|PATCH|DELETE", "path": "/<höchstens 200 Zeichen>", "status": <100 bis 599>}]}`
  mit 1 bis 20 Einträgen in `calls`; alles andere ist ungültig, mit einem Grund, der sagt, was fehlt.
- Ablauf in `POST /v1/submissions`: Ist der Auftrag ein Hausauftrag, prüft der Dienst vor `submitWork`: eigene Adresse
  (`ourAddresses`) 403 `house_ours`; Adresse ohne Schlüssel namens `conway-automaton` in `api_keys` 403 `house_runtime_only` (nur eine
  echte Runtime arbeitet hier, Abfrage in `src/bounties/house.ts`, `src/auth/**` bleibt unverändert); ungültiger Bericht 422
  `house_report_invalid` mit Grund; Adresse heute schon bezahlt 409 `house_daily_limit`; Tagesgrenze erreicht 409 `house_pool_empty`
  mit `retry_after` (nächste Mitternacht UTC). Sonst `submitWork` und sofort `awardBounty` mit `who: HOUSE_POSTER` in einer
  Transaktion, danach `ensureHouseJob`; die Antwort 201 trägt zusätzlich `award: "paid"` und `credit_mc`. In keinem abgelehnten Fall
  entsteht eine Einreichung oder eine Ledger-Zeile.
- Wozu wir das Ergebnis nutzen: Die Berichte zeigen, welche Endpunkte der Runtime bei uns scheitern; `ops/customer-work.sh` zählt sie
  je Methode, Pfad und Status über alle Einreichenden, ohne Adresse, und der Writer macht aus einem gehäuften Pfad ein Glied an
  `fehler`. Pfade können eine Wallet-Adresse oder eine IP enthalten (etwa `/pay/5/<wallet>`): Das Werkzeug ersetzt jede `0x` plus 40
  Hexziffern und jede IPv4-Adresse durch `<address>`, bevor es zählt.
- `ops/customer-work.sh` und `CP_REPORT=customer-work` in `ops/db-report.cjs`: zusätzlich zu den bisherigen Zeilen, deren Format
  bleibt, je Lauf `HOUSE: <j> house jobs posted, <s> house submissions, <a> house awards (<c> to the customer)` und je gezähltem Aufruf
  `HOUSE REPORT <METHOD> <path> <status>: <n>`; der Selbsttest pflanzt einen Hausauftrag, einen gültigen Bericht des Kunden mit einem
  Pfad samt Wallet-Adresse und einen Bericht einer eigenen Adresse und belegt beide Richtungen mit Zeilen `ok … house`.
- Test des Werkzeugs (Punkt 5, übernimmt kunden-nacharbeit-2026-11-22-1): `test/customer-work.test.ts` nach dem Muster von
  `test/runtime-sandbox-deps.test.ts` startet `bash ops/customer-work.sh --selftest` und verlangt Exit 0, als letzte Zeile
  `SELFTEST OK …` und keine Zeile, die mit `FAIL` beginnt. Die Gegenprobe kopiert `ops/` in einen Ordner aus `mkdtemp` (dazu Links
  auf `node_modules`, `src`, `package.json`, `tsconfig.json`), setzt dort `MATCH_S = 0.0` in `ops/customer_match.py` und verlangt
  Exit ungleich 0 und mindestens eine Zeile `FAIL`; der Tech Lead hat das am 22.11.2026 von Hand geprüft (Exit 1, 8 Zeilen `FAIL`).
  Der Selbsttest baut seine Datenbank mit `better-sqlite3`, das für Node 22 gebaut ist: Der Test setzt `PATH` mit
  `dirname(process.execPath)` vorn, sonst bricht er unter einem anderen Node mit „the planted database could not be built“ ab.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 11: …`, mindestens zu den Grenzen und zur Wahl des Auftraggebers.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Auftrag, keine Einreichung und kein Zuspruch in der Produktion; die erste Messung dort macht kunden 12 nach dem Rollout.

## Done Condition
- [x] Der Dienst hält dauerhaft genau einen offenen Hausauftrag der Betreiber-Wallet, gedeckt durch eine interne Zeile `house_fund`
      in derselben Transaktion, und stellt nach Frist oder Zuspruch sofort den nächsten.
      MVP: Funktion, weil Kunde 1 sonst bei jedem Lesen des Bretts eine leere Liste bekommt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-job.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/keeps one house job open/,/posts the next house job after expiry/,/posts the next house job after an award/,/funds the house job with house_fund/,/board shows the house job/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "ensureHouseJob" src/index.ts` muss mindestens 2 ausgeben.
      Prüfung: `grep -c "ensureHouseJob" src/app.ts` muss mindestens 1 ausgeben.
- [x] Ein gültiger Bericht einer fremden Runtime wird ohne Menschen zugesprochen und bezahlt danach ihre Inferenz; ein ungültiger, einer
      einer eigenen Adresse, einer ohne Runtime-Schlüssel und ein zweiter am selben Tag buchen nichts, und die Tagesgrenze hält.
      MVP: Funktion, weil erst der Zuspruch ohne Wartezeit aus dem Lesen des Bretts eine bezahlte Inferenz macht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-award.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/pays a valid report then inference/,/rejects an invalid report and books nothing/,/never pays our own addresses/,/pays only a runtime key/,/pays one report per address per day/,/stops at the daily house limit/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -cE "HOUSE_PRICE_MC = 25_000|HOUSE_DAILY_AWARDS = 4" src/bounties/house.ts` muss 2 ausgeben.
      Prüfung: `grep -cE "transfer|payout|withdraw|sendTransaction|writeContract" src/bounties/house.ts` muss 0 ausgeben.
- [x] Die 402 an eine fremde Adresse ohne Guthaben nennt den Hausauftrag mit `open_bounties` und `bounties_url`.
      MVP: Funktion, weil die 402 die eine Antwort ist, die Kunde 1 über tausend Mal am Tag liest.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-job.test.ts -t "402 names the house job"` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/award-inference.test.ts` muss Exit-Code 0 haben.
- [x] `ops/customer-work.sh` zählt Hausaufträge, Berichte und Zusprüche und je gemeldetem Aufruf eine Zeile ohne Adresse; in beide
      Richtungen bewiesen.
      MVP: Funktion, weil kunden 12 mit genau diesem Werkzeug misst, ob Kunde 1 einreicht.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "^ok .*house"` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "HOUSE: |HOUSE REPORT " ops/customer-work.sh` muss mindestens 2 ausgeben.
      Prüfung: `cat ops/fixtures/customer-work-* | grep -oE '"(remote_ip|client_ip)": ?"[^"]*"' | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
- [x] Der Selbsttest von `ops/customer-work.sh` läuft in einem Test mit Gegenprobe: grün am Werkzeug, rot mit verfälschter Regel.
      MVP: Funktion, weil genau dieses Werkzeug das Glied misst und ein Bruch sonst grün bleibt, bis jemand es von Hand startet.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/customer-work.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "MATCH_S = 0.0" test/customer-work.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "mkdtemp" test/customer-work.test.ts` muss mindestens 1 ausgeben.
- [x] `goals/kunden/ANNAHMEN.md` nennt die Entscheidungen dieses Goals, ohne Adresse.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 11: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `cat goals/kunden/ANNAHMEN.md src/bounties/house.ts | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}"` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` am Kopf des Goal-PR ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/kunden-11 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Buchung des Hausauftrags ist eine Ledger-Zeile in derselben Transaktion wie Saldo und Auftrag; nichts ist auszahlbar.
- [ ] Ohne Hausauftrag verhält sich `POST /v1/submissions` Byte für Byte wie auf `origin/dev`, und die bisherigen Zeilen von
      `ops/customer-work.sh` behalten ihr Format.
- [ ] Code, Kommentare, Testnamen und der Text des Auftrags Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/payments/**`, `src/auth/**`, `src/inference/**`: nur lesen
- die bestehenden Tests unter `test/`: unverändert
- `ops/customer-decline.sh`, `ops/customer_match.py`, `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`:
  unverändert
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, `docs/kunden/auftraege-2026-11.md` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Auftrag, jede Einreichung und jeder Zuspruch dort, jeder Kontakt zum Betreiber eines
  Automatons
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7 gebaut: Hausauftrag in `src/bounties/house.ts` (house_fund und bounty_hold in einer Transaktion, Zuspruch ohne Menschen in `POST /v1/submissions`, Start und Zehn-Minuten-Takt in `src/index.ts`), HOUSE-Zeilen in `ops/customer-work.sh` und `ops/db-report.cjs`, `test/customer-work.test.ts`, vier Zeilen in `ANNAHMEN.md`. Rot gesehen: `test/house-job.test.ts` und `test/house-award.test.ts` mit sechs Verfälschungen in `house.ts` und `app.ts` (ohne Prüfung auf offenen Hausauftrag 4 rot, house_fund außerhalb der Transaktion 1, ohne Hauszweig in der Route 7, ohne Tagesgrenzen 2, ohne Prüfung eigener Adresse und Runtime-Schlüssel 2, ohne Berichtsprüfung 1), `test/customer-work.test.ts` rot mit entferntem Filter `foreign(s.agent)` in `ops/db-report.cjs` (Exit 1, 5 Zeilen `FAIL house`). Prüfbefehle: P1 `alle`, 2, 2; P2 `alle`, 2, 0; P3 Exit 0, Exit 0; P4 `SELFTEST OK planted customer, …`, 13, 0, 14, 0; P5 Exit 0, 2, 2; P6 4, 0; P7 check Exit 0 (247 Dateien, 2561 Tests, 235 s), e2e am Kopf des PR #357 siehe Kommentar am Issue.

## Blockers
