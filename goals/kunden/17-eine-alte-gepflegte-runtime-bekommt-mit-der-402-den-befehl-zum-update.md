# Kunden Goal 17: Eine alte gepflegte Runtime bekommt mit der 402 den Befehl zum Update

## Status
PLANNED

## Active Objective
In der Woche vor dem Release `v0.2.2-maintained.3` (2026-11-26T17:28:50Z) gingen alle 4380 Antworten 402 an gepflegte Runtimes an
`automaton-maintained/0.2.2-maintained.1` (`docs/kunden/kartenweg-2026-11.md:17`). Diese Kennung aktualisiert sich nicht selbst und
schreibt die Kartenzeile aus kunden 15 nie ins Terminal; die 402 des Dienstes nennt in `message_for_operator`
(`src/inference/proxy.ts:386`) nur den Kartenlink, nicht den Befehl, mit dem der Mensch die neue Fassung bekommt. Dazu nennt
`docs/paket/anleitung.md` in Zeile 19 und 20 als Ausgabe von `automaton --version` und als Release-Seite noch `0.2.2-maintained.1`,
obwohl Zeile 8 `Release: v0.2.2-maintained.3` sagt. Nach diesem Goal misst `docs/kunden/kennung-2026-11.md` die Kennungen seit dem
Release, die 402 an eine ältere Kennung `automaton-maintained/` trägt zusätzlich das Feld `details.update_command` und einen Satz mit
dem Befehl aus `docs/paket/anleitung.md`, und die Anleitung nennt überall die Fassung aus `Release:`.
Leitzahl: Antworten 402 an gepflegte Runtimes mit älterer Kennung ohne Befehl zum Update, Ziel 0 (vorher 4380 in einer Woche); dazu
gepflegte Runtimes mit der neuen Kennung je Woche (gemessen in Punkt 1).
Widerlegt, wenn die 402 am Kopf von `dev` an `automaton-maintained/0.2.2-maintained.1` schon den Befehl zum Update nennt.
MVP: Funktion, weil die eine Runtime, die heute 402 bekommt, sonst nie die Zeile zeigt, für die kunden 15 gebaut wurde.

## Voraussetzungen
- kunden Goal 16 DONE

## Kontext für den Maker
- Ziel in einem Satz: Der Mensch hinter einer alten gepflegten Runtime ohne Guthaben bekommt von seinem Agenten einen Befehl, mit dem
  seine Runtime ihm danach den Weg per Karte selbst zeigt.
- Was danach schneller zu mehr zahlenden fremden Automatons führt: Diese Runtimes kommen schon zu uns und fragen tausendfach; ihnen
  fehlt nur die Zeile, die ihren Menschen zur Kasse führt. Leitzahl des Topics: fremde Zahlungen je Woche.
- Quelle: `ROADMAP.md`, Topic `kunden`, Glied 17 (Tech Lead 27.11.2026, PRO-31352 aus der Triage PRO-31345). Übernimmt
  `goals/_vorschlaege/kunden-kritik-2026-11-26-4.md` und `goals/_vorschlaege/kunden-kritik-2026-11-26-5.md`.
- **Entscheidungen des Tech Lead (27.11.2026).** Der Maker schreibt jede davon mit Grund als Zeile `- <JJJJ-MM-TT>, kunden 17: …` in
  `goals/kunden/ANNAHMEN.md`.
  1. **Gebaut wird unabhängig von der Messung.** Ob nach dem Release neue Kennungen kommen, ändert nichts daran, dass die alten
     Installationen sich nie selbst aktualisieren; der Befehl geht nur an ältere Kennungen und kostet die neuen nichts. Die Messung
     ist die Zahl vorher.
  2. **Eine Quelle für die Fassung:** eine Konstante `MAINTAINED_RELEASE` in `src/inference/proxy.ts` (oder einer kleinen neuen Datei
     daneben, englisch benannt) mit genau dem Tag aus `Release:` in `docs/paket/anleitung.md`; ein Test liest die Anleitung und
     verlangt Gleichheit, damit ein neues Release ohne diese Zeile `check` rot macht.
  3. **Wer den Befehl bekommt:** eine Anfrage mit `User-Agent: automaton-maintained/0.2.2-maintained.<n>`, deren `<n>` kleiner ist als
     die Zahl in `MAINTAINED_RELEASE`. Jede andere Kennung (neuere, gleiche, fremde, unlesbare, keine) bekommt die 402 Byte für Byte
     wie heute. `createApp` reicht den Kopf über die Optionen von `handleChat` durch; er wird nie geloggt und nie gespeichert.
  4. **Was additiv dazukommt,** nur in der 402 bei offener Annahme (nicht bei `topupsClosed`): `details.update_command` mit genau dem
     Befehl aus dem Block unter `## Installieren` der Anleitung (`npm install -g github:matthiashippe/automaton#<Tag>`), und an
     `message_for_operator` angehängt der Satz `Update this automaton so it shows this itself: <Befehl>`. Text von `message`,
     `required_cents`, `current_balance_cents`, `card_url` und `topup_url` bleiben Byte für Byte (Grundregel 13).
  5. **Die Anleitung:** Zeile 19 nennt als Ausgabe `automaton-maintained <Fassung aus Release: ohne v>`, Zeile 20 die Release-Seite
     dieses Tags. Ein Test verlangt, dass jede Nennung von `0.2.2-maintained.` in `docs/paket/anleitung.md` außerhalb der Liste der
     Commits gleich dem Tag aus `Release:` ist.
