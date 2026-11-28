# Fehler Goal 16: Auch eine einzelne Zahlung und eine Summe ohne Zählung fängt der Test

## Status
ACTIVE

## Active Objective
`test/no-customer-revenue.test.ts` aus fehler 14 hält Beträge je Kunde aus den Berichten über Kunden, lässt aber zwei Formen
durch: „eine (fremde) Zahlung über <Betrag>“, weil `über` in `ALLOWED_BEFORE` steht und `SINGLE_BEFORE` nur „1 über“ kennt
(`test/no-customer-revenue.test.ts:58` und `:82`), und jeden Betrag hinter „Summe aller …: “ (`:66`), auch wenn die Summe nur einen
oder zwei Kunden umfasst. So steht in `goals/kunden/02-wer-bei-conway-noch-zahlt.md` Zeile 8 (DONE, eingefroren) bis heute der Betrag
der einen fremden Zahlung einer Woche, also der Betrag eines einzelnen Kunden (Grundregel 8). Dazu nennt
`goals/_vorschlaege/kunden-redteam-2026-11-27-1.md` Zeile 13 zwei Uhrzeiten von Aufladungen des einen Sandbox-Kunden, die Goal 16 und
`docs/richtung/2026-11-26.md` maskieren, und `goals/RISIKEN.md` Zeile 10 führt aus dieser Datei nur Zeile 11. Nach diesem Goal
meldet der Test beide Formen, die Stellen stehen maskiert, und `RISIKEN.md` führt den Rest.
Leitzahl: Absätze mit einem Betrag je Kunde in den Dateien des Scans, die der Test durchlässt, Ziel 0 (heute mindestens 1, kunden 02
Zeile 8; die Summe ohne Zählung in `ROADMAP.md` Zeile 19 maskiert der Pflege-PR vom 28.11.2026).
Widerlegt, wenn `grep -c -E 'eine fremde Zahlung über [0-9]' goals/kunden/02-wer-bei-conway-noch-zahlt.md` am Kopf von `dev` schon 0
zählt und der Test „eine Zahlung über 3,21 USD“ schon meldet.
MVP: Funktion, weil das Repo öffentlich ist und ein Betrag je Kunde, den der Test durchlässt, mit dem nächsten Bericht wieder nach
`dev` kommt.

## Voraussetzungen
- fehler Goal 15 DONE

## Kontext für den Maker
- Ziel in einem Satz: Wer das öffentliche Repo liest, erfährt nie, wie viel ein einzelner Kunde gezahlt hat, auch nicht über die
  Form „eine Zahlung über“ oder über eine Summe, hinter der nur ein Kunde steht.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Ein Betreiber, der seine eigene Zahlung im Repo eines Anbieters
  wiederfindet, kommt nicht; der Test hält das für jeden künftigen Bericht, ohne dass eine Linse daran denken muss.
- Quelle: `ROADMAP.md`, Topic `fehler`, Glied 16 (Tech Lead 28.11.2026, PRO-32469 aus der Triage PRO-32461, Glied 1). Übernimmt
  `goals/_vorschlaege/fehler-kritik-2026-11-27-3.md`, `goals/_vorschlaege/fehler-kritik-2026-11-27-4.md` und
  `goals/_vorschlaege/kunden-redteam-2026-11-28-1.md`. Vorgänger `goals/fehler/14-kein-umsatz-je-kunde-im-oeffentlichen-repo.md`
  (DONE), Muster der Maske dort (Betrag `*.**`, Zeit `**:**`).
- Gemessen vor dem Schreiben (Tech Lead, 28.11.2026, Kopie des Tests mit beiden neuen Regeln in einem Worktree von `dev` an
  `edd89ea`, nicht committet): Der Test über die echten Dateien meldet dann genau `goals/kunden/02-wer-bei-conway-noch-zahlt.md:6`
  (der Absatz mit Zeile 8) und `ROADMAP.md:19` (Summe ohne Zählung, maskiert der Pflege-PR); die Summe über die Conway-Zahler in
  derselben Zeile bleibt durch, weil sie „von <n> aufladenden Wallets“ nennt. Ist der Pflege-PR noch nicht gemergt, holst du `dev`
  nach seinem Merge in den Branch, bevor du übergibst.
