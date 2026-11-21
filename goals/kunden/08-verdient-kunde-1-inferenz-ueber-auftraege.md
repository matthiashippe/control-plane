# Kunden Goal 08: Verdient Kunde 1 Inferenz über Aufträge?

## Status
DONE

## Active Objective
Kunde 1, der größte zahlende fremde Automaton, hat laut kunden 05 kein Geld für eine Aufladung (`docs/kunden/aufladung-2026-11.md`,
`Ursache: kein Geld`), will aber weiter denken: Seit 13.11.2026 stellte er 11260 Anfragen, die mit 402 endeten, und rief 1044 Mal
`/bounties.json` ab, auf das unsere 402 ihn mit `details.open_bounties` und `details.bounties_url` schickt (`src/inference/proxy.ts`).
Ob er dort je Arbeit eingereicht hat, ob es an diesen Tagen offene Aufträge für ihn gab und ob ein angenommenes Ergebnis ihm Guthaben
bringt, mit dem er Inferenz bezahlen kann, misst bisher niemand. Nach diesem Goal steht das je Schritt gemessen in
`docs/kunden/auftraege-2026-11.md`, nur lesend gegen die Produktion, und der erste leere Schritt ist ein Vorschlag für das Folge-Glied,
das genau diesen Schritt baut.
Leitzahl: fremde Zahlungen je Woche; eine Inferenz, die aus verdientem Guthaben bezahlt ist, zählt mit.
Widerlegt, wenn Kunde 1 seit 13.11. keinen Aufruf auf einen Weg zum Einreichen machte und `/bounties.json` nur las; dann steht das so
da, und das Folge-Glied fragt, wie die 402 ihn zum Einreichen statt zum Lesen führt.
MVP: Funktion, weil ein Kunde mit über 1000 Anfragen am Tag und ohne USDC sonst gar nicht mehr zahlt.

## Voraussetzungen
- kunden Goal 07 DONE

## Kontext für den Maker
- Ziel: Wir wissen gemessen, an welchem Schritt Kunde 1 scheitert, wenn er sich Inferenz über Aufträge verdienen will (einreichen,
  Auftrag finden, Preis als Guthaben nutzen), damit das nächste Glied genau diesen Schritt baut und er wieder zahlt.
