# Reichweite Goal 05: Unsere Kommentare folgen dem Notschalter der Karte

## Status
DONE

## Active Objective
Seit reichweite 04 tragen 26 Kommentare des Kontos `matthiashippe` in `Conway-Research/automaton` den Satz `LEAD` aus
`ops/relink_rules.py`, und der verspricht „top it up by card, PayPal or Apple Pay with money back through Digistore24“. Schaltet der
Notschalter der Karte ein (`cardBreaker` in `src/payments/card-way.ts`, Zeile `breaker on` von `ops/card-breaker.sh`), lässt
`/llms.txt` die Kartenzeile weg (`cardOpen`, `src/app.ts:2349`), und `ops/watchdog.sh` meldet den Wechsel über den Alarmweg. Die
Kommentare versprechen die Karte weiter, denn niemand bekommt den Auftrag, sie mit `ops/relink-comments.py --name --no-card` auf
`LEAD_NO_CARD` zu stellen; den Weg dafür hat reichweite 04 (Punkt 8) gebaut, aber nichts löst ihn aus. Nach diesem Goal wird jeder
Wechsel `breaker off` auf `on` und zurück ein Issue beim Tech Lead im Projekt Control Plane, ausgelöst auf dem code-host, wo
`ops/status.sh` den Notschalter schon liest: mit dem Trockenlauf `python3 -I ops/relink-comments.py --name --no-card` (bei `on`)
oder `python3 -I ops/relink-comments.py --name` (bei `off`) und den Werten `sha12` darin. Der Tech Lead gibt mit `ok name` frei, der
Maker sendet und prüft mit `--verify`, wie bei jedem Kommentar in fremden Repos (`LOOP.md`). Höchstens ein Issue je Wechsel, ein
Lauf ohne Wechsel legt keins an. Mitgenommen aus `goals/_vorschlaege/reichweite-kritik-2026-11-24-2.md`: Ein Test holt `/llms.txt`
per `app.request` und hält fest, dass dort steht, was `LEAD` und `LEAD_NO_CARD` versprechen, damit Kommentare und `/llms.txt`
nicht still auseinanderlaufen (`ROADMAP.md`, reichweite 05).
Leitzahl: Stunden zwischen Wechsel des Notschalters und geänderten Kommentaren, Ziel unter 24 (Zeitpunkt des Issues gegen die Zeile
in `ops/named-comments.log`).
Widerlegt, wenn ein Wechsel schon heute einen Auftrag mit dem Trockenlauf erzeugt (am 25.11.2026: `ops/watchdog.sh` postet nur an
den Alarmweg, kein Skript unter `ops/` legt ein Issue in Paperclip an, `grep -l 'api/companies' ops/*` nennt nur `ops/org-puls.sh`,
und das liest nur).
MVP: Funktion, weil ein Betreiber, der über unseren Kommentar kommt, sonst eine geschlossene Kasse vorfindet.
Übernimmt `goals/_vorschlaege/reichweite-kritik-2026-11-24-1.md` und `goals/_vorschlaege/reichweite-kritik-2026-11-24-2.md`.

## Voraussetzungen
- reichweite Goal 04 DONE

## Kontext für den Maker
- Ziel in einem Satz: Ein Betreiber, der über einen unserer Kommentare in den Conway-Issues kommt, liest dort nie ein Versprechen
  zur Karte, das die Seite gerade nicht hält, weil jeder Wechsel des Notschalters binnen Stunden beim Tech Lead als fertiger
  Trockenlauf zur Freigabe liegt.
- **Stand am 25.11.2026.** Notschalter aus (`ops/named-comments.log` und `goals/reichweite/ANNAHMEN.md`: `breaker off` vor jedem
  Senden in reichweite 04). 26 Kommentare beginnen mit `LEAD`, vier aus `NO_LEAD` ohne. `--name --no-card` meldet lesend
  `no-card: 26 to change, 4 unchanged, 30 comments of matthiashippe`, `--name` meldet `0 to change`. Auf dem code-host läuft heute
  kein Takt für dieses Repo (`crontab -l`, `systemctl --user list-timers`: nichts zu control-plane).
