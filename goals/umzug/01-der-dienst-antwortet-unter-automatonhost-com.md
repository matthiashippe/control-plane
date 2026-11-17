# Umzug Goal 01: Der Dienst antwortet unter automatonhost.com

## Status
ACTIVE

## Active Objective
`automatonhost.com` ist ein Host des Dienstes mit gültigem Zertifikat, `www.automatonhost.com` leitet mit 308 auf den Apex, und die
Weiterleitung der Seiten kennt drei Hosts statt einem: Eine Seite (GET oder HEAD außerhalb von `PAGES_STAY`) auf einem der Hosts
`automatonhost.com`, `postyourprice.com` und `cp.hippe.eu`, der nicht der kanonische ist, antwortet 301 auf denselben Pfad samt Query
am kanonischen Host (`CP_PUBLIC_URL`), und alles aus `PAGES_STAY` antwortet auf allen drei Hosts ohne Weiterleitung. Die Sperre der
Zahlungsdomain für Dienste von Kunden gilt für `automatonhost.com` genauso wie für `postyourprice.com`, die DNS-Einträge legt ein
eigenes Werkzeug an, und `ops/live.sh` prüft nach jedem Rollout alle Hosts (`ROADMAP.md`, umzug 01; `docs/kette.md`, umzug 01).
Danach ist der Wechsel des kanonischen Hosts genau eine Zeile in `deploy/docker-compose.prod.yml`.
MVP: Funktion, weil Matthias das Angebot unter dem Namen Automatons und der Domain `automatonhost.com` verkauft (17.11.2026) und kein
Automaton, der heute `https://postyourprice.com` oder `https://cp.hippe.eu` als `conwayApiUrl` trägt, beim Umzug etwas verlieren darf.

## Voraussetzungen
- keine

## Kontext für den Maker
- Ziel in einem Satz: Wer `automatonhost.com` aufruft, Automaton oder Mensch, erreicht den Dienst, und kein bestehender Kunde auf
  `postyourprice.com` oder `cp.hippe.eu` verliert eine Anfrage, einen Schlüssel oder eine Zahlung. Was dem nicht dient, gehört nicht
  in dieses Goal; Texte, Startseite, README und Plugin sind umzug 02.
- Stand am 17.11.2026 (`dev` bei `11a4475`), gemessen:
  - Die Zone `automatonhost.com` liegt im Cloudflare-Konto von HTC (`dig +short automatonhost.com NS` gibt `kobe.ns.cloudflare.com.`
    und `dolly.ns.cloudflare.com.`), A-Einträge für `automatonhost.com` und `www.automatonhost.com` gibt es noch nicht (`dig +short`
    leer). Der Kauf ist erledigt, das Human Gate `server_kauf` aus `ROADMAP.md` entfällt. `postyourprice.com` und `cp.hippe.eu` zeigen
    ohne Proxy auf `76.13.144.207` (`dig +short … A`), ohne AAAA.
  - Der kanonische Host kommt aus `CP_PUBLIC_URL` (`src/public/site.ts`), gesetzt in `deploy/docker-compose.prod.yml` Zeile 19 auf
    `https://postyourprice.com`. Daraus lesen canonical, Sitemap, strukturierte Daten, die `curl`-Beispiele (`withOrigin`), die
    Rücksprung-URL von Stripe (`stripeFromEnv` in `src/payments/stripe.ts`), die `resource` der x402-Angebote (`publicOrigin` in
    `src/payments/pay.ts`), die Prüfung des Origin auf `POST /start` und `conwayApiUrl` eines gehosteten Automatons.
  - Die Weiterleitung in `src/app.ts` (Middleware nach `PAGES_STAY`) leitet heute nur Seiten auf `cp.hippe.eu` weiter
    (`if (host !== "cp.hippe.eu") return next();`); eine Seite auf einem anderen Host, der nicht der kanonische ist, antwortet 200.
  - `deploy/Caddyfile` bedient im Block `cp.hippe.eu, postyourprice.com` den Dienst und leitet `www.postyourprice.com` mit 308 auf den
    Apex.
  - Die Sperre der Zahlungsdomain steht als `PAYMENT_ZONE = "postyourprice.com"` in `src/sandbox/service.ts` (`passablePublicUrl`),
    `ops/sandbox/sandboxd.mjs` (`assertPortsDomain`), `ops/sandbox/cloudflare.py` (`ports_domain`) und als `case`-Muster in
    `ops/sandbox/setup.sh` Zeile 55.
  - Passkeys: `konto_accounts` hat in der Produktion 0 Zeilen, `CP_KONTO_AUTH_PROXY_ID` und `STRIPE_SECRET_KEY` sind im Container
    `deploy-cp-1` leer (gelesen am 17.11.2026 mit `readonly: true` über `docker exec deploy-cp-1 node -e …` und `test -n`). Es gibt
    also kein Konto mit Passkey, das an einem alten Host hängt, und ohne die Auth-Proxy-ID kann keines entstehen.
