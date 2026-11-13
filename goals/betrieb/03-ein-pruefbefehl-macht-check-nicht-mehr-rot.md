# Betrieb Goal 03: Ein Prüfbefehl macht check nicht mehr rot

## Status
ACTIVE

## Active Objective
Ein Prüfbefehl mit Netz verändert das Repo nicht mehr: `own_ips` in `ops/own-ips.sh` schreibt eine neu gesehene eigene Adresse nur
dann nach `ops/own-ips.txt`, wenn `CP_OWN_IPS_WRITE=1` gesetzt ist (von Hand, wenn ein Mensch die Liste pflegen will), und zählt sie
sonst nur für den laufenden Aufruf als eigene Adresse mit. Heute hängt jeder Lauf von `ops/deploy-window.sh` ohne `--log`, dessen
ssh eine neue Adresse des code-host sieht, eine Zeile an `ops/own-ips.txt` an, eine Datei der Deny List fast jedes Goals; danach ist
`check` rot und der Goal-PR trägt einen Diff, den keiner wollte (betrieb 02, Zyklus 2, Vorschlag betrieb-kritik-2026-11-12-4).
Widerlegt, wenn `ops/own-ips.txt` nach `ops/deploy-window.sh --at …` mit nachgebautem `ssh`, der eine neue Adresse meldet, schon
heute unverändert ist.
MVP: Funktion, weil Linse K und das Loop-Audit nach jedem Prüfbefehl mit Netz einen falsch roten `check` bekommen und jeder davon
einen Zyklus oder eine Reparatur ohne Befund kostet, also Zeit, die den Goals für zahlende Kunden fehlt.

## Voraussetzungen
- betrieb Goal 02 DONE

## Kontext für den Maker
- Fundstelle: `ops/own-ips.sh`, Funktion `own_ips`, die Zeile `printf '%s %s  this machine, seen live\n' … >> "$list_file"`. Sie
  läuft bei jedem Aufruf, dessen ssh eine Adresse liefert, die noch nicht in der Liste steht. Aufrufer: `ops/deploy-window.sh` (ohne
  `--log`), `ops/traffic.sh`, `ops/failures.sh`, `ops/crawlers.sh`, `ops/first-typing.sh`, `ops/depth.sh`, `ops/visibility.sh`. Die
  Aufrufer bleiben unverändert; das Verhalten ändert sich nur in `own_ips`.
- Neues Verhalten: Ohne `CP_OWN_IPS_WRITE=1` bleibt die Datei unberührt, die live gesehene Adresse steht trotzdem in der Ausgabe von
  `own_ips` (sonst zählt der Aufrufer die eigenen Prüfungen nach dem Rollout als fremde Anfragen, genau der Fehler, gegen den die
  Liste existiert), und stderr sagt in einer Zeile, dass sie nur für diesen Lauf zählt und `CP_OWN_IPS_WRITE=1` sie in die Liste
  schreibt. Mit `CP_OWN_IPS_WRITE=1` bleibt alles wie heute: genau eine Zeile `<adresse> <JJJJ-MM-TT>  this machine, seen live`, und
  keine, wenn die Adresse schon dasteht. Jeder andere Wert als `1` schreibt nicht. Die fehlende Datei bleibt `return 1` wie heute.
  Den Kopfkommentar von `ops/own-ips.sh` und den Kommentar über `own_ips` in `ops/deploy-window.sh` passt der Maker an, damit sie
  nicht mehr sagen, jeder Lauf schreibe.
- `deploy.yml` bleibt unverändert (`.github/**` steht auf der Deny List): Der Schritt „Deploy-Fenster“ läuft in einem Checkout des
  GitHub-Rechners, der nach dem Lauf verworfen wird, also hat das Schreiben dort nie etwas bewirkt. Was der Schritt braucht, ist die
  Adresse des Rechners als eigene Adresse für diesen einen Lauf, und die liefert `own_ips` auch ohne `CP_OWN_IPS_WRITE`.
- Test `test/own-ips-write.test.ts`, ohne Netz, nur Dokumentationsadressen (`192.0.2.0/24`, `198.51.100.0/24`, `203.0.113.0/24`),
  nie ein fester Port. Ein nachgebautes `ssh` vorn im `PATH` antwortet auf den Befehl mit `SSH_CLIENT` mit `192.0.2.77 40000 22`, auf
  den Abruf des Zugriffslogs aus `ops/access-log.sh` (`docker exec deploy-caddy-1 …`) mit gepflanzten Zeilen und auf alles andere mit
  Exit 255. Fälle:
  `own_ips` mit `CP_OWN_IPS_FILE` auf einer Kopie, die `192.0.2.77` nicht enthält: Datei byte-gleich (sha256 vorher und nachher), die
  Ausgabe enthält `192.0.2.77`, stderr nennt `CP_OWN_IPS_WRITE=1`;
  dasselbe mit `CP_OWN_IPS_WRITE=1`: genau eine neue Zeile, die mit `192.0.2.77 ` beginnt und auf `this machine, seen live` endet;
  mit `CP_OWN_IPS_WRITE=1` und schon gelisteter Adresse: Datei byte-gleich;
  Ende zu Ende: `ops/deploy-window.sh`, `ops/own-ips.sh`, `ops/access-log.sh` und eine Kopie von `ops/own-ips.txt` in einen
  `mktemp`-Ordner `<tmp>/ops/` kopiert, `bash <tmp>/ops/deploy-window.sh --at 2026-11-01T12:00:00` ohne `CP_OWN_IPS_FILE` (damit der
  Standardpfad neben dem Skript greift) und mit `CP_WINDOW_NOW=""`, das gepflanzte Log trägt im Fenster einen 502 von `192.0.2.77`
  und einen 200 von `198.51.100.23`: `<tmp>/ops/own-ips.txt` byte-gleich, die Ausgabe enthält `ours     1 request(s)` und die Zeile
  `BAD GATEWAY 0 of 1 request(s) from outside answered 502`, und keine Zeile der Ausgabe nennt `198.51.100.23`.
  Rot vor dem Fix sind der erste und der letzte Fall (die Datei wächst um eine Zeile); die Zeile im Progress Log nennt das mit Zahl.
