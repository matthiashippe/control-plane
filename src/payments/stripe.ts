/**
 * The Stripe adapter for `CheckoutProvider` (Goal 20, 2026-09-29).
 *
 * No SDK: two calls against api.stripe.com, `fetch` is enough, and a dependency that holds the
 * secret key is one more thing that can log it. Tests hand in their own `fetch` and never reach
 * Stripe.
 *
 * `begin` creates a Checkout Session with the price from the caller, which took it from OFFERS.
 * `read` asks Stripe whether that session is paid, because the return from Stripe's page is a plain
 * GET that anybody can type. The amount Stripe reports is passed on only to be compared with the
 * row; it is never booked (src/checkout/index.ts).
 *
 * The secret key is sent in the Authorization header and nowhere else. No error message, log line
 * or return value here contains it.
 */

import { CheckoutError, CURRENCY, type CheckoutProvider, type ProviderReading } from "../checkout/index.js";
import { stripeProviderName } from "./stripe-key.js";

const API = "https://api.stripe.com/v1";

/** A Checkout Session id as Stripe issues it. Anything else never reaches a URL with our key. */
export const SESSION_ID = /^cs_(test|live)_[A-Za-z0-9]+$/;

export interface StripeOptions {
  secretKey: string;
  /** Where Stripe sends the buyer back to, e.g. https://postyourprice.com. Read per call. */
  origin: () => string;
  fetch?: typeof fetch;
}

interface Session {
  id?: string;
  url?: string | null;
  status?: string;
  payment_status?: string;
  amount_total?: number | null;
  currency?: string | null;
  livemode?: boolean;
}

export function stripeProvider(opts: StripeOptions): CheckoutProvider {
  const name = stripeProviderName(opts.secretKey);
  const doFetch = opts.fetch ?? fetch;

  async function call(method: "GET" | "POST", path: string, body?: URLSearchParams): Promise<Session> {
    let res: Response;
    try {
      res = await doFetch(`${API}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${opts.secretKey}`,
          ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}),
        },
        body,
      });
    } catch {
      throw new CheckoutError("provider_unreachable", 502, "The payment provider could not be reached.");
    }
    if (!res.ok) {
      // The status only. Stripe's error body can echo request details, and none of it helps a buyer.
      throw new CheckoutError("provider_error", 502, `The payment provider answered ${res.status}.`);
    }
    return (await res.json()) as Session;
  }

  const sessionId = (payload: unknown): string => {
    const p = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
    const id = p.session_id;
    return typeof id === "string" && SESSION_ID.test(id) ? id : "";
  };

  return {
    name,
    async begin({ cents, offer, email }) {
      const origin = opts.origin().replace(/\/+$/, "");
      const form = new URLSearchParams({
        mode: "payment",
        // Card only (HAN-17). An asynchronous method such as SEPA or Klarna reports `unpaid` on a
        // completed session, and without a webhook nobody would ever look at it again.
        "payment_method_types[0]": "card",
        "line_items[0][quantity]": "1",
        "line_items[0][price_data][currency]": CURRENCY,
        "line_items[0][price_data][unit_amount]": String(cents),
        "line_items[0][price_data][product_data][name]": offer?.name ?? "Guthaben",
        // Stripe replaces the literal {CHECKOUT_SESSION_ID} itself.
        success_url: `${origin}/katalog/danke?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/katalog`,
      });
      if (offer) form.set("metadata[offer]", offer.id);
      // Goal 21: the address the buyer gave on /katalog/bestellen, so Stripe's page shows it filled
      // in. In the form body and nowhere else: a URL ends up in logs and in browser histories.
      if (email) form.set("customer_email", email);
      const s = await call("POST", "/checkout/sessions", form);
      if (!s.id || !s.url) {
        throw new CheckoutError("provider_no_reference", 502, "The payment provider did not name the payment.");
      }
      return { reference: s.id, redirect: s.url };
    },
    reference: sessionId,
    async read(payload): Promise<ProviderReading> {
      const id = sessionId(payload);
      const s = await call("GET", `/checkout/sessions/${encodeURIComponent(id)}`);
      // The mode comes from Stripe, not from our configuration (HAN-17). A test session must never
      // settle a row that says real money moved, nor the other way round.
      if (typeof s.livemode === "boolean" && s.livemode !== (name === "stripe")) {
        throw new CheckoutError("livemode_mismatch", 409, "The payment provider reports a different mode than this payment was started in.");
      }
      const outcome: ProviderReading["outcome"] =
        s.payment_status === "paid" ? "paid" : s.status === "expired" ? "failed" : "open";
      return {
        outcome,
        cents: typeof s.amount_total === "number" ? s.amount_total : undefined,
        currency: typeof s.currency === "string" ? s.currency : undefined,
      };
    },
  };
}

/** The adapter configured from the environment, or null when no secret key is set. */
export function stripeFromEnv(origin: () => string, env: NodeJS.ProcessEnv = process.env): CheckoutProvider | null {
  const secretKey = env.CP_STRIPE_SECRET_KEY;
  if (!secretKey) return null;
  return stripeProvider({ secretKey, origin });
}
