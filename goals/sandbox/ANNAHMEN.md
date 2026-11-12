# Annahmen sandbox

## Goal 01 (10.11.2026, Engineer CP)

- **Kurs Euro zu USD 1,17.** Der Preis in `docs/sandbox/plan.md`, Abschnitt `## Preis`, rechnet den Einkauf bei Hostinger mit
  1 Euro = 1,17 USD in mc um. Ein Kurs ist keine Zahl der Produktion; bei 1,05 läge der Server bei 790 mc je Stunde und die Marge bei
  halber Belegung bei Faktor 3,8, die Entscheidung kippt in keinem plausiblen Bereich.
- **Kein `/dev/kvm` auf Hostinger KVM 1.** Gemessen am Zahlungsserver, der dasselbe Paket ist, nicht am neuen Server, den es noch
  nicht gibt: `ls -l /dev/kvm` gab `No such file or directory`, `grep -cE "vmx|svm" /proc/cpuinfo` gab `0`. sandbox 02 misst am neuen
  Server erneut; der Plan bleibt bei gVisor auch dann, wenn es dort `/dev/kvm` gibt.
- **Die 4xx und 501 fremder Adressen auf `/v1/sandboxes` und `/v1/domains` werden kein neuer Vorschlag `fehler`.** Sie sind genau der
  Beleg, aus dem die Topics `sandbox` (Prio 2) und `domains` (Prio 3) in `ROADMAP.md` entstanden sind; sandbox 03 und domains 01
  beheben sie. Ein Vorschlag mit Schwere 5 würde dieselbe Arbeit als zweites Glied unter `fehler` vor die Kette stellen. Der eine
  401 auf `POST /v1/sandboxes` ist eine Anfrage ohne gültigen API-Key, kein Fehler des Dienstes.
- **Preise bei Hostinger** gelesen am 10.11.2026 auf `https://www.hostinger.com/de/vps-hosting`: KVM 1 mit 1 vCPU, 4 GB, 50 GB NVMe
  für 5,49 Euro im Monat bei 24 Monaten (131,76 Euro im Voraus), danach 11,99 Euro im Monat. Ob der Shop bei der Bestellung einen
  anderen Preis zeigt, sieht erst Matthias; `docs/sandbox/server.md` nennt den Preis, den er bezahlt hat.
- **Schlüsselpaar `~/.ssh/id_ed25519_cp_sandbox`** am 10.11.2026 auf dem code-host angelegt (ed25519, ohne Passphrase, Kommentar
  `code-host cp-sandbox`). Die öffentliche Hälfte steht unter `## Blockers` der Goal-Datei, die private verlässt den code-host nie.

## Goal 01, Umstellung (11.11.2026, Engineer CP)

- **Server ist `srv1327036` statt eines neuen KVM 1.** Entscheidung Matthias am Topic vom 11.11.2026, das Gate `server_kauf` entfällt.
  Die Zeilen oben zu KVM 1 und seinem Preis gelten nur noch als Herleitung von Zyklus 1; `docs/sandbox/plan.md` rechnet mit KVM 2.
- **Preis KVM 2 nach dem 03.02.2027** gelesen am 11.11.2026 auf `https://www.hostinger.com/de/vps-hosting`: 2 vCPU, 8 GB, 100 GB,
  7,79 Euro im Monat bei 24 Monaten, Verlängerung 14,99 Euro im Monat. Der Plan rechnet die Marge mit der Verlängerung.
- **Kein `/dev/kvm` auf `srv1327036`** ist weiter nur am Zahlungsserver gemessen; sandbox 02 misst nach der Neuinstallation.
- **Erst Neuinstallation, dann Zugang.** Auf `srv1327036` liefen Loop und Deploy-Runner von Wissensanker, darum wird er mit Ubuntu
  24.04 ohne Panel neu installiert, sobald wa-staging umgezogen ist. Gegenprobe vor der Neuinstallation am 11.11.2026:
  `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes -o ConnectTimeout=15 root@72.62.51.224 'uname -sr'`
  gab `Permission denied (publickey)` mit Exit 255; der dabei gespeicherte Hostschlüssel ist mit `ssh-keygen -R 72.62.51.224`
  wieder entfernt, weil die Neuinstallation einen neuen erzeugt.

## Goal 01, paralleler Schnitt (11.11.2026, Engineer CP)

- **Kein Human Gate mehr für den Server.** Nachtrag Matthias am Topic vom 11.11.2026: Den Handgriff in hPanel gibt es nicht; wer den
  Umzug von wa-staging (PRO-17959) abschließt, räumt `srv1327036` per SSH leer und trägt den Schlüssel ein. Status darum `WAITING`
  statt `BLOCKED matthias`, das Gate `delete_data` entfällt.