- **Entscheidungen (Tech Lead, 25.11.2026).** Der Maker schreibt jede mit Grund als Zeile `- <Datum>, reichweite 05: …` in
  `goals/reichweite/ANNAHMEN.md`.
  1. Neues Werkzeug `ops/breaker-comments.sh` (bash, Python nur über `python3 -I`), läuft auf dem code-host im Checkout von `dev`
     mit den Variablen aus `~/.config/control-plane/loop.env` und `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY` und
     `PAPERCLIP_COMPANY_ID` aus der Umgebung des Paperclip-Runs. Den Takt gibt eine Routine der Company Privat
     „control-plane: Notschalter und Kommentare“ (engineer-cp, alle 6 Stunden, Auftrag: `bash ops/breaker-comments.sh`, dann ein
     Kommentar mit der letzten Zeile und `done`), die der Tech Lead nach dem Release per API anlegt und in code-host
     `paperclip/routines.privat.allow` einträgt wie „store-of-luxus: Auszug anstoßen“. Sie ist nicht Teil dieses Goals, weil
     code-host kein Pfad dieses Repos ist; `ops/README.md` nennt sie.
  2. Zustand in `${CP_STATE_DIR:-$HOME/.local/state/control-plane}/card-breaker-comments`, außerhalb des Checkouts, Inhalt genau
     `on` oder `off`. Fehlt die Datei, gilt `off`, weil die 26 Kommentare bei `breaker off` gesendet wurden; die Ausgabe nennt
     dann `last none`. Geschrieben wird der neue Zustand erst nach einem POST mit Antwort 2xx, nach dem Fund eines offenen Issues
     mit demselben Titel oder wenn der Trockenlauf `0 to change` meldet, sonst nie (Muster `check_card_breaker` in
     `ops/watchdog.sh`: der Zustand erst nach dem erfolgreichen POST).
  3. Ablauf je Lauf: genau eine Zeile von `bash ops/card-breaker.sh` (über ssh, nur lesend, wie in reichweite 04 Entscheidung 4),
     sonst Exit 2 ohne Issue. Gleich dem Zustand: nichts weiter (abgelöst durch die Kritik unten, Punkt 7). Anders: der Trockenlauf der neuen Richtung, also bei `on`
     `python3 -I ops/relink-comments.py --name --no-card`, bei `off` `python3 -I ops/relink-comments.py --name`, ohne `--send`; die
     Zählzeile (`no-card: <k> to change, …` oder `name: <k> to change, …`) entscheidet: `k` gleich 0 heißt Zustand speichern ohne
     Issue, `k` größer 0 heißt Issue. Vor dem POST sucht das Werkzeug ein offenes Issue (`todo`, `in_progress`, `in_review`,
     `blocked`) mit demselben Titel im Projekt; gibt es eins, kein zweites.
  4. Das Issue: Projekt per Namen `Control Plane` aus `GET /api/companies/<id>/projects`, Assignee per `urlKey` `tech-lead` aus
     `GET /api/companies/<id>/agents`, Status `todo`; keine Id von Projekt, Agent oder Company steht im Repo. Titel genau
     `control-plane: card breaker on, comments without card` oder `control-plane: card breaker off, comments with card`. Die
     Beschreibung trägt die Zeile von `ops/card-breaker.sh`, den Befehl des Trockenlaufs in Backticks, dessen Ausgabe Zeile für Zeile
     unverändert in einem Codeblock (je Kommentar `comment … sha12 <wert>` und die Zählzeile) und darunter die Schritte: Freigabe per
     Kommentar des Tech Lead, der mit `ok name` beginnt und die Werte `<id>:<sha12>` nennt (reichweite 04 Entscheidung 5), dann beim
     Maker `ops/card-breaker.sh` erneut (bei anderem Zustand nicht senden), `--send <n> --approved <id>:<sha12>,…` in derselben Art
     und danach `--verify` in derselben Art. Der Schlüssel steht nie in einer Ausgabe, einem Argument von `curl` auf der
     Kommandozeile oder einer Datei (über `--config -` oder `-H @-` von stdin).
  5. Ausgabe: genau eine letzte Zeile, eine aus `breaker <on|off>, last <on|off|none>, no change`,
     `breaker <on|off>, last <on|off|none>, comments already match`, `breaker <on|off>, last <on|off|none>, issue <PRO-n>`,
     `breaker <on|off>, last <on|off|none>, issue <PRO-n> already open`, mit `--dry-run`
     `breaker <on|off>, last <on|off|none>, would create issue` (dann kein POST und kein Schreiben des Zustands). Exit 0 in diesen
     Fällen, 1 bei einem unbekannten Argument vor jeder Anfrage, 2 mit einer Zeile `… unreadable`, wenn Notschalter, GitHub oder
     Paperclip nicht lesbar sind oder der POST scheitert.
  6. Tests in `test/breaker-comments.test.ts` mit eigenem Sandkasten `test/breaker-comments-sandbox.ts` nach dem Muster von
     `test/relink-sandbox.ts` (falsches `ssh`, `gh` und `curl` vorn im `PATH`, jeder Aufruf im Log, kein Netz, kein Port, Zustand in
     einem `mktemp`-Ordner über `CP_STATE_DIR`). `test/relink-sandbox.ts` und `test/fixtures/relink/threads.json` darf er
     importieren und lesen, nicht ändern; eigene Fixtures nur unter `test/fixtures/breaker-comments/`, mit erfundenen Texten.
  7. `test/llms-txt-lead.test.ts`: liest `LEAD` und `LEAD_NO_CARD` aus `ops/relink_rules.py` über `python3 -I` (der Pfad steht im
     Test), holt `/llms.txt` per `app.request` aus `createApp` und verlangt bei offenem Notschalter `conwayApiUrl` und
     `card, PayPal or Apple Pay` in `/llms.txt` und in `LEAD`, bei eingeschaltetem (eine erstattete Live-Bestellung wie
     `tripBreaker` in `test/card-way-pages.test.ts`) `conwayApiUrl` in beiden und `card, PayPal or Apple Pay` in keinem.
