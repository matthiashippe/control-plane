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

## Goal 03 (12.11.2026, Engineer CP)

- **Freigegebene Ports antworten 409 `port_exposure_unavailable`.** Entscheidung Tech Lead vom 12.11.2026 (Goal 02, Kritik), gebaut in
  `src/sandbox/service.ts`: `POST /v1/sandboxes/{id}/ports/expose` und `DELETE /v1/sandboxes/{id}/ports/{port}` antworten nach der
  Prüfung, dass die Sandbox dem Konto gehört, mit 409 und `{"error": "port_exposure_unavailable", ...}` und rufen `sandboxd` nicht
  auf, weil unter `*.postyourprice.com` kein Dienst eines Kunden auftreten darf, solange die eigene Domain für Ports fehlt (Kauf über
  `server_kauf`). Die Runtime gibt den Fehler an das Werkzeug `expose_port` weiter und läuft weiter. Belegt in
  `test/sandbox-api.test.ts` („port_exposure_unavailable“: kein Aufruf erreicht `sandboxd`).
- **Reservierung in `sandboxes.hold_mc`, nicht in `wallets.reserved_mc`.** `migrate()` setzt `reserved_mc` bei jedem Start auf 0, und
  `deploy/rollout-remote.sh` wartet vor dem Umschalten auf ein Fenster ohne `reserved_mc <> 0`: Eine Sandbox, die tagelang läuft,
  hielte jeden Rollout bis zum Timeout auf. Die Summe der `hold_mc` zählt in `reserveMc`, `getAvailableMc` und in `postLedger` bei
  Abbuchungen ohne eigene Reservierung wie `reserved_mc` mit, Inferenz und Bounties können die 1000 mc also nicht ausgeben. Die
  Schritte selbst buchen mit `settlesHold` gegen den Saldo, nie darunter. Die Reservierung gilt, solange die Sandbox läuft; beim
  Stopp und beim Löschen geht sie zurück, ein Neustart nach Topup nimmt sie wieder.
- **`exec` hält die Anfrage, bis das Ergebnis da ist, statt nach 25 s zu antworten.** Der Kontext nennt höchstens rund 25 s. Gelesen
  im Klon am Pin (`src/conway/http-client.ts:75` bis `:120`, `src/conway/client.ts:45`): Die Runtime wiederholt einen Versuch mit
  demselben `Idempotency-Key` nur nach eigenem Abbruch (30 s), nach 429 und 5xx und, eine Ebene höher, nach 404. Jede Antwort, die
  wir nach 25 s geben könnten, wäre entweder ein Status, den der Vertrag verbietet (429, 5xx, 404 für eine bekannte Sandbox), ein
  Fehler, den die Runtime ohne Wiederholung an das Modell gibt (das den Befehl dann mit neuem Schlüssel ein zweites Mal startet),
  oder ein 2xx mit falschem Ergebnis. Darum hält das Control Plane die Anfrage offen; bricht die Runtime nach 30 s ab, loggt Caddy
  Status 0 (kein 4xx oder 5xx, `goals/abrechnung/ANNAHMEN.md`), und die Wiederholung mit demselben Schlüssel wartet auf denselben
  laufenden Befehl. Der Befehl läuft also genau einmal, auch über mehrere Versuche, bis zu seinem `timeout` von höchstens 600 s.
  Der Abbruch zählt bei der Runtime für ihren Circuit Breaker wie bei Conway; das ändert keine Antwort von uns. sandbox 04 misst es
  im Harness mit der unveränderten Runtime.
- **`cp_nonce` an jeder Anfrage an `sandboxd`.** Ed25519 signiert deterministisch: zwei gleiche Anfragen in derselben Sekunde (zwei
  Lesezugriffe der Runtime, ein doppelter Takt) trügen dieselbe Signatur, und `sandboxd` lehnt eine schon gesehene Signatur mit 401
  ab. Der Client hängt deshalb `cp_nonce=<16 hex>` als Text an die Query und signiert den Pfad danach; `sandboxd` liest nur die
  Parameter, die es kennt. Als Text, weil `URLSearchParams` die ganze Query neu kodiert (`%20` wird `+`), das fing
  `test/sandbox-client.test.ts` beim ersten Lauf.
