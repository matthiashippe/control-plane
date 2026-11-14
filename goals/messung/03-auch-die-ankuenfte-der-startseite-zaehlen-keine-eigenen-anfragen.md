# Messung Goal 03: Auch die Ankünfte der Startseite zählen keine eigenen Anfragen

## Status
ACTIVE

## Active Objective
`ops/landing-yield.sh` und `ops/github-yield.sh` zählen dieselbe Ankunft (Referrer von `github.com/Conway-Research`, danach
`POST /v1/auth/verify` mit 200) mit zwei eigenen Python-Kernen, und die Kopien laufen schon auseinander: `ops/github-yield.sh`
prüft den Referrer ohne Rücksicht auf Groß- und Kleinschreibung und bricht bei leerer eigener Liste mit Exit 2 ab,
`ops/landing-yield.sh` tut beides nicht und zählt bei leerer Liste unsere eigenen Adressen als fremde. Beide lesen dazu die Datei
`ops/own-ips.txt` direkt und übersehen damit die live gesehene Adresse und jede Adresse, die nur in `CP_OWN_IPS_SEEN` steht; das
Urteil der Seite (`docs/seite/conway-ankuenfte.md`) und der Ertrag von kanal 03 messen dieselbe Ankunft also nach zwei Regeln.
Nach diesem Goal steht die gemeinsame Regel (Log lesen, Adresse aus `client_ip` oder `remote_ip`, eigene Adressen über `own_ips`
aus `ops/own-ips.sh` mit Abbruch bei leerer Liste, Referrer `Conway-Research` ohne Rücksicht auf Groß- und Kleinschreibung,
Anmeldung per `POST /v1/auth/verify` mit 200) in einem Helfer unter `ops/`, den beide Werkzeuge rufen; je Werkzeug bleiben
Fenster, Frist und Ausgabe, und auf ihren bisherigen Fixtures geben beide dieselben Summen aus wie heute.
Widerlegt, wenn `ops/landing-yield.sh` bei leerer eigener Liste schon heute abbricht (sein Selftest-Fall „the own address counts
once the list does not name it“ zeigt das Gegenteil).
MVP: Funktion, weil der Loop an diesen beiden Zahlen entscheidet, ob Seite oder Kanal zahlende Automatons bringt, und eine
eigene Anfrage als fremde Ankunft diese Entscheidung nach oben verfälscht.

## Voraussetzungen
- messung Goal 02 DONE

## Kontext für den Maker
- Ziel: Eine Ankunft von Conway-Research zählt in beiden Werkzeugen nach derselben Regel, und keine eigene Anfrage zählt dort als
  fremde Ankunft.
- Herkunft: Zeile messung in `ROADMAP.md`, Glied 03; übernimmt `goals/_vorschlaege/seite-nacharbeit-2026-11-13-2.md`. Muster für
  `own_ips` ist messung 01 (`ops/claim-keyless.sh` Zeile 44 bis 47). `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py` gehören
  zu messung 04, nicht hierher.
- Annahme (Tech Lead, 14.11.2026): Der Helfer besteht aus zwei Dateien, weil die Regel halb Bash (`own_ips`) und halb Python (Zählen
  im Log) ist: `ops/conway-arrivals.sh`, das beide Werkzeuge sourcen, und `ops/conway_arrivals.py`, das beide Python-Kerne
  importieren (Unterstrich, damit `import` ohne `importlib` geht; Pfad per `sys.path.insert` aus dem Ordner des Werkzeugs).
- Annahme (Tech Lead, 14.11.2026): Die Überschreibung der eigenen Liste für Fixtures und Tests bleibt `CP_OWN_IPS=<Datei>`, wie
  beide Werkzeuge, ihre Selftests und `test/landing-yield.test.ts` und `test/github-yield.test.ts` sie heute setzen. Weil `own_ips`
  `CP_OWN_IPS` als Liste von Adressen liest und die Datei aus `CP_OWN_IPS_FILE` nimmt, setzt der Helper vor dem Aufruf
  `CP_OWN_IPS_FILE` auf den Wert von `CP_OWN_IPS`, wenn dieser gesetzt ist, und ruft `own_ips` ohne `CP_OWN_IPS`; ein gesetztes
  `CP_OWN_IPS_FILE` ohne `CP_OWN_IPS` gilt unverändert. `ops/own-ips.sh` bleibt unverändert.