- **Kritik (Tech Lead, 25.11.2026), Punkt 7.** Entscheidung 3 ist flankengesteuert: Nach dem ersten Issue steht der Zustand
  auf der neuen Richtung, auch wenn kein Kommentar umgestellt wurde. Geht das Issue ohne vollständiges `--send` auf `done` oder
  `cancelled` (Freigabe verweigert, `--send` scheitert an einem Teil, `--verify` meldet Abweichung), fragt danach kein Lauf mehr,
  und die Kommentare versprechen die Karte, solange der Notschalter steht. Neu: Bei gleichem Zustand liest das Werkzeug Paperclip;
  ist ein Issue mit dem Titel der aktuellen Richtung offen, endet es mit `issue <PRO-n> already open`, sonst fährt es den
  Trockenlauf der aktuellen Richtung (`--name --no-card` bei `on`, `--name` bei `off`). `0 to change` heißt `no change` ohne
  Issue, mehr heißt Issue wie bei einem Wechsel (mit `--dry-run` `would create issue`). Der Zustand bleibt für `last` und für die
  Regeln aus Entscheidung 2. Der Test „the same state creates no issue“ behält seinen Namen und prüft künftig passende Kommentare;
  seine Zeile, dass GitHub nicht gefragt wird, fällt weg. Eine Zeile `- 2026-11-25, reichweite 05: Kritik (Tech Lead): …` in
  `goals/reichweite/ANNAHMEN.md`, `ops/README.md` nachziehen. Kosten: ein lesender Trockenlauf gegen GitHub alle 6 Stunden.
  Nebenbei, kein Done-Punkt: Der Kopfkommentar „so he only has to approve it“ wird „so the Tech Lead only has to approve it“.
  Die Suche nach dem offenen Issue trägt `status=`; ohne den Filter liefert Paperclip im Projekt genau 500 Einträge (gedeckelt),
  mit ihm 5 (25.11.2026). Bei genau 500 Einträgen ist `paperclip unreadable` sicherer als ein zweites Issue.
- **Reihenfolge.** Tests zuerst gegen `dev` rot sehen (Werkzeug fehlt) und den Test zu `/llms.txt` gegen eine Kopie der App mit
  `cardOpen` immer wahr rot sehen, dann bauen, alle Prüfungen ohne Netz, `check`, Push. Danach einmal `--dry-run` mit Netz auf dem
  code-host (Punkt 5). Gesendet wird in diesem Goal nichts, kein Kommentar auf GitHub ändert sich.
- Keine Fläche der Website ändert sich, deshalb kein SOLL-Bild: `src/**` bleibt unverändert.
- Nach dem Bau die Prüfbefehle ohne Netz der Goals mit Status `DONE`, die `relink`, `card-breaker` oder `llms` nennen
  (`grep -l -E 'relink|card-breaker|llms' goals/*/[0-9]*.md`), erneut fahren. Wird einer rot, fragt der Maker den Tech Lead auf dem
  Topic mit Befehl und beiden Ausgaben; kein Prüfbefehl eines fertigen Goals wird umgeschrieben.
- Zugang und Werkzeuge: Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `python3 -I`, `check` und vitest im Vordergrund mit eigenem
  Timeout, neue Dateien vor dem lokalen `check` stagen. Code, Bezeichner, Testnamen und Ausgaben englisch.

