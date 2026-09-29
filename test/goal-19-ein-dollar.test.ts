/**
 * The tier the official SDK will actually look at.
 *
 * Between the catalogue entry on 2026-09-27 and 29.09., 220 foreign addresses asked the payment
 * route 465 times and not one of them ever signed. The whole access log holds three
 * `X-PAYMENT-RESPONSE` answers, two from the same Conway runtime whose tiers are hard-wired. The
 * standing explanation was "those are crawlers", and it was wrong.
 *
 * `@x402/core` 2.27.0, read from the npm tarball on 29.09.:
 *
 *     // package/dist/esm/client/index.mjs:22
 *     var DEFAULT_MAX_AMOUNT_PER_PAYMENT = "$1";
 *     // :524, inside selectPaymentRequirements, before any signature exists
 *     filtered = filtered.filter((requirement) => … BigInt(rawAmount) <= BigInt(cap))
 *
 * `resolveAtomicSpendCap()` returns that dollar unless the caller passes `spendControls: false`
 * or their own ceiling. So a 5 USD offer is dropped by every client on the SDK running defaults,
 * silently, without anybody deciding anything.
 *
 * The comparison is `<=`, which is the whole reason 1 and not 2 is the number: 1,000,000 atomic
 * units against a ceiling of 1,000,000 passes, one unit more does not. That boundary is what the
 * cases below hold, because the tier list is the kind of thing somebody tidies up later.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { TOPUP_TIERS_USD, type PayConfig } from "../src/payments/pay.js";
import type { Address } from "viem";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

/** What the SDK allows through by default, in atomic USDC units (6 decimals). */
const SDK_DEFAULT_CAP_ATOMIC = 1_000_000n;

const PAY: PayConfig = {
  payTo: "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address,
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  maxTimeoutSeconds: 300,
  tiers: [...TOPUP_TIERS_USD],
  publicOrigin: "https://postyourprice.com",
};
const SETTLER: Settler = { kind: "stub", async settle(_a: Authorization): Promise<SettleResult> { return { ok: false, error: "unused" }; } };
const app = () => createApp({ db: openDb(":memory:"), pay: PAY, settler: SETTLER });

describe("the smallest tier", () => {
  it("exists, and is the smallest", () => {
    expect(Math.min(...TOPUP_TIERS_USD)).toBe(1);
  });

  it("is quoted at exactly what the SDK still admits", async () => {
    const body = (await (await app().request("/pay/1")).json()) as { accepts: { maxAmountRequired: string }[] };
    const quoted = BigInt(body.accepts[0].maxAmountRequired);
    expect(quoted).toBe(SDK_DEFAULT_CAP_ATOMIC);
    // The comparison in the client is `<=`, so equal passes. This is the whole margin.
    expect(quoted <= SDK_DEFAULT_CAP_ATOMIC).toBe(true);
  });

  /**
   * The case that earns its keep. If somebody raises the floor to 2 USD to tidy the list, every
   * default client goes back to dropping us before it signs, and nothing else in this suite
   * notices, because a 2 USD offer is perfectly well formed.
   */
  it("would fail here the day somebody raises the floor", async () => {
    const zuHoch = TOPUP_TIERS_USD.filter((t) => BigInt(t) * 1_000_000n <= SDK_DEFAULT_CAP_ATOMIC);
    expect(zuHoch.length, "at least one tier has to sit at or under the SDK's default ceiling").toBeGreaterThan(0);
  });

  it("did not disturb the tiers the runtime client asks for by name", () => {
    for (const t of [5, 25, 100, 500, 1000, 2500]) expect(TOPUP_TIERS_USD).toContain(t);
  });

  it("is offered everywhere the tiers are published", async () => {
    const a = app();
    const wk = (await (await a.request("/.well-known/x402")).json()) as { accepts: { amounts_usd: number[] }[] };
    expect(wk.accepts[0].amounts_usd).toContain(1);
    const oa = (await (await a.request("/openapi.json")).json()) as { paths: Record<string, any> };
    expect(oa.paths["/pay/{usd}"].get.parameters[0].schema.enum).toContain(1);
  });

  it("still refuses a tier that is not sold", async () => {
    const res = await app().request("/pay/2");
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_tier");
  });
});

/**
 * The description has to describe the instance, not the source.
 *
 * `payConfigFromEnv()` lets `CP_TOPUP_TIERS_USD` override `TOPUP_TIERS_USD`, and on 2026-09-29 the
 * production environment pinned the old list at the moment the constant gained a 1. `/openapi.json`
 * read the constant, so it documented `/pay/1` on an instance that answers 400 to it. A documented
 * path that does not work is the exact defect this cycle spent the day closing, and it was
 * reintroduced within the hour by the change that closed it.
 *
 * These hold the document against the config the app was actually built with, so the two cannot
 * drift again whatever the environment says.
 */
describe("what the instance publishes about its tiers", () => {
  const PINNED: PayConfig = { ...PAY, tiers: [5, 25] };
  const pinnedApp = () => createApp({ db: openDb(":memory:"), pay: PINNED, settler: SETTLER });

  it("openapi names the running tiers, not the ones in the source", async () => {
    const doc = (await (await pinnedApp().request("/openapi.json")).json()) as { paths: Record<string, any> };
    expect(doc.paths["/pay/{usd}"].get.parameters[0].schema.enum).toEqual([5, 25]);
    expect(doc.paths["/pay/{usd}/{address}"].get.parameters[0].schema.enum).toEqual([5, 25]);
  });

  it("every tier it names is one the instance answers", async () => {
    const a = pinnedApp();
    const doc = (await (await a.request("/openapi.json")).json()) as { paths: Record<string, any> };
    for (const tier of doc.paths["/pay/{usd}"].get.parameters[0].schema.enum as number[]) {
      expect((await a.request(`/pay/${tier}`)).status, `/pay/${tier} is documented`).toBe(402);
    }
  });

  it("the template answer names the running tiers too", async () => {
    const body = (await (await pinnedApp().request("/pay/%7Busd%7D")).json()) as { topup_tiers_usd: number[] };
    expect(body.topup_tiers_usd).toEqual([5, 25]);
  });

  it("and the well-known file already did", async () => {
    const wk = (await (await pinnedApp().request("/.well-known/x402")).json()) as { accepts: { amounts_usd: number[] }[] };
    expect(wk.accepts[0].amounts_usd).toEqual([5, 25]);
  });
});
