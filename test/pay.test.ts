import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import type { Address, Hex } from "viem";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import type { PayConfig } from "../src/payments/pay.js";
import type { Authorization, Settler, SettleResult } from "../src/payments/settler.js";

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as Address;
const PAY_TO = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;

const cfg: PayConfig = { payTo: PAY_TO, network: "base", chainId: 8453, usdcAddress: USDC, maxTimeoutSeconds: 300, tiers: [5, 25, 100, 500, 1000, 2500] };

/** A settler that counts and fails on request. */
class FakeSettler implements Settler {
  readonly kind = "fake";
  calls: Authorization[] = [];
  failNext = false;
  async settle(auth: Authorization): Promise<SettleResult> {
    this.calls.push(auth);
    if (this.failNext) {
      this.failNext = false;
      return { ok: false, error: "boom" };
    }
    return { ok: true, txHash: `0x${"ab".repeat(32)}` as Hex };
  }
}

/** Builds the X-Payment header the way signPayment() does in the runtime client (src/conway/x402.ts). */
async function signPayment(params: {
  account: ReturnType<typeof privateKeyToAccount>;
  to: Address;
  value: bigint;
  nonce?: Hex;
  validBefore?: bigint;
  chainId?: number;
  network?: string;
}): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const validAfter = BigInt(now - 60);
  const validBefore = params.validBefore ?? BigInt(now + 300);
  const nonce = params.nonce ?? (`0x${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("hex")}` as Hex);
  const signature = await params.account.signTypedData({
    domain: { name: "USD Coin", version: "2", chainId: params.chainId ?? 8453, verifyingContract: USDC },
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
    message: { from: params.account.address, to: params.to, value: params.value, validAfter, validBefore, nonce },
  });
  const payment = {
    x402Version: 1,
    scheme: "exact",
    network: params.network ?? "eip155:8453",
    payload: {
      signature,
      authorization: {
        from: params.account.address,
        to: params.to,
        value: params.value.toString(),
        validAfter: validAfter.toString(),
        validBefore: validBefore.toString(),
        nonce,
      },
    },
  };
  return Buffer.from(JSON.stringify(payment)).toString("base64");
}

function setup() {
  const db = openDb(":memory:");
  const settler = new FakeSettler();
  const app = createApp({ db, pay: cfg, settler });
  const account = privateKeyToAccount(generatePrivateKey());
  const pay = (usd: number | string, header?: string) =>
    app.request(`/pay/${usd}/${account.address}`, { headers: header ? { "x-payment": header } : {} });
  const ledgerRows = () =>
    db.prepare("SELECT kind, delta_mc, ref FROM ledger WHERE address = ?").all(account.address.toLowerCase()) as {
      kind: string;
      delta_mc: number;
      ref: string;
    }[];
  const balance = () =>
    (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(account.address.toLowerCase()) as
      | { balance_mc: number }
      | undefined)?.balance_mc ?? 0;
  return { db, settler, app, account, pay, ledgerRows, balance };
}

