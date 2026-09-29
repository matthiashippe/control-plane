/**
 * The way to buy credits, held against the two callers who could not find it.
 *
 * Two foreign automatons reached this service between 2026-09-27 and 2026-09-28, the first ones
 * that were nobody's probe, and both ran out of free credit. What happened next is in the access
 * log and is the reason this file exists.
 *
 * The one that got through, 2026-09-27, wallet 0x3749efe7: at 21:44:29 it guessed
 * /v1/credits/topup, /v1/credits/buy and /v1/x402/credits, three 404s inside one second, and gave
 * up. At 22:20:45 it came back and guessed /v1/credits, /v1/account, /v1/me and /v1/credits/me,
 * four more. At 22:21:00 it finally called /pay/5/<its address>, took the 402, signed it and paid
 * 10 USDC in two transactions. Thirty-six minutes and seven wrong URLs for the one request that
 * moves money.
 *
 * The one that did not, 2026-09-28, wallet 0x938f5c37, key named `conway-automaton`: 27 billed
 * calls in 23 minutes, then 402 INSUFFICIENT_CREDITS 145 times in 27 bursts, from 18:19:19 to
 * 20:25:16, then nothing. It never called the pay route once, in 552 requests.
 *
 * Both answers they got were correct and neither was any use. The 404 said this service implements
 * "credits, topup" and sent the reader one hop further for the list; the 402 named the route as
 * `/pay/{usd}/{this wallet}`, a template with two holes to fill. The seven paths below are the
 * seven that were actually typed, and the test is that each one now answers with a URL that can be
 * called as it stands.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { TOPUP_TIERS_USD, type PayConfig } from "../src/payments/pay.js";
import type { Address, Hex } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

/** Enough of a seller for the pay route to answer; no settlement happens in this file. */
const PAY: PayConfig = {
  payTo: "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address,
  network: "base",
  chainId: 8453,
  usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address,
  maxTimeoutSeconds: 300,
  tiers: [...TOPUP_TIERS_USD],
};

/** Never reached: the 402 is built before anything is settled. */
const SETTLER: Settler = {
  kind: "stub",
  async settle(_a: Authorization): Promise<SettleResult> {
    return { ok: false, error: "not reached in this file" };
  },
};

/** The seven, in the order the log has them. */
const GUESSED = [
  "/v1/credits/topup",
  "/v1/credits/buy",
  "/v1/x402/credits",
  "/v1/credits",
  "/v1/account",
  "/v1/me",
  "/v1/credits/me",
];

const ADDRESS = "0x3749efe74ae81d3c02e196113277c9cf04bc56a9";
const KEY = "cnwy_k_" + "fc219fae".repeat(3);

