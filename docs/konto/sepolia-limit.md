# Die Erhöhung des Tageslimits auf Base Sepolia

Lauf von goals/konto/04, Punkt 10, am 2026-11-16 mit `node --import tsx ops/konto/sepolia-limit-run.mjs` auf dem
code-host: Konto per Passkey über den Handoff mit einem Tageslimit von 5 USD (virtueller Authenticator in Chromium), eine Zahlung
von 8 Test-USDC an das Konto, ein erstes Nachbuchen von 2 USD, das die alte Erlaubnis freischaltet, dann die Erhöhung auf 10 USD über
einen Handoff mit `step: "limit"` und demselben Passkey. Vor der nächsten Abbuchung schaltete der Server die neue Erlaubnis frei,
widerrief die alte und buchte 6 USD aus der neuen ab, mehr als das alte Limit. Ein `spend()` aus der alten Erlaubnis scheiterte
danach on-chain. Alles auf Base Sepolia (84532) mit Test-USDC; die Belege prüft der Prüfbefehl von Punkt 10 gegen
https://sepolia.base.org.

konto: 0x1993bc4365f2e7d34938c33a0858afb4c829ba77
spender: 0x24369bc24ae5389144576ded6585785ef652cfc4
zahlung: 0xca4e8d03b73f9deb892978cc6271d4d0229ba55f8ee5453cbfa0c2dc517c5992
erlaubnis-alt: 0x1f7634020743a3409cceb1fe3c3af32610fd4317089268f628472eb28f8f5d06
abbuchung-alt: 0xa083fe672779d25a7ab5a8ffb5162f882abf45d1d6e984c4fcdfb8094288ae01
erlaubnis-neu: 0xe2bbb6ef57df0a47122910a1b34862be7ff581bb20ed3bb825120a7e36c0808b
widerruf: 0xf360b1a31c87023712ddd52cc4912a29c97d9c7084d89cdcc39870820589d6af
abbuchung-neu: 0x528c7114fb62d4f8e1615656657a99cb177ac154a4e93c0462f26bc10fea1e63
alt-nach-widerruf: 0x66e6b668f57d63f321fd140180ad6c9c4df0d0142672fa6c671f5c219b791492