- **Entscheidungen des Tech Lead (28.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, fehler 16: …` in
  `goals/fehler/ANNAHMEN.md`.
  1. **Eine einzelne Zahlung ist ein Betrag je Kunde:** Steht direkt vor dem Betrag „eine Zahlung über“ oder „eine fremde Zahlung
     über“ (groß oder klein geschrieben), meldet der Test ihn wie „1 über“, mit oder ohne Kundenmuster im Absatz. „jede Zahlung über“,
     „Zahlungen über“ und Schwellen wie „ab“ oder „unter“ bleiben erlaubt.
  2. **Eine Summe ohne Zählung ist kein Freibrief:** Ein Betrag hinter „Summe aller …: “ oder „Summe über alle …: “ ist nur erlaubt,
     wenn direkt dahinter, vor dem nächsten Punkt, Semikolon oder Tabellenstrich, eine Zählung ab 3 steht, als „(<n> Adressen)“,
     „(<n> Zahler)“ oder „von <n> (…) Adressen|Zahlern|Wallets|Kunden“. Sonst meldet der Test ihn, mit oder ohne Kundenmuster. Ab 3
     und nicht ab 2 wie in der Kritik, weil `ALLOWED_AFTER` schon heute eine Summe über zwei Zahler meldet (jeder der beiden kennt aus
     seinem Betrag den des anderen). Das löst für die Summe ohne Zählung Entscheidung 5 von fehler 14 ab („Summe aller fremden Kunden:
     56,78 USD in der Woche“ als kein Treffer); der gepflanzte Text bleibt im Test, mit Zählung als kein Treffer und ohne Zählung als
     Treffer, so dass die Prüfbefehle von fehler 14 unverändert grün bleiben.
  3. **kunden 02 wird trotz DONE angepasst**, nur in Zeile 8: der Betrag als `*.**`, sonst Zeichen für Zeichen gleich. Grund wie bei
     kunden 16 in fehler 14 (Entscheidung 2): Grundregel 8 ist ein Verbot aus `loop-constraints.md` und geht dem Einfrieren vor, und
     kein Prüfbefehl von kunden 02 nennt den Betrag. Der Goal-PR geht deshalb in die Human Inbox, die hier der Tech Lead ist.
  4. **Der Vorschlag vom 27.11. wird an Zeile 13 maskiert**, nur die beiden Uhrzeiten als `**:**`, sonst Zeichen für Zeichen gleich;
     ein Vorschlag ist kein Vertrag eines Goals, und Grundregel 8 gilt für ihn wie für jede Datei. Die Zeile vom 2026-11-27 in
     `goals/RISIKEN.md` nennt danach unter den maskierten Stellen kunden 02 Zeile 8 und den Vorschlag Zeile 13 (Pfad und Zeile, nie
     Betrag oder Zeit). Historie und Verdicts bleiben wie in fehler 14 Entscheidung 3.
  5. **Uhrzeiten im Test bleiben außen vor:** Der Test sucht weiter Beträge, keine Uhrzeiten; eine Uhrzeit allein führt nicht zur
     Wallet, nur mit Betrag, und ein Muster für Uhrzeiten neben Aufladungen würde jede Zeitangabe eines Rollouts treffen (Schwere 2
     im Vorschlag).
- **Gegenprobe in beide Richtungen** (Grundregel 3): nur erfundene Beträge im Test, mindestens „Bei uns kam eine fremde Zahlung über
  3,21 USD an.“ und „Es gab eine Zahlung über 8 USD.“ als Treffer, „Summe aller fremden Kunden: 56,78 USD in der Woche.“ als Treffer,
  „Summe aller fremden Kunden: 56,78 USD in der Woche (4 Zahler).“ und „Summe aller Conway-Zahler: 432 USDC in 30 Tagen von 17
  aufladenden Wallets“ als kein Treffer, „Bonus auf jede Zahlung über 5 USD“ und „Eine Zahlung über *.** USD“ als kein Treffer. Jede
  neue Erwartung einmal rot sehen (Regel kurz entschärfen, Lauf, zurück); die Zeile im Progress Log nennt, womit, und Datei und Zeile
  der echten Treffer, nie Beträge.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die den Test, kunden 02 oder den Vorschlag
  nennen (`grep -l -E 'no-customer-revenue|kunden/02-|kunden-redteam-2026-11-27-1' goals/*/[0-9]*.md`), einmal am Kopf von `dev`
  fahren und nach dem Bau erneut. Ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben ohne Betrag als Frage an den Tech
  Lead auf dem Topic.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue
  Dateien vor dem lokalen `check` stagen. Kein Zugriff auf die Produktion nötig. Code, Bezeichner, Testnamen und Ausgaben englisch.
  Kein Betrag je Kunde und keine Uhrzeit einer Aufladung in Commit-Text, PR-Text, Kommentar oder Progress Log.

## Done Condition
- [x] `test/no-customer-revenue.test.ts` meldet einen Betrag hinter „eine (fremde) Zahlung über“ und einen Betrag hinter „Summe
      aller …: “ ohne Zählung ab 3, und lässt die Summe mit Zählung ab 3 und die Schwellen des Produkts durch; die neuen Fälle waren
      vor der Änderung rot.
      MVP: Funktion, weil der Test diese beiden Formen heute durchlässt und so der Betrag einer einzelnen fremden Zahlung auf `dev` steht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/no-customer-revenue.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in 'eine fremde Zahlung über 3,21 USD' 'eine Zahlung über 8 USD' 'Summe aller fremden Kunden: 56,78 USD in der Woche (4 Zahler)' 'von 17 aufladenden Wallets' 'jede Zahlung über 5 USD'; do grep -qF "$t" test/no-customer-revenue.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'Zahlung über' test/no-customer-revenue.test.ts` muss mindestens 4 ausgeben.
- [x] kunden 02 trägt in Zeile 8 keinen Betrag mehr, sonst ist die Datei unverändert.
      MVP: Funktion, weil diese Zeile den Betrag der einen fremden Zahlung einer Woche öffentlich nennt.
      Prüfung: `grep -c -E 'eine fremde Zahlung über [0-9]' goals/kunden/02-wer-bei-conway-noch-zahlt.md` muss 0 ausgeben.
      Prüfung: `grep -c -F 'eine fremde Zahlung über *.**' goals/kunden/02-wer-bei-conway-noch-zahlt.md` muss genau 1 ausgeben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -- goals/kunden/02-wer-bei-conway-noch-zahlt.md | awk '{print ($1<=1 && $2<=1) ? "klein" : "zu viel"}'` muss genau `klein` ausgeben.
- [x] Zeile 13 des Red-Team-Vorschlags vom 27.11. nennt keine Uhrzeit mehr, und `goals/RISIKEN.md` führt beide Stellen.
      MVP: Funktion, weil die beiden Zeiten mit dem Tag der Aufladung auf die öffentliche Überweisung des Sandbox-Kunden zeigen.
      Prüfung: `sed -n 13p goals/_vorschlaege/kunden-redteam-2026-11-27-1.md | grep -oE '[0-9]{2}:[0-9]{2}' | wc -l` muss 0 ausgeben.
      Prüfung: `sed -n 13p goals/_vorschlaege/kunden-redteam-2026-11-27-1.md | grep -oF '**:**' | wc -l` muss genau 2 ausgeben.
      Prüfung: `git diff --numstat $(git merge-base origin/dev HEAD) HEAD -- goals/_vorschlaege/kunden-redteam-2026-11-27-1.md | awk '{print ($1<=1 && $2<=1) ? "klein" : "zu viel"}'` muss genau `klein` ausgeben.
      Prüfung: `grep -E '^\| 2026-11-27 \| Grundregel 8' goals/RISIKEN.md | grep -c -E 'kunden-redteam-2026-11-27-1\.md. Zeile 11 und 13'` muss genau 1 ausgeben.
- [x] Die Entscheidungen stehen in `goals/fehler/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum eine Summe erst ab drei Zahlern als Summe gilt.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, fehler 16: ' goals/fehler/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(test/no-customer-revenue\.test\.ts|goals/kunden/02-wer-bei-conway-noch-zahlt\.md|goals/_vorschlaege/kunden-redteam-2026-11-27-1\.md|goals/fehler/.*|goals/RISIKEN\.md|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test goals | wc -l` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Ein neuer Bericht mit „eine fremde Zahlung über 9 USD“ oder „Summe aller fremden Kunden: 9 USD“ ohne Zählung macht `check` rot.
- [ ] Eine Summe über alle mit Zählung ab 3, eine Schwelle und ein Preis des Produkts machen `check` nicht rot.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde und keine Uhrzeit einer Aufladung in
      Commit, PR, Kommentar oder Progress Log.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/**`, `ops/**`, `mcp/**`, `docs/**`, `README.md`, `ROADMAP.md`, `STATE.md`: unverändert; meldet der Test dort nach dem Merge des
  Pflege-PR vom 28.11.2026 noch eine Stelle, fragt der Maker den Tech Lead auf dem Topic mit Datei und Zeile
- `goals/*/verdicts/**`: unverändert, auch wenn dort ein Betrag steht (fehler 14 Entscheidung 3)
- bestehende Goal-Dateien außer kunden 02 Zeile 8 und Vorschläge außer `goals/_vorschlaege/kunden-redteam-2026-11-27-1.md` Zeile 13:
  unverändert
- `test/**` außer `test/no-customer-revenue.test.ts`: unverändert; dort keine bestehende Erwartung gestrichen, nur die zur Summe
  ohne Zählung nach Entscheidung 2 umgestellt
- Force-Push, Löschen eines Branches, Umschreiben der Historie, Änderung der Sichtbarkeit des Repos
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-28 Zyklus 1: Punkte 1, 2, 3, 4 und 5 gebaut: `test/no-customer-revenue.test.ts` meldet einen Betrag hinter „eine (fremde) Zahlung über“ (`SINGLE_BEFORE`) und hinter „Summe aller …: “ ohne Zählung ab 3 bis zum nächsten Punkt, Semikolon oder Tabellenstrich (`TOTAL_BEFORE`, `TOTAL_COUNT`), kunden 02 Zeile 8 und der Vorschlag vom 27.11. Zeile 13 maskiert, `goals/RISIKEN.md` und `goals/fehler/ANNAHMEN.md` nachgezogen. Rot gesehen: die neuen Erwartungen mit den alten Regeln (2 von 16 rot); Gegenprobe je Regel: ohne die Regel für „eine Zahlung über“, ohne die Meldung der Summe ohne Zählung, mit einer Zählung ab 1 und mit einer Zählung ohne Grenze am Satzende wird je ein neuer Fall rot, ohne erkannte Zählung dazu `ROADMAP.md:19`; ohne die Maske meldet der Test `goals/kunden/02-wer-bei-conway-noch-zahlt.md:6`. Die Prüfungen von fehler 14 ohne Netz geben vor und nach dem Bau dieselben Werte aus. Prüfbefehle: P1 vitest Exit 0 (16 von 16), nichts fehlt, 11; P2 0, 1, `klein`; P3 0, 2, `klein`, 1; P4 6, 0, 0; P5 `check` Exit 0 (2979 von 2979, 212 s).
- 2026-11-28 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4 und 5, `dev` am Kopf `5baa0cc` ohne neuen Commit gegenüber der Merge-Basis, kein Merge nötig. Prüfbefehle: P1 vitest Exit 0 (16 von 16), nichts fehlt, 11; P2 0, 1, `klein`; P3 0, 2, `klein`, 1; P4 6, 0, 0; P5 `check` Exit 0 (2979 von 2979, 169 s).

## Blockers
- keine
