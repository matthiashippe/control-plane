# Verträge von Base Sepolia im Harness

Laufzeit-Code der echten Verträge auf Base Sepolia (chainId 84532), einmal per `eth_getCode` von https://sepolia.base.org im
genannten Block geholt. `harness/e2e/konto-chain.mjs` legt jede Datei per `anvil_setCode` an ihre Adresse auf der zweiten
anvil-Chain (`chain-konto` in `harness/docker-compose.yml`) und prüft vorher den keccak256. Test-USDC an
`0x036CbD53842c5426634e7929541eC2318f3dCF7e` ist im Harness der USDC-Mock aus `harness/chain/MockUSDC.sol`, nicht der Code von
Base Sepolia.

| Adresse | Datei | keccak256 | Block | Name |
| --- | --- | --- | --- | --- |
| 0xf85210B21cC50302F477BA56686d2019dC9b67Ad | spend-permission-manager.hex | 0x52485746e0e69bdb943d424484c356c7d3eb97599374f38b29e87dda34c521ee | 58423985 | SpendPermissionManager |
| 0xcfCE48B757601F3f351CB6f434CB0517aEEE293D | public-erc6492-validator.hex | 0x94a000eab18fdda0465241bd0e82487463fb2e539854a3645542e57ed8dde484 | 58423985 | PublicERC6492Validator |
| 0x0BA5ED0c6AA8c49038F819E587E2633c4A9F428a | coinbase-smart-wallet-factory.hex | 0xc4900c000fd23885462a115b872741ad2b1e7ff2d7889aee18bc4d4bef3728f6 | 58423985 | CoinbaseSmartWalletFactory v1 |
| 0x000100abaad02f1cfC8Bbe32bD5a564817339E72 | coinbase-smart-wallet.hex | 0x179bcb847d3401ac830789a21cc37ed846fd5da9582a9c9d4b5140b6f26bd1a1 | 58423985 | CoinbaseSmartWallet v1 (Implementierung) |

`PUBLIC_ERC6492_VALIDATOR()` des SpendPermissionManager zeigt auf den Validator oben, `implementation()` der Factory auf die
Implementierung oben. `MAGIC_SPEND()` (`0x011A61C07DbF256A68256B1cB51A5e246730aB92`) braucht nur `spendWithWithdraw`, das der
Lauf nicht nutzt, deshalb fehlt sein Code hier.

Neu holen: `cast code <Adresse> --block <Block> --rpc-url https://sepolia.base.org > <Datei>`, dann den keccak256 mit
`cast keccak "$(cat <Datei>)"` in die Tabelle schreiben.