- Entscheidungen des Tech Lead (der Maker schreibt sie mit Grund unter `## Goal 01` in `goals/umzug/ANNAHMEN.md`):
  1. **Der Wechsel von `CP_PUBLIC_URL` gehört nicht in dieses Goal.** `deploy/docker-compose.prod.yml` steht in `deny_paths` und in der
     Deny List von `loop-constraints.md`; kein Agent ändert die Datei, auch nicht auf einem Nebenbranch. Ein Wechsel vor diesem Goal
     bräche die Produktion, weil canonical, x402-`resource` und Rücksprung dann auf einen Host zeigten, den Caddy noch nicht bedient.
     Deshalb baut dieses Goal alles so, dass es mit `CP_PUBLIC_URL=https://postyourprice.com` (heute) und mit
     `CP_PUBLIC_URL=https://automatonhost.com` (danach) richtig arbeitet, und umzug 02 beginnt mit dem Wechsel als Human Gate an
     Matthias (eine Zeile, nach dem Rollout dieses Goals und einer grünen Zeile `OK hosts:` aus `ops/live.sh`).
  2. **Seiten leben immer auf genau einem Host.** `export const SERVICE_HOSTS = ["automatonhost.com", "postyourprice.com",
     "cp.hippe.eu"] as const;` in `src/public/site.ts`. Die Middleware leitet eine Seite auf jedem Host aus `SERVICE_HOSTS`, der nicht
     `siteHost()` ist, mit 301 auf `${siteOrigin()}${pathname}${search}`. Vor dem Wechsel gehen also Seiten auf `automatonhost.com` auf
     `postyourprice.com`, danach umgekehrt; so trifft jedes Formular den Origin, den `POST /start` erwartet. Ein Host außerhalb von
     `SERVICE_HOSTS` bleibt unberührt wie heute, `PAGES_STAY`, Methoden außer GET und HEAD und `robots.txt` bleiben, wie sie sind.
     Ohne `CP_PUBLIC_URL` (jeder Test, der es nicht setzt) leitet die Middleware nichts weiter, wie heute.
  3. **Caddy.** Der Block des Dienstes beginnt genau mit der Zeile `automatonhost.com, postyourprice.com, cp.hippe.eu {`, sonst bleibt
     er unverändert (ein einziger `reverse_proxy cp:8402`, Kopfzeilen, Log). Darunter ein eigener Block `www.automatonhost.com` mit
     `redir https://automatonhost.com{uri} 308`, wie bei `www.postyourprice.com`. `www.postyourprice.com` und `vysyon.hippe.eu` bleiben
     unverändert. Prüfbefehl aus betrieb 02 (`cp:8402 30000000000` genau einmal) bleibt grün.
  4. **DNS mit eigenem Werkzeug und vor dem Merge.** `ops/site-dns.py` mit `check <ip>`, `apply <ip>` und `--selftest`, nur für die Zone
     `automatonhost.com`, Token `CLOUDFLARE_HTC_API_TOKEN` aus der Umgebung (der Maker lädt ihn aus `~/brain/connectors/secrets.env`,
     nie ausgeben). Soll: A `automatonhost.com` und A `www.automatonhost.com` auf `<ip>`, `proxied: false`, weil Caddy das Zertifikat
     selbst holt wie für `postyourprice.com`. `check` druckt je fehlendem Eintrag `CHANGE dns create A <name>`, je abweichendem
     `CHANGE dns differs A <name>` und sonst `SITE DNS OK changed=0`, Exit 0 nur ohne `CHANGE`. `apply` legt nur fehlende Einträge an
     (POST), ändert oder löscht nie einen und endet bei einem abweichenden mit Exit 1, ohne zu schreiben. Der Maker fährt
     `apply 76.13.144.207` im Goal, vor dem Merge: Die Regel aus `goals/sandbox/ANNAHMEN.md` („DNS erst mit dem Merge“) schützt
     Messungen fertiger Goals, und kein fertiges Goal misst `automatonhost.com`; ohne die Einträge holte Caddy beim Rollout kein
     Zertifikat, und `ops/live.sh` stünde nach dem Deploy auf `FAIL` und löste einen Revert aus.
  5. **Zahlungsdomains.** `PAYMENT_ZONES = ["postyourprice.com", "automatonhost.com"]` ersetzt `PAYMENT_ZONE` in
     `src/sandbox/service.ts`, `ops/sandbox/sandboxd.mjs` und `ops/sandbox/cloudflare.py`; ein Host gleich einer Zone oder unter ihr
     (jede Schreibweise, Punkt am Ende, Port) wird abgelehnt wie heute. `ops/sandbox/setup.sh` lehnt beide Zonen und ihre Namen ab. Die
     Meldungen sagen weiter, dass freigegebene Ports eine eigene Domain brauchen. Kein Rollout auf dem Sandbox-Server in diesem Goal:
     Dort prüft `sandboxd` nur beim Start `SANDBOXD_DOMAIN=sandboxhost.de`, wirksam ist die Prüfung im Control Plane, und der nächste
     Lauf von `setup.sh` bringt den Stand mit.
  6. **Passkeys.** Kein Related Origin Request in diesem Goal, weil 0 Konten mit Passkey bestehen und ohne Auth-Proxy-ID keines
     entstehen kann. Der Maker misst die Zahl beim Bau erneut nur lesend und schreibt sie mit dem Befehl in die Annahmen. Ist sie nicht
     0, fragt er den Tech Lead, bevor er weiterbaut. Vor dem Wechsel in umzug 02 wird erneut gezählt; ist es dann mehr als 0, kommt
     `/.well-known/webauthn` auf `postyourprice.com` vor den Wechsel. `https://automatonhost.com` als erlaubter Origin im Auth Proxy
     von Turnkey kommt mit dem Einschalten von Konto, nicht hier.
  7. **Live-Prüfung aller Hosts.** `ops/live.sh` bekommt die Prüfung `hosts` nach dem Muster der anderen (`judge_hosts`,
     `hosts_live`, gepflanzte Fälle im Selbsttest): je Host aus `automatonhost.com`, `postyourprice.com`, `cp.hippe.eu` antwortet
     `https://<host>/health` 200 ohne Weiterleitung; `https://<host>/` antwortet auf genau einem Host 200 (der kanonische) und auf den
     anderen 301 mit `Location: https://<kanonisch>/`; `https://www.automatonhost.com/health` antwortet 308 mit
     `Location: https://automatonhost.com/health`. Ergebnis `OK hosts: canonical <host>, …` oder `FAIL hosts: <host> <pfad> <was>`.
     Der Selbsttest druckt je Fall `planted hosts step <name>: <Zeile>`, mindestens: vor dem Wechsel (kanonisch `postyourprice.com`)
     OK, nach dem Wechsel (kanonisch `automatonhost.com`) OK, ein Host ohne Antwort (curl `000`) FAIL, zwei Hosts mit 200 auf `/`
     FAIL, eine 301 auf einen fremden Host FAIL, `/health` mit 301 FAIL.
