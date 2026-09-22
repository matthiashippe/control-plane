/**
 * No page promises a free first job once the pool cannot pay for one.
 *
 * Three human-readable surfaces carry that promise: the landing page in its price strip, `/post`
 * in step 2 and again under step 3, and `/jobs` in its opening paragraph. Each was phrased
 * unconditionally. The pool is 500,000 millicents, thirty-three grants, and it does not refill;
 * `llms.txt` has always said so and the pages a person reads never did. An article that brings a
 * hundred readers empties it inside an hour, and from that hour on three pages promise something
 * the server refuses in the same second.
 *
 * The test drains the pool the way the service does, through `claimStarter`, and then asks every
 * page. It is deliberately one test over all of them rather than one assertion per page: the next
 * page that makes this promise will not know about `starterOffer`, and this is where it gets
 * caught.
 */
import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { claimStarter, poolLeftMc, starterOffer, GRANT_MC, POOL_MC } from "../src/credits/starter.js";

// /check joined on 2026-09-22 and is the fourth surface to carry the promise, which is exactly the
// case the comment above predicts: a new page that does not know about starterOffer. It is listed
// twice because its intro and its result page are rendered separately and either could drift.
const PAGES = ["/", "/post", "/jobs", "/check", "/check?brief=FACT%20SHEET%20on%20a%20roof"];

/**
 * A database with one open job, because `/jobs` has two halves.
 *
 * With nothing open it returns early with its own short section, and the paragraph that carries
 * the promise is never rendered. A first version of this test ran against an empty database, and
 * the counter-proof showed what that is worth: the unconditional sentence was put back by hand and
 * all four assertions stayed green. A test that cannot see the code it is about is not a test.
 */
async function withAnOpenJob() {
  const db = openDb(":memory:");
  const app = createApp({ db });
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = "cnwy_k_" + "7a".repeat(16);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "test", new Date().toISOString(),
  );
  // Paid balance, not a grant: the pool has to be untouched, since the pool is what is under test.
  postLedger(db, { address, kind: "topup", deltaMc: 500_000, ref: "seed" });
  const res = await app.request("/v1/bounties", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: key },
    body: JSON.stringify({
      brief: "FACT SHEET on one page. 90 words maximum. Hand in the sheet and nothing else.",
      kind: "factual",
      price_cents: 150,
      deadline: new Date(Date.now() + 3600e3).toISOString(),
    }),
  });
  expect(res.status, "the fixture needs a job on the board").toBe(201);
  expect(poolLeftMc(db), "the fixture must not spend a grant").toBe(POOL_MC);
  return { db, app };
}

/** What a reader would take as "you get a first job for free". */
const PROMISES = [
  /first job of up to/i,
  /of thinking is on us/i,
  /is exactly what the free credit covers/i,
  /\bfree\b[\s\S]{0,40}up to \d+ ¢/i,
];

function drainPool(db: ReturnType<typeof openDb>): void {
  const grants = Math.floor(POOL_MC / GRANT_MC);
  for (let i = 0; i < grants; i++) claimStarter(db, `0x${String(i).padStart(40, "0")}`);
  expect(poolLeftMc(db), "the pool has to be too small for one more grant").toBeLessThan(GRANT_MC);
  expect(starterOffer(db)).toBeNull();
}

describe("the promise of a free first job", () => {
  it("is on every page that asks a buyer to start, while the pool can keep it", async () => {
    const { app } = await withAnOpenJob();
    for (const path of PAGES) {
      const html = await (await app.request(path)).text();
      expect(
        PROMISES.some((r) => r.test(html)),
        `${path} does not offer the starter credit at all, so a newcomer has no reason to start`,
      ).toBe(true);
    }
  });

  it("is gone from every one of them once the pool is empty", async () => {
    const { db, app } = await withAnOpenJob();
    drainPool(db);
    for (const path of PAGES) {
      const html = await (await app.request(path)).text();
      for (const r of PROMISES) {
        expect(html, `${path} still promises a free first job, and ${r} is the sentence`).not.toMatch(r);
      }
    }
  });

  it("says what is true instead, rather than falling silent about the money", async () => {
    const { db, app } = await withAnOpenJob();
    drainPool(db);
    // A page that simply drops the sentence leaves a buyer with no idea what a job costs them.
    for (const path of ["/post", "/jobs"]) {
      const html = await (await app.request(path)).text();
      expect(html, `${path} says nothing about paying for it either`).toMatch(/credit of your own|USDC on Base/i);
    }
  });

  it("holds for the empty board as well, which is the other half of /jobs", async () => {
    // Nothing open is exactly the moment an agent needs a reason to come back, so the short
    // version of the page carries the offer too, and has to drop it for the same reason.
    const withPool = await (await createApp({ db: openDb(":memory:") }).request("/jobs")).text();
    expect(withPool).toMatch(/of thinking is on us/i);

    const db = openDb(":memory:");
    const drainedApp = createApp({ db });
    drainPool(db);
    const html = await (await drainedApp.request("/jobs")).text();
    for (const r of PROMISES) expect(html).not.toMatch(r);
    expect(html).toMatch(/credit of your own/i);
  });

  it("refuses the grant at exactly the point the pages stop offering it", () => {
    const db = openDb(":memory:");
    // The page and the server have to change their mind in the same instant, or the gap between
    // them is a promise the next caller gets refused on.
    for (let i = 0; ; i++) {
      const offer = starterOffer(db);
      if (!offer) {
        expect(() => claimStarter(db, "0x" + "f".repeat(40))).toThrow();
        expect(i, "the pool has to hand out every grant it holds before it says no").toBe(
          Math.floor(POOL_MC / GRANT_MC),
        );
        break;
      }
      claimStarter(db, `0x${String(i).padStart(40, "0")}`);
    }
  });
});
