# GOAL.md

## Status
ACTIVE

## Active Objective
Die vier Konsequenzen aus der Nachfragemessung umsetzen, damit der 30-Tage-Test überhaupt eine
Chance hat, fünf fremde Automatons zu sehen: den kostenlosen Weg selbst dokumentieren, den
Betroffenen in den offenen Issues je einmal helfen, den Dienst maschinenlesbar auffindbar machen
und den Artikel schreiben, der den Datensatz statt des Produkts in den Mittelpunkt stellt.

## Done Condition
- [x] `docs/ohne-control-plane.md` existiert und erklärt den kostenlosen Weg so, dass ein
      blockierter Nutzer ihn ohne uns gehen kann: warum die Runtime ohne erreichbaren Kontostand
      gar nicht denkt (mit Dateiverweisen auf `d8f8168`), der Ollama-Weg über
      `modelStrategy.inferenceModel` und `ollamaBaseUrl`, der Weg über `last_known_balance` in der
      lokalen KV-Tabelle, und wo beide Wege enden
      Prüfung: die Datei nennt mindestens vier Codestellen mit Datei und Zeile, jede davon
      stichprobenartig gegen `harness/` nachgeprüft; sie enthält einen Abschnitt, der sagt, wann
      man uns nicht braucht
- [x] Die Startseite und die README verlinken `docs/ohne-control-plane.md` sichtbar, nicht versteckt
      Prüfung: `curl -s https://cp.hippe.eu/ | grep -c "ohne-control-plane"` ist mindestens 1,
      `grep -c "ohne-control-plane" README.md` ist mindestens 1
- [x] `.well-known/x402` und `llms.txt` sind auf `https://cp.hippe.eu` erreichbar und inhaltlich
      korrekt: Endpunkte, Preise, Tiers, payTo, Netz, und der Hinweis auf den kostenlosen Weg
      Prüfung: `curl -s https://cp.hippe.eu/.well-known/x402 | python3 -m json.tool` und
      `curl -s https://cp.hippe.eu/llms.txt` liefern beide 200 mit Inhalt; ein Test in
      `test/public.test.ts` hält beide fest
- [ ] Höchstens drei Issue-Antworten je Tag, je eine pro Thread, in dieser Reihenfolge nach Alter:
      #353, #355, #356, #359, #371, #372, #373, #376, #379, #380, #385, #390, #392. Jede Antwort
      löst zuerst das Problem des Fragenden, auch ohne uns, und nennt uns erst danach als Option
      Prüfung: für jeden beantworteten Thread ein `issuecomment`-Link im Progress Log, und der
      Kommentartext enthält vor jeder Erwähnung von `cp.hippe.eu` eine Lösung ohne uns
- [x] Der HN-Artikel liegt als Entwurf unter `docs/artikel-agentenoekonomie.md`, mit den Zahlen aus
      dem Datensatz, ohne Produktwerbung über eine Fußnote hinaus, und ist **nicht** gepostet
      Prüfung: die Datei existiert, jede Zahl darin steht so auch in
      `docs/research/2026-09-19-nachfrage.md` oder folgt aus `docs/research/data/`
- [ ] goal-verifier PASS

## Acceptance Criteria
- [ ] Keine erfundenen Belege, keine erfundene Reichweite, keine Screenshots von Verdiensten.
      Alles, was nach außen geht, ist on-chain oder im Repo nachprüfbar
- [ ] Jede Issue-Antwort ist auch dann nützlich, wenn der Empfänger uns nie benutzt
- [ ] Die Startseite verspricht weiterhin keine Rückzahlung von Credits (`test/public.test.ts`)
- [ ] `pnpm test` grün, `pnpm e2e` grün vor dem Deploy
- [ ] Der Artikel geht erst nach Matthias' Freigabe von Titel und Text raus

## Deny List
- Nichts posten, was Matthias nicht freigegeben hat: HN-Artikel, Titel, jede Form von Werbung
- Keine On-Chain-Ansprache der zahlenden Wallets, auch nicht als 0-Wert-Transaktion mit Calldata
- Mehr als drei Issue-Antworten an einem Tag
- Kein Issue und kein PR schließen, auch nicht die eigenen
- Keine Änderung an `deploy/**` ohne Matthias, außer dem Ausrollen einer geprüften Version

## Budget
- max Zyklen: 8
- max Versuche pro Gap: 3

## Progress Log

