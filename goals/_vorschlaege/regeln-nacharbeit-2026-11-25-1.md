Schwere: 1
Goal: regeln 01
Befund: `test/konto-send-guard.test.ts` legt den nachgebauten Knoten `node(chainIdHex)` ein drittes Mal an, fast Zeile für Zeile wie `test/konto-mainnet.test.ts:34` und `test/konto-chain.test.ts:14`, obwohl es mit `test/money-helpers.ts` schon eine gemeinsame Datei für nachgebaute Knoten gibt.
Beleg: `git grep -n -E '^function node\(' origin/dev -- test/konto-send-guard.test.ts test/konto-mainnet.test.ts test/konto-chain.test.ts` -> `test/konto-chain.test.ts:14`, `test/konto-mainnet.test.ts:34`, `test/konto-send-guard.test.ts:30`; `diff <(sed -n 30,50p test/konto-send-guard.test.ts) <(sed -n 34,54p test/konto-mainnet.test.ts)` -> nur die Zeile `default:` unterscheidet sich (Fehlercode -32601) | test/konto-send-guard.test.ts:30
Empfehlung: `node(chainIdHex)` mit dem Zweig `default` samt Code -32601 nach `test/money-helpers.ts` ziehen und in `test/konto-send-guard.test.ts`, `test/konto-mainnet.test.ts` und `test/konto-chain.test.ts` importieren, beim nächsten Goal an einer dieser Dateien.
MVP: Schönheit

Linse Q, Frage 2. Die drei Kopien weichen schon jetzt im Zweig `default` ab: Nur die neue antwortet wie ein Knoten ohne die Methode, die anderen werfen einen Fehler ohne Code, auf den viem anders reagieren kann.
