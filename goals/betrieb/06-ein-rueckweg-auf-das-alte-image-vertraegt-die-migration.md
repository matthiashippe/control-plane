# Betrieb Goal 06: Ein Rückweg auf das alte Image verträgt die Migration

## Status
ACTIVE

## Active Objective
Ein Rückweg auf das alte Image nach einem Deploy legt die Handoffs nicht mehr still. Seit konto 12 benennt `src/db.ts` die Spalte
`handoffs.automaton_name` in `display_name` um, die erste Migration, die ein älteres Image nicht mehr lesen kann: Startet nach dem
Umschalten das alte Image gegen dieselbe DB (Rollback in `deploy/rollout-remote.sh` oder der Rückweg von Hand), ist `/health` grün,
aber jedes Schreiben und Lesen eines Handoffs scheitert, also kein Konto, kein Limit, keine Einzahlung und keine Auszahlung, bis jemand
die Spalte von Hand zurückbenennt. Danach nennt Schritt 8 in `deploy/README.md` die Befehle, mit denen die Spalte vor dem Start des
alten Images zurückbenannt wird, solange `PRAGMA table_info(handoffs)` `display_name` zeigt, und der neue Test
`test/rollback-schema.test.ts` wird rot, sobald `src/db.ts` eine Spalte umbenennt oder löscht, ohne dass Schritt 8 dafür einen Rückweg
nennt. Den automatischen Rückweg in `deploy/rollout-remote.sh` (deny_paths) schlägt das Goal als Vorschlag vor
(`ROADMAP.md`, betrieb 06; übernimmt `goals/_vorschlaege/konto-kritik-2026-11-18-5.md`).
MVP: Funktion, weil ein missglückter Deploy sonst Konto, Limit, Einzahlung und Auszahlung aller Kunden stilllegt, bis jemand von Hand
eingreift.

## Voraussetzungen
- betrieb Goal 04 DONE

## Kontext für den Maker
- Ziel: Wer nach einem missglückten Deploy auf das alte Image zurückgeht, hat danach einen Dienst, in dem jeder Kunde wieder Konto,
  Limit, Einzahlung und Auszahlung öffnen kann, nicht nur ein grünes `/health`.
- Betrieb 05 entfällt (22.11.2026, ROADMAP.md); die Voraussetzung ist deshalb betrieb 04.
- Bestand: `src/db.ts` Zeile 632 f. (`ALTER TABLE handoffs RENAME COLUMN automaton_name TO display_name`, nur wenn
  `PRAGMA table_info(handoffs)` noch `automaton_name` zeigt); die Umbauten von konto 02 bis 05 davor (`ALTER TABLE handoffs RENAME TO
  handoffs_kontoNN`, neue Tabelle, Kopie) behalten alle Spalten und weiten nur das CHECK, und ein älteres Image liest sie unverändert,
  weil seine eigenen Umbauten nur nach dem CHECK fragen. `deploy/rollout-remote.sh` taggt im Zweig „Rollback auf $ROLLBACK_TAG“
  (Zeile 265 f.) zurück und prüft danach nur `healthy`; die Zeile „Rückweg bei Bedarf“ am Ende (Zeile 362) nennt `docker tag
  control-plane:rollback control-plane:latest` und `up -d --no-deps --force-recreate cp`. Die DB liegt im Volume `cp-data` unter
  `/data/cp.db` (`CP_DB_PATH` in `deploy/docker-compose.prod.yml`), das Image hat unter `/app` Node 22 und `better-sqlite3`
  (`harness/cp/Dockerfile`), `sqlite3` auf der VM ist nicht vorausgesetzt.
