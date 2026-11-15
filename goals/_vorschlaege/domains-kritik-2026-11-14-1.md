Schwere: 3
Goal: domains 04
Befund: `ops/sandbox/setup.sh --client-key-reset <address>` nimmt jedem Kunden die Anlage neuer Sandboxes, bis jemand `--client-key` fährt, und prüft vorher weder, ob eine fremde Sandbox läuft, noch stellt es den Schlüssel von selbst wieder her; die Prüfung auf fremde Sandboxes stand in domains 04 nur im Kontext für den Maker.
Beleg: `grep -n 'client_key_reset()' -A10 ops/sandbox/setup.sh` -> verschiebt `cp.pub` nach dem einzigen Check `sbx_read_sha`, keine Abfrage von `sandboxes`, kein Aufruf von `install_client_key` | ops/sandbox/setup.sh:301
Empfehlung: `--client-key-reset` verlangt einen zweiten Schalter `--restore-after <s>` (Standard 120) und legt auf dem Sandbox-Server einen `systemd-run --on-active=<s>`-Timer an, der `cp.pub.prev` zurück nach `cp.pub` verschiebt, wenn `cp.pub` dann noch fehlt; dazu verweigert er mit `SETUP CLIENT-KEY-RESET FAIL: foreign sandbox running`, wenn `sandboxd` eine laufende Sandbox eines Kontos außerhalb von `src/bounties/ours.ts` kennt. Beides mit Fällen im Selbsttest.
MVP: Funktion
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 1 (`--client-key-reset` ohne Schutz vor fremden Sandboxes und ohne Wiederherstellung) (2026-11-14)
