Schwere: 2
Goal: reichweite 01
Befund: Jede Fehlerseite antwortet nur ohne Schrägstrich am Ende; `/errors/<slug>/` und `/errors` antworten 404, auch wenn ein Kommentar in einem Conway-Issue oder ein Leser den Link mit Schrägstrich setzt.
Beleg: `app.request("/errors/verify-500-database-error/")` -> 404 (Tech Lead, Kritik am Kopf afb587e..5e9ee85 von goal/reichweite-01); `/fix/` und `/check/` antworten ebenso 404
Empfehlung: Für die Seiten aus der Sitemap ein 301 von `<pfad>/` auf `<pfad>` und `/errors` als kurze Liste der Fehlerseiten (oder 301 auf `/fix`), mit Test in `test/error-pages.test.ts`; vor reichweite 02, damit kein umgelenkter Kommentar auf eine 404 zeigt.
