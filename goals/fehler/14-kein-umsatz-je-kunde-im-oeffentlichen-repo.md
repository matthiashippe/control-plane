# Fehler Goal 14: Kein Umsatz je Kunde im öffentlichen Repo

## Status
ACTIVE

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
- **Stand und Weg nach Neuansatz 1 (Tech Lead, 27.11.2026).** Zyklus 1 hat Punkt 1, 3 und 4 gebaut (`e1762a3`), kein
  Verdict gibt es noch. Gescheitert ist das Goal nicht am Code, sondern an seinem eigenen Text: Entscheidung 5 und die zweite
  Prüfung von Punkt 2 schrieben echte Beträge des Sandbox-Kunden als gepflanzte Texte vor, und der Test auf dem Branch trägt sie
  (Vorschlag `goals/_vorschlaege/fehler-kritik-2026-11-27-1.md`, Schwere 5). Der Test hätte damit genau den Fehler, den er fangen
  soll, in einer Datei festgeschrieben, die kein Scan liest. Neuer Weg, in dieser Reihenfolge:
  1. `dev` in den Goal-Branch holen (Merge, kein Rebase). Auf `dev` liegt schon `8da56a4` (feste Uhr in
     `test/house-report-parity.test.ts`, PRO-31442), damit ist der zweite Blocker von Punkt 5 weg. Die Maske für `ROADMAP.md`
     Zeile 18 und 24 kommt mit PR #467; ist er noch offen, baust du Schritt 2 und 3 trotzdem und holst `dev` nach seinem Merge
     noch einmal.
  2. In `test/no-customer-revenue.test.ts` jeden Betrag in gepflanzten Texten und Kommentaren durch einen erfundenen ersetzen,
     der in keinem Bericht des Repos vorkommt: mindestens „Er hat dreimal 7 USD gezahlt“ (ganzer Betrag) und „Kunde 9 gab
     12,34 USD aus“ (Nachkommastellen) als Treffer, „Summe aller fremden Kunden: 56,78 USD in der Woche“ und „Schrittguthaben von
     10 Cent“ als kein Treffer. Das gilt für jeden Betrag mit Nachkommastellen im Test, auch für Tabellenzeilen, Summen über
     mehrere Adressen, Fixture-Klammern und Werkzeugzeilen, denn auch eine Summe über zwei Zahler oder eine Wochensumme mit nur
     einer fremden Adresse ist ein Betrag je Kunde. Ob ein Betrag erfunden ist, prüft Punkt 2 gegen `d668966`, den Kopf von `dev`
     vor jeder Maske; die Prüfung gibt nur eine Zahl aus, nie den Betrag.
  3. Gegenprobe (Grundregel 3): Jede neue Erwartung einmal rot sehen (Muster kurz entschärfen, Lauf, zurück) und die Zeile im
     Progress Log nennt, womit; Datei und Zeile der echten Treffer, nie Beträge.
  4. Dann Punkt 2, 5 und alle Prüfbefehle neu fahren und als Zyklus 1 übergeben (die Zählung beginnt nach dem Neuansatz neu).
- **Was der Text dieses Goals nie enthält:** einen Betrag, eine Zeit oder einen Dateinamen mit Betrag, der einem einzelnen Kunden
  gehört, auch nicht in einem Prüfbefehl. Prüfbefehle suchen nach Mustern (`[0-9]+ USD`) oder vergleichen gegen einen Commit.
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
  5. **Gegenprobe in beide Richtungen** (Grundregel 3, neu gefasst im Neuansatz 1): Der Test prüft seine Muster an gepflanzten
     Texten mit erfundenen Beträgen, mindestens „Er hat dreimal 7 USD gezahlt“ (ganzer Betrag) und „Kunde 9 gab 12,34 USD aus“
     (Nachkommastellen) als Treffer und „Summe aller fremden Kunden: 56,78 USD in der Woche“ sowie „Schrittguthaben von 10 Cent“
     als kein Treffer. Kein Betrag im Test stammt aus einem Bericht über Kunden. Am Kopf von `dev` ist der Test über die echten
     Dateien rot; die Zeile im Progress Log nennt Datei und Zeile der Treffer, nicht die Beträge.
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
- [x] In `docs/kunden/sandbox-kunde-2026-11.md` und `docs/richtung/2026-11-26.md` steht kein Betrag und keine Uhrzeit einer Aufladung
      des Sandbox-Kunden mehr; die Sätze stehen maskiert da.
      MVP: Funktion, weil diese beiden Dateien heute Zahl, Höhe und Zeit seiner Zahlungen öffentlich nennen.
      Prüfung: `cat docs/kunden/sandbox-kunde-2026-11.md docs/richtung/2026-11-26.md | grep -c -E 'zweimal [0-9]+ USD|je [0-9]+ USD auf|[0-9]+,[0-9]{2} USD Inferenz'` muss 0 ausgeben.
      Prüfung: `cat docs/kunden/sandbox-kunde-2026-11.md docs/richtung/2026-11-26.md | grep -c -F '*.**'` muss mindestens 3 ausgeben.
