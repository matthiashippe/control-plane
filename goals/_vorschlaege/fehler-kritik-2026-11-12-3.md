Schwere: 2
Goal: fehler 02
Befund: Der Wächter aus Kritik 2 von fehler 02 läuft nur dort, wo der Cache liegt (code-host), und in CI wird er übersprungen; eine Besucheradresse, die ein Mensch oder ein Lauf ohne Cache committet, kommt ungeprüft nach `dev`.
Beleg: `.github/workflows` hat keinen Zugriff auf `~/.cache/control-plane/fetcher-cache.tsv`; am Kopf von `goal/fehler-02` stehen 71 öffentliche IPv4-Adressen außerhalb der Dokumentationsbereiche in getrackten Dateien, davon keine aus dem Cache.
Empfehlung: Eine Positivliste `ops/known-ips.txt` (Adresse, Art: datacenter, crawler, erfunden, eigene; je Zeile ein Beleg) und ein Test, der in CI jede öffentliche IPv4-Adresse außerhalb von `192.0.2.0/24`, `198.51.100.0/24` und `203.0.113.0/24` in getrackten Dateien ablehnt, die nicht in der Liste steht. Eigenes Glied in fehler, weil die 71 Adressen einzeln belegt werden müssen.
