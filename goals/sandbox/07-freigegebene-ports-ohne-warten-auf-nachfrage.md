# Sandbox Goal 07: Freigegebene Ports unter einer eigenen Domain, ohne Warten auf Nachfrage

## Status
BLOCKED matthias

## Active Objective
Ein fremder Automaton gibt einen Port seiner Sandbox mit `expose_port` frei und bekommt eine öffentliche Adresse
`https://sbx-<id>-<port>.<domain>` unter einer eigenen registrierbaren Domain, die nicht `postyourprice.com` ist. Das ist der Bau von
sandbox 06, dessen Goal-Datei den Kauf an mindestens eine fremde Adresse band und mit 0 auf `BLOCKED fachlich` ging; der Fast track in
`ROADMAP.md` (Matthias 13.11.2026) verlangt die Ports ohne Warten auf Nachfrage. Zuerst übernimmt das Goal `ops/ports-demand.sh` aus
Commit 0ce27f0 und schreibt die Zahl der fremden Adressen, die seit dem Rollout von sandbox 03 `ports/expose` aufriefen und 409
`port_exposure_unavailable` bekamen, als Ausgangslage in `docs/sandbox/ports.md`, n ab 0; eine 0 widerlegt das Goal nicht und hält den
Kauf nicht auf. Dann kauft Matthias am Human Gate `server_kauf` die Domain (Name und Preis schlägt das Goal vor) samt Cloudflare-Token
nur für ihre Zone. Danach liegt `*.<domain>` auf dem Sandbox-Server, die Zone steht auf SSL „Full (strict)“ mit
Origin-CA-Zertifikat statt `tls internal` in `ops/sandbox/sandbox.caddy`, das Control Plane reicht `ports/expose` und `ports/{port}` an
`sandboxd` weiter statt 409, und der Eintrag `*.postyourprice.com` ist gelöscht; die übrige Zone `postyourprice.com` bleibt
unverändert (`ROADMAP.md`, sandbox 07; übernimmt `goals/_vorschlaege/sandbox-kritik-2026-11-12-1.md`,
`goals/_vorschlaege/sandbox-kritik-2026-11-12-2.md` und `goals/_vorschlaege/sandbox-kritik-2026-11-13-2.md`).
MVP: Funktion, weil der Dienst eines Automatons erst mit einem freigegebenen Port von außen erreichbar ist; ohne Port läuft sein Code
bei uns, aber niemand kann ihn aufrufen, und das Abschlusskriterium in `ROADMAP.md` (ein fremder Automaton betreibt seinen Dienst bei
uns) bleibt unerreichbar, ebenso sandbox 08 (der ganze Automaton in einer Sandbox, der ohne freigegebenen Port nichts verkaufen kann).
Die eigene Domain hält eine Phishing-Seite eines Kunden aus der Zone, über die jede bezahlte Anfrage läuft.

## Voraussetzungen
- sandbox Goal 05 DONE

## Kontext für den Maker
- Ziel: Ein fremder Automaton macht den Dienst in seiner Sandbox unter einer HTTPS-Adresse erreichbar, die er seinen Kunden nennen kann,
  und verdient damit Geld, von dem er Credits bei uns kauft. Was dem nicht dient, gehört nicht in dieses Goal.
- Maßgeblich sind `docs/sandbox/plan.md` (`## Netz`, `## Verbindung`, `## Preis`), `docs/sandbox/vertrag.md` (Zeilen zu
  `ports/expose` und `ports/{port}`: Antwort mit `port` und `public_url`), `goals/sandbox/ANNAHMEN.md` unter `## Goal 02`,
  `## Goal 02, Kritik` und `## Goal 03` (warum heute 409) und `docs/sandbox/server.md` (Regeln 1 bis 5 zu wa-staging, wörtlich). Was
  dieses Goal entscheidet oder misst, steht mit Grund unter `## Goal 07` in `goals/sandbox/ANNAHMEN.md`, nie nur im Code.