- **Messung vorher (Punkt 1), nur lesend:** `bash ops/card-visits.sh --since 2026-11-26T17:28:50Z --until <Start des Goals>` mit
  vollständiger Ausgabe in `docs/kunden/kennung-2026-11.md`, dazu eine Zeile `Neue Kennung seit dem Release: <ja|nein>, <Zahl> Antworten
  402 an 0.2.2-maintained.2 oder neuer`. Zählungen je Kennung, keine Adresse, kein Betrag je Kunde (Grundregel 8).
- **Tests** in `test/inference-maintained-update.test.ts`, ohne Netz und ohne festen Port: „names the update command in the 402 for
  an older maintained runtime“, „keeps the 402 unchanged for the current maintained runtime“, „keeps the 402 unchanged for an upstream
  runtime“, „keeps MAINTAINED_RELEASE equal to the Release line of the guide“ und „names only the released version in the guide“.
  Am Kopf von `dev` sind der erste und der letzte rot; die Zeile im Progress Log sagt, womit.
- **Was mitzieht.** Vor dem Bau die Prüfbefehle der Goals mit Status `DONE`, die `proxy.ts`, `anleitung.md` oder `message_for_operator`
  nennen (`grep -l -E 'proxy\.ts|anleitung\.md|message_for_operator' goals/*/[0-9]*.md`), einmal am Kopf von `dev` fahren und nach dem
  Bau erneut; ein fremder roter Prüfbefehl geht mit Befehl und beiden Ausgaben als Frage an den Tech Lead auf dem Topic.
- Zugang: `set -a; . ~/.config/control-plane/loop.env; set +a` für das Zugriffslog, nur lesen. Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Code, Bezeichner, Testnamen und Felder englisch.

## Done Condition
- [x] `docs/kunden/kennung-2026-11.md` zeigt die Kennungen der gepflegten Runtimes seit dem Release mit Befehl und vollständiger
      Ausgabe und sagt, ob eine neue Kennung kam.
      MVP: Funktion, weil die Leitzahl ohne den Stand vorher nichts zeigt.
      Prüfung: `grep -c -E '^Neue Kennung seit dem Release: (ja|nein), [0-9]+ Antworten 402' docs/kunden/kennung-2026-11.md` muss genau 1 ausgeben.
      Prüfung: `grep -c -E '^MAINTAINED 402 (since|VERSION) ' docs/kunden/kennung-2026-11.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c -E '0x[0-9a-fA-F]{40}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}' docs/kunden/kennung-2026-11.md` muss 0 ausgeben.
- [x] Die 402 an eine ältere gepflegte Kennung trägt `details.update_command` und den Satz in `message_for_operator`; jede andere 402
      bleibt Byte für Byte.
      MVP: Funktion, weil die alte Installation sonst nie die Zeile zeigt, die ihren Menschen zur Karte führt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference-maintained-update.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "names the update command in the 402 for an older maintained runtime" "keeps the 402 unchanged for the current maintained runtime" "keeps the 402 unchanged for an upstream runtime" "keeps MAINTAINED_RELEASE equal to the Release line of the guide" "names only the released version in the guide"; do grep -qF "\"$t\"" test/inference-maintained-update.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/inference.test.ts` muss Exit-Code 0 haben.
- [x] `docs/paket/anleitung.md` nennt außerhalb der Liste der Commits nur die Fassung aus `Release:`.
      MVP: Funktion, weil der Mensch, den die 402 zum Update schickt, mit `automaton --version` prüft, ob es geklappt hat, und die
      Anleitung ihm heute die alte Kennung als Erfolg nennt.
      Prüfung: `grep -c 'automaton-maintained 0.2.2-maintained.1\b' docs/paket/anleitung.md` muss 0 ausgeben.
      Prüfung: `grep -c "releases/tag/$(sed -n 's/^Release: //p' docs/paket/anleitung.md)$" docs/paket/anleitung.md` muss genau 1 ausgeben.
- [x] Die Entscheidungen stehen in `goals/kunden/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg.
      MVP: Funktion, weil das nächste Glied wissen muss, warum nur ältere Kennungen den Befehl bekommen.
      Prüfung: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}, kunden 17: ' goals/kunden/ANNAHMEN.md` muss mindestens 5 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(src/inference/proxy\.ts|src/inference/maintained[a-z-]*\.ts|src/app\.ts|test/inference-maintained-update\.test\.ts|docs/kunden/kennung-2026-11\.md|docs/paket/anleitung\.md|goals/kunden/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss 0 ausgeben.
