# Woher kam der erste zahlende Kunde?

Stand 19.09.2026, 23:30. Anlass: Am selben Tag, an dem der Dienst öffentlich wurde, hat eine fremde
Wallet 5 USDC bezahlt. Ohne Artikel, ohne Werbung, ohne Verzeichniseintrag. Die Frage, über welchen
Weg sie kam, entscheidet, wo die nächsten vier herkommen sollen.

## Die Zeitlinie

| Zeit (UTC) | Ereignis |
|---|---|
| ~14:00 | Repo wird öffentlich (github.com/matthiashippe/control-plane) |
| 14:02 | Eigene Wegwerf-Wallet, Abnahmelauf Stufe 1 |
| 14:13 | Abnahmelauf Stufe 2: echte Runtime, fünf Turns gegen Produktion |
| **14:46:18-20** | **Drei Kommentare in den Conway-Issues #339, #377, #393** |
| ~15:00 | PR `xpaysh/awesome-x402#1564` eröffnet (bis heute offen, nicht gemerged) |
| **17:36:16** | **Fremde Wallet `0x0629a685…488e` provisioniert sich** |
| 18:40:42 | Dieselbe Wallet zahlt 5 USDC, on-chain bestätigt (Block 51526948) |
| 20:30 | `/.well-known/x402` und `llms.txt` gehen live (also **nach** ihm) |
| 21:38 | Erster Crawler auf der Startseite |
| 21:44 | Erster Crawler auf `/.well-known/x402` |

**Zwischen unseren Kommentaren und seiner Provisionierung liegen zwei Stunden und fünfzig Minuten.**

## Was es nicht war

- **Der awesome-x402-Eintrag.** Der PR ist bis heute offen und unkommentiert. Das Verzeichnis hat
  542 offene PRs und seit dem 26.07.2026 nichts mehr gemerged (gemessen in
  `2026-09-20-x402-gateway.md`). Als Kanal wertlos.
- **Ein Verzeichniseintrag.** `agent402.tools` listet uns nicht; der vermeintliche Treffer bei der
  Suche nach "hippe" war das Wort "shipped" im Seitentext.
- **Die maschinenlesbaren Endpunkte.** `/.well-known/x402` und `llms.txt` gingen erst drei Stunden
  nach seiner Provisionierung live.
- **Crawler oder Scanner.** Die kamen am Abend und sind als solche erkennbar: Eine AWS-IP rotierte
  drei User-Agents in derselben Sekunde (darunter Chrome 33 aus dem Jahr 2014), eine Azure-IP holte
  mit `python-requests/2.34.2` genau das x402-Manifest. Beide fanden uns vermutlich über die
  Certificate-Transparency-Logs, in denen jedes Let's-Encrypt-Zertifikat sofort auftaucht. Das ist
  Hintergrundrauschen, kein Kanal.

## Was es mit hoher Wahrscheinlichkeit war

**Die drei Kommentare in den Conway-Issues.** Sie sind das einzige Ereignis zwischen dem Öffnen des
Repos und seiner Ankunft, sie richten sich an genau die Menschen, die dieses Problem haben, und der
zeitliche Abstand passt zu jemandem, der einen Issue-Thread liest, den Link öffnet, nachdenkt und
es dann versucht.

Beweisen lässt es sich nicht: Der Referrer seiner ersten Anfrage wäre der Beleg gewesen, und der
ist verloren. Der Caddy-Container wurde am Abend neu erzeugt, bevor das Zugriffslog persistent
war. Das ist der eigentliche Fehler dieses Tages und inzwischen behoben
(`deploy/docker-compose.prod.yml`, Volume `caddy-logs`).

## Was daraus folgt

Drei Kommentare haben innerhalb von drei Stunden einen zahlenden Kunden gebracht. **Dreizehn
weitere liegen fertig geschrieben** in `.scratch/gtm/issue-antworten/`, je einer pro offenem
Thread, und jeder löst zuerst das Problem des Fragenden. Wenn die Vermutung stimmt, ist das der
Kanal, und die Messgröße von fünf zahlenden Betreibern ist keine Hoffnung, sondern Arithmetik.

Zu prüfen ist das ab dem nächsten Kunden, und dann steht der Beleg auch im Log: Referrer und
User-Agent überstehen jetzt einen Neustart.
