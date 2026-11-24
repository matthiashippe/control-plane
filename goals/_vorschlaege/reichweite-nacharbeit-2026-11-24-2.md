Schwere: 2
Goal: reichweite 03
Befund: `ops/video-record.sh` kopiert rund 113 Zeilen aus `ops/automaton-live.sh`, darunter die Wahl des Modells `MODEL_JS` mit dem Filter gegen Claude und Anthropic (Grundregel 11) Zeichen für Zeichen, und kein Test hält beide Fassungen gleich.
Beleg: `git grep -n '^MODEL_JS=' origin/dev -- ops` -> `ops/automaton-live.sh:69` und `ops/video-record.sh:52` mit gleichem Inhalt; `comm -12 <(git show origin/dev:ops/video-record.sh | sed 's/^ *//' | awk 'length>20' | sort -u) <(git show origin/dev:ops/automaton-live.sh | sed 's/^ *//' | awk 'length>20' | sort -u) | wc -l` -> `113` | ops/video-record.sh:52
Empfehlung: Im nächsten Goal, das `ops/automaton-live.sh` ändern darf, `MODEL_JS`, `api`, `rpc_call`, `json_field` und das Löschen der Sandbox in eine Datei unter `ops/` legen, die beide Skripte per `source` einbinden (wie `ops/own-ips.sh`); bis dahin ein Test, der verlangt, dass `MODEL_JS` in beiden Dateien gleich ist.

Die Kopie war erzwungen, weil die Deny List von reichweite 03 `ops/automaton-live.sh` sperrt. Sie ist auch der Grund, warum `ops/video-record.sh` neu mit 646 Zeilen kommt, ohne dass eine Commit-Message des Goal-Branches die Größe begründet (`git log --format=%B b2f58e7^1..b2f58e7^2 | grep -ciE '500|zeilen|größe'` -> `0`). Lockert ein späteres Goal den Modellfilter nur in einer Datei, wählt die andere weiter nach der alten Regel.

Linse Q, Frage 2.