- Schritt 8 (Punkt 1): Der bestehende Text bleibt, dazu ein Absatz und ein Codeblock eingerückt unter dem Punkt (Markdown-Liste, drei
  Leerzeichen), sodass die Zeile `9. **Caddyfile** …` der nächste Listenpunkt bleibt. Inhalt: Nach jedem Rückweg auf das alte Image,
  dem automatischen wie dem von Hand, wird die Spalte zurückbenannt, solange `PRAGMA table_info(handoffs)` `display_name` zeigt, und
  zwar bei gestopptem Dienst, weil SQLite die Tabelle sonst unter einem laufenden Prozess ändert. Die Befehle im Verzeichnis der
  Compose-Datei auf der VM, in dieser Reihenfolge:
  `docker compose -f docker-compose.prod.yml stop cp`,
  `docker compose -f docker-compose.prod.yml run --rm --no-deps --entrypoint node cp -e '<Skript>'` mit einem Skript, das
  `/data/cp.db` mit `better-sqlite3` öffnet, `PRAGMA table_info(handoffs)` liest und nur bei `display_name` genau
  `ALTER TABLE handoffs RENAME COLUMN display_name TO automaton_name` ausführt, und `renamed` oder `nothing to do` ausgibt,
  dann `docker compose -f docker-compose.prod.yml up -d --no-deps --force-recreate cp` und `curl -s https://cp.hippe.eu/health`.
  Beim Rückweg von Hand steht `docker tag control-plane:rollback control-plane:latest` davor. Ein Satz sagt, dass der nächste Start
  des neuen Images die Spalte wieder vorwärts umbenennt, ohne dass eine Zeile verloren geht, und dass die Zeilen von `handoffs` ohnehin
  nur zehn Minuten leben. Ein Satz sagt, dass `deploy/rollout-remote.sh` das noch nicht selbst tut (Vorschlag aus Punkt 4).
- Test `test/rollback-schema.test.ts` (Punkt 2 und 3), ohne Netz, importiert nur `openDb` aus `src/db.ts` wie
  `test/handoff-display-name.test.ts`, liest `src/db.ts` und `deploy/README.md` als Text. Der Abschnitt von Schritt 8 ist der Text ab
  der Zeile, die mit `8. ` beginnt, bis vor die Zeile, die mit `9. ` beginnt. Regel des Wächters: Für jedes `RENAME COLUMN <a> TO <b>`
  in `src/db.ts` steht in Schritt 8 `RENAME COLUMN <b> TO <a>`, für jedes `DROP COLUMN <x>` steht dort `ADD COLUMN <x>`; Groß- und
  Kleinschreibung der Schlüsselwörter egal, Bezeichner genau. Die Prüfung steckt in einer Funktion im Test, die zu zwei Texten die
  fehlenden Rückwege als Liste liefert, damit die Fälle mit erfundenen Texten laufen. Fälle:
  `it("documents a way back for every column rename and drop in src/db.ts")` mit den echten Dateien, Liste leer;
  `it("fails a column rename without a way back in deploy/README.md")` mit einem erfundenen `RENAME COLUMN a TO b` und Schritt 8 ohne
  Rückweg, Liste genau ein Eintrag; `it("fails a column drop without a way back in deploy/README.md")` ebenso mit `DROP COLUMN x`;
  `it("lets the old image write a handoff after the documented rename")`: frische DB unter `mkdtempSync` mit `openDb`, dann die
  Anweisung `ALTER TABLE … RENAME COLUMN display_name TO automaton_name` genau so, wie sie in Schritt 8 steht (aus dem Text gezogen,
  keine Kopie im Test), danach ein `INSERT INTO handoffs (…, automaton_name, …)` und ein `SELECT automaton_name` wie im alten Image,
  beides gelingt; `it("renames the column forward again on the next start without losing a row")`: dieselbe DB mit `openDb` erneut
  geöffnet, `PRAGMA table_info(handoffs)` zeigt `display_name` und nicht `automaton_name`, die Zeile ist mit ihrem Namen da.
  Rot vor dem Fix, weil Schritt 8 auf dev keinen Rückweg nennt: Der Maker führt den Test einmal gegen den alten Text von Schritt 8 aus
  und nennt das Ergebnis im Progress Log.
- Annahme: Umbauten einer ganzen Tabelle (`RENAME TO`, neue Tabelle, Kopie) zählt der Wächter nicht, weil sie heute alle Spalten
  behalten und nur das CHECK weiten; ein Umbau, der dabei eine Spalte weglässt, ist ein Fall für die Kritik, nicht für dieses Goal.
