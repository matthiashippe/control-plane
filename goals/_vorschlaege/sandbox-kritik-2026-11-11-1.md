Schwere: 2
Goal: sandbox 01
Befund: Drei kleine Lücken im Plan, die sandbox 02 sonst erst auf dem Server findet. Erstens läuft die Sentry von gVisor im Cgroup des Containers, `--memory=512m` schließt sie also ein, und zehn volle Sandboxes passen nicht sicher in `MemoryMax=5G` der Slice. Zweitens hat `srv1327036` eine globale IPv6-Adresse, die Freigabe von `ctl.sbx.postyourprice.com` nur für `76.13.144.207` greift nicht, sobald der Zahlungsserver über IPv6 verbindet. Drittens stimmen zwei Sätze nicht mehr: `docs/sandbox/server.md` sagt „root nur mit `~/.ssh/id_ed25519_cp_sandbox`“, auf dem Server liegen aber weitere Root-Schlüssel aus dem Betrieb von wa-staging, und `## Isolation` spricht von einer Prüfung auf `/dev/kvm` „auf dem neuen Server“, die am 11.11. schon gemessen ist.
Beleg: `ssh ... root@72.62.51.224 'ip -6 addr show scope global | grep -c inet6'` gab 1 (Tech Lead, 11.11.2026); `docs/sandbox/plan.md`, `## Grenzen` und `## Verbindung`; `docs/sandbox/server.md`, Zeile `Zugang:`.
Empfehlung: sandbox 02 misst den Speicher einer leeren Sandbox unter `runsc` und setzt die Platzzahl danach, legt `ctl.sbx` nur mit A-Eintrag an oder gibt die IPv6 des Zahlungsservers mit frei, und zählt die Root-Schlüssel in `authorized_keys` als Prüfung (Soll nach dem Auszug von wa-staging: genau einer).
MVP: Funktion, weil jeder Punkt sonst als Fehler im ersten echten Lauf auftaucht.

Übernommen: sandbox 02, Kontext für den Maker und Done-Punkt zu server.md und plan.md (2026-11-12)
