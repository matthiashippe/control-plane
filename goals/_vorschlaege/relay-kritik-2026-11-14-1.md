Schwere: 3
Goal: relay 02
Befund: `canonicalSignature` in `src/relay/signature.ts` hat keinen Test mit festen Werten. Die Tests aus relay 02 laufen über Wallets aus `generatePrivateKey`. Deshalb prüfen sie je Lauf nur einen der beiden Werte von `v` und treffen nie die Grenze `s` gleich `n / 2` (angenommen), `n / 2 + 1` (abgelehnt), `s` gleich 0, das Präfix `0X` oder eine Länge von 132 Hex-Zeichen. Auch ein `poll` oder `count` mit `X-Signature` und `v` als 0 oder 1 ist nicht getestet.
Beleg: test/relay-signature-form.test.ts (alle Fälle über `wallet()`), src/relay/signature.ts:21 (`s > HALF_N`)
Empfehlung: ein Unit-Test `test/relay-signature.test.ts` mit einer Tabelle fester Signaturen für diese Grenzen und beide Werte von `v`. Er ist deterministisch und hält die Grenze fest, falls jemand `>` und `>=` vertauscht. Dazu ein Fall `poll` mit `v` als 0 oder 1, der dieselbe Antwort bekommt wie der erste `poll`.
Übernommen: Triage-Glieder 14.11. an den Tech Lead, Glied 2 (Tabelle fester Signaturen für `canonicalSignature`) (2026-11-14)