- Vorschlag (Punkt 4): eine Datei `goals/_vorschlaege/betrieb-kritik-<JJJJ-MM-TT>-<n>.md` im Format der anderen Vorschläge (erste Zeilen `Schwere:`, `Goal:`, `Befund:`, `Beleg:`, `Empfehlung:`), mit
  `Schwere: 3`, `Goal: betrieb 06`, Befund: Der Rollback-Zweig und die Zeile „Rückweg bei Bedarf“ in `deploy/rollout-remote.sh`
  benennen die Spalte nicht zurück; Empfehlung: Der Zweig stoppt den neuen Container, benennt mit demselben Skript aus Schritt 8 zurück
  und startet erst dann das alte Image, und der Kanarienvogel startet nach seiner Migration einmal das Rollback-Image gegen dieselbe
  Kopie und schreibt dort einen Handoff, damit jede künftige Migration, die das alte Image nicht lesen kann, vor dem Umschalten
  auffällt. Ein Satz nennt, dass `deploy/rollout-remote.sh` in `deny_paths` steht und der PR dazu zu Matthias geht.
- Produktion nur lesend und auch das nicht nötig: Das Goal führt keinen der Befehle aus Schritt 8 auf der VM aus, startet keinen
  Container dort und rollt nichts aus. `deploy/README.md` gehört nicht zum Laufzeitpfad.
- Code, Kommentare und Testnamen Englisch, Goal-Datei, Doku und Vorschlag Deutsch, kein Gedankenstrich, keine Adresse und kein
  Schlüssel. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout; nach `check` mit
  `git status --short` prüfen, dass nichts im Checkout liegen blieb. Kein `pkill -f`.

## Done Condition
- [x] Schritt 8 in `deploy/README.md` nennt den Rückweg der Spalte: bei gestopptem Dienst, nur solange `PRAGMA table_info(handoffs)`
      `display_name` zeigt, mit `ALTER TABLE handoffs RENAME COLUMN display_name TO automaton_name` über das Image, dann der Start;
      für den automatischen Rückweg wie für den von Hand.
      Prüfung: `awk '/^8\. /{f=1} /^9\. /{f=0} f' deploy/README.md | grep -c 'ALTER TABLE handoffs RENAME COLUMN display_name TO automaton_name'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^8\. /{f=1} /^9\. /{f=0} f' deploy/README.md | grep -c 'PRAGMA table_info(handoffs)'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^8\. /{f=1} /^9\. /{f=0} f' deploy/README.md | grep -c 'docker compose -f docker-compose.prod.yml stop cp'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^8\. /{f=1} /^9\. /{f=0} f' deploy/README.md | grep -c 'run --rm --no-deps --entrypoint node cp'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^8\. /{f=1} /^9\. /{f=0} f' deploy/README.md | grep -c 'docker tag control-plane:rollback control-plane:latest'` muss mindestens 1 ausgeben.
      Prüfung: `grep -c '^9\. \*\*Caddyfile\*\*' deploy/README.md` muss 1 ausgeben.
- [x] Der Test `test/rollback-schema.test.ts` zeigt, dass das alte Image nach dem Rückweg aus Schritt 8 wieder einen Handoff schreibt
      und der nächste Start des neuen Images die Spalte ohne Verlust wieder vorwärts umbenennt; die Anweisung kommt aus dem Text von
      Schritt 8.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/rollback-schema.test.ts test/handoff-display-name.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE 'lets the old image write a handoff after the documented rename|renames the column forward again on the next start without losing a row' test/rollback-schema.test.ts` muss 2 ausgeben.
      Prüfung: `grep -c 'deploy/README.md' test/rollback-schema.test.ts` muss mindestens 1 ausgeben.
- [x] Derselbe Test wird rot, sobald `src/db.ts` eine Spalte umbenennt oder löscht, ohne dass Schritt 8 dafür einen Rückweg nennt; er
      war rot gegen den Text von Schritt 8 auf dev.
      MVP: Funktion, weil die nächste Migration dieser Art sonst wieder erst beim Rückweg auffällt, wenn die Kunden schon stehen.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/rollback-schema.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE 'documents a way back for every column rename and drop in src/db.ts|fails a column rename without a way back in deploy/README.md|fails a column drop without a way back in deploy/README.md' test/rollback-schema.test.ts` muss 3 ausgeben.
      Prüfung: `grep -cE 'RENAME COLUMN|DROP COLUMN' test/rollback-schema.test.ts` muss mindestens 2 ausgeben.
