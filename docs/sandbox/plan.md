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

Dazu je Sandbox: keine Capabilities außer den für `apt-get` nötigen, `no-new-privileges`, kein Docker-Socket, kein Host-Pfad
gemountet außer dem eigenen Datenträger, Root-Dateisystem aus dem Image. Gebaut in sandbox 02 (`goals/sandbox/ANNAHMEN.md`, Goal 02):
kein eigener Benutzer-Namensraum je Sandbox, weil gVisor jeden Systemaufruf in der Sentry abfängt und `userns-remap` für den ganzen
Docker-Daemon gälte; `runsc` läuft mit `--overlay2=root:memory`, Schreiben außerhalb von `/root` landet also im Speicher der Sandbox
und zählt gegen ihre 512 MB, dauerhaft ist nur der Datenträger unter `/root`.

## Netz

Entscheidung: Eine Sandbox darf ins Internet (Paketquellen, Git, APIs ihrer Kunden), aber nie dorthin:

- der Zahlungsserver `76.13.144.207` auf jedem Port außer tcp/443. Eine Runtime in der Sandbox ruft Inferenz und Credits beim Control
  Plane (`conwayApiUrl`, am Pin `src/agent/loop.ts:156`), und `postyourprice.com`, `www.postyourprice.com` und `cp.hippe.eu` zeigen
  ohne Cloudflare-Proxy direkt auf `76.13.144.207` (gemessen 11.11.2026, `dig +short postyourprice.com A` gab `76.13.144.207`). Darum
  erreicht eine Sandbox dort genau tcp/443, also die öffentliche API mit Caddy davor wie jeder andere Kunde; SSH, alle anderen
  Ports und UDP (auch 443/udp) bleiben gesperrt, damit fremder Code am Server mit Datenbank und Wallet-Schlüssel nichts außer der
  API sieht;
- Metadaten- und Link-Local-Adressen `169.254.0.0/16` und `fe80::/10`;
- private Netze `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10`, `fc00::/7`, damit auch das Docker-Netz des Hosts;
- der Host selbst und jede andere Sandbox: je Sandbox ein eigenes Bridge-Netz ohne Verkehr zwischen Containern; auf dem Host
  heißt das auch 127.0.0.1, die Bridge-Adresse und Postgres von wa-staging (`docs/sandbox/server.md`, Nebeneinander mit wa-staging);
- ausgehend Port 25, weil ein Server, der Spam versendet, bei Hostinger gesperrt wird und dann jede Sandbox trifft.

Umgesetzt mit nftables in einer eigenen Tabelle `inet sandbox` (`ops/sandbox/sandbox.nft`, geladen von `sandbox-nft.service` vor
Docker), nicht in der iptables-Kette `DOCKER-USER`, weil Docker 29 auf Ubuntu 24.04 über iptables-nft läuft und die eigene Tabelle IPv4
und IPv6 mit denselben Regeln deckt (`goals/sandbox/ANNAHMEN.md`, Goal 02). Die Kette `forward` (`type filter hook forward priority
-10`, also vor Docker und ufw) trägt die Sperren für weitergeleitete Pakete; die Sperre zwischen Sandboxes steht zusätzlich in einer
Kette `prerouting` mit Priorität -310, weil Docker Pakete an einen anderen Container schon in `raw PREROUTING` (Priorität -300)
verwirft, bevor `forward` sie sieht. Jeder Verwurf hat einen benannten Zähler (`sbx_host`, `sbx_peer`, `sbx_pay`, `sbx_meta`,
`sbx_priv`, `sbx_smtp`) und eine Logzeile mit Präfix `sbx-`; daran misst `ops/sandbox/probe.sh` die Gegenprobe. Die Bridge-Netze
bekommen kein IPv6, eine Sandbox erreicht also nichts über IPv6. Eingehend erreicht eine Sandbox nur, was sie über `ports/expose` freigibt, und zwar über Cloudflare und Caddy auf dem
Sandbox-Server unter `https://sbx-<id>-<port>.postyourprice.com` (`public_url` der Antwort, Zertifikat unten). Offen auf dem Host sind nur 22 (nur Schlüssel), 80 und 443 (Caddy); ufw bleibt dabei (Matthias, 11.11.2026). Der
Eingang der Sandboxes ist eine eigene Caddy-Datei, die die Caddyfile mit einer `import`-Zeile lädt. Kein Container veröffentlicht einen
Port auf dem Host, weil Docker dabei an ufw vorbei öffnet; Caddy leitet auf die Adresse des Containers im Bridge-Netz.
Der Host und `sandboxd` selbst bauen nie eine Verbindung zum Zahlungsserver auf; nur Container dürfen dort tcp/443.

