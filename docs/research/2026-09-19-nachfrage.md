# Nachfrage, Zulauf, Wettbewerb, kostenlose Alternative

Stand 19.09.2026. Anlass: Der GTM-Plan stand auf vier Annahmen, die nie gemessen waren. Alle vier
sind jetzt belegt oder ausdrücklich als nicht ermittelbar markiert. Vier Recherchen liefen
parallel, die tragenden Zahlen habe ich selbst nachgerechnet.

## F1: Wie viel Geld fließt noch an Conway?

Vollständiger Scan der USDC-Transfers an Conways payTo `0x21DD37E3E4eA6CCC0a5C98A4944702eDE6E7Be10`
auf Base, lückenlos vom 01.01.2026 bis 19.09.2026 16:14 UTC (5.652 Chunks à 2.000 Blöcke plus ein
Nachtrag am selben Abend, zusammen 9.026 Transfer-Events).

| Monat | USDC | zahlende Wallets | Transfers |
|---|---:|---:|---:|
| 2026-01 | 0 | 0 | 0 |
| 2026-02 | 37.958,65 | 1.582 | 6.119 |
| 2026-03 | 19.112,44 | 581 | 1.961 |
| 2026-04 | 2.845,00 | 198 | 461 |
| 2026-05 | 1.215,00 | 90 | 198 |
| 2026-06 | 420,00 | 34 | 68 |
| 2026-07 | 360,00 | 24 | 60 |
| 2026-08 | 415,00 | 40 | 83 |
| 2026-09 (bis 19.) | 290,05 | 30 | 76 |

Letzte 30 Tage: 430,05 USDC, 44 Wallets, 104 Transfers. Letzte 7 Tage: 70,04 USDC, 10 Wallets,
30 Transfers. Seit Störungsbeginn 17.07.2026: 950,01 USDC von 89 Wallets in 186 Transfers.

Zwei Dinge, die man hier sehen muss. Erstens: **Der Einbruch kam vor der Störung.** Im April lag
das Volumen schon 93 Prozent unter dem Februar, also drei Monate bevor das Onboarding kaputtging.
Der Markt ist an Interessenverlust gestorben, nicht am Ausfall. Zweitens: **Der Rest zahlt
weiter.** Seit Juni liegt das Volumen stabil zwischen 290 und 430 USDC im Monat, und das für eine
Gegenleistung, die es nicht mehr gibt. 104 Transfers auf 44 Wallets in 30 Tagen heißt: im Schnitt
zwei bis drei Zahlungen je Wallet, was zum Retry-Bug aus Issue #393 passt.

### Beleg

Die Rohdaten liegen unter `data/2026-09-19-conway-payto-transfers.csv` (9.012 Zeilen, keine
Duplikate), die Monatstabelle oben ist daraus mit dem Skript in `data/README.md` reproduzierbar,
ohne den Scan zu wiederholen.

Unsicherheit der Erhebung: Der öffentliche RPC `mainnet.base.org` erlaubt höchstens 2.000 Blöcke je
`eth_getLogs` und antwortet bei schnellen Schleifen mit "over rate limit", weshalb die 5.652 Chunks
sequenziell mit Wiederholung bei Fehlschlag liefen und der Vollscan rund 30 Minuten dauerte. Jeder
Chunk wurde erst nach einer erfolgreichen Antwort als erledigt gezählt, und die Chunk-Grenzen
lückenlos aneinandergesetzt, weshalb der Scan lückenlos ist. `base-rpc.publicnode.com` als
Ausweichknoten antwortet auf Python-urllib mit 403, mit curl geht es. Basescan V1 ist abgeschaltet
und kam nicht in Frage. Was der Datensatz nicht zeigt: ob hinter einer Wallet ein Mensch, ein
Automat oder ein Wiederholungsversuch steht.

Eigene Nachrechnung eines Chunks (Block 51.518.702 bis 51.520.317), erwartet und erhalten:
4 Logs, 10,003386 USDC, 2 Wallets. Am 19.09.2026 um 18:10 von einem zweiten Lauf bestätigt.

