# Der Lauf auf Base Sepolia

Lauf von goals/konto/03, Punkt 10, am 2026-11-15 mit `node --import tsx ops/konto/sepolia-run.mjs` auf dem
code-host: Konto per Passkey über den Handoff (virtueller Authenticator in Chromium), eine Zahlung von 6 Test-USDC an das Konto,
ein Nachbuchen von 2 USD aus der Erlaubnis und eine Abbuchung von 4 USD in einem späteren Block, die die Tagesgrenze von 5 USD reißt
und on-chain scheitert. Alles auf Base Sepolia (84532) mit Test-USDC; die Belege prüft der Prüfbefehl von Punkt 10 gegen
https://sepolia.base.org.

konto: 0xa495b3241030b0d280a8de531c516b0d523cd985
besitzer: 0xc6641c8239ce5319f779ce9f5e7c68cdcd9fa3ba
spender: 0x24369bc24ae5389144576ded6585785ef652cfc4
erlaubnis: 0xd1963ec4fd40d7908894742f60de59ae96d1272de1a8162d7a7bfb3b4e5bd65f
zahlung: 0x7c8752338c64531db79393cd4ae2e69f53b49af7bcfcf7f7d6d45673cad52b11
abbuchung: 0x18ffcf248bd37ec75120ddce563c949713c4eb802c127c7cfe40964104d5e992
ueber-grenze: 0x11996dac0fb7cd319d8768387c1de1d94cd386360c224dd0f04d21a308a29f12
ledger: topup 200000 0x18ffcf248bd37ec75120ddce563c949713c4eb802c127c7cfe40964104d5e992
