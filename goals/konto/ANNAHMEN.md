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
- Die Seite legt den Passkey an und gibt Turnkey beim Signup zusätzlich einen P-256-Schlüssel des Tabs (nicht exportierbar, 120
  Sekunden gültig), der die Erlaubnis einmal unterschreibt, weil sonst nach dem Anlegen ein zweiter Passkey-Dialog käme; Turnkeys
  eigenes SDK macht es mit 60 Sekunden genauso (`signUpWithPasskey`, `@turnkey/core` 2.14.1). Der Schlüssel verlässt den Tab nie.
- Das Skript der Seite nutzt viem und kein Paket von Turnkey, weil die vier Aufrufe (WebAuthn, Signup, Stempel, Signatur) in
  `src/public/konto-client/flow.mjs` passen und jedes weitere Paket fremden Code auf die Seite brächte; gebündelt wird mit esbuild
  (neues Entwicklungspaket), und das Bündel liegt im Repo, weil das Image nur mit tsc baut und `harness/cp/Dockerfile` zur Deny List
  gehört. Ein Test baut es neu und vergleicht.
- Die Seite fragt keine Chain: Die Adresse der Smart Wallet folgt per CREATE2 aus `initCodeHash()` der Factory (am 15.11.2026 von
  Base Sepolia gelesen, gleich `getAddress`), und `eth_getCode` beantwortet ein Transport ohne Netz mit `0x`, weil ein Eigentümer,
  der eine Sekunde alt ist, keine deployte Wallet hat. So geht vom Handy nichts an einen fremden RPC.
- `signWith` geht in der Schreibweise an Turnkey, die der Signup zurückgibt (mit Prüfsumme), weil Turnkey Adressen nach Groß- und
  Kleinschreibung unterscheidet; der erste Lauf scheiterte daran mit 404. Bei uns steht die Adresse klein.
- `GET /h/{code}` zeigt nach `done` eines Handoffs mit `step: "konto"` den Zustand `erledigt` aus konto 02, weil das Skript nach dem
  200 dorthin zurückkehrt und kein neuer Zustand ohne SOLL-Bild entstehen soll; ohne `step: "konto"` bleibt `ungueltig` wie bisher.
- Die Auth-Proxy-ID kommt als `CP_KONTO_AUTH_PROXY_ID` in die Seite, weil Turnkey sie für Browser vorsieht und sie kein Schlüssel ist.
  Für konto 05 bleibt offen: Die CSP aus `deploy/Caddyfile` erlaubt weder `/h/konto.js` noch `connect-src` zu Turnkey; das muss mit
  dem Anschalten im Hauptnetz geändert werden, heute ist das Konto in der Produktion aus.
- Der Lauf auf Base Sepolia nutzt Port 47391, weil `http://localhost:47391` als Allowed Origin im Auth Proxy steht und der Passkey
  an diese Origin gebunden wird; das Skript bricht ab, wenn der Port belegt ist.
- Der Hash eines `spend()` steht in `konto_accounts.pending_tx`, bevor auf die Quittung gewartet wird, und der nächste Lauf
  prüft ihn vor allem anderen, auch vor der Schwelle, weil er Geld des Kunden bewegt haben kann (Punkt 15). Eine Lücke bleibt
  zwischen dem Senden und dem Schreiben des Hashes (Absturz genau dazwischen); sie ließe sich nur schließen, indem die Transaktion
  erst signiert, dann gespeichert und dann gesendet wird. Das steht für konto 05 an, bevor echtes Geld läuft.

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
- Audit 2026-11-14 Zeile 406 (konto 02 Punkt 10, `check`) scheiterte auf `033245c` an derselben Stelle wie Zeile 371: Der
  Idempotency-Test in `test/sandbox-api.test.ts` brach den ersten Anlauf nach `AbortSignal.timeout(200)` ab, unter Host-Last vor
  dem `docker run`. Seit `2de5407` gibt es diesen festen Abbruch nicht mehr (`grep -c "AbortSignal.timeout(200)"` gibt 0 aus).
  `PATH=/usr/bin:$PATH node scripts/check.mjs` auf `dev` `2d9fe38` ist bei Last 8,7 je Kern grün (150 Dateien, 1756 Tests,
  275 s). Der Code bleibt unverändert, weil `dev` die Ursache schon behoben hat.
- Audit 2026-11-14 Zeile 407 (konto 02 Punkt 10, (Netz) `e2e`) gab 0 aus, weil der Prüfbefehl den PR mit `--state open` sucht und
  PR #97 seit dem Merge `6856c07` geschlossen ist; `gh pr checks` bekommt dann eine leere Nummer und liest den Branch des Audits.
  Der belegte Stand hält: `gh pr checks 97` meldet `e2e pass` am gemergten Kopf `c6ca529`, derselbe Befehl mit `--state all` gibt
  `1` aus, mit einem Head ohne PR (`goal/konto-99`) `0`. `PATH=/usr/bin:$PATH node scripts/check.mjs` auf `dev` `1cdbde8` ist bei
  Last 4,4 je Kern grün (151 Dateien, 1769 Tests, 255 s). Code und Goal-Datei bleiben unverändert, weil das Goal DONE ist und der
  Prüfbefehl Vertrag; nach jedem Merge bleibt die Zeile im Audit rot, bis der Tech Lead sie ablöst oder das Audit Zeilen mit
  `--state open` am gemergten PR misst.

## Reparatur dev (15.11.2026, Engineer CP)