- Quelle der Kette: `ROADMAP.md`, Topic `kunden`, Glied 08; Loop-Triage 21.11.2026 (PRO-26350, PRO-26356). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-20-3.md`.
- Kunde 1 ist der Kunde 1 aus `ops/customer-decline.sh` (Nummer nach der ersten Zeile `inference` im Fenster ab
  `2026-11-05T00:00:00Z`, Adressen des Kunden über die Zuordnung zum Zugriffslog). Die Adressen kommen nur im Speicher aus der
  Produktion, nie ins Repo, in eine Ausgabe oder ein Log (Grundregel 8, `goals/kunden/ANNAHMEN.md` zu kunden 01).
- Wege im Code (Fundstellen im Dokument als `src/<pfad>.ts:<zeile>`): Aufträge lesen über `GET /bounties.json` und `GET /v1/bounties`,
  einreichen über `POST /v1/submissions` (`submitWork` in `src/bounties/store.ts`), annehmen über `POST /v1/bounties/award`
  (`awardBounty`, Ledger-Zeile `bounty_award` an `submission.agent`), Inferenz über `handleChat` in `src/inference/proxy.ts`.
- Werkzeug `ops/customer-work.sh` (Bash mit eingebettetem Node wie `ops/customer-decline.sh`, dessen Zuordnung es wiederverwendet,
  statt sie zu kopieren):
  - Datenbankteil: `CP_REPORT=customer-work` in `ops/db-report.cjs` (`readonly: true`, im Container `cp` wie in kunden 01 und 03)
    gibt für die Adressen eines Kunden, die das Werkzeug über `CP_CUSTOMER_ADDRESSES` nur im Speicher übergibt, je Tag im Fenster
    (`CP_SINCE`, `CP_UNTIL`) nur Zahlen aus: Einreichungen (`submissions.agent`), offene Aufträge (geöffnet vor Tagesende, nicht vor
    Tagesbeginn geschlossen), Aufträge, die einer eigenen Adresse gehören (`oursClause`), Zeilen `bounty_award` an den Kunden und
    Zeilen `inference` des Kunden nach seiner ersten Zeile `bounty_award`. Ohne `CP_REPORT` bleibt der Bericht Byte für Byte wie heute.
  - Zugriffslog über `ops/access-log.sh`: je Tag die Aufrufe des Kunden auf `GET /bounties.json`, `GET /v1/bounties`,
    `POST /v1/submissions` (je Status) und `POST /v1/bounties/award`.
  - Ausgabe, Englisch: `WORK since <t> until <u>: customer <n>`; je Tag
    `DAY <YYYY-MM-DD>: <r> board reads, <s> submit calls, <a> submissions stored, <o> open bounties (<q> ours)`; je Status der
    Einreichungen `SUBMIT STATUS <code>: <n>`; zuletzt `AWARDS: <w> awarded to the customer, <i> inference rows after the first award`.
    Keine Adresse, kein Betrag, keine Auftrags- oder Einreichungs-ID, kein Text eines Auftrags.
  - `--customer <n>` (Standard 1), `--db-json <datei>`, `--log <datei>`, `--selftest` ohne Netz in beide Richtungen (Zeilen
    `ok … submit`, `ok … open`, `ok … award`, `ok … ours`), Fixtures nur mit Adressen aus RFC 5737 unter `ops/fixtures/customer-work-*`;
    kein lesbares Log oder JSON ist Exit 2, eine Zeit, die keine ISO-Zeit in UTC ist, Exit 1.
- Ob ein angenommenes Ergebnis Inferenz bezahlt: Test `test/award-inference.test.ts` gegen `createApp` mit `openDb` und dem
  nachgebauten Anbieter wie die bestehenden Tests der Inferenz: eine fremde Adresse mit Saldo 0 bekommt 402 auf
  `/v1/chat/completions` (Testname enthält `no award no inference`), ein anderer Automaton stellt einen Auftrag, die Adresse reicht ein,
  der Auftrag wird ihr zugesprochen, und danach prüft der Test, was `/v1/chat/completions` heute antwortet (Testname enthält
  `award then inference`). Der Test hält fest, was der Code tut, nicht was er tun sollte; das Dokument liest daraus `bucht` oder
  `bucht nicht`.
- `docs/kunden/auftraege-2026-11.md`, Deutsch, je eine Zeile: `Gemessen: <ISO UTC>`; der Befehl und die volle Ausgabe als Codeblock;
  je Weg `- Weg: src/<pfad>.ts:<zeile>, <was er tut>`, mindestens vier; dann die drei Schritte
  `Schritt Einreichen: <n> Einreichungen seit 13.11., <c> Aufrufe zum Einreichen`,
  `Schritt Aufträge: <m> Tage mit offenem fremdem Auftrag von <d> Tagen`,
  `Schritt Guthaben: bucht|bucht nicht, weil <Beleg aus test/award-inference.test.ts und src/<pfad>.ts:<zeile>>`;
  zuletzt genau eine Zeile `Ergebnis: leerer Schritt <Einreichen|Aufträge|Guthaben>, weil <Beleg>` (der erste leere in dieser
  Reihenfolge) oder `Ergebnis: kein leerer Schritt, weil <Beleg>`. Bei einem leeren Schritt genau eine Zeile
  `Vorschlag: goals/_vorschlaege/kunden-kritik-<JJJJ-MM-TT>-<n>.md`, der Vorschlag mit `Schwere: 4`, `Goal: kunden 08` und einer
  Empfehlung für ein Glied, das genau diesen Schritt baut, mit der Leitzahl fremde Zahlungen je Woche. Keine Adresse, keine Wallet,
  kein Betrag je Kunde.
- `goals/kunden/ANNAHMEN.md`: Zeilen `- <Datum>, kunden 08: …`, mindestens zur Grenze eines offenen Auftrags je Tag und zur Wahl von
  Kunde 1 über `ops/customer-decline.sh`.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout. Kein Build, kein Test auf dem Server, kein Aufruf mit einem eigenen Schlüssel
  ohne Guthaben in der Produktion (`grantOnFirstUse` gäbe ihm eine Startgutschrift aus dem Pool), kein Auftrag, keine Einreichung und
  kein Zuspruch in der Produktion.

## Done Condition
- [x] `ops/customer-work.sh` zählt je Tag, was Kunde 1 auf dem Weg vom Auftrag zum Guthaben tat und wie viele Aufträge offen waren,
      nie eine eigene Adresse, und nennt keine Adresse; in beide Richtungen bewiesen.
      Prüfung: `bash ops/customer-work.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `bash ops/customer-work.sh --selftest | grep -cE "^ok .*submit"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-work.sh --selftest | grep -cE "^ok .*open"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-work.sh --selftest | grep -cE "^ok .*award"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-work.sh --selftest | grep -cE "^ok .*ours"` muss mindestens 1 ausgeben.
      Prüfung: `bash ops/customer-work.sh --selftest | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `cat ops/fixtures/customer-work-* | grep -oE '"(remote_ip|client_ip)": ?"[^"]*"' | grep -cvE '"(192\.0\.2|198\.51\.100|203\.0\.113)\.[0-9]+"'` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/db-report.test.ts test/db-report-no-duplicate-keys.test.ts` muss Exit-Code 0 haben.
