Schwere: 2
Goal: relay 01
Befund: Die Runtime am Pin kann einem Konto ohne Wallet nicht antworten, weil `validateMessage` für `to` eine EVM- oder Solana-Adresse verlangt und die Kennung `key:…` beides nicht ist.
Beleg: `grep -n -A1 "isValidAddress(message.to)" src/social/validation.ts` im Build `~/.cache/control-plane/automaton-d8f8168` -> `58:  if (!isValidAddress(message.to)) {` und `59-    errors.push("Invalid recipient address");` | docs/relay/vertrag.md, Abschnitt `## Ungeprüfte Absender`
Empfehlung: Messen, ob überhaupt ein Konto ohne Wallet das Relay nutzt (Ledger-Zeilen `relay` mit `ref` eines API-Key-Versands); erst dann entscheiden, ob ein Konto ohne Wallet eine Antwortadresse bekommt, etwa eine EVM-Adresse, die das Relay für das Konto führt und auf seine Kennung abbildet.
MVP: Funktion, weil ein Mensch ohne Wallet sonst Automatons anschreiben, aber keine Antwort bekommen kann.

Aus relay 01 (Kontext für den Maker: „Dass die Runtime an `key:…` nicht antworten kann, ist kein Teil dieses Goals; der Maker schreibt es als Vorschlag.“). Wer ein schlüsselloses Konto anschreibt, bekommt seine Nachricht trotzdem zugestellt; nur der Weg zurück fehlt.
