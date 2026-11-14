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

## Reparatur dev (14.11.2026, Engineer CP)

- Audit 2026-11-14 Zeile 371 (konto 01 Punkt 7, `check`) lief auf `033245c` rot, weil `test/sandbox-api.test.ts` den ersten Anlauf
  nach `AbortSignal.timeout(200)` abbrach und das unter Host-Last vor dem `docker run` feuerte. Seit `2de5407` bricht der Test erst
  ab, wenn sandboxd den Container startet (0 Stellen mit `AbortSignal.timeout(200)`); dieselbe Ursache hat die Reparatur zu Zeile 297
  in `goals/fehler/ANNAHMEN.md` belegt. `PATH=/usr/bin:$PATH node scripts/check.mjs` auf `dev` `8eab58d` ist bei Last 4,9 je Kern
  grün (149 Dateien, 1747 Tests, 73 s); Code bleibt unverändert, weil die Ursache auf `dev` schon behoben ist.
- Audit 2026-11-14 Zeile 386 (konto 02 Punkt 4) brach mit `render freigabe 390: no answer after 60000 ms` ab, obwohl die Seite
  stimmt: Die 60 s des ersten Bildes schlossen den Kaltstart von Chromium ein, und der code-host lief mit Last über 100 und vollem
  Swap. `ops/soll-handoff.mjs` wartet jetzt bis 180 s auf den Start (`Browser.getVersion`), danach bis 120 s je Bild und bis 60 s auf
  das Laden; das Urteil bleibt allein `assessHandoff()`. Gegenprobe mit einem Chromium, der 70 s bis zum Start schläft: alter Stand
  Exit 2 mit genau der Audit-Ausgabe, neuer Stand Exit 0 mit 0 Mängeln. Dabei fiel auf, dass ein toter Browser auf dem alten Stand
  nach 60 s stumm mit Exit 0 endete (`close()` wartete auf eine Antwort, die Event Loop lief leer); jetzt scheitert jede Anfrage
  an einen beendeten Browser sofort, Exit 2 mit `browser exited`. `ops/soll.mjs` (seite 01) hat dieselbe Stelle und bleibt hier
  unverändert, weil diese Reparatur nur Zeile 386 betrifft.