- **501 vor 402, wenn `sandboxd` gerade nicht erreichbar war.** Scheiterte der letzte Aufruf an `sandboxd` vor weniger als 60 s (der
  Abrechnungstakt fragt jede Minute), antwortet `POST /v1/sandboxes` sofort 501, ohne das Guthaben anzusehen: Ein 402 ließe die
  Runtime Guthaben kaufen für eine Sandbox, die nicht starten kann. Ein 402 geht nie an `sandboxd`.
- **Erster Abrechnungstakt drei Minuten nach dem Start.** Der Kanarienvogel von `deploy/rollout-remote.sh` startet das neue Image mit
  `CP_DB_PATH=/data/rollout-canary.db` im selben Volume, findet also denselben Schlüssel; er läuft nur Sekunden und darf nichts
  stoppen oder buchen. Eine Sandbox, die `sandboxd` kennt und keinem Eintrag gehört, löscht der Takt nicht, er schreibt eine Logzeile.
- **Begonnener Schritt beim Stopp wegen leeren Guthabens.** Der Takt läuft jede Minute, ein Schritt kann also bis zu einer Minute
  begonnen sein, wenn das Guthaben ihn nicht mehr deckt. Dann stoppt das Control Plane die Sandbox und bucht für diesen begonnenen
  Schritt, was noch da ist (weniger als der Preis, `meta.partial`), nie mehr; der Saldo wird nie negativ.
- **Lesen einer fehlenden Datei ist 404 `file_not_found`.** Die Runtime liest Dateien mit `retries404: 0` (`src/conway/client.ts:208`
  am Pin), ein 404 dort heißt für sie „Datei fehlt“ und wird nicht wiederholt. Sonst gibt es 404 nur für eine unbekannte ID oder die
  Sandbox eines anderen Kontos.
- **Eigene Adresse über SIWE statt über `POST /v1/auth/keyless`.** Die Tür `keyless` antwortete am 12.11.2026 gegen 14:30 UTC mit 429
  `daily_limit` (`curl -s -X POST https://postyourprice.com/v1/auth/keyless`). Die eigene Adresse entstand deshalb über
  `/v1/auth/nonce`, `/v1/auth/verify` und `/v1/auth/api-keys` mit einer frischen Wallet ohne Guthaben, Schlüsselname
  `ops-live-sandbox` (Muster `ops-%` in `OUR_KEY_NAMES`). Adresse in `src/bounties/ours.ts` (`LIVE_SANDBOX_ADDRESS`) und
  `ops/db-report.cjs`; API-Key und Wallet-Schlüssel nur in `~/.config/control-plane/live-sandbox.env` (0600) auf dem code-host.
  `ops/ours.txt` führt Mail-Adressen, darum steht dort nur ein Kommentar mit dem Verweis.
- **Gutschrift der eigenen Adresse als Art `internal_grant`.** Die Art `grant` trägt den eindeutigen Index „eine Startgutschrift je
  Adresse“ und zählt zum Topf der Startgutschriften. `internal_grant` hat einen eigenen eindeutigen Index über `ref`
  (`grant:live-sandbox`); gebucht wird beim Start des Dienstes nur, wenn das Konto existiert, also in keiner Test-Datenbank und
  nicht im Harness.
- **Wiederholtes Anlegen ohne `Idempotency-Key` (Kritik 12.11.2026, Punkt 12).** Gleich ist eine Wiederholung, wenn Konto und Body
  übereinstimmen (Body mit sortierten Schlüsseln verglichen). Läuft das erste Anlegen noch, wartet die Wiederholung auf dessen
  Antwort; bis 60 s nach einer Antwort 201 bekommt sie dieselbe Sandbox, solange sie noch lebt. Eine Ablehnung (400, 402, 409, 501)
  wird nicht gemerkt, der nächste Versuch fragt neu. Folge: Wer innerhalb von 60 s bewusst zwei gleiche Sandboxes will, gibt ihnen
  verschiedene `name`; die Runtime legt Kinder ohnehin mit eigenem Namen an. Der Merker liegt im Speicher des Dienstes und gilt bis zum
  nächsten Neustart.

## Goal 04 (13.11.2026, Engineer CP)