Weg zum Host selbst: `forward` sieht nur weitergeleitete Pakete. Was eine Sandbox an eine Adresse des Hosts schickt (die
Bridge-Adresse ihres Netzes, `72.62.51.224`, die IPv6 des Hosts, 127.0.0.1 ist im Container ohnehin der eigene), läuft durch die
Eingangskette (`input`), und dort lässt ufw 22, 80 und 443 von überall zu (gemessen 11.11.2026, `ufw status verbose`, dazu 443/udp). Darum bekommt
die Tabelle `inet sandbox` dazu die Kette `input` (`type filter hook input priority -10`, also vor ufw) und genau
zwei Regeln: `iifname "sbx-*" ct state established,related accept` und `iifname "sbx-*" counter log prefix "sbx-host " drop`. Jedes
Bridge-Netz einer Sandbox heißt `sbx-<id>` (Docker-Option `com.docker.network.bridge.name`, höchstens 15 Zeichen, also eine ID von
`sandboxd` mit höchstens 11 Zeichen), deshalb greift die Regel für IPv4 und
IPv6 an jeder Zieladresse des Hosts. Danach erreicht eine Sandbox auf dem Host keinen Port mehr, weder 22, 80 und 443 noch
Postgres auf 5432 oder einen anderen Dienst von wa-staging; durch kommen nur Antworten auf Verbindungen, die der Host selbst
geöffnet hat (Caddy zur Sandbox). DNS fragt die Sandbox direkt bei `1.1.1.1` und `9.9.9.9`, nicht beim Host: Unter `runsc` antwortet Dockers eingebauter DNS
`127.0.0.11` im eigenen Bridge-Netz nicht, darum schreibt der Startbefehl jeder Sandbox beide in ihre eigene `/etc/resolv.conf`, `--dns`
bleibt gesetzt (`goals/sandbox/ANNAHMEN.md`, Goal 02). Ihren
eigenen freigegebenen Port erreicht sie wie jeder andere über den öffentlichen Namen und Cloudflare. ufw bleibt dabei unverändert.

Zertifikat für die freigegebenen Ports: Die Namen liegen auf der ersten Ebene unter der Zone, `sbx-<id>-<port>.postyourprice.com`
statt `<id>-<port>.sbx.postyourprice.com`, und laufen über den Cloudflare-Proxy (orange Wolke). So deckt sie das kostenlose
Universal SSL von Cloudflare (`postyourprice.com` und `*.postyourprice.com`); `*.sbx` als zweite Ebene deckt es nicht, das bräuchte
Advanced Certificate Manager, also einen Kauf. Verworfen sind DNS-01 (braucht ein Caddy mit Cloudflare-Modul, also ein anderes
Binary unter dem Caddy von wa-staging, und einen Zonen-Token auf dem Server mit fremdem Code) und On-Demand-TLS (braucht eine
globale Option in der Caddyfile und stößt an 50 Zertifikate je Woche für `postyourprice.com` bei Let's Encrypt, geteilt mit der
Hauptseite). Ein Eintrag `*.postyourprice.com`, proxied, zeigt auf `72.62.51.224`; jeder Name mit eigenem Eintrag (Hauptseite, `www`,
`ctl.sbx`) geht davor. Zwischen Cloudflare und Caddy stellt Caddy das Zertifikat für `*.postyourprice.com` mit `tls internal` selbst
aus (`ops/sandbox/sandbox.caddy`), ohne ACME, ohne globale Option und ohne Schlüsseldatei vom code-host. Die Zone steht auf SSL „Full“
(gemessen 12.11.2026, `GET /zones/<id>/settings/ssl` gab `full`): Cloudflare verschlüsselt bis zum Server und prüft dessen Zertifikat
nicht. Ein Cloudflare-Origin-CA-Zertifikat war geplant, der Token darf es aber nicht ausstellen (`POST /client/v4/certificates` gab
am 12.11.2026 `1016 User is not authorized to perform this action`) und es brächte erst mit „Full (strict)“ etwas
(`goals/sandbox/ANNAHMEN.md`, Goal 02). Wer „Full (strict)“ will, braucht einen Token mit „SSL and Certificates: Edit“, legt das
Origin-CA-Zertifikat als Datei auf den Server und tauscht `tls internal` gegen `tls <cert> <key>`.
Die eigene Datei bedient nur Namen der Form `sbx-<id>-<port>`, die `sandboxd` kennt, alles andere unter
`*.postyourprice.com` bekommt 404, damit keine Sandbox unter einem beliebigen Namen der Zone auftritt; die Cookies des Control
Planes bleiben ohne `Domain`-Attribut, also nur für ihren eigenen Namen. Für wa-staging heißt das: kein neues Binary, keine globale
Option, sein Block bleibt Zeichen für Zeichen, die Caddyfile bekommt nur die eine `import`-Zeile, und sein Name
`wa-staging.72-62-51-224.sslip.io` kommt mit seinem eigenen Zertifikat von Let's Encrypt weiter direkt an. Die Zone darf nicht auf
„Flexible“ stehen, weil Caddy sonst auf Port 80 im Kreis umleitet, und mit `tls internal` nicht auf „Full (strict)“. Der Eintrag
`*.postyourprice.com` bleibt nur bis sandbox 03: Bevor ein Kunde einen Port freigibt, ziehen die freigegebenen Ports auf eine eigene
Domain (Entscheidung Tech Lead 12.11.2026, `goals/sandbox/ANNAHMEN.md`, Goal 02, Kritik); Notschalter bis dahin ist, den einen
Eintrag zu löschen.

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
Ein `exec` dauert höchstens 10 Minuten. Höchstens zwei Sandboxes je Konto, eine mittlere zählt als zwei Plätze.

