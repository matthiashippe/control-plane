Schwere: 1
Goal: regeln 02
Befund: Die Reihenfolge der fünf Argumente im Konstruktor der Weiterleitung steht nach regeln 02 dreimal: im erzeugten `FORWARDER_ABI` (`src/konto/forwarder.ts:16`), als fünf namenlose Adressen in `forwarderInitCode` (`src/konto/payout.ts:176`) und neu als `FORWARDER_ARGS` in `src/konto/chain.ts:96`, und nur die erste folgt dem Quelltext des Vertrags.
Beleg: `git grep -n -E '"name": "account"|\{ name: "account", type: "address" \}|\[\{ type: "address" \}, \{ type: "address" \}' origin/dev -- src/konto/forwarder.ts src/konto/chain.ts src/konto/payout.ts` -> `src/konto/chain.ts:97`, `src/konto/forwarder.ts:16` (Konstruktor), `src/konto/payout.ts:176` | src/konto/chain.ts:96
Empfehlung: `FORWARDER_ARGS` aus den `inputs` des Eintrags mit `type: "constructor"` in `FORWARDER_ABI` ableiten und `forwarderInitCode` mit genau dieser Liste kodieren lassen, beim nächsten Goal an `src/konto/`.
MVP: Schönheit

Linse Q, Frage 2. Ändert ein neuer Build des Vertrags die Reihenfolge, prüft `test/konto-forwarder.test.ts` nur das ABI; `forwarderInitCode` und die Sperre aus regeln 02 blieben gemeinsam auf der alten Reihenfolge, und der Test `sends a forwarder deploy on 8453 with the own values` bliebe grün.
