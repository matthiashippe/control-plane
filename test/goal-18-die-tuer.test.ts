/**
 * The door, measured against the day it turned people away.
 *
 * `/openapi.json` went live on 2026-09-29 at 10:03 UTC. At 11:10 a crawler walked it: seven Azure
 * addresses inside four minutes, user agent `node`, each exactly 21 requests in a four-second
 * burst, the same sequence every time (`/.well-known/x402`, `/robots.txt`, `/openapi.json`, then
 * every path in the document), no reverse DNS, none seen before or since. One actor with a
 * rotating egress pool, and the document created it: nothing had walked that way before 10:03.
 *
 * Two of the seven got a key and five got 429 on `POST /v1/auth/keyless`, the day's ceiling being
 * five and three of those places having gone to the loop's own probes. No lost customer is proven
 * there and none is claimed. What is proven is that one actor emptied the door for the whole
 * instance in four minutes, on a day our own testing had already spent most of it.
 *
 * The ceiling was protecting the right thing in the wrong place: src/auth/keyless.ts names the
 * exposure as "one actor can add up to five submissions to one job per day", and that damage
 * lands on a bounty, not on the door.
 *
 * And 28 of their requests called `/pay/{usd}/{address}` and `/pay/{usd}` with the braces as
 * text, every one a 400 or a 404.
 *
 * Goal 18. Both halves below, each with the counter-proof that the limit still limits.
 */
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { mintAgentIdentity, AGENT_MINTS_PER_DAY_DEFAULT } from "../src/auth/keyless.js";
import { submitWork, KEYLESS_SUBS_PER_BOUNTY_DAY_DEFAULT, BountyError } from "../src/bounties/store.js";
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
  publicOrigin: "https://postyourprice.com",
};
const SETTLER: Settler = { kind: "stub", async settle(_a: Authorization): Promise<SettleResult> { return { ok: false, error: "unused" }; } };

function bounty(db: ReturnType<typeof openDb>, id: string) {
  const buyer = "0x" + "b".repeat(40);
  db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(buyer, new Date().toISOString());
  postLedger(db, { address: buyer, kind: "topup", deltaMc: 1_000_000, ref: `seed-${id}` });
  db.prepare(
    "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at) VALUES (?, ?, 'factual', ?, ?, ?, 'open', ?)",
  ).run(id, buyer, "A brief long enough to read like one, with a deliverable in it.", 150_000,
        new Date(Date.now() + 86_400_000).toISOString(), new Date().toISOString());
  return id;
}

describe("the keyless door lets an arrival in", () => {
  it("hands out far more keys a day than the seven who arrived at once", () => {
    const db = openDb(":memory:");
    // The crawler's seven of 2026-09-29, and then some. Before this goal the sixth was refused.
    for (let i = 0; i < 20; i++) expect(mintAgentIdentity(db).key).toBeTruthy();
    expect(AGENT_MINTS_PER_DAY_DEFAULT).toBeGreaterThanOrEqual(100);
  });

  /** And the brake is still a brake: it has to be reachable, or it is decoration. */
  it("still stops a loop minting in a tight circle", () => {
    const db = openDb(":memory:");
    for (let i = 0; i < AGENT_MINTS_PER_DAY_DEFAULT; i++) mintAgentIdentity(db);
    expect(() => mintAgentIdentity(db)).toThrow();
  });
});

