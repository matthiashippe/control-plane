# Die Auszahlung über die Weiterleitung auf Base Sepolia

Lauf von goals/konto/05, Punkt 15, am 2026-11-16 mit `node --import tsx ops/konto/sepolia-payout-run.mjs` auf
dem code-host: Konto per Passkey über den Handoff (virtueller Authenticator in Chromium), eine Zahlung von 8 Test-USDC an das
Konto, dann der Handoff mit `step: "payout"` und demselben Passkey. Bridge war ein lokaler Stand-in: Identität bestätigt, Bankkonto
mit der Beispiel-IBAN, als Auszahladresse eine frisch erzeugte eigene Adresse (`ziel`), die für das Bankkonto steht. Die Seite
unterschrieb die zweite Erlaubnis mit dem vorhandenen Passkey, Spender ist die Weiterleitung zu genau diesem Ziel.
`POST /v1/konto/payout` mit 3,00 USD legte die Weiterleitung über den Proxy 0x4e59b44847b379578588920ca78fbf26c0b4956c an,
schaltete die Erlaubnis mit `approveWithSignature` frei und zahlte 3 Test-USDC über die Weiterleitung an das Ziel.

Danach zwei Angriffe mit festem Gas, die on-chain scheiterten: `spend()` der zweiten Erlaubnis direkt von unserem Schlüssel
(`fremd-spend`) und `payout()` über eine zweite Weiterleitung desselben Kontos mit anderem Ziel (`fremd-ziel`). Die erste Anfrage
mit dem API-Key buchte wie in konto 03 einmal 2 USD nach, das legte die Smart Wallet an. Alles auf Base Sepolia (84532) mit
Test-USDC; die Belege prüft der Prüfbefehl von Punkt 15 gegen https://sepolia.base.org.

konto: 0xd85ce39405a95b031423e7fa47655cd1436be67c
ziel: 0x104391ff0fa1395c093a266d9bceaf90c84e955e
forwarder: 0xd9f52b82a4211f27cb579669242f6ae9526f1e11
forwarder-fremd: 0x4e3fd4fb018a8ec01769242f839bf93c2111ca17
erlaubnis: 0x52c8884d42f75fb3671b3b72277136074f1eb0b0510950142e7094e2cbf29eb1
anlage: 0x82013bd42a18f46b212e2d3fffb62f988ff17788ed50cabd7f73a1f8b8fa4b64
auszahlung: 0x0b1a7962f9026a65b29db4e6614b3ff147841bf9d00bedc2a59b5e7288756de2
fremd-spend: 0x740ba7d9865b4a3a609c59654b9bb766b098e19788e0d89f5d2378d3cabbba68
fremd-ziel: 0x099fa811ac03673abd7321294d137743cbabaff6bf1aa47508817798debeb0a6

Weitere Belege: Zahlung an das Konto 0xb72885a3d0361e594c8944bf72913a2e1f90d4e05a0fbf61c19671276906dc89,
Nachbuchen 0x7454ab35f1e313522842f1cd284461ac5559b12ea57b9c74caf2be1de0822745,
Anlage der zweiten Weiterleitung 0x023e273a5bfa568c7814738f364f3dbb8919396bf2ad77d1e7be94aadaa0a701.

## Im Explorer

- Konto: https://sepolia.basescan.org/address/0xd85ce39405a95b031423e7fa47655cd1436be67c
- Ziel: https://sepolia.basescan.org/address/0x104391ff0fa1395c093a266d9bceaf90c84e955e
- Weiterleitung: https://sepolia.basescan.org/address/0xd9f52b82a4211f27cb579669242f6ae9526f1e11
- Zweite Weiterleitung: https://sepolia.basescan.org/address/0x4e3fd4fb018a8ec01769242f839bf93c2111ca17
- Freischaltung: https://sepolia.basescan.org/tx/0x52c8884d42f75fb3671b3b72277136074f1eb0b0510950142e7094e2cbf29eb1
- Anlage: https://sepolia.basescan.org/tx/0x82013bd42a18f46b212e2d3fffb62f988ff17788ed50cabd7f73a1f8b8fa4b64
- Auszahlung: https://sepolia.basescan.org/tx/0x0b1a7962f9026a65b29db4e6614b3ff147841bf9d00bedc2a59b5e7288756de2
- spend() von unserem Schlüssel: https://sepolia.basescan.org/tx/0x740ba7d9865b4a3a609c59654b9bb766b098e19788e0d89f5d2378d3cabbba68
- payout() über die zweite Weiterleitung: https://sepolia.basescan.org/tx/0x099fa811ac03673abd7321294d137743cbabaff6bf1aa47508817798debeb0a6
