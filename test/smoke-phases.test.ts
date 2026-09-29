/**
 * ops/smoke.sh knows every phase of the sale, and fails when a route contradicts it (HAN-62).
 *
 * The smoke test demanded models and `endpoints.inference` unconditionally, so the first deploy
 * without a sale reported two FAILs against a service that did what it should (HAN-61). It now
 * reads the phase from /v1/status and holds it against /v1/models, /.well-known/x402 and /pay. That
 * is only a binding and not a loosening if both directions are shown: each phase passes against a
 * real app in that phase, and a route that says otherwise than /v1/status fails the run.
 */
import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { OpenRouterProvider } from "../src/inference/openrouter.js";
import { MockProvider } from "../src/inference/mock.js";
import { Catalog } from "../src/inference/proxy.js";
import type { PayConfig } from "../src/payments/pay.js";

const run = promisify(execFile);

const SUNSET = new Date("2026-10-17T00:00:00Z");
const BEFORE = () => new Date("2026-10-01T12:00:00Z");
const AFTER = () => new Date(SUNSET.getTime() + 1000);
const PAY: PayConfig = {
  payTo: "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614",
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100],
};

async function openRouterCatalog() {
  const impl = (async () =>
    new Response(
      JSON.stringify({
        data: [{ id: "openai/gpt-5-mini", context_length: 400000, pricing: { prompt: "0.00000025", completion: "0.000002" } }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    )) as unknown as typeof fetch;
  const provider = new OpenRouterProvider({
    apiKey: "sk-or-v1-test",
    models: ["openai/gpt-5-mini"],
    fetch: impl,
    priceRefreshMs: 0,
    baseUrl: "https://openrouter.ai/api/v1",
  });
  await provider.init();
  return new Catalog([provider], provider.defaultAliases());
}

/** Serves `app` on a free port, runs the smoke test against it, closes the port. */
async function smoke(app: { fetch: (req: Request) => Response | Promise<Response> }) {
  const server = serve({ fetch: app.fetch, port: 0, hostname: "127.0.0.1" });
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address() as AddressInfo;
  try {
    const out = await run("bash", ["ops/smoke.sh", `http://127.0.0.1:${port}`, "--no-proxy"], { timeout: 60_000 })
      .then((r) => ({ code: 0, text: r.stdout }))
      .catch((e: { code: number; stdout: string }) => ({ code: e.code, text: e.stdout }));
    return out;
  } finally {
    await new Promise((r) => server.close(r));
  }
}

const appIn = (catalog: Catalog, now: () => Date) =>
  createApp({ db: openDb(":memory:"), catalog, pay: PAY, inferenceSunsetAt: SUNSET, now, rateLimit: null });

const failures = (text: string) => text.split("\n").filter((l) => l.includes("FAIL"));

describe("ops/smoke.sh in every phase of the sale", () => {
  it("passes while selling as before, topups open", async () => {
    const out = await smoke(appIn(new Catalog([new MockProvider()]), BEFORE));
    expect(failures(out.text)).toEqual([]);
    expect(out.text).toContain("phase selling");
    expect(out.text).toContain("topups open");
    expect(out.code).toBe(0);
  }, 90_000);

  it("passes before the sunset, topups closed", async () => {
    const out = await smoke(appIn(await openRouterCatalog(), BEFORE));
    expect(failures(out.text)).toEqual([]);
    expect(out.text).toContain(`phase sunset until ${SUNSET.toISOString()}`);
    expect(out.text).toContain("Sunset: Sat, 17 Oct 2026 00:00:00 GMT");
    expect(out.text).toContain("/pay/5: 410 topups_closed");
    expect(out.code).toBe(0);
  }, 90_000);

  it("passes after the sunset, nothing sold", async () => {
    const out = await smoke(appIn(await openRouterCatalog(), AFTER));
    expect(failures(out.text)).toEqual([]);
    expect(out.text).toContain("phase ended");
    expect(out.text).toContain("/v1/models: 503 inference_not_for_sale");
    expect(out.code).toBe(0);
  }, 90_000);
});

describe("ops/smoke.sh fails when a route contradicts /v1/status", () => {
  it("fails when /v1/models still sells after the sunset", async () => {
    const real = appIn(await openRouterCatalog(), AFTER);
    const lying = new Hono();
    lying.get("/v1/models", (c) => c.json({ object: "list", data: [{ id: "x" }] }));
    lying.all("*", (c) => real.fetch(c.req.raw));
    const out = await smoke(lying);
    expect(failures(out.text).join("\n")).toMatch(/\/v1\/models: 200 instead of 503/);
    expect(out.code).toBe(1);
  }, 90_000);

  it("fails when /pay still offers a payment while the tier list is empty", async () => {
    const real = appIn(await openRouterCatalog(), BEFORE);
    const lying = new Hono();
    lying.get("/pay/:usd", (c) => c.json({ x402Version: 1, accepts: [] }, 402));
    lying.all("*", (c) => real.fetch(c.req.raw));
    const out = await smoke(lying);
    expect(failures(out.text).join("\n")).toMatch(/\/pay\/5: 402 instead of 410/);
    expect(out.code).toBe(1);
  }, 90_000);
});
