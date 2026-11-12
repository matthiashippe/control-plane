# Sandbox Goal 02: Der Sandbox-Server steht

## Status
ACTIVE

## Active Objective
`srv1327036` (`72.62.51.224`) ist nach `docs/sandbox/plan.md` eingerichtet, mit einem idempotenten Skript im Repo, das der code-host
per SSH fährt: Docker mit gVisor, nftables nach `## Netz`, Caddy-Eingang als eigene Datei neben wa-staging, `sandboxd` mit Anlegen,
`exec`, Dateien, Ports, Stoppen, Löschen und Aufräumen nach `## Grenzen`, signiert nach `## Verbindung`, dazu die DNS-Einträge und das
Origin-CA-Zertifikat. Eine Messung gegen den Server zeigt jede Sperre aus `## Schritte` (sandbox 02) mit Gegenprobe, und wa-staging
läuft unverändert weiter (`ROADMAP.md`, sandbox 02; `docs/kette.md`, sandbox 02).
MVP: Funktion, weil sandbox 03 die API nur an einen Dienst weiterreichen und abrechnen kann, der wirklich Sandboxes anlegt, und fremder
Code erst dann bei uns laufen darf, wenn die Isolation gegen den Zahlungsserver gemessen ist.

## Voraussetzungen
- sandbox Goal 01 DONE

## Kontext für den Maker
- Maßgeblich sind `docs/sandbox/plan.md` (Isolation, Netz, Grenzen, Verbindung, Schritte) und `docs/sandbox/server.md` (Stand des
  Servers und die fünf Regeln „Nebeneinander mit wa-staging“, wörtlich von Matthias). Was dieses Goal anders entscheidet, steht mit Grund
  in `goals/sandbox/ANNAHMEN.md` und in der Datei des Plans, nie nur im Code.
- Ort im Repo (Entscheidung Tech Lead, 11.11.2026): alles unter `ops/sandbox/` (Einrichtung, `sandboxd`, Caddy-Datei, nftables, Messung),
  Tests unter `test/`. Nicht unter `src/`, weil `src/` der Laufzeitpfad des Zahlungsdienstes ist und jeder Merge dort auf den Server des
  Kunden ausrollt (`LOOP.md`, Release); nicht unter `deploy/`, weil das der Betrieb des Zahlungsservers ist und dort fast alles auf der
  Deny List steht. Dieses Goal rollt also nichts aus. Den Client im Control Plane baut sandbox 03 gegen genau das Signaturformat, das
  `sandboxd` hier prüft; halte es in `docs/sandbox/plan.md`, `## Verbindung`, Byte für Byte fest (welche Felder in welcher Reihenfolge,
  welches Trennzeichen, Kodierung der Signatur).
- `sandboxd` in Node 22 wie der Rest, ohne Build-Schritt auf dem Server, hört nur auf 127.0.0.1 (oder einem Unix-Socket) und spricht
  Docker mit `--runtime=runsc`. Es kennt die erlaubten öffentlichen Schlüssel aus einem Verzeichnis auf dem Server (etwa
  `/etc/sandboxd/keys/`). Den Schlüssel des Dienstes `cp` (`/data/sandbox-client.pub`) gibt es erst mit sandbox 03; hier trägt das
  Skript einen eigenen Messschlüssel ein: ein Ed25519-Paar auf dem code-host unter `~/.config/control-plane/sandboxd-probe.key`
  (0600, außerhalb des Repos), nur die öffentliche Hälfte geht auf den Server. Weil Caddy `ctl.sbx.postyourprice.com` nur für
  `76.13.144.207` öffnet, spricht die Messung `sandboxd` über SSH auf dem Loopback an, signiert auf dem code-host; der Weg über
  `ctl.sbx` bleibt dem Control Plane.
- Einrichtung `ops/sandbox/setup.sh <adresse>` vom code-host mit `~/.ssh/id_ed25519_cp_sandbox`: Ubuntu auf Stand mit
  `unattended-upgrades`, Docker und `runsc` (Plattform `systrap`), nftables mit der Tabelle `inet sandbox` und den Sperren aus `## Netz`
  (Kette `input` vor ufw, dazu die Weiterleitung), `sandbox.slice` nach `## Grenzen`, `sandboxd` als systemd-Unit in der Slice, die
  Caddy-Datei der Sandbox mit genau einer `import`-Zeile in der Caddyfile, `caddy validate` vor jedem Reload. `--check` ändert nichts
  und meldet, was ein Lauf ändern würde; nach einem echten Lauf meldet `--check` nichts mehr. Die nächtliche Prüfung fährt nur `--check`,
  nie die Einrichtung.