- Das echte `ops/own-ips.txt` fasst der Test nie an, auch nicht, wenn er rot ist. Prüfbefehle mit Netz fährt der Maker vor dem Fix nur
  mit `CP_OWN_IPS_FILE` auf einer Kopie im Scratch-Ordner; nach dem Fix muss der Prüfbefehl (Netz) unten ohne diese Hilfe grün sein.
- Traction: Seit betrieb 02 misst jeder Rollout sein Fenster, und betrieb 04 misst zwei Fenster mit `--at` von Hand. Ohne dieses Goal
  macht jede dieser Messungen `check` rot, bis jemand `git checkout -- ops/own-ips.txt` tippt; danach laufen K, Audit und betrieb 04
  ohne falsch rote Zyklen, und die Kette erreicht die Goals für zahlende Automatons schneller.
- Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich. Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`),
  `check` und vitest im Vordergrund mit eigenem Timeout; nach `check` mit `git status --short` prüfen, dass der Lauf nichts im
  Checkout hinterlassen hat. Kein `pkill -f`.

## Done Condition
- [x] `own_ips` schreibt nur mit `CP_OWN_IPS_WRITE=1` nach der Liste, zählt die live gesehene Adresse ohne die Variable trotzdem als
      eigene und sagt auf stderr, wie man sie behält.
      Prüfung: `pnpm -s vitest run test/own-ips-write.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -c "CP_OWN_IPS_WRITE" ops/own-ips.sh` muss mindestens 2 ausgeben.
      Prüfung: `grep -cE "192\.0\.2\.77" test/own-ips-write.test.ts` muss mindestens 1 ausgeben.
- [x] `ops/deploy-window.sh --at …` mit nachgebautem `ssh` lässt die Liste neben dem Skript unverändert und zählt die live gesehene
      Adresse als eigene.
      Prüfung: `grep -c "deploy-window.sh" test/own-ips-write.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `grep -c "BAD GATEWAY 0 of 1 request(s) from outside answered 502" test/own-ips-write.test.ts` muss mindestens 1 ausgeben.
      Prüfung: `pnpm -s vitest run test/own-ips-write.test.ts test/deploy-window.test.ts` muss Exit-Code 0 haben.
      Prüfung: `bash ops/deploy-window.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `DEPLOY WINDOW SELFTEST OK` ausgeben.
      Prüfung (Netz): `set -a; . ~/.config/control-plane/loop.env; set +a; bash ops/deploy-window.sh --at 2026-11-12T16:41:02 >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
- [x] `check` ist grün und lässt `ops/own-ips.txt` unverändert.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung: `node scripts/check.mjs >/dev/null 2>&1; git status --porcelain -- ops/own-ips.txt | wc -l` muss 0 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei war vor dem Fix rot; die Zeile im Progress Log nennt, welche Fälle und womit.
- [ ] `ops/own-ips.txt` ändert sich im Goal-PR nicht.
- [ ] Die Aufrufer von `own_ips` ändern sich nicht, außer dem Kommentar in `ops/deploy-window.sh`.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `src/**`,
  `harness/**`, `deploy/**`, `ops/own-ips.txt`, `ops/access-log.sh`, `ops/watchdog.sh`, `ops/traffic.sh`, `ops/failures.sh`,
  `ops/crawlers.sh`, `ops/first-typing.sh`, `ops/depth.sh`, `ops/visibility.sh`, `ops/conway-series.sh`,
  `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- in `ops/deploy-window.sh` alles außer dem Kommentar über `own_ips`
- Crontab, `/opt/control-plane/.env` und jede Datei auf dem Server; Produktion nur lesend, kein Rollout und kein Neustart von Hand
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 3 gebaut: `own_ips` schreibt nur mit `CP_OWN_IPS_WRITE=1`, zählt die live gesehene Adresse sonst nur für den Lauf und nennt die Variable auf stderr; neuer Test `test/own-ips-write.test.ts` vor dem Fix rot in 3 von 6 Fällen (ohne Variable, Wert `yes`, Ende zu Ende über `deploy-window.sh`: Liste wuchs um eine Zeile), dazu ein siebter Fall für das Verkleben von `CP_OWN_IPS` mit der ersten Listenadresse, am alten Stand nachgewiesen. Prüfbefehle: vitest own-ips-write Exit 0 (7 passed); grep CP_OWN_IPS_WRITE 4; grep 192.0.2.77 2; grep deploy-window.sh 3; grep BAD GATEWAY 1; vitest own-ips-write und deploy-window Exit 0 (15 passed); `--selftest` Exit 0, letzte Zeile DEPLOY WINDOW SELFTEST OK; (Netz) `--at 2026-11-12T16:41:02` 0, stderr meldete eine neue eigene Adresse nur für den Lauf, sha256 der Liste vorher und nachher gleich; `check` Exit 0 (129 Dateien, 1576 Tests); `check` und danach `git status` der Liste 0.

## Blockers
- keine
