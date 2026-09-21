/**
 * The service is only taken into the directory of an x402 facilitator when it declares itself
 * there: an absolute `resource` and an `extensions.bazaar` block that the facilitator picks up at
 * `/verify` or `/settle`. There is no sign-up route.
 *
 * These tests pin down both, because a slip here goes unnoticed: payments keep working, the service
 * just stays invisible.
 *
 * The identifiers imported from src/payments/ keep their names; that directory is out of scope for
 * the language pass.
 */
import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import {
  buildPaymentRequired,
  payConfigFromEnv,
  payResource,
  SCHWELLEN_BONUS_CENTS,
  type PayConfig,
} from "../src/payments/pay.js";
import { buildV1Requirements } from "../src/payments/facilitator.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
const WALLET = "0x0629a6851234567890123456789012345678488e" as Address;
const cfg: PayConfig = {
  payTo: PAY_TO,
  network: "base",
  chainId: 8453,
  usdcAddress: USDC,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100, 500, 1000, 2500],
};

/** A settler that never gets its turn: the 402 answer is built before any settlement. */
class Recorder implements Settler {
  readonly kind = "recorder";
  readonly resources: string[] = [];
  async settle(_a: Authorization, _s: Hex, resource?: string): Promise<SettleResult> {
    this.resources.push(resource ?? "");
    return { ok: false, error: "not reached in the test" };
  }
}

describe("declaration for the facilitator directory", () => {
  it("makes the resource absolute as soon as the base URL is known", () => {
    const withOrigin = buildPaymentRequired({ ...cfg, publicOrigin: "https://cp.hippe.eu" }, 5, WALLET);
    expect(withOrigin.accepts[0].resource).toBe(`https://cp.hippe.eu/pay/5/${WALLET}`);
    expect(withOrigin.accepts[0].resource.startsWith("https://")).toBe(true);
  });

  it("keeps the relative path without a base URL instead of inventing a host", () => {
    expect(buildPaymentRequired(cfg, 5, WALLET).accepts[0].resource).toBe(`/pay/5/${WALLET}`);
  });

  it("declares the bazaar block in the offer, otherwise no facilitator catalogues it", () => {
    const offer = buildPaymentRequired(cfg, 5, WALLET);
    const info = offer.accepts[0].extensions?.bazaar?.info;
    expect(info, "accepts[0].extensions.bazaar.info is missing").toBeTruthy();
    expect(info?.input.method).toBe("GET");
    expect(info?.output.type).toBe("json");
  });

  it("sends declaration and description to the facilitator, not only to the client", () => {
    const auth: Authorization = {
      from: WALLET,
      to: PAY_TO,
      value: 5_000_000n,
      validAfter: 0n,
      validBefore: 9_999_999_999n,
      nonce: ("0x" + "11".repeat(32)) as Hex,
    };
    const req = buildV1Requirements(
      { url: "x", network: "base", payTo: PAY_TO, usdcAddress: USDC, maxTimeoutSeconds: 300 },
      auth,
      `https://cp.hippe.eu/pay/5/${WALLET}`,
    ) as Record<string, unknown>;
    expect(req.extensions, "paymentRequirements.extensions is missing").toBeTruthy();
    // The description is the text a stranger's automaton reads in the directory.
    expect(String(req.description)).toMatch(/Conway/);
    expect(String(req.description).length).toBeGreaterThan(30);
  });

  it("builds the same absolute identifier that also goes to the settler", () => {
    // The settler is only called after a valid signature; the identifier itself is checked here.
    expect(payResource({ ...cfg, publicOrigin: "https://cp.hippe.eu" }, 25, WALLET)).toBe(
      `https://cp.hippe.eu/pay/25/${WALLET}`,
    );
  });

  it("derives the base URL from the request when the operator sets none", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: new Recorder() });
    const res = await app.request(`/pay/5/${WALLET}`, {
      headers: { host: "cp.hippe.eu", "x-forwarded-proto": "https" },
    });
    expect(res.status).toBe(402);
    const body = (await res.json()) as { accepts: Array<{ resource: string; extensions?: unknown }> };
    expect(body.accepts[0].resource).toBe(`https://cp.hippe.eu/pay/5/${WALLET}`);
    expect(body.accepts[0].extensions).toBeTruthy();
  });

  it("does not take a host that looks like a URL with a path", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: new Recorder() });
    const res = await app.request(`/pay/5/${WALLET}`, {
      headers: { host: "evil.example/path", "x-forwarded-proto": "https" },
    });
    const body = (await res.json()) as { accepts: Array<{ resource: string }> };
    expect(body.accepts[0].resource).toBe(`/pay/5/${WALLET}`);
  });

  it("lets CP_PUBLIC_URL beat the Host header", () => {
    const out = payConfigFromEnv({ CP_PAY_TO: PAY_TO, CP_PUBLIC_URL: "https://example.test/" } as NodeJS.ProcessEnv);
    expect(out?.publicOrigin).toBe("https://example.test");
  });
});

/**
 * The threshold bonus. The runtime grades by balance, and the threshold for the best tier is
 * `> 500` cents. Its bootstrap topup takes the smallest tier. Without the bonus every new customer
 * systematically starts one tier below what they paid for.
 */
describe("threshold bonus", () => {
  it("lifts a 5 USD topup above the runtime threshold, not exactly onto it", () => {
    const UPSTREAM_THRESHOLD_HIGH = 500; // getSurvivalTier: cents > 500
    const credited = 5 * 100 + SCHWELLEN_BONUS_CENTS;
    expect(credited).toBeGreaterThan(UPSTREAM_THRESHOLD_HIGH);
    expect(credited - 5 * 100, "more than one cent would be a gift without a purpose").toBe(1);
  });

  /**
   * On `/terms` since 2026-09-21, with the rest of the money detail. The landing page was cut to
   * 300 words and a diagram, and an explanation of one cent is exactly the kind of thing that
   * belongs where somebody checks rather than where somebody decides. It is served, not read off
   * disk, so the test fails if the page stops rendering it as well as if the sentence goes.
   */
  it("is stated openly on the page, because it benefits us too", async () => {
    const { createApp } = await import("../src/app.js");
    const { openDb } = await import("../src/db.js");
    const html = await (await createApp({ db: openDb(":memory:") }).request("/terms")).text();
    expect(html).toMatch(/501 cents/);
    expect(html, "the reason has to stand next to it, otherwise it is a sales trick").toMatch(/above<\/em> 500 cents/);
  });
});