- Die neuen Fälle der Weiterleitung stehen in einer neuen Datei `test/automatonhost.test.ts`, die nur `createApp`, `openDb` und, für
  Punkt 2, was es am Kopf von `dev` schon gibt, importiert, nie `SERVICE_HOSTS`: Sonst zeigt die Gegenprobe nur einen Importfehler
  statt roter Fälle. Dasselbe gilt für die neuen Fälle in `test/sandbox-ports.test.ts` und `test/sandboxd.test.ts` (Punkt 5), die
  `PAYMENT_ZONES` nicht importieren. `test/one-host.test.ts` bleibt grün und unverändert.
- Der code-host hat kein Docker: Unit-Tests mit vitest, Caddy mit `caddy validate` und `caddy adapt` aus `$HOME/.local/bin`, der
  Laufzeitpfad zusätzlich mit dem Job `e2e` des Goal-PR. Die Produktion ändert sich nur über den Merge und `deploy.yml` (Rollout mit
  `src/**` und `deploy/Caddyfile`); die Live-Prüfung danach macht der Release Manager mit `ops/smoke.sh` und `ops/live.sh`.
- Prüfbefehle ohne Netz binden keinen festen Port, Node 22 vorn im `PATH` (`PATH=/usr/bin:$PATH`), `check` und vitest im Vordergrund
  mit eigenem Timeout, neue Dateien vor dem lokalen `check` stagen. Progress Log und Verdicts zitieren keine Suchausdrücke der
  Prüfbefehle wörtlich.
