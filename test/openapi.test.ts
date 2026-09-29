/**
 * The API description, held against the service it describes.
 *
 * Four named indexers asked for `/openapi.json` and were turned away 217 times, measured over the
 * whole access log on 2026-09-29: `Agent402/1.0` 201 times, `agentmap-openapi-discovery/0.1`
 * eight, `402explorer/0.1` four, `x402lens-indexer/1.0` three, plus seven for `/swagger.json`. The
 * first is at 27.09. 23:36, an hour after this service entered the PayAI catalogue.
 *
 * The risk a description carries is drift: a path that is documented and does not exist sends an
 * agent to a 404, which is the failure this whole cycle has been about. So the test that matters
 * is not that the document is well formed. It is that every path in it is a path this service
 * answers, and that is checked by calling each one.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Address } from "viem";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const PAY: PayConfig = {
  payTo: "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address,
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100, 500, 1000, 2500],
};
const SETTLER: Settler = { kind: "stub", async settle(_a: Authorization): Promise<SettleResult> { return { ok: false, error: "unused" }; } };

const setup = () => {
  const db = openDb(":memory:");
  return { db, app: createApp({ db, pay: PAY, settler: SETTLER }) };
};

describe("/openapi.json", () => {
  it("is served, at both paths the log shows being asked for", async () => {
    const { app } = setup();
    for (const path of ["/openapi.json", "/.well-known/openapi.json"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      expect(res.headers.get("content-type")).toContain("application/json");
    }
  });

  it("says which version of the spec it is, and who serves it", async () => {
    const { app } = setup();
    const doc = (await (await app.request("/openapi.json")).json()) as Record<string, any>;
    expect(doc.openapi).toMatch(/^3\./);
    expect(doc.info.title).toBe("Handsel");
    expect(doc.servers[0].url).toBeTruthy();
  });

  /**
   * The one that earns its keep. A documented path that 404s is worse than no document.
   *
   * It belongs here and not in a production probe. Walking this same list against the live
   * service on 2026-09-29 at 10:03 proved the document honest and minted a keyless handle doing
   * it, because `POST /v1/auth/keyless` answers 201 by creating one, and that handle then counted
   * as a foreign wallet until somebody claimed it. Here the database is in memory and the walk
   * costs nothing.
   */
  it("documents only paths this service actually answers", async () => {
    const { app } = setup();
    const doc = (await (await app.request("/openapi.json")).json()) as { paths: Record<string, Record<string, unknown>> };
    const checked: string[] = [];
    for (const [template, methods] of Object.entries(doc.paths)) {
      // Path templates carry their parameters in braces; fill them with something the route
      // accepts, so the call reaches the handler rather than a validation branch.
      const path = template
        .replace("{usd}", "5")
        .replace("{address}", "0x" + "1".repeat(40));
      for (const method of Object.keys(methods)) {
        const res = await app.request(path, { method: method.toUpperCase() });
        expect(res.status, `${method.toUpperCase()} ${path} is documented`).not.toBe(404);
        // 405 would mean the path exists under a different verb, which is the same kind of lie.
        expect(res.status, `${method.toUpperCase()} ${path} is documented under the wrong method`).not.toBe(405);
        checked.push(`${method} ${path}`);
      }
    }
    expect(checked.length, "the document is not empty").toBeGreaterThan(8);
  });

  it("leaves out what this instance does not sell", async () => {
    const db = openDb(":memory:");
    // No pay config and no model catalogue: an instance that sells neither.
    const doc = (await (await createApp({ db }).request("/openapi.json")).json()) as { paths: Record<string, unknown> };
    expect(Object.keys(doc.paths)).not.toContain("/pay/{usd}");
    expect(Object.keys(doc.paths)).not.toContain("/v1/chat/completions");
    // And the half that has nothing to do with money is still there.
    expect(Object.keys(doc.paths)).toContain("/bounties.json");
  });
});