function setup() {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
    .run(ADDRESS, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(ADDRESS, hashApiKey(KEY), KEY.slice(0, 15), "conway-automaton", new Date().toISOString());
  return { db, app: createApp({ db, pay: PAY, settler: SETTLER }) };
}

describe("a guessed path that is looking for the way to pay", () => {
  it.each(GUESSED)("%s names the pay route instead of sending the caller on", async (path) => {
    const { app } = setup();
    const res = await app.request(path);
    expect(res.status).toBe(404);
    const body = (await res.json()) as Record<string, unknown>;
    expect(String(body.topup_url)).toMatch(/\/pay\/5\//);
    expect(body.topup_tiers_usd).toEqual([...TOPUP_TIERS_USD]);
  });

  it("puts the caller's own wallet in the URL when the key says who it is", async () => {
    const { app } = setup();
    const res = await app.request("/v1/credits/topup", { headers: { authorization: KEY } });
    const body = (await res.json()) as { topup_url: string };
    expect(body.topup_url).toContain(`/pay/5/${ADDRESS}`);
  });

  /**
   * The counter-proof, and the one that matters: a URL is only useful if it resolves. A template
   * passes any test that greps for "/pay/", which is exactly what the old 402 would have done.
   */
  it("the URL it prints is a route this service answers, not a template", async () => {
    const { app } = setup();
    const res = await app.request("/v1/credits/topup", { headers: { authorization: KEY } });
    const { topup_url } = (await res.json()) as { topup_url: string };
    expect(topup_url).not.toMatch(/[{}<>]/);
    const paid = await app.request(new URL(topup_url).pathname);
    expect(paid.status).toBe(402);
  });

  /**
   * And the other direction, because a rule that catches everything catches nothing: a path that
   * is not about paying still gets the plain answer, with no pay fields on it.
   */
  it("leaves a path that is not about paying alone", async () => {
    const { app } = setup();
    for (const path of ["/v1/sandboxes/abc", "/v1/messages/poll", "/v1/nothing"]) {
      const res = await app.request(path);
      const body = (await res.json()) as Record<string, unknown>;
      expect(body.topup_url, `${path} should not carry a topup URL`).toBeUndefined();
    }
  });
});

/**
 * The third template, on the path a catalogue visitor actually lands on.
 *
 * This service entered the PayAI x402 catalogue on 2026-09-27 at 22:21:02, as a side effect of the
 * first foreign payment, and the row it keeps is that payer's own topup URL rather than the route
 * pattern: `payai,https://postyourprice.com/pay/5/0x3749efe7…,postyourprice.com,1,base,5000000`.
 * `routeTemplate: "/pay/:usd/:address"` is declared in src/payments/bazaar.ts precisely so the
 * catalogue would key on the pattern, and the measurement says it did not.
 *
 * So an automaton that finds this service the way the whole plan wants it found arrives at a URL
 * with a stranger's address in it, signs with its own wallet, and is refused. That refusal is
 * correct and stays: the path decides who gets the credits and the signature does not cover it.
 * What it says is the thing under test, and it is driven through the real route with a real
 * signature, because a hint read out of the module is not the hint a caller gets.
 */
describe("the refusal a catalogue visitor gets", () => {
  /** The catalogue's row, with somebody else's address in the path. */
  const LISTED = "0x3749efe74ae81d3c02e196113277c9cf04bc56a9" as Address;

  async function refusal() {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: { ...PAY, publicOrigin: "https://postyourprice.com" }, settler: SETTLER });
    const visitor = privateKeyToAccount(generatePrivateKey());
    const now = Math.floor(Date.now() / 1000);
    const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
    const signature = await visitor.signTypedData({
      domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: PAY.usdcAddress },
      types: {
        TransferWithAuthorization: [
          { name: "from", type: "address" },
          { name: "to", type: "address" },
          { name: "value", type: "uint256" },
          { name: "validAfter", type: "uint256" },
          { name: "validBefore", type: "uint256" },
          { name: "nonce", type: "bytes32" },
        ],
      },
      primaryType: "TransferWithAuthorization",
      message: {
        from: visitor.address,
        to: PAY.payTo,
        value: 5_000_000n,
        validAfter: BigInt(now - 60),
        validBefore: BigInt(now + 300),
        nonce,
      },
    });
    const header = Buffer.from(
      JSON.stringify({
        x402Version: 1,
        scheme: "exact",
        network: "eip155:8453",
        payload: {
          signature,
          authorization: {
            from: visitor.address,
            to: PAY.payTo,
            value: "5000000",
            validAfter: String(now - 60),
            validBefore: String(now + 300),
            nonce,
          },
        },
      }),
    ).toString("base64");
    // The URL the catalogue hands out, signed by somebody who is not the address in it.
    const res = await app.request(`/pay/5/${LISTED}`, { headers: { "X-Payment": header } });
    return { res, body: (await res.json()) as { error: string; message: string }, visitor };
  }

  it("still refuses, because the path decides who gets the credits", async () => {
    const { res, body } = await refusal();
    expect(res.status).toBe(402);
    expect(body.error).toBe("recipient_must_match_payer");
  });

  it("names the URL for the wallet that signed, ready to call", async () => {
    const { body, visitor } = await refusal();
    expect(body.message).toContain(`https://postyourprice.com/pay/5/${visitor.address}`);
    expect(body.message).not.toContain("{usd}");
    expect(body.message).not.toContain("{the signing wallet}");
  });
});