- Ablauf: zuerst Weiterleitung mit Tests (Punkt 1), dann der Umzug als eine Zeile (Punkt 2), Caddy (Punkt 3), DNS-Werkzeug und
  Einträge (Punkt 4), Zahlungsdomains (Punkt 5), `ops/live.sh` (Punkt 6), dann Doku, Annahmen, Umfang, `check` und `e2e` (Punkte 7 bis
  9). Nach jedem grünen Punkt Commit und Push.
- Widerlegt, wenn die neuen Fälle aus Punkt 1 schon am Kopf von `dev` grün sind; dann leitet der Dienst schon über alle Hosts, und das
  Goal endet mit dieser Messung in den Annahmen.
- Was danach schneller zu mehr zahlenden Automatons führt: umzug 02 stellt den kanonischen Host um und lässt Startseite, README und
  Plugin von Automatons und `automatonhost.com` sprechen, damit ein Automaton aus einem Conway-Issue einen Namen findet, der sagt,
  was er hier bekommt.

## Done Condition
- [x] Eine Seite auf einem Host aus `SERVICE_HOSTS`, der nicht der kanonische ist, antwortet 301 auf denselben Pfad samt Query am
      kanonischen Host, mit `CP_PUBLIC_URL=https://automatonhost.com` und mit `CP_PUBLIC_URL=https://postyourprice.com`; `/v1/`,
      `/pay/`, `/.well-known/`, `/health` und `POST` antworten auf jedem Host ohne Weiterleitung, ein fremder Host bleibt unberührt.
      Die neuen Fälle waren vor dem Fix rot.
      MVP: Funktion, weil ein Automaton mit `conwayApiUrl: https://postyourprice.com` sonst nach dem Wechsel unangemeldet ankäme und
      ein Besucher dieselbe Seite unter zwei Namen sähe.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts test/one-host.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE "^\s*(it|test)\(" test/automatonhost.test.ts` muss mindestens 8 ausgeben.
      Prüfung: `grep -cE '^export const SERVICE_HOSTS = \["automatonhost\.com", "postyourprice\.com", "cp\.hippe\.eu"\]' src/public/site.ts` muss 1 ausgeben.
      Prüfung: `grep -cF 'host !== "cp.hippe.eu"' src/app.ts` muss 0 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/app.ts > $T/src/app.ts; git show $B:src/public/site.ts > $T/src/public/site.ts; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 4 ausgeben.
- [x] Mit `CP_PUBLIC_URL=https://automatonhost.com` nennen canonical der Startseite, `curl`-Beispiele, Rücksprung von Stripe,
      `resource` des x402-Angebots und `conwayApiUrl` eines gehosteten Automatons `https://automatonhost.com`, und `POST /start` nimmt
      den Origin `https://automatonhost.com` an; der Umzug ist damit eine Zeile.
      MVP: Funktion, weil Zahlung und Rücksprung nach dem Wechsel sonst auf den alten Host zeigten und ein Kauf auf einer Seite endete,
      die weiterleitet.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/automatonhost.test.ts test/automaton-setup.test.ts test/bazaar.test.ts` muss Exit-Code 0 haben.
      Prüfung: `for w in /katalog/danke resource conwayApiUrl /start canonical; do grep -qF -- "$w" test/automatonhost.test.ts || echo "fehlt $w"; done` muss nichts ausgeben.
- [x] `deploy/Caddyfile` bedient `automatonhost.com` im Block des Dienstes und leitet `www.automatonhost.com` mit 308 auf den Apex; die
      Konfiguration ist gültig, und der Dienst hat weiter genau einen `reverse_proxy`.
      MVP: Funktion, weil ohne den Block kein Zertifikat für `automatonhost.com` entsteht und jeder Aufruf am TLS scheitert.
      Prüfung: `grep -cxF 'automatonhost.com, postyourprice.com, cp.hippe.eu {' deploy/Caddyfile` muss 1 ausgeben.
      Prüfung: `grep -cF 'redir https://automatonhost.com{uri} 308' deploy/Caddyfile` muss 1 ausgeben.
      Prüfung: `T=$(mktemp -d); sed "s#/var/log/caddy/access.log#$T/access.log#" deploy/Caddyfile > $T/Caddyfile && PATH=$HOME/.local/bin:$PATH caddy validate --config $T/Caddyfile --adapter caddyfile 2>&1 | tail -1; rm -rf $T` muss eine Zeile ausgeben, die `Valid configuration` enthält.
      Prüfung: `PATH=$HOME/.local/bin:$PATH caddy adapt --config deploy/Caddyfile --adapter caddyfile 2>/dev/null | grep -o '"www.automatonhost.com"' | wc -l` muss mindestens 1 ausgeben.
- [x] `ops/site-dns.py` legt nur fehlende A-Einträge der Zone `automatonhost.com` an und ändert oder löscht keinen; die Einträge für
      `automatonhost.com` und `www.automatonhost.com` zeigen ohne Proxy auf `76.13.144.207`.
      MVP: Funktion, weil Caddy ohne die Einträge beim Rollout kein Zertifikat holt und die Live-Prüfung danach rot wäre.
      Prüfung: `python3 ops/site-dns.py --selftest 2>&1 | tail -n 1` muss genau `SITE DNS SELFTEST OK` ausgeben.
      Prüfung: `grep -cE '"(DELETE|PUT|PATCH)"' ops/site-dns.py` muss 0 ausgeben.
      Prüfung (Netz): `dig +short automatonhost.com A` muss genau `76.13.144.207` ausgeben.
      Prüfung (Netz): `dig +short www.automatonhost.com A` muss genau `76.13.144.207` ausgeben.
- [x] Die Sperre der Zahlungsdomain gilt für `automatonhost.com` und jeden Namen darunter wie für `postyourprice.com`: im Control
      Plane, in `sandboxd`, in `setup.sh` und in `cloudflare.py`. Die neuen Fälle waren vor dem Fix rot.
      MVP: Funktion, weil ein Dienst eines Kunden unter dem Namen, unter dem wir Zahlungen nehmen, Käufer täuschen könnte.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-ports.test.ts test/sandboxd.test.ts` muss Exit-Code 0 haben.
      Prüfung: `cat test/sandbox-ports.test.ts test/sandboxd.test.ts | grep -c "automatonhost.com"` muss mindestens 2 ausgeben.
      Prüfung: `cat src/sandbox/service.ts ops/sandbox/sandboxd.mjs ops/sandbox/cloudflare.py | grep -c "PAYMENT_ZONES"` muss mindestens 3 ausgeben.
      Prüfung: `grep -c "automatonhost.com" ops/sandbox/setup.sh` muss mindestens 1 ausgeben.
      Prüfung: `bash -n ops/sandbox/setup.sh` muss Exit-Code 0 haben.
      Prüfung: `python3 ops/sandbox/cloudflare.py --selftest` muss Exit-Code 0 haben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; B=$(git merge-base origin/dev HEAD); git show $B:src/sandbox/service.ts > $T/src/sandbox/service.ts; git show $B:ops/sandbox/sandboxd.mjs > $T/ops/sandbox/sandboxd.mjs; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/sandbox-ports.test.ts test/sandboxd.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 2 ausgeben.