- **Helfer, Bash-Teil.** `ops/conway-arrivals.sh` sourct `ops/own-ips.sh` und bietet eine Funktion (Name frei, etwa
  `conway_own_list <ausgabedatei>`), die die eigenen Adressen über `own_ips` je Zeile in die Datei schreibt. Endet `own_ips` mit
  einem Fehler (etwa weil die Liste fehlt) oder ist die Liste danach leer, schreibt sie eine stderr-Zeile, die `own_ips` nennt, und
  das Werkzeug endet mit Exit 2, bevor es eine Summe ausgibt: Eine fehlende oder leere Liste darf nie wie „keine eigenen Adressen“
  gelesen werden. Ohne `--log` ruft `ops/github-yield.sh` `own_ips` mit demselben `CP_HOST` und `CP_SSH_KEY`, mit denen es
  `ops/access-log.sh` ruft (auch aus `loop.env`); `ops/landing-yield.sh` ebenso.
- **Helfer, Python-Teil.** `ops/conway_arrivals.py` hält genau einmal: das Lesen des Logs in Zeilen mit Zeit, Adresse
  (`client_ip`, sonst `remote_ip`), Methode, Pfad ohne Query, Status, Referer und User-Agent; das Lesen der Liste aus dem
  Bash-Teil; den Referrer `^https://github\.com/Conway-Research(/|$)` mit `re.I`; die Anmeldung als `POST` auf `/v1/auth/verify`
  mit Status 200. Fenster, 24-Stunden-Frist, Gerät, `/pay/`, `BARE GITHUB REFERRER`, Wallets und jede Ausgabezeile bleiben in ihrem
  Werkzeug. Was ein Werkzeug heute bei kaputten Zeilen auf stderr schreibt, darf es behalten; stdout und Exit auf den bisherigen
  Fixtures bleiben gleich.
- **Kein Netz in Tests und Selftests.** `own_ips` fragt per `ssh` die live gesehene Adresse ab, und `timeout` ruft das Programm
  `ssh`, keine Shell-Funktion; die heutige Funktion `ssh` im Selftest von `ops/github-yield.sh` hält also nichts mehr auf. Beide
  Selftests legen deshalb ein nachgebautes `ssh` (Exit 255, keine Ausgabe) in einen `mktemp`-Ordner vorn in den `PATH` und setzen
  `CP_OWN_IPS_SEEN` auf eine Datei in diesem Ordner, damit weder das Netz noch das echte Zustandsverzeichnis des Rechners in den
  Selftest kommt. Jeder `spawnSync` in `test/landing-yield.test.ts`, `test/github-yield.test.ts` und dem neuen Test hat ein
  nachgebautes `ssh` vorn im `PATH` und `CP_OWN_IPS_SEEN` in seinem `mktemp`-Ordner.
- **Bestehende Tests und Selftests.** Fälle, die heute mit einer leeren eigenen Liste zeigen, dass die eigene Adresse ohne Liste
  zählt (Selftest von `ops/landing-yield.sh` mit `none.txt`, `test/landing-yield.test.ts` „excludes an own address …“), nehmen
  stattdessen eine Liste mit genau einer Adresse, die im Log nicht vorkommt (wie `ops/github-yield.sh` mit `192.0.2.254`), und
  erwarten dieselben Summen wie heute. Keine erwartete Summe, kein Exit-Code und kein Fall wird gestrichen oder abgeschwächt;
  `ops/fixtures/**` bleibt unverändert.
