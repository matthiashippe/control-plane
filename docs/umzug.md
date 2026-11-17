# Umzug auf automatonhost.com

Stand: umzug 02 (17.11.2026). Der Dienst antwortet unter drei Hosts, Seiten leben auf genau einem davon, und der Wechsel des
kanonischen Hosts ist eine Zeile.

## Hosts

| Host | Rolle |
|---|---|
| `automatonhost.com` | neuer Name des Dienstes, nach dem Wechsel kanonisch |
| `postyourprice.com` | heute kanonisch (`CP_PUBLIC_URL=https://postyourprice.com`) |
| `cp.hippe.eu` | alter Name, bleibt für Issue-Kommentare, x402-Manifest und Runtimes mit diesem `conwayApiUrl` |
| `www.automatonhost.com` | leitet in Caddy mit 308 auf `https://automatonhost.com{uri}` |
| `www.postyourprice.com` | leitet in Caddy mit 308 auf `https://postyourprice.com{uri}` |

Die Liste der drei Hosts steht einmal im Code: `SERVICE_HOSTS` in `src/public/site.ts`. Caddy bedient alle drei im Block
`automatonhost.com, postyourprice.com, cp.hippe.eu` von `deploy/Caddyfile` mit einem einzigen `reverse_proxy cp:8402` und holt
für jeden das Zertifikat selbst.

## Was weiterleitet und was bleibt

Kanonisch ist der Host aus `CP_PUBLIC_URL`. Eine Seite (GET oder HEAD) auf einem der anderen beiden Hosts aus `SERVICE_HOSTS`
antwortet 301 auf denselben Pfad samt Query am kanonischen Host. Vor dem Wechsel gehen Seiten auf `automatonhost.com` und
`cp.hippe.eu` also auf `postyourprice.com`, danach gehen Seiten auf `postyourprice.com` und `cp.hippe.eu` auf
`automatonhost.com`. So kommt jedes Formular vom Origin, den `POST /start` erwartet.

Ohne Weiterleitung auf jedem Host bleibt alles aus `PAGES_STAY` in `src/app.ts`: `/v1/`, `/pay/`, `/.well-known/`, `/px/`,
`/health`, `/robots.txt`, `/bounties.json`, `/llms.txt`, `/receipts.json`. Dazu jede Anfrage außer GET und HEAD. Grund: Eine
Runtime mit `conwayApiUrl: https://postyourprice.com` oder `https://cp.hippe.eu` ist ein echter Kunde, und eine Weiterleitung
über Hosts hinweg lässt bei curl und den meisten Clients den Authorization-Header fallen; die Anfrage käme unangemeldet an. Ein
Host außerhalb von `SERVICE_HOSTS` wird nie weitergeleitet. Ohne `CP_PUBLIC_URL` leitet der Dienst nichts weiter.

Aus `CP_PUBLIC_URL` lesen außerdem canonical, Sitemap, strukturierte Daten, die `curl`-Beispiele, der Rücksprung von Stripe
(`/katalog/danke`), die `resource` der x402-Angebote, die Prüfung des Origin auf `POST /start` und `conwayApiUrl` eines
gehosteten Automatons. `test/automatonhost.test.ts` zeigt beide Seiten des Wechsels.

## DNS

Die Zone `automatonhost.com` liegt bei Cloudflare im Konto von HTC. Die Einträge legt `ops/site-dns.py` an, nur auf dem
code-host, Token `CLOUDFLARE_HTC_API_TOKEN` aus der Umgebung oder `~/brain/connectors/secrets.env`:

```
python3 ops/site-dns.py check 76.13.144.207   # nur lesen: CHANGE-Zeilen oder SITE DNS OK changed=0
python3 ops/site-dns.py apply 76.13.144.207   # legt fehlende A-Einträge an, ändert und löscht nie einen
python3 ops/site-dns.py --selftest            # ohne Netz
```

