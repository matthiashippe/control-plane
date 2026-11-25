# Annahmen regeln

- regeln 02 (Maker, 25.11.2026): Neben Länge, token, manager und caller lehnt `requireRule10` auf 8453 ein Anlegen auch dann ab, wenn eines der fünf Wörter
  hinter dem Präfix keine saubere ABI-Adresse ist (Bits oberhalb der 20 Bytes). `decodeAbiParameters` liest nur die unteren 20 Bytes
  und würde so ein Wort als gültig durchlassen. Der Fehler nennt dann den Namen des Arguments (`account`, `destination`, `token`,
  `manager` oder `caller`). Der normale Weg über `forwarderInitCode` kodiert immer sauber und bleibt grün.