- Test `test/conway-arrivals.test.ts`, ohne Netz, ohne festen Port, nur Dokumentationsadressen, Muster wie
  `test/claim-keyless-own-ips.test.ts`, mit `import "./yield-between-tests"`: je Fall ein `mktemp`-Ordner `<tmp>` mit Kopien von
  `ops/landing-yield.sh`, `ops/github-yield.sh`, `ops/conway-arrivals.sh`, `ops/conway_arrivals.py`, `ops/own-ips.sh` und
  `ops/access-log.sh` an denselben relativen Pfaden, `<tmp>/own.txt` mit genau `203.0.113.99 2026-11-01  planted own address` (im
  ersten Fall nur eine Kommentarzeile) und einem gepflanzten Log `<tmp>/access.log` mit Zeilen am 2026-11-02 in der Form, die beide
  Werkzeuge lesen. Aufruf beider Werkzeuge mit `--log <tmp>/access.log` (`ops/landing-yield.sh` mit `--since 2026-11-02T00:00:00Z
  --until 2026-11-03T00:00:00Z`, `ops/github-yield.sh` mit `--since 2026-11-02T00:00:00Z`), `HOME` auf `<tmp>`,
  `CP_OWN_IPS=<tmp>/own.txt`, `CP_OWN_IPS_SEEN=<tmp>/seen.txt`, `PATH` mit einem nachgebauten `ssh` vorn, das jeden Aufruf an
  `<tmp>/ssh-calls` anhängt und bei `SSH_CLIENT` im letzten Argument `$FAKE_LIVE 40000 22` ausgibt, wenn `FAKE_LIVE` gesetzt ist,
  sonst und bei allem anderen mit 255 endet. Fälle:
  - `it("both tools stop with exit 2 when the own list is empty")`: `<tmp>/own.txt` nur mit `# no own address`, kein
    `FAKE_LIVE`, `<tmp>/seen.txt` fehlt; beide Exit 2, keine Zeile beginnt mit `LANDING YIELD` oder `GITHUB YIELD`, stderr nennt
    `own_ips`;
  - `it("both tools stop with exit 2 when the own list is missing")`: `CP_OWN_IPS=<tmp>/missing.txt`; beide Exit 2, keine Summe;
  - `it("an address only in CP_OWN_IPS_SEEN is not foreign in either tool")`: `198.51.100.23` und `192.0.2.50` kommen je mit
    `GET /` und Referer `https://github.com/Conway-Research/automaton/issues/1` und melden sich eine Stunde später mit
    `POST /v1/auth/verify` 200 an; `<tmp>/seen.txt` ist `198.51.100.23 2026-11-01`. `ops/landing-yield.sh` meldet `1 arrived` und
    `1 signed in`, `ops/github-yield.sh` `1 arrived from github.com/Conway-Research, 1 signed in`; ohne `<tmp>/seen.txt` melden beide
    `2 arrived` (Gegenrichtung im selben Fall);
  - `it("the live address is not foreign in either tool")`: dasselbe Log, kein `<tmp>/seen.txt`, `FAKE_LIVE=198.51.100.23`; beide
    melden `1 arrived`;
  - `it("landing-yield counts a lowercase conway-research referrer like github-yield does")`: `192.0.2.50` mit Referer
    `https://github.com/conway-research/automaton/issues/1`; beide melden `1 arrived`;
  - in jedem Fall nennt keine Zeile von stdout eine der gepflanzten Adressen, und `<tmp>/own.txt` ist danach byte-gleich (sha256).
  Rot vor dem Fix sind der erste, der dritte, der vierte und der fünfte Fall (heute zählt `ops/landing-yield.sh` bei leerer Liste
  weiter, beide lesen `CP_OWN_IPS_SEEN` und die live gesehene Adresse nicht, und `ops/landing-yield.sh` prüft den Referrer mit
  Groß- und Kleinschreibung); die Zeile im Progress Log nennt das mit Zahl.
- Kopfkommentare und Usage beider Werkzeuge nennen `own_ips` statt `ops/own-ips.txt`, und der Kopfkommentar von
  `ops/landing-yield.sh` nennt den Abbruch bei leerer Liste. `docs/seite/conway-ankuenfte.md` und `goals/kanal/ertrag.md` bleiben
  unverändert; die Zahlen darin stammen aus Läufen vor diesem Goal.
- Kein Rollout. Kein Test, kein Selftest und kein Prüfbefehl ruft die VM, ein Werkzeug ohne `--log` oder ohne nachgebautes `ssh`
  auf. Produktion bleibt unberührt: kein Lauf gegen den Server.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; neue Dateien vor `check` mit `git add` stagen. Kein `pkill -f`.

