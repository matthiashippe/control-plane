# Adressen Goal 03: Der Zähler sieht auch Adressen knapp neben privaten Bereichen

## Status
ACTIVE

## Active Objective
`test/actions-log-addresses.test.ts` pflanzt je Grenze von `10.0.0.0/8`, `172.16.0.0/12` und `169.254.0.0/16` eine öffentliche
Adresse knapp außerhalb, auf beiden Seiten, und verlangt, dass `ops/actions-log-addresses.sh` jede zählt. Heute bleibt die Suite
grün, wenn `private()` jede Adresse mit erstem Oktett 172 oder 169 privat nennt; danach wird sie bei diesem und bei jedem Umbau rot,
der einen der drei Bereiche um eins zu weit fasst. Ändert nur Tests, kein Rollout.
Widerlegt, wenn die Suite am Kopf von `dev` mit einem solchen `private()` schon rot ist. Gemessen vom Tech Lead am 16.11.2026 auf
`adee769`: alle acht Mutanten aus der Done Condition lassen die Suite grün (`exit 0`), das Goal ist also nicht widerlegt.
Übernimmt `goals/_vorschlaege/adressen-nacharbeit-2026-11-15-1.md`.
MVP: Funktion, weil genau diese Zahl entscheidet, ob Logs der Actions gelöscht werden müssen (Grundregel 8), und ein zu weit
gefasster privater Bereich sie still auf 0 setzt.

## Voraussetzungen
- adressen Goal 02 DONE

## Kontext für den Maker
- Ziel: Wer mit `ops/actions-log-addresses.sh` nach Adressen von Besuchern in den Logs sucht, bekommt nie `total 0`, weil eine
  öffentliche Adresse als privat galt; `check` fängt jeden Umbau, der das einführt.
- Der Zähler kann es schon: Eine Fixture mit den sechs Adressen unten in einer Zeile einer Anfrage ergibt am Kopf von `dev`
  `1 6`, `total 6`. Am Skript ändert sich deshalb nichts. Wird ein Mutant der Done Condition mit deinen Fällen trotzdem nicht rot,
  liegt der Fehler im Test, nicht im Skript.
- Die sechs Adressen, jede aus Teilen gebaut wie in `test/known-ips.test.ts` (`const ip = (...parts: number[]): string =>
  parts.join(".")`), damit weder die Testdatei noch eine Fixture im Repo eine öffentliche Adresse als Text trägt; `known-ips.test.ts`
  in `check` liest jede Datei aus `git ls-files` und würde sie sonst finden:
  `ip(9, 255, 255, 254)` und `ip(11, 0, 0, 1)` neben `10.0.0.0/8`,
  `ip(172, 15, 255, 254)` und `ip(172, 32, 0, 1)` neben `172.16.0.0/12`,
  `ip(169, 253, 255, 254)` und `ip(169, 255, 0, 1)` neben `169.254.0.0/16`.
- Entscheidung Tech Lead (16.11.2026): ein neuer Fall `it("counts a public address just outside 10/8, 172.16/12 and 169.254/16",
  …)` im ersten `describe`, mit `--dir` und leeren Listen wie die bestehenden, je Adresse ein eigener Lauf (`logs/<n>/…`), damit die
  erwarteten Zeilen zeigen, welche Grenze fehlt: genau `["1 1", "2 1", "3 1", "4 1", "5 1", "6 1", "total 6"]`. Dazu in denselben
  Logs je eine Zeile mit einer Adresse tief im Bereich (etwa `ip(10, 255, 255, 254)`, `ip(172, 31, 255, 254)`,
  `ip(169, 254, 255, 254)`), die nicht zählt, damit ein Mutant, der den Bereich verkleinert, auch rot wird. Die Ausgabe enthält keine
  Adresse (`expect(r.out).not.toMatch(IPV4)` wie in den anderen Fällen). Der bestehende Fall „counts 0 for a run whose addresses all
  stand in the three lists or in private ranges“ bleibt unverändert.
- Die Mutanten der Done Condition laufen in einer Wegwerfkopie aus `git archive HEAD`, also erst nach dem Commit des neuen Falls.
  Die Progress-Log-Zeile nennt je Mutant `exit 1`; zur Gegenprobe einmal dieselben Befehle auf `origin/dev` (`git archive origin/dev`
  statt `HEAD`), die `exit 0` zeigen.
- Die Prüfungen von adressen 01 Punkt 1 und adressen 02 Punkt 1 laufen jede Nacht im Audit weiter und bleiben grün.
- `ops/`, `docs/` und `src/` ändern sich nicht, also löst das Goal keinen Rollout aus (Grundregel 5).
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), vitest und `check` im Vordergrund mit eigenem Timeout. Gib in keinem Log,
  Kommentar, Commit, PR oder Verdict eine Adresse aus, auch keine der sechs oben in gepunkteter Form, nur `ip(…)` und Zahlen.

