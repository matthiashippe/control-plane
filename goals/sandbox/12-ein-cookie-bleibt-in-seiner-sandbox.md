# Sandbox Goal 12: Ein Cookie bleibt in seiner Sandbox

## Status
ACTIVE

## Active Objective
Ist: Ein freigegebener Port einer Sandbox antwortet unter `https://sbx-<id>-<port>.sandboxhost.de` (sandbox 07). `sandboxhost.de`
steht nicht auf der Public Suffix List, und der PR dorthin geht nicht raus (sandbox 11, `BLOCKED fachlich`, Entscheidung Matthias
18.11.2026: nichts geht dafür unter seinem GitHub-Konto raus). Der Proxy von `sandboxd` (`handleProxy` in `ops/sandbox/sandboxd.mjs`)
reicht die Header der Antwort bis auf die Hop-Header unverändert durch (`stripHop(ur.headers)`), also kommt
`Set-Cookie: sid=1; Domain=sandboxhost.de` so beim Browser an, und der Browser schickt dieses Cookie an jede andere Sandbox unter
`sandboxhost.de` mit. Der Dienst eines Kunden kann damit die Sitzung im Dienst eines anderen Kunden überschreiben oder unterschieben
(`goals/sandbox/ANNAHMEN.md`, `## Goal 07`, Absatz „Public Suffix List“).
Soll: Der Proxy von `sandboxd` entfernt das Attribut `Domain` aus jedem `Set-Cookie`, das ein Dienst einer Sandbox sendet, in jeder
Schreibweise (`Domain=sandboxhost.de`, `domain=.SANDBOXHOST.DE`, mit und ohne weitere Attribute, mit Leerzeichen um `=`), sodass jedes
Cookie nur für den eigenen Hostnamen gilt. Name, Wert, alle anderen Attribute, alle anderen Header, Status und Body bleiben
unverändert. Belegt mit einem Test gegen einen nachgebauten Dienst (rot vor dem Fix) und einmal live: `ops/sandbox/probe.sh` meldet
vor dem Rollout `PROBE cookie_domain FAIL` und danach `PROBE cookie_domain OK`.
Widerlegt, wenn die neue Prüfung `cookie_domain` in `ops/sandbox/probe.sh` vor dem Rollout schon `PROBE cookie_domain OK` meldet, also
ein Cookie mit `Domain=sandboxhost.de` schon heute ohne `Domain` beim Client ankommt; dann ist nichts zu bauen, das Goal geht mit
dieser Messung auf `BLOCKED fachlich`.
MVP: Funktion, weil Isolation zwischen Kunden keine Schönheit ist (`LOOP.md`, Traction zuerst): Ein Automaton, der seinen Dienst aus
sandbox 08 unter `sandboxhost.de` anbietet, bleibt nur bei uns, wenn der Dienst eines anderen Kunden seinen Nutzern keine Cookies
unterschieben kann.

## Voraussetzungen
- sandbox Goal 07 DONE

## Kontext für den Maker
- Ziel: Der Dienst eines Kunden kann kein Cookie setzen, das der Browser an die Sandbox eines anderen Kunden schickt.
- Herkunft: Zeile sandbox in `ROADMAP.md`, Glied 12. Ersetzt den Weg über die Public Suffix List aus sandbox 11; die Vorschläge
  `goals/_vorschlaege/sandbox-kritik-2026-11-16-4.md` und `goals/_vorschlaege/sandbox-kritik-2026-11-16-5.md` sind damit
  gegenstandslos und tragen schon `Übernommen:`, dieses Goal ändert sie nicht. Kein Human Gate.
- Ort des Fixes ist `sandboxd`, nicht `ops/sandbox/sandbox.caddy`: `handleProxy` hat die Header der Antwort schon als Objekt in der
  Hand (`ur.headers["set-cookie"]` ist bei Node immer ein Array), der Test läuft mit vitest gegen `createSandboxd` und einen
  nachgebauten Dienst ohne Caddy, und der Block `*.sandboxhost.de` in `sandbox.caddy` bleibt Byte für Byte. Diese Entscheidung steht
  mit Grund unter `## Goal 12` in `goals/sandbox/ANNAHMEN.md`.