- **409 statt freigegebenem Port.** `expose_port` der Runtime bekommt wie seit sandbox 03 die Antwort 409
  `port_exposure_unavailable`, kein Port wird freigegeben und am 409 ändert sich kein Code. Belegt im Gang: Das Werkzeug gibt den
  Fehlertext mit `port_exposure_unavailable` an das Modell zurück, und der nächste Aufruf desselben Clients (`list_sandboxes`)
  gelingt mit 200, weil 409 nicht in den Status steht, die ihr HTTP-Client wiederholt und für den Circuit Breaker zählt
  (`src/types.ts:613` am Pin). Ports kommen mit sandbox 06 unter einer eigenen Domain.
- **Gang über Client und Werkzeuge statt über einen Turn.** `harness/e2e/sandbox-walk.mjs` ruft `createConwayClient` und
  `executeTool` mit `createBuiltinTools` aus `dist/` der unveränderten Runtime direkt auf, wie der Block der Domains in `full.sh`. Ein
  Turn des Mock-Modells hätte die Reihenfolge, die Namen und die Argumente vom Mock abhängig gemacht; die Werkzeuge sind dieselben,
  die ein Modell aufruft. Je Sandbox ein Client, wie die Runtime ihn hält. `DELETE /v1/sandboxes/{id}` geht direkt über HTTP mit
  demselben Schlüssel, weil `deleteSandbox` am Pin leer ist. Jeder HTTP-Status, den der Client der Runtime bekommt, wird über das
  globale `fetch` mitgeschrieben, das die Runtime benutzt; so fällt auch auf, wenn `read_file` nur über seinen Rückfall auf `cat`
  gelang (zwei Anfragen statt einer).
- **Lauf gegen die Produktion ohne Topup.** `ops/runtime-sandbox.sh` läuft mit dem Konto `live-sandbox` aus sandbox 03 und bezahlt aus
  dessen vorhandenen Credits (Gutschrift `internal_grant`). Der Gang hat keine Wallet und ruft das Topup der Runtime
  (`src/conway/topup.ts:81` am Pin, sonst aus der Schleife des Agenten bei einem 402) nie auf; ein 402 beim Anlegen endet mit
  `FAIL credits`. Keine Wallet-Bewegung, kein Gas (`loop-constraints.md`, Grundregel 10). Die Runtime dafür baut das Skript auf dem
  code-host in `~/.cache/control-plane/automaton-d8f8168` und prüft vor dem Gang Pin und leeres `git status --porcelain`.
- **Nachbau von `sandboxd` ohne Docker im Docker.** `harness/sandboxd/` startet den echten `createSandboxd` mit einem eigenen `run`:
  Netz, Image und Container führt es nur im Zustand (`/var/lib/sandboxd/docker.json`), `docker exec` läuft als Prozess im Container
  des Nachbaus, `/root` in den Argumenten zeigt auf das Verzeichnis, das `sandboxd` sonst als Platte einhängt; `umount` leert es,
  `rmdir` entfernt es. Die Signaturprüfung bleibt echt, die Schlüssel liest der Nachbau je Anfrage aus dem Volume `cp-data` (nur
  lesend). `cp` spricht ihn über `http://sandboxd:8730` an: Der Client in `src/sandbox/client.ts` verlangt kein `https`, ein
  Zertifikat aus `harness/gen-certs.sh` war darum nicht nötig. Isolation zeigt der Nachbau nicht, die prüft sandbox 02 am echten
  Server.
- **Kein Fehler der Sandbox-API gefunden.** Der Gang lief lokal (echtes `dist/index.js` über TLS, Nachbau, Runtime am Pin) und gegen
  die Produktion ohne Befund, `src/` ändert dieses Goal deshalb nicht.

## Goal 05 (13.11.2026, Engineer CP)

- **Messung vorher** (`docs/sandbox/lange-befehle.md`, `## Vorher`, Commit `e8ab65f`, lokal mit Runtime am Pin): 60 s kam nach
  einem Abbruch über die Wiederholung mit demselben `Idempotency-Key` an (60168 ms, 2 Versuche, `failures_after` 0). 180 s
  scheiterte: 4 Versuche, alle nach 30 s abgebrochen, das Werkzeug warf `This operation was aborted` nach 127665 ms,
  `failures_after` 4, der Befehl lief bei uns einmal und bis zum Ende weiter.
