# Lange Befehle in der Sandbox (sandbox 05)

Die unveränderte Runtime am Pin `d8f8168` bricht jeden Versuch einer Anfrage nach 30 s ab, egal welchen `timeout` das Werkzeug
`exec` nennt, versucht es bis zu viermal mit demselben `Idempotency-Key` und wirft nach dem vierten Abbruch. Jeder Abbruch zählt
für ihren Circuit Breaker (ab 5 in Folge ist jeder Aufruf 60 s gesperrt). Gemessen wird mit `harness/e2e/long-exec.mjs`: Client und
Werkzeuge der Runtime, eine eigene Sandbox der Stufe klein, `sleep 60` mit `timeout` 90000 und `sleep 180` mit `timeout` 240000, je
danach `list_sandboxes` als nächster Aufruf desselben Clients. Jede Anfrage der Runtime ist mitgeschrieben, abgebrochene als
`abort`; `failures_after` ist der Zähler ihres HTTP-Clients nach dem Aufruf, `runs` zählt, wie oft der Befehl lief (er hängt zuerst
eine Zeile an eine eigene Datei an).

## Vorher

Ort: code-host, lokal ohne Docker, 13.11.2026 04:54:33 bis 04:58:55 UTC. Commit `e8ab65f` (Stand von `dev`, `src/` unverändert),
gebaut mit `pnpm build`, `dist/index.js` über TLS mit eigener CA auf freiem Port, Nachbau `harness/sandboxd/start.mjs` auf freiem
Port (echter `createSandboxd`, Befehle als Prozess), Runtime am Pin `d8f8168` gebaut in `~/.cache/control-plane/automaton-d8f8168`,
Konto mit Testguthaben in einer frischen Datenbank. Befehl:

```sh
NODE_EXTRA_CA_CERTS=<ca.pem> RUNTIME_DIST=~/.cache/control-plane/automaton-d8f8168/dist \
  LONG_EXEC_URL=https://127.0.0.1:<port> LONG_EXEC_KEY=<Schlüssel> node harness/e2e/long-exec.mjs
```

- vorher 60 s: 60168 ms, 2 Versuche (`abort` nach 30 s, dann 200 mit demselben Schlüssel ab 31001 ms), 1 Abbruch, `failures_after`
  0, folgendes `list_sandboxes` 200, Befehl 1 Mal gelaufen, erste Zeile des Werkzeugtexts `exit_code: 0` mit `long-60` in stdout.
- vorher 180 s: 127665 ms, 4 Versuche (gesendet bei 1, 31266, 64131 und 97662 ms), alle 4 `abort`, `failures_after` 4, folgendes
  `list_sandboxes` 200, Befehl 1 Mal gelaufen und bei uns bis zum Ende weiter, das Werkzeug warf, erste Zeile des Werkzeugtexts
  `This operation was aborted`.

Urteil des Gangs: `LONG_EXEC_VERDICT fail long-180: the tool failed: This operation was aborted; long-180: failures_after 4, …`.
Damit ist die Erwartung aus der Goal-Datei bestätigt: 60 s kommt heute über die Wiederholung mit demselben Schlüssel an, 180 s
endet beim Modell als Fehler und lässt den Zähler auf 4 stehen; ein weiterer Fehlschlag irgendeines Aufrufs öffnet danach den
Circuit Breaker für 60 s, Credits und Inferenz eingeschlossen.

## Nachher

Ort: Job `e2e` des Goal-PR #62 auf `ubuntu-latest`, Commit `3ad795e`, 13.11.2026 05:28:25 bis 05:32:45 UTC, `pnpm e2e`
(`harness/e2e/full.sh`: Image des Control Plane aus diesem Stand, Nachbau `sandboxd`, Runtime am Pin `d8f8168`, derselbe Schlüssel
wie im Gang aus Goal 04, eigene Sandbox). Lauf: https://github.com/matthiashippe/control-plane/actions/runs/43372085984/job/131709945589

- nachher 60 s: 60022 ms, 2 Versuche (`abort` nach 30 s, dann 200 mit demselben Schlüssel ab 30689 ms), 1 Abbruch,
  `failures_after` 0, folgendes `list_sandboxes` 200, Befehl 1 Mal gelaufen, erste Zeile des Werkzeugtexts `exit_code: 0` mit
  `long-60` in stdout. Unverändert gegenüber vorher, weil bis `timeout` 90000 ms gehalten wird.