- DNS und Zertifikat setzt der code-host über die Cloudflare-API mit `CLOUDFLARE_HTC_API_TOKEN` aus `~/brain/connectors/secrets.env`
  (nur lesen, nie ausgeben; der Token sieht die Zone `postyourprice.com`, geprüft am 11.11.2026 mit `GET /client/v4/zones?name=`):
  `*.postyourprice.com` proxied auf `72.62.51.224`, `ctl.sbx.postyourprice.com` nur als A-Eintrag ohne Proxy und ohne AAAA (sonst
  verbindet der Zahlungsserver über IPv6 und Caddy lässt ihn nicht durch), dazu ein Origin-CA-Zertifikat für `*.postyourprice.com`
  unter `/etc/caddy/sbx/`. Der Token kommt nie auf den Sandbox-Server, Schlüssel und Zertifikat nie ins Repo. Bestehende Einträge der
  Zone ändert das Goal nicht. Reichen die Rechte des Tokens für DNS oder Origin CA nicht (Antwort der API), baut der Maker alles andere,
  committet, pusht und setzt das Goal auf `BLOCKED matthias` mit `Gate: security_settings` und den fertigen Klicks für einen Token mit
  genau diesen Rechten auf genau dieser Zone.
- Messung `ops/sandbox/probe.sh <adresse>` legt über `sandboxd` Sandboxes an, prüft je Sperre einmal aus der Sandbox und einmal als
  Gegenprobe, und räumt danach ab. Eine Sperre gilt nur, wenn die Gegenprobe zeigt, dass der Weg ohne die Sperre geht oder die Sperre
  gezählt hat (Zähler oder Logzeile `sbx-` der nftables-Regel steigt); ohne Gegenprobe ist ein „blockiert“ nicht von einem kaputten Test
  zu unterscheiden (`loop-constraints.md`, Grundregel 3). Je Sperre eine Zeile `PROBE <name> OK` oder `PROBE <name> FAIL <grund>`,
  zuletzt `SANDBOX PROBE OK left=0` (keine Sandbox der Messung übrig) oder `SANDBOX PROBE FAIL`. Die Namen:
  `host_file` (Kanarienzeile in einer Datei des Hosts, auch nicht über `/proc/1/root`), `payment_https` (`https://postyourprice.com/health`
  aus der Sandbox gibt 200, der erlaubte Weg), `payment_ssh` (`76.13.144.207` tcp/22), `payment_udp443`, `metadata` (`169.254.169.254`),
  `host_bridge`, `host_public` (`72.62.51.224`), `host_ipv6` (je 22, 80, 443 und 5432 des Hosts), `other_sandbox` (eine zweite Sandbox),
  `smtp` (ausgehend tcp/25), `memory` (ein Prozess über 512 MB stirbt mit OOM, der Host antwortet danach weiter auf SSH),
  `expose` (ein Port der Sandbox ist über `https://sbx-<id>-<port>.postyourprice.com` vom code-host erreichbar). Der Host und `sandboxd`
  verbinden sich nie selbst mit dem Zahlungsserver; Gegenproben gegen `76.13.144.207` laufen über die Zähler, nicht über einen Aufruf
  vom Host.
- Aus `goals/_vorschlaege/sandbox-kritik-2026-11-11-1.md` (Kritik zu sandbox 01): Der Speicher einer leeren Sandbox unter `runsc` wird
  gemessen (die Sentry läuft im Cgroup des Containers), die Zahl der Plätze in `sandbox.slice` richtet sich danach und steht in
  `docs/sandbox/plan.md`, `## Grenzen`; `ctl.sbx` bekommt nur einen A-Eintrag; die Zeile `Zugang:` in `docs/sandbox/server.md` nennt die
  gemessene Zahl der Root-Schlüssel statt „nur mit“, solange wa-staging dort Schlüssel hat.
- wa-staging: Regeln 1 bis 5 in `docs/sandbox/server.md` gelten wörtlich. Die Caddyfile bekommt nur die `import`-Zeile, ufw bleibt bei
  22, 80 und 443, kein Container veröffentlicht einen Port auf dem Host. Zieht wa-staging während des Goals aus (PRO-17959), gilt der
  Punkt zu wa-staging mit `ausgezogen` als erfüllt; das Abräumen der Reste von Wissensanker ist nicht Teil dieses Goals.
- Der Zahlungsserver `76.13.144.207` bleibt unberührt: kein SSH dorthin, kein Lesen, keine Änderung. Nur die Sandbox ruft dort
  `https://postyourprice.com/health` wie jeder Kunde.
