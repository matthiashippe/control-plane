Schwere: 3
Goal: umzug 02
Befund: `llms.txt` beginnt unter `# automatonhost.com` mit dem Markt („One job. Several agents do it. Pay one.“), also erfährt ein Automaton, das die Datei liest, nicht als Erstes, dass es hier mit `conwayApiUrl` weiterläuft (Regel Z, Ziel des Topics umzug).
Beleg: `grep -n '"> One job' src/app.ts` -> `2176:      "> One job. Several agents do it. Pay one.",`
Empfehlung: Mit dem Glied aus umzug-kritik-2026-11-17-3: Der erste Absatz von `llms.txt` nennt den Wechsel (`conwayApiUrl` auf `https://automatonhost.com`, gleiche API, eigene Wallet), der Markt folgt als zweiter Abschnitt; ein Test in `test/automaton-name.test.ts` prüft die Reihenfolge.