- Audit 2026-11-15 Zeile 549 (konto 02 Punkt 10, (Netz) `e2e`) ist dieselbe Ursache wie Zeile 407 vom 14.11.: Der Prüfbefehl sucht
  den PR mit `--state open`, PR #97 ist seit dem Merge `6856c07` geschlossen, `gh pr checks` bekommt eine leere Nummer. Der belegte
  Stand hält: mit `--state all` gibt derselbe Befehl `1` aus (PR #97, `e2e pass` am gemergten Kopf `c6ca529`), mit einem Head ohne
  PR (`goal/konto-99`) eine leere Nummer. Goal-Datei bleibt unverändert, weil das Goal DONE ist und der Prüfbefehl Vertrag; die Zeile
  bleibt in jedem Audit rot, bis der Tech Lead sie ablöst oder das Audit Zeilen mit `--state open` am gemergten PR misst. konto 03
  (PLANNED) trägt dasselbe Muster in zwei Prüfzeilen und wird nach seinem Merge ebenso rot.
- `PATH=/usr/bin:$PATH node scripts/check.mjs` auf frischem `dev` `4195e44` war dabei rot, aber an anderer Stelle:
  `test/abort-purchase.test.ts` (Selbsttest von `ops/abort-purchase.sh`, abrechnung 04). Ursache: Das Skript läuft mit
  `set -o pipefail`, und `expect()` und `absent()` verglichen mit `printf '%s\n' "$2" | grep -q`. bash schreibt die Ausgabe
  zeilenweise; schließt `grep -q` nach dem Treffer, bevor `printf` fertig ist, endet `printf` mit SIGPIPE und die Pipe mit 141. Dann
  meldet `expect()` FAIL für eine vorhandene Zeile und `absent()` ok für eine verbotene. Gemessen unter Last 2 bis 2,5 je Kern:
  Stand von `dev` 2 von 90 parallelen Selbsttests FAIL (davor 1 von 24, jeweils an einer vorhandenen Zeile), neuer Stand mit
  Here-String 0 von 90. Gegenprobe: eine gepflanzte falsche Erwartung gibt FAIL, ein gepflanztes verbotenes Muster gibt FAIL.
  Neuer Test in `test/abort-purchase.test.ts` sperrt die Pipe in `grep -q` für dieses Skript, rot auf dem alten Skript. Danach
  `check` grün (164 Dateien, 1859 Tests, 52 s). Dasselbe Muster unter `pipefail` steht noch in `ops/cron-points-somewhere.sh`,
  `ops/jobs.sh`, `ops/own-briefs.sh`, `ops/conway-zustand.sh`, `ops/sperren.sh`, `ops/visibility.sh` und `ops/stranger-client.sh`;
  es kippt nur, wenn nach der Trefferzeile noch Zeilen folgen, und bleibt hier unverändert, weil es `check` heute nicht rot macht.

## Goal 04 (16.11.2026, Engineer CP)

- `start_automaton` antwortet sofort mit `qr`, `url` und `match` und nie mit `poll_token`, weil Claude Code ein Ergebnis erst zeigt, wenn der Aufruf endet, und der Mensch den QR-Code sehen muss, solange der Code zehn Minuten gilt; den Strom hält der MCP-Server im Hintergrund offen (Tech Lead, Entscheidung 1).
- Bei `burned` oder `expired` legt der nächste `start_automaton` einen neuen Handoff an und wiederholt nie den alten Code, weil ein verbrannter Code auf dem Server nie wieder `done` werden kann und ein abgelaufener nichts mehr freigibt.
- Der API-Schlüssel liegt in `CP_KEY_FILE` mit Modus 0600, und eine Datei mit Rechten für Gruppe oder andere wird nicht gelesen (`key_file_mode`), weil ein lesbarer Schlüssel jedem anderen Nutzer der Maschine das Konto bis zum Tageslimit öffnet; `CP_API_KEY` geht vor, weil das bisherige Verhalten des Servers bleiben soll (Entscheidung 2).
- Die erste Zahlung eines Kontos setzt der Server auf das Minimum aus `CP_KONTO_TOPUP_USDC` und Tageslimit, und ein anderer Wert ergibt 400, weil die Seite sonst eine Zahl zeigt, die die erste Abbuchung nie bucht (Entscheidung 3); ohne `topupUsdc` in den Konto-Abhängigkeiten ist es das Tageslimit, weil `ops/soll-live-konto.mjs` aus konto 03 unverändert bleiben muss.
- Senken speichert eine Obergrenze `konto_accounts.cap_usdc` statt einer neuen Erlaubnis, weil Senken ohne Handy gehen soll und eine Erlaubnis nur der Passkey unterschreiben kann; `topUpIfLow` hält sie zusätzlich zum Rest der Periode ein (Entscheidung 4).
- `isLowering` vergleicht mit dem unterschriebenen Limit und nicht mit der Obergrenze, weil ein Wert bis zur Unterschrift schon erlaubt ist und erst darüber eine Prompt-Injection mehr abbuchen könnte; nach einer Senkung auf 2 darf der Schlüssel also wieder bis 5 gehen.
- Die neue Erlaubnis wartet in `next_permission` und wird erst vor der nächsten Abbuchung mit `approveWithSignature` freigeschaltet und die alte mit `revokeAsSpender` widerrufen, weil beides Gas kostet und nur dann nötig ist, wenn abgebucht wird; widerrufen wird auch eine alte Erlaubnis, die nie freigeschaltet war, weil ihre Unterschrift sonst jeder später einreichen könnte (Entscheidung 5).
- Nach dem Wechsel fragt `topUpIfLow` die neue Erlaubnis nicht noch einmal mit `isApproved` ab, weil der Knoten den Block der Freischaltung noch nicht kennen kann und sonst ein zweites `approveWithSignature` ginge; der Test `test/konto-limit.test.ts` fand das.
- Die Obergrenze fällt mit einer Erhöhung weg, beim Wechsel der Erlaubnis aber nicht, weil der Mensch mit der Erhöhung das neue Limit gewählt hat und eine spätere Senkung vor der nächsten Abbuchung sonst verloren ginge.
- Das Konto speichert bei der Anlage `owner` und `organization_id` des Passkeys, und die Seite der Erhöhung bekommt sie als `data-owner` und `data-org`, weil Turnkey eine Unterschrift mit vorhandenem Passkey nur für eine benannte Unterorganisation stempelt und sonst ein zweiter Passkey-Dialog nötig wäre; keiner der beiden Werte ist geheim.
- Die Zustände der Handy-Seite heißen im Code `approve`, `approved` und `invalid`, die abgenommenen Bilder behalten ihre deutschen Dateinamen, und nur `HANDOFF_FILES` in `ops/soll-assess.mjs` kennt die Zuordnung, weil die Audits von konto 02 und 03 Bilder, Quellen und Summenzeilen Zeichen für Zeichen prüfen (Entscheidung 7).
- Die Limit-Bilder sind wie alle SOLL-Bilder mit WenQuanYi Zen Hei als `sans-serif` gerendert und die SOLL-Befehle laufen auf dem code-host mit `FONTCONFIG_FILE=~/.config/control-plane/soll-fonts.conf`, weil `sans-serif` dort seit dem 15.11.2026 zu DejaVu Sans auflöst und die Bilder aus konto 02 und 03 sonst Mängel melden.
- Die neuen Tools liegen in `AUTOMATON_TOOLS` neben `TOOLS`, weil `test/skill.test.ts` und `test/confidentiality.test.ts` über `TOOLS` laufen und `request` jedes Tools aufrufen, was für die Tools mit Strom und Schlüsseldatei nicht passt.
- Katalog `postyourprice`, Plugin `automaton`, weil der Mensch das Produkt unter diesem Namen kennt und der Befehl `claude plugin install automaton@postyourprice` sagt, was er installiert.
- Nach einer Erhöhung zählt der Verbrauch der alten Erlaubnis bis zum Ende ihrer laufenden Periode gegen das neue Limit, festgehalten beim Widerruf als `carry_usdc` und `carry_until`, weil `getCurrentPeriod` des Vertrags den Widerruf nicht prüft und eine widerrufene Erlaubnis nichts mehr abbucht, der Wert also ab dann feststeht; bei einer zweiten Erhöhung in derselben Periode addiert sich der Verbrauch und das spätere Ende gilt, weil das höchstens zu wenig abbucht, nie zu viel (Punkt 13, Zyklus 2).
- Scheitert beim Wechsel eine Transaktion, auch durch einen Fehler beim Senden oder einen Abbruch beim Warten, endet der Lauf ohne `spend()` und der nächste widerruft einfach erneut, statt zu prüfen, ob der erste Widerruf ankam, weil `_revoke` im SpendPermissionManager (coinbase/spend-permissions) bei einer schon widerrufenen Erlaubnis ohne Revert zurückkehrt und `isApproved` dort einen Widerruf nicht anzeigt (Punkt 14, Zyklus 3).

## Goal 05 (16.11.2026, Engineer CP)

- Die Einzahlung läuft über `ACTIVITY_TYPE_INIT_FIAT_ON_RAMP` von Turnkey mit MoonPay direkt an die Smart Wallet des Kontos, weil MoonPay in Deutschland per Karte verkauft, USDC auf Base führt und `walletAddress` frei wählbar ist (`docs/konto/euro.md`, Einzahlung).
- Der Betrag der Einzahlung geht in USD an MoonPay, weil die Seite „Add $20.00“ zeigt und `balance_usd` in Dollar zählt; unter 20,01 USD lässt die Seite den Betrag weg und MoonPay fragt ihn selbst ab, weil Turnkey einen Betrag über 20 verlangt.
- `init_fiat_on_ramp` bleibt trotz des Hinweises „veraltet“, weil der Nachfolger zwei Passkey-Tipps braucht (Angebot und Sitzung); der Wechsel ist in `docs/konto/euro.md` als Plan B beschrieben.
- Die Identitätsprüfung nutzt `POST /v0/kyc_links` mit einer Adresse je Konto auf unserer Domain (`payout-<16 Hexzeichen>@postyourprice.com`), weil `email` dort Pflicht ist, wir keine Adresse des Menschen haben und die Seite ohne zusätzliches Feld auskommen soll; konto 06 entscheidet mit dem echten Zugang, ob das bleibt.
- `signatureValid` fragt über einen eigenen Client ohne Wiederholung und wirft `SignatureCheckUnavailable`, wenn der Transport scheitert und keine Antwort des Vertrags kam, weil viem jeden Fehler bei `eth_call` sonst als „falsche Unterschrift“ meldet und der Handoff dann verbrannt würde.
- Die Passkey-Routen antworten bei einem RPC-Fehler 503 `signature_check_unavailable` und lassen den Handoff `matched`, weil der Mensch alles richtig gemacht hat und dieselbe Unterschrift beim nächsten Tippen gilt.
- `topUpIfLow` merkt sich das Periodenende je Datenbank und Konto nur im Prozess, weil ein Neustart höchstens eine zusätzliche Abfrage kostet und so keine Spalte in `konto_accounts` nötig ist; eine wartende Erhöhung löscht das Gemerkte.
- Die Getter von `PayoutForwarder` sind Funktionen über private Immutables, weil der Konstruktor dann genau `account`, `destination`, `token`, `manager` und `caller` heißt, wie die ABI-Prüfung verlangt.
- `solc` 0.8.38 übersetzt mit Optimizer 200, `evmVersion` paris und ohne Metadaten-Hash, weil der Code so ohne PUSH0 auf jeder Kette mit dem Proxy läuft und ein geänderter Kommentar den Bytecode nicht ändert.
- `forwarderAddress` nimmt Token, Manager und Aufrufer aus der Einstellung als dritten Wert, weil dieselben festen Werte im Vertrag stehen und die Adresse sonst nicht zur angelegten passt.
- Nach jeder Transaktion der Auszahlung wartet der Server auf den Beleg und bricht bei einem Revert mit 502 `payout_failed` ab, weil eine Auszahlung, deren Anlage oder Freigabe scheiterte, sonst ins Leere zahlt; eine zweite Auszahlung desselben Kontos während einer laufenden bekommt 409 `payout_busy`.
- Eine alte Erlaubnis geht nur dann per `retire` an die alte Weiterleitung, wenn sie schon freigegeben war, weil eine nie freigegebene on-chain unbekannt ist und `revokeAsSpender` dort nichts bewirkt.
- Eine ungültige IBAN gibt 400 und dieselbe Seite mit einer Fehlerzeile, ohne den Handoff zu verbrennen, weil ein Tippfehler bei 22 Zeichen häufig ist und kein Angriff.
- Das Land der IBAN wird über eine Tabelle der SEPA-Länder auf drei Buchstaben gebracht, weil Bridge `iban.country` mit drei Buchstaben verlangt und eine Auszahlung außerhalb von SEPA nicht ankäme.
- `keep_usd` darf 0 sein und `all: true` zahlt bei 0 USDC nichts (`nothing_to_pay`), unter 1,00 USD aber 400 `below_minimum`, weil Bridge Beträge unter 1 USD weder gutschreibt noch zurückgibt.
- Ist der Mensch bei Bridge schon geprüft, zählen die Schritte „1 of 2“ und „2 of 2“ statt „of 3“, weil der Design Reviewer sonst einen fehlenden Schritt sah.
- Eine Weiterleitung, die nicht mehr zu `forwarderAddress` mit den heutigen Werten passt, gibt 409 `payout_needs_phone` statt einer Reparatur auf dem Server, weil die zweite Erlaubnis des Menschen die alte Weiterleitung als Spender nennt und nur sein Passkey eine neue unterschreiben kann.
- Die Route klärt eine offene Auszahlung vor der Prüfung des Kontostands, weil nach einer angekommenen Auszahlung der Kontostand schon gesunken ist und dieselbe Anfrage sonst `insufficient_balance` statt `sent` mit dem alten Hash bekäme.
- Eine offene Auszahlung antwortet 202 `pending` statt 502, weil das Geld schon unterwegs sein kann und „Try again later“ zu einer zweiten Überweisung führen würde.

## Abgelöst durch seite 03 (Maker, 2026-11-16)

- Abgelöst: konto 02 Punkt 1 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 02 Punkt 2 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 02 Punkt 4 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 03 Punkt 1 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 03 Punkt 2 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 03 Punkt 4 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 04 Punkt 2 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 04 Punkt 4 durch seite 03 Punkt 1, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 04 Punkt 1 durch seite 03 Punkt 8, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)
- Abgelöst: konto 04 Punkt 4 durch seite 03 Punkt 8, Ausgabe dann genau `Exit 1, unknown argument: --pruefen` (Tech Lead, 2026-11-14)

