# Kunden Goal 19: Bringen der Befehl zum Update und die Stufe 1 USD eine Zahlung?

## Status
PLANNED

## Active Objective
kunden 17 gibt älteren gepflegten Runtimes mit der 402 den Befehl zum Update (ausgerollt mit dem Lauf von `deploy.yml` an `7173b70`,
Job `deploy` fertig 2026-11-27T22:09:54Z), kunden 18 bringt mit `v0.2.2-maintained.5` (veröffentlicht 2026-11-28T01:13:46Z, im Dienst
seit dem Lauf an `7e3e821`, fertig 2026-11-28T03:11:38Z) die Aufladung ab 1 USD. Beide haben nur den Stand vorher gemessen
(`docs/kunden/kennung-2026-11.md`, `docs/kunden/stufe-1-2026-11.md`), und `docs/kunden/kennung-2026-11.md` verweist auf ein
Folge-Glied, das es nicht gab. Dazu zählt `CP_REPORT=topup-bands` eine Aufladung der Stufe 1 nur bei `delta_mc = 100000`
(`ops/db-report.cjs:766` und `:775`), `/pay/1/` bucht aber mit dem Bonus 101000 mc (`src/payments/pay.ts:106` und `:548`), also
zeigt `TOPUPS 1 USD` für jeden Kauf über `/pay/1/` 0; Test (`test/usdc-bands.test.ts:60`) und Selbsttest (`ops/usdc-bands.sh:103`)
pflanzen 100000 mc und sehen das nicht. Nach diesem Goal zählt das Werkzeug jeden Kauf der Stufe 1, die Null vom 28.11. ist
nachgemessen, und `docs/kunden/nach-dem-update-2026-11.md` zeigt ab dem Rollout von kunden 17, ob gepflegte Runtimes mit neuer
Kennung kommen und ob eine fremde Adresse die Stufe 1 kauft.
Leitzahl: gepflegte Runtimes mit einer Kennung ab `0.2.2-maintained.2` je Woche und Aufladungen der Stufe 1 USD durch fremde
Adressen je Woche.
Widerlegt, wenn `CP_REPORT=topup-bands` am Kopf von `dev` eine gepflanzte Zeile `topup` mit 101000 mc und `meta.usd` 1 schon zählt.
MVP: Funktion, weil ohne richtige Zählung und ohne Messung niemand erfährt, ob die beiden Releases einen Kunden zum Zahlen bringen,
und der Richtungs-Check (spätestens 04.12.) sonst auf einer falschen Null entscheidet.