- [x] `ops/live.sh` prüft nach jedem Rollout alle drei Hosts und `www.automatonhost.com` und meldet `OK hosts:` vor und nach dem
      Wechsel des kanonischen Hosts, `FAIL hosts:` bei einem stummen Host, zwei kanonischen, einer Weiterleitung auf einen fremden Host
      oder einer Weiterleitung von `/health`.
      MVP: Funktion, weil ein Host, der nach einem Rollout ohne Zertifikat oder mit falscher Weiterleitung antwortet, Kunden trifft,
      die ihn als `conwayApiUrl` tragen, und erst die Live-Prüfung den Revert auslöst.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/live-selftest.test.ts` muss Exit-Code 0 haben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest 2>&1 | tail -n 1` muss genau `LIVE SELFTEST OK` ausgeben.
      Prüfung: `PATH=/usr/bin:$PATH bash ops/live.sh --selftest 2>&1 | grep -c '^planted hosts step '` muss mindestens 6 ausgeben.
      Prüfung: `grep -c "FAIL hosts: " test/live-selftest.test.ts` muss mindestens 3 ausgeben.
      Prüfung: `grep -c "OK hosts: canonical " test/live-selftest.test.ts` muss mindestens 2 ausgeben.
- [x] Die Doku sagt, welche Hosts es gibt, was weiterleitet und was bleibt, wie die DNS-Einträge entstehen und welche eine Zeile
      Matthias für den Wechsel ändert; die Entscheidungen und die Zahl der Konten mit Passkey stehen mit Befehl in den Annahmen.
      MVP: Funktion, weil umzug 02 mit genau diesem Wechsel beginnt und ihn ohne die Doku nicht sicher vorlegen kann.
      Prüfung: `for w in automatonhost.com postyourprice.com cp.hippe.eu PAGES_STAY CP_PUBLIC_URL docker-compose.prod.yml site-dns.py "OK hosts"; do grep -qF -- "$w" docs/umzug.md || echo "fehlt $w"; done` muss nichts ausgeben.
      Prüfung: `awk '/^## Goal 01/{f=1} f' goals/umzug/ANNAHMEN.md | grep -ciE "SERVICE_HOSTS|PAYMENT_ZONES|site-dns|konto_accounts|CP_PUBLIC_URL|Caddyfile|live.sh"` muss mindestens 6 ausgeben.