## Goal 06 (17.11.2026, Engineer CP)

- Der Name des Kontos ist `name` der ältesten Zeile in `api_keys` zur Adresse des Kontos (`ORDER BY id LIMIT 1`, `readAccountName` in `src/konto/account.ts`), weil `finishKonto` diese Zeile mit dem Namen schreibt, den der Mensch beim Anlegen auf dem Handy sah, und spätere Schlüssel aus sandbox 08 Namen von Automatons tragen (Entscheidung 1 des Tech Lead).
- `POST /v1/handoff` mit `step: "limit"` liest `automaton_name` nicht mehr und übergeht ein mitgeschicktes Feld ohne Fehler, weil sonst ein gesteuertes Terminal (auch eine Prompt-Injection) den Text auf der Seite setzt, auf der der Kunde mit dem Passkey mehr Geld freigibt, und ein älteres Plugin weiter funktionieren soll (Entscheidung 2).
- Der Handoff eines `limit` speichert den Namen des Kontos in der vorhandenen Spalte `automaton_name` (leer, wenn das Konto keinen hat), weil `src/db.ts` auf der Deny List steht und der Handoff nur diesen einen Namen für die Seite braucht; `accountNameOf` in `src/handoff/routes.ts` macht daraus `accountName` oder `null`.
- `LimitPage` trägt `accountName` statt `automatonName`, und die Seite sagt „your account Atlas“ oder ohne Namen nur „your account“, weil das Limit für das ganze Konto gilt und ein Konto seit sandbox 08 bis zu zwei Automatons hat (Entscheidung 3).
- `set_daily_limit` in `mcp/server.mjs` schickt kein `automaton_name` mehr und hat kein Argument `name`, weil der Server den Namen ohnehin übergeht und ein Argument ohne Wirkung den Nutzer täuscht (Entscheidung 3).
- `src/public/openapi.ts` bleibt unverändert, weil es `/v1/handoff` gar nicht beschreibt; den Schritt `limit` beschreiben `docs/konto/handoff.md` und die Selbstbeschreibung `GET /v1/handoff`, deren Fehlermeldung jetzt „without automaton_name“ nennt.
- Die Handoff-Bilder heißen nach ihren Zuständen (`handoff-approve`, `handoff-approved`, `handoff-invalid`), Byte für Byte die in PRO-19925 abgenommenen PNG, und `HANDOFF_FILES` und `handoffFile` gibt es nicht mehr, weil Grundregel 12 ausnahmslos gilt und jede Linse sonst zwei Namen für denselben Zustand pflegt (Entscheidung 4).
- Der Fehlerzustand des Kontos heißt im Code `failed` (Route `POST /h/{code}/failed`), nur `KONTO_FILES` in `ops/soll-assess.mjs` kennt den Dateinamen `konto-fehlgeschlagen` der abgenommenen Bilder, weil die Bilder unter diesem Namen abgenommen sind und der Code englisch ist (Entscheidung 5); ein offener Handoff von vor dem Rollout auf der alten Route endet nach zehn Minuten von selbst.
- `test/state-names.test.ts` nimmt `fehlgeschlagen` ins Muster und `mcp/` in den Umfang und erlaubt das Wort nur in Zeilen mit `KONTO_FILES`, weil die Gegenprobe von Punkt 4 die alte Route in `src/handoff/routes.ts` finden muss und `ops/soll-assess.mjs` sonst das Schlupfloch wäre.
- `summaryLimit` schreibt `pictures`, `ops/soll-money.mjs` und `14 images` bleiben, weil konto 08 die SOLL-Werkzeuge zusammenlegt und die Deny List `ops/soll-money.mjs` sperrt (Entscheidung 6).
- `docs/konto/terminal.md` nennt beim Tool `set_daily_limit` noch das Argument `name`, weil die Datei nicht in den Pfaden dieses Goals steht (Punkt 10); ich nenne es im Abschlusskommentar für die Kritik.
- Entscheidung (Tech Lead, Kritik 2026-11-17): Die vierte Prüfung von Punkt 10 nimmt diese Goal-Datei mit `':!goals/konto/06-die-seite-zum-tageslimit-sagt-wofuer-das-limit-gilt.md'` aus, bei gleichem Text und gleicher Erwartung `goals gleich`, weil der Stern einer Git-Pfadangabe über `/` geht und die Prüfung sonst die eigene Goal-Datei trifft, die der Maker in Status, Kästchen und Progress Log ändern muss; was er in ihr ändern darf, prüft das Gate mit `goalDrift` ohnehin, und gemeint war laut Deny List „alle Goal-Dateien außer dieser“.

## Abgelöst durch konto 06 (Maker, 2026-11-17)

- Abgelöst: konto 02 Punkt 1 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, Error: ENOENT: no such file or directory, open 'docs/soll/handoff-freigabe-390.png'` (Tech Lead, 2026-11-17)
- Abgelöst: konto 02 Punkt 1 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, Error: ENOENT: no such file or directory, open 'docs/soll/src/handoff-freigabe.html'` (Tech Lead, 2026-11-17)
- Abgelöst: konto 02 Punkt 3 durch konto 06 Punkt 6, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T12:48:57+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 3 durch konto 06 Punkt 6, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T12:48:57+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 5 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 0, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 3 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 3 durch konto 06 Punkt 1, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 5 durch konto 06 Punkt 7, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 5 durch konto 06 Punkt 7, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Entscheidung (Tech Lead, 2026-11-18, PRO-25107): Die beiden Zeilen zu konto 02 Punkt 1 ersetzen seit ac5a836 die Zeilen vom 2026-11-17 mit der Versionszeile von Node und tragen wie jede Ablösung durch konto 06 das Datum 2026-11-17, weil konto 06 Punkt 8 jede Zeile „durch konto 06“ in genau diesem Format verlangt und mit dem Zusatz im Datum rot würde.

## Goal 07 (17.11.2026, Engineer CP)

- `parseUsdc` liegt in einem eigenen Modul `src/konto/usdc.ts` und nicht in `src/konto/limit.ts` oder `src/handoff/routes.ts`, weil `src/handoff/routes.ts` schon aus `src/konto/limit.ts` importiert und ein Import in die Gegenrichtung einen Kreis zwischen zwei Modulen mit Routen schlösse (Entscheidung 1 des Tech Lead).
- `parseLimit` ist gestrichen und `src/handoff/routes.ts` exportiert kein eigenes `parseUsdc` mehr, weil zwei Namen für dieselbe Regel bei der nächsten Änderung wieder auseinanderlaufen; vorher importierte niemand außerhalb von `src/handoff/routes.ts` dessen `parseUsdc` (`git grep -n parseUsdc -- src test mcp`).
- Reihenfolge und Text der Prüfungen bleiben, wie sie waren, weil Terminal und Plugin die Fehlercodes und Meldungen lesen: `POST /v1/konto/limit` prüft den Betrag vor dem Konto, `POST /v1/handoff` vor Schlüssel und Konto (Entscheidung 2).
- Die drei neuen Fälle stehen als eigene `it(...)` mit dem Fehlercode im Titel in `test/konto-limit.test.ts`, weil die Mutationen aus Punkt 3 sie mit `-t` einzeln auswählen (Entscheidung 3).
- Der Fall zu `invalid_handoff` prüft neben dem Code die Meldung `positive whole number of atomic USDC`, weil `"0"` und `"15000"` unter dem unterschriebenen Limit ohne die Regel ebenfalls 400 `invalid_handoff` bekämen, nur mit der Meldung „has to be above today's“; erst die Meldung unterscheidet die beiden Ausgänge.
- `"10005000"` steht nur im Fall zu `invalid_handoff`, weil es über dem unterschriebenen Limit liegt und ohne `% 10_000n` einen Handoff über einen Betrag ohne ganzen Cent anlegen würde; an `POST /v1/konto/limit` wäre es ohnehin 403 `limit_raise_needs_phone`.
- Kein eigener `test/konto-usdc.test.ts`, weil die Mutationen das Verhalten an beiden Endpunkten beweisen sollen und ein Test der Funktion allein das nicht zeigt (Entscheidung 4 erlaubt ihn, verlangt ihn nicht).
- Die Fälle aus Punkt 2 waren schon vor `src/konto/usdc.ts` grün, weil sie vorhandenes Verhalten festhalten; rot gesehen wurden sie vorher mit denselben zwei Mutationen an beiden alten Kopien (`invalid_limit=1`, `invalid_handoff=1` je Mutation, `no_account=0`).