## Done Condition
- [x] `ops/breaker-comments.sh` legt je Wechsel des Notschalters genau ein Issue beim Tech Lead mit dem Trockenlauf der neuen
      Richtung an, bei gleichem Zustand keins, und speichert den Zustand nur nach Entscheidung 2.
      MVP: Funktion, weil erst dieser Auftrag aus einem Wechsel, den heute nur der Alarmweg sieht, geänderte Kommentare macht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/breaker-comments.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "a change from off to on creates one issue with the no-card dry run" "a change from on to off creates one issue with the name dry run" "the same state creates no issue" "a missing state file counts as off" "a failed POST keeps the old state and the next run creates the issue" "an open issue with the same title gets no second one" "comments that already match create no issue and store the state" "an unreadable breaker or dry run creates no issue and keeps the state" "the dry-run flag creates no issue and writes no state" "never patches or posts on GitHub and never prints the api key" "exits 1 on an unknown argument before asking anything"; do grep -qF "\"$t\"" test/breaker-comments.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `bash ops/breaker-comments.sh --bogus > /dev/null 2>&1; echo "exit=$?"` muss genau `exit=1` ausgeben.
      Prüfung: `grep -cF 'control-plane: card breaker on, comments without card' ops/breaker-comments.sh` muss mindestens `1` ausgeben.
      Prüfung: `grep -cF 'control-plane: card breaker off, comments with card' ops/breaker-comments.sh` muss mindestens `1` ausgeben.
      Prüfung: `cat ops/breaker-comments.sh test/breaker-comments*.ts | grep -ciE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'` muss `0` ausgeben.