- Prüfbefehle ohne Netz binden keinen festen Port (Tests mit Port 0), Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest
  im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen (er liest nur getrackte Dateien).
- Was danach schneller zu mehr zahlenden Automatons führt: sandbox 03 schaltet `POST /v1/sandboxes` frei und rechnet nach `## Preis` ab,
  sobald `cp` seinen Schlüssel erzeugt hat und das Skript ihn einträgt; der fremde Automaton, der am 10.11.2026 501 bekam, bekommt dann
  eine Sandbox.

## Done Condition
- [x] `sandboxd` legt an, führt aus, schreibt und liest Dateien, gibt einen Port frei, stoppt, löscht und räumt auf, nach
      `docs/sandbox/plan.md`; die Unit-Tests laufen gegen einen nachgebauten Docker-Aufruf ohne Netz und decken Signatur, Zeitstempel,
      Wiederholung, die Docker-Argumente der Grenzen und das Aufräumen mit gestellter Uhr ab.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in signature timestamp replay runsc memory pids no-new-privileges cap-drop dns bridge publish idle expired exec-timeout slots; do grep -qi -- "$w" test/sandboxd.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Das Signaturformat steht in `docs/sandbox/plan.md`, `## Verbindung`, so genau, dass sandbox 03 den Client ohne `sandboxd` zu lesen
      bauen kann, und ein Test prüft eine dort abgedruckte Beispielsignatur.
      Prüfung: `awk '/^## Verbindung/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -cE "X-CP-Timestamp|X-CP-Signature"` muss mindestens 2 ausgeben.
      Prüfung: `grep -c "plan.md" test/sandboxd.test.ts` muss mindestens 1 ausgeben.
- [x] `ops/sandbox/setup.sh` ist idempotent: Der Selbsttest ohne Netz zeigt, dass `--check` eine gepflanzte Abweichung meldet und einen
      sauberen Stand nicht, und am Server meldet `--check` nach der Einrichtung nichts mehr.
      Prüfung: `bash ops/sandbox/setup.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `SETUP SELFTEST OK` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224 | tail -1` muss `SETUP CHECK OK changed=0` ausgeben.
- [x] Die Messung zeigt jede Sperre aus `docs/sandbox/plan.md`, `## Schritte` (sandbox 02), mit Gegenprobe, und lässt keine Sandbox
      zurück.
      Prüfung (Netz): `o=$(mktemp) && bash ops/sandbox/probe.sh 72.62.51.224 >"$o"; for p in host_file payment_https payment_ssh payment_udp443 metadata host_bridge host_public host_ipv6 other_sandbox smtp memory expose; do grep -q "^PROBE $p OK" "$o" || echo "fehlt $p"; done; tail -1 "$o"` muss genau `SANDBOX PROBE OK left=0` ausgeben.
      Prüfung: `bash ops/sandbox/probe.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `PROBE SELFTEST OK` ausgeben (eine Sperre ohne steigende Gegenprobe wird `FAIL`, ein fehlender Probe-Name wird `FAIL`).
- [x] DNS und Eingang stehen nach `## Netz` und `## Verbindung`: `ctl.sbx` nur über IPv4 und für den code-host gesperrt, ein unbekannter
      Name `sbx-…` über den Cloudflare-Proxy mit 404, und die Hauptseite ist unverändert.
      Prüfung (Netz): `dig +short A ctl.sbx.postyourprice.com` muss genau `72.62.51.224` ausgeben, `dig +short AAAA ctl.sbx.postyourprice.com` nichts.
      Prüfung (Netz): `curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://ctl.sbx.postyourprice.com/` muss `403` ausgeben.
      Prüfung (Netz): `curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://sbx-unknown0-80.postyourprice.com/` muss `404` ausgeben, und `dig +short A sbx-unknown0-80.postyourprice.com | grep -c 72.62.51.224` muss 0 ausgeben (Proxy).
      Prüfung (Netz): `dig +short A postyourprice.com` muss `76.13.144.207` ausgeben, und `bash ops/smoke.sh https://postyourprice.com` muss Exit-Code 0 haben.