## Goal 08 (17.11.2026, Engineer CP)

- `ops/browser.mjs` exportiert genau `findChrome(kind)`, `chromeArgs(kind, profile)` und `launch(chrome, profile, kind)` mit den Arten `picture` und `passkey`, und jeder andere Wert wirft `unknown browser kind`, weil die Sepolia-Läufe das volle Chromium mit `--headless=new` für den virtuellen Authenticator brauchen und die SOLL-Werkzeuge die Headless Shell mit festen Schriften ohne Netz (Entscheidung 1 des Tech Lead).
- `chromeArgs` gibt je Art wörtlich die Liste der Merge-Basis zurück, und `findChrome("passkey")` liest `SOLL_CHROME` nicht, weil die abgenommenen Bilder unter `docs/soll/` an genau diesen Argumenten hängen und der Vergleich in Punkt 3 jede Abweichung als `argumente anders` meldet (Gegenprobe mit gestrichenem `--mute-audio`: `argumente anders`).
- `launch` liest bei beiden Arten stderr mit und hat die Sperre `if (gone) return fail(gone)` aus `ops/soll-handoff.mjs`, dazu das `close` der SOLL-Werkzeuge, weil ein Befehl an einen beendeten Browser sonst ewig wartet und Node mit Exit 0 ohne Zeile endet (Entscheidung 3); die Sepolia-Läufe rufen `close` in ihrem `exit`-Handler weiter ohne `await`, dort schickt es `Browser.close`, und Chromium endet mit dem Schließen der Pipe beim Ende von Node.
- Jedes der fünf SOLL-Werkzeuge trägt über dem Aufruf von `launch` einen Kommentar mit der Zeile `env: { ...process.env, FONTCONFIG_FILE: fonts }`, weil `test/soll-fonts.test.ts` genau diese Zeile in vier Werkzeugen sucht, Punkt 3 ihn grün verlangt und Punkt 6 ihn nicht zu ändern erlaubt; die echte Verdrahtung steht in `ops/browser.mjs` und prüft `test/browser.test.ts` am Verhalten (der nachgebaute Chrome schreibt `FONTCONFIG_FILE` und seine Argumente auf, `fonts.conf` gleich `FONTS_CONF`), und `goals/_vorschlaege/konto-nacharbeit-2026-11-17-5.md` schlägt vor, den Test auf `ops/browser.mjs` umzustellen.
- `test/soll-browser-gone.test.ts` importiert nichts aus `ops/` und startet die Werkzeuge mit `spawnSync` und 20 s Grenze, weil derselbe Test gegen die Merge-Basis laufen muss, wo `ops/soll.mjs` und `ops/soll-konto.mjs` ohne Sperre hängen (dort `status` gleich `null`, also rot) und die anderen drei mit Exit 2 enden (Entscheidung 5).
- Die Kopfkommentare von `ops/soll-handoff.mjs`, `ops/soll-konto.mjs`, `ops/soll-limit.mjs` und `ops/soll-money.mjs` nennen `ops/browser.mjs` statt einer anderen Datei, und die Sätze „bleibt, wie es ist, weil die Audits die eingefrorenen Prüfungen dagegen fahren“ sind gestrichen, weil die eingefrorenen Prüfungen von konto 02 bis 06 die Ausgaben der Werkzeuge oder Diffs auf ihren eigenen Goal-Branches messen, die gleich bleiben (Entscheidung 4).
- Neue Tests waren rot: `test/soll-browser-gone.test.ts` gegen die Merge-Basis für `ops/soll.mjs` und `ops/soll-konto.mjs` (`expected 'object' to be 'number'`), `test/browser.test.ts` an einer Kopie ohne die Sperre mit `2 failed | 8 passed` (beide Fälle „fails every request at once“), weil jeder neue Test einmal rot gesehen sein muss (`loop-constraints.md`, Budget und Qualität).

## Abgelöst durch umzug 02 (Maker, 2026-11-17)

- Abgelöst: konto 02 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 03 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 4 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 06 Punkt 6 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)

## Goal 09 (17.11.2026, Engineer CP)

- `caller` bleibt ein fester Wert im Vertrag und wird keine änderbare Liste, weil eine Liste einen Verwalter braucht und genau der die Zusage bricht, dass selbst unser Schlüssel nur an das Ziel des Kunden zahlt; `src/konto/contracts/**` und `src/konto/forwarder.ts` bleiben gleich, weil jede Änderung die Adresse jeder Weiterleitung verschöbe (Entscheidung 1 des Tech Lead).
- `finishPayout` lässt ein wartendes `retire_*` stehen und verwirft die Erlaubnis davor, sonst wird jede alte Erlaubnis mit `permission` und `forwarder` zu `retire_*`, egal was `permission_approved` sagt, weil eine abgebrochene Quittung von `approveWithSignature` die Spalte auf 0 lässt, obwohl die Freigabe on-chain ging, und weil `approveWithSignature` erst nach einem gelungenen `retire` rausgeht, eine Erlaubnis hinter einem wartenden `retire_*` also nie on-chain war (Entscheidung 2, Fall 4 hält es fest).
- `PayoutChain` hat genau eine neue Methode `callerOf(forwarder: Address): Promise<Address>` als `readContract` von `caller` aus `FORWARDER_ABI`, weil nur die Kette sagt, welchen Absender die alte Weiterleitung annimmt, und die gespeicherte Adresse allein das nicht verrät (Entscheidung 3).
- `sendPayout` fragt vor dem `retire` erst `isApproved` und dann `callerOf`, verwirft mit `not_approved` oder `other_caller` ohne Transaktion und schreibt genau eine Zeile `[payout] retire skipped for <Weiterleitung in Kleinbuchstaben>: <Grund>`, weil ein `retire` auf eine nicht freigeschaltete Erlaubnis nichts bewirkt und eines mit fremdem `caller` an `only the fixed caller` scheitert und sonst jede Auszahlung des Kontos sperrt (Entscheidung 4).
- Wirft `isApproved` oder `callerOf`, endet die Auszahlung mit `PayoutFailed("retire", null)` und `retire_*` bleibt, weil ein Lesefehler kein Beleg dafür ist, dass es nichts zu widerrufen gibt; ein `retire`, dessen Quittung abbrach, findet beim nächsten Versuch `isApproved` falsch und wird verworfen, das ist gewollt.
- Der nachgebaute Knoten in `test/money-helpers.ts` merkt sich je Weiterleitung das fünfte Argument des Konstruktors als `caller`, beantwortet `caller()` damit und lässt `retire` und `payout` von einem anderen Absender (`recoverTransactionAddress`) mit Quittung `0x0` scheitern, weil Fall 2 sonst gegen die Merge-Basis grün liefe; der Schlüsselwechsel ist `withNewGasKey(s)`, eine zweite App mit neuem Schlüssel auf derselben Datenbank, demselben Knoten, derselben Bridge und derselben Wallet-Kette, weil so alle vorhandenen Helfer (`toPasskey`, `json`) unverändert mit ihr laufen (Entscheidung 5).
- Die abgebrochene und die nie gesendete Freigabe baut ein Wrapper um die Kette in `test/konto-payout.test.ts` nach (`lossySetup`), und die Log-Zeilen liest ein `vi.spyOn(console, "log")`, weil die Route `sendPayout` ohne eigenes `log` aufruft und `src/app.ts` nicht zum Umfang des Goals gehört.
- Neue Tests waren rot: gegen die Merge-Basis Fall 1 ohne `retire` (`expected [ 'deploy', …(2) ] to deeply equal [ 'retire', 'deploy', …(2) ]`), Fall 2 mit 502 statt 200, weil `retire` an fremdem `caller` scheiterte, Fall 3 ohne Log-Zeile, Fall 4 grün, weil jeder neue Test einmal rot gesehen sein muss (`loop-constraints.md`, Budget und Qualität).

## Goal 10 (17.11.2026, Engineer CP)