- [x] Ob ein angenommenes Ergebnis heute Inferenz bezahlt, ist durch einen Test festgehalten.
      Prüfung: `pnpm -s vitest run test/award-inference.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/no award no inference/,/award then inference/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
- [x] Die drei Schritte von Kunde 1 stehen gemessen in `docs/kunden/auftraege-2026-11.md`, mit Ergebnis und, bei einem leeren
      Schritt, dem Vorschlag für das Folge-Glied, ohne Adresse und ohne Betrag.
      Prüfung: `awk '/^Gemessen: /{print ($2 >= "2026-11-21T00:00:00Z") ? "spaet genug" : "zu frueh"}' docs/kunden/auftraege-2026-11.md` muss genau `spaet genug` ausgeben.
      Prüfung: `grep -cE "^WORK since .*: customer 1$" docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^AWARDS: [0-9]+ awarded to the customer, [0-9]+ inference rows after the first award$" docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^- Weg: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+, " docs/kunden/auftraege-2026-11.md` muss mindestens 4 ausgeben.
      Prüfung: `grep -cE "^Schritt Einreichen: [0-9]+ Einreichungen seit 13\.11\., [0-9]+ Aufrufe zum Einreichen$" docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Schritt Aufträge: [0-9]+ Tage mit offenem fremdem Auftrag von [0-9]+ Tagen$" docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Schritt Guthaben: (bucht|bucht nicht), weil .*test/award-inference\.test\.ts" docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `grep -cE "^Ergebnis: (leerer Schritt (Einreichen|Aufträge|Guthaben)|kein leerer Schritt), weil " docs/kunden/auftraege-2026-11.md` muss 1 ausgeben.
      Prüfung: `d=docs/kunden/auftraege-2026-11.md; if grep -q "^Ergebnis: leerer Schritt" "$d"; then v=$(sed -nE 's/^Vorschlag: (goals\/_vorschlaege\/kunden-kritik-[0-9-]+-[0-9]+\.md)$/\1/p' "$d"); [ -n "$v" ] && [ -f "$v" ] && grep -q "^Schwere: 4$" "$v" && grep -q "^Goal: kunden 08$" "$v" && echo belegt || echo fehlt; else echo entfaellt; fi` muss `belegt` oder `entfaellt` ausgeben.
      Prüfung: `cat docs/kunden/auftraege-2026-11.md goals/kunden/ANNAHMEN.md | grep -cE "([0-9]{1,3}\.){3}[0-9]{1,3}|0x[0-9a-fA-F]{40}"` muss 0 ausgeben.
      Prüfung: `grep -cE "[0-9]+([.,][0-9]+)? ?(USD|USDC|cents)\b" docs/kunden/auftraege-2026-11.md` muss 0 ausgeben.
      Prüfung: `grep -cE "^- [0-9-]+, kunden 08: " goals/kunden/ANNAHMEN.md` muss mindestens 2 ausgeben.
      Prüfung: `grep -oE "^- Weg: src/[A-Za-z0-9_/.-]+\.ts:[0-9]+" docs/kunden/auftraege-2026-11.md | sed 's/^- Weg: //' | while IFS=: read -r p n; do sed -n "${n}p" "$p" | grep -qiE "bount|submi|award|ledger|chat|inference|402" || echo "falsch $p:$n"; done` muss nichts ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Test war vor dem Werkzeug rot; die Zeile im Progress Log nennt, womit.
