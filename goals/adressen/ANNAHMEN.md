# Annahmen adressen

- adressen 02 (Engineer CP, 2026-11-14): Ein IPv6-Kandidat zählt nur, wenn links und rechts von ihm kein Buchstabe und kein `_`
  steht (Grenze wie bei IPv4), zusätzlich zur Grenze aus Hex-Ziffern, `:` und `.` aus der Entscheidung des Tech Leads. Sonst wäre
  in einer Zeile einer Anfrage etwa `Foo::Bar` eine Adresse `::ba`. Adressen in den Logs stehen zwischen Leerzeichen oder Klammern.
- adressen 02 (Engineer CP, 2026-11-14): `::ffff:` vor einer Adresse in Hex (`::ffff:<hex>:<hex>`) zählt wie die gepunktete
  Schreibweise als IPv4-Adresse nach den IPv4-Regeln. Die gepunktete zählt die bestehende IPv4-Schleife, die Hex-Form der neue Teil.
- adressen 02 (Engineer CP, 2026-11-14): Das Skript läuft auf dem GitHub-Rechner mit mawk, auf dem code-host mit gawk; der awk-Teil
  nutzt nur POSIX-awk und ist mit beiden geprüft.
