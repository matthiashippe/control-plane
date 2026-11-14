# Domains Goal 04: Die Live-Prüfung sagt, worauf sie wartet, und das Warten ist in der Produktion belegt

## Status
ACTIVE

## Active Objective
`ops/live.sh` gibt nach `SETUP CLIENT-KEY OK changed=1` vor dem Warten die Zeile
`WAIT sandbox: new client key, <n> s before the create` aus, und ein Lauf in der Produktion mit `changed=1` belegt mit den
Zeitstempeln aus dem Log des Dienstes (`key not accepted`), dass die Anlage mehr als `RECHECK_MS` nach der letzten solchen Zeile
kam; Ergebnis samt Dauer des ganzen Laufs in `docs/sandbox/schluesselwechsel.md`. Weil ein Schlüsselwechsel von selbst praktisch
nie kommt, löst das Goal einen für die eigene Adresse aus und begründet das in `goals/domains/ANNAHMEN.md` (`ROADMAP.md`,
domains 04; übernimmt `goals/_vorschlaege/domains-kritik-2026-11-13-2.md` und `goals/_vorschlaege/domains-kritik-2026-11-13-3.md`).
MVP: Funktion, weil das Warten aus domains 03 bisher nur gegen Attrappen belegt ist und ein Lauf, der 75 s still steht, für den
Release Manager wie ein hängender Lauf aussieht; bricht er ihn ab, fehlt `LIVE OK`, und die Prüfung gilt als rot.

## Voraussetzungen
- domains Goal 03 DONE

## Kontext für den Maker
- Ziel: Der Release Manager kann nach jedem Rollout der Live-Prüfung glauben, auch beim ersten Lauf nach einem neuen
  Client-Schlüssel, damit keine gute Änderung an Sandbox oder Abrechnung zurückgenommen wird und fremde Automatons ihren Dienst bei
  uns weiter starten können.
- Widerlegt ist das Glied nicht: `sandbox_live` ruft nach `changed=1` nur `live_wait "$CLIENT_KEY_WAIT_S"` und gibt nichts aus
  (`grep -n 'live_wait\|WAIT' ops/live.sh`), und das Progress Log von domains 03 nennt für den Live-Lauf nur `changed=0`.
- Falle bei der Zeile: `live()` ruft `say "$(judge_sandbox "$(sandbox_live "$key")")"`, also landet alles, was `sandbox_live` auf
  stdout schreibt, im Richter und erst nach dem Lauf auf dem Bildschirm. Die Zeile muss vor dem Warten sichtbar sein (etwa auf
  stderr) und darf das Urteil von `judge_sandbox` nicht ändern. `<n>` ist der Wert von `CLIENT_KEY_WAIT_S`, nicht eine zweite Zahl.
- Selbsttest für die Zeile, Zeilen `planted sandbox-wait-line <fall>: <Ausgabe des Richters>`, durch den echten `sandbox_live` wie
  `sandbox_wait_run` aus domains 03 (Attrappe für `setup.sh`, gezählte statt geschlafene Sekunden): `new-key` (mit `changed=1` genau
  eine Zeile mit `<n>` gleich `CLIENT_KEY_WAIT_S`, vor dem Warten und vor dem Anlegen, OK), `old-key` (mit `changed=0` keine Zeile,
  OK), `silent` (Warten ohne Zeile, FAIL) und `late` (Zeile erst nach dem Warten, FAIL). Wie der Selbsttest die Reihenfolge von
  Zeile, Warten und Anlegen festhält, entscheidest du und hältst es in `goals/domains/ANNAHMEN.md` fest.
- Der Auslöser: `ops/sandbox/setup.sh --client-key` schreibt nur, wenn der Hash von `/etc/sandboxd/keys/cp.pub` auf dem
  Sandbox-Server vom öffentlichen Schlüssel des Dienstes abweicht; der Schlüssel des Dienstes liegt fest in `/data` von
  `deploy-cp-1`. Ein Wechsel von selbst kommt also nur mit einem neuen Volume oder einem verlorenen `cp.pub`, praktisch nie, und ein
  früherer Lauf hat keine Zeitstempel seiner Anlage. Darum bekommt `setup.sh` einen Schalter `--client-key-reset <address>`, der
  `cp.pub` auf dem Sandbox-Server nach `cp.pub.prev` verschiebt (letzte Zeile `SETUP CLIENT-KEY-RESET OK moved=1`, ohne `cp.pub`
  `moved=0`), und der nächste `--client-key` aus `ops/live.sh` setzt denselben Schlüssel wieder (`changed=1`). Nichts von Hand auf
  einem Server (`loop-constraints.md`, Produktion), der Schalter ist Code im Repo wie `--client-key`.