- [x] Der automatische Rückweg in `deploy/rollout-remote.sh` steht als Vorschlag da, mit Schwere und Bezug auf dieses Goal.
      Prüfung: `for f in goals/_vorschlaege/betrieb-kritik-*.md; do grep -q '^Goal: betrieb 06$' "$f" && grep -q '^Schwere: [1-5]$' "$f" && grep -q 'deploy/rollout-remote\.sh' "$f" && echo "$f"; done | wc -l` muss mindestens 1 ausgeben.
- [x] `deploy/README.md` ändert sich nur in Schritt 8 und bringt keine Adresse und keinen Schlüssel mit, und das Goal ändert nur
      `deploy/README.md`, den neuen Test, Dateien unter `goals/betrieb/` und neue Vorschläge `goals/_vorschlaege/betrieb-*`.
      Prüfung: `diff <(git show origin/dev:deploy/README.md | awk '/^8\. /{f=1} /^9\. /{f=0} !f') <(awk '/^8\. /{f=1} /^9\. /{f=0} !f' deploy/README.md) | wc -l` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- deploy/README.md | grep '^+' | grep -cE "(^|[^0-9.])([0-9]{1,3}\.){3}[0-9]{1,3}([^0-9.]|$)|sk-or-[A-Za-z0-9-]{8,}"` muss 0 ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE "^(deploy/README\.md|test/rollback-schema\.test\.ts|goals/betrieb/|goals/_vorschlaege/betrieb-[a-z0-9.-]+\.md$)" | wc -l` muss 0 ausgeben.
- [x] `check` ist grün und lässt den Checkout sauber.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs >/dev/null 2>&1; git status --porcelain | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Kein Befehl aus Schritt 8 lief auf der VM; die Zeile im Progress Log sagt das.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei, Doku und Vorschlag Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `ops/**`, die bestehenden Tests unter `test/`, `.env*`, `*.key`, `*.pem`, `*.db`
- `deploy/rollout-remote.sh`, `deploy/rollout.sh`, `deploy/up.sh`, `deploy/setup-vm.sh`, `deploy/docker-compose.prod.yml`,
  `deploy/drift-ok.txt`, `deploy/Caddyfile`
- in `deploy/README.md` alles außer Schritt 8 unter „Was rollout.sh tut“
- bestehende Vorschläge unter `goals/_vorschlaege/`
- die VM: kein Befehl aus Schritt 8, kein Container, kein Rollout und kein Neustart von Hand; die DB der Produktion
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 2

## Progress Log
- 2026-11-22 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut: Schritt 8 in `deploy/README.md` nennt den Rückweg der Spalte (stop, Skript über das Image, Start, beim Rückweg von Hand vorher das Zurücktaggen), neuer Wächtertest `test/rollback-schema.test.ts`, Vorschlag `goals/_vorschlaege/betrieb-kritik-2026-11-22-1.md` (Schwere 3) für `deploy/rollout-remote.sh`; der Test war gegen den Text von Schritt 8 auf dev rot (3 failed, 2 passed: Wächter, altes Image, Vorwärts-Umbenennung), eine gepflanzte Zeile `RENAME COLUMN reserved_mc TO held_mc` in `src/db.ts` macht ihn rot (1 failed, 4 passed), das Skript aus Schritt 8 lief nur lokal gegen eine Wegwerf-DB (`renamed`, dann `nothing to do`); kein Befehl aus Schritt 8 lief auf der VM. Prüfbefehle: Punkt 1 1, 2, 1, 1, 1, 1; Punkt 2 Exit 0, 2, 6; Punkt 3 Exit 0, 3, 7; Punkt 4 1; Punkt 5 0, 0, 0; Punkt 6 `check` Exit 0 (248 Dateien, 2568 Tests), `git status --porcelain` 0.
- 2026-11-22 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; `dev` (8cb5a0b) war schon im Goal-Branch, kein Befehl aus Schritt 8 lief auf der VM. Prüfbefehle: Punkt 1 1, 2, 1, 1, 1, 1; Punkt 2 Exit 0 (7 passed), 2, 6; Punkt 3 Exit 0, 3, 7; Punkt 4 1; Punkt 5 0, 0, 0; Punkt 6 `check` Exit 0 (248 Dateien, 2568 Tests), `git status --porcelain` 0.

## Blockers
- keine