- Stand heute: `src/sandbox/service.ts` (`PORTS_UNAVAILABLE`, Funktion `ports`) antwortet nach der Prüfung des Besitzers mit 409 und
  ruft `sandboxd` nicht auf. `ops/sandbox/sandboxd.mjs` kann Ports schon (`expose`, `unexpose`, `publicUrl` aus `cfg.domain`, Proxy auf
  `SANDBOXD_PROXY_PORT` mit `parseProxyHost`), die Domain kommt aus `SANDBOXD_DOMAIN` in `ops/sandbox/sandboxd.service` mit dem
  Rückfall `postyourprice.com`. `ops/sandbox/sandbox.caddy` hat den Block `*.postyourprice.com` mit `tls internal`,
  `ops/sandbox/cloudflare.py` verwaltet `*.postyourprice.com` und `ctl.sbx.postyourprice.com` mit `CLOUDFLARE_HTC_API_TOKEN`, und
  `ops/sandbox/probe.sh` prüft `expose` über die `public_url`, die `sandboxd` liefert.
- Ausgangslage messen, bevor sich `src/` oder `ops/sandbox/` ändert. Das Werkzeug gibt es schon: `ops/ports-demand.sh` aus Commit
  0ce27f0 (Branch von sandbox 06, erreichbar von `dev`), mit `git show 0ce27f0:ops/ports-demand.sh > ops/ports-demand.sh` übernehmen,
  nicht neu bauen; sein Selftest war grün, und fünf Mutationen am Zähler machten ihn rot. Eine Änderung daran nur, wenn der Selftest am
  heutigen `dev` rot ist (etwa weil sich `ops/own-ips.sh` mit betrieb 03 änderte), mit Grund unter `## Goal 07` in
  `goals/sandbox/ANNAHMEN.md`. Es liest das Caddy-Zugriffslog samt rotierter Dateien über `ssh` vom code-host, nimmt eigene Adressen aus
  `ops/own-ips.txt` heraus, zählt Aufrufe `POST /v1/sandboxes/{id}/ports/expose` mit Status 409 zählt und je Lauf genau eine Zeile
  `PORTS DEMAND: <n> foreign addresses, <m> calls, since <JJJJ-MM-TT HH:MM:SS> UTC` druckt; Adressen verlassen die Pipeline nie.
  `--log <datei>` liest eine Datei statt des Servers (ohne Netz), `--selftest` beweist beide Richtungen mit gepflanzten Zeilen (eine
  fremde Adresse mit 409 zählt, eine eigene nicht, ein anderer Pfad nicht, ein anderer Status nicht, zwei Aufrufe derselben Adresse
  zählen als eine Adresse und zwei Aufrufe) und endet mit `PORTS DEMAND SELFTEST OK` (`loop-constraints.md`, Grundregel 3).
  Den Zeitpunkt „seit“ setzt `--since`; gemeint ist der Start des Rollouts des Merges von sandbox 03 (PR #36, Zeit aus
  `gh run list -R matthiashippe/control-plane --workflow deploy.yml`), reicht das Log nicht so weit zurück, die früheste Zeile des Logs.
  Ergebnis in `docs/sandbox/ports.md` unter `## Vorher` als Zeile
  `- fremde Adressen mit 409 auf ports/expose seit <JJJJ-MM-TT HH:MM:SS> UTC: <n> (Aufrufe: <m>)`, dazu der Befehl und die Uhrzeit
  der Messung. sandbox 06 maß am 13.11.2026 um 13:22 UTC seit 2026-11-12 18:12:46 UTC 0 fremde Adressen und 0 Aufrufe.
- Die Zahl ist eine Ausgangslage, kein Tor: Auch bei `n` gleich 0 geht es weiter mit dem Vorschlag der Domain und dem Human Gate, weil
  ein Automaton aus sandbox 08 ohne freigegebenen Port nichts verkaufen kann und Menschen ohne Wallet über konto bald Automatons bei uns
  starten (Fast track in `ROADMAP.md`). Eine 0 ist kein Grund für `BLOCKED fachlich`.