Solange wa-staging auf dem Server läuft, laufen alle Sandboxes und `sandboxd` in einer eigenen systemd-Slice `sandbox.slice` mit
`CPUQuota=100%` und `MemoryMax=5G`; Host und wa-staging bleiben damit immer 1 vCPU und rund 3 GB, mehr als die 1 vCPU und 2 GB für
wa-staging (Regel 4 in `docs/sandbox/server.md`, Entscheidung Tech Lead 11.11.2026). Unter `runsc` liegt die Sentry im Cgroup des
Containers, `--memory=512m` schließt sie also ein: Eine Sandbox belegt nie mehr als 512 MB, und der Kunde hat davon 512 minus die
leere Sandbox.

Leere Sandbox: 9 MB, `sandboxd`: 18 MB (gemessen 12.11.2026 in `docs/sandbox/server.md`). Plätze neben wa-staging:
(5120 MB minus 18 MB für `sandboxd`) / 512 MB = 9,96, also 9 Plätze (`SANDBOXD_SLOTS=9` in `ops/sandbox/sandboxd.service`), und
jeder Kunde hat 512 minus 9 = 503 MB für eigene Prozesse. Zehn volle Sandboxes und `sandboxd` passen nicht in die 5 GB der Slice.
Nach dem Auszug von wa-staging bekommt die Slice 6 GB (8 GB, davon 2 GB für Host, Docker und Caddy): (6144 minus 18) / 512 = 11,96,
also 11 Plätze. 100 GB Platte tragen 11 mal 5 GB mit Platz für Images.

Begründung: Die Runtime hat kein Löschen (`deleteSandbox` ist am Pin leer), also muss der Server selbst aufräumen, sonst läuft eine
vergessene Sandbox bis zum leeren Guthaben. Swap aus, damit eine Sandbox über der Grenze stirbt, statt den Host in den Swap zu ziehen; unter gVisor tötet der Kernel dabei die
Sentry, also die ganze Sandbox, und `--restart unless-stopped` startet sie neu, der Datenträger unter `/root` bleibt.

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

Marge ab 03.02.2027: Bei neun Plätzen (neben wa-staging) und im Mittel der Hälfte belegt kostet eine belegte Platzstunde
2403 / 4,5 = 534 mc, verkauft für 1000 mc, also Faktor 1,9 und über dem Faktor 1,3 der Inferenz; mit elf Plätzen nach dem Auszug
2403 / 5,5 = 437 mc und Faktor 2,3. Der Server ist bezahlt, sobald 1754 Platzstunden im Monat verkauft
sind, also rund 2,4 Sandboxes rund um die Uhr.