describe("/pay as an x402 seller", () => {
  it("answers 402 without X-Payment and puts the offer in the body and the header", async () => {
    const { pay, account } = setup();
    const res = await pay(5);
    expect(res.status).toBe(402);
    const body = (await res.json()) as { x402Version: number; accepts: Record<string, unknown>[] };
    expect(body.x402Version).toBe(1);
    expect(body.accepts[0]).toMatchObject({
      scheme: "exact",
      network: "base",
      maxAmountRequired: "5000000",
      payTo: PAY_TO,
      asset: USDC,
      maxTimeoutSeconds: 300,
      resource: `/pay/5/${account.address.toLowerCase()}`,
    });
    const header = res.headers.get("x-payment-required");
    expect(header).toBeTruthy();
    const decoded = JSON.parse(Buffer.from(header!, "base64").toString("utf-8"));
    expect(decoded.accepts[0].maxAmountRequired).toBe("5000000");
  });

  it("rejects an invalid tier with 400", async () => {
    const { pay } = setup();
    const res = await pay(7);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_tier");
  });

  it("answers 409 for a nonce that is being settled and says that nothing is booked twice", async () => {
    const { pay, account, db, balance, settler } = setup();
    const nonce = `0x${"7c".repeat(32)}` as Hex;
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n, nonce });
    // The state a second request sees while the first one is still settling.
    db.prepare(
      "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
    ).run(nonce, account.address.toLowerCase(), account.address.toLowerCase(), "5000000", 500_000, new Date().toISOString());

    const res = await pay(5, header);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { error: string; message: string; docs: string };
    expect(body.error).toBe("settlement_in_progress");
    expect(body.message).toMatch(/idempotency key/);
    expect(body.message).toMatch(/nothing is charged twice/i);
    expect(body.docs).toContain("#payments");
    expect(settler.calls, "the second attempt does not settle again").toHaveLength(0);
    expect(balance()).toBe(0);
  });

  it("books a valid payment: 200, credits_cents 501 with the threshold bonus, one ledger row", async () => {
    const { pay, account, settler, ledgerRows, balance } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { credits_cents: number; balance_cents: number; tx_hash: string };
    // 500 cents bought plus one cent that lifts it above the runtime tier threshold (> 500).
    expect(body.credits_cents).toBe(501);
    expect(body.balance_cents).toBe(501);
    expect(body.tx_hash).toMatch(/^0x/);
    expect(settler.calls).toHaveLength(1);
    expect(settler.calls[0].value).toBe(5_000_000n);
    expect(balance()).toBe(501_000);
    expect(ledgerRows()).toEqual([{ kind: "topup", delta_mc: 501_000, ref: expect.stringMatching(/^0x[0-9a-f]{64}$/) }]);
  });

  it("is idempotent: the same signature twice gives the same answer and one credit", async () => {
    const { pay, account, settler, ledgerRows, balance } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const first = await (await pay(5, header)).json();
    const secondRes = await pay(5, header);
    expect(secondRes.status).toBe(200);
    expect(await secondRes.json()).toEqual(first);
    expect(settler.calls).toHaveLength(1);
    expect(balance(), "the threshold bonus must not apply a second time on a retry").toBe(501_000);
    expect(ledgerRows()).toHaveLength(1);
  });

  it("rejects a signature from a different signer with 402, without settling", async () => {
    const { pay, account, settler, balance } = setup();
    const other = privateKeyToAccount(generatePrivateKey());
    // The header claims from = account, but other signed it.
    const forged = await signPayment({ account: other, to: PAY_TO, value: 5_000_000n });
    const tampered = JSON.parse(Buffer.from(forged, "base64").toString("utf-8"));
    tampered.payload.authorization.from = account.address;
    const res = await pay(5, Buffer.from(JSON.stringify(tampered)).toString("base64"));
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("invalid_signature");
    expect(settler.calls).toHaveLength(0);
    expect(balance()).toBe(0);
  });

  it("rejects a wrong amount with 402", async () => {
    const { pay, account, settler } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 1_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toMatch(/^wrong_amount/);
    expect(settler.calls).toHaveLength(0);
  });

  it("rejects a wrong recipient (payTo) with 402", async () => {
    const { pay, account, settler } = setup();
    const header = await signPayment({ account, to: account.address, value: 5_000_000n });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("wrong_recipient");
    expect(settler.calls).toHaveLength(0);
  });

  it("rejects an expired authorization", async () => {
    const { pay, account } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n, validBefore: BigInt(Math.floor(Date.now() / 1000) - 10) });
    const res = await pay(5, header);
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toBe("authorization_expired");
  });

  it("books nothing when the settlement fails and allows a second attempt afterwards", async () => {
    const { pay, account, settler, balance, ledgerRows, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    settler.failNext = true;
    const failed = await pay(5, header);
    expect(failed.status).toBe(402);
    const error = (await failed.json()) as { error: string; message: string; docs: string };
    expect(error.error).toMatch(/^settlement_failed/);
    expect(error.message, "says that nothing was credited and what to check").toMatch(
      /no credits\s+were added/,
    );
    expect(error.message).toContain("Basescan");
    expect(error.docs).toContain("docs/errors.md#payments");
    expect(balance()).toBe(0);
    expect(ledgerRows()).toHaveLength(0);
    expect((db.prepare("SELECT status FROM payments").get() as { status: string }).status).toBe("failed");

    const retry = await pay(5, header);
    expect(retry.status).toBe(200);
    expect(balance()).toBe(501_000);
    expect(settler.calls).toHaveLength(2);
  });

  it("writes only one credit for two parallel retries of a failed payment", async () => {
    // Security finding 19.09.2026: the failed-retry path did not check `changes` of the UPDATE, so
    // two concurrent retries both won the claim, both called the settler and both credited.
    // Reproduced with 1 USD and a doubled balance. The settler reports success twice here, because
    // that is exactly the case we have to be safe against: we must not rely on a third party
    // rejecting the second call.
    const { pay, account, settler, balance, ledgerRows, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });

    settler.failNext = true;
    expect((await pay(5, header)).status).toBe(402);
    expect((db.prepare("SELECT status FROM payments").get() as { status: string }).status).toBe("failed");

    const [a, b] = await Promise.all([pay(5, header), pay(5, header)]);
    const codes = [a.status, b.status].sort();

    expect(balance(), "a payment of 5 USD may credit 501,000 mc at most once").toBe(501_000);
    expect(ledgerRows().filter((r) => r.kind === "topup")).toHaveLength(1);
    expect(codes[0]).toBe(200);
    expect(settler.calls.length, "the settler must not be called three times for one nonce").toBeLessThanOrEqual(2);
  });

  it("credits only the address that actually paid", async () => {
    // Security finding 19.09.2026: the EIP-3009 signature covers the amount, the recipient of the
    // USDC and the nonce, but not the path that decides who gets the credits. Without that binding
    // an intercepted header redirects the credit to somebody else's address while the money still
    // leaves the signer.
    const { app, account, settler, db } = setup();
    const stranger = privateKeyToAccount(generatePrivateKey()).address;
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });

    const res = await app.request(`/pay/5/${stranger}`, { headers: { "X-Payment": header } });
    expect(res.status).toBe(402);
    expect(((await res.json()) as { error: string }).error).toContain("recipient_must_match_payer");
    expect(settler.calls, "it must not even settle").toHaveLength(0);
    const strangerBalance = db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(stranger.toLowerCase()) as
      | { balance_mc: number }
      | undefined;
    expect(strangerBalance?.balance_mc ?? 0).toBe(0);

    const own = await app.request(`/pay/5/${account.address}`, { headers: { "X-Payment": header } });
    expect(own.status, "onto the own address it has to work").toBe(200);
  });

  it("does not leak the current balance on a repeated payment header", async () => {
    // This answer is served without an API key. If it read the balance fresh, an old header would
    // be a balance reporter for somebody else's tenant.
    const { app, account, pay, db } = setup();
    const header = await signPayment({ account, to: PAY_TO, value: 5_000_000n });
    const first = (await (await pay(5, header)).json()) as { balance_cents: number };
    expect(first.balance_cents).toBe(501);

    postLedger(db, { address: account.address.toLowerCase(), kind: "topup", deltaMc: 7_000_000, ref: "later" });

    const again = (await (await pay(5, header)).json()) as { balance_cents: number };
    expect(again.balance_cents, "it has to be the balance from back then, not today's").toBe(501);
    void app;
  });

  it("answers 503 without a settler", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db, pay: cfg, settler: null });
    const res = await app.request(`/pay/5/${PAY_TO}`);
    expect(res.status).toBe(503);
  });
});

