# Sandbox-Server

Entscheidung Matthias, 11.11.2026: kein neuer Server, die Sandboxes laufen auf dem vorhandenen Hostinger-VPS `srv1327036`. Er ist
getrennt vom Zahlungsserver `srv1336627`, auf dem nie fremder Code läuft (`loop-constraints.md`, Grundregel 7).

Anbieter: Hostinger
Paket: KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe), Standort Frankfurt
Preis im Monat: 0 Euro zusätzlich, bezahlt bis 03.02.2027, danach 14,99 Euro im Monat (`docs/sandbox/plan.md`, `## Preis`)
Hostname: srv1327036
Adresse: 72.62.51.224
Betriebssystem: das vorhandene, per SSH leergeräumt, nachdem wa-staging auf `htc-staging` bei Hetzner umgezogen ist; sandbox 02 prüft Version und Stand
Zugang: `root` nur mit `~/.ssh/id_ed25519_cp_sandbox` vom code-host

Einrichtung und Betrieb nach `docs/sandbox/plan.md` ab sandbox 02.
