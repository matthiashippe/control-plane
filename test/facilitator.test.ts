import { describe, expect, it } from "vitest";
import type { Address, Hex } from "viem";
import { FacilitatorSettler } from "../src/payments/facilitator.js";
import { payConfigFromEnv } from "../src/payments/pay.js";
import type { Authorization } from "../src/payments/settler.js";

const PAY_TO = "0x914102284463F4F58B1D2f6DB9aC80BFcaA7d614" as Address;
const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const SIG = ("0x" + "ab".repeat(65)) as Hex;
const AUTH: Authorization = {
  from: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  to: PAY_TO,
  value: 1_000_000n,
  validAfter: 1_700_000_000n,
  validBefore: 1_700_000_300n,
  nonce: ("0x" + "11".repeat(32)) as Hex,
};

interface Call {
  path: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function stub(responses: Record<string, () => Response>) {
  const calls: Call[] = [];
  const impl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url).pathname;
    calls.push({ path, headers: (init?.headers as Record<string, string>) ?? {}, body: JSON.parse(String(init?.body)) });
    return responses[path]?.() ?? new Response("no stub", { status: 500 });
  }) as typeof fetch;
  return { impl, calls };
}

const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });

function settler(impl: typeof fetch, authHeader?: string) {
  return new FacilitatorSettler({
    url: "https://facilitator.payai.network/",
    authHeader,
    network: "base",
    payTo: PAY_TO,
    usdcAddress: USDC,
    maxTimeoutSeconds: 300,
    fetch: impl,
    timeoutMs: 500,
  });
}

describe("FacilitatorSettler", () => {
  it("sends verify and settle with the v1 payload (identical to the runtime) and v1 requirements with extra USD Coin/2", async () => {
    const { impl, calls } = stub({
      "/verify": () => json({ isValid: true, payer: AUTH.from }),
      "/settle": () => json({ success: true, transaction: "0x" + "cd".repeat(32), network: "base", payer: AUTH.from }),
    });
    const res = await settler(impl).settle(AUTH, SIG, "/pay/1/0xabc");
    expect(res).toEqual({ ok: true, txHash: "0x" + "cd".repeat(32) });
    expect(calls.map((c) => c.path)).toEqual(["/verify", "/settle"]);
    for (const call of calls) {
      expect(call.body.x402Version).toBe(1);
      const payload = call.body.paymentPayload as { x402Version: number; scheme: string; network: string; payload: { signature: string; authorization: Record<string, string> } };
      expect(payload).toMatchObject({ x402Version: 1, scheme: "exact", network: "base" });
      expect(payload.payload.signature).toBe(SIG);
      expect(payload.payload.authorization).toEqual({
        from: AUTH.from,
        to: PAY_TO,
        value: "1000000",
        validAfter: "1700000000",
        validBefore: "1700000300",
        nonce: AUTH.nonce,
      });
      const req = call.body.paymentRequirements as Record<string, unknown>;
      expect(req).toMatchObject({
        scheme: "exact",
        network: "base",
        maxAmountRequired: "1000000",
        payTo: PAY_TO,
        asset: USDC,
        maxTimeoutSeconds: 300,
        resource: "/pay/1/0xabc",
        extra: { name: "USD Coin", version: "2" },
      });
      expect(call.headers.Authorization).toBeUndefined();
    }
  });

  it("does not settle when verify reports isValid false", async () => {
    const { impl, calls } = stub({
      "/verify": () => json({ isValid: false, invalidReason: "insufficient_funds" }),
      "/settle": () => json({ success: true }),
    });
    const res = await settler(impl).settle(AUTH, SIG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/verify rejected: insufficient_funds/);
    expect(calls.map((c) => c.path)).toEqual(["/verify"]);
  });

  it("reports settle success false together with errorReason", async () => {
    const { impl } = stub({
      "/verify": () => json({ isValid: true }),
      "/settle": () => json({ success: false, errorReason: "invalid_nonce", transaction: "" }),
    });
    const res = await settler(impl).settle(AUTH, SIG);
    expect(res).toEqual({ ok: false, error: "settle failed: invalid_nonce" });
  });

  it("reports an HTTP error from the facilitator as an error without throwing", async () => {
    const { impl } = stub({ "/verify": () => new Response("upstream down", { status: 503 }) });
    const res = await settler(impl).settle(AUTH, SIG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/^verify: 503/);
  });

  it("sets the Authorization header when it is configured (CDP)", async () => {
    const { impl, calls } = stub({
      "/verify": () => json({ isValid: true }),
      "/settle": () => json({ success: true, transaction: "0x" + "ef".repeat(32) }),
    });
    await settler(impl, "Bearer cdp-jwt").settle(AUTH, SIG);
    expect(calls.every((c) => c.headers.Authorization === "Bearer cdp-jwt")).toBe(true);
  });

  it("aborts on a timeout", async () => {
    const impl = (async (_input: unknown, init?: RequestInit) =>
      new Promise<Response>((_, reject) => (init?.signal as AbortSignal).addEventListener("abort", () => reject(new Error("aborted"))))) as typeof fetch;
    const res = await settler(impl).settle(AUTH, SIG);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/timeout after 500 ms/);
  });
});

describe("tiers from the environment", () => {
  it("takes the runtime tiers as the default and allows operator tiers", () => {
    const base = payConfigFromEnv({ CP_PAY_TO: PAY_TO });
    expect(base?.tiers).toEqual([5, 25, 100, 500, 1000, 2500]);
    const withOne = payConfigFromEnv({ CP_PAY_TO: PAY_TO, CP_TOPUP_TIERS_USD: "1,5,25" });
    expect(withOne?.tiers).toEqual([1, 5, 25]);
    // The wording comes from src/payments/pay.ts, which this language pass does not touch.
    expect(() => payConfigFromEnv({ CP_PAY_TO: PAY_TO, CP_TOPUP_TIERS_USD: "abc" })).toThrow(/leer/);
  });
});

describe("the facilitator answer can be read up afterwards", () => {
  it("logs it without giving away the signature", async () => {
    const lines: string[] = [];
    const realLog = console.log;
    console.log = (...a: unknown[]) => void lines.push(a.join(" "));
    try {
      const { impl } = stub({
        "/verify": () => new Response(JSON.stringify({ isValid: true }), { status: 200 }),
        "/settle": () =>
          new Response(JSON.stringify({ success: true, transaction: "0xabc", bazaar: { catalogued: true } }), { status: 200 }),
      });
      const settler = new FacilitatorSettler({
        url: "https://facilitator.example",
        network: "base",
        payTo: PAY_TO,
        usdcAddress: USDC,
        maxTimeoutSeconds: 300,
        fetch: impl,
      });
      const res = await settler.settle(AUTH, SIG, "https://cp.hippe.eu/pay/5/0xabc");
      expect(res.ok).toBe(true);
    } finally {
      console.log = realLog;
    }
    const line = lines.find((l) => l.includes("[facilitator] settle"));
    expect(line, "without this line we are in the dark about the cataloguing").toBeTruthy();
    expect(line).toMatch(/catalogued/);
    expect(line, "the signature does not belong in the log").not.toMatch(new RegExp(SIG.slice(0, 20)));
  });
});
