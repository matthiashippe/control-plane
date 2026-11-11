# Kanal Goal 01: Antworten auf neue Conway-Issues vorbereiten

## Status
DONE

## Active Objective
Automatons, die bei Conway an Anmeldung oder Zahlung scheitern, finden uns: Neue Issues im Upstream-Repo `Conway-Research/automaton`
mit Anmelde- oder Zahlungsfehlern sind gefunden, je Issue liegt eine geprüfte Antwort bereit, die den Fehler in der Sache beantwortet
und den Weg über `postyourprice.com` offen nennt, und gepostet wird erst nach Matthias' Freigabe am Human Gate `public_post`, genau der
freigegebene Text, höchstens drei am Tag (`docs/kette.md`, kanal 01).
MVP: Funktion, weil GitHub der einzige Kanal ist, der je einen Leser gebracht hat (`ROADMAP.md`, Go-to-Market), und weil jeder Automaton,
dessen Betreiber dort fragt, ein Kunde ist, der gerade wechseln will.

## Voraussetzungen
- abrechnung Goal 01 DONE

## Kontext für den Maker
- Die Pipeline steht: `ops/before-the-answers.py` prüft Entwürfe gegen das, was wir messen (Daten im fremden Repo, Adresse
  `postyourprice.com`), `ops/post-the-answers.py` postet geprüfte Antworten, höchstens drei am Tag, und schreibt
  `ops/posted-answers.log`. Beide lesen heute `.scratch/gtm/issue-antworten/`, das nicht im Repo liegt; dieses Goal gibt beiden einen
  Ordner im Repo (etwa `goals/kanal/antworten/`) als Option, ohne das Gatter zu schwächen.
- Neue Issues: `gh issue list -R Conway-Research/automaton --state open` und die Kommentare, nur lesend, seit dem letzten Eintrag in
  `ops/posted-answers.log`; ein Issue, das wir schon beantwortet haben, bekommt keinen zweiten Kommentar. Anmelde- oder Zahlungsfehler
  heißt: SIWE, API-Key, Provisionierung, x402, Topup, Guthaben, 500 der Conway-API.
- Die Entwürfe stehen im öffentlichen Repo: nichts darin, was nicht auch im Issue stehen dürfte, kein Name und keine Wallet-Adresse eines
  Kunden, keine Zahl ohne Messung, zu OpenRouter nichts außer dem, was die Seite ohnehin sagt (`loop-constraints.md`, Grundregel 8).
- Das Human Gate: Setz das Goal auf `BLOCKED matthias` mit `Gate: public_post` und `Aufgabe:`, `Worum:`, `Empfehlung:` unter
  `## Blockers`, darunter je Kommentar ein nummerierter Punkt mit dem Link des Issues und dem fertigen Text. Der Tech Lead prüft, der Loop
  Master legt die Karte auf Matthias' privates Board. Erst wenn am Topic „Matthias hat den Kommentar auf seinem privaten Board mit „ok“
  freigegeben“ steht, postest du genau diese Kommentare, Wort für Wort, über `ops/post-the-answers.py`, und schreibst jeden Link ins
  Progress Log. Ohne diesen Kommentar postest du nichts, auch nicht einen einzigen.
- Was danach schneller zu mehr zahlenden Automatons führt: Jede Antwort, die den Weg offen nennt, ist ein Betreiber, der in Minuten
  wechseln kann; die Zahl der Leser aus GitHub misst der Referrer beim ersten Request einer neuen Adresse (`ROADMAP.md`).

## Done Condition
- [x] `ops/before-the-answers.py` und `ops/post-the-answers.py` nehmen einen Ordner im Repo als Option, und der Trockenlauf von
      `ops/post-the-answers.py` postet nichts.
      Prüfung: `pnpm -s vitest run test/answers-folder.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/answers-folder.test.ts` muss mindestens 2 ausgeben.
