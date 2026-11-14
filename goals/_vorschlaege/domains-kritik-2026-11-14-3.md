Schwere: 1
Goal: domains 05
Befund: Der Timer `cp-pub-restore` ist eine transiente Unit von `systemd-run` und verschwindet mit einem Neustart des Sandbox-Servers; startet der Server zwischen Reset und Ablauf neu, fehlt `cp.pub` danach ohne Frist, und kein Kunde kann eine Sandbox anlegen, bis jemand `--client-key` fährt.
Beleg: `grep -n 'systemd-run --quiet' ops/sandbox/setup.sh` -> Unit nur unter `/run`, keine Unit-Datei unter `/etc/systemd/system`; `ops/sandbox/auto-upgrades.conf` setzt kein `Automatic-Reboot`, ein Neustart kommt also nur von Hand oder vom Hoster | ops/sandbox/setup.sh:330
Empfehlung: `--check` meldet `CHANGE fact cp_pub want=yes have=no`, wenn `cp.pub` fehlt und kein Timer `cp-pub-restore` aktiv ist, damit die nächste Live-Prüfung den Zustand nennt statt ihn als Ausfall der Anlage zu zeigen.
MVP: Robustheit, weil ein Neustart in einem Fenster von höchstens einer Stunde selten ist, die Folge aber ein Ausfall für alle Kunden ohne Frist.