```
curl -s -X POST https://mainnet.base.org -H "Content-Type: application/json" \
 -d '{"jsonrpc":"2.0","method":"eth_getLogs","params":[{"fromBlock":"0x3121b6e","toBlock":"0x312233d","address":"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913","topics":["0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",null,"0x00000000000000000000000021dd37e3e4ea6ccc0a5c98a4944702ede6e7be10"]}],"id":1}'
```

Die Wallet `0x71becb56e527ab9284cedb83122a7858a86371ce` hat am 19.09. zwischen 13:46 und 14:05 UTC
viermal 5 USDC geschickt, ohne Gegenleistung. Der Transfer vom 18.09. 18:00:33 UTC von
`0x56de7780…e93b` ist unser eigener Automat beim Erststart.

## F2: Wie viele Betroffene kommen nach?

Zwölf Issues zum Provisionierungsproblem zwischen 17.07. und 29.08.2026 (#339, #353, #355, #356,
#359, #371, #372, #373, #376, #377, #379, #380), dazu drei Grenzfälle (#385, #390, #392).
Betroffene Personen (Autoren und Kommentatoren, ohne Bots, ohne uns): Juli 6, August 12,
September 3. Letzte 30 Tage: 11 Personen. Letzte 14 Tage: 3 Personen, alle als Kommentatoren auf
alten Threads. Über alle zwölf Issues sind es 20 Personen, mit den Grenzfällen 26.

**Seit dem 29.08.2026 wurde kein neues Issue zu diesem Fehler mehr eröffnet**, also seit 21 Tagen.
Wer heute neu ankommt, scheitert vorher an der Installation (#390) oder fragt nach lokalen Modellen
(#385). Die Maintainer haben seit dem 07.03.2026 auf kein Issue mehr geantwortet; der letzte Commit
vom 26.08.2026 änderte die README, das letzte Release ist vom 27.02.2026. Von 52 Issue-Kommentaren
seit dem 17.07. stammt keiner von einem Mitglied der Organisation.

Der identifizierbare Kreis liegt damit bei 26 Personen, davon 20 in den
Provisionierungs-Issues selbst. Die on-chain gemessenen 44 zahlenden
Wallets der letzten 30 Tage sind größtenteils andere, stille Nutzer, die nie ein Issue geschrieben
haben. **Für diese Gruppe existiert kein Kontaktkanal**: eine Wallet-Adresse ist kein Mensch, der
Social-Relay ist tot, Discussions sind deaktiviert, einen Discord gibt es nicht.

### Beleg

Die Personenzahlen je Monat liefert `data/f2-betroffene.sh` (Issue-Liste und Zähldefinition stehen
im Kopf des Skripts). Ausgabe am 19.09.2026: Juli 6, August 12, September 3, gesamt 20, letzte
30 Tage 11, letzte 14 Tage 3; mit den drei Grenzfällen gesamt 26.

Der Zustand des Upstream-Repos:

```
gh api "repos/Conway-Research/automaton/issues?state=all&sort=created&direction=desc&per_page=15" --jq '.[] | select(.pull_request == null) | "\(.number) \(.created_at[0:10])"'
gh api --paginate "repos/Conway-Research/automaton/issues/comments?since=2026-07-17T00:00:00Z&per_page=100" --jq '.[].author_association' | sort | uniq -c
gh api repos/Conway-Research/automaton --jq '{pushed_at}'
```

Unsicherheit: Gezählt sind nur Menschen, die sich auf GitHub gemeldet haben. Wer still aufgab, wer
per Mail schrieb oder wer das Repo nie fand, taucht nicht auf. Die Zahl ist also eine Untergrenze
für die Betroffenen und keine Schätzung der Gesamtzahl.

## F3: Gibt es schon einen Ersatz?

**Null.** Kein einziger zweiter Dienst, kein Fork mit eigener Serverimplementierung. Suche über
GitHub-Code (`conwayApiUrl` 182 Treffer, `api.conway.tech` 187, `cnwy_k_` 83),
1.440 Forks, npm und Web: keine zweite Serverimplementierung. Die vier Forks mit eigenen Commits
zeigen unverändert auf `api.conway.tech`. Zwei Blogposts (Starlog 08.09., BV-7X 18.02.) beschreiben
das Lock-in und empfehlen, die Infrastrukturschicht zu ersetzen, ohne dass es jemand getan hätte.

Reichweite der Runtime über npm nicht messbar: `@conway/automaton` und `@conway/automaton-cli` sind
nicht veröffentlicht, die Installation läuft über `git clone`. Das separate Paket `conway-terminal`
liegt bei rund 500 Downloads im Monat (Februar-Spitze 2.619).

Außerhalb von GitHub ist das Problem unsichtbar: keine Treffer auf Hacker News oder Reddit.
Verwandte kommerzielle Angebote im x402-Umfeld (GPU-Bridge, Clawy, CheapestInference, Verified
Burst, Spraay) verkaufen Inferenz pro Call, aber keiner bedient die Automaton-Runtime.

### Beleg

```
gh api search/code -f q='conwayApiUrl' --jq '.total_count'
gh api repos/Conway-Research/automaton --jq '{forks_count, pushed_at}'
curl -s https://api.npmjs.org/downloads/range/last-year/conway-terminal
```

Korrektur zum Agentenbericht: Die Behauptung, in #393 stehe ein Marketing-Pitch von "scvd.store",
ist falsch. In #393 steht genau ein Kommentar, und der ist unserer.

## F4: Was kann ein blockierter Nutzer umsonst tun?

**Ohne erreichbaren Kontostand geht null Inferenz-Requests hinaus, gemessen an elf Turns in einem
eigenen Containerlauf.** Was ein Ausweg den Nutzer an Arbeit kostet, ist nicht ermittelbar: es
hängt daran, ob er schon Ollama betreibt und ob seine Hardware ein brauchbares Modell trägt.

Die Runtime startet ohne echte Provisionierung: `conwayApiKey` wird nie geprüft, ein beliebiger
String in `automaton.json` genügt (`identity/provision.ts:25-34`, `conway/client.ts:56-64`). Danach
aber gilt: Ist `/v1/credits/balance` nicht erreichbar, liefert `getFinancialState` das Sentinel
`-1` (`agent/loop.ts:978-984`), `getSurvivalTier(-1)` ergibt `dead` (`conway/credits.ts:38-44`),
und die Routing-Matrix hat für `dead` keine Kandidaten (`inference/types.ts:169-175`). Der Fallback
filtert jedes bezahlte Modell über `tierMinimum` heraus (`inference/router.ts:210-229`), der Router
gibt `model: "none"` zurück, und es geht **kein einziger Inferenz-Request** hinaus.

Das habe ich selbst nachgestellt: Upstream-Runtime `d8f8168` im Container, `conwayApiUrl` ins Leere,
eigener OpenAI-Key in der Config. Ergebnis: elf leere Turns in 0,3 Sekunden, `tier: dead`, kein
Aufruf an api.openai.com, danach Schlaf. Der Rat aus Issue #392 ("bypass the system and use openai
api, it works") funktioniert so nicht.

Zwei kostenlose Auswege existieren trotzdem, beide im Docker belegt:

1. **Lokale Modelle.** Ollama-Modelle werden mit Kosten 0 registriert (`ollama/discover.ts:70-87`),
   und `router.ts:222-226` lässt kostenlose Modelle an jedem Tier durch, auch `dead`. Der Agent
   denkt also auf eigener Hardware weiter. Nötig sind `ollamaBaseUrl` auf Loopback und
   `modelStrategy.inferenceModel` (nicht das Top-Level-Feld). In #385 hat das jemand mit
   `qwen2.5-coder:32b` gemacht.
2. **Kontostand fälschen.** Wer `last_known_balance` in die lokale KV-Tabelle schreibt, hebt den
   Tier über den Cache-Pfad (`loop.ts:961-976`); danach geht der Turn direkt an den eigenen
   OpenAI-Key.

Beides steht nirgends dokumentiert und setzt voraus, den Code zu lesen.

### Beleg

Eigener Lauf (Container, kein Netz, danach abgeräumt):

```
docker run --rm -v <vol>:/home/automaton harness-runtime bash -c 'node dist/index.js --run'
# automaton.json: conwayApiUrl=https://127.0.0.1:9, openaiApiKey=sk-proj-DUMMY...
# Log: [THINK] Routing inference (tier: dead, model: gpt-5-mini) ... Turn ...: 0 tools, 0 tokens
```

## Konsequenz für den Plan

**Das Ziel 1 bis 3k USD Marge pro Monat ist mit diesem Markt nicht erreichbar, und zwar nicht
knapp.** Der gesamte Markt zahlt aktuell 290 bis 430 USDC im Monat. Selbst wenn jede der 44 Wallets
zu uns wechselte und ihr Guthaben vollständig verbrauchte, läge unsere Marge bei 30 Prozent des
Einkaufs, also bei rund 100 bis 130 USD im Monat. Realistisch wechselt ein Bruchteil. Um 1 bis 3k
zu erreichen, bräuchte es das Zehn- bis Fünfundzwanzigfache des heutigen Marktes, also das Niveau
von März 2026, das seit einem halben Jahr verschwunden ist.

**Das Ziel 50 provisionierte Automatons in 30 Tagen ist ebenfalls nicht erreichbar.** Es gibt
44 zahlende Wallets im ganzen Markt, und für die meisten existiert kein Kontaktkanal.

Was trotzdem dafür spricht, den Dienst die 30 Tage laufen zu lassen: Er kostet rund 10 EUR im Monat
(VM) plus das OpenRouter-Guthaben, das nur bei tatsächlicher Nutzung abfließt und durch Credits
gedeckt ist. Der Aufbau ist bezahlt und fertig, und es gibt eine stabile Gruppe, die seit Juni
monatlich Geld in ein totes System schiebt, also echten Schmerz hat.

**Entscheidung, bis der Test läuft:**

1. Wir behalten den Dienst und die 30-Tage-Messung, aber mit realistischer Messgröße: **fünf fremde
   Automatons in 30 Tagen**, nicht fünfzig. Unter drei wird abgeschaltet, mit zwei Wochen Vorlauf
   auf der Seite.
2. Die Positionierung ändert sich. Nicht "wir ersetzen Conway", sondern: **die Runtime denkt ohne
   erreichbaren Kontostand überhaupt nicht, und wir liefern genau diese Abrechnungsschicht.** Dazu
   gehört Ehrlichkeit über den kostenlosen Weg (Ollama), denn wer ihn kennt und nutzt, war ohnehin
   kein Kunde, und wer ihn nicht will, versteht dann, wofür er zahlt.
3. Wir dokumentieren den kostenlosen Weg selbst im Repo (`docs/ohne-control-plane.md`) und
   verlinken ihn aus den Issue-Antworten. Das ist der glaubwürdigste Weg, in dieser kleinen
   Community ernst genommen zu werden, und kostet uns nichts, weil dieser Nutzerkreis nie gezahlt
   hätte.
4. Die restlichen Issue-Threads (#353, #355, #356, #359, #371, #372, #373, #376, #379, #380, #385,
   #390, #392) bekommen je eine Antwort, die zuerst das jeweilige Problem löst (auch ohne uns) und uns
   erst danach als Option nennt. Höchstens drei pro Tag.
5. Kein bezahltes Marketing, keine On-Chain-Ansprache der zahlenden Wallets. Letzteres wäre
   technisch möglich (0-Wert-Transaktion mit Calldata), ist aber Spam und beschädigt genau das
   Vertrauen, auf dem der Dienst beruht.
6. Die Frage, ob aus dem Gebauten mehr wird, stellt sich nicht an diesem Markt, sondern am
   Baustein: SIWE-Provisionierung, Prepaid-Credits, idempotentes x402-Settlement und Abrechnung
   nach echten Einkaufskosten sind ein generisches Abrechnungs-Gateway für x402-Dienste. Das ist
   der nächste Prüfauftrag, nicht mehr Reichweite für Conway-Flüchtlinge.