- nachher 180 s: 20008 ms, 1 Versuch mit 200, kein Abbruch, `failures_after` 0, folgendes `list_sandboxes` 200, Befehl 1 Mal
  gelaufen, das Werkzeug warf nicht, erste Zeile des Werkzeugtexts `exit_code: -1`, stdout beginnt mit `The command is still
  running in the background.` und nennt `/root/.exec/<tag>.out`, `.err` und `.exit`. Nach dem Ende gelesen mit `read_file`:
  `.out` gibt `long-180`, `.err` leer, `.exit` gibt `0`.

Schlusszeile des Jobs: `E2E OK turns=5 registered=true api_errors=0 ledger_consistent=true balance_cents=490 domains=true
sandbox=true long_exec=true`; der Nachbau war danach leer (`{"sandboxes":0,"containers":0,"networks":0,"homes":0}`). Gegenprobe:
Der Job am Commit davor (`eb849e1`, Hülle ohne Leerzeichen nach `>`) endete mit `LONG_EXEC_VERDICT fail long-180: the command ran 0
times, expected once; …` und `E2E FAIL … sandbox=true long_exec=false`
(https://github.com/matthiashippe/control-plane/actions/runs/43370906489).

Was der Harness nicht zeigt: Caddy und der echte Sandbox-Server liegen nicht dazwischen. Im Harness spricht die Runtime das Control
Plane direkt über TLS an, und der Nachbau führt Befehle als Prozess aus statt mit `docker exec` in gVisor. Ob Caddy eine Antwort nach
20 s durchreicht und ob die Hülle im Image des Servers ihre Dateien schreibt, prüft der Release Manager nach dem Rollout mit
`ops/live.sh`: Die Prüfung `sandbox` fährt dort in der eigenen Sandbox `sleep 50; echo bg-ok` mit `timeout` 120000, erwartet 200 mit
`running` true und `exit_code` -1 und wartet seit sandbox 09 mit dem Befehl aus `wait_command` auf das Ende (Abschnitt `## Warten`);
sonst meldet sie `FAIL sandbox: background exec …` (Kritik, Punkt 10). Dieses Goal selbst läuft nicht gegen die Produktion.

## Warten

Seit sandbox 09 nennt die Antwort auf einen Befehl im Hintergrund im Feld `wait_command` und als letzte Zeile von `stdout` einen
Befehl. Ein Automaton ruft ihn mit `exec` ohne `timeout` auf: Er wartet höchstens 25 s (`EXEC_WAIT_S`) auf `<tag>.exit` und druckt
dann `The command has ended with exit code <n>.`, die Ausgabe und auf stderr die Fehler und endet mit dem Exit-Code des Befehls,
oder er sagt `The command is still running.` und endet mit 0; dann ruft das Modell denselben Befehl noch einmal. Jeder Aufruf
bleibt unter den 30 s, nach denen die Runtime am Pin abbricht, und zählt nicht für ihren Circuit Breaker. Für 180 s sind das
höchstens 8 Aufrufe. `harness/e2e/long-exec.mjs` folgt genau diesem Befehl und schreibt jeden Aufruf in `waits`; nach jedem
Rollout ruft `ops/live.sh` den Befehl in der eigenen Sandbox durch Caddy und gVisor auf und meldet einen Fehlschlag als
`FAIL sandbox: background exec wait_command …`. Dort läuft `sleep 50; echo bg-ok`, damit der erste Aufruf die vollen 25 s wartet und
„still running“ meldet; endet schon der erste Aufruf, steht `FAIL sandbox: background exec wait_command ended on the first call` da,
weil dann kein voller Aufruf durch Caddy und gVisor gemessen ist.

Gemessen mit neuem Harness und neuem Urteil (`waits` ist die Zahl der Aufrufe des Wartebefehls, `max_wait_ms` der längste, `attempts`
die Zahl der Anfragen der Runtime über alle Aufrufe):

- vorher 180 s: code-host lokal ohne Docker (`dist/index.js` über TLS, Nachbau `sandboxd`, Runtime am Pin `d8f8168`), Commit `08164a6` (Stand von `dev`), 16.11.2026 12:23:01 bis 12:24:24 UTC: LONG_EXEC_VERDICT fail long-180: neither the result (long-180 in stdout, exit_code 0) nor a text that says the command is still running and names a command to wait with on its last line
- nachher 180 s: Job `e2e` von PR #210 auf GitHub (Lauf 43867113773, Nachbau `sandboxd`, Runtime am Pin `d8f8168`), Commit `b37f852`, 16.11.2026 12:36:08 UTC: waits=7 max_wait_ms=25046 attempts=7 failures_after=0 runs=1
