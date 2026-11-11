Schwere: 2
Goal: abrechnung 01
Befund: Bricht der Client ab, bevor der Anbieter antwortet, schreibt `inference_aborts` einen Einkaufspreis von 0 und keine `ref`, obwohl OpenRouter eine abgebrochene Anfrage ohne Stream trotzdem berechnen kann; unser Einkauf ohne Verkauf ist damit zu niedrig gezählt.
Beleg: src/inference/proxy.ts:440 (`if (signal.aborted) return abandon(null);`, `purchaseMc` bleibt 0)
Empfehlung: abrechnung 02 gleicht die Zeilen mit `answered = 0` gegen die Abrechnung des Anbieters ab (Aktivität je Tag und Modell), bevor es mit ihnen die Timeout-Quote und die Anbieterwahl begründet.
MVP: Funktion, weil abrechnung 02 sonst schnellere Anbieter mit einer zu kleinen Kostenzahl begründet.

Übernommen: abrechnung 04 (ROADMAP.md, goals/abrechnung/04-einkauf-abgebrochener-anfragen-gegen-die-abrechnung-des-anbieters.md) (2026-11-11)
