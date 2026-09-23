import { describe, expect, it } from "vitest";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp } from "../src/app.js";
import { openDb, MC_PER_CENT } from "../src/db.js";
import { hashApiKey } from "../src/auth/siwe.js";
import {
  grantToWaitingRuntime,
  GRANT_MC,
  POOL_MC,
  WAITING_MS,
  WAITING_POLLS,
} from "../src/credits/starter.js";

// This file spends the whole pool to test what the pages say when it is empty, which is more
// than one day allows since 2026-09-23. The day's ceiling is lifted here on purpose and named,
// rather than the cap being left out of reach of the tests that would notice it.
process.env.CP_POOL_DAILY_MC = "500000";

function fresh(db: ReturnType<typeof openDb>, n: number) {
  const address = privateKeyToAccount(generatePrivateKey()).address.toLowerCase();
  const key = `cnwy_k_${n.toString(16).padStart(4, "0")}` + "cd".repeat(14);
  db.prepare("INSERT INTO wallets (address, balance_mc, created_at) VALUES (?, 0, ?)").run(address, new Date().toISOString());
  db.prepare("INSERT INTO api_keys (address, key_hash, key_prefix, name, created_at) VALUES (?, ?, ?, ?, ?)").run(
    address, hashApiKey(key), key.slice(0, 15), "conway-automaton", new Date().toISOString(),
  );
  return { address, key };
}

const balanceOf = (db: ReturnType<typeof openDb>, address: string) =>
  (db.prepare("SELECT balance_mc FROM wallets WHERE address = ?").get(address) as { balance_mc: number }).balance_mc;

/** The Korean operator's shape: poll, wait, poll, wait, poll, all with an empty balance. */
function pollFor(db: ReturnType<typeof openDb>, address: string, times: number, spanMs: number) {
  const t0 = Date.UTC(2026, 8, 22, 4, 1, 23);
  let granted = false;
  for (let i = 0; i < times; i++) {
    const at = t0 + Math.round((spanMs * i) / Math.max(1, times - 1));
    if (grantToWaitingRuntime(db, address, balanceOf(db, address), at)) granted = true;
  }
  return granted;
}

describe("The grant a waiting runtime cannot ask for", () => {
  it("starts a runtime that has read an empty balance three times over more than a minute", () => {
    const db = openDb(":memory:");
    const { address } = fresh(db, 1);
    expect(pollFor(db, address, WAITING_POLLS, WAITING_MS + 1_000)).toBe(true);
    expect(balanceOf(db, address)).toBe(GRANT_MC);
  });

  it("does not fire on two polls, however far apart", () => {
    const db = openDb(":memory:");
    const { address } = fresh(db, 2);
    expect(pollFor(db, address, WAITING_POLLS - 1, 6 * 60 * 60 * 1000)).toBe(false);
    expect(balanceOf(db, address)).toBe(0);
  });

  it("does not fire on three polls inside a minute, which is what our own end-to-end runs do", () => {
    const db = openDb(":memory:");
    const { address } = fresh(db, 3);
    expect(pollFor(db, address, 4, WAITING_MS - 1_000)).toBe(false);
    expect(balanceOf(db, address)).toBe(0);
  });

  it("does not fire for an address that already has credit", () => {
    const db = openDb(":memory:");
    const { address } = fresh(db, 4);
    db.prepare("UPDATE wallets SET balance_mc = ? WHERE address = ?").run(50 * MC_PER_CENT, address);
    expect(pollFor(db, address, 10, 10 * 60_000)).toBe(false);
    expect(balanceOf(db, address)).toBe(50 * MC_PER_CENT);
  });

  it("gives an address its one grant and never a second", () => {
    const db = openDb(":memory:");
    const { address } = fresh(db, 5);
    expect(pollFor(db, address, WAITING_POLLS, WAITING_MS + 1_000)).toBe(true);
    db.prepare("UPDATE wallets SET balance_mc = 0 WHERE address = ?").run(address);
    expect(pollFor(db, address, 20, 60 * 60 * 1000)).toBe(false);
    expect(balanceOf(db, address)).toBe(0);
  });

  it("stops at the pool, so a crowd of waiting runtimes cannot empty it past its limit", () => {
    const db = openDb(":memory:");
    const fits = Math.floor(POOL_MC / GRANT_MC);
    let given = 0;
    for (let i = 0; i < fits + 3; i++) {
      const { address } = fresh(db, 100 + i);
      if (pollFor(db, address, WAITING_POLLS, WAITING_MS + 1_000)) given++;
    }
    expect(given).toBe(fits);
    const total = (db.prepare("SELECT coalesce(sum(delta_mc),0) AS s FROM ledger WHERE kind = 'grant'").get() as { s: number }).s;
    expect(total).toBeLessThanOrEqual(POOL_MC);
  });

  it("tells the caller what happened, in the same answer that carries the balance", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const { address, key } = fresh(db, 6);
    // Two polls dated a minute ago, so the third is the live request under test.
    const long = new Date(Date.now() - WAITING_MS - 5_000).toISOString();
    db.prepare("INSERT INTO balance_polls (address, n, first_at, last_at) VALUES (?, ?, ?, ?)").run(
      address, WAITING_POLLS - 1, long, long,
    );
    const res = await app.request("/v1/credits/balance", { headers: { authorization: key } });
    const body = (await res.json()) as { balance_cents: number; granted_cents?: number; hint?: string };
    expect(res.status).toBe(200);
    expect(body.granted_cents).toBe(GRANT_MC / MC_PER_CENT);
    expect(body.hint).toMatch(/kept asking/);
    expect(balanceOf(db, address)).toBe(GRANT_MC);
  });

  it("does not offer the grant twice in one answer, once as waiting and once as given", async () => {
    const db = openDb(":memory:");
    const app = createApp({ db });
    const { address, key } = fresh(db, 7);
    const long = new Date(Date.now() - WAITING_MS - 5_000).toISOString();
    db.prepare("INSERT INTO balance_polls (address, n, first_at, last_at) VALUES (?, ?, ?, ?)").run(
      address, WAITING_POLLS - 1, long, long,
    );
    const body = (await (await app.request("/v1/credits/balance", { headers: { authorization: key } })).json()) as Record<string, unknown>;
    expect(body.granted_cents).toBeDefined();
    expect(body.starter_available_cents).toBeUndefined();
  });
});
