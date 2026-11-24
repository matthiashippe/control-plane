Schwere: 3
Goal: kunden 13
Befund: Ob 10 Cent für einen Aufruf von Kunde 1 reichen, hängt an `required_cents` seiner 402 (Reservierung aus Prompt und `max_tokens`), und diese Zahl steht in keiner Ledger-Zeile, also sieht kunden 14 bei null Schrittguthaben nicht, ob die Grenze der Grund war.
Beleg: src/inference/proxy.ts:303 (`requiredMc` aus `estimatedPrompt` und `maxTokens`) | src/bounties/house.ts (`HOUSE_STEP_MC = 10_000`)
Empfehlung: kunden 14 liest vor seiner Messung die `required_cents` der letzten 402 von Kunde 1 aus dem Log des Dienstes (nur lesend, nur die Zahl) oder zählt in `ops/customer-work.sh` je Tag die verweigerten Schrittguthaben mit Grund „deckt den Aufruf nicht“.

Ein Automaton schickt meist dasselbe `max_tokens` bei jedem Aufruf. Liegt die Reservierung über 10 Cent, bekommt Kunde 1 auch mit dem neuen Punkt nie eine Antwort, und kunden 14 läse das nur als „Widerlegt“, ohne die Ursache zu kennen.
MVP: Funktion, weil kunden 14 sonst eine falsche Ursache misst.
Übernommen: Glied 6 an den Tech Lead, PRO-28911, in kunden 14 vor dem Start am 26.11. (24.11.2026)
