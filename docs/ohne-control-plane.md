# Weiterlaufen ohne Control Plane

Diese Seite gehört zum Control Plane, beschreibt aber, wie eine Automaton-Runtime **ohne uns**
weiterläuft, wenn `api.conway.tech` die Provisionierung nicht mehr bedient. Es kostet nichts außer
Arbeit, und wir haben beide Wege selbst durchgespielt, nicht nur im Code nachgelesen.

Alle Codeverweise gehen auf die gepinnte Upstream-Revision
[`Conway-Research/automaton@d8f8168`](https://github.com/Conway-Research/automaton/tree/d8f8168).

## Warum der Automat ohne erreichbaren Kontostand gar nicht denkt

Der API-Key selbst wird nie geprüft. `loadApiKeyFromConfig` (`src/identity/provision.ts:25`) liest
`apiKey` aus `~/.automaton/config.json` und gibt ihn zurück, der HTTP-Client hängt ihn ungeprüft als
`Authorization`-Header an (`src/conway/client.ts:60`). Ein beliebiger String genügt also, um die
Runtime überhaupt zu starten. Ohne diese Datei bricht sie mit `No API key found. Run: automaton
--provision` ab.

Der Abbruch kommt eine Ebene tiefer, beim Geld. Ist `/v1/credits/balance` nicht erreichbar und liegt
kein Kontostand im Cache, liefert `getFinancialState` das Sentinel `creditsCents: -1`
(`src/agent/loop.ts:977-984`). `getSurvivalTier` gibt für jeden negativen Wert `"dead"` zurück
(`src/conway/credits.ts:38-44`), und in der Routing-Matrix hat `dead` für jede Taskart eine leere
Kandidatenliste (`src/inference/types.ts:169-175`). Der Fallback darunter lässt nur Modelle durch,
deren `tierMinimum` der aktuelle Rang erreicht, und `dead` hat Rang 0
(`src/inference/router.ts:193-196, 218-226`). Ergebnis: kein Kandidat, kein Request, null Tokens.

Eine Feinheit, die man kennen muss: **Null Credits sind nicht der tote Zustand.** `getSurvivalTier`
gibt bei einem Kontostand von 0 noch `"critical"` zurück und erst bei einem negativen Wert `"dead"`
(`src/conway/credits.ts:38-44`). Wer pleite ist, denkt also weiter, wenn auch nur mit dem kleinen
Modell. Wer seinen Abrechnungsserver nicht erreicht, denkt gar nicht. Das ist der ganze Unterschied,
um den es hier geht.

Nachgestellt am 19.09.2026 im Container, Upstream `d8f8168`, `conwayApiUrl` auf `https://127.0.0.1:9`
gelegt: `[THINK] Routing inference (tier: dead, model: gpt-5-mini)`, danach Turn um Turn mit
`0 tools, 0 tokens`, und kein einziger ausgehender Inferenz-Request.

## Weg 1: Lokale Modelle über Ollama

Das ist der saubere Weg. Ollama-Modelle werden mit Kosten 0 in die Registry geschrieben
(`src/ollama/discover.ts:70-90`), und der Router lässt kostenlose Modelle an jedem Tier durch, auch
an `dead`: die Bedingung lautet `isFree || tierOk` (`src/inference/router.ts:222-226`).

Nötig sind drei Dinge in `~/.automaton/automaton.json`:

```json
{
  "ollamaBaseUrl": "http://127.0.0.1:11434",
  "modelStrategy": {
    "inferenceModel": "qwen2.5-coder:32b",
    "criticalModel": "qwen2.5-coder:32b",
    "lowComputeModel": "qwen2.5-coder:32b"
  }
}
```

Alternativ tut es die Umgebungsvariable `OLLAMA_BASE_URL`, die Vorrang vor der Konfigurationsdatei
hat (`src/index.ts:281`).

**Die Falle, über die jeder stolpert:** Es gibt zwei Felder namens `inferenceModel`. Das auf oberster
Ebene ist nicht das, welches der Router liest. Der Router nimmt `modelStrategy`
(`src/inference/router.ts:211-216`), und der Setup-Assistent füllt dort weiter `gpt-5.2` und
`gpt-5-mini` ein, auch wenn oben schon das lokale Modell steht. Wir haben genau diesen Fall
gemessen: Ollama war erreichbar, das Modell war registriert (`Ollama: registered 1 model(s)`), und
die Runtime lief trotzdem mit `tier: dead, model: gpt-5-mini` und 0 Tokens durch jeden Turn. Erst
nachdem `modelStrategy.inferenceModel` auf das lokale Modell zeigte, stand im Log
`Routing inference (tier: dead, model: <lokales Modell>)` und der Turn endete mit 18 Tokens, geholt
vom lokalen Server.

Der Automat denkt danach auf eigener Hardware weiter. Was er nicht mehr kann: bezahlte Inferenz,
Sandboxes und alles, was Guthaben voraussetzt.

## Weg 2: Den Kontostand lokal setzen

Wer seinen eigenen OpenAI-Key benutzen will, muss den Tier anheben, und das geht über den
Cache-Pfad. Schlägt der Abruf des Kontostands fehl, liest die Runtime den Schlüssel
`last_known_balance` aus der lokalen KV-Tabelle und nimmt den Wert daraus statt des Sentinels
(`src/agent/loop.ts:961-976`).

```bash
sqlite3 ~/.automaton/state.db \
  "INSERT OR REPLACE INTO kv (key, value, updated_at)
   VALUES ('last_known_balance', '{\"creditsCents\":5000,\"usdcBalance\":0}', datetime('now'));"
```

Dazu der eigene Schlüssel in `automaton.json` als `openaiApiKey`; die Runtime schiebt ihn beim Start
nach `OPENAI_API_KEY` (`src/agent/loop.ts:139-140`).

Gemessen: Nach dem Eintrag steht im Log `Balance API failed, using cached balance` und
`Routing inference (tier: high, ...)` statt `dead`, und der Inferenz-Request geht tatsächlich
hinaus. In unserem Test mit einem absichtlich ungültigen Schlüssel kam er als
`Inference error (openai): 401: Incorrect API key provided` zurück, was genau beweist, was hier
belegt werden sollte: Der Request verlässt die Maschine, die Abrechnungsschicht steht ihm nicht mehr
im Weg.

Ehrlich dazu gesagt: Das ist ein Eingriff in den internen Zustand der Runtime. Der Eintrag ist eine
Behauptung über Geld, die nirgends gedeckt ist. Solange die Runtime nur den eigenen Key verbraucht,
schadet das niemandem außer der eigenen OpenAI-Rechnung. Wer den Wert setzt, sollte wissen, dass
jede Buchhaltung des Automaten ab da Fantasie ist, inklusive dem, was er über seine eigene
Überlebensfähigkeit denkt.

## Weg 3: Ein fertiger Fork, der Weg 1 schon verpackt hat

[`Kiwi172/automaton-local`](https://github.com/Kiwi172/automaton-local) nimmt Ihnen die
Handarbeit aus Weg 1 ab: ein `docker compose up`, und in einem Container laufen Runtime,
Ollama-Server und Wallet-Daemon zusammen. Auf dem Host braucht es nichts außer Docker, kein Node,
keine Ollama-Installation. Gegenüber dem Upstream sind 59 Dateien geändert, und der Fork liegt nur
einen Commit hinter `main` (geprüft am 20.09.2026).

Was Sie wissen sollten, bevor Sie Zeit investieren: Der Fork entstand am 24. und 25. August 2026
und wurde seitdem nicht mehr angefasst. Er hat einen Stern und keine Forks, es hat ihn also
außerhalb des Autors nachweislich noch niemand laufen lassen. Der Weg ist kürzer als Weg 1, und
wenn etwas klemmt, sind Sie allein damit.

Wir nennen ihn trotzdem an dieser Stelle, weil er dasselbe Problem löst wie wir und nichts kostet.

## Wann Sie uns nicht brauchen

Wenn einer dieser Punkte auf Sie zutrifft, gehen Sie einen der beiden Wege oben und sparen Sie das
Geld:

- Sie haben Hardware, auf der ein brauchbares lokales Modell läuft. Dann sind Weg 1 und Weg 3
  dauerhaft besser als jeder bezahlte Dienst, weil sie nichts kosten und niemandem gehören.
- Sie haben ohnehin einen OpenAI- oder Anthropic-Schlüssel mit Guthaben und stört es nicht, den
  Kontostand lokal zu setzen. Dann brauchen Sie von uns nichts.
- Sie wollen den Automaten nur einmal starten sehen und dann weiterziehen.

Wofür wir da sind: Prepaid-Guthaben, das Sie mit USDC auf Base in einem Schritt aufladen, Abrechnung
nach echten Einkaufspreisen mit einem festen Aufschlag, und eine SIWE-Provisionierung, die
funktioniert. Das ist eine Bequemlichkeit, kein Zauber. Die Preise und Endpunkte stehen unter
[cp.hippe.eu](https://cp.hippe.eu) und in `/v1/status`.

## Was wir nicht wissen

Wie viel Arbeit die beiden Wege im Einzelfall kosten, hängt an Ihrer Maschine und daran, wie tief Sie
in die Runtime schauen wollen. Das lässt sich nicht seriös in Stunden angeben. Beide Wege stehen in
keiner Upstream-Dokumentation; man findet sie nur, indem man den Code liest oder diese Seite.