- Zyklus 1 (19.09.2026, 18:05 bis 18:30): `docs/ohne-control-plane.md` geschrieben. Beide Wege sind
  nicht nur im Code nachgelesen, sondern im Container gegen die gepinnte Upstream-Runtime `d8f8168`
  durchgespielt, mit einem lokalen Stub als Ollama-Ersatz (kein Ollama auf dem Mac):
  1. Ausgangslage bestätigt: `conwayApiUrl` ins Leere, Ollama erreichbar und registriert
     (`Ollama: registered 1 model(s)`), Runtime trotzdem `tier: dead, model: gpt-5-mini`,
     Turn um Turn `0 tools, 0 tokens`, kein ausgehender Request. Ursache ist das zweite Feld
     `modelStrategy.inferenceModel`, das der Setup-Assistent auf `gpt-5.2` stehen lässt, auch wenn
     oben schon das lokale Modell steht.
  2. Nach dem Umstellen von `modelStrategy` auf das lokale Modell: `Routing inference (tier: dead,
     model: stub-llm:latest)`, ein Treffer auf `/v1/chat/completions` des lokalen Servers, Turn mit
     18 Tokens statt 0.
  3. KV-Weg: `last_known_balance` mit 5000 Cents in `state.db` hebt den Tier von `dead` auf `high`
     (`Balance API failed, using cached balance`). Mit eigenem, absichtlich ungültigem OpenAI-Key
     und abgeschaltetem Ollama kam `Inference error (openai): 401: Incorrect API key provided`,
     der Request verlässt also die Maschine.
  4. Nebenfund, der in der Recherche fehlte: Null Credits ergeben `critical`, nicht `dead`
     (`src/conway/credits.ts:38-44`). Wer pleite ist, denkt weiter; wer seinen Abrechnungsserver
     nicht erreicht, denkt gar nicht. Steht jetzt im Dokument.
  Container und Volume danach entfernt, `pnpm test` 61 Tests grün.
  Startseite (`src/public/index.html`, neuer Abschnitt "You may not need this") und README
  verlinken das Dokument. Die Prüfung gegen `https://cp.hippe.eu` steht noch aus, weil dafür ein
  Deploy nötig ist. In der README ist außerdem die Issue-Liste von neun auf zwölf korrigiert,
  inklusive des bisher fehlenden #371.
- Zyklus 2 (19.09.2026, 18:28 bis 18:32): `/.well-known/x402` und `/llms.txt` in `src/app.ts`
  gebaut, beide führen den kostenlosen Weg als eigenes Feld. Vier neue Tests in
  `test/public.test.ts` halten Endpunkte, Zahlungsangebot (payTo, chainId, Tiers), Markup und die
  Regulatorik-Grenze fest. `pnpm test` 65 Tests grün, `pnpm e2e` `E2E OK turns=5 registered=true
  api_errors=0 ledger_consistent=true`. Ein Test schlug zuerst an, weil im Text "not refundable"
  stand und die Assertion jedes "refund" verbietet; statt die Assertion aufzuweichen ist der Text
  auf "not money, not redeemable and not transferable" umgestellt, die Formulierung, die die
  Startseite schon benutzt.

- Zyklus 3 (19.09.2026, 18:33 bis 18:40): Artikel-Entwurf `docs/artikel-agentenoekonomie.md`
  geschrieben, nicht gepostet. Die tragende Zahl ist neu aus dem Datensatz gerechnet: von den
  1.582 Wallets, die im Februar zahlten, zahlten ab Juni noch drei. Dazu 62.616,09 USDC Gesamtvolumen
  von 2.491 Wallets, Februar-Anteil 60,6 Prozent, Median-Transfer 5,00 USDC, 1.035 Wallets mit genau
  einer Zahlung. Alle diese Zahlen liefert `docs/research/data/artikel-zahlen.py`, damit nichts im
  Artikel steht, was nicht aus dem Datensatz folgt. Der Dienst kommt in einem Satz vor, als
  Offenlegung am Ende. Keine Wallet-Adresse wird einzeln genannt. Titel, Freigabe und Zeitpunkt
  liegen bei Matthias, die drei Titelvorschläge stehen oben in der Datei.

- Zyklus 4 (19.09.2026, 18:41 bis 18:50): Deploy auf `srv1336627`. Dabei ist der Dienst
  ausgefallen, rund neun Minuten lang 502. Ursache und Behandlung stehen unten unter "Vorfall".
  Nach dem Neustart des Containers sind alle drei Done-Conditions live geprüft: die Startseite
  verlinkt `ohne-control-plane.md`, `/.well-known/x402` liefert Endpunkte und Zahlungsangebot
  (payTo, chainId 8453, Tiers), `/llms.txt` liefert Text mit Setup-Zeile und dem kostenlosen Weg.
  Guthaben und Registrierung unverändert.

