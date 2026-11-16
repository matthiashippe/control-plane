# Euro rein, Euro raus: Einzahlung per Karte und Auszahlung aufs Bankkonto

Klärung für konto 05 (Punkt 1) aus der Doku von Turnkey, MoonPay, Coinbase, Bridge und den Verträgen auf Base, gelesen am
2026-11-16. Beispielwerte sind erfunden; die einzige IBAN in diesem Repo ist die Beispiel-IBAN DE89 3704 0044 0532 0130 00.

## Einzahlung

Der Weg: Das MCP-Tool `deposit {amount_usd}` legt einen Handoff mit `step: "deposit"` an, der Mensch scannt den QR-Code, wählt die
richtige Zahl, und die Seite `deposit-card` startet mit einem Tipp auf den Passkey den Karten-Onramp von Turnkey. MoonPay schreibt das
USDC danach direkt an die Smart Wallet des Kontos; `automaton_status` zeigt es als `balance_usd`.

Die Anfrage ist die Activity `ACTIVITY_TYPE_INIT_FIAT_ON_RAMP` unter `POST https://api.turnkey.com/public/v1/submit/init_fiat_on_ramp`
mit `type`, `timestampMs`, `organizationId` und `parameters`, unterschrieben im Header `X-Stamp` (API-Schlüssel) oder
`X-Stamp-WebAuthn` (Passkey) ([Quelle](https://docs.turnkey.com/api-reference/activities/init-fiat-on-ramp), Stand 2026-11-16).
Pflicht in `parameters` sind `onrampProvider` (`FIAT_ON_RAMP_PROVIDER_MOONPAY` oder `FIAT_ON_RAMP_PROVIDER_COINBASE`),
`walletAddress`, `network` (`FIAT_ON_RAMP_BLOCKCHAIN_NETWORK_BASE`) und `cryptoCurrencyCode` (`FIAT_ON_RAMP_CRYPTO_CURRENCY_USDC`);
frei sind `fiatCurrencyCode` (darunter `FIAT_ON_RAMP_CURRENCY_EUR` und `FIAT_ON_RAMP_CURRENCY_USD`), `fiatCurrencyAmount` als Text,
`paymentMethod` (`FIAT_ON_RAMP_PAYMENT_METHOD_CREDIT_DEBIT_CARD`), `countryCode` (`DE`), `sandboxMode` (Vorgabe false) und
`urlForSignature` (gleiche [Quelle](https://docs.turnkey.com/api-reference/activities/init-fiat-on-ramp), Stand 2026-11-16).
Die Antwort trägt `activity.result.initFiatOnRampResult` mit `onRampUrl` (die Seite öffnet sie) und `onRampTransactionId`
(für `get_onramp_transaction_status`), dazu `onRampUrlSignature` nur bei `urlForSignature`.

Wer unterschreibt: die Sub-Organisation des Kunden. `organizationId` ist `data-org` der Seite, der Stempel kommt aus seinem Passkey
(`X-Stamp-WebAuthn`), weil der Schlüssel des Tabs aus konto 03 nach 120 Sekunden verfällt. In `@turnkey/core` 2.14.1 heißt der
Aufruf `httpClient.initFiatOnRamp(input, stampWith)` und geht auf genau diesen Pfad; der Kit-Handler `handleOnRamp` nimmt
`organizationId` als Sub-Organisation und `stampWith` als Passkey ([Quelle](https://docs.turnkey.com/generated-docs/react-wallet-kit/client-context-type-handle-on-ramp), Stand 2026-11-16).

Das Ziel darf die Smart Wallet sein: `walletAddress` ist laut Doku nur „destination wallet address“ ohne Bindung an eine Wallet von
Turnkey, und Policies greifen nicht bei Aktionen im Widget des Anbieters
([Quelle](https://docs.turnkey.com/features/transaction-management/funding), Stand 2026-11-16). Die Seite setzt deshalb die Adresse
der Smart Wallet aus `data-address` ein, nicht die EOA der Turnkey-Wallet. USDC ist ein einfacher `transfer`, er kommt auch an, wenn
die Smart Wallet noch keinen Code hat.

MoonPay passt für Deutschland: `DE` hat `isBuyAllowed: true`
([Quelle](https://api.moonpay.com/v3/countries), Stand 2026-11-16), `usdc_base` ist USDC `0x8335…2913` auf Chain 8453, gesperrt nur
für Kanada, mit `minBuyAmount` 5 USDC; EUR und USD haben `minBuyAmount` 20 ([Quelle](https://api.moonpay.com/v3/currencies), Stand 2026-11-16).
Karte (Visa, Mastercard, Maestro) und Apple Pay gelten in allen Regionen und sofort, SEPA nur für EUR und mit 1 bis 3 Bankarbeitstagen
([Quelle](https://support.moonpay.com/customers/docs/all-supported-payment-methods?lng=en#on-ramp), Stand 2026-11-16).
Coinbase nimmt Karten ebenfalls in der EU an ([Quelle](https://docs.cdp.coinbase.com/onramp-&-offramp/developer-guidance/payment-methods), Stand 2026-11-16),
hat im Widget bei Turnkey aber keinen Sandbox-Modus und bewegt dort echtes Geld.

Drei Haken stehen fest. Erstens verlangt Turnkey für `fiatCurrencyAmount` einen Wert größer als „20“, und MoonPay kauft ab 20 EUR
oder 20 USD; unter 20,01 lässt die Seite das Feld weg, dann fragt MoonPay den Betrag. Zweitens hat `usdc_base` bei MoonPay
`supportsTestMode: false`, `sandboxMode` hilft für USDC auf Base also nicht; der Harness bildet den Onramp nach. Drittens ist
`init_fiat_on_ramp` als veraltet markiert, der Nachfolger ist die Abfrage `POST /public/v1/query/list_fiat_on_ramp_quotes`
(`fiatAmount`, `fiatCurrencyCode` `FIAT_RAMP_CURRENCY_EUR`, `caip19` `eip155:8453/erc20:0x833589fcd6edb6e08f4c7c32d4f71b54bda02913`,
Antwort `quotes[].quoteId`) ([Quelle](https://docs.turnkey.com/api-reference/queries/list-fiat-on-ramp-quotes), Stand 2026-11-16)
und danach `ACTIVITY_TYPE_CREATE_FIAT_ON_RAMP_SESSION` mit `quoteId` und `walletAddress`, Antwort `onRampUrl` und `onRampTransactionId`
([Quelle](https://docs.turnkey.com/api-reference/activities/create-fiat-on-ramp-session), Stand 2026-11-16).

Voraussetzung bei Turnkey: Fiat braucht ein eigenes Konto beim Anbieter mit Firmenprüfung (1 bis 4 Bankarbeitstage), dessen
Schlüssel im Dashboard von Turnkey hinterlegt werden (gleiche [Quelle](https://docs.turnkey.com/features/transaction-management/funding), Stand 2026-11-16).

## Auszahlung

Der Weg: Das MCP-Tool `payout {amount_usd} | {all:true}` ruft `POST /v1/konto/payout`. Ohne zweite Erlaubnis antwortet der Server
409 `payout_needs_phone`, das Tool legt den Handoff `step: "payout"` an, und die Seite führt durch drei Schritte: Identität bei
Bridge (`payout-verify`), IBAN und Name (`payout-bank`) und die zweite Erlaubnis per Passkey (`payout-passkey`) mit Spender
`forwarderAddress(account, destination)`. Danach ruft das Tool `payout` noch einmal mit denselben Argumenten, und jede weitere
Auszahlung läuft ohne Handy. Fällt beim Prüfen der Unterschrift der RPC aus, antwortet die Route 503 `signature_check_unavailable`,
der Handoff bleibt `matched`, und `retry` schickt dieselbe Unterschrift noch einmal.

Bridge spricht man mit dem Header `Api-Key` an, ohne Benutzername
([Quelle](https://apidocs.bridge.xyz/api-reference/introduction/introduction), Stand 2026-11-16). Jeder `POST` braucht
`Idempotency-Key`, `GET`, `PUT`, `PATCH` und `DELETE` dürfen ihn nicht tragen; derselbe Schlüssel gibt 24 Stunden lang dieselbe Antwort
zurück, mit geändertem Body einen Fehler, danach 422 ([Quelle](https://apidocs.bridge.xyz/api-reference/introduction/idempotence), Stand 2026-11-16).
Produktion ist `https://api.bridge.xyz/v0`, die Sandbox `https://api.sandbox.bridge.xyz/v0` mit Schlüsseln `sk-test…`; dort gibt es
`POST /v0/customers/{id}/simulate_kyc_approval` und `POST /v0/customers/{id}/liquidation_addresses/{id}/simulate_deposit`, aber keine
echte Kette ([Quelle](https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-sandbox), Stand 2026-11-16).

1. Identität: `POST /v0/kyc_links` mit `email` und `type` (`individual`) als Pflicht, dazu frei `full_name`, `endorsements`
   (`["sepa"]` für Euro), `redirect_uri`. Antwort 200 mit `id`, `customer_id`, `kyc_link`, `kyc_status`, `tos_link`, `tos_status`
   ([Quelle](https://apidocs.bridge.xyz/api-reference/kyc-links/generate-the-links-needs-to-complete-kyc-for-an-individual-or-business), Stand 2026-11-16).
   `GET /v0/kyc_links/{kycLinkID}` liefert dieselben Felder; `kyc_status` ist einer von `not_started`, `incomplete`,
   `awaiting_questionnaire`, `awaiting_ubo`, `under_review`, `approved`, `rejected`, `paused`, `offboarded`, `deposits_restricted`.
   Bridge markiert die ganze KYC-Links-API als veraltet; Ersatz sind `POST /v0/customers/tos_links`, `POST /v0/customers` mit
   `signed_agreement_id` und `GET /v0/customers/{customerID}/kyc_link?endorsement=sepa`
   ([Quelle](https://apidocs.bridge.xyz/platform/customers/customers/kyclinks), Stand 2026-11-16).
   `GET /v0/customers/{customerID}` meldet `status` (`active` statt `approved`) und je Eintrag in `endorsements` `name` und `status`
   (`incomplete`, `approved`, `revoked`) ([Quelle](https://apidocs.bridge.xyz/api-reference/customers/get-a-single-customer-object), Stand 2026-11-16).
2. IBAN: `POST /v0/customers/{customerID}/external_accounts` mit Pflicht `currency: "eur"`, `account_type: "iban"`,
   `iban.account_number`, `iban.country` und `account_owner_name`, dazu frei `iban.bic`, `account_owner_type` (`individual`),
   `first_name`, `last_name`, `bank_name` und `address`; Antwort 201 mit `id` und `iban.last_4`
   ([Quelle](https://apidocs.bridge.xyz/api-reference/external-accounts/create-a-new-external-account), Stand 2026-11-16).
   Das Länderkürzel ist dreistellig (`"country": "DEU"`), wie im Beispiel mit der Beispiel-IBAN, und Euro und SEPA schaltet Bridge erst
   nach Anfrage beim Vertrieb frei ([Quelle](https://apidocs.bridge.xyz/get-started/guides/move-money/eur-integration-guide), Stand 2026-11-16).
3. Auszahladresse: `POST /v0/customers/{customerID}/liquidation_addresses` mit Pflicht `chain: "base"` und `currency: "usdc"`, dazu
   `external_account_id`, `destination_payment_rail: "sepa"`, `destination_currency: "eur"` und frei `destination_sepa_reference`;
   Antwort 201 mit `id`, `address` und `state` ([Quelle](https://apidocs.bridge.xyz/api-reference/liquidation-addresses/create-a-liquidation-address), Stand 2026-11-16).
   Eine zweite Adresse mit gleicher Kette, Währung und gleichem Ziel lehnt Bridge ab, ein Wiederholen braucht also denselben
   `Idempotency-Key` ([Quelle](https://apidocs.bridge.xyz/platform/orchestration/liquidation_address/liquidation_address), Stand 2026-11-16).
4. Verlauf: `GET /v0/customers/{customerID}/liquidation_addresses/{liquidationAddressID}/drains` mit `limit`, `starting_after`,
   `ending_before`, `tx_hash`; Antwort `data[]` mit `id`, `amount`, `currency`, `state` (`awaiting_funds` bis `payment_processed`,
   dazu `returned`, `refunded`, `error`), `deposit_tx_hash`, `destination` und `receipt`
   ([Quelle](https://apidocs.bridge.xyz/api-reference/liquidation-addresses/get-drain-history-of-a-liquidation-address), Stand 2026-11-16).

Mindestbetrag: USDC auf Base nach SEPA in EUR ist 1 ([Quelle](https://apidocs.bridge.xyz/get-started/introduction/what-we-support/payment-routes), Stand 2026-11-16).
Bridge rechnet ihn nach Abzug der eigenen Gebühr, und Beträge darunter werden weder gutgeschrieben noch zurückgeschickt
([Quelle](https://apidocs.bridge.xyz/platform/orchestration/fees-and-mins/mins), Stand 2026-11-16). Darum ist `below_minimum` unter
1,00 USD Schutz und keine Formsache, und HTC setzt keine eigene Gebühr auf die Auszahladresse.

## Weiterleitung

Eine Spend Permission zahlt nur an ihren Spender: `spend()` hat `requireSender(spendPermission.spender)` und überweist mit
`_transferFrom(token, account, spender, value)` an den Spender, `revokeAsSpender` darf ebenfalls nur der Spender aufrufen
([Quelle](https://github.com/coinbase/spend-permissions/blob/e0004e63edc4e17de7aa978293800ac7a16892e5/src/SpendPermissionManager.sol#L400-L426), Stand 2026-11-16).
Eine Erlaubnis gilt nur zwischen `start` und `end`, danach wirft `getCurrentPeriod` `AfterSpendPermissionEnd`
([Quelle](https://github.com/coinbase/spend-permissions/blob/e0004e63edc4e17de7aa978293800ac7a16892e5/src/SpendPermissionManager.sol#L516-L523), Stand 2026-11-16).

Deshalb ist der Spender der zweiten Erlaubnis der Vertrag `PayoutForwarder` aus `src/konto/contracts/PayoutForwarder.sol` mit den
unveränderlichen Werten `account`, `destination` (die Auszahladresse von Bridge), `token`, `manager` und `caller` (unser Gasschlüssel).
`payout(SpendPermission p, uint160 value)` verlangt `msg.sender == caller`, `p.account == account`, `p.spender == address(this)` und
`p.token == token`, ruft `manager.spend(p, value)` und überweist `value` im selben Aufruf an `destination`. `retire(p)` ruft
`manager.revokeAsSpender(p)`, `flush()` schickt das ganze USDC des Vertrags an `destination`. Kein Eigentümer, kein `delegatecall`,
kein `selfdestruct`, kein `receive`.

Angelegt wird er mit CREATE2 über den Deterministic Deployment Proxy `0x4e59b44847b379578588920ca78fbf26c0b4956c`: Die Transaktion geht
an den Proxy, die Daten sind das Salt (32 Bytes, hier null) gefolgt vom Initcode, also Bytecode plus ABI-kodierte Konstruktorwerte
([Quelle](https://github.com/Arachnid/deterministic-deployment-proxy/blob/be3c5974db5028d502537209329ff2e730ed336c/README.md), Stand 2026-11-16).
Die Adresse ist `keccak256(0xff ++ proxy ++ salt ++ keccak256(initcode))[12:]` (in viem `getContractAddress({opcode: "CREATE2", from,
salt, bytecode})`); `forwarderAddress` rechnet sie vorab, damit die Seite genau diese Adresse als Spender unterschreiben lässt. Der Proxy
gibt die 20 Bytes der neuen Adresse zurück und bricht ab, wenn CREATE2 scheitert, etwa weil dort schon Code liegt; der Server prüft
deshalb vorher `eth_getCode`. Am 2026-11-16 liefert `eth_getCode` für den Proxy auf `https://sepolia.base.org` (Chain `0x14a34`) und auf
`https://mainnet.base.org` (Chain `0x2105`) denselben Code `0x7fffff…6014600cf3`; auf dem Hauptnetz haben auch der SpendPermissionManager
`0xf85210B21cC50302F477BA56686d2019dC9b67Ad` und USDC Code.

## Regel

`set_payout_rule {keep_usd, weekday} | {off:true}` ruft `POST /v1/konto/payout-rule`; `weekday` ist `monday` bis `sunday`, `off: true`
löscht die Regel. `runPayoutRules(deps, nowMs)` läuft stündlich aus `src/index.ts` (`setInterval` mit `unref`) und zahlt am Wochentag
der Regel nach UTC einmal am Tag den Kontostand minus `keep_usd` aus, wenn das mindestens 1,00 USD sind (der Mindestbetrag von Bridge
oben). Fehlt die zweite Erlaubnis, zahlt der Lauf nichts und loggt `payout_needs_phone`; das Handy braucht nur der Handoff.

In `topUpIfLow` merkt sich der Server je Konto das Ende der Periode, in der `period_used_up` galt, und meldet bis dahin ohne Aufruf ans
Netz `period_used_up`. Eine Erlaubnis mit `end` in der Vergangenheit ergibt `permission_expired` ohne Aufruf, weil `spend()` dort
ohnehin mit `AfterSpendPermissionEnd` scheitert. Eine Erhöhung aus konto 04 löscht das Gemerkte.

## Hauptnetz

`export const MAINNET_CHAIN_ID = 8453` in `src/konto/config.ts`. `readKontoConfig` nimmt 8453 nur mit `CP_KONTO_MAINNET=1` an und setzt
dann USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` und `https://mainnet.base.org` als Vorgabe für `CP_KONTO_RPC_URL`; ohne den
Schalter bleibt 8453 ein Fehler beim Start. `requireKontoChain(chainId, config)` lässt nur die eingestellte Kette durch. Dieser Code
entsteht erst, wenn Matthias den Absatz „Ausnahme Hauptnetz“ in Regel 10 von `loop-constraints.md` auf `dev` eingetragen hat. In
diesem Goal geht keine Transaktion ins Hauptnetz; die Nonce des Gasschlüssels auf Base bleibt 0.

## Entscheidung

Einzahlung: Karte über `ACTIVITY_TYPE_INIT_FIAT_ON_RAMP` mit `FIAT_ON_RAMP_PROVIDER_MOONPAY`, `walletAddress` = Smart Wallet des Kontos, `network` BASE, `cryptoCurrencyCode` USDC, `fiatCurrencyCode` USD mit `fiatCurrencyAmount` = `amount_usd` ab 20,01 (darunter ohne Betrag), `paymentMethod` Karte, `countryCode` DE, unterschrieben in der Sub-Organisation mit dem Passkey.
Grund: MoonPay erlaubt den Kauf in Deutschland per Karte, führt USDC auf Base, und `walletAddress` ist frei, also landet das Geld ohne Umweg in der Smart Wallet; USD hält den Betrag gleich mit „Add $20.00“ auf der Seite und `balance_usd`.
Grund: `init_fiat_on_ramp` ist ein Aufruf mit einem Passkey-Tipp, der Nachfolger braucht zwei gestempelte Aufrufe (Angebot und Sitzung); solange Turnkey den alten Pfad bedient, bleibt er, und der Wechsel auf `list_fiat_on_ramp_quotes` plus `create_fiat_on_ramp_session` ist der Plan B.
Auszahlung: Bridge mit `POST /v0/kyc_links` (`type` individual, `email`, `endorsements` `["sepa"]`), weiter erst bei `kyc_status` `approved` und Endorsement `sepa` `approved` aus `GET /v0/customers/{customerID}`, dann `external_accounts` (eur, iban, `country` DEU) und `liquidation_addresses` (base, usdc, sepa, eur), ausgezahlt nur über `PayoutForwarder` an deren `address`.
Grund: Bridge ist der Euro-Anbieter aus konto 01 (`docs/konto/anbieter.md`) und zahlt von einer festen Adresse auf Base per SEPA in EUR aus, und weil die Adresse on-chain im Vertrag steht, kann selbst unser Schlüssel nirgendwo anders hin zahlen.
Grund: `kyc_links` ist veraltet, läuft aber und liefert Kunde, Link und AGB-Link in einem Aufruf; `email` ist dort Pflicht, also schickt der Server in diesem Goal eine Adresse je Konto auf unserer eigenen Domain (`payout-<16 Hexzeichen des Kontos>@postyourprice.com`), damit die Seite ohne zusätzliches Feld auskommt; konto 06 entscheidet mit dem echten Zugang, ob das bleibt oder der Ersatzweg über `POST /v0/customers` kommt, der ohne Pflichtfelder auskommt.

## Für konto 06

Was Matthias und der Loop zum Einschalten in der Produktion tun, in dieser Reihenfolge:

1. Bridge: Anfrage an den Vertrieb (`sales@bridge.xyz`) für HTC als Plattform mit EUR und SEPA, Matthias sendet selbst. Für Firmen
   verlangt Bridge Firmenname, Sitz- und Betriebsadresse, Zweck des Kontos, Herkunft der Mittel, Steuernummer, Rechtsform,
   Gründungsunterlagen (Handelsregisterauszug, Gesellschaftsvertrag), Eigentümerunterlagen (Gesellschafterliste mit 100 Prozent der
   Anteile, alle wirtschaftlich Berechtigten ab 25 Prozent), Identitätsprüfung der Berechtigten und eines Geschäftsführers,
   Adressnachweis bei widersprüchlichen Angaben, Beschreibung, Website, Branche und DAO-Status
   ([Quelle](https://apidocs.bridge.xyz/platform/customers/compliance/businesses/overview), Stand 2026-11-16). Die Zusicherung zur
   Eigentümerstruktur darf ein Geschäftsführer im gehosteten Ablauf abhaken ([Quelle](https://apidocs.bridge.xyz/platform/customers/compliance/businesses/ownership), Stand 2026-11-16).
   Bei erweiterter Prüfung kommen Jahresumsatz, Volumen je Monat und die Frage nach Kundengeld dazu; die Antwort darauf ist, dass HTC
   kein Kundengeld hält.
2. MoonPay: Konto für HTC über den Link von Turnkey anlegen, Firmenprüfung durchlaufen, Schlüssel `pk_live_…` und `sk_live_…` im
   Dashboard von Turnkey unter Fiat Onramp hinterlegen, vorher die Sandbox-Schlüssel `pk_test_…` und `sk_test_…`.
3. Gasschlüssel: ein eigener Schlüssel für Base, nie der Schlüssel der Betreiber-Wallet, als Datei auf dem Server, mit etwas ETH auf
   Base für das Anlegen der Weiterleitung, `approveWithSignature` und `payout`.
4. Werte in `/opt/control-plane/.env`, die nur Matthias setzt: `CP_KONTO_CHAIN_ID=8453`, `CP_KONTO_MAINNET=1`,
   `CP_KONTO_RPC_URL` (frei, Vorgabe `https://mainnet.base.org`), `CP_KONTO_KEY_FILE` (Pfad zum Gasschlüssel),
   `CP_KONTO_AUTH_PROXY_ID` (wie in konto 03), `CP_BRIDGE_URL=https://api.bridge.xyz` und `CP_BRIDGE_KEY_FILE` (Pfad zur Datei mit dem
   Produktionsschlüssel von Bridge). Kein Wert steht im Repo oder im Deploy.
5. Erste echte Einzahlung: Matthias tippt `deposit` mit 25 USD, zahlt auf dem Handy per Karte bei MoonPay, und `automaton_status`
   zeigt danach `balance_usd`; `get_onramp_transaction_status` mit `onRampTransactionId` belegt den Kauf.
6. Erste echte Auszahlung: Matthias tippt `payout` mit 5 USD, geht einmal durch Identität, IBAN und Passkey, und der Verlauf unter
   `drains` zeigt `payment_processed`, wenn der Betrag auf seinem Bankkonto angekommen ist. Danach `set_payout_rule` mit `keep_usd` und
   Wochentag und ein Lauf von `runPayoutRules` am nächsten passenden Tag.