- [x] Der Job `e2e` am Kopf des Goal-PR ist grün.
      MVP: Funktion, weil sich die 402 im Laufzeitpfad ändert und der code-host kein Docker hat.
      Prüfung (Netz): `gh pr checks $(gh pr list -R matthiashippe/control-plane --head goal/kunden-17 --state open --json number -q '.[0].number') -R matthiashippe/control-plane 2>&1 | grep -E '^e2e\s' | grep -c pass` muss genau 1 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der Agent einer alten gepflegten Runtime liest in der 402 einen Befehl, den er seinem Menschen wörtlich weitergeben kann.
- [ ] Die unveränderte Runtime am Pin und die neue gepflegte Fassung bekommen die 402 wie heute.
- [ ] Kein Gedankenstrich, keine Wallet-Adresse und keine IP eines Kunden, kein Betrag je Kunde.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `harness/**`,
  `deploy/**`, `.env*`, `*.db`, `*.key`, `*.pem`
- `src/inference/proxy.ts`: nur die 402 bei offener Annahme und das Durchreichen des Kopfs; Reservierung, Abrechnung, 404 und die
  402 bei `topupsClosed` bleiben Zeichen für Zeichen
- `src/app.ts`: nur das Durchreichen des Kopfs `User-Agent` an `handleChat`
- `src/**` sonst, `src/payments/**`, `src/auth/**`, `ops/**`, `mcp/**`, `README.md`: unverändert
- `docs/paket/anleitung.md`: nur die Zeilen 19 und 20; Zeile `Release:`, Befehl und Liste der Commits bleiben
- `test/**` außer `test/inference-maintained-update.test.ts`: unverändert
- das Repo `matthiashippe/automaton` und seine Releases: nur lesen
- `ROADMAP.md`, `docs/kette.md`, bestehende Goal-Dateien und Vorschläge: nur lesen; in fremden `ANNAHMEN.md` nur Zeilen `Abgelöst:`,
  die der Tech Lead entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- jeder Wert in `/opt/control-plane/.env`, ein Rollout oder Neustart durch einen Agent, jede Abfrage der Produktion, die schreibt
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-27 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut (Messung seit dem Release in `docs/kunden/kennung-2026-11.md`, `MAINTAINED_RELEASE` in `src/inference/maintained.ts`, `details.update_command` und Satz in `message_for_operator` nur für ältere Kennungen `automaton-maintained/`, Zeilen 19 und 20 der Anleitung auf die Fassung aus `Release:`). Rot am Kopf von `dev` (70e5599, nur mit `src/inference/maintained.ts` daneben): „names the update command in the 402 for an older maintained runtime“ mit `0.2.2-maintained.1: expected undefined to be 'npm install -g github:matthiashippe/a…'`, „names only the released version in the guide“ mit `expected [ '0.2.2-maintained.3', …(1) ] to deeply equal [ '0.2.2-maintained.3' ]`, ohne die Datei scheitert schon der Import. Was mitzieht: 354 Prüfbefehle ohne Netz der DONE-Goals vorher und nachher gleich; ABGELÖST kunden 08 Punkt 3 (Zeile 99) und abrechnung 08 Punkt 4 (Zeile 105), alter Befehl am Kopf `falsch src/app.ts:3614`, `falsch src/app.ts:3653`, `falsch src/app.ts:3833`, `falsch src/inference/proxy.ts:224`, `falsch src/inference/proxy.ts:465`, neuer Befehl aus den Zeilen `Abgelöst:` in `goals/kunden/ANNAHMEN.md` und `goals/abrechnung/ANNAHMEN.md` am Kopf `ende` (Tech Lead, PRO-32051). Prüfbefehle: Punkt 1 1, 4, 0; Punkt 2 Exit 0 (6 Tests), keine Ausgabe, Exit 0 (20 Tests); Punkt 3 0, 1; Punkt 4 7, 0, 0; Punkt 5 Job `e2e` am gepushten Kopf, Ergebnis im Kommentar des Childs; Punkt 6 Exit 0 (`check: grün in 245 s`).

## Blockers
