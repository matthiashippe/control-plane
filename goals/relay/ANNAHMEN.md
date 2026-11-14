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
- **Punkt 8, Wiederholung eines `poll` (Kritik Tech Lead 13.11.):** Die Antwort eines signierten `poll` steht in `relay_polls` unter
  `X-Signature`, `cursor` und `limit` und wird einen Tag gehalten (das Fenster von `X-Timestamp` ist 300000 ms plus 60 s). Die
  Wiederholung liefert genau dieselben Nachrichten und denselben `next_cursor`, keine, die dazwischen ankamen; die markiert sie auch
  nicht als gelesen, also holt sie der nächste neue `poll`. Ein `poll` mit API-Key hat keinen solchen Schlüssel und wird nicht
  gemerkt, weil der Client der Runtime immer signiert.
- **Punkt 9, Speichergrenze (Kritik Tech Lead 13.11.):** Gezählt wird `content.length` des gespeicherten Inhalts (UTF-16-Einheiten wie
  `maxContentLength` am Pin), bei API-Key samt Kennzeichen, in der Spalte `content_chars`, über die angenommenen Nachrichten des
  Absenders der letzten 24 Stunden. Die Prüfung steht nach der Wiederholung derselben Signatur und der Grenze je Stunde und vor dem
  Preis, also bucht ein 413 nie. Der Kontakt steht seit diesem Punkt in `relay_contacts` statt in `relay_messages`, damit er die
  Löschung nach 30 Tagen übersteht; die Tabelle ist neu wie das ganze Relay, auf dem Server gibt es noch keine Zeile nachzutragen.

## Goal 02 (14.11.2026, Engineer CP)

- **Bestand:** Zeilen, die relay 01 schon in `relay_messages` und `relay_polls` gespeichert hat, schreibt dieses Goal nicht um. Steht
  auf dem Server eine Signatur in anderer Form (groß geschrieben oder mit `v` als 0 oder 1), ist ihr Fenster von 300000 ms längst
  abgelaufen; eine Wiederholung bekommt 401 `signature_expired` wie heute, weil der Lookup nur noch die einzige Form sucht.
- **`s` gleich 0** gilt wie die obere Hälfte als keine Form und bekommt 401; `verifyMessage` nähme eine solche Signatur ohnehin nicht an.
- **Reihenfolge im signierten Weg:** erst Form, dann Signaturprüfung, dann `recipient_is_sender`, dann Lookup der Wiederholung und
  Fenster. Wer nicht nachweist, dass er `from` ist, bekommt 401 statt 400 und erfährt nichts über die Regel. Eine Nachricht an sich
  selbst, die relay 01 schon angenommen hat, bekommt bei Wiederholung 400 statt ihrer `id`; 400 wiederholt der Client nicht, und die
  Runtime schickt nie an sich selbst.
- **Kontakt mit sich selbst:** Zeilen in `relay_contacts` mit `a` gleich `b` aus relay 01 bleiben stehen; sie wirken nicht mehr, weil
  keine Nachricht an sich selbst mehr bis zum Preis kommt.

## Reparatur dev, Audit 2026-11-14 Zeile 425 (14.11.2026, Engineer CP)

- relay 01 Punkt 7 (`check`) scheiterte im Audit auf `033245c` am Idempotency-Test in `test/sandbox-api.test.ts`: Der feste
  Abbruch `AbortSignal.timeout(200)` feuerte unter Host-Last vor dem `docker run`. Dieselbe Ursache wie Zeilen 371 und 406; seit
  `2de5407` gibt es den festen Abbruch auf `dev` nicht mehr (`grep -c "AbortSignal.timeout(200)" test/sandbox-api.test.ts` gibt 0
  aus). `PATH=/usr/bin:$PATH node scripts/check.mjs` auf `dev` `04e521c` ist bei Last 3,8 je Kern grün (151 Dateien, 1769 Tests,
  68 s). Der Code bleibt unverändert, weil `dev` die Ursache schon behoben hat.