- [x] Das Goal ändert nur Weiterleitung, Sperre der Zahlungsdomain, Caddy, DNS-Werkzeug, Live-Prüfung, Doku und Tests, weder Compose,
      Zahlung, Anmeldung, Automaton, Harness noch CI, und bringt keinen Schlüssel ins Repo.
      MVP: Funktion, weil das Repo öffentlich ist (Grundregel 8), Compose nur Matthias ändert und der Rest des Umzugs in umzug 02 liegt.
      Prüfung: `git diff --name-only origin/dev...HEAD -- deploy/docker-compose.prod.yml src/payments src/auth src/automaton harness .github scripts/check.mjs | wc -l` muss 0 ausgeben.
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -vcE '^(src/app\.ts|src/public/site\.ts|src/sandbox/service\.ts|ops/sandbox/(sandboxd\.mjs|setup\.sh|cloudflare\.py)|ops/site-dns\.py|ops/live\.sh|deploy/Caddyfile|docs/umzug\.md|test/|goals/umzug/|goals/_vorschlaege/umzug-[a-z0-9.-]+\.md$)'` muss 0 ausgeben (Vorschläge der Kritik eingeschlossen, Tech Lead 17.11.2026).
      Prüfung: `git diff --name-only origin/dev...HEAD | grep -cE "\.(key|pem|crt|env)$"` muss 0 ausgeben.
      Prüfung: `git diff origin/dev...HEAD -- . ':(exclude)goals/' | grep -cE '^\+.*(cnwy_k_[0-9a-f]{32}|-{5}BEGIN [A-Z ]*PRIVATE KEY-{5}|Bearer [A-Za-z0-9_-]{30,})'` muss 0 ausgeben.
- [x] `check` ist grün, und der Job `e2e` des Goal-PR ist grün.
      MVP: Funktion, weil die Middleware jede Anfrage sieht und erst der Gang mit der unveränderten Runtime zeigt, dass Anmeldung,
      Zahlung und Inferenz weiter ohne Weiterleitung laufen (Grundregel 13).
      Prüfung: `PATH=/usr/bin:$PATH node scripts/check.mjs` muss Exit-Code 0 haben.
      Prüfung (Netz): `n=$(gh pr list -R matthiashippe/control-plane --head goal/umzug-01 --state all --json number -q '.[0].number'); gh pr checks "${n:?}" -R matthiashippe/control-plane --json name,state -q '.[] | select(.name=="e2e") | .state'` muss `SUCCESS` ausgeben.
- [ ] Die Liste der Hosts und die Liste der Zahlungsdomains stehen je an mehreren Stellen und dürfen nicht auseinanderlaufen:
      `test/host-lists.test.ts` importiert `SERVICE_HOSTS` aus `src/public/site.ts` und `PAYMENT_ZONES` aus
      `ops/sandbox/sandboxd.mjs` und prüft, dass die Zeile `HOSTS=` in `ops/live.sh` genau `SERVICE_HOSTS` in derselben
      Reihenfolge nennt, dass `PAYMENT_ZONES` in `ops/sandbox/cloudflare.py` dieselbe Menge ist, dass das `case`-Muster in
      `ops/sandbox/setup.sh` jede Zone und `*.<Zone>` enthält, dass `passablePublicUrl` für jede Zone `https://<Zone>/` und
      `https://x.<Zone>/` ablehnt und dass `PAYMENT_ZONES` gleich `SERVICE_HOSTS` ohne `cp.hippe.eu` ist (jede eigene Domain des
      Dienstes ist Zahlungsdomain; `hippe.eu` ist eine private Zone und bleibt draußen, Tech Lead 17.11.2026). Je Datei ein
      eigener Fall, damit eine Abweichung den Ort nennt.
      MVP: Funktion, weil der nächste Host (umzug 02 oder später) sonst in `site.ts` landet, aber nicht in der Live-Prüfung oder
      der Sperre, und das erst ein Kunde oder ein Revert zeigt.
      Prüfung: `PATH=/usr/bin:$PATH pnpm -s vitest run test/host-lists.test.ts` muss Exit-Code 0 haben.
      Prüfung: `grep -cE 'from "\.\./src/public/site\.js"|from "\.\./ops/sandbox/sandboxd\.mjs"' test/host-lists.test.ts` muss mindestens 2 ausgeben.
      Prüfung: `T=$(mktemp -d); git archive HEAD | tar -x -C $T; ln -s "$PWD/node_modules" $T/node_modules; sed -i 's/^HOSTS=.*/HOSTS="automatonhost.com postyourprice.com"/' $T/ops/live.sh; sed -i 's/^PAYMENT_ZONES = .*/PAYMENT_ZONES = ("postyourprice.com",)/' $T/ops/sandbox/cloudflare.py; sed -i 's/|automatonhost\.com|\*\.automatonhost\.com//' $T/ops/sandbox/setup.sh; (cd $T && PATH=/usr/bin:$PATH pnpm -s vitest run test/host-lists.test.ts --reporter=json --outputFile=$T/r.json >/dev/null 2>&1); node -p "JSON.parse(require('fs').readFileSync('$T/r.json','utf8')).numFailedTests"; rm -rf $T` muss mindestens 3 ausgeben.
