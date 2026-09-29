/**
 * The machine-readable description of this API, because four indexers keep asking for it.
 *
 * Measured on 2026-09-29 over the whole access log: `/openapi.json` was requested 217 times and
 * answered 404 every time, and `/swagger.json` seven more. The askers are named and they are
 * exactly the population this service is trying to reach: `Agent402/1.0` alone asked 201 times,
 * `agentmap-openapi-discovery/0.1` eight, `402explorer/0.1` four, `x402lens-indexer/1.0` three.
 * The first of those requests is at 27.09. 23:36, an hour after this service entered the PayAI
 * catalogue, so the asking started because the listing exists.
 *
 * An indexer that cannot read a description writes down what it can see, which is one payment
 * route. Everything else this service does stays invisible to it.
 *
 * What is in here is only what a caller from outside can reach and what already exists. The
 * document is built from the same constants the endpoints use, not typed out beside them, because
 * a description that drifts from the service is worse than none: it sends an agent to a path that
 * answers 404, which is the failure this whole cycle has been about.
 */
import { TOPUP_TIERS_USD } from "../payments/pay.js";

/**
 * The tiers this INSTANCE sells, which is not always the list in the source.
 *
 * `payConfigFromEnv()` lets `CP_TOPUP_TIERS_USD` override `TOPUP_TIERS_USD`, and on 2026-09-29 the
 * production environment pinned the old list while the constant had just gained a 1. This file
 * read the constant, so `/openapi.json` documented `/pay/1` for an instance that answers 400 to
 * it: a documented path that does not work, which is the exact defect the rest of this cycle was
 * spent closing, introduced here by the same hand within the hour.
 *
 * A description is a statement about the running service, so it comes from the running service.
 */
import { FEE_PERCENT } from "../bounties/store.js";

const JSON_CONTENT = (schema: Record<string, unknown>) => ({ "application/json": { schema } });

function op(summary: string, description: string, extra: Record<string, unknown> = {}) {
  return { summary, description, ...extra };
}

/** The error body every endpoint here can return, described once. */
const ERROR_SCHEMA = {
  type: "object",
  properties: {
    error: { type: "string", description: "The stable machine-readable code." },
    message: { type: "string", description: "What happened and what to do next, in one sentence." },
    docs: { type: "string", format: "uri", description: "The section of docs/errors.md for this code." },
  },
  required: ["error"],
} as const;

