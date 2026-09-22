/**
 * What this service sells, in the shape an x402 facilitator takes into its directory.
 *
 * A facilitator catalogues a seller as a side effect of a payment: the seller declares the entry
 * in `extensions`, and the facilitator takes it over on `/verify` or `/settle`. There is no
 * sign-up route, so a seller without a declaration stays invisible forever, no matter how many
 * payments it settles (PayAI docs, checked 20.09.2026).
 *
 * The directory is the only place where an automaton that is not ours finds this service without
 * a human recommending it: on 20.09.2026 PayAI carried 6,584 entries, not one of them with any
 * reference to the Conway runtime.
 *
 * Checked against `POST /verify` at PayAI: with and without this block the facilitator answers
 * identically (`invalid_exact_evm_signature` for an invented signature), so the extra field does
 * not disturb settlement.
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
