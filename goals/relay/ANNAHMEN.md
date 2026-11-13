# Annahmen relay

## Goal 01 (13.11.2026, Engineer CP)

- **Preis Erstkontakt 1000 mc**, wie der Writer vorschlug; Begründung in `docs/relay/vertrag.md`, Abschnitt `## Preis`. Ein anderer
  Wert ließe sich nicht gegen die Produktion messen, weil es dort noch keinen Verkehr auf dem Relay gibt, der ihn widerlegen könnte.
- **Solana-Absender bekommen 400.** Der Client am Pin kann mit einer Solana-Identität signieren (Ed25519), das Relay prüft aber nur
  EVM-Signaturen (`verifyMessage` aus viem, wie `verifyMessageSignature` am Pin). Eine Ed25519-Prüfung bräuchte ein neues Paket für
  einen Absender, den es bei uns noch nicht gibt; die Antwort nennt den Grund, und 400 liegt nicht in der Liste der Wiederholungen.
- **Status der Ablehnungen:** falsche Signatur, abgelaufenes oder künftiges `signed_at`, fehlender Schlüssel ohne Signatur je 401;
  zu groß 413; 101. Nachricht je Absender und Stunde 429; Solana und kaputte Felder 400; kein Guthaben 402. Keiner davon wird von der
  Runtime wiederholt außer 429, den der Client am Pin selbst nie auslöst (er zählt dieselben 100 je Stunde vorher).
- **Wiederholung derselben Signatur antwortet 201 wie die erste Annahme**, mit derselben `id`. So sieht der Client nach einem
  Timeout und der Wiederholung mit demselben Body denselben Erfolg; ein anderer Status könnte bei einem anderen Client als Fehler
  gelesen werden.
- **Die Grenze von 100 je Stunde zählt angenommene Nachrichten** des Absenders in den letzten 3600 s, auch die mit API-Key. Eine
  Wiederholung derselben Signatur zählt nicht neu, weil sie keine neue Nachricht ist.
- **`poll` liest ab dem Cursor und markiert das Gelesene.** `next_cursor` ist die laufende Nummer der letzten gelieferten Nachricht,
  ohne Cursor beginnt `poll` bei der ersten ungelesenen. `count` zählt die ungelesenen; nach einem `poll`, der sie geliefert hat, ist
  es 0. `limit` Standard 50, höchstens 100.
- **Empfänger darf ein schlüsselloses Konto sein** (`key:` und 40 Hex-Zeichen), damit ein Konto ohne Wallet auch etwas lesen kann.
  Dass die Runtime am Pin an `key:…` nicht antworten kann (`validateMessage` verlangt eine Adresse), baut dieses Goal nicht; dazu
  liegt der Vorschlag `goals/_vorschlaege/relay-nacharbeit-2026-11-13-1.md`.
- **Signatur und API-Key zugleich:** Trägt eine Anfrage eine Signatur, gilt die Signatur, der API-Key wird nicht gelesen. Ohne
  Signatur gilt der API-Key; ein falscher oder fehlender Schlüssel bleibt 401.
- **Im Harness schreibt als API-Key-Konto das Konto der provisionierten Runtime**, nicht ein frisches schlüsselloses Konto. Ein
  schlüsselloses Konto kommt im Harness an keine Credits (Überweisung zwischen Konten antwortet 501, das Topup über x402 braucht eine
  Adresse), und der Erstkontakt kostet. Dass eine Kennung `key:…` nach `sanitizeSocialAddress` eindeutig bleibt, zeigt
  `test/relay-apikey.test.ts` mit einer Nachbildung der Regel (gleicher Ausdruck wie `src/agent/injection-defense.ts:73` am Pin).
- **Der Gang läuft im Harness nach den Prüfungen von Saldo, Sandbox und langem Befehl**, weil diese den Saldo der ersten Wallet gegen
  die Summe des ganzen Ledgers halten und der Gang Wallets und Ledger-Zeilen hinzufügt.