- Die Regel für Namen eines Kontos liegt als `ACCOUNT_NAME_MAX = 32` und `parseAccountName` mit `^[A-Za-z0-9][A-Za-z0-9 _-]{0,31}$` in `src/konto/account.ts` neben `readAccountName`, weil Eingang und Anzeige so dieselbe Menge kennen und ein Name aus fremder Schrift (`Аtlas` mit kyrillischem A) neben dem Passkey-Knopf wie ein anderer aussehen kann (Entscheidung 1 des Tech Lead).
- `POST /v1/handoff` liest `automaton_name` für `konto` und `confirm` (auch ohne `step`) mit `parseAccountName` und antwortet sonst 400 `invalid_handoff` mit der Regel in einem Satz, während `deposit` und `payout` (`moneyHandoff`) weiter mit `parseName` lesen, weil ihr Name kein Konto benennt und ein Automaton mit Punkt im Namen sonst nicht mehr einzahlen könnte (Entscheidung 2).
- Die Prüfung des Namens steht vor der allgemeinen Prüfung des Körpers und greift nur für `confirm` und `konto`, weil `limit` den Namen ohne Fehler übergeht (konto 06, Entscheidung 2) und ein unbekannter Schritt weiter die allgemeine Meldung bekommen soll; die allgemeine Meldung nennt dieselbe Zahl 32.
- `readAccountName` zeigt vom Bestandsnamen nur den längsten Anfang aus erlaubten Zeichen, höchstens 32, ohne Leerzeichen am Ende, und `null`, wenn davon nichts nach der Regel bleibt, weil Herausfiltern aus „Atlas. Only Atlas may spend this“ den lesbaren Satz „Atlas Only Atlas may spend this“ machte; die Datenbank bleibt ohne Migration (Entscheidung 3).
- Fall 3 prüft die Seite auf „Only“, „Atlas. Only“ und „may spend this“ statt auf „Atlas.“ allein, weil die Seite selbst nach dem Namen einen Satz mit Punkt beendet („The new limit applies to your account Atlas.“) und „Atlas.“ dort auch bei richtigem Namen steht.
- Der Fall „escapes a name that carries markup“ in `test/handoff-page.test.ts` legt die Übergabe mit `createHandoff` direkt an statt über `POST /v1/handoff`, weil der Endpunkt den Namen `<script>…` jetzt richtig ablehnt und das Escaping der Seite für gespeicherte Namen weiter gelten muss; `it` und `expect` bleiben gleich viele. Die Datei fehlt in der Pfadliste der ersten Prüfung von Punkt 6, deshalb bleibt Punkt 6 offen (Kommentar am Child, Entscheidung beim Tech Lead).
- Das Schema von `start_automaton` trägt `maxLength: 32` und dasselbe `pattern`, und ein neuer Fall in `test/mcp-automaton.test.ts` hält fest, dass ein Name mit Punkt, fremder Schrift, führendem `-` oder 33 Zeichen ohne Aufruf `invalid_arguments` ergibt, weil `start_automaton` den Namen beim ersten Start als `automaton_name` mit `step: "konto"` schickt (Entscheidung 4); gegen `mcp/server.mjs` von `dev` war er rot (`Atlas.v2: expected false to be true`).
- `parseUsdc` und `src/konto/usdc.ts` bleiben gleich, und `test/konto-usdc.test.ts` hält sie mit einer Tabelle in `describe("parseUsdc")` und dem Fall an `POST /v1/konto/limit` außerhalb davon fest, weil die Mutationen mit `-t` je eine Seite auswählen (Entscheidung 5); die Tabelle hat 16 Zeilen, darunter `10000n` als BigInt, weil auch der ohne Typprüfung durchginge.
- Neue Tests waren rot: Fall 1 und Fall 3 von „account names are read strictly“ gegen die Merge-Basis (`expected 201 to be 400`, `expected 'Atlas. Only Atlas may spend this' to be 'Atlas'`), Fall 2 grün als Wächter; `test/konto-usdc.test.ts` mit gestrichener Typprüfung in beiden Fällen und mit `{1,19}` in der Tabelle, weil jeder neue Test einmal rot gesehen sein muss (`loop-constraints.md`, Budget und Qualität).
- Entscheidung: `test/handoff-page.test.ts` steht in der Pfadliste der ersten Prüfung von Punkt 6, weil der Fall „escapes a name that carries markup“ sich mit Punkt 1 ändern musste und die Zählung von `it` und `expect` derselben Prüfung die Datei weiter gegen einen schwächeren Test hält (Tech Lead, Kritik 2026-11-18).

## Abgelöst durch umzug 03 (Maker, 2026-11-18)

