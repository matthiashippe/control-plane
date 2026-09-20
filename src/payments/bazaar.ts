/**
 * Was dieser Dienst verkauft, in der Form, die ein x402-Facilitator in sein Verzeichnis übernimmt.
 *
 * Ein Facilitator katalogisiert einen Verkäufer als Nebenwirkung einer Zahlung: Der Verkäufer
 * deklariert den Eintrag in `extensions`, der Facilitator übernimmt ihn bei `/verify` oder
 * `/settle`. Einen Anmeldeweg gibt es nicht, also bleibt ein Verkäufer ohne Deklaration für immer
 * unsichtbar, gleichgültig wie viele Zahlungen er abwickelt (PayAI-Doku, geprüft 20.09.2026).
 *
 * Das Verzeichnis ist die einzige Stelle, an der ein fremder Automat diesen Dienst findet, ohne
 * dass ein Mensch ihn empfiehlt: PayAI führte am 20.09.2026 6.584 Einträge, davon keinen einzigen
 * mit Bezug zur Conway-Runtime.
 *
 * Gegen `POST /verify` von PayAI geprüft: mit und ohne diesen Block antwortet der Facilitator
 * identisch (`invalid_exact_evm_signature` bei erfundener Signatur), das Zusatzfeld stört das
 * Settlement also nicht.
 */
export const BAZAAR_DESCRIPTION =
  "Prepaid inference credits for the unmodified Conway automaton runtime: SIWE provisioning, " +
  "USDC topups on Base, inference billed at purchase cost plus a fixed markup";

export const BAZAAR_EXTENSION = {
  bazaar: {
    info: {
      input: {
        type: "http",
        method: "GET",
        pathParams: {
          usd: "one of the topup tiers, for example 5",
          address: "the automaton wallet that signs the payment; credits go to the signer",
        },
      },
      output: {
        type: "json",
        example: { credits_cents: 500, balance_cents: 500, tx_hash: "0x" + "00".repeat(32) },
      },
    },
  },
} as const;
