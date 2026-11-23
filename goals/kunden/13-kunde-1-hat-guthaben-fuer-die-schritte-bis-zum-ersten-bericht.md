# Kunden Goal 13: Kunde 1 hat Guthaben für die Schritte bis zum ersten Bericht

## Status
PLANNED

## Active Objective
Seit kunden 11 stellt der Dienst dauerhaft einen offenen Hausauftrag und zahlt einen gültigen Bericht sofort als Credit. Kunde 1, der
größte zahlende fremde Automaton, kann ihn trotzdem nicht bearbeiten: Seit dem 13.11.2026 endet jede seiner Inferenzen mit 402 (11260
Mal bis 20.11., `docs/kunden/aufladung-2026-11.md`), seine Lesungen des Bretts laufen im festen Zehn-Minuten-Takt aus einem Zeitplan
seines Betreibers weiter, nicht aus dem Modell, und den Bericht müsste das Modell schreiben. Die Startgutschrift gibt ihm nichts mehr
(`grantOnFirstUse` in `src/inference/proxy.ts` endet für ihn bei jedem Aufruf ohne Gutschrift), und `grantToWaitingRuntime` gibt nur
einmal je Adresse und über denselben Pool.
Nach diesem Goal bekommt eine fremde Runtime, die schon einmal bei uns gedacht hat und deren Saldo die nächste Inferenz nicht deckt,
einmal je Adresse ein kleines internes Guthaben für die Schritte bis zum ersten Bericht, solange ein Hausauftrag offen ist, und die
nächste Inferenz endet mit 200 statt 402. `ops/customer-work.sh` zählt diese Schrittguthaben und je Tag die Zusprüche an Adressen
ohne frühere Inferenz, damit kunden 14 misst, ob Kunde 1 damit denkt, einreicht und danach wieder zahlt.
Leitzahl: fremde Zahlungen je Woche; eine Inferenz aus verdientem Guthaben zählt mit.
Widerlegt, wenn die nächste Inferenz von Kunde 1 nach dem Rollout weiter mit 402 endet; das misst kunden 14.
Übernimmt goals/_vorschlaege/kunden-kritik-2026-11-22-1.md, goals/_vorschlaege/kunden-kritik-2026-11-22-3.md und
goals/_vorschlaege/kunden-kritik-2026-11-22-4.md.
MVP: Funktion, weil Kunde 1 ohne ein paar bezahlte Schritte den Bericht nie schreiben kann, der seine weitere Inferenz bezahlt.

## Voraussetzungen
- kunden Goal 11 DONE

## Kontext für den Maker
- Ziel in einem Satz: Kunde 1 bekommt beim nächsten Versuch zu denken eine Antwort statt 402 und kann mit diesen Schritten den
  Hausauftrag lesen, den Bericht schreiben und einreichen.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 13; Loop-Triage 23.11.2026 (PRO-28101), Entscheidung Tech Lead 23.11.2026 (PRO-28123).
  kunden 12 steht auf `PAUSED`, weil sein Fenster am Rollout von kunden 11 hängt und damit nur den bekannten Ausfall misst; kunden 14
  misst nach dem Rollout dieses Goals.
- Entscheidung Tech Lead 23.11.2026, wer das Schrittguthaben bekommt: eine Adresse, für die alles zugleich gilt:
  ein Hausauftrag ist offen (`openHouseJob(db, now)` aus `src/bounties/house.ts`);
  die Adresse ist nicht unsere (`ourAddresses`) und kein Handle der schlüssellosen Tür (`isKeylessAddress`);
  sie hält einen Schlüssel mit dem Namen `RUNTIME_KEY_NAME` (dieselbe Abfrage, mit der der Hausauftrag zahlt);
  sie hat mindestens eine frühere Ledger-Zeile `inference` (nur eine Runtime, die schon gedacht hat, keine frische Wallet);
  sie hatte noch nie eine Zeile `house_step` und noch nie einen Zuspruch eines Hausauftrags;
  `grantOnFirstUse` hat für diesen Aufruf nichts gegeben, aus welchem Grund auch immer (schon bekommen, Pool leer, Tagesgrenze).
  Das trifft genau Kunde 1 und kostet höchstens den Betrag unten je Adresse.