- **Entschieden: Hintergrundlauf, nicht 400.** Ein 400 für `timeout` über 120000 ms ist für die Runtime ein Fehler: ihr Client
  wirft bei jedem Status außer 2xx, das Werkzeug `exec` gibt dem Modell einen Fehlertext, und der Befehl, den das Modell eben
  ausführen wollte (`apt-get install`, `npm install`), läuft gar nicht. Beim Hintergrundlauf läuft er, die Antwort kommt mit 200
  nach 20 s, bevor die Runtime nach 30 s abbricht, kein Versuch wird abgebrochen und der Zähler ihres Circuit Breakers geht auf 0.
- **Grenze 90000 ms statt 120000.** Bis `timeout` 90000 ms bleibt `exec` wie bisher gehalten, weil 60 s heute schon ohne Fehler
  ankommt (Messung oben) und das Modell sein Ergebnis sofort hat. Den vierten Versuch schickt die Runtime frühestens 93,5 s nach
  dem ersten (30 s Abbruch plus Backoff 1 s mal 2 hoch Versuch mal mindestens 0,5, dreimal), er bricht frühestens bei 123,5 s ab.
  Bei 120000 ms blieben einem Befehl, der bis zu seinem `timeout` läuft, 3,5 s Rand für Start, Signatur und Weg zu `sandboxd`; bei
  90000 ms sind es 33,5 s. Was schneller fertig ist, bekommt auch über 90000 ms sein Ergebnis direkt: geantwortet wird erst nach 20 s.
- **Ausgabe in Dateien der Sandbox.** Für den Hintergrundlauf schickt das Control Plane `sandboxd` den Befehl in einer Hülle
  (`backgroundCommand` in `src/sandbox/service.ts`): `bash -c '<Befehl>'` unter `timeout -k 5 <s>` aus coreutils (im Image
  `ubuntu:24.04` enthalten), stdout nach `/root/.exec/<tag>.out`, stderr nach `<tag>.err`, der Exit-Code beim Ende nach
  `<tag>.exit` (124 heißt am `timeout` gestoppt), danach beide Ausgaben auf stdout und stderr wie bisher. `<tag>` sind 12
  Hex-Zeichen aus SHA-256 über Sandbox und `Idempotency-Key`, damit eine Wiederholung dieselben Dateien nennt. `sandboxd` bekommt
  15 s mehr als der innere `timeout`, damit die Hülle ihre Exit-Datei schreibt, bevor `sandboxd` den Prozess beendet; bei 600000 ms
  bleiben innen 585 s. `sandboxd` selbst ändert sich nicht (Deny List), die Hülle ist ein gewöhnlicher Befehl.
- **Antwort an das Modell.** 200 mit `exit_code` -1 (so liest die Runtime einen fehlenden Exit-Code), `stdout` mit dem Text, dass
  der Befehl im Hintergrund weiterläuft, wie lange höchstens, in welchen Dateien Ausgabe, Fehler und Exit-Code landen, dass es sie
  später mit `read_file` oder `exec` und `cat` liest und den Befehl nicht noch einmal startet; dazu `running`, `output_file`,
  `error_file` und `exit_code_file`, die die Runtime nicht liest. Eine Wiederholung mit demselben Schlüssel bekommt dieselbe
  Antwort sofort, nach dem Ende das Ergebnis. Abgerechnet wird weiter nur die Laufzeit der Sandbox.
- **Run-Zähler im Gang.** `harness/e2e/long-exec.mjs` stellt jedem Befehl `echo run >> /root/<label>.runs;` voran und liest die
  Datei nach dem Ende, damit `judgeLongExec` belegt, dass der Befehl genau einmal lief, auch über mehrere Versuche.

## Goal 02, Audit 2026-11-13 (13.11.2026, Engineer CP)

