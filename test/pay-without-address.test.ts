/**
 * The seller with no address in the path, and the safety rule it leaves out.
 *
 * This service entered the PayAI x402 directory on 2026-09-27 at 22:21:02, as a side effect of the
 * first foreign settlement. The row it kept is the payer's concrete URL,
 * `payai,https://postyourprice.com/pay/5/0x3749efe7…,postyourprice.com,1,base,5000000`, although
 * `routeTemplate: "/pay/:usd/:address"` was declared for exactly the purpose of preventing that.
 * The consequence is not academic: the one public, machine-readable entry this project has points
 * at one stranger's wallet, and any automaton that follows it signs with its own and is refused.
 *
 * `/pay/{usd}` is the same sale with the differing parameter taken out. It is also the route that
 * gives up `recipient_must_match_payer`, so the cases below are mostly about that: the check
 * exists because a signed x402 header is worth money and the signature does not cover the path,
 * and the argument for leaving it out is that with no path parameter there is nothing to redirect
 * to. That argument is only worth as much as the tests under "a captured header" below.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address;
const cfg: PayConfig = {
  payTo: PAY_TO,
  network: "base",
  chainId: 8453,
  usdcAddress: USDC,
  maxTimeoutSeconds: 300,
  tiers: [5, 25, 100, 500, 1000, 2500],
  publicOrigin: "https://postyourprice.com",
};

class FakeSettler implements Settler {
  readonly kind = "fake";
  resources: string[] = [];
  async settle(_a: Authorization, _s: Hex, resource?: string): Promise<SettleResult> {
    this.resources.push(resource ?? "");
    return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex };
  }
}

async function sign(account: ReturnType<typeof privateKeyToAccount>, value = 5_000_000n) {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = BigInt(now + 300);
  const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
  const signature = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC },
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
    message: { from: account.address, to: PAY_TO, value, validAfter, validBefore, nonce },
  });
  return Buffer.from(
    JSON.stringify({
      x402Version: 1,
      scheme: "exact",
      network: "eip155:8453",
      payload: {
        signature,
        authorization: {
          from: account.address,
          to: PAY_TO,
          value: value.toString(),
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
      },
    }),
  ).toString("base64");
}

function setup() {
  const db = openDb(":memory:");
  const settler = new FakeSettler();
  return { db, settler, app: createApp({ db, pay: cfg, settler }) };
}

const balance = (db: ReturnType<typeof openDb>, a: string) =>
  (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(a.toLowerCase()) as { balance_mc: number } | undefined)
    ?.balance_mc ?? 0;

describe("the seller without an address in the path", () => {
  it("offers the tier, and the resource it names is the URL that was called", async () => {
    const { app } = setup();
    const res = await app.request("/pay/5");
    expect(res.status).toBe(402);
    const body = (await res.json()) as { x402Version: number; accepts: { resource: string; payTo: string; maxAmountRequired: string }[] };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0].resource).toBe("https://postyourprice.com/pay/5");
    expect(body.accepts[0].payTo).toBe(PAY_TO);
    expect(body.accepts[0].maxAmountRequired).toBe("5000000");
  });

  it("credits the wallet that signed, without being told which one that is", async () => {
    const { db, app } = setup();
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await app.request("/pay/5", { headers: { "X-Payment": await sign(payer) } });
    expect(res.status).toBe(200);
    expect(balance(db, payer.address)).toBe(501_000);
  });

  it("hands the facilitator the address-free resource, which is what the catalogue keys on", async () => {
    const { app, settler } = setup();
    await app.request("/pay/5", { headers: { "X-Payment": await sign(privateKeyToAccount(generatePrivateKey())) } });
    expect(settler.resources).toEqual(["https://postyourprice.com/pay/5"]);
  });

  it("refuses a tier it does not sell, the same as the addressed route", async () => {
    const { app } = setup();
    const res = await app.request("/pay/7");
    expect(res.status).toBe(400);
    expect((await res.json() as { error: string }).error).toBe("invalid_tier");
  });

  /**
   * The rule this route leaves out, put to the case it was written for.
   *
   * `recipient_must_match_payer` exists because on `/pay/{usd}/{address}` the signature covers the
   * amount and the USDC recipient but not the path, so whoever captured a signed header could book
   * the credits to an address of their own while the USDC kept leaving the signer. Here the
   * attacker can choose nothing: replaying a captured header books to `authorization.from`, which
   * is the wallet the signature verifies against and the wallet the money leaves.
   */
  describe("a captured header", () => {
    it("credits the wallet it was stolen from, not the one replaying it", async () => {
      const { db, app } = setup();
      const victim = privateKeyToAccount(generatePrivateKey());
      const thief = privateKeyToAccount(generatePrivateKey());
      const header = await sign(victim);
      const res = await app.request("/pay/5", { headers: { "X-Payment": header } });
      expect(res.status).toBe(200);
      expect(balance(db, victim.address), "the signer is credited").toBe(501_000);
      expect(balance(db, thief.address), "the replayer gets nothing").toBe(0);
    });

    it("credits once however often it is replayed, because the nonce is spent", async () => {
      const { db, app, settler } = setup();
      const victim = privateKeyToAccount(generatePrivateKey());
      const header = await sign(victim);
      // Idempotent by design and not refused: a repeat answers 200 with the first result, the way
      // the addressed route does (test/pay.test.ts). What must not happen is a second credit.
      for (let i = 0; i < 3; i++) {
        expect((await app.request("/pay/5", { headers: { "X-Payment": header } })).status).toBe(200);
      }
      expect(balance(db, victim.address), "credited once, not three times").toBe(501_000);
      expect(settler.resources.length, "settled once, not three times").toBe(1);
    });

    it("cannot be pointed at a third wallet, because there is no parameter to point it with", async () => {
      const { db, app } = setup();
      const victim = privateKeyToAccount(generatePrivateKey());
      const target = privateKeyToAccount(generatePrivateKey());
      // The attack the addressed route defends against: same header, chosen recipient. On the
      // addressed route this is `recipient_must_match_payer`; here the URL has nowhere to put it.
      const res = await app.request(`/pay/5/${target.address}`, { headers: { "X-Payment": await sign(victim) } });
      expect(res.status).toBe(402);
      expect((await res.json() as { error: string }).error).toBe("recipient_must_match_payer");
      expect(balance(db, target.address)).toBe(0);
    });
  });

  it("leaves the addressed route working, which is the one the runtime builds", async () => {
    const { db, app } = setup();
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await app.request(`/pay/5/${payer.address}`, { headers: { "X-Payment": await sign(payer) } });
    expect(res.status).toBe(200);
    expect(balance(db, payer.address)).toBe(501_000);
  });
});