- Falle beim Auslöser: `sandboxd` liest jede Datei mit Endung `.pub` in `/etc/sandboxd/keys` (`ops/sandbox/sandboxd.mjs`, Funktion
  zu `keysDir`). Der verschobene Schlüssel darf nicht auf `.pub` enden, sonst nimmt `sandboxd` ihn weiter an und es gibt kein
  `key not accepted`. Der Prüfschlüssel des code-host im selben Ordner bleibt unberührt.
- Selbsttest des Schalters in `bash ops/sandbox/setup.sh --selftest`, im selben Muster wie `ck` für `--client-key` (Root-Präfix in
  einem Ordner aus `mktemp -d`, kein Netz), Zeilen `selftest client-key-reset: ok (<fall>)` oder `FAIL <fall>: <warum>`: `moved`
  (`cp.pub` danach weg, `cp.pub.prev` mit demselben Inhalt, der Prüfschlüssel unverändert), `again` (zweiter Aufruf `moved=0`,
  nichts geändert) und `reinstall` (danach gibt `install_client_key` mit dem alten Schlüssel `changed=1`).
- Der Lauf in der Produktion, genau einmal und nur nach grünem Selbsttest: Davor liest du mit `readonly: true`, ob eine fremde
  Sandbox läuft (Konto nicht aus `src/bounties/ours.ts`); läuft eine, wartest du bis zum nächsten Zyklus und schreibst das ins
  Progress Log, weil in dem Fenster jeder Aufruf an `sandboxd` scheitert. Sonst in einem Zug: `--client-key-reset 72.62.51.224`
  (Zeitpunkt `reset`), dann mindestens 65 s warten, damit der Abrechnungstakt einmal scheitert und `lastFailure` setzt (sonst prüft
  der Lauf das Warten nicht), dann `bash ops/live.sh 2>&1` mit einem UTC-Zeitstempel je Zeile (etwa
  `while IFS= read -r l; do printf '%s %s\n' "$(date -u +%FT%TZ)" "$l"; done`). Das Fenster mit 501 für neue Sandboxes dauert so
  rund vier Minuten.
- Die Zeitstempel: `last_401` ist die letzte Zeile mit `key not accepted` aus `docker logs --timestamps deploy-cp-1` vor `create`,
  `wait` der Zeitstempel der Zeile `WAIT sandbox:`, `create` der Zeitstempel von `POST /v1/sandboxes` von der eigenen Adresse im
  Zugriffslog von `deploy-caddy-1`, `run_s` die Dauer von `bash ops/live.sh` in ganzen Sekunden. Alles lesend nach
  `loop-constraints.md`, Produktion.
- `docs/sandbox/schluesselwechsel.md`: was gemessen wurde, die Befehle, mit denen du jeden Wert geholt hast (Regel 3), und genau eine
  Zeile `Messung: reset=<ISO> last_401=<ISO> wait=<ISO> create=<ISO> changed=1 sandbox=OK live=OK run_s=<n>` mit UTC-Zeitstempeln
  der Form `2026-11-14T10:01:02Z`. Kein Schlüssel, keine Kunden-Adresse, kein `CP_HOST` in der Datei (öffentliches Repo).
- Meldet der Lauf mit `changed=1` `FAIL sandbox`, ist domains 03 widerlegt: Messung und Ausgabe trotzdem in die Doku, Goal
  `BLOCKED fachlich` mit dem Befund an den Tech Lead, kein Fix an `CLIENT_KEY_WAIT_S` oder am Dienst in diesem Goal.
- Nicht Teil dieses Goals: die Zeitgrenze, mit der der Release Manager `bash ops/live.sh` fährt (Skill im code-host), und der
  Dienst selbst (`RECHECK_MS` bleibt, wie es ist).
- Die Fälle des Selbsttests aus domains 02, domains 03 und sandbox 05 bleiben, wie sie sind.

## Done Condition
- [x] `ops/live.sh` sagt nach `changed=1` vor dem Warten, worauf es wartet, und schweigt nach `changed=0`; eine fehlende und eine
      späte Zeile sind FAIL.
      Prüfung: `bash ops/live.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `LIVE SELFTEST OK` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted sandbox-wait-line (new-key|old-key): OK '` muss `2` ausgeben.
      Prüfung: `bash ops/live.sh --selftest | grep -cE '^planted sandbox-wait-line (silent|late): FAIL '` muss `2` ausgeben.
- [x] `ops/sandbox/setup.sh --client-key-reset` nimmt `cp.pub` aus dem Ordner, den `sandboxd` liest, lässt den Prüfschlüssel stehen
      und macht den nächsten `--client-key` zu `changed=1`.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben.
      Prüfung: `bash ops/sandbox/setup.sh --selftest | grep -cE '^selftest client-key-reset: ok \((moved|again|reinstall)\)$'` muss `3` ausgeben.