- Vorschlag der Domain in `docs/sandbox/ports.md` unter `## Domain`: ein Name, der ohne Vorwissen nach Sandbox oder Vorschau klingt und
  nicht nach der Zahlung (also nicht `postyourprice` mit anderer Endung), zwei Ausweichnamen, je mit Endung, Preis im Jahr in USD und
  einer Zeile, dass der Name frei ist (RDAP-Abfrage mit Uhrzeit, nur lesend). Empfehlung: Cloudflare Registrar im Konto, in dem die
  Zone `postyourprice.com` liegt, weil die Zone dann ohne Umzug der Nameserver dort steht und der Preis der Einkaufspreis ist; eine
  Endung mit HSTS-Preload (etwa `.dev`), weil dort jeder Aufruf nur über HTTPS geht. Zeilen ab Spalte 0: `Vorschlag: <name>`,
  `Preis: <USD> USD im Jahr`, `Frei: <Ergebnis der Abfrage>, <JJJJ-MM-TT HH:MM> UTC`.
- Ablauf: Punkte 1 und 2 messen und vorschlagen, dazu alles, was ohne den Namen geht (Punkte 4 und 6 mit der Domain an genau einer
  Stelle je Datei, Tests mit einer Dokumentationsdomain wie `example.dev`), committen, pushen, dann `## Status` auf `BLOCKED matthias` und
  unter `## Blockers` die Zeilen `Art: matthias`, `Gate: server_kauf`, `Aufgabe:`, `Worum:`, `Empfehlung:`. Die Empfehlung nennt den
  Kauf (Name, Preis, die Klicks im Registrar), dann einen API-Token mit genau den Rechten Zone DNS Edit, Zone SSL and Certificates Edit
  und Zone Settings Edit nur für die neue Zone, den Namen der Variablen, unter der Matthias ihn in `~/brain/connectors/secrets.env`
  einträgt, und was am Ende dastehen muss (Zone aktiv, Token eingetragen, Antwort auf der Karte mit dem gekauften Namen). Wenige Minuten
  für Matthias. Danach Punkte 3 bis 8. Der Token kommt nie auf den Sandbox-Server, Zertifikat und Schlüssel nie ins Repo, kein Wert in
  Kommentar, Log oder Verdict.
- Sandbox-Server `72.62.51.224` (`srv1327036`): Änderungen nur über `ops/sandbox/setup.sh 72.62.51.224` vom code-host, danach meldet
  `--check` nichts mehr; `caddy validate` vor jedem Reload, wie das Skript es heute tut. Der Block `*.<domain>` in
  `ops/sandbox/sandbox.caddy` liest Zertifikat und Schlüssel aus `/etc/caddy/sbx/` (Origin CA über `cloudflare.py origin-cert` mit dem
  neuen Token, 0600), der Block `*.postyourprice.com` fällt weg, `ctl.sbx.postyourprice.com` bleibt Byte für Byte. `SANDBOXD_DOMAIN`
  in `ops/sandbox/sandboxd.service` ist die neue Domain, und `sandboxd` startet nicht, wenn die Domain `postyourprice.com` ist oder auf
  `.postyourprice.com` endet (Fehler mit Exit ungleich 0); den Rückfall auf `postyourprice.com` gibt es nicht mehr.
- DNS über `ops/sandbox/cloudflare.py` vom code-host: `*.<domain>` als A-Eintrag mit Proxy auf `72.62.51.224`, SSL der neuen Zone auf
  „Full (strict)“, dazu eine Unterfunktion `ports-check`, die nur liest und genau `PORTS DNS OK` als letzte Zeile druckt, wenn Eintrag,
  Proxy und SSL-Modus stimmen. In der Zone `postyourprice.com` löscht das Goal genau den Eintrag `*.postyourprice.com`; alle anderen
  Einträge und der SSL-Modus der Zone bleiben. Belegt mit `cloudflare.py zone-digest postyourprice.com` (nur lesend: `sha256` über die
  sortierten Einträge außer `*.postyourprice.com`, die ersten 12 Zeichen), vor dem Löschen in `docs/sandbox/ports.md` als Zeile
  `Zone vorher: <sha12>`, nachher gleich. Notschalter bei Missbrauch: den einen Eintrag `*.<domain>` löschen; die Zahlung ist davon
  nie berührt.
