Schwere: 2
Goal: regeln 02
Befund: Nach regeln 02 legt der Gas-Schlüssel auf 8453 nur noch Weiterleitungen mit eigenen Werten an, aber `payout` und `retire` gehen an jedes Ziel, das in den Daten als `spender` der Erlaubnis steht (`spenderOf` in `src/konto/chain.ts`). Ein Vertrag mit dem Selektor von `payout` und sich selbst als spender ist damit für den Schlüssel aufrufbar, obwohl er nie über `DEPLOY_PROXY` mit geprüften Argumenten entstand. Geld des Kunden bewegt das nicht (kein `value`, der Schlüssel hält nur Gas), es ist aber nicht „seine Weiterleitung“ im Sinn der Ausnahme Hauptnetz.
Beleg: src/konto/chain.ts `requireRule10`, Zweig `kinds.forwarder.has(selector) && spenderOf(data) === to` | src/konto/payout.ts:183 `forwarderAddress`
Empfehlung: Ein Goal prüft auf 8453 beim Aufruf von `payout` und `retire`, dass das Ziel gleich `forwarderAddress(permission.account, destination, forwarderFixed)` des sendenden Kontos ist. Dafür braucht die Prüfung die destination; wenn sie nicht aus den Daten folgt, bekommt `requireRule10` eine Liste der bekannten Weiterleitungen aus `konto_payouts` oder der Aufrufer reicht sie durch. Test: Aufruf von `payout` an einem fremden Vertrag, der sich als spender einträgt, wird verweigert, rot vor dem Fix.
MVP: Funktion, weil die Ausnahme Hauptnetz dann nur noch Aufrufe an Weiterleitungen zulässt, die der Schlüssel selbst geprüft angelegt hat.

Kritik Tech Lead an regeln 02 (PR #444). Nicht als Done-Punkt, weil die Deny List von regeln 02 den Aufrufweg nicht umfasst und die Frage nach der Quelle der destination einen eigenen Schnitt braucht.