- [ ] goal-verifier PASS (K und B)

## Acceptance Criteria
- [ ] Jede neue Testdatei und jeder neue Fall, der ein neues Verhalten verlangt, war vor dem Fix rot; die Zeile im Progress Log
      nennt, womit.
- [ ] Mit `CP_PUBLIC_URL=https://postyourprice.com` verhält sich der Dienst auf `postyourprice.com` und `cp.hippe.eu` genau wie heute.
- [ ] Code, Kommentare, Testnamen und Ausgaben der Werkzeuge Englisch, Goal-Datei, Doku und Annahmen Deutsch, kein Gedankenstrich.

## Deny List
- `loop.yaml`, `gate.yaml`, `loop-constraints.md`, `LOOP.md`, `ops/prompts/**`, `.github/**`, `scripts/check.mjs`,
  `deploy/docker-compose.prod.yml` (den Wechsel von `CP_PUBLIC_URL` macht Matthias in umzug 02), `deploy/rollout.sh`,
  `deploy/rollout-remote.sh`, `deploy/up.sh`, `deploy/setup-vm.sh`, `deploy/drift-ok.txt`, `harness/**`, `src/payments/**`,
  `src/auth/**`, `src/automaton/**`, `ops/conway-series.sh`, `ops/conway-money-series.sh`, `.env*`, `*.key`, `*.pem`, `*.crt`