Soll: A `automatonhost.com` und A `www.automatonhost.com` auf `76.13.144.207`, ohne Proxy, damit Caddy das Zertifikat selbst
holt. Ein abweichender Eintrag beendet `apply` mit Exit 1, ohne zu schreiben; den löst ein Mensch. Angelegt am 17.11.2026 in
umzug 01, vor dem Merge, damit Caddy beim ersten Rollout das Zertifikat bekommt.

Die Sperre der Zahlungsdomain (`PAYMENT_ZONES` in `src/sandbox/service.ts`, `ops/sandbox/sandboxd.mjs`,
`ops/sandbox/cloudflare.py`, dazu `ops/sandbox/setup.sh`) gilt für `automatonhost.com` und jeden Namen darunter wie für
`postyourprice.com`: Ein Dienst eines Kunden bekommt nie einen Namen in einer Zone, unter der wir Zahlungen nehmen.

## Live-Prüfung

`ops/live.sh` prüft nach jedem Rollout alle Hosts: `/health` antwortet auf jedem der drei Hosts 200 ohne Weiterleitung, `/`
antwortet auf genau einem 200 (dem kanonischen) und auf den anderen 301 auf ihn, `https://www.automatonhost.com/health`
antwortet 308 auf `https://automatonhost.com/health`. Grün ist die Zeile `OK hosts: canonical <host>, …`, rot
`FAIL hosts: <host> <pfad> <was>`. Die Prüfung ist vor und nach dem Wechsel grün und nennt den kanonischen Host.

## Name nach außen (umzug 02)

Nach außen heißt der Dienst `automatonhost.com`, klein geschrieben, und das Angebot sind die Automatons, die bei uns laufen
(Matthias, 17.11.2026). Der alte Name wird nach außen weder genannt noch verlinkt. So steht es seit umzug 02 im Kopf jeder Seite,
in den Titeln (`<Seite> | automatonhost.com`), in `og:site_name`, in `src/public/jsonld.ts`, im Titel von `/openapi.json`, in der
ersten Zeile von `/llms.txt` (`# automatonhost.com`), im Impressum auf `/terms`, in der Fußzeile der Handy-Seiten unter
`/h/{code}`, auf beiden Vorschaubildern (`src/public/og-card.html`, `src/public/og-card-x402.html`, daraus `og.png` und
`og-x402.png`) und in den 30 SOLL-Bildern unter `docs/soll/`. Sätze, deren Subjekt der alte Name war, sagen „We“. Die Startseite
führt mit dem Wechsel für Automatons (Block `move`, `conwayApiUrl` mit `https://automatonhost.com`, Knopf im Kopf zu `/fix`), der
Markt für Menschen folgt darunter. `test/automaton-name.test.ts` prüft jede Seite aus `/sitemap.xml`, `/llms.txt`,
`/openapi.json`, alle Zustände der Handy-Seiten und beide Karten. Wer Text nach außen schreibt, nimmt diesen Namen.

**Was beim alten Namen bleibt, und warum.** Maschinenverträge bleiben, weil Runtimes, installierte Plugins und Drittsysteme sie
lesen und ein neuer Name sie bräche, ohne dass ein Leser etwas gewinnt: das JSON-Feld `handsel_notice` (nur `/terms` nennt es,
als Feldnamen in `<code>`), der Header `X-PostYourPrice-Hint`, Kennungen in der Datenbank (`handsel-%`),
`ctl.sbx.postyourprice.com`, `SERVICE_HOSTS`, `PAYMENT_ZONES`, die Adressen in `src/handoff/routes.ts` und alles unter
`src/payments/`. `postyourprice.com` und `cp.hippe.eu` antworten weiter auf alles aus `PAGES_STAY`, also läuft eine Runtime mit
altem `conwayApiUrl` und ein schon installiertes Plugin `automaton@postyourprice` ohne Änderung weiter.

