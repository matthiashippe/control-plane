# Umzug auf automatonhost.com

Stand: umzug 01 (17.11.2026). Der Dienst antwortet unter drei Hosts, Seiten leben auf genau einem davon, und der Wechsel des
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
