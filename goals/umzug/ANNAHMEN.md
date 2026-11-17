# Annahmen umzug

## Goal 01 (17.11.2026, Engineer CP)

- **Der Wechsel von `CP_PUBLIC_URL` gehört nicht in dieses Goal** (Entscheidung 1 des Tech Lead). `deploy/docker-compose.prod.yml`
  steht in `deny_paths` und in der Deny List; ein Wechsel vor dem Rollout dieses Goals bräche canonical, x402-`resource` und
  Rücksprung, weil Caddy `automatonhost.com` dann noch nicht bediente. Alles ist so gebaut, dass es mit
  `CP_PUBLIC_URL=https://postyourprice.com` und mit `https://automatonhost.com` richtig arbeitet; umzug 02 beginnt mit dem
  Wechsel als Human Gate an Matthias (`docs/umzug.md`, Abschnitt „Der Wechsel“).
- **`SERVICE_HOSTS` in `src/public/site.ts`** nennt die drei Hosts einmal. Die Middleware in `src/app.ts` leitet eine Seite auf
  jedem Host aus der Liste, der nicht `siteHost()` ist, mit 301 auf den kanonischen; ein Host außerhalb bleibt unberührt, ohne
  `CP_PUBLIC_URL` leitet sie nichts weiter. Neu gegenüber vorher: Ein Host wird vor dem Vergleich klein geschrieben und ohne Port
  und Punkt am Ende gelesen, weil `PostYourPrice.com` sonst als fremder Host durchginge. Die neuen Fälle in
  `test/automatonhost.test.ts` importieren `SERVICE_HOSTS` nicht, damit die Gegenprobe am alten Stand rote Fälle zeigt (5 rot,
  gemessen mit dem fünften Prüfbefehl von Punkt 1).
- **Ein ungültiges `CP_PUBLIC_URL`** fällt wie bisher auf `https://cp.hippe.eu` zurück; dann leiten Seiten auf den anderen
  beiden Hosts dorthin. Das ist der bestehende Rückfall aus `siteOrigin()` und in der Produktion nicht gesetzt.
- **`Caddyfile`:** Der Block des Dienstes beginnt mit `automatonhost.com, postyourprice.com, cp.hippe.eu {` und ist sonst
  unverändert, ein `reverse_proxy cp:8402` (Prüfbefehl aus betrieb 02 gibt weiter 1). `www.automatonhost.com` leitet mit 308 auf den
  Apex wie `www.postyourprice.com`. `caddy validate` und `caddy adapt` aus `$HOME/.local/bin`, kein Docker auf dem code-host.
- **DNS mit `ops/site-dns.py` (site-dns) vor dem Merge** (Entscheidung 4). Das Werkzeug kennt nur GET und POST und lehnt jede
  andere Methode ab, bevor es den Token liest. Gegenprobe gegen die echte Zone in beide Richtungen am 17.11.2026:
  `python3 ops/site-dns.py check 76.13.144.207` gab vor dem Anlegen `CHANGE dns create A automatonhost.com`,
  `CHANGE dns create A www.automatonhost.com`, `SITE DNS DRIFT changed=2` (Exit 1); `python3 ops/site-dns.py apply 76.13.144.207`
  gab `created A automatonhost.com`, `created A www.automatonhost.com`, `SITE DNS OK changed=0` (Exit 0). Danach
  `dig +short @kobe.ns.cloudflare.com automatonhost.com A` und dasselbe für `www.automatonhost.com`: je `76.13.144.207`. Keine
  andere Zone wurde angefasst, kein Eintrag geändert oder gelöscht.
- **`PAYMENT_ZONES = ["postyourprice.com", "automatonhost.com"]`** ersetzt `PAYMENT_ZONE` in `src/sandbox/service.ts` und
  `ops/sandbox/sandboxd.mjs`. In `ops/sandbox/cloudflare.py` prüft `PAYMENT_ZONES` (`in_payment_zone`) die Domain der Ports;
  `PAYMENT_ZONE` bleibt dort für die Verwaltung von `ctl.sbx.postyourprice.com`, die nur diese eine Zone betrifft.
  `ops/sandbox/setup.sh` lehnt beide Zonen und ihre Namen ab. Kein Rollout auf dem Sandbox-Server in diesem Goal; der nächste Lauf
  von `setup.sh` bringt den Stand mit (Entscheidung 5). Gegenprobe am alten Stand: 3 rote Fälle.
- **Konten mit Passkey: 0** (Entscheidung 6), gemessen am 17.11.2026 nur lesend:
  `ssh … 'docker exec -i deploy-cp-1 node -e "…require(\"better-sqlite3\")(\"/data/cp.db\",{readonly:true})…SELECT COUNT(*) AS n FROM konto_accounts…"'`
  gab `konto_accounts=0`; `docker exec deploy-cp-1 sh -c 'test -n "$CP_KONTO_AUTH_PROXY_ID"'` gab leer. Gegenprobe desselben
  Befehls auf `api_keys` gab `api_keys_nonzero=true`, das Werkzeug kann also mehr als 0 melden. Damit kein Related Origin Request
  in diesem Goal; vor dem Wechsel in umzug 02 wird erneut gezählt.
- **`live.sh`:** Die Prüfung `hosts` (`judge_hosts`, `hosts_live`) prüft alle drei Hosts und `www.automatonhost.com` nach jedem
  Rollout und nennt den kanonischen Host in `OK hosts: canonical <host>`; so ist dieselbe Prüfung vor und nach dem Wechsel grün.
  Bis Caddy das Zertifikat für `automatonhost.com` nach dem ersten Rollout hat, wäre sie rot; deshalb stehen die DNS-Einträge vor
  dem Merge.
