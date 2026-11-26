# Annahmen regeln

- regeln 02 (Maker, 25.11.2026): Neben Länge, token, manager und caller lehnt `requireRule10` auf 8453 ein Anlegen auch dann ab, wenn eines der fünf Wörter
  hinter dem Präfix keine saubere ABI-Adresse ist (Bits oberhalb der 20 Bytes). `decodeAbiParameters` liest nur die unteren 20 Bytes
  und würde so ein Wort als gültig durchlassen. Der Fehler nennt dann den Namen des Arguments (`account`, `destination`, `token`,
  `manager` oder `caller`). Der normale Weg über `forwarderInitCode` kodiert immer sauber und bleibt grün.
- 2026-11-26, regeln 03: Eine Zeile in `konto_payouts`, deren `retire_*` vor diesem Goal entstand, hat keine `retire_destination`
  (die Spalte kommt per `ALTER TABLE` leer dazu). Ihr `retire` geht ohne `forwarder` hinaus: auf 84532 wie bisher, auf 8453 verweigert
  `requireRule10` es vor der ersten Anfrage. Auf 8453 gibt es noch keine solche Zeile, weil das Hauptnetz erst mit
  `CP_KONTO_MAINNET=1` an ist. Der Weg über `handleOps` (Widerruf mit Passkey) braucht die destination nicht und bleibt unverändert.
- 2026-11-26, regeln 03 (Maker): Der Vergleich `spender === to` aus regeln 01 steht weiter in `requireRule10`, jetzt in
  `forwarderCallFault` über `permissionOf`, das neben dem spender das Konto der Erlaubnis liest; ein Ziel, das nicht der spender ist,
  bekommt wie bisher die schlichte Ablehnung ohne Grund, die beiden neuen Gründe heißen `forwarder destination missing` und
  `not our forwarder`.
