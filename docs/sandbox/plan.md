# Sandbox-Plan: wie wir Sandboxes anbieten

Entschieden am 10.11.2026 in sandbox 01, gegen den Vertrag in `docs/sandbox/vertrag.md`; Server am 11.11.2026 nach Matthias'
Entscheidung auf den vorhandenen Hostinger-VPS `srv1327036` (KVM 2) umgestellt. Sandboxes laufen auf diesem eigenen Server
(`docs/sandbox/server.md`), nie auf dem Zahlungsserver (`loop-constraints.md`, Grundregel 7). sandbox 02 bis 04 und
domains 01 bauen nach diesem Plan; wer davon abweicht, schreibt die Abweichung mit Grund in `goals/sandbox/ANNAHMEN.md`.

## Isolation

Entscheidung: jede Sandbox ist ein eigener Container unter gVisor (`runsc`, Plattform `systrap`) mit Docker als Verwalter, kein
MicroVM.

Begründung: Hostingers VPS (auch KVM 2, auf dem die Sandboxes laufen) geben kein `/dev/kvm` an den Gast. Gemessen am
Zahlungsserver, der auf derselben Plattform läuft:
`ssh -i "$CP_SSH_KEY" "$CP_HOST" 'ls -l /dev/kvm; grep -cE "vmx|svm" /proc/cpuinfo; systemd-detect-virt'` gab
`No such file or directory`, `0` und `kvm` aus. Firecracker und Kata brauchen `/dev/kvm`, fallen also weg. gVisor fängt jeden
Systemaufruf in einem eigenen Kernel im Userspace ab und braucht dafür keine Virtualisierung; ein Ausbruch braucht eine Lücke in
gVisor und danach eine im Host-Kernel, statt nur einer im Host-Kernel wie bei einem nackten Container. Die Runtime erwartet eine
Linux-Maschine mit `apt-get`, `node`, `npm` und `git` (`src/replication/spawn.ts:130` am Pin), das liefert ein Ubuntu-Image im
Container. Prüft sandbox 02 auf dem neuen Server doch ein `/dev/kvm`, bleibt es trotzdem bei gVisor, weil der Plan dann ohne
zweiten Weg auskommt.

Dazu je Sandbox: eigener Benutzer-Namensraum, keine Capabilities außer den für `apt-get` nötigen, `no-new-privileges`, kein
Docker-Socket, kein Host-Pfad gemountet außer dem eigenen Datenträger, Root-Dateisystem aus dem Image, beschreibbar nur über den
Datenträger der Sandbox.

## Netz

Entscheidung: Eine Sandbox darf ins Internet (Paketquellen, Git, APIs ihrer Kunden), aber nie dorthin:

- der Zahlungsserver `76.13.144.207`, auf jedem Port: Fremder Code soll das Control Plane nur so erreichen wie jeder andere Kunde,
  über `https://postyourprice.com` und Cloudflare, nie direkt über die Adresse des Servers mit Datenbank und Wallet-Schlüssel;
- Metadaten- und Link-Local-Adressen `169.254.0.0/16` und `fe80::/10`;
- private Netze `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `fc00::/7`, damit auch das Docker-Netz des Hosts;
- der Host selbst und jede andere Sandbox: je Sandbox ein eigenes Bridge-Netz ohne Verkehr zwischen Containern;
- ausgehend Port 25, weil ein Server, der Spam versendet, bei Hostinger gesperrt wird und dann jede Sandbox trifft.

Umgesetzt mit nftables in der Kette `DOCKER-USER` (gilt für jeden weitergeleiteten Paketfluss der Container), mit Logzeile je
Verwurf. Eingehend erreicht eine Sandbox nur, was sie über `ports/expose` freigibt, und zwar über Caddy auf dem Sandbox-Server unter
`https://<id>-<port>.sbx.postyourprice.com` (Wildcard-Eintrag in der Cloudflare-Zone von `postyourprice.com`, gesetzt von sandbox 02
über die API). Offen auf dem Host sind nur 22 (nur Schlüssel), 80 und 443 (Caddy) und 8443 (Steuer-API, nur von `76.13.144.207`).
Die Gegenrichtung gibt es nicht: Der Sandbox-Server baut nie eine Verbindung zum Zahlungsserver auf, auch nicht der Dienst selbst.