- Namen im Code englisch: eine exportierte reine Funktion `stripCookieDomain(value)` in `ops/sandbox/sandboxd.mjs`, die einen
  `Set-Cookie`-Wert nimmt und ihn ohne jedes Attribut `Domain` zurückgibt. Zerlegt wird an `;`. Das erste Stück (Name und Wert) bleibt
  immer unverändert, auch wenn der Wert selbst `domain=` enthält (`v=domain=sandboxhost.de; Path=/` bleibt gleich). Von den übrigen
  Stücken fällt jedes weg, dessen Name ohne Rücksicht auf Groß- und Kleinschreibung und nach Entfernen von Leerzeichen `domain` ist,
  mit oder ohne `=` und Wert; alle anderen Stücke bleiben in ihrer Reihenfolge und Schreibweise. Ein Wert ohne Attribut `Domain`
  kommt Byte für Byte zurück. `handleProxy` wendet sie auf jeden Eintrag von `set-cookie` an, bevor es `res.writeHead` ruft; sonst
  ändert sich an `handleProxy` nichts. `Set-Cookie2` ist veraltet und kein Browser liest es: nicht behandelt, Annahme unten.
- Test `test/sandboxd-cookie.test.ts` (vitest, Muster wie `expose and proxy` in `test/sandboxd.test.ts`: nachgebauter Dienst und
  Proxy je mit `listen(0, "127.0.0.1")`, `createSandboxd` mit `run`, das für `docker inspect` `127.0.0.1` liefert, Domain
  `sandboxhost.de`). Fälle:
  1. Der Dienst sendet drei `Set-Cookie`: `sbxa=1; Domain=sandboxhost.de; Path=/; HttpOnly; Max-Age=60`,
     `sbxb=2; domain=.SANDBOXHOST.DE` und `sbxc=3; Path=/; Secure`, dazu einen Header `x-up: 1`, Status 201 und einen Body. Beim
     Client kommen genau drei `set-cookie` an: `sbxa=1; Path=/; HttpOnly; Max-Age=60`, `sbxb=2` und `sbxc=3; Path=/; Secure` (das
     dritte Byte für Byte), keiner passt auf `/;\s*domain\s*(=|;|$)/i`, `x-up`, Status und Body sind unverändert.
  2. Ein einzelnes `Set-Cookie` mit `Domain` in der Mitte und Leerzeichen (`a=1;  Domain = sandboxhost.de ; Path=/`) kommt als
     `a=1; Path=/` an.
  3. `v=domain=sandboxhost.de; Path=/` kommt Byte für Byte an.
  4. `stripCookieDomain` direkt: ein Attribut `Domain` am Ende, eines ohne `=`, eines mit fremder Domain, und ein Wert ohne `Domain`
     unverändert.
  Rot vor dem Fix, weil `stripCookieDomain` fehlt und der Proxy `Domain` durchreicht; die Zeile im Progress Log nennt, womit (etwa
  der Test gegen `ops/sandbox/sandboxd.mjs` von `origin/dev`).
- Live-Prüfung in `ops/sandbox/probe.sh`: ein neuer Name `cookie_domain` in `NAMES`, Art `allow`. In der Sandbox `b`, die schon für
  `expose` läuft, startet ein kleiner Dienst auf Port 8081 (`python3` mit `http.server.BaseHTTPRequestHandler`), der genau die drei
  Cookies aus Fall 1 sendet; `ports/expose` für 8081, dann `curl -s -D - -o /dev/null --max-time 15 "$url/"` vom code-host, mit
  denselben Wiederholungen wie `expose`. `RAW cookie_domain allow 1`, wenn alle drei Cookies `sbxa`, `sbxb` und `sbxc` ankommen, keiner
  von ihnen ein Attribut `Domain` trägt und `sbxc` Byte für Byte gleich ist; sonst `allow 0`, und `evaluate` druckt dann
  `PROBE cookie_domain FAIL not reached`. Cookies, die Cloudflare selbst setzt, zählen nicht mit, gezählt werden nur die drei Namen.
  `selftest` bekommt den Fall, in dem `cookie_domain` mit `allow 0` kommt und `FAIL` ergibt, und `good` liefert `allow 1` dafür.
  Die Sandboxes räumt `cleanup` wie bisher ab, `LEFT 0` bleibt die Bedingung.