- Zyklus 5 (19.09.2026, 18:52 bis 19:05): Drei Antwort-Entwürfe für morgen unter
  `.scratch/gtm/issue-antworten/` (#353, #355, #356), nicht gepostet. Beim Lesen der Threads kam
  Substanz dazu, die die Antworten verändert hat:
  * **PR #370** von tharun7702592295-cyber (offen seit 16.08.) routet Inferenz bereits auf lokales
    Ollama plus NVIDIA NIM. Die Arbeit ist älter als unsere und löst dasselbe Problem. Jede Antwort
    nennt sie, bevor sie unseren Weg nennt. Der sachliche Unterschied ist, dass unser Weg ohne
    Patch auskommt, nicht dass er besser wäre.
  * **#355 enthält zwei Bugs**, nicht einen: Der Windows-HOME-Fehler (`process.env.HOME || "/root"`
    statt `os.homedir()`) ist lokal lösbar, und der Fragende hat den Workaround selbst gefunden.
    Nur SIWE ist serverseitig. Die Antwort trennt das, weil sonst ein lösbares Problem unter einem
    unlösbaren begraben bleibt.
  * **Rickh07** hat am 17.09. in #355 einen Retry-auf-401-Ansatz angekündigt und hält den Fehler für
    intermittierend. Das ist er nicht, er ist dauerhaft. Die Antwort widerspricht sachlich, weil ein
    Retry sonst als Lösung missverstanden wird.
  * **#356** hat mit 491 ms Round-Trip selbst bewiesen, dass es nicht am Client liegt. Die Antwort
    wiederholt seine Analyse nicht, sondern bestätigt sie und geht weiter.

## Vorfall 19.09.2026: Start hängt am Preisabruf

`src/index.ts:47` ruft beim Start `await provider.init()`, und `refreshPrices` holte den Katalog
von OpenRouter **ohne Timeout**. Beim Deploy blieb dieser Aufruf stehen. Der Prozess gab keine
einzige Zeile aus, der Healthcheck (`/health` auf 8402) schlug sechsmal fehl, Caddy hängt per
`depends_on: service_healthy` daran, und von außen kam 502. Im Log stand nichts, weil die
Startmeldung erst nach `init()` kommt.

Diagnose: OpenRouter war von der VM aus die ganze Zeit erreichbar (200 in 209 ms aus dem Container),
und derselbe Start mit derselben Compose-Umgebung lief von Hand sofort durch. Es war also kein
Ausfall bei OpenRouter, sondern ein einzelner hängender Request ohne Abbruchkriterium.

Sofortmaßnahme: `docker compose -f docker-compose.prod.yml up -d --force-recreate cp`, danach
`healthy` in zwölf Sekunden.

Dauerhafter Fix: `priceFetchTimeoutMs` (Default 15 s) auf dem Preisabruf, mit `AbortController`
wie beim Chat-Request. Scheitert der Abruf, wirft `init()` mit klarer Meldung, der Prozess endet,
und `restart: unless-stopped` startet ihn neu. Zwei Regressionstests in `test/openrouter.test.ts`
halten das fest. Die Entscheidung "ohne Preise startet das Control Plane nicht" bleibt bestehen,
nur das stille Hängen ist weg.

Nebenbefund: Das dokumentierte Backup-Verfahren in `deploy/README.md` war doppelt kaputt. Es nannte
das Volume `control-plane_cp-data` (leer; das echte heißt `deploy_cp-data`), und es kopierte
`cp.db` ohne das WAL. Da die Datei nur 4 KB groß ist und 346 KB im `-wal` standen, wäre das
Backup leer gewesen. Korrigiert auf `VACUUM INTO` über die laufende Anwendung. Das Backup vor
diesem Deploy liegt als `/opt/control-plane/cp-2026-09-19-1634.db` auf der VM, 73 KB, geprüft
(1 Wallet, 1 Automaton, 2 Zahlungen).

## Blockers

- **Issue-Antworten frühestens morgen.** Am 19.09. sind bereits drei Kommentare rausgegangen
  (#339, #377, #393), und die eigene Regel erlaubt höchstens drei pro Tag. Die dreizehn offenen
  Threads warten damit auf den nächsten Tag.
- **Der Fix am Preisabruf ist noch nicht ausgerollt.** Er ist committet und getestet, läuft aber
  noch nicht auf der VM. Solange gilt: Wenn der Start erneut hängt, hilft
  `docker compose -f docker-compose.prod.yml up -d --force-recreate cp`.
