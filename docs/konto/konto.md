# Das Konto per Passkey: Vertrag

Wer im Terminal einen Automaton startet und keine Wallet hat, bekommt über den Handoff aus konto 02 (`docs/konto/handoff.md`) ein
eigenes Konto: Nach der richtigen Zahl legt er auf dem Handy per Passkey ein Konto bei Turnkey an, dessen Wallet Eigentümer einer
Coinbase Smart Wallet ist, und unterschreibt eine Abbuchungserlaubnis (Spend Permission). Das Terminal erfährt Adresse und einmal
einen API-Schlüssel. Gebaut in goals/konto/03, die Entscheidungen mit Grund stehen in `goals/konto/ANNAHMEN.md` unter `## Goal 03`.
Alles läuft auf Base Sepolia (chainId 84532) mit Test-USDC; in der Produktion ist das Konto aus.

## Ablauf

1. Das Terminal legt den Handoff mit `POST /v1/handoff` an und schickt zusätzlich `"step": "konto"`. Ohne `step` oder mit
   `"step": "confirm"` bleibt alles wie in konto 02. Ist das Konto aus (kein `CP_KONTO_CHAIN_ID`), antwortet `step: "konto"` mit 503
   und `error: "konto_unavailable"`.
2. Der Mensch tippt auf `/h/{code}` die Zahl aus dem Terminal. Die richtige Zahl führt bei `step: "konto"` in den Zustand `matched`
   statt `done`, die Seite zeigt den Schritt Passkey; eine falsche verbrennt den Code wie bisher (`burned`).
3. Die Seite legt im Browser das Konto bei Turnkey an, berechnet die Smart Wallet mit der Turnkey-Wallet als Eigentümer und
   `SpendPermissionManager` als zweitem Eigentümer, unterschreibt die Erlaubnis und schickt `POST /h/{code}/konto` mit JSON
   `{"account": "0x…", "permission": {…}, "signature": "0x…"}`. Die Zahlen der Erlaubnis stehen als Strings. Das Skript ist
   `/h/konto.js` auf unserer Adresse (gebündelt aus `src/public/konto-client/` mit `node ops/konto/build-client.mjs`); es ruft nur
   Turnkey auf: `POST https://authproxy.turnkey.com/v1/signup_v2` mit der öffentlichen ID aus `CP_KONTO_AUTH_PROXY_ID` legt die
   Sub-Organisation mit dem Passkey, einer Ethereum-Wallet und einem P-256-Schlüssel des Tabs an, der nicht exportierbar ist und
   nach 120 Sekunden verfällt; dieser Schlüssel lässt die Wallet einmal den Hash unterschreiben
   (`/public/v1/submit/sign_raw_payload`). Ein Tipp, ein Passkey. Die Adresse der Smart Wallet folgt per CREATE2 aus der Factory,
   die Unterschrift ist ERC-6492, weil die Wallet noch keinen Code hat; die Seite fragt keine Chain. Nach 200 zeigt `/h/{code}` den
   Zustand `erledigt` aus konto 02, nach einem Fehler schickt das Skript den Grund an `POST /h/{code}/fehlgeschlagen`.
4. Der Server prüft mit `permissionMatches` und `signatureValid` (Abschnitt Erlaubnis). Passt alles, wird der Handoff `done`: die
   Smart Wallet steht als Konto in `wallets` und `konto_accounts`, ein neuer API-Schlüssel entsteht über `createApiKey` aus
   `src/auth/siwe.ts`. Passt etwas nicht, antwortet der Server 400 mit `error: "permission_refused"` und verbrennt den Handoff,
   damit das Terminal nicht auf einen halb fertigen Schritt wartet; es legt einen neuen an.
5. Der Strom `GET /v1/handoff/{code}` meldet `pending`, dann `matched`, dann `done`. Das erste Ereignis `done` trägt `account` (die
   Smart Wallet, klein geschrieben) und `api_key`; danach steht der Schlüssel nur noch als Hash in `api_keys`, und jedes weitere
   Lesen trägt `account` ohne `api_key`.

`POST /h/{code}/konto` antwortet:

| Lage | Status |
|---|---|
| Konto aus | 503 |
| unbekannter Code | 404 |
| Zahl noch nicht getippt, oder Handoff ohne `step: "konto"` | 409 |
| schon `done`, `burned` oder nach zehn Minuten `expired` | 410 |
| Erlaubnis oder Unterschrift passt nicht | 400, Handoff `burned` |
| alles passt | 200 mit `{"state": "done", "account": "0x…"}` |

## Erlaubnis

Die Erlaubnis ist eine `SpendPermission` des Vertrags `SpendPermissionManager` (`0xf85210b21cc50302f477ba56686d2019dc9b67ad`), EIP-712
mit der Domain `Spend Permission Manager`, Version `1`, der chainId und dem Vertrag als `verifyingContract`. `permissionMatches`
verlangt:

| Feld | Regel |
|---|---|
| `account` | die Smart Wallet, die die Seite als `account` meldet |
| `spender` | unsere Adresse, die Adresse des Schlüssels in `CP_KONTO_KEY_FILE` |
| `token` | Test-USDC auf Base Sepolia, `0x036cbd53842c5426634e7929541ec2318f3dcf7e` |
| `allowance` | genau `daily_limit_usdc` des Handoffs |
| `period` | 86400 Sekunden |
| `start` | höchstens fünf Minuten nach der Uhr des Servers |
| `end` | nach `start` |