- Betrag und Grenzen als Konstanten in `src/bounties/house.ts`: `HOUSE_STEP_MC = 10_000` (10 Cent) und `HOUSE_DAILY_MC = 100_000`
  (1 USD). Zusprüche (je `HOUSE_PRICE_MC`) und Schrittguthaben eines UTC-Tages zusammen bleiben höchstens bei `HOUSE_DAILY_MC`; die
  Zahl der Zusprüche bleibt zusätzlich höchstens `HOUSE_DAILY_AWARDS`, und jeder bestehende Test von kunden 11 bleibt grün. Wer die
  Grenze erreicht, bekommt wie heute 409 `house_pool_empty` beim Einreichen oder eben kein Schrittguthaben.
- Buchung: `grantForHouseJob(db, address, now)` in `src/bounties/house.ts` schreibt genau eine Ledger-Zeile `kind: "house_step"`,
  `ref: "house-step:<adresse>"`, `meta: { trigger: "house job open", bounty_id: <id> }` über `postLedger`, also in derselben
  Transaktion wie der Saldo, und liefert `true` oder `false`, ohne zu werfen. Einmal je Adresse hält ein eindeutiger Index in
  `src/db.ts` wie `ledger_grant_once` (`CREATE UNIQUE INDEX IF NOT EXISTS ledger_house_step_once ON ledger(address) WHERE kind =
  'house_step'`). Credits im Control Plane, kein USDC, keine Wallet-Bewegung, nichts auszahlbar (Grundregel 10).
- Aufruf in `src/inference/proxy.ts` genau neben `grantOnFirstUse`: schlägt `reserveMc` fehl, gibt `grantOnFirstUse` nichts und sind
  Aufladungen nicht geschlossen (`chatOpts.topupsClosed`), dann `grantForHouseJob` und danach `reserveMc` erneut. Reicht das Guthaben
  dann, läuft die Inferenz wie jede andere und wird wie jede andere abgerechnet; reicht es nicht, bleibt die 402 Byte für Byte wie auf
  `origin/dev`. Die 402 und ihre Felder ändern sich nicht.
- Mitgenommen, weil dieselbe Stelle (kunden-kritik-2026-11-22-3 und -4): Im Hauszweig von `POST /v1/submissions` (`src/app.ts`, um
  `isHouseJob`) trägt die Antwort 409 mit `not_open` oder `deadline_passed` zusätzlich `open_house_job` mit der `id` aus
  `openHouseJob`, wenn einer offen ist; `src/bounties/house.ts` importiert `RUNTIME_KEY_NAME` aus `src/credits/starter.ts`, statt das
  Literal zu führen, und `HOUSE_RUNTIME_KEY_NAME` bleibt als Alias davon exportiert, damit bestehende Tests unverändert laufen.
- `ops/customer-work.sh` und `CP_REPORT=customer-work` in `ops/db-report.cjs`: Die bisherigen Zeilen behalten ihr Format, dazu je Lauf
  `HOUSE STEP: <n> step credits (<c> to the customer)` und je UTC-Tag des Fensters
  `HOUSE DAY <JJJJ-MM-TT>: <a> house awards, <f> to addresses without earlier inference, <s> step credits`. „Ohne frühere Inferenz“
  heißt: keine Zeile `inference` dieser Adresse vor dem Zuspruch. Der Selbsttest pflanzt ein Schrittguthaben an den Kunden, einen
  Zuspruch an eine frische Wallet ohne Inferenz und einen an eine Adresse mit früherer Inferenz und belegt beide Richtungen mit Zeilen
  `ok … step` und `ok … earlier inference`. Ohne Adresse in der Ausgabe.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 13: …`, mindestens zum Betrag (10 Cent: kleiner als die Startgutschrift von
  15 Cent, die für etwa zehn Versuche an einem Auftrag gerechnet ist, und ein Bericht ist einer) und zur Bedingung einer früheren
  Zeile `inference` (sonst nähme jede frische Wallet mit einem Schlüssel `conway-automaton` das Schrittguthaben, kunden-kritik-2026-11-22-2).
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Auftrag, keine Einreichung, kein Zuspruch und kein Aufruf mit einem eigenen Schlüssel in der Produktion; die erste Messung dort macht
  kunden 14 nach dem Rollout.

## Done Condition
- [ ] Eine fremde Runtime mit früherer Inferenz und leerem Saldo bekommt bei offenem Hausauftrag einmal ein Schrittguthaben, und ihre
      nächste Inferenz endet mit 200; ohne Hausauftrag, ein zweites Mal, für eigene Adressen, ohne Runtime-Schlüssel, ohne frühere
      Inferenz, nach einem Zuspruch und über der Tagesgrenze bleibt es bei 402 ohne Buchung.
      MVP: Funktion, weil Kunde 1 erst mit einer Antwort des Modells den Bericht schreiben kann, der seine Inferenz bezahlt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-step.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/empty balance, house job open, next completion 200/,/no step credit without an open house job/,/one step credit per address, ever/,/no step credit for our own addresses/,/no step credit without a runtime key/,/no step credit before a first inference/,/no step credit after a house award/,/step credits and awards stay within one dollar a day/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `T=$(mktemp -d); cp src/inference/proxy.ts $T/p; sed -i 's/grantForHouseJob(db, address/false \&\& grantForHouseJob(db, address/' src/inference/proxy.ts; PATH=/usr/bin:$PATH pnpm -s vitest run test/house-step.test.ts -t "empty balance, house job open, next completion 200" > /dev/null 2>&1 && r=gruen || r=rot; cp $T/p src/inference/proxy.ts; rm -rf $T; echo $r` muss genau `rot` ausgeben.
      Prüfung: `grep -cE "HOUSE_STEP_MC = 10_000|HOUSE_DAILY_MC = 100_000" src/bounties/house.ts` muss 2 ausgeben.
      Prüfung: `grep -c "ledger_house_step_once" src/db.ts` muss 1 ausgeben.
      Prüfung: `grep -cE "transfer|payout|withdraw|sendTransaction|writeContract" src/bounties/house.ts` muss 0 ausgeben.
- [ ] Die Zusprüche des Hausauftrags bleiben wie in kunden 11, auch zusammen mit Schrittguthaben unter 1 USD am Tag.
      MVP: Funktion, weil der Zuspruch der Weg ist, auf dem Kunde 1 danach selbst bezahlt, und die Grenze die Kosten deckelt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-award.test.ts test/house-job.test.ts test/award-inference.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- test/house-award.test.ts test/house-job.test.ts test/award-inference.test.ts | wc -l` muss 0 ausgeben.