- **Schnitt, damit die Kette ohne Server weiterläuft** (Matthias: Reihenfolge und Schnitt entscheidet der Maker). Was keinen Server
  braucht, hängt nicht an sandbox 01 DONE, sondern nur an abrechnung 01 DONE und liest Vertrag und Plan von `goal/sandbox-01`
  (`git show origin/goal/sandbox-01:docs/sandbox/plan.md`), bis PR #4 in `dev` ist:
  1. sandbox 03 zuerst, weil sie das Geld bringt: API und Abrechnung nach `## Preis` gegen einen nachgebauten `sandboxd` in den
     Unit-Tests und im Harness; ohne Server und ohne `/data/sandbox-client.key` antwortet die Produktion weiter 501, ein Rollout ist
     also gefahrlos.
  2. sandbox 02 ohne Server parallel: `sandboxd`, Einrichtungsskript, nftables nach `## Netz`, gVisor-Profil, Tests gegen einen
     lokalen Container mit `runsc` im CI. Die Einrichtung auf `srv1327036` und die Prüfungen dort bleiben ein eigenes Glied mit der
     Voraussetzung sandbox 01 DONE.
  3. domains 01: Die Voraussetzung `sandbox Goal 01 DONE` ist Vertrag einer bestehenden Goal-Datei; sie zu lösen geht über die Human
     Inbox. Inhaltlich braucht domains 01 nur die Zone `sbx.postyourprice.com` und die Adresse 72.62.51.224, keinen laufenden Server.

## Goal 01, Abschluss (11.11.2026, Engineer CP)

- **Überholt:** Der parallele Schnitt und „Erst Neuinstallation, dann Zugang“ sind durch Matthias' Entscheidung von 08:44 überholt:
  Die Sandbox kommt sofort auf `srv1327036`, neben wa-staging, ohne Neuinstallation; die Kette behält die Nummern der ROADMAP.
  `/dev/kvm` fehlt auf `srv1327036` (gemessen 11.11.2026, `ls -l /dev/kvm` gab `No such file or directory`, `grep -cE "vmx|svm"
  /proc/cpuinfo` gab `0`), gVisor mit `systrap` bleibt richtig.
- **Steuer-API über 443 statt 8443.** Regel 5 (ufw bleibt bei 22, 80 und 443) schließt den eigenen Port aus, darum läuft `sandboxd`
  hinter Caddy unter `ctl.sbx.postyourprice.com`, nur für `76.13.144.207`, mit derselben Ed25519-Signatur wie geplant.

## Goal 02 (12.11.2026, Engineer CP)

- **Zertifikat für `sbx-*` von Caddy selbst statt Origin CA.** Der Token `CLOUDFLARE_HTC_API_TOKEN` darf DNS lesen und schreiben, aber
  kein Origin-CA-Zertifikat ausstellen: `POST /client/v4/certificates` gab am 12.11.2026 `1016 User is not authorized to perform this
  action`. Die Zone steht auf SSL „Full“ (`GET /zones/<id>/settings/ssl` gab `full`), Cloudflare verschlüsselt also bis zum Server und
  prüft dessen Zertifikat nicht. Ein Origin-CA-Zertifikat brächte erst mit „Full (strict)“ etwas. Darum stellt Caddy das Zertifikat für
  `*.postyourprice.com` mit `tls internal` selbst aus, ohne ACME, ohne globale Option und ohne Schlüsseldatei, die vom code-host
  kommen müsste. Kein Human Gate, weil der Weg ohne Matthias geht und gleich sicher ist; wer später „Full (strict)“ will, braucht einen
  Token mit „SSL and Certificates: Edit“ und tauscht die Zeile `tls internal` gegen `tls <cert> <key>`.
- **Sperren in einer eigenen Tabelle statt in `DOCKER-USER`.** `DOCKER-USER` ist eine Kette von iptables; Docker 29 auf Ubuntu 24.04
  läuft über iptables-nft. Die Tabelle `inet sandbox` (`ops/sandbox/sandbox.nft`) hängt mit Priorität -10 an `forward` und `input`,
  also vor Docker und ufw, und deckt IPv4 und IPv6 mit denselben Regeln. Jede Sperre hat einen benannten Zähler (`sbx_host`,
  `sbx_peer`, `sbx_pay`, `sbx_meta`, `sbx_priv`, `sbx_smtp`) und eine Logzeile `sbx-…`; daran misst `ops/sandbox/probe.sh` die
  Gegenprobe.
