# Konto Goal 18: Die Bereitschaftsprüfung unterscheidet „Dienst unten“ von „Schlüssel fehlt“

## Status
PLANNED

## Active Objective
`ops/konto-ready.sh` meldet `key_file unreadable`, wenn der Container `cp` nicht läuft oder `docker compose exec` aus einem anderen
Grund scheitert, und vermischt damit „Schlüssel fehlt“ mit „Dienst ist unten“; Matthias benutzt das Werkzeug am Human Gate von
konto 15. Der Test prüft die echten SSH-Optionen nicht, weil das nachgebaute `ssh` in `test/konto-ready.test.ts` nur das letzte
Argument ausführt (`cmd="${@: -1}"`): `-o BatchMode=yes` und `-i "$KEY"` könnten wegfallen, ohne dass ein Fall rot wird. Nach diesem
Goal schreibt das Werkzeug `container down` und endet mit Exit 1, wenn `docker compose -f "$COMPOSE_FILE" ps --status running -q cp`
leer ist, und sagt dann nichts über den Schlüssel; ein Fall prüft die SSH-Argumente.
Widerlegt, wenn ein Fall mit gestopptem Container schon heute eine andere Zeile als `key_file unreadable` zeigt.
MVP: Funktion, weil eine falsche Zeile am Gate Matthias einen Schlüssel suchen lässt, während nur der Dienst neu starten muss, und
das Konto so später an geht.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel: Wer `ops/konto-ready.sh` am Gate von konto 15 oder danach startet, sieht beim ersten Lesen, ob der Dienst unten ist oder der
  Schlüssel fehlt.
- Quelle der Kette: `ROADMAP.md`, Topic `konto`, Glied 18; Loop-Triage 20.11.2026 (PRO-25822, PRO-25825). Übernimmt
  `goals/_vorschlaege/konto-kritik-2026-11-19-1.md`. Kein Punkt in konto 15, weil dessen Done-Punkte nach der Kritik fest sind und
  konto 15 `ops/konto-ready.sh` nicht ändert; ein eigenes Glied am Ende der Kette, weil `konto` ohnehin hinter dem Gate von konto 15
  wartet.
- `--on-server`: Vor der Zeile `key_file` fragt das Skript `docker compose -f "$COMPOSE_FILE" ps --status running -q cp </dev/null`.
  Ist die Ausgabe leer oder scheitert der Aufruf, schreibt es statt `key_file …` die Zeile `key_file unknown` und statt
  `container current|stale` als letzte Zeile `container down`, Exit 1. Läuft der Container, bleibt alles wie heute. Der Kopfkommentar
  nennt die neuen Zeilen.
- Test `test/konto-ready.test.ts`: Das nachgebaute `docker` bekommt einen Schalter, der `ps` leer antworten lässt; Fall „gestoppter
  Container“ zeigt `key_file unknown` und `container down`, nie `key_file unreadable`, Exit 1 (Testname enthält `container down`);
  der bestehende Fall `key_file unreadable` bei laufendem Container bleibt grün. Das nachgebaute `ssh` schreibt alle Argumente
  zeilenweise in eine Datei im mkdtemp-Ordner des Falls, bevor es das letzte ausführt, und ein Fall verlangt `-o`, `BatchMode=yes`
  und `-i` mit dem Pfad aus `CP_DEPLOY_KEY` (Testname enthält `ssh options`); rot gegen eine Mutation, die `-o BatchMode=yes` streicht,
  und das Progress Log nennt sie.
- `docs/konto/euro.md` beschreibt bei `ops/konto-ready.sh` die Zeile `container down` in einem Satz (was zu tun ist: Dienst starten,
  nicht den Schlüssel suchen).
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Kein Aufruf auf dem Server;
  der Merge rollt `ops/**` mit der üblichen Live-Prüfung aus.

## Done Condition
- [ ] `ops/konto-ready.sh` meldet `container down` mit Exit 1, wenn der Container `cp` nicht läuft, und dann keine Zeile
      `key_file unreadable`; die SSH-Optionen sind im Test geprüft. In beide Richtungen bewiesen.
      Prüfung: `pnpm -s vitest run test/konto-ready.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/konto-ready.test.ts --reporter=json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const t=j.testResults.flatMap(f=>f.assertionResults).filter(a=>a.status==="passed").map(a=>a.title);console.log([/container down/,/ssh options/,/key_file unreadable/].every(r=>t.some(x=>r.test(x)))?"alle":"fehlt")})'` muss `alle` ausgeben.
      Prüfung: `grep -c "ps --status running -q cp" ops/konto-ready.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -c 'cmd="${@: -1}"' test/konto-ready.test.ts` muss 0 ausgeben.
      Prüfung: `grep -c "container down" docs/konto/euro.md` muss mindestens 1 ausgeben.
- [ ] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jeder neue Fall war vor der Änderung rot oder gegen die benannte Mutation rot; die Zeile im Progress Log nennt, womit.
- [ ] Bei laufendem Container gibt das Skript Zeile für Zeile dasselbe aus wie auf `origin/dev`; kein Wert der `.env` verlässt den
      Server.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `.env*`, `*.db`
- jede Datei außer `ops/konto-ready.sh`, `test/konto-ready.test.ts`, `docs/konto/euro.md`, der Goal-Datei und `goals/konto/ANNAHMEN.md`
- jeder Aufruf auf dem Server, jedes Schreiben in der Produktion
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log

## Blockers
