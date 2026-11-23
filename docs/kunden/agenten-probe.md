# Empfehlen uns Agenten?

Gemessen wird, ob eine frische Agenten-Session einem Betreiber mit kaputtem Conway-Automaton automatonhost.com empfiehlt und den
Weg per Karte nennt: `bash ops/agent-probe.sh` stellt einmal je Woche fünf feste Fragen an je eine frische Claude-Code-Session
mit Websuche, ohne Repo, Gedächtnis und unsere Schlüssel, und hängt unten eine Zeile an, die Antworten stehen im Wortlaut unter
`docs/kunden/agenten-probe/`. Daneben zählt der Block `-- Agent fetches --` aus `bash ops/traffic.sh 168`, wie oft Agenten
unsere Seiten für einen Menschen holen (`Claude-User`, `ChatGPT-User` und ähnliche), getrennt von unseren eigenen Abrufen.

## Abrufe von Agenten

Gemessen: 2026-11-23T15:09:41Z

Befehl auf dem code-host nach `set -a; . ~/.config/control-plane/loop.env; set +a`, nur lesend (das Zugriffslog kommt über
`ops/access-log.sh`). Der Lauf schrieb die ganze Ausgabe in eine Datei außerhalb des Repos, darauf lief dasselbe `sed`, weil der
Rest der Ausgabe Adressen trägt:

bash ops/traffic.sh 168 | sed -n '/^-- Agent fetches --$/,/^$/p'

```
-- Agent fetches --
   8 agent fetch(es) in the last 168 hours, 0 from our own addresses
      7  Claude-User
      1  ChatGPT-User
      0  Perplexity-User
      0  MistralAI-User
      0  DuckAssistBot

```

Leitzahl: 8 Abrufe von Agenten für einen Menschen in 7 Tagen, keiner von unseren eigenen Adressen.

Gegenprobe mit eigenem Code auf demselben Zugriffslog (jq statt Python, gegen 15:16 UTC gelesen): 8 Anfragen, deren User-Agent
`Claude-User` oder `ChatGPT-User` nennt, im selben Fenster, keine von einer eigenen Adresse. Ein einfaches `grep -o` über die
User-Agents zählt 11, weil der User-Agent von `Claude-User` den Namen zweimal trägt (`Claude-User/1.0; +Claude-User@…`); der Block
zählt Anfragen, nicht Vorkommen. Zwei dieser Abrufe bekamen 404 (`/docs` und `/pricing` am 2026-11-23 um 13:58 UTC), das steht
als Fehler eines echten Nutzers in `goals/_vorschlaege/werbung-fehler-2026-11-23-1.md`.

## Läufe

Erster Lauf am 23.11.2026: Keine der fünf Antworten nennt automatonhost.com, keine Session scheiterte. Zwei Antworten (q1, q3)
fanden in den Conway-Issues den Hinweis, `conwayApiUrl` auf ein fremdes Control Plane umzustellen, und nannten ihn ohne Namen als
Werbung des Betreibers; q5 rät ausdrücklich davon ab, `conwayApiUrl` auf einen fremden Dienst zu stellen, und q4 kennt keinen Weg
ohne Krypto außer USDC per Karte zu kaufen.

- 2026-11-23T15:09:34Z 2026-W48 model claude-opus-5-5 host 0/5 card 0/5 old 0/5 failed 0/5 answers docs/kunden/agenten-probe/2026-W48.md