- **Kein IPv6 in den Sandboxes.** Die Bridge-Netze bekommen keine IPv6 (`ip6tables: false`, kein IPv6-Pool in `daemon.json`). Eine
  Sandbox erreicht also nichts über IPv6, auch nicht den Host; die Gegenprobe von `host_ipv6` ist, dass der code-host 22, 80 und 443 des
  Hosts über IPv6 erreicht, das Ziel also lauscht. Die Regel in `input` greift trotzdem für IPv6, falls ein Netz später IPv6 bekommt.
- **DNS über `resolv.conf` statt über Dockers eingebauten DNS.** Unter `runsc` antwortet `127.0.0.11` in einem eigenen Bridge-Netz
  nicht (gemessen 12.11.2026: `getent hosts postyourprice.com` im Container gab nichts). Darum schreibt der Startbefehl jeder Sandbox
  `nameserver 1.1.1.1` und `nameserver 9.9.9.9` in ihre eigene `/etc/resolv.conf`; `--dns` bleibt gesetzt.
- **OOM beendet die ganze Sandbox.** Unter gVisor liegt die Sentry im Cgroup des Containers; überschreitet ein Prozess 512 MB, tötet der
  Kernel die Sentry, nicht nur den Prozess (gemessen 12.11.2026: `oom-kill … task=gvisor_sentry` im Kernel-Log, `oom_kill 1` in
  `memory.events`). Der Container startet mit `--restart unless-stopped` neu, der Datenträger unter `/root` bleibt. Der Host antwortet
  dabei weiter.
- **Root-Dateisystem im Speicher.** `runsc` läuft mit `--overlay2=root:memory`: Schreiben außerhalb von `/root` landet im Speicher der
  Sandbox und zählt gegen ihre 512 MB, statt unbegrenzt auf der Platte des Hosts. Dauerhaft ist nur der Datenträger unter `/root`.
- **Kein eigener Benutzer-Namensraum je Sandbox.** gVisor fängt jeden Systemaufruf in der Sentry ab, Root im Container ist kein Root im
  Host-Kernel; `userns-remap` des Docker-Daemons kommt dazu nicht, weil es für den ganzen Daemon gilt.
- **Eigenes Node 22 für `sandboxd`** unter `/opt/sandboxd/node-v22.23.4`, aus dem Tarball von nodejs.org mit Prüfung gegen
  `SHASUMS256.txt`. Das Node 24 unter `/usr/local/bin` gehört zu wa-staging und bleibt unberührt.
- **Neun Plätze statt zehn neben wa-staging, elf statt zwölf danach.** Gemessen: leere Sandbox 9 MB, `sandboxd` 18 MB, beide in
  `sandbox.slice` (`docs/sandbox/server.md`). Weil die Sentry im Cgroup jedes Containers liegt, belegt eine volle Sandbox genau 512 MB;
  zehn davon und `sandboxd` passen nicht in `MemoryMax=5G`. `## Grenzen` und `## Preis` in `docs/sandbox/plan.md` rechnen mit 9 und
  11, `SANDBOXD_SLOTS=9` in `ops/sandbox/sandboxd.service`. Die Marge bei halber Belegung sinkt von Faktor 2,1 auf 1,9, bleibt also über
  1,3.
- **Peer-Sperre in `prerouting`.** Docker 29 verwirft Pakete an die Adresse eines anderen Containers schon in `raw PREROUTING`
  (Priorität -300), bevor `forward` sie sieht; der Zähler `sbx_peer` blieb dort bei 0 (Messung 12.11.2026, `other_sandbox`). Die Regel
  steht darum in einer Kette `prerouting` mit Priorität -310 und zählt, bevor Docker verwirft.

## Goal 02, Kritik (12.11.2026, Tech Lead)

- **Wildcard `*.postyourprice.com` bleibt bis sandbox 03, für Kunden kommt eine eigene Domain.** Entscheidung Tech Lead zu
  `goals/_vorschlaege/sandbox-kritik-2026-11-12-1.md`: In sandbox 02 legt nur die Messung Sandboxes an, `POST /v1/sandboxes` antwortet
  in der Produktion weiter 501, unter dem Wildcard läuft also kein fremder Code. Bevor sandbox 03 einem Kunden einen Port freigibt,
  ziehen die freigegebenen Ports auf eine eigene registrierbare Domain um (Kauf über `server_kauf`), weil eine Phishing-Seite unter der
  Zone des Zahlungsdienstes `postyourprice.com` bei Safe Browsing sperren lassen kann und damit jede Inferenz-Anfrage trifft; so trennen
  es GitHub (`github.io`), Vercel (`vercel.app`) und Fly (`fly.dev`). Notschalter bis dahin: den einen Eintrag `*.postyourprice.com` in
  Cloudflare löschen; `ctl.sbx`, die Hauptseite und alle anderen Einträge der Zone bleiben davon unberührt.