## Grenzen

Entscheidung je Sandbox, angelehnt an die kleinsten Stufen der Runtime (`src/replication/spawn.ts:21` am Pin):

| Stufe | vCPU | Speicher | Platte | Prozesse |
|---|---|---|---|---|
| klein (Standard der Runtime) | 1, als Anteil `--cpus=1` | 512 MB, Swap aus | 5 GB | 256 |
| mittel | 1 | 1024 MB, Swap aus | 10 GB | 512 |

Anfragen über 1024 MB beantwortet sandbox 03 mit 400 und dem Hinweis auf die Stufen, statt eine größere Sandbox zu versprechen, die
der Server nicht hat. Platte als eigene ext4-Datei je Sandbox (sparse, als Datenträger unter `/root`), damit volle Platte nur die
eigene Sandbox trifft. Laufzeit: Eine Sandbox läuft, solange Guthaben da ist, höchstens 30 Tage am Stück. Ohne API-Aufruf und ohne
freigegebenen Port für 24 Stunden wird sie gestoppt und nicht mehr berechnet; gestoppt bleibt sie 7 Tage, dann wird sie gelöscht.
Ein `exec` dauert höchstens 10 Minuten. Höchstens zwei Sandboxes je Konto, auf dem Server höchstens zwölf Plätze zugleich, eine
mittlere zählt als zwei (KVM 2: 8 GB, davon 2 GB für Host, Docker, Caddy und `sandboxd`, Rest 12 mal 512 MB; die 2 vCPU teilen sie
sich; 100 GB Platte tragen 12 mal 5 GB mit Platz für Images).

Begründung: Die Runtime hat kein Löschen (`deleteSandbox` ist am Pin leer), also muss der Server selbst aufräumen, sonst läuft eine
vergessene Sandbox bis zum leeren Guthaben. Swap aus, damit ein Prozess über der Grenze stirbt, statt den Host in den Swap zu ziehen.

## Preis

Entscheidung: 1000 mc je Stunde für die Stufe klein, 2000 mc je Stunde für die Stufe mittel (100000 mc = 1 USD). Berechnet in
Schritten von 6 Minuten im Nachhinein, also 100 mc je Schritt für klein und 200 mc für mittel. Beim Anlegen werden 1000 mc
(eine Stunde der Stufe klein) reserviert; fehlt das Guthaben, antwortet `POST /v1/sandboxes` mit 402 und `details.required_cents`
und `details.current_balance_cents`, damit die Runtime ihr Topup selbst auslöst (`src/conway/topup.ts:81` am Pin). Reicht das
Guthaben für den nächsten Schritt nicht, wird die Sandbox gestoppt, nicht gelöscht.

Einkauf: 0 Euro zusätzlich. Der Hostinger-VPS `srv1327036` (KVM 2) ist bis 03.02.2027 bezahlt (Matthias, 11.11.2026); bis dahin ist
jede verkaufte Stunde Marge. Danach kostet KVM 2 in der Verlängerung 14,99 Euro im Monat, gelesen am 11.11.2026 auf
`https://www.hostinger.com/de/vps-hosting`. Mit 1 Euro = 1,17 USD (Annahme, `goals/sandbox/ANNAHMEN.md`) sind das rund 1753830 mc
im Monat oder 2403 mc je Stunde für den ganzen Server (730 Stunden im Monat).

Marge ab 03.02.2027: Bei zwölf Plätzen und im Mittel der Hälfte belegt kostet eine belegte Platzstunde 2403 / 6 = 401 mc, verkauft
für 1000 mc, also Faktor 2,5 und über dem Faktor 1,3 der Inferenz. Der Server ist bezahlt, sobald 1754 Platzstunden im Monat verkauft
sind, also rund 2,4 Sandboxes rund um die Uhr.

Begründung: Ein fester kleiner Server ist ein Fixkosten-Einkauf, kein Einkauf je Stunde wie bei OpenRouter; der Preis muss den
Server schon bei wenig Belegung tragen. 1000 mc sind 1 Cent je Stunde, rund 7,30 USD im Monat für eine Sandbox rund um die Uhr, das
ist für einen Automaton mit Guthaben in USDC klein und rund wie die Stufe, die die Runtime ohne Angabe anlegt. Abrechnung im
Nachhinein in 6-Minuten-Schritten, damit nichts berechnet wird, was nicht lief (`loop-constraints.md`, Grundregel 6), und jeder
Schritt eine ganze Zahl mc ist.

