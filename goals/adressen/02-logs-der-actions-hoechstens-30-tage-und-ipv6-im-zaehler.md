# Adressen Goal 02: Logs der Actions höchstens 30 Tage und IPv6 im Zähler

## Status
ACTIVE

## Active Objective
Die Logs der Actions des öffentlichen Repos bleiben höchstens 30 Tage lesbar, so wie die Datenschutzerklärung der Seite die Löschung
der Logs nach 30 Tagen zusagt, und `ops/actions-log-addresses.sh` zählt auch eine IPv6-Adresse eines Besuchers. Zuerst lernt der
Zähler IPv6 (Fixture aus `2001:db8::/32`, `::1` und `fe80::/10` privat), mit einem Test, der vor dem Fix rot war. Dann setzt Matthias
am Human Gate `security_settings` die Aufbewahrung von Artefakten und Logs auf 30 Tage. Danach belegt das Goal mit Netz, dass `.days`
höchstens 30 ist, und `docs/adressen/actions-logs.md` nennt die Einstellung und den Aufruf
`bash ops/actions-log-addresses.sh --workflow deploy.yml` für jeden neuen Lauf.
Widerlegt, wenn die Aufbewahrung schon heute höchstens 30 Tage beträgt; dann entfällt das Human Gate und es bleiben IPv6 und die Doku.
Übernimmt `goals/_vorschlaege/adressen-kritik-2026-11-14-1.md` und `goals/_vorschlaege/adressen-kritik-2026-11-14-2.md`.
MVP: Funktion, weil adressen 01 nur die sechs bekannten Läufe geräumt hat: Trägt ein künftiger Lauf wieder eine Adresse, bliebe sie
90 Tage öffentlich lesbar, und eine IPv6-Adresse fände der Zähler heute gar nicht.

## Voraussetzungen
- adressen Goal 01 DONE

## Kontext für den Maker
- Ziel: Ein Besucher, dessen Adresse doch einmal in einem Log der Actions landet, ist dort nach spätestens 30 Tagen nicht mehr
  lesbar, und wer nach Adressen sucht, findet sie auch, wenn der Besucher über IPv6 kam.
- Gemessen vom Tech Lead am 14.11.2026: `gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention`
  gibt `{"days":90,"maximum_allowed_days":90}` aus. Das Goal ist also nicht widerlegt und läuft bis zum Human Gate; misst du vor dem
  Gate schon höchstens 30, setzt du keinen Blocker, nennst es im Kommentar und baust Punkt 3 mit deiner Messung.
- Die Einstellung gilt nur für Logs und Artefakte, die nach der Änderung entstehen; ältere behalten ihre 90 Tage. Das ist hier ohne
  Folgen, weil adressen 01 unter `## Nach dem Löschen` belegt, dass kein Lauf von `deploy.yml` eine fremde Adresse trägt. Die Doku
  sagt das in einem Satz.
- Entscheidung Tech Lead (14.11.2026) zu IPv6 in `ops/actions-log-addresses.sh`: Kandidat ist in einer Zeile einer Anfrage (Regel wie
  bisher) eine Folge aus Hex-Ziffern und `:` (dazu ein IPv4-Rest am Ende), links und rechts nicht von Hex-Ziffern, `:` oder `.`
  begrenzt, die eine gültige IPv6-Adresse ist: genau acht Gruppen zu 1 bis 4 Hex-Ziffern oder höchstens sieben mit genau einem `::`.
  Eine Uhrzeit wie `05:57:46` ist deshalb keine Adresse. Gezählt und verglichen wird die ausgeschriebene Form (acht Gruppen, je vier
  Stellen, Kleinbuchstaben), damit `2001:db8::7` und `2001:DB8:0:0:0:0:0:7` eine Adresse sind; dieselbe Form gilt für Einträge der
  drei Listen. Privat und nie gezählt sind `::` und `::1`, `fe80::/10` und `fc00::/7`. `::ffff:<IPv4>` zählt als diese IPv4-Adresse
  nach den IPv4-Regeln, also einmal und nicht zusätzlich als IPv6. Dokumentationsadressen aus `2001:db8::/32` zählen, damit Tests sie
  als Besucher pflanzen können. Die Ausgabe bleibt wie sie ist (`<id> <n>`, `<id> no-log`, `total <n>`), nie eine Adresse, auch nicht
  auf stderr; Exit 2 bleibt wie in adressen 01.
- Die Prüfungen von adressen 01 Punkt 1 laufen jede Nacht im Audit weiter und müssen grün bleiben, vor allem die IPv4-Fixture mit
  `1 1 2 2 total 2 `.