Begründung: Ein fester kleiner Server ist ein Fixkosten-Einkauf, kein Einkauf je Stunde wie bei OpenRouter; der Preis muss den
Server schon bei wenig Belegung tragen. 1000 mc sind 1 Cent je Stunde, rund 7,30 USD im Monat für eine Sandbox rund um die Uhr, das
ist für einen Automaton mit Guthaben in USDC klein und rund wie die Stufe, die die Runtime ohne Angabe anlegt. Abrechnung im
Nachhinein in 6-Minuten-Schritten, damit nichts berechnet wird, was nicht lief (`loop-constraints.md`, Grundregel 6), und jeder
Schritt eine ganze Zahl mc ist.

## Verbindung

Entscheidung: Das Control Plane spricht die Steuer-API des Sandbox-Servers (`sandboxd`) über HTTPS auf Port 443 an, unter einem
eigenen Namen `ctl.sbx.postyourprice.com` ohne Cloudflare-Proxy. `sandboxd` hört nur auf 127.0.0.1, davor steht Caddy aus der
eigenen Datei und lässt den Namen nur von `76.13.144.207` durch, jede andere Adresse bekommt 403. Jede Anfrage ist mit
Ed25519 signiert: über Methode, Pfad, Zeitstempel und SHA-256 des Inhalts, in den Headern `X-CP-Timestamp` und `X-CP-Signature`.
`sandboxd` lehnt Zeitstempel ab, die mehr als 60 Sekunden abweichen, und jede Signatur, die es in den letzten 5 Minuten schon gesehen
hat.

Das Schlüsselpaar erzeugt der Dienst `cp` beim ersten Start selbst in seinem Volume (`/data/sandbox-client.key`, 0600), die
öffentliche Hälfte liegt daneben (`/data/sandbox-client.pub`). Der Maker liest sie lesend mit
`docker exec deploy-cp-1 cat /data/sandbox-client.pub` und trägt sie mit dem Einrichtungsskript in `sandboxd` ein. Die Gegenrichtung
sichert das Zertifikat, das Caddy für `ctl.sbx.postyourprice.com` holt. Die Adresse des Sandbox-Servers steht im Repo
(`docs/sandbox/server.md`); ein eigener Port 8443 entfällt, weil ufw bei 22, 80 und 443 bleibt.

Begründung: Kein Secret wandert durch das Repo, durch ein Issue oder in `/opt/control-plane/.env`, die kein Goal von Hand ändert.
Der private Schlüssel verlässt das Volume nie, und ein Rollout über `deploy.yml` reicht, um den Weg einzuschalten. Ohne die Datei
antwortet das Control Plane wie heute mit 501, es startet also nichts halb.

Signaturformat, Byte für Byte (gebaut in `ops/sandbox/sandboxd.mjs`, `canonicalMessage` und `signRequest`, die sandbox 03 und die
Messung wiederverwenden). Jede Anfrage außer `GET /healthz` trägt zwei Header: `X-CP-Timestamp` ist die Unix-Zeit in ganzen Sekunden
als Dezimalzahl in ASCII, `X-CP-Signature` ist die 64 Byte lange Ed25519-Signatur in Standard-Base64 mit `=` am Ende (88 Zeichen).
Signiert werden die UTF-8-Bytes von vier Zeilen, getrennt durch genau ein `\n` (0x0a) und ohne Zeilenumbruch am Ende: Methode in
Großbuchstaben, Pfad genau so, wie er in der Anfragezeile steht (Pfad samt `?query`, ohne Schema und Host, Caddy reicht ihn
unverändert durch), der Wert von `X-CP-Timestamp`, und der SHA-256 der rohen Bytes des Inhalts als Hex in Kleinbuchstaben; ohne
Inhalt ist das der Hash der leeren Zeichenkette, `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`. `sandboxd`
antwortet mit 401 und JSON `{"error": ...}`, wenn ein Header fehlt, der Zeitstempel mehr als 60 Sekunden von seiner Uhr abweicht,
die Signatur unter keinem Schlüssel aus `/etc/sandboxd/keys/*.pub` (Ed25519, SPKI-PEM) gilt oder derselbe Signaturwert in den
letzten 300 Sekunden schon angenommen wurde. Eine Wiederholung von `exec` signiert also neu und trägt denselben `Idempotency-Key`.

