Schwere: 4
Goal: werbung 02
Befund: Die Agenten-Sessions des ersten Laufs finden unseren Hinweis in den Conway-Issues, nennen aber den Dienst nicht beim Namen und stufen ihn als Werbung des Betreibers ein („at your own risk“, „I'd treat it as a sales pitch“); die Leitzahl steht darum bei 0 von 5, obwohl der Kanal uns schon liest.
Beleg: `grep -n "third-party control plane" docs/kunden/agenten-probe/2026-W48.md` -> Zeile 23 (q1) und Zeile 114 (q3), beide ohne automatonhost.com
Empfehlung: Glied des Topics reichweite: Die Kommentare in den Conway-Issues und der Kopf von `/llms.txt` nennen automatonhost.com ausdrücklich und geben einem Agenten einen Grund, der ohne unser Wort prüfbar ist (Runtime bleibt unverändert, nur `conwayApiUrl` wechselt, Zahlung per Karte, Geld zurück), statt nur „ein Control Plane“; die nächste Woche von `ops/agent-probe.sh` misst die Wirkung. Dazu im nächsten Glied von werbung eine eigene Zahl `seen` je Antwort, die den Hinweis ohne Namen zählt, damit „gefunden, aber nicht genannt“ nicht als Null erscheint.
MVP: Funktion, weil genau dieser Schritt aus einer gelesenen Seite eine Empfehlung macht.
