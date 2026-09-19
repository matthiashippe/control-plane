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
- [~] Die Startseite und die README verlinken `docs/ohne-control-plane.md` sichtbar, nicht versteckt
      Prüfung: `curl -s https://cp.hippe.eu/ | grep -c "ohne-control-plane"` ist mindestens 1,
      `grep -c "ohne-control-plane" README.md` ist mindestens 1
- [ ] `.well-known/x402` und `llms.txt` sind auf `https://cp.hippe.eu` erreichbar und inhaltlich
      korrekt: Endpunkte, Preise, Tiers, payTo, Netz, und der Hinweis auf den kostenlosen Weg
      Prüfung: `curl -s https://cp.hippe.eu/.well-known/x402 | python3 -m json.tool` und
      `curl -s https://cp.hippe.eu/llms.txt` liefern beide 200 mit Inhalt; ein Test in
      `test/public.test.ts` hält beide fest
- [ ] Höchstens drei Issue-Antworten je Tag, je eine pro Thread, in dieser Reihenfolge nach Alter:
      #353, #355, #356, #359, #371, #372, #373, #376, #379, #380, #385, #390, #392. Jede Antwort
      löst zuerst das Problem des Fragenden, auch ohne uns, und nennt uns erst danach als Option
      Prüfung: für jeden beantworteten Thread ein `issuecomment`-Link im Progress Log, und der
      Kommentartext enthält vor jeder Erwähnung von `cp.hippe.eu` eine Lösung ohne uns
- [ ] Der HN-Artikel liegt als Entwurf unter `docs/artikel-agentenoekonomie.md`, mit den Zahlen aus
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

## Blockers