## Done Condition
- [x] Die Suite zählt öffentliche Adressen knapp neben `172.16.0.0/12`: Ein `private()`, das jede Adresse mit erstem Oktett 172
      privat nennt oder den Bereich nach unten oder oben um eins erweitert, macht `test/actions-log-addresses.test.ts` rot.
      MVP: Funktion, weil das genau der Umbau aus dem Vorschlag ist, der heute grün bleibt.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/(a == 172 \&\& b >= 16 \&\& b <= 31)/a == 172/" "$d/ops/actions-log-addresses.sh"; grep -cF "|| a == 172 ||" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/b >= 16 \&\& b <= 31/b >= 15 \&\& b <= 31/" "$d/ops/actions-log-addresses.sh"; grep -cF "b >= 15 && b <= 31" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/b >= 16 \&\& b <= 31/b >= 16 \&\& b <= 32/" "$d/ops/actions-log-addresses.sh"; grep -cF "b >= 16 && b <= 32" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
- [x] Die Suite zählt öffentliche Adressen knapp neben `169.254.0.0/16`: Ein `private()`, das jede Adresse mit erstem Oktett 169
      privat nennt oder den Bereich nach unten oder oben um eins erweitert, macht die Suite rot.
      MVP: Funktion, weil ein Besucher aus diesem Netz sonst still nicht gezählt wird.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/(a == 169 \&\& b == 254)/a == 169/" "$d/ops/actions-log-addresses.sh"; grep -cF "|| a == 169 ||" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/a == 169 \&\& b == 254/a == 169 \&\& b >= 253 \&\& b <= 254/" "$d/ops/actions-log-addresses.sh"; grep -cF "b >= 253 && b <= 254" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/a == 169 \&\& b == 254/a == 169 \&\& b >= 254 \&\& b <= 255/" "$d/ops/actions-log-addresses.sh"; grep -cF "b >= 254 && b <= 255" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
- [x] Die Suite zählt öffentliche Adressen knapp neben `10.0.0.0/8`: Ein `private()`, das den Bereich nach unten oder oben um ein
      erstes Oktett erweitert, macht die Suite rot.
      MVP: Funktion, weil das die dritte Grenze aus dem Vorschlag ist und dieselbe Zahl betrifft.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/|| a == 10 ||/|| (a >= 9 \&\& a <= 10) ||/" "$d/ops/actions-log-addresses.sh"; grep -cF "(a >= 9 && a <= 10)" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
      Prüfung: `bash -c 'd=$(mktemp -d); git archive HEAD | tar -x -C "$d"; ln -s "$PWD/node_modules" "$d/node_modules"; sed -i "s/|| a == 10 ||/|| (a >= 10 \&\& a <= 11) ||/" "$d/ops/actions-log-addresses.sh"; grep -cF "(a >= 10 && a <= 11)" "$d/ops/actions-log-addresses.sh"; (cd "$d" && node_modules/.bin/vitest run test/actions-log-addresses.test.ts >/dev/null 2>&1); echo "exit $?"; rm -rf "$d"'` muss `1` und danach `exit 1` ausgeben.
- [x] Die Suite ist mit dem unveränderten Skript grün, die Testdatei trägt keine der sechs Adressen als Text, und das Goal ändert
      außer Goal-Dateien nur `test/actions-log-addresses.test.ts`.
      MVP: Funktion, weil ein Test, der eine öffentliche Adresse ins öffentliche Repo schreibt, Grundregel 8 selbst bricht.
      Prüfung: `pnpm -s vitest run test/actions-log-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE '\b(9\.255|11\.0|172\.(15|32)|169\.(253|255))\.[0-9]{1,3}\.[0-9]{1,3}\b' test/actions-log-addresses.test.ts` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -v '^goals/adressen/' | grep -vc '^test/actions-log-addresses\.test\.ts$'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die Progress-Log-Zeile nennt je Mutant `exit 1` und die Gegenprobe auf `origin/dev` mit `exit 0`.
- [ ] Die Prüfungen von adressen 01 Punkt 1 und adressen 02 Punkt 1 ohne Netz bleiben grün.
- [ ] Keine Adresse in Commit, PR, Kommentar, Log, Test oder Verdict, nur `ip(…)` und Zahlen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `*.key`, `*.pem`
- `src/**`, `ops/**` und `docs/**` ganz; geändert wird nur `test/actions-log-addresses.test.ts`
- Einstellungen des Repos ändert der Loop nicht: kein `gh api -X PUT`, `-X PATCH` oder `-X DELETE` auf das Repo, seine Läufe oder
  seine Logs
- `ops/own-ips.txt`, `ops/known-ips.txt`, `ops/crawler-ips.txt` und der Cache von `ops/fetchers.py` bleiben unverändert;
  `ops/fetchers.py` wird nicht aufgerufen
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-16 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut, neuer Fall in `test/actions-log-addresses.test.ts` mit sechs Läufen, je eine öffentliche Adresse knapp neben 10/8, 172.16/12 oder 169.254/16 (aus `ip(…)` gebaut) und beide Enden des Bereichs, die nicht zählen. Prüfbefehle: Punkt 1 drei Mutanten je `1`, `exit 1`; Punkt 2 drei Mutanten je `1`, `exit 1`; Punkt 3 zwei Mutanten je `1`, `exit 1`; Gegenprobe aller acht auf `origin/dev` je `1`, `exit 0`; Punkt 4 vitest Exit 0, grep `0`, Umfang `0`; Punkt 5 `check` Exit 0 (194 Dateien, 2145 Tests); adressen 01 Punkt 1 `1 1 2 2 total 2 `, adressen 02 Punkt 1 `1 1 2 2 total 3 `.

## Blockers