`signatureValid` fragt die Chain über `CP_KONTO_RPC_URL` (`verifyTypedData` aus viem): ERC-1271 für eine deployte Smart Wallet,
ERC-6492 für eine, die es noch nicht gibt. Jeder Fehler beim Fragen zählt als ungültig. Die Grenze erzwingt der Vertrag: `spend()`
über dem Rest der Periode bricht mit `ExceededSpendPermission` (Selector `0xfd1ebc88`) ab, belegt im Harness
(`harness/e2e/konto-chain.mjs`, Job `e2e`).

## Nachbuchen

Nach jeder Anfrage mit API-Schlüssel ruft der Dienst im Hintergrund `topUpIfLow` für die Adresse dahinter. Ist sie ein Konto aus
`konto_accounts` und fällt ihr verfügbares Guthaben unter `CP_KONTO_TOPUP_BELOW_USDC` (Vorgabe 1000000, also 1 USD), bucht der Dienst
`CP_KONTO_TOPUP_USDC` (Vorgabe 2000000) per `spend()` ab, höchstens den Rest der laufenden Periode (`getCurrentPeriod`). Ist der Rest
0, gibt es keine Transaktion, und die Anfrage bekommt 402 wie heute. Kennt der Vertrag die Erlaubnis noch nicht, sendet der Dienst
vorher `approveWithSignature` mit der gespeicherten Unterschrift. Je Konto läuft höchstens ein Nachbuchen gleichzeitig.

Gebucht wird erst nach einer Quittung mit Status `success` (`receiptSucceeded`): eine Ledger-Zeile `topup` mit dem Hash der
Transaktion als `ref` und `meta` mit `source` `spend_permission`, `chain_id` 84532 und dem Betrag in atomaren USDC. Zehn atomare USDC
sind ein mc. Derselbe Hash bucht nie zweimal; eine Quittung `reverted` bucht nichts.

Ein gesendetes `spend()` geht nie verloren: Sein Hash und Betrag stehen in `konto_accounts.pending_tx` und `pending_usdc`, bevor der
Dienst auf die Quittung wartet. Scheitert das Warten (Fehler des RPC, Zeitüberschreitung, Neustart), bleibt der Hash offen, und der
nächste Lauf für dieses Konto prüft zuerst ihn: `success` bucht genau eine Zeile `topup` und schließt ihn in derselben Transaktion,
`reverted` schließt ihn ohne Buchung, und erst der Lauf danach darf ein neues `spend()` senden. Solange ein Hash offen ist, sendet
der Dienst für dieses Konto nichts Neues.

## Base Sepolia

Gesendet wird nur über `sendKontoTx` in `src/konto/chain.ts`. Sie ruft vor jedem Aufruf ans Netz `requireSepolia(chainId)`, das jede
chainId außer 84532 mit einem Fehler ablehnt (`loop-constraints.md`, Regel 10, Ausnahme Base Sepolia). Der Testschlüssel kommt nur
aus der Datei in `CP_KONTO_KEY_FILE` (auf dem code-host `~/.config/control-plane/konto-sepolia.key`, Modus 0600), nie aus einer
Umgebungsvariable mit dem Wert und nie aus einem Schlüssel der Betreiber-Wallet; er steht in keiner Ausgabe und keinem Fehlertext.

| Variable | Bedeutung |
|---|---|
| `CP_KONTO_CHAIN_ID` | fehlt: Konto aus. 84532: an. Jeder andere Wert: der Dienst startet nicht |
| `CP_KONTO_KEY_FILE` | Datei mit dem Testschlüssel; Pflicht, wenn das Konto an ist |
| `CP_KONTO_RPC_URL` | JSON-RPC von Base Sepolia, Vorgabe `https://sepolia.base.org` |
| `CP_KONTO_TOPUP_BELOW_USDC` | Schwelle in atomaren USDC, Vorgabe 1000000 |
| `CP_KONTO_TOPUP_USDC` | Betrag je Nachbuchen in atomaren USDC, Vorgabe 2000000 |
| `CP_KONTO_AUTH_PROXY_ID` | öffentliche ID der Auth-Proxy-Konfiguration bei Turnkey, die die Seite an das Skript gibt; ohne sie meldet der Knopf den Anbieter als nicht erreichbar |

Der Lauf auf Base Sepolia steht in `docs/konto/sepolia.md` (`node --import tsx ops/konto/sepolia-run.mjs`, auf dem code-host am Port
47391, der als `http://localhost:47391` Allowed Origin des Auth Proxy ist); `node ops/konto/turnkey-check.mjs` liest danach die
Sub-Organisation des Kontos.

Kein Deploy setzt eine dieser Variablen (`deploy/**`, `.github/**`), damit die Produktion nie Credits aus Test-USDC bucht.

## Für konto 04 und 05

- konto 04 (`start_automaton` im Terminal) legt den Handoff mit `"step": "konto"` an, liest im Strom das erste `done` und nimmt
  `account` als Adresse und `api_key` als Schlüssel des neuen Automatons. Der Schlüssel kommt genau einmal; geht er verloren, legt das
  Tool einen neuen Handoff an. Einnahmen eines Dienstes mit payTo auf `account` landen direkt auf dem Konto des Kunden.
- konto 05 schaltet das Konto im Hauptnetz an. Dafür ändert Matthias zuerst Regel 10; dann bekommen `requireSepolia`, der Token und
  `CP_KONTO_CHAIN_ID` die Werte des Hauptnetzes, der Testschlüssel wird durch einen eigenen Spender ersetzt, und der Lauf aus
  `docs/konto/sepolia.md` wird im Hauptnetz wiederholt. Auszahlungen gibt der Kunde je Auszahlung per Passkey frei (`ANNAHMEN.md`,
  Goal 01).