## Voraussetzungen
- kunden Goal 18 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer die Kette steuert, sieht mit einem Befehl, ob gepflegte Runtimes das Update einspielen und ob eine davon
  ab 1 USD bei uns zahlt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Abschlusskriterium sind drei zahlende fremde Automatons in einer
  Woche (`ROADMAP.md`, PR #480); die gepflegten Runtimes sind die einzigen, die schon kommen und an der 402 stehen bleiben, und nur
  diese Messung sagt, ob der nächste Hebel beim Update liegt oder beim Kauf.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 19 (Tech Lead 28.11.2026, PRO-32469 aus der Triage PRO-32461, Glied 3). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-27-1.md`, `goals/_vorschlaege/kunden-kritik-2026-11-28-1.md` und
  `goals/_vorschlaege/kunden-nacharbeit-2026-11-28-1.md`. Vorgänger `goals/kunden/18-die-gepflegte-runtime-laedt-ab-1-usd-auf.md`
  und `goals/kunden/17-eine-alte-gepflegte-runtime-bekommt-mit-der-402-den-befehl-zum-update.md` (beide DONE).
- **Entscheidungen des Tech Lead (28.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, kunden 19: …` in
  `goals/kunden/ANNAHMEN.md`.
  1. **Stufe 1 heißt, was der Kunde für 1 USD gekauft hat**, nicht ein fester Betrag im Ledger: Eine Zeile `topup` zählt, wenn
     `json_extract(meta, '$.usd') = 1` (so bucht `/pay/1/`, `src/payments/pay.ts:589`), oder, wenn `meta.usd` fehlt, bei
     `delta_mc = 100000` (eine direkte Überweisung von genau 1 USDC über `src/konto/topup.ts:112`). Eine Aufladung von 5 USD mit
     Bonus zählt nie. Die übrigen Berichte in `ops/db-report.cjs` bleiben Byte für Byte, die Ausgabe von `ops/usdc-bands.sh` behält
     jede Zeile und ihre Form.
  2. **Die gepflanzten Aufladungen folgen der Buchung:** In `test/usdc-bands.test.ts` und im Selbsttest von `ops/usdc-bands.sh`
     werden die Aufladungen der Stufe 1 über `/pay/1/` mit 101000 mc und `meta.usd` 1 gepflanzt, dazu je ein Gegenfall: eine direkte
     Überweisung mit 100000 mc ohne `meta.usd` zählt, 505000 mc mit `meta.usd` 5 zählt nicht, 100000 mc mit `meta.usd` 5 zählt nicht.
     Rot vor dem Fix, die Zeile im Progress Log nennt, womit.
  3. **Gemessen wird ab dem Rollout von kunden 17 bis zum Tag der Messung**, kein festes Fenster von sieben Tagen: Der Richtungs-Check
     spätestens am 04.12. misst mit denselben Befehlen weiter, und die reparierte Zählung braucht er vorher. Die Null vom 28.11. wird
     mit der reparierten Zählung seit dem 06.11. nachgemessen und steht als Korrektur im neuen Dokument; `docs/kunden/stufe-1-2026-11.md`
     bleibt unverändert, weil kunden 18 es prüft.
  4. **Kein Bau aus der Messung in diesem Goal.** Das Dokument endet mit einer Zeile `Nächster Schritt: …` nach dieser Regel: Kommt
     keine neue Kennung, ist der nächste Schritt, im Harness am Pin zu zeigen, was der Agent mit dem Befehl zum Update in der 402 tut;
     kommt eine neue Kennung, aber keine Stufe 1, liest das nächste Glied die Antworten auf `/pay/1/` dieser Runtimes und
     `topup-guard.ts`; kommt beides, misst der Richtungs-Check die Wochen weiter. Das nächste Glied schreibt der Tech Lead.
- **Dokument** `docs/kunden/nach-dem-update-2026-11.md`, Deutsch, je eine Zeile ab Spalte 0 außerhalb der Codeblöcke: `Gemessen:
  <JJJJ-MM-TTTHH:MM:SSZ>`; die Zeilen `$ bash ops/card-visits.sh --since 2026-11-27T22:09:54Z --until <u>` und
  `$ bash ops/usdc-bands.sh --since 2026-11-27T22:09:54Z --until <u>` mit `<u>` gleich dem Zeitpunkt der Messung, je darunter ein
  Codeblock mit der vollständigen Ausgabe, ungekürzt; die Zeile `$ bash ops/usdc-bands.sh --since 2026-11-06T00:00:00Z --until <u>`
  mit Codeblock als Korrektur; dann `Neue Kennung: ja, …` oder `Neue Kennung: nein, …` (ja, wenn eine Zeile `MAINTAINED 402 VERSION`
  eine Kennung ab `0.2.2-maintained.2` mit mindestens 1 nennt), `Stufe 1 gekauft: ja, …` oder `Stufe 1 gekauft: nein, …` (ja, wenn
  `TOPUPS 1 USD` seit dem Rollout mindestens 1 zählt) und `Nächster Schritt: …` nach Entscheidung 4. Nie eine Adresse, ein Hash, eine
  IP, ein Betrag je Adresse oder die Uhrzeit einer einzelnen Aufladung.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `db-report.cjs`, `usdc-bands` oder
  `card-visits` nennen (`grep -l -E 'db-report\.cjs|usdc-bands|usdc_bands|card-visits' goals/*/[0-9]*.md`), einmal am Kopf von `dev`
  fahren und nach dem Bau erneut; ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem
  Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a` für Datenbank, Zugriffslog und RPC, nur lesen. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Rollout nötig (`ops/**` ist nicht im
  Laufzeitpfad). Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] `CP_REPORT=topup-bands` zählt jeden Kauf der Stufe 1, über `/pay/1/` mit Bonus wie per direkter Überweisung, und nie eine
      andere Stufe; Test und Selbsttest pflanzen die echte Buchung und waren vor dem Fix rot.
      MVP: Funktion, weil die Zeile `TOPUPS 1 USD` heute jeden Kauf über `/pay/1/` übersieht und die Leitzahl von kunden 18 auf einer
      falschen Null steht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/usdc-bands.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/usdc-bands.sh --selftest | tail -1` muss mit `SELFTEST OK` beginnen.
      Prüfung: `grep -c '101000' test/usdc-bands.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '101000' ops/usdc-bands.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "json_extract(meta, '\$.usd')" ops/db-report.cjs` muss mindestens 1 ausgeben.
- [x] `docs/kunden/nach-dem-update-2026-11.md` zeigt ab dem Rollout von kunden 17 die Antworten 402 je Kennung, die Kartenbesuche und
      die Aufladungen der Stufe 1 mit Befehl und vollständiger Ausgabe, dazu die Korrektur seit dem 06.11., und die Zeilen
      `Neue Kennung:`, `Stufe 1 gekauft:` und `Nächster Schritt:` folgen aus ihr.
      MVP: Funktion, weil erst diese Zahlen zeigen, ob der Befehl zum Update und die Stufe 1 einen zahlenden Kunden bringen.
      Prüfung: `d=docs/kunden/nach-dem-update-2026-11.md; g=$(sed -nE 's/^Gemessen: ([0-9T:-]+Z)$/\1/p' "$d"); [ -n "$g" ] && [ "$g" \> "2026-11-28T06:00:00Z" ] && grep -qE '^\$ bash ops/card-visits\.sh --since 2026-11-27T22:09:54Z --until [0-9T:-]+Z' "$d" && grep -qE '^\$ bash ops/usdc-bands\.sh --since 2026-11-27T22:09:54Z --until [0-9T:-]+Z$' "$d" && grep -qE '^\$ bash ops/usdc-bands\.sh --since 2026-11-06T00:00:00Z --until [0-9T:-]+Z$' "$d" && echo stimmig || echo unstimmig` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE '^(MAINTAINED 402 since 2026-11-27T22:09:54Z until [0-9T:-]+Z: [0-9]+ answers 402 on /v1/chat/completions to automaton-maintained runtimes|TOPUPS 1 USD since 2026-11-27T22:09:54Z until [0-9T:-]+Z: [0-9]+ by foreign addresses|TOPUPS 1 USD since 2026-11-06T00:00:00Z until [0-9T:-]+Z: [0-9]+ by foreign addresses)$' docs/kunden/nach-dem-update-2026-11.md` muss genau 3 ausgeben.
      Prüfung: `awk '/^MAINTAINED 402 VERSION automaton-maintained\/0\.2\.2-maintained\.([2-9]|[1-9][0-9]+): [1-9]/{k=1} /^TOPUPS 1 USD since 2026-11-27T22:09:54Z /{t=$(NF-3)} /^Neue Kennung: /{a=$3; n++} /^Stufe 1 gekauft: /{b=$4; m++} /^Nächster Schritt: /{s++} END{print (n==1 && m==1 && s==1 && a==(k?"ja,":"nein,") && b==((t>=1)?"ja,":"nein,")) ? "stimmig" : "unstimmig"}' docs/kunden/nach-dem-update-2026-11.md` muss genau `stimmig` ausgeben.
      Prüfung: `grep -cE '0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}' docs/kunden/nach-dem-update-2026-11.md` muss 0 ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; d=docs/kunden/nach-dem-update-2026-11.md; u=$(sed -nE 's/^\$ bash ops\/usdc-bands\.sh --since 2026-11-06T00:00:00Z --until ([0-9T:-]+Z)$/\1/p' "$d"); diff <(bash ops/usdc-bands.sh --since 2026-11-06T00:00:00Z --until "${u:?}" 2>/dev/null | grep -E '^TOPUPS 1 USD ') <(grep -E '^TOPUPS 1 USD since 2026-11-06T' "$d")` muss nichts ausgeben.
- [x] Die Entscheidungen stehen in `goals/kunden/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, was als Kauf der Stufe 1 zählt und warum das Fenster am Rollout beginnt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, kunden 19: ' goals/kunden/ANNAHMEN.md` muss mindestens 4 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/db-report\.cjs|ops/usdc-bands\.sh|ops/usdc_bands\.py|test/usdc-bands\.test\.ts|docs/kunden/nach-dem-update-2026-11\.md|goals/kunden/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test ops docs | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Kein Aufruf in der Produktion, der etwas anlegt oder bucht; gelesen wird nur über `ops/card-visits.sh`, `ops/usdc-bands.sh`,
      `ops/access-log.sh`, `ops/db-report.cjs` mit `readonly: true` und den öffentlichen RPC von Base.
- [ ] Die Ausgaben in den Codeblöcken sind genau die der Werkzeuge, ungekürzt und unverändert.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde, keine Uhrzeit einer einzelnen
      Aufladung.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `src/payments/**`, `src/auth/**`: unverändert
- `ops/db-report.cjs`: nur die Zählung `topups_1usd` im Bericht `topup-bands`, die übrigen Berichte Byte für Byte; `ops/usdc-bands.sh`
  und `ops/usdc_bands.py`: nur die gepflanzten Zeilen und neue Selbsttestfälle; `ops/**` sonst: unverändert
- `test/**` außer `test/usdc-bands.test.ts`: unverändert; dort keine Erwartung gestrichen
- `docs/kunden/stufe-1-2026-11.md`, `docs/kunden/kennung-2026-11.md`, `ROADMAP.md`, `docs/kette.md`, `docs/richtung/**`, bestehende
  Goal-Dateien und Vorschläge: nur lesen
- jede Wallet-Bewegung, jeder Kauf und jede Aufladung (auch kein Aufruf von `/pay/` zum Testen), jedes Schreiben in der Produktion,
  ein Rollout oder Neustart durch einen Agent, jeder Kontakt zum Betreiber eines Automatons (`third_party_mail`), im Fork
  `matthiashippe/automaton` keine Änderung
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-28 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: `CP_REPORT=topup-bands` zählt `meta.usd` 1 oder ohne `meta.usd` 100000 mc (gegen den Bericht von `71202a7` 6 von 14 Tests rot, Selbsttest 3 FAIL), Messung am 2026-11-28T13:05:16Z in `docs/kunden/nach-dem-update-2026-11.md` (1000 Antworten 402 nur an `0.2.2-maintained.1`, 0 Aufladungen der Stufe 1, Korrektur seit 06.11. bleibt 0), 9 Zeilen kunden 19 in `ANNAHMEN.md`, die 45 mitziehenden Prüfbefehle vor und nach dem Bau wie erwartet. Prüfbefehle: vitest usdc-bands Exit 0 (14 passed); Selbsttest `SELFTEST OK`; `101000` im Test 8, im Skript 6; `json_extract(meta, '$.usd')` 2 (GNU grep); Punkt 2 `stimmig`, 3, `stimmig`, 0, Netz-diff leer; Punkt 3 9, 0, 0; `check` Exit 0 (3000 passed).

## Blockers
- keine