- [x] Die Liste der neuen Issues mit Anmelde- oder Zahlungsfehlern steht in `goals/kanal/issues.md`, je Issue Nummer, Titel, Art des
      Fehlers und ob wir antworten, mit dem Befehl, aus dem sie stammt.
      Prüfung: `grep -cE "^[|] *#?[0-9]+ " goals/kanal/issues.md` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "gh issue" goals/kanal/issues.md` muss mindestens 1 ausgeben.
- [x] Je Issue mit Antwort liegt ein Entwurf im Ordner aus Punkt 1, höchstens drei, und das Gatter ist grün.
      Prüfung (Netz): `python3 ops/before-the-answers.py --folder goals/kanal/antworten` muss Exit-Code 0 haben.
      Prüfung: `ls goals/kanal/antworten/*.md | wc -l | xargs -I{} test {} -ge 1 -a {} -le 3 && echo passt` muss `passt` ausgeben.
      Prüfung: `grep -lE "0x[0-9a-fA-F]{40}" goals/kanal/antworten/*.md | wc -l` muss 0 ausgeben.
- [x] Gepostet ist genau, was Matthias freigegeben hat: Jeder Eintrag in `ops/posted-answers.log`, den dieses Goal hinzufügt, gehört zu
      einem Entwurf aus Punkt 3, und der Kommentar „Matthias hat den Kommentar auf seinem privaten Board mit „ok“ freigegeben“ steht am
      Topic vor dem ersten neuen Eintrag.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) -- ops/posted-answers.log | grep -cE "^\+[0-9]{4}-"` muss mindestens 1 ausgeben.
      Prüfung: `git diff $(git merge-base origin/dev HEAD) -- ops/posted-answers.log | grep -E "^\+[0-9]{4}-" | awk '{print $2}' | while read -r n; do test -f "goals/kanal/antworten/$n.md" || echo "ohne Entwurf $n"; done` muss nichts ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Englisch in den Antworten, sachlich, kurz, kein Gedankenstrich; Deutsch in Goal-Datei und Liste.
- [ ] Höchstens drei Kommentare am Tag, kein zweiter Kommentar in einem Issue, kein Issue geschlossen.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `.env*`, `src/payments/**`, `src/auth/**`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-10 Zyklus 1: Punkte 1, 2, 3, 5 gebaut (Option `--folder` in beiden Skripten, Liste mit 7 Issues, Entwürfe zu #434, #430 und #427), Punkt 4 wartet auf das Human Gate public_post. Prüfbefehle: `pnpm -s vitest run test/answers-folder.test.ts` Exit 0 (7 Tests, vorher 6 rot ohne `--folder` und der Test „Nothing pending“ rot vor dem Fix des Platzhalters `none`); `grep -cE "^\s*(it|test)\(" test/answers-folder.test.ts` 7; `grep -cE "^[|] *#?[0-9]+ " goals/kanal/issues.md` 7; `grep -c "gh issue" goals/kanal/issues.md` 1; `python3 ops/before-the-answers.py --folder goals/kanal/antworten` Exit 0, READY, 3 still to send; Anzahl-Prüfung `passt` (Gegenprobe mit 4 Dateien nicht); Wallet-Grep 0 (Gegenprobe mit gepflanzter Adresse 1); Trockenlauf `python3 ops/post-the-answers.py --folder goals/kanal/antworten` Exit 0, nichts gesendet, `ops/posted-answers.log` unverändert; Punkt 4 Log-Grep 0, offen; `node scripts/check.mjs` Exit 0 (100 Testdateien, 1273 Tests).
- 2026-11-11 Zyklus 2: Punkt 4 gepostet nach Matthias' Freigabe am Topic (2026-11-11 07:02 UTC), genau die drei freigegebenen Texte über `python3 ops/post-the-answers.py --folder goals/kanal/antworten --send 3 --only 434,430,427`: https://github.com/Conway-Research/automaton/issues/434#issuecomment-6789427945, https://github.com/Conway-Research/automaton/issues/430#issuecomment-6789453609, https://github.com/Conway-Research/automaton/issues/427#issuecomment-6789479781; Entwurf gegen Freigabe und Live-Kommentar gegen Freigabe je identisch (Gegenprobe mit einem geänderten Wort meldet DIFFERENT), `origin/dev` gemergt, Abschluss gemeldet, Punkte 1, 2, 3, 4, 5. Prüfbefehle: `pnpm -s vitest run test/answers-folder.test.ts` Exit 0; `grep -cE "^\s*(it|test)\(" test/answers-folder.test.ts` 7; `grep -cE "^[|] *#?[0-9]+ " goals/kanal/issues.md` 7; `grep -c "gh issue" goals/kanal/issues.md` 1; `python3 ops/before-the-answers.py --folder goals/kanal/antworten` Exit 0, READY, 3 already posted; Anzahl-Prüfung `passt`; Wallet-Grep 0; Punkt 4 Log-Grep 3, Entwurf-Abgleich leer (Gegenprobe mit gepflanzter Zeile 999 meldet `ohne Entwurf 999`); `node scripts/check.mjs` Exit 0 (101 Testdateien, 1281 Tests; der erste Lauf endete bei Load 173 mit Exit 1 nur am vitest-RPC-Timeout, alle Tests grün).
- 2026-11-11 Release: PASS K, B (Zyklus 2), DONE.

## Blockers
Gate public_post erledigt: Freigabe am Topic am 2026-11-11 07:02 UTC, die drei Texte sind Wort für Wort gepostet (Links im Progress Log).