Beispiel mit dem Schlüssel aus RFC 8032, Testvektor 1 (öffentlich bekannt, nie für echten Verkehr). Einen Node-`KeyObject` baut man
aus dem rohen Seed mit `crypto.createPrivateKey({ key: Buffer.from("302e020100300506032b657004220420" + seed, "hex"), format: "der",
type: "pkcs8" })`, die öffentliche Hälfte mit `crypto.createPublicKey({ key: Buffer.from("302a300506032b6570032100" + public, "hex"),
format: "der", type: "spki" })`. Die Werte unten hat `signRequest` berechnet, `test/sandboxd.test.ts` liest diesen Block und prüft,
dass `signRequest` dieselbe Signatur ergibt und `sandboxd` die Anfrage annimmt.

```
seed: 9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
public: d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
method: POST
path: /v1/sandboxes
timestamp: 1762992000
body: {"owner":"acct-example","memory_mb":512}
bodyhash: 5eacf079ae47935f52c349a62eae070fe2afcc3f0e345495cee962e05c19c5da
signature: gnaFWtEVpi/yvoUzyMdmxwgS/FRmcgopYhhdSqJiYoiAUpwHQoGT2ajKYPtWrivY9y9sbMJ5yZhf5W0KTNFXAg==
```

Die signierte Nachricht sind diese vier Zeilen:

```
POST
/v1/sandboxes
1762992000
5eacf079ae47935f52c349a62eae070fe2afcc3f0e345495cee962e05c19c5da
```

Die Anfrage geht dann mit `X-CP-Timestamp: 1762992000` und
`X-CP-Signature: gnaFWtEVpi/yvoUzyMdmxwgS/FRmcgopYhhdSqJiYoiAUpwHQoGT2ajKYPtWrivY9y9sbMJ5yZhf5W0KTNFXAg==` hinaus, der Inhalt genau
in den Bytes, aus denen der Hash stammt.

## Schritte

- **sandbox 02, der Sandbox-Server steht:** Einrichtungsskript im Repo (idempotent, vom code-host per SSH mit
  `~/.ssh/id_ed25519_cp_sandbox`): Ubuntu auf Stand, nftables nach `## Netz`, Docker mit `runsc`, Caddy, `sandboxd` mit Anlegen,
  `exec`, Dateien, Ports, Stoppen, Löschen und Aufräumen nach `## Grenzen`, Eintrag `*.postyourprice.com` und
  Zertifikat mit `tls internal` nach `## Netz`. Prüfungen
  gegen den Server: keine Host-Datei lesbar; `76.13.144.207` aus einer Sandbox nur auf tcp/443 erreichbar (443/tcp offen, 22/tcp
  und 443/udp gesperrt, nach `## Netz`); `169.254.169.254` nicht erreichbar; kein Port des Hosts erreichbar, weder über die
  Bridge-Adresse noch über `72.62.51.224` oder die IPv6 des Hosts; ein Prozess über 512 MB beendet die Sandbox (unter gVisor tötet
  der Kernel die Sentry, `goals/sandbox/ANNAHMEN.md`, Goal 02), der Host bleibt
  von außen erreichbar.
- **sandbox 03, die Sandbox-API ist frei und abgerechnet:** Das Control Plane beantwortet jede Zeile aus `docs/sandbox/vertrag.md`,
  Abschnitt `## Endpunkte`, für Sandboxes mit den Feldern dort und reicht sie signiert an `sandboxd` weiter; Abrechnung nach
  `## Preis` als Ledger-Zeilen in derselben Transaktion wie der Saldo, Reservierung, 402 mit `details`, Halt bei leerem Guthaben,
  `exec` über 30 s an der Wiederholung mit demselben `Idempotency-Key` ohne zweite Ausführung. Unit-Tests gegen einen nachgebauten
  `sandboxd`, Rollout über `deploy.yml`, danach `ops/live.sh` mit einer eigenen Adresse.
- **sandbox 04, Ende zu Ende mit der unveränderten Runtime:** Der Harness bekommt einen nachgebauten `sandboxd`, und der Job `e2e`
  zeigt, dass die Runtime am Pin eine Sandbox anlegt, darin ausführt, einen Port freigibt und das Ledger stimmt; dazu ein Lauf gegen
  die Produktion mit einem eigenen Automaton aus vorhandenen Credits.
- **domains 01** baut danach die Domain-Zeilen des Vertrags: Suche und DNS für Namen `sbx-…` unter `postyourprice.com`, eine klare
  Antwort ohne Kauf für `POST /v1/domains/register`, denn ein Domain-Kauf ist das Human Gate `server_kauf`.
