Schwere: 3
Goal: kunden 16
Befund: Eine Inferenz reserviert den Preis von geschätztem Prompt und vollem `max_tokens`; reicht das Guthaben dafür nicht, kommt 402, auch wenn es den Prompt und eine kürzere Antwort decken würde. Die Runtime am Pin fragt immer mit 4096 Tokens und wiederholt eine 402 nicht, also bleibt der Rest eines Kunden ungenutzt liegen, und die Runtime hört auf, obwohl noch Credits da sind (Kunde 1 aus `docs/kunden/sandbox-kunde-2026-11.md`).
Beleg: `src/inference/proxy.ts` (`requiredMc = costMc(… completion_tokens: maxTokens)`, danach `reserveMc`, bei `false` 402) | `docs/kunden/sandbox-kunde-2026-11.md`, Abschnitt Befund, vierter Punkt
Empfehlung: Deckt das Guthaben den Prompt und mindestens 256 Tokens Antwort, `max_tokens` auf das Bezahlbare kürzen und die Antwort mit `finish_reason: length` liefern, statt 402; sonst 402 wie heute, mit `details.affordable_max_tokens` im Body. Test: Guthaben knapp über Prompt plus 256 Tokens ergibt 200 mit gekürztem `max_tokens`, knapp darunter 402. Vorher lesend messen, wie viele fremde Wallets heute mit einem Rest unter der Reservierung ihrer letzten Anfrage stehen.
MVP: Funktion, weil ein Kunde, der seine letzten Credits nicht nutzen kann, mit dem Gefühl geht, sein Geld sei verfallen, und ein Rest von wenigen Cent die Runtime trotzdem anhält.
Übernommen: Tech Lead, PRO-31352 Glied 4 (2026-11-27)
