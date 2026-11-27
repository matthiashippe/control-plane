# Fehler Goal 14: Kein Umsatz je Kunde im öffentlichen Repo

## Status
PLANNED

## Active Objective
Auf `dev` stehen Zahl und Höhe der Aufladungen und die Inferenz-Ausgabe des einen Sandbox-Kunden als Beträge, an zwei Stellen mit
der Uhrzeit der Aufladung: in `docs/kunden/sandbox-kunde-2026-11.md` (Zeile 151, dazu der Absatz um Zeile 19 bis 21 im Befund), in
`docs/richtung/2026-11-26.md` (Zeile 19 bis 21, 105 und 131) und im Titel und Dateinamen von kunden 16. Das bricht Grundregel 8
(`loop-constraints.md`: nie Umsatz je Kunde ins Repo), und Zeit plus Betrag führen über die öffentlichen USDC-Überweisungen auf Base
zur Wallet. Die Prüfung, die das hätte fangen sollen (`goals/kunden/verdicts/16-z4-B.md:10`), sucht nur Beträge mit zwei
Nachkommastellen. Nach diesem Goal steht auf `dev` kein Betrag und keine Zeit einer Aufladung je Kunde mehr, und ein Test in `check`
fängt jeden neuen Betrag je Kunde, ganz oder mit Nachkommastellen, bevor er nach `dev` kommt.
Leitzahl: Stellen mit einem Betrag je Kunde im Arbeitsstand von `dev` in den Dateien aus Entscheidung 4, Ziel 0 (heute mindestens
6).
Widerlegt, wenn `cat docs/kunden/sandbox-kunde-2026-11.md docs/richtung/2026-11-26.md | grep -c -E 'zweimal [0-9]+ USD|je [0-9]+ USD auf'`
am Kopf von `dev` schon 0 zählt.
MVP: Funktion, weil das Repo öffentlich ist und jede Stunde mit diesen Zeilen auf `dev` einen zahlenden Kunden kenntlich macht.

