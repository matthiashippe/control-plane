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
