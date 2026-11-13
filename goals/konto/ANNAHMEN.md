# Annahmen im Topic konto

## Goal 01 (13.11.2026, Engineer CP)

- Turnkey statt Privy für das Konto, weil nur Turnkey Signup und Login per Passkey im SDK ohne React dokumentiert, den Passkey an
  `postyourprice.com` bindet und uns als Eltern-Organisation nur Lesezugriff gibt; Privys Tagesgrenze beim Anbieter zählt nicht, weil
  der Grundsatz eine Grenze verlangt, die die Chain erzwingt.
- Die Tagesgrenze kommt aus einer Coinbase Smart Wallet mit Spend Permission über `SpendPermissionManager`, weil keiner der beiden
  Anbieter eine Grenze on-chain hat und der Vertrag Spender, Token und Betrag je Periode on-chain bindet; die Turnkey-Wallet kann
  Eigentümer der Smart Wallet sein, weil `MultiOwnable.sol` in `coinbase/smart-wallet` beim Anlegen und über `addOwnerAddress` jede
  Adresse mit 32 Byte als Eigentümer annimmt und deren Signatur per `ecrecover` prüft, und die Turnkey-Wallet eine gewöhnliche Adresse
  mit secp256k1-Signatur ist ([Quelle](https://github.com/coinbase/smart-wallet/blob/a4e83fd36c47b64cb4e21e1fa6bb9b04181a66da/src/MultiOwnable.sol#L101-L103),
  [Quelle](https://docs.turnkey.com/concepts/wallets), Stand 2026-11-13); konto 03 belegt nur noch den Lauf.
- Die Auszahlung an die feste Auszahladresse bei Bridge gibt der Kunde je Auszahlung per Passkey frei (User Operation seiner Smart
  Wallet mit `transfer` direkt an die Auszahladresse), weil `spend()` nur an den Spender zahlt und nur der Spender es aufrufen darf,
  eine Spend Permission also entweder niemand ausführen kann (Bridge als Spender) oder Kundengeld über uns liefe (wir als Spender);
  ein eigener Spender-Vertrag mit Weiterleitung wäre eine Adresse von uns, bräuchte Gas für das Deployment und eine eigene Prüfung,
  und eine Auszahlung ohne den Kunden braucht das Produkt nicht.
- ERC-7715 ist kein Baustein, weil der Standard ein Entwurf ist und die Durchsetzung der Grenze ausdrücklich der Wallet überlässt.
- Bridge statt Due für Euro, weil nur Bridge den Weg von der festen Adresse über USDC auf Base bis SEPA an ein deutsches Privatkonto
  belegt und mit MiCA samt Verwahrung und Transfer und E-Geld beide Teile in der EU erlaubt hat.
- Die Kette endet nicht nach konto 01, weil Bridge laut Doku an Privatkunden in Deutschland in Euro per SEPA auszahlt; der Abschnitt
  `## Anderer Weg` entfällt deshalb.
- Für den Preis von Turnkey rechne ich mit 5 Signaturen je aktivem Konto und Monat, weil Turnkey je Signatur abrechnet und die
  Abbuchung selbst `spend()` von unserer Spender-Adresse ist, also keine Signatur des Kunden braucht; bei 20 Signaturen kosten 1000
  Konten mit Pro 1.099 USD im Monat.
- Der Name `TURNKEY_AUTH_PROXY_CONFIG_ID` in `secrets.env` ist von mir gewählt, weil die Doku den Wert nur als `authProxyConfigId` im
  Code nennt; die drei anderen Namen stehen so in der Doku von Turnkey.
- Einzahlung per Karte in Deutschland bleibt offen, weil weder Bridge noch Due sie dokumentiert und der Karten-Onramp von Stripe USDC
  auf Base in der EU ausschließt; konto 05 prüft zuerst den Weg über die EUR-IBAN des Kunden bei Bridge.
- Die Fragen an den Vertrieb (Preise von Bridge, Freischaltung von EUR und SEPA, Prüfung von HTC) stelle ich nicht, weil jede Mail an
  einen Anbieter das Human Gate `third_party_mail` ist und konto 01 kein Gate braucht, um zu entscheiden.

## Goal 02 (13.11.2026, Engineer CP)

- `POST /v1/handoff` ist ohne Schlüssel, weil das Konto erst in konto 03 über genau diesen Weg entsteht; der Pfad steht deshalb in
  `V1_ROUTES`, `V1_KEYLESS` und unter den offenen Pfaden mit Rate Limit in `src/app.ts`, und welche Schritte später einen Schlüssel
  verlangen, entscheidet konto 03.
- Den Strom liest nur das Terminal mit `poll_token`, weil konto 03 dort den Ausgang der Kontoanlage meldet und wer den QR-Code auf dem
  Bildschirm sieht, ihn sonst mitlesen könnte: `GET /v1/handoff/{code}` antwortet nur mit `Authorization: Bearer <poll_token>`, sonst
  401 ohne Zustand, und gespeichert wird nur der Hash über `hashApiKey` aus `src/auth/siwe.ts`.
- `/v1/handoff/*` steht in `ERLAUBTE_WILDCARDS`, weil die Middleware unter `/v1` nur exakte Pfade kennt; der Handler prüft das Token
  selbst, wie `/v1/sandboxes/*`.
- `code` hat mindestens 50 Bit aus `crypto.randomBytes` in Crockford-Base32 und mindestens 10 Zeichen, weil ein geratener Code in zehn
  Minuten nichts treffen soll und Crockford-Base32 keine verwechselbaren Zeichen hat; der Kurzlink ist `<siteOrigin()>/h/<code>`.
- Eine falsche Wahl verbrennt den Code sofort, weil sonst drei Versuche immer treffen; `match` ist zweistellig (10 bis 99), die zwei
  Lockzahlen sind andere zweistellige Zahlen, und die Stelle der richtigen ist zufällig.
- Beträge sind Strings in atomaren USDC, weil Geld im Repo nie float ist (`LOOP.md`, Technik) und eine Zahl im JSON über 2^53 still
  Stellen verliert; nur ganze Cent (Vielfaches von 10000), angezeigt als `$5.00`, gerechnet mit bigint.
- Die Antwort trägt den QR-Code als Text aus Halbblöcken mit Ruhezone, weil das Terminal kein Bild zeigen kann und zwei Modulreihen je
  Zeile den Code quadratisch halten.
- `/h/{code}` trägt `Cache-Control: no-store`, `Referrer-Policy: no-referrer` und `noindex`, weil der Link ein Einmalgeheimnis ist,
  das weder in einem Cache noch im Referrer einer anderen Seite noch in einer Suchmaschine landen darf; in der Sitemap steht er nicht.
- Ein unbekannter Code ergibt 404 auch ohne Token am Strom, weil der Code ohnehin im QR-Code steht und ein geratener bei 50 Bit nichts
  verrät; erst ein bekannter Code mit falschem Token ergibt 401.
- Gezählt werden unbekannte Codes auf `/h/{code}` je Adresse (20 in 10 Minuten), weil nur dort jemand Codes durchprobieren würde.
- Der Strom liest den Zustand in einem Abfragetakt aus SQLite, weil der Dienst ein Prozess mit einer Datei ist und ein einstellbarer
  Takt die Tests ohne Warten laufen lässt.
- Die neuen Bausteine der Seite stehen in einem zweiten `<style>` statt in `src/public/index.html`, weil dieses Goal die Startseite
  nicht ändert und ihre SOLL-Bilder pixelgleich bleiben müssen.
- `GET /v1/handoff` antwortet ohne Schlüssel mit 200 und beschreibt die Anfrage, weil jeder Pfad in `V1_KEYLESS` ohne Schlüssel
  etwas anderes als 401 sagen muss (`test/messages.test.ts`) und ein Agent, der erst nachsieht, so ohne Doku erfährt, was er senden soll.
- Ein bekannter Code, der nicht mehr offen ist, ergibt auf der Seite 410 statt 200, weil der Link für immer vorbei ist und ein Browser
  oder Crawler das so lesen soll; unbekannt bleibt 404.
- Der QR-Code kommt aus `uqr` (MIT, ohne Abhängigkeiten, mit eigenen Typen) und wird im Test von `jsqr` zurückgelesen, weil jedes
  der beiden Pakete seine Typen mitbringt und so je Art genau ein neues Paket reicht (Punkt 10).
- Ein Strom endet spätestens zehn Minuten und eine Minute nach dem Öffnen, auch wenn die Uhr der App etwas anderes sagt, weil kein
  Code länger lebt und ein hängender Strom sonst einen Prozess ewig belegt.

## Goal 03 (13.11.2026, Engineer CP)

- `POST /v1/handoff` nimmt `step` mit `confirm` (Vorgabe) oder `konto`, weil Terminals aus konto 02 ohne das Feld genau so weiterlaufen
  sollen; bei `konto` führt die richtige Zahl nach `matched`, erst ein gültiges `POST /h/{code}/konto` setzt `done`.
- Eine abgelehnte Erlaubnis verbrennt den Handoff, weil das Terminal sonst auf einen halb fertigen Schritt wartet und ein neuer
  Handoff billiger ist als ein Zustand, aus dem es nicht herausfindet.
- `SpendPermissionManager` ist zweiter Eigentümer der Smart Wallet, weil `spend()` über `execute` der Wallet läuft und das nur ein
  Eigentümer darf; der Harness-Lauf zeigt, dass `approveWithSignature` mit ERC-6492 die Wallet mit beiden Eigentümern anlegt.
- Die Identität des Kontos ist die Adresse der Smart Wallet in `wallets`, weil Einnahmen mit payTo und die Credits dann an derselben
  Adresse hängen, die der Kunde besitzt.
- Der API-Schlüssel entsteht über `createApiKey` aus `src/auth/siwe.ts` mit einer Sitzung, die nur innerhalb der Transaktion lebt,
  weil das Goal `src/auth/**` nur zum Importieren freigibt und die Funktion eine Sitzung verlangt.
- Der Klartext des Schlüssels steht bis zum ersten Lesen des Stroms in der Zeile des Handoffs, weil das Terminal den Strom nach einem
  Abbruch neu öffnen darf und der Schlüssel sonst verloren wäre; das erste Ereignis `done` löscht ihn in derselben Transaktion.
- In den Unit-Tests ist das Konto eine gewöhnliche Adresse und `signatureValid` fällt ohne Chain auf `ecrecover` zurück, weil der
  Prüfbefehl ohne Netz und ohne anvil laufen muss; die Unterschrift einer echten Smart Wallet belegt der Harness auf anvil 84532.
- Nachgebucht wird im Hintergrund nach jeder Anfrage mit API-Schlüssel, weil `spend()` auf einen Block wartet und keine Antwort an
  den Kunden darauf warten soll; die Anfrage, die das Guthaben leert, bekommt 402, die nächste sieht die Credits.
- Kennt `SpendPermissionManager` die Erlaubnis noch nicht, sendet `topUpIfLow` vorher `approveWithSignature`, weil erst der Server
  Gas hat und der Kunde auf dem Handy nichts senden soll.
- Der Spender ist die Adresse des Testschlüssels selbst, weil `spend()` an den Spender zahlt und so kein weiterer Schlüssel und keine
  Adresse der Betreiber-Wallet nötig ist.
- `deploy/Caddyfile` setzt `?Referrer-Policy "strict-origin-when-cross-origin"`, weil in Caddy das `?` vor dem Feldnamen steht und nur
  dann einen fehlenden Wert ergänzt; die Schreibweise `Referrer-Policy "?strict-origin-when-cross-origin"` aus dem Prüfbefehl von
  Punkt 12 schickt nachgestellt mit Caddy 2.11.7 einen zweiten Kopf mit dem Wert `?strict-origin-when-cross-origin` neben dem der App.
- Entscheidung (Tech Lead, 2026-11-13): Die Prüfung von Punkt 12 und der Kontext verlangen `?Referrer-Policy "strict-origin-when-cross-origin"`
  und keine Zeile, die den Kopf ohne `?` setzt, weil `caddy adapt` mit 2.11.7 die alte Schreibweise als festes `set` mit dem Wert
  `?strict-origin-when-cross-origin` übersetzt und nur das `?` vor dem Feldnamen ein `require` auf einen fehlenden Kopf ergibt.
