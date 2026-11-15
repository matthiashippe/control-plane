Schwere: 2
Goal: keines
Befund: Caddy überschreibt das `Referrer-Policy: no-referrer` von `/h/{code}` (Entscheidung 7 in konto 02) mit dem globalen `strict-origin-when-cross-origin`, weil `-Server` im selben `header`-Block alle Kopfzeilen des Blocks auf die Antwort verschiebt; die Tests der App sehen `no-referrer`, die Produktion nicht.
Beleg: Caddy v2.11.7 lokal mit diesem Block vor einem Upstream, der `no-referrer` setzt: `curl -s -D - -o /dev/null http://127.0.0.1:<port>/ | grep -i referrer` -> `Referrer-Policy: strict-origin-when-cross-origin` | deploy/Caddyfile:22
Empfehlung: In `deploy/Caddyfile` (Zeilen 22 und 79) `Referrer-Policy "?strict-origin-when-cross-origin"` setzen, damit Caddy nur einen fehlenden Wert ergänzt, und `ops/live.sh` prüft nach dem Rollout an `/h/<code>` die Kopfzeile `no-referrer`. Heute ohne Schaden, weil der Pfad auch so nicht an fremde Seiten geht und die Seite nichts von außen lädt; konto 03 legt dort aber die Kontoanlage ab.
Übernommen: konto 03 Punkt 12 nach Entscheidung des Tech Lead (84282c6), Goal BLOCKED matthias (PRO-20104, Draft-PR #104) (2026-11-14)