**Plugin.** Installation aus Claude Code:

```
claude plugin marketplace add matthiashippe/control-plane && claude plugin install automaton@automatonhost
```

Der Marketplace heißt `automatonhost` (Besitzer `automatonhost.com`), der Server in `mcpServers` heißt `automatonhost` und
spricht ohne eigene Einstellung mit `CP_URL=https://automatonhost.com`; `DEFAULT_BASE_URL` in `mcp/server.mjs` ist derselbe Host.

**Passkey.** `rp.name` und `walletName` sind `automatonhost.com`, der Passkey heißt `automatonhost.com <Datum>`. Die rpId bleibt
`window.location.hostname`: Neue Passkeys entstehen nach dem Wechsel für `automatonhost.com`. Beim Einschalten von Konto
(`CP_KONTO_AUTH_PROXY_ID`) muss `https://automatonhost.com` als erlaubter Origin im Auth Proxy von Turnkey stehen, sonst lehnt
Turnkey die Anmeldung von der neuen Seite ab. Gibt es dann schon Konten mit Passkey für `postyourprice.com`
(`konto_accounts` größer 0), kommt vorher `/.well-known/webauthn` auf `postyourprice.com`, weil Passkeys an ihre rpId gebunden
sind. Gemessen am 17.11.2026 vor dem Wechsel: `konto_accounts=0`, `CP_KONTO_AUTH_PROXY_ID` leer (`goals/umzug/ANNAHMEN.md`).

**Kanal.** `ops/before-the-answers.py` verlangt in jedem neuen Entwurf für ein Conway-Issue `https://automatonhost.com`
(`CANONICAL_HOST`, mit `CP_PUBLIC_HOST` überschreibbar) und meldet einen Entwurf mit `postyourprice.com` oder `cp.hippe.eu` als
veraltet (`KNOWN_HOSTS`). Die schon geposteten Kommentare und die Entwürfe fertiger Goals unter `goals/kanal/antworten*/` bleiben.

**Tippfehler im Wechsel.** Nennt `CP_PUBLIC_URL` einen Host außerhalb von `SERVICE_HOSTS` (etwa `automatonhost.de`), leitet keine
Seite weiter, und der Dienst schreibt einmal je Host `canonical host <host> is not in SERVICE_HOSTS, pages are not redirected`
ins Log, weil ein 301 auf einen Host, den Caddy nicht bedient, in Browsern hängen bliebe. Ein Host mit `:443` oder Punkt am Ende
zählt wie der nackte Host.

## Der Wechsel (umzug 02, Matthias)

Nach dem Rollout von umzug 01 und einer Zeile `OK hosts: canonical postyourprice.com` ändert Matthias genau eine Zeile in
`deploy/docker-compose.prod.yml`:

```
-      CP_PUBLIC_URL: https://postyourprice.com
+      CP_PUBLIC_URL: https://automatonhost.com
```

Danach Rollout über `deploy.yml` und `ops/live.sh`, das `OK hosts: canonical automatonhost.com` melden muss. Kein Agent ändert
`deploy/docker-compose.prod.yml`. Vor dem Wechsel werden die Konten mit Passkey erneut gezählt (`goals/umzug/ANNAHMEN.md`);
ist es mehr als 0, kommt `/.well-known/webauthn` auf `postyourprice.com` vor den Wechsel.

Stand des Wechsels: Gemessen am 17.11.2026 vor dem Gate, nur lesend: `konto_accounts=0`, `CP_KONTO_AUTH_PROXY_ID` leer,
`bash ops/live.sh` mit `OK hosts: canonical postyourprice.com`. Der Wechsel liegt als Human Gate bei Matthias (umzug 02, Punkt 9).
Grün ist er, wenn `ops/live.sh` danach `OK hosts: canonical automatonhost.com` meldet und `https://postyourprice.com/` mit 301 auf
`https://automatonhost.com/` antwortet.
