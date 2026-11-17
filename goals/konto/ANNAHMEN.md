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

- Abgelöst: konto 02 Punkt 1 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, Node.js v22.23.5` (Tech Lead, 2026-11-17)
- Abgelöst: konto 02 Punkt 1 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, Node.js v22.23.5` (Tech Lead, 2026-11-17)
- Abgelöst: konto 02 Punkt 3 durch konto 06 Punkt 6, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T12:48:57+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 3 durch konto 06 Punkt 6, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T12:48:57+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 5 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 0, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 3 durch konto 06 Punkt 3, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 3 durch konto 06 Punkt 1, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 5 durch konto 06 Punkt 7, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 5 durch konto 06 Punkt 7, Ausgabe dann genau `Exit 1, 0` (Tech Lead, 2026-11-17)

## Abgelöst durch umzug 02 (Maker, 2026-11-17)

- Abgelöst: konto 02 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 03 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 04 Punkt 3 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 05 Punkt 4 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
- Abgelöst: konto 06 Punkt 6 durch umzug 02 Punkt 2, Ausgabe dann genau `Exit 1, keine abnahme nach 2026-11-17T16:39:12+00:00` (Tech Lead, 2026-11-17)