- Control Plane: `ports` in `src/sandbox/service.ts` reicht `POST /v1/sandboxes/{id}/ports/expose` und
  `DELETE /v1/sandboxes/{id}/ports/{port}` signiert an `sandboxd` weiter (Client in `src/sandbox/client.ts` wie bei `exec`), gibt
  `port` und `public_url` nach `docs/sandbox/vertrag.md` zurück und antwortet weiter 404 für eine fremde Sandbox. Eine `public_url`,
  deren Name `postyourprice.com` ist oder darauf endet, gibt das Control Plane nie weiter (501 `sandbox_server_unreachable` wie bei
  einem kaputten `sandboxd`), damit ein alter Stand des Servers keinen Dienst eines Kunden unter die Zone der Zahlung legt. Ein
  freigegebener Port kostet nichts extra, abgerechnet wird wie bisher nach der Laufzeit (`docs/sandbox/plan.md`, `## Preis`), also
  keine neue Ledger-Zeile. Unit-Test `test/sandbox-ports.test.ts` mit nachgebautem `sandboxd` ist vor dem Fix rot; der Test
  „port_exposure_unavailable“ in `test/sandbox-api.test.ts` wird durch die neue Erwartung ersetzt, nicht gelöscht.
- Harness: `harness/e2e/sandbox-walk.mjs` erwartet von `expose_port` heute 409; danach eine `public_url`
  `https://sbx-<id>-<port>.<domain>` mit der Domain des Nachbaus (`SANDBOXD_DOMAIN` in `harness/sandboxd/`, eine Dokumentationsdomain),
  das Werkzeug `remove_port` mit 2xx und danach 200 für den nächsten Aufruf desselben Clients. Die bestehenden Bedingungen der
  Schlusszeile von `harness/e2e/full.sh` bleiben unverändert. Der code-host hat kein Docker: Den Harness belegt der Job `e2e` des
  Goal-PR.
- Live-Prüfung nach dem Rollout: Die Prüfung `sandbox` in `ops/live.sh` gibt in ihrer eigenen Sandbox einen Port frei, startet dort
  einen kleinen Server mit einer Kanarienzeile, holt sie über die `public_url` (höchstens 60 s, durch Cloudflare und Caddy), gibt den
  Port wieder zurück und schreibt `port=<ok|…>` in die Ergebniszeile; `judge_sandbox` meldet einen Fehlschlag mit eigener Zeile
  `FAIL sandbox: exposed port …`, der Selftest beweist beide Richtungen. Bis zum Rollout zeigt das 409, danach den Weg des Kunden.
- Nicht Teil dieses Goals: die Aufnahme der Domain in die Public Suffix List (ein PR in einem fremden Repo, Gate `public_post`). Ohne sie
  kann eine Sandbox ein Cookie für die ganze Domain setzen, das eine andere Sandbox liest; der Maker schreibt das als Vorschlag mit
  Schwere und Empfehlung, und `ANNAHMEN.md` nennt es.