## Verbindung

Entscheidung: Das Control Plane spricht die Steuer-API des Sandbox-Servers (`sandboxd`, Port 8443, HTTPS) an. Jede Anfrage ist mit
Ed25519 signiert: über Methode, Pfad, Zeitstempel und SHA-256 des Inhalts, in den Headern `X-CP-Timestamp` und `X-CP-Signature`.
`sandboxd` lehnt Zeitstempel ab, die mehr als 60 Sekunden abweichen, und jede Signatur, die es in den letzten 5 Minuten schon gesehen
hat.

Das Schlüsselpaar erzeugt der Dienst `cp` beim ersten Start selbst in seinem Volume (`/data/sandbox-client.key`, 0600), die
öffentliche Hälfte liegt daneben (`/data/sandbox-client.pub`). Der Maker liest sie lesend mit
`docker exec deploy-cp-1 cat /data/sandbox-client.pub` und trägt sie mit dem Einrichtungsskript in `sandboxd` ein. Die Gegenrichtung
sichert ein selbst signiertes Zertifikat von `sandboxd`, dessen Fingerabdruck im Repo steht (öffentlich unbedenklich) und den das
Control Plane prüft. Die Adresse des Sandbox-Servers steht im Repo (`docs/sandbox/server.md`); die Firewall lässt Port 8443 nur
vom Zahlungsserver zu.

Begründung: Kein Secret wandert durch das Repo, durch ein Issue oder in `/opt/control-plane/.env`, die kein Goal von Hand ändert.
Der private Schlüssel verlässt das Volume nie, und ein Rollout über `deploy.yml` reicht, um den Weg einzuschalten. Ohne die Datei
antwortet das Control Plane wie heute mit 501, es startet also nichts halb.

## Schritte

- **sandbox 02, der Sandbox-Server steht:** Einrichtungsskript im Repo (idempotent, vom code-host per SSH mit
  `~/.ssh/id_ed25519_cp_sandbox`): Ubuntu auf Stand, nftables nach `## Netz`, Docker mit `runsc`, Caddy, `sandboxd` mit Anlegen,
  `exec`, Dateien, Ports, Stoppen, Löschen und Aufräumen nach `## Grenzen`, Wildcard-Eintrag `*.sbx.postyourprice.com`. Prüfungen
  gegen den Server: keine Host-Datei lesbar, `76.13.144.207` und `169.254.169.254` aus einer Sandbox nicht erreichbar, ein Prozess
  über 512 MB stirbt, der Host bleibt erreichbar.
- **sandbox 03, die Sandbox-API ist frei und abgerechnet:** Das Control Plane beantwortet jede Zeile aus `docs/sandbox/vertrag.md`,
  Abschnitt `## Endpunkte`, für Sandboxes mit den Feldern dort und reicht sie signiert an `sandboxd` weiter; Abrechnung nach
  `## Preis` als Ledger-Zeilen in derselben Transaktion wie der Saldo, Reservierung, 402 mit `details`, Halt bei leerem Guthaben,
  `exec` über 30 s an der Wiederholung mit demselben `Idempotency-Key` ohne zweite Ausführung. Unit-Tests gegen einen nachgebauten
  `sandboxd`, Rollout über `deploy.yml`, danach `ops/live.sh` mit einer eigenen Adresse.
- **sandbox 04, Ende zu Ende mit der unveränderten Runtime:** Der Harness bekommt einen nachgebauten `sandboxd`, und der Job `e2e`
  zeigt, dass die Runtime am Pin eine Sandbox anlegt, darin ausführt, einen Port freigibt und das Ledger stimmt; dazu ein Lauf gegen
  die Produktion mit einem eigenen Automaton aus vorhandenen Credits.
- **domains 01** baut danach die Domain-Zeilen des Vertrags: Suche und DNS für Namen unter `sbx.postyourprice.com`, eine klare
  Antwort ohne Kauf für `POST /v1/domains/register`, denn ein Domain-Kauf ist das Human Gate `server_kauf`.
