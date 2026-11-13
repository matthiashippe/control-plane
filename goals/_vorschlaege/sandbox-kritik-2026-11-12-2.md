Schwere: 2
Goal: sandbox 02
Befund: Cloudflare prüft das Zertifikat des Sandbox-Servers nicht (SSL „Full“, Caddy mit `tls internal`), wer zwischen Cloudflare und `72.62.51.224` sitzt, liest und ändert den Verkehr freigegebener Ports; `ANNAHMEN.md` nennt den Weg trotzdem „gleich sicher“ wie Origin CA.
Beleg: goals/sandbox/ANNAHMEN.md:67 | ops/sandbox/sandbox.caddy:20
Empfehlung: Mit der eigenen Domain für freigegebene Ports (Entscheidung Tech Lead in `goals/sandbox/ANNAHMEN.md`, Goal 02, Kritik) bekommt deren Zone gleich „Full (strict)“ und ein Origin-CA-Zertifikat; der Token mit „SSL and Certificates: Edit“ für genau diese Zone gehört in dasselbe Human Gate wie der Kauf. Die Zone `postyourprice.com` bleibt dabei unverändert.
MVP: Funktion, weil ein Kunde, dessen Dienst in der Sandbox Anmeldedaten annimmt, sonst ohne Prüfung des Zielservers ausgeliefert wird.
Übernommen: sandbox 06 in ROADMAP.md (Freigegebene Ports unter einer eigenen Domain) (2026-11-13)