- Die Produktion ändert sich nur über den Merge und `deploy.yml`, der Zahlungsserver `76.13.144.207` wird nur gelesen (Caddy-Log). Kein
  Kauf, keine Aufladung, keine Wallet-Bewegung durch den Loop. Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH`
  (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen.
- Was danach schneller zu mehr zahlenden Automatons führt: Mit `exec` über zwei Minuten (sandbox 05) und freigegebenen Ports kann ein
  fremder Automaton seinen Dienst bei uns einrichten und anbieten; der nächste Schritt ist, ihm das zu sagen (kanal).

## Done Condition
- [x] Die Ausgangslage ist gemessen, bevor `src/` oder `ops/sandbox/` sich ändert: `ops/ports-demand.sh` aus Commit 0ce27f0 zählt
      fremde Adressen mit 409 auf `ports/expose` und ist in beide Richtungen bewiesen, und die Zahl seit dem Rollout von sandbox 03
      steht in `docs/sandbox/ports.md`, auch wenn sie 0 ist.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/ports-demand.sh --selftest` muss Exit-Code 0 haben und als letzte Zeile `PORTS DEMAND SELFTEST OK` ausgeben.
      Prüfung: `awk '/^## Vorher/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -cE "^- fremde Adressen mit 409 auf ports/expose seit 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2}:[0-9]{2} UTC: [0-9]+ \(Aufrufe: [0-9]+\)$"` muss 1 ausgeben.
      Prüfung: `diff <(git show 0ce27f0:ops/ports-demand.sh | sed -n '/^count_demand()/,/^}/p') <(sed -n '/^count_demand()/,/^}/p' ops/ports-demand.sh)` muss Exit-Code 0 haben und nichts ausgeben (der Zähler ist übernommen, nicht neu gebaut).
      Prüfung: `b=$(git merge-base origin/dev HEAD); d=$(git log --format=%H --diff-filter=A -1 -- docs/sandbox/ports.md); s=$(git log --format=%H --reverse "$b"..HEAD -- src ops/sandbox | head -1); [ -z "$s" ] || { [ "$d" != "$s" ] && git merge-base --is-ancestor "$d" "$s"; }` muss Exit-Code 0 haben.
- [x] Der Vorschlag der Domain steht mit Name, Preis und freier Verfügbarkeit in `docs/sandbox/ports.md`, und die Domain ist nicht die
      der Zahlung.
      Prüfung: `awk '/^## Domain/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -cE "^(Vorschlag: [a-z0-9-]+\.[a-z]{2,}|Preis: [0-9]+(\.[0-9]+)? USD im Jahr|Frei: .*, 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC)$"` muss 3 ausgeben.
      Prüfung: `awk '/^## Domain/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -ciE "^Vorschlag: .*postyourprice"` muss 0 ausgeben.
- [ ] Matthias hat die Domain am Human Gate `server_kauf` gekauft und den Token nur für ihre Zone eingetragen; die Doku nennt den
      gekauften Namen, und die neue Zone steht mit Proxy-Eintrag und „Full (strict)“.
      Prüfung: `awk '/^## Domain/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -cE "^Gekauft: [a-z0-9-]+\.[a-z]{2,}, 20[0-9]{2}-[0-9]{2}-[0-9]{2}$"` muss 1 ausgeben.
      Prüfung (Netz): `python3 ops/sandbox/cloudflare.py ports-check 72.62.51.224 | tail -1` muss `PORTS DNS OK` ausgeben.
- [ ] Der Sandbox-Server liefert Ports nur noch unter der neuen Domain aus, mit Origin-CA-Zertifikat statt `tls internal`, und
      `sandboxd` verweigert die Domain der Zahlung.
      Prüfung: `grep -c "tls internal" ops/sandbox/sandbox.caddy` muss 0 ausgeben, `grep -cE '^\*\.postyourprice\.com' ops/sandbox/sandbox.caddy` muss 0 ausgeben, und `grep -cxF 'ctl.sbx.postyourprice.com {' ops/sandbox/sandbox.caddy` muss 1 ausgeben.
      Prüfung: `grep -c "/etc/caddy/sbx/" ops/sandbox/sandbox.caddy` muss mindestens 1 ausgeben, und `grep -c "postyourprice" ops/sandbox/sandboxd.service` muss 0 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd.test.ts` muss Exit-Code 0 haben, und `grep -cE "postyourprice\.com" test/sandboxd.test.ts` mindestens 1 ausgeben (der Test, dass `sandboxd` diese Domain verweigert).
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224` muss Exit-Code 0 haben und keine Zeile `CHANGE` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/probe.sh 72.62.51.224 | grep -cE "^PROBE expose OK$|^SANDBOX PROBE OK left=0$"` muss 2 ausgeben.
- [x] Der Eintrag `*.postyourprice.com` ist gelöscht, und die übrige Zone `postyourprice.com` ist unverändert.
      Prüfung: `grep -cE "^Zone vorher: [0-9a-f]{12}$" docs/sandbox/ports.md` muss 1 ausgeben.
      Prüfung (Netz): `v=$(sed -nE 's/^Zone vorher: ([0-9a-f]{12})$/\1/p' docs/sandbox/ports.md); [ -n "$v" ] && [ "$(python3 ops/sandbox/cloudflare.py zone-digest postyourprice.com | tail -1)" = "$v" ]` muss Exit-Code 0 haben.
      Prüfung (Netz): `curl -s -o /dev/null -w '%{http_code}' --max-time 15 https://sbx-zz9-8080.postyourprice.com/; echo " $?"` muss `000 6` ausgeben (Name löst nicht mehr auf).
      Prüfung (Netz): `bash ops/smoke.sh https://postyourprice.com` muss Exit-Code 0 haben.