- Reihenfolge am Sandbox-Server `72.62.51.224`, nur über die Werkzeuge in `ops/sandbox/` vom code-host, nie von Hand:
  1. `origin/dev` in den Goal-Branch mergen, damit `setup.sh` keinen älteren Stand einer anderen Datei ausrollt.
  2. Vorher: `bash ops/sandbox/probe.sh 72.62.51.224` mit dem neuen `probe.sh` und dem alten `sandboxd` auf dem Server, die Zeile
     `PROBE cookie_domain …` mit Uhrzeit nach `docs/sandbox/ports.md` (unten). Meldet sie `OK`, ist das Goal widerlegt (oben).
  3. `bash ops/sandbox/setup.sh --foreign-sandboxes 72.62.51.224` (nur lesen) und `bash ops/sandbox/setup.sh --check 72.62.51.224`:
     Die einzige Zeile `CHANGE` darf `sandboxd.mjs` betreffen. Steht eine andere da, nicht ausrollen, sondern den Grund klären; ein
     Stand, der nicht von diesem Goal kommt, wird nicht mit ausgerollt.
  4. `bash ops/sandbox/setup.sh 72.62.51.224` rollt `sandboxd.mjs` aus und startet `sandboxd` neu (laufende Sandboxes laufen als
     Container weiter, nur der Proxy antwortet für Sekunden nicht). Danach meldet `--check` keine Zeile `CHANGE`.
  5. Nachher: `bash ops/sandbox/probe.sh 72.62.51.224`, die Zeile `PROBE cookie_domain OK` mit Uhrzeit nach `docs/sandbox/ports.md`.
  Endet das Goal ohne PASS (`BLOCKED`), rollt der Maker im selben Lauf mit `setup.sh` aus einem Worktree von `origin/dev` den alten
  Stand zurück, bis `--check` von `origin/dev` keine Zeile `CHANGE` meldet, und schreibt das ins Progress Log.
- `docs/sandbox/ports.md` bekommt einen Abschnitt `## Cookies` (Deutsch, für Matthias lesbar): was entfernt wird und wo (`sandboxd`,
  `Set-Cookie`, Attribut `Domain`), was es nicht abfängt (ein Cookie, das JavaScript im Browser mit `document.cookie` und
  `domain=sandboxhost.de` setzt, geht am Proxy vorbei; ein Dienst schützt seine eigenen Cookies dagegen mit dem Präfix `__Host-`),
  die Live-Prüfung `cookie_domain` in `probe.sh` und zwei Zeilen ab Spalte 0:
  `Vorher: PROBE cookie_domain FAIL <Grund>, <JJJJ-MM-TT HH:MM> UTC` und `Nachher: PROBE cookie_domain OK, <JJJJ-MM-TT HH:MM> UTC`.
  Keine Sandbox-ID, keine Adresse.
- `goals/sandbox/ANNAHMEN.md` bekommt `## Goal 12 (<Datum>, Engineer CP)` mit den Entscheidungen dieses Goals, je mit Grund: Ort
  `sandboxd` statt `sandbox.caddy`; `document.cookie` bleibt offen; `Set-Cookie2` nicht behandelt; auch ein `Domain` auf den eigenen
  Hostnamen fällt weg (ohne `Domain` gilt das Cookie genau für diesen Hostnamen, Unterdomains eines Namens `sbx-<id>-<port>` leitet
  `parseProxyHost` nie weiter); Zahl der fremden laufenden Sandboxes vor dem Neustart aus `--foreign-sandboxes` (nur die Zahl).
- Zugang für die Zeilen mit `(Netz)`: `set -a; . ~/.config/control-plane/loop.env; set +a`, Werte nie ausgeben. Der Zahlungsserver
  wird nicht angefasst; `setup.sh --foreign-sandboxes` liest dort nur. Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn
  im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund mit eigenem Timeout, neue Dateien vor dem lokalen `check`
  stagen.
- Was danach schneller zu mehr zahlenden Automatons führt: Mit sandbox 08 betreibt ein fremder Automaton seinen Dienst bei uns; dieses
  Goal nimmt ohne fremdes Repo und ohne Karte an Matthias den Grund weg, aus dem ein vorsichtiger Betreiber das unter einer geteilten
  Domain nicht tun würde.