- **Zeile 256 (Reparatur).** Prüfung 1 von Punkt 5 trägt zwei Befehle; das Audit fuhr nur `dig +short A ctl.sbx.postyourprice.com`
  (Ausgabe `72.62.51.224`) und schrieb ROT, weil die AAAA-Abfrage nicht lief. Mit Netz auf dem code-host am 13.11.2026 gibt
  `dig +short AAAA ctl.sbx.postyourprice.com` keine Zeile aus; die Gegenprobe `dig +short AAAA
  google.com` liefert zwei Adressen, die Abfrage kann also treffen. Der Punkt hält, Code und Server sind unverändert, die Goal-Datei
  ist eingefroren. Dasselbe gilt für die Zeilen 258 und 259 (`dig … sbx-unknown0-80 … | grep -c` 0, `ops/smoke.sh` Exit 0). Die
  Lesart des Audits steht als Vorschlag in `goals/_vorschlaege/loop-audit-2026-11-13-2.md`.
- **Zeile 258 (Reparatur).** Prüfung 3 von Punkt 5 trägt zwei Befehle; das Audit fuhr nur den `curl` auf
  `sbx-unknown0-80.postyourprice.com` (404) und schrieb ROT, weil `dig +short A sbx-unknown0-80.postyourprice.com | grep -c
  72.62.51.224` nicht lief. Mit Netz auf dem code-host am 13.11.2026 um 13:41 UTC: `curl` 404, `grep -c` 0, der Name zeigt auf
  den Proxy. Gegenprobe `dig +short A ctl.sbx.postyourprice.com | grep -c 72.62.51.224` gibt 1, der Zähler kann also treffen.
  Der Punkt hält; `node scripts/check.mjs` auf `dev` 10526f4 grün (131 Dateien, 1591 Tests). Ursache und Empfehlung stehen
  im Vorschlag `goals/_vorschlaege/loop-audit-2026-11-13-2.md`.
- **Zeile 259 (Reparatur).** Prüfung 4 von Punkt 5 trägt zwei Befehle; das Audit fuhr nur `dig +short A postyourprice.com`
  (`76.13.144.207`) und schrieb ROT, weil `bash ops/smoke.sh https://postyourprice.com` ohne Netz nicht lief. Mit Netz auf dem
  code-host am 13.11.2026 um 14:08 UTC: `dig` gibt genau `76.13.144.207`, `ops/smoke.sh` Exit 0 (13 Prüfungen, 0 Fehler, 1
  ausgelassen). Gegenprobe: `bash ops/smoke.sh https://ctl.sbx.postyourprice.com` Exit 1 (12 Fehler), `dig +short A
  ctl.sbx.postyourprice.com | grep -cx 76.13.144.207` 0; beide Werkzeuge können also rot werden. Der Punkt hält, Code und Server
  sind unverändert. Ursache und Empfehlung stehen im Vorschlag `goals/_vorschlaege/loop-audit-2026-11-13-2.md`.

## Goal 07 (13.11.2026, Engineer CP)

- **Ausgangslage.** `ops/ports-demand.sh` ist unverändert aus Commit 0ce27f0 übernommen; sein Selbsttest war am heutigen Stand
  grün, also gab es keinen Grund für eine Änderung. Seit dem Rollout von sandbox 03 (2026-11-12 18:12:46 UTC) baten 0 fremde
  Adressen um einen Port (`docs/sandbox/ports.md`, `## Vorher`). Die 0 hält das Goal nicht auf (Fast track in `ROADMAP.md`).
- **Domain `sandboxhost.dev`.** Ein Name, der ohne Vorwissen nach einer Sandbox klingt und nicht nach der Zahlung; Ausweich
  `runsandbox.dev` und `sbxhost.dev`. `.dev` steht auf der HSTS-Preload-Liste, jeder Aufruf geht also nur über HTTPS. Die Domain
  steht im Code genau an einer Stelle je Datei: `SANDBOXD_DOMAIN` in `ops/sandbox/sandboxd.service` (daraus lesen
  `cloudflare.py` und `setup.sh` sie) und der Name des Blocks in `ops/sandbox/sandbox.caddy`. Kauft Matthias einen Ausweichnamen,
  ändern sich nur diese zwei Zeilen.
- **Registrar Cloudflare.** Im Konto, in dem die Zone `postyourprice.com` liegt, weil die Zone dann ohne Umzug der Nameserver dort
  steht und Cloudflare zum Selbstkostenpreis verkauft (12.20 USD im Jahr laut Preisliste, `docs/sandbox/ports.md`).