- [x] Das Control Plane reicht `ports/expose` und `ports/{port}` an `sandboxd` weiter statt 409, gibt nie eine `public_url` unter
      `postyourprice.com` heraus und bucht dafür nichts; der Test war vor dem Fix rot.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-ports.test.ts test/sandbox-api.test.ts test/sandbox-billing.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in public_url ports/expose DELETE postyourprice.com 404 ledger; do grep -qF -- "$w" test/sandbox-ports.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -c "port_exposure_unavailable" src/sandbox/service.ts` muss 0 ausgeben.
- [ ] Die unveränderte Runtime gibt im Harness einen Port frei und wieder zurück, und der Job `e2e` des Goal-PR ist grün.
      Prüfung: `grep -c "expected 409" harness/e2e/sandbox-walk.mjs` muss 0 ausgeben, und `for w in expose_port remove_port public_url; do grep -qF -- "$w" harness/e2e/sandbox-walk.mjs || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-walk.test.ts test/e2e-sandbox-gate.test.ts` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-07 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/sandbox-07 --state all --json number -q '.[0].number'); l=$(gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,link -q '.[] | select(.name=="e2e") | .link'); gh run view --job "${l##*/}" --log -R matthiashippe/control-plane | grep -cE "E2E OK .*sandbox=true.*long_exec=true"` muss mindestens 1 ausgeben.
- [x] Die Prüfung `sandbox` in `ops/live.sh` holt nach dem Rollout eine Kanarienzeile über einen freigegebenen Port und meldet einen
      Fehlschlag mit eigener Zeile.
      Prüfung: `for w in ports/expose public_url 'port=ok' 'FAIL sandbox: exposed port'; do grep -qF -- "$w" ops/live.sh || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest` muss Exit-Code 0 haben, und `PATH=/usr/bin:$PATH bash ops/live.sh --selftest | grep -c "exposed port"` mindestens 1 ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
- [x] Die Entscheidung (Domain, Registrar, Token, Notschalter, Public Suffix List) steht mit Grund in `goals/sandbox/ANNAHMEN.md`, und
      das Goal bringt keinen Schlüssel und kein Zertifikat ins Repo und ändert weder Runtime, Zahlung, Anmeldung noch Betrieb.
      Prüfung: `awk '/^## Goal 07/{f=1} f' goals/sandbox/ANNAHMEN.md | grep -ciE "notschalter|public suffix"` muss mindestens 2 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD -- harness/runtime src/payments src/auth deploy .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$|origin\.(pem|key)"` muss 0 ausgeben, und `git diff origin/dev...HEAD | grep -cE "BEGIN (CERTIFICATE|PRIVATE KEY)"` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei, jede neue Selftest-Zeile und jede neue Bedingung war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Jede Zahl in `docs/sandbox/ports.md` mit dem Befehl und der Uhrzeit, aus denen sie stammt; keine Adresse, kein Name und keine
      Sandbox-ID eines Kunden, kein Token.
