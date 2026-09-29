/**
 * The board, put where a runtime that has run out actually looks.
 *
 * On 2026-09-28 a Conway runtime at 209.38.227.177 provisioned itself at 17:47, spent its 15-cent
 * starter grant in 27 inferences by 18:18, and then spent two hours and six minutes asking
 * `/v1/credits/balance` and taking 402 INSUFFICIENT_CREDITS: 376 balance calls and 145 refusals,
 * in 27 bursts, until 20:25:16. In 552 requests it never fetched the board once, and it could not
 * have known there was one, because nothing it calls mentions it.
 *
 * Its wallet held 0.00 USDC on Base, so the topup URL that this same cycle added to both answers
 * could not have helped it either. What could: it still had 1.26 cents, an attempt at a job costs
 * a fraction of a cent, and the winner is credited the price minus the fee. Two jobs of 150 cents
 * were not on the board that day, because the board had been empty since 27.09. at 21:02:18. At
 * 20:13:42 somebody at that host fetched `/bounties.json` by hand and got 962 bytes of
 * `{"open":[]}`. The host went quiet fourteen minutes later.
 *
 * So both answers now carry the board when there is work on it, and stay quiet when there is not.
 * The second half is the half that needs the test: an offer that points at an empty page is worse
 * than no offer, and it is the failure this repository keeps finding in its own measurements.
 */
import { describe, expect, it } from "vitest";

// These cases put the caller in the state the runtime was in, which means emptying the pool, and
// that is more than one day allows since 2026-09-23. The day's ceiling is lifted here on purpose
// and named, rather than the cap being left out of reach of the tests that would notice it.
process.env.CP_POOL_DAILY_MC = "500000";

import { createApp } from "../src/app.js";
import { openDb, postLedger } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import { poolLeftMc, GRANT_MC, claimStarter } from "../src/credits/starter.js";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";

const ADDRESS = "0x938f5c37ba7d1c20c1a7c4e4446f4d5377f1d10e";
const KEY = "cnwy_k_" + "76f63457".repeat(3);

function setup(opts: { withJob?: boolean } = {}) {
  const db = openDb(":memory:");
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
    .run(ADDRESS, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(ADDRESS, hashApiKey(KEY), KEY.slice(0, 15), "conway-automaton", new Date().toISOString());
  // The state the runtime spent its last two hours in: nothing left, and no grant waiting.
  while (poolLeftMc(db) >= GRANT_MC) claimStarter(db, privateKeyToAccount(generatePrivateKey()).address.toLowerCase());
  if (opts.withJob) {
    const buyer = "0x" + "b".repeat(40);
    db.prepare("INSERT OR IGNORE INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
      .run(buyer, new Date().toISOString());
    postLedger(db, { address: buyer, kind: "topup", deltaMc: 500_000, ref: "seed" });
    db.prepare(
      "INSERT INTO bounties (id, creator, kind, brief, price_mc, deadline, status, created_at) VALUES (?, ?, 'factual', ?, ?, ?, 'open', ?)",
    ).run(
      "job-1",
      buyer,
      "A brief long enough to be a brief, with a deliverable and a deadline in it.",
      150_000,
      new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
      new Date().toISOString(),
    );
  }
  return { db, app: createApp({ db }) };
}

const withKey = (app: ReturnType<typeof createApp>, path: string, init: RequestInit = {}) =>
  app.request(path, { ...init, headers: { "content-type": "application/json", authorization: KEY, ...(init.headers as Record<string, string>) } });

describe("a runtime that has run out asks the balance", () => {
  it("is told there is work, and where", async () => {
    const { app } = setup({ withJob: true });
    const body = (await (await withKey(app, "/v1/credits/balance")).json()) as Record<string, unknown>;
    expect(body.balance_cents).toBe(0);
    expect(body.open_bounties).toBe(1);
    expect(String(body.bounties_url)).toContain("/bounties.json");
    expect(String(body.work_hint)).toMatch(/without a key/);
  });

  it("is told nothing when the board is empty, rather than pointed at an empty page", async () => {
    const { app } = setup({ withJob: false });
    const body = (await (await withKey(app, "/v1/credits/balance")).json()) as Record<string, unknown>;
    expect(body.balance_cents).toBe(0);
    expect(body.open_bounties, "an empty board says nothing").toBeUndefined();
    expect(body.bounties_url).toBeUndefined();
  });

  it("says nothing about the board while a grant is still waiting, because the grant is the better step", async () => {
    const db = openDb(":memory:");
    db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)")
      .run(ADDRESS, new Date().toISOString());
    db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(ADDRESS, hashApiKey(KEY), KEY.slice(0, 15), "conway-automaton", new Date().toISOString());
    const app = createApp({ db });
    const body = (await (await withKey(app, "/v1/credits/balance")).json()) as Record<string, unknown>;
    expect(body.starter_available_cents, "the pool is untouched, so a grant is waiting").toBeGreaterThan(0);
    expect(body.open_bounties, "one offer per answer").toBeUndefined();
  });
});