describe("cleanup on start", () => {
  it("resolves stuck pending payments so the nonce is not blocked forever", async () => {
    // Counter-check 19.09.2026: if the process dies between the claim and the settlement, the
    // payment stays `pending`. The nonce then answers 409 forever and a retry is impossible,
    // although the USDC may already have moved. After the restart the route has to be open again.
    const file = `/tmp/cp-pending-${Date.now()}.db`;
    try {
      const db1 = openDb(file);
      db1.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run("0xa", new Date().toISOString());
      db1
        .prepare(
          "INSERT INTO payments (nonce, from_address, to_address, value_atomic, credits_mc, status, created_at) VALUES (?, ?, ?, ?, ?, 'pending', ?)",
        )
        .run("stuck", "0xa", "0xa", "5000000", 500_000, new Date().toISOString());
      db1.close();

      // Restart of the process
      const db2 = openDb(file);
      const row = db2.prepare("SELECT status, error FROM payments WHERE nonce = ?").get("stuck") as { status: string; error: string };
      expect(row.status, "pending blocks the nonce forever and has to be resolved").toBe("failed");
      expect(row.error).toBe("interrupted_by_restart");
      db2.close();
    } finally {
      const fs = await import("node:fs");
      for (const suffix of ["", "-wal", "-shm"]) {
        try {
          fs.unlinkSync(file + suffix);
        } catch {
          /* does not matter */
        }
      }
    }
  });
});