- Test: neue Fälle in `test/actions-log-addresses.test.ts`, ohne Netz, mit `--dir` wie die bestehenden: IPv6-Besucher werden gezählt,
  zwei Schreibweisen derselben Adresse zählen einmal, `::1`, `fe80::1` und `fd00::1` zählen nicht, eine IPv6-Adresse aus der eigenen
  Liste zählt nicht, auch in anderer Schreibweise, `::ffff:` vor einer IPv4-Adresse zählt einmal, eine Uhrzeit zählt nie, und keine
  Ausgabe enthält eine IPv6-Adresse. Fixtures nur mit Adressen aus `2001:db8::/32`, den IPv4-Dokumentationsbereichen und privaten
  Bereichen. Die neuen Fälle laufen zuerst gegen das alte Skript und sind rot; die Progress-Log-Zeile nennt, womit.
- Kopfkommentar von `ops/actions-log-addresses.sh` und der Abschnitt in `ops/README.md` nennen IPv6 und die privaten IPv6-Bereiche;
  der Satz „GitHub keeps readable for 90 days“ in `ops/README.md` und „GitHub hält solche Logs 90 Tage lesbar“ in der Einleitung von
  `docs/adressen/actions-logs.md` werden nach dem Gate auf den neuen Stand gebracht.
- `docs/adressen/actions-logs.md` (Deutsch): neuer Abschnitt `## Aufbewahrung` am Ende. Darin der Befehl zum Lesen der Einstellung
  in einem Codeblock (`gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention`), die Zeile
  `Aufbewahrung der Logs: <n> Tage, geprüft <JJJJ-MM-TT HH:MM> UTC` ab Spalte 0 außerhalb eines Codeblocks, der Satz zu älteren Logs,
  und ein Codeblock mit `bash ops/actions-log-addresses.sh --workflow deploy.yml` samt dem Satz, dass dieser Aufruf nach jedem neuen
  Lauf von `deploy.yml` `total 0` ausgeben muss und bei Exit 2 nichts belegt. Die Abschnitte von adressen 01 bleiben unverändert,
  weil das Audit sie prüft. Keine Adresse in der Datei, auch keine Dokumentationsadresse und kein Bereich aus `2001:db8::/32`.
- Ablauf: Punkte 1 und 4 bauen, Progress-Log-Zeile, Commit, Push, Draft-PR. Dann `## Status` auf `BLOCKED matthias` und unter
  `## Blockers` die Zeilen `Art: matthias`, `Gate: security_settings`, `Aufgabe: Aufbewahrung von Logs und Artefakten im Repo
  control-plane von 90 auf 30 Tage setzen`, `Worum: Die Datenschutzerklärung sagt die Löschung nach 30 Tagen zu, GitHub hält die
  Logs der Actions heute 90 Tage öffentlich lesbar.` und `Empfehlung:` mit dem fertigen Befehl `gh api -X PUT
  repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention -F days=30` (im Browser: Settings, Actions,
  General, Artifact and log retention auf 30, Save). Commit, Push. Den Rest macht der Loop Master.
- Nach dem Gate: `origin/dev` in den Goal-Branch mergen, Punkt 2 messen, Abschnitt `## Aufbewahrung` mit deiner Messung schreiben
  (Punkt 3), alle Prüfungen und `check` erneut.
- Unter `src/` ändert sich nichts, `ops/` und `docs/` liegen nicht im Laufzeitpfad von `deploy.yml`, also löst das Goal keinen Rollout
  aus (Grundregel 5).
- Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout. Neue Dateien vor dem lokalen
  `check` stagen, weil die Regeln nur `git ls-files` lesen. Gib in keinem Log, Kommentar, Commit, PR oder Verdict eine Adresse aus,
  nur Zahlen.

## Done Condition
- [x] `ops/actions-log-addresses.sh` zählt fremde IPv6-Adressen in Zeilen einer Anfrage, eine Adresse in zwei Schreibweisen einmal,
      lässt `::1`, `fe80::/10`, `fc00::/7`, Uhrzeiten und Adressen der Listen aus und gibt keine Adresse aus.
      MVP: Funktion, weil der Zähler sonst `total 0` meldet, sobald Besucher über IPv6 kommen.
      Prüfung: `d=$(mktemp -d); mkdir -p "$d/logs/1" "$d/logs/2"; printf '05:57:46  2001:db8::7  POST /v1/chat/completions  503\n06:00:01  ::1  GET /health  200\n06:00:02  fe80::1  GET /health  200\n06:00:03  2001:DB8:0:0:0:0:0:7  GET /health  200\n06:00:04  2001:db8:0::9  GET /health  200\n06:00:05  fd00::1  GET /health  200\n(new own address 2001:db8::5, written to own-ips.txt)\n' > "$d/logs/1/0_deploy.txt"; printf '16:41:04  2001:db8::8  GET /v1/credits/balance  502\n18:15:25  203.0.113.7  POST /v1/chat/completions  402\n18:15:26  ::ffff:203.0.113.7  GET /health  200\n' > "$d/logs/2/0_deploy.txt"; printf '2001:db8::9 2026-11-14 test\n' > "$d/own"; CP_OWN_IPS_FILE="$d/own" CP_KNOWN_IPS=/dev/null CP_CRAWLER_IPS=/dev/null bash ops/actions-log-addresses.sh --dir "$d/logs" | tr '\n' ' '` muss `1 1 2 2 total 3 ` ausgeben.
      Prüfung: `pnpm -s vitest run test/actions-log-addresses.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c 'IPv6' ops/README.md` muss mindestens 1 ausgeben.
