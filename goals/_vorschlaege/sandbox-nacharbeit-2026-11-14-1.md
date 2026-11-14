Schwere: 4
Goal: domains 04
Befund: Der Cron `/etc/cron.d/docker-image-prune` des Mitbewohners auf dem Sandbox-Server löscht täglich um 00:26 UTC das Basis-Image `sandboxd-base:1`, sobald es älter als 24 Stunden ist und kein Container es nutzt; danach scheitert jede Anlage einer Sandbox mit 501, für fremde Kunden wie für die Live-Prüfung des Release Managers.
Beleg: `ssh root@72.62.51.224 'grep -v "^#" /etc/cron.d/docker-image-prune; journalctl -u sandboxd --since "2026-11-14 00:00 UTC" -o short-iso | grep -m1 "Unable to find image"'` -> `26 0 * * * root docker image prune -af --filter "until=24h" > /dev/null 2>&1`, dann `2026-11-14T01:17:53+00:00 ... Unable to find image 'sandboxd-base:1' locally` | docs/sandbox/schluesselwechsel.md, Abschnitt „Der erste Lauf war rot“
Empfehlung: `ops/sandbox/setup.sh` legt nach dem Bau einen nie gestarteten Container `sandboxd-base-pin` aus dem Image an (`docker create`), den `docker image prune -a` als Nutzer des Images zählt, und `--check` prüft ihn als `fact`; den Cron des Mitbewohners fasst `setup.sh` weiter nicht an. Bis dahin baut `bash ops/sandbox/setup.sh 72.62.51.224` das Image neu; das heute um 01:35 gebaute fällt am 16.11.2026 um 00:26 UTC, wenn dann keine Sandbox läuft.
MVP: Funktion

Gefunden im Messlauf von domains 04 am 14.11.2026; das Image wurde dort mit `bash ops/sandbox/setup.sh 72.62.51.224` neu gebaut. Die beiden 501 seit 00:26 kamen von der Adresse des code-host, kein fremder Kunde (Zugriffslog, `ops/access-log.sh`).