- Annahme (Tech Lead, 19.11.2026): Das Goal rollt vor dem Merge auf den Sandbox-Server aus, wie sandbox 07 am 15.11.2026
  (`goals/sandbox/ANNAHMEN.md`, `## Goal 07`, „Umstellung vor dem Merge“), weil die Live-Prüfung nur so vor PASS laufen kann und der
  Sandbox-Server nicht über `deploy.yml` ausrollt. Bis zum Merge meldet ein `--check` von `dev` die eine Abweichung `sandboxd.mjs`;
  das ist erwartet und endet mit dem Merge oder dem Rückbau.
- Annahme (Tech Lead, 19.11.2026): `document.cookie` bleibt offen, weil sich JavaScript im Browser nur mit einer eigenen
  registrierbaren Domain je Sandbox oder einem Eintrag auf der Public Suffix List trennen lässt; das erste ist nicht machbar, das
  zweite hat Matthias am 18.11.2026 abgelehnt. Der Proxy schließt den Weg über Antworten, den jeder serverseitige Dienst benutzt.

## Done Condition
- [x] Die Ausgangslage ist live gemessen: Vor dem Rollout meldet `probe.sh` für `cookie_domain` FAIL, nach dem Rollout OK, beide Zeilen
      mit Uhrzeit unter `## Cookies` in `docs/sandbox/ports.md`.
      Prüfung: `awk '/^## Cookies/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -cE '^(Vorher: PROBE cookie_domain FAIL .+|Nachher: PROBE cookie_domain OK), 20[0-9]{2}-[0-9]{2}-[0-9]{2} [0-9]{2}:[0-9]{2} UTC$'` muss 2 ausgeben.
      Prüfung: `awk '/^## Cookies/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -cE 'sbx-[a-z0-9]{10}-|0x[0-9a-fA-F]{40}|([0-9]{1,3}\.){3}[0-9]{1,3}'` muss 0 ausgeben.
- [x] `sandboxd` entfernt `Domain` aus jedem `Set-Cookie` eines Dienstes und lässt alles andere unverändert; der Test gegen einen
      nachgebauten Dienst war vor dem Fix rot.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd-cookie.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in stripCookieDomain 'Domain=sandboxhost.de' 'domain=.SANDBOXHOST.DE' 'sbxc=3; Path=/; Secure' 'v=domain=sandboxhost.de; Path=/' 'Max-Age=60' x-up 'listen(0'; do grep -qF -- "$w" test/sandboxd-cookie.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `grep -cE 'listen\([1-9]|port: *[1-9]' test/sandboxd-cookie.test.ts` muss 0 ausgeben.
      Prüfung: `grep -c 'stripCookieDomain' ops/sandbox/sandboxd.mjs` muss mindestens 2 ausgeben.
      Prüfung: `git diff --quiet $(git merge-base origin/dev HEAD) HEAD -- ops/sandbox/sandbox.caddy` muss Exit-Code 0 haben.
- [x] `probe.sh` prüft live, dass ein Cookie mit `Domain` ohne `Domain` beim Client ankommt, der Selbsttest zeigt beide Richtungen, und
      der Sandbox-Server läuft danach ohne Abweichung mit diesem Stand.
      Prüfung: `bash ops/sandbox/probe.sh --selftest | tail -1` muss `PROBE SELFTEST OK` ausgeben.
      Prüfung: `grep -c 'cookie_domain' ops/sandbox/probe.sh` muss mindestens 3 ausgeben.
      Prüfung: `grep -c 'RAW cookie_domain allow 0' ops/sandbox/probe.sh` muss mindestens 1 ausgeben.
      Prüfung (Netz): `bash ops/sandbox/setup.sh --check 72.62.51.224 | tail -1` muss `SETUP CHECK OK changed=0` ausgeben.
      Prüfung (Netz): `bash ops/sandbox/probe.sh 72.62.51.224 | grep -cxE 'PROBE cookie_domain OK|SANDBOX PROBE OK left=0'` muss 2 ausgeben.