- Abgelöst: konto 08 Punkt 2 durch umzug 03 Punkt 1, Ausgabe dann genau `Exit 0, exit=0 | 6 6` (Tech Lead, 2026-11-18)
- Abgelöst: konto 08 Punkt 4 durch umzug 03 Punkt 1, Ausgabe dann genau `Exit 0, 6` (Tech Lead, 2026-11-18)
- Entscheidung (Tech Lead, 2026-11-22, PRO-27432): Die Ablösung von konto 08 Punkt 2 durch umzug 03 Punkt 1 gilt seit 2026-11-18 und trägt dieses Datum, weil umzug 03 Punkt 6 jede Ablösung durch umzug 03 an den 2026-11-18 bindet. Die Ausgabe `Exit 0, exit=0 | 6 6` korrigierte die Reparatur vom 2026-11-20 (3b1db86, PR #320), weil der Befehl `exit=$?` vor den Zahlen druckt; sie hatte dabei auch das Datum auf 2026-11-20 gesetzt und so umzug 03 Punkt 6 rot gemacht. Eine Korrektur der Ausgabe lässt das Datum der Ablösung stehen und kommt als eigene Entscheidung dazu.

## Goal 11 (18.11.2026, Engineer CP)

- Abzulösen ist genau die Erlaubnis, die `finishPayout` zu `retire_*` macht (`replacedPermission` in `src/konto/payout.ts`: ein wartendes `retire_*`, sonst `permission` und `forwarder` der Zeile), und dann trägt jeder Auszahl-Handoff den Widerruf, auch ohne Schlüsselwechsel, weil die Seite nicht weiß, wessen `caller` die alte Weiterleitung trägt, und ein wartendes `retire_*` mit fremdem `caller` sonst nie einen Widerruf bekäme (Entscheidung 1 des Tech Lead).
- Der Widerruf ist eine User Operation an den EntryPoint v0.6 `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` mit `execute(SpendPermissionManager, 0, revoke(p))`, `initCode` und `paymasterAndData` `0x`, `maxFeePerGas` und `maxPriorityFeePerGas` 0, und unser Gasschlüssel reicht sie mit `handleOps([op], <Gasschlüssel>)` über `sendKontoTx` ein, weil `revoke` die Wallet als Absender verlangt, die Wallet nur USDC hält und bei Gebühr 0 der EntryPoint von ihr nichts vorab fordert (Entscheidung 2).
- Die Gasgrenzen sind die Vorschläge des Tech Lead (`REVOKE_CALL_GAS` 100000, `REVOKE_VERIFICATION_GAS` 200000, `REVOKE_PRE_VERIFICATION_GAS` 50000), weil bei Gebühr 0 keine Grenze Geld kostet und `revoke` mit einem Speicherplatz plus die Prüfung einer ECDSA-Unterschrift in der Wallet weit darunter bleiben; gemessen auf einer Kette ist das nicht, weil dieses Goal keine Transaktion sendet.
- Die Seite bekommt `data-revoke-hash` (`getUserOperationHash` mit `entryPointVersion: "0.6"` und der Kette des Kontos) und `data-revoke-nonce` (`getNonce(account, 0)` über die neue Methode `PayoutChain.nonceOf` beim Rendern von `payout-passkey`), und ein Lesefehler antwortet 502 „The network could not be reached just now. Reload this page in a minute.“, weil nur der Server den Hash ohne Lesezugriff der Seite auf die Kette rechnen kann und der Fehler wie der von Bridge aussehen soll (Entscheidung 2 und 3).
- Der Client schickt die rohe Unterschrift des Eigentümers (65 Bytes) als `revoke.signature`, und der Server prüft sie mit `recoverAddress` gegen `owner` aus `konto_accounts` und verpackt sie erst beim Senden als `SignatureWrapper` mit `ownerIndex` 0, weil `validateUserOp` der Coinbase Smart Wallet v1 bei einem EOA-Eigentümer genau `ecrecover` über den Hash der User Operation ohne Präfix rechnet und die Prüfung beim Server so ohne Kette auskommt.
- Ein Passkey-Tipp unterschreibt beide Hashes mit einer Aktivität `ACTIVITY_TYPE_SIGN_RAW_PAYLOADS` (`sign_raw_payloads`, `HASH_FUNCTION_NO_OP`, ein `X-Stamp-WebAuthn`); `runPayout` reicht dafür `signPermission` einen Signierer, der den Hash der Erlaubnis mit dem des Widerrufs zusammen schickt, weil die Doku von Turnkey (Stand 2026-11-18, `docs/konto/euro.md`) mehrere Nutzlasten in einem gestempelten Aufruf erlaubt und das Goal damit nicht widerlegt ist (Entscheidung 3).
- `POST /h/{code}/payout` prüft den Widerruf vor der Unterschrift der Erlaubnis und antwortet ohne oder mit falschem Widerruf 400 `permission_refused` mit verbranntem Handoff, weil die Prüfung ohne Kette geht und ein fehlender Widerruf wie eine falsche Erlaubnis zählt; die 503 bei einem ausgefallenen RPC bleibt dahinter wie bisher (Entscheidung 4).
- `sendPayout` folgt der Reihenfolge aus Entscheidung 5: `isApproved` falsch verwirft, ein Widerruf geht über `handleOps` und danach muss `isApproved` falsch sein, ohne Widerruf und mit dem heutigen Schlüssel als `caller` geht `retire` wie bisher, sonst 409 `payout_needs_phone` mit der Log-Zeile `retire waits for the phone for`; auch bei gleichem `caller` geht der Widerruf vor `retire`, weil die Entscheidung es so ordnet und eine beendete Erlaubnis für beide Wege gleich aussieht.
- Scheitert `handleOps` nach dem Senden (Revert oder `isApproved` danach noch wahr), leert `sendPayout` nur `retire_revoke`, ging das Senden selbst nicht raus, bleibt er, weil eine verbrauchte Nonce oder eine falsche Unterschrift nie gelingen wird, ein Netzfehler vor dem Senden aber schon (Entscheidung 5).
- Die bestehenden Fälle mit einer zweiten Einrichtung erwarten jetzt `revoke` statt `retire` als erste Transaktion; der Fall mit ausfallendem `callerOf` setzt `retire_revoke` auf NULL wie eine Zeile von vor diesem Goal, weil `callerOf` nur noch ohne Widerruf gelesen wird und der Weg `retire` für solche Zeilen weiter gilt.
- `payoutPermission` in `test/money-helpers.ts` unterschreibt den Widerruf mit, wenn die Seite `payout-passkey` derselben Weiterleitung ihn verlangte (gemerkt in `toPasskey`), weil `test/konto-signature-retry.test.ts` nicht zu den Pfaden dieses Goals gehört und dort eine zweite Einrichtung mit `payoutPermission` weiter 200 ergeben muss; Fall 3 entfernt den Widerruf ausdrücklich.
- Auf 390 nimmt der dritte Eintrag die ganze Zeile (`.stats .across` in `EARLIER_STYLE`, nur für `payout-approve` mit früherer Freigabe), weil das Raster dort zwei Spalten hat und sonst neben einer leeren Zelle stünde; auf 1440 stehen alle drei in einer Zeile, so abgenommen auf PRO-24730.
- Bridge bietet kein Abschalten einer Auszahladresse an (Update ohne `state`), deshalb kein Aufruf und nur der Vorschlag `goals/_vorschlaege/konto-nacharbeit-2026-11-18-12.md` zum Löschen des alten Bankkontos, weil der Widerruf die alte Weiterleitung schon ohne Erlaubnis lässt (Entscheidung 6).
- `handleOps` mit dem Widerruf einer Erlaubnis, die der Kunde mit seinem Passkey unterschrieben hat, zählt im Hauptnetz zur Ausnahme aus Regel 10 von `loop-constraints.md`, weil sie wie `revokeAsSpender` nur eine Erlaubnis des Kunden beendet, kein Geld bewegt und nur mit `CP_KONTO_MAINNET=1` auf Base läuft; dieses Goal sendet keine Transaktion auf einer echten Kette.
- Neue Tests waren rot: die Fälle 1 bis 3 von „the earlier permission ends with the same passkey“ gegen die Merge-Basis (`expected … to contain 'Earlier approval'`, `expected 200 to be 409`, `expected 200 to be 400`), Fall 4 grün als Wächter, und der Client-Fall mit `SIGN_RAW_PAYLOADS` gegen den Client vor Punkt 6, weil jeder neue Test einmal rot gesehen sein muss (`loop-constraints.md`, Budget und Qualität).

## Goal 12 (18.11.2026, Engineer CP)

- Das Feld `automaton_name` im Body von `POST /v1/handoff` bleibt unverändert, weil `mcp/server.mjs` es auf den Rechnern der Nutzer sendet und eine Umbenennung jedes installierte Terminal bräche; `src/handoff/routes.ts` nennt es genau einmal als `const NAME_FIELD = "automaton_name";` und liest, erklärt und zeigt es im Beispiel nur über diese Konstante (`body?.[NAME_FIELD]`, Template-Strings, `[NAME_FIELD]` im Beispiel von `GET /v1/handoff`).
- Spalte `display_name`, Feld `Handoff.displayName` und Eigenschaft `displayName` der Seiten `src/public/{handoff,konto,money}.ts`, weil derselbe Wert bei `confirm`, `konto`, `deposit` und `payout` der Name aus dem Terminal und nur bei `limit` der Name des Kontos ist und `display_name` für alle Schritte sagt, was er ist; die Seite zum Tageslimit liest ihn als `h.displayName || null`, ihre Eigenschaft `accountName` bleibt, weil `src/public/limit.ts` nicht zu diesem Goal gehört.
- Die Umbauten von konto 02, 03 und 05 in `src/db.ts` bleiben Byte für Byte, weil sie ältere Schemata nachziehen, deren Spalte `automaton_name` heißt; danach folgt einmal `ALTER TABLE handoffs RENAME COLUMN automaton_name TO display_name`, nur solange `PRAGMA table_info(handoffs)` `automaton_name` meldet.
- Auch eine frische Datenbank geht über dieselbe Umbenennung (das `CREATE TABLE IF NOT EXISTS` bleibt wie es war), weil dann ein einziger Weg zum Schema führt und Fall 2 von `test/handoff-display-name.test.ts` ihn mitprüft; die Spalte steht nach der Umbenennung an derselben Stelle, und ein zweiter Start ändert nichts.
- Im Body-Zweig von `POST /v1/handoff` heißt der gesendete Name `sentName` und der gezeigte `displayName`, weil beim Schritt `limit` der gezeigte Name aus `readAccountName` kommt und nicht aus dem Body; so bleibt kein Bezeichner `automatonName` in `src`.
- `launch` in `ops/browser.mjs` hält alle laufenden Browser in einer Menge und meldet einen einzigen Listener mit `process.once("exit", …)` an, solange mindestens einer läuft, und mit `process.off` ab, wenn der letzte endet, weil zwölf gleichzeitige Starts mit einem Listener je Browser (Entscheidung 4 wörtlich) zwar am Ende 0 Listener zählen, unterwegs aber `MaxListenersExceededWarning` auslösen; `close()` bleibt unverändert.
- Neue Tests waren rot: beide Fälle von „the name a handoff shows is display_name“ gegen die Merge-Basis (Zeile ohne `display_name`, Spaltenliste mit `automaton_name`) und beide Arten von „launch ends its browser when node ends“ (`expected true to be false`, der `sleep` lebte zwei Sekunden nach Node noch), weil jeder neue Test einmal rot gesehen sein muss; der Listener-Zähler aus Punkt 3 zeigt mit einer Kopie ohne `process.off` `exit listeners 1`.

## Abgelöst durch konto 05 (Tech Lead, 2026-11-18)

- Abgelöst: konto 03 Punkt 5 durch konto 05 Punkt 16, Ausgabe dann genau `Exit 0, gruen ohne requireSepolia` (Tech Lead, 2026-11-18)
- Entscheidung (Tech Lead, 2026-11-18, PRO-25126): Die Gegenprobe aus konto 03 Punkt 5 leert `requireSepolia`, aber seit konto 05 Punkt 16 (Hauptnetz über `CP_KONTO_MAINNET`) gehen `sendKontoTx`, `topup.ts` und `payout.ts` über `requireNet(chainId, net)`, und niemand ruft `requireSepolia` mehr auf; deshalb bleibt der Test grün. Die Schranke hält weiter, weil ein geleertes `requireNet` `test/konto-chain.test.ts` und `test/konto-mainnet.test.ts` rot macht (3 failed, gemessen 2026-11-18 ohne Netz unter Node 22), und konto 05 Punkt 16 prüft sie mit 14 Tests. Die tote Definition von `requireSepolia` in `src/konto/chain.ts` bleibt stehen, weil der zweite Zähler von konto 03 Punkt 5 (`grep -rlE "requireSepolia\(" src/konto`, mindestens 1) nur an ihr hängt; wer sie entfernt, trägt dafür eine eigene Ablösung ein.
- Entscheidung (Tech Lead, 2026-11-19, PRO-25564): Ablöser bleibt konto 05 Punkt 16, weil erst dort `requireNet` an die Stelle von `requireSepolia` trat und kein anderer Punkt ohne Netz diese Schranke prüft. Seine drei Zeilen ohne Netz sind im Audit GRÜN, die zwei Zeilen gegen `mainnet.base.org` fährt das Audit als Produktionsaufruf nie; dass eine solche Zeile einen Ablöser nicht von GRÜN abhält, klärt code-host PR #856 in `loop-regeln`. Bis zu dessen Merge bleibt die Audit-Zeile von konto 03 Punkt 5 rot, die Ausgabe ist unverändert `Exit 0, gruen ohne requireSepolia`.

## Goal 13 (18.11.2026, Engineer CP)

- `finishPayout` nimmt im Eingabeobjekt das Pflichtfeld `replaced: { forwarder: string; permission: string } | null`, genau den Wert, den die Route vor der Prüfung des Widerrufs aus `replacedPermission(current)` las, und vergleicht ihn in seiner Transaktion über den Helfer `sameReplaced` (beide `null`, oder `forwarder` ohne Groß- und Kleinschreibung und `permission` als JSON-Text gleich) mit `replacedPermission(readPayout(db, account))`, weil nur so kein Widerruf neben einer anderen Erlaubnis landet als der, für die er unterschrieben ist; bei Abweichung gibt es `false`, bevor `ensurePayoutRow` oder ein `UPDATE` läuft.
- Gibt `finishPayout` `false`, verbrennt die Route den Handoff mit `burnMatched` und antwortet 410 `handoff_closed`, weil der Kunde dann einen neuen Code braucht, dessen Seite die Erlaubnis von jetzt zeigt; `burnMatched` ändert nur einen Handoff im Zustand `matched`, ein schon beendeter bleibt, wie er ist.
- Die Seite `payout-passkey` trägt am Knopf `data-revoke-permission` mit genau `replaced.permission` (durch `esc`), dazu wie bisher `data-revoke-hash` und `data-revoke-nonce`, weil `test/money-helpers.ts`, `test/konto-payout.test.ts` und `ops/soll-live-money.mjs` Hash und Nonce lesen; für den Client ist der Hash nur noch ein Abgleich, und `main.mjs` reicht ihn als `revokeCheck` weiter.
- `runPayout` in `flow.mjs` baut die User Operation wie `revokeUserOperation` (Sender die Smart Wallet, `execute(SpendPermissionManager, 0, revoke(p))`, dieselben Gasgrenzen, Gebühr 0, EntryPoint v0.6) und ihren Hash mit `getUserOperationHash` selbst, weil eine Unterschrift des Eigentümers über einen fremden Hash jeden Aufruf der Smart Wallet freigeben könnte; Konstanten und ABIs stehen in `flow.mjs` mit dem Hinweis, dass sie denen in `src/konto/payout.ts` gleichen müssen, und `src/konto/payout.ts` exportiert nichts Neues, weil es Server-Code mit Datenbank zieht.
- `revokedPermission` in `flow.mjs` nimmt nur eine lesbare Erlaubnis, deren `account` `data-account`, deren `token` `data-token`, deren `allowance` `PAYOUT_ALLOWANCE` und deren `period` `PAYOUT_PERIOD_SECONDS` ist, und wirft sonst `KontoError("unreachable", …)`, bevor ein Passkey-Dialog oder ein Aufruf bei Turnkey kommt, weil der Passkey nie den Widerruf der Erlaubnis zum Tageslimit oder eines fremden Kontos unterschreiben darf; `spender`, `start`, `end` und `salt` prüft er nur auf ihre Form, weil sie zur alten Weiterleitung gehören, die der Client nicht kennt.
- Die Helfer der Client-Tests (Passkey, Turnkey, Knopf, Kette der Smart Wallet) stehen in `test/konto-client-helpers.ts`, gemeinsam für `test/konto-client-deposit.test.ts` und `test/konto-client-revoke.test.ts`, weil zwei Kopien auseinanderlaufen würden; `buttonOf` entschlüsselt die HTML-Entitäten der Attribute wie der Browser, weil `data-revoke-permission` JSON mit Anführungszeichen trägt, und `fakeTurnkey` vergleicht `signWith` ohne Groß- und Kleinschreibung, weil die echte Seite den Eigentümer so zeigt, wie die Zeile ihn speichert.
- Fall 4 von `test/konto-client-revoke.test.ts` legt das Konto mit der Smart Wallet an, die der Client aus dem Eigentümer rechnet, und prüft Unterschriften mit `smartWalletChain`, die sowohl die ERC-6492-Unterschrift des Clients als auch die einfache Unterschrift aus `test/money-helpers.ts` annimmt, weil `account()` dort eine zufällige Wallet nimmt, der der Client die Unterschrift verweigert.
- Neue Tests waren rot: die Fälle 1 und 2 von „the revoke ends only the permission the person replaces“ gegen die Merge-Basis (`expected 200 to be 410`), Fall 3 grün als Wächter, und die Fälle 1 bis 3 von „the client signs only the revoke it builds itself“ (`expected [ …(2) ] to deeply equal []`, `expected 1 to be +0`), Fall 4 grün als Wächter, weil jeder neue Test einmal rot gesehen sein muss.

## Goal 14 (19.11.2026, Engineer CP)

- Der Absatz „Run an automaton from Claude Code“ im `README.md` bleibt an seiner Stelle und sagt in einem Satz „not switched on yet“, danach, was heute geht: die unveränderte Runtime mit der einen Zeile `conwayApiUrl` darüber und das Plugin für offene Jobs und Abgaben (die Werkzeuge `list_open_bounties` und `submit_work` brauchen kein Konto). Grund: Entscheidung 1 des Tech Lead, und konto 15 dreht nur diesen Absatz zurück.
- `KONTO_OFF` in `src/handoff/routes.ts` bleibt unverändert. `start_automaton` in `mcp/server.mjs` fängt nur 503 mit `error` gleich `konto_unavailable` ab und antwortet mit `error: "konto_unavailable"`, `http_status: 503` und dem Satz „Starting an automaton from Claude Code is not switched on yet. Nothing was charged.“; jede andere Ablehnung geht wie bisher durch `httpError`. Der Job wird dabei nicht gesetzt, damit `automaton_status` danach `none` sagt und kein halber Start offen bleibt. Grund: Entscheidung 2, API-Kunden brauchen den alten Hinweis, der Mensch in Claude Code den neuen Satz.
- `ops/konto-ready.sh` schickt sich selbst über `ssh … 'bash -s -- --on-server'` auf den Server und läuft dort im Zweig `--on-server`: Es holt je Name die letzte Zeile `NAME=…` mit `grep` (wie Compose die letzte nimmt), entfernt umschließende Anführungszeichen, vergleicht dort und gibt nur `set`, `missing`, `wrong`, `default`, `empty`, `key_file readable` oder `unreadable` aus. Grund: Entscheidung 3, so verlässt kein Wert den Server, und alles liegt in einer Datei, wie die Deny List es verlangt. Ein leerer Pflichtwert zählt als `missing`, weil der Dienst einen leeren Wert wie einen fehlenden behandelt.
- Die Prüfung des Schlüssels läuft mit `docker compose -f /opt/control-plane/repo/deploy/docker-compose.prod.yml exec -T cp test -r <Pfad>` und `</dev/null`, weil das Skript selbst auf stdin ankommt und `docker` den Rest sonst verschlucken würde; der absolute Pfad zur Compose-Datei ergibt dasselbe Projekt wie `cd` in den Ordner, weil Compose den Ordner der ersten Datei als Projektordner nimmt.
- Exit 2 mit `ssh failed`, wenn `ssh` mit etwas anderem als 0 oder 1 endet oder nichts zurückkommt; stderr von `ssh` geht nach `/dev/null` wie in `ops/status.sh`, damit auch eine Fehlermeldung keinen Wert mitbringt. Ist die Datei auf dem Server nicht lesbar, steht `env_file unreadable` davor und jede Pflichtzeile ist `missing`.
- Punkt 6 (Kritik Tech Lead): Nach `key_file` vergleicht das Skript auf dem Server je Name `CP_KONTO_CHAIN_ID`, `CP_KONTO_MAINNET`, `CP_KONTO_RPC_URL`, `CP_KONTO_KEY_FILE` und `CP_KONTO_AUTH_PROXY_ID` den Wert der Datei mit `docker compose … exec -T cp printenv <NAME>` und meldet `container current` oder `container stale` (Exit 1). Grund: Der Container liest `.env` über `env_file` ohne eigene Vorgabe für diese Namen, also muss er dieselben Werte tragen wie die Datei; fehlt ein Name in beiden, sind beide leer und gleich. `CP_BRIDGE_*` bleibt draußen, weil diese Werte den Exit nicht ändern. Läuft der Container nicht, sind alle Werte im Container leer und das Skript meldet `stale`, sobald die Datei einen Wert trägt; eine eigene Zeile `container down` ist Vorschlag `goals/_vorschlaege/konto-kritik-2026-11-19-1.md`. Bei `stale` nennt `docs/konto/euro.md` den Weg `deploy.yml` mit `force: true`, weil ein neuer Wert allein keinen Rollout auslöst.
- Der Test baut die Umgebung des Containers aus denselben Werten wie die Datei, ohne umschließende Anführungszeichen, wie Compose sie liest; das nachgebaute `docker` beantwortet `printenv <NAME>` daraus. Der Fall `container stale` war gegen das Skript ohne die Zeile rot (3 von 8), die Gegenproben mit einem Skript, das den Wert hinter `stale` ausgibt (2 von 8 rot), und einem, das nie `stale` meldet (1 von 8 rot), ebenfalls.
- `test/konto-ready.test.ts` legt `ssh` und `docker` als nachgebaute Skripte in einen Ordner aus `mkdtemp` vorn in `PATH`: `ssh` führt das letzte Argument mit `bash -c` aus und reicht stdin durch, `docker` prüft `test -r` auf das letzte Argument. `CP_READY_ENV_FILE` lenkt die Datei um; `ssh` trägt diese Variable nicht, also gilt auf dem Server immer `/opt/control-plane/.env`. Ein nicht lesbarer Schlüssel ist im Test eine fehlende Datei, weil `chmod 000` für root nichts ändert. `afterEach` löscht jeden Ordner mit `rmSync`.
- Die Tests waren rot: der Fall zu `konto_unavailable` in `test/mcp-automaton.test.ts` gegen den Stand vor der Änderung (`expected 'Creating an account is not switched o…' to be 'Starting an automaton from Claude Cod…'`) und gegen die Merge-Basis (`exit=1`); `test/konto-ready.test.ts` mit einem Skript, das den Wert hinter `set` ausgibt (5 von 7 rot), und mit einem, das `CP_KONTO_CHAIN_ID` nicht auf `8453` prüft (1 von 7 rot).

## Abgelöst durch konto 11 (Tech Lead, 2026-11-19)

- Abgelöst: konto 05 Punkt 2 durch konto 11 Punkt 2, Ausgabe dann genau `Exit 0, soll money: deposit-approve 390 px, 844 px tall, diff 0 px | soll money: deposit-approve 1440 px, 900 px tall, diff 0 px | soll money: deposit-card 390 px, 844 px tall, diff 0 px | soll money: deposit-card 1440 px, 900 px tall, diff 0 px | soll money: payout-approve 390 px, 844 px tall, diff 0 px | soll money: payout-approve 1440 px, 900 px tall, diff 0 px | soll money: payout-approve-revoke 390 px, 876 px tall, diff 0 px | soll money: payout-approve-revoke 1440 px, 915 px tall, diff 0 px | soll money: payout-verify 390 px, 844 px tall, diff 0 px | soll money: payout-verify 1440 px, 900 px tall, diff 0 px | soll money: payout-bank 390 px, 844 px tall, diff 0 px | soll money: payout-bank 1440 px, 900 px tall, diff 0 px | soll money: payout-passkey 390 px, 844 px tall, diff 0 px | soll money: payout-passkey 1440 px, 900 px tall, diff 0 px | soll money: retry 390 px, 844 px tall, diff 0 px | soll money: retry 1440 px, 900 px tall, diff 0 px | soll money: 16 images, blocks end 390=655 1440=684, 0 defects` (Tech Lead, 2026-11-19)
- Abgelöst: konto 05 Punkt 5 durch konto 11 Punkt 2, Ausgabe dann genau `Exit 0, soll money: deposit-approve 390 px, 844 px tall, diff 0 px | soll money: deposit-approve 1440 px, 900 px tall, diff 0 px | soll money: deposit-card 390 px, 844 px tall, diff 0 px | soll money: deposit-card 1440 px, 900 px tall, diff 0 px | soll money: payout-approve 390 px, 844 px tall, diff 0 px | soll money: payout-approve 1440 px, 900 px tall, diff 0 px | soll money: payout-approve-revoke 390 px, 876 px tall, diff 0 px | soll money: payout-approve-revoke 1440 px, 915 px tall, diff 0 px | soll money: payout-verify 390 px, 844 px tall, diff 0 px | soll money: payout-verify 1440 px, 900 px tall, diff 0 px | soll money: payout-bank 390 px, 844 px tall, diff 0 px | soll money: payout-bank 1440 px, 900 px tall, diff 0 px | soll money: payout-passkey 390 px, 844 px tall, diff 0 px | soll money: payout-passkey 1440 px, 900 px tall, diff 0 px | soll money: retry 390 px, 844 px tall, diff 0 px | soll money: retry 1440 px, 900 px tall, diff 0 px | soll money: 16 images, blocks end 390=655 1440=684, 0 defects` (Tech Lead, 2026-11-19)
- Abgelöst: konto 06 Punkt 7 durch konto 11 Punkt 2, Ausgabe dann genau `Exit 0, soll money: deposit-approve 390 px, 844 px tall, diff 0 px | soll money: deposit-approve 1440 px, 900 px tall, diff 0 px | soll money: deposit-card 390 px, 844 px tall, diff 0 px | soll money: deposit-card 1440 px, 900 px tall, diff 0 px | soll money: payout-approve 390 px, 844 px tall, diff 0 px | soll money: payout-approve 1440 px, 900 px tall, diff 0 px | soll money: payout-approve-revoke 390 px, 876 px tall, diff 0 px | soll money: payout-approve-revoke 1440 px, 915 px tall, diff 0 px | soll money: payout-verify 390 px, 844 px tall, diff 0 px | soll money: payout-verify 1440 px, 900 px tall, diff 0 px | soll money: payout-bank 390 px, 844 px tall, diff 0 px | soll money: payout-bank 1440 px, 900 px tall, diff 0 px | soll money: payout-passkey 390 px, 844 px tall, diff 0 px | soll money: payout-passkey 1440 px, 900 px tall, diff 0 px | soll money: retry 390 px, 844 px tall, diff 0 px | soll money: retry 1440 px, 900 px tall, diff 0 px | soll money: 16 images, blocks end 390=655 1440=684, 0 defects` (Tech Lead, 2026-11-19)
- Abgelöst: konto 08 Punkt 3 durch konto 11 Punkt 2, Ausgabe dann genau `Exit 1, exit=0 | 0` (Tech Lead, 2026-11-19)
- Abgelöst: konto 09 Punkt 6 durch konto 11 Punkt 4, Ausgabe dann genau `Exit 0, 2 2` (Tech Lead, 2026-11-19)
- Entscheidung (Tech Lead, 2026-11-19, PRO-25564): konto 11 Punkt 2 brachte die zwei SOLL-Bilder `payout-approve-revoke` (390 und 1440), seitdem prüft `ops/soll-money.mjs` 16 statt 14 Bilder und meldet `soll money: 16 images`; konto 11 Punkt 2 verlangt genau das und ist im Audit 2026-11-19 GRÜN. Die Money-Befehle von konto 05 Punkt 2, konto 05 Punkt 5 und konto 06 Punkt 7 geben ohne `tail` alle 17 Zeilen aus, deshalb steht die ganze Ausgabe in der Zeile; die Höhen 876 und 915 sind die des neuen Bilds, alle 16 Bilder melden `diff 0 px`, die Schranke hält also weiter. konto 08 Punkt 3 zählt die alte Summenzeile mit 14 Bildern und bekommt deshalb `0` bei Exit 0 des Werkzeugs. Die Zeilen 248 und 249 (konto 05 Punkt 5 durch konto 06 Punkt 7) gelten weiter, weil konto 06 Punkt 7 mit dieser Ablösung über die Kette wieder bis zu einem GRÜN reicht.
- Entscheidung (Tech Lead, 2026-11-19, PRO-25564): konto 11 Punkt 4 teilte das Lesen der Kette im `retire`-Zweig von `sendPayout` in zwei Stellen (c31714b), deshalb steht `throw new PayoutFailed("retire", null);` in `src/konto/payout.ts` zweimal und die Gegenprobe aus konto 09 Punkt 6 zählt `2`. Ersetzt sie beide, werden beide Fälle unter „when the chain cannot be read before the retire“ rot, die Gegenprobe greift also weiter; Ablöser ist konto 11 Punkt 4, weil er diesen Zweig baut und im Audit 2026-11-19 GRÜN ist. Gemessen auf 57a3c64 ohne Netz unter Node 22.

## Tech Lead, Reparatur PRO-28328 (2026-11-23)

- Entscheidung (Tech Lead, 2026-11-23, PRO-28328): Die Zeile `- Abgelöst:` zu konto 02 Punkt 1 mit `open 'docs/soll/src/handoff-freigabe.html'` gilt für den dritten (`quellen ok`) und den vierten Prüfbefehl (`bausteine ok neu=<n>`) dieses Punkts, weil beide an derselben Datei mit derselben Meldung enden und mehrere Befehle eines Punkts mit derselben neuen Ausgabe eine Zeile teilen (`goals/seite/ANNAHMEN.md`, seite 03). Gemessen am Kopf von PRO-28328 ohne Netz: beide `Exit 1, Error: ENOENT: no such file or directory, open 'docs/soll/src/handoff-freigabe.html'`, Ablöser konto 06 Punkt 3.
- Entscheidung (Tech Lead, 2026-11-23, PRO-28328): Die Ausgabe einer Zeile `- Abgelöst:` ist der Exit-Code und, was der Befehl auf stdout und stderr zusammen schreibt, weil die abgelösten Befehle mit Exit 1 ihre Meldung nur auf stderr schreiben (`unknown argument: --pruefen`, `ENOENT`) und die Zeilen genau so gemessen wurden. Bei einer ungefangenen Ausnahme von Node zählt nur die Zeile `Error: …`; Quelltextauszug, Stack, Fehlerfelder und `Node.js v…` zählen nicht, weil sie mit der Node-Version wechseln (Audit Node 22, code-host Node 24, PRO-25107). Zeilen auf stderr, die mit `soll-live`, einem optionalen `-<name>` und `: ` beginnen (Regex `^soll-live(-[a-z]+)?: `), zählen nicht, weil die Live-Werkzeuge dort nur ihren Fortschritt melden (seite 03, `goals/seite/ANNAHMEN.md`) und ihre Zeile `written to` einen Pfad aus `mktemp` trägt, der bei jedem Lauf anders ist. Nachgemessen am Kopf 5824839 ohne Netz: Mit dieser Regel treffen die Audit-Zeilen 951, 985, 987, 1033, 1035, 1036, 1091, 1093, 1095, 1189, 2169, 2192 und 2217 ihre Zeile `- Abgelöst:` genau (QA Skeptic, PRO-28328 Runde 1).

## Abgelöst durch umzug 06 (Maker, 2026-11-28)

- Abgelöst: konto 02 Punkt 8 durch umzug 06 Punkt 3, Ausgabe dann genau `Exit 0, 9` (Tech Lead, 2026-11-28)