- [x] Der Lauf in der Produktion mit `changed=1` ist gemessen: zwischen Reset und Warten scheiterte mindestens ein Aufruf mit
      `key not accepted`, die Anlage kam mehr als `RECHECK_MS` nach der letzten solchen Zeile und mindestens `CLIENT_KEY_WAIT_S`
      nach der Zeile `WAIT`, und Sandbox und Live-Prüfung waren grün.
      Prüfung: `node -e 'const fs=require("fs");const d=fs.readFileSync("docs/sandbox/schluesselwechsel.md","utf8");const r=Number(/const RECHECK_MS = ([0-9_]+);/.exec(fs.readFileSync("src/sandbox/service.ts","utf8"))[1].replace(/_/g,""))/1000;const w=Number(/^CLIENT_KEY_WAIT_S=([0-9]+)$/m.exec(fs.readFileSync("ops/live.sh","utf8"))[1]);const m=[...d.matchAll(/^Messung: reset=(\S+Z) last_401=(\S+Z) wait=(\S+Z) create=(\S+Z) changed=1 sandbox=OK live=OK run_s=([0-9]+)$/gm)];if(m.length!==1){console.log("lines "+m.length);process.exit(1)}const [,a,b,c,e,s]=m[0];const t=x=>Date.parse(x)/1000;console.log(t(a)<t(b)&&t(b)<t(c)&&t(e)-t(b)>r&&t(e)-t(c)>=w&&Number(s)>w?"measured ok":"measured bad")'` muss `measured ok` ausgeben.
      Prüfung: `grep -cE '(PRIVATE KEY|CP_HOST=|0x[0-9a-fA-F]{40})' docs/sandbox/schluesselwechsel.md` muss `0` ausgeben.
- [x] Der Sandbox-Server hat nach dem Lauf wieder genau den Schlüssel des Dienstes.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --client-key 72.62.51.224 | tail -n 1` muss `SETUP CLIENT-KEY OK changed=0` ausgeben.
- [x] `check` ist grün.
      Prüfung: `node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Die neuen Fälle beider Selbsttests waren vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] `goals/domains/ANNAHMEN.md` begründet, warum das Goal den Schlüsselwechsel selbst auslöst, und nennt Zeitpunkt und Dauer des
      Fensters.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/sandbox/**` außer `ops/sandbox/setup.sh`, `ops/conway-series.sh`, `ops/conway-money-series.sh`,
  `.env*`, `~/.config/control-plane/**` (nur lesen)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-14 Zyklus 1: Punkte 1, 2, 3, 4, 5 gebaut: `sandbox_live` gibt nach `changed=1` über `client_key_wait` vor dem Warten auf stderr `WAIT sandbox: new client key, 75 s before the create` aus (Selbsttest `sandbox-wait-line` über eine Ereignisdatei), `setup.sh --client-key-reset` verschiebt `cp.pub` nach `cp.pub.prev` (Selbsttest moved, again, reinstall), und der Lauf in der Produktion mit `changed=1` ist in `docs/sandbox/schluesselwechsel.md` gemessen (letzter 401 01:35:58, `WAIT` 01:36:49, Anlage 01:38:05, `LIVE OK`, `run_s=124`); ein erster Lauf um 01:28 wartete richtig, scheiterte aber am fehlenden Image `sandboxd-base:1` (Prune-Cron des Mitbewohners), das `bash ops/sandbox/setup.sh 72.62.51.224` neu baute (ANNAHMEN.md, Vorschlag `sandbox-nacharbeit-2026-11-14-1.md`). Rot vor dem Fix: `new-key` FAIL mit `sandbox_live` auf `live_wait` (Stand vor dem Goal), dazu FAIL bei doppelter Zeile, falscher Zahl, Zeile auf stdout, Zeile nach `changed=0`; die drei `client-key-reset`-Fälle FAIL ohne `client_key_reset` (command not found), mit `cp.prev.pub`, mit Kopie statt Verschieben, mit gelöschtem Prüfschlüssel. Prüfbefehle: P1 `bash ops/live.sh --selftest` Exit 0, letzte Zeile `LIVE SELFTEST OK`, `2`, `2`; P2 `bash ops/sandbox/setup.sh --selftest` Exit 0, `3`; P3 `measured ok` (Gegenprobe: Anlage 2 s früher `measured bad`, `live=FAIL` `lines 0`), `0`; P4 (Netz) `SETUP CLIENT-KEY OK changed=0`; P5 `node scripts/check.mjs` Exit 0 (146 Dateien, 1709 Tests, Node 22, Last 124).
- 2026-11-14 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, nach Merge von `dev` (7020272) in den Goal-Branch. Prüfbefehle: P1 `bash ops/live.sh --selftest` Exit 0, letzte Zeile `LIVE SELFTEST OK`, `2`, `2`; P2 `bash ops/sandbox/setup.sh --selftest` Exit 0, `3`; P3 `measured ok`, `0`; P4 (Netz) `SETUP CLIENT-KEY OK changed=0`; P5 `node scripts/check.mjs` Exit 0 (147 Dateien, 1718 Tests, Node 22, Last 81).

## Blockers
