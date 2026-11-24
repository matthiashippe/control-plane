Schwere: 2
Goal: reichweite 03
Befund: Der Selftest von `ops/video-record.sh` (Wächter gegen Schlüssel, Adressen und Secrets im Transkript, Löschen der Sandbox auch bei Fehler, Abbruch bei 402 und bei einer Antwort von Conway ohne Fehler) läuft in keinem Test unter `test/` und nicht in `check`, also bleibt ein Bruch dieses Wächters grün, bis jemand das Werkzeug von Hand startet.
Beleg: `git grep -c 'video-record' origin/dev -- test scripts package.json; echo rc=$?` -> `rc=1` | ops/video-record.sh:403 (`selftest()`)
Empfehlung: Eine Testdatei `test/video-record-selftest.test.ts` startet `bash ops/video-record.sh --selftest` per `spawn` wie `test/live-selftest.test.ts` und verlangt Exit 0 und als letzte Zeile `VIDEO RECORD SELFTEST OK`, dazu ein Fall mit einer Kopie, deren Wächter `guard` abgeschaltet ist und die rot sein muss.

Belegt ist der Selftest nur als Prüfbefehl in goals/reichweite/03-ein-video-zeigt-den-umzug.md:128, den nach dem Merge niemand mehr fährt. Das Werkzeug lädt den Schlüssel der Wallet des eigenen Kontos in eine Sandbox, und das Transkript landet im öffentlichen Repo.

Linse Q, Frage 1.
Übernommen: Glied 7 an den Tech Lead, PRO-28911 (24.11.2026)
