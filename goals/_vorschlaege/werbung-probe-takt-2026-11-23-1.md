Schwere: 3
Goal: werbung 02
Befund: Die Zahl, ob Agenten-Sessions uns einem Betreiber empfehlen, gilt je Woche, aber kein Lauf startet die Messung jede Woche; seit werbung 02 gibt es nur den ersten Lauf vom 23.11.2026.
Beleg: `grep -cE '^- [0-9]{4}-[0-9]{2}-[0-9]{2}T' docs/kunden/agenten-probe.md` -> 1
Empfehlung: Der Richtungs-Check fährt als ersten Schritt `bash ops/agent-probe.sh` und `bash ops/traffic.sh 168 | sed -n '/^-- Agent fetches --$/,/^$/p'` auf dem code-host nach `set -a; . ~/.config/control-plane/loop.env; set +a` und legt die neue Zeile, die Antworten der Woche und den Block in seinen PR (`docs/kunden/agenten-probe.md`, `docs/kunden/agenten-probe/<JJJJ-Www>.md`); mehr als ein Lauf je Woche bricht das Werkzeug selbst ab.
MVP: Funktion, weil erst die zweite Woche zeigt, ob eine Änderung an Seiten, `/llms.txt` oder Kommentaren die Empfehlung der Agenten bewegt.
Übernommen: Glied 4 an den Tech Lead, PRO-28911 (24.11.2026)