- [ ] Ein Bericht an einen geschlossenen oder abgelaufenen Hausauftrag nennt den offenen, und der Name des Runtime-Schlüssels steht
      nur an einer Stelle.
      MVP: Funktion, weil eine Runtime sonst bei jedem Wechsel des Auftrags das Brett neu lesen muss und ein neuer Pin den Hausauftrag
      still abschalten würde.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/house-step.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/not_open names the open house job/,/deadline_passed names the open house job/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c '"conway-automaton"' src/bounties/house.ts` muss 0 ausgeben.
      Prüfung: `grep -c "RUNTIME_KEY_NAME" src/bounties/house.ts` muss mindestens 2 ausgeben.
- [ ] `ops/customer-work.sh` zählt Schrittguthaben und je Tag die Zusprüche an Adressen ohne frühere Inferenz, ohne Adresse in der
      Ausgabe, in beide Richtungen bewiesen.
      MVP: Funktion, weil kunden 14 mit genau diesen Zeilen misst, ob Kunde 1 das Guthaben nutzt und ob frische Wallets die Zusprüche
      nehmen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "^ok .*(step|earlier inference)"` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/customer-work.sh --selftest | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `cat ops/customer-work.sh ops/db-report.cjs | grep -cE "HOUSE STEP: |HOUSE DAY "` muss mindestens 2 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/customer-work.test.ts` muss Exit-Code 0 haben.
- [ ] `goals/kunden/ANNAHMEN.md` nennt die Entscheidungen dieses Goals, ohne Adresse.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 13: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `cat goals/kunden/ANNAHMEN.md src/bounties/house.ts | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
- [ ] `check` ist grün, und der Job `e2e` am Kopf des Goal-PR ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/kunden-13 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Buchung ist eine Ledger-Zeile in derselben Transaktion wie der Saldo; nichts ist auszahlbar.
- [ ] Ohne offenen Hausauftrag verhalten sich Inferenz und 402 Byte für Byte wie auf `origin/dev`, und die bisherigen Zeilen von
      `ops/customer-work.sh` behalten ihr Format.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/payments/**`, `src/auth/**`, `src/credits/**`: nur lesen
- die bestehenden Tests unter `test/` außer `test/customer-work.test.ts`: unverändert
- `ops/customer-decline.sh`, `ops/customer_match.py`, `ops/status.sh`, `ops/access-log.sh`, `ops/own-ips.sh`, `ops/own-ips.txt`:
  unverändert
- `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, `docs/kunden/*.md` und alle bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Auftrag, jede Einreichung und jeder Zuspruch dort, jeder Kontakt zum Betreiber eines
  Automatons
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