- **Token.** Ein eigener API-Token `CLOUDFLARE_SBX_API_TOKEN` nur für die neue Zone mit Zone DNS Edit, Zone SSL and Certificates
  Edit und Zone Settings Edit, statt den Token der Zahlungszone zu erweitern: Ein Fehler im Werkzeug der Ports kann dann die Zone
  der Zahlung nicht ändern. Er liegt nur in `~/brain/connectors/secrets.env` auf dem code-host, nie auf dem Sandbox-Server. Den
  Token der Zahlungszone braucht `cloudflare.py` nur noch für `ctl.sbx`, das Löschen von `*.postyourprice.com` und
  `zone-digest`.
- **Origin CA statt `tls internal`.** Die neue Zone läuft auf SSL „Full (strict)“, Cloudflare prüft also das Zertifikat des
  Sandbox-Servers. Das Zertifikat (`*.sandboxhost.dev` und `sandboxhost.dev`, 15 Jahre) holt `setup.sh --origin-cert` über
  `cloudflare.py origin-cert` in ein privates Temp-Verzeichnis des code-host, legt es nach `/etc/caddy/sbx/` (0600, Besitzer
  caddy) und löscht es lokal sofort. `setup.sh` verweigert einen Lauf, solange dort kein gültiges Zertifikat der Domain liegt,
  weil Caddy mit einer Datei, die auf ein fehlendes Zertifikat zeigt, nach dem nächsten Neustart nicht mehr lädt (lokal belegt:
  `caddy validate` mit Wegwerf-Zertifikat „Valid configuration“, ohne Zertifikat „loading certificates: open …“), und stellt bei
  einem roten `caddy validate` jetzt auch `sandbox.caddy` zurück, nicht nur `Caddyfile`. Die Zahlungszone bleibt bei ihrem
  SSL-Modus, das Goal ändert ihn nicht.
- **sandboxd verweigert die Domain der Zahlung.** `assertPortsDomain` in `ops/sandbox/sandboxd.mjs` lehnt eine leere Domain, einen
  ungültigen Namen und `postyourprice.com` samt jedem Namen darunter ab; `main` bricht vor jedem Verzeichnis und jedem Port ab, den
  Rückfall auf `postyourprice.com` gibt es nicht mehr. Das Control Plane prüft jede `public_url` zusätzlich selbst und gibt eine
  unter `postyourprice.com` nie weiter, damit ein alter Stand des Servers keinen Dienst eines Kunden unter die Zone der Zahlung
  legt.
- **Wildcard der Zahlungszone gelöscht** am 2026-11-13 um 19:33 UTC mit `python3 ops/sandbox/cloudflare.py dns-apply 72.62.51.224`
  („deleted A *.postyourprice.com“), vor dem Kauf der neuen Domain: Bis dahin antwortete das Control Plane auf `ports/expose` mit
  409, kein Kunde hatte also eine Adresse darunter, und die Zone hatte außer Wurzel, `www` und `ctl.sbx` keinen Namen, der über den
  Wildcard lief. Fingerabdruck vorher und nachher `29c9eb2596f4`.
- **Notschalter** bei Missbrauch eines freigegebenen Ports (etwa einer Phishing-Seite): den einen Eintrag `*.sandboxhost.dev` in der
  Zone der Ports löschen. Alle Adressen freigegebener Ports sind dann weg, die Zahlung ist davon nie berührt, weil sie in einer
  anderen Zone liegt. Für eine einzelne Sandbox reicht `DELETE /v1/sandboxes/{id}/ports/{port}` über das Control Plane.
- **Public Suffix List.** Nicht Teil dieses Goals, weil die Aufnahme ein PR in einem fremden Repo ist (Gate `public_post`). Ohne sie
  kann eine Sandbox ein Cookie für `.sandboxhost.dev` setzen, das der Browser an jede andere Sandbox mitschickt; die Zahlung ist
  davon nicht betroffen, weil sie unter einer anderen Domain läuft. Steht als Vorschlag in
  `goals/_vorschlaege/sandbox-nacharbeit-2026-11-13-5.md`.
- **Kein Aufpreis.** Ein freigegebener Port kostet nichts extra, abgerechnet wird weiter nach Laufzeit (`docs/sandbox/plan.md`,
  `## Preis`); das Control Plane schreibt für `ports/expose` und `ports/{port}` keine Ledger-Zeile.
