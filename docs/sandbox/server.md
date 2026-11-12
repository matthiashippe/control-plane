# Sandbox-Server

Entscheidung Matthias, 11.11.2026: kein neuer Server, die Sandboxes laufen sofort auf dem vorhandenen Hostinger-VPS `srv1327036`,
neben wa-staging, ohne Neuinstallation. Er ist getrennt vom Zahlungsserver `srv1336627`, auf dem nie fremder Code läuft (`loop-constraints.md`, Grundregel 7).

Anbieter: Hostinger
Paket: KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe), Standort Frankfurt
Preis im Monat: 0 Euro zusätzlich, bezahlt bis 03.02.2027, danach 14,99 Euro im Monat (`docs/sandbox/plan.md`, `## Preis`)
Hostname: srv1327036
Adresse: 72.62.51.224
Betriebssystem: Ubuntu 24.04.5 LTS, Kernel 6.8.0-147-generic, ohne Docker, ohne `/dev/kvm` (gemessen 11.11.2026, Befehl unten)
Zugang: `root` nur mit Schlüssel, 2 Schlüssel in `/root/.ssh/authorized_keys`: `~/.ssh/id_ed25519_cp_sandbox` vom code-host und ein älterer mit dem Kommentar `automaton-host` (gemessen 12.11.2026, Befehl unten)

Gemessen am 11.11.2026 vom code-host:

```
ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'uname -sr; . /etc/os-release; echo $PRETTY_NAME; nproc; free -m | sed -n 2p; df -h / | tail -1; ls -l /dev/kvm; systemd-detect-virt; command -v docker; ufw status'
```

gab `Linux 6.8.0-147-generic`, `Ubuntu 24.04.5 LTS`, 2 vCPU, 7940 MB Speicher, 97 GB Platte mit 6 % belegt, kein `/dev/kvm`,
`kvm`, kein Docker, ufw offen für 22, 80 und 443 (tcp, dazu 443/udp).

Einrichtung und Betrieb nach `docs/sandbox/plan.md` ab sandbox 02.

## Stand nach der Einrichtung (sandbox 02)

Eingerichtet am 12.11.2026 mit `bash ops/sandbox/setup.sh 72.62.51.224`; danach gab `bash ops/sandbox/setup.sh --check 72.62.51.224`
als letzte Zeile `SETUP CHECK OK changed=0`. Docker 29.1.3 aus Ubuntu, `runsc` release-20261109.0 mit `--platform=systrap`, Caddy
2.11.7 von wa-staging mit genau einer Zeile `import /etc/caddy/sandbox.caddy`, `sandboxd` auf 127.0.0.1:8730 (API) und
127.0.0.1:8731 (Eingang der freigegebenen Ports) mit eigenem Node 22.23.4.

Leere Sandbox: 9 MB unter `runsc` (Basis-Image `sandboxd-base:1`, 20 Sekunden nach dem Anlegen, dreimal im Abstand von 5 Sekunden
gleich), `sandboxd` selbst 18 MB, beide in `sandbox.slice`. Befehl auf dem Host nach `POST /v1/sandboxes` über `sandboxd`:

```
c=$(docker inspect -f '{{.Id}}' sbx-<id>); echo $(( $(cat /sys/fs/cgroup/sandbox.slice/docker-$c.scope/memory.current) / 1048576 )) MB
echo $(( $(systemctl show -P MemoryCurrent sandboxd) / 1048576 )) MB
```

Root-Schlüssel gezählt mit
`ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'grep -cvE "^[[:space:]]*(#|$)" /root/.ssh/authorized_keys'`,
Ausgabe `2` (Zeile `Zugang:` oben); Soll nach dem Auszug von wa-staging ist einer.

## Nebeneinander mit wa-staging

Matthias, 11.11.2026, wörtlich. Regeln, solange wa-staging dort läuft (Auszug nach `htc-staging` hängt an PRO-17959):

1. Nicht anfassen: Units `wa-api` und `wa-worker`, Nutzer `wa` und `wa-deploy`, `/srv/wissensanker`, `/etc/wissensanker`, Postgres 18 (Socket und 127.0.0.1:5432), den Caddy-Block von wa-staging.
2. Caddy hält 80 und 443 für wa-staging. Eigener Eingang der Sandbox nur als eigene Datei, die Caddyfile bekommt höchstens eine `import`-Zeile, der Block von wa-staging bleibt Zeichen für Zeichen.
3. Keine Sandbox erreicht Dienste des Hosts (127.0.0.1, die Bridge-Adresse, den Postgres-Socket), kein Host-Pfad außer dem eigenen Datenträger. Das gehört als Test in sandbox 02.
4. Grenzen so setzen, dass wa-staging immer mindestens 1 vCPU und 2 GB bleiben.
5. ufw bleibt bei 22, 80 und 443; ein Neustart des Servers ist erlaubt, die Dienste von wa-staging starten von selbst.

Zieht wa-staging aus, gehört der Server der Sandbox allein; dann räumt Claude die Reste von Wissensanker ab.

Umsetzung von Regel 4 (Tech Lead, 11.11.2026): alle Sandboxes in `sandbox.slice` mit `CPUQuota=100%` und `MemoryMax=5G`, höchstens
neun Plätze zu 512 MB, gerechnet mit dem gemessenen Speicher einer leeren Sandbox (`docs/sandbox/plan.md`, `## Grenzen`); nach dem Auszug elf.
