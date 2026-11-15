# Annahmen adressen

- adressen 02 (Engineer CP, 2026-11-14): Ein IPv6-Kandidat zählt nur, wenn links und rechts von ihm kein Buchstabe und kein `_`
  steht (Grenze wie bei IPv4), zusätzlich zur Grenze aus Hex-Ziffern, `:` und `.` aus der Entscheidung des Tech Leads. Sonst wäre
  in einer Zeile einer Anfrage etwa `Foo::Bar` eine Adresse `::ba`. Adressen in den Logs stehen zwischen Leerzeichen oder Klammern.
- adressen 02 (Engineer CP, 2026-11-14): `::ffff:` vor einer Adresse in Hex (`::ffff:<hex>:<hex>`) zählt wie die gepunktete
  Schreibweise als IPv4-Adresse nach den IPv4-Regeln. Die gepunktete zählt die bestehende IPv4-Schleife, die Hex-Form der neue Teil.
- adressen 02 (Engineer CP, 2026-11-14): Das Skript läuft auf dem GitHub-Rechner mit mawk, auf dem code-host mit gawk; der awk-Teil
  nutzt nur POSIX-awk und ist mit beiden geprüft.
- adressen 02 (Tech Lead, 2026-11-14): Das Human Gate `security_settings` entfällt. Der Tech Lead hat die Aufbewahrung von Logs und
  Artefakten selbst auf 30 Tage gesetzt (`gh api -X PUT .../actions/permissions/artifact-and-log-retention -F days=30`, gemessen
  2026-11-14 18:42 UTC: `days` 30), weil der Token auf dem code-host Admin am Repo hat, die Änderung keine Daten löscht und
  `security_settings` nicht zu den Gates gehört, die Matthias bewusst behält. Die Deny List des Makers bleibt: Der Maker ändert keine
  Einstellung, er misst Punkt 2 und schreibt Punkt 3.