- [x] Doku und Annahmen nennen den Schutz, seine Grenze und die Entscheidungen dieses Goals.
      Prüfung: `for w in Set-Cookie Domain sandboxd document.cookie __Host- cookie_domain; do awk '/^## Cookies/{f=1;next} /^## /{f=0} f' docs/sandbox/ports.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `for w in sandbox.caddy document.cookie Set-Cookie2 parseProxyHost foreign-sandboxes; do awk '/^## Goal 12/{f=1;next} /^## /{f=0} f' goals/sandbox/ANNAHMEN.md | grep -qF -- "$w" || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] Das Goal ändert nur seine eigenen Dateien, und seine Texte sind ohne Gedankenstrich.
      Prüfung: `git diff --name-only $(git merge-base origin/dev HEAD) HEAD | grep -vcE '^(ops/sandbox/sandboxd\.mjs|ops/sandbox/probe\.sh|test/sandboxd-cookie\.test\.ts|docs/sandbox/ports\.md|goals/sandbox/.+)$'` muss 0 ausgeben.
      Prüfung: `cat docs/sandbox/ports.md goals/sandbox/ANNAHMEN.md ops/sandbox/sandboxd.mjs ops/sandbox/probe.sh test/sandboxd-cookie.test.ts | grep -c $'\xe2\x80\x93\|\xe2\x80\x94'` muss 0 ausgeben.
- [x] `check` ist grün.
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Der neue Test war vor dem Fix rot; die Zeile im Progress Log nennt, womit.
- [ ] Name, Wert und jedes andere Attribut eines Cookies kommen unverändert an, ebenso jeder andere Header, Status und Body.
- [ ] Der Sandbox-Server bekam nur `sandboxd.mjs` neu, und `--check` meldet danach nichts; endet das Goal ohne PASS, steht dort wieder
      der Stand von `dev`.
- [ ] Keine Sandbox-ID, keine Adresse, kein Schlüssel in Doku, Annahmen, Progress Log oder Ausgaben im Repo.
- [ ] Code, Kommentare und Testnamen Englisch, Goal-Datei und Doku Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ROADMAP.md`, `ops/prompts/**`, `.github/**`, `scripts/**`, `deploy/**`,
  `harness/**`, `src/**`, `.env*`, `*.key`, `*.pem`, `*.crt`
- unter `ops/sandbox/` alles außer `sandboxd.mjs` und `probe.sh`, vor allem `sandbox.caddy`, `sandboxd.service`, `setup.sh`,
  `cloudflare.py`; `goals/_vorschlaege/**`
- der Sandbox-Server `72.62.51.224` nur über `ops/sandbox/setup.sh` und `ops/sandbox/probe.sh` vom code-host, kein Befehl von Hand,
  wa-staging unberührt; der Zahlungsserver `76.13.144.207` nur lesen über `setup.sh --foreign-sandboxes`, kein Rollout, kein Neustart
- DNS und Cloudflare: keine Änderung, kein `cloudflare.py` mit schreibendem Unterkommando
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung (`loop-constraints.md`, Grundregeln 9 und 10); nichts in einem fremden Repo
- Schlüssel und Tokens nie ausgeben, in Log, Kommentar, Verdict oder Datei schreiben
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 3
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-19 Zyklus 1: Punkte 1, 2, 3, 4, 5, 6 gebaut, `stripCookieDomain` in sandboxd entfernt Domain aus jedem Set-Cookie, probe.sh prüft cookie_domain live, sandboxd.mjs mit setup.sh auf den Sandbox-Server ausgerollt; der neue Test war vorher rot gegen sandboxd.mjs von origin/dev (4 von 6 Fällen: beide Proxy-Fälle mit Domain, beide Fälle von stripCookieDomain, die fehlte), live vorher FAIL mit allen drei Cookies samt Domain beim Client. Prüfbefehle: Punkt 1 2, 0; Punkt 2 Exit 0, Exit 0, nichts fehlt, 0, 2, Exit 0; Punkt 3 PROBE SELFTEST OK, 8, 1, SETUP CHECK OK changed=0, 2; Punkt 4 nichts fehlt, nichts fehlt; Punkt 5 0, 0; Punkt 6 check Exit 0 (grün in 267 s, 2419 Tests).
- 2026-11-19 Zyklus 2: Abschluss gemeldet, Punkte 1, 2, 3, 4, 5, 6; origin/dev brachte nichts Neues, jeder Prüfbefehl erneut am Kopf gelaufen. Prüfbefehle: Punkt 1 2, 0; Punkt 2 Exit 0, Exit 0, nichts fehlt, 0, 2, Exit 0; Punkt 3 PROBE SELFTEST OK, 8, 1, SETUP CHECK OK changed=0, 2 (PROBE cookie_domain OK, SANDBOX PROBE OK left=0); Punkt 4 nichts fehlt, nichts fehlt; Punkt 5 0, 0; Punkt 6 check Exit 0 (grün in 205 s).

## Blockers
