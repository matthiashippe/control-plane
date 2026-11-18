Schwere: 2
Goal: umzug 01
Befund: Nennt `CP_PUBLIC_URL` einen Host außerhalb von `SERVICE_HOSTS` (Tippfehler beim Wechsel in umzug 02, etwa `automatonhost.de`), leitet die Middleware jede Seite aller drei Hosts per 301 auf einen Host, den Caddy nicht bedient; erst `ops/live.sh` (`no canonical host`) und der Revert fangen das, und ein 301 bleibt in Browsern gecacht.
Beleg: `src/app.ts` Middleware nach `PAGES_STAY` prüft nur, ob der anfragende Host in `SERVICE_HOSTS` steht, nicht `siteHost()`
Empfehlung: In umzug 02 vor dem Wechsel: Steht `siteHost()` nicht in `SERVICE_HOSTS`, leitet die Middleware nichts weiter und loggt einmal eine Warnung; dazu ein Fall in `test/automatonhost.test.ts`.
Übernommen: auf dev erledigt mit umzug 02 Punkt 8 (PR #252) (2026-11-18)