- [x] `test/no-customer-revenue.test.ts` fängt jeden Betrag je Kunde in den Dateien aus Entscheidung 4, ganz oder mit
      Nachkommastellen, und lässt Summen und feste Beträge des Produkts durch; er war am Kopf von `dev` rot.
      MVP: Funktion, weil die Prüfung der Linse B nur Beträge mit zwei Nachkommastellen fing und der nächste Bericht über einen Kunden
      sonst denselben Fehler wieder nach `dev` bringt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/no-customer-revenue.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in 'dreimal 7 USD gezahlt' 'Kunde 9 gab 12,34 USD aus' 'Summe aller fremden Kunden: 56,78 USD' '10 Cent'; do grep -qF "$t" test/no-customer-revenue.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -oE '[0-9]+[.,][0-9]+ ?USDC?' test/no-customer-revenue.test.ts | grep -oE '^[0-9]+[.,][0-9]+' | tr . , | sort -u | while read -r a; do git grep -qF "$a" d668966 -- 'docs/*.md' ROADMAP.md STATE.md 'goals/kunden/*.md' && echo x; git grep -qF "$(echo "$a" | tr , .)" d668966 -- 'docs/*.md' ROADMAP.md STATE.md 'goals/kunden/*.md' && echo x; done | wc -l` muss 0 ausgeben.
      Prüfung: `grep -oE '[a-zäöü]+mal [0-9]+ USD' test/no-customer-revenue.test.ts | sort -u | while read -r a; do git grep -qF "$a" d668966 -- 'docs/*.md' ROADMAP.md STATE.md 'goals/kunden/*.md' && echo x; done | wc -l` muss 0 ausgeben.
- [x] kunden 16 trägt im Dateinamen und in der ersten Zeile keinen Betrag und im Active Objective keine Uhrzeit einer Aufladung;
      sonst ist die Datei unverändert.
      MVP: Funktion, weil Dateiname und Titel heute den Gesamtbetrag des einen Kunden nennen.
      Prüfung: `ls goals/kunden/16-*.md` muss genau `goals/kunden/16-warum-der-erste-sandbox-kunde-nach-einem-tag-aufhoert.md` ausgeben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -M -- goals/kunden/ | grep -F '16-warum-der-erste-sandbox-kunde' | awk '{print ($1<=3 && $2<=3) ? "klein" : "zu viel"}'` muss genau `klein` ausgeben.
      Prüfung: `grep -c -E 'kunden/16-[a-z0-9-]*usd' docs/kunden/sandbox-kunde-2026-11.md` muss 0 ausgeben.
      Prüfung: `grep -c -F 'goals/kunden/16-warum-der-erste-sandbox-kunde-nach-einem-tag-aufhoert.md' docs/kunden/sandbox-kunde-2026-11.md` muss 1 ausgeben.