## Voraussetzungen
- fehler Goal 13 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer das öffentliche Repo liest, erfährt Zahl und Summe aller Zahlungen, aber nie, wie viel ein einzelner Kunde
  wann bezahlt oder ausgegeben hat.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Ein Betreiber, der sieht, dass wir seine Zahlungen öffentlich
  nachzeichnen, kommt nicht; und ohne den Test fängt der nächste Bericht über einen Kunden denselben Fehler wieder ein.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 14 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/kunden-redteam-2026-11-27-1.md`. Muster der Maske: `docs/kunden/rueckgang-2026-11.md` (Betrag `*.**`, Zeit
  der Aufladung `**:**` oder `****-**-**T**:**:**Z`), Vorfall vom 19.11.2026 in `goals/RISIKEN.md` Zeile 9.
- **Was bleibt erlaubt** (Grundregel 8): Summen über alle Kunden (Zahl der Automatons, Zahl und Summe der Zahlungen, fremde
  Inferenz-Ausgabe je Woche über alle), Zählungen je Kunde (Aufrufe, Zeilen, HTTP-Status), feste Beträge des Produkts (Preise,
  Pakete, Startgutschrift, Schrittguthaben, Schwellen wie „unter 5 USD“), Beträge aus Fixtures mit Adressen aus `198.51.100.0/24`.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 14: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **Maskieren statt löschen:** Jeder Betrag, den ein einzelner Kunde gezahlt oder ausgegeben hat, und jede Uhrzeit seiner
     Aufladung wird wie in `docs/kunden/rueckgang-2026-11.md` durch `*.**` und `**:**` ersetzt; der Satz bleibt, Zählungen bleiben.
     Wo der Text sonst unverständlich würde, steht „(Betrag je Kunde nicht im öffentlichen Repo, Grundregel 8)“.
  2. **kunden 16 wird trotz DONE angepasst**, nur an diesen Stellen: Dateiname und erste Zeile ohne Betrag (neu
     `goals/kunden/16-warum-der-erste-sandbox-kunde-nach-einem-tag-aufhoert.md`, Titel „Warum der erste Sandbox-Kunde nach einem Tag
     aufhört“, wie die erste Zeile von `docs/kunden/sandbox-kunde-2026-11.md`), die Uhrzeiten der Aufladungen im Active Objective
     maskiert, der Verweis in `docs/kunden/sandbox-kunde-2026-11.md` Zeile 5 auf den neuen Namen. Done-Punkte, Prüfbefehle,
     Kästchen, Progress Log und Status bleiben Zeichen für Zeichen. Grund: Grundregel 8 ist ein Verbot aus `loop-constraints.md`
     und geht der Regel vor, dass eine fertige Goal-Datei eingefroren ist; die Umbenennung ändert keinen Prüfbefehl, weil keiner den
     eigenen Pfad nennt. Der Goal-PR geht deshalb in die Human Inbox, die hier der Tech Lead ist (`human_inbox: tech-lead`).
  3. **Verdicts und Git-Historie bleiben**, wie beim Vorfall vom 19.11.2026: kein Force-Push, kein Löschen von Branches, kein Eingriff
     in eine Verdict-Datei, weil die Commits über die gemergten PRs schon öffentlich sind und ein Force-Push sie bei GitHub nicht
     entfernt. Der Maker schreibt dazu eine neue Zeile in `goals/RISIKEN.md` im Format der Zeile vom 19.11.2026, Datum 2026-11-27,
     mit den Fundstellen als Pfad und Zeile, nie mit den Beträgen, und „Entschieden (Tech Lead, 27.11.2026)“.
  4. **Die Prüfung sitzt in `check`, nicht im Prompt der Linse B.** `ops/prompts/**` steht auf der Deny List; ein Test unter `test/`
     läuft in jedem PR und fängt auch Texte, die keine Linse liest (Triage, Roadmap, Nachtläufe). Neuer Test
     `test/no-customer-revenue.test.ts`, ohne Netz: Er liest die Dateien, in denen Berichte über Kunden stehen,
     `docs/kunden/**/*.md`, `docs/richtung/*.md`, `docs/kette.md`, `ROADMAP.md`, `STATE.md` und `goals/kunden/[0-9]*.md`, und meldet jede Zeile, die einen einzelnen Kunden nennt (mindestens `Kunde [0-9]+`, `Sandbox-Kunde`, `von einer Adresse`,
     `seine Wallet`, `seine Aufladung`, `lud .* auf`, `gezahlt`) und dazu einen Betrag `[0-9]+([.,][0-9]+)? ?(USD|USDC)` trägt, der
     nicht `*.**` ist, mit Datei und Zeile in der Fehlermeldung, nie mit dem Betrag. Die Liste der Muster steht als Konstante oben im
     Test; ein Absatz über mehrere Zeilen zählt als eine Einheit (Zeilen bis zur nächsten Leerzeile zusammen), damit ein Umbruch
     zwischen „Kunde 1“ und dem Betrag nicht durchrutscht. Erlaubte Zusammenhänge (Schwelle mit `unter`, `über` oder `ab` vor dem
     Betrag, Paket, Preis, Stufe, Tier, Startgutschrift, Schrittguthaben, Summe über alle) stehen als zweite Konstante daneben und
     gelten nur für den Betrag direkt dahinter. Keine Ausnahmeliste für einzelne Dateien oder Zeilen.
  5. **Gegenprobe in beide Richtungen** (Grundregel 3): Der Test prüft seine Muster an gepflanzten Texten, mindestens „Er hat
     zweimal 5 USD gezahlt“ (ganzer Betrag) und „Kunde 1 gab 10,06 USD aus“ (Nachkommastellen) als Treffer und „Summe aller fremden
     Kunden: 24,77 USD in der Woche“ sowie „Schrittguthaben von 10 Cent“ als kein Treffer. Am Kopf von `dev` ist der Test über die
     echten Dateien rot; die Zeile im Progress Log nennt Datei und Zeile der Treffer, nicht die Beträge.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die eine der geänderten Dateien nennen
  (`grep -l -E 'sandbox-kunde-2026-11|richtung/2026-11-26|kunden/16-' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach
  dem Bau erneut. Wird ein fremder Prüfbefehl rot, weil er einen Betrag je Kunde erwartet, fragt der Maker den Tech Lead auf dem Topic
  mit Befehl und beiden Ausgaben ohne den Betrag; der entscheidet mit einer Zeile `Abgelöst:` im `ANNAHMEN.md` des alten Goals.
- **Funde außerhalb des Scans** (andere Goal-Dateien, Verdicts, `docs/audit/`, falls der Maker den Scan dort nicht grün bekommt,
  ohne eingefrorene Dateien zu ändern): nicht ändern, sondern als Fundstelle mit Pfad und Zeile in die Zeile in `goals/RISIKEN.md`.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Zugriff auf die Produktion nötig. Code, Bezeichner, Testnamen und Ausgaben englisch.
  Kein Betrag je Kunde in Commit-Text, PR-Text, Kommentar oder Progress Log.

## Done Condition
- [ ] In `docs/kunden/sandbox-kunde-2026-11.md` und `docs/richtung/2026-11-26.md` steht kein Betrag und keine Uhrzeit einer Aufladung
      des Sandbox-Kunden mehr; die Sätze stehen maskiert da.
      MVP: Funktion, weil diese beiden Dateien heute Zahl, Höhe und Zeit seiner Zahlungen öffentlich nennen.
      Prüfung: `cat docs/kunden/sandbox-kunde-2026-11.md docs/richtung/2026-11-26.md | grep -c -E 'zweimal [0-9]+ USD|je [0-9]+ USD auf|[0-9]+,[0-9]{2} USD Inferenz'` muss 0 ausgeben.
      Prüfung: `cat docs/kunden/sandbox-kunde-2026-11.md docs/richtung/2026-11-26.md | grep -c -F '*.**'` muss mindestens 3 ausgeben.
- [ ] `test/no-customer-revenue.test.ts` fängt jeden Betrag je Kunde in den Dateien aus Entscheidung 4, ganz oder mit
      Nachkommastellen, und lässt Summen und feste Beträge des Produkts durch; er war am Kopf von `dev` rot.
      MVP: Funktion, weil die Prüfung der Linse B nur Beträge mit zwei Nachkommastellen fing und der nächste Bericht über einen Kunden
      sonst denselben Fehler wieder nach `dev` bringt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/no-customer-revenue.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in 'zweimal 5 USD gezahlt' '10,06 USD' '24,77 USD' '10 Cent'; do grep -qF "$t" test/no-customer-revenue.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
- [ ] kunden 16 trägt im Dateinamen und in der ersten Zeile keinen Betrag und im Active Objective keine Uhrzeit einer Aufladung;
      sonst ist die Datei unverändert.
      MVP: Funktion, weil Dateiname und Titel heute den Gesamtbetrag des einen Kunden nennen.
      Prüfung: `ls goals/kunden/16-*.md` muss genau `goals/kunden/16-warum-der-erste-sandbox-kunde-nach-einem-tag-aufhoert.md` ausgeben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -M -- goals/kunden/ | grep -F '16-warum-der-erste-sandbox-kunde' | awk '{print ($1<=3 && $2<=3) ? "klein" : "zu viel"}'` muss genau `klein` ausgeben.
      Prüfung: `grep -c 'nach-10-usd' docs/kunden/sandbox-kunde-2026-11.md` muss 0 ausgeben.
- [ ] `goals/RISIKEN.md` trägt die Zeile vom 2026-11-27 mit Fundstellen und Entscheidung, `goals/fehler/ANNAHMEN.md` die
      Entscheidungen, und der Diff bleibt in den Pfaden dieses Goals.
      MVP: Funktion, weil das nächste Glied wissen muss, warum Historie und Verdicts bleiben und die Prüfung im Test sitzt.
      Prüfung: `grep -c -E '^\| 2026-11-27 \| Grundregel 8, Umsatz je Kunde' goals/RISIKEN.md` muss genau 1 ausgeben.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 14: ' goals/fehler/ANNAHMEN.md` muss mindestens 4 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(docs/.*\.md|test/no-customer-revenue\.test\.ts|goals/fehler/.*|goals/kunden/16-.*\.md|goals/RISIKEN\.md|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test goals/kunden/verdicts | wc -l` muss 0 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Wer `dev` liest, findet keinen Betrag und keine Zeit einer Aufladung, die einem einzelnen Kunden gehört.
- [ ] Ein neuer Bericht mit „Kunde 2 zahlte 20 USD“ macht `check` rot.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde in Commit, PR oder Kommentar.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `ops/**`, `mcp/**`, `README.md`: unverändert
- `goals/*/verdicts/**`: unverändert, auch wenn dort ein Betrag steht (Entscheidung 3)
- bestehende Goal-Dateien außer kunden 16 an den Stellen aus Entscheidung 2: unverändert; Vorschläge unverändert
- `ROADMAP.md`, `STATE.md`: nur lesen (den Stand von `ROADMAP.md` maskiert der Pflege-PR des Tech Lead vom 27.11.2026); trifft der
  Test dort noch etwas, fragt der Maker den Tech Lead auf dem Topic
- `test/**` außer `test/no-customer-revenue.test.ts`: unverändert
- Force-Push, Löschen eines Branches, Umschreiben der Historie, Änderung der Sichtbarkeit des Repos
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
