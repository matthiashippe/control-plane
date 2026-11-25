Schwere: 3
Goal: regeln 01
Befund: Beim Anlegen der Weiterleitung prüft `requireRule10` nur, dass die Daten mit `FORWARDER_SALT` und `FORWARDER_BYTECODE` beginnen. Die angehängten Konstruktor-Argumente (account, destination, token, manager, caller) sind frei, also legt der Gas-Schlüssel auf 8453 auch eine Weiterleitung mit fremdem `caller`, fremdem Token oder fremdem Manager an. Geld bewegt das allein nicht, weil der Kunde die Erlaubnis für genau diese Adresse erst mit dem Passkey unterschreiben muss, aber es ist nicht „seine Weiterleitung“ im Sinn der Ausnahme Hauptnetz.
Beleg: src/konto/chain.ts `requireRule10`, Zweig `to === DEPLOY_PROXY && data.startsWith(kinds.deployPrefix)` | src/konto/payout.ts:174 `forwarderInitCode`
Empfehlung: Ein Goal prüft auf 8453 nach dem Präfix die ABI-kodierten Argumente: token gleich `MAINNET_USDC`, manager gleich `SPEND_PERMISSION_MANAGER`, caller gleich der Adresse des sendenden Schlüssels; dafür bekommt `requireRule10` die Adresse des Kontos. Test: Anlegen mit fremdem caller, Token oder Manager wird verweigert, rot vor dem Fix.
MVP: Funktion, weil der Gas-Schlüssel dann nur Weiterleitungen anlegt, die er selbst bedienen kann und die nur USDC über den Manager bewegen.

Kritik Tech Lead an regeln 01 (PR #430). Nicht als Done-Punkt, weil die Ausnahme Hauptnetz das Anlegen nur über Salt und Bytecode beschreibt und das Goal genau das verlangt; der eine Done-Punkt dieser Kritik deckt den Weg ab, der Geld bewegt.

Übernommen: Tech Lead, PRO-29721 Glied 3 (2026-11-25)