- [x] `goals/RISIKEN.md` trägt die Zeile vom 2026-11-27 mit Fundstellen und Entscheidung, `goals/fehler/ANNAHMEN.md` die
      Entscheidungen, und der Diff bleibt in den Pfaden dieses Goals.
      MVP: Funktion, weil das nächste Glied wissen muss, warum Historie und Verdicts bleiben und die Prüfung im Test sitzt.
      Prüfung: `grep -c -E '^\| 2026-11-27 \| Grundregel 8, Umsatz je Kunde' goals/RISIKEN.md` muss genau 1 ausgeben.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 14: ' goals/fehler/ANNAHMEN.md` muss mindestens 4 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(docs/.*\.md|test/no-customer-revenue\.test\.ts|goals/fehler/.*|goals/kunden/16-.*\.md|goals/RISIKEN\.md|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test goals/kunden/verdicts | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] Ein Betrag, dessen Zusammenhang genau eine Zahlung, einen Zahler oder eine Adresse nennt, gilt als Betrag je Kunde, auch ohne
      Kundenmuster im Absatz und auch hinter `über`: `test/no-customer-revenue.test.ts` meldet `1 über <Betrag>` und
      `<Betrag> (1 Adresse)` oder `(1 Zahler`, und die Fundstellen dieser Art in den Dateien aus Entscheidung 4 stehen maskiert, dazu
      der Satz zur einen Zahlung derselben Woche in `docs/richtung/2026-11-19.md`. Kritik des Tech Lead, 27.11.2026.
      MVP: Funktion, weil die Tabellen der Richtungs-Checks die eine fremde Zahlung einer Woche als Betrag nennen und die Zeilen kein
      Kundenmuster tragen, so dass der Test sie heute durchlässt.
      Prüfung: `git grep -n -E '(\b1 über [0-9]+([.,][0-9]+)? ?USDC?|[0-9]+([.,][0-9]+)? ?USDC? \(1 (Adresse|Zahler|Wallet)\b|derselben Woche [0-9]+([.,][0-9]+)? ?USDC? davon)' HEAD -- 'docs/kunden/*.md' 'docs/richtung/*.md' docs/kette.md ROADMAP.md STATE.md 'goals/kunden/[0-9]*.md' | wc -l` muss 0 ausgeben.
      Prüfung: `for t in '1 über 4,56 USD (1 Zahler)' '0,09 USD (1 Adresse)'; do grep -qF "$t" test/no-customer-revenue.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/no-customer-revenue.test.ts` muss Exit-Code 0 haben.
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

## Neuansätze
1. 2026-11-27: Ursache: Entscheidung 5 und die zweite Prüfung von Punkt 2 schrieben echte Beträge des Sandbox-Kunden als gepflanzte Testtexte vor, so war Punkt 2 nicht regelkonform erreichbar (Grundregel 8); neuer Weg: nur erfundene Beträge im Test, geprüft gegen `d668966` mit einer Zählung statt einer Liste, die Goal-Datei selbst ohne Kundenbetrag, `dev` mit der festen Uhr von `test/house-report-parity.test.ts` zuerst in den Branch.

