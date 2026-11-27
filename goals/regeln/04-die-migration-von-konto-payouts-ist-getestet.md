# Regeln Goal 04: Die Migration von `konto_payouts` ist getestet

## Status
PAUSED

## Active Objective
`openDb` fügt an eine bestehende Tabelle `konto_payouts` die Spalten `pending_tx`, `pending_usdc`, `retire_revoke` und
`retire_destination` mit `ALTER TABLE` an (`src/db.ts:744` bis `:751`). Kein Test belegt das: Jede Test-Datenbank legt die Tabelle
frisch mit dem einzigen `CREATE TABLE` an (`src/db.ts:705`), und der Fall „retires a row from before retire_destination“ in
`test/konto-payout.test.ts` setzt nur einen Wert auf NULL, die Spalte fehlt dort nie. Fiele eine der Zeilen weg, scheiterte
`finishPayout` an der Datenbank der Produktion, und alle Tests blieben grün. Nach diesem Goal öffnet ein Test eine Datenbank mit
`konto_payouts` im Schema ohne die vier angefügten Spalten und einer Zeile, ruft `openDb` darauf, und erwartet alle vier Spalten,
die Zeile mit ihren Werten und die neuen Spalten auf NULL; ein zweiter Fall ruft danach `finishPayout` für diese Zeile.
Leitzahl: Spalten, die `openDb` per `ALTER TABLE` an `konto_payouts` anfügt und die kein Test an einer alten Tabelle belegt, Ziel 0
(heute 4).
Widerlegt, wenn ein Test am Kopf von `dev` schon `openDb` auf eine `konto_payouts` ohne `retire_destination` ruft.
MVP: Funktion, weil die Auszahlung bestehender Konten nach dem nächsten Rollout nur mit dieser Migration läuft und Kompatibilität
keine Schönheit ist.

## Voraussetzungen
- regeln Goal 03 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer eine Zeile der Migration von `konto_payouts` löscht, macht `check` rot, bevor eine bestehende Datenbank
  daran scheitert.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Das Konto geht mit konto 15 in die Produktion (Hauptnetz erst mit
  `CP_KONTO_MAINNET=1`); eine Auszahlung, die an der eigenen Datenbank scheitert, kostet den ersten Kunden, der dort Geld hat.
- Quelle: `ROADMAP.md`, Topic `regeln`, Glied 04 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/regeln-nacharbeit-2026-11-27-1.md`. Platz vor konto 15.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, regeln 04: …` in
  `goals/regeln/ANNAHMEN.md`.
  1. **Das alte Schema** ist genau das `CREATE TABLE` aus `src/db.ts:705` ohne die vier Spalten, als Literal im Test, angelegt in einer
     Datei unter `mktemp -d` (better-sqlite3 direkt, dazu die Tabellen, auf die `konto_payouts` verweist, so knapp wie nötig). Eine
     Zeile mit `destination`, `bridge_customer_id` und `updated_at`.
  2. **Zwei Fälle** in `test/konto-payout.test.ts`: „adds the payout columns to a table without them“ (`PRAGMA table_info`
     nennt alle vier, die Zeile hat ihre Werte, die vier neuen Spalten sind NULL, ein zweites `openDb` ändert nichts) und „finishes a
     payout on a table from before retire_destination“ (`finishPayout` läuft auf der migrierten Zeile wie auf einer frischen, mit den
     Helfern, die die Datei schon hat).
  3. **Der Code ändert sich nicht.** `src/db.ts` bleibt Zeichen für Zeichen; findet der Test einen Fehler der Migration, fragt der
     Maker den Tech Lead auf dem Topic, bevor er `src/db.ts` anfasst.
  4. **Rot vor dem Fix heißt hier:** Der Maker löscht testweise die Zeile mit `retire_destination` (`src/db.ts:751`) und dann die mit
     `retire_revoke` (`:749`), je einmal, und schreibt beide roten Ausgaben ins Progress Log; danach ist `src/db.ts` wieder gleich.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein
  Netz, keine Produktion, kein On-Chain-Senden. Code, Bezeichner und Testnamen englisch.

## Done Condition
- [ ] Ein Test öffnet eine alte `konto_payouts` mit `openDb` und findet alle vier angefügten Spalten, die Zeile erhalten und die neuen
      Spalten NULL; ein zweiter beendet darauf eine Auszahlung.
      MVP: Funktion, weil die Auszahlung bestehender Konten sonst bei grünen Tests an der eigenen Datenbank scheitern kann.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/konto-payout.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "adds the payout columns to a table without them" "finishes a payout on a table from before retire_destination"; do grep -qF "\"$t\"" test/konto-payout.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c -E 'Zyklus [0-9]+:.*(retire_destination|retire_revoke).*rot' goals/regeln/04-die-migration-von-konto-payouts-ist-getestet.md` muss mindestens 1 ausgeben.
- [ ] `src/db.ts` ist unverändert, die Entscheidungen stehen in `goals/regeln/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses
      Goals, kein Test fällt weg.
      MVP: Funktion, weil dieses Goal nur belegt und nichts am Laufzeitpfad ändert.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) HEAD -- src | wc -l` muss 0 ausgeben.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, regeln 04: ' goals/regeln/ANNAHMEN.md` muss mindestens 3 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(test/konto-payout\.test\.ts|goals/regeln/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer eine der vier Zeilen der Migration löscht, sieht `check` rot.
- [ ] Kein bestehender Fall in `test/konto-payout.test.ts` ist gelockert.
- [ ] Kein Gedankenstrich, kein Schlüssel, keine Wallet-Adresse eines Kunden.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`: unverändert (Entscheidung 3)
- `test/**` außer `test/konto-payout.test.ts`: unverändert; kein bestehender Fall wird gelockert
- `ops/**`, `mcp/**`, `README.md`, `docs/**`: unverändert
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- On-Chain-Senden auf jedem Netz, Testschlüssel, Wallet-Bewegung (`loop-constraints.md`, Grundregel 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log

## Blockers
Pause: die Wirkung hängt an konto 15, das ruht (goals/_vorschlaege/regeln-kritik-2026-11-27-1.md); zurück auf PLANNED, sobald konto 15 wieder PLANNED ist (Loop-Kritik 2026-11-27)
