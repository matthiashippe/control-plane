# Sandbox-Server

Entscheidung Matthias, 11.11.2026: kein neuer Server, die Sandboxes laufen sofort auf dem vorhandenen Hostinger-VPS `srv1327036`,
neben wa-staging, ohne Neuinstallation. Er ist getrennt vom Zahlungsserver `srv1336627`, auf dem nie fremder Code läuft (`loop-constraints.md`, Grundregel 7).

Anbieter: Hostinger
Paket: KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe), Standort Frankfurt
Preis im Monat: 0 Euro zusätzlich, bezahlt bis 03.02.2027, danach 14,99 Euro im Monat (`docs/sandbox/plan.md`, `## Preis`)
Hostname: srv1327036
Adresse: 72.62.51.224
Betriebssystem: Ubuntu 24.04.5 LTS, Kernel 6.8.0-147-generic, ohne Docker, ohne `/dev/kvm` (gemessen 11.11.2026, Befehl unten)
Zugang: `root` nur mit `~/.ssh/id_ed25519_cp_sandbox` vom code-host

Gemessen am 11.11.2026 vom code-host:

```
ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'uname -sr; . /etc/os-release; echo $PRETTY_NAME; nproc; free -m | sed -n 2p; df -h / | tail -1; ls -l /dev/kvm; systemd-detect-virt; command -v docker; ufw status'
```

gab `Linux 6.8.0-147-generic`, `Ubuntu 24.04.5 LTS`, 2 vCPU, 7940 MB Speicher, 97 GB Platte mit 6 % belegt, kein `/dev/kvm`,
`kvm`, kein Docker, ufw offen für 22, 80 und 443 (tcp, dazu 443/udp).

Einrichtung und Betrieb nach `docs/sandbox/plan.md` ab sandbox 02.

## Nebeneinander mit wa-staging

Matthias, 11.11.2026, wörtlich. Regeln, solange wa-staging dort läuft (Auszug nach `htc-staging` hängt an PRO-17959):

1. Nicht anfassen: Units `wa-api` und `wa-worker`, Nutzer `wa` und `wa-deploy`, `/srv/wissensanker`, `/etc/wissensanker`, Postgres 18 (Socket und 127.0.0.1:5432), den Caddy-Block von wa-staging.
2. Caddy hält 80 und 443 für wa-staging. Eigener Eingang der Sandbox nur als eigene Datei, die Caddyfile bekommt höchstens eine `import`-Zeile, der Block von wa-staging bleibt Zeichen für Zeichen.
3. Keine Sandbox erreicht Dienste des Hosts (127.0.0.1, die Bridge-Adresse, den Postgres-Socket), kein Host-Pfad außer dem eigenen Datenträger. Das gehört als Test in sandbox 02.
4. Grenzen so setzen, dass wa-staging immer mindestens 1 vCPU und 2 GB bleiben.
5. ufw bleibt bei 22, 80 und 443; ein Neustart des Servers ist erlaubt, die Dienste von wa-staging starten von selbst.

Zieht wa-staging aus, gehört der Server der Sandbox allein; dann räumt Claude die Reste von Wissensanker ab.

Umsetzung von Regel 4 (Tech Lead, 11.11.2026): alle Sandboxes in `sandbox.slice` mit `CPUQuota=100%` und `MemoryMax=5G`, höchstens
zehn Plätze zu 512 MB (`docs/sandbox/plan.md`, `## Grenzen`); nach dem Auszug zwölf.