- [x] Der Server ist nach Plan gehärtet und wa-staging läuft weiter: `sandboxd` nur auf dem Loopback, kein veröffentlichter Port eines
      Containers, SSH nur mit Schlüssel, Updates automatisch, ufw bei 22, 80 und 443, `caddy validate` grün.
      Prüfung (Netz): `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'ss -Hltnp | grep sandboxd | grep -vc "127.0.0.1"; docker ps --format "{{.Ports}}" | grep -c "0.0.0.0\|:::"; sshd -T | grep -c "^passwordauthentication no"; systemctl is-active unattended-upgrades sandboxd; ufw status | grep -cE "^(22|80|443)(/tcp)? +ALLOW"; caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo valid'` muss nacheinander `0`, `0`, `1`, `active`, `active`, eine Zahl von mindestens 3 und `valid` ausgeben.
      Prüfung (Netz): `ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'test -d /srv/wissensanker || { echo ausgezogen; exit 0; }; systemctl is-active wa-api wa-worker'` muss `ausgezogen` oder zweimal `active` ausgeben.
- [x] `docs/sandbox/server.md` nennt den gemessenen Stand nach der Einrichtung: Speicher einer leeren Sandbox unter `runsc` und die
      Zahl der Root-Schlüssel, und `docs/sandbox/plan.md`, `## Grenzen`, rechnet die Plätze mit dieser Zahl.
      Prüfung: `grep -cE "^Leere Sandbox: [0-9]+ MB" docs/sandbox/server.md` muss 1 ausgeben.
      Prüfung (Netz): `n=$(ssh -i ~/.ssh/id_ed25519_cp_sandbox -o BatchMode=yes -o IdentitiesOnly=yes root@72.62.51.224 'grep -cvE "^[[:space:]]*(#|$)" /root/.ssh/authorized_keys'); grep -cE "^Zugang: .*\b${n:?} Schlüssel" docs/sandbox/server.md` muss 1 ausgeben.
      Prüfung: `awk '/^## Grenzen/{f=1;next} /^## /{f=0} f' docs/sandbox/plan.md | grep -c "Leere Sandbox"` muss mindestens 1 ausgeben.
- [x] Das Goal ändert weder den Zahlungsdienst noch seinen Betrieb und bringt keinen Schlüssel ins Repo.
      Prüfung: `git diff --name-only origin/dev...HEAD -- src deploy harness | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem)$|sandboxd-probe|origin-ca"` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jede neue Selftest-Zeile war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/` mit dem Befehl, aus dem sie stammt; keine Adresse und kein Name eines Kunden.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `src/**`, `harness/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`
- der Zahlungsserver `76.13.144.207`: kein SSH, kein Lesen, keine Änderung
- auf `srv1327036`: Units `wa-api` und `wa-worker`, Nutzer `wa` und `wa-deploy`, `/srv/wissensanker`, `/etc/wissensanker`, Postgres,
  der Caddy-Block von wa-staging, die Regeln von ufw
- bestehende DNS-Einträge der Zone `postyourprice.com`; der Cloudflare-Token auf dem Sandbox-Server, in Ausgabe, Log oder Kommentar
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-12 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6, 7, 8, 9 gebaut: `sandboxd` mit 34 Unit-Tests gegen nachgebauten Docker-Aufruf, Signaturformat mit Beispiel in `## Verbindung`, `ops/sandbox/setup.sh` und `probe.sh` mit Selbsttest, `srv1327036` eingerichtet (Docker, `runsc`, `inet sandbox`, `sandbox.slice`, `sandboxd`, Caddy-Import), DNS `*.postyourprice.com` proxied und `ctl.sbx` nur A, 9 Plätze nach gemessener leerer Sandbox (9 MB); Abweichungen vom Plan in `ANNAHMEN.md` (Zertifikat `tls internal`, weil der Token keine Origin CA darf, Peer-Sperre in `prerouting`). Rot gesehen: 51 Brüche in `sandboxd.mjs` machten jeden der 34 Tests mindestens einmal rot, `setup.sh --selftest` rot mit abgeschaltetem Vergleich, `probe.sh --selftest` rot ohne Zählerprüfung, ohne Namensprüfung und ohne Beispiel im Plan, `--check` am Server meldete zweimal eine echte Abweichung (`sandbox.nft`, `sandboxd.service`), der erste Messlauf meldete `other_sandbox FAIL counter-proof did not rise (0 -> 0)`. Prüfbefehle: P1 vitest 34 passed Exit 0, Wortliste ohne Ausgabe; P2 6 und 5; P3 `SETUP SELFTEST OK` Exit 0, `SETUP CHECK OK changed=0`; P4 keine fehlende Sperre, `SANDBOX PROBE OK left=0`, `PROBE SELFTEST OK` Exit 0; P5 `72.62.51.224`, AAAA leer, 403, 404, 0, `76.13.144.207`, smoke Exit 0; P6 0, 0, 1, active, active, 3, valid und active, active; P7 1, 1, 1; P8 0 und 0; P9 check grün in 204 s.

## Blockers