- [x] Nach dem Human Gate `security_settings` hält das Repo Logs und Artefakte der Actions höchstens 30 Tage.
      MVP: Funktion, weil erst das die Zusage der Datenschutzerklärung für jeden künftigen Lauf einhält.
      Prüfung (Netz): `gh api repos/matthiashippe/control-plane/actions/permissions/artifact-and-log-retention --jq '.days <= 30'` muss `true` ausgeben.
- [x] `docs/adressen/actions-logs.md` nennt unter `## Aufbewahrung` die gemessene Einstellung mit Zeit, den Befehl, mit dem man sie
      liest, und den Aufruf des Zählers für jeden neuen Lauf, und keine Adresse.
      MVP: Funktion, weil sonst niemand weiß, wie man nachprüft, dass die Zusage gilt.
      Prüfung: `awk '/^## Aufbewahrung/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cE '^Aufbewahrung der Logs: ([1-9]|[12][0-9]|30) Tage, geprüft 2026-(11|12)-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 1 ausgeben.
      Prüfung: `awk '/^## Aufbewahrung/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -c 'actions/permissions/artifact-and-log-retention'` muss mindestens 1 ausgeben.
      Prüfung: `awk '/^## Aufbewahrung/{f=1;next} /^## /{f=0} f' docs/adressen/actions-logs.md | grep -cF 'bash ops/actions-log-addresses.sh --workflow deploy.yml'` muss mindestens 1 ausgeben.
      Prüfung: `grep -cE '\b([0-9]{1,3}\.){3}[0-9]{1,3}\b' docs/adressen/actions-logs.md` muss 0 ausgeben.
      Prüfung: `grep -ciE '\b[23][0-9a-f]{3}:[0-9a-f]{0,4}:' docs/adressen/actions-logs.md` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neuen Testfälle waren vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Die Prüfungen von adressen 01 Punkt 1 bis 3 ohne Netz bleiben grün.
- [ ] Keine Adresse in Commit, PR, Kommentar, Log, Doku oder Verdict, nur Zahlen.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- `src/**` ganz
- Einstellungen des Repos ändert der Loop nicht: kein `gh api -X PUT`, `-X PATCH` oder `-X DELETE` auf das Repo, seine Läufe oder
  seine Logs (`security_settings`, `delete_data`, bei Matthias)
- `ops/own-ips.txt`, `ops/known-ips.txt`, `ops/crawler-ips.txt` und der Cache von `ops/fetchers.py` bleiben unverändert;
  `ops/fetchers.py` wird nicht aufgerufen
- Die Abschnitte `## Zählung vor dem Löschen` und `## Nach dem Löschen` in `docs/adressen/actions-logs.md` bleiben unverändert
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1 und 4 gebaut, IPv6 im Zähler (volle Form, privat `::`, `::1`, `fe80::/10`, `fc00::/7`, `::ffff:` als IPv4), sieben neue Fälle in `test/actions-log-addresses.test.ts`, davon drei gegen das alte Skript rot (`pnpm -s vitest run test/actions-log-addresses.test.ts` -> 3 failed | 16 passed), Punkte 2 und 3 warten auf das Human Gate `security_settings` (gemessen 18:36 UTC: `days` 90). Prüfbefehle: Punkt 1 Fixture -> `1 1 2 2 total 3 ` mit gawk und mawk, Gegenprobe mit dem alten Skript -> `1 0 2 1 total 1 `; vitest -> 19 passed, auch mit mawk; `grep -c 'IPv6' ops/README.md` -> 3; adressen 01 Punkt 1 -> `1 1 2 2 total 2 `, `2 0`, `da`; `node scripts/check.mjs` -> Exit 0, 1796 Tests grün.
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4; Punkte 2 und 3 gebaut, nachdem der Tech Lead das Gate `security_settings` aufgehoben und die Aufbewahrung auf 30 Tage gesetzt hat; `origin/dev` gemergt (schon aktuell), Abschnitt `## Aufbewahrung` mit Messung 18:43 UTC, Einleitung der Doku und Satz in `ops/README.md` auf 30 Tage gebracht. Prüfbefehle: Punkt 1 Fixture -> `1 1 2 2 total 3 `, vitest -> 19 passed, `grep -c 'IPv6' ops/README.md` -> 3; Punkt 2 -> `true` (Gegenprobe `{"days":90}` -> `false`); Punkt 3 -> 1, 1, 1, 0, 0 (Gegenproben: Zeile auf dev -> 0, mit 90 Tagen -> 0, gepflanzte IPv4- und IPv6-Adresse -> 1 und 1); adressen 01 Punkte 1 bis 3 ohne Netz grün (4, 6, 1, 1, 1, 1, 1); `node scripts/check.mjs` -> Exit 0, 1796 Tests grün.

## Blockers