## Done Condition
- [x] Die Regel für eine Ankunft von Conway-Research steht einmal in `ops/conway-arrivals.sh` und `ops/conway_arrivals.py`, beide
      Werkzeuge rufen sie, und keines liest `ops/own-ips.txt` direkt.
      Prüfung: `grep -lE '^[^#]*(source|\.) .*conway-arrivals\.sh' ops/landing-yield.sh ops/github-yield.sh | wc -l` muss 2 ausgeben.
      Prüfung: `grep -cE '^[^#]*(source|\.) .*own-ips\.sh' ops/conway-arrivals.sh` muss mindestens 1 ausgeben.
      Prüfung: `grep -rlF --include='*.sh' --include='*.py' 'Conway-Research(/|$)' ops/` muss genau `ops/conway_arrivals.py` ausgeben.
      Prüfung: `grep -lF '"/v1/auth/verify"' ops/landing-yield.sh ops/github-yield.sh ops/conway_arrivals.py` muss genau `ops/conway_arrivals.py` ausgeben.
      Prüfung: `{ grep -hv '^[[:space:]]*#' ops/landing-yield.sh ops/github-yield.sh ops/conway-arrivals.sh ops/conway_arrivals.py | grep -c 'own-ips\.txt'; } || true` muss 0 ausgeben.
- [x] Beide Werkzeuge brechen bei leerer oder fehlender eigener Liste mit Exit 2 ab und zählen die live gesehene Adresse und jede
      Adresse aus `CP_OWN_IPS_SEEN` nicht als fremde; `ops/landing-yield.sh` nimmt den Referrer ohne Rücksicht auf Groß- und
      Kleinschreibung.
      Prüfung: `pnpm -s vitest run test/conway-arrivals.test.ts` muss Exit-Code 0 haben.
      Prüfung: `pnpm -s vitest run test/conway-arrivals.test.ts -t "own list is empty"` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "both tools stop with exit 2 when the own list is empty|both tools stop with exit 2 when the own list is missing|an address only in CP_OWN_IPS_SEEN is not foreign in either tool|the live address is not foreign in either tool|landing-yield counts a lowercase conway-research referrer like github-yield does" test/conway-arrivals.test.ts` muss mindestens 5 ausgeben.
      Prüfung: `grep -c "CP_OWN_IPS_SEEN" test/conway-arrivals.test.ts` muss mindestens 1 ausgeben.
- [x] Auf ihren bisherigen Fixtures geben beide Werkzeuge dieselben Summen aus wie heute, und ihre Selftests erreichen das Netz
      nicht.
      Prüfung: `bash ops/landing-yield.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SELFTEST OK` ausgeben.
      Prüfung: `bash ops/github-yield.sh --selftest | tail -1 | grep -c "^SELFTEST OK"` muss 1 ausgeben.
      Prüfung: `grep -cE 'sums (4 1 1 1 3 16 8|5 2 1 1 4 16 9|4 2 1 1 3 16 8)\)' ops/landing-yield.sh` muss 4 ausgeben.
      Prüfung: `grep -cE '3 arrived from github.com/Conway-Research, 1 signed in, 1 paid|4 arrived from github.com/Conway-Research, 2 signed in, 2 paid' ops/github-yield.sh` muss mindestens 2 ausgeben.
      Prüfung: `T=$(mktemp -d); printf '#!/bin/sh\necho called >> %s/calls\nexit 255\n' "$T" > "$T/ssh"; chmod +x "$T/ssh"; PATH="$T:$PATH" bash ops/landing-yield.sh --selftest >/dev/null 2>&1; PATH="$T:$PATH" bash ops/github-yield.sh --selftest >/dev/null 2>&1; cat "$T/calls" 2>/dev/null | wc -l` muss 0 ausgeben.
      Prüfung: `pnpm -s vitest run test/landing-yield.test.ts test/github-yield.test.ts` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD -- ops/fixtures | wc -l` muss 0 ausgeben.
- [x] `check` ist grün, gesperrte Pfade bleiben unverändert, und `check` lässt die Liste der eigenen Adressen und das
      Zustandsverzeichnis unberührt.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -cE '^(\.github|deploy|src|harness|scripts)/|^ops/(own-ips\.(sh|txt)|access-log\.sh)$'` muss 0 ausgeben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
      Prüfung: `S=$(mktemp -d); XDG_STATE_HOME=$S node scripts/check.mjs >/dev/null 2>&1; find "$S" -type f | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall war vor dem Fix rot, soweit oben so genannt; die Zeile im Progress Log nennt, welche
      Fälle und womit.