describe("the crowd limit moved to the bounty", () => {
  it("takes exactly the promised number of keyless submissions on one job", () => {
    const db = openDb(":memory:");
    const id = bounty(db, "job-1");
    for (let i = 0; i < KEYLESS_SUBS_PER_BOUNTY_DAY_DEFAULT; i++) {
      const { address } = mintAgentIdentity(db);
      expect(submitWork(db, { bountyId: id, agent: address, body: `work ${i}` }).id).toBeTruthy();
    }
    const { address } = mintAgentIdentity(db);
    try {
      submitWork(db, { bountyId: id, agent: address, body: "one too many" });
      throw new Error("the limit did not hold");
    } catch (e) {
      expect((e as BountyError).code).toBe("keyless_crowd_limit");
      expect((e as BountyError).status).toBe(429);
    }
  });

  /**
   * The direction that makes it a limit on a crowd and not on the market: a full job must not
   * close the next one. Before this goal five keys were five keys everywhere at once.
   */
  it("leaves every other job open when one is full", () => {
    const db = openDb(":memory:");
    const full = bounty(db, "job-full");
    const other = bounty(db, "job-other");
    for (let i = 0; i < KEYLESS_SUBS_PER_BOUNTY_DAY_DEFAULT; i++) {
      submitWork(db, { bountyId: full, agent: mintAgentIdentity(db).address, body: `w${i}` });
    }
    expect(() => submitWork(db, { bountyId: full, agent: mintAgentIdentity(db).address, body: "x" })).toThrow();
    expect(submitWork(db, { bountyId: other, agent: mintAgentIdentity(db).address, body: "fresh" }).id).toBeTruthy();
  });

  it("does not count an agent that brought a wallet", () => {
    const db = openDb(":memory:");
    const id = bounty(db, "job-2");
    for (let i = 0; i < KEYLESS_SUBS_PER_BOUNTY_DAY_DEFAULT; i++) {
      submitWork(db, { bountyId: id, agent: mintAgentIdentity(db).address, body: `w${i}` });
    }
    const walletAgent = "0x" + "c".repeat(40);
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(walletAgent, new Date().toISOString());
    expect(submitWork(db, { bountyId: id, agent: walletAgent, body: "paid for its own key" }).id).toBeTruthy();
  });
});

describe("a path template called with its braces still in it", () => {
  const setup = () => createApp({ db: openDb(":memory:"), pay: PAY, settler: SETTLER });

  it.each(["/pay/%7Busd%7D", "/pay/%7Busd%7D/%7Baddress%7D"])("%s is answered, not refused blankly", async (path) => {
    const res = await setup().request(path);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; topup_url: string; message: string };
    expect(body.error).toBe("path_template_not_substituted");
    expect(body.topup_url).not.toMatch(/[{}]/);
  });

  it("the URL it offers instead is one this service answers", async () => {
    const app = setup();
    const { topup_url } = (await (await app.request("/pay/%7Busd%7D")).json()) as { topup_url: string };
    expect((await app.request(new URL(topup_url).pathname)).status).toBe(402);
  });

  it("leaves a real tier alone", async () => {
    expect((await setup().request("/pay/5")).status).toBe(402);
  });
});

/**
 * A route that exists says so, even when its path carries parameters.
 *
 * The crawler of 2026-09-29 tries every path from /openapi.json with GET and then with POST. On a
 * literal path that produced the right answer, a 405 naming the methods. On `/pay/5` it produced
 * "No such endpoint here", because the registered path is `/pay/:usd` and the strings differ. An
 * indexer writes that down, and what it writes down is that the endpoint does not exist.
 *
 * The 404 for a path that truly does not exist has to survive this, or the fix is a worse lie
 * than the bug, so both directions are here.
 */
describe("the wrong method on a route that takes parameters", () => {
  const app = () => createApp({ db: openDb(":memory:"), pay: PAY, settler: SETTLER });

  it.each([
    ["/pay/5", "GET"],
    ["/pay/5/0x1111111111111111111111111111111111111111", "GET"],
  ])("%s answers 405 and names %s", async (path, method) => {
    const res = await app().request(path, { method: "POST" });
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toContain(method);
    expect(((await res.json()) as { error: string }).error).toBe("method_not_allowed");
  });

  it("still answers 404 for a path that does not exist at all", async () => {
    for (const path of ["/pay", "/pay/5/0xabc/extra", "/nothing/here"]) {
      const res = await app().request(path, { method: "POST" });
      expect(res.status, path).toBe(404);
    }
  });

  it("leaves the method that does exist working", async () => {
    expect((await app().request("/pay/5")).status).toBe(402);
  });
});
