Schwere: 3
Goal: messung 10
Befund: Zwei Zusagen aus messung 10 hält kein Test fest. Die Fälle in `test/timeout-quote-own-ips.test.ts` und `test/anzeigen-rechnung-own-ips.test.ts` verlangen bei fehlender oder leerer Liste nur Exit 2 und `own_ips` irgendwo im stderr, nicht genau eine Zeile mit dem Präfix `TIMEOUT QUOTE FAIL: ` oder `anzeigen-rechnung: `. Und `fetch_rows` in `ops/timeout-quote.sh` beendet seit messung 10 selbst mit `exit 2` und „ledger not readable“ (vorher der Aufrufer), ohne dass ein Fall einen nicht lesbaren Ledger prüft.
Beleg: test/timeout-quote-own-ips.test.ts (Fälle „stops with exit 2 …“, `toContain("own_ips")`), test/anzeigen-rechnung-own-ips.test.ts (dieselben Fälle), ops/timeout-quote.sh (`fetch_rows`)
Empfehlung: In einem späteren Glied messung: beide Fälle verlangen genau eine nicht leere stderr-Zeile mit dem Präfix des Werkzeugs und `own_ips_checked: `; ein neuer Fall lässt das nachgebaute `ssh` bei der Ledger-Abfrage mit 255 enden und verlangt Exit 2, leeres stdout und genau die Zeile `TIMEOUT QUOTE FAIL: ledger not readable`.
MVP: Qualität, weil die Ausgabe heute stimmt und nur ein späterer Umbau sie unbemerkt ändern könnte.
Übernommen: ROADMAP.md, Glied messung 14 (PR #227) (2026-11-17)