- [x] Ein Test hält fest, dass `/llms.txt` sagt, was `LEAD` bei offenem und `LEAD_NO_CARD` bei eingeschaltetem Notschalter versprechen.
      MVP: Funktion, weil `LEAD` auf `/llms.txt` als Beleg verlinkt und ein späterer Umbau dort sonst 26 Kommentare still falsch macht.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/llms-txt-lead.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "llms.txt carries every promise of LEAD while the card breaker is off" "llms.txt drops the card exactly as LEAD_NO_CARD does while the card breaker is on"; do grep -qF "\"$t\"" test/llms-txt-lead.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -c 'ops/relink_rules.py' test/llms-txt-lead.test.ts` muss mindestens `1` ausgeben.
      Prüfung: `grep -ciE '^- [0-9-]+ Zyklus [0-9]+: .*rot gesehen' goals/reichweite/05-kommentare-folgen-dem-notschalter.md` muss mindestens `1` ausgeben.
- [x] `ops/README.md` beschreibt Werkzeug, Zustand, Ausgabe und die Routine aus Entscheidung 1.
      MVP: Funktion, weil die Routine und der Tech Lead den Ablauf nur aus dieser Stelle kennen.
      Prüfung: `grep -cxF '### Card breaker and comments' ops/README.md` muss `1` ausgeben.
      Prüfung: `awk '/^### Card breaker and comments$/{f=1;next} /^#+ /{f=0} f' ops/README.md | grep -cE 'breaker-comments\.sh|card-breaker-comments|control-plane: Notschalter und Kommentare|ok name'` muss mindestens `4` ausgeben.
- [x] Die Entscheidungen stehen in `goals/reichweite/ANNAHMEN.md`, der Diff bleibt in den Pfaden dieses Goals, kein Test fällt weg,
      kein neues Paket, und nichts im Repo nennt einen Schlüssel, eine Adresse oder einen Namen eines Kunden.
      MVP: Funktion, weil ein späteres Goal wissen muss, wer die Kommentare beim Wechsel umstellt und warum.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 05: ' goals/reichweite/ANNAHMEN.md` muss mindestens `7` ausgeben.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vE '^(ops/breaker-comments\.sh|ops/README\.md|test/breaker-comments[a-z.-]*\.ts|test/fixtures/breaker-comments/.*|test/llms-txt-lead\.test\.ts|goals/reichweite/.*|goals/[a-z]+/ANNAHMEN\.md)$' | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src docs package.json pnpm-lock.yaml ops/relink-comments.py ops/relink_rules.py ops/named-comments.log ops/relinked-comments.log ops/card-breaker.sh ops/watchdog.sh ops/status.sh test/relink-sandbox.ts test/fixtures/relink | wc -l` muss `0` ausgeben.
      Prüfung: `git diff --diff-filter=D --name-only $(git merge-base origin/dev HEAD) HEAD -- test | wc -l` muss `0` ausgeben.
      Prüfung: `cat ops/breaker-comments.sh test/breaker-comments*.ts test/llms-txt-lead.test.ts goals/reichweite/ANNAHMEN.md | grep -cE '0x[0-9a-fA-F]{40}|[0-9a-fA-F]{64}|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[a-z]{2,}'` muss `0` ausgeben.
- [x] Auf dem code-host liest das Werkzeug Notschalter und Paperclip und meldet, ohne etwas anzulegen oder zu speichern.
      MVP: Funktion, weil der Takt der Routine nur trägt, wenn Zugang über ssh und Paperclip-Run dort wirklich reichen.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/breaker-comments.sh --dry-run | tail -n 1` muss eine Zeile `breaker <on|off>, last <on|off|none>, no change`, `… comments already match` oder `… would create issue` ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [x] Bleibt der Notschalter gleich, passen die Kommentare aber nicht zu ihm und ist kein Issue mit dem Titel seiner Richtung offen,
      legt der nächste Lauf das Issue mit dem Trockenlauf an; passen sie, endet er mit `no change` ohne Issue.
      MVP: Funktion, weil ein Issue, das ohne vollständiges Senden erledigt wird, sonst die Kommentare dauerhaft gegen die Karte
      stehen lässt und kein Lauf mehr nachfragt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/breaker-comments.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for t in "the same state with comments that do not match and no open issue creates the issue" "the same state with an open issue of its direction runs no dry run"; do grep -qF "\"$t\"" test/breaker-comments.test.ts || echo "fehlt: $t"; done` muss nichts ausgeben.
      Prüfung: `grep -cE '^- [0-9-]+, reichweite 05: Kritik' goals/reichweite/ANNAHMEN.md` muss mindestens `1` ausgeben.
- [x] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Schaltet der Notschalter ein oder aus, liegt beim nächsten Lauf der Routine genau ein Issue beim Tech Lead mit dem Trockenlauf,
      den er nur noch mit `ok name` freigeben muss.
- [ ] Ein Lauf ohne Wechsel legt nichts an, ein gescheiterter Lauf holt den Auftrag im nächsten nach.
- [ ] `/llms.txt` und der erste Satz unserer Kommentare versprechen dieselbe Karte oder beide keine.
- [ ] Kein Gedankenstrich in neuem Text, kein Name und keine Wallet-Adresse eines Kunden, kein Schlüssel und keine Id aus Paperclip
      im Repo.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `src/**`, `docs/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- `ops/relink-comments.py`, `ops/relink_rules.py`, `ops/named-comments.log`, `ops/relinked-comments.log`, `ops/card-breaker.sh`,
  `ops/watchdog.sh`, `ops/status.sh`, `test/relink-sandbox.ts`, `test/fixtures/relink/**`: bleiben unverändert
- `ROADMAP.md`, `docs/kette.md` und die Goal-Dateien anderer Goals; in deren `ANNAHMEN.md` nur Zeilen `Abgelöst:`, die der Tech Lead
  entschieden hat
- `package.json` und `pnpm-lock.yaml`: kein neues Paket
- in `Conway-Research/automaton` nichts: kein PATCH, kein Kommentar, kein Issue, keine Reaktion; GitHub nur lesend über den
  Trockenlauf; kein anderes fremdes Repo
- in Paperclip in diesem Goal kein POST außer im Sandkasten; auf dem code-host nur `--dry-run`. Keine Routine anlegen, kein Timer,
  keine Zeile in `crontab` (Entscheidung 1: das macht der Tech Lead nach dem Release)
- Produktion nur über `ops/card-breaker.sh`, nur lesend; keine Anfrage an `automatonhost.com`, `76.13.144.207` oder den
  Sandbox-Server, kein Rollout, kein Neustart, nichts von Hand auf einem Server
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- kein fester Port, kein Port `3100`, `8081`, `8180`, `8190`, `3200`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-25 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut (`ops/breaker-comments.sh`, `test/breaker-comments.test.ts` mit `test/breaker-comments-sandbox.ts` und erfundenen Kommentaren unter `test/fixtures/breaker-comments/`, `test/llms-txt-lead.test.ts`, Abschnitt „Card breaker and comments“ in `ops/README.md`, 10 Zeilen in `goals/reichweite/ANNAHMEN.md`). Rot gesehen: `test/breaker-comments.test.ts` ohne `ops/breaker-comments.sh` (11 failed), dazu sieben Mutationen des Werkzeugs (POST-Fehler ignoriert, keine Suche nach offenem Titel, Zustand bei `--dry-run` geschrieben, fehlende Datei nicht als `off`, falsche Richtung des Trockenlaufs, Zustand bei `comments already match` nicht gespeichert, Schlüssel als `-H` in argv) mit 2, 2, 1, 2, 8, 1 und 7 failed; `test/llms-txt-lead.test.ts` gegen eine Kopie von `src/app.ts` mit `cardOpenNow` immer wahr (Fall „on“ failed) und immer falsch (Fall „off“ failed), `src/app.ts` danach unverändert. Prüfbefehle: Punkt 1 vitest 11 passed Exit 0, keine Zeile `fehlt:`, `exit=1`, `1`, `1`, `0`; Punkt 2 vitest 2 passed Exit 0, keine Zeile `fehlt:`, `2`, `1`; Punkt 3 `1`, `6`; Punkt 4 `10`, `0`, `0`, `0`, `0` (zuerst `1` wegen `root@server.invalid` im Sandkasten, behoben); Punkt 5 auf dem code-host `breaker off, last none, no change`, keine Zustandsdatei, dazu mit gepflanztem Zustand `on` in einem Scratch-Ordner `breaker off, last on, comments already match` (GitHub gelesen, Zustand unverändert `on`); Punkt 6 `check: grün in 285 s` an 44a915b. Prüfbefehle ohne Netz der fertigen Goals mit `relink`, `card-breaker` oder `llms` (14 Goals, 453 Zeilen) an `dev` und am Kopf: 299 leichte und 25 schwere gleich bis auf 16 Umfangszähler `merge-base origin/dev HEAD`, die auf `dev` per Definition 0 sind; die übrigen 129 schweren laufen nur über unveränderte Dateien unter `src/`, `docs/` und `ops/` oder sind vitest, das `check` vollständig fährt.
- 2026-11-25 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; `origin/dev` ohne neuen Commit seit der Merge-Basis, kein Merge nötig. Prüfbefehle: Punkt 1 vitest 11 passed Exit 0, keine Zeile `fehlt:`, `exit=1`, `1`, `1`, `0`; Punkt 2 vitest 2 passed Exit 0, keine Zeile `fehlt:`, `2`, `1`; Punkt 3 `1`, `6`; Punkt 4 `10`, `0`, `0`, `0`, `0`; Punkt 5 auf dem code-host `breaker off, last none, no change`, Zustandsdatei vorher und nachher nicht vorhanden; Punkt 6 `check: grün in 161 s` an 999ffbb. Laufzeitpfad unberührt (`src/**` ohne Änderung), Job `e2e` am PR läuft am Kopf.
- 2026-11-25 Zyklus 3: Punkt 7 aus der Kritik gebaut, Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6, 7: bei gleichem Zustand liest `ops/breaker-comments.sh` Paperclip, endet bei offenem Issue der aktuellen Richtung ohne Trockenlauf, sonst entscheidet der Trockenlauf der aktuellen Richtung (`no change` oder Issue); bei 500 offenen Einträgen `paperclip unreadable`; `ops/README.md`, zwei Zeilen in `goals/reichweite/ANNAHMEN.md`, Kopfkommentar „so the Tech Lead only has to approve it“. Rot gesehen: die zwei neuen Tests, der Fall mit 500 Einträgen und der Folgelauf nach einem Wechsel gegen das alte Werkzeug (4 failed), dazu vier Mutationen (alter Ablauf bei gleichem Zustand 5 failed, offenes Issue ignoriert 1, Deckel nicht erkannt 1, passende Kommentare ohne `no change` 4). Prüfbefehle: Punkt 1 vitest 13 passed Exit 0, keine Zeile `fehlt:`, `exit=1`, `1`, `1`, `0`; Punkt 2 vitest 2 passed Exit 0, keine Zeile `fehlt:`, `2`, `1`; Punkt 3 `1`, `6`; Punkt 4 `12`, `0`, `0`, `0`, `0`; Punkt 5 auf dem code-host `breaker off, last none, no change` (jetzt mit Trockenlauf gegen GitHub), keine Zustandsdatei vorher und nachher; Punkt 6 `check: grün in 141 s`; Punkt 7 vitest 13 passed Exit 0, keine Zeile `fehlt:`, `1`.
- 2026-11-25 Release: PASS K und B (Zyklus 3), DONE.

## Blockers
