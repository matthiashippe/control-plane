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

/**
 * The shape the specification asks for, which is not the shape this file had.
 *
 * Until 2026-09-24 this declared `bazaar.info.{input, output}`. The specification
 * (coinbase/x402, docs/extensions/bazaar.mdx, "Quickstart for Sellers") asks for
 * `bazaar.{discoverable, inputSchema, outputSchema}`, and the word `discoverable` appeared
 * nowhere in ours. The listed services show the same thing on the wire: their 402 carries
 * `accepts[].outputSchema.input.discoverable = true`, ours carried no `outputSchema` at all.
 *
 * The comment above was right that cataloguing happens as a side effect of a payment and that
 * there is no sign-up route. What it got wrong was to conclude from "we settle and are not
 * listed" that no door exists. Measured on 2026-09-24: 141 hosts entered the two catalogues
 * between 21.09. and that morning, ten of them speaking version 1 as we do, two of them ephemeral
 * `trycloudflare.com` tunnels that nothing would ever crawl. The door is used about 47 times a
 * day; we were knocking with the wrong hand.
 *
 * `routeTemplate` is in the specification for exactly our case: `/pay/{usd}/{address}` is a
 * parameterised route, and without the template the catalogue would key on the concrete URL and
 * take one row per payer. With it, "Facilitators use routeTemplate as the catalog key,
 * consolidating all requests to the same route pattern into a single discovery entry".
 */
export const BAZAAR_EXTENSION = {
  bazaar: {
    discoverable: true,
    routeTemplate: "/pay/:usd/:address",
    inputSchema: {
      type: "http",
      method: "GET",
      pathParams: {
        usd: {
          type: "string",
          description: "One of the topup tiers in whole dollars, for example 5.",
          required: true,
        },
        address: {
          type: "string",
          description:
            "The automaton wallet that signs the payment. The credits go to the signer, so this " +
            "is the address that will be able to spend them.",
          required: true,
        },
      },
    },
    outputSchema: {
      type: "object",
      properties: {
        credits_cents: { type: "number", description: "What this payment added, in cents." },
        balance_cents: { type: "number", description: "The balance after it, in cents." },
        tx_hash: { type: "string", description: "The settlement transaction on Base." },
      },
    },
  },
} as const;