- [ ] Keine Ausgabe der beiden Werkzeuge nennt eine Adresse.
- [ ] Kein bestehender Fall in `test/landing-yield.test.ts`, `test/github-yield.test.ts` oder in den Selftests verliert eine
      erwartete Summe oder einen Exit-Code; geändert wird dort nur die leere Liste der Gegenrichtung und das nachgebaute `ssh`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `src/**`,
  `harness/**`, `deploy/**`, `ops/fixtures/**`, `ops/own-ips.txt`, `ops/own-ips.sh`, `ops/access-log.sh`, `docs/**`, `.env*`,
  `*.key`, `*.pem`
- jede andere Datei unter `ops/` außer `ops/landing-yield.sh`, `ops/github-yield.sh` und den neuen `ops/conway-arrivals.sh` und
  `ops/conway_arrivals.py`
- `ops/timeout-quote.sh` und `ops/anzeigen-rechnung.py` (messung 04)
- das echte Zustandsverzeichnis (`~/.local/state/control-plane/`) und jede Datei auf dem Server; Produktion weder lesend noch
  schreibend, kein Rollout
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4 gebaut: die Regel der Ankunft steht in `ops/conway_arrivals.py` (Log, Referrer mit `re.I`, Anmeldung) und `ops/conway-arrivals.sh` (`conway_own_list` über `own_ips`, Exit 2 bei fehlender oder leerer Liste), beide Werkzeuge sourcen und importieren sie, beide Selftests und alle `spawnSync` der drei Testdateien haben ein nachgebautes `ssh` und `CP_OWN_IPS_SEEN` im Temp-Ordner; `test/conway-arrivals.test.ts` war vor dem Fix in 5 von 5 Fällen rot (empty: landing Exit 0 statt 2; missing: stderr ohne `own_ips`; CP_OWN_IPS_SEEN: 2 statt 1 arrived; live: 2 statt 1; lowercase: landing 0 statt 1), stdout und Exit beider Werkzeuge auf ihren Fixtures und beide Selftest-Ausgaben byte-gleich zum Stand vor dem Goal (`diff -r`). Prüfbefehle: P1 `grep -lE … | wc -l` 2, `grep -cE … own-ips.sh` 1, `grep -rlF 'Conway-Research(/|$)'` nur `ops/conway_arrivals.py`, `grep -lF '"/v1/auth/verify"'` nur `ops/conway_arrivals.py`, `own-ips.txt` in Codezeilen 0; P2 vitest conway-arrivals Exit 0, `-t "own list is empty"` Exit 0, Testnamen 5, `CP_OWN_IPS_SEEN` 5; P3 landing-Selftest Exit 0 und letzte Zeile `SELFTEST OK`, github-Selftest 1, `sums (…)` 4, github-Summen 2, ssh-Aufrufe der Selftests 0, vitest landing und github Exit 0, `ops/fixtures` 0; P4 `node scripts/check.mjs` Exit 0 (156 Dateien, 1796 Tests), gesperrte Pfade 0, `own-ips.txt` nach check 0, Dateien im Zustandsordner nach check 0.
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, nach Merge von `origin/dev` (fb27b40, nur `goals/sandbox/ANNAHMEN.md`, Werkzeuge und Tests seit Zyklus 1 unverändert), alle Prüfbefehle am Kopf neu gefahren. Prüfbefehle (Node 22.23.4): P1 `2`, `1`, nur `ops/conway_arrivals.py`, nur `ops/conway_arrivals.py`, `0`; P2 vitest conway-arrivals Exit 0, `-t "own list is empty"` Exit 0, `5`, `5`; P3 landing-Selftest Exit 0 mit letzter Zeile `SELFTEST OK`, github-Selftest `1`, `4`, `2`, ssh-Aufrufe `0`, vitest landing und github Exit 0, `ops/fixtures` `0`; P4 `node scripts/check.mjs` Exit 0 (156 Dateien, 1796 Tests, 204 s), gesperrte Pfade `0`, `own-ips.txt` `0`, Zustandsordner `0`; Job `e2e` am PR für 2e37178 grün.

## Blockers
- keine