## Progress Log
- 2026-11-27 Zyklus 1: Punkte 1, 3 und 4 gebaut, 2 und 5 offen: Beträge, Zahl und Uhrzeiten der Aufladungen des Sandbox-Kunden in `docs/kunden/sandbox-kunde-2026-11.md`, `docs/richtung/2026-11-26.md` und `docs/richtung/2026-11-19.md` maskiert, kunden 16 umbenannt (2 Zeilen), `test/no-customer-revenue.test.ts` neu, am Kopf von `dev` d668966 rot mit 10 Fundstellen (`ROADMAP.md:18`, `ROADMAP.md:24`, `docs/kunden/sandbox-kunde-2026-11.md:151`, `docs/richtung/2026-11-19.md:31`, `docs/richtung/2026-11-26.md:17`, `:29`, `:105`, `:109`, `:129`, kunden 16 Zeile 1), am Kopf nur noch `ROADMAP.md:18` und `:24`; die Prüfbefehle der DONE-Goals, die die geänderten Dateien nennen, liefern vor und nach dem Bau dieselbe Ausgabe. Prüfbefehle: P1 0, 9; P2 vitest Exit 1 (nur `ROADMAP.md:18` und `:24`), nichts fehlt; P3 genau der neue Name, `klein`, 0; P4 1, 7, 0, 0; P5 `check` Exit 1 (2 von 2940 rot: dieser Test und `test/house-report-parity.test.ts`, `deadline_too_soon`).
- 2026-11-27 Zyklus 1 (nach Neuansatz 1): Punkt 2 nachgezogen, 2 und 5 offen wegen `ROADMAP.md:18` und `:24` (PR #467 noch offen): `dev` (`eb60d8a`, mit `8da56a4`) in den Branch gemergt, in `test/no-customer-revenue.test.ts` jeden Betrag in gepflanzten Texten und Kommentaren durch erfundene ersetzt (`f2e7296`). Gegenprobe: je eine Wegwerf-Kopie unter `test/` mit entschärftem Muster (`gezahlt` weg, `AMOUNT` ohne Dezimalteil, Kontext `Summe aller`, `Schrittguthaben`, `ALLOWED_AFTER`, `FIXTURE_ADDRESS`, Klammer nach Test, Fence-Zeilen) macht jeweils genau die zugehörige Erwartung rot; P2c und P2d zählen gegen den Teststand von `e1762a3` 15 und 1, am Kopf 0. Prüfbefehle: P1 0, 9; P2 vitest Exit 1 (10 von 11 grün, Treffer nur `ROADMAP.md:18`, `ROADMAP.md:24`), nichts fehlt, 0, 0; P3 genau der neue Name, `klein`, 0, 1; P4 1, 9, 0, 0; P5 `check` Exit 1 (1 von 2940 rot: nur dieser Test, `test/house-report-parity.test.ts` grün).
- 2026-11-27 Zyklus 2: Punkte 2 und 5 gebaut: `dev` mit PR #467 (`85dc59d`, Maske in `ROADMAP.md`) in den Branch gemergt, am Test nichts geändert. Gegenprobe: `test/no-customer-revenue.test.ts` vom Kopf in einem Worktree auf `d668966` rot (1 von 11, Exit 1), am Kopf grün. Prüfbefehle: P1 0, 9; P2 vitest Exit 0 (11 von 11), nichts fehlt, 0, 0; P3 genau der neue Name, `klein`, 0, 1; P4 1, 9, 0, 0; P5 `check` Exit 0 (2940 von 2940).
- 2026-11-27 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4 und 5: alle Prüfbefehle am Kopf `997f0be` wie in der Zeile davor, am PR #466 `check` und `e2e` grün.
- 2026-11-27 Zyklus 3: Punkt 6 gebaut, offen wegen der zweiten Prüfung: `docs/richtung/2026-11-19.md` Zeile 19, 20 und 40 und `docs/richtung/2026-11-26.md` Zeile 30 maskiert; `test/no-customer-revenue.test.ts` meldet einen Betrag hinter `1 über` oder vor `(1 Adresse`, `(1 Zahler` oder `(1 Wallet` auch ohne Kundenmuster und hinter `über`. Gegenprobe: `SINGLE_BEFORE` oder `SINGLE_AFTER` leer macht je die neue Erwartung rot; ohne die Maske meldet der Test 3 Absätze (`docs/richtung/2026-11-19.md:19`, `:20`, `docs/richtung/2026-11-26.md:30`). Mit `0,09 USD (1 Adresse)` im Test zählt die dritte Prüfung von Punkt 2 1 (Teil von Daten wie „20.09.“ in `d668966`), deshalb steht dort `0,97 USD` (`goals/fehler/ANNAHMEN.md`). Prüfbefehle: P1 0, 9; P2 vitest Exit 0 (12 von 12), nichts fehlt, 0, 0; P3 genau der neue Name, `klein`, 0, 1; P4 1, 10, 0, 0; P5 `check` Exit 0 (2941 von 2941); P6 0 (vorher 4), `fehlt: 0,09 USD (1 Adresse)`, vitest Exit 0.

## Blockers
- Punkt 6, zweite Prüfung: verlangt `0,09 USD (1 Adresse)` im Test, das macht die dritte Prüfung von Punkt 2 rot; den Betrag im Prüfbefehl kann nur der Tech Lead tauschen (Vorschlag `0,97 USD`).
