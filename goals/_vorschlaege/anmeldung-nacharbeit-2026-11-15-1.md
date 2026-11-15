Schwere: 3
Goal: anmeldung 01
Befund: Der neue Test verlangt in allen fünf 201 eines Crawlers `keys_left_today` gleich 4, also auch nach dem fünften Schlüssel, obwohl der sechste Aufruf 429 `crawler_daily_limit` bekommt; der Test hält damit eine falsche Ausgabe fest, die schon für die 200 Plätze gilt (`agentMintsPerDay() - 1` unabhängig vom Verbrauch).
Beleg: `git show origin/dev:test/keyless-crawler.test.ts | sed -n '75p;79p'` -> `for (let i = 0; i < 5; i++) {`, `expect(body.keys_left_today, ...).toBe(4);` | src/app.ts:1786, test/keyless-crawler.test.ts:62 (der sechste Aufruf ist 429), src/auth/keyless.ts:195
Empfehlung: `mintAgentIdentity` gibt aus derselben Transaktion die Zahl der heute noch freien Plätze der jeweiligen Grenze zurück (Grenze minus Zählung nach dem Eintrag), `src/app.ts` gibt sie als `keys_left_today` aus, und der Test verlangt nacheinander 4, 3, 2, 1, 0 für den Crawler und 199, 198 für zwei gewöhnliche Aufrufer; rot vorher mit der heutigen Formel.
MVP: Funktion, weil ein Agent danach an der Antwort sieht, ob er morgen wiederkommen muss, statt bei 0 freien Plätzen „4 übrig“ zu lesen und in ein 429 zu laufen.

Linse Q, Frage 1 (erwartete Ausgabe), Merge 91e1890. Die Goal-Datei (Annahme des Tech Lead, Zeile 49) ließ die Formel bewusst gleich und tauschte nur die Grenze, eine Begründung für den konstanten Wert steht weder dort noch in einer Commit-Message. Kein anderer Test prüft `keys_left_today` (`git grep -n keys_left origin/dev -- test` trifft nur Zeile 78 und 79).