- [ ] Die Schritte am Human Gate dauern für Matthias wenige Minuten und nennen Name, Preis, Rechte des Tokens und die Variable.
- [ ] Der Text, den das Modell eines Automatons bei einem freigegebenen Port liest, sagt in klaren Worten, unter welcher Adresse sein
      Dienst erreichbar ist.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`, `deploy/**`,
  `harness/runtime/**`, `src/payments/**`, `src/auth/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`,
  `*.pem`, `*.crt`
- der Zahlungsserver `76.13.144.207`: nur lesen nach `loop-constraints.md` (Produktion: nur lesen), kein Rollout, kein Neustart, keine
  Änderung an Datenbank, Volume, Compose oder `.env`
- `srv1327036`: nur über `ops/sandbox/setup.sh`; wa-staging nach `docs/sandbox/server.md`, Regeln 1 bis 5, unberührt
- Zone `postyourprice.com`: nur der eine Eintrag `*.postyourprice.com` wird gelöscht; `ctl.sbx.postyourprice.com`, alle anderen
  Einträge und der SSL-Modus der Zone bleiben
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregeln 9 und 10); der Kauf der Domain nur durch
  Matthias am Gate `server_kauf`
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-13 Zyklus 1: Punkte 1, 2, 5, 6, 8, 9 und 10 gebaut, 4 und 7 ohne Netz gebaut; Ausgangslage 0 fremde Adressen, Vorschlag sandboxhost.dev, Wildcard der Zahlungszone gelöscht, Ports an sandboxd, sandboxd und setup.sh nur mit eigener Domain und Origin-CA-Zertifikat, Walk und live.sh mit freigegebenem Port; Punkt 3 und die Netzprüfungen von 4 warten auf den Kauf am Gate server_kauf, Punkt 7 auf den Job e2e von PR #100. Rot vor dem Fix: ports-demand.sh mit status 410 im Zähler SELFTEST FAILED (7), cloudflare.py --selftest ohne Wildcard-Filter im Digest FAILED (1), test/sandboxd.test.ts 5 failed, test/sandbox-ports.test.ts 9 failed, test/sandbox-walk.test.ts 7 failed, live.sh --selftest LIVE SELFTEST FAIL (port_live fehlte), runtime-sandbox.sh --selftest 8 of 18 cases bis zum neuen Plant. Prüfbefehle: P1 SELFTEST OK, Vorher-Zeile 1, diff leer Exit 0, Reihenfolge Exit 0; P2 3 und 0; P3 Gekauft-Zeile fehlt, ports-check ohne Token nicht lauffähig; P4 0 0 1, 2 0, sandboxd.test.ts Exit 0 und 7, setup.sh --check und probe.sh nicht gefahren (Domain nicht gekauft); P5 1, Digest gleich 29c9eb2596f4 Exit 0, curl 000 6, smoke.sh Exit 0; P6 vitest Exit 0 (45 Tests), Wortschleife leer, 0; P7 0 und leer, vitest Exit 0, e2e läuft; P8 Wortschleife leer, live.sh --selftest Exit 0 und 10, vitest Exit 0; P9 2, 0, 0 und 0; P10 check Exit 0 (137 Dateien, 1647 Tests).

## Blockers
Art: matthias
Gate: server_kauf
Aufgabe: Die Domain sandboxhost.dev bei Cloudflare kaufen und einen API-Token nur für diese Zone anlegen und eintragen.
Worum: Freigegebene Ports von Kunden-Sandboxes brauchen eine eigene Domain, getrennt von postyourprice.com, über die jede Zahlung läuft; ohne Kauf bleibt ein Automaton ohne öffentliche Adresse für seinen Dienst.
Empfehlung: Im Cloudflare-Konto der Zone postyourprice.com unter Domain Registration, Register Domains den Namen sandboxhost.dev suchen und kaufen (12.20 USD im Jahr; ist er weg, runsandbox.dev oder sbxhost.dev). Dann unter My Profile, API Tokens, Create Token, Custom token: Rechte Zone DNS Edit, Zone SSL and Certificates Edit und Zone Zone Settings Edit, Zone Resources Include Specific zone sandboxhost.dev. Den Token als Zeile CLOUDFLARE_SBX_API_TOKEN=<token> in ~/brain/connectors/secrets.env eintragen. Am Ende steht die Zone sandboxhost.dev aktiv im Konto, der Token ist eingetragen, und auf der Karte steht der gekaufte Name. Dauer etwa 5 Minuten; DNS, Zertifikat und Server richtet danach der Loop ein.
