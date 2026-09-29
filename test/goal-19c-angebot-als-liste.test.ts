/**
 * The offer is a menu, because the client treats it as one.
 *
 * `accepts` is plural in the specification and the official client filters it: entries it cannot
 * pay are removed before anything is signed (`selectPaymentRequirements`, @x402/core 2.27.0,
 * where `DEFAULT_MAX_AMOUNT_PER_PAYMENT` is one dollar). Until 2026-09-29 this service returned a
 * single entry, so the menu had one dish and a capped client left hungry.
 *
 * What that cost is measurable and is the reason for this change rather than a preference. Our
 * catalogue row points at `/pay/5/0x3749efe7…`, because a catalogue entry is written from the
 * resource of a settled payment. So every client that finds this service the way the plan wants
 * it found lands on the five dollar tier. Adding a one dollar tier that afternoon did not reach
 * them: in the hours after it went live, all eight foreign requests still went to the catalogue
 * URL and not one reached `/pay/1`.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb } from "../src/db.js";
import { buildPaymentRequired, type PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x914102284463f4f58b1d2f6db9ac80bfcaa7d614" as Address;
const PAY: PayConfig = {
  payTo: PAY_TO, network: "base", chainId: 8453, usdcAddress: USDC,
  maxTimeoutSeconds: 300, tiers: [1, 5, 25, 100, 500, 1000, 2500],
  publicOrigin: "https://postyourprice.com",
};
class Fake implements Settler {
  readonly kind = "fake";
  async settle(): Promise<SettleResult> { return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex }; }
}
const setup = () => { const db = openDb(":memory:"); return { db, app: createApp({ db, pay: PAY, settler: new Fake() }) }; };

/** The cap a default client applies, in atomic USDC units. */
const CAP = 1_000_000n;

async function sign(account: ReturnType<typeof privateKeyToAccount>, value: bigint) {
  const now = Math.floor(Date.now() / 1000);
  const nonce = `0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex;
  const signature = await account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: 8453, verifyingContract: USDC },
    types: { TransferWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
    primaryType: "TransferWithAuthorization",
    message: { from: account.address, to: PAY_TO, value, validAfter: BigInt(now - 60), validBefore: BigInt(now + 300), nonce },
  });
  return Buffer.from(JSON.stringify({
    x402Version: 1, scheme: "exact", network: "eip155:8453",
    payload: { signature, authorization: { from: account.address, to: PAY_TO, value: value.toString(),
      validAfter: String(now - 60), validBefore: String(now + 300), nonce } },
  })).toString("base64");
}

describe("the offer carries something a capped client can sign", () => {
  it("the catalogue URL offers the tier it names AND the cheapest one", () => {
    const offer = buildPaymentRequired(PAY, 5, ("0x" + "1".repeat(40)) as Address);
    expect(offer.accepts.length).toBe(2);
    expect(offer.accepts[0].maxAmountRequired, "the requested tier stays first").toBe("5000000");
    expect(offer.accepts[1].maxAmountRequired).toBe("1000000");
  });

  /** The property the whole change is for, stated the way the client states it. */
  it("at least one entry survives the SDK's default spend cap", () => {
    const offer = buildPaymentRequired(PAY, 5);
    const uebrig = offer.accepts.filter((a) => BigInt(a.maxAmountRequired) <= CAP);
    expect(uebrig.length, "a default client would otherwise filter everything out").toBeGreaterThan(0);
  });

  it("does not repeat itself when the cheapest tier IS the one asked for", () => {
    expect(buildPaymentRequired(PAY, 1).accepts.length).toBe(1);
  });

  it("takes a payment for the cheap entry on the expensive URL, and credits that amount", async () => {
    const { db, app } = setup();
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await app.request(`/pay/5/${payer.address}`, { headers: { "X-Payment": await sign(payer, 1_000_000n) } });
    expect(res.status).toBe(200);
    const bal = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(payer.address.toLowerCase()) as { balance_mc: number }).balance_mc;
    expect(bal, "one dollar plus the one cent bonus, not five").toBe(101_000);
  });

  it("still takes the tier the URL names", async () => {
    const { db, app } = setup();
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await app.request(`/pay/5/${payer.address}`, { headers: { "X-Payment": await sign(payer, 5_000_000n) } });
    expect(res.status).toBe(200);
    const bal = (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(payer.address.toLowerCase()) as { balance_mc: number }).balance_mc;
    expect(bal).toBe(501_000);
  });

  /** And the direction that keeps it honest: an amount nobody offered is still refused. */
  it("refuses an amount that was never on the menu", async () => {
    const { app } = setup();
    const payer = privateKeyToAccount(generatePrivateKey());
    const res = await app.request(`/pay/5/${payer.address}`, { headers: { "X-Payment": await sign(payer, 3_000_000n) } });
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toMatch(/^wrong_amount/);
  });
});