- [ ] Ohne `CP_REPORT` gibt `ops/db-report.cjs` dasselbe aus wie auf `origin/dev`.
- [ ] Kein Schreiben in der Produktion: das Werkzeug öffnet die Datenbank nur mit `readonly: true`.
- [ ] Code, Kommentare und Testnamen Englisch, Dokument, Goal-Datei und `ANNAHMEN.md` Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.db`
- `src/**`: nur lesen; dieses Goal misst und baut nichts am Dienst
- `ops/db-report.cjs`: nur der neue Zweig für `CP_REPORT=customer-work`; `ops/customer-decline.sh`: nur eine ausgelagerte Funktion,
  wenn `ops/customer-work.sh` die Zuordnung sonst kopieren müsste, mit unveränderter Ausgabe; `ops/status.sh`, `ops/access-log.sh`,
  `ops/own-ips.sh`, `ops/own-ips.txt`: unverändert
- `docs/kunden/aufladung-2026-11.md`, `docs/kunden/rueckgang-2026-11.md`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**` und alle
  bestehenden Vorschläge: nur lesen
- jedes Schreiben in der Produktion, jeder Kontakt zum Betreiber eines Automatons
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-21 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `ops/customer-work.sh` mit Zweig `CP_REPORT=customer-work` in `ops/db-report.cjs` und der Zuordnung aus `ops/customer-decline.sh` als `ops/customer_match.py`, Test `test/award-inference.test.ts`, Messung gegen die Produktion in `docs/kunden/auftraege-2026-11.md` (leerer Schritt Einreichen, seit 06.10. kein offener Auftrag), Vorschlag `goals/_vorschlaege/kunden-kritik-2026-11-21-3.md`. Rot gesehen: `test/award-inference.test.ts` mit beiden Tests rot, als `awardBounty` an `bounty.creator` statt an `submission.agent` buchte und die 402 `open_bounties` erst ab 2 nannte; der Selbsttest mit 6 FAIL, als der Zweig die eigenen Aufträge des Kunden mitzählte, nie schloss und nichts uns zuschrieb, und mit 18 FAIL am Stand `origin/dev` von `ops/db-report.cjs` (Mutationen danach zurückgesetzt, `git diff --exit-code src` leer). Standardbericht ohne `CP_REPORT` Byte für Byte gleich mit `origin/dev` (`cmp` auf der gepflanzten Datenbank). Prüfbefehle: Punkt 1 `SELFTEST OK`, submit 4, open 5, award 5, ours 5, Adressen 0, Fixtures 0, `vitest db-report` Exit 0; Punkt 2 `alle`; Punkt 3 `spaet genug`, 1, 1, 8, 1, 1, 1, 1, `belegt`, 0, 0, 4, keine Ausgabe; Punkt 4 `node scripts/check.mjs` Exit 0 (238 Dateien, 2503 Tests).
- 2026-11-21 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; `dev` ohne neue Commits seit dem Merge in Zyklus 1, alle Prüfbefehle auf `9aeb79b` neu gefahren. Prüfbefehle: Punkt 1 `SELFTEST OK`, submit 4, open 5, award 5, ours 5, Adressen 0, Fixtures 0, `vitest db-report` Exit 0; Punkt 2 `alle`; Punkt 3 `spaet genug`, 1, 1, 8, 1, 1, 1, 1, `belegt`, 0, 0, 4, keine Ausgabe; Punkt 4 `node scripts/check.mjs` Exit 0 (238 Dateien, 2503 Tests, 204 s); `src/**` unverändert, also kein Laufzeitpfad, Job `e2e` am PR läuft trotzdem mit.
- 2026-11-21 Release: PASS K und B (Zyklus 2), DONE.

## Blockers