- Cloudflare: nur die Zone `automatonhost.com` und dort nur das Anlegen der zwei A-Einträge; die Zonen `postyourprice.com`,
  `hippe.eu` und `sandboxhost.de` nicht anfassen; kein Token in eine Ausgabe, ein Log oder das Repo
- der Zahlungsserver `76.13.144.207`: nur lesen (die Zahl der Konten mit Passkey), kein Rollout, kein Neustart; der Sandbox-Server
  `srv1327036`: kein Zugriff in diesem Goal
- Kauf, Aufladung, Wallet-Bewegung, Topup, Überweisung, Gutschrift (`loop-constraints.md`, Grundregeln 6, 9 und 10)
- loop-constraints.md gilt zusätzlich

## Budget
- max Zyklen: 4
- max Versuche pro Gap: 3

## Progress Log
- 2026-11-17 Zyklus 1: Punkte 1 bis 9 gebaut (Kopf `773e55c`, PR #244 mit `check` und `e2e` grün): Weiterleitung über `SERVICE_HOSTS`, Caddy-Block mit `automatonhost.com` und www mit 308, `ops/site-dns.py` mit beiden A-Einträgen angelegt, `PAYMENT_ZONES` in Control Plane, sandboxd, cloudflare.py und setup.sh, Prüfung `hosts` in `ops/live.sh`, Doku und Annahmen. Rot vor dem Fix: `test/automatonhost.test.ts` 5 Fälle am alten `src/app.ts` und `src/public/site.ts`, `test/sandbox-ports.test.ts` und `test/sandboxd.test.ts` 3 Fälle am alten Stand, `test/live-selftest.test.ts` 9 Fälle vor der Änderung an `ops/live.sh`. Prüfbefehle: Punkt 1 Exit 0, 17 Fälle, 1, 0, Gegenprobe 5; Punkt 2 Exit 0, nichts fehlt; Punkt 3 1, 1, Valid configuration, 3; Punkt 4 SITE DNS SELFTEST OK, 0, `76.13.144.207`, `76.13.144.207`; Punkt 5 Exit 0, 16, 6, 1, Exit 0, Exit 0, Gegenprobe 3; Punkt 6 Exit 0, LIVE SELFTEST OK, 19, 10, 5; Punkt 7 nichts fehlt, 15; Punkt 8 0, 0, 0, 0; Punkt 9 `check` Exit 0, `e2e` SUCCESS.
- 2026-11-17 Zyklus 2: Abschluss gemeldet, Punkte 1 bis 9, nach Merge von `dev` (`8d69937`) am Kopf `91b7f21`. Prüfbefehle: Punkt 1 Exit 0, 17, 1, 0, Gegenprobe 5; Punkt 2 Exit 0, nichts fehlt; Punkt 3 1, 1, Valid configuration, 3; Punkt 4 SITE DNS SELFTEST OK, 0, `76.13.144.207`, `76.13.144.207`; Punkt 5 Exit 0, 16, 6, 1, Exit 0, Exit 0, Gegenprobe 3; Punkt 6 Exit 0, LIVE SELFTEST OK, 19, 10, 5; Punkt 7 nichts fehlt, 15; Punkt 8 0, 0, 0, 0; Punkt 9 `check` Exit 0, `e2e` SUCCESS.

## Blockers
Keine.