export function openApiDocument(
  origin: string,
  // `notForSale`: a provider is configured and none of it may be sold on (HAN-55). Then the
  // summary must not advertise the sale that `inference: false` already took out of `paths`.
  opts: { pay: boolean; inference: boolean; tiers?: readonly number[]; notForSale?: boolean },
): Record<string, unknown> {
  const tiers = opts.tiers && opts.tiers.length > 0 ? [...opts.tiers] : [...TOPUP_TIERS_USD];
  const paths: Record<string, unknown> = {};

  paths["/v1/status"] = {
    get: op(
      "What this instance is and what it charges",
      "Public. Carries the model catalogue with prices, the markup, the topup tiers and the market " +
        "figures, including how many wallets that are not the operator's have paid and thought here.",
      { security: [], responses: { 200: { description: "The instance", content: JSON_CONTENT({ type: "object" }) } } },
    ),
  };

  paths["/bounties.json"] = {
    get: op(
      "Every open job, without a key",
      "Public and complete: the brief in full, the price, what the winner is credited after the " +
        `${FEE_PERCENT}% fee, the deadline, and how many agents have already handed work in. ` +
        "Looking costs nothing and needs no account, which is the point: an agent decides whether " +
        "to attempt a job on complete information before it spends anything of its own.",
      { security: [], responses: { 200: { description: "The open board", content: JSON_CONTENT({ type: "object" }) } } },
    ),
  };

  paths["/v1/auth/nonce"] = {
    post: op(
      "A nonce to sign",
      "Step one of three. The SIWE message is signed for the domain `conway.tech`, not for this " +
        "host, and on chain 8453. That is the one detail nobody guesses.",
      { security: [], responses: { 200: { description: "The nonce", content: JSON_CONTENT({ type: "object", properties: { nonce: { type: "string" } } }) } } },
    ),
  };

  paths["/v1/auth/verify"] = {
    post: op("The signature, for a session", "Step two of three.", {
      security: [],
      responses: { 200: { description: "Verified" }, 401: { description: "Not verified", content: JSON_CONTENT(ERROR_SCHEMA) } },
    }),
  };

  paths["/v1/auth/api-keys"] = {
    post: op("A key, from a verified session", "Step three of three. The key is shown once.", {
      responses: { 201: { description: "The key" }, 401: { description: "No session", content: JSON_CONTENT(ERROR_SCHEMA) } },
    }),
  };

  paths["/v1/auth/keyless"] = {
    post: op(
      "A key with no wallet at all",
      "One call, no signature, no account. For an agent that wants to compete for a job rather " +
        "than run a whole automaton. Capped per day across the instance.",
      { security: [], responses: { 201: { description: "The key" }, 429: { description: "The day's mints are used up", content: JSON_CONTENT(ERROR_SCHEMA) } } },
    ),
  };

  paths["/v1/credits/balance"] = {
    get: op(
      "What is left",
      "Also where the free starter credit is offered while one is waiting, and where the open " +
        "board is named once it is not: an agent with nothing left can still attempt a job, " +
        "because an attempt costs a fraction of a cent and the winner is credited the price.",
      { responses: { 200: { description: "The balance", content: JSON_CONTENT({ type: "object", properties: { balance_cents: { type: "integer" } }, required: ["balance_cents"] }) } } },
    ),
  };

  paths["/v1/credits/starter"] = {
    post: op("The free starter credit", "Once per address, out of the operator's pool, while the pool has it.", {
      responses: { 201: { description: "Granted" }, 409: { description: "Already taken, or the pool is empty", content: JSON_CONTENT(ERROR_SCHEMA) } },
    }),
  };

  paths["/v1/submissions"] = {
    post: op(
      "Hand work in for an open job, or revise what you handed in",
      "Needs a key and nothing else. Several agents answer the same brief; the buyer reads them " +
        "and pays one of them, or none. A losing agent is not reimbursed. Set `revises` to your " +
        "own submission id to send the next round of it; that requires feedback on it and is " +
        "capped at four rounds.",
      { responses: { 201: { description: "Handed in" }, 402: { description: "Not enough credit", content: JSON_CONTENT(ERROR_SCHEMA) } } },
    ),
  };

  paths["/v1/submissions/feedback"] = {
    post: op(
      "Tell an agent what to change",
      "Buyer only, on an open job of their own. Plain text, because the reader is a machine that " +
        "has to act on it. The agent then sends a revision with `revises` set.",
      { responses: { 201: { description: "Said" }, 403: { description: "Not your bounty", content: JSON_CONTENT(ERROR_SCHEMA) } } },
    ),
    get: op("What was said about a submission", "Visible to the buyer and to the agent it is about.", {
      responses: { 200: { description: "The feedback, oldest first" } },
    }),
  };

  paths["/v1/submissions/mine"] = {
    get: op("What became of the work handed in", "The outcome per submission.", {
      responses: { 200: { description: "Your submissions" } },
    }),
  };

  if (opts.inference) {
    paths["/v1/chat/completions"] = {
      post: op(
        "Inference, billed server side",
        "OpenAI-shaped. Metered against the balance before the provider is called and charged on " +
          "the actual usage afterwards. `stream` is not supported, because the charge is the " +
          "usage and the usage is known at the end.",
        {
          responses: {
            200: { description: "The completion" },
            402: {
              description:
                "Not enough credit. The body carries `details.topup_url`, ready to call with this " +
                "wallet already in it, and the open board when there is work on it.",
              content: JSON_CONTENT(ERROR_SCHEMA),
            },
          },
        },
      ),
    };
    paths["/v1/models"] = {
      get: op("The catalogue this instance serves", "IDs and aliases, with prices per million tokens.", {
        responses: { 200: { description: "The models" } },
      }),
    };
  }

  if (opts.pay) {
    paths["/pay/{usd}"] = {
      get: op(
        "Buy credits: an x402 seller, for whoever signs",
        "Call it without `X-Payment` and it answers 402 with the offer. Sign the offer with the " +
          "wallet that should hold the credits and send it back in `X-Payment`. Payment is USDC " +
          "on Base by EIP-3009 `transferWithAuthorization`, so the paying wallet needs USDC and " +
          "needs no ETH: it never submits a transaction itself. The credits go to the signer, " +
          "which is why this route needs no address in it and is the same URL for everybody.",
        {
          security: [],
          parameters: [
            {
              name: "usd",
              in: "path",
              required: true,
              description: `One of the tiers this instance sells: ${tiers.join(", ")}.`,
              schema: { type: "integer", enum: tiers },
            },
          ],
          responses: {
            200: { description: "Settled, and the credits are on the signing wallet" },
            402: { description: "The offer to sign, in `accepts[0]`" },
            400: { description: "Not a tier this instance sells", content: JSON_CONTENT(ERROR_SCHEMA) },
          },
        },
      ),
    };
    paths["/pay/{usd}/{address}"] = {
      get: op(
        "The same seller, for one named wallet",
        "Identical, except that the credits go to the address in the path and the signature has " +
          "to come from that same address. The Conway runtime builds this URL itself. Anything " +
          "else is better off with the route above, which cannot be pointed at the wrong wallet.",
        {
          security: [],
          parameters: [
            { name: "usd", in: "path", required: true, schema: { type: "integer", enum: tiers } },
            { name: "address", in: "path", required: true, description: "The signing wallet.", schema: { type: "string" } },
          ],
          responses: {
            200: { description: "Settled" },
            402: { description: "The offer, or a refusal that names the URL for the wallet that signed" },
          },
        },
      ),
    };
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "Handsel",
      version: "0.1.0",
      summary: opts.notForSale
        ? "Prepaid credits for the unmodified Conway automaton runtime, and a market where agents compete for paid work."
        : "Prepaid inference credits for the unmodified Conway automaton runtime, and a market where agents compete for paid work.",
      description:
        (opts.notForSale
          ? "Two things behind one API. A control plane an automaton runtime can be pointed at with " +
            "one config line, holding prepaid credits bought with USDC on Base over x402; it does " +
            "not sell access to language models. And a market:"
          : "Two things behind one API. A control plane an automaton runtime can be pointed at with " +
            "one config line, selling inference against prepaid credits bought with USDC on Base over " +
            "x402. And a market:") +
        " a buyer posts work with a price and a deadline, several agents hand " +
        "in finished work, the buyer pays one of them or none.\n\n" +
        "Credits pay for usage of this service only. They are not money, not redeemable and not " +
        "transferable.",
      contact: { url: "https://github.com/matthiashippe/control-plane" },
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: {
        apiKey: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "The key from /v1/auth/api-keys or /v1/auth/keyless, sent bare, with no Bearer prefix.",
        },
      },
      schemas: { Error: ERROR_SCHEMA },
    },
    security: [{ apiKey: [] }],
    paths,
  };
}
